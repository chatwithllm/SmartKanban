# SmartKanban Features

A comprehensive inventory of every feature in the SmartKanban codebase, organized by domain.

---

## 1. Core Kanban Board

### Four-Column Board
- Columns: **Backlog**, **Today**, **In Progress**, **Done**
- Responsive grid layout: 1 column (mobile), 2 columns (tablet), 4 columns (desktop)
- Quick-add card input at the top of each column

### Drag-and-Drop
- Powered by `@dnd-kit` with closest-corner collision detection
- Position calculated via midpoint formula (double-precision floats prevent bulk renumbering)
- Optimistic UI updates with rollback on failure
- 4px pointer activation constraint to distinguish clicks from drags

### Card CRUD
- Create cards with title, description, status, tags, due date, and assignees
- Update any card property including position, shares, and `needs_review` flag
- Delete (soft archive) cards with undo support
- Cards default-assign to their creator; unassigned cards land in the Family Inbox

### Card Display
- Title, description, and tag badges
- Inline image thumbnails for photo attachments
- Assignee and creator avatars with short names
- Relative timestamps corrected for server-clock skew
- Source indicators: Telegram, AI-summarized, voice attachment, needs review

**Key files:** `web/src/components/Board.tsx`, `web/src/components/Column.tsx`, `web/src/components/CardView.tsx`, `web/src/components/EditDialog.tsx`, `server/src/routes/cards.ts`

---

## 2. Authentication and User Management

### Registration and Login
- Email + password authentication with Argon2id hashing
- Password minimum: 6 characters; short name: 1-16 characters
- 30-day httpOnly session cookie (`kanban_session`, sameSite=lax)
- `OPEN_SIGNUP` flag controls whether new users can self-register (default: true)
- First registered user becomes the owner and inherits any pre-existing Phase-1 cards

### Session Management
- Sessions stored in PostgreSQL with 30-day expiry
- `requireUser` Fastify hook enforces authentication on protected routes
- Logout invalidates the session token and clears the cookie

### User Profile
- View and update full name and short name via `PATCH /api/auth/me`
- List all family members via `GET /api/users`

### Frontend Auth
- `AuthContext` provider with `useAuth()` hook (login, register, logout, updateMe)
- Toggle between login and register modes; inline error display and busy state

**Key files:** `server/src/routes/auth.ts`, `server/src/auth.ts`, `web/src/auth.tsx`, `web/src/components/LoginView.tsx`

---

## 3. Privacy and Visibility

### Visibility Predicate
A card is visible to a user if they:
1. Created it, **or**
2. Are assigned to it (`card_assignees`), **or**
3. Have it shared with them (`card_shares`), **or**
4. It is unassigned (Family Inbox)

### Scope Filtering
- **My Board** (`personal`): cards created by, assigned to, or shared with the user
- **Family Inbox** (`inbox`): unassigned cards only
- **Everything** (`all`): union of personal + inbox
- Scope selector in the board header

### Per-Client WebSocket Filtering
- `broadcast()` evaluates the visibility predicate per connected client
- Private cards never reach unauthorized browsers

### Assignees and Shares
- Many-to-many `card_assignees` and `card_shares` tables
- Multi-select toggle in the card edit dialog
- Unassigning all users moves a card to the Family Inbox

**Key files:** `server/src/cards.ts`, `server/src/ws.ts`, `web/src/components/BoardHeader.tsx`

---

## 4. Real-Time Synchronization

### WebSocket Server
- Upgrade endpoint: `GET /ws`
- Authenticated via session cookie or mirror token (`?mirror=...`)
- Events: `card.created`, `card.updated`, `card.deleted`
- Per-client registration with cleanup on disconnect

### WebSocket Client
- Auto-reconnect with exponential backoff (500 ms to 10 s)
- Mirror token support via query parameter
- Event parsing and dispatch to React state

### Client State Sync
- WebSocket events update local card state in `App.tsx`
- Hybrid approach: optimistic UI for user actions + WebSocket sync for remote changes
- Client-side scope filtering on incoming events

**Key files:** `server/src/ws.ts`, `web/src/ws.ts`, `web/src/App.tsx`, `web/src/api.ts`

---

## 5. Telegram Bot Integration

### Setup
- Activated when `TELEGRAM_BOT_TOKEN` is set
- Long-polling in development, webhook in production
- Only responds in the configured `TELEGRAM_GROUP_ID`; silently ignores other chats

