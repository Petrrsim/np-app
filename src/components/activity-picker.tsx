"use client";

import { Frown, Laugh, Meh, X } from "lucide-react";
import type { ActivityFeeling, EntryActivity } from "@/types/db";
import type { ActivityLookup } from "@/lib/activities";
import { useActivities, useActivityLookup } from "@/hooks/use-lists";
import { cn } from "@/lib/utils";
import { LevelTiles, type LevelOption } from "@/components/level-tiles";
import { EmptyHint } from "@/components/marker-picker";

export const FEELING_OPTIONS: Record<ActivityFeeling, LevelOption> = {
  1: {
    label: "Rough",
    Icon: Frown,
    text: "text-feel-rough",
    bar: "bg-feel-rough",
    active:
      "border-feel-rough/60 bg-linear-to-b from-feel-rough/20 to-feel-rough/5 shadow-[0_8px_20px_-12px_var(--feel-rough)]",
    badge: "border-feel-rough/30 bg-feel-rough/10 text-feel-rough",
  },
  2: {
    label: "OK",
    Icon: Meh,
    text: "text-feel-ok",
    bar: "bg-feel-ok",
    active:
      "border-feel-ok/60 bg-linear-to-b from-feel-ok/20 to-feel-ok/5 shadow-[0_8px_20px_-12px_var(--feel-ok)]",
    badge: "border-feel-ok/30 bg-feel-ok/10 text-feel-ok",
  },
  3: {
    label: "Great",
    Icon: Laugh,
    text: "text-feel-great",
    bar: "bg-feel-great",
    active:
      "border-feel-great/60 bg-linear-to-b from-feel-great/20 to-feel-great/5 shadow-[0_8px_20px_-12px_var(--feel-great)]",
    badge: "border-feel-great/30 bg-feel-great/10 text-feel-great",
  },
};

/** Tint for a rated activity's card (border + faint wash), matching its feeling. */
const FEELING_CARD: Record<ActivityFeeling, string> = {
  1: "border-feel-rough/30 bg-feel-rough/[0.04]",
  2: "border-feel-ok/30 bg-feel-ok/[0.04]",
  3: "border-feel-great/30 bg-feel-great/[0.04]",
};

/** Form-side activity: picked but possibly not rated yet (`feeling: null`). */
export interface ActivityDraft {
  activity: string;
  feeling: ActivityFeeling | null;
}

/** Label of the first picked-but-unrated activity, or null when all are rated. */
export function firstUnrated(drafts: ActivityDraft[], lookup: ActivityLookup): string | null {
  const d = drafts.find((a) => a.feeling === null);
  return d ? lookup(d.activity).label : null;
}

/** Drops unrated drafts — callers validate with `firstUnrated` first. */
export function toEntryActivities(drafts: ActivityDraft[]): EntryActivity[] {
  return drafts.flatMap((d) => (d.feeling === null ? [] : [{ activity: d.activity, feeling: d.feeling }]));
}

/**
 * Optional activities: toggle any number of activities, then rate how each one felt (1–3).
 * Picked activities keep their pick order.
 */
export function ActivityPicker({
  value,
  onChange,
}: {
  value: ActivityDraft[];
  onChange: (value: ActivityDraft[]) => void;
}) {
  const { data: list } = useActivities();
  const activityInfo = useActivityLookup();
  const feelingOf = new Map(value.map((a) => [a.activity, a.feeling]));
  // Visible activities in list order, plus anything already picked that's hidden or no
  // longer in the list (e.g. editing an old log) so it can still be seen and removed.
  const shown = (list ?? []).filter((a) => !a.hidden || feelingOf.has(a.key)).map((a) => a.key);
  const keys = [...shown, ...value.map((a) => a.activity).filter((k) => !shown.includes(k))];

  function toggle(key: string) {
    onChange(
      feelingOf.has(key)
        ? value.filter((a) => a.activity !== key)
        : [...value, { activity: key, feeling: null }],
    );
  }

  function rate(key: string, feeling: ActivityFeeling | null) {
    onChange(value.map((a) => (a.activity === key ? { ...a, feeling } : a)));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {list && keys.length === 0 && <EmptyHint noun="activities" />}
        {keys.map((key) => {
          const { label, Icon } = activityInfo(key);
          const on = feelingOf.has(key);
          const feeling = feelingOf.get(key) ?? null;
          const o = feeling ? FEELING_OPTIONS[feeling] : null;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:bg-accent active:scale-[0.97]",
                on && "border-foreground/30 bg-accent text-foreground",
                // Once rated, the chip glows in the feeling's colour like a selected tile.
                o && cn(o.active, o.text, "hover:bg-transparent"),
              )}
            >
              <Icon className="size-4" strokeWidth={on ? 2.25 : 1.75} />
              {label}
            </button>
          );
        })}
      </div>

      {value.map(({ activity, feeling }) => {
        const { label, Icon } = activityInfo(activity);
        return (
          <div
            key={activity}
            className={cn(
              "flex flex-col gap-2 rounded-xl border border-border bg-background/40 p-3 transition-colors duration-200",
              feeling && FEELING_CARD[feeling],
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "flex items-center gap-2 text-sm font-medium transition-colors",
                  feeling && FEELING_OPTIONS[feeling].text,
                )}
              >
                <Icon className="size-4" />
                {label}
                {feeling === null && (
                  <span className="text-xs font-normal text-muted-foreground">How did it feel?</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => toggle(activity)}
                aria-label={`Remove ${label}`}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <LevelTiles
              options={FEELING_OPTIONS}
              value={feeling}
              onChange={(v) => rate(activity, v)}
              ariaLabel={`How ${label} felt`}
              className="h-16"
            />
          </div>
        );
      })}
    </div>
  );
}

export function ActivityBadge({ value }: { value: EntryActivity }) {
  const { label, Icon } = useActivityLookup()(value.activity);
  const o = FEELING_OPTIONS[value.feeling];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        o.badge,
      )}
    >
      <Icon className="size-3.5" />
      {label} · {o.label}
    </span>
  );
}
