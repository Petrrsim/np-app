import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  buildGroupTree,
  displayOrder,
  groupHex,
  orderPair,
  personStats,
  type GroupTree,
  type PersonStats,
} from "@/lib/people";
import { GROUPS_KEY, LINKS_KEY, PEOPLE_KEY, PERSON_COLUMNS, useEntries, usePeople } from "@/hooks/use-entries";
import type { LinkTone, Person, PersonGroup, PersonLink } from "@/types/db";

/**
 * People-page data: groups (`np_person_groups` + members), connections (`np_person_links`)
 * and person notes. All non-sensitive, direct RLS-scoped table access. Renaming, hiding,
 * reordering and deleting people/groups go through the generic hooks in use-lists.ts.
 */

/** The user's groups in manual order, each with its member ids. */
export function usePersonGroups() {
  return useQuery({
    queryKey: GROUPS_KEY,
    queryFn: async (): Promise<PersonGroup[]> => {
      const { data, error } = await supabase
        .from("np_person_groups")
        .select("id, name, color, position, parent_id, np_person_group_members(person_id)")
        .order("position", { nullsFirst: false })
        .order("id");
      if (error) throw error;
      return (data ?? []).map(({ np_person_group_members: rows, ...g }) => ({
        ...g,
        members: (rows ?? []).map((r: { person_id: number }) => r.person_id),
      }));
    },
  });
}

/** Every connection between two people. */
export function usePersonLinks() {
  return useQuery({
    queryKey: LINKS_KEY,
    queryFn: async (): Promise<PersonLink[]> => {
      const { data, error } = await supabase
        .from("np_person_links")
        .select("id, person_a, person_b, tone, label, updated_at")
        .order("id");
      if (error) throw error;
      return (data ?? []) as PersonLink[];
    },
  });
}

/** Adds a person, optionally with a note and straight into some groups. */
export function useCreatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      note = "",
      groupIds = [],
      romantic = false,
    }: {
      name: string;
      note?: string;
      groupIds?: number[];
      romantic?: boolean;
    }): Promise<Person> => {
      const trimmed = name.trim();
      const text = note.trim();
      const { data, error } = await supabase
        .from("np_people")
        .insert({ name: trimmed, note: text, note_updated_at: text ? new Date().toISOString() : null, romantic })
        .select(PERSON_COLUMNS)
        .single();
      if (error) {
        // Unique (user_id, lower(name)) violation.
        if (error.code === "23505") throw new Error(`"${trimmed}" is already in your people`);
        throw error;
      }
      if (groupIds.length > 0) {
        const { error: memberError } = await supabase
          .from("np_person_group_members")
          .insert(groupIds.map((group_id) => ({ group_id, person_id: data.id })));
        if (memberError) throw new Error(`${trimmed} was added, but the groups failed: ${memberError.message}`);
      }
      return data;
    },
    onSettled: (_data, _err, vars) => {
      void qc.invalidateQueries({ queryKey: PEOPLE_KEY });
      if (vars.groupIds?.length) void qc.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

/**
 * Saves a person's note. The cache is updated right away (so reopening the person shows the
 * new text); saves run one at a time in call order, so a slow early save can't win.
 */
export function useSavePersonNote() {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: "person-note" },
    mutationFn: async ({ id, note, at }: { id: number; note: string; at: string }) => {
      const { error } = await supabase.from("np_people").update({ note, note_updated_at: at }).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, note, at }) => {
      qc.setQueryData<Person[]>(PEOPLE_KEY, (old) =>
        old?.map((p) => (p.id === id ? { ...p, note, note_updated_at: at } : p)),
      );
    },
    onError: () => qc.invalidateQueries({ queryKey: PEOPLE_KEY }),
  });
}

