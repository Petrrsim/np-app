import type { DecryptedEntry, SleepQuality, SuccessStep } from "@/types/db";

/**
 * Pure Dashboard computations over the cached, decrypted history (no network).
 * Days are handled as integer "epoch days" (UTC midnight of the stored `yyyy-MM-dd`), so
 * windows and streaks never drift with time zones or DST.
 */

export type MetricKey = "mood" | "energy" | "flow";

/**
 * Chart series. Colours are theme tokens in globals.css (validated as a CVD-safe set). The hex
 * fallbacks matter: without them a missing token (e.g. Turbopack's stale dev CSS cache) leaves
 * SVG strokes at `none` — dots still show (black fill) but every line silently disappears.
 */
export const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: "mood", label: "Mood", color: "var(--chart-mood, #2a78d6)" },
  { key: "energy", label: "Energy", color: "var(--chart-energy, #eb6834)" },
  { key: "flow", label: "Flow", color: "var(--chart-flow, #1baf7a)" },
];

export const METRIC_MIN = 1;
export const METRIC_MAX = 12;

export type RangeKey = "7d" | "30d" | "90d" | "1y" | "all";

export const RANGES: { key: RangeKey; label: string; days: number | null; prevLabel: string }[] = [
  { key: "7d", label: "7D", days: 7, prevLabel: "prev. 7 days" },
  { key: "30d", label: "30D", days: 30, prevLabel: "prev. 30 days" },
  { key: "90d", label: "90D", days: 90, prevLabel: "prev. 90 days" },
  { key: "1y", label: "1Y", days: 365, prevLabel: "prev. year" },
  { key: "all", label: "All", days: null, prevLabel: "" },
];

/** A log with at least one metric, in chronological order — one chart column. */
export interface ChartPoint {
  entry: DecryptedEntry;
  day: number;
  mood: number | null;
  energy: number | null;
  flow: number | null;
  success: SuccessStep | null;
}

const DAY_MS = 86_400_000;

export function toDay(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function dayToDate(day: number): Date {
  const d = new Date(day * DAY_MS);
  // Local date with the same calendar day, for date-fns formatting.
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function todayDay(): number {
  const now = new Date();
  return Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);
}

/** Metric columns may arrive as numeric strings ("7.50") or decimals from imported logs. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/** Oldest → newest (date, then time written, then id). */
export function chronological(entries: DecryptedEntry[]): DecryptedEntry[] {
  return [...entries].sort((a, b) => {
    if (a.entry_date !== b.entry_date) return a.entry_date < b.entry_date ? -1 : 1;
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.id - b.id;
  });
}

/** Chart columns: chronological logs that carry at least one of mood / energy / flow. */
export function buildPoints(sorted: DecryptedEntry[]): ChartPoint[] {
  const points: ChartPoint[] = [];
  for (const entry of sorted) {
    const mood = num(entry.mood);
    const energy = num(entry.energy);
    const flow = num(entry.flow);
    if (mood === null && energy === null && flow === null) continue;
    points.push({
      entry,
      day: toDay(entry.entry_date),
      mood,
      energy,
      flow,
      success: entry.success_step ?? null,
    });
  }
  return points;
}

/** First day (inclusive) of a range ending today; `null` = all time. */
export function rangeStart(range: RangeKey, today: number): number | null {
  const r = RANGES.find((x) => x.key === range)!;
  return r.days === null ? null : today - r.days + 1;
}

/**
 * Trailing moving average per column: the mean of the metric over the logs of the last
 * `days` calendar days up to and including this log. `null` where there's nothing to average.
 */
export function movingAverage(points: ChartPoint[], key: MetricKey, days: number): (number | null)[] {
  const out: (number | null)[] = new Array(points.length).fill(null);
  let lo = 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < points.length; i++) {
    const v = points[i][key];
    if (v !== null) {
      sum += v;
      count++;
    }
    while (points[lo].day <= points[i].day - days) {
      const old = points[lo][key];
      if (old !== null) {
        sum -= old;
        count--;
      }
      lo++;
    }
    out[i] = count > 0 ? sum / count : null;
  }
  return out;
}

export interface MetricSummary {
  avg: number | null;
  n: number;
}

export function summarize(points: ChartPoint[], key: MetricKey): MetricSummary {
  const values = points.map((p) => p[key]).filter((v): v is number => v !== null);
  return { avg: mean(values), n: values.length };
}

