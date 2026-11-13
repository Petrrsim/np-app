"use client";

import { useState } from "react";
import { Check, Loader2, Plus, Tag, X } from "lucide-react";
import { toast } from "sonner";
import type { Marker } from "@/types/db";
import { cn } from "@/lib/utils";
import { useCreateMarker, useMarkers } from "@/hooks/use-entries";

const CHIP =
  "flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:bg-accent active:scale-[0.97]";
/** Selected marker: solid ink, matching the near-black primary. */
const CHIP_ON = "border-foreground bg-foreground text-background hover:bg-foreground/90";

/**
 * Optional markers: toggle any number of the user's markers, or create a new one inline
 * (it's added to the list and selected right away). `value` holds marker ids.
 */
export function MarkerPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (value: number[]) => void;
}) {
  const { data: markers, isPending } = useMarkers();
  const create = useCreateMarker();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const picked = new Set(value);

  function toggle(id: number) {
    onChange(picked.has(id) ? value.filter((m) => m !== id) : [...value, id]);
  }

  function closeAdd() {
    setAdding(false);
    setName("");
  }

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = markers?.find((m) => m.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      // Typing an existing name just selects it.
      if (!picked.has(existing.id)) onChange([...value, existing.id]);
      closeAdd();
      return;
    }
    try {
      const marker = await create.mutateAsync(trimmed);
      onChange([...value, marker.id]);
      closeAdd();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create marker");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          Markers
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Optional
          </span>
        </span>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-3" />
            Clear
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {markers?.map((m) => {
          const on = picked.has(m.id);
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(m.id)}
              className={cn(CHIP, on && CHIP_ON)}
            >
              <Tag className="size-3.5" strokeWidth={on ? 2.25 : 1.75} />
              {m.name}
            </button>
          );
        })}

        {adding ? (
          <form
            className="flex items-center gap-1 rounded-full border border-ring/40 bg-card py-0.5 pl-3 pr-0.5"
            onSubmit={(e) => {
              e.preventDefault();
              void handleAdd();
            }}
          >
            <input
              autoFocus
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && closeAdd()}
              placeholder="New marker"
              aria-label="New marker name"
              className="w-28 bg-transparent text-xs outline-none placeholder:text-muted-foreground/80"
            />
            <button
              type="submit"
              disabled={!name.trim() || create.isPending}
              aria-label="Add marker"
              className="rounded-full p-1 text-foreground transition-colors hover:bg-accent disabled:opacity-40"
            >
              {create.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={closeAdd}
              aria-label="Cancel"
              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(CHIP, "border-dashed")}
          >
            <Plus className="size-3.5" />
            New
          </button>
        )}
      </div>
    </div>
  );
}

export function MarkerBadge({ marker }: { marker: Marker }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-foreground/[0.06] px-2.5 py-0.5 text-xs font-medium text-foreground/80">
      <Tag className="size-3" />
      {marker.name}
    </span>
  );
}

/** Marker filter chips for History: shows each marker with how many logs carry it. */
export function MarkerFilter({
  markers,
  counts,
  value,
  onChange,
}: {
  markers: Marker[];
  counts: Map<number, number>;
  value: number[];
  onChange: (value: number[]) => void;
}) {
  const picked = new Set(value);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {markers.map((m) => {
        const on = picked.has(m.id);
        const count = counts.get(m.id) ?? 0;
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== m.id) : [...value, m.id])}
            className={cn(CHIP, on && CHIP_ON, !on && count === 0 && "opacity-50")}
          >
            <Tag className="size-3.5" strokeWidth={on ? 2.25 : 1.75} />
            {m.name}
            <span className={cn("tabular-nums", on ? "text-background/70" : "text-muted-foreground/70")}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
