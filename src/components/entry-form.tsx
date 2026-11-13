"use client";

import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EntryFields, ENTRY_DEFAULTS, type EntryFieldsValue } from "@/components/entry-fields";
import { firstUnrated, toEntryActivities } from "@/components/activity-picker";
import {
  useCreateEntry,
  useLatestMetrics,
  useSleepLoggedOn,
  type LatestMetrics,
} from "@/hooks/use-entries";

/** Fresh form: sliders carry over from the previous log; success, sleep, activities and note start empty. */
function freshFields(sliders: LatestMetrics | null | undefined): EntryFieldsValue {
  return sliders ? { ...ENTRY_DEFAULTS, ...sliders } : ENTRY_DEFAULTS;
}

export function EntryForm() {
  const today = new Date();
  const latest = useLatestMetrics();

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>New Entry</CardTitle>
        <p className="text-sm text-muted-foreground">{format(today, "EEEE, d MMMM yyyy")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
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
  const create = useCreateEntry();
  const { data: sleepLoggedToday } = useSleepLoggedOn(todayKey);

  async function handleSave() {
    const unrated = firstUnrated(fields.activities);
    if (unrated) {
      toast.error(`Rate how ${unrated} felt`);
      return;
    }
    try {
      await create.mutateAsync({
        ...fields,
        activities: toEntryActivities(fields.activities),
        entry_date: todayKey,
      });
      toast.success("Entry saved");
      // The log just saved is now the "previous log", so keep its slider values.
      const { mood, energy, flow } = fields;
      setFields(freshFields({ mood, energy, flow }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save entry");
    }
  }

  return (
    <>
      <EntryFields
        value={fields}
        onChange={(patch) => setFields((f) => ({ ...f, ...patch }))}
        sleepLoggedToday={sleepLoggedToday}
      />
      <Button onClick={handleSave} disabled={create.isPending} className="w-full" size="lg">
        {create.isPending && <Loader2 className="size-4 animate-spin" />}
        Save Entry
      </Button>
    </>
  );
}
