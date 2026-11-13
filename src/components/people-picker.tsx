"use client";

import { useState } from "react";
import { BatteryFull, BatteryLow, BatteryMedium, Check, Loader2, Plus, User, X } from "lucide-react";
import { toast } from "sonner";
import type { EntryPerson, Person, PersonNp } from "@/types/db";
import { cn } from "@/lib/utils";
import { LevelTiles, type LevelOption } from "@/components/level-tiles";
import { useCreatePerson, usePeople } from "@/hooks/use-entries";

/** A person's NP (life energy). Reuses the feeling scale colours: rose → amber → teal. */
export const NP_OPTIONS: Record<PersonNp, LevelOption> = {
  1: {
    label: "Low",
    Icon: BatteryLow,
    text: "text-feel-rough",
    bar: "bg-feel-rough",
    active:
      "border-feel-rough/60 bg-linear-to-b from-feel-rough/20 to-feel-rough/5 shadow-[0_8px_20px_-12px_var(--feel-rough)]",
    badge: "border-feel-rough/30 bg-feel-rough/10 text-feel-rough",
  },
  2: {
    label: "OK",
    Icon: BatteryMedium,
    text: "text-feel-ok",
    bar: "bg-feel-ok",
    active:
      "border-feel-ok/60 bg-linear-to-b from-feel-ok/20 to-feel-ok/5 shadow-[0_8px_20px_-12px_var(--feel-ok)]",
    badge: "border-feel-ok/30 bg-feel-ok/10 text-feel-ok",
  },
  3: {
    label: "Great",
    Icon: BatteryFull,
    text: "text-feel-great",
    bar: "bg-feel-great",
    active:
      "border-feel-great/60 bg-linear-to-b from-feel-great/20 to-feel-great/5 shadow-[0_8px_20px_-12px_var(--feel-great)]",
    badge: "border-feel-great/30 bg-feel-great/10 text-feel-great",
  },
};

/** Tint for a rated person's card (border + faint wash), matching their NP. */
const NP_CARD: Record<PersonNp, string> = {
  1: "border-feel-rough/30 bg-feel-rough/[0.04]",
  2: "border-feel-ok/30 bg-feel-ok/[0.04]",
  3: "border-feel-great/30 bg-feel-great/[0.04]",
};

const CHIP =
  "flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:bg-accent active:scale-[0.97]";

/** Form-side person: picked but possibly not rated yet (`np: null`). */
export interface PersonDraft {
  person_id: number;
  np: PersonNp | null;
}

/** Name of the first picked-but-unrated person, or null when all are rated. */
export function firstUnratedPerson(drafts: PersonDraft[], people: Person[] | undefined): string | null {
  const d = drafts.find((p) => p.np === null);
  if (!d) return null;
  return people?.find((p) => p.id === d.person_id)?.name ?? "everyone";
}

/** Drops unrated drafts — callers validate with `firstUnratedPerson` first. */
export function toEntryPeople(drafts: PersonDraft[]): EntryPerson[] {
  return drafts.flatMap((d) => (d.np === null ? [] : [{ person_id: d.person_id, np: d.np }]));
}

/**
 * Optional people: toggle any number of the user's people (or add someone new inline),
 * then rate each picked person's NP (life energy, 1–3). Picked people keep their pick order.
 */
export function PeoplePicker({
  value,
  onChange,
}: {
  value: PersonDraft[];
  onChange: (value: PersonDraft[]) => void;
}) {
  const { data: people, isPending } = usePeople();
  const create = useCreatePerson();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const npOf = new Map(value.map((p) => [p.person_id, p.np]));
  const nameOf = (id: number) => people?.find((p) => p.id === id)?.name ?? "…";

  function toggle(id: number) {
    onChange(npOf.has(id) ? value.filter((p) => p.person_id !== id) : [...value, { person_id: id, np: null }]);
  }

  function rate(id: number, np: PersonNp | null) {
    onChange(value.map((p) => (p.person_id === id ? { ...p, np } : p)));
  }

  function closeAdd() {
    setAdding(false);
    setName("");
  }

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = people?.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      // Typing an existing name just picks them.
      if (!npOf.has(existing.id)) onChange([...value, { person_id: existing.id, np: null }]);
      closeAdd();
      return;
    }
    try {
      const person = await create.mutateAsync(trimmed);
      onChange([...value, { person_id: person.id, np: null }]);
      closeAdd();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add person");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          People
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
        {people?.map((p) => {
          const on = npOf.has(p.id);
          const np = npOf.get(p.id) ?? null;
          const o = np ? NP_OPTIONS[np] : null;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(p.id)}
              className={cn(
                CHIP,
                on && "border-foreground/30 bg-accent text-foreground",
                // Once rated, the chip glows in the NP colour like a selected tile.
                o && cn(o.active, o.text, "hover:bg-transparent"),
              )}
            >
              <User className="size-3.5" strokeWidth={on ? 2.25 : 1.75} />
              {p.name}
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
              placeholder="Name"
              aria-label="New person's name"
              className="w-28 bg-transparent text-xs outline-none placeholder:text-muted-foreground/80"
            />
            <button
              type="submit"
              disabled={!name.trim() || create.isPending}
              aria-label="Add person"
              className="rounded-full p-1 text-foreground transition-colors hover:bg-accent disabled:opacity-40"
            >
              {create.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
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
          <button type="button" onClick={() => setAdding(true)} className={cn(CHIP, "border-dashed")}>
            <Plus className="size-3.5" />
            New
          </button>
        )}
      </div>

      {value.map(({ person_id, np }) => {
        const label = nameOf(person_id);
        return (
          <div
            key={person_id}
            className={cn(
              "flex flex-col gap-2 rounded-xl border border-border bg-background/40 p-3 transition-colors duration-200",
              np && NP_CARD[np],
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "flex items-center gap-2 text-sm font-medium transition-colors",
                  np && NP_OPTIONS[np].text,
                )}
              >
                <User className="size-4" />
                {label}
                {np === null && <span className="text-xs font-normal text-muted-foreground">Their NP?</span>}
              </span>
              <button
                type="button"
                onClick={() => toggle(person_id)}
                aria-label={`Remove ${label}`}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <LevelTiles
              options={NP_OPTIONS}
              value={np}
              onChange={(v) => rate(person_id, v)}
              ariaLabel={`${label}'s NP`}
              className="h-16"
            />
          </div>
        );
      })}
    </div>
  );
}

export function PersonBadge({ name, np }: { name: string; np: PersonNp }) {
  const o = NP_OPTIONS[np];
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", o.badge)}
    >
      <o.Icon className="size-3.5" />
      {name} · {o.label}
    </span>
  );
}

const CHIP_ON = "border-foreground bg-foreground text-background hover:bg-foreground/90";

/** People filter chips for History: shows each person with how many logs include them. */
export function PeopleFilter({
  people,
  counts,
  value,
  onChange,
}: {
  people: Person[];
  counts: Map<number, number>;
  value: number[];
  onChange: (value: number[]) => void;
}) {
  const picked = new Set(value);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {people.map((p) => {
        const on = picked.has(p.id);
        const count = counts.get(p.id) ?? 0;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== p.id) : [...value, p.id])}
            className={cn(CHIP, on && CHIP_ON, !on && count === 0 && "opacity-50")}
          >
            <User className="size-3.5" strokeWidth={on ? 2.25 : 1.75} />
            {p.name}
            <span className={cn("tabular-nums", on ? "text-background/70" : "text-muted-foreground/70")}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
