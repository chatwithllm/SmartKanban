# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SmartKanban — self-hosted, **card-centric** kanban for a small group (2–5, a
household). A card is the atomic unit; boards are just filters + column layouts
over cards, so one card can appear on multiple members' boards (share = live
sync). The **Telegram bot is the primary capture channel**: text/voice/photo/URL
→ LLM → structured card or knowledge item, approved/edited inside Telegram.

Three clients over one Fastify API:
- **`web/`** — React + Vite SPA (main UI; includes the `/my-day` wall-mirror view)
- **`server/`** — Fastify + Postgres API + Telegram bot + AI pipeline
- **`macOS/`** — native SwiftUI menu-bar app (thin client to the same API)

## Commands

### Server (`cd server`)
- `npm run dev` — tsx watch on `:3001` (loads `.env`)
- `npm run build` — `tsc` → `dist/`
- `npm start` — run built `dist/index.js`
- `npm test` — runs `tsx --test src/__tests__/*.test.ts` (all tests)
- Single test: `npx tsx --test src/__tests__/cards_fts_search.test.ts`
- `npm run db:init` — apply `schema.sql` to local Postgres
- `npm run embed:backfill` — backfill embeddings

### Web (`cd web`)
- `npm run dev` — Vite on `:5173`, proxies `/api`, `/ws`, `/attachments`,
  `/telegram` → `:3001` (see `vite.config.ts`)
- `npm run build` — `tsc -b && vite build` → `web/dist/` (server serves this if present)

### macOS (`cd macOS`) — Apple Silicon only, no signing team
- `Scripts/build-dmg.sh` — `xcodebuild` Release → ad-hoc-signed `.app` → `.dmg`
- Project generated from `project.yml`; smoke tests are standalone `Scripts/*_test.swift`

### Full local stack
`docker compose up -d` (Postgres + server on `:3001`). Schema applied via
`docker compose exec -T db psql -U kanban -d kanban < server/schema.sql`.

## Database

- **`server/schema.sql` is the single additive, idempotent source of truth** —
  safe to re-run on a fresh or existing DB (`CREATE ... IF NOT EXISTS`, enum
  guards). New schema goes here.
- `server/migrations/*.sql` are dated, additive, idempotent patches applied in
  filename sort order (the installer loops them after schema.sql). There is **no
  migration-runner in code** — schema.sql + the migrations loop in
  `scripts/install.sh` are the only appliers.
- Postgres FTS drives dedupe/search; some flows re-rank with Gemini Flash.

## Architecture notes (the non-obvious parts)

- **Server entry `server/src/index.ts`** registers every route module, then
  starts the Telegram bot, brainstorm queue, insights recovery, and the reaper.
  A global error handler maps Postgres `22P02` (malformed UUID) → 404, so
  routes read `:id` straight into queries without validating param shape.
- **Layout:** `routes/` = HTTP handlers; top-level `src/*.ts` (auth, cards, db,
  knowledge, notifications, reaper, ws…) = domain logic; `ai/` = LLM pipeline
  (propose, dedupe, vision, whisper, brainstorm, weekly_summary); `telegram/` =
  bot + destination/proposal state machine.
- **AI providers:** OpenRouter is primary chat+vision (`google/gemini-2.0-flash-001`
  default); OpenAI is Whisper (voice) + fallback; Tavily is optional brainstorm
  web-search. All keys optional — features degrade gracefully when absent.
- **Realtime:** `ws.ts` pushes live card updates to web + macOS clients.
- **macOS client** (`macOS/KanbanClaude/`): SwiftUI; `Networking/` mirrors the
  API, `Stores/` hold state, `Keychain/` persists the session. It is a client
  only — no business logic lives here.

## Working in this repo — institutional memory (important)

This project uses the **web-app-builder** discipline harness. Before non-trivial
work, read these; they are incident-locked and override default habits:

- **`agent-rules.md`** — numbered, hard rules (DB transactions, auth, etc.).
  `agent-rules.macos-build.md` is the branch-specific superset for macOS work.
- **`AGENT_LEARNINGS.md`** — every past bug → root cause → the rule it locked in.
  When you fix a bug, append an incident here and lock a rule in `agent-rules.md`.
- **`done-gate.md`** — the per-task completion gate.
- `build_status.json` / `dashboard.html` — build progress tracking.

Branches: `main` is the default; **current work is on `macos-build`**. The
`.macos-build`-suffixed doc variants belong to that branch.

## Kanban workflow

Dev work on this repo is itself tracked on a kanban board via the `/kanban`
skill (and `/kanban-*` commands). `notes/` is a symlink to the project's
notes directory.
