export type SuccessStep = -1 | 0 | 1;

/** Optional per-entry sleep quality: 1 = poor, 2 = fine, 3 = good. `null` = not logged. */
export type SleepQuality = 1 | 2 | 3;

/** How an activity felt: 1 = rough, 2 = ok, 3 = great. */
export type ActivityFeeling = 1 | 2 | 3;

/** A row of `np_entry_activities` (minus ids). `activity` is a key from src/lib/activities.ts. */
export interface EntryActivity {
  activity: string;
  feeling: ActivityFeeling;
}

export interface NpProfile {
  id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface NpEntry {
  id: number;
  user_id: string;
  entry_date: string;
  mood: number | null;
  energy: number | null;
  flow: number | null;
  success_step: SuccessStep | null;
  tiredness: number | null;
  sleep_quality: SleepQuality | null;
  comment: string | null;
  comment_encrypted: string | null;
  keyword: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** What `decrypt-entries` returns: `comment` is the decrypted plaintext note. */
export interface DecryptedEntry extends NpEntry {
  comment: string;
  /** Merged in from `np_entry_activities` by entry id; empty when none were logged. */
  activities: EntryActivity[];
}

export interface SaveEntryPayload {
  mood: number;
  energy: number;
  flow: number;
  success: SuccessStep;
  note: string;
  /** Not sent to save-entry — written via a direct table update after the insert. */
  sleep: SleepQuality | null;
  /** Not sent to save-entry — inserted into np_entry_activities after the insert. */
  activities: EntryActivity[];
  /** formatted yyyy-MM-dd */
  entry_date: string;
}

export interface UpdateEntryPayload {
  id: number;
  mood: number;
  energy: number;
  flow: number;
  success: SuccessStep;
  sleep: SleepQuality | null;
  /** Replaces the entry's activities (direct table writes). */
  activities: EntryActivity[];
  note: string;
}
