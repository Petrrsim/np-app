"use client";

import { InsightCard } from "@/components/dashboard/insights";
import { fmt1, fmtSigned } from "@/lib/stats";
import { fmtDay, type Baseline, type Dip } from "@/lib/detective";

/** Dips of the last 12 months (for context). */
export function DipsCard({
  dips,
  base,
}: {
  dips: Dip[];
  base: Baseline | null;
}) {
  if (!base) return null;
  const rows = [...dips].reverse();

  return (
    <InsightCard
      title="Dips this year"
      description={
        rows.length
          ? "Stretches clearly under your usual level."
          : "No clear dips in the last 12 months."
      }
    >
      {rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((d) => {
            const sameYear = fmtDay(d.start, "yyyy") === fmtDay(d.end, "yyyy");
            return (
              <li key={d.start} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">
                    {fmtDay(d.start, sameYear ? "d MMM" : "d MMM yyyy")} – {d.ongoing ? "now" : fmtDay(d.end)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {d.days} days · lowest {fmt1(d.low)}{" "}
                    <span className="text-feel-rough">({fmtSigned(-d.depth)})</span>
                  </span>
                </div>
                {/* Depth meter */}
                <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-feel-rough/70"
                    style={{ width: `${Math.min(100, (d.depth / (base.sd * 3)) * 100)}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </InsightCard>
  );
}
