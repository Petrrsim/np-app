# Supabase Backend Contract (preserved from old app)

This file records the **existing** Supabase backend the new app must connect to. The
backend (Postgres tables, RLS, edge functions, encryption keys) lives server-side and
was NOT deleted — only the old frontend was. The rebuild reads/writes the same data.

## Connection

Credentials live in [.env](.env) (Next.js requires the `NEXT_PUBLIC_` prefix to expose
them to the browser):

- `NEXT_PUBLIC_SUPABASE_URL` — project `blecjabbihydvtoqulvx` (`https://blecjabbihydvtoqulvx.supabase.co`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon/public key

Client lives in [src/lib/supabase.ts](src/lib/supabase.ts):
`createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true,
detectSessionInUrl: true } })`. Auth is Supabase Auth (email). The typed contract is in
[src/types/db.ts](src/types/db.ts); edge-function wrappers in [src/lib/edge.ts](src/lib/edge.ts).

## Tables

### `np_entries` — the daily logs ("logs that are stored")

| column              | type                         | notes |
| ------------------- | ---------------------------- | ----- |
| `id`                | bigint (number)              | PK |
| `user_id`           | uuid                         | owner; RLS scopes rows to the user |
| `entry_date`        | date (`yyyy-MM-dd` string)   | one logical entry per day |
| `mood`              | number \| null               | metric slider |
| `energy`            | number \| null               | metric slider |
| `flow`              | number \| null               | metric slider |
| `success_step`      | `-1 \| 0 \| 1` \| null       | literal union, NOT a free number |
| `tiredness`         | number \| null               | metric slider |
| `comment`           | string \| null               | plaintext — normally null in the table |
| `comment_encrypted` | string \| null               | ciphertext; the real note is stored here |
| `sleep_quality`     | smallint \| null (check 1–3) | optional: 1 poor · 2 fine · 3 good; null = not logged on this entry (added 2026-11-13) |
| `keyword`           | string \| null               | hashtag/keyword |
| `metadata`          | jsonb (`Record<string,unknown>`) \| null | |
| `created_at`        | timestamptz (string)         | |

**Encryption invariant:** notes are encrypted server-side. The client never reads
`comment` from the table directly — it always goes through the `decrypt-entries` edge
function, which returns `comment` as a decrypted `string`.

### `np_entry_activities` — activities attached to a log (added 2026-11-13)

| column       | type                                   | notes |
| ------------ | -------------------------------------- | ----- |
| `id`         | bigint identity                        | PK |
| `entry_id`   | bigint → `np_entries.id`               | `on delete cascade` |
| `user_id`    | uuid → `auth.users.id`                 | defaults to `auth.uid()`; RLS scopes rows to the user |
| `activity`   | text (check `^[a-z][a-z0-9_]*$`)       | key from [src/lib/activities.ts](src/lib/activities.ts) |
| `feeling`    | smallint (check 1–3)                   | 1 rough · 2 ok · 3 great |
| `created_at` | timestamptz                            | |

`unique (entry_id, activity)` — each activity at most once per log. RLS: select/update/delete
own rows; insert also requires the target entry to belong to the user. Accessed only by direct
table queries (non-sensitive) — the edge functions don't know about it.

### `np_markers` — user-defined markers (added 2026-11-13)

| column       | type                         | notes |
| ------------ | ---------------------------- | ----- |
| `id`         | bigint identity              | PK; display order = creation order |
| `user_id`    | uuid → `auth.users.id`       | defaults to `auth.uid()`; RLS scopes rows to the user |
| `name`       | text (1–40 chars, trimmed)   | unique per user, case-insensitive (`lower(name)`) |
| `created_at` | timestamptz                  | |

Seeded with: synchronicity, injury, sickness, X, positive, negative. New markers are created
from the New Entry / Edit form. RLS: select/insert/update/delete own rows.

### `np_entry_markers` — markers attached to a log (added 2026-11-13)

| column       | type                       | notes |
| ------------ | -------------------------- | ----- |
| `entry_id`   | bigint → `np_entries.id`   | `on delete cascade` |
| `marker_id`  | bigint → `np_markers.id`   | `on delete cascade` |
| `user_id`    | uuid → `auth.users.id`     | defaults to `auth.uid()` |
| `created_at` | timestamptz                | |

PK `(entry_id, marker_id)`. RLS: select/delete own rows; insert requires both the entry and the
marker to belong to the user. Direct table access only, same pattern as activities.

### `np_people` — people close to the user (added 2026-11-13)

Same shape and RLS as `np_markers` (`id` identity, `user_id`, `name` 1–40 chars trimmed and
unique per user case-insensitively, `created_at`). Created inline from the New Entry / Edit form.

### `np_entry_people` — people in a log, with their NP (added 2026-11-13)

| column       | type                       | notes |
| ------------ | -------------------------- | ----- |
| `entry_id`   | bigint → `np_entries.id`   | `on delete cascade` |
| `person_id`  | bigint → `np_people.id`    | `on delete cascade` |
| `np`         | smallint (1–3)             | person's life energy: 1 low, 2 ok, 3 great |
| `user_id`    | uuid → `auth.users.id`     | defaults to `auth.uid()` |
| `created_at` | timestamptz                | |

PK `(entry_id, person_id)`. RLS: select/update/delete own rows; insert requires both the entry
and the person to belong to the user. Direct table access only.

### `np_profiles` — user profile

| column         | type            | notes |
| -------------- | --------------- | ----- |
| `id`           | uuid            | PK == auth user id |
| `display_name` | string \| null  | |
| `created_at`   | timestamptz     | |
| `updated_at`   | timestamptz     | |

Accessed via direct table queries (RLS-protected): `select *` / `update {display_name}`
filtered by `id = auth.uid()`.

## Edge functions

Invoked via `supabase.functions.invoke(name, { body })`:

| function          | body                                                              | returns |
| ----------------- | ---------------------------------------------------------------- | ------- |
| `save-entry`      | `{ mood, energy, flow, success, note, entry_date }`              | `{ ok: true, id? }` |
| `update-entry`    | `{ entryId, comment }` (only the encrypted note)                 | `{ ok: true }` |
| `decrypt-entries` | `{ limit?, offset? }` — newest first; default 20 rows, `limit` capped at 1000 | `{ entries: DecryptedEntry[] }` |

- `success` is the `SuccessStep` union (`-1 | 0 | 1`).
- The note maps to the encrypted comment: `save-entry` names this field `note`, but
  `update-entry` names it `comment` (and uses `entryId` rather than `id`). The wrappers in
  [src/lib/edge.ts](src/lib/edge.ts) translate the typed payloads to these names.
- **`update-entry` only writes the encrypted note** — it ignores metric fields. Editing
  `mood`/`energy`/`flow`/`success_step` is done with a direct table update in
  [src/hooks/use-entries.ts](src/hooks/use-entries.ts) (`useUpdateEntry`), authorized by RLS.
- **`sleep_quality` bypasses the edge functions** (it's non-sensitive and the deployed functions
  don't know about it). `useCreateEntry` calls `save-entry`, then sets `sleep_quality` with a direct
  update on the new row (using the returned `id`, or the newest row for that date as fallback).
  Reads merge a direct `select id, sleep_quality` into the decrypted entries by `id`.
- **Activities bypass the edge functions** too. `useCreateEntry` inserts `np_entry_activities`
  rows for the new entry id (same id resolution as sleep); `useUpdateEntry` deletes dropped
  activities and upserts the rest (`onConflict: entry_id,activity`); reads merge them in by
  `entry_id`. Deleting an entry cascades to its activities.
- Entry **deletion** does NOT use an edge function — it's a direct
  `supabase.from("np_entries").delete().eq("id", id)` (RLS authorizes).

## Data-access rules for the rebuild

1. All entry **reads/writes** go through the edge functions above — never read
   `np_entries.comment` or write `comment_encrypted` directly.
2. Non-sensitive data (`np_profiles`, `sleep_quality`, `np_entry_activities`, `np_markers`, `np_entry_markers`, `np_people`, `np_entry_people`, entry deletion) may use direct table access.
3. Keep `entry_date` formatted as `yyyy-MM-dd`.
