"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { DecryptedEntry } from "@/types/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EntryCard } from "@/components/entry-card";
import { useStoredState } from "@/hooks/use-stored-state";
import { cn } from "@/lib/utils";
import { mean, todayDay, toDay, type ChartPoint } from "@/lib/stats";
import { SIGNAL_METRICS, dailyValues, fmtDay, type SignalMetric } from "@/lib/detective";

/**
 * Diverging scale around the shown year's own average: 3 steps below (red), a neutral middle,
 * 3 steps above (blue). Bins are in standard deviations of that year's daily values. Hex
 * fallbacks for the same reason as `METRICS` (stale dev CSS cache).
 */
const LEVELS = [
  "var(--heat-lo-3, #b8322b)",
  "var(--heat-lo-2, #e2786c)",
  "var(--heat-lo-1, #f4c6bf)",
  "var(--heat-mid, #e6e4de)",
  "var(--heat-hi-1, #c4d9f3)",
  "var(--heat-hi-2, #6fa3e3)",
  "var(--heat-hi-3, #2264be)",
];
const LEVEL_NAMES = ["Far below", "Below", "A bit below", "About average", "A bit above", "Above", "Far above"];
/** Upper z-edges of the bins (the last bin is open-ended). */
const EDGES = [-1.5, -0.75, -0.25, 0.25, 0.75, 1.5];

