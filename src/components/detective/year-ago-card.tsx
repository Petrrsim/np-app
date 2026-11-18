"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DecryptedEntry } from "@/types/db";
import { EntryCard } from "@/components/entry-card";
import { InsightCard } from "@/components/dashboard/insights";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toDay } from "@/lib/stats";
import { fmtDay, yearsBefore } from "@/lib/detective";

const AROUND = 3; // days either side of the anniversary

function offsetLabel(diff: number): string {
  if (diff === 0) return "Exactly a year ago";
  const n = Math.abs(diff);
  return `${n} day${n === 1 ? "" : "s"} ${diff < 0 ? "earlier" : "later"}`;
}

/**
 * The logs from one year ago ± 3 days as a horizontal, snapping carousel — one log in view,
 * opening on the first log of the exact anniversary (or the nearest day that has one).
 */
export function YearAgoCard({
  sorted,
  today,
  highlight,
}: {
  sorted: DecryptedEntry[];
  today: number;
  highlight: string[];
}) {
  const target = yearsBefore(today, 1);

  const logs = useMemo(
    () =>
      sorted
        .map((entry) => ({ entry, day: toDay(entry.entry_date) }))
        .filter((l) => Math.abs(l.day - target) <= AROUND),
    [sorted, target]
  );

  // First log on the anniversary, else the one closest to it.
  const startIndex = useMemo(() => {
    let best = 0;
    logs.forEach((l, i) => {
      if (Math.abs(l.day - target) < Math.abs(logs[best].day - target)) best = i;
    });
    return best;
  }, [logs, target]);

  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(startIndex);
  const [height, setHeight] = useState<number | undefined>(undefined);

  const slide = (i: number) => scroller.current?.children[i] as HTMLElement | undefined;

  // Jump (no animation) to the starting log on mount / when the set changes.
  useLayoutEffect(() => {
    const el = scroller.current;
    const s = slide(startIndex);
    // Moving the scroll position fires onScroll, which syncs `index`.
    if (el && s) el.scrollLeft = s.offsetLeft - el.offsetLeft;
  }, [startIndex, logs]);

  // The box takes the height of the log in view, not of the tallest one.
  const measure = useCallback(() => {
    const s = scroller.current?.children[index] as HTMLElement | undefined;
    if (s) setHeight(s.offsetHeight);
  }, [index]);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index && i >= 0 && i < logs.length) setIndex(i);
  };

  const go = (i: number) => {
    const el = scroller.current;
    const s = slide(i);
    if (el && s) el.scrollTo({ left: s.offsetLeft - el.offsetLeft, behavior: "smooth" });
  };

  const current = logs[index];

  return (
    <InsightCard
      title="A year ago"
      description={`${fmtDay(target, "EEE, d MMM yyyy")} · ±${AROUND} days · swipe for nearby days`}
      action={
        logs.length > 1 && (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Earlier log" disabled={index === 0} onClick={() => go(index - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-10 text-center text-xs tabular-nums text-muted-foreground">
              {index + 1} / {logs.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Later log"
              disabled={index === logs.length - 1}
              onClick={() => go(index + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )
      }
    >
      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No logs in those days.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {current && (
            <span
              className={cn(
                "text-xs font-medium",
                current.day === target ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {offsetLabel(current.day - target)}
            </span>
          )}
          <div
            ref={scroller}
            onScroll={onScroll}
            className="flex snap-x snap-mandatory items-start overflow-x-auto overscroll-x-contain transition-[height] duration-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ height }}
          >
            {logs.map(({ entry }) => (
              <div key={entry.id} className="w-full shrink-0 snap-center snap-always">
                <EntryCard entry={entry} highlight={highlight} />
              </div>
            ))}
          </div>
        </div>
      )}
    </InsightCard>
  );
}
