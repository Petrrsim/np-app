"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MousePointerClick, X } from "lucide-react";
import type { DecryptedEntry } from "@/types/db";
import { useEntries, useMarkers, usePeople } from "@/hooks/use-entries";
import { EntryCard } from "@/components/entry-card";
import { TrendCard } from "@/components/dashboard/trend-card";
import { MetricTile } from "@/components/dashboard/stat-tiles";
import { Insights } from "@/components/dashboard/insights";
import { YearHeatmap } from "@/components/dashboard/year-heatmap";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  METRICS,
  RANGES,
  buildPoints,
  chronological,
  movingAverage,
  rangeStart,
  sparkline,
  summarize,
  toDay,
  todayDay,
  type MetricKey,
  type RangeKey,
} from "@/lib/stats";

export default function DashboardPage() {
  const { data: entries, isLoading, isError, error } = useEntries();
  const { data: people } = usePeople();
  const { data: markers } = useMarkers();
  const [range, setRange] = useState<RangeKey>("7d");
  const [trendDays, setTrendDays] = useState(7);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const today = todayDay();
  const sorted = useMemo(() => chronological(entries ?? []), [entries]);
  const allPoints = useMemo(() => buildPoints(sorted), [sorted]);
  // Trailing averages over the whole history, so the first days of a range still have context.
  const allTrends = useMemo(() => {
    const out = {} as Record<MetricKey, (number | null)[]>;
    for (const { key } of METRICS) out[key] = movingAverage(allPoints, key, trendDays);
    return out;
  }, [allPoints, trendDays]);

  const r = RANGES.find((x) => x.key === range)!;
  const firstDay = sorted.length ? toDay(sorted[0].entry_date) : today;
  const start = rangeStart(range, today) ?? firstDay;

  const view = useMemo(() => {
    const inRange = (e: DecryptedEntry) => toDay(e.entry_date) >= start;
    const rangeEntries = sorted.filter(inRange);
    const from = allPoints.findIndex((p) => p.day >= start);
    const cut = from < 0 ? allPoints.length : from;
    const points = allPoints.slice(cut);
    const trends = {} as Record<MetricKey, (number | null)[]>;
    for (const { key } of METRICS) trends[key] = allTrends[key].slice(cut);

    // Previous period of the same length, for deltas (not for "All").
    const prevStart = r.days === null ? null : start - r.days;
    const prevPoints = prevStart === null ? [] : allPoints.filter((p) => p.day >= prevStart && p.day < start);

    const metrics = METRICS.map((m) => {
      const cur = summarize(points, m.key);
      const prev = summarize(prevPoints, m.key);
      return {
        ...m,
        avg: cur.avg,
        delta: cur.avg !== null && prev.avg !== null && prev.n >= 3 ? cur.avg - prev.avg : null,
        spark: sparkline(points, m.key, start, today, Math.min(14, today - start + 1)),
      };
    });

    return {
      rangeEntries,
      points,
      trends,
      metrics,
    };
  }, [sorted, allPoints, allTrends, start, today, r.days]);

  const selIdx = selectedId === null ? -1 : view.points.findIndex((p) => p.entry.id === selectedId);
  const selected = selIdx >= 0 ? view.points[selIdx].entry : null;
  const deltaLabel = r.days === null ? "" : `vs ${r.prevLabel}`;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Loading your history…"
              : `${view.rangeEntries.length.toLocaleString()} logs · ${
                  r.days === null ? "all time" : `last ${r.label === "1Y" ? "12 months" : `${r.days} days`}`
                }`}
          </p>
        </div>
        <div role="radiogroup" aria-label="Date range" className="flex items-center gap-0.5 rounded-xl bg-muted p-1">
          {RANGES.map((x) => (
            <button
              key={x.key}
              type="button"
              role="radio"
              aria-checked={range === x.key}
              onClick={() => {
                setRange(x.key);
                setSelectedId(null);
              }}
              className={cn(
                "rounded-lg px-3 py-1 text-sm font-medium transition-all",
                range === x.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
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
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
          <div className="h-[26rem] animate-pulse rounded-2xl bg-muted" />
        </div>
      ) : (
        !isError && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {view.metrics.map((m) => (
                <MetricTile
                  key={m.key}
                  label={m.label}
                  color={m.color}
                  avg={m.avg}
                  delta={m.delta}
                  deltaLabel={deltaLabel}
                  spark={m.spark}
                />
              ))}
            </div>

            <TrendCard
              points={view.points}
              trends={view.trends}
              trendDays={trendDays}
              onTrendDaysChange={setTrendDays}
              selectedId={selectedId}
              onSelect={setSelectedId}
              resetKey={range}
            />

            {selected ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Log {selIdx + 1} of {view.points.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Previous log"
                      disabled={selIdx <= 0}
                      onClick={() => setSelectedId(view.points[selIdx - 1].entry.id)}
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Next log"
                      disabled={selIdx >= view.points.length - 1}
                      onClick={() => setSelectedId(view.points[selIdx + 1].entry.id)}
                    >
                      <ChevronRight />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Close details"
                      onClick={() => setSelectedId(null)}
                    >
                      <X />
                    </Button>
                  </div>
                </div>
                <EntryCard entry={selected} />
              </div>
            ) : (
              view.points.length > 0 && (
                <p className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-input bg-card/50 p-4 text-sm text-muted-foreground">
                  <MousePointerClick className="size-4" />
                  Tap any point on the chart to see that log here.
                </p>
              )
            )}

            <h2 className="mt-4 px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Insights
            </h2>
            <Insights entries={view.rangeEntries} points={view.points} people={people} markers={markers} />

            {/* Ignores the range picker (own year stepper), so it sits apart at the bottom. */}
            <div className="mt-4">
              <YearHeatmap points={allPoints} entries={sorted} />
            </div>
          </div>
        )
      )}
    </main>
  );
}
