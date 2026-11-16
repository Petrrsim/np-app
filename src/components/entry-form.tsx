"use client";

import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EntryFields, ENTRY_DEFAULTS, type EntryFieldsValue } from "@/components/entry-fields";
import { firstUnrated, toEntryActivities } from "@/components/activity-picker";
import { useActivityLookup } from "@/hooks/use-lists";
import { firstUnratedPerson, toEntryPeople } from "@/components/people-picker";
import {
  useCreateEntry,
  useLatestMetrics,
  usePeople,
  useSleepLoggedOn,
  type LatestMetrics,
} from "@/hooks/use-entries";

/** Fresh form: sliders carry over from the previous log; success, sleep, activities, people, markers and note start empty. */
function freshFields(sliders: LatestMetrics | null | undefined): EntryFieldsValue {
  return sliders ? { ...ENTRY_DEFAULTS, ...sliders } : ENTRY_DEFAULTS;
}

export function EntryForm() {
  const today = new Date();
  const latest = useLatestMetrics();

  return (
    <Card className="w-full max-w-xl max-sm:flex max-sm:flex-col">
      <CardHeader className="max-sm:flex-row max-sm:items-baseline max-sm:justify-between max-sm:p-4 max-sm:pb-3">
        <CardTitle className="text-xl">New Entry</CardTitle>
        <p className="text-sm text-muted-foreground">{format(today, "EEEE, d MMMM yyyy")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 max-sm:flex-1 max-sm:gap-4 max-sm:p-4 max-sm:pt-0">
        {latest.isPending ? (
          // Wait for the previous log's values so the sliders don't visibly jump from the defaults.
          <div className="flex h-96 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          // On error, fall back to the defaults rather than blocking a new entry.
          <EntryFormBody initial={freshFields(latest.data)} todayKey={format(today, "yyyy-MM-dd")} />
        )}
      </CardContent>
    </Card>
  );
}

function EntryFormBody({ initial, todayKey }: { initial: EntryFieldsValue; todayKey: string }) {
  const [fields, setFields] = useState<EntryFieldsValue>(initial);
  // Bumped after each save so the optional sections (Activities, People, Markers) fold back up.
  const [formKey, setFormKey] = useState(0);
  const create = useCreateEntry();
  const { data: sleepLoggedToday } = useSleepLoggedOn(todayKey);
  const { data: people } = usePeople();
  const activityInfo = useActivityLookup();

  async function handleSave() {
    const unrated = firstUnrated(fields.activities, activityInfo);
    if (unrated) {
      toast.error(`Rate how ${unrated} felt`);
      return;
    }
    const unratedPerson = firstUnratedPerson(fields.people, people);
    if (unratedPerson) {
      toast.error(`Rate ${unratedPerson}'s NP`);
      return;
    }
    try {
      await create.mutateAsync({
        ...fields,
        activities: toEntryActivities(fields.activities),
        people: toEntryPeople(fields.people),
        entry_date: todayKey,
      });
      toast.success("Entry saved");
      // The log just saved is now the "previous log", so keep its slider values.
      const { mood, energy, flow } = fields;
      setFields(freshFields({ mood, energy, flow }));
      setFormKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save entry");
    }
  }

  return (
    <>
      <EntryFields
        key={formKey}
        value={fields}
        onChange={(patch) => setFields((f) => ({ ...f, ...patch }))}
        sleepLoggedToday={sleepLoggedToday}
        fill
      />
      <Button onClick={handleSave} disabled={create.isPending} className="w-full max-sm:h-11" size="lg">
        {create.isPending && <Loader2 className="size-4 animate-spin" />}
        Save Entry
      </Button>
    </>
  );
}
