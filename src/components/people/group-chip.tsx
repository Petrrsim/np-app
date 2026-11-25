"use client";

import { Check } from "lucide-react";
import type { PersonGroup } from "@/types/db";
import { cn } from "@/lib/utils";
import { groupHex, type GroupTree } from "@/lib/people";

const CHIP =
  "flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:bg-accent active:scale-[0.97]";

/**
 * Toggle chip for one group, with its parent path ("Madeira › Dance Class"). `via` = the person
 * is in it through a subgroup (dashed, no check); tapping it makes them a direct member too.
 */
export function GroupChip({
  tree,
  group,
  state,
  via,
  onClick,
}: {
  tree: GroupTree;
  group: PersonGroup;
  state: "on" | "via" | "off";
  /** For `via`: the subgroup names they're in it through. */
  via?: string[];
  onClick: () => void;
}) {
  const hex = groupHex(group.color);
  const parents = tree.path(group.id).slice(0, -1);
  return (
    <button
      type="button"
      aria-pressed={state === "on"}
      onClick={onClick}
      title={state === "via" && via?.length ? `In it through ${via.join(", ")}` : undefined}
      className={cn(CHIP, state !== "off" && "hover:bg-transparent")}
      style={
        state === "on"
          ? {
              borderColor: `color-mix(in srgb, ${hex} 45%, transparent)`,
              background: `color-mix(in srgb, ${hex} 10%, white)`,
              color: hex,
            }
          : state === "via"
            ? { borderColor: `color-mix(in srgb, ${hex} 40%, transparent)`, borderStyle: "dashed", color: hex }
            : undefined
      }
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: hex, opacity: state === "off" ? 0.55 : state === "via" ? 0.6 : 1 }}
      />
      {parents.length > 0 && <span className="min-w-0 truncate font-normal opacity-60">{parents.join(" › ")} ›</span>}
      <span className="shrink-0">{group.name}</span>
      {state === "on" && <Check className="size-3 shrink-0" strokeWidth={2.5} />}
    </button>
  );
}
