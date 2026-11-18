"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/date-picker";
import { MetricTile } from "@/components/dashboard/stat-tiles";
import { cn } from "@/lib/utils";
import { METRICS, dayToDate, fmt1, sparkline, summarize, toDay, type ChartPoint } from "@/lib/stats";
import { SIGNAL_METRICS, fmtDay, type Baseline, type Dip, type SignalMetric } from "@/lib/detective";

/**
 * "Right now": last 7 days vs. the 12-month average per slider, whether a dip is running and
 * since when, and the start date everything below looks back from (detected or picked).
 */
export function NowCard({
  points,
  today,
  base,
  current,
  ongoing,
  anchor,
  overridden,
  onPickStart,
  metric,
  onMetricChange,
}: {
  points: ChartPoint[];
  today: number;
  base: Baseline | null;
  current: number | null;
  ongoing: Dip | null;
  anchor: number;
  overridden: boolean;
  onPickStart: (day: number | null) => void;
  metric: SignalMetric;
  onMetricChange: (m: SignalMetric) => void;
}) {
  const tiles = useMemo(() => {
    const week = points.filter((p) => p.day > today - 7);
    const year = points.filter((p) => p.day > today - 365);
    return METRICS.map((m) => {
      const now = summarize(week, m.key).avg;
      const usual = summarize(year, m.key);
      return {
        ...m,
        avg: now,
        delta: now !== null && usual.avg !== null && usual.n >= 14 ? now - usual.avg : null,
        spark: sparkline(points, m.key, today - 29, today, 15),
      };
    });
  }, [points, today]);

  const metricLabel = metric === "all" ? "Your metrics" : SIGNAL_METRICS.find((m) => m.key === metric)!.label;

  let headline: string;
  let detail: string;
  if (!base) {
    headline = "Not enough logs yet";
    detail = "The Detective needs a few weeks of logs in the last year to know your usual level.";
  } else if (ongoing) {
    headline = `Below your usual since ${fmtDay(ongoing.start, "EEE d MMM")}`;
    detail = `${metricLabel} ${metric === "all" ? "have" : "has"} been under your 12-month average of ${fmt1(
      base.mean
    )} for ${ongoing.days} days, lowest ${fmt1(ongoing.low)}.`;
  } else if (current !== null && current < base.mean) {
    headline = "A little under your usual";
    detail = `No clear dip right now (7-day ${fmt1(current)} vs. usual ${fmt1(base.mean)}). Pick the day the feeling started to look back from it.`;
  } else {
    headline = "Around or above your usual";
    detail = "No dip to trace right now. You can still pick a day to look back from, or investigate an earlier dip below.";
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Right now</span>
          <h2 className={cn("text-lg font-semibold tracking-tight", ongoing && "text-feel-rough")}>{headline}</h2>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
        <div role="tablist" aria-label="Detect dips on" className="flex shrink-0 gap-0.5 rounded-lg bg-muted p-0.5">
          {SIGNAL_METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={metric === m.key}
              onClick={() => onMetricChange(m.key)}
              className={cn(
                "rounded-md px-2 py-0.5 text-[11px] font-medium transition-all",
                metric === m.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <MetricTile
            key={t.key}
            label={t.label}
            color={t.color}
            avg={t.avg}
            delta={t.delta}
            deltaLabel="vs 12-month avg"
            spark={t.spark}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
        <span className="text-sm">
          Looking back from <span className="font-medium">{format(dayToDate(anchor), "EEE, d MMM yyyy")}</span>
          <span className="text-muted-foreground">
            {overridden ? " · picked by you" : ongoing ? " · start of the dip" : " · today"}
          </span>
        </span>
        <div className="ml-auto flex items-center gap-1">
          {overridden && (
            <Button variant="ghost" size="sm" onClick={() => onPickStart(null)}>
              <RotateCcw className="size-4" /> Auto
            </Button>
          )}
          <DatePicker
            selected={dayToDate(anchor)}
            onSelect={(d) => d && onPickStart(Math.min(today, toDay(format(d, "yyyy-MM-dd"))))}
          />
        </div>
      </div>
    </Card>
  );
}
