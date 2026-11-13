@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Status:** Rebuilt from scratch on 2026-06-03 (Next.js). The previous Vite SPA was deleted; the
> Supabase backend (data + edge functions) was preserved and is documented in
> [SUPABASE.md](SUPABASE.md). Single-user personal diary — two screens (New Entry, History) + login.

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
    layout.tsx · providers.tsx · globals.css   root shell (html.dark, QueryClient + AuthProvider, Toaster, theme)
    icon.png · apple-icon.png                  tab favicon (192px) + iOS home-screen icon (180px), resized
                                               from media/np_logo.png (file-convention icons, no <link> code)
    login/page.tsx                             bare login screen (signInWithPassword)
    (protected)/                               route group behind <AuthGate> + <AppHeader>
      layout.tsx · page.tsx (New Entry, "/") · history/page.tsx
  components/
    ui/             shadcn-style primitives (button, card, input, textarea, slider, dialog,
                    alert-dialog, popover, sonner)
    *.tsx           features: app-header, np-logo, auth-gate, entry-form, entry-fields,
                    metric-slider, success-buttons, level-tiles, sleep-picker,
                    activity-picker, entry-card,
                    edit-entry-dialog, delete-entry-button, date-picker
  contexts/         auth-context.tsx (useAuth)
  hooks/            use-entries.ts (list/create/update/delete incl. activities, latest metrics,
                    sleep-logged-on)
  lib/              supabase.ts (browser client), edge.ts (edge wrappers), utils.ts (cn),
                    activities.ts (activity list)
  types/            db.ts (shared domain types / DB contract)
media/np_logo.png   app logo (imported via next/image static import in np-logo.tsx; source for the icons)
.env              Supabase connection (gitignored)        .env.example  template
CLAUDE.md         this file       AGENTS.md  Next.js 16 agent rules (imported above)
SUPABASE.md       preserved backend contract              README.md     project readme
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
by feeling (Rough 1 / OK 2 / Great 3) and an encrypted note. Several logs
per day are normal (e.g. morning + afternoon). **New Entry** (`/`) always logs for today; **History**
lists logs newest→oldest with per-log edit/delete and a calendar date filter.

Form fields ([entry-fields.tsx](src/components/entry-fields.tsx), shared by New Entry and the
History edit dialog) in order: Mood, Energy, Flow sliders → Success → Sleep → Activities → Note
(placeholder "What's up bro?").

New Entry behaviour:
- **Sliders carry over** from the most recent log (any day) via `useLatestMetrics`; the form shows a
  spinner until that resolves so sliders don't jump from the defaults (6). After saving, sliders keep
  the saved values; success resets to 0, sleep to `null`, activities to `[]`, note to `""`.
- **Sleep is optional per log** — starts `null`; tapping the selected tile again or "Clear" unsets it.
  If an earlier log today already has sleep, the picker shows a "Logged today · …" hint
  (`useSleepLoggedOn`) but doesn't copy the value.
- **Activities are optional per log, any number** — toggle chips, then each picked activity gets
  its own Rough/OK/Great tiles. Saving is blocked (toast) until every picked activity is rated.
  The list lives in code: [src/lib/activities.ts](src/lib/activities.ts) (`ACTIVITIES` — add a
  `{ key, label, Icon }` line; never rename a stored `key`; no DB change needed).

UI style: success, sleep and activity feeling are 3-tile pickers sharing one look — lucide icon,
tinted gradient + glow when selected, and a 3-segment bar (sleep/feeling = level meter, success =
position marker). No emojis. Once an activity is rated, its chip gets the same gradient + glow and
its card a tinted border/wash in the feeling colour; unrated picks stay neutral.
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
