@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Status:** Rebuilt from scratch on 2026-06-03 (Next.js). The previous Vite SPA was deleted; the
> Supabase backend (data + edge functions) was preserved and is documented in
> [SUPABASE.md](SUPABASE.md). Single-user personal diary — six screens (New Entry, History, Dashboard, People, Detective, Settings) + login.

## Skills

- **senior-fullstack** ([.claude/skills/senior-fullstack/](.claude/skills/senior-fullstack/)) — use for web-app
  development work (scaffolding features, architecture/design patterns, dev workflows, code-quality analysis).
  Invoke it (`/senior-fullstack`) before starting any non-trivial fullstack build.

## Commands

- `npm run dev` — start the Next.js dev server (Turbopack).
- `npm run build` — production build (runs TypeScript checks; fails on type errors).
- `npm start` — serve the production build.
- `npm run lint` — run ESLint (`eslint-config-next`).

- `npm test` — run the Vitest suite once (`npm run test:watch` to keep it running).

Tests cover the pure logic only: `src/lib/{stats,detective,search,people}.test.ts` and
`scripts/restore-plan.test.mjs`, with a `DecryptedEntry` factory in [src/test/fixtures.ts](src/test/fixtures.ts)
(config: [vitest.config.mts](vitest.config.mts), which maps the `@/` alias). Add a test when changing
those files — especially the dip / baseline / scoring / lag-effect thresholds and the People web
layout / group tree.

**Seeing a UI change:** every app page is behind login. For a visual check, add a *temporary* route
outside `(protected)` that renders the page inside its own `QueryClientProvider` with the query keys
(`PEOPLE_KEY`, `ENTRIES_KEY`, …) pre-seeded with fake data (seed in a `useEffect` to avoid a hydration
mismatch), screenshot it at 360 / 390 px and desktop, then delete the route — never commit it.

**Stale CSS in dev:** after editing theme tokens in `globals.css`, Turbopack's persistent cache
(`.next/dev/cache`) can keep serving the old CSS even across restarts (new `--*` tokens and
their utilities missing; `npm run build` is fine). Stop the dev server, `rm -rf .next/dev/cache`,
then start it again.

## Stack

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + Supabase + TanStack Query.

- **Next.js 16 has breaking changes** vs. older versions — see the imported `@AGENTS.md` note and consult
  `node_modules/next/dist/docs/` before writing framework code.
- **Tailwind v4** is CSS-first: theme tokens live in [src/app/globals.css](src/app/globals.css) via
  `@import "tailwindcss"` + `@theme`, not a `tailwind.config.ts`.

## Project structure

Everything below is standard Next.js infrastructure — there are no leftovers from the old Vite app.

