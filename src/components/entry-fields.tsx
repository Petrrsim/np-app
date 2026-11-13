"use client";

import type { SleepQuality, SuccessStep } from "@/types/db";
import { MetricSlider } from "@/components/metric-slider";
import { SuccessButtons } from "@/components/success-buttons";
import { SleepPicker } from "@/components/sleep-picker";
import { ActivityPicker, type ActivityDraft } from "@/components/activity-picker";
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
  note: string;
}

export const ENTRY_DEFAULTS: EntryFieldsValue = {
  mood: 6,
  energy: 6,
  flow: 6,
  success: 0,
  sleep: null,
  activities: [],
  note: "",
};

export function EntryFields({
  value,
  onChange,
  sleepLoggedToday,
}: {
  value: EntryFieldsValue;
  onChange: (patch: Partial<EntryFieldsValue>) => void;
  sleepLoggedToday?: SleepQuality | null;
}) {
  return (
    <div className="flex flex-col gap-5">
      <MetricSlider label="Mood" value={value.mood} onChange={(v) => onChange({ mood: v })} />
      <MetricSlider label="Energy" value={value.energy} onChange={(v) => onChange({ energy: v })} />
      <MetricSlider label="Flow" value={value.flow} onChange={(v) => onChange({ flow: v })} />
      <SuccessButtons value={value.success} onChange={(v) => onChange({ success: v })} />
      <SleepPicker
        value={value.sleep}
        onChange={(v) => onChange({ sleep: v })}
        loggedToday={sleepLoggedToday}
      />
      <ActivityPicker value={value.activities} onChange={(v) => onChange({ activities: v })} />
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
