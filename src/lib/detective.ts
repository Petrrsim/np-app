import { format, subYears } from "date-fns";
import type { DecryptedEntry, Marker } from "@/types/db";
import { dayToDate, mean, toDay, type ChartPoint, type MetricKey } from "@/lib/stats";
import { foldText, matchedTerms } from "@/lib/search";

/**
 * Pure Detective computations over the cached, decrypted history (no network, no LLM).
 * The idea: find when the current low began (from the metrics), then rank the logs of the
 * months before it by signals that someone else's heavy state may have rubbed off — tagged
 * people with low NP, signal markers, heavy words, and words from the user's own description
 * of the feeling. Days are epoch days, as in stats.ts.
 */

/** Which metric drives the dip detection: one of the sliders, or their per-log mean. */
export type SignalMetric = "all" | MetricKey;

export const SIGNAL_METRICS: { key: SignalMetric; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mood", label: "Mood" },
  { key: "energy", label: "Energy" },
  { key: "flow", label: "Flow" },
];

export type LookbackKey = "1m" | "3m" | "6m" | "1y";

export const LOOKBACKS: { key: LookbackKey; label: string; days: number; long: string }[] = [
  { key: "1m", label: "1M", days: 30, long: "month" },
  { key: "3m", label: "3M", days: 91, long: "3 months" },
  { key: "6m", label: "6M", days: 182, long: "6 months" },
  { key: "1y", label: "1Y", days: 365, long: "year" },
];

/** Trailing window (calendar days) of the smoothed line dips are detected on. */
export const SMOOTH_DAYS = 7;
/** Baseline = the average daily value over this many days before the analysed point. */
export const BASELINE_DAYS = 365;

export function pointValue(p: ChartPoint, metric: SignalMetric): number | null {
  if (metric !== "all") return p[metric];
  const vs = [p.mood, p.energy, p.flow].filter((v): v is number => v !== null);
  return mean(vs);
}

/** Day → mean value of that day's logs. */
export function dailyValues(points: ChartPoint[], metric: SignalMetric): Map<number, number> {
  const acc = new Map<number, { s: number; n: number }>();
  for (const p of points) {
    const v = pointValue(p, metric);
    if (v === null) continue;
    const a = acc.get(p.day) ?? { s: 0, n: 0 };
    a.s += v;
    a.n++;
    acc.set(p.day, a);
  }
  return new Map([...acc].map(([d, a]) => [d, a.s / a.n]));
}

/** Day-indexed series over [start, end]: raw daily means and a trailing smoothed line. */
export interface Series {
  start: number;
  end: number;
  raw: (number | null)[];
  smooth: (number | null)[];
}

export function buildSeries(daily: Map<number, number>, start: number, end: number): Series {
  const n = Math.max(0, end - start + 1);
  const raw: (number | null)[] = new Array(n).fill(null);
  const smooth: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const day = start + i;
    raw[i] = daily.get(day) ?? null;
    let s = 0;
    let c = 0;
    for (let k = 0; k < SMOOTH_DAYS; k++) {
      const v = daily.get(day - k);
      if (v !== undefined) {
        s += v;
        c++;
      }
    }
    smooth[i] = c > 0 ? s / c : null;
  }
  return { start, end, raw, smooth };
}

export interface Baseline {
  mean: number;
  sd: number;
  days: number;
}

/** Average and spread of the daily values in [from, to]; null with fewer than 14 days. */
export function baselineOf(daily: Map<number, number>, from: number, to: number): Baseline | null {
  const vs: number[] = [];
  for (const [d, v] of daily) if (d >= from && d <= to) vs.push(v);
  if (vs.length < 14) return null;
  const m = mean(vs)!;
  const sd = Math.sqrt(mean(vs.map((v) => (v - m) ** 2))!);
  return { mean: m, sd: Math.max(0.3, sd), days: vs.length };
}

export interface Dip {
  start: number;
  end: number;
  /** Lowest point of the smoothed line, and its day. */
  low: number;
  lowDay: number;
  /** Baseline minus the low. */
  depth: number;
  days: number;
  /** Still running on the last day of the series. */
  ongoing: boolean;
}

/**
 * Periods where the smoothed line sits clearly below the baseline (by more than half a
 * standard deviation) for at least `minDays`, widened to where it crosses the baseline itself
 * — so `start` is roughly when things began to slide. Dips separated by a short recovery
 * (≤ 4 days) count as one.
 */
