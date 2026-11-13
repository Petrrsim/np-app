"use client";

import { CloudMoon, Moon, MoonStar, X } from "lucide-react";
import type { SleepQuality } from "@/types/db";
import { cn } from "@/lib/utils";
import { LevelTiles, type LevelOption } from "@/components/level-tiles";

export const SLEEP_OPTIONS: Record<SleepQuality, LevelOption> = {
  1: {
    label: "Poor",
    Icon: CloudMoon,
    text: "text-sleep-poor",
    bar: "bg-sleep-poor",
    active:
      "border-sleep-poor/70 bg-linear-to-b from-sleep-poor/20 to-sleep-poor/5 shadow-[0_0_22px_-10px_var(--sleep-poor)]",
    badge: "border-sleep-poor/40 bg-sleep-poor/15 text-sleep-poor",
  },
  2: {
    label: "Fine",
    Icon: Moon,
    text: "text-sleep-fine",
    bar: "bg-sleep-fine",
    active:
      "border-sleep-fine/70 bg-linear-to-b from-sleep-fine/20 to-sleep-fine/5 shadow-[0_0_22px_-10px_var(--sleep-fine)]",
    badge: "border-sleep-fine/40 bg-sleep-fine/15 text-sleep-fine",
  },
  3: {
    label: "Good",
    Icon: MoonStar,
    text: "text-sleep-good",
    bar: "bg-sleep-good",
    active:
      "border-sleep-good/70 bg-linear-to-b from-sleep-good/20 to-sleep-good/5 shadow-[0_0_22px_-10px_var(--sleep-good)]",
    badge: "border-sleep-good/40 bg-sleep-good/15 text-sleep-good",
  },
};

/**
 * Optional sleep-quality selector. `null` means "not logged on this entry" — tapping the
 * selected option again (or "Clear") returns to that state.
 */
export function SleepPicker({
  value,
  onChange,
  loggedToday,
}: {
  value: SleepQuality | null;
  onChange: (value: SleepQuality | null) => void;
  /** Sleep already recorded on an earlier entry today — shown as a hint when this one is empty. */
  loggedToday?: SleepQuality | null;
}) {
  const logged = loggedToday ? SLEEP_OPTIONS[loggedToday] : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          Sleep
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Optional
          </span>
        </span>
        {value !== null ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-3" />
            Clear
          </button>
        ) : (
          logged && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Logged today
              <span className={cn("inline-flex items-center gap-1 font-medium", logged.text)}>
                <logged.Icon className="size-3.5" />
                {logged.label}
              </span>
            </span>
          )
        )}
      </div>

      <LevelTiles
        options={SLEEP_OPTIONS}
        value={value}
        onChange={onChange}
        ariaLabel="Sleep quality"
      />
    </div>
  );
}

export function SleepBadge({ value }: { value: SleepQuality }) {
  const o = SLEEP_OPTIONS[value];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        o.badge,
      )}
    >
      <o.Icon className="size-3.5" />
      {o.label} sleep
    </span>
  );
}
