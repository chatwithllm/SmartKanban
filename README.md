# SmartKanban

A self-hosted, card-centric kanban for small groups (2–5 people, like a family)
with a **conversational Telegram bot** as the primary capture channel. Send the
bot a text, voice note, photo, or URL and an LLM turns it into a structured
kanban card or knowledge item that you can approve, edit, or refine — right
inside Telegram.

Built to fit how a household actually works: everyone has their own board, but
cards can live on multiple boards; a **Family Inbox** collects shared captures;
templates speed up recurring tasks; a knowledge base captures URLs and notes
linked to cards; and a read-only **/my-day** route drives a wall-mounted mirror.

![SmartKanban board](docs/screenshot.png) <!-- optional; placeholder -->

---

## Why this exists

Off-the-shelf kanban tools either force shared boards (Trello, Jira) or are
single-player (Things, Apple Notes). SmartKanban is card-centric: each card is
an atomic unit, and boards are filters + column layouts over those cards.
Share a card with another member and it shows up on their board too — one
source of truth, live-synced.

The Telegram bot is the core capture channel. Opening the web app takes
seconds; sending a message to a bot is instant, and works from any phone.

---

## What's in the box

### Capture (Telegram)

- **DM the bot** — any message becomes a private card on your board
- **Post to the family group** — lands in **Family Inbox** with a Private /
  Public privacy prompt
- **Voice notes** → Whisper transcription, original audio attached
- **Photos** → gpt-4o-mini vision summary, original image attached
- **URLs auto-detected** — `github.com/...` and other links preserved as
  markdown link list in the description

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
- **Add link** — paste URLs, attached to the description
- **Edit** — tell the bot "change tags to home" and it re-proposes
- **Cancel** — discard, no card

Non-task messages ("lol") are flagged with "Doesn't look like a task — save
anyway if you want." so you're never surprised by spurious cards.

### After save

The proposal message transforms into quick-action buttons:

```
✓ Saved · 📅 Today — Buy eggs

[⚡ Doing] [✅ Done] [🗑]
```

Tap to move the card across columns or archive it without leaving Telegram.

### Reply-based commands

- `/today <message>` — skip proposal, save directly to Today
- Reply to a bot card message with `/assign @alice` — reassign
- Reply with `/share @alice @bob` — share

### Card templates

Save common card patterns (recurring shopping lists, daily standups,
weekly chores) as named templates and instantiate with one tap.

- **Visibility:** `private` (you only) or `shared` (whole family)
- **Stored fields:** title, description, tags, status, optional
  `due_offset_days` — instantiation computes `due_date = today + N`
- **Web:** Settings → Templates tab CRUD; column quick-add 📋 picker;
  `/template-name` slash shortcut in the new-card input
- **Telegram:** `/use <name>` or `/t <name>` in DM (private + shared
  visible). `/templates` lists yours. Group-chat invocations are silent.

### Knowledge base

A lightweight inbox for URLs, snippets, and notes that link to cards.

- **Capture:** `/save <url>` (auto-fetch + Readability extraction),
  `/note <title>\n<body>` in DM, web "+ New" form, or `from-card` to
  derive a knowledge item from an existing card
- **Auto-fetch:** URL → JSDOM + Mozilla Readability → title + clean
  body. SSRF-protected (DNS lookup blocks private IPs). 10s timeout,
  5MB cap.
- **Visibility:** `private` (you), `inbox` (family-visible read-only),
  `shared` (specific users)
- **Search:** `/k <query>` in DM, full-text search in web. Optional
  pgvector semantic search via `KNOWLEDGE_EMBEDDINGS=true`
- **Linking:** attach knowledge items to cards (M2M); both sides
  navigate via the link
- **`/klist`:** list your knowledge items in DM

### Web app

- Drag-and-drop across four columns: Backlog / Today / In Progress / Done
- Three board scopes: **My board**, **Family Inbox**, **Everything**
- Click a card → edit title, description, tags, due date, assignees,
  shares, linked knowledge
- Inline image thumbnails for photo attachments; voice/audio inline
- Weekly review modal with gpt-4o-mini-written summary
- Archive: per-row Restore + per-row "Delete forever" + bulk "Delete
  all (N)"
