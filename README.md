# SmartKanban

A self-hosted, card-centric kanban for small groups (2–5 people, like a family)
with a **conversational Telegram bot** as the primary capture channel. Send the
bot a text, voice note, or photo and an LLM turns it into a structured kanban
card that you can approve, edit, or refine — right inside Telegram.

Built to fit how a household actually works: everyone has their own board, but
cards can live on multiple boards; a **Family Inbox** collects shared captures;
and a read-only **/my-day** route drives a wall-mounted mirror.

![SmartKanban board](docs/screenshot.png) <!-- optional; placeholder -->

---

## Why this exists

Off-the-shelf kanban tools either force shared boards (Trello, Jira) or are
single-player (Things, Apple Notes). SmartKanban is card-centric: each card is
an atomic unit, and boards are just filters + column layouts over those cards.
Share a card with another member and it shows up on their board too — one
source of truth, live-synced.

The Telegram bot is the core capture channel. Opening the web app takes
seconds; sending a message to a bot is instant, and works from any phone.

---

## What's in the box

### Capture

- **DM the bot** — any message becomes a private card on your board
- **Post to the family group** — lands in **Family Inbox** with a Private /
  Public privacy prompt
- **Voice notes** → Whisper transcription, original audio attached
- **Photos** → gpt-4o-mini vision summary, original image attached
- **URLs auto-detected** — `github.com/...` and other links are preserved

### Interactive proposal flow (text messages)

Instead of blindly saving every message as a card, the bot runs your text
through an LLM (gemini-2.0-flash-001 by default, via OpenRouter) and replies:

```
📝 Buy eggs
Tags: #groceries

[🔒 Private] [👥 Public]
[📅 Today]   [⚡ Doing]
[🔗 Add link] [✏️ Edit] [❌ Cancel]
```

- **Save / Today / Doing** — create the card in that column
- **Add link** — paste URLs, they get attached to the description
- **Edit** — tell the bot "change tags to home" and it re-proposes
- **Cancel** — discard, no card

Non-task messages ("lol") get flagged with "Doesn't look like a task — save
anyway if you want." so you're never surprised by spurious cards.

### After save

The proposal message transforms into quick-action buttons:

```
✓ Saved · 📅 Today — Buy eggs

[⚡ Doing] [✅ Done] [🗑]
```

Tap to move the card across columns or archive it, all without leaving Telegram.

### Reply-based commands

- `/today message` — skip proposal, save directly to Today
- Reply to a bot card message with `/assign @alice` — reassigns it
- Reply with `/share @alice @bob` — shares the card

### Web app

- Drag-and-drop across four columns: Backlog / Today / In Progress / Done
- Three board scopes: **My board**, **Family Inbox**, **Everything**
- Click a card to edit title, description, tags, assignees, shares
- Attachments (voice, image) inline on the card
- Weekly review modal with gpt-4o-mini-written summary
- Mirror tokens → `/my-day?token=…` kiosk route (white on black, auto-refreshing)
- PWA manifest + service worker for install-to-home-screen

### Privacy model

- DM to bot → private to you (assignees = [you]; nobody else sees it, ever —
  verified by per-client WebSocket broadcast filtering)
- Group post → goes to Family Inbox by default; tap **Private** to move it
  onto your personal board only
- Single-card endpoints reject access to cards you don't have visibility into
  (creator / assignee / share / inbox)
- Passwords hashed with Argon2id; sessions are `httpOnly sameSite=lax` cookies

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    One Docker container                     │
│                                                             │
│   ┌───────────┐   ┌──────────────┐   ┌─────────────────┐    │
│   │ React SPA │◀─▶│ Fastify API  │◀─▶│  Postgres 16     │   │
│   │  (Vite)   │   │  + WebSocket │   │  (schema + data) │   │
│   └───────────┘   │  + Telegram  │   └─────────────────┘    │
│                   │  + /mirror   │                          │
│                   └──────┬───────┘                          │
└──────────────────────────┼──────────────────────────────────┘
                           │
                ┌──────────▼─────────┐           ┌──────────┐
                │    Telegram API    │           │OpenRouter│
                │ (polling/webhook)  │           │  primary │
                └────────────────────┘           └────┬─────┘
                                                      │fallback
                                                 ┌────▼─────┐
                                                 │  OpenAI  │
                                                 │ +Whisper │
                                                 └──────────┘
