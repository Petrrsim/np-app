"use client";

import { useCallback, useMemo, useState } from "react";
import { useEntries, useMarkers, usePeople } from "@/hooks/use-entries";
import { useStoredState } from "@/hooks/use-stored-state";
import { NowCard } from "@/components/detective/now-card";
import { FeelingCard } from "@/components/detective/feeling-card";
import { MoodStrip } from "@/components/detective/mood-strip";
import { SourcesCard } from "@/components/detective/sources-card";
import { PeopleCard } from "@/components/detective/people-card";
import { DipsCard } from "@/components/detective/dips-card";
import { YearAgoCard } from "@/components/detective/year-ago-card";
import { cn } from "@/lib/utils";
import { foldText, termsRegex } from "@/lib/search";
import { buildPoints, chronological, toDay, todayDay } from "@/lib/stats";
import {
  BASELINE_DAYS,
  DEFAULT_WORDS,
  LOOKBACKS,
  baselineOf,
  buildSeries,
  dailyValues,
  defaultMarkerIds,
  feelingTerms,
  findCandidates,
  findDips,
  weekBars,
  type LookbackKey,
  type ScoreContext,
  type SignalMetric,
} from "@/lib/detective";

export default function DetectivePage() {
  const { data: entries, isLoading, isError, error } = useEntries();
  const { data: people } = usePeople();
  const { data: markers } = useMarkers();

  const [lookback, setLookback] = useStoredState<LookbackKey>("np.detective.lookback", "1y");
  const [metric, setMetric] = useStoredState<SignalMetric>("np.detective.metric", "all");
  const [feeling, setFeeling] = useStoredState("np.detective.feeling", "");
  const [words, setWords] = useStoredState<string[]>("np.detective.words", DEFAULT_WORDS);
  // null = the default ("negative…" markers), so new users get a sensible pick.
  const [pickedMarkers, setPickedMarkers] = useStoredState<number[] | null>("np.detective.markers", null);
  const [week, setWeek] = useState<number | null>(null);

  const today = todayDay();
  const lb = LOOKBACKS.find((l) => l.key === lookback) ?? LOOKBACKS[3];

  const sorted = useMemo(() => chronological(entries ?? []), [entries]);
  const points = useMemo(() => buildPoints(sorted), [sorted]);
  const daily = useMemo(() => dailyValues(points, metric), [points, metric]);

  // Usual level = the last 12 months; dips are found on the same stretch.
  const base = useMemo(() => baselineOf(daily, today - BASELINE_DAYS + 1, today), [daily, today]);
  const series = useMemo(() => buildSeries(daily, today - BASELINE_DAYS + 1, today), [daily, today]);
  const dips = useMemo(() => (base ? findDips(series, base) : []), [series, base]);
  const ongoing = dips.find((d) => d.ongoing) ?? null;
  const current = series.smooth[series.smooth.length - 1] ?? null;

  // Everything looks back from today: logs in [today − window, today) are searched.
  const from = today - lb.days;

  const markerIds = useMemo(
    () => pickedMarkers ?? defaultMarkerIds(markers ?? []),
    [pickedMarkers, markers]
  );
  const feelTerms = useMemo(() => feelingTerms(feeling), [feeling]);
  // One stable array for EntryCard highlighting (memoized cards).
  const highlight = useMemo(() => [...feelTerms, ...words], [feelTerms, words]);

  // Notes folded once per window (not per keystroke in the feeling box).
  const windowEntries = useMemo(
    () => sorted.filter((e) => {
      const d = toDay(e.entry_date);
      return d >= Math.min(from, week ?? from) && d <= today;
    }),
    [sorted, from, week, today]
  );
  const folded = useMemo(
    () => new Map(windowEntries.map((e) => [e.id, foldText(e.comment ?? "")])),
    [windowEntries]
  );

  const personName = useCallback((id: number) => people?.find((p) => p.id === id)?.name, [people]);
  const markerName = useCallback((id: number) => markers?.find((m) => m.id === id)?.name, [markers]);

  const ctx: ScoreContext = useMemo(
    () => ({
      feelingRe: termsRegex(feelTerms),
      wordsRe: termsRegex(words),
      markerIds: new Set(markerIds),
      personName,
      markerName,
      daily,
      base,
    }),
    [feelTerms, words, markerIds, personName, markerName, daily, base]
  );

  const candidates = useMemo(
    () => findCandidates(windowEntries, folded, from, today, today, ctx),
    [windowEntries, folded, from, today, ctx]
  );
  const bars = useMemo(() => weekBars(daily, from, today, candidates), [daily, from, today, candidates]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Detective</h1>
          <p className="text-sm text-muted-foreground">Describe how you feel and find past logs that match.</p>
        </div>
        <div role="radiogroup" aria-label="Look back" className="flex items-center gap-0.5 rounded-xl bg-muted p-1">
          {LOOKBACKS.map((x) => (
            <button
              key={x.key}
              type="button"
              role="radio"
              aria-checked={lookback === x.key}
              onClick={() => {
                setLookback(x.key);
                setWeek(null);
              }}
              className={cn(
                "rounded-lg px-3 py-1 text-sm font-medium transition-all",
                lookback === x.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load entries"}
        </p>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <div className="h-56 animate-pulse rounded-2xl bg-muted" />
          <div className="h-32 animate-pulse rounded-2xl bg-muted" />
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        </div>
      ) : (
        !isError && (
          <div className="flex flex-col gap-3">
            <NowCard
              points={points}
              today={today}
              base={base}
              current={current}
              ongoing={ongoing}
              metric={metric}
              onMetricChange={(m) => {
                setMetric(m);
                setWeek(null);
              }}
            />

            <YearAgoCard sorted={sorted} today={today} highlight={highlight} />

            <FeelingCard
              feeling={feeling}
              onFeelingChange={setFeeling}
              terms={feelTerms}
              words={words}
              onWordsChange={setWords}
              markers={markers ?? []}
              markerIds={markerIds}
              onMarkerIdsChange={setPickedMarkers}
              windowEntries={windowEntries}
            />

            <MoodStrip
              bars={bars}
              base={base}
              from={from}
              today={today}
              dips={dips}
              week={week}
              onWeekChange={setWeek}
            />

            <SourcesCard
              key={`${week}|${lookback}`}
              candidates={candidates}
              week={week}
              onClearWeek={() => setWeek(null)}
              weekEntries={windowEntries}
              folded={folded}
              ctx={ctx}
              anchor={today}
              lookbackLabel={lb.long}
              highlight={highlight}
            />

            <PeopleCard entries={windowEntries} from={from} anchor={today} people={people ?? []} />

            <DipsCard dips={dips} base={base} />
          </div>
        )
      )}
    </main>
  );
}