/** Saves your energy with a person (null = not set); optimistic, one save at a time. */
export function useSaveVibe() {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: "person-vibe" },
    mutationFn: async ({ id, vibe }: { id: number; vibe: LinkTone | null }) => {
      const { error } = await supabase.from("np_people").update({ vibe }).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, vibe }) => {
      qc.setQueryData<Person[]>(PEOPLE_KEY, (old) => old?.map((p) => (p.id === id ? { ...p, vibe } : p)));
    },
    onError: () => qc.invalidateQueries({ queryKey: PEOPLE_KEY }),
  });
}

/** Sets / clears the heart (romantic relationship) on a person; optimistic, one save at a time. */
export function useSaveRomantic() {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: "person-romantic" },
    mutationFn: async ({ id, romantic }: { id: number; romantic: boolean }) => {
      const { error } = await supabase.from("np_people").update({ romantic }).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, romantic }) => {
      qc.setQueryData<Person[]>(PEOPLE_KEY, (old) => old?.map((p) => (p.id === id ? { ...p, romantic } : p)));
    },
    onError: () => qc.invalidateQueries({ queryKey: PEOPLE_KEY }),
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      color,
      memberIds,
      parentId = null,
    }: {
      name: string;
      color: string;
      memberIds: number[];
      parentId?: number | null;
    }) => {
      const trimmed = name.trim();
      const { data, error } = await supabase
        .from("np_person_groups")
        .insert({ name: trimmed, color, parent_id: parentId })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") throw new Error(`Group "${trimmed}" already exists`);
        throw error;
      }
      if (memberIds.length > 0) {
        const { error: memberError } = await supabase
          .from("np_person_group_members")
          .insert(memberIds.map((person_id) => ({ group_id: data.id, person_id })));
        if (memberError) throw new Error(`Group created, but adding people failed: ${memberError.message}`);
      }
      return data.id as number;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: GROUPS_KEY }),
  });
}

/** Rename / recolour a group, or move it inside another group (`parentId` null = top level). */
export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      name,
      color,
      parentId,
    }: {
      id: number;
      name?: string;
      color?: string;
      parentId?: number | null;
    }) => {
      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name.trim();
      if (color !== undefined) patch.color = color;
      if (parentId !== undefined) patch.parent_id = parentId;
      const { error } = await supabase.from("np_person_groups").update(patch).eq("id", id);
      if (error) {
        if (error.code === "23505") throw new Error(`Group "${name?.trim()}" already exists`);
        if (error.code === "23514") throw new Error("A group can't go inside one of its own subgroups");
        throw error;
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: GROUPS_KEY }),
  });
}

/**
 * Deletes a group. Its subgroups move up into its parent (or to the top level) and its people
 * stay — only the group and its memberships go.
 */
export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, parentId }: { id: number; parentId: number | null }) => {
      const { error: moveError } = await supabase
        .from("np_person_groups")
        .update({ parent_id: parentId })
        .eq("parent_id", id);
      if (moveError) throw moveError;
      const { error } = await supabase.from("np_person_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: GROUPS_KEY }),
  });
}

/** Membership changes as (group, person, in?) triples; the cache updates optimistically. */
export interface MembershipChange {
  groupId: number;
  personId: number;
  member: boolean;
}

/** Adds / removes people to / from groups (from a group's editor or a person's profile). */
export function useSetMemberships() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changes: MembershipChange[]) => {
      const add = changes.filter((c) => c.member).map((c) => ({ group_id: c.groupId, person_id: c.personId }));
      const remove = changes.filter((c) => !c.member);
      if (add.length > 0) {
        const { error } = await supabase
          .from("np_person_group_members")
          .upsert(add, { onConflict: "group_id,person_id", ignoreDuplicates: true });
        if (error) throw error;
      }
      // Grouped by group so it's one delete per group.
      const byGroup = new Map<number, number[]>();
      for (const c of remove) byGroup.set(c.groupId, [...(byGroup.get(c.groupId) ?? []), c.personId]);
      for (const [groupId, personIds] of byGroup) {
        const { error } = await supabase
          .from("np_person_group_members")
          .delete()
          .eq("group_id", groupId)
          .in("person_id", personIds);
        if (error) throw error;
      }
    },
    onMutate: async (changes) => {
      await qc.cancelQueries({ queryKey: GROUPS_KEY });
      qc.setQueryData<PersonGroup[]>(GROUPS_KEY, (old) =>
        old?.map((g) => {
          let members = g.members;
          for (const c of changes) {
            if (c.groupId !== g.id) continue;
            members = c.member
              ? members.includes(c.personId)
                ? members
                : [...members, c.personId]
              : members.filter((id) => id !== c.personId);
          }
          return members === g.members ? g : { ...g, members };
        }),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: GROUPS_KEY }),
  });
}