```

- **Backend**: Node 22 + Fastify + TypeScript + `@fastify/websocket` +
  [grammy](https://grammy.dev) for Telegram + [argon2](https://github.com/ranisalt/node-argon2)
- **Frontend**: React 18 + Vite + TypeScript + Tailwind + `@dnd-kit`
- **AI**: **OpenRouter primary** (any model, `google/gemini-2.0-flash-001` by
  default) with **OpenAI as fallback** — and OpenAI is the only option for
  Whisper audio transcription
- **DB**: PostgreSQL 16, idempotent `schema.sql` (additive, safe to re-run)
- **Storage**: local filesystem at `server/data/attachments/<card_id>/…`

**No `boards` table** — a board is a filter over cards (`scope=personal`,
`scope=inbox`, `scope=all`). Position is `DOUBLE PRECISION` so drag-drop never
needs bulk renumbering — just pick a midpoint.

**Per-client WebSocket broadcast filtering**: when a card is created/updated,
the server only sends it to sockets whose user has visibility into that card.
Private cards never reach other people's browsers in any form.

**Server-clock skew correction**: the client reads the `Date:` header on API
responses and uses the server's view of "now" for relative time displays, so a
drifted device clock won't show "8h ago" for a 5-minute-old card.

---

## Setup

### 1. Requirements

- Docker + Docker Compose (for Postgres)
- Node 20+
- A Telegram bot ([@BotFather](https://t.me/BotFather))
- An OpenRouter API key with a few dollars of credit (a $1 top-up lasts months
  at family usage)
- *(Optional)* an OpenAI API key — needed only for voice transcription
  (Whisper) and as an automatic fallback if OpenRouter rate-limits

### 2. Clone + install

```bash
git clone git@github.com:chatwithllm/SmartKanban.git
cd SmartKanban

docker compose up -d
docker exec -i kanbanclaude-db-1 psql -U kanban -d kanban < server/schema.sql

(cd server && npm install)
(cd web    && npm install)
```

### 3. Configure

```bash
cp .env.example server/.env
# then edit server/.env
```

Minimum required:

```
COOKIE_SECRET=<any long random string>
TELEGRAM_BOT_TOKEN=123456:ABCDEF…
TELEGRAM_GROUP_ID=-100XXXXXXXXXX   # bot will silently ignore all groups except this one
OPENROUTER_API_KEY=sk-or-v1-…
```

### 4. Run

**Dev (hot-reload both sides):**

```bash
cd server && npm run dev    # :3001
cd web    && npm run dev    # :5173 (proxies /api, /ws, /attachments, /telegram)
```

**Production (single binary):**

```bash
(cd web    && npm run build)
(cd server && npm run build)
cd server && PORT=8010 node --env-file=.env dist/index.js
```

Fastify serves the built web SPA, with SPA fallback so `/my-day?token=…`
resolves correctly.

### 5. First user & Telegram linking

1. Register the first account in the app (becomes the owner; any pre-existing
   Phase-1 cards get auto-assigned to them).
2. DM [@userinfobot](https://t.me/userinfobot) → get your Telegram user id.
3. In the app: **Settings → Telegram identities** → paste your id, click
   **Link to me**.
4. Add the bot to your family Telegram group. Disable privacy mode via BotFather
   (`/mybots` → Bot Settings → Group Privacy → Turn off).
5. Send any message in the group — a card appears within a second.
6. DM the bot directly for private captures.

Repeat step 2–3 for each additional family member.

---

## Environment variables

See [`.env.example`](.env.example) for the full list. Highlights:

| Variable                   | Purpose                                              | Default                         |
| -------------------------- | ---------------------------------------------------- | ------------------------------- |
| `DATABASE_URL`             | Postgres connection                                  | `postgresql://kanban:...`       |
| `PORT`                     | HTTP listen port                                     | `3001`                          |
| `COOKIE_SECRET`            | Signs session cookies                                | *(required)*                    |
| `OPEN_SIGNUP`              | Allow public registrations                           | `true` (set `false` when done)  |
| `TELEGRAM_BOT_TOKEN`       | Bot token from @BotFather                            | *(optional, gates bot startup)* |
| `TELEGRAM_GROUP_ID`        | The one family group id the bot answers in          | *(required if bot running)*     |
| `TELEGRAM_WEBHOOK_URL`     | If set, use webhook; else long-poll                  | *(unset)*                       |
| `OPENROUTER_API_KEY`       | Primary AI (chat + vision)                           | *(optional)*                    |
| `OPENROUTER_MODEL`         | Chat model                                           | `google/gemini-2.0-flash-001`   |
| `OPENROUTER_VISION_MODEL`  | Vision model                                         | `google/gemini-2.0-flash-001`   |
| `OPENAI_API_KEY`           | Whisper (audio) + AI fallback                        | *(optional)*                    |
| `APP_URL`                  | Sent as `HTTP-Referer` to OpenRouter                 | `http://localhost:8010`         |

---

## Data model (summary)

```
users           (id, name, short_name, email, auth_hash, created_at)
cards           (id, title, description, status, tags[], due_date,
                 source enum(manual|telegram|mirror), position float,
                 created_by → users.id, ai_summarized, needs_review,
                 telegram_chat_id, telegram_message_id,
                 archived, created_at, updated_at)
card_assignees  (card_id, user_id)          — many-to-many
card_shares    (card_id, user_id)          — many-to-many
card_attachments (id, card_id, kind enum(audio|image|file), storage_path, ...)
telegram_identities (telegram_user_id, app_user_id, telegram_username)
sessions       (token, user_id, expires_at)
mirror_tokens  (token, user_id, label)
activity_log   (id, actor_id, card_id, action, details, created_at)
```

Full DDL in [`server/schema.sql`](server/schema.sql) (idempotent — safe to
re-run on an existing database).

