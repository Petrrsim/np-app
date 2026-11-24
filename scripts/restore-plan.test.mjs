import { describe, expect, it } from "vitest";
import { activityKeyFor, content, fingerprint, planRestore, resolveLists, restoreRows } from "./restore-plan.mjs";

let nextId = 1;
/** An export record as the backup stores it (note decrypted). */
function rec(overrides = {}) {
  return {
    id: nextId++,
    date: "2026-01-01",
    created_at: "2026-01-01T10:00:00+00:00",
    mood: 6,
    energy: 6,
    flow: 6,
    success: "neutral",
    sleep: null,
    activities: [],
    people: [],
    markers: [],
    note: "",
    ...overrides,
  };
}

describe("planRestore", () => {
  it("sorts backup logs into present / edited / missing / skipped", () => {
    const same = rec({ note: "a" });
    const edited = rec({ note: "b" });
    const gone = rec({ note: "c", date: "2026-01-03" });
    const older = rec({ note: "d", date: "2026-01-02" });
    const removed = rec({ note: "e", removed_from_app: "2026-02-01" });
    const newer = rec({ note: "f" });
    const plan = planRestore([same, edited, gone, older, removed], [same, { ...edited, mood: 9 }, newer]);
    expect(plan.present.map((l) => l.id)).toEqual([same.id, edited.id]);
    expect(plan.differs.map((d) => d.backup.id)).toEqual([edited.id]);
    expect(plan.missing.map((l) => l.id)).toEqual([older.id, gone.id]); // oldest first
    expect(plan.skippedRemoved).toBe(1);
    expect(plan.onlyInApp).toBe(1);
    expect(planRestore([removed], [], { includeRemoved: true }).missing).toHaveLength(1);
  });

  it("recognises a log restored earlier under a new id, matching identical twins one to one", () => {
    const twinA = rec({ note: "same" });
    const twinB = rec({ note: "same" });
    const restoredA = { ...twinA, id: 900, created_at: "2026-01-01T10:00:00.000Z" }; // same instant, other format
    const plan = planRestore([twinA, twinB], [restoredA]);
    expect(plan.alreadyRestored).toHaveLength(1);
    expect(plan.missing).toHaveLength(1);
  });

  it("content compares tags regardless of order and case", () => {
    const a = rec({ markers: ["Positive", "x"], people: [{ person: "Ana", np: "ok" }] });
    expect(content(a)).toBe(content({ ...a, markers: ["X", "positive"], people: [{ person: "ana", np: "ok" }] }));
    expect(content(a)).not.toBe(content({ ...a, sleep: "good" }));
    expect(fingerprint(a)).toBe(fingerprint({ ...a, sleep: "good" }));
  });
});

describe("resolveLists / restoreRows", () => {
  const lists = {
    activities: [{ key: "run", label: "Běh" }],
    people: [{ id: 5, name: "Ana" }],
    markers: [{ id: 7, name: "positive" }],
  };

  it("maps names to keys/ids and lists what's missing", () => {
    const log = rec({
      activities: [{ activity: "běh", feeling: "great" }, { activity: "Swim", feeling: "ok" }],
      people: [{ person: "ANA", np: "low" }, { person: "Bob", np: "great" }],
      markers: ["Positive", "injury"],
    });
    const maps = resolveLists([log], lists);
    expect(maps.toCreate).toEqual({ activities: ["Swim"], people: ["Bob"], markers: ["injury"] });
    expect(() => restoreRows(log, maps)).toThrow(/unknown activity "Swim"/);

    maps.activity.set("swim", "swim");
    maps.person.set("bob", 8);
    maps.marker.set("injury", 9);
    const rows = restoreRows(log, maps);
    expect(rows.activities).toEqual([
      { activity: "run", feeling: 3 },
      { activity: "swim", feeling: 2 },
    ]);
    expect(rows.people).toEqual([
      { person_id: 5, np: 1 },
      { person_id: 8, np: 3 },
    ]);
    expect(rows.markers).toEqual([7, 9]);
  });

  it("an activity stored under its bare key (label unknown at backup time) still resolves", () => {
    const maps = resolveLists([rec({ activities: [{ activity: "run", feeling: "ok" }] })], lists);
    expect(maps.toCreate.activities).toEqual([]);
  });

  it("restoreRows keeps nulls exact in the direct update and placeholders only for save-entry", () => {
    const log = rec({ mood: null, energy: null, flow: null, success: null, sleep: "poor", note: "hi" });
    const { save, update } = restoreRows(log, resolveLists([log], lists));
    expect(save).toEqual({ entry_date: "2026-01-01", mood: 6, energy: 6, flow: 6, success: 0, note: "hi" });
    expect(update).toEqual({
      mood: null,
      energy: null,
      flow: null,
      success_step: null,
      sleep_quality: 1,
      created_at: "2026-01-01T10:00:00+00:00",
    });
    expect(restoreRows(rec({ success: "no" }), resolveLists([], lists)).update.success_step).toBe(-1);
  });

  it("activityKeyFor matches the app's slug rule", () => {
    expect(activityKeyFor("Běh", [])).toBe("beh");
    expect(activityKeyFor("Běh", ["beh"])).toBe("beh_2");
    expect(activityKeyFor("5k", [])).toBe("a_5k");
  });
});
