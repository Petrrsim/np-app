"use client";

import { useState } from "react";
import { UserPlus, UsersRound } from "lucide-react";
import { usePeopleModel } from "@/hooks/use-people";
import { Button } from "@/components/ui/button";
import { PeopleWeb } from "@/components/people/people-web";
import { GroupsSection } from "@/components/people/groups-section";
import { PeopleList } from "@/components/people/people-list";
import { PersonSheet } from "@/components/people/person-sheet";
import { AddPersonDialog } from "@/components/people/add-person-dialog";

export default function PeoplePage() {
  const { model, isPending, error } = usePeopleModel();
  // Profiles opened in a row (tapping a connection inside a profile): the last one is shown.
  const [trail, setTrail] = useState<number[]>([]);
  const [adding, setAdding] = useState(false);

  const open = (id: number) => setTrail((t) => (t[t.length - 1] === id ? t : [...t, id]));
  const openFresh = (id: number) => setTrail([id]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">People</h1>
          <p className="text-sm text-muted-foreground">
            Who&apos;s around you, how they&apos;re connected, what to remember.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)} disabled={!model}>
          <UserPlus />
          Add person
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load people"}</p>
      ) : isPending || !model ? (
        <div className="flex flex-col gap-3">
          <div className="h-96 animate-pulse rounded-2xl bg-muted" />
          <div className="h-32 animate-pulse rounded-2xl bg-muted" />
        </div>
      ) : model.people.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-input bg-card/60 px-6 py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-muted">
            <UsersRound className="size-7 text-muted-foreground" />
          </span>
          <h2 className="text-base font-semibold">Start your web</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add the people in your life, keep a note on each, put them into groups and connect them with each other.
          </p>
          <Button onClick={() => setAdding(true)}>
            <UserPlus />
            Add your first person
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <PeopleWeb model={model} onOpen={openFresh} />
          <GroupsSection model={model} onOpen={openFresh} />
          <PeopleList model={model} onOpen={openFresh} />
        </div>
      )}

      {model && (
        <PersonSheet
          model={model}
          personId={trail[trail.length - 1] ?? null}
          backTo={trail.length > 1 ? trail[trail.length - 2] : null}
          onBack={() => setTrail((t) => t.slice(0, -1))}
          onOpen={open}
          onClose={() => setTrail([])}
        />
      )}
      <AddPersonDialog model={model} open={adding} onOpenChange={setAdding} onCreated={openFresh} />
    </main>
  );
}
