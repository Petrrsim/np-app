"use client";

import { useMemo, useState } from "react";
import type { DecryptedEntry } from "@/types/db";
import { EntryCard } from "@/components/entry-card";
import { InsightCard } from "@/components/dashboard/insights";
import { Delta } from "@/components/dashboard/stat-tiles";
import { cn } from "@/lib/utils";
import { fmt1, mean, toDay } from "@/lib/stats";
import { BASELINE_DAYS, baselineOf, fmtDay, yearsBefore } from "@/lib/detective";

const AROUND = 3; // days either side of the anniversary
const YEARS = [1, 2, 3, 4];

/**
 * The logs around the same calendar day 1–4 years earlier — counted from today or from the
 * start of the feeling — with how that week compared to the usual level back then.
 */
export function YearAgoCard({
  sorted,
  daily,
  today,
  anchor,
  highlight,
}: {
  sorted: DecryptedEntry[];
  daily: Map<number, number>;
  today: number;
  anchor: number;
  highlight: string[];
}) {
  const [years, setYears] = useState(1);
  const [fromStart, setFromStart] = useState(false);
  const base = fromStart && anchor !== today ? anchor : today;

  const byYear = useMemo(
    () =>
      YEARS.map((y) => {
        const target = yearsBefore(base, y);
        const logs = sorted.filter((e) => Math.abs(toDay(e.entry_date) - target) <= AROUND);
        return { years: y, target, logs };
      }),
    [sorted, base]
  );
  const available = byYear.filter((y) => y.logs.length > 0);
  const pick = byYear.find((y) => y.years === years && y.logs.length > 0) ?? available[0];

  const summary = useMemo(() => {
    if (!pick) return null;
    const vs: number[] = [];
    for (let d = pick.target - AROUND; d <= pick.target + AROUND; d++) {
      const v = daily.get(d);
      if (v !== undefined) vs.push(v);
    }
    const then = mean(vs);
    const usual = baselineOf(daily, pick.target - BASELINE_DAYS + 1, pick.target);
    return { then, usual: usual?.mean ?? null };
  }, [pick, daily]);

  if (available.length === 0) return null;

  return (
    <InsightCard
      title={pick ? `Around ${fmtDay(pick.target, "d MMM yyyy")}` : "Years ago"}
      description={`The same days ${pick?.years === 1 ? "a year" : `${pick?.years} years`} before ${
        base === today ? "today" : `the start (${fmtDay(base, "d MMM")})`
      }, ±${AROUND} days`}
      action={
        anchor !== today && (
          <div role="radiogroup" aria-label="Count from" className="flex shrink-0 gap-0.5 rounded-lg bg-muted p-0.5">
            {(
              [
                [false, "Today"],
                [true, "Start"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={fromStart === v}
                onClick={() => setFromStart(v)}
                className={cn(
                  "rounded-md px-2 py-0.5 text-[11px] font-medium transition-all",
                  fromStart === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Years back" className="flex gap-0.5 rounded-lg bg-muted p-0.5">
          {byYear.map((y) => (
            <button
              key={y.years}
              type="button"
              role="tab"
              aria-selected={pick?.years === y.years}
              disabled={y.logs.length === 0}
              onClick={() => setYears(y.years)}
              className={cn(
                "rounded-md px-2.5 py-0.5 text-xs font-medium transition-all disabled:opacity-40",
                pick?.years === y.years ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {y.years}y
            </button>
          ))}
        </div>
        {summary?.then != null && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            avg {fmt1(summary.then)}
            {summary.usual !== null && (
              <Delta value={summary.then - summary.usual} label={`vs usual ${fmt1(summary.usual)} back then`} />
            )}
          </span>
        )}
      </div>

      {pick && (
        <div className="flex flex-col gap-3">
          {pick.logs.map((e) => (
            <EntryCard key={e.id} entry={e} highlight={highlight} />
          ))}
        </div>
      )}
    </InsightCard>
  );
}