---

## API (brief)

| Method | Path                               | Notes                                |
| ------ | ---------------------------------- | ------------------------------------ |
| POST   | `/api/auth/register`               | First user is the owner              |
| POST   | `/api/auth/login`                  | Returns session cookie               |
| POST   | `/api/auth/logout`                 |                                      |
| GET    | `/api/auth/me`                     |                                      |
| PATCH  | `/api/auth/me`                     | Update `short_name`, `name`          |
| GET    | `/api/users`                       | List family                          |
| GET    | `/api/cards?scope=personal\|inbox\|all`   | Visibility enforced                  |
| POST   | `/api/cards`                       |                                      |
| GET    | `/api/cards/:id`                   |                                      |
| PATCH  | `/api/cards/:id`                   | Partial: title, status, tags, …      |
| DELETE | `/api/cards/:id`                   | Soft delete                          |
| GET    | `/api/review`                      | Done / stale / stuck + AI summary    |
| POST   | `/api/mirror/tokens`               | Long-lived mirror token              |
| POST   | `/api/telegram/link`               | Link TG user id → app user           |
| POST   | `/telegram/webhook/<secret>`       | Telegram webhook endpoint            |
| WS     | `/ws`                              | Per-client filtered broadcasts       |

---

## Backups

```bash
# Manual
scripts/backup.sh /mnt/backups/kanban

# cron (3am daily)
0 3 * * *  /path/to/SmartKanban/scripts/backup.sh /mnt/backups/kanban
```

Outputs `db-<ts>.sql.gz` (pg_dump) and `attachments-<ts>.tar.gz` (file blobs);
keeps the last 14 of each.

---

## Project layout

```
SmartKanban/
├── docker-compose.yml              # Postgres
├── scripts/backup.sh               # pg_dump + attachments tarball
├── server/
│   ├── schema.sql                  # idempotent DDL
│   ├── src/
│   │   ├── index.ts                # Fastify bootstrap
│   │   ├── auth.ts                 # Argon2 + sessions + mirror tokens
│   │   ├── cards.ts                # visibility predicate, list helpers
│   │   ├── ws.ts                   # per-client broadcast filter
│   │   ├── routes/                 # auth, cards, mirror, review, telegram, attachments
│   │   ├── ai/
│   │   │   ├── openai.ts           # OpenRouter primary + OpenAI fallback clients
│   │   │   ├── propose.ts          # text → card proposal
│   │   │   ├── vision.ts           # photo → card via vision model
│   │   │   ├── whisper.ts          # audio → text (OpenAI only)
│   │   │   └── weekly_summary.ts   # weekly review paragraph
│   │   └── telegram/
│   │       ├── bot.ts              # message handling, inline keyboards, callbacks
│   │       └── proposals.ts        # in-memory pending proposal state
│   └── __tests__/                  # unit tests (hashtag, command, mention parsing)
└── web/
    ├── vite.config.ts              # /api, /ws, /attachments, /telegram proxies
    ├── public/                     # PWA manifest + service worker
    └── src/
        ├── App.tsx                 # auth gate + board
        ├── MirrorView.tsx          # /my-day kiosk
        ├── api.ts                  # typed client + server-clock skew
        ├── ws.ts                   # WebSocket client
        ├── auth.tsx                # useAuth context
        └── components/             # Board, Column, CardView, EditDialog, …
```

---

## Non-goals (by design)

- **Not** a Jira/Linear replacement — no sprints, epics, story points
- **Not** a team/enterprise tool — no SSO, no role matrix, no audit compliance
- **Not** a notes app — cards are tasks, link out for long form
- **Not** real-time collaborative editing inside a card (save-on-edit is fine)
- **Not** mobile-native — responsive web + PWA install is the support model
- **Not** a chat app — Telegram is capture-only, not discussion threads

Plus these explicit v1 omissions: color priorities, subtasks/checklists, card
comments, multi-group Telegram, per-user custom column layouts, notifications
(including no "card shared with you" push — add only when someone asks).

---

## Status

All phases in the original product brief are implemented:

| Phase | Scope                                                          | Status |
| :---: | -------------------------------------------------------------- | :----: |
| 1     | Single-user CRUD, 4 columns, drag-drop, Postgres               |   ✅   |
| 2     | Auth, users, Family Inbox, sharing, WebSocket sync             |   ✅   |
| 2.5   | Telegram text + voice → Whisper → card, attachments            |   ✅   |
| 3     | `/my-day` mirror view, long-lived mirror tokens                |   ✅   |
| 3.5   | Telegram images → vision → card                                |   ✅   |
| 4     | PWA, weekly review, backups, hashtag extraction                |   ✅   |
| 5+    | `/today`, `/assign`, `/share` reply commands, AI summary,      |   ✅   |
|       | interactive propose/edit flow, URL auto-detection, post-save   |        |
|       | quick-action buttons, server-clock skew correction             |        |

Skipped: local Whisper (requires model download + GPU), Home Assistant
integration (requires user's HA setup).

---

## License

MIT — see [LICENSE](LICENSE).