```
src/
  app/
    layout.tsx · providers.tsx · globals.css   root shell (light theme, QueryClient + AuthProvider, Toaster, theme)
    icon.png · apple-icon.png                  tab favicon (192px) + iOS home-screen icon (180px), resized
                                               from media/np_logo.png (file-convention icons, no <link> code)
    login/page.tsx                             bare login screen (signInWithPassword)
    privacy/page.tsx                           public privacy policy (needed by the Google OAuth consent screen)
    (protected)/                               route group behind <AuthGate> + <AppHeader>
      layout.tsx · page.tsx (New Entry, "/") · history/page.tsx · dashboard/page.tsx ·
      people/page.tsx · detective/page.tsx · settings/page.tsx
  components/
    ui/             shadcn-style primitives (button, card, input, textarea, slider, dialog,
                    alert-dialog, popover, sonner)
    *.tsx           features: app-header, np-logo, auth-gate, entry-form, entry-fields,
                    metric-slider, success-buttons, level-tiles, sleep-picker,
                    activity-picker, people-picker, marker-picker, entry-card,
                    edit-entry-dialog, delete-entry-button, date-picker
    dashboard/      trend-card (chart controls) · trend-chart (hand-built SVG chart) ·
                    stat-tiles (Mood/Energy/Flow tiles) · year-heatmap (daily calendar) ·
                    insights (weekday / success / tag / sleep / ripple-effect cards)
    people/         people-web (SVG "web" of people, connections, group halos) · groups-section (nested
                    group cards + group editor) · people-list ("Everyone", search, Arrange) · person-sheet
                    (profile dialog: stats, note, groups, connections, hide/delete) · add-person-dialog ·
                    group-chip · person-avatar · tone (connection tone pill / tiles / legend)
    detective/      now-card (dip status + look-back start) · feeling-card (own words + signal lists) ·
                    mood-strip (weekly bars) · sources-card (ranked logs / one week) · people-card ·
                    dips-card · year-ago-card
    settings/       list-manager (add/rename/icon/hide/delete for activities / markers) · data-card (CSV/JSON
                    export) · account-card (email, change password, sign out)
  contexts/         auth-context.tsx (useAuth)
  hooks/            use-stored-state.ts (localStorage-backed useState for per-browser UI prefs)
                    use-entries.ts (list/create/update/delete incl. activities, people, markers,
                    latest metrics, sleep-logged-on; usePeople/useMarkers lists + create)
                    use-lists.ts (useActivities/useActivityLookup/useCreateActivity; generic
                    useUpdateListItem/useDeleteListItem/useReorderList for activities/people/markers,
                    reorder also for person groups)
                    use-people.ts (People page: groups, connections, notes, create person;
                    usePeopleModel = everything the page shows, with lookups)
  lib/              supabase.ts (browser client), edge.ts (edge wrappers), utils.ts (cn),
                    activities.ts (activity icon registry, key slugs, lookup), search.ts (History
                    note search + highlight, word-start signal terms), stats.ts (pure Dashboard
                    computations), detective.ts (pure Detective computations), people.ts (pure People
                    page logic: group colours + tree, connection tones, person stats, web layout),
                    export.ts (CSV/JSON backup), entry-draft.ts (unsaved New Entry draft in localStorage)
  types/            db.ts (shared domain types / DB contract)
  app/manifest.ts   web app manifest (home-screen install); icons in public/icon-192.png · icon-512.png
media/np_logo.png   app logo (imported via next/image static import in np-logo.tsx; source for the icons)
.env              Supabase connection (gitignored)        .env.example  template
CLAUDE.md         this file       AGENTS.md  Next.js 16 agent rules (imported above)
SUPABASE.md       preserved backend contract              README.md     project readme
supabase/migrations/   SQL for schema changes made after the rebuild (record; applied via Supabase)
next.config.ts · tsconfig.json · next-env.d.ts · eslint.config.mjs · postcss.config.mjs   tooling config
package.json · package-lock.json   dependencies          node_modules/  installed deps (gitignored)
.gitignore · .git/   version control                     .claude/       senior-fullstack skill
```

`.next/` (build cache, gitignored) regenerates on `npm run dev`/`build` and is safe to delete.
`public/` holds only the manifest icons (resized from `media/np_logo.png`, whose letters already sit
inside the maskable safe zone, so icon-512 doubles as the maskable icon). Manifest URLs don't get the
basePath automatically — `manifest.ts` prefixes `/np-app` itself for the Pages build.
`import-comments.mjs` / `probe-decrypt.mjs` are local one-off Supabase scripts, gitignored on purpose
(they hardcode the login email) — keep them out of the repo.

## Architecture

A personal "diary" tool recording mood/energy/flow (sliders, 1–12), success (No −1 / Neutral 0 /
Yes 1), an optional sleep quality (Poor 1 / Fine 2 / Good 3), optional activities each rated
by feeling (Rough 1 / OK 2 / Great 3), optional people each rated by their NP / life energy (Low 1 / OK 2 / Great 3),
optional markers (user-defined tags) and an encrypted note. Several logs
per day are normal (e.g. morning + afternoon). **New Entry** (`/`) always logs for today; **History**
lists logs newest→oldest with per-log edit/delete and four combinable filters: a calendar date,
a word search over notes, a marker filter and a person filter (chips with counts; a log must carry every selected
marker and include every selected person). The marker / person chips are collapsed behind
"Markers" / "People" toggle badges under the search (picked count on the badge); tapping one
opens its chip panel (one at a time, with Clear).

