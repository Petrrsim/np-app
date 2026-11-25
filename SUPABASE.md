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
| `comment_encrypted` | string \| null               | ciphertext; the real note is stored here |
| `sleep_quality`     | smallint \| null (check 1–3) | optional: 1 poor · 2 fine · 3 good; null = not logged on this entry (added 2026-11-13) |
| `created_at`        | timestamptz (string)         | default `now()`; updatable by the user (restore sets it back) |

Checked 2026-11-24: the table has **only** these columns — `tiredness`, `comment`, `keyword` and
`metadata` (still in `NpEntry` in src/types/db.ts) don't exist as columns; `decrypt-entries` supplies
`comment`. An n8n `AFTER INSERT` trigger does `pg_notify` with each new row.

**Encryption invariant:** notes are encrypted server-side. The client never reads
`comment` from the table directly — it always goes through the `decrypt-entries` edge
function, which returns `comment` as a decrypted `string`.

### `np_entry_activities` — activities attached to a log (added 2026-11-13)

| column       | type                                   | notes |
| ------------ | -------------------------------------- | ----- |
| `id`         | bigint identity                        | PK |
| `entry_id`   | bigint → `np_entries.id`               | `on delete cascade` |
| `user_id`    | uuid → `auth.users.id`                 | defaults to `auth.uid()`; RLS scopes rows to the user |
| `activity`   | text (check `^[a-z][a-z0-9_]*$`)       | `np_activities.key` (no FK — linked by key) |
| `feeling`    | smallint (check 1–3)                   | 1 rough · 2 ok · 3 great |
| `created_at` | timestamptz                            | |

`unique (entry_id, activity)` — each activity at most once per log. RLS: select/update/delete
own rows; insert also requires the target entry to belong to the user. Accessed only by direct
table queries (non-sensitive) — the edge functions don't know about it.

### `np_activities` — the user's activity list (added 2026-11-15)

| column       | type                                   | notes |
| ------------ | -------------------------------------- | ----- |
| `id`         | bigint identity                        | PK; display order = creation order |
| `user_id`    | uuid → `auth.users.id`                 | defaults to `auth.uid()`; RLS scopes rows to the user |
| `key`        | text (check `^[a-z][a-z0-9_]*$`, ≤ 40) | what `np_entry_activities.activity` stores; unique per user; never changes |
| `label`      | text (1–40 chars, trimmed)             | display name; unique per user case-insensitively; editable |
| `icon`       | text (`^[a-z0-9-]{1,40}$`)             | name from `ACTIVITY_ICONS` in src/lib/activities.ts |
| `hidden`     | boolean, default false                 | hidden = kept on past logs, not offered in the form |
| `created_at` | timestamptz                            | |

Seeded with the previously hard-coded strength, run, swim, drums, dance. Managed on the Settings
page. RLS: select/insert/update/delete own rows. Migration:
[supabase/migrations/20261115_np_activities_and_hidden_flags.sql](supabase/migrations/20261115_np_activities_and_hidden_flags.sql)
(which also adds `hidden boolean not null default false` to `np_markers` and `np_people`).

All three lists (`np_activities`, `np_markers`, `np_people`) also have `position integer`
(nullable) for the manual order set in Settings; reads order by `position` nulls last, then `id`.
Existing rows were numbered in creation order; new rows start null. Migration:
[supabase/migrations/20261115_list_positions.sql](supabase/migrations/20261115_list_positions.sql).

### `np_markers` — user-defined markers (added 2026-11-13)

| column       | type                         | notes |
| ------------ | ---------------------------- | ----- |
| `id`         | bigint identity              | PK; display order = creation order |
| `user_id`    | uuid → `auth.users.id`       | defaults to `auth.uid()`; RLS scopes rows to the user |
| `name`       | text (1–40 chars, trimmed)   | unique per user, case-insensitive (`lower(name)`) |
| `created_at` | timestamptz                  | |

Seeded with: synchronicity, injury, sickness, X, positive, negative. New markers are created
from Settings, which also renames, hides (`hidden`) and deletes them. RLS: select/insert/update/delete own rows.

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
unique per user case-insensitively, `created_at`, `hidden`, `position`). Managed on the People page.
Since 2026-11-25 also `note text not null default ''` (≤ 20 000 chars — the People page's "about
this person" note, **plain text**, RLS-protected) and `note_updated_at timestamptz` (set by the app
on save). Migration: [supabase/migrations/20261125_people_page.sql](supabase/migrations/20261125_people_page.sql).
Also `vibe smallint` (−1 draining · 0 neutral · 1 energizing; null = not set — the user's *own*
energy with that person) and `vibe_note text not null default ''` (≤ 120 chars, trimmed — **unused**:
the app dropped the free-text description; the column is left in place, empty). Migration:
[supabase/migrations/20261125_person_vibe.sql](supabase/migrations/20261125_person_vibe.sql).

