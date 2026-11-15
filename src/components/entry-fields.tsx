"use client";

import { useId, useState } from "react";
import { Activity, Moon, Tag, User, type LucideIcon } from "lucide-react";
import type { SleepQuality, SuccessStep } from "@/types/db";
import { cn } from "@/lib/utils";
import { MetricSlider } from "@/components/metric-slider";
import { SuccessButtons } from "@/components/success-buttons";
import { SLEEP_OPTIONS, SleepPicker } from "@/components/sleep-picker";
import { ActivityPicker, type ActivityDraft } from "@/components/activity-picker";
import { PeoplePicker, type PersonDraft } from "@/components/people-picker";
import { MarkerPicker } from "@/components/marker-picker";
import { Textarea } from "@/components/ui/textarea";

export interface EntryFieldsValue {
  mood: number;
  energy: number;
  flow: number;
  success: SuccessStep;
  /** null = no sleep logged on this entry */
  sleep: SleepQuality | null;
  /** Picked activities; each must be rated before saving (see `firstUnrated`). */
  activities: ActivityDraft[];
  /** Picked people; each must get an NP rating before saving (see `firstUnratedPerson`). */
  people: PersonDraft[];
  /** Picked marker ids. */
  markers: number[];
  note: string;
}

export const ENTRY_DEFAULTS: EntryFieldsValue = {
  mood: 6,
  energy: 6,
  flow: 6,
  success: 0,
  sleep: null,
  activities: [],
  people: [],
  markers: [],
  note: "",
};

type Extra = "sleep" | "activities" | "people" | "markers";

/** What one button in the extras row shows. */
interface ExtraButton {
  key: Extra;
  label: string;
  Icon: LucideIcon;
  /** Has a value on this log (icon goes bold / tinted). */
  filled: boolean;
  /** Extra classes for the icon (e.g. the sleep level colour) when not open. */
  iconClass?: string;
  /** Corner badge: a count, or a colour dot (sleep). */
  badge: { kind: "count"; n: number; warn: boolean } | { kind: "dot"; className: string } | null;
}

/**
 * One row of toggles for the optional parts of a log. Tapping one opens its picker below the
 * row (one at a time; tap again to close). Corner badges show what's set: a count (amber while
 * a pick still needs a rating) or, for sleep, a dot in the logged level's colour.
 */
function ExtrasBar({
  buttons,
  open,
  onToggle,
  panelId,
}: {
  buttons: ExtraButton[];
  open: Extra | null;
  onToggle: (key: Extra) => void;
  panelId: string;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {buttons.map(({ key, label, Icon, filled, iconClass, badge }) => {
        const on = open === key;
        return (
          <button
            key={key}
            type="button"
            aria-expanded={on}
            aria-controls={on ? panelId : undefined}
            onClick={() => onToggle(key)}
            className={cn(
              "relative flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card px-1 text-[11px] font-medium text-muted-foreground transition-all duration-200 hover:bg-accent active:scale-[0.97] sm:text-xs",
              filled && "text-foreground",
              on && "border-foreground bg-foreground text-background hover:bg-foreground/90",
            )}
          >
            <Icon className={cn("size-4.5 shrink-0", !on && iconClass)} strokeWidth={on || filled ? 2.25 : 1.75} />
            <span className="max-w-full truncate">{label}</span>
            {badge?.kind === "count" && (
              <span
                className={cn(
                  "absolute right-1 top-1 min-w-4 rounded-full px-1 text-center text-[10px] font-semibold leading-4 tabular-nums",
                  badge.warn ? "bg-feel-ok text-white" : on ? "bg-background text-foreground" : "bg-foreground text-background",
                )}
                title={badge.warn ? "Needs a rating" : undefined}
              >
                {badge.n}
              </span>
            )}
            {badge?.kind === "dot" && (
              <span className={cn("absolute right-1.5 top-1.5 size-2 rounded-full", badge.className)} aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}

function countBadge(n: number, warn = false): ExtraButton["badge"] {
  return n > 0 ? { kind: "count", n, warn } : null;
}

export function EntryFields({
  value,
  onChange,
  sleepLoggedToday,
}: {
  value: EntryFieldsValue;
  onChange: (patch: Partial<EntryFieldsValue>) => void;
  sleepLoggedToday?: SleepQuality | null;
}) {
  const [open, setOpen] = useState<Extra | null>(null);
  const panelId = useId();
  const sleep = value.sleep ? SLEEP_OPTIONS[value.sleep] : null;
  const buttons: ExtraButton[] = [
    {
      key: "sleep",
      label: "Sleep",
      Icon: sleep?.Icon ?? Moon,
      filled: !!sleep,
      iconClass: sleep?.text,
      badge: sleep ? { kind: "dot", className: sleep.bar } : null,
    },
    {
      key: "activities",
      label: "Activities",
      Icon: Activity,
      filled: value.activities.length > 0,
      badge: countBadge(value.activities.length, value.activities.some((a) => a.feeling === null)),
    },
    {
      key: "people",
      label: "People",
      Icon: User,
      filled: value.people.length > 0,
      badge: countBadge(value.people.length, value.people.some((p) => p.np === null)),
    },
    {
      key: "markers",
      label: "Markers",
      Icon: Tag,
      filled: value.markers.length > 0,
      badge: countBadge(value.markers.length),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <MetricSlider label="Mood" value={value.mood} onChange={(v) => onChange({ mood: v })} />
      <MetricSlider label="Energy" value={value.energy} onChange={(v) => onChange({ energy: v })} />
      <MetricSlider label="Flow" value={value.flow} onChange={(v) => onChange({ flow: v })} />
      <SuccessButtons value={value.success} onChange={(v) => onChange({ success: v })} />
      <div className="flex flex-col gap-3">
        <ExtrasBar
          buttons={buttons}
          open={open}
          onToggle={(key) => setOpen((o) => (o === key ? null : key))}
          panelId={panelId}
        />
        {open && (
          <div id={panelId}>
            {open === "sleep" && (
              <SleepPicker
                value={value.sleep}
                onChange={(v) => onChange({ sleep: v })}
                loggedToday={sleepLoggedToday}
              />
            )}
            {open === "activities" && (
              <ActivityPicker value={value.activities} onChange={(v) => onChange({ activities: v })} />
            )}
            {open === "people" && <PeoplePicker value={value.people} onChange={(v) => onChange({ people: v })} />}
            {open === "markers" && (
              <MarkerPicker value={value.markers} onChange={(v) => onChange({ markers: v })} />
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Note</span>
        <Textarea
          value={value.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="What's up bro?"
          rows={5}
        />
      </div>
    </div>
  );
}
