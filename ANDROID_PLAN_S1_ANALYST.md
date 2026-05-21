# ANDROID PLAN — STAGE 1: ANALYST INVENTORY

Source commit: `feat/design-polish` @ `ea865d9` (per registry header).
Purpose: factual inventory of the SmartKanban backend, web client, and PWA shell
for Stages 2–7. No design opinions — only what currently exists and how it
behaves on the wire. Stages 2–7 will only see what is written down here.

---

## 1. Backend Stack & Runtime

### 1.1 Language / Framework Versions

| Component | Version | Source |
|---|---|---|
| Language | TypeScript 5.6.3 (ESM, `"type": "module"`) | `server/package.json:5,37` |
| HTTP framework | Fastify ^4.28.1 | `server/package.json:23` |
| Cookies | `@fastify/cookie` ^9.4.0 | `server/package.json:15` |
| CORS | `@fastify/cors` ^9.0.1 | `server/package.json:16` |
| Multipart | `@fastify/multipart` ^8.3.0 | `server/package.json:17` |
| Static files | `@fastify/static` ^7.0.4 | `server/package.json:18` |
| WebSocket | `@fastify/websocket` ^10.0.1 | `server/package.json:19` |
| Telegram bot | `grammy` ^1.30.0 | `server/package.json:23` |
| HTML extraction | `@mozilla/readability` ^0.6.0 + `jsdom` ^29.0.2 | `server/package.json:20,24` |
| Password hashing | `argon2` ^0.41.1 | `server/package.json:21` |
| Postgres driver | `pg` ^8.13.0 | `server/package.json:26` |
| LLM client | `openai` ^4.67.3 (also used as OpenRouter client via `baseURL`) | `server/package.json:25`, `ai/openai.ts:15-23` |
| QR code | `qrcode` ^1.5.4 | `server/package.json:27` |
| Web push | `web-push` ^3.6.7 | `server/package.json:28` |
| Node target | `@types/node` ^22.7.5 (Node 22 family) | `server/package.json:32` |
| Postgres server | `postgres:16-alpine` | `docker-compose.yml:3` |
| Dev runner | `tsx` 4.19.1 (`tsx watch src/index.ts`) | `server/package.json:7,36` |
| Build / start | `tsc` → `dist/index.js` | `server/package.json:8,9` |

### 1.2 Process Model

Single Fastify process (`server/src/index.ts:29`) listens on `PORT` (default
3001) bound to `0.0.0.0` (`index.ts:92-93`). Inside the same process:

| Subsystem | Bootstrap | Notes |
|---|---|---|
| HTTP API + SPA static | `index.ts:54-88` | Static `../web/dist` mount + SPA index.html fallback for non-`/api`/`/ws`/`/telegram`/`/attachments` GETs |
| WebSocket `/ws` | `wsRoutes(app)` `index.ts:69`, `ws.ts:111-130` | Same Fastify HTTP upgrade — single port |
| Telegram bot | `startTelegramBot()` `index.ts:96-98`, `telegram/bot.ts:1836-1861` | In-process: long-polling if no `TELEGRAM_WEBHOOK_URL`, else webhook handled on the same Fastify server at `/telegram/webhook/<secret>` (`routes/telegram.ts:9`) |
| Brainstorm queue | `enqueueBrainstorm` (`ai/brainstorm_queue.ts`); recovery scan on boot `index.ts:100-105`, `insights.ts:111-123` | Pending insights >1 hr old are marked failed on startup; younger pending rows re-enqueued |
| Knowledge URL fetcher | `triggerFetch` (`knowledge_fetch.ts:101-130`) | `setImmediate` async, in-flight de-duped via Set |
| Push worker | `pushToUser` (`push.ts:63-72`) | Called inline on chat/AI events, deletes subscriptions on HTTP 410 |

No external job runner. No Redis. No separate worker. Postgres is the only
persistent store.

### 1.3 Environment Variables

Source: scan of `process.env.*` across `server/src/**/*.ts`.

| Var | Required? | Default | What it gates / does | File:line |
|---|---|---|---|---|
| `DATABASE_URL` | optional | `postgresql://kanban:kanban@localhost:5432/kanban` | Postgres connection string | `db.ts:8` |
| `PORT` | optional | `3001` | HTTP port | `index.ts:92` |
| `COOKIE_SECRET` | recommended | `dev-cookie-secret-change-me` | Signing key for `@fastify/cookie` | `index.ts:47` |
| `APP_URL` | conditional | empty / `http://localhost` | (a) Whether session cookie is `Secure` (must start with `https://`) `auth.ts:139-143`; (b) Public URL embedded in QR codes (`routes/qr.ts:18`); (c) `HTTP-Referer` for OpenRouter (`ai/openai.ts:19`) | multiple |
| `COOKIE_SECURE` | optional override | unset | `true`/`false` to override the `https://` heuristic | `auth.ts:139-142` |
| `OPEN_SIGNUP` | optional | `true` | When `'false'`, blocks /api/auth/register after first user | `routes/auth.ts:15,33-36` |
| `ATTACHMENTS_DIR` | optional | `data/attachments` | Filesystem dir for binary uploads (mounted to `/app/server/data` in Docker, see `docker-compose.yml:32`) | `index.ts:51`, `routes/cards.ts:21`, `routes/attachments_upload.ts:13` |
| `ATTACHMENT_MAX_BYTES` | optional | `5_000_000` (5 MB) | Hard cap on image uploads (cards) | `routes/attachments_upload.ts:16` |
| `KNOWLEDGE_BODY_MAX_CHARS` | optional | `200_000` | Knowledge body validation cap | `knowledge.ts:50` |
| `KNOWLEDGE_AUTOFETCH` | optional | `'true'` (anything ≠ `'false'`) | Master switch for URL fetcher | `knowledge_fetch.ts:9` |
| `KNOWLEDGE_FETCH_TIMEOUT_MS` | optional | `10000` | Per-URL fetch timeout | `knowledge_fetch.ts:7` |
| `BRAINSTORM_TIMEOUT_MS` | optional | `30_000` | LLM call timeout for brainstorm | `ai/brainstorm.ts:185` |
| `OPENAI_API_KEY` | feature-gate | unset | Enables OpenAI as chat fallback + Whisper + Vision fallback | `ai/openai.ts:28-35`, `ai/whisper.ts:6`, `ai/vision.ts` |
| `OPENROUTER_API_KEY` | feature-gate | unset | Enables OpenRouter as primary chat + vision | `ai/openai.ts:10-23` |
| `OPENROUTER_MODEL` | optional | `google/gemini-2.0-flash-001` | OpenRouter chat model | `ai/openai.ts:48` |
| `OPENROUTER_VISION_MODEL` | optional | `google/gemini-2.0-flash-001` | OpenRouter vision model | `ai/openai.ts:71` |
| `TAVILY_API_KEY` | feature-gate | unset | Tavily web-search for brainstorm. Missing → `degraded=true` insights. | `ai/tavily.ts:17` |
| `TELEGRAM_BOT_TOKEN` | feature-gate | unset | If set, starts grammy bot on boot. **MUST NOT be shared across instances** (per project memory — 409 getUpdates conflict) | `index.ts:96`, `telegram/bot.ts:1837` |
| `TELEGRAM_GROUP_ID` | optional | unset | If set, only this group's messages (plus DMs) are accepted by the bot | `telegram/bot.ts:68-71`, `telegram/bot.ts:1788-1790` |
| `TELEGRAM_WEBHOOK_URL` | optional | unset | If set, bot runs in webhook mode (`POST /telegram/webhook/<secret>`); else long polling | `telegram/bot.ts:1843-1860` |
| `TELEGRAM_WEBHOOK_SECRET` | optional | `dev-webhook` | URL segment for webhook endpoint | `routes/telegram.ts:8` |
| `VAPID_PUBLIC_KEY` | feature-gate | unset | Web push public key; surfaced at `GET /api/push/vapid-public-key` | `push.ts:8,75`, `routes/notifications.ts:65-69` |
| `VAPID_PRIVATE_KEY` | feature-gate | unset | Web push private key | `push.ts:9` |
| `VAPID_SUBJECT` | feature-gate | unset | `mailto:` or URL for VAPID subject | `push.ts:10` |

> **Required vs optional:** in raw form, *nothing* is hard-required (server boots
> with all defaults) but production needs at minimum `COOKIE_SECRET`, an
> `APP_URL` matching the public HTTPS origin, and `DATABASE_URL` pointing at the
> prod DB. AI / Telegram / Push are independently gated.

---

## 2. API Surface (REST)

All endpoints below are mounted directly in plugin `register()` calls in
`server/src/index.ts:54-69` (no shared prefix). Response envelopes are recorded
verbatim per RULE 2.