History search: client-side over the already-decrypted `comment` (no server query — notes are
encrypted at rest). Matching is case- and diacritic-insensitive and substring-based ("uz" finds
"Už"); matches are highlighted with `<mark>` in [entry-card.tsx](src/components/entry-card.tsx)
via the `highlight` prop. Helpers (`foldText`, `splitMatches`) live in
[src/lib/search.ts](src/lib/search.ts). Marker / person chip counts reflect the date + word filters and the other chip filter.

History performance (~5k logs): the page folds all notes once on first search (not per
keystroke) and renders cards in chunks of 40 as you scroll (`EntryList` in the history page) —
never mount the whole list at once. The full history is prefetched after login
(`usePrefetchEntries` in `AuthGate`) and cached for 5 min (`entriesQuery`).

Dashboard (`/dashboard`): everything is computed client-side from the cached `useEntries` history
by pure functions in [src/lib/stats.ts](src/lib/stats.ts) (no extra queries). A range picker
(7D / 30D / 90D / 1Y / All, default 7D) scopes all of it. Top to bottom: Mood / Energy / Flow
average tiles (delta vs. the previous period of the same length + sparkline) → the chart card
(toggles: Mood / Energy / Flow lines, Success markers, per-metric moving-average "Trend" lines with a
7/30/90d window, zoom) → the selected log → Insights (weekday rhythm, wins vs. misses,
activities / people / sleep / markers cards that only appear when the range has that data, and the full-width
"Ripple effects" card) → the year heatmap at the very bottom. Ripple effects (`lagFactors` / `laggedEffects` in stats.ts): for every sleep level,
win/miss, activity, person and marker seen on ≥ 3 days in the range, the daily mean of the picked metric on
those days, the next day and 2 days on, minus all other days; a Welch t (`compareDays`) below `RELIABLE_T`
(2) shows the number faded as "could be chance". Rows sort by the clearest next-day effect; top 8, then
"Show all". Range-scoped like the other cards, so short ranges mostly show "–". Data quirks the code relies on: metrics can be decimals or numeric strings
(`num()` coerces), ~640 old logs have no metrics at all (excluded from the chart via
`buildPoints`), and Flow only exists since mid-2025. The chart
([trend-chart.tsx](src/components/dashboard/trend-chart.tsx)) is a hand-built SVG, one column per
log (not per day), horizontally scrollable with zoom levels; it **only renders the visible window
± overscan** (the "All" range is ~4.3k columns), so keep it windowed. Lines break and show a gap
pill when logs are > 10 days apart. Moving averages are trailing *calendar-day* windows
(7/30/90d) computed over the full history, then sliced to the range. Success ±1 shows as a
tinted column wash plus ✓/✗ (zoomed-out: ▲/▼) glyphs in a lane under the plot. Clicking a point
(or ←/→ on the focused chart) shows that log's `EntryCard` below the chart. The year heatmap
([year-heatmap.tsx](src/components/dashboard/year-heatmap.tsx)) ignores the range picker: its own
year stepper + All/Mood/Energy/Flow picker (persisted), 12 Mon-first month grids, one cell per day
(daily mean via `dailyValues`), coloured on a diverging red↔blue scale (`--heat-*` tokens, 7 bins
in SDs) around *that year's* own average; tapping a day lists its logs below. Series colours are
the `--chart-mood/energy/flow` tokens — a CVD-validated set; don't swap in other hues casually.
`METRICS` references them as `var(--chart-x, #hex)`: keep the hex fallbacks — with a stale dev
CSS cache a missing token makes SVG strokes vanish (dots still show, lines don't).

Detective (`/detective`, nav icon on phones): a no-LLM tool for the user's "where did this feeling
come from" game — everything is client-side over the cached `useEntries` history, by pure
functions in [src/lib/detective.ts](src/lib/detective.ts); nothing leaves the browser. Daily value
= mean of the day's logs (metric picker: All = per-log mean of M/E/F, or one slider). Baseline =
average of the last 365 days; a **dip** = the 7-day trailing line more than ½ SD under it for ≥ 5
days, widened to where it crosses the baseline, with dips ≤ 4 days apart merged (dips are shown for
context only). The page always looks back from **today** over a 1M/3M/6M/1Y window (default 1Y) —
no anchor/start picking. Logs in [today − window, today) are scored: words from the user's own feeling description (+3 each, Czech-ish stemming in
`feelingTerms`), tagged person with low NP (+3; OK NP +1), signal markers (+2; default = markers
named "negative…"), heavy words (+1 each, max 3; editable list, `DEFAULT_WORDS`), and "you felt low
that day" (+1). Term matching is word-start on folded text (`termsRegex` in search.ts; ≤ 3-letter
terms = whole words); `EntryCard`'s `highlight` accepts that term array (pass a stable array).
The week strip shows weekly deviation from the baseline; tapping a week lists all its logs. The
"A year ago" card (right under the Now card, above "How does it feel?") is a one-log-at-a-time
horizontal snap carousel over the logs from one year ago ± 3 days, opening on the anniversary's first
log (‹ › buttons + counter; the box height follows the log in view).
Lookback, metric, feeling text and signal lists persist per browser via `useStoredState`.

