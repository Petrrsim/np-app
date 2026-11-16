"use client";

import { Check, Minus, X, type LucideIcon } from "lucide-react";
import type { SuccessStep } from "@/types/db";
import { cn } from "@/lib/utils";

export const SUCCESS_OPTIONS: Record<
  SuccessStep,
  { label: string; badgeLabel: string; Icon: LucideIcon; text: string; bar: string; active: string; badge: string }
> = {
  [-1]: {
    label: "No",
    badgeLabel: "Not success",
    Icon: X,
    text: "text-destructive",
    bar: "bg-destructive",
    active:
      "border-destructive/60 bg-linear-to-b from-destructive/20 to-destructive/5 shadow-[0_8px_20px_-12px_var(--destructive)]",
    badge: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  0: {
    label: "Neutral",
    badgeLabel: "Neutral",
    Icon: Minus,
    text: "text-foreground",
    bar: "bg-foreground",
    active:
      "border-foreground/40 bg-linear-to-b from-foreground/10 to-foreground/[0.03] shadow-[0_8px_20px_-12px_var(--foreground)]",
    badge: "border-border bg-muted text-muted-foreground",
  },
  1: {
    label: "Yes",
    badgeLabel: "Success",
    Icon: Check,
    text: "text-success",
    bar: "bg-success",
    active:
      "border-success/60 bg-linear-to-b from-success/20 to-success/5 shadow-[0_8px_20px_-12px_var(--success)]",
    badge: "border-success/30 bg-success/10 text-success",
  },
};

const STEPS: SuccessStep[] = [-1, 0, 1];

/** Three-segment marker: the segment at this step's position (left / centre / right) is lit. */
function StepMarker({ step, bar, lit }: { step: SuccessStep; bar: string; lit: boolean }) {
  return (
    <span className="flex gap-1" aria-hidden>
      {STEPS.map((n) => (
        <span
          key={n}
          className={cn(
            "h-1 w-3.5 rounded-full transition-colors",
            n === step ? (lit ? bar : "bg-muted-foreground/45") : "bg-muted-foreground/15",
          )}
        />
      ))}
    </span>
  );
}

export function SuccessButtons({
  value,
  onChange,
}: {
  value: SuccessStep;
  onChange: (value: SuccessStep) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="flex min-h-6 items-center text-sm font-medium">Success</span>
      <div role="radiogroup" aria-label="Success" className="grid grid-cols-3 gap-2">
        {STEPS.map((step) => {
          const o = SUCCESS_OPTIONS[step];
          const selected = value === step;
          return (
            <button
              key={step}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(step)}
              className={cn(
                "group flex h-20 max-sm:h-14 max-sm:gap-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card text-xs font-medium text-muted-foreground transition-all duration-200 hover:bg-accent active:scale-[0.97]",
                selected && cn(o.active, o.text, "hover:bg-transparent"),
              )}
            >
              <o.Icon
                className={cn(
                  "size-6 max-sm:size-5 transition-transform duration-200 group-hover:-translate-y-0.5",
                  selected && "scale-110",
                )}
                strokeWidth={selected ? 2.5 : 1.75}
              />
              {o.label}
              <StepMarker step={step} bar={o.bar} lit={selected} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SuccessBadge({ value }: { value: SuccessStep | null }) {
  const o = SUCCESS_OPTIONS[value ?? 0];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        o.badge,
      )}
    >
      <o.Icon className="size-3.5" strokeWidth={2.5} />
      {o.badgeLabel}
    </span>
  );
}