Conventions:
- "Auth" column legend: `session` = cookie via `requireUser`;
  `session|mirror` = cookie OR `X-Mirror-Token` header (read-only);
  `session|api-token` = cookie OR `Bearer <token>` (write);
  `api-token` = bearer only; `public` = no auth.
- "Envelope": *bare-array*, *bare-object*, or named-key wrapper.

### 2.1 Auth (`routes/auth.ts`)

| Method | Path | Handler | Request body | Response | Auth | Notes |
|---|---|---|---|---|---|---|
| POST | `/api/auth/register` | `auth.ts:17-64` | `{ name, short_name, email, password }` (short_name 1-16, password ≥6) | 201 `{ id, name, short_name, email }` (also sets session cookie); errors: 400 missing, 403 signup disabled, 409 email taken | public | First successful user inherits all unowned cards (`auth.ts:46-53`) |
| POST | `/api/auth/login` | `auth.ts:66-86` | `{ email, password }` | 200 `{ id, name, short_name, email }` + cookie; 400 missing; 401 invalid | public | argon2id verify |
| POST | `/api/auth/logout` | `auth.ts:88-93` | — | `{ ok: true }` + clears cookie | public | Deletes session row even if cookie missing |
| GET  | `/api/auth/me` | `auth.ts:95-99` | — | `{ id, name, short_name, email }`; 401 if no/invalid cookie | session (manual check) | |
| PATCH | `/api/auth/me` | `auth.ts:113-150` | `{ short_name?, name? }` | Updated user row; 400 invalid; 400 if nothing to update | session | |
| GET  | `/api/users` | `auth.ts:101-111` | — | **Bare array** `[{ id, name, short_name, email }, …]` ordered by `name` | session | |

### 2.2 Cards (`routes/cards.ts`)

| Method | Path | Handler | Request | Response | Auth | Notes |
|---|---|---|---|---|---|---|
| GET | `/api/cards?scope=personal\|inbox\|all\|shared&project=<str>` | `cards.ts:33-41` | — | **Bare array** `[Card, …]` (see Card shape §4) ordered by `(status, position, created_at)` | session\|mirror | `scope` default `personal`. `project` filter optional. |
| GET | `/api/cards/archived` | `cards.ts:44-50` | — | **Bare array** `[Card, …]` ordered by `updated_at DESC` | session | Includes Family-Inbox-visible archived cards too |
| GET | `/api/cards/:id` | `cards.ts:52-64` | — | `Card` object; 404 if missing or not visible | session | UUIDs only — non-UUID `:id` becomes 404 via global 22P02 handler (`index.ts:35-41`) |
| POST | `/api/cards` | `cards.ts:66-116` | `{ title (req), description?, status?='backlog', tags?=[], due_date?=null, assignees?=[creator], source?='manual', project?=null }` | 201 `Card`; 400 missing title / invalid status; broadcasts `card.created` | session\|api-token | `position = (SELECT MIN(position) - 1 …)` |
| PATCH | `/api/cards/:id` | `cards.ts:118-220` | `Partial<{ title, description, status, tags, due_date, position, assignees, shares, needs_review, project }>` | `Card`; broadcasts `card.updated`; share additions also write `card_events.entry_type='share'` + per-recipient `notifications` row | session\|api-token | Visibility checked. New `shares` (added since last load) generate notifications and a "share" timeline event. |
| PATCH | `/api/cards/:id/restore` | `cards.ts:222-241` | — | `Card`; broadcasts `card.updated`; 404 if not archived/visible | session | Only flips `archived = FALSE` |
| POST | `/api/cards/:id/activity` | `cards.ts:244-270` | `{ type, body, details? }` | 201 `{ ok: true }`; broadcasts `card.updated` | **api-token only** | External integrations write timeline entries |
| GET | `/api/cards/:id/knowledge` | `cards.ts:272-284` | — | `{ items: [KnowledgeItem, …] }` | session | Visibility-filtered linked knowledge |
| DELETE | `/api/cards/:id` | `cards.ts:286-302` | — | 204; broadcasts `card.deleted` | session | Soft-archive (sets `archived = TRUE`) |
| DELETE | `/api/cards/:id/permanent` | `cards.ts:304-323` | — | 204; broadcasts `card.deleted`; removes attachment dir | session | Only allowed on already-archived cards |
| POST | `/api/cards/archived/purge` | `cards.ts:325-341` | — | `{ deleted: N }`; broadcasts `card.deleted` per id | session | Purges all caller-visible archived cards |
| POST | `/api/cards/:id/attachments` | `routes/attachments_upload.ts:114-139` | `multipart/form-data` with `file` field (image only) | 201 `Card`; broadcasts `card.updated`; 415 wrong MIME, 413 too large | session | Image MIME allowlist: `png/jpeg/webp/gif`; cap = `ATTACHMENT_MAX_BYTES` (default 5 MB) |
| POST | `/api/cards/from-image` | `routes/attachments_upload.ts:142-211` | `multipart/form-data` with `file` (image) + optional `status` text field | 201 `Card`; broadcasts `card.created` | session | Creates placeholder card with `needs_review=TRUE`, attaches image, calls vision LLM if `AI_ENABLED`, swaps title/desc on success |

#### Card link routes (`routes/card_links.ts`)

| Method | Path | Request | Response | Auth | Notes |
|---|---|---|---|---|---|
| POST | `/api/cards/:id/links` | `{ to_card_id, label, note? }` | 201 `{ link: CardLink }`; 400 invalid label / self-link; 403 either card invisible; 409 already exists; broadcasts `card.link.created` | session | `label` ∈ {`evolves_from`, `supersedes`, `split_from`, `related`, `inspired_by`, `duplicate_of`}; note truncated to 500 chars |
| DELETE | `/api/cards/:id/links/:linkId` | — | 204; broadcasts `card.link.deleted`; 403 if linkId not attached to caller's card | session | |
| GET | `/api/cards/:id/links` | — | `{ links: CardLink[], related_cards: Card[] }` (1-hop, visibility-filtered) | session | |
| GET | `/api/cards/:id/chain?depth=1..6` | — | `{ nodes: Card[], edges: CardLink[], insights: Insight[] }` BFS to depth (capped 1-6, default 2) | session | Only the *latest* `ok` insight per visible card is included |

#### Chat / events (`routes/chat.ts`)

| Method | Path | Request | Response | Auth | Notes |
|---|---|---|---|---|---|
| GET | `/api/cards/:id/events` | — | **Bare array** `[CardEvent, …]` oldest-first | session | |
| POST | `/api/cards/:id/messages` | `{ content }` (max 2000 chars) | 201 `CardEvent`; broadcasts `card.message`; fans out notifications + web push to assignees + thread participants; if `@ai` token in content, fires async `processCardChatAI` | session | AI reply arrives later as a `card.ai_response` WS event |
| PUT | `/api/cards/:id/events/read` | `{ last_read_id: number }` | 204 | session | `last_read_id` *must* be number (not string) |
| GET | `/api/messages/unread` | — | **Bare object** `Record<cardId, count>` | session | Used for unread badge across boards |

#### QR (`routes/qr.ts`)

| Method | Path | Response | Auth | Notes |
|---|---|---|---|---|
| GET | `/api/cards/:id/qr.svg` | `image/svg+xml` (256px, margin 1) encoding `${APP_URL}/m/card/<id>`; headers `cache-control: private, max-age=300`, `vary: cookie` | session | 5-min cache; falls back to request `protocol://hostname` if `APP_URL` empty |

### 2.3 Insights (`routes/insights.ts`)

| Method | Path | Request | Response | Auth | Notes |
|---|---|---|---|---|---|
| POST | `/api/cards/:id/insights/brainstorm` | — | 202 `{ id, status: 'pending' }`; 503 if `!AI_ENABLED`; 429 if per-card limit (1), per-user pending (5), or per-day (50) exceeded; broadcasts `insight.queued` | session | |
| GET | `/api/cards/:id/insights` | — | `{ insights: Insight[] }` newest first, limit 10 | session | |
| GET | `/api/insights/:id` | — | `{ insight: Insight }`; 403 if card invisible | session | |

### 2.4 Knowledge (`routes/knowledge.ts`)

