import { describe, expect, it } from "vitest";
import { entry } from "@/test/fixtures";
import {
  activityStats,
  buildPoints,
  chronological,
  compareDays,
  dailyMetric,
  dayToDate,
  fmt1,
  fmtSigned,
  lagFactors,
  laggedEffects,
  mean,
  metricsBySuccess,
  moodDelta,
  movingAverage,
  rangeStart,
  sleepStats,
  sparkline,
  summarize,
  toDay,
  weekdayRhythm,
  type ChartPoint,
} from "@/lib/stats";

/** Minimal chart point for a day offset, with only mood set unless given. */
function pt(day: number, mood: number | null, extra: Partial<ChartPoint> = {}): ChartPoint {
  return { entry: entry(), day, mood, energy: null, flow: null, success: null, ...extra };
}

describe("days", () => {
  it("toDay counts days since 1970-01-01", () => {
    expect(toDay("1970-01-01")).toBe(0);
    expect(toDay("1970-01-02")).toBe(1);
    expect(toDay("2026-03-01") - toDay("2026-02-28")).toBe(1);
    expect(toDay("2024-03-01") - toDay("2024-02-28")).toBe(2); // leap year
  });

  it("dayToDate round-trips to the same local calendar day", () => {
    const d = dayToDate(toDay("2026-11-18"));
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 18]);
  });

  it("rangeStart includes today", () => {
    expect(rangeStart("7d", 100)).toBe(94);
    expect(rangeStart("all", 100)).toBeNull();
  });
});

describe("mean / summarize", () => {
  it("mean of nothing is null", () => {
    expect(mean([])).toBeNull();
    expect(mean([1, 2, 3])).toBe(2);
  });

  it("summarize skips missing values", () => {
    expect(summarize([pt(0, 4), pt(1, null), pt(2, 8)], "mood")).toEqual({ avg: 6, n: 2 });
  });
});

describe("chronological", () => {
  it("sorts by date, then created_at, then id", () => {
    const a = entry({ id: 10, entry_date: "2026-01-02", created_at: "2026-01-02T08:00:00Z" });
    const b = entry({ id: 11, entry_date: "2026-01-01", created_at: "2026-01-01T20:00:00Z" });
    const c = entry({ id: 12, entry_date: "2026-01-02", created_at: "2026-01-02T07:00:00Z" });
    const d = entry({ id: 9, entry_date: "2026-01-02", created_at: "2026-01-02T07:00:00Z" });
    expect(chronological([a, b, c, d]).map((e) => e.id)).toEqual([11, 9, 12, 10]);
  });

  it("does not mutate the input", () => {
    const list = [entry({ entry_date: "2026-01-02" }), entry({ entry_date: "2026-01-01" })];
    const before = list.map((e) => e.id);
    chronological(list);
    expect(list.map((e) => e.id)).toEqual(before);
  });
});

describe("buildPoints", () => {
  it("coerces numeric strings and drops logs without any metric", () => {
    const rows = [
      entry({ entry_date: "2026-01-01", mood: "7.50" as unknown as number, energy: null, flow: null }),
      entry({ entry_date: "2026-01-02", mood: null, energy: null, flow: null }),
      entry({ entry_date: "2026-01-03", mood: null, energy: 5, flow: null, success_step: 1 }),
    ];
    const pts = buildPoints(rows);
    expect(pts).toHaveLength(2);
    expect(pts[0].mood).toBe(7.5);
    expect(pts[1]).toMatchObject({ mood: null, energy: 5, success: 1, day: toDay("2026-01-03") });
  });

  it("treats empty strings as missing", () => {
    const pts = buildPoints([entry({ mood: "" as unknown as number, energy: 3, flow: null })]);
    expect(pts[0].mood).toBeNull();
  });
});

