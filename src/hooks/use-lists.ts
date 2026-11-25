import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { activityKeyFor, makeActivityLookup } from "@/lib/activities";
import { ACTIVITIES_KEY, ENTRIES_KEY, GROUPS_KEY, LINKS_KEY, MARKERS_KEY, PEOPLE_KEY } from "@/hooks/use-entries";
import type { ActivityType } from "@/types/db";

/**
 * The user-managed lists: activities and markers (Settings), people (People page). Person
 * groups are here only for `useReorderList` — their edits and deletes live in use-people.ts.
 */
export type ListKind = "activities" | "people" | "markers" | "groups";

const LISTS = {
  activities: { table: "np_activities", nameCol: "label", key: ACTIVITIES_KEY, noun: "Activity" },
  people: { table: "np_people", nameCol: "name", key: PEOPLE_KEY, noun: "Person" },
  markers: { table: "np_markers", nameCol: "name", key: MARKERS_KEY, noun: "Marker" },
  groups: { table: "np_person_groups", nameCol: "name", key: GROUPS_KEY, noun: "Group" },
} as const;

function duplicateError(kind: ListKind, name: string) {
  return new Error(`${LISTS[kind].noun} "${name}" already exists`);
}

/** The user's activity list (`np_activities`), in manual order — hidden ones included. */
export function useActivities() {
  return useQuery({
    queryKey: ACTIVITIES_KEY,
    queryFn: async (): Promise<ActivityType[]> => {
      const { data, error } = await supabase
        .from("np_activities")
        .select("id, key, label, icon, hidden, position")
        .order("position", { nullsFirst: false })
        .order("id");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** `(key) => { label, Icon }` for stored activity keys, backed by `useActivities`. */
export function useActivityLookup() {
  const { data } = useActivities();
  return useMemo(() => makeActivityLookup(data), [data]);
}

export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ label, icon }: { label: string; icon: string }): Promise<ActivityType> => {
      const trimmed = label.trim();
      // Keys must stay unique per user, including hidden activities and keys still on old logs.
      const [types, logged] = await Promise.all([
        supabase.from("np_activities").select("key"),
        supabase.from("np_entry_activities").select("activity"),
      ]);
      if (types.error) throw types.error;
      if (logged.error) throw logged.error;
      const listKeys = (types.data ?? []).map((r) => r.key as string);
      // Re-adopting a key that's only on old logs would silently relabel those logs, so avoid it.
      const key = activityKeyFor(trimmed, [...listKeys, ...(logged.data ?? []).map((r) => r.activity as string)]);
      const { data, error } = await supabase
        .from("np_activities")
        .insert({ key, label: trimmed, icon })
        .select("id, key, label, icon, hidden, position")
        .single();
      if (error) {
        if (error.code === "23505") throw duplicateError("activities", trimmed);
        throw error;
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ACTIVITIES_KEY }),
  });
}

export interface ListItemPatch {
  id: number;
  name?: string;
  hidden?: boolean;
  /** Activities only. */
  icon?: string;
}

/** Rename / hide / show (and for activities, re-icon) an item of one of the lists. */
export function useUpdateListItem(kind: ListKind) {
  const qc = useQueryClient();
  const { table, nameCol, key } = LISTS[kind];
  return useMutation({
    mutationFn: async ({ id, name, hidden, icon }: ListItemPatch) => {
      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch[nameCol] = name.trim();
      if (hidden !== undefined) patch.hidden = hidden;
      if (icon !== undefined && kind === "activities") patch.icon = icon;
      const { error } = await supabase.from(table).update(patch).eq("id", id);
      if (error) {
        if (error.code === "23505") throw duplicateError(kind, name?.trim() ?? "");
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/**
 * Permanently deletes a list item and removes it from every log. People/markers go via
 * `on delete cascade`; activities are linked by key (no FK), so their log rows are deleted first.
 * A person's group memberships and connections cascade too.
 */
export function useDeleteListItem(kind: ListKind) {
  const qc = useQueryClient();
  const { table, key } = LISTS[kind];
  return useMutation({
    mutationFn: async ({ id, activityKey }: { id: number; activityKey?: string }) => {
      if (kind === "activities") {
        if (!activityKey) throw new Error("Missing activity key");
        const { error } = await supabase.from("np_entry_activities").delete().eq("activity", activityKey);
        if (error) throw error;
      }
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ENTRIES_KEY });
      if (kind === "people") {
        void qc.invalidateQueries({ queryKey: GROUPS_KEY });
        void qc.invalidateQueries({ queryKey: LINKS_KEY });
      }
    },
  });
}

interface Positioned {
  id: number;
  position: number | null;
}

/**
 * Saves a new order for a list: `ids` is the whole list in its new order. Only rows whose
 * position actually changes are written; the cached list is reordered right away (optimistic).
 */
export function useReorderList(kind: ListKind) {
  const qc = useQueryClient();
  const { table, key } = LISTS[kind];
  return useMutation({
    mutationFn: async ({ ids, before }: { ids: number[]; before: Positioned[] }) => {
      const prevPos = new Map(before.map((it) => [it.id, it.position]));
      const changed = ids.flatMap((id, position) => (prevPos.get(id) === position ? [] : [{ id, position }]));
      const results = await Promise.all(
        changed.map(({ id, position }) => supabase.from(table).update({ position }).eq("id", id)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onMutate: async ({ ids }) => {
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData<Positioned[]>(key, (old) => {
        if (!old) return old;
        const byId = new Map(old.map((it) => [it.id, it]));
        return ids.flatMap((id, position) => {
          const it = byId.get(id);
          return it ? [{ ...it, position }] : [];
        });
      });
    },
    // Refetch either way: confirms the saved order, or restores the real one after an error.
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
