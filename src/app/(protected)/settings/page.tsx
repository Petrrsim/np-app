"use client";

import { useMemo } from "react";
import { Activity, Tag, User } from "lucide-react";
import { useCreateMarker, useCreatePerson, useEntries, useMarkers, usePeople } from "@/hooks/use-entries";
import { useActivities, useCreateActivity } from "@/hooks/use-lists";
import { ListManager } from "@/components/settings/list-manager";
import { DataCard } from "@/components/settings/data-card";
import { AccountCard } from "@/components/settings/account-card";

export default function SettingsPage() {
  const { data: entries } = useEntries();
  const activities = useActivities();
  const people = usePeople();
  const markers = useMarkers();
  const createActivity = useCreateActivity();
  const createPerson = useCreatePerson();
  const createMarker = useCreateMarker();

  // How many logs use each item, from the cached history (null until it's loaded).
  const counts = useMemo(() => {
    if (!entries) return null;
    const byKey = new Map<string, number>();
    const byPerson = new Map<number, number>();
    const byMarker = new Map<number, number>();
    const bump = <K,>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);
    for (const e of entries) {
      for (const a of e.activities) bump(byKey, a.activity);
      for (const p of e.people) bump(byPerson, p.person_id);
      for (const id of e.markers) bump(byMarker, id);
    }
    return { byKey, byPerson, byMarker };
  }, [entries]);

  const activityCounts = useMemo(() => {
    if (!counts || !activities.data) return null;
    return new Map(activities.data.map((a) => [a.id, counts.byKey.get(a.key) ?? 0]));
  }, [counts, activities.data]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage what you can add to a log. Hiding keeps an item on past logs but takes it out of the form.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <ListManager
          kind="activities"
          title="Activities"
          description="Rated Rough / OK / Great on each log. Tap an icon to change it."
          noun="activity"
          placeholder="New activity"
          Icon={Activity}
          withIcons
          items={activities.data?.map((a) => ({
            id: a.id,
            name: a.label,
            hidden: a.hidden,
            position: a.position,
            icon: a.icon,
            activityKey: a.key,
          }))}
          isPending={activities.isPending}
          isError={activities.isError}
          counts={activityCounts}
          onAdd={async (label, icon) => {
            await createActivity.mutateAsync({ label, icon });
          }}
        />
        <ListManager
          kind="people"
          title="People"
          description="People you log with their NP (life energy): Low / OK / Great."
          noun="person"
          placeholder="New person"
          Icon={User}
          items={people.data}
          isPending={people.isPending}
          isError={people.isError}
          counts={counts?.byPerson ?? null}
          onAdd={async (name) => {
            await createPerson.mutateAsync(name);
          }}
        />
        <ListManager
          kind="markers"
          title="Markers"
          description="Tags for logs, filterable in History."
          noun="marker"
          placeholder="New marker"
          Icon={Tag}
          items={markers.data}
          isPending={markers.isPending}
          isError={markers.isError}
          counts={counts?.byMarker ?? null}
          onAdd={async (name) => {
            await createMarker.mutateAsync(name);
          }}
        />

        <h2 className="mt-4 px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          General
        </h2>
        <DataCard />
        <AccountCard />
      </div>
    </main>
  );
}
