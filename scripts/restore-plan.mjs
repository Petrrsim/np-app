// Pure planning for restore-from-backup.mjs (tested in restore-plan.test.mjs): which backup logs
// are missing from the app, and the rows that put one back. Works on export records — the shape
// toRecord() gives and the Drive backup stores (with `note` decrypted).

const SUCCESS = { yes: 1, neutral: 0, no: -1 };
const SLEEP = { poor: 1, fine: 2, good: 3 };
const FEELING = { rough: 1, ok: 2, great: 3 };
const NP = { low: 1, ok: 2, great: 3 };

/** List names are unique per user case-insensitively (lower(name) / lower(label)). */
const nameKey = (s) => s.trim().toLowerCase();

/**
 * What identifies a log when ids differ — a restored log gets a new id but keeps its date, exact
 * created_at, metrics and note. Imported logs can share date + time, so the note and metrics matter.
 */
export function fingerprint(r) {
  return JSON.stringify([r.date, Date.parse(r.created_at), r.mood, r.energy, r.flow, r.success, r.note ?? ""]);
}

/** Everything restore writes, so a restored log can be checked against the backup. */
export function content(r) {
  return JSON.stringify([
    fingerprint(r),
    r.sleep ?? null,
    r.activities.map((a) => `${nameKey(a.activity)}:${a.feeling}`).sort(),
    r.people.map((p) => `${nameKey(p.person)}:${p.np}`).sort(),
    r.markers.map(nameKey).sort(),
  ]);
}

/**
 * Splits the backup's logs against what's in the app now:
 * - `present`: same id in the app (`differs` = edited since; the app's version is kept),
 * - `alreadyRestored`: no id match, but an identical log is there (e.g. from an earlier restore),
 * - `missing`: to be restored.
 * Logs marked `removed_from_app` were deleted in the app on purpose and are skipped unless
 * `includeRemoved`.
 */
export function planRestore(backupLogs, liveRecords, { includeRemoved = false } = {}) {
  const candidates = backupLogs.filter((l) => includeRemoved || !l.removed_from_app);
  const liveById = new Map(liveRecords.map((r) => [r.id, r]));
  const matchedIds = new Set();
  const present = [];
  const differs = [];
  const leftovers = [];
  for (const log of candidates) {
    const live = liveById.get(log.id);
    if (!live) {
      leftovers.push(log);
      continue;
    }
    matchedIds.add(log.id);
    present.push(log);
    if (content(live) !== content(log)) differs.push({ backup: log, live });
  }

  // Unmatched app logs by fingerprint; identical twins are matched one to one.
  const pool = new Map();
  for (const r of liveRecords) {
    if (matchedIds.has(r.id)) continue;
    const fp = fingerprint(r);
    pool.set(fp, [...(pool.get(fp) ?? []), r]);
  }
  const alreadyRestored = [];
  const missing = [];
  for (const log of leftovers) {
    const live = pool.get(fingerprint(log))?.pop();
    if (live) alreadyRestored.push({ backup: log, live });
    else missing.push(log);
  }
  const onlyInApp = [...pool.values()].reduce((n, list) => n + list.length, 0);

  return {
    present,
    differs,
    alreadyRestored,
    // Oldest first, so the app's ids come out in diary order.
    missing: missing.sort((a, b) => a.date.localeCompare(b.date) || Date.parse(a.created_at) - Date.parse(b.created_at)),
    onlyInApp,
    skippedRemoved: backupLogs.length - candidates.length,
  };
}

/**
 * Maps the activity / person / marker names on `logs` to the app's lists. Names the app doesn't
 * have (deleted since the backup, or a fresh database) are returned in `toCreate`.
 */
export function resolveLists(logs, lists) {
  const activity = new Map();
  for (const a of lists.activities) {
    activity.set(nameKey(a.label), a.key);
    if (!activity.has(nameKey(a.key))) activity.set(nameKey(a.key), a.key);
  }
  const person = new Map(lists.people.map((p) => [nameKey(p.name), p.id]));
  const marker = new Map(lists.markers.map((m) => [nameKey(m.name), m.id]));

  const toCreate = { activities: new Map(), people: new Map(), markers: new Map() };
  for (const log of logs) {
    for (const a of log.activities) if (!activity.has(nameKey(a.activity))) toCreate.activities.set(nameKey(a.activity), a.activity.trim());
    for (const p of log.people) if (!person.has(nameKey(p.person))) toCreate.people.set(nameKey(p.person), p.person.trim());
    for (const m of log.markers) if (!marker.has(nameKey(m))) toCreate.markers.set(nameKey(m), m.trim());
  }
  return {
    activity,
    person,
    marker,
    toCreate: {
      activities: [...toCreate.activities.values()],
      people: [...toCreate.people.values()],
      markers: [...toCreate.markers.values()],
    },
  };
}

/**
 * The writes that recreate one log, given resolved list maps:
 * - `save`: the save-entry body (it encrypts the note; nulls get placeholders in case it rejects them),
 * - `update`: the direct np_entries update that sets every non-sensitive column exactly, incl. created_at,
 * - the tag rows (without entry_id).
 */
export function restoreRows(log, maps) {
  const success = log.success === null ? null : SUCCESS[log.success];
  const lookup = (map, name, kind) => {
    const v = map.get(nameKey(name));
    if (v === undefined) throw new Error(`Log ${log.id} (${log.date}): unknown ${kind} "${name}"`);
    return v;
  };
  return {
    save: {
      entry_date: log.date,
      mood: log.mood ?? 6,
      energy: log.energy ?? 6,
      flow: log.flow ?? 6,
      success: success ?? 0,
      note: log.note ?? "",
    },
    update: {
      mood: log.mood,
      energy: log.energy,
      flow: log.flow,
      success_step: success,
      sleep_quality: log.sleep ? SLEEP[log.sleep] : null,
      created_at: log.created_at,
    },
    activities: log.activities.map((a) => ({ activity: lookup(maps.activity, a.activity, "activity"), feeling: FEELING[a.feeling] })),
    people: log.people.map((p) => ({ person_id: lookup(maps.person, p.person, "person"), np: NP[p.np] })),
    markers: [...new Set(log.markers.map((m) => lookup(maps.marker, m, "marker")))],
  };
}

/** Same rule as activityKeyFor in src/lib/activities.ts (that file pulls in React icons). */
export function activityKeyFor(label, taken) {
  const used = new Set(taken);
  let base = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  if (!base) base = "activity";
  else if (!/^[a-z]/.test(base)) base = `a_${base}`;
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`;
}