describe("movingAverage", () => {
  it("averages a trailing calendar-day window, not a log count", () => {
    // Two logs on day 0, one on day 1, one on day 10.
    const pts = [pt(0, 2), pt(0, 4), pt(1, 6), pt(10, 10)];
    expect(movingAverage(pts, "mood", 7)).toEqual([2, 3, 4, 10]);
  });

  it("keeps earlier values inside the window", () => {
    const pts = [pt(0, 2), pt(6, 4), pt(7, 6)];
    // Day 6: window [0,6] → 2,4. Day 7: window [1,7] → 4,6.
    expect(movingAverage(pts, "mood", 7)).toEqual([2, 3, 5]);
  });

  it("is null where nothing is left to average", () => {
    const pts = [pt(0, 5), pt(20, null)];
    expect(movingAverage(pts, "mood", 7)).toEqual([5, null]);
  });
});

describe("sparkline", () => {
  it("buckets the span evenly and leaves empty buckets null", () => {
    const pts = [pt(0, 2), pt(1, 4), pt(9, 8)];
    expect(sparkline(pts, "mood", 0, 9, 5)).toEqual([3, null, null, null, 8]);
  });

  it("ignores points outside the span", () => {
    expect(sparkline([pt(-1, 1), pt(20, 1)], "mood", 0, 9, 2)).toEqual([null, null]);
  });
});

describe("weekdayRhythm", () => {
  it("is Monday-first and relative to the overall average", () => {
    const monday = toDay("2026-11-16");
    const r = weekdayRhythm([pt(monday, 8), pt(monday + 1, 4)], "mood");
    expect(r[0]).toEqual({ dev: 2, n: 1 });
    expect(r[1]).toEqual({ dev: -2, n: 1 });
    expect(r[6]).toEqual({ dev: null, n: 0 });
  });
});

describe("metricsBySuccess", () => {
  it("averages each metric per success step", () => {
    const pts = [pt(0, 8, { success: 1 }), pt(1, 6, { success: 1 }), pt(2, 3, { success: -1 })];
    const r = metricsBySuccess(pts);
    expect(r.mood).toEqual({ [-1]: 3, 0: null, 1: 7 });
  });
});

describe("moodDelta", () => {
  const daily = new Map([
    [0, 8],
    [1, 8],
    [2, 4],
    [3, 4],
  ]);

  it("is with-days minus without-days", () => {
    expect(moodDelta(daily, new Set([0, 1]))).toBe(4);
  });

  it("is null when either side has too few days", () => {
    expect(moodDelta(daily, new Set([0]))).toBeNull();
    expect(moodDelta(daily, new Set([0, 1, 2]))).toBeNull();
  });
});

describe("activityStats", () => {
  it("counts, averages feeling, and sorts by usage", () => {
    const rows = [
      entry({ entry_date: "2026-01-01", activities: [{ activity: "run", feeling: 3 }] }),
      entry({
        entry_date: "2026-01-02",
        activities: [
          { activity: "run", feeling: 1 },
          { activity: "swim", feeling: 2 },
        ],
      }),
    ];
    const stats = activityStats(rows, new Map());
    expect(stats.map((s) => [s.key, s.count, s.avgLevel])).toEqual([
      ["run", 2, 2],
      ["swim", 1, 2],
    ]);
  });
});

describe("sleepStats", () => {
  it("uses the newest sleep rating of a day for all of that day's logs", () => {
    const sorted = [
      entry({ entry_date: "2026-01-01", sleep_quality: 1, mood: 4 }),
      entry({ entry_date: "2026-01-01", sleep_quality: 3, mood: 8 }),
      entry({ entry_date: "2026-01-02", sleep_quality: null, mood: 2 }),
    ];
    const s = sleepStats(sorted, buildPoints(sorted));
    expect(s.find((x) => x.level === 1)!.days).toBe(0);
    const good = s.find((x) => x.level === 3)!;
    expect(good.days).toBe(1);
    expect(good.avg.mood).toBe(6);
  });
});

describe("formatting", () => {
  it("fmt1 rounds to one decimal and dashes missing values", () => {
    expect(fmt1(6.66)).toBe("6.7");
    expect(fmt1(null)).toBe("–");
  });

  it("fmtSigned uses a real minus and ± for zero", () => {
    expect(fmtSigned(1.23)).toBe("+1.2");
    expect(fmtSigned(-0.46)).toBe("−0.5");
    expect(fmtSigned(0.01)).toBe("±0.0");
  });
});