| Method | Path | Request | Response | Auth | Notes |
|---|---|---|---|---|---|
| GET | `/api/knowledge?scope=mine\|inbox\|all&q=&tag=&limit=&cursor=` | — | `{ items: KnowledgeItem[], next_cursor: string \| null }` | session | `limit` clamped 1..200 (default 50). `cursor` is base64url(`{u: updated_at, i: id}`). |
| GET | `/api/knowledge/:id` | — | `KnowledgeItem`; 404 if archived/missing/invisible | session | |
| POST | `/api/knowledge` | `KnowledgeInput` (title req, visibility req, one of url\|body req) | `KnowledgeItem`; broadcasts `knowledge.created`; queues fetch if `fetch_status='pending'`; 400 validation; 403 forbidden | session | |
| PATCH | `/api/knowledge/:id` | `KnowledgePatch` | `KnowledgeItem`; broadcasts `knowledge.updated` | session | Owner only |
| DELETE | `/api/knowledge/:id` | — | 204; broadcasts `knowledge.deleted` | session | Soft-archive |
| POST | `/api/knowledge/:id/refetch` | — | `{ queued: true }`; 400 no URL | session | |
| POST | `/api/knowledge/:id/links` | `{ card_id }` | 204; broadcasts `knowledge.link.created` | session | Both knowledge and card must be visible |
| DELETE | `/api/knowledge/:id/links/:card_id` | — | 204; broadcasts `knowledge.link.deleted` | session | |
| POST | `/api/knowledge/from-card/:card_id` | — | `KnowledgeItem`; broadcasts `knowledge.created` + `knowledge.link.created` | session | Auto-extracts first URL from card description |

### 2.5 Templates (`routes/templates.ts`)

| Method | Path | Request | Response | Auth | Notes |
|---|---|---|---|---|---|
| GET | `/api/templates` | — | **Bare array** `[Template, …]` (own + shared) | session | |
| GET | `/api/templates/:id` | — | `Template` | session | |
| POST | `/api/templates` | `TemplateInput` (name 1–40 non-ws, visibility, title ≤120, tags ≤5, status, due_offset_days 0–365 or null) | 201 `Template`; broadcasts `template.created`; 409 name conflict | session | unique(`owner_id`, `lower(name)`) |
| PATCH | `/api/templates/:id` | `TemplatePatch` | `Template`; broadcasts `template.updated` | session | Owner only |
| DELETE | `/api/templates/:id` | — | 204; broadcasts `template.deleted` | session | |
| POST | `/api/templates/:id/instantiate` | `{ status_override? }` | 201 `Card`; broadcasts `card.created` | session | `due_date = startOfUtcDay + due_offset_days * 86_400_000`, ISO date string |

### 2.6 Mirror tokens (`routes/mirror.ts`) — read-only

| Method | Path | Request | Response | Auth |
|---|---|---|---|---|
| POST | `/api/mirror/tokens` | `{ label? }` | 201 `{ token, label, url: /my-day?token=… }` | session |
| GET | `/api/mirror/tokens` | — | **Bare array** `[{ token, label, created_at }, …]` | session |
| DELETE | `/api/mirror/tokens/:token` | — | 204 | session |

### 2.7 API tokens (`routes/api_tokens.ts`) — write capability for integrations

| Method | Path | Request | Response | Auth |
|---|---|---|---|---|
| POST | `/api/tokens` | `{ label? }` | 201 `{ token, label, scope: 'api' }` | session |
| GET | `/api/tokens` | — | **Bare array** `[{ token, label, created_at, scope: 'api' }, …]` | session |
| DELETE | `/api/tokens/:token` | — | 204 | session |

> Mirror tokens (`scope='mirror'`) and API tokens (`scope='api'`) share table
> `mirror_tokens`, distinguished by `scope` column. Mirror is sent as header
> `X-Mirror-Token`; API is sent as `Authorization: Bearer <token>`.

### 2.8 Telegram (`routes/telegram.ts`)

| Method | Path | Request | Response | Auth |
|---|---|---|---|---|
| POST | `/telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>` | grammy Update body | grammy reply or 503 if bot not running | public (URL-secret-only) |
| POST | `/api/telegram/link` | `{ telegram_user_id, telegram_username? }` | `{ ok: true }` (upsert) | session |
| GET | `/api/telegram/identities` | — | **Bare array** `[{ telegram_user_id, app_user_id, telegram_username }, …]` | session |
| DELETE | `/api/telegram/identities/:id` | — | 204 | session |

### 2.9 Notifications + Push (`routes/notifications.ts`)

| Method | Path | Request | Response | Auth |
|---|---|---|---|---|
| GET | `/api/notifications` | — | **Bare array** `[Notification, …]` newest 100 | session |
| PUT | `/api/notifications/read` | `{ ids: number[] }` | 204 | session |
| PUT | `/api/notifications/read-all` | — | 204 | session |
| POST | `/api/push/subscribe` | `{ endpoint, p256dh, auth }` | 204 | session |
| DELETE | `/api/push/subscribe` | `{ endpoint }` | 204 | session |
| GET | `/api/push/vapid-public-key` | — | `{ publicKey }`; 404 if VAPID not configured | session |

### 2.10 Weekly review (`routes/review.ts`)

| Method | Path | Response | Auth | Notes |
|---|---|---|---|---|
| GET | `/api/review` | `{ done: [], stale: [], stuck: [], summary: string \| null }` | session | `done` = status='done' updated past 7d. `stale` = today/in_progress >7d cold. `stuck` = in_progress >3d cold. `summary` generated by LLM (or null if `!AI_ENABLED`/no rows). |

### 2.11 Attachments (`routes/attachments.ts`)

| Method | Path | Response | Auth |
|---|---|---|---|
| GET | `/attachments/<storage_path>` | binary file body served by `@fastify/static` | session\|mirror |

Note: this is a static-file mount; supports range, etag, etc. via the plugin.

### 2.12 Health

| Method | Path | Response | Auth |
|---|---|---|---|
| GET | `/health` | `{ ok: true }` | public (`index.ts:90`) |

### 2.13 SPA fallback

`setNotFoundHandler` (`index.ts:75-87`) serves `web/dist/index.html` for any GET
that's not `/api`, `/ws`, `/telegram`, `/attachments`. Only active when
`web/dist/` exists (production build path).

### 2.14 Route count

**Total `/api/*` + `/ws` + `/telegram/webhook/...` + `/attachments/*` + `/health` =
51 routes.** Breakdown:

| Group | Count |
|---|---|
| auth | 6 |
| cards (incl. links/chain/chat/qr/attachments_upload) | 19 |
| insights | 3 |
| knowledge | 9 |
| templates | 5 |
| mirror tokens | 3 |
| api tokens | 3 |
| telegram (HTTP) | 4 |
| notifications + push | 6 |
| review | 1 |
| attachments (static mount) | 1 (collection) |
| WebSocket | 1 |
| health | 1 |
| **TOTAL** | **51** (mountpoints; not counting per-file routes inside `@fastify/static`) |

### 2.15 Pagination, query params, error conventions

- Pagination: only `/api/knowledge` supports a cursor (`base64url JSON`); no
  `?page=`, no `?offset=`. All other list endpoints return entire lists.
- Errors: JSON `{ error: string, ...optional fields like field, max_bytes, allowed }`.
  HTTP codes used: 204, 400, 401, 403, 404, 409, 413, 415, 429, 500, 503.
- Global Postgres-22P02 (malformed UUID) handler at `index.ts:35-41` translates
  to 404 to avoid 500s from invalid `:id` params.
- All session-protected routes return 401 (cookie missing/expired). Visibility
  failures return 404 (not 403) so the client can't probe card existence.

---

## 3. WebSocket Protocol (`/ws`)

### 3.1 Connection

| Aspect | Value |
|---|---|
| Path | `/ws` (`ws.ts:112`) |
| Same port as HTTP | yes (Fastify upgrade) |
| Auth (browser) | Cookie `kanban_session` parsed from `req.headers.cookie` (`ws.ts:102-114`) |
| Auth (mirror) | Query string `?mirror=<token>`; resolved via `mirror_tokens` rows with `scope='mirror'` |
| Resolution order | session cookie → mirror token |
| Reject behavior | `socket.close(4401, 'unauthorized')` on auth failure |
| First message | Server immediately sends `{ type: 'hello', user_id: <uuid> }` (`ws.ts:127`) |
| Heartbeat | None — relies on TCP keepalive |
| Reconnect | Client-side (`web/src/ws.ts`) |

### 3.2 Server → client message catalog

All payloads are JSON `{ type, ... }`. Full union: see `ws.ts:10-28`.

