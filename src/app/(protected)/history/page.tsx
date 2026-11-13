"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";
import { useEntries } from "@/hooks/use-entries";
import { EntryCard } from "@/components/entry-card";
import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";

export default function HistoryPage() {
  const { data: entries, isLoading, isError, error } = useEntries();
  const [selected, setSelected] = useState<Date | undefined>();

  const filtered = useMemo(() => {
    if (!entries) return [];
    if (!selected) return entries;
    const key = format(selected, "yyyy-MM-dd");
    return entries.filter((e) => e.entry_date === key);
  }, [entries, selected]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">History</h1>
        <div className="flex items-center gap-2">
          {selected && (
            <Button variant="ghost" size="sm" onClick={() => setSelected(undefined)}>
              <X className="size-4" /> Show all
            </Button>
          )}
          <DatePicker selected={selected} onSelect={setSelected} />
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load entries"}
        </p>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {selected ? "No logs for this day." : "No entries yet — create your first one on New Entry."}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {filtered.map((e) => (
          <EntryCard key={e.id} entry={e} />
        ))}
      </div>
    </main>
  );
}