function level(z: number): number {
  const i = EDGES.findIndex((e) => z < e);
  return i < 0 ? EDGES.length : i;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Mon-first weekday index of an epoch day (1970-01-01 was a Thursday). */
const weekday = (day: number) => (((day + 3) % 7) + 7) % 7;
const yearOf = (day: number) => new Date(day * 86_400_000).getUTCFullYear();

function monthDays(year: number, month: number): { first: number; count: number } {
  return {
    first: Math.round(Date.UTC(year, month, 1) / 86_400_000),
    count: new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
  };
}

export function YearHeatmap({ points, entries }: { points: ChartPoint[]; entries: DecryptedEntry[] }) {
  const today = todayDay();
  const thisYear = yearOf(today);
  const firstYear = points.length ? yearOf(points[0].day) : thisYear;
  const [year, setYear] = useState(thisYear);
  const [metric, setMetric] = useStoredState<SignalMetric>("np.heatmap.metric", "mood");
  const [selected, setSelected] = useState<number | null>(null);
  const [focusDay, setFocusDay] = useState<number | null>(null);

  const daily = useMemo(() => dailyValues(points, metric), [points, metric]);
  const logCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of points) m.set(p.day, (m.get(p.day) ?? 0) + 1);
    return m;
  }, [points]);

  // The year's own average + spread, so each year reads against itself.
  const stats = useMemo(() => {
    const vals: number[] = [];
    for (const [d, v] of daily) if (yearOf(d) === year) vals.push(v);
    const avg = mean(vals);
    if (avg === null) return null;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length);
    return { avg, sd, days: vals.length };
  }, [daily, year]);

  const cellLevel = (v: number) => (stats && stats.sd > 0.01 ? level((v - stats.avg) / stats.sd) : 3);
  const metricLabel = SIGNAL_METRICS.find((m) => m.key === metric)!.label;
  const valueLabel = metric === "all" ? "Avg" : metricLabel;

  const changeYear = (y: number) => {
    setYear(y);
    setSelected(null);
    setFocusDay(null);
  };

  // Roving focus: one tab stop for the whole grid, arrows move by day / week.
  const yearStart = toDay(`${year}-01-01`);
  const yearEnd = Math.min(toDay(`${year}-12-31`), today);
  const tabDay = focusDay ?? selected ?? (year === thisYear ? today : yearStart);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = Math.min(yearEnd, Math.max(yearStart, tabDay + step));
    setFocusDay(next);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus();
  };

  const selectedEntries = useMemo(() => {
    if (selected === null) return [];
    return entries.filter((e) => toDay(e.entry_date) === selected);
  }, [entries, selected]);
  const selectedValue = selected === null ? undefined : daily.get(selected);

  return (
    <div className="flex flex-col gap-3">
      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Year in {metric === "all" ? "review" : metricLabel.toLowerCase()}</h2>
            <p className="text-xs text-muted-foreground">
              {stats
                ? `${stats.days} days logged · average ${stats.avg.toFixed(1)}`
                : "No logs with metrics this year"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div role="radiogroup" aria-label="Metric" className="flex gap-0.5 rounded-lg bg-muted p-0.5">
              {SIGNAL_METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={metric === m.key}
                  onClick={() => setMetric(m.key)}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-medium transition-all",
                    metric === m.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Previous year"
                disabled={year <= firstYear}
                onClick={() => changeYear(year - 1)}
              >
                <ChevronLeft />
              </Button>
              <span className="w-10 text-center text-sm font-semibold tabular-nums">{year}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Next year"
                disabled={year >= thisYear}
                onClick={() => changeYear(year + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>

        <div
          role="group"
          aria-label={`${year} calendar, one cell per day`}
          onKeyDown={onKeyDown}
          className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 sm:gap-x-5"
        >
          {MONTHS.map((name, month) => {
            const { first, count } = monthDays(year, month);
            if (first > today) {
              return (
                <div key={name} className="opacity-40">
                  <div className="mb-1 text-[11px] font-medium text-muted-foreground">{name}</div>
                </div>
              );
            }
            return (
              <div key={name}>
                <div className="mb-1 text-[11px] font-medium text-muted-foreground">{name}</div>
                <div className="grid grid-cols-7 gap-[2px]">
                  {Array.from({ length: weekday(first) }, (_, i) => (
                    <span key={`pad${i}`} />
                  ))}
                  {Array.from({ length: count }, (_, i) => {
                    const day = first + i;
                    if (day > today) return <span key={day} className="aspect-square" />;
                    const v = daily.get(day);
                    const logs = logCounts.get(day) ?? 0;
                    const label =
                      v === undefined
                        ? `${fmtDay(day, "EEE d MMM")} · no data`
                        : `${fmtDay(day, "EEE d MMM")} · ${valueLabel} ${v.toFixed(1)} · ${logs} log${logs === 1 ? "" : "s"}`;
                    return (
                      <button
                        key={day}
                        type="button"
                        data-day={day}
                        tabIndex={day === tabDay ? 0 : -1}
                        title={label}
                        aria-label={label}
                        aria-pressed={selected === day}
                        onFocus={() => setFocusDay(day)}
                        onClick={() => setSelected(selected === day ? null : day)}
                        className={cn(
                          "aspect-square rounded-[3px] outline-none transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-ring",
                          v === undefined && "border border-border bg-transparent",
                          selected === day && "ring-2 ring-foreground ring-offset-1 ring-offset-card",
                          day === today && selected !== day && "ring-1 ring-foreground/50"
                        )}
                        style={v === undefined ? undefined : { background: LEVELS[cellLevel(v)] }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span>Lower</span>
            <div className="flex gap-[2px]" aria-hidden>
              {LEVELS.map((c, i) => (
                <span key={i} title={LEVEL_NAMES[i]} className="size-3 rounded-[3px]" style={{ background: c }} />
              ))}
            </div>
            <span>Higher</span>
            <span className="ml-1">than your {year} average</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded-[3px] border border-border" aria-hidden />
            <span>No data</span>
          </div>
        </div>
      </Card>

      {selected !== null && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-xs font-medium text-muted-foreground">
              {fmtDay(selected, "EEEE d MMMM yyyy")}
              {selectedValue !== undefined && stats && (
                <>
                  {" · "}
                  {valueLabel} {selectedValue.toFixed(1)} ({LEVEL_NAMES[cellLevel(selectedValue)].toLowerCase()})
                </>
              )}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Close day"
              onClick={() => setSelected(null)}
            >
              <X />
            </Button>
          </div>
          {selectedEntries.length ? (
            selectedEntries.map((e) => <EntryCard key={e.id} entry={e} />)
          ) : (
            <p className="rounded-2xl border border-dashed border-input bg-card/50 p-4 text-center text-sm text-muted-foreground">
              Nothing logged that day.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