| Event `type` | Payload shape | Visibility filter (server-side) | Consumed by (web) |
|---|---|---|---|
| `hello` | `{ type, user_id }` | — | WS handshake confirmation |
| `card.created` | `{ type, card: Card }` | `cardVisibleTo(card, userId)` — creator/assignee/share/inbox (`ws.ts:35-42, 53-55`) | `App.tsx:188-209`, `MobileShell.tsx:136-150` |
| `card.updated` | `{ type, card: Card }` | same | same |
| `card.deleted` | `{ type, id }` | broadcast to all auth'd clients | App removes from list |
| `template.created` | `{ type, template: Template }` | `templateVisibleTo` — owner OR shared (`ws.ts:46-48, 56-58`) | `applyTemplateEvent` in `hooks/useTemplates.ts` |
| `template.updated` | same | same | same |
| `template.deleted` | `{ type, id, owner_id, visibility }` | `templateVisibleTo` | same |
| `knowledge.created` | `{ type, knowledge: KnowledgeItem }` | owner OR visibility=inbox OR (shared AND in shares) (`ws.ts:65-74`) | `applyKnowledgeEvent` |
| `knowledge.updated` | same | same | same |
| `knowledge.deleted` | `{ type, id, owner_id, visibility, shares: string[] }` | same shape predicate | same |
| `knowledge.link.created` | `{ type, knowledge_id, card_id }` | broadcast to all auth'd clients (route-layer visibility was checked at write time) | `applyKnowledgeEvent` |
| `knowledge.link.deleted` | same | same | same |
| `card.message` | `{ type, event: CardEvent, card_id, card: Card }` | `cardVisibleTo(card)` | `App.tsx:178-186` |
| `card.ai_response` | same | same | same |
| `insight.queued` | `{ type, insight: Insight, card_id, owner_id }` | `requested_by===userId OR owner_id===userId` (`ws.ts:84-90`) | `applyInsightEvent` |
| `insight.updated` | same | same | same |
| `insight.failed` | same | same | same |
| `card.link.created` | `{ type, link: CardLink, from_owner_id, to_owner_id }` | `from_owner_id===userId OR to_owner_id===userId` (`ws.ts:91-97`) | `applyCardLinkEvent` |
| `card.link.deleted` | `{ type, id, from_card_id, to_card_id, from_owner_id, to_owner_id }` | same | same |

**WS event count: 19** including `hello` (18 real broadcast types + handshake).

### 3.3 Client→server messages

**None.** Channel is server-push only. All mutations go through REST.

---

## 4. Data Model

Source: `server/schema.sql` (full) + `server/migrations/*.sql` (applied
additively). All tables use UUID PKs except `card_events` (bigserial),
`card_event_reads`, `notifications` (serial), `push_subscriptions` (serial).

### 4.1 Enums

| Type | Values |
|---|---|
| `card_status` | `'backlog', 'today', 'in_progress', 'done'` |
| `card_source` | `'manual', 'telegram', 'mirror'` |
| `attachment_kind` | `'audio', 'image', 'file'` |

### 4.2 Tables

