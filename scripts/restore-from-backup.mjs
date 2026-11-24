// Puts logs from the Drive backup (np-diary-backup.json) back into the app — for when logs went
// missing from Supabase. Dry run by default: compares the backup with the app and prints what it
// would do. Nothing is written without --apply.
//
//   node --env-file=.env.backup scripts/restore-from-backup.mjs path/to/np-diary-backup.json
//   node --env-file=.env.backup scripts/restore-from-backup.mjs path/to/np-diary-backup.json --apply
//
// Options:
//   --apply              write the missing logs (otherwise only report)
//   --limit N            restore at most N logs (oldest first) — try a few before a big run
//   --include-removed    also restore logs the backup marks `removed_from_app` (deleted in the app
//                        on purpose; skipped by default)
// Env: NP_EMAIL, NP_PASSWORD, SUPABASE_URL, SUPABASE_ANON_KEY; BACKUP_PASSPHRASE (asked if unset).
//
// What it does per missing log: save-entry (so the note is encrypted by the app's own function),
// then a direct update that sets metrics, success, sleep and the original created_at, then the
// activity / people / marker rows. Logs get NEW ids. Activities, people and markers the app no
// longer has are created hidden (unhide them in Settings). Existing logs are never changed — a log
// edited since the backup is reported and left alone. Safe to re-run: logs already restored are
// recognised by date, exact time, metrics and note. A log that fails halfway is deleted again.
// Afterwards it reloads the app's history and checks every restored log against the backup.
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { toRecord } from "../src/lib/export.ts";
import { decrypt, deriveKey, verifyKey } from "./backup-crypto.mjs";
import { connect, edgeError, loadHistory } from "./np-history.mjs";
import { activityKeyFor, content, planRestore, resolveLists, restoreRows } from "./restore-plan.mjs";

// ---------- args ----------

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const input = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--limit");
const APPLY = flag("--apply");
const INCLUDE_REMOVED = flag("--include-removed");
const LIMIT = option("--limit") === undefined ? Infinity : Number(option("--limit"));
if (!input || !(LIMIT > 0)) {
  console.error("Usage: node --env-file=.env.backup scripts/restore-from-backup.mjs <backup.json> [--apply] [--limit N] [--include-removed]");
  process.exit(1);
}

// ---------- backup ----------

const backup = JSON.parse(readFileSync(input, "utf8"));
if (backup.format !== "np-diary-backup") throw new Error(`${input} is not an np-diary-backup file`);
let passphrase = process.env.BACKUP_PASSPHRASE;
if (!passphrase) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  passphrase = await rl.question("Backup passphrase: ");
  rl.close();
}
const key = deriveKey(passphrase, backup.kdf);
if (!verifyKey(key, backup.check)) {
  console.error("Wrong passphrase.");
  process.exit(1);
}
const backupLogs = backup.logs.map(({ note_encrypted, ...r }) => ({
  ...r,
  note: note_encrypted ? decrypt(key, note_encrypted) : "",
}));

// ---------- compare ----------

const supabase = await connect();
const load = async () => {
  const { entries, names, lists } = await loadHistory(supabase, { allowEmpty: true });
  return { records: entries.map((e) => toRecord(e, names)), lists };
};
const before = await load();
const plan = planRestore(backupLogs, before.records, { includeRemoved: INCLUDE_REMOVED });
const todo = plan.missing.slice(0, LIMIT);
const maps = resolveLists(todo, before.lists);

const label = (l) => `#${l.id} ${l.date} ${l.created_at.slice(11, 16)}`;
console.log(`Backup ${input}: ${backupLogs.length} logs (updated ${backup.updated_at}). App: ${before.records.length} logs.`);
console.log(`  in the app with the same id     ${plan.present.length}${plan.differs.length ? ` (${plan.differs.length} edited since the backup — app version kept)` : ""}`);
console.log(`  already restored earlier        ${plan.alreadyRestored.length}`);
console.log(`  deleted in the app on purpose   ${plan.skippedRemoved}${plan.skippedRemoved && !INCLUDE_REMOVED ? " (skipped; --include-removed to restore)" : ""}`);
console.log(`  only in the app (newer)         ${plan.onlyInApp}`);
console.log(`  MISSING from the app            ${plan.missing.length}${todo.length < plan.missing.length ? ` (restoring the oldest ${todo.length}: --limit)` : ""}`);
for (const { backup: b } of plan.differs.slice(0, 10)) console.log(`    edited: ${label(b)}`);
for (const l of todo.slice(0, 20)) console.log(`    missing: ${label(l)}`);
if (todo.length > 20) console.log(`    … and ${todo.length - 20} more`);
const { toCreate } = maps;
for (const [kind, list] of Object.entries(toCreate)) {
  if (list.length) console.log(`  ${kind} to create (hidden): ${list.join(", ")}`);
}

