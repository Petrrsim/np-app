# NP App

A personal daily diary that records mood, energy, flow, and a success step plus an
encrypted note, backed by Supabase.

Three screens behind a one-time login:

- **New Entry** (`/`) — log today's mood / energy / flow, success, sleep, activities, people,
  markers and a note.
- **History** (`/history`) — every log, newest first, with edit / delete and date, note-search,
  marker and person filters.
- **Dashboard** (`/dashboard`) — averages vs. the previous period, a scrollable interactive chart
  of mood / energy / flow (success markers, moving-average trend lines, click a point for the log)
  and insights (weekday rhythm, wins vs. misses, activities, people, sleep, markers).

Rebuilt from scratch on a **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 +
Supabase + TanStack Query** stack. The Supabase backend (tables + edge functions) was
carried over from the previous version — see [SUPABASE.md](SUPABASE.md) for the full contract.

## Getting started

1. Ensure [.env](.env) defines `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (see [.env.example](.env.example)).
2. Install and run:

   ```bash
   npm install
   npm run dev
   ```

   Open http://localhost:3000.

## Scripts

| Command         | Description                                          |
| --------------- | ---------------------------------------------------- |
| `npm run dev`   | Start the dev server (Turbopack).                    |
| `npm run build` | Production build (type-checks; fails on type errors).|
| `npm start`     | Serve the production build.                           |
| `npm run lint`  | Run ESLint.                                           |

## Project layout

- `src/app/` — App Router routes, layout, and providers.
- `src/lib/supabase.ts` — Supabase browser client.
- `src/lib/edge.ts` — wrappers for the encrypted-entry edge functions.
- `src/lib/stats.ts` — pure Dashboard computations (averages, moving averages, insights).
- `src/components/dashboard/` — Dashboard tiles, chart and insight cards.
- `src/types/db.ts` — shared domain types / DB contract.

See [CLAUDE.md](CLAUDE.md) for architecture and conventions.