/** Averages of `key` over `buckets` equal slices of [startDay, endDay] (for sparklines). */
export function sparkline(
  points: ChartPoint[],
  key: MetricKey,
  startDay: number,
  endDay: number,
  buckets = 14,
): (number | null)[] {
  const span = Math.max(1, endDay - startDay + 1);
  const sums = new Array(buckets).fill(0);
  const counts = new Array(buckets).fill(0);
  for (const p of points) {
    const v = p[key];
    if (v === null || p.day < startDay || p.day > endDay) continue;
    const b = Math.min(buckets - 1, Math.floor(((p.day - startDay) / span) * buckets));
    sums[b] += v;
    counts[b]++;
  }
  return sums.map((s, i) => (counts[i] ? s / counts[i] : null));
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Per-weekday average of `key` (Mon-first) as a deviation from the overall average. */
export function weekdayRhythm(points: ChartPoint[], key: MetricKey): { dev: number | null; n: number }[] {
  const overall = summarize(points, key).avg;
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  for (const p of points) {
    const v = p[key];
    if (v === null) continue;
    // epoch day 0 (1970-01-01) was a Thursday → Mon-first index 3.
    const wd = (((p.day + 3) % 7) + 7) % 7;
    sums[wd] += v;
    counts[wd]++;
  }
  return sums.map((s, i) => ({
    dev: counts[i] && overall !== null ? s / counts[i] - overall : null,
    n: counts[i],
  }));
}

/** Average of each metric over logs with a given success step. */
export function metricsBySuccess(points: ChartPoint[]): Record<MetricKey, Record<SuccessStep, number | null>> {
  const out = {} as Record<MetricKey, Record<SuccessStep, number | null>>;
  for (const { key } of METRICS) {
    const by: Record<SuccessStep, number[]> = { [-1]: [], 0: [], 1: [] };
    for (const p of points) {
      const v = p[key];
      if (v !== null && p.success !== null) by[p.success].push(v);
    }
    out[key] = { [-1]: mean(by[-1]), 0: mean(by[0]), 1: mean(by[1]) };
  }
  return out;
}

/** Day → average mood of that day's logs (the baseline for "with vs. without" deltas). */
export function dailyMood(points: ChartPoint[]): Map<number, number> {
  const acc = new Map<number, { s: number; n: number }>();
  for (const p of points) {
    if (p.mood === null) continue;
    const a = acc.get(p.day) ?? { s: 0, n: 0 };
    a.s += p.mood;
    a.n++;
    acc.set(p.day, a);
  }
  return new Map([...acc].map(([d, a]) => [d, a.s / a.n]));
}

/** Avg daily mood on `days` minus on all other days with mood; null if either side is thin. */
export function moodDelta(daily: Map<number, number>, days: Set<number>, minDays = 2): number | null {
  const withV: number[] = [];
  const withoutV: number[] = [];
  for (const [d, m] of daily) (days.has(d) ? withV : withoutV).push(m);
  if (withV.length < minDays || withoutV.length < minDays) return null;
  return mean(withV)! - mean(withoutV)!;
}

export interface TagStat {
  key: string | number;
  count: number;
  /** Average 1–3 rating (activity feeling / person NP), when the tag has one. */
  avgLevel: number | null;
  moodDelta: number | null;
}

/** Activity usage in `entries`, most-logged first. */
export function activityStats(entries: DecryptedEntry[], daily: Map<number, number>): TagStat[] {
  const acc = new Map<string, { count: number; feel: number; days: Set<number> }>();
  for (const e of entries) {
    for (const a of e.activities ?? []) {
      const s = acc.get(a.activity) ?? { count: 0, feel: 0, days: new Set<number>() };
      s.count++;
      s.feel += a.feeling;
      s.days.add(toDay(e.entry_date));
      acc.set(a.activity, s);
    }
  }
  return [...acc]
    .map(([key, s]) => ({ key, count: s.count, avgLevel: s.feel / s.count, moodDelta: moodDelta(daily, s.days) }))
    .sort((a, b) => b.count - a.count);
}

/** People in `entries`, most-logged first. */
export function peopleStats(entries: DecryptedEntry[], daily: Map<number, number>): TagStat[] {
  const acc = new Map<number, { count: number; np: number; days: Set<number> }>();
  for (const e of entries) {
    for (const p of e.people ?? []) {
      const s = acc.get(p.person_id) ?? { count: 0, np: 0, days: new Set<number>() };
      s.count++;
      s.np += p.np;
      s.days.add(toDay(e.entry_date));
      acc.set(p.person_id, s);
    }
  }
  return [...acc]
    .map(([key, s]) => ({ key, count: s.count, avgLevel: s.np / s.count, moodDelta: moodDelta(daily, s.days) }))
    .sort((a, b) => b.count - a.count);
}

/** Markers in `entries`, most-used first. */
export function markerStats(entries: DecryptedEntry[], daily: Map<number, number>): TagStat[] {
  const acc = new Map<number, { count: number; days: Set<number> }>();
  for (const e of entries) {
    for (const id of e.markers ?? []) {
      const s = acc.get(id) ?? { count: 0, days: new Set<number>() };
      s.count++;
      s.days.add(toDay(e.entry_date));
      acc.set(id, s);
    }
  }
  return [...acc]
    .map(([key, s]) => ({ key, count: s.count, avgLevel: null, moodDelta: moodDelta(daily, s.days) }))
    .sort((a, b) => b.count - a.count);
}

export interface SleepStat {
  level: SleepQuality;
  days: number;
  avg: Record<MetricKey, number | null>;
}

/**
 * Metrics by the night's sleep: a day's sleep is the newest log that rated it, and every
 * log of that day counts towards that sleep level.
 */
export function sleepStats(sorted: DecryptedEntry[], points: ChartPoint[]): SleepStat[] {
  const sleepByDay = new Map<number, SleepQuality>();
  for (const e of sorted) if (e.sleep_quality) sleepByDay.set(toDay(e.entry_date), e.sleep_quality);
  return ([1, 2, 3] as SleepQuality[]).map((level) => {
    const dayPoints = points.filter((p) => sleepByDay.get(p.day) === level);
    const days = [...sleepByDay.values()].filter((l) => l === level).length;
    return {
      level,
      days,
      avg: {
        mood: summarize(dayPoints, "mood").avg,
        energy: summarize(dayPoints, "energy").avg,
        flow: summarize(dayPoints, "flow").avg,
      },
    };
  });
}

export function fmt1(n: number | null | undefined): string {
  return n === null || n === undefined ? "–" : (Math.round(n * 10) / 10).toFixed(1);
}

export function fmtSigned(n: number): string {
  const r = Math.round(n * 10) / 10;
  return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r).toFixed(1)}`;
}