### Message Capture
- **Direct messages**: auto-create a private card assigned to the sender
- **Group messages**: create an unassigned card in the Family Inbox
- Hashtag extraction (`#tag` tokens converted to lowercase, deduplicated)
- URL auto-detection and markdown link list in description

### AI Proposal Flow
- Text is sent to the LLM to produce a structured proposal (title, description, tags)
- Interactive inline keyboard: Private/Public, Today/Doing, Add Link/Edit/Cancel
- Edit flow: user replies with corrections, AI re-proposes
- Link flow: user pastes URLs, merged into card description
- Pending proposals stored in memory with 10-minute TTL and auto-prune
- Graceful fallback: if AI is disabled or fails, the raw message is saved directly

### Post-Save Quick Actions
- Inline keyboard after save: Today / Doing / Done / Archive
- Callback updates card status immediately with emoji reaction feedback

### Tests
- `server/src/__tests__/telegram_parse.test.ts` — Unit tests for hashtag extraction, command parsing, and mention handling

### Voice Notes
- Auto-download Telegram voice/audio files
- Transcribe via OpenAI Whisper (`whisper-1` model)
- First line becomes title, remainder becomes description
- Original `.ogg` file attached to the card
- `needs_review=true` if transcription fails

### Photos
- Auto-download the largest available Telegram photo
- Summarize via vision model (OpenRouter or OpenAI)
- Title and description extracted from the image; caption merged if present
- Original `.jpg` attached to the card; inline thumbnail in the UI
- `ai_summarized=true` on success; `needs_review=true` on vision failure

### Reply-Based Commands
- `/assign @user1 @user2` — reassign a card (creator-only)
- `/share @user1 @user2` — add users to shares (creator-only)
- `/today <message>` — skip the proposal flow, create a card directly in Today
- Mention parsing via `telegram_identities` table

### Identity Linking
- Link a Telegram user ID to an app user via Settings dialog or API
- `POST /api/telegram/link`, `GET /api/telegram/identities`, `DELETE /api/telegram/identities/:id`

**Key files:** `server/src/telegram/bot.ts`, `server/src/telegram/proposals.ts`, `server/src/routes/telegram.ts`, `web/src/components/SettingsDialog.tsx`

---

## 6. AI / LLM Features

### Dual-Provider Architecture
- **Primary**: OpenRouter (default model: `google/gemini-2.0-flash-001`)
- **Fallback**: OpenAI (`gpt-4o-mini`)
- Lazy client initialization — the app boots fine without any AI keys
- `withChatFallback()` and `withVisionFallback()` helpers for automatic retry

### Text-to-Card Proposal
- Produces `{ is_actionable, title, description, tags, reason }` from free-form text
- Multi-turn refinement via the Telegram edit flow
- Title soft-capped at 60 characters (hard cap 120); max 3 tags

### Photo-to-Card Vision
- Converts an image to `{ title, description }` via a vision-capable model
- Used during Telegram photo capture

### Audio Transcription
- OpenAI Whisper API (`whisper-1`) for voice note transcription
- Returns trimmed text or null on failure

### Weekly Review Summary
- Generates a 3-5 sentence prose summary from done, stale, and stuck card lists
- Warm, factual tone; celebrates wins and flags stuck items
- Returns null if AI is disabled or there are no items

### AI Enablement
- `AI_ENABLED()` returns true if either OpenRouter or OpenAI key is configured
- All AI-dependent features degrade gracefully when disabled

**Key files:** `server/src/ai/openai.ts`, `server/src/ai/propose.ts`, `server/src/ai/vision.ts`, `server/src/ai/whisper.ts`, `server/src/ai/weekly_summary.ts`

---

## 7. Mirror / Kiosk View

### Mirror Tokens
- Create long-lived, label-optional tokens via `POST /api/mirror/tokens`
- List and revoke tokens via API
- Token passed as `?token=...` query parameter or `X-Mirror-Token` header

### /my-day Kiosk Display
- White text on black background (designed for two-way mirrors)
- Large fonts (4xl titles), high contrast
- Displays only **Today** and **In Progress** cards
- Auto-refresh every 30 seconds + live WebSocket sync
- Read-only: no editing, dragging, or card creation
- "Nothing on deck" placeholder when empty

**Key files:** `web/src/MirrorView.tsx`, `server/src/routes/mirror.ts`

---

## 8. Weekly Review

### Review Endpoint
- `GET /api/review` returns:
  - `done[]` — cards completed in the past 7 days (max 20)
  - `stale[]` — cards not updated in 7+ days, still open (max 15)
  - `stuck[]` — cards in In Progress for 3+ days (max 15)
  - `summary` — AI-generated prose summary (if AI enabled)

