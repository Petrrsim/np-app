"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { format } from "date-fns";
import { Search, X } from "lucide-react";
import { useEntries, useMarkers } from "@/hooks/use-entries";
import { EntryCard } from "@/components/entry-card";
import { DatePicker } from "@/components/date-picker";
import { MarkerFilter } from "@/components/marker-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { matchesQuery } from "@/lib/search";

export default function HistoryPage() {
  const { data: entries, isLoading, isError, error } = useEntries();
  const [selected, setSelected] = useState<Date | undefined>();
  const { data: markers } = useMarkers();
  const [query, setQuery] = useState("");
  const [markerIds, setMarkerIds] = useState<number[]>([]);
  const search = useDeferredValue(query.trim());

  // Date + word filter first; marker counts are taken from this set so they show
  // how many of the currently visible logs each marker would leave.
  const byDateAndText = useMemo(() => {
    if (!entries) return [];
    const key = selected ? format(selected, "yyyy-MM-dd") : null;
    return entries.filter(
      (e) => (!key || e.entry_date === key) && (!search || matchesQuery(e.comment ?? "", search))
    );
  }, [entries, selected, search]);

  const markerCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const e of byDateAndText) for (const id of e.markers ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, [byDateAndText]);

  // A log must carry every picked marker.
  const filtered = useMemo(
    () =>
      markerIds.length === 0
        ? byDateAndText
        : byDateAndText.filter((e) => markerIds.every((id) => e.markers?.includes(id))),
    [byDateAndText, markerIds]
  );

  const filtering = Boolean(search) || markerIds.length > 0;
  const emptyMessage = filtering
    ? `No logs match ${search ? `“${search}”` : "these markers"}${search && markerIds.length ? " with these markers" : ""}${selected ? " on this day" : ""}.`
    : selected
      ? "No logs for this day."
      : "No entries yet — create your first one on New Entry.";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <div className="flex items-center gap-2">
          {selected && (
            <Button variant="ghost" size="sm" onClick={() => setSelected(undefined)}>
              <X className="size-4" /> Show all
            </Button>
          )}
          <DatePicker selected={selected} onSelect={setSelected} />
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          placeholder="Search notes…"
          aria-label="Search notes"
          className="pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {markers && markers.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <MarkerFilter
            markers={markers}
            counts={markerCounts}
            value={markerIds}
            onChange={setMarkerIds}
          />
          {markerIds.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setMarkerIds([])}>
              <X className="size-4" /> Clear
            </Button>
          )}
        </div>
      )}

      {filtering && !isLoading && !isError && filtered.length > 0 && (
        <p className="mb-3 text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "log" : "logs"} found
        </p>
      )}

      {isLoading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load entries"}
        </p>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <p className="rounded-2xl border border-dashed border-input bg-card/50 p-8 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {filtered.map((e) => (
          <EntryCard key={e.id} entry={e} highlight={search} />
        ))}
      </div>
    </main>
  );
}
