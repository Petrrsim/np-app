"use client";

import Link from "next/link";
import { Loader2, Tag } from "lucide-react";
import type { Marker } from "@/types/db";
import { cn } from "@/lib/utils";
import { useMarkers } from "@/hooks/use-entries";

const CHIP =
  "flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:bg-accent active:scale-[0.97]";
/** Selected marker: solid ink, matching the near-black primary. */
const CHIP_ON = "border-foreground bg-foreground text-background hover:bg-foreground/90";

/**
 * Optional markers: toggle any number of the user's markers (the list is managed in
 * Settings). `value` holds marker ids.
 */
export function MarkerPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (value: number[]) => void;
}) {
  const { data: markers, isPending } = useMarkers();
  const picked = new Set(value);

  function toggle(id: number) {
    onChange(picked.has(id) ? value.filter((m) => m !== id) : [...value, id]);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {markers && !markers.some((m) => !m.hidden || picked.has(m.id)) && <EmptyHint noun="markers" />}
        {markers?.filter((m) => !m.hidden || picked.has(m.id)).map((m) => {
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
      </div>
    </div>
  );
}

/** Shown in a picker when its list has nothing to offer: points to where the list is managed. */
export function EmptyHint({ noun, href = "/settings", page = "Settings" }: { noun: string; href?: string; page?: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      No {noun} yet — add them in{" "}
      <Link href={href} className="font-medium text-foreground underline underline-offset-2">
        {page}
      </Link>
      .
    </p>
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