if (todo.length === 0) {
  console.log("Nothing to restore.");
  process.exit(0);
}
if (!APPLY) {
  console.log(`\nDry run — nothing was written. Re-run with --apply to restore ${todo.length} logs.`);
  process.exit(0);
}

// ---------- apply ----------

async function createListItems() {
  const keys = before.lists.activities.map((a) => a.key);
  for (const label of toCreate.activities) {
    const key = activityKeyFor(label, keys);
    keys.push(key);
    const { error } = await supabase.from("np_activities").insert({ key, label, icon: "activity", hidden: true });
    if (error) throw new Error(`Create activity "${label}": ${error.message}`);
    maps.activity.set(label.toLowerCase(), key);
  }
  for (const [table, list, map] of [
    ["np_people", toCreate.people, maps.person],
    ["np_markers", toCreate.markers, maps.marker],
  ]) {
    for (const name of list) {
      const { data, error } = await supabase.from(table).insert({ name, hidden: true }).select("id").single();
      if (error) throw new Error(`Create ${table} "${name}": ${error.message}`);
      map.set(name.toLowerCase(), data.id);
    }
  }
}

async function newEntryId(res, date) {
  if (res?.id) return res.id;
  // Same fallback as the app: the newest row for that date is the one save-entry just wrote.
  const { data, error } = await supabase
    .from("np_entries")
    .select("id")
    .eq("entry_date", date)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .single();
  if (error) throw new Error(`Find the new log for ${date}: ${error.message}`);
  return data.id;
}

async function insertRows(table, rows) {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function restoreLog(log) {
  const rows = restoreRows(log, maps);
  const { data, error } = await supabase.functions.invoke("save-entry", { body: rows.save });
  if (error) throw await edgeError("save-entry", error);
  const id = await newEntryId(data, log.date);
  try {
    const { error: upErr } = await supabase.from("np_entries").update(rows.update).eq("id", id);
    if (upErr) throw new Error(`np_entries: ${upErr.message}`);
    await insertRows("np_entry_activities", rows.activities.map((a) => ({ entry_id: id, ...a })));
    await insertRows("np_entry_people", rows.people.map((p) => ({ entry_id: id, ...p })));
    await insertRows("np_entry_markers", rows.markers.map((marker_id) => ({ entry_id: id, marker_id })));
  } catch (err) {
    // A half-written log wouldn't be recognised on a re-run (wrong time/metrics), so take it out again.
    await supabase.from("np_entries").delete().eq("id", id);
    throw err;
  }
}

await createListItems();
let done = 0;
for (const log of todo) {
  try {
    await restoreLog(log);
  } catch (err) {
    console.error(`\nFailed on ${label(log)} after restoring ${done} logs: ${err.message}`);
    console.error("Re-running is safe — logs already restored are skipped.");
    process.exit(1);
  }
  done++;
  if (done % 25 === 0 || done === todo.length) process.stdout.write(`\r  restored ${done}/${todo.length}`);
}
console.log();

// ---------- verify ----------

const after = await load();
const check = planRestore(todo, after.records, { includeRemoved: true });
const wrong = check.alreadyRestored.filter(({ backup: b, live }) => content(b) !== content({ ...live, id: b.id }));
const notFound = check.missing.length;
if (notFound || wrong.length) {
  console.error(`Check FAILED: ${notFound} restored logs not found, ${wrong.length} differ from the backup.`);
  for (const { backup: b } of wrong.slice(0, 10)) console.error(`    differs: ${label(b)}`);
  process.exit(1);
}
console.log(`Restored ${done} logs; all match the backup (note, metrics, time, sleep and tags).`);
console.log("The next nightly backup will add them under their new ids; the old ids stay in the file.");
