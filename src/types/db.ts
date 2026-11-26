export type SuccessStep = -1 | 0 | 1;

/** Optional per-entry sleep quality: 1 = poor, 2 = fine, 3 = good. `null` = not logged. */
export type SleepQuality = 1 | 2 | 3;

/** How an activity felt: 1 = rough, 2 = ok, 3 = great. */
export type ActivityFeeling = 1 | 2 | 3;

/**
 * A row of `np_activities`: an activity the user can attach to logs. `key` is what
 * `np_entry_activities.activity` stores and never changes; `label`/`icon` are editable in
 * Settings. `icon` is a name from `ACTIVITY_ICONS` (src/lib/activities.ts).
 */
export interface ActivityType {
  id: number;
  key: string;
  label: string;
  icon: string;
  /** Hidden = kept on past logs but not offered in the New Entry / Edit form. */
  hidden: boolean;
  /** Manual order (Settings ↑/↓); null = not placed yet, sorts last. */
  position: number | null;
}

/** A row of `np_entry_activities` (minus ids). `activity` is an `ActivityType.key`. */
export interface EntryActivity {
  activity: string;
  feeling: ActivityFeeling;
}

/** A person's NP (life energy) on a log: 1 = low, 2 = ok, 3 = great. */
export type PersonNp = 1 | 2 | 3;

/** A row of `np_people`: someone close to the user who can appear in any number of logs. */
export interface Person {
  id: number;
  name: string;
  /** Hidden = kept on past logs but not offered in the New Entry / Edit form. */
  hidden: boolean;
  /** Manual order (People page "Arrange"); null = not placed yet, sorts last. */
  position: number | null;
  /** Free-text "about this person" note from the People page (plain text, RLS-protected); "" = none. */
  note: string;
  /** When `note` was last saved (ISO timestamp); null = never written. */
  note_updated_at: string | null;
  /** Your own energy with them: -1 draining · 0 neutral · 1 energizing; null = not set. */
  vibe: LinkTone | null;
  /** Heart: there was some kind of romantic relationship with them. */
  romantic: boolean;
}

/**
 * A row of `np_person_groups` with its member ids merged in from `np_person_group_members`.
 * Groups nest (any depth): a group's people are its own `members` plus everyone in its subgroups.
 */
export interface PersonGroup {
  id: number;
  name: string;
  /** Key of GROUP_COLORS in src/lib/people.ts (unknown keys fall back to the first colour). */
  color: string;
  /** Order among its siblings. */
  position: number | null;
  /** The group it sits inside; null = top level. The DB rejects loops. */
  parent_id: number | null;
  /** Direct members only (see `GroupTree.allMembers`). */
  members: number[];
}

/** A connection's feeling: -1 negative · 0 neutral · 1 positive. */
export type LinkTone = -1 | 0 | 1;

/** A row of `np_person_links`: an undirected, named connection; always `person_a < person_b`. */
export interface PersonLink {
  id: number;
  person_a: number;
  person_b: number;
  tone: LinkTone;
  /** Optional short description, e.g. "strong and prosperous partnership"; "" = none. */
  label: string;
  updated_at: string;
}

/** A row of `np_entry_people` (minus entry/user ids). */
export interface EntryPerson {
  person_id: number;
  np: PersonNp;
}

/** A row of `np_markers`: a user-defined tag that can be attached to any number of logs. */
export interface Marker {
  id: number;
  name: string;
  /** Hidden = kept on past logs but not offered in the New Entry / Edit form. */
  hidden: boolean;
  /** Manual order (Settings ↑/↓); null = not placed yet, sorts last. */
  position: number | null;
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
  /** People merged in from `np_entry_people`; empty when none. */
  people: EntryPerson[];
  /** Marker ids merged in from `np_entry_markers`; empty when none. */
  markers: number[];
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
  /** Not sent to save-entry — inserted into np_entry_people after the insert. */
  people: EntryPerson[];
  /** Not sent to save-entry — marker ids inserted into np_entry_markers after the insert. */
  markers: number[];
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
  /** Replaces the entry's people (direct table writes). */
  people: EntryPerson[];
  /** Replaces the entry's marker ids (direct table writes). */
  markers: number[];
  note: string;
}