#### `users`
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK, `default gen_random_uuid()` |
| `name` | TEXT | NOT NULL |
| `email` | TEXT | UNIQUE, NOT NULL |
| `auth_hash` | TEXT | NOT NULL (argon2id) |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` |
| `short_name` | TEXT | nullable (added by ALTER; backfilled to `SPLIT_PART(name,' ',1)`); API requires it on register, 1–16 chars |

#### `sessions`
| Column | Type | Constraints |
|---|---|---|
| `token` | TEXT | PK (32-byte base64url) |
| `user_id` | UUID | FK users(id) ON DELETE CASCADE |
| `created_at` | TIMESTAMPTZ | default `now()` |
| `expires_at` | TIMESTAMPTZ | NOT NULL |

Index: `idx_sessions_user (user_id)`.

#### `mirror_tokens`
| Column | Type | Constraints |
|---|---|---|
| `token` | TEXT | PK |
| `user_id` | UUID | FK users |
| `label` | TEXT | NOT NULL default `'mirror'` |
| `created_at` | TIMESTAMPTZ | |
| `scope` | TEXT | NOT NULL default `'mirror'`, CHECK in `('mirror','api')` (constraint `mirror_tokens_scope_chk`) |

#### `cards`
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `title` | TEXT | NOT NULL |
| `description` | TEXT | NOT NULL default `''` |
| `status` | card_status | NOT NULL default `'backlog'` |
| `tags` | TEXT[] | NOT NULL default `'{}'` |
| `due_date` | DATE | nullable; `pg.types.setTypeParser(DATE)` keeps the ISO string (`db.ts:5`) |
| `source` | card_source | NOT NULL default `'manual'` |
| `position` | DOUBLE PRECISION | NOT NULL default 0 |
| `archived` | BOOLEAN | NOT NULL default FALSE |
| `created_at` | TIMESTAMPTZ | NOT NULL default `now()` |
| `updated_at` | TIMESTAMPTZ | NOT NULL default `now()` |
| `created_by` | UUID | FK users(id) ON DELETE SET NULL; nullable |
| `ai_summarized` | BOOLEAN | NOT NULL default FALSE |
| `needs_review` | BOOLEAN | NOT NULL default FALSE |
| `telegram_chat_id` | BIGINT | nullable |
| `telegram_message_id` | BIGINT | nullable |
| `project` | TEXT | nullable |
| `fts` | tsvector | GENERATED ALWAYS AS `to_tsvector('english', title || ' ' || description)` STORED |

Indexes:
- `idx_cards_status_position(status, position) WHERE NOT archived`
- `idx_cards_tg_msg(telegram_chat_id, telegram_message_id)`
- `cards_project_idx(project) WHERE archived = false`
- `cards_fts_idx USING GIN(fts)`

#### `card_assignees`
PK `(card_id, user_id)`; both FK CASCADE. Index `idx_card_assignees_user(user_id)`.

#### `card_shares`
PK `(card_id, user_id)`; both FK CASCADE. Index `idx_card_shares_user(user_id)`.

#### `telegram_identities`
| Column | Type | Constraints |
|---|---|---|
| `telegram_user_id` | BIGINT | PK |
| `app_user_id` | UUID | FK users CASCADE |
| `telegram_username` | TEXT | nullable |
| `created_at` | TIMESTAMPTZ | |

#### `card_attachments`
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `card_id` | UUID | FK cards CASCADE |
| `kind` | attachment_kind | NOT NULL |
| `storage_path` | TEXT | NOT NULL (relative to `ATTACHMENTS_DIR`) |
| `original_filename` | TEXT | nullable |
| `created_at` | TIMESTAMPTZ | |

Index: `idx_attachments_card(card_id)`.

#### `card_events` (activity log + chat unified)
| Column | Type | Constraints |
|---|---|---|
| `id` | BIGSERIAL | PK |
| `actor_id` | UUID | FK users ON DELETE SET NULL |
| `card_id` | UUID | FK cards CASCADE |
| `action` | TEXT | nullable |
| `details` | JSONB | NOT NULL default `'{}'` |
| `entry_type` | TEXT | NOT NULL default `'system'`, CHECK in `('system','message','ai','share')` |
| `content` | TEXT | nullable (message body / AI reply) |
| `ai_suggestions` | JSONB | nullable (array of `{label, action, params}`) |
| `created_at` | TIMESTAMPTZ | default `now()` |

Indexes:
- `idx_card_events_card(card_id, created_at ASC)`
- `idx_activity_created(created_at DESC)`

Note: prior name was `activity_log`; renamed in `2026-05-02-card-events-chat.sql`.

#### `card_event_reads`
PK `(card_id, user_id)`; `last_read_id BIGINT NOT NULL default 0`. Per-user read
marker into the `card_events` stream.

#### `card_templates`
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `owner_id` | UUID | FK users CASCADE |
| `name` | TEXT | NOT NULL |
| `visibility` | TEXT | CHECK in `('private','shared')` |
| `title` | TEXT | NOT NULL |
| `description` | TEXT | NOT NULL default `''` |
| `tags` | TEXT[] | NOT NULL default `'{}'` |
| `status` | card_status | default `'today'` |
| `due_offset_days` | INTEGER | nullable, validated 0–365 at API layer |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

Unique index: `card_templates_owner_name_key(owner_id, lower(name))`.
Index: `card_templates_visibility_idx(visibility)`.

#### `knowledge_items`
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `owner_id` | UUID | FK users CASCADE |
| `title` | TEXT | NOT NULL (max 200 chars enforced server-side) |
| `title_auto` | BOOLEAN | NOT NULL default FALSE — set when title was synthesized from URL/AI and may be replaced when fetch completes |
| `url` | TEXT | nullable |
| `body` | TEXT | NOT NULL default `''` (≤200K chars by default) |
| `tags` | TEXT[] | NOT NULL default `'{}'` (max 10 tags, each ≤32 chars) |
| `visibility` | TEXT | CHECK in `('private','inbox','shared')` |
| `source` | TEXT | NOT NULL default `'manual'`, CHECK in `('manual','telegram','share_target','from_card')` |
| `fetch_status` | TEXT | nullable, CHECK in `('pending','ok','failed','skipped')` |
| `fetch_error` | TEXT | nullable, truncated to 500 chars |
| `fetched_at` | TIMESTAMPTZ | nullable |
| `archived` | BOOLEAN | NOT NULL default FALSE (soft-delete) |
| `created_at` / `updated_at` | TIMESTAMPTZ | |
| `fts` | tsvector | GENERATED on `(title \|\| ' ' \|\| body \|\| ' ' \|\| url)` |

Indexes:
- `idx_knowledge_fts USING GIN(fts)`
- `idx_knowledge_owner(owner_id) WHERE NOT archived`
- `idx_knowledge_tags USING GIN(tags)`

#### `knowledge_shares`
PK `(knowledge_id, user_id)`. Index `idx_knowledge_shares_user(user_id)`.

#### `knowledge_card_links`
| Column | Type | Constraints |
|---|---|---|
| `knowledge_id` | UUID | FK |
| `card_id` | UUID | FK |
| `created_by` | UUID | FK users SET NULL |
| `created_at` | TIMESTAMPTZ | |

PK `(knowledge_id, card_id)`. Index `idx_klc_card(card_id)`.

#### `ai_insights`
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `card_id` | UUID | FK cards CASCADE |
| `requested_by` | UUID | FK users (NOT NULL, no cascade) |
| `status` | TEXT | CHECK in `('pending','ok','failed')` default `'pending'` |
| `summary` | TEXT | nullable (≤600 chars) |
| `body` | JSONB | `{ related_items: [{kind,id,title,why,url?}], web_findings: [{title,url,why}], next_steps: string[] }` |
| `error` | TEXT | nullable |
| `degraded` | BOOLEAN | NOT NULL default FALSE — TRUE when Tavily returned no results |
| `created_at` | TIMESTAMPTZ | default `now()` |
| `completed_at` | TIMESTAMPTZ | nullable |

Index: `ai_insights_card_idx(card_id, created_at DESC)`.

#### `card_links`
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `from_card_id` | UUID | FK cards CASCADE |
| `to_card_id` | UUID | FK cards CASCADE |
| `label` | TEXT | CHECK in 6 labels (see §6) |
| `note` | TEXT | nullable, server truncates to 500 chars |
| `created_by` | UUID | FK users NOT NULL |
| `created_at` | TIMESTAMPTZ | default `now()` |

Unique `(from_card_id, to_card_id, label)`. Indexes `card_links_from_idx(from_card_id)`, `card_links_to_idx(to_card_id)`.

#### `notifications`
| Column | Type | Constraints |
|---|---|---|
| `id` | SERIAL | PK |
| `user_id` | UUID | FK users CASCADE |
| `card_id` | UUID | FK cards CASCADE |
| `event_id` | BIGINT | FK card_events CASCADE |
| `actor_name` | TEXT | NOT NULL |
| `preview` | TEXT | NOT NULL (sliced to 120 chars at insert) |
| `read` | BOOLEAN | NOT NULL default FALSE |
| `created_at` | TIMESTAMPTZ | default `now()` |

Partial index: `notifications_user_unread(user_id) WHERE read = false`.

#### `push_subscriptions`
| Column | Type | Constraints |
|---|---|---|
| `id` | SERIAL | PK |
| `user_id` | UUID | FK users CASCADE |
| `endpoint` | TEXT | UNIQUE, NOT NULL |
| `p256dh` | TEXT | NOT NULL |
| `auth` | TEXT | NOT NULL |
| `created_at` | TIMESTAMPTZ | default `now()` |

### 4.3 Table count

**18 tables.** Breakdown:

| Table | Tables |
|---|---|
| Auth / identity | `users`, `sessions`, `mirror_tokens`, `telegram_identities` |
| Cards | `cards`, `card_assignees`, `card_shares`, `card_attachments`, `card_events`, `card_event_reads`, `card_links` |
| Knowledge | `knowledge_items`, `knowledge_shares`, `knowledge_card_links` |
| Templates | `card_templates` |
| AI | `ai_insights` |
| Notifications | `notifications`, `push_subscriptions` |

### 4.4 Soft-delete patterns

| Table | Soft-delete column | Hard-delete path |
|---|---|---|
| `cards` | `archived BOOLEAN` | `DELETE /api/cards/:id/permanent`, `POST /api/cards/archived/purge` |
| `knowledge_items` | `archived BOOLEAN` | none — soft-only |
| Everything else | row delete (no soft flag) | direct DELETE |

### 4.5 Position algorithm

- Type: `DOUBLE PRECISION` (`schema.sql:73`).
- New card position: `COALESCE((SELECT MIN(position) - 1 FROM cards WHERE status = $status AND NOT archived), 0)` (`routes/cards.ts:97-99`, `telegram/bot.ts:174-175`).
- Cross-column move / intra-column reorder: client computes a new mid-point in
  the web client, then sends `PATCH /api/cards/:id` with `{ status, position }`.
  Server stores the float verbatim; no rebalancing.
- Ordering: `ORDER BY c.status, c.position, c.created_at` (`cards.ts:122`).

### 4.6 Activity log shape

`card_events` rows are unified across system events (`entry_type='system'`),
user messages (`'message'`), AI replies (`'ai'`), and share announcements
(`'share'`). System rows use `action` ("create", "update", "archive", etc.) +
`details JSONB`. Chat/AI rows use `content TEXT`. AI rows may include
`ai_suggestions JSONB` with up to 3 entries:
`{ label: string, action: 'update_status'|'set_due_date'|'assign_user'|'create_card', params: object }`
(`server/src/cards.ts:129-133`, `ai/card_chat.ts:51-79`).

Read tracking: `card_event_reads(card_id, user_id, last_read_id)` is a high-
water-mark write, updated with `GREATEST(existing, $3)` (`cards.ts:270-280`).

`getUnreadCounts(userId)` (`cards.ts:282-307`) counts `entry_type IN ('message','ai')` events whose `id > last_read_id` AND user is creator/assignee/share/inbox-visible. Result is **bare object** `Record<cardId, number>`.

---

## 5. Auth & Authorization

### 5.1 Session cookie

| Property | Value |
|---|---|
| Name | `kanban_session` (`auth.ts:6`) |
| Storage | `sessions` table (server-side; cookie is just the bearer token) |
| Lifetime | 30 days (`SESSION_DAYS = 30`, `auth.ts:8`) |
| `httpOnly` | true |
| `sameSite` | `lax` |
| `secure` | derived from `APP_URL.startsWith('https://')`, overridable via `COOKIE_SECURE=true\|false` |
| `path` | `/` |
| `maxAge` | `30 * 86400` |
| Cookie secret | `process.env.COOKIE_SECRET ?? 'dev-cookie-secret-change-me'` (`index.ts:47`) |
| Token entropy | `crypto.randomBytes(32).toString('base64url')` (`auth.ts:22-25`) |

### 5.2 Password hashing

`argon2.hash(pw, { type: argon2.argon2id })` (`auth.ts:11-13`). Default argon2
parameters (memory, iterations, parallelism) from the `argon2` library.

### 5.3 Bearer API tokens (write capability)

- Issued via `POST /api/tokens` (`routes/api_tokens.ts:6-18`).
- Stored in `mirror_tokens` table with `scope='api'`.
- Sent as `Authorization: Bearer <token>`.
- Resolved via `userFromApiToken` (`auth.ts:63-72`).
- Web UI displays the full token at creation time and last-8 thereafter (per
  registry / SettingsDialog convention).
- Revoke = DELETE row.

### 5.4 Mirror tokens (read-only)

- Issued via `POST /api/mirror/tokens` (`routes/mirror.ts:6-19`).
- Stored in `mirror_tokens` with `scope='mirror'`.
- Sent in two ways:
  - HTTP: header `X-Mirror-Token: <token>` (`auth.ts:7` constant `MIRROR_HEADER`).
  - WebSocket: query string `?mirror=<token>` (`ws.ts:116`).
- Useful only with `requireUserOrMirror` (cards list, attachments static mount).
- Mirror tokens can also be embedded in URLs like `/my-day?token=<token>`
  (returned in POST response payload).

### 5.5 Open signup flag

`OPEN_SIGNUP` env var (`routes/auth.ts:15`). When `'false'`, only the *first*
user can register; subsequent registrations get 403 `signup disabled`. Defaults
to open (household trust model).

### 5.6 First-user bootstrap

On first successful registration, `userCount === 0` triggers
(`routes/auth.ts:46-53`):
- Backfills `cards.created_by = <new user.id>` for any rows where it was null
  (Phase 1 cards from before `created_by` existed).
- Inserts the new user as assignee on every non-archived card.

### 5.7 Visibility predicate (canonical)

Defined as SQL fragment `VISIBLE_TO_USER` (`cards.ts:67-72`):

```
(
  c.created_by = $1
  OR EXISTS (SELECT 1 FROM card_assignees WHERE card_id = c.id AND user_id = $1)
  OR EXISTS (SELECT 1 FROM card_shares    WHERE card_id = c.id AND user_id = $1)
  OR NOT EXISTS (SELECT 1 FROM card_assignees WHERE card_id = c.id)
)
```

Last clause = Family Inbox (any card with zero assignees is visible to everyone). Mirrored client-side in `ws.ts:35-42` and `App.tsx:193-202`.

### 5.8 Auth preHandlers used in routes

| Helper | Behavior |
|---|---|
| `requireUser` | Cookie session only; 401 if missing/invalid |
| `requireUserOrMirror` | Session cookie → fallback to `X-Mirror-Token`; sets `req.isMirror=true` on mirror path |
| `requireUserOrApiToken` | Session cookie → fallback to `Authorization: Bearer`; 401 if neither |
| `requireApiToken` | Bearer-only; 403 if missing (note: 403 not 401) |

---

## 6. Business Rules & Invariants

### 6.1 Card lifecycle

- States: `backlog → today → in_progress → done` (no enforced ordering — any
  transition allowed via PATCH).
- Archived = soft-delete flag; archived cards excluded from default list/board.
- Restore: `PATCH /api/cards/:id/restore` flips back.
- Permanent delete: only allowed on already-archived cards; also removes
  attachment dir on disk.
- Purge: deletes ALL caller-visible archived cards.

### 6.2 Card position algorithm

- `DOUBLE PRECISION` mid-point ordering, no rebalancing.
- New card: prepended via `MIN(position) - 1` per status lane (so newest is at
  the top of each lane).
- Move: client picks a new float between neighbors; server stores verbatim.
- Re-render order: `(status, position, created_at)`.

### 6.3 Attachment caps

- 5 MB default (`ATTACHMENT_MAX_BYTES`, configurable).
- Image MIME allowlist for `POST /api/cards/:id/attachments` and
  `POST /api/cards/from-image`: `png, jpeg, webp, gif` (`routes/attachments_upload.ts:18-23`).
- Telegram bot supports `image`, `audio` (.ogg via voice/audio), and may attach
  arbitrary `kind='file'` (per enum), but no endpoint currently uploads `file`.
- Per-card directory: `<ATTACHMENTS_DIR>/<card_id>/<random>.<ext>`.

### 6.4 AI insights concurrency

| Limit | Value | Source |
|---|---|---|
| Pending per user | 5 | `routes/insights.ts:16` |
| Pending per card | 1 | `routes/insights.ts:17` |
| Per user per day | 50 | `routes/insights.ts:18` |
| LLM timeout | `BRAINSTORM_TIMEOUT_MS` default 30s | `ai/brainstorm.ts:185` |
| Returns 429 when exceeded | yes | `routes/insights.ts:40-48` |

### 6.5 Insight pipeline lifecycle

`queued (status=pending)` → runs in `brainstorm_queue.ts` → fetches local FTS
hits (cards + knowledge) + Tavily → LLM call → either:
- `ok` with `degraded=TRUE` if Tavily returned 0 results, OR
- `ok` with `degraded=FALSE`, OR
- `failed` on error.

Recovery: on server boot (`insights.ts:111-123`), all pending rows older than
1 hour are marked `failed='abandoned on restart'`. Younger pending rows are
re-enqueued. Telegram nudge sent on completion if linked identity exists
(`telegram/bot.ts:1868-1887`).

### 6.6 Knowledge SSRF guard

`isHostBlockedForSSRF` (`knowledge_fetch.ts:21-37`):

- Blocks `localhost` and DNS-failure hosts unconditionally.
- IPv4 blocklist: `10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16`, `192.168.0.0/16`,
  `172.16.0.0/12`, `0.0.0.0/8`.
- IPv6 blocklist: `::1`, `fc..`, `fd..`, `fe80..`.
- Uses `dns.lookup({ all: true })` so multi-record hostnames are checked.

Other fetch guards:
- Timeout `KNOWLEDGE_FETCH_TIMEOUT_MS` default 10s.
- Max response: 5 MiB hard cap; AbortController-aborts on overflow.
- Content-type allowlist: `text/html`, `application/xhtml`.
- HTML extraction via Readability; falls back to raw body text slice 50K.
- Final body slice: 200K chars.

### 6.7 Knowledge body cap

Default 200,000 chars (`KNOWLEDGE_BODY_MAX_CHARS`). Title cap 200 chars.
Up to 10 tags, each ≤32 chars (`knowledge.ts:49-52, 70-81`).

### 6.8 Templates rules

- Name regex: `/^\S(?:.{0,38}\S)?$/` → 1–40 chars, no leading/trailing
  whitespace, no whitespace-only (`templates.ts:32`).
- Title max 120 chars.
- Up to 5 unique tags.
- `due_offset_days` integer 0–365 or null.
- Visibility: `'private'|'shared'`.
- Unique constraint: `(owner_id, lower(name))` — 409 on duplicate.
- `instantiateTemplate` computes due_date as
  `startOfUtcDay + due_offset_days * 86_400_000` then slices to ISO date
  (`templates.ts:222-231`).

### 6.9 Card links

- 6 labels: `evolves_from`, `supersedes`, `split_from`, `related`,
  `inspired_by`, `duplicate_of` (`card_links.ts:3-10`).
- Self-link blocked (400 / Error).
- Duplicate `(from, to, label)` → 409.
- Chain BFS: `chainCardIds(startId, depth)` is a `WITH RECURSIVE` walk over
  card_links (both directions); depth capped 1–6, default 2
  (`card_links.ts:79-96`; `routes/card_links.ts:152`).

### 6.10 Telegram bot — capture flow

Entrypoint: `bot.on('message')` (`telegram/bot.ts:1781-1823`). Group filter:
when `TELEGRAM_GROUP_ID` is set, only messages in that group (plus DMs from
registered users) are accepted. Unknown senders silently ignored. Errors during
handling are swallowed → a `needs_review=TRUE` card is saved with raw body.

#### Reply-based commands (act on the card whose telegram_message_id matches the replied-to message)

| Command | Effect |
|---|---|
| `/assign @username [@...]` | Replaces assignees (resolved via `telegram_identities`) |
| `/share @username [@...]` | Adds shares |

#### Fast-path command

| Command | Effect |
|---|---|
| `/today <text>` | Creates card in `today` lane immediately (bypasses propose flow) |

#### Templates (DM only)

| Command | Effect |
|---|---|
| `/use <name>` or `/t <name>` | Instantiate template by case-insensitive name |
| `/templates` | List user-visible templates |

#### Knowledge (DM only)

| Command | Effect |
|---|---|
| `/save <url> [\| title]` | Create knowledge with `auto_fetch=true` |
| `/note <body>` | Create text-only knowledge (first line = title) |
| `/k <query>` | Show top 5 search hits, with `kshow` inline buttons |
| `/klist` | Show top 10 knowledge items |

#### Default AI propose/confirm flow

Plain text (no command) → `proposeFromText(text)` (`ai/propose.ts`) →
`AIProposal { is_actionable, title, description, tags, reason }` →
`destinationKeyboard` (Private/Public/Knowledge + Duplicate check + Link +
Edit + Cancel) → user picks `dest:*:<pid>` → `columnKeyboard` (Backlog/Today/
In Progress/Done) → `finalizeCard`. Photo / voice flow first asks "new vs
attach to existing" (`attachmentKindKeyboard`).

#### Post-save inline keyboard quick actions

After save: `postSaveKeyboard` (`telegram/bot.ts:359-372`) shows
**Today / Doing / Done / 🗑 / Brainstorm** quick action buttons. `mv:<status>:<id>`
moves, `arch:<id>` archives, `brain:<id>` enqueues an insight.

#### Pending proposal state

In-memory (no DB row) per pending capture: `proposals.ts` keeps
`PendingProposal { id, tgUserId, appUserId, chatId, isPrivateChat, original,
proposal, links, destination?, attachMode, pendingPhotoFileId?, pendingAudioFileId?,
pendingLinkTargetId?, pendingLinkLabel?, awaitingEdit?, awaitingLinks?, awaitingLinkNote?,
dupCandidates?, attachFilter?, attachPickerIds?, promptMessageId? }`. Note: bot
restart drops pending state — already-saved cards survive.

### 6.11 `@ai` mention → in-app AI reply

`POST /api/cards/:id/messages` matches `/(?:^|\s)@ai(?:\s|$)/i` and fires
`processCardChatAI` async (`routes/chat.ts:65-69`). The AI builds a system
prompt with card details + last 20 events (`ai/card_chat.ts:16-49`), calls
chat with fallback, optionally suggests up to 3 actions in a
`<!-- suggestions: [...] -->` block which is parsed and stored as
`card_events.ai_suggestions` JSONB. Reply event broadcast as `card.ai_response`.

---

## 7. External Services

### 7.1 OpenAI

| Use | Model | Endpoint | Notes |
|---|---|---|---|
| Chat fallback | `gpt-4o-mini` | chat.completions | Only invoked if OpenRouter is primary and fails |
| Vision fallback | `gpt-4o-mini` | chat.completions (image_url message) | Same |
| Whisper | `whisper-1` | audio.transcriptions | OpenRouter does not offer audio — always OpenAI (`ai/openai.ts:88-90`, `ai/whisper.ts`) |

If only `OPENAI_API_KEY` is set, OpenAI becomes the primary for chat + vision.

### 7.2 OpenRouter (primary chat + vision)

- Client: `openai` SDK with `baseURL: 'https://openrouter.ai/api/v1'` and
  custom headers `HTTP-Referer: APP_URL`, `X-Title: 'Kanban Family'`
  (`ai/openai.ts:15-23`).
- Default chat model: `OPENROUTER_MODEL` or `google/gemini-2.0-flash-001`.
- Default vision model: `OPENROUTER_VISION_MODEL` or `google/gemini-2.0-flash-001`.
- Fallback chain: OpenRouter primary → OpenAI fallback (if both keys present).
  Single retry on first failure (`ai/openai.ts:94-118`).

### 7.3 Tavily

- Web search for brainstorm (`ai/tavily.ts`).
- POST `https://api.tavily.com/search` with `api_key`, `query`, `search_depth: 'basic'`, `max_results: 5`, `include_answer: false`, `include_raw_content: false`.
- Timeout 8s. On missing key / HTTP error / network error / timeout → returns
  `[]`. Callers treat this as **degraded** mode (`ai_insights.degraded = TRUE`).