Form fields ([entry-fields.tsx](src/components/entry-fields.tsx), shared by New Entry and the
History edit dialog) in order: Mood, Energy, Flow sliders → Success → Sleep / Activities / People /
Markers button row → Note (placeholder "What's up bro?").

Sleep, Activities, People and Markers sit behind one row of four toggle buttons (`ExtrasBar` in
entry-fields.tsx, icon over label) right above the Note: tapping one opens that picker under the
row (one at a time, tap again to close). Buttons show the picked count (amber while a pick still
needs a rating); Sleep shows the logged level's icon + a colour dot instead. Inside the panel the
pickers have no title; Activities / People / Markers have no Clear (deselect by tapping chips)
and no inline "New" chip — lists are managed only in Settings (an empty picker links there).
No "Optional" pills anywhere. On phones (`max-sm:`) New Entry is sized to exactly one screen
(`100svh` minus the header) so Save is visible without scrolling: tighter gaps/tiles, title + date
on one row, the Note label visually hidden. With `EntryFields fill` the Note box grows into
leftover height up to `max-h-32`, then `justify-between` spreads the rest into the section gaps
(a huge Note box with cramped sections looked unbalanced). Keep added rows within that budget (~660px on an iPhone 12 in Safari). New Entry remounts `EntryFields` after a save (`formKey`) so the
open picker closes.

New Entry behaviour:
- **Unsaved drafts survive a reload** ([src/lib/entry-draft.ts](src/lib/entry-draft.ts)): the whole form
  is written to localStorage (`np.entry-draft`) on every change once anything beyond the carried-over
  sliders is set, and cleared on save, on "Discard" (in the "Unsaved draft restored" toast shown when a
  draft is loaded) and on sign-out — the note sits there in plain text until then.
- **Sliders carry over** from the most recent log (any day) via `useLatestMetrics`; the form shows a
  spinner until that resolves so sliders don't jump from the defaults (6). After saving, sliders keep
  the saved values; success resets to 0, sleep to `null`, activities to `[]`, note to `""`.
- **Sleep is optional per log** — starts `null`; tapping the selected tile again or "Clear" unsets it.
  If an earlier log today already has sleep, the picker shows a "Logged today · …" hint
  (`useSleepLoggedOn`) but doesn't copy the value.
- **Activities are optional per log, any number** — toggle chips, then each picked activity gets
  its own Rough/OK/Great tiles. Saving is blocked (toast) until every picked activity is rated.
  The list lives in the DB (`np_activities`, managed on Settings): logs store the activity's
  `key` (slugged from the label on creation, never changes), so renaming / re-iconing is safe.
  Icons are names from `ACTIVITY_ICONS` in [src/lib/activities.ts](src/lib/activities.ts); render
  labels/icons via `useActivityLookup()` (unknown keys fall back to the key + a generic icon).
