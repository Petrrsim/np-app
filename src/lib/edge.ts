import { supabase } from "@/lib/supabase";
import type { DecryptedEntry, SaveEntryPayload, UpdateEntryPayload } from "@/types/db";

async function invoke<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.text === "function") {
      const raw = await ctx.text().catch(() => "");
      if (raw) {
        let detail = raw;
        try {
          const parsed = JSON.parse(raw);
          detail = parsed.error ?? parsed.message ?? raw;
        } catch {
          // not JSON — use raw text
        }
        throw new Error(`${name} (${ctx.status}): ${detail}`);
      }
    }
    throw error;
  }
  return data as T;
}

/**
 * Encrypted-entry I/O. Notes are encrypted server-side, so reads/writes of entries
 * must go through these edge functions — never touch np_entries.comment(_encrypted) directly.
 */
export const edge = {
  // `sleep` and `activities` are not part of the deployed functions' contract — they're written
  // by direct table access in use-entries.ts, so they're stripped from the edge payloads here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  saveEntry: ({ sleep: _sleep, activities: _activities, ...payload }: SaveEntryPayload) =>
    invoke<{ ok: true; id?: number }>("save-entry", { ...payload }),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  updateEntry: ({ id, note, sleep: _sleep, activities: _activities, ...rest }: UpdateEntryPayload) =>
    // The deployed update-entry function expects `entryId`/`comment`, not `id`/`note`.
    invoke<{ ok: true }>("update-entry", { entryId: id, comment: note, ...rest }),
  // Returns newest-first. Defaults to only 20 rows; `limit` is capped at 1000 server-side,
  // so callers page through the full history with `offset`.
  decryptEntries: (page: { limit?: number; offset?: number } = {}) =>
    invoke<{ entries: DecryptedEntry[] }>("decrypt-entries", { ...page }),
};
