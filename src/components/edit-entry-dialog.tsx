"use client";

import { useState } from "react";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { DecryptedEntry, SuccessStep } from "@/types/db";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EntryFields, type EntryFieldsValue } from "@/components/entry-fields";
import { firstUnrated, toEntryActivities } from "@/components/activity-picker";
import { firstUnratedPerson, toEntryPeople } from "@/components/people-picker";
import { usePeople, useUpdateEntry } from "@/hooks/use-entries";

function toFields(e: DecryptedEntry): EntryFieldsValue {
  return {
    mood: e.mood ?? 6,
    energy: e.energy ?? 6,
    flow: e.flow ?? 6,
    success: (e.success_step ?? 0) as SuccessStep,
    sleep: e.sleep_quality ?? null,
    activities: (e.activities ?? []).map((a) => ({ ...a })),
    people: (e.people ?? []).map((p) => ({ ...p })),
    markers: [...(e.markers ?? [])],
    note: e.comment ?? "",
  };
}

export function EditEntryDialog({ entry }: { entry: DecryptedEntry }) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<EntryFieldsValue>(() => toFields(entry));
  const update = useUpdateEntry();
  const { data: people } = usePeople();

  function handleOpenChange(next: boolean) {
    if (next) setFields(toFields(entry));
    setOpen(next);
  }

  async function handleSave() {
    const unrated = firstUnrated(fields.activities);
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
      await update.mutateAsync({
        id: entry.id,
        ...fields,
        activities: toEntryActivities(fields.activities),
        people: toEntryPeople(fields.people),
      });
      toast.success("Entry updated");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update entry");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Edit entry">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit entry</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <EntryFields value={fields} onChange={(patch) => setFields((f) => ({ ...f, ...patch }))} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