- **People are optional per log, any number** — like activities (pick chips, then rate each
  person's NP with Low/OK/Great tiles; saving is blocked until all are rated), but the list lives
  in the DB like markers (`np_people`, via `usePeople`; added on the People page). Stored in
  `np_entry_people` (merged into `DecryptedEntry.people`); resets to `[]` after saving. Colours reuse the `--feel-*` tokens; battery icons.
  The chips are ordered by use (`rankByUse` in people.ts: most logged in the last 90 days, then
  overall, then saved order) and folded to **two rows** (measured, since chip widths vary) behind
  "+N more" / "Show less"; picked people always show in their rating cards below.
- **Markers are optional per log, any number** — toggle chips ([marker-picker.tsx](src/components/marker-picker.tsx)).
  The list lives in the DB (`np_markers`, via `useMarkers`; added in Settings). Entries reference
  markers by id (`DecryptedEntry.markers: number[]`, from `np_entry_markers`). Markers reset to `[]` after saving.

Settings (`/settings`, gear icon in the header — sign out lives here now): one card each for
Activities and Markers (add, ↑/↓ reorder, rename, change icon for activities, hide/show,
delete), a link card to the People page (people are managed there), plus Data (CSV/JSON export of
the full decrypted history) and Account (change password, sign out).
**Hidden** (`hidden` column on all three tables) = stays on past logs, History filters and the
Dashboard, but isn't offered in the New Entry / Edit pickers — unless already on the log being
edited. **Delete** is permanent and removes the item from every log (people/markers cascade;
activities have no FK, so `useDeleteListItem` deletes their `np_entry_activities` rows first);
the confirm dialog shows the usage count and offers "Hide instead". Usage counts come from the
cached `useEntries` history.
**Order**: all three lists sort by `position` (nulls last), then `id` — the pickers, History
filters, Settings and the People page all follow it. `useReorderList` writes only the rows whose position changed
and reorders the cache optimistically; new items start with `position` null (= end of the list).
In Settings (and the People page's "Arrange"), hidden items sit below the visible ones and only
move within their group.

People (`/people`, between Dashboard and Detective; icon on phones): where people are added and
managed (no longer in Settings). Top to bottom: **Your web** — an SVG constellation
([people-web.tsx](src/components/people/people-web.tsx)): one disc per person (initials, tinted with
their first direct group's colour), connections as lines in their tone's colour (`--tie-positive /
--tie-neutral / --tie-negative`, dashed = neutral), groups as soft translucent halos (a hull path
stroked as wide as the halo). The layout is `layoutWeb` in [src/lib/people.ts](src/lib/people.ts): a
deterministic force-directed layout (same data → same picture, no randomness) where positive ties
pull closer than negative ones (`TONE_PULL`) and group members cluster, then fitted to the card
and de-overlapped; data changes glide people to their new spots (`useTween`). The web never gets denser as people
are added — it gets **taller**: `webHeight` sizes it for everyone at the `gap` spacing across the
inner width, and in a tall box (phones) `layoutWeb`'s gravity is elliptical so the layout fills the
height. Two size sets in people-web.tsx: `WIDE` and `COMPACT` (< 560 px: smaller discs, halos, names).
A filter row above the web ("Everyone" + top-level groups; a picked group's subgroups appear after it,
persisted as `np.people.web-group`) shows one group with its subgroups on its own. Tapping a person
focuses them (others fade, their connection names show as pills where they fit), tapping again or
"Open" opens their profile; tapping a line shows that connection. **Groups** — cards per top-level
group with subgroups nested inside (any depth), direct members as chips, "+ subgroup" and edit on
each card, plus a "Not in a group" bucket; the group editor sets name, colour, "Inside" (parent),
members, sibling order and delete. Colours: `GROUP_COLORS` — 32, shown as a 4×8 grid, all ≥ 3.4:1 on
white and picked to be maximally distinct; no green / emerald / red / rose (those mean connection
tones). Keys are stored in the DB, so never rename or remove one; new groups get the next unused key
in `AUTO_ORDER` (consecutive colours far apart).
**Everyone** — the full list (note preview, groups, logs, latest NP) with search over names, notes
and groups and an "Arrange" mode (↑/↓ = the New Entry picker order). The **profile** dialog
([person-sheet.tsx](src/components/people/person-sheet.tsx), opened from anywhere; tapping a
connected person opens them with a back link) has rename, log stats from the cached history (logs,
last seen, average NP, NP on recent logs), the **note** (autosaves ~1 s after typing stops, on blur
and on close; serialized via mutation `scope`, optimistic cache update), **your own energy** with them
(`np_people.vibe`: Energizing / Neutral / Draining, `VIBE_LABELS`, same colours as connection tones;
tap the picked tile again to clear; no free text — by the user's choice), group chips (with parent
path; dashed = in it through a subgroup; tapping adds them directly), connections (pick a person,
Negative / Neutral / Positive, optional name ≤ 80 chars; one connection per pair), and hide / delete
(delete also removes their note, memberships and connections).
**Groups nest**: `np_person_groups.parent_id`; a group's people = its direct members + everyone in
its subgroups (`buildGroupTree().allMembers`, which also breaks bad loops/missing parents
defensively — the DB already rejects loops with a trigger). Deleting a group moves its subgroups up
into its parent (`useDeleteGroup`) and keeps its people. On the web an outer group's halo is
`NEST` px wider per level of subgroups, so nested groups read as rings within rings; group names are
placed by `groupLabelSpot` (above / below / beside a member, wherever they don't cover a person, a
name or another group's name) and sized by depth (top-level 11px, then 9.5px, then 8.5px);
top-level names sit `TOP_LABEL_GAP` px further out, just clear of their halo.
**Your energy on the web** is only a ring around each rated person in the vibe colour (energizing
glows; the same ring is on `PersonAvatar` via its `vibe` prop, in the list and profile). There's
deliberately no "You" node or you→person lines — the user is connected to everyone, so that adds noise.
The app header has five tabs: on phones (< `sm`) Dashboard, People and Detective show as icons —
check the nav still ends before the settings button at 360 px when adding anything there.

UI style: success, sleep and activity feeling are 3-tile pickers sharing one look — lucide icon,
tinted gradient + glow when selected, and a 3-segment bar (sleep/feeling = level meter, success =
position marker). No emojis. Once an activity is rated, its chip gets the same gradient + glow and
its card a tinted border/wash in the feeling colour; unrated picks stay neutral.
Light "paper & ink" theme (warm off-white page, white cards with `shadow-card`, near-black
primary matching the logo); scale colours use 600–700 shades so they read as text on white.
Colours are theme tokens in `globals.css` (`--success`, `--destructive`, `--sleep-poor/fine/good`,
`--feel-rough/ok/great`, `--tie-positive/neutral/negative` for People connections and your energy;
SVG uses them as `var(--tie-x, #hex)` with fallbacks, like the chart colours). Sleep and activity feeling both render through `LevelTiles` /
`LevelBars` in `level-tiles.tsx`. `SuccessBadge` / `SleepBadge` / `ActivityBadge` (exported from
the picker files) render the History card badges.

### Data flow (Supabase)

The backend contract is documented in full in [SUPABASE.md](SUPABASE.md). Two paths:

1. **Edge functions (encrypted entries)** — [src/lib/edge.ts](src/lib/edge.ts) wraps
   `supabase.functions.invoke` for `save-entry`, `update-entry`, `decrypt-entries`. Entry notes are
   encrypted server-side; the client only ever sees plaintext via `decrypt-entries`. Use these wrappers
   for entry read/write — never query `np_entries.comment`/`comment_encrypted` directly.
2. **Direct table access** — non-sensitive data only, with RLS handling authorization: `np_profiles`
   reads/updates, entry deletion, metric edits in `useUpdateEntry`, and everything about
   `sleep_quality`. The deployed edge functions don't know `sleep_quality` (and their source is lost —
   see SUPABASE.md; **never redeploy them**), so: `edge.ts` strips `sleep` from edge payloads;
   `useCreateEntry` calls `save-entry` then sets `sleep_quality` on the new row (returned `id`, else
   newest row for that date); `useEntries` merges a direct `select id, sleep_quality` in by `id`.
   Activities live in their own table `np_entry_activities` (direct access, same pattern: insert
   after `save-entry`, delete-dropped + upsert on edit, merged into `DecryptedEntry.activities`).
   People (`np_entry_people`, with `np`) and markers work the same way; markers via `np_entry_markers` (merged into `DecryptedEntry.markers`); the
   marker list itself is `np_markers` under its own query key `MARKERS_KEY`, the people list is
   `np_people` under `PEOPLE_KEY` (columns in `PERSON_COLUMNS`, incl. the People-page note), and the
   activity list is `np_activities` under `ACTIVITIES_KEY`. The People page adds `np_person_groups` +
   `np_person_group_members` (one query, `GROUPS_KEY`) and `np_person_links` (`LINKS_KEY`) — all
   direct access. Person notes are **plain text** in `np_people.note` (RLS-protected, not encrypted
   like log notes — the edge functions can't be changed, see SUPABASE.md).

### State

- **TanStack Query** is the source of truth for server state. The client is configured in
  [src/app/providers.tsx](src/app/providers.tsx) (`staleTime: 30s`, `retry: 1`,
  `refetchOnWindowFocus: false`). Entry hooks live in [src/hooks/use-entries.ts](src/hooks/use-entries.ts)
  (`ENTRIES_KEY`); all mutations invalidate it.
- **Auth** — single user, email/password. [src/contexts/auth-context.tsx](src/contexts/auth-context.tsx)
  (`useAuth`) is mounted in `providers.tsx`; session persists + auto-refreshes (configured in
  [src/lib/supabase.ts](src/lib/supabase.ts)), so login is effectively one-time.
  [src/components/auth-gate.tsx](src/components/auth-gate.tsx) guards the `(protected)` group and
  redirects to `/login` when there's no session. No signup/multi-user.

### Conventions

- Path alias `@/*` → `src/*` ([tsconfig.json](tsconfig.json)). Prefer `@/...` over relative `../../` imports.
- Toast errors with `errorMessage(err, fallback)` from `@/lib/utils` — Supabase query errors are plain
  objects, not `Error`s, so `err instanceof Error ? … : fallback` hides the real reason.
- Shared domain types live in [src/types/db.ts](src/types/db.ts). Invariants: `SuccessStep` is the literal
  union `-1 | 0 | 1`; `SleepQuality` is `1 | 2 | 3` and always nullable (`sleep_quality` column,
  `smallint` with a 1–3 check; `null` = not logged); `ActivityFeeling` is `1 | 2 | 3` and never null
  on a saved row (unrated picks exist only as form-side `ActivityDraft`s); `DecryptedEntry` narrows
  `comment` to `string` and always has `activities` (`[]` when none); `SaveEntryPayload` requires
  `entry_date` (`yyyy-MM-dd`), `UpdateEntryPayload` targets by `id`.

## Environment

[.env](.env) must define `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` —
[src/lib/supabase.ts](src/lib/supabase.ts) throws at import time if either is missing.

## Deployment

- **GitHub:** private repo `Petrrsim/np-app`, branch `main`.
- **Vercel:** Git-connected project; **every push to `main` deploys to production** (no manual step).
  The two `NEXT_PUBLIC_SUPABASE_*` vars are set in Vercel → Settings → Environment Variables; they're
  inlined at build time, so changing them requires a redeploy.
- **Domain:** https://np.pt-solutions.tech — DNS `CNAME np → cname.vercel-dns.com`. The app runs at the
  domain root (no `basePath`); Supabase Auth's Site URL points there.
- Run `npm run build` before pushing — a failed Vercel build leaves the previous deployment live.
- **GitHub Pages (second copy):** [.github/workflows/pages.yml](.github/workflows/pages.yml) also deploys
  every push to `main` to https://petrrsim.github.io/np-app/ (the repo is public for this). It builds with
  `GITHUB_PAGES=true`, which makes [next.config.ts](next.config.ts) do a static export (`out/`) with
  `basePath: "/np-app"`, `trailingSlash` and unoptimized images; Vercel builds without the flag. So keep the
  app static-exportable — no route handlers, proxy/middleware, server actions, `cookies()`, rewrites or
  dynamic routes without `generateStaticParams` — and use `next/link` / `useRouter` (never hardcoded
  `/...` URLs in `<a>` or `window.location`) so links get the base path. Check with
  `GITHUB_PAGES=true npm run build`. Supabase env comes from the `SUPABASE_URL` / `SUPABASE_ANON_KEY` repo secrets.

## Scheduled backup (Google Drive)

[.github/workflows/backup.yml](.github/workflows/backup.yml) runs nightly (and on demand via "Run workflow")
[scripts/backup-to-drive.mjs](scripts/backup-to-drive.mjs): signs in as the user, loads the full decrypted
history the same way as `useEntries`, and merges it into **one cumulative file**, `np-diary-backup.json`, in
the Drive folder "NP Diary backups" (records from `toRecord` in `src/lib/export.ts`, imported directly via
Node type stripping — keep that file free of non-erasable TS syntax like enums and of runtime `@/` imports).
Merge by log `id`: new logs added, edited ones updated, logs deleted in the app are **kept** with
`removed_from_app: <date>` — the file never loses a log. It refuses to run on a partial history.
Notes are stored as `note_encrypted` (AES-256-GCM, key = scrypt of `BACKUP_PASSPHRASE` + the file's salt,
[scripts/backup-crypto.mjs](scripts/backup-crypto.mjs)) — independent of the server-side encryption, so the
backup is readable without Supabase; metrics/tags stay plain. A `check` field makes a wrong passphrase fail
before anything is overwritten (so the passphrase can't be changed without starting a new file). Unchanged
notes keep their old ciphertext. Read a backup locally with
`node scripts/decrypt-backup.mjs np-diary-backup.json` (writes `.decrypted.json` / `.csv`). Drive's revision
history of the file is the only point-in-time history. Drive scope is `drive.file` (it only sees files it
created). Repo secrets: `NP_EMAIL`, `NP_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BACKUP_PASSPHRASE`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` (get the last one once with
[scripts/google-auth.mjs](scripts/google-auth.mjs)). The Google OAuth consent screen must be **In production**
— in "Testing" the refresh token expires after 7 days. Changing the app password means updating `NP_PASSWORD`.
Backup and restore share the Supabase sign-in + full-history loader in [scripts/np-history.mjs](scripts/np-history.mjs).

**Restore** — [scripts/restore-from-backup.mjs](scripts/restore-from-backup.mjs)
(`node --env-file=.env.backup scripts/restore-from-backup.mjs np-diary-backup.json [--apply] [--limit N] [--include-removed]`):
dry run by default; compares the backup with the app and, with `--apply`, recreates the missing logs —
`save-entry` (so the note is encrypted by the app's own function), then a direct update of metrics,
success, sleep and the original `created_at`, then the tag rows; missing activities/people/markers are
created hidden. Logs get new ids; existing logs are never modified; logs marked `removed_from_app` are
skipped unless asked. Re-runs are safe: logs restored earlier are matched by date + exact `created_at` +
metrics + note (`fingerprint` in [scripts/restore-plan.mjs](scripts/restore-plan.mjs), the pure tested part),
a log that fails halfway is deleted again, and the run ends by reloading the history and checking every
restored log against the backup. Note: `np_entries` has an n8n `AFTER INSERT` trigger (`pg_notify` of the
row) that fires once per restored log.
