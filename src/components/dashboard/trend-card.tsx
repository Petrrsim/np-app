"use client";

import { useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { cn } from "@/lib/utils";
import { METRICS, type ChartPoint, type MetricKey } from "@/lib/stats";

/** px per log at each zoom level (the chart widens them when the logs don't fill the view). */
const ZOOMS = [5, 9, 16, 26, 40];
export const TREND_WINDOWS = [7, 30, 90];

const CHIP =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-200 active:scale-[0.97]";
const CHIP_ON = "border-foreground/15 bg-card text-foreground shadow-sm";
const CHIP_OFF = "border-border bg-transparent text-muted-foreground hover:bg-accent";

function Toggle({
  on,
  onClick,
  children,
  label,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} onClick={onClick} className={cn(CHIP, on ? CHIP_ON : CHIP_OFF)}>
      {children}
    </button>
  );
}

function LineKey({ color, on, thick }: { color: string; on: boolean; thick?: boolean }) {
  return (
    <span
      className={cn("w-3.5 rounded-full transition-opacity", thick ? "h-[3px]" : "h-0.5")}
      style={{ background: color, opacity: on ? 1 : 0.35 }}
    />
  );
}

export function TrendCard({
  points,
  trends,
  trendDays,
  onTrendDaysChange,
  selectedId,
  onSelect,
  resetKey,
}: {
  points: ChartPoint[];
  trends: Record<MetricKey, (number | null)[]>;
  trendDays: number;
  onTrendDaysChange: (days: number) => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  resetKey: string;
}) {
  const [visible, setVisible] = useState<Record<MetricKey, boolean>>({ mood: true, energy: true, flow: true });
  const [trend, setTrend] = useState<Record<MetricKey, boolean>>({ mood: false, energy: false, flow: false });
  const [showSuccess, setShowSuccess] = useState(true);
  const [zoom, setZoom] = useState(2);
  const anyTrend = METRICS.some((m) => trend[m.key]);

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-semibold">Mood, energy &amp; flow</h2>
          <p className="text-xs text-muted-foreground">
            Scroll sideways through your logs · tap a point for details
          </p>
        </div>
        <div className="flex shrink-0 items-center rounded-lg border border-border bg-card p-0.5 shadow-xs">
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoom === 0}
            onClick={() => setZoom((z) => Math.max(0, z - 1))}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
          >
            <ZoomOut className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoom === ZOOMS.length - 1}
            onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
          >
            <ZoomIn className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Lines</span>
          {METRICS.map((m) => (
            <Toggle
              key={m.key}
              on={visible[m.key]}
              onClick={() => setVisible((v) => ({ ...v, [m.key]: !v[m.key] }))}
            >
              <LineKey color={m.color} on={visible[m.key]} />
              {m.label}
            </Toggle>
          ))}
          <Toggle on={showSuccess} onClick={() => setShowSuccess((s) => !s)}>
            <span className={cn("flex items-center gap-0.5 transition-opacity", !showSuccess && "opacity-40")} aria-hidden>
              <svg width="8" height="8" viewBox="-4 -4 8 8">
                <path d="M0,-3.6L3.6,2.9L-3.6,2.9Z" fill="var(--success)" />
              </svg>
              <svg width="8" height="8" viewBox="-4 -4 8 8">
                <path d="M0,3.6L3.6,-2.9L-3.6,-2.9Z" fill="var(--destructive)" />
              </svg>
            </span>
            Success
          </Toggle>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Trend</span>
          {METRICS.map((m) => (
            <Toggle
              key={m.key}
              on={trend[m.key]}
              label={`${m.label} moving average`}
              onClick={() => setTrend((t) => ({ ...t, [m.key]: !t[m.key] }))}
            >
              <LineKey color={m.color} on={trend[m.key]} thick />
              {m.label}
            </Toggle>
          ))}
          <div
            role="radiogroup"
            aria-label="Moving average window"
            className={cn(
              "flex items-center gap-0.5 rounded-full bg-muted p-0.5 transition-opacity",
              !anyTrend && "opacity-50"
            )}
          >
            {TREND_WINDOWS.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={trendDays === d}
                onClick={() => {
                  onTrendDaysChange(d);
                  if (!anyTrend) setTrend({ mood: true, energy: true, flow: true });
                }}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums transition-all",
                  trendDays === d ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      <TrendChart
        points={points}
        trends={trends}
        visible={visible}
        trend={trend}
        trendDays={trendDays}
        showSuccess={showSuccess}
        zoom={ZOOMS[zoom]}
        selectedId={selectedId}
        onSelect={onSelect}
        resetKey={resetKey}
      />
    </Card>
  );
}
