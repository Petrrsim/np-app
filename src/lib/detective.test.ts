import { describe, expect, it } from "vitest";
import { entry } from "@/test/fixtures";
import { buildPoints, toDay } from "@/lib/stats";
import { termsRegex } from "@/lib/search";
import {
  baselineOf,
  buildSeries,
  dailyValues,
  defaultMarkerIds,
  feelingTerms,
  findCandidates,
  findDips,
  fmtLag,
  mondayOf,
  scoreEntry,
  weekBars,
  yearsBefore,
  type Baseline,
  type ScoreContext,
  type Series,
} from "@/lib/detective";

const D = (iso: string) => toDay(iso);

describe("dailyValues", () => {
  it("averages a day's logs; 'all' is the per-log mean of M/E/F", () => {
    const pts = buildPoints([
      entry({ entry_date: "2026-01-01", mood: 6, energy: 9, flow: null }),
      entry({ entry_date: "2026-01-01", mood: 2, energy: 3, flow: 4 }),
    ]);
    expect(dailyValues(pts, "mood").get(D("2026-01-01"))).toBe(4);
    // Per-log means 7.5 and 3 → 5.25.
    expect(dailyValues(pts, "all").get(D("2026-01-01"))).toBe(5.25);
  });
});

describe("buildSeries", () => {
  it("fills raw values and a 7-day trailing smooth line", () => {
    const daily = new Map([
      [0, 2],
      [1, 4],
      [8, 10],
    ]);
    const s = buildSeries(daily, 0, 8);
    expect(s.raw).toEqual([2, 4, null, null, null, null, null, null, 10]);
    expect(s.smooth[1]).toBe(3);
    expect(s.smooth[7]).toBe(4); // window [1,7] still holds day 1
    expect(s.smooth[8]).toBe(10); // day 1 has dropped out
  });
});

describe("baselineOf", () => {
  it("needs at least 14 days", () => {
    const daily = new Map(Array.from({ length: 13 }, (_, i) => [i, 6] as [number, number]));
    expect(baselineOf(daily, 0, 100)).toBeNull();
  });

  it("floors the spread at 0.3 so a flat history still has a usable threshold", () => {
    const daily = new Map(Array.from({ length: 20 }, (_, i) => [i, 6] as [number, number]));
    expect(baselineOf(daily, 0, 100)).toEqual({ mean: 6, sd: 0.3, days: 20 });
  });

  it("only counts days inside [from, to]", () => {
    const daily = new Map(Array.from({ length: 30 }, (_, i) => [i, i < 15 ? 4 : 8] as [number, number]));
    expect(baselineOf(daily, 15, 29)!.mean).toBe(8);
  });
});

describe("findDips", () => {
  const base: Baseline = { mean: 6, sd: 1, days: 365 };
  const series = (smooth: (number | null)[]): Series => ({
    start: 100,
    end: 100 + smooth.length - 1,
    raw: smooth,
    smooth,
  });

  it("finds a dip and widens it to the baseline crossings", () => {
    // Threshold is 5.5. Days 2–8 are under the mean, days 3–7 clearly below.
    const s = series([7, 6.5, 5.8, 5, 4, 3.5, 4, 5, 5.9, 6.5, 7]);
    const dips = findDips(s, base);
    expect(dips).toHaveLength(1);
    expect(dips[0]).toMatchObject({ start: 102, end: 108, low: 3.5, lowDay: 105, depth: 2.5, days: 7, ongoing: false });
  });

  it("needs the line more than half an SD under the baseline", () => {
    // Threshold 5.5: six days at 5.4 is a dip, six days at 5.6 is not.
    expect(findDips(series([7, 5.4, 5.4, 5.4, 5.4, 5.4, 5.4, 7]), base)).toHaveLength(1);
    expect(findDips(series([7, 5.6, 5.6, 5.6, 5.6, 5.6, 5.6, 7]), base)).toEqual([]);
  });

  it("ignores short dips", () => {
    expect(findDips(series([7, 5, 4, 5, 7, 7, 7]), base)).toEqual([]);
  });

  it("merges dips separated by a short recovery", () => {
    const s = series([7, 5, 4, 4, 5, 6.5, 6.5, 5, 4, 4, 5, 7]);
    const dips = findDips(s, base);
    expect(dips).toHaveLength(1);
    expect(dips[0]).toMatchObject({ start: 101, end: 110 });
  });

  it("flags a dip still running on the last day", () => {
    const dips = findDips(series([7, 7, 5, 4, 4, 4, 4]), base);
    expect(dips[0].ongoing).toBe(true);
  });
});

describe("feelingTerms", () => {
  it("folds, drops stopwords and short words, and trims Czech endings", () => {
    expect(feelingTerms("Cítím se ztracený a smutný")).toEqual(["ztrace", "smut"]);
  });

  it("dedupes stems and caps at 12", () => {
    expect(feelingTerms("ztracený ztracená")).toEqual(["ztrace"]);
    const many = Array.from({ length: 20 }, (_, i) => `slovo${"x".repeat(i)}`).join(" ");
    expect(feelingTerms(many)).toHaveLength(12);
  });
});

