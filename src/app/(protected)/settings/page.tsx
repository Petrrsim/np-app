"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Activity, ChevronRight, Tag, Users } from "lucide-react";
import { useCreateMarker, useEntries, useMarkers, usePeople } from "@/hooks/use-entries";
import { useActivities, useCreateActivity } from "@/hooks/use-lists";
import { ListManager } from "@/components/settings/list-manager";
import { DataCard } from "@/components/settings/data-card";
import { AccountCard } from "@/components/settings/account-card";
import { Card } from "@/components/ui/card";

export default function SettingsPage() {
  const { data: entries } = useEntries();
  const activities = useActivities();
  const people = usePeople();
  const markers = useMarkers();
  const createActivity = useCreateActivity();
  const createMarker = useCreateMarker();

  // How many logs use each item, from the cached history (null until it's loaded).
  const counts = useMemo(() => {
    if (!entries) return null;
    const byKey = new Map<string, number>();
    const byMarker = new Map<number, number>();
    const bump = <K,>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);
    for (const e of entries) {
      for (const a of e.activities) bump(byKey, a.activity);
      for (const id of e.markers) bump(byMarker, id);
    }
    return { byKey, byMarker };
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

        {/* People are managed on their own page (notes, groups, connections). */}
        <Card className="transition-colors hover:bg-accent/40">
          <Link href="/people" className="flex items-center gap-3 p-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Users className="size-4" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-base font-semibold">People</span>
              <span className="text-sm text-muted-foreground">
                {people.data ? `${people.data.length} people · ` : ""}add, group and connect them on the People page
              </span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </Card>

        <h2 className="mt-4 px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          General
        </h2>
        <DataCard />
        <AccountCard />
      </div>
    </main>
  );
}