- Mirror tokens → `/my-day?token=…` kiosk route (white on black,
  auto-refreshing)
- PWA manifest + service worker for install-to-home-screen
- Live sync via WebSocket (cards, templates, knowledge, links)
- Keyboard shortcut hints + toast notifications on CRUD actions

### Privacy model

- DM to bot → private to you (assignees = [you]; nobody else sees it,
  ever — verified by per-client WebSocket broadcast filtering)
- Group post → goes to Family Inbox by default; tap **Private** to
  move it onto your personal board only
- Single-card endpoints reject access to cards you can't see
  (creator / assignee / share / inbox)
- Templates: private template events filtered server-side; only
  the owner receives `template.*` WS events for their private items
- Knowledge: same filter — private items never broadcast outside owner
- Passwords hashed with Argon2id; sessions are `httpOnly sameSite=lax`
  cookies

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    One Docker container                     │
│                                                             │
│   ┌───────────┐   ┌──────────────┐   ┌─────────────────┐    │
│   │ React SPA │◀─▶│ Fastify API  │◀─▶│  Postgres 16    │   │
│   │  (Vite)   │   │  + WebSocket │   │  (+ pgvector?)  │   │
│   └───────────┘   │  + Telegram  │   └─────────────────┘    │
│                   │  + Knowledge │                          │
│                   │  + Templates │                          │
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