### Review UI
- Modal dialog accessible from the board header
- Three sections: Done, Stale, Stuck with card titles and relative timestamps
- AI summary displayed at the top when available

**Key files:** `server/src/routes/review.ts`, `web/src/components/WeeklyReview.tsx`

---

## 9. Activity Logging

- `logActivity(actorId, cardId, action, details)` records every card mutation
- Actions include: `create`, `update`, `archive`, `telegram.*`, `telegram.proposal.*`, `telegram.move.*`
- Details stored as a JSON blob with context (title, changed fields, assignees, etc.)
- Stored in the `activity_log` table

**Key files:** `server/src/cards.ts`

---

## 10. File Attachments

- Local filesystem storage under `data/attachments/{card_id}/{file_id}{ext}`
- Served via `GET /attachments/*` (authentication required)
- Downloaded from Telegram API during voice and photo capture
- Supported types: audio (`.ogg`), image (`.jpg`), generic files

**Key files:** `server/src/routes/attachments.ts`, `server/src/telegram/bot.ts`

---

## 11. Infrastructure

### Database
- PostgreSQL with connection pool via `DATABASE_URL` (`server/src/db.ts`)
- Idempotent schema in `server/schema.sql`
- Tables: `users`, `cards`, `card_assignees`, `card_shares`, `card_attachments`, `telegram_identities`, `sessions`, `mirror_tokens`, `activity_log`

### Server
- Fastify with TypeScript (`server/src/index.ts`)
- SPA fallback: catch-all route serves `index.html` (excludes `/api`, `/ws`, `/telegram`, `/attachments`)
- Health check: `GET /health` returns `{ ok: true }`

### Frontend
- React 18 + TypeScript + Vite + Tailwind CSS
- PWA: install-to-home-screen, service worker for offline support
- Responsive design with mobile-first Tailwind classes
- Entry point: `web/src/main.tsx` — renders App into DOM root
- Shared type definitions: `web/src/types.ts` — Card, User, and other TypeScript interfaces

### Backups
- `scripts/backup.sh`: pg_dump + tar.gz of attachments
- 14-day retention; designed for daily cron

### Docker
- `docker-compose.yml` for PostgreSQL container

---

## 12. API Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/me` | Current user profile |
| PATCH | `/api/auth/me` | Update profile |
| GET | `/api/users` | List all users |
| GET | `/api/cards?scope=` | List visible cards |
| POST | `/api/cards` | Create a card |
| GET | `/api/cards/:id` | Get a card |
| PATCH | `/api/cards/:id` | Update a card |
| DELETE | `/api/cards/:id` | Archive a card |
| POST | `/api/mirror/tokens` | Create mirror token |
| GET | `/api/mirror/tokens` | List mirror tokens |
| DELETE | `/api/mirror/tokens/:token` | Revoke mirror token |
| GET | `/api/review` | Weekly review data |
| POST | `/api/telegram/link` | Link Telegram identity |
| GET | `/api/telegram/identities` | List linked identities |
| DELETE | `/api/telegram/identities/:id` | Unlink identity |
| POST | `/telegram/webhook/:secret` | Telegram webhook |
| GET | `/ws` | WebSocket upgrade |
| GET | `/attachments/*` | Serve attachment file |
| GET | `/health` | Health check |

---

## 13. Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | `postgres://kanban:kanban@localhost:5432/kanban` | PostgreSQL connection string |
| `PORT` | No | `3001` | HTTP listen port |
| `COOKIE_SECRET` | Yes | — | Session cookie signing key |
| `OPEN_SIGNUP` | No | `true` | Allow public registration |
| `TELEGRAM_BOT_TOKEN` | No | — | Telegram bot token |
| `TELEGRAM_GROUP_ID` | Conditional | — | Required if bot enabled |
| `TELEGRAM_WEBHOOK_URL` | No | — | Webhook URL (long-polling if unset) |
| `TELEGRAM_WEBHOOK_SECRET` | No | `dev-webhook` | Webhook path secret |
| `OPENROUTER_API_KEY` | No | — | Primary AI provider key |
| `OPENROUTER_MODEL` | No | `google/gemini-2.0-flash-001` | Chat model |
| `OPENROUTER_VISION_MODEL` | No | `google/gemini-2.0-flash-001` | Vision model |
| `OPENAI_API_KEY` | No | — | Whisper + fallback AI key |
| `APP_URL` | No | `http://localhost:8010` | Referer for OpenRouter |
| `ATTACHMENTS_DIR` | No | `data/attachments` | File storage directory |
