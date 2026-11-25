"use client";

import { useState } from "react";
import { Check, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/utils";
import { groupHex } from "@/lib/people";
import { useCreatePerson, type PeopleModel } from "@/hooks/use-people";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonAvatar } from "@/components/people/person-avatar";
import { GroupChip } from "@/components/people/group-chip";

/** New person: name, optionally straight into groups and with a first note. */
export function AddPersonDialog({
  model,
  open,
  onOpenChange,
  onCreated,
}: {
  model: PeopleModel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new person's id (the page opens their profile). */
  onCreated: (id: number) => void;
}) {
  const create = useCreatePerson();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const groups = model?.groups ?? [];
  const firstColor = groupIds.length ? groupHex(groups.find((g) => g.id === groupIds[0])?.color) : null;

  function reset() {
    setName("");
    setNote("");
    setGroupIds([]);
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (model?.people.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`"${trimmed}" is already in your people`);
      return;
    }
    try {
      const person = await create.mutateAsync({ name: trimmed, note, groupIds });
      toast.success(`${person.name} added`);
      reset();
      onOpenChange(false);
      onCreated(person.id);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't add them"));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5" />
            Add a person
          </DialogTitle>
          <DialogDescription>They&apos;ll show up on your web and in New Entry.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-center gap-3">
            <PersonAvatar name={name || "?"} color={firstColor} size={44} className="transition-colors" />
            <Input
              autoFocus
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              aria-label="Name"
              className="h-11 text-base"
            />
          </div>

          {groups.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Groups</span>
              <div className="flex flex-wrap gap-1.5">
                {model?.tree.ordered.map(({ group }) => {
                  const on = groupIds.includes(group.id);
                  return (
                    <GroupChip
                      key={group.id}
                      tree={model.tree}
                      group={group}
                      state={on ? "on" : "off"}
                      onClick={() =>
                        setGroupIds((ids) => (on ? ids.filter((id) => id !== group.id) : [...ids, group.id]))
                      }
                    />
                  );
                })}
              </div>
            </div>
          )}

          <Textarea
            value={note}
            maxLength={20000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="A first note — who they are to you, what's going on with them… (optional)"
            aria-label="Note"
            className="min-h-20"
          />

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!name.trim() || create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              Add
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