### 7.4 Open-Meteo (weather)

- Client-side only (`web/src/hooks/useWeather.ts`). Not called by server. No
  API key required.

### 7.5 Web Push (VAPID)

Subscribe flow:
1. Client calls `GET /api/push/vapid-public-key` → `{ publicKey }`.
2. Browser `PushManager.subscribe()` produces `{ endpoint, keys: { p256dh, auth } }`.
3. Client POSTs `/api/push/subscribe` with that triple.
4. Server stores row in `push_subscriptions(user_id, endpoint UNIQUE, p256dh, auth)`.

Send flow (`push.ts:47-72`):
- On `card.message`, `card.ai_response`, etc. server calls `pushToUser(uid,
  { title, body, cardId })` → enumerates all subscriptions for that user and
  posts to each endpoint via `web-push`.
- On HTTP 410 (Gone), the subscription row is deleted automatically
  (`push.ts:54-57`).

Unsubscribe: `DELETE /api/push/subscribe` with `{ endpoint }`.

---

## 8. Web Frontend Architecture (for reference)

### 8.1 Versions

| Component | Version |
|---|---|
| React | ^18.3.1 |
| ReactDOM | ^18.3.1 |
| Vite | ^5.4.8 (`@vitejs/plugin-react` ^4.3.2) |
| TypeScript | ^5.6.3 |
| `@dnd-kit/core` | ^6.1.0 |
| `@dnd-kit/sortable` | ^8.0.0 |
| `@dnd-kit/utilities` | ^3.2.2 |
| `framer-motion` | ^12.38.0 |
| `reactflow` | ^11.11.4 |
| Tailwind | ^3.4.13 (with autoprefixer ^10.4.20, postcss ^8.4.47) |