### `np_person_groups` — named groups of people (added 2026-11-25)

| column       | type                                   | notes |
| ------------ | -------------------------------------- | ----- |
| `id`         | bigint identity                        | PK |
| `user_id`    | uuid → `auth.users.id`                 | defaults to `auth.uid()` |
| `name`       | text (1–40 chars, trimmed)             | unique per user case-insensitively |
| `color`      | text (`^[a-z]{1,20}$`), default indigo | key of `GROUP_COLORS` in src/lib/people.ts |
| `position`   | integer, nullable                      | order among siblings; nulls last, then `id` |
| `parent_id`  | bigint → `np_person_groups.id`, nullable | the group it sits inside (any depth); `on delete set null`; check ≠ `id` |
| `created_at` | timestamptz                            | |

Trigger `np_person_groups_no_cycle` (before insert/update of `parent_id`) rejects a parent that
isn't one of the same user's groups (SQLSTATE 23503) and loops (23514). RLS: plain owner check for
select/insert/update/delete. **Don't put a subquery on `np_person_groups` inside its own policies**
— Postgres fails every insert with "infinite recursion detected in policy" (that's what the first
nesting migration did; checks like that belong in the trigger). The app moves a deleted group's
subgroups up to its parent first. Migrations:
[20261125_person_group_nesting.sql](supabase/migrations/20261125_person_group_nesting.sql), then
[20261125_person_group_policy_fix.sql](supabase/migrations/20261125_person_group_policy_fix.sql).

### `np_person_group_members` — who is (directly) in which group (added 2026-11-25)

`group_id` → `np_person_groups` and `person_id` → `np_people` (both `on delete cascade`),
`user_id`, `created_at`; PK `(group_id, person_id)`. RLS: select/delete own rows; insert requires
both the group and the person to belong to the user. Members of subgroups are not copied here —
the app rolls them up.

### `np_person_links` — connections between two people (added 2026-11-25)

| column       | type                         | notes |
| ------------ | ---------------------------- | ----- |
| `id`         | bigint identity              | PK |
| `user_id`    | uuid → `auth.users.id`       | defaults to `auth.uid()` |
| `person_a`   | bigint → `np_people.id`      | `on delete cascade`; always the smaller id (check `person_a < person_b`) |
| `person_b`   | bigint → `np_people.id`      | `on delete cascade` |
| `tone`       | smallint (−1…1)              | −1 negative · 0 neutral · 1 positive |
| `label`      | text (≤ 80, trimmed), default '' | optional name, e.g. "strong and prosperous partnership" |
| `created_at` / `updated_at` | timestamptz   | `updated_at` set by the app |

`unique (person_a, person_b)` — one connection per pair (the app upserts on it). RLS: select/delete
own rows; insert/update require both people to belong to the user.

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

- **`decrypt-entries` paging is unstable on ties:** it orders by date/time only, and ~1k imported logs
  share both, so a tied row can appear on two pages and its twin on none. Callers fetch overlapping
  pages (stride 900, limit 1000) and dedupe by `id`; the backup also checks every table id came back.
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

### Source code is not recoverable (checked 2026-11-18)

The source of `save-entry`, `update-entry` and `decrypt-entries` is **not in this repo and
can't be fetched**: Supabase returns "deployment is missing metadata" for all three (only a
redeploy fixes that), the old Vite app's git history never contained `supabase/functions/`,
and no copy exists locally. The note encryption happens inside these functions with a key
held as an edge-function secret (not in Postgres, Vault or any DB function), and the scheme
is unknown — ciphertexts are base64 in `comment_encrypted`.

Consequences / rules:
- **Never redeploy or overwrite these three functions** (CLI, dashboard or MCP) without the
  original source: a function with a different scheme or key would make every note
  unreadable or write notes the old reader can't decrypt.
- That's why sleep, activities, people and markers are written with direct table queries
  after `save-entry` (below) instead of extending the functions.
- If the functions ever need changing, the safe path is new functions under **new names**
  with a documented scheme, re-encrypting notes into a new column (the old one kept as a
  fallback) and switching the app only after every note is verified to match.
- Other deployed functions not used by this app: `webhook-proxy`, `collective-stats`.

## Data-access rules for the rebuild

1. All entry **reads/writes** go through the edge functions above — never read
   `np_entries.comment` or write `comment_encrypted` directly.
2. Non-sensitive data (`np_profiles`, `sleep_quality`, `np_activities`, `np_entry_activities`, `np_markers`, `np_entry_markers`, `np_people`, `np_entry_people`, `np_person_groups`, `np_person_group_members`, `np_person_links`, entry deletion) may use direct table access. Person notes (`np_people.note`) also go direct and are stored as plain text — the only free text that isn't encrypted at rest.
3. Keep `entry_date` formatted as `yyyy-MM-dd`.