describe("lagged effects", () => {
  const d0 = toDay("2026-01-01");
  const date = (offset: number) => dayToDate(d0 + offset).toLocaleDateString("en-CA");

  it("dailyMetric averages one metric per day", () => {
    const daily = dailyMetric([pt(0, 4, { energy: 2 }), pt(0, 8, { energy: 4 }), pt(1, null, { energy: 9 })], "energy");
    expect([...daily]).toEqual([
      [0, 3],
      [1, 9],
    ]);
  });

  it("compareDays gives the delta, the n and a t that grows with consistency", () => {
    const daily = new Map([
      [0, 8],
      [1, 8.2],
      [2, 7.8],
      [3, 4],
      [4, 4.2],
      [5, 3.8],
    ]);
    const c = compareDays(daily, new Set([0, 1, 2]))!;
    expect(c.delta).toBeCloseTo(4);
    expect(c.n).toBe(3);
    expect(c.t).toBeGreaterThan(10);

    const noisy = new Map([
      [0, 11],
      [1, 2],
      [2, 8],
      [3, 3],
      [4, 9],
      [5, 4],
    ]);
    expect(Math.abs(compareDays(noisy, new Set([0, 1, 2]))!.t)).toBeLessThan(2);
    expect(compareDays(daily, new Set([0]), 2)).toBeNull(); // one day on the "with" side
  });

  it("lagFactors collects days per sleep level, win/miss and tag", () => {
    const sorted = chronological([
      entry({ entry_date: date(0), sleep_quality: 1, success_step: 1, activities: [{ activity: "run", feeling: 3 }] }),
      entry({ entry_date: date(0), sleep_quality: 3, markers: [7] }), // newest sleep rating of the day wins
      entry({ entry_date: date(1), success_step: -1, people: [{ person_id: 5, np: 1 }] }),
      entry({ entry_date: date(2), activities: [{ activity: "run", feeling: 2 }] }),
    ]);
    const byId = new Map(lagFactors(sorted).map((f) => [`${f.kind}:${f.key}`, [...f.days]]));
    expect(byId.get("sleep:3")).toEqual([d0]);
    expect(byId.has("sleep:1")).toBe(false);
    expect(byId.get("success:1")).toEqual([d0]);
    expect(byId.get("success:-1")).toEqual([d0 + 1]);
    expect(byId.get("activity:run")).toEqual([d0, d0 + 2]);
    expect(byId.get("person:5")).toEqual([d0 + 1]);
    expect(byId.get("marker:7")).toEqual([d0]);
  });

  it("laggedEffects finds a dip that shows up the day after, not on the day", () => {
    // A factor on days 0, 10, 20, 30: normal mood that day, a low mood the next day.
    const daily = new Map<number, number>();
    for (let d = 0; d < 40; d++) daily.set(d, d % 10 === 1 ? 3 : 7 + (d % 3) * 0.1);
    const factor = { kind: "activity" as const, key: "late", days: new Set([0, 10, 20, 30]) };
    const rare = { kind: "marker" as const, key: 1, days: new Set([5, 6]) }; // under minDays
    const [row, ...rest] = laggedEffects(daily, [factor, rare]);
    expect(rest).toHaveLength(0);
    const [same, next, after] = row.cells;
    expect(Math.abs(same!.t)).toBeLessThan(2);
    expect(next!.delta).toBeLessThan(-3);
    expect(next!.t).toBeLessThan(-2);
    expect(Math.abs(after!.delta)).toBeLessThan(1);
  });

  it("laggedEffects sorts by how clear the next-day effect is", () => {
    const daily = new Map<number, number>();
    for (let d = 0; d < 30; d++) daily.set(d, [1, 11, 21].includes(d) ? 2 : 7);
    const clear = { kind: "activity" as const, key: "a", days: new Set([0, 10, 20]) };
    const none = { kind: "activity" as const, key: "b", days: new Set([3, 13, 23]) };
    expect(laggedEffects(daily, [none, clear]).map((r) => r.factor.key)).toEqual(["a", "b"]);
  });
});