Source: `web/package.json`.

### 8.2 State / data layer

**No React Query, no Zustand.** Plain React `useState` + custom hooks
(`web/src/hooks/use*.ts`). API calls via fetch wrapper in `web/src/api.ts`
which `credentials: 'include'` on every request to send the session cookie.

Live updates: single WebSocket connection through `web/src/ws.ts` (created in
`App.tsx:151-211` and `MobileShell.tsx:110-155`); per-message switch dispatches
to dedicated `apply*Event` helpers under `hooks/` (templates, knowledge,
insights, card links).

### 8.3 Router

**No `react-router-dom`.** Routing is `location.pathname` regex matching in
`App.tsx:36-48`:

| Path | Component |
|---|---|
| `/m/card/<uuid>` (strict 8-4-4-4-12) | `MobileCardView` (unauth → `LoginView` with `redirectTo`) |
| `/knowledge/share?title=&url=&text=` | `Authed` (sets shareInitial state, normalises URL to `/knowledge`) `App.tsx:91-103` |
| anything else | `LoginView` if unauth, else `Authed` (which mounts `MobileShell` on small screens) |

`useIsMobile.ts` decides desktop vs mobile shell.

Other paths the client uses (no router, just `location.assign`):
- `/m/card/<id>` from `MobileShell` lists.
- `/my-day?token=<mirror>` referenced as the mirror URL.

### 8.4 DnD

`@dnd-kit/core` + `@dnd-kit/sortable`. Pointer sensor with 4px activation
distance (per registry F-051). `DragOverlay` ghost card at 0.4 opacity.
`TrashDropZone` is a sortable drop target with `id='trash'`.

### 8.5 Animations

`framer-motion` for hover lifts (`motion.div whileHover { y: -2 }`), drop
target highlight ring (animated box-shadow), AnimatePresence on empty-lane
italic messages. Respects `prefers-reduced-motion` per registry F-092.

### 8.6 Card chain visualization

`reactflow` ^11.11.4 powers `CardChainModal.tsx`. Backed by
`GET /api/cards/:id/chain?depth=`.

### 8.7 Styling

Tailwind CSS 3 (`tailwind.config.js`, `postcss.config.js`). Theme tokens live
in `web/src/theme.css` exposing CSS custom properties: `--canvas`, `--surface`,
`--ink`, `--ink-2`, `--ink-3`, `--hairline`, `--pin-{backlog,today,doing,done}`,
`--lane-{...}`, `--violet`, `--danger`, `--green-house`, `--sh-{1,2,3}`. Theme
switch handled by an inline script in `index.html:18-26` (reads
`localStorage.theme` or system preference, sets `documentElement.dataset.theme`).

Fonts (loaded via Google Fonts `<link>` in `index.html:6-8`):
- Spectral (titles / serif)
- Inter (body)
- JetBrains Mono (counts / monospace UI bits)

### 8.8 Service worker, install prompt, push

| Concern | File |
|---|---|
| SW registration | inline in `index.html:13-17` (`navigator.serviceWorker.register('/sw.js')`) |
| SW source | `web/public/sw.js` |
| Manifest | `web/public/manifest.webmanifest` linked from `index.html:10` |
| `beforeinstallprompt` | captured by `hooks/useInstallPrompt.ts` |
| Push subscription | `hooks/usePushNotifications.ts` |
| SW → client message handler | `App.tsx:347-356` listens for `{ type: 'open-card', cardId }` |
| `?card=<id>` URL param | consumed on load (`App.tsx:359-370`), routes user to card detail |

---

## 9. Mobile Web (PWA) Shell Inventory

### 9.1 Entry points

- `MobileShell.tsx` (full responsive shell — only mounted when `useIsMobile()` is true).
- `MobileCardView.tsx` (standalone deep-link route for `/m/card/<uuid>`).
- `MobileMore.tsx` (additional mobile screens, not currently linked from the bottom nav based on `MobileShell.tsx`).

### 9.2 Top-level routes / sections handled in `MobileShell`

| Section | Route trigger | Content |
|---|---|---|
| Board | tab=`board` (default) | Lane heading + activity ticker + search input + card list + capture bar |
| Knowledge | tab=`knowledge` | `<KnowledgeView />` |
| Archive | tab=`archive` | `<ArchiveDialog />` |

Bottom nav has 3 tabs (Board / Knowledge / Archive) — see `NAV_TABS` array
(`MobileShell.tsx:226-242`). Profile dropdown lives inline in the top header
with "Sign out" calling `api.logout()` then `location.reload()`.

### 9.3 Touch interactions

| Gesture | Location | Behavior |
|---|---|---|
| Lateral swipe on card list | `onSwipeStart`/`onSwipeEnd` (`MobileShell.tsx:173-192`) | Cycles `activeStatus` through `STATUSES`. Thresholds: dt≤600ms, \|dx\|≥60px, \|dx\|≥1.5×\|dy\|. |
| Long-press card | `useLongPress(onLongPress, 500)` (`MobileShell.tsx:597, hooks/useLongPress.ts`) | Opens `MobileCardActions` bottom sheet (move / archive) |
| Tap card | `onClick` after `didLongPress` guard | `location.assign('/m/card/<id>')` |
| Tap lane heading | `setLanePicker('view')` | Opens bottom-sheet lane picker |
| Lane picker tap | per-status button | `setActiveStatus(s); setLanePicker(null)` |
| Scope select | `<select>` | scope change (rerun listCards) |
| Profile avatar | dropdown | open/close, sign out |

### 9.4 Install prompt

`useInstallPrompt()` captures `beforeinstallprompt`. The shell shows a green
banner above the bottom nav with **Install** / **Dismiss** buttons
(`MobileShell.tsx:423-447`). Dismissal persists in `localStorage.install-dismissed`.

### 9.5 Web Share Target (PWA)