export function findDips(series: Series, base: Baseline, minDays = 5): Dip[] {
  const { smooth } = series;
  const n = smooth.length;
  const thr = base.mean - 0.5 * base.sd;
  const below = (i: number) => smooth[i] !== null && smooth[i]! < thr;
  const underMean = (i: number) => i >= 0 && i < n && smooth[i] !== null && smooth[i]! < base.mean;

  const runs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    if (!below(i)) continue;
    let e = i;
    let gap = 0;
    for (let j = i + 1; j < n; j++) {
      if (below(j)) {
        e = j;
        gap = 0;
      } else if (++gap > 2) break;
    }
    runs.push([i, e]);
    i = e;
  }

  // Widen to the baseline crossings, then merge what's (nearly) touching.
  const wide: [number, number][] = [];
  for (const [s0, e0] of runs) {
    let s = s0;
    let e = e0;
    while (underMean(s - 1)) s--;
    while (underMean(e + 1)) e++;
    const last = wide[wide.length - 1];
    if (last && s <= last[1] + 5) last[1] = Math.max(last[1], e);
    else wide.push([s, e]);
  }

  const dips: Dip[] = [];
  for (const [s, e] of wide) {
    if (e - s + 1 < minDays) continue;
    let low = Infinity;
    let lowIdx = s;
    for (let i = s; i <= e; i++) {
      if (smooth[i] !== null && smooth[i]! < low) {
        low = smooth[i]!;
        lowIdx = i;
      }
    }
    dips.push({
      start: series.start + s,
      end: series.start + e,
      low,
      lowDay: series.start + lowIdx,
      depth: base.mean - low,
      days: e - s + 1,
      ongoing: e === n - 1,
    });
  }
  return dips;
}

// ── Signals ──────────────────────────────────────────────────────────────────

/**
 * Default "heavy words" (folded word-starts; Czech + English) that hint at someone's
 * difficult state in a note. Editable on the page; terms of ≤ 3 letters match whole words.
 */
export const DEFAULT_WORDS = [
  "smut",
  "nestast",
  "ztracen",
  "zoufal",
  "stezov",
  "narik",
  "brec",
  "plakal",
  "depres",
  "uzkost",
  "strach",
  "nastvan",
  "vztek",
  "zklaman",
  "beznad",
  "osamel",
  "vycerpan",
  "frustr",
  "trapi",
  "hadk",
  "rozchod",
  "krize",
  "stres",
  "nervoz",
  "negativ",
  "toxic",
  "sad",
  "unhappy",
  "lost",
  "complain",
  "cried",
  "crying",
  "depress",
  "anxi",
  "angry",
  "lonely",
  "hopeless",
  "frustrat",
  "drained",
  "struggl",
  "upset",
  "worried",
  "breakup",
  "divorce",
  "crisis",
];

/** Markers that count as a signal by default: the ones named "negative…". */
export function defaultMarkerIds(markers: Marker[]): number[] {
  return markers.filter((m) => foldText(m.name).startsWith("negativ")).map((m) => m.id);
}

const STOPWORDS = new Set([
  // English
  "the", "and", "but", "not", "feel", "feeling", "feels", "very", "really", "like", "just", "with",
  "about", "that", "this", "have", "been", "some", "kind", "bit", "little", "today", "lately", "all",
  "for", "you", "are", "was", "what", "when", "there", "its", "it's", "much", "more", "too", "get",
  // Czech (folded)
  "jsem", "jsi", "jsme", "neni", "byl", "byla", "bylo", "mam", "mas", "nemam", "citim", "se", "si",
  "ale", "jak", "tak", "moc", "hodne", "trochu", "dnes", "ted", "uplne", "nejak", "porad", "furt",
  "proto", "protoze", "kdyz", "jako", "bez", "pro", "pri", "nad", "pod", "mezi", "jeste", "uz",
  "taky", "take", "neco", "nic", "vse", "vsechno", "jen", "jenom", "aby", "abych", "ktery", "ktera",
]);

/**
 * Word-start search terms from the user's description of the feeling: folded, stopwords
 * dropped, and longer words cut by two letters so Czech endings still match
 * ("ztracený" → "ztrace", which also finds "ztracená").
 */
export function feelingTerms(text: string): string[] {
  const words = foldText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  const stems = words.map((w) => (w.length > 5 ? w.slice(0, w.length - 2) : w));
  return [...new Set(stems)].slice(0, 12);
}

export type ReasonKind = "feeling" | "person" | "marker" | "word" | "low";

export interface Reason {
  kind: ReasonKind;
  label: string;
  weight: number;
}

export interface Candidate {
  entry: DecryptedEntry;
  day: number;
  /** Days between this log and the start of the feeling. */
  lag: number;
  score: number;
  reasons: Reason[];
}

