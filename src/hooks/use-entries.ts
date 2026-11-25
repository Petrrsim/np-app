import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { edge } from "@/lib/edge";
import type {
  DecryptedEntry,
  EntryActivity,
  EntryPerson,
  Marker,
  Person,
  SaveEntryPayload,
  SleepQuality,
  UpdateEntryPayload,
} from "@/types/db";

export const ENTRIES_KEY = ["entries"] as const;
export const MARKERS_KEY = ["markers"] as const;
export const PEOPLE_KEY = ["people"] as const;
export const ACTIVITIES_KEY = ["activities"] as const;
export const GROUPS_KEY = ["person-groups"] as const;
export const LINKS_KEY = ["person-links"] as const;

/** Columns of `np_people` the app reads (the list, pickers and the People page share them). */
export const PERSON_COLUMNS = "id, name, hidden, position, note, note_updated_at, vibe";

// decrypt-entries returns at most 1000 rows per call (20 if no limit is sent).
const PAGE_SIZE = 1000;
// decrypt-entries orders by date/time only, and ~1k imported logs share both, so tied rows can
// swap across a page boundary (one returned twice, its twin never). Decrypt pages therefore
// overlap by 100 rows; duplicates are dropped by id below.
const DECRYPT_STRIDE = 900;

/**
 * Loads the full decrypted history. The row count comes from a direct (RLS-scoped,
 * non-sensitive) count query so all pages can be fetched from the edge function in parallel.
 */
async function fetchAllEntries(): Promise<DecryptedEntry[]> {
  // Nothing here depends on the count except pages 2+, so the first page and the
  // activity/marker reads start right away instead of waiting for it.
  const firstPage = edge.decryptEntries({ limit: PAGE_SIZE, offset: 0 });
  const activitiesReq = fetchActivitiesByEntry();
  const markersReq = fetchMarkersByEntry();
  const peopleReq = fetchPeopleByEntry();
  // Avoid unhandled rejections if the count query throws before these are awaited.
  for (const p of [firstPage, activitiesReq, markersReq, peopleReq]) p.catch(() => {});

  const { count, error } = await supabase
    .from("np_entries")
    .select("id", { count: "exact", head: true });
  if (error) throw error;

  const total = count ?? 0;
  const decryptPages = Math.max(1, Math.ceil(total / DECRYPT_STRIDE));
  const sleepPages = Array.from({ length: Math.max(1, Math.ceil(total / PAGE_SIZE)) }, (_, i) => i);
  const [results, sleep, activities, markers, people] = await Promise.all([
    Promise.all(
      Array.from({ length: decryptPages }, (_, i) =>
        i === 0 ? firstPage : edge.decryptEntries({ limit: PAGE_SIZE, offset: i * DECRYPT_STRIDE }),
      ),
    ),
    fetchSleepById(sleepPages),
    activitiesReq,
    markersReq,
    peopleReq,
  ]);

  // Dedupe by id: pages overlap, and an entry can be added/removed between page requests.
  const byId = new Map<number, DecryptedEntry>();
  for (const { entries } of results) {
    for (const e of entries ?? []) {
      byId.set(e.id, {
        ...e,
        comment: e.comment ?? "",
        sleep_quality: sleep.get(e.id) ?? null,
        activities: activities.get(e.id) ?? [],
        people: people.get(e.id) ?? [],
        markers: markers.get(e.id) ?? [],
      });
    }
  }
  return [...byId.values()];
}

/**
 * sleep_quality is non-sensitive and not guaranteed to be returned by the deployed
 * decrypt-entries function, so it's read directly (RLS-scoped) and merged in by id.
 */
async function fetchSleepById(pages: number[]): Promise<Map<number, SleepQuality>> {
  const results = await Promise.all(
    pages.map((i) =>
      supabase
        .from("np_entries")
        .select("id, sleep_quality")
        .not("sleep_quality", "is", null)
        .order("id")
        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1),
    ),
  );
  const map = new Map<number, SleepQuality>();
  for (const { data, error } of results) {
    if (error) throw error;
    for (const row of data ?? []) map.set(row.id, row.sleep_quality as SleepQuality);
  }
  return map;
}

/** All logged activities (direct RLS-scoped read), grouped by entry id in the order logged. */
async function fetchActivitiesByEntry(): Promise<Map<number, EntryActivity[]>> {
  const map = new Map<number, EntryActivity[]>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("np_entry_activities")
      .select("entry_id, activity, feeling")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const list = map.get(row.entry_id) ?? [];
      list.push({ activity: row.activity, feeling: row.feeling });
      map.set(row.entry_id, list);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return map;
}

/** All entry↔marker links (direct RLS-scoped read), grouped by entry id. */
async function fetchMarkersByEntry(): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("np_entry_markers")
      .select("entry_id, marker_id")
      .order("entry_id")
      .order("marker_id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const list = map.get(row.entry_id) ?? [];
      list.push(row.marker_id);
      map.set(row.entry_id, list);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return map;
}

