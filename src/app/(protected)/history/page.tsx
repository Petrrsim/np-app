"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { DecryptedEntry } from "@/types/db";
import { format } from "date-fns";
import { ChevronDown, Search, Tag, User, X, type LucideIcon } from "lucide-react";
import { useEntries, useMarkers, usePeople } from "@/hooks/use-entries";
import { EntryCard } from "@/components/entry-card";
import { DatePicker } from "@/components/date-picker";
import { MarkerFilter } from "@/components/marker-picker";
import { PeopleFilter } from "@/components/people-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { foldText } from "@/lib/search";
import { cn } from "@/lib/utils";

export default function HistoryPage() {
  const { data: entries, isLoading, isError, error } = useEntries();
  const [selected, setSelected] = useState<Date | undefined>();
  const { data: markers } = useMarkers();
  const [query, setQuery] = useState("");
  const [markerIds, setMarkerIds] = useState<number[]>([]);
  const { data: people } = usePeople();
  const [personIds, setPersonIds] = useState<number[]>([]);
  const search = useDeferredValue(query.trim());
  // Marker / People chips stay collapsed behind a toggle badge; one panel open at a time.
  const [openFilter, setOpenFilter] = useState<FilterKind | null>(null);
  const toggleFilter = (kind: FilterKind) => setOpenFilter((o) => (o === kind ? null : kind));
  const panelId = useId();

  // Date + word filter first; each chip filter's counts are then taken after the *other*
  // chip filter, so they show how many logs that chip would leave.
  // Notes folded once (lazily, on first search) so each keystroke is a plain substring scan
  // instead of re-folding the whole history.
  const searching = Boolean(search);
  const foldedNotes = useMemo(
    () => (searching && entries ? new Map(entries.map((e) => [e.id, foldText(e.comment ?? "")])) : null),
    [entries, searching]
  );

  const byDateAndText = useMemo(() => {
    if (!entries) return [];
    const key = selected ? format(selected, "yyyy-MM-dd") : null;
    const q = foldText(search);
    return entries.filter(
      (e) => (!key || e.entry_date === key) && (!q || (foldedNotes?.get(e.id) ?? "").includes(q))
    );
  }, [entries, selected, search, foldedNotes]);

  // A log must carry every picked marker / include every picked person.
  const hasMarkers = (e: DecryptedEntry) => markerIds.every((id) => e.markers?.includes(id));
  const hasPeople = (e: DecryptedEntry) =>
    personIds.every((id) => e.people?.some((p) => p.person_id === id));

  const byMarkers = useMemo(
    () => (markerIds.length === 0 ? byDateAndText : byDateAndText.filter(hasMarkers)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byDateAndText, markerIds]
  );
  const byPeople = useMemo(
    () => (personIds.length === 0 ? byDateAndText : byDateAndText.filter(hasPeople)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byDateAndText, personIds]
  );
  const filtered = useMemo(
    () => (personIds.length === 0 ? byMarkers : byMarkers.filter(hasPeople)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byMarkers, personIds]
  );

  const markerCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const e of byPeople) for (const id of e.markers ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, [byPeople]);

  const personCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const e of byMarkers) {
      for (const p of e.people ?? []) counts.set(p.person_id, (counts.get(p.person_id) ?? 0) + 1);
    }
    return counts;
  }, [byMarkers]);

  const filtering = Boolean(search) || markerIds.length > 0 || personIds.length > 0;
  const criteria = [
    search && `“${search}”`,
    markerIds.length > 0 && "these markers",
    personIds.length > 0 && "these people",
  ].filter(Boolean);
  const emptyMessage = filtering
    ? `No logs match ${criteria.join(" + ")}${selected ? " on this day" : ""}.`
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

      {((markers && markers.length > 0) || (people && people.length > 0)) && (
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {markers && markers.length > 0 && (
              <FilterToggle
                label="Markers"
                Icon={Tag}
                picked={markerIds.length}
                open={openFilter === "markers"}
                panelId={panelId}
                onClick={() => toggleFilter("markers")}
              />
            )}
            {people && people.length > 0 && (
              <FilterToggle
                label="People"
                Icon={User}
                picked={personIds.length}
                open={openFilter === "people"}
                panelId={panelId}
                onClick={() => toggleFilter("people")}
              />
            )}
          </div>

          {openFilter === "markers" && markers && markers.length > 0 && (
            <FilterPanel id={panelId} onClear={markerIds.length > 0 ? () => setMarkerIds([]) : undefined}>
              <MarkerFilter markers={markers} counts={markerCounts} value={markerIds} onChange={setMarkerIds} />
            </FilterPanel>
          )}
          {openFilter === "people" && people && people.length > 0 && (
            <FilterPanel id={panelId} onClear={personIds.length > 0 ? () => setPersonIds([]) : undefined}>
              <PeopleFilter people={people} counts={personCounts} value={personIds} onChange={setPersonIds} />
            </FilterPanel>
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

      {/* Keyed by the filters so a new filter starts again from the first chunk. */}
      <EntryList
        key={`${selected?.getTime() ?? ""}|${search}|${markerIds.join(",")}|${personIds.join(",")}`}
        entries={filtered}
        highlight={search}
      />
    </main>
  );
}

type FilterKind = "markers" | "people";

/** Collapsed filter badge: shows how many chips are picked; tapping it opens the chips. */
function FilterToggle({
  label,
  Icon,
  picked,
  open,
  panelId,
  onClick,
}: {
  label: string;
  Icon: LucideIcon;
  picked: number;
  open: boolean;
  panelId: string;
  onClick: () => void;
}) {
  const active = picked > 0;
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:bg-accent active:scale-[0.97]",
        (active || open) && "text-foreground",
        open && "border-foreground"
      )}
    >
      <Icon className="size-3.5" strokeWidth={active || open ? 2.25 : 1.75} />
      {label}
      {active && (
        <span className="min-w-4 rounded-full bg-foreground px-1 text-center text-[10px] font-semibold leading-4 tabular-nums text-background">
          {picked}
        </span>
      )}
      <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} />
    </button>
  );
}

function FilterPanel({ id, onClear, children }: { id: string; onClear?: () => void; children: ReactNode }) {
  return (
    <div id={id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-card">
      {children}
      {onClear && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="size-4" /> Clear
        </Button>
      )}
    </div>
  );
}

const CHUNK = 40;

/**
 * Renders the list in chunks: the history is thousands of logs, and mounting a card
 * (with its edit/delete dialogs) for each one at once is what made the page slow.
 * More cards mount as the sentinel below the list nears the viewport.
 */
function EntryList({ entries, highlight }: { entries: DecryptedEntry[]; highlight: string }) {
  const [shown, setShown] = useState(CHUNK);
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = shown < entries.length;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (items) => {
        if (items.some((i) => i.isIntersecting)) setShown((n) => n + CHUNK);
      },
      { rootMargin: "1200px" }
    );
    io.observe(el);
    return () => io.disconnect();
    // `shown` re-arms the observer after each chunk, in case the sentinel is still in range.
  }, [hasMore, shown]);

  return (
    <div className="flex flex-col gap-3">
      {entries.slice(0, shown).map((e) => (
        <EntryCard key={e.id} entry={e} highlight={highlight} />
      ))}
      {hasMore && <div ref={sentinel} className="h-px" aria-hidden />}
    </div>
  );
}