Inferred from `App.tsx:91-103`: PWA manifest registers `/knowledge/share` as a
share target that accepts `?title=&url=&text=`. On load, content is forwarded
to `KnowledgeView` via `shareInitial` state; URL is rewritten to `/knowledge`
without reload.

### 9.6 Capture bar (mobile)

`<CaptureBar>` floats above the bottom nav (`bottom: calc(56px + safe-area + 8px)`)
and accepts:
- text input → `onCreate(title, status)`
- photo paste / picker → `onCreate FromImage(file, status)`
- template selection → `onInstantiateTemplate(id, status)`
- voice todo button → currently `addToast('Voice capture coming soon')` (stub)

### 9.7 MobileCardActions sheet

Quick actions sheet for long-pressed card (`components/MobileCardActions.tsx`):
move to each status, archive (`confirm()` modal), close. Reuses card REST
endpoints.

### 9.8 Why this matters for Android

The PWA shell is the closest analog to the experience an Android native app
should deliver. Stage 2 should treat `MobileShell` + `MobileCardView` as the
UX north star, not desktop `Board.tsx`. Specifically: scope dropdown, lane
swipe cycling, long-press bottom sheet, capture bar above bottom nav, bottom
3-tab navigation (Board/Knowledge/Archive), share target intent for knowledge,
mirror token deep links, and `?card=<id>` push-click resume.

---

## 10. Constraints & Production Reality

### 10.1 Prod deployment

From project memory and `docker-compose.yml`:

| Aspect | Value |
|---|---|
| VPS | `npalakurla@192.168.50.13` (SSH alias `kanban-prod`) |
| Working dir | `/home/npalakurla/smartkanban` |
| Branch tracked | `main` (NOT `feat/design-polish`) |
| Deploy mechanism | `git pull && docker compose up --build server` |
| Compose services | `db` (postgres:16-alpine) + `server` (Fastify build from `Dockerfile`) |
| Server port | 3001 (host) → 3001 (container) |
| Postgres port | 5432:5432 |
| Attachments volume | `./server/data:/app/server/data` |
| Telegram bot token | **Must NOT be reused** between dev and prod — causes 409 polling conflict (per project memory) |

### 10.2 Branch state at handoff

- Current branch: `feat/design-polish`
- Working tree dirty: yes (`?? FEATURE_PARITY_REGISTRY.md`, `?? __pycache__/`,
  `?? agent-rules.md`, `?? fix_progress.json`, `?? orchestrator*`,
  `?? stage_prompts/`)
- Recent commits: design-polish work (copyable card id chips, comment body
  rendering fixes, merge from main).

### 10.3 APP_URL → secure cookie linkage

`COOKIE_SECURE` derives from `APP_URL.startsWith('https://')`
(`auth.ts:139-144`). Android, like any non-browser client, will NOT receive
the cookie at all if it doesn't honor `Secure`. Implication:
- Android client **must hit the HTTPS APP_URL**, not raw HTTP.
- Or use API tokens (`Authorization: Bearer`) and skip cookies entirely.

### 10.4 CORS / cookie behavior for cross-origin native client

```ts
await app.register(cors, { origin: true, credentials: true }); // index.ts:43-46
```

- `origin: true` reflects the request `Origin` header back as
  `Access-Control-Allow-Origin`. This is **permissive but only meaningful for
  browser callers** — native clients don't enforce CORS.
- For Android native, CORS is a non-issue, BUT:
  - Cookie-based session won't auto-persist unless the HTTP client implements a
    cookie jar AND respects `Secure`/`SameSite=lax`.
  - `SameSite=lax` will block the cookie on cross-site navigations initiated
    via top-level GET if the native client's WebView origin differs from
    `APP_URL`.
  - Bearer API tokens (existing endpoint: `POST /api/tokens`) avoid cookie
    pitfalls entirely but only cover `requireUserOrApiToken` routes (cards
    CRUD). Routes guarded by `requireUser` alone (auth/me, knowledge,
    templates, insights, mirror tokens, notifications, push subscribe, telegram
    link, review, archive, chat events, etc.) **currently have no native-token
    path**.

### 10.5 Other gotchas (from memory + code)

- `bot.catch` is wired (`telegram/bot.ts:1829-1831`) — without it, any thrown
  handler kills the polling loop. Keep that pattern if the Android app ever
  proxies bot updates.
- Date columns are returned as plain ISO `YYYY-MM-DD` strings (not JS Date) due
  to `pg.types.setTypeParser(DATE)` (`db.ts:5`). Android Codable equivalents
  must treat `due_date` as `String?`, not `Date?`, to mirror this verbatim.
- `position` is `Double` (Postgres `DOUBLE PRECISION`). Float, not int.
- WebSocket sends `card_id` (snake_case) in some payloads but `id` (no prefix)
  in `card.deleted` — see exact shapes in §3.2.
- `actor_name` on `CardEvent` comes from `users.name`, **not** `short_name`
  (`cards.ts:182`).
- `getUnreadCounts` returns a **bare object** mapping card_id → number; not
  wrapped in `{counts: ...}`.

---

## 11. Open Questions for Stage 2 PM

### 11.1 Auth for native

- Use the existing cookie session via Android's `CookieManager`/`OkHttp
  CookieJar`? Or introduce a new bearer-token path for ALL endpoints (today
  only the write-cards endpoints accept bearer).
- If bearer: do we need a new `/api/auth/native/login` that exchanges
  email/password for a token tied to a per-device identifier (not a session
  cookie)?
- Should the existing `mirror_tokens` table be extended with `scope='native'`
  rather than minting a third token type?

### 11.2 Push provider

- Web Push (VAPID) is browser-only. Android native push needs FCM. Do we:
  - Add a parallel `fcm_subscriptions` table + worker?
  - Reuse the existing `pushToUser` fan-out path but switch payload encoder
    based on subscription kind?
  - Or accept that Android receives push only via the FCM-backed
    PushManager-via-Chrome flow when the PWA is installed (and skip native
    push)?

### 11.3 Offline-first or online-only?

- The web client has zero offline persistence (no IndexedDB cache, no service
  worker fetch handler beyond registration). Should Android cache cards
  locally? If so, what's the conflict-resolution model when a mid-edit card is
  pushed via WS while the user has local edits?

### 11.4 WebSocket lifecycle on mobile

- Should the Android app keep the WS open via a foreground service, or treat
  WS as best-effort while in foreground and rely on FCM for background
  updates?

### 11.5 Attachments

- Server enforces image-only (5 MB) for paste/upload, but the `attachment_kind`
  enum includes `file` and `audio`. Telegram path uploads audio (Whisper).
  Does Android need a `POST /api/cards/:id/attachments` variant for
  arbitrary files (with new MIME whitelist + size cap)?
- For viewing: attachments are served from `/attachments/<storage_path>` and
  require session/mirror auth. Will Android construct
  `Authorization`/`Cookie`-bearing image loads (Coil interceptor), or do we
  expose a signed-URL endpoint?

### 11.6 Telegram bridge

- The Telegram bot creates cards on behalf of users. Should the Android app
  add an in-app capture path mirroring `proposeFromText` → propose → confirm,
  or rely on `POST /api/cards` and let Telegram remain the AI-assisted
  capture surface?

### 11.7 PWA vs native install coexistence

- Users on Android can install the PWA today (`beforeinstallprompt` flow).
  Will the native Android app suppress / override the install prompt, or
  ship as a second install option?

### 11.8 Voice capture

- `onVoiceTodo` is currently a stub in `CaptureBar`. Telegram path already
  uses Whisper. Should Android voice capture record locally and upload to a
  new `/api/cards/from-audio` endpoint (which doesn't exist yet)?

### 11.9 Card chain visualization

- `reactflow` is a desktop-friendly graph editor with pan/zoom. Android native
  equivalent? Re-implement with platform graph view, or render the data as
  a list/tree?

### 11.10 Knowledge share target

- The PWA registers a Web Share Target at `/knowledge/share`. Android native
  app should register an `ACTION_SEND` intent handler. Confirm the payload
  shape mirrors `{ title, url, text }` URL params → calls
  `POST /api/knowledge` with `{ title, url, body: text, visibility: 'private',
  source: 'share_target' }`.

### 11.11 QR code

- `GET /api/cards/:id/qr.svg` encodes `${APP_URL}/m/card/<id>` — useful for
  desktop → mobile handoff. Native Android could either render that URL or
  introduce a custom scheme (`smartkanban://card/<id>`) with App Links to
  the same path. Decision needed before Stage 2 wireframes lock card-detail
  navigation.

### 11.12 Activity log paging

- `GET /api/cards/:id/events` returns the FULL event list. No `limit`/cursor.
  For long-lived cards this is unbounded. Stage 2 should decide whether the
  Android client needs a paginated variant before exposing card detail.

STAGE_COMPLETE: analyst routes=51 tables=18 ws_events=19 env_vars=23