export interface ScoreContext {
  feelingRe: RegExp | null;
  wordsRe: RegExp | null;
  markerIds: Set<number>;
  personName: (id: number) => string | undefined;
  markerName: (id: number) => string | undefined;
  /** Daily values + baseline, for the "you felt low that day" signal. */
  daily: Map<number, number>;
  base: Baseline | null;
}

/** Weights: own words weigh most, then low-NP people and signal markers, then heavy words. */
export function scoreEntry(entry: DecryptedEntry, folded: string, ctx: ScoreContext): { score: number; reasons: Reason[] } {
  const reasons: Reason[] = [];

  const feel = matchedTerms(folded, ctx.feelingRe).slice(0, 3);
  for (const t of feel) reasons.push({ kind: "feeling", label: `“${t}${t.length > 3 ? "…" : ""}”`, weight: 3 });

  for (const p of entry.people ?? []) {
    const name = ctx.personName(p.person_id);
    if (!name) continue;
    if (p.np === 1) reasons.push({ kind: "person", label: `${name} · low NP`, weight: 3 });
    else if (p.np === 2) reasons.push({ kind: "person", label: name, weight: 1 });
  }

  for (const id of entry.markers ?? []) {
    if (!ctx.markerIds.has(id)) continue;
    const name = ctx.markerName(id);
    if (name) reasons.push({ kind: "marker", label: name, weight: 2 });
  }

  const feelSet = new Set(feel);
  const words = matchedTerms(folded, ctx.wordsRe).filter((w) => !feelSet.has(w));
  if (words.length > 0) {
    reasons.push({ kind: "word", label: words.slice(0, 4).join(", "), weight: Math.min(3, words.length) });
  }

  const day = toDay(entry.entry_date);
  const v = ctx.daily.get(day);
  if (ctx.base && v !== undefined && v <= ctx.base.mean - ctx.base.sd) {
    reasons.push({ kind: "low", label: "you felt low that day", weight: 1 });
  }

  return { score: reasons.reduce((s, r) => s + r.weight, 0), reasons };
}

/** Logs in [from, to) with at least one signal, best first (then newest). */
export function findCandidates(
  entries: DecryptedEntry[],
  folded: Map<number, string>,
  from: number,
  to: number,
  anchor: number,
  ctx: ScoreContext,
): Candidate[] {
  const out: Candidate[] = [];
  for (const entry of entries) {
    const day = toDay(entry.entry_date);
    if (day < from || day >= to) continue;
    const { score, reasons } = scoreEntry(entry, folded.get(entry.id) ?? "", ctx);
    if (score === 0) continue;
    out.push({ entry, day, lag: anchor - day, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score || b.day - a.day || b.entry.id - a.entry.id);
}

// ── Timeline strip ───────────────────────────────────────────────────────────

export interface WeekBar {
  /** Monday of the week (epoch day), inclusive end = start + 6. */
  start: number;
  value: number | null;
  /** Candidates in the week, and how many of them are strong (score ≥ 3). */
  hits: number;
  strong: number;
}

/** Monday on or before `day` (epoch day 0 was a Thursday). */
export function mondayOf(day: number): number {
  return day - ((((day + 3) % 7) + 7) % 7);
}

export function weekBars(daily: Map<number, number>, from: number, to: number, candidates: Candidate[]): WeekBar[] {
  const bars: WeekBar[] = [];
  const index = new Map<number, WeekBar>();
  for (let w = mondayOf(from); w <= to; w += 7) {
    const vs: number[] = [];
    for (let d = w; d < w + 7; d++) {
      const v = daily.get(d);
      if (v !== undefined && d >= from && d <= to) vs.push(v);
    }
    const bar = { start: w, value: mean(vs), hits: 0, strong: 0 };
    bars.push(bar);
    index.set(w, bar);
  }
  for (const c of candidates) {
    const bar = index.get(mondayOf(c.day));
    if (!bar) continue;
    bar.hits++;
    if (c.score >= 3) bar.strong++;
  }
  return bars;
}

// ── Years ago ────────────────────────────────────────────────────────────────

/** The same calendar day `years` earlier (29 Feb → 28 Feb). */
export function yearsBefore(day: number, years: number): number {
  return toDay(format(subYears(dayToDate(day), years), "yyyy-MM-dd"));
}

export function fmtDay(day: number, pattern = "d MMM yyyy"): string {
  return format(dayToDate(day), pattern);
}

/** "3 days" / "5 weeks" / "4 months" / "about a year" before. */
export function fmtLag(days: number): string {
  if (days <= 0) return "same day";
  if (days === 1) return "1 day before";
  if (days < 14) return `${days} days before`;
  if (days < 60) return `${Math.round(days / 7)} weeks before`;
  if (days >= 350 && days <= 380) return "about a year before";
  return `${Math.round(days / 30.4)} months before`;
}
