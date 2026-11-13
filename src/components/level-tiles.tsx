"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** A 1–3 scale value (sleep quality, activity feeling). */
export type Level = 1 | 2 | 3;

export const LEVELS: Level[] = [1, 2, 3];

/** Visual definition of one level. Class strings are literal so Tailwind can see them. */
export interface LevelOption {
  label: string;
  Icon: LucideIcon;
  text: string;
  bar: string;
  active: string;
  badge: string;
}

/** Three-segment level meter: how many segments are lit = the value. */
export function LevelBars({ level, bar, lit }: { level: Level; bar: string; lit: boolean }) {
  return (
    <span className="flex gap-1" aria-hidden>
      {LEVELS.map((n) => (
        <span
          key={n}
          className={cn(
            "h-1 w-3.5 rounded-full transition-colors",
            n <= level ? (lit ? bar : "bg-muted-foreground/40") : "bg-muted-foreground/15",
          )}
        />
      ))}
    </span>
  );
}

/**
 * Three tiles (icon, label, level meter) acting as a radio group. Tapping the selected tile
 * again returns `null`.
 */
export function LevelTiles<L extends Level>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: Record<L, LevelOption>;
  value: L | null;
  onChange: (value: L | null) => void;
  ariaLabel: string;
  /** Tile sizing, e.g. "h-20". */
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-3 gap-2">
      {(LEVELS as L[]).map((level) => {
        const o = options[level];
        const selected = value === level;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(selected ? null : level)}
            className={cn(
              "group flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground transition-all duration-200 hover:bg-accent active:scale-[0.97]",
              className,
              selected && cn(o.active, o.text, "hover:bg-transparent"),
            )}
          >
            <o.Icon
              className={cn(
                "size-6 transition-transform duration-200 group-hover:-translate-y-0.5",
                selected && "scale-110",
              )}
              strokeWidth={selected ? 2.25 : 1.75}
            />
            {o.label}
            <LevelBars level={level} bar={o.bar} lit={selected} />
          </button>
        );
      })}
    </div>
  );
}