/** Creates or updates the connection between two people (one per pair). */
export function useSaveLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ a, b, tone, label }: { a: number; b: number; tone: LinkTone; label: string }) => {
      const [person_a, person_b] = orderPair(a, b);
      const { error } = await supabase
        .from("np_person_links")
        .upsert(
          { person_a, person_b, tone, label: label.trim(), updated_at: new Date().toISOString() },
          { onConflict: "person_a,person_b" },
        );
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: LINKS_KEY }),
  });
}

export function useDeleteLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("np_person_links").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: LINKS_KEY });
      qc.setQueryData<PersonLink[]>(LINKS_KEY, (old) => old?.filter((l) => l.id !== id));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: LINKS_KEY }),
  });
}

/** Everything the People page shows, with lookups. `stats` is null until the history loads. */
export interface PeopleModel {
  /** Saved order, hidden people last. */
  people: Person[];
  /** Flat, in saved order (see `tree` for the nesting). */
  groups: PersonGroup[];
  tree: GroupTree;
  links: PersonLink[];
  stats: Map<number, PersonStats> | null;
  person: (id: number) => Person | undefined;
  nameOf: (id: number) => string;
  /** Groups the person is directly in, in tree order. */
  groupsOf: (id: number) => PersonGroup[];
  /** Every group the person belongs to — directly, or through a subgroup — in tree order. */
  memberships: (id: number) => { group: PersonGroup; direct: boolean }[];
  /** Hex of the person's first (direct) group, or null when they're in none. */
  colorOf: (id: number) => string | null;
}

export function usePeopleModel() {
  const people = usePeople();
  const groups = usePersonGroups();
  const links = usePersonLinks();
  const { data: entries } = useEntries();

  const stats = useMemo(() => (entries ? personStats(entries) : null), [entries]);
  const model = useMemo((): PeopleModel | null => {
    if (!people.data || !groups.data || !links.data) return null;
    const byId = new Map(people.data.map((p) => [p.id, p]));
    const tree = buildGroupTree(groups.data);
    const groupsBy = new Map<number, PersonGroup[]>();
    for (const { group } of tree.ordered) {
      for (const id of group.members) groupsBy.set(id, [...(groupsBy.get(id) ?? []), group]);
    }
    return {
      people: displayOrder(people.data),
      groups: groups.data,
      tree,
      // Links whose people both still exist (a delete may be mid-refetch).
      links: links.data.filter((l) => byId.has(l.person_a) && byId.has(l.person_b)),
      stats,
      person: (id) => byId.get(id),
      nameOf: (id) => byId.get(id)?.name ?? "…",
      groupsOf: (id) => groupsBy.get(id) ?? [],
      memberships: (id) => {
        const direct = new Set((groupsBy.get(id) ?? []).map((g) => g.id));
        const via = new Set([...direct].flatMap((g) => tree.ancestors(g)));
        return tree.ordered
          .filter(({ group }) => direct.has(group.id) || via.has(group.id))
          .map(({ group }) => ({ group, direct: direct.has(group.id) }));
      },
      colorOf: (id) => {
        const g = groupsBy.get(id)?.[0];
        return g ? groupHex(g.color) : null;
      },
    };
  }, [people.data, groups.data, links.data, stats]);

  return {
    model,
    isPending: people.isPending || groups.isPending || links.isPending,
    error: people.error ?? groups.error ?? links.error,
  };
}