- **Backend:** Node 22 + Fastify + TypeScript + `@fastify/websocket` +
  [grammy](https://grammy.dev) for Telegram + [argon2](https://github.com/ranisalt/node-argon2)
  + JSDOM + Mozilla Readability for URL extraction
- **Frontend:** React 18 + Vite + TypeScript + Tailwind + `@dnd-kit`
- **AI:** **OpenRouter primary** (any model, `google/gemini-2.0-flash-001`
  by default) with **OpenAI as fallback** — and OpenAI is the only
  option for Whisper audio transcription. Embeddings via
  `text-embedding-3-small` (optional, pgvector-backed).
- **DB:** PostgreSQL 16, idempotent `schema.sql` (additive, safe to
  re-run). Optional `pgvector` extension for semantic search.
- **Storage:** local filesystem at `server/data/attachments/<card_id>/…`

**No `boards` table** — a board is a filter over cards (`scope=personal`,
`scope=inbox`, `scope=all`). Position is `DOUBLE PRECISION` so drag-drop
never needs bulk renumbering — just pick a midpoint.

**Per-client WebSocket broadcast filtering**: when a card / template /
knowledge item is created/updated, the server only sends it to sockets
whose user has visibility into that resource. Private items never reach
other people's browsers in any form.

**Server-clock skew correction**: the client reads the `Date:` header on
API responses and uses the server's view of "now" for relative time
displays, so a drifted device clock won't show "8h ago" for a 5-minute-old
card.

---

## Setup

### 1. Requirements

- Docker + Docker Compose (for Postgres; the app also has a Dockerfile)
- Node 20+ (for local dev)
- A Telegram bot ([@BotFather](https://t.me/BotFather)) — optional but
  the primary capture channel
- An OpenRouter API key with a few dollars of credit (a $1 top-up lasts
  months at family usage) — optional, but the proposal flow + vision
  + summaries depend on it
- *(Optional)* an OpenAI API key — needed only for voice transcription
  (Whisper), embeddings, and as an automatic fallback if OpenRouter
  rate-limits

### 2. Clone + install

```bash
git clone git@github.com:chatwithllm/SmartKanban.git
cd SmartKanban

docker compose up -d
docker compose exec -T db psql -U kanban -d kanban < server/schema.sql

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
TELEGRAM_GROUP_ID=-100XXXXXXXXXX   # bot will silently ignore other groups
OPENROUTER_API_KEY=sk-or-v1-…
```

### 4. Run

**Docker (single-container, prod-like):**

```bash
docker compose up -d --build
# server runs on http://localhost:3001
```

**Dev (hot-reload both sides):**

```bash
cd server && npm run dev    # :3001
cd web    && npm run dev    # :5173 (proxies /api, /ws, /attachments, /telegram)
```

**Production (single binary, no docker):**

```bash
(cd web    && npm run build)
(cd server && npm run build)
cd server && PORT=8010 node --env-file=.env dist/index.js
```

Fastify serves the built web SPA, with SPA fallback so `/my-day?token=…`
resolves correctly.

**Production (one-click install on a VPS):**

```bash
curl -fsSL https://raw.githubusercontent.com/chatwithllm/SmartKanban/main/scripts/install.sh | bash
```

Walks you through Docker install, repo clone, env config (with prompts
for your domain + Telegram + AI keys), schema init, build, optional
Caddy auto-HTTPS, and backups. Idempotent — safe to re-run.

**Production (manual walkthrough)** — see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for a step-by-step guide from
a fresh Debian/Ubuntu host to a working install behind Caddy or nginx.

### 5. First user & Telegram linking

1. Register the first account in the app (becomes the owner; any
   pre-existing Phase-1 cards get auto-assigned to them).
2. DM [@userinfobot](https://t.me/userinfobot) → get your Telegram user id.
3. In the app: **Settings → Telegram identities** → paste your id, click
   **Link to me**.
4. Add the bot to your family Telegram group. Disable privacy mode via
   BotFather (`/mybots` → Bot Settings → Group Privacy → Turn off).
5. Send any message in the group — a card appears within a second.
6. DM the bot directly for private captures.

Repeat step 2–3 for each additional family member.

### 6. (Optional) Enable semantic knowledge search

Requires the pgvector extension and an OpenAI key:

```bash
docker compose exec -T db psql -U kanban -d kanban \
  -c "CREATE EXTENSION IF NOT EXISTS vector;"
echo "KNOWLEDGE_EMBEDDINGS=true" >> server/.env
echo "OPENAI_API_KEY=sk-…"       >> server/.env
docker compose restart server
```

The embed queue picks up new + existing knowledge items on next
write/refetch. `POST /api/knowledge/search/semantic` returns ranked
results.

---

## Environment variables

See [`.env.example`](.env.example) for the full list. Highlights:

| Variable                     | Purpose                                             | Default                         |
| ---------------------------- | --------------------------------------------------- | ------------------------------- |
| `DATABASE_URL`               | Postgres connection                                 | `postgresql://kanban:...`       |
| `PORT`                       | HTTP listen port                                    | `3001`                          |
| `COOKIE_SECRET`              | Signs session cookies                               | *(required)*                    |
| `OPEN_SIGNUP`                | Allow public registrations                          | `true` (set `false` when done)  |
| `TELEGRAM_BOT_TOKEN`         | Bot token from @BotFather                           | *(optional, gates bot startup)* |
| `TELEGRAM_GROUP_ID`          | The one family group id the bot answers in         | *(required if bot running)*     |
| `TELEGRAM_WEBHOOK_URL`       | If set, use webhook; else long-poll                 | *(unset)*                       |
| `TELEGRAM_WEBHOOK_SECRET`    | Webhook path secret                                 | `dev-webhook`                   |
| `OPENROUTER_API_KEY`         | Primary AI (chat + vision)                          | *(optional)*                    |
| `OPENROUTER_MODEL`           | Chat model                                          | `google/gemini-2.0-flash-001`   |
| `OPENROUTER_VISION_MODEL`    | Vision model                                        | `google/gemini-2.0-flash-001`   |
| `OPENAI_API_KEY`             | Whisper (audio) + AI fallback + embeddings          | *(optional)*                    |
| `APP_URL`                    | Sent as `HTTP-Referer` to OpenRouter                | `http://localhost:8010`         |
| `ATTACHMENTS_DIR`            | Local file storage                                  | `data/attachments`              |
| `KNOWLEDGE_AUTOFETCH`        | Auto-fetch URLs on knowledge create                 | `true`                          |
| `KNOWLEDGE_FETCH_TIMEOUT_MS` | URL fetch timeout                                   | `10000`                         |
| `KNOWLEDGE_BODY_MAX_CHARS`   | Knowledge body cap                                  | `200000`                        |
| `KNOWLEDGE_EMBEDDINGS`       | Enable pgvector semantic search                     | *(unset)*                       |

---

## Data model

```
users                (id, name, short_name, email, auth_hash, created_at)
sessions             (token, user_id, expires_at)
mirror_tokens        (token, user_id, label)

cards                (id, title, description, status, tags[], due_date,
                      source enum(manual|telegram|mirror), position float,
                      created_by → users.id, ai_summarized, needs_review,
                      telegram_chat_id, telegram_message_id,
                      archived, created_at, updated_at)
card_assignees       (card_id, user_id)             — M2M
card_shares          (card_id, user_id)             — M2M
card_attachments     (id, card_id, kind enum(audio|image|file), storage_path, …)

card_templates       (id, owner_id, name, visibility enum(private|shared),
                      title, description, tags[], status, due_offset_days)

knowledge_items      (id, owner_id, title, title_auto, url, body, tags[],
                      visibility enum(private|inbox|shared),
                      source enum(manual|telegram|share_target|from_card),
                      fetch_status enum(pending|ok|failed), fetch_error,
                      fetched_at, archived, fts (generated tsvector))
knowledge_shares     (knowledge_id, user_id)        — M2M (for visibility=shared)
knowledge_card_links (knowledge_id, card_id, created_by) — M2M
knowledge_embeddings (knowledge_id, embedding vector(1536), model, embedded_at)
                                                      — optional, pgvector

telegram_identities  (telegram_user_id, app_user_id, telegram_username)
activity_log         (id, actor_id, card_id, action, details jsonb, created_at)
```

Full DDL in [`server/schema.sql`](server/schema.sql) (idempotent —
safe to re-run on an existing database).

---

## API

### Auth + users

| Method | Path                          | Notes                           |
| ------ | ----------------------------- | ------------------------------- |
| POST   | `/api/auth/register`          | First user becomes owner        |
| POST   | `/api/auth/login`             | Returns session cookie          |
| POST   | `/api/auth/logout`            |                                 |
| GET    | `/api/auth/me`                |                                 |
| PATCH  | `/api/auth/me`                | `short_name`, `name`            |
| GET    | `/api/users`                  | List family                     |

### Cards

| Method | Path                                 | Notes                                |
| ------ | ------------------------------------ | ------------------------------------ |
| GET    | `/api/cards?scope=personal\|inbox\|all` | Visibility enforced               |
| GET    | `/api/cards/archived`                | Visible archived cards               |
| POST   | `/api/cards`                         |                                      |
| GET    | `/api/cards/:id`                     |                                      |
| PATCH  | `/api/cards/:id`                     | Partial: title, status, tags, …      |
| DELETE | `/api/cards/:id`                     | Soft archive                         |
| PATCH  | `/api/cards/:id/restore`             | Unarchive                            |
| DELETE | `/api/cards/:id/permanent`           | Hard delete (archived only)          |
| POST   | `/api/cards/archived/purge`          | Bulk hard delete; returns `{deleted}`|
| GET    | `/api/cards/:id/activity`            | Activity log entries                 |
| GET    | `/api/cards/:id/knowledge`           | Linked knowledge items               |

### Templates

| Method | Path                                  | Notes                          |
| ------ | ------------------------------------- | ------------------------------ |
| GET    | `/api/templates`                      | List visible (mine + shared)   |
| GET    | `/api/templates/:id`                  | Visibility-checked             |
| POST   | `/api/templates`                      | Create                         |
| PATCH  | `/api/templates/:id`                  | Owner-only                     |
| DELETE | `/api/templates/:id`                  | Owner-only                     |
| POST   | `/api/templates/:id/instantiate`      | Optional `status_override`     |

### Knowledge

| Method | Path                                       | Notes                                      |
| ------ | ------------------------------------------ | ------------------------------------------ |
| GET    | `/api/knowledge?scope=&q=&tag=&cursor=`    | Paginated; FTS + tag filter                |
| GET    | `/api/knowledge/:id`                       |                                            |
| POST   | `/api/knowledge`                           | URL or note; auto-fetch if URL present     |
| PATCH  | `/api/knowledge/:id`                       | Owner-only                                 |
| DELETE | `/api/knowledge/:id`                       | Soft archive                               |
| POST   | `/api/knowledge/:id/refetch`               | Re-run URL fetch (owner-only)              |
| POST   | `/api/knowledge/:id/links`                 | Link to a card                             |
| DELETE | `/api/knowledge/:id/links/:card_id`        | Unlink                                     |
| POST   | `/api/knowledge/from-card/:card_id`        | Derive item from card                      |
| POST   | `/api/knowledge/search/semantic`           | pgvector cosine similarity (optional)      |

### Mirror, review, telegram, attachments

| Method | Path                              | Notes                                    |
| ------ | --------------------------------- | ---------------------------------------- |
| POST   | `/api/mirror/tokens`              | Long-lived token + url                   |
| GET    | `/api/mirror/tokens`              | List                                     |
| DELETE | `/api/mirror/tokens/:token`       | Revoke                                   |
| GET    | `/api/review`                     | Done / stale / stuck + AI summary        |
| POST   | `/api/telegram/link`              | Link TG user id → app user               |
| GET    | `/api/telegram/identities`        | List                                     |
| DELETE | `/api/telegram/identities/:id`    | Unlink                                   |
| POST   | `/telegram/webhook/<secret>`      | Telegram webhook endpoint                |
| WS     | `/ws`                             | Per-client filtered broadcasts           |
| GET    | `/attachments/*`                  | Auth-gated file serve                    |
| GET    | `/health`                         | `{ ok: true }`                           |

### API tokens (for agent integrations)

| Method | Path                              | Notes                                    |
| ------ | --------------------------------- | ---------------------------------------- |
| POST   | `/api/tokens`                     | Create api-scope token (cookie auth)     |
| GET    | `/api/tokens`                     | List own api tokens                      |
| DELETE | `/api/tokens/:token`              | Revoke                                   |

Endpoints accepting `Authorization: Bearer <api-token>`:

- `POST /api/cards` (cookie or Bearer)
- `PATCH /api/cards/:id` (cookie or Bearer)
- `POST /api/cards/:id/activity` (Bearer api-token only)

`POST /api/cards/:id/activity` body:

```json
{ "type": "session_summary", "body": "edited 3 files", "details": { "files": 3 } }
```

Cards now carry an optional `project: string` field; the list endpoint accepts `?project=<key>` for filtering.

### WebSocket events

```
hello                       — handshake
card.created | updated | deleted
template.created | updated | deleted
knowledge.created | updated | deleted
knowledge.link.created | knowledge.link.deleted
```

Per-client visibility filter applies to all `template.*` and
`knowledge.*` events; clients only see resources they have access to.

---

## Telegram bot commands

| Command          | Where      | Behavior                                                    |
| ---------------- | ---------- | ----------------------------------------------------------- |
| (any text)       | DM / group | Run AI proposal flow                                        |
| (voice/audio)    | DM / group | Whisper transcribe → card + audio attached                  |
| (photo)          | DM / group | Vision summarize → card + image attached                    |
| `/today <msg>`   | DM / group | Skip proposal; save directly to Today                       |
| `/assign @user`  | reply      | Reassign card                                               |
| `/share @a @b`   | reply      | Add sharers                                                 |
| `/use <name>`    | DM only    | Instantiate template                                        |
| `/t <name>`      | DM only    | Alias for `/use`                                            |
| `/templates`     | DM only    | List your visible templates                                 |
| `/save <url>`    | DM         | Create knowledge item from URL (auto-fetch)                 |
| `/note`          | DM         | Create knowledge item (title on first line, body after)     |
| `/k <query>`     | DM         | Search knowledge items                                      |
| `/klist`         | DM         | List your knowledge items                                   |

`/use`, `/t`, `/templates` in group chats are silently ignored to
prevent the command body from being parsed as a card seed.

---

## Backups

```bash
# Manual
scripts/backup.sh /mnt/backups/kanban

# cron (3am daily)
0 3 * * *  /path/to/SmartKanban/scripts/backup.sh /mnt/backups/kanban
```

Outputs `db-<ts>.sql.gz` (pg_dump) and `attachments-<ts>.tar.gz` (file
blobs); keeps the last 14 of each.

---

## Project layout

```
SmartKanban/
├── docker-compose.yml              # Postgres + server
├── Dockerfile                      # multi-stage: web build + node runtime
├── scripts/backup.sh               # pg_dump + attachments tarball
├── docs/
│   └── superpowers/{specs,plans}/  # design docs + impl plans
├── server/
│   ├── schema.sql                  # idempotent DDL
│   ├── src/
│   │   ├── index.ts                # Fastify bootstrap
│   │   ├── auth.ts                 # Argon2 + sessions + mirror tokens
│   │   ├── cards.ts                # visibility predicate, list helpers
│   │   ├── templates.ts            # template CRUD + instantiation
│   │   ├── knowledge.ts            # knowledge CRUD + visibility
│   │   ├── knowledge_fetch.ts      # URL fetch + Readability extraction
│   │   ├── ws.ts                   # per-client broadcast filter
│   │   ├── routes/                 # auth, cards, templates, knowledge,
│   │   │                           #   mirror, review, telegram, attachments
│   │   ├── ai/
│   │   │   ├── openai.ts           # OpenRouter primary + OpenAI fallback
│   │   │   ├── propose.ts          # text → card proposal
│   │   │   ├── vision.ts           # photo → card via vision model
│   │   │   ├── whisper.ts          # audio → text (OpenAI only)
│   │   │   ├── weekly_summary.ts   # weekly review paragraph
│   │   │   ├── embed.ts            # text → vector
│   │   │   └── embed_queue.ts      # async embedding queue
│   │   ├── telegram/
│   │   │   ├── bot.ts              # message + command dispatch
│   │   │   └── proposals.ts        # in-memory proposal state
│   │   └── __tests__/              # unit + integration tests
│   │                               # (templates, template_routes,
│   │                               #  knowledge, telegram_parse)
│   └── data/attachments/           # per-card file blobs
└── web/
    ├── vite.config.ts              # /api, /ws, /attachments, /telegram proxies
    ├── public/                     # PWA manifest + service worker
    └── src/
        ├── App.tsx                 # auth gate + board + WS dispatcher
        ├── MirrorView.tsx          # /my-day kiosk
        ├── api.ts                  # typed client + server-clock skew
        ├── ws.ts                   # WebSocket client
        ├── auth.tsx                # useAuth context
        ├── hooks/                  # useTemplates, useKnowledge,
        │                           #   useToast, useKeyboardShortcuts
        └── components/             # Board, Column, CardView, EditDialog,
                                    #   TemplatesTab, ArchiveDialog,
                                    #   KnowledgeDetail, KnowledgeRow, …
```

---

## Tests

Backend uses Node's built-in `node:test` runner via `tsx --test`.

```bash
cd server && npm test
```

Coverage includes:

- Telegram command parsing (`/today`, `/assign`, `/use`, `/t`,
  `/templates`, hashtag + mention extraction)
- Card-templates data layer (visibility, name uniqueness, owner-only
  mutation, validation, `instantiateTemplate` with status_override
  and due_offset math)
- Templates HTTP routes (via Fastify `app.inject()`: 201/400/403/404/409)
- Knowledge data layer + URL fetch path

Frontend has minimal tests by design — manual smoke + the WebSocket
event flow exercises most paths.

---

## Non-goals (by design)

- **Not** a Jira/Linear replacement — no sprints, epics, story points
- **Not** a team/enterprise tool — no SSO, no role matrix, no audit
  compliance
- **Not** a notes app for long-form writing — knowledge items are
  pointers and clips, not a wiki
- **Not** real-time collaborative editing inside a card (save-on-edit
  is fine)
- **Not** mobile-native — responsive web + PWA install is the support
  model
- **Not** a chat app — Telegram is capture-only, not discussion threads

Plus these explicit v1 omissions: color priorities, subtasks/checklists,
card comments, multi-group Telegram, per-user custom column layouts,
push notifications.

---

## Status

All phases in the original product brief are implemented, plus
post-brief features:

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
| 6     | Activity log + timeline, archive dialog with restore,          |   ✅   |
|       | toast notifications, keyboard shortcuts                        |        |
| 7     | Card templates (per-user + family-shared, web + Telegram)      |   ✅   |
| 8     | Knowledge base: URL capture, Readability extraction,           |   ✅   |
|       | card linking, FTS, optional pgvector semantic search           |        |
| 9     | Archive: per-row + bulk hard delete (with attachment cleanup)  |   ✅   |

Skipped: local Whisper (requires model download + GPU), Home
Assistant integration (requires user's HA setup).

---

## License

MIT — see [LICENSE](LICENSE).
