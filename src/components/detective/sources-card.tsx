"use client";

import { useMemo, useState } from "react";
import { BatteryLow, CalendarClock, Quote, Tag, TrendingDown, User, Weight, type LucideIcon } from "lucide-react";
import type { DecryptedEntry } from "@/types/db";
import { EntryCard } from "@/components/entry-card";
import { InsightCard } from "@/components/dashboard/insights";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toDay } from "@/lib/stats";
import {
  fmtDay,
  fmtLag,
  scoreEntry,
  type Candidate,
  type Reason,
  type ReasonKind,
  type ScoreContext,
} from "@/lib/detective";

const CHUNK = 15;

const REASON_STYLE: Record<ReasonKind, { Icon: LucideIcon; className: string }> = {
  feeling: { Icon: Quote, className: "border-foreground bg-foreground text-background" },
  person: { Icon: User, className: "border-feel-rough/30 bg-feel-rough/10 text-feel-rough" },
  marker: { Icon: Tag, className: "border-foreground/15 bg-foreground/[0.06] text-foreground/80" },
  word: { Icon: Weight, className: "border-feel-ok/30 bg-feel-ok/10 text-feel-ok" },
  low: { Icon: TrendingDown, className: "border-border bg-muted text-muted-foreground" },
};

function ReasonChip({ reason }: { reason: Reason }) {
  const { Icon, className } = REASON_STYLE[reason.kind];
  const LowIcon = reason.kind === "person" && reason.label.endsWith("low NP") ? BatteryLow : Icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", className)}>
      <LowIcon className="size-3" />
      {reason.label}
    </span>
  );
}

function SourceItem({ c, highlight }: { c: Candidate; highlight: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5 px-1">
        <span className="inline-flex items-center gap-1 text-xs font-semibold">
          <CalendarClock className="size-3.5 text-muted-foreground" />
          {c.lag < 0 ? "after the start" : fmtLag(c.lag)}
        </span>
        {c.reasons.map((r, i) => (
          <ReasonChip key={i} reason={r} />
        ))}
      </div>
      <EntryCard entry={c.entry} highlight={highlight} />
    </div>
  );
}

/**
 * The ranked logs before the start of the feeling — or, with a week picked on the strip,
 * every log of that week (signals shown where there are any).
 */
export function SourcesCard({
  candidates,
  week,
  onClearWeek,
  weekEntries,
  folded,
  ctx,
  anchor,
  lookbackLabel,
  highlight,
}: {
  candidates: Candidate[];
  week: number | null;
  onClearWeek: () => void;
  weekEntries: DecryptedEntry[];
  folded: Map<number, string>;
  ctx: ScoreContext;
  anchor: number;
  lookbackLabel: string;
  highlight: string[];
}) {
  const [order, setOrder] = useState<"score" | "date">("score");
  const [shown, setShown] = useState(CHUNK);

  const weekItems = useMemo(() => {
    if (week === null) return null;
    return weekEntries
      .filter((e) => {
        const d = toDay(e.entry_date);
        return d >= week && d <= week + 6;
      })
      .map((entry) => {
        const day = toDay(entry.entry_date);
        return { entry, day, lag: anchor - day, ...scoreEntry(entry, folded.get(entry.id) ?? "", ctx) };
      })
      .reverse();
  }, [week, weekEntries, folded, ctx, anchor]);

  const ranked = useMemo(
    () => (order === "score" ? candidates : [...candidates].sort((a, b) => b.day - a.day || b.entry.id - a.entry.id)),
    [candidates, order]
  );

  const items = weekItems ?? ranked;
  const strong = candidates.filter((c) => c.score >= 3).length;

  const title = week !== null ? `Week of ${fmtDay(week)}` : "Possible sources";
  const description =
    week !== null
      ? `${items.length} ${items.length === 1 ? "log" : "logs"} that week`
      : candidates.length === 0
        ? `No signals in the ${lookbackLabel} before ${fmtDay(anchor, "d MMM")}.`
        : `${candidates.length} logs with signals in the ${lookbackLabel} before ${fmtDay(anchor, "d MMM")} · ${strong} strong`;

  return (
    <InsightCard
      title={title}
      description={description}
      action={
        week !== null ? (
          <Button variant="ghost" size="sm" onClick={onClearWeek}>
            All sources
          </Button>
        ) : (
          candidates.length > 1 && (
            <div role="radiogroup" aria-label="Order" className="flex shrink-0 gap-0.5 rounded-lg bg-muted p-0.5">
              {(
                [
                  ["score", "Strongest"],
                  ["date", "Newest"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={order === key}
                  onClick={() => {
                    setOrder(key);
                    setShown(CHUNK);
                  }}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[11px] font-medium transition-all",
                    order === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )
        )
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {week !== null
            ? "No logs that week."
            : "Try describing the feeling above, adding heavy words or signal markers, or looking back further."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {items.slice(0, shown).map((c) => (
            <SourceItem key={c.entry.id} c={c} highlight={highlight} />
          ))}
          {shown < items.length && (
            <Button variant="outline" onClick={() => setShown((n) => n + CHUNK)}>
              Show more ({items.length - shown} left)
            </Button>
          )}
        </div>
      )}
    </InsightCard>
  );
}