describe("defaultMarkerIds", () => {
  it("picks markers named negative…, ignoring case and accents", () => {
    const markers = [
      { id: 1, name: "Negative", hidden: false },
      { id: 2, name: "positive", hidden: false },
      { id: 3, name: "negativní den", hidden: false },
    ] as Parameters<typeof defaultMarkerIds>[0];
    expect(defaultMarkerIds(markers)).toEqual([1, 3]);
  });
});

describe("scoreEntry / findCandidates", () => {
  const ctx = (over: Partial<ScoreContext> = {}): ScoreContext => ({
    feelingRe: termsRegex(["ztrace"]),
    wordsRe: termsRegex(["smut", "sad", "stres"]),
    markerIds: new Set([7]),
    personName: (id) => (id === 1 ? "Eva" : id === 2 ? "Jan" : undefined),
    markerName: (id) => (id === 7 ? "negative" : undefined),
    daily: new Map(),
    base: null,
    ...over,
  });

  it("weighs own words 3, low-NP people 3, OK-NP people 1, markers 2, heavy words ≤ 3", () => {
    const e = entry({
      entry_date: "2026-01-10",
      people: [
        { person_id: 1, np: 1 },
        { person_id: 2, np: 2 },
      ],
      markers: [7, 8],
    });
    const { score, reasons } = scoreEntry(e, "byl jsem ztraceny, smutny a sad", ctx());
    expect(reasons.map((r) => [r.kind, r.weight])).toEqual([
      ["feeling", 3],
      ["person", 3],
      ["person", 1],
      ["marker", 2],
      ["word", 2],
    ]);
    expect(score).toBe(11);
  });

  it("does not double-count a heavy word that is also a feeling term", () => {
    const { reasons } = scoreEntry(entry(), "smutny", ctx({ feelingRe: termsRegex(["smut"]) }));
    expect(reasons.map((r) => r.kind)).toEqual(["feeling"]);
  });

  it("adds 'felt low' when the day is a full SD under the baseline", () => {
    const day = D("2026-01-10");
    const c = ctx({ daily: new Map([[day, 4]]), base: { mean: 6, sd: 1, days: 300 } });
    const { reasons } = scoreEntry(entry({ entry_date: "2026-01-10" }), "", c);
    expect(reasons).toEqual([{ kind: "low", label: "you felt low that day", weight: 1 }]);
  });

  it("keeps scored logs in [from, to), best first then newest", () => {
    const a = entry({ id: 101, entry_date: "2026-01-05" });
    const b = entry({ id: 102, entry_date: "2026-01-06" });
    const c = entry({ id: 103, entry_date: "2026-01-07", markers: [7] });
    const out = entry({ id: 104, entry_date: "2026-01-20", markers: [7] });
    const none = entry({ id: 105, entry_date: "2026-01-08" });
    const folded = new Map([
      [101, "sad"],
      [102, "sad"],
    ]);
    const res = findCandidates([a, b, c, out, none], folded, D("2026-01-01"), D("2026-01-15"), D("2026-01-15"), ctx());
    expect(res.map((r) => r.entry.id)).toEqual([103, 102, 101]);
    expect(res[0].lag).toBe(8);
  });
});

describe("weeks", () => {
  it("mondayOf finds the Monday on or before a day", () => {
    expect(mondayOf(D("2026-11-18"))).toBe(D("2026-11-16"));
    expect(mondayOf(D("2026-11-16"))).toBe(D("2026-11-16"));
    expect(mondayOf(D("2026-11-22"))).toBe(D("2026-11-16"));
  });

  it("weekBars averages within [from, to] and counts hits per week", () => {
    const mon = D("2026-11-09");
    const daily = new Map([
      [mon, 4],
      [mon + 1, 6],
      [mon + 7, 8],
    ]);
    const cand = { entry: entry(), day: mon + 2, lag: 0, score: 3, reasons: [] };
    const bars = weekBars(daily, mon + 1, mon + 7, [cand, { ...cand, score: 1 }]);
    expect(bars.map((b) => b.start)).toEqual([mon, mon + 7]);
    expect(bars[0]).toMatchObject({ value: 6, hits: 2, strong: 1 }); // day `mon` is before `from`
    expect(bars[1].value).toBe(8);
  });
});

describe("dates", () => {
  it("yearsBefore keeps the calendar day and maps 29 Feb to 28 Feb", () => {
    expect(yearsBefore(D("2026-11-18"), 1)).toBe(D("2025-11-18"));
    expect(yearsBefore(D("2024-02-29"), 1)).toBe(D("2023-02-28"));
  });

  it("fmtLag reads naturally", () => {
    expect(fmtLag(0)).toBe("same day");
    expect(fmtLag(1)).toBe("1 day before");
    expect(fmtLag(5)).toBe("5 days before");
  });
});
