"use client";

import { memo } from "react";
import { format, parseISO } from "date-fns";
import type { DecryptedEntry } from "@/types/db";
import { Card, CardContent } from "@/components/ui/card";
import { EditEntryDialog } from "@/components/edit-entry-dialog";
import { DeleteEntryButton } from "@/components/delete-entry-button";
import { SleepBadge } from "@/components/sleep-picker";
import { SuccessBadge } from "@/components/success-buttons";
import { ActivityBadge } from "@/components/activity-picker";
import { PersonBadge } from "@/components/people-picker";
import { MarkerBadge } from "@/components/marker-picker";
import { useMarkers, usePeople } from "@/hooks/use-entries";
import { splitMatches } from "@/lib/search";

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-muted/70 px-3 py-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value ?? "–"}</span>
    </div>
  );
}

/**
 * Time the log was written, from `created_at` (shown in local time). Entries bulk-imported
 * from the old app carry the import timestamp instead of the real one, so the time is only
 * shown when `created_at` falls on the entry's own (local) day.
 */
export function loggedTime(entry: DecryptedEntry): string | null {
  if (!entry.created_at) return null;
  const created = parseISO(entry.created_at);
  if (Number.isNaN(created.getTime())) return null;
  if (format(created, "yyyy-MM-dd") !== entry.entry_date) return null;
  return format(created, "HH:mm");
}

// Memoized: a refetch keeps unchanged entries referentially equal (TanStack structural
// sharing), so only the cards whose data changed re-render.
export const EntryCard = memo(function EntryCard({
  entry,
  highlight = "",
}: {
  entry: DecryptedEntry;
  highlight?: string;
}) {
  const time = loggedTime(entry);
  const { data: markers } = useMarkers();
  const { data: people } = usePeople();
  const nameOf = (id: number) => people?.find((p) => p.id === id)?.name;
  const entryMarkers = (markers ?? []).filter((m) => entry.markers?.includes(m.id));
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1.5">
            <span className="font-medium">
              {format(parseISO(entry.entry_date), "EEE, d MMM yyyy")}
              {time && (
                <span className="ml-2 font-normal tabular-nums text-muted-foreground">{time}</span>
              )}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <SuccessBadge value={entry.success_step} />
              {entry.sleep_quality && <SleepBadge value={entry.sleep_quality} />}
              {entry.activities?.map((a) => <ActivityBadge key={a.activity} value={a} />)}
              {entry.people?.map((p) => {
                const name = nameOf(p.person_id);
                return name ? <PersonBadge key={p.person_id} name={name} np={p.np} /> : null;
              })}
              {entryMarkers.map((m) => <MarkerBadge key={m.id} marker={m} />)}
            </div>
          </div>
          <div className="flex shrink-0 items-center">
            <EditEntryDialog entry={entry} />
            <DeleteEntryButton id={entry.id} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Metric label="Mood" value={entry.mood} />
          <Metric label="Energy" value={entry.energy} />
          <Metric label="Flow" value={entry.flow} />
        </div>

        {entry.comment?.trim() ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
            {splitMatches(entry.comment, highlight).map((part, i) =>
              part.match ? (
                <mark key={i} className="rounded-sm bg-yellow-200/80 px-0.5 text-foreground">
                  {part.text}
                </mark>
              ) : (
                part.text
              )
            )}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">No note</p>
        )}
      </CardContent>
    </Card>
  );
});
