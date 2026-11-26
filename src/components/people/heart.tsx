"use client";

import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

/** The heart's colour, for SVG (keep the hex fallback, like the tie colours). */
export const HEART_COLOR = "var(--heart, #db2777)";

/** Lucide's heart outline (24×24 box), drawn filled on the People web. */
export const HEART_PATH =
  "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z";

export const ROMANTIC_LABEL = "Romantic relationship";

/** A small filled heart for lists / labels (shown only for people with the heart on). */
export function HeartMark({ className }: { className?: string }) {
  return (
    <Heart
      className={cn("size-3.5 shrink-0 fill-[var(--heart,#db2777)] text-[var(--heart,#db2777)]", className)}
      aria-label={ROMANTIC_LABEL}
      role="img"
    />
  );
}

/** Round heart toggle: grey outline when off, a solid pink circle with a white heart when on. */
export function HeartToggle({
  on,
  onChange,
  size = "md",
  className,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={ROMANTIC_LABEL}
      title={on ? `${ROMANTIC_LABEL} (tap to remove)` : ROMANTIC_LABEL}
      onClick={() => onChange(!on)}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border transition-all duration-200 active:scale-90",
        size === "md" ? "size-11" : "size-8",
        // Colours via var() with a hex fallback, so "on" is pink even with a stale dev CSS cache.
        on
          ? "border-[var(--heart,#db2777)] bg-[var(--heart,#db2777)] text-white shadow-[0_2px_12px_-2px_color-mix(in_srgb,var(--heart,#db2777)_60%,transparent)]"
          : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-[var(--heart,#db2777)]",
        className,
      )}
    >
      <Heart className={cn(size === "md" ? "size-5" : "size-4", on && "fill-white")} />
    </button>
  );
}