/** All entry↔person links with their NP (direct RLS-scoped read), grouped by entry id. */
async function fetchPeopleByEntry(): Promise<Map<number, EntryPerson[]>> {
  const map = new Map<number, EntryPerson[]>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("np_entry_people")
      .select("entry_id, person_id, np")
      .order("entry_id")
      .order("created_at")
      .order("person_id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const list = map.get(row.entry_id) ?? [];
      list.push({ person_id: row.person_id, np: row.np });
      map.set(row.entry_id, list);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return map;
}

async function insertPeople(entryId: number, people: EntryPerson[]) {
  if (people.length === 0) return;
  const { error } = await supabase
    .from("np_entry_people")
    .insert(people.map((p) => ({ entry_id: entryId, ...p })));
  if (error) throw error;
}

/** Makes the entry's people exactly `people`: removes dropped ones, upserts the rest. */
async function replacePeople(entryId: number, people: EntryPerson[]) {
  let del = supabase.from("np_entry_people").delete().eq("entry_id", entryId);
  if (people.length > 0) {
    del = del.not("person_id", "in", `(${people.map((p) => p.person_id).join(",")})`);
  }
  const { error } = await del;
  if (error) throw error;
  if (people.length === 0) return;
  const { error: upsertError } = await supabase
    .from("np_entry_people")
    .upsert(
      people.map((p) => ({ entry_id: entryId, ...p })),
      { onConflict: "entry_id,person_id" },
    );
  if (upsertError) throw upsertError;
}

async function insertMarkers(entryId: number, markerIds: number[]) {
  if (markerIds.length === 0) return;
  const { error } = await supabase
    .from("np_entry_markers")
    .insert(markerIds.map((marker_id) => ({ entry_id: entryId, marker_id })));
  if (error) throw error;
}

/** Makes the entry's markers exactly `markerIds`: removes dropped ones, adds new ones. */
async function replaceMarkers(entryId: number, markerIds: number[]) {
  let del = supabase.from("np_entry_markers").delete().eq("entry_id", entryId);
  if (markerIds.length > 0) del = del.not("marker_id", "in", `(${markerIds.join(",")})`);
  const { error } = await del;
  if (error) throw error;
  if (markerIds.length === 0) return;
  const { error: upsertError } = await supabase
    .from("np_entry_markers")
    .upsert(
      markerIds.map((marker_id) => ({ entry_id: entryId, marker_id })),
      { onConflict: "entry_id,marker_id", ignoreDuplicates: true },
    );
  if (upsertError) throw upsertError;
}

async function insertActivities(entryId: number, activities: EntryActivity[]) {
  if (activities.length === 0) return;
  const { error } = await supabase
    .from("np_entry_activities")
    .insert(activities.map((a) => ({ entry_id: entryId, ...a })));
  if (error) throw error;
}

/** Makes the entry's activities exactly `activities`: removes dropped ones, upserts the rest. */
async function replaceActivities(entryId: number, activities: EntryActivity[]) {
  let del = supabase.from("np_entry_activities").delete().eq("entry_id", entryId);
  // Keys are constrained to [a-z0-9_] by a DB check, so they're safe in the `in` list.
  if (activities.length > 0) {
    del = del.not("activity", "in", `(${activities.map((a) => a.activity).join(",")})`);
  }
  const { error } = await del;
  if (error) throw error;
  if (activities.length === 0) return;
  const { error: upsertError } = await supabase
    .from("np_entry_activities")
    .upsert(
      activities.map((a) => ({ entry_id: entryId, ...a })),
      { onConflict: "entry_id,activity" },
    );
  if (upsertError) throw upsertError;
}

/**
 * save-entry may not return the new row's id; fall back to the newest row for that date
 * (single-user app, so this is the row just inserted).
 */
async function resolveNewEntryId(id: number | undefined, entryDate: string): Promise<number> {
  if (id) return id;
  const { data, error } = await supabase
    .from("np_entries")
    .select("id")
    .eq("entry_date", entryDate)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return data.id;
}

// The full history is ~5 edge calls + decryption of every note, so it's kept fresh for longer
// than the default; every entry mutation invalidates it anyway.
const entriesQuery = {
  queryKey: ENTRIES_KEY,
  staleTime: 5 * 60_000,
  queryFn: async () => {
    const entries = await fetchAllEntries();
    return entries.sort((a, b) => {
      if (a.entry_date === b.entry_date) {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return a.entry_date < b.entry_date ? 1 : -1;
    }) as DecryptedEntry[];
  },
};

export function useEntries() {
  return useQuery(entriesQuery);
}

/** Warms the history cache in the background so History opens without a loading state. */
export function usePrefetchEntries(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (enabled) void qc.prefetchQuery(entriesQuery);
  }, [enabled, qc]);
}

