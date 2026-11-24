// Shared by backup-to-drive.mjs and restore-from-backup.mjs: signs in as the diary user and loads
// the full decrypted history the same way as the app's useEntries (decrypt-entries + direct tables).
import { createClient } from "@supabase/supabase-js";

export const env = (name, fallback) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing env var ${name}`);
  return v;
};

const PAGE = 1000; // decrypt-entries caps `limit` at 1000
// decrypt-entries sorts by date/time only, and ~1k imported logs share both, so tied rows can swap
// across a page boundary (one returned twice, its twin never). Overlapping pages cover that.
const STRIDE = 900;

/** Signed-in client for NP_EMAIL / NP_PASSWORD against SUPABASE_URL. */
export async function connect() {
  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.auth.signInWithPassword({
    email: env("NP_EMAIL"),
    password: env("NP_PASSWORD"),
  });
  if (error) throw new Error(`Sign-in failed: ${error.message}`);
  return supabase;
}

/** Error text of a failed edge-function call (the body usually says more than the status). */
export async function edgeError(name, error) {
  const detail = await error.context?.text?.().catch(() => "");
  return new Error(`${name}: ${detail || error.message}`);
}

async function decryptPage(supabase, offset) {
  const { data, error } = await supabase.functions.invoke("decrypt-entries", {
    body: { limit: PAGE, offset },
  });
  if (error) throw await edgeError(`decrypt-entries (offset ${offset})`, error);
  return data?.entries ?? [];
}

/** Pages through a direct RLS-scoped table read. */
export async function readAll(supabase, table, columns, orderBy) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns);
    for (const col of orderBy) q = q.order(col, { nullsFirst: false });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

function groupBy(rows, key, map) {
  const out = new Map();
  for (const r of rows) {
    const list = out.get(r[key]) ?? [];
    list.push(map(r));
    out.set(r[key], list);
  }
  return out;
}

/**
 * Every log, decrypted and merged with sleep / activities / people / markers, plus the three
 * lists and `names` for toRecord. Throws unless every row in np_entries came back decrypted
 * (an empty history only passes with `allowEmpty`).
 */
export async function loadHistory(supabase, { allowEmpty = false } = {}) {
  const { count, error } = await supabase.from("np_entries").select("id", { count: "exact", head: true });
  if (error) throw new Error(`count: ${error.message}`);

  const pages = Math.max(1, Math.ceil((count ?? 0) / STRIDE));
  const [decrypted, sleepRows, actRows, peopleRows, markerRows, activities, people, markers] =
    await Promise.all([
      Promise.all(Array.from({ length: pages }, (_, i) => decryptPage(supabase, i * STRIDE))),
      readAll(supabase, "np_entries", "id, sleep_quality", ["id"]),
      readAll(supabase, "np_entry_activities", "entry_id, activity, feeling", ["id"]),
      readAll(supabase, "np_entry_people", "entry_id, person_id, np", ["entry_id", "created_at", "person_id"]),
      readAll(supabase, "np_entry_markers", "entry_id, marker_id", ["entry_id", "marker_id"]),
      readAll(supabase, "np_activities", "key, label", ["id"]),
      readAll(supabase, "np_people", "id, name", ["id"]),
      readAll(supabase, "np_markers", "id, name", ["id"]),
    ]);

  const sleep = new Map(sleepRows.map((r) => [r.id, r.sleep_quality]));
  const acts = groupBy(actRows, "entry_id", (r) => ({ activity: r.activity, feeling: r.feeling }));
  const ppl = groupBy(peopleRows, "entry_id", (r) => ({ person_id: r.person_id, np: r.np }));
  const mks = groupBy(markerRows, "entry_id", (r) => r.marker_id);

  const byId = new Map();
  for (const e of decrypted.flat()) {
    byId.set(e.id, {
      ...e,
      comment: e.comment ?? "",
      sleep_quality: sleep.get(e.id) ?? null,
      activities: acts.get(e.id) ?? [],
      people: ppl.get(e.id) ?? [],
      markers: mks.get(e.id) ?? [],
    });
  }
  const entries = [...byId.values()];

  // Never work from a partial history: every row in the table must have come back decrypted.
  const missing = sleepRows.filter((r) => !byId.has(r.id)).map((r) => r.id);
  if ((entries.length === 0 && !allowEmpty) || missing.length > 0) {
    throw new Error(`Incomplete history: ${missing.length} of ${sleepRows.length} logs not decrypted (ids ${missing.slice(0, 20).join(", ")})`);
  }

  const label = new Map(activities.map((a) => [a.key, a.label]));
  const person = new Map(people.map((p) => [p.id, p.name]));
  const marker = new Map(markers.map((m) => [m.id, m.name]));
  const names = {
    activity: (key) => label.get(key) ?? key,
    person: (id) => person.get(id) ?? `#${id}`,
    marker: (id) => marker.get(id) ?? `#${id}`,
  };
  return { entries, names, lists: { activities, people, markers } };
}
