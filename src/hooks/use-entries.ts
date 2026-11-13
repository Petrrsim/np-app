import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { edge } from "@/lib/edge";
import type {
  DecryptedEntry,
  EntryActivity,
  SaveEntryPayload,
  SleepQuality,
  UpdateEntryPayload,
} from "@/types/db";

export const ENTRIES_KEY = ["entries"] as const;

// decrypt-entries returns at most 1000 rows per call (20 if no limit is sent).
const PAGE_SIZE = 1000;

/**
 * Loads the full decrypted history. The row count comes from a direct (RLS-scoped,
 * non-sensitive) count query so all pages can be fetched from the edge function in parallel.
 */
async function fetchAllEntries(): Promise<DecryptedEntry[]> {
  const { count, error } = await supabase
    .from("np_entries")
    .select("id", { count: "exact", head: true });
  if (error) throw error;

  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const range = Array.from({ length: pages }, (_, i) => i);
  const [results, sleep, activities] = await Promise.all([
    Promise.all(
      range.map((i) => edge.decryptEntries({ limit: PAGE_SIZE, offset: i * PAGE_SIZE })),
    ),
    fetchSleepById(range),
    fetchActivitiesByEntry(),
  ]);

  // Dedupe by id in case an entry was added/removed between page requests.
  const byId = new Map<number, DecryptedEntry>();
  for (const { entries } of results) {
    for (const e of entries ?? []) {
      byId.set(e.id, {
        ...e,
        comment: e.comment ?? "",
        sleep_quality: sleep.get(e.id) ?? null,
        activities: activities.get(e.id) ?? [],
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

export function useEntries() {
  return useQuery({
    queryKey: ENTRIES_KEY,
    queryFn: async () => {
      const entries = await fetchAllEntries();
      return entries.sort((a, b) => {
        if (a.entry_date === b.entry_date) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        return a.entry_date < b.entry_date ? 1 : -1;
      }) as DecryptedEntry[];
    },
  });
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
      if (payload.sleep == null && payload.activities.length === 0) return res;

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
      return res;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ENTRIES_KEY }),
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
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ENTRIES_KEY }),
  });
}

export function useDeleteEntry() {
  const qc = useQueryClient();
  return useMutation({
    // np_entry_activities rows go with it (on delete cascade).
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("np_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ENTRIES_KEY }),
  });
}
