"use client";

import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dayToDate, fmt1, fmtSigned } from "@/lib/stats";
import { fmtDay, yearsBefore, type Baseline, type Dip, type WeekBar } from "@/lib/detective";

const HALF = 34; // px above / below the baseline line

/**
 * One bar per week from the start of the look-back window to today: the weekly average as a
 * deviation from the usual level, dips shaded, the start of the feeling as a line and a dot
 * under weeks that hold signals. Tapping a week lists all its logs below.
 */
export function MoodStrip({
  bars,
  base,
  from,
  today,
  anchor,
  dips,
  week,
  onWeekChange,
}: {
  bars: WeekBar[];
  base: Baseline | null;
  from: number;
  today: number;
  anchor: number;
  dips: Dip[];
  week: number | null;
  onWeekChange: (w: number | null) => void;
}) {
  if (bars.length === 0) return null;
  const first = bars[0].start;
  const span = bars.length * 7;
  const pct = (day: number) => `${Math.min(100, Math.max(0, ((day - first) / span) * 100))}%`;

  const devs = bars.map((b) => (b.value !== null && base ? b.value - base.mean : null));
  const maxAbs = Math.max(1, ...devs.map((d) => Math.abs(d ?? 0)));

  // Month ticks: the week holding the 1st of each month (skipping cramped ones).
  const months: { day: number; label: string }[] = [];
  for (const b of bars) {
    for (let d = b.start; d < b.start + 7; d++) {
      const date = dayToDate(d);
      if (date.getDate() === 1) {
        const label = date.getMonth() === 0 ? String(date.getFullYear()) : fmtDay(d, "MMM");
        months.push({ day: d, label });
      }
    }
  }
  const step = Math.ceil(months.length / 7);
  const yearAgo = yearsBefore(today, 1);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold">Week by week</h3>
          <p className="text-xs text-muted-foreground">
            {base ? `Weekly average vs. your usual ${fmt1(base.mean)} · tap a week to see its logs` : "Tap a week to see its logs"}
          </p>
        </div>
        {week !== null && (
          <Button variant="ghost" size="sm" onClick={() => onWeekChange(null)}>
            <X className="size-4" /> Week of {fmtDay(week, "d MMM")}
          </Button>
        )}
      </div>

      <div className="relative">
        {/* Dips (shaded) and the start of the feeling. */}
        {dips
          .filter((d) => d.end >= first)
          .map((d) => (
            <div
              key={d.start}
              className="pointer-events-none absolute top-0 rounded-sm bg-feel-rough/[0.07]"
              style={{ left: pct(d.start), width: `calc(${pct(d.end + 1)} - ${pct(d.start)})`, height: HALF * 2 }}
            />
          ))}
        <div className="pointer-events-none absolute inset-x-0 border-t border-input" style={{ top: HALF }} />
        {anchor >= first && (
          <div
            className="pointer-events-none absolute top-[-4px] z-10 border-l-2 border-dashed border-foreground/70"
            style={{ left: pct(anchor), height: HALF * 2 + 8 }}
            title={`Feeling started ${fmtDay(anchor)}`}
          />
        )}
        {yearAgo >= first && (
          <div
            className="pointer-events-none absolute top-0 border-l border-foreground/25"
            style={{ left: pct(yearAgo), height: HALF * 2 }}
          />
        )}

        <div className="relative flex gap-px">
          {bars.map((b, i) => {
            const dev = devs[i];
            const h = dev === null ? 0 : Math.max(2, (Math.abs(dev) / maxAbs) * HALF);
            const up = (dev ?? 0) >= 0;
            const selected = week === b.start;
            const inWindow = b.start + 6 >= from && b.start < anchor;
            const label = `Week of ${fmtDay(b.start)}: ${
              b.value === null ? "no logs" : `${fmt1(b.value)}${dev !== null ? ` (${fmtSigned(dev)})` : ""}`
            }${b.hits ? ` · ${b.hits} with signals` : ""}`;
            return (
              <button
                key={b.start}
                type="button"
                aria-label={label}
                aria-pressed={selected}
                title={label}
                onClick={() => onWeekChange(selected ? null : b.start)}
                className={cn(
                  "relative min-w-0 flex-1 rounded-[3px] transition-colors hover:bg-muted",
                  selected && "bg-muted ring-1 ring-foreground/30"
                )}
                style={{ height: HALF * 2 + 14 }}
              >
                {dev !== null && (
                  <span
                    className={cn("absolute inset-x-[15%]", up ? "rounded-t-[2px]" : "rounded-b-[2px]")}
                    style={{
                      height: h,
                      top: up ? HALF - h : HALF,
                      background: up ? "var(--chart-mood, #2a78d6)" : "var(--feel-rough, #e11d48)",
                      opacity: up ? 0.45 : 0.8,
                    }}
                  />
                )}
                {b.hits > 0 && inWindow && (
                  <span
                    className={cn(
                      "absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full",
                      b.strong > 0 ? "bg-foreground" : "bg-foreground/30"
                    )}
                    style={{ top: HALF * 2 + 5 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="relative mt-1 h-4 text-[10px] text-muted-foreground">
          {months
            .filter((_, i) => i % step === 0)
            .map((m) => (
              <span key={m.day} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(m.day) }}>
                {m.label}
              </span>
            ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 border-l-2 border-dashed border-foreground/70" /> start of the feeling
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-foreground" /> strong signals
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-sm bg-feel-rough/15" /> dip
        </span>
        {yearAgo >= first && (
          <span className="flex items-center gap-1.5">
            <span className="h-3 border-l border-foreground/40" /> a year ago today
          </span>
        )}
      </div>
    </Card>
  );
}