export interface LatestMetrics {
  mood: number;
  energy: number;
  flow: number;
}

/**
 * Slider values from the most recent log (any day), used to seed New Entry. Direct
 * RLS-scoped read of non-sensitive columns only — no decryption needed. `null` = no logs yet.
 */
export function useLatestMetrics() {
  return useQuery({
    queryKey: [...ENTRIES_KEY, "latest-metrics"],
    queryFn: async (): Promise<LatestMetrics | null> => {
      const { data, error } = await supabase
        .from("np_entries")
        .select("mood, energy, flow")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        mood: Math.round(Number(data.mood ?? 6)),
        energy: Math.round(Number(data.energy ?? 6)),
        flow: Math.round(Number(data.flow ?? 6)),
      };
    },
  });
}

/** Sleep quality already logged on an entry for `entryDate` (newest wins), or null. */
export function useSleepLoggedOn(entryDate: string) {
  return useQuery({
    // Prefixed with ENTRIES_KEY so every entry mutation's invalidation refreshes it too.
    queryKey: [...ENTRIES_KEY, "sleep-on", entryDate],
    queryFn: async (): Promise<SleepQuality | null> => {
      const { data, error } = await supabase
        .from("np_entries")
        .select("sleep_quality")
        .eq("entry_date", entryDate)
        .not("sleep_quality", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data?.sleep_quality as SleepQuality | undefined) ?? null;
    },
  });
}

export function useCreateEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SaveEntryPayload) => {
      const res = await edge.saveEntry(payload);
      if (
        payload.sleep == null &&
        payload.activities.length === 0 &&
        payload.people.length === 0 &&
        payload.markers.length === 0
      ) {
        return res;
      }

      const id = await resolveNewEntryId(res?.id, payload.entry_date);
      if (payload.sleep != null) {
        const { error } = await supabase
          .from("np_entries")
          .update({ sleep_quality: payload.sleep })
          .eq("id", id);
        if (error) throw new Error(`Entry saved, but sleep quality failed: ${error.message}`);
      }
      try {
        await insertActivities(id, payload.activities);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Entry saved, but activities failed: ${msg}`);
      }
      try {
        await insertPeople(id, payload.people);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Entry saved, but people failed: ${msg}`);
      }
      try {
        await insertMarkers(id, payload.markers);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Entry saved, but markers failed: ${msg}`);
      }
      return res;
    },
    // Not awaited (the save button shouldn't wait for it); "all" also refreshes the cached
    // history while still on New Entry, so History already has the new log when opened.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ENTRIES_KEY, refetchType: "all" });
    },
  });
}

export function useUpdateEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateEntryPayload) => {
      // The encrypted note must go through the edge function (server-side encryption).
      // The deployed `update-entry` only writes the comment, so the non-sensitive metrics
      // are updated via direct table access (RLS authorizes), matching delete/profile writes.
      await edge.updateEntry(payload);
      const { mood, energy, flow, success, sleep } = payload;
      const { error } = await supabase
        .from("np_entries")
        .update({ mood, energy, flow, success_step: success, sleep_quality: sleep })
        .eq("id", payload.id);
      if (error) throw error;
      await replaceActivities(payload.id, payload.activities);
      await replacePeople(payload.id, payload.people);
      await replaceMarkers(payload.id, payload.markers);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ENTRIES_KEY }),
  });
}

export function useDeleteEntry() {
  const qc = useQueryClient();
  return useMutation({
    // np_entry_activities / np_entry_people / np_entry_markers rows go with it (on delete cascade).
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("np_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ENTRIES_KEY }),
  });
}

/** The user's marker list, in their manual order (then creation order). */
export function useMarkers() {
  return useQuery({
    queryKey: MARKERS_KEY,
    queryFn: async (): Promise<Marker[]> => {
      const { data, error } = await supabase
        .from("np_markers")
        .select("id, name, hidden, position")
        .order("position", { nullsFirst: false })
        .order("id");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateMarker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<Marker> => {
      const { data, error } = await supabase
        .from("np_markers")
        .insert({ name: name.trim() })
        .select("id, name, hidden, position")
        .single();
      if (error) {
        // Unique (user_id, lower(name)) violation.
        if (error.code === "23505") throw new Error(`Marker "${name.trim()}" already exists`);
        throw error;
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MARKERS_KEY }),
  });
}

/** The user's people list, in their manual order (then creation order). */
export function usePeople() {
  return useQuery({
    queryKey: PEOPLE_KEY,
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await supabase
        .from("np_people")
        .select(PERSON_COLUMNS)
        .order("position", { nullsFirst: false })
        .order("id");
      if (error) throw error;
      return data ?? [];
    },
  });
}
