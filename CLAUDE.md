@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Status:** Rebuilt from scratch on 2026-06-03 (Next.js). The previous Vite SPA was deleted; the
> Supabase backend (data + edge functions) was preserved and is documented in
> [SUPABASE.md](SUPABASE.md). Single-user personal diary — four screens (New Entry, History, Dashboard, Settings) + login.

## Skills

- **senior-fullstack** ([.claude/skills/senior-fullstack/](.claude/skills/senior-fullstack/)) — use for web-app
  development work (scaffolding features, architecture/design patterns, dev workflows, code-quality analysis).
  Invoke it (`/senior-fullstack`) before starting any non-trivial fullstack build.

## Commands

- `npm run dev` — start the Next.js dev server (Turbopack).
- `npm run build` — production build (runs TypeScript checks; fails on type errors).
- `npm start` — serve the production build.
- `npm run lint` — run ESLint (`eslint-config-next`).

There is no test runner configured.

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
    (protected)/                               route group behind <AuthGate> + <AppHeader>
      layout.tsx · page.tsx (New Entry, "/") · history/page.tsx · dashboard/page.tsx ·
      settings/page.tsx
  components/
    ui/             shadcn-style primitives (button, card, input, textarea, slider, dialog,
                    alert-dialog, popover, sonner)
    *.tsx           features: app-header, np-logo, auth-gate, entry-form, entry-fields,
                    metric-slider, success-buttons, level-tiles, sleep-picker,
                    activity-picker, people-picker, marker-picker, entry-card,
                    edit-entry-dialog, delete-entry-button, date-picker
    dashboard/      trend-card (chart controls) · trend-chart (hand-built SVG chart) ·
                    stat-tiles (Mood/Energy/Flow tiles) · insights (weekday / success / tag / sleep cards)
    settings/       list-manager (add/rename/icon/hide/delete for one list) · data-card (CSV/JSON
                    export) · account-card (email, change password, sign out)
  contexts/         auth-context.tsx (useAuth)
  hooks/            use-entries.ts (list/create/update/delete incl. activities, people, markers,
                    latest metrics, sleep-logged-on; usePeople/useMarkers lists + create)
                    use-lists.ts (useActivities/useActivityLookup/useCreateActivity; generic
                    useUpdateListItem/useDeleteListItem/useReorderList for all three lists)
  lib/              supabase.ts (browser client), edge.ts (edge wrappers), utils.ts (cn),
                    activities.ts (activity icon registry, key slugs, lookup), search.ts (History
                    note search + highlight), stats.ts (pure Dashboard computations),
                    export.ts (CSV/JSON backup)
  types/            db.ts (shared domain types / DB contract)
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
`public/` (static assets) is intentionally absent — recreate it only when you add static files.
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
7/30/90d window, zoom) → the selected log → Insights (weekday rhythm, wins vs. misses, and
activities / people / sleep / markers cards that only appear when the range has that data). Data quirks the code relies on: metrics can be decimals or numeric strings
(`num()` coerces), ~640 old logs have no metrics at all (excluded from the chart via
`buildPoints`), and Flow only exists since mid-2025. The chart
([trend-chart.tsx](src/components/dashboard/trend-chart.tsx)) is a hand-built SVG, one column per
log (not per day), horizontally scrollable with zoom levels; it **only renders the visible window
± overscan** (the "All" range is ~4.3k columns), so keep it windowed. Lines break and show a gap
pill when logs are > 10 days apart. Moving averages are trailing *calendar-day* windows
(7/30/90d) computed over the full history, then sliced to the range. Success ±1 shows as a
tinted column wash plus ✓/✗ (zoomed-out: ▲/▼) glyphs in a lane under the plot. Clicking a point
(or ←/→ on the focused chart) shows that log's `EntryCard` below the chart. Series colours are
the `--chart-mood/energy/flow` tokens — a CVD-validated set; don't swap in other hues casually.
`METRICS` references them as `var(--chart-x, #hex)`: keep the hex fallbacks — with a stale dev
CSS cache a missing token makes SVG strokes vanish (dots still show, lines don't).

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
  in the DB like markers (`np_people`, via `usePeople`; added in Settings). Stored in
  `np_entry_people` (merged into `DecryptedEntry.people`); resets to `[]` after saving. Colours reuse the `--feel-*` tokens; battery icons.
- **Markers are optional per log, any number** — toggle chips ([marker-picker.tsx](src/components/marker-picker.tsx)).
  The list lives in the DB (`np_markers`, via `useMarkers`; added in Settings). Entries reference
  markers by id (`DecryptedEntry.markers: number[]`, from `np_entry_markers`). Markers reset to `[]` after saving.

Settings (`/settings`, gear icon in the header — sign out lives here now): one card each for
Activities, People and Markers (add, ↑/↓ reorder, rename, change icon for activities, hide/show,
delete) plus Data (CSV/JSON export of the full decrypted history) and Account (change password, sign out).
**Hidden** (`hidden` column on all three tables) = stays on past logs, History filters and the
Dashboard, but isn't offered in the New Entry / Edit pickers — unless already on the log being
edited. **Delete** is permanent and removes the item from every log (people/markers cascade;
activities have no FK, so `useDeleteListItem` deletes their `np_entry_activities` rows first);
the confirm dialog shows the usage count and offers "Hide instead". Usage counts come from the
cached `useEntries` history.
**Order**: all three lists sort by `position` (nulls last), then `id` — the pickers, History
filters and Settings all follow it. `useReorderList` writes only the rows whose position changed
and reorders the cache optimistically; new items start with `position` null (= end of the list).
In Settings, hidden items sit below the visible ones and only move within their group.

UI style: success, sleep and activity feeling are 3-tile pickers sharing one look — lucide icon,
tinted gradient + glow when selected, and a 3-segment bar (sleep/feeling = level meter, success =
position marker). No emojis. Once an activity is rated, its chip gets the same gradient + glow and
its card a tinted border/wash in the feeling colour; unrated picks stay neutral.
Light "paper & ink" theme (warm off-white page, white cards with `shadow-card`, near-black
primary matching the logo); scale colours use 600–700 shades so they read as text on white.
Colours are theme tokens in `globals.css` (`--success`, `--destructive`, `--sleep-poor/fine/good`,
`--feel-rough/ok/great`). Sleep and activity feeling both render through `LevelTiles` /
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
   `sleep_quality`. The deployed edge functions don't know `sleep_quality` (and their source can't
   be fetched — "deployment is missing metadata"), so: `edge.ts` strips `sleep` from edge payloads;
   `useCreateEntry` calls `save-entry` then sets `sleep_quality` on the new row (returned `id`, else
   newest row for that date); `useEntries` merges a direct `select id, sleep_quality` in by `id`.
   Activities live in their own table `np_entry_activities` (direct access, same pattern: insert
   after `save-entry`, delete-dropped + upsert on edit, merged into `DecryptedEntry.activities`).
   People (`np_entry_people`, with `np`) and markers work the same way; markers via `np_entry_markers` (merged into `DecryptedEntry.markers`); the
   marker list itself is `np_markers` under its own query key `MARKERS_KEY`, the people list is
   `np_people` under `PEOPLE_KEY`, and the activity list is `np_activities` under `ACTIVITIES_KEY`.

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
