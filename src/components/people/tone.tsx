"use client";

import { Heart, Minus, Zap, type LucideIcon } from "lucide-react";
import type { LinkTone } from "@/types/db";
import { cn } from "@/lib/utils";
import { TONES, TONE_ORDER } from "@/lib/people";

const TONE_LABELS: Record<LinkTone, string> = { [-1]: TONES[-1].label, 0: TONES[0].label, 1: TONES[1].label };

/** Per-tone classes (literal strings so Tailwind sees them). Colours: the `--tie-*` tokens. */
export const TONE_UI: Record<LinkTone, { Icon: LucideIcon; text: string; active: string; badge: string; dot: string }> =
  {
    [-1]: {
      Icon: Zap,
      text: "text-tie-negative",
      active:
        "border-tie-negative/60 bg-linear-to-b from-tie-negative/15 to-tie-negative/5 shadow-[0_8px_20px_-12px_var(--tie-negative)]",
      badge: "border-tie-negative/25 bg-tie-negative/[0.07] text-tie-negative",
      dot: "bg-tie-negative",
    },
    0: {
      Icon: Minus,
      text: "text-foreground",
      active:
        "border-foreground/40 bg-linear-to-b from-foreground/10 to-foreground/[0.03] shadow-[0_8px_20px_-12px_var(--foreground)]",
      badge: "border-border bg-muted text-muted-foreground",
      dot: "bg-tie-neutral",
    },
    1: {
      Icon: Heart,
      text: "text-tie-positive",
      active:
        "border-tie-positive/60 bg-linear-to-b from-tie-positive/15 to-tie-positive/5 shadow-[0_8px_20px_-12px_var(--tie-positive)]",
      badge: "border-tie-positive/25 bg-tie-positive/[0.07] text-tie-positive",
      dot: "bg-tie-positive",
    },
  };

/** A connection's tone + label as a pill, e.g. ♥ "strong and prosperous partnership". */
export function TonePill({
  tone,
  label,
  labels = TONE_LABELS,
  className,
}: {
  tone: LinkTone;
  label: string;
  /** Words shown when there's no label (connection tones by default; VIBE_LABELS for your energy). */
  labels?: Record<LinkTone, string>;
  className?: string;
}) {
  const ui = TONE_UI[tone];
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        ui.badge,
        className,
      )}
    >
      <ui.Icon className="size-3 shrink-0" strokeWidth={2.25} />
      <span className="truncate">{label || labels[tone]}</span>
    </span>
  );
}

/**
 * Negative / Neutral / Positive tiles (a radio group). With `clearable`, tapping the picked tile
 * again clears it (`null`); otherwise one stays picked.
 */
export function ToneTiles<V extends LinkTone | null>({
  value,
  onChange,
  labels = TONE_LABELS,
  clearable = false,
  ariaLabel = "How is this connection?",
}: {
  value: V;
  onChange: (tone: V) => void;
  labels?: Record<LinkTone, string>;
  clearable?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-3 gap-2">
      {TONE_ORDER.map((tone) => {
        const ui = TONE_UI[tone];
        const selected = value === tone;
        return (
          <button
            key={tone}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange((clearable && selected ? null : tone) as V)}
            className={cn(
              "group flex h-14 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card text-xs font-medium text-muted-foreground transition-all duration-200 hover:bg-accent active:scale-[0.97]",
              selected && cn(ui.active, ui.text, "hover:bg-transparent"),
            )}
          >
            <ui.Icon
              className={cn(
                "size-5 transition-transform duration-200 group-hover:-translate-y-0.5",
                selected && "scale-110",
              )}
              strokeWidth={selected ? 2.25 : 1.75}
            />
            {labels[tone]}
          </button>
        );
      })}
    </div>
  );
}

/** Small legend: coloured line samples for the three tones. */
export function ToneLegend({ className, ring = false }: { className?: string; ring?: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground", className)}>
      {([1, 0, -1] as LinkTone[]).map((tone) => (
        <span key={tone} className="inline-flex items-center gap-1">
          <svg width="14" height="6" aria-hidden className="overflow-visible">
            <line
              x1="1"
              y1="3"
              x2="13"
              y2="3"
              stroke={TONES[tone].color}
              strokeWidth={tone === 0 ? 1.75 : 2.5}
              strokeDasharray={tone === 0 ? "3 3" : undefined}
              strokeLinecap="round"
            />
          </svg>
          {TONES[tone].label}
        </span>
      ))}
      {ring && (
        <span className="inline-flex items-center gap-1" title="A ring around someone = your energy with them">
          <svg width="12" height="12" aria-hidden className="overflow-visible">
            <circle cx="6" cy="6" r="4" fill="#ffffff" stroke={TONES[1].color} strokeWidth="2" />
          </svg>
          Your energy
        </span>
      )}
    </div>
  );
}
