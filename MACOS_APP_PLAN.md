# SmartKanban — macOS App Plan

**Pipeline:** 7-agent specialist sequence (Analyst → PM → Designer → Architect → Engineer → QA → Reviewer)
**Source registry:** `FEATURE_PARITY_REGISTRY.md` @ commit `ea865d97873f` (735 rows, 42 screens, 43 groups)
**Companion reference:** `ANDROID_APP_PLAN.md` (same registry, different platform)
**Target:** macOS 13.3 Ventura+ on Apple Silicon (M1/M2/M3/M4); Intel Mac = STRETCH
**Stack lock:** SwiftUI + AppKit interop, Swift 5.10, Xcode 15.4+, Combine + Swift Concurrency, URLSession (HTTP + WebSocket), Keychain (token storage), UserNotifications + APNs/web-push bridge
**Bundle ID:** `com.kanbanclaude.kanbanclaude`
**App name:** `KanbanClaude` (binary), `SmartKanban` (display)
**URL scheme:** `kanbanclaude://`
**Distribution:** Direct DMG, ad-hoc-signed local install; user runs `xattr -cr /Applications/KanbanClaude.app` post-install
**Prod backend:** `https://kanban.npalakurla.com`
**Reviewer veto count:** 0
**Confidence (worst-link):** 8/10

---

## 0. Executive Summary

**Why a native macOS app exists.** Web frontend (`web/`) is React 18 + Vite + dnd-kit + Tailwind targeting Chrome/Safari and PWA install. Native macOS unlocks: NSMenu (top-of-screen application menu), global keyboard shortcuts via NSEvent monitors, NSToolbar with vibrancy and unified-titlebar look, NSWindow autosave + multi-window, NSStatusBar menubar extra with badge count, native Quick Look on attachments, Share extension from any source app, drag-from-Finder onto cards, NSUserNotification + APNs for delivery while the browser is closed, Spotlight + Continuity, faster cold start (no JS engine), and a single signed binary that survives sleep/wake more reliably than a long-lived browser tab.

**Stack decision (S4 §4.1).** SwiftUI (primary) + AppKit (NSWindow / NSMenu / NSToolbar / NSStatusBar / NSDragOperation / NSItemProvider — anywhere SwiftUI's APIs are incomplete on macOS 13.3). Swift 5.10. Xcode 15.4+ build. URLSession for HTTP and `URLSessionWebSocketTask` for `/ws` (no third-party WS library). Swift Concurrency throughout (Rule 3 — `withTaskGroup` for fan-out, `Task.detached(priority:.userInitiated)` for heavy fetches, **never** `async let _ =` and **never** `.task { await heavyWork() }`). All shared state via `@MainActor`-isolated observable stores. Auth token stored in Keychain (`kSecClassGenericPassword`) — **never** in UserDefaults, **never** in `.env` at runtime. Tauri 2 and Electron explicitly rejected — see §4.1 rationale.

**Scope (S2 §4).** Registry has **735 rows across 42 screens**. macOS dispositions:
- **MVP (Release 1):** ~280 rows. Auth, Desktop Board (4-column DnD), CardView tile, EditDialog, AI Insights, Card Timeline + chat, Knowledge list/detail/edit, Notification bell + APNs/web-push bridge, Capture (FAB modal), Settings (theme + display name + mirror tokens + API tokens), Archive, Weekly Review, WebSocket sync, search, paste-to-attach.
- **V1 (Release 2):** +Templates CRUD (already partially in MVP), Card Chain modal (graph), Related cards CRUD, Link picker, Toolbar polish (vibrancy, traffic-light alignment), Activity ticker, Weather widget, Telegram identity admin, QR code panel.
- **V2 (Release 3+):** Mirror View kiosk path, Spotlight indexing, Share extension, Quick Look attachment preview, App Intents (Siri / Shortcuts), Dock badge count, Continuity Camera attachment, Universal Clipboard test path.
- **Out-of-scope (~125 rows):** Telegram bot server commands (server-side; R2), Service worker raw (web-only; macOS uses APNs bridge), PWA install prompt (R3), iOS-style mobile sheets (desktop replaces with NSPopover/NSSheet), `⌘K` hint already native via menu, manifest.webmanifest (R3), `font-size:16px` iOS-zoom guard (R3), 60s ticker CSS animation (replace with native Combine timer).

**Critical journeys (S2 §5).** 6 desktop-first flows — cold start to Board visible <2.0 s on M1, `⌘N` capture <250 ms to focus, drag-to-move <500 ms optimistic + ≤1.5 s round-trip via WS reconcile, push-tap to card-open <2 s, WebSocket reconnect <3 s, brainstorm 4-step (open card → `⌘B` brainstorm → wait → Open ↗) <30 s.

**Build phases & estimate (S5 §8).** 10 vertical-slice phases, 45 focused dev days (sequential single-engineer; some Phase 5/6 work parallelizable).

**Top 3 risks (S7 §3).**
1. **R-001 (HIGH):** macOS 13.3 SwiftUI gaps. `NavigationSplitView`, programmatic window opening, and `NSDraggable` inside `List` are flaky pre-14. Mitigation: AppKit interop via `NSViewRepresentable` and `NSWindowController` for windows; pin to AppKit-backed `List` with explicit `id:`.
2. **R-002 (MED):** Web push uses VAPID (RFC 8292) — Apple's web-push for Safari accepts VAPID, but native macOS apps cannot consume VAPID directly. Need server-side bridge: either (a) APNs as a second push channel keyed off the same `push_subscriptions` table with a new column for APNs device token, OR (b) hold-the-line and only support in-app WebSocket notifications + Notification Center via local UNUserNotificationCenter triggered by WS events. **Locked: option (b) for MVP; option (a) is V1.** No server backend changes required for MVP.
3. **R-003 (MED):** Direct-DMG unsigned distribution. Without a Developer ID Application certificate, every install requires `xattr -cr /Applications/KanbanClaude.app` post-copy. Mitigation: ship a one-line installer script + DMG license slide that explains the command. V2: invest in $99/yr Developer ID + notarization.

---

## 1. PROJECT INVENTORY

### 1.1 TECH STACK (web app — read-only reference)

**Frontend (`web/`)**
- React 18.3.1, React DOM 18.3.1
- TypeScript 5.6.3, Vite 5.4.8, `@vitejs/plugin-react` 4.3.2
- Tailwind CSS 3.4.13 + PostCSS 8.4.47 + Autoprefixer 10.4.20
- `@dnd-kit/core` 6.1.0, `@dnd-kit/sortable` 8.0.0, `@dnd-kit/utilities` 3.2.2
- `framer-motion` 12.38.0 (CardView lift/tap animations)
- `reactflow` 11.11.4 (CardChainModal graph)
- Entry: `web/src/main.tsx` → routes `/my-day*` to `MirrorView`, else `<AuthProvider><App/></AuthProvider>`
- Build: `pnpm/npm run build` → `web/dist/` (served by Fastify in prod via `@fastify/static`)
- Dev: Vite at `:5173` with `/api`, `/attachments`, `/telegram`, `/ws` proxied to backend `:3001`

**Backend (`server/`)**
- Node 22+, TypeScript 5.6.3, ESM modules, `tsx` 4.19.1 dev runner
- Fastify 4.28.1 + `@fastify/cookie` 9.4.0 + `@fastify/cors` 9.0.1 + `@fastify/multipart` 8.3.0 + `@fastify/static` 7.0.4 + `@fastify/websocket` 10.0.1
- PostgreSQL via `pg` 8.13.0 (pgcrypto + tsvector FTS; pgvector optional via `KNOWLEDGE_EMBEDDINGS=true`)
- Auth: `argon2` 0.41.1 password hashing, signed cookie via `@fastify/cookie`, session table TTL 30 days
- AI: `openai` 4.67.3 SDK pointed at OpenRouter (`OPENROUTER_API_KEY`, default model `google/gemini-2.0-flash-001`) with OpenAI fallback (`OPENAI_API_KEY`, `gpt-4o-mini`); Whisper for audio (OpenAI-only)
- Knowledge fetch: `@mozilla/readability` 0.6.0 + `jsdom` 29.0.2; SSRF guard blocks private/loopback IPs
- Telegram: `grammy` 1.30.0 (polling in dev, webhook in prod)
- Push: `web-push` 3.6.7 (VAPID)
- QR: `qrcode` 1.5.4 (SVG)
- Migrations: idempotent `.sql` under `server/migrations/`; schema rebuild via `npm run db:init`
- Entry: `server/src/index.ts` registers 17 route modules; CORS `origin: true, credentials: true`; SPA fallback for `web/dist/index.html`

**Distribution (deployed)**
- Self-hosted Docker stack — `Dockerfile` + `docker-compose.yml`
- Prod VPS: `npalakurla@192.168.50.13`, deployed at `/home/npalakurla/smartkanban`
- Public hostname: `https://kanban.npalakurla.com`

**CSS approach.** Tailwind utility-first with custom `theme.css` exposing CSS custom properties (`--canvas`, `--surface`, `--ink`, `--violet`, `--green-house`, `--lane-*`, etc.) — design tokens persist across light and dark mode via `[data-theme="dark"]`. Component utility classes: `.card-surface`, `.modal-surface`, `.modal-header-strip`, `.btn-pill*`, `.tag-pill`, `.input-pill`, `.fab`. Fonts: Inter (sans), Spectral (serif), JetBrains Mono (mono). Nunito Sans woff2 files in `public/fonts/` are legacy and unreferenced — DO NOT carry to macOS.

### 1.2 FULL SCREEN / PAGE INVENTORY (42 screens / 43 groups)

Verbatim group order from `FEATURE_PARITY_REGISTRY.md`. Sub-rows for modals/popovers nested.

| # | Screen / Group | Group ID range | Disposition (macOS) |
|---|---|---|---|
| 1 | Login / Register | F-001..F-018 | MVP — single sheet with mode toggle |
| 2 | Desktop App Shell (BoardHeader sticky) | F-019..F-040 | MVP — adapt to NSToolbar + NSMenu |
| 3 | Scope Switcher (Personal / Inbox / All / Shared) | F-041..F-049 | MVP — toolbar segmented control |
| 4 | Weather Widget (toolbar chip + 5-day popover) | F-050..F-061 | V1 — NSPopover |
| 5 | Notification Bell + Push (panel dropdown) | F-062..F-082 | MVP — NSPopover + local UN notification + WS-driven |
| 6 | Profile Dropdown (avatar + short_name + ▾) | F-083..F-090 | MVP — NSMenu under toolbar item |
| 7 | Activity Ticker (top-of-board marquee) | F-091..F-101 | V1 — Combine timer + horizontal scroll |
| 8 | Kanban Board (Board.tsx + Column.tsx DnD) | F-102..F-131 | MVP — LazyHGrid + NSItemProvider drag-drop |
| 9 | CardView tile (sticky-note rendering) | F-132..F-167 | MVP — SwiftUI view with attachments, badges, assignee initials |
| 10 | EditDialog (desktop card editor) | F-168..F-217 | MVP — NSWindow opened by `EditCardWindowController` |
|  ↳ | QR popover inside EditDialog | F-180..F-183 (subset) | V1 — `Image` from `/api/cards/:id/qr.svg` |
|  ↳ | Knowledge attach picker | F-188..F-195 | MVP |
|  ↳ | AI Insights panel embed | F-218..F-237 | MVP |
|  ↳ | Related cards section embed | F-238..F-249 | V1 |
|  ↳ | Card chain modal launch | F-217 | V1 — opens new NSWindow with NSViewRepresentable WebView for ReactFlow OR native graph (decision §3.7) |
| 11 | AI Insights panel (standalone behavior) | F-218..F-237 | MVP |
| 12 | Related Cards Section | F-238..F-249 | V1 |
| 13 | Card Chain Modal (graph) | F-250..F-262 | V1 — see §3.7 |
| 14 | Link Picker Dialog | F-263..F-272 | V1 — NSSheet attached to EditDialog window |
| 15 | Card Timeline (chat + activity collapsible) | F-273..F-294 | MVP |
| 16 | Chat Input (single-line @ai-aware) | F-295..F-301 | MVP |
| 17 | Knowledge View (list page) | F-302..F-318 | MVP — left NavigationSplitView sidebar |
| 18 | Knowledge Row | F-319..F-327 | MVP |
| 19 | Knowledge Edit Dialog | F-328..F-344 | MVP |
| 20 | Knowledge Detail Dialog | F-345..F-359 | MVP |
| 21 | Archive Dialog | F-360..F-378 | MVP — NSSheet |
| 22 | Weekly Review Dialog | F-379..F-389 | V1 — NSSheet |
| 23 | Capture Bar (FAB modal + composer) | F-390..F-411 | MVP — `⌘N` opens floating NSPanel |
| 24 | Settings Dialog (multi-section) | F-412..F-460 | MVP — replace with native Preferences window (`⌘,`) |
| 25 | Templates Tab (inside Settings) | F-461..F-481 | V1 — Preferences tab |
| 26 | Toast System (bottom-right stack) | F-482..F-487 | MVP — SwiftUI overlay |
| 27 | Login View | F-488..F-507 | MVP (duplicate of #1; registry numbers separately) |
| 28 | Mirror View (`/my-day` kiosk) | F-508..F-519 | V2 — separate Xcode target or `--kiosk` window mode |
| 29 | Mobile Shell (board) | F-520..F-555 | 🚫 — mobile-only; rejected for desktop |
| 30 | Mobile Card View (`/m/card/:id`) | F-556..F-588 | 🚫 — desktop opens EditDialog window |
| 31 | Mobile Card Actions Sheet | F-589..F-595 | 🚫 |
| 32 | Mobile Lane Picker Sheet | F-596..F-601 | 🚫 |
| 33 | Mobile Install Prompt | F-602..F-606 | 🚫 |
| 34 | Mobile Profile Menu | F-607..F-610 | 🚫 |
| 35 | Service Worker (PWA + push) | F-611..F-624 | 🚫 — replaced by UNUserNotificationCenter + WS |
| 36 | Keyboard Shortcuts | F-625..F-634 | MVP + EXPAND — native NSMenu shortcuts §3.4 |
| 37 | Paste / Drag / Routing Behaviors | F-635..F-651 | MVP — NSPasteboard + NSItemProvider |
| 38 | Telegram Integration (server-side) | F-652..F-676 | 🚫 — server-only |
| 39 | WebSocket Real-time | F-677..F-697 | MVP — `URLSessionWebSocketTask` |
| 40 | Search | F-698..F-704 | MVP — `⌘F` focuses toolbar field; live filter |
| 41 | Theme | F-705..F-712 | MVP — follow `NSApp.effectiveAppearance` + override in Preferences |
| 42 | Attachments | F-713..F-723 | MVP — drag-from-Finder + paste + Quick Look |
| 43 | Backend-only Routes (no UI) | F-724..F-735 | 🚫 — consumed via API client |

### 1.3 DATA MODELS

Authoritative shapes come from `server/src/cards.ts`, `web/src/types.ts`, and `server/schema.sql`. The macOS client mirrors them **verbatim** (Rule 2). Swift naming convention: snake_case JSON keys are mapped via `CodingKeys` to camelCase Swift properties.

**User** (`users` table; `/api/users`, `/api/auth/me`)
```
id: UUID, name: String, short_name: String (1..16), email: String
```
Used on: every authenticated screen.

**Card** (`cards` table + denormalized joins; `/api/cards`, `/api/cards/:id`)
```
id: UUID
title: String
description: String   // markdown-light; newlines preserved
status: enum { backlog, today, in_progress, done }
tags: [String]
due_date: ISO8601-date | null     // YYYY-MM-DD only; pg DATE
source: enum { manual, telegram, mirror }
position: Double                  // fractional, signed; new=min-1
archived: Bool
created_at: ISO8601-datetime
updated_at: ISO8601-datetime
created_by: UUID | null
ai_summarized: Bool
needs_review: Bool
project: String | null            // unused in current UI; persisted
assignees: [UUID]                 // wholesale-replaced on PATCH
shares: [UUID]                    // wholesale-replaced on PATCH
attachments: [Attachment]
```
Used on: Board, CardView, EditDialog, MobileCardView (out-of-scope macOS), Mirror.

**Attachment** (`card_attachments`)
```
id: UUID
kind: enum { audio, image, file }
storage_path: String   // resolved by api.attachmentUrl(path)
original_filename: String | null
created_at: ISO8601
```
Used on: EditDialog, CardView (image thumbnail strip).

**CardEvent** (`card_events`; `/api/cards/:id/events`, WS `card.message`, `card.ai_response`)
```
id: String                                  // BIGSERIAL stringified
actor_id: UUID | null
actor_name: String | null
card_id: UUID | null
action: String | null                       // e.g. 'create','update','restore','archive','attach','share'
details: { String: Any }                    // JSONB
entry_type: enum { system, message, ai, share }
content: String | null                      // message body
ai_suggestions: [AiSuggestion] | null
created_at: ISO8601
```
Used on: CardTimeline.

**AiSuggestion**
```
label: String
action: enum { update_status, set_due_date, assign_user, create_card }
params: { String: Any }
```
Used on: CardTimeline AI entry chips.

**Template** (`card_templates`; `/api/templates`)
```
id: UUID
owner_id: UUID
name: String                       // 1..40 non-whitespace, unique per owner (case-insensitive)
visibility: enum { private, shared }
title: String                      // ≤120
description: String
tags: [String]                     // ≤5 unique lowercased
status: Status                     // default 'today'
due_offset_days: Int | null        // 0..365 inclusive
created_at, updated_at
```
Used on: SettingsDialog → TemplatesTab, CaptureBar `/slash` shortcut, instantiation via `POST /api/templates/:id/instantiate`.

**KnowledgeItem** (`knowledge_items`; `/api/knowledge`)
```
id, owner_id
title: String (1..200)
title_auto: Bool                   // promotes to scraped title once on fetch
url: String | null                 // http/https only
body: String                       // ≤200_000 chars
tags: [String]                     // ≤10, ≤32 chars each, lowercased deduped
visibility: enum { private, inbox, shared }
source: enum { manual, telegram, share_target, from_card }
fetch_status: enum { pending, ok, failed, skipped } | null
fetch_error: String | null
fetched_at: ISO8601 | null
archived: Bool
created_at, updated_at
shares?: [UUID]
linked_card_ids?: [UUID]
```
Used on: KnowledgeView, KnowledgeRow, KnowledgeDetail, KnowledgeEditDialog, EditDialog (attach picker).

**Insight** (`ai_insights`; `/api/cards/:id/insights`)
```
id: UUID
card_id: UUID
requested_by: UUID
status: enum { pending, ok, failed }
summary: String | null              // ≤600 chars
body: { related_items?: [RelatedItem], web_findings?: [WebFinding], next_steps?: [String] } | null
error: String | null
degraded: Bool
created_at, completed_at
```
Used on: AiInsightsPanel, CardView (✨ snippet).

**CardLink** (`card_links`; `/api/cards/:id/links`)
```
id: UUID
from_card_id, to_card_id: UUID
label: enum { evolves_from, supersedes, split_from, related, inspired_by, duplicate_of }
note: String | null (≤500)
created_by, created_at
```
Used on: RelatedCardsSection, LinkPickerDialog, CardChainModal.

**Notification** (`notifications`; `/api/notifications`)
```
id: Int
user_id, card_id: UUID
event_id: Int           // FK to card_events.id
actor_name: String
preview: String         // ≤120 chars
read: Bool
created_at: ISO8601
```
Used on: NotificationBell.

**MirrorToken / ApiToken** (`mirror_tokens` with `scope`; `/api/mirror/tokens`, `/api/tokens`)
```
token: String (base64url 32-byte)
label: String
created_at: ISO8601
scope: enum { mirror, api }   // ApiToken always 'api'
url: String (response-only on create; e.g. /my-day?token=...)
```
Used on: SettingsDialog.

**TelegramIdentity** (`telegram_identities`; `/api/telegram/identities`)
```
telegram_user_id: Int64
app_user_id: UUID
telegram_username: String | null
```
Used on: SettingsDialog (Telegram section).

**ReviewData** (`/api/review`)
```
done:   ReviewRow[]      // status='done' AND updated_at > NOW()-7d
stale:  ReviewRow[]      // status in (today,in_progress) AND updated_at < NOW()-7d
stuck:  ReviewRow[]      // status='in_progress' AND updated_at < NOW()-3d
summary: String | null
```
`ReviewRow = { id, title, status, tags:[String], updated_at }`. Used on: WeeklyReview.

**WeatherData** (external Open-Meteo + ipapi.co; not server-mediated)
```
current: { temp: Double, code: Int, humidity: Double, wind: Double }
daily: [{ date: String, code: Int, max: Double, min: Double }]
```
Used on: WeatherWidget. Cache TTL 30 min; macOS persists in App Group container (V2) or UserDefaults (MVP). DO NOT store auth tokens here.

**Toast** (in-memory only)
```
id: String
type: enum { success, error, info }
message: String
```
TTL 4000 ms; max visible 5.

### 1.4 API ENDPOINTS (verbatim from server)

Sub-agent's full catalog reproduced. Each row carries: METHOD | PATH | AUTH | REQUEST | RESPONSE | NOTES. **Use this table as the Codable target (Rule 2 — mirror verbatim).** No nesting "for cleanliness" — match the server's envelope shape.

#### Auth
| Method | Path | Auth | Request | Response | Notes |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | none | `{name, short_name, email, password}` | `{id,name,short_name,email}` + Set-Cookie | `OPEN_SIGNUP=false` ⇒ 403 after first user. argon2id. First user inherits orphan cards. |
| POST | `/api/auth/login` | none | `{email, password}` | `{id,name,short_name,email}` + Set-Cookie | 401 invalid creds. Email lowercased+trimmed. |
| POST | `/api/auth/logout` | cookie | — | `{ok:true}` | Deletes session row + clears cookie. |
| GET | `/api/auth/me` | cookie | — | `{id,name,short_name,email}` | 401 if no/expired session — silent on macOS, do not toast. |
| PATCH | `/api/auth/me` | cookie | `{short_name?, name?}` | User | 400 if nothing to update or short_name out of 1..16. |
| GET | `/api/users` | cookie | — | `User[]` ordered by name | Household roster. |

#### Cards
| Method | Path | Auth | Request | Response | Notes |
|---|---|---|---|---|---|
| GET | `/api/cards?scope=` | cookie OR mirror-header | query `scope=personal\|inbox\|all\|shared`, `project?` | `Card[]` | Server-side visibility predicate; macOS must reproduce locally for optimistic UI. |
| GET | `/api/cards/archived` | cookie | — | `Card[]` (visibility-filtered) | ORDER updated_at DESC |
| GET | `/api/cards/:id` | cookie | — | `Card` | 404 invisible. |
| POST | `/api/cards` | cookie OR api-token | `{title (req), description?, status?, tags?, due_date?, assignees?, source?, project?}` | 201 `Card` | New position = min-1 for column. Broadcasts `card.created`. Default assignee = creator. |
| PATCH | `/api/cards/:id` | cookie OR api-token | Partial Card (whitelisted keys) | `Card` | Replaces assignees/shares wholesale. New shares ⇒ `share` event + notification. Broadcasts `card.updated`. |
| PATCH | `/api/cards/:id/restore` | cookie | — | `Card` | 404 if not archived. Broadcasts `card.updated`. |
| POST | `/api/cards/:id/activity` | api-token only | `{type, body, details?}` | 201 `{ok:true}` | For external integrations (not used by macOS app itself). |
| GET | `/api/cards/:id/knowledge` | cookie | — | `{items: KnowledgeItem[]}` | Visibility-filtered. |
| DELETE | `/api/cards/:id` | cookie | — | 204 | Soft archive. Broadcasts `card.deleted`. |
| DELETE | `/api/cards/:id/permanent` | cookie | — | 204 | Requires archived=true. Broadcasts `card.deleted`. |
| POST | `/api/cards/archived/purge` | cookie | — | `{deleted: Int}` | Bulk hard delete. Broadcasts per id. |
| POST | `/api/cards/:id/attachments` | cookie | multipart `file` (image) | 201 `Card` | MIME allowlist png/jpeg/webp/gif. `ATTACHMENT_MAX_BYTES` default 5MB. 415/413. |
| POST | `/api/cards/from-image` | cookie | multipart `file`, text `status?` | 201 `Card` | Generic title `Screenshot YYYY-MM-DD HH:MM`, needs_review=TRUE. If AI enabled: rewrites title+description, sets ai_summarized=true. |

#### Mirror / API Tokens
| Method | Path | Auth | Request | Response | Notes |
|---|---|---|---|---|---|
| POST | `/api/mirror/tokens` | cookie | `{label?}` | `{token, label, url}` | scope='mirror'. |
| GET | `/api/mirror/tokens` | cookie | — | `MirrorToken[]` | |
| DELETE | `/api/mirror/tokens/:token` | cookie | — | 204 | |
| POST | `/api/tokens` | cookie | `{label?}` | `{token, label, scope:'api'}` | One-time visibility. |
| GET | `/api/tokens` | cookie | — | `ApiToken[]` | |
| DELETE | `/api/tokens/:token` | cookie | — | 204 | |

#### Review / Telegram
| Method | Path | Auth | Request | Response | Notes |
|---|---|---|---|---|---|
| GET | `/api/review` | cookie | — | `ReviewData` | Week-window heuristics; summary best-effort AI. |
| POST | `/telegram/webhook/<secret>` | none (secret-in-path) | TG update JSON | grammy | 503 if bot off. Not used by macOS. |
| POST | `/api/telegram/link` | cookie | `{telegram_user_id, telegram_username?}` | `{ok:true}` | |
| GET | `/api/telegram/identities` | cookie | — | `TelegramIdentity[]` | |
| DELETE | `/api/telegram/identities/:id` | cookie | — | 204 | id = telegram_user_id |

#### Templates
| Method | Path | Auth | Request | Response | Notes |
|---|---|---|---|---|---|
| GET | `/api/templates` | cookie | — | `Template[]` | Owner-or-shared; shared first then by lower(name). |
| GET | `/api/templates/:id` | cookie | — | `Template` | |
| POST | `/api/templates` | cookie | `TemplateInput` | 201 `Template` | 409 on dup name. Broadcasts `template.created`. |
| PATCH | `/api/templates/:id` | cookie | Partial `TemplateInput` | `Template` | Owner-only. Broadcasts `template.updated`. |
| DELETE | `/api/templates/:id` | cookie | — | 204 | Owner-only. Broadcasts `template.deleted`. |
| POST | `/api/templates/:id/instantiate` | cookie | `{status_override?}` | 201 `Card` | Anchors due_date to start-of-UTC + offset. |

#### Knowledge
| Method | Path | Auth | Request | Response | Notes |
|---|---|---|---|---|---|
| GET | `/api/knowledge` | cookie | query `scope=mine\|inbox\|all`, `q?`, `tag?`, `limit?` (≤200, default 50), `cursor?` | `{items: KnowledgeItem[], next_cursor: String\|null}` | Cursor base64url-encoded `{u,i}` of `(updated_at,id) DESC`. |
| GET | `/api/knowledge/:id` | cookie | — | `KnowledgeItem` | |
| POST | `/api/knowledge` | cookie | `KnowledgeInput` | `KnowledgeItem` | Must have URL or body. URL http/https only. auto_fetch defaults true when URL+empty body. |
| PATCH | `/api/knowledge/:id` | cookie | `KnowledgePatch` | `KnowledgeItem` | Owner-only. |
| DELETE | `/api/knowledge/:id` | cookie | — | 204 | Soft archive. Owner-only. |
| POST | `/api/knowledge/:id/refetch` | cookie | — | `{queued:true}` | Owner-only; URL required. |
| POST | `/api/knowledge/:id/links` | cookie | `{card_id}` | 204 | Both ends visible. Broadcasts `knowledge.link.created`. |
| DELETE | `/api/knowledge/:id/links/:card_id` | cookie | — | 204 | |
| POST | `/api/knowledge/from-card/:card_id` | cookie | — | `KnowledgeItem` | Inbox visibility. Extracts first URL from description. Broadcasts `knowledge.created` + `knowledge.link.created`. |

#### Insights / Card Links / Chat / Notifications / Push / QR
| Method | Path | Auth | Request | Response | Notes |
|---|---|---|---|---|---|
| POST | `/api/cards/:id/insights/brainstorm` | cookie | — | 202 `{id, status:'pending'}` | 503 if AI off. 429 on rate limit (1/card, 5/user pending, 50/day). |
| GET | `/api/cards/:id/insights` | cookie | — | `{insights: Insight[]}` (≤10 DESC) | |
| GET | `/api/insights/:id` | cookie | — | `{insight: Insight}` | |
| POST | `/api/cards/:id/links` | cookie | `{to_card_id, label, note?}` | 201 `{link}` | 409 dup; no self-link. |
| DELETE | `/api/cards/:id/links/:linkId` | cookie | — | 204 | |
| GET | `/api/cards/:id/links` | cookie | — | `{links: CardLink[], related_cards: Card[]}` | |
| GET | `/api/cards/:id/chain?depth=` | cookie | `depth?` 1..6 (default 2) | `{nodes: Card[], edges: CardLink[], insights: Insight[]}` | BFS either direction. |
| GET | `/api/cards/:id/events` | cookie | — | `CardEvent[]` ASC | |
| POST | `/api/cards/:id/messages` | cookie | `{content (1..2000)}` | 201 `CardEvent` (entry_type='message') | Broadcasts `card.message`. Notification fan-out. Triggers `@ai` if mentioned. |
| PUT | `/api/cards/:id/events/read` | cookie | `{last_read_id}` | 204 | Monotonic — server takes GREATEST. |
| GET | `/api/messages/unread` | cookie | — | `{cardId: count}` | |
| GET | `/api/notifications` | cookie | — | `Notification[]` (last 100) | |
| PUT | `/api/notifications/read` | cookie | `{ids:[Int]}` | 204 | |
| PUT | `/api/notifications/read-all` | cookie | — | 204 | |
| POST | `/api/push/subscribe` | cookie | `{endpoint, p256dh, auth}` | 204 | macOS MVP: skip — replaced by WS-driven `UNNotificationRequest`. |
| DELETE | `/api/push/subscribe` | cookie | `{endpoint}` | 204 | |
| GET | `/api/push/vapid-public-key` | none | — | `{publicKey}` | 404 if VAPID not configured. |
| GET | `/api/cards/:id/qr.svg` | cookie | — | `image/svg+xml` (256px) | Encodes `${APP_URL}/m/card/:id`. cache 5min. |

#### Attachments static
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/attachments/*` | cookie OR mirror-header | Authenticated static — auth REQUIRED for image download. macOS must attach `Cookie` header to `URLSession.shared` data tasks; never embed in `<img>` outside the app's session. |

### 1.5 STATE MANAGEMENT (web app, for reference)

**Global state:** none beyond React Context (`AuthProvider` in `web/src/auth.tsx`, `ToastProvider` in `web/src/hooks/useToast.ts`). Everything else is local `useState`.

**Server state cache:** module-level singleton caches in hooks (`useTemplates`, `useKnowledge`, `useInsights`, `useCardLinks`) — single key per cache, no library (no React Query). Hook subscribers register via `Set<() => void>`; cache mutates and notifies on WS events via `applyXEvent` helpers.

**Form state:** local `useState` in dialogs. Debounced patch on text inputs (500–800 ms in `MobileCardView`; sync on commit elsewhere). Optimistic updates everywhere — server reconcile on WS broadcast.

**Persistence:** `localStorage` keys — `theme` (light/dark/system), `install-dismissed` (PWA banner), `weather_cache` (30 min TTL). Auth state lives in HttpOnly cookie — JS cannot read it.

**macOS port mapping (§5.6):** Auth + token in Keychain; theme + last-scope + last-search in UserDefaults; `Card[]`, `Notification[]`, `KnowledgeItem[]`, `Template[]`, `Insight[]`, `CardLink[]` in `@MainActor` observable stores (`@Observable` / `ObservableObject`); WS event dispatcher routes broadcasts into those stores.

### 1.6 AUTHENTICATION FLOW

**Web app sequence**
1. App mounts → `api.me()` GET `/api/auth/me` with `credentials:'include'`.
2. If 200 → store user, render `<Authed/>`. If 401 → render `<LoginView/>`.
3. Login form → `POST /api/auth/login {email,password}` → sets HttpOnly `kanban_session` cookie (SameSite=Lax; Secure when APP_URL is https). 30-day TTL.
4. Register form → `POST /api/auth/register {name, short_name, email, password}` — also sets cookie. Disabled when `OPEN_SIGNUP=false` AND users exist.
5. Logout → `POST /api/auth/logout` clears cookie + deletes session row.
6. Refresh: none. Session is opaque token in DB; expires_at checked per request.
7. Protected routes: SPA-level. Server enforces cookie on every API route via `requireUser` / `requireUserOrApiToken` / `requireUserOrMirror`.
8. WebSocket auth: server reads cookie OR `?mirror=<token>` query at handshake; closes 4401 on failure.
9. Mirror kiosk: `/my-day?token=...` — token-only auth; sends `x-mirror-token` header on every fetch and `?mirror=` on WS.
10. API tokens: Bearer header `Authorization: Bearer <token>`; allowed for `POST /api/cards`, `PATCH /api/cards/:id`, `POST /api/cards/:id/activity`.

**macOS port**
- Cookie storage: `URLSession`'s default `HTTPCookieStorage` (per-app, persisted across launches via `URLCredentialStorage` does NOT apply; cookies persist to `~/Library/Cookies/...` automatically). The session cookie itself never lives in code.
- BACKUP token: also store `kanban_session` value in Keychain (`kSecAttrAccount=kanban_session`, `kSecAttrService=com.kanbanclaude.kanbanclaude`) so a `URLSession` reset or cookie purge can recover. On launch: if Keychain has token but cookie store empty, inject via `HTTPCookie(properties:)`.
- Login: `LoginWindowController` shown when `api.me()` returns 401 OR is unreachable for >5 s with no cached user.
- Cold-start optimization: cache last-seen `User` JSON in UserDefaults (NON-sensitive; user.id only); skip the login window flash for ≤300 ms while `api.me()` validates.
- `requireUserOrMirror` macOS path: not used; mirror tokens are administrative artifacts only.
- API tokens: macOS exposes them in Preferences exactly like the web; the user copies them to clipboard for third-party use.

### 1.7 BUSINESS RULES & DOMAIN LOGIC

Distilled from `cards.ts`, `routes/*.ts`, `ws.ts`, `notifications.ts`, `knowledge.ts`, `templates.ts`, `card_links.ts`, `insights.ts`, `knowledge_fetch.ts`. **Source of truth for macOS optimistic UI.**

1. **Card visibility predicate** — a card is visible to user U iff `(card.created_by == U) OR (U ∈ assignees) OR (U ∈ shares) OR (assignees.isEmpty)`. Family Inbox = unassigned, visible to whole household. The macOS WS reconciler MUST reproduce this client-side.
2. **Position rebalancing** — new cards go to `MIN(position) - 1` for the destination column. Drag-to-position computes midpoint between neighbors. No server-side periodic rebalance — positions are signed Doubles and drift slowly. After ~1000 drags within a column, client should detect overlap (`abs(prev-next) < 1e-9`) and request a server-side normalize (NOT IMPLEMENTED — log to console and skip).
3. **Archive semantics** — `DELETE /api/cards/:id` is SOFT archive (`archived=TRUE`); reversible via `/restore`. Permanent delete requires archived=TRUE first. Cascade FK deletes events, assignees, shares, attachments.
4. **Activity log** — every mutation logs to `card_events` via `logActivity(actor, card, action, details)`. Actions: `create`, `update` (with `changed: [keys]`), `restore`, `archive`, `attach`, `share`, `template_instantiate`. Entry types: `system|message|ai|share`.
5. **Chat fan-out** — `POST /messages` notifies (assignees ∪ prior message participants) − actor. Each gets a row in `notifications` table + a web-push to every endpoint in `push_subscriptions` for that user. Preview truncated to 120 chars. **macOS MVP:** receive `card.message` over WS, post local `UNNotificationRequest`; skip server push subscription.
6. **`@ai` mention** — regex `/(?:^|\s)@ai(?:\s|$)/i` in message body. Triggers `processCardChatAI()` async. AI response arrives as `card.ai_response` WS event with an `ai_suggestions` array. UI renders chips per suggestion; clicking apply triggers the corresponding `PATCH /api/cards/:id` or `POST /api/cards`.
7. **Unread count** — events with `entry_type ∈ {message, ai}`, `actor_id != me OR null`, `id > last_read_id` (from `card_event_reads`). `mark-read` is monotonic (GREATEST). macOS must NOT decrement on local optimistic clears — wait for server's 204.
8. **Image-only attachments** — `png|jpeg|webp|gif`. 5 MB cap (`ATTACHMENT_MAX_BYTES`). macOS drag-from-Finder must filter via NSItemProvider `UTType.image` conformance; reject early with toast.
9. **Vision card creation (`/cards/from-image`)** — needs_review=true initially, generic title "Screenshot YYYY-MM-DD HH:MM". If AI enabled and `summarizeImage()` returns ok, server rewrites title (≤500 chars) + description, sets `ai_summarized=true`, clears `needs_review`. macOS shows the temp card in Today immediately (optimistic), then patches via `card.updated` WS event.
10. **Insight (brainstorm) lifecycle** — `pending → ok | failed`. `degraded` when no web search (Tavily missing). Rate limits: 1 pending per card, 5 pending per user, 50/day per user (429 if exceeded). Recovery on server restart: insights pending >1h marked failed; younger ones re-enqueued. WS events `insight.queued/updated/failed` go ONLY to requester or card owner.
11. **Knowledge auto-fetch** — triggered on create when URL present and `fetch_status='pending'` (default). SSRF protection blocks private IPs, loopback, link-local. Timeout 10 s. Max body 5 MiB. Only `text/html` or `application/xhtml`. Mozilla Readability extracts title + body; falls back to first 50k chars. On success, broadcasts `knowledge.updated`; client must merge.
12. **Knowledge visibility** — `private` (owner only), `inbox` (whole household — read-only to non-owners), `shared` (explicit user list). WS `knowledge.*` events filter per-client.
13. **Card links** — 6 labels (`evolves_from`, `supersedes`, `split_from`, `related`, `inspired_by`, `duplicate_of`). Note ≤500. No self-links. Unique `(from, to, label)` — 409 on dup. Chain BFS walks either direction up to depth 6.
14. **Templates** — name regex `/^\S(?:.{0,38}\S)?$/` (1–40 non-WS), unique per owner case-insensitively. Tags max 5 lowercased. due_offset_days 0–365 inclusive or null. Instantiation due_date anchored to **start of UTC day** + offset (server-clock authoritative — macOS UI must show in local time but persist exact server value).
15. **First-user bootstrap** — register #1 inherits all `created_by IS NULL` cards as creator + becomes assignee of every non-archived card. Schema migration affordance. macOS app should not assume this on subsequent registrations.
16. **Mirror tokens** — read-only-ish; `x-mirror-token` header for HTTP, `?mirror=` query for WS. macOS does NOT use these — administrative only.
17. **API tokens** — Bearer; one-time visibility on create. Scope=`api`. Used by external integrations (n8n, CLI agents). macOS exposes CRUD; does not auth its own requests with them.
18. **Cookie security** — `httpOnly`, `sameSite=lax`, `secure` derived from `APP_URL` https. 30-day maxAge. Override via `COOKIE_SECURE`. macOS must accept https from `kanban.npalakurla.com` — pin TLS cert via `URLSessionDelegate` is OPTIONAL (V2).
19. **Server-clock skew** — frontend reads `Date` header on every response and updates `serverClockSkewMs` (`api.ts`). Used for ActivityTicker's "X minutes ago". macOS must port this — store `Date` skew in `APIClient` and use `Date(timeIntervalSinceNow:)` corrected.
20. **Postgres UUID coercion** — server-wide error handler converts `22P02 invalid_text_representation` (malformed UUID in path) to 404. macOS regex-validates UUIDs before any URL build (Rule 1 — 8-4-4-4-12 hex) to avoid 404s from typos.

### 1.8 COMPLEXITY FLAGS FOR DESKTOP PORTING

| # | Feature | Why complex on macOS | Resolution sketch |
|---|---|---|---|
| C1 | Drag-and-drop with fractional position math | `@dnd-kit` handles pointer activation, collision detection, sortable transforms. macOS needs `NSItemProvider` + `.onDrag/.onDrop` SwiftUI modifiers + manual midpoint calculation. | Build a `DragController` actor that owns active drag id + computes target position; thin `.draggable(_:)` views feed it. Test path: drag 100 cards across all columns in random order; verify positions strictly increase. |
| C2 | WebSocket reconciliation with optimistic UI | Web app applies WS events through `applyXEvent` helpers + per-store caches. Order matters: optimistic insert + WS broadcast race. | Single dispatcher actor; reducer pattern. Drop WS events older than last local optimistic mutation by tagging client-origin events with a nonce ignored on broadcast. |
| C3 | Paste-to-attach (clipboard image → upload) | Web uses `document.addEventListener('paste')`. macOS uses NSPasteboard + `NSPasteboardTypePNG` etc. Modifier-key paste (⌘V vs ⇧⌘V) must distinguish "paste into description" vs "attach image". | Handle in EditCardWindow's First Responder chain. ⌘V into text field = normal paste; ⌘V outside any text field = attach. Implement via `paste(_:)` action method on the window controller. |
| C4 | Card Chain modal (ReactFlow graph) | Web uses ReactFlow 11.11.4 — declarative React-driven SVG graph with zoom/pan/fit. No drop-in macOS equivalent. | V1 decision (§3.7): native graph using `Canvas` + manual layout (force-directed, light), OR a hosted `WKWebView` loading a stripped-down ReactFlow page hitting `/api/cards/:id/chain`. Prefer native; document fallback. |
| C5 | Knowledge auto-fetch progress UI | Server-side async with `fetch_status` polling via WS broadcast. | `knowledge.updated` WS event already carries `fetch_status`; UI renders ⏳ → ✓ / ⚠ chip with tooltip. Same as web — no additional macOS work. |
| C6 | AI Insights polling + WS race | `insight.queued` arrives before client POST returns (race). | POST returns insight id; immediately register in pending map; WS `insight.updated/failed` resolves it. Server already filters WS to requester. |
| C7 | Markdown-light description rendering | Description is plain text with newline preservation (`whitespace-pre-wrap` in CSS). | SwiftUI `Text(_).fixedSize(horizontal: false, vertical: true)`. Do not parse Markdown — server doesn't render Markdown either. |
| C8 | QR code rendering | Server returns SVG. SwiftUI cannot render arbitrary SVG natively. | (a) Use server SVG inside `NSViewRepresentable` hosting `WKWebView` for the popover only, OR (b) generate QR client-side via `CIQRCodeGenerator` from the deep-link URL — saves a round-trip. Lock (b) for MVP; QR text matches server algorithm (`${APP_URL}/m/card/<id>`). |
| C9 | Per-attachment authenticated fetch | `/attachments/*` requires the session cookie. SwiftUI `AsyncImage` does not attach cookies by default. | Custom `AuthenticatedImage` view that uses `URLSession.shared.dataTask` with the app's cookie store; caches `NSImage` via `NSCache<NSURL, NSImage>` keyed on storage_path. |
| C10 | Theme follow-system + override | Web uses `localStorage['theme'] + matchMedia('(prefers-color-scheme: dark)')`. | macOS uses `NSApp.appearance = NSAppearance(named:)` with `.aqua / .darkAqua / nil`. Persist in UserDefaults as `'light' \| 'dark' \| 'system'`; `nil` lets the OS pick. |
| C11 | Live-search input filter at 60fps | Web debounces by re-render; 200ms perceived. | SwiftUI `.searchable(text:)` with `searchSuggestions:` empty; throttle in `Combine` via `.debounce(0.1, scheduler: .main)`. |
| C12 | Document-level `paste` listener interfering with form inputs | Web has special-case "if editing dialog open, attach to that card else create from image". | Mirror: First Responder chain priority — if NSTextView/NSTextField is first responder, default paste; otherwise route to attach. |
| C13 | Optimistic + WS reconcile for unread counts | Web simply increments local counts on WS message + clears on `markRead`. | Maintain a `[CardID: Int]` dictionary on the main actor; on WS `card.message`/`card.ai_response` increment if card !== open editing card; on `markRead` clear. |
| C14 | Cross-window state sharing (multi-window) | macOS allows multiple cards open simultaneously. Each must subscribe to its card's WS events. | Shared `CardStore` singleton; child `CardEditorViewModel` reads by id and subscribes. |

### 1.9 ASSETS INVENTORY

**Fonts** (`web/index.html` + `web/public/fonts/`)
- Inter (sans) — primary UI font; Google Fonts CDN
- Spectral (serif) — Knowledge title rare use; Google Fonts CDN
- JetBrains Mono — code blocks; Google Fonts CDN
- Kalam (script) — Telegram bot-attribution caption; Google Fonts CDN (`font-script` class)
- Iowan Old Style — Weekly Review serif moment; system fallback
- Nunito Sans 400/600/700 woff2 — LEGACY, unreferenced; DO NOT bundle to macOS

macOS strategy: bundle Inter, Spectral, JetBrains Mono as `.ttf` resources inside the app bundle (offline-first). Optional Kalam for telegram attribution UI. Fall back to system SF Pro if any are missing.

**Icons / glyphs**
- Web uses inline emoji and `<svg>` icons (no icon library). Locations: `BoardHeader.tsx` (✦, ⚙, ▾), `EditDialog.tsx` (🧬, 📱), `CaptureBar.tsx` (📷, ✱, 🎙️, →), `CardView.tsx` (💬), `KnowledgeRow.tsx` (🔒, 📥, 👥, ⏳, ⚠), `MobileMore.tsx` etc.
- App icon: NO ASSET FOUND in `web/public/`. Manifest references `/icon-192.png` and `/icon-512.png` — not present in repo. macOS must source new app icon (1024×1024 master in `Assets.xcassets/AppIcon.appiconset/`).
- Brand: violet "K" square — see `BoardHeader.tsx` F-020. Replicate as inline SwiftUI shape.
- macOS strategy: SF Symbols where possible (`magnifyingglass`, `gearshape`, `bell`, `sparkles`, `link.circle`, `archivebox`, `trash`, `paperplane`, `paperclip`, `qrcode`, `eye`, `eye.slash`). Emoji glyphs preserved verbatim where they convey product identity (🤔 Brainstorm, 🧬 Chain, ✨ insight chip).

**Images**
- `docs/screenshot.png` — README header; not for runtime.
- `web/public/icon-192.png`, `icon-512.png` — declared in manifest, missing from repo. macOS does not need them — uses its own `AppIcon.appiconset`.
- No other static images; all attachments are user-uploaded under `data/attachments/`.

**Sounds**
- NONE. App is silent. macOS should follow — no notification sounds beyond OS default. (V2 could opt-in to a sound for `@ai` mentions.)

**Color tokens** — see §3.1 for the verbatim palette extraction from `web/src/theme.css`.

---

## 2. PRODUCT STRATEGY

### 2.1 PLATFORM DECISION

**Locked target.** macOS 13.3 Ventura+ on Apple Silicon (M1/M2/M3/M4) — single architecture **arm64**. Intel x86_64 is a STRETCH goal for V2; build settings will produce a universal binary if and only if zero Swift Concurrency regressions appear under Rosetta in QA Phase 9.

**Distribution channel.** Direct DMG via `git releases` on the project repo or a side-loaded URL. App is **ad-hoc-signed** (`codesign --sign -`) for local install. Users must run `xattr -cr /Applications/KanbanClaude.app` once to bypass Gatekeeper quarantine. A one-liner installer script is published alongside the DMG. **No Mac App Store** (would require Apple Developer Program + sandbox redesign of file/Keychain access). **No notarization** for MVP (V2 once Developer ID is procured).

**App type.** **Both.** Primary is a **standard window app** with a custom NSToolbar + standard traffic-light controls. Secondary is an always-running **NSStatusItem (menubar extra)** that shows the unread count + a "New Card…" `⌘N` menu item even when the main window is closed. Background lifecycle: app stays alive in menubar after window close; quit only via `⌘Q` or Dock right-click. WS connection persists in background so notifications keep firing.

**Activation policy.** `NSApplication.shared.setActivationPolicy(.regular)` while main window open. Optionally `.accessory` (no Dock icon, menubar only) toggle in Preferences for users who want a tray-only mode. MVP ships `.regular` default; menubar toggle is V1.

### 2.2 FEATURE PARITY MATRIX

Per-screen dispositions for macOS. Status legend:
- ✅ Implement to web parity
- 🔄 Adapt: implement equivalent function with a native idiom (justification REQUIRED in §2 of registry)
- 🚫 Out of scope (justification REQUIRED)
- ⏳ Deferred to V1 / V2

| Screen / Group | F-IDs | macOS MVP | V1 | V2 | Reason |
|---|---|---|---|---|---|
| Login / Register | F-001..F-018 | ✅ | — | — | Required to enter the app. |
| Desktop App Shell (header) | F-019..F-040 | 🔄 NSToolbar + NSMenu | — | — | NSMenu replaces in-app dropdowns; titlebar replaces sticky header bar. |
| Scope Switcher | F-041..F-049 | ✅ as toolbar segmented control | — | — | |
| Weather Widget | F-050..F-061 | ⏳ | ✅ NSPopover | — | Cosmetic; non-blocking. |
| Notification Bell + Push | F-062..F-082 | 🔄 NSPopover + UNNotificationCenter (no VAPID) | ⏳ APNs bridge | — | macOS native cannot consume VAPID directly. |
| Profile Dropdown | F-083..F-090 | 🔄 NSMenu under toolbar | — | — | |
| Activity Ticker | F-091..F-101 | ⏳ | ✅ Combine timer + ScrollView | — | Cosmetic. |
| Kanban Board (DnD) | F-102..F-131 | ✅ | — | — | Core. |
| CardView tile | F-132..F-167 | ✅ | — | — | Core. |
| EditDialog | F-168..F-217 | ✅ as NSWindow (own window, not sheet) | — | — | Multi-window desktop pattern. |
| AI Insights panel | F-218..F-237 | ✅ | — | — | |
| Related Cards Section | F-238..F-249 | ⏳ | ✅ | — | |
| Card Chain Modal | F-250..F-262 | ⏳ | ✅ native graph (§3.7) | — | Complex SVG-graph port. |
| Link Picker Dialog | F-263..F-272 | ⏳ | ✅ NSSheet attached to EditWindow | — | |
| Card Timeline | F-273..F-294 | ✅ | — | — | |
| Chat Input | F-295..F-301 | ✅ | — | — | |
| Knowledge View | F-302..F-318 | ✅ | — | — | |
| Knowledge Row | F-319..F-327 | ✅ | — | — | |
| Knowledge Edit Dialog | F-328..F-344 | ✅ | — | — | |
| Knowledge Detail Dialog | F-345..F-359 | ✅ | — | — | |
| Archive Dialog | F-360..F-378 | ✅ NSSheet | — | — | |
| Weekly Review Dialog | F-379..F-389 | ⏳ | ✅ NSSheet | — | |
| Capture Bar | F-390..F-411 | ✅ as floating NSPanel `⌘N` | — | — | Replaces FAB. |
| Settings Dialog | F-412..F-460 | 🔄 native Preferences window `⌘,` | — | — | macOS HIG. |
| Templates Tab | F-461..F-481 | ⏳ | ✅ Preferences sub-tab | — | |
| Toast System | F-482..F-487 | ✅ SwiftUI overlay | — | — | |
| Login View | F-488..F-507 | ✅ (same as #1) | — | — | |
| Mirror View | F-508..F-519 | ⏳ | ⏳ | ✅ separate `.kiosk` window mode | Kiosk niche. |
| Mobile Shell + sub-views | F-520..F-610 | 🚫 | 🚫 | 🚫 | Desktop has Board; phone form factor irrelevant. |
| Service Worker | F-611..F-624 | 🚫 | 🚫 | 🚫 | Replaced by WS + UNNotificationCenter. |
| Keyboard Shortcuts | F-625..F-634 | ✅ + EXTRA (§3.4) | — | — | Native NSMenu gives ALL shortcuts. |
| Paste / Drag / Routing | F-635..F-651 | ✅ | — | — | NSPasteboard + URL scheme `kanbanclaude://card/<uuid>`. |
| Telegram Integration | F-652..F-676 | 🚫 | 🚫 | 🚫 | Server-only; macOS app exposes identity admin in Preferences (F-455..F-460 only). |
| WebSocket Real-time | F-677..F-697 | ✅ | — | — | Core. |
| Search | F-698..F-704 | ✅ `⌘F` + toolbar search field | — | — | |
| Theme | F-705..F-712 | ✅ system follow + override | — | — | |
| Attachments | F-713..F-723 | ✅ + drag-from-Finder + Quick Look | — | — | Native upgrade. |
| Backend-only routes | F-724..F-735 | 🚫 | — | — | Consumed via API client. |

**Tally**
- MVP: 28 screens / groups ✅ or 🔄
- V1 additions: 8 screens / groups
- V2: 1 screen (Mirror)
- Out of scope: 9 screens / groups (mobile-only + server-side)

### 2.3 DESKTOP-EXCLUSIVE FEATURES (new capabilities not in web)

These are NEW affordances macOS unlocks. Listed in implementation order (Phase numbers reference §5.8).

| ID | Capability | macOS API | Phase | MVP/V1 |
|---|---|---|---|---|
| D-01 | Top-of-screen application menu | NSMenu / SwiftUI `.commands {}` | 2 | MVP |
| D-02 | Native traffic-light window controls + unified titlebar | NSWindow.styleMask `.unifiedTitleAndToolbar` | 2 | MVP |
| D-03 | NSToolbar with vibrancy | NSToolbar + `NSVisualEffectView` | 2 | MVP |
| D-04 | Global keyboard shortcuts (`⌘N`, `⌘F`, `⌘1..⌘4`, `⌘E`, `⌘B`, `⌘,`, `⌘W`, `⌘Q`, etc.) | NSMenu key equivalents + `NSEvent.addLocalMonitorForEvents` | 2 | MVP |
| D-05 | Menubar extra (NSStatusItem) with unread badge | NSStatusBar.system.statusItem | 7 | MVP |
| D-06 | Multi-window: open N EditDialogs simultaneously | NSWindowController per card; `Window` scene with `id:` | 5 | MVP |
| D-07 | Window autosave (size + position per window) | NSWindow.setFrameAutosaveName | 5 | MVP |
| D-08 | NSPopover for transient panels (notification, weather, profile) | NSPopover via `popover(isPresented:)` | 4 | MVP |
| D-09 | Drag-from-Finder to attach files | NSItemProvider + `.onDrop(of: [.image])` | 6 | MVP |
| D-10 | Drag a card OUT (as `.url` deep link) for cross-app sharing | `.draggable { card.deepLinkURL }` | 6 | V1 |
| D-11 | Paste image from clipboard (⌘V outside text field) | NSPasteboard + `paste(_:)` action method | 6 | MVP |
| D-12 | Quick Look attachment preview (`Spacebar` on selected attachment) | QLPreviewPanel + `QLPreviewPanelDataSource` | 6 | V1 |
| D-13 | URL scheme handler `kanbanclaude://card/<uuid>` | LSHandlerInfo in `Info.plist` + `NSAppleEventManager` | 7 | MVP |
| D-14 | Open/Save panels for explicit file pick | NSOpenPanel | 6 | MVP |
| D-15 | Notification Center via `UNUserNotificationCenter` | UserNotifications.framework | 5 | MVP |
| D-16 | Dock badge count (unread notifications) | NSApp.dockTile.badgeLabel | 7 | MVP |
| D-17 | Spotlight indexing of cards | CSSearchableItem + CSSearchableIndex | 9 | V2 |
| D-18 | Share extension (target type: any) | Share Extension target in Xcode | 9 | V2 |
| D-19 | Continuity Camera (insert from iPhone) | NSImage from continuity drag | 8 | V2 |
| D-20 | System Services menu entry "Add to SmartKanban" | NSServicesMenuRequestor | 9 | V2 |
| D-21 | App Intents (Siri / Shortcuts.app) | AppIntent framework | 9 | V2 |
| D-22 | Touch Bar items (legacy MBP only) | NSTouchBar | — | OUT |
| D-23 | Resume state on relaunch (restore open windows) | NSWindow.restorationClass | 5 | MVP |
| D-24 | Sleep/wake handling — reconnect WS | NSWorkspace.didWakeNotification | 5 | MVP |
| D-25 | Right-click context menu on card | `.contextMenu {}` | 3 | MVP |

### 2.4 MVP SCOPE — exact v1.0 feature set

A user installs the DMG, copies the app, runs the `xattr` line, opens the app, logs in, and can:
1. **See the four-column board** for `personal` scope; cards live-sync from the server via WS.
2. **Switch scopes** Personal / Inbox / All / Shared via toolbar segmented control or `⌘1..⌘4` (overrides column-scroll? — NO: scope is `⌘P / ⌘I / ⌘A / ⌘S`; `⌘1..⌘4` scrolls to columns).
3. **Filter cards** via `⌘F` toolbar search; live filter at 60fps.
4. **Create a card** via `⌘N` → floating NSPanel "Capture" — text, paste image, or `/template-name` slash command.
5. **Drag-and-drop** cards across columns and within a column. Drop on trash zone (only visible while dragging) to archive.
6. **Open a card** by clicking — opens its own NSWindow (multi-window). `⌘W` closes. Edit title/description/tags/due/assignees/shares. `⌘S` saves. `⌘E` enters Edit mode (focuses title).
7. **Paste an image** with `⌘V` while a card window is focused → attaches to that card. With main board focused but no card open → creates a new card from image (`/api/cards/from-image`).
8. **Drag a file from Finder** onto a card window → attaches if image-MIME. Drag onto Board → creates from image.
9. **Right-click any card** for `Move to → (Backlog/Today/In Progress/Done)`, `Archive`, `Copy link`, `Open in new window`.
10. **AI Brainstorm** a card via `⌘B` or the AI Insights panel. Result arrives via WS within ~30 s; chips render in the side panel.
11. **Chat on a card** in the timeline; `@ai` mention triggers a server-side AI reply with apply chips.
12. **Browse Knowledge** in a sidebar nav (toolbar tab); search via `⌘F`; create/edit/archive items.
13. **See notifications** — bell NSPopover; Notification Center pops for new card messages while WS is connected and the relevant card window is not focused. Dock badge shows total unread.
14. **Archive panel** — list, restore, permanent delete, bulk purge.
15. **Theme** — auto-follow system; override in Preferences.
16. **Preferences** — `⌘,` — display name, theme, mirror tokens, API tokens, Telegram identity admin.
17. **Logout** — File → Sign Out → returns to LoginWindow.
18. **Menubar extra** — shows unread count badge; `⌘N` shortcut works globally even with main window closed.
19. **Quit** — `⌘Q`. Restart restores last-open card windows.
20. **Sleep/wake** — WS auto-reconnects (Combine retry with 500ms→10s backoff, identical to `web/src/ws.ts`).

### 2.5 USER JOURNEY MAPS

#### Journey 1 — Cold start to Board (≤2.0 s on M1)
1. User clicks dock icon. NSApp launches. (200 ms)
2. App reads Keychain token + cached `User` from UserDefaults. (50 ms)
3. MainWindow shows skeleton Board immediately. (50 ms)
4. `URLSessionWebSocketTask` opens `wss://kanban.npalakurla.com/ws`. Handshake completes. (handshake ≤800 ms target)
5. `GET /api/cards?scope=personal` fires in parallel with WS handshake. (≤500 ms typical on broadband)
6. JSON decodes (`Card[]`), populates `CardStore`. SwiftUI re-renders the 4 lanes. (50 ms)
7. Done. ≤2.0 s end-to-end target.

#### Journey 2 — Capture card via `⌘N` (≤4 s)
1. User presses `⌘N` from anywhere (board OR menubar). (instant)
2. Floating NSPanel opens — focuses Title field. (≤250 ms)
3. User types "Buy eggs". (≤2 s typing)
4. User presses Enter. (instant)
5. `POST /api/cards` fires; optimistic insert pushes card to top of Today (default lane). Panel dismisses. Toast "Card created" shows for 4 s. (≤200 ms RTT)
6. WS `card.created` arrives, reconciles. (≤500 ms)
7. Done. ≤4 s capture.

#### Journey 3 — Paste screenshot from clipboard → AI titles it
1. User screenshots something (`⌘⇧4` system shortcut). macOS puts PNG on pasteboard. (1 s)
2. User clicks SmartKanban dock icon. (200 ms)
3. User presses `⌘V` with main board focused. (instant)
4. App detects NSPasteboard has PNG; POST `/api/cards/from-image` with multipart body. (300–500 ms)
5. Optimistic card with generic "Screenshot YYYY-MM-DD HH:MM" appears in Today, needs_review badge on. (50 ms)
6. ≤8 s later, WS `card.updated` arrives with AI-rewritten title + description; needs_review cleared; sparkle badge shows.
7. Done. ≤8 s photo e2e.

#### Journey 4 — Move card via drag (optimistic ≤500 ms; reconcile ≤1.5 s)
1. User mouses down on card tile. dnd activation distance = 4 px.
2. NSCursor changes; ghost view follows pointer.
3. User releases over `In Progress` lane.
4. Optimistic state update: card moves immediately. PATCH `/api/cards/:id` `{status:'in_progress', position:<midpoint>}` fires.
5. WS `card.updated` echoes back to all clients. Local store reconciles (idempotent — server's payload becomes truth).
6. Done. Visual update ≤500 ms. Round-trip ≤1.5 s.

#### Journey 5 — Notification tap opens card window (≤2 s push-to-visible)
1. Coworker posts a message on a shared card.
2. Server fans out: notification row in DB + WS broadcast `card.message` to all visible clients.
3. macOS app's WS reader receives event. If the relevant card window is NOT focused, posts a local `UNNotificationRequest` with `userInfo: { cardId, eventId }`.
4. macOS Notification Center shows banner. (≤500 ms after server broadcast)
5. User clicks banner. `UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:)` extracts cardId.
6. App opens EditCardWindow for that card. ⌃ mark messages read. (≤500 ms)
7. Done. ≤2 s push-to-visible.

#### Journey 6 — Brainstorm a stale card (`⌘B`; ≤30 s)
1. User opens a card. Card window focused.
2. User presses `⌘B` (or clicks "🤔 Brainstorm" in AI Insights panel).
3. POST `/api/cards/:id/insights/brainstorm` fires. Returns 202 `{id, status:'pending'}` within 200 ms.
4. AI Insights panel shows "Pending…" spinner.
5. WS `insight.queued` arrives almost instantly.
6. Background pipeline runs (Tavily search + local FTS + LLM synthesis). Default `BRAINSTORM_TIMEOUT_MS=30_000`.
7. WS `insight.updated` (status=ok) OR `insight.failed`. Panel renders summary + related_items + web_findings + next_steps.
8. Done. ≤30 s wall-clock.

### 2.6 ACCEPTANCE CRITERIA (≥12 binary pass/fail)

Reviewer (S7 §4) treats unchecked items as veto blockers.

1. **AC-01** App launches on macOS 13.3 / M1 in ≤2.0 s from dock click to Board first paint.
2. **AC-02** All 28 MVP screens render and respond to input. Zero unhandled exceptions in `Console.app` during a 5-minute exploratory test.
3. **AC-03** `⌘N` from anywhere (including menubar with main window closed) opens Capture panel in ≤250 ms.
4. **AC-04** Drag a card across all four columns. Each move shows ≤500 ms optimistic update + ≤1.5 s WS reconcile. No duplicate or stuck cards after 50 sequential drags.
5. **AC-05** Paste a PNG from clipboard outside any text field → new card created from image; AI-rewritten title arrives within ≤10 s when `OPENROUTER_API_KEY` is set.
6. **AC-06** Open three EditCardWindows simultaneously; type in each; save each via `⌘S`. All three reconcile correctly with WS.
7. **AC-07** Quit app with two card windows open. Relaunch. Both windows restore at their last positions and sizes.
8. **AC-08** Force-quit app mid-WS connection. Relaunch. WS reconnects ≤3 s. No notification leaks (no duplicate UN requests).
9. **AC-09** Sleep the Mac for ≥10 minutes. Wake. WS reconnects ≤3 s. Cards refresh without manual intervention.
10. **AC-10** Notification Center banner for a message tap opens the correct card window. Banner does NOT show if that card window is already focused.
11. **AC-11** Light/Dark mode toggle in Preferences applies live (no relaunch). System "Auto" follows the OS in ≤1 s.
12. **AC-12** Drag a `.png` from Finder onto a card window → attaches. Drag a `.pdf` → toast "Only images may be attached" (Rule on MIME). No crash.
13. **AC-13** `⌘F` focuses toolbar search; typing filters cards in ≤100 ms.
14. **AC-14** Right-click any card → context menu shows Move to/Archive/Copy link/Open in new window. All four actions work.
15. **AC-15** AI Brainstorm completes (or fails gracefully with "degraded" if `TAVILY_API_KEY` missing) within `BRAINSTORM_TIMEOUT_MS` (default 30 s).
16. **AC-16** Logout returns to Login window; subsequent login restores Board.
17. **AC-17** Cold-start memory ≤200 MB; idle ≤150 MB after 10 minutes.
18. **AC-18** Binary size ≤25 MB (universal would be ≤40 MB; arm64-only target).
19. **AC-19** Crash-free over a 24-hour idle session with 4 card windows open and WS connected.
20. **AC-20** VoiceOver reads card title, status, due date, and assignee initials in `⌘F1` navigation.

---

## 3. DESIGN SYSTEM & VIEW SPECS

### 3.1 DESIGN TOKENS (macOS adapted from `web/src/theme.css`)

**Color tokens** — verbatim RGB triples, lifted from `web/src/theme.css` lines 2-153. Mapped to `Color(.sRGB, red:, green:, blue:, opacity:)` in Swift. NSColor semantic mapping listed where it makes sense to defer to the OS.

| Token | Light (rgb) | Dark (rgb) | NSColor semantic equiv | Use |
|---|---|---|---|---|
| `--canvas` | `250 249 247` | `14 13 20` | `.windowBackgroundColor` | Window background |
| `--surface` | `255 255 255` | `22 21 30` | `.controlBackgroundColor` | Modal / popover bg |
| `--surface-2` | `246 245 242` | `28 27 38` | — | Input pill bg |
| `--surface-3` | `240 238 234` | `36 34 47` | — | Tag pill bg |
| `--hairline` | `17 17 24` | `255 255 255` | `.separatorColor` (use opacity) | Borders |
| `--ink` | `24 22 35` | `240 237 248` | `.labelColor` | Primary text |
| `--ink-2` | `70 65 88` | `184 178 204` | `.secondaryLabelColor` | Secondary text |
| `--ink-3` | `130 124 148` | `128 122 148` | `.tertiaryLabelColor` | Tertiary text |
| `--ink-rev` | `255 255 255` | `14 13 20` | — | Reverse text on dark bg |
| `--violet` | `91 55 196` | `158 130 248` | — | Brand accent |
| `--violet-deep` | `65 38 142` | `187 165 250` | — | Brand hover |
| `--violet-tint` | `246 242 254` | `36 28 62` | — | Active tab bg |
| `--green-house` | `22 56 42` | `16 50 36` | — | Knowledge band bg |
| `--green-starbucks` | `0 112 74` | `80 190 140` | — | Filled green button |
| `--green-uplift` | `46 139 87` | `100 165 130` | — | Filled green hover |
| `--green-accent` | `78 171 115` | `120 185 150` | — | FAB / capture accent |
| `--danger` | `178 36 60` | `220 80 100` | `.systemRed` | Destructive |
| `--success` | `30 95 60` | `148 220 178` | `.systemGreen` | Confirmations |
| `--gold` | `200 155 40` | `238 196 110` | `.systemYellow` | Doing accent |
| `--lane-backlog` | `188 144 105` | `130 95 70` | — | Backlog accent |
| `--lane-today` | `228 130 70` | `190 100 55` | — | Today accent |
| `--lane-doing` | `233 178 50` | `200 145 40` | — | Doing accent |
| `--lane-done` | `52 158 138` | `40 130 115` | — | Done accent |
| `--lane-*-soft` | (see theme.css) | (see theme.css) | — | Lane column tints |
| `--paper` | `255 253 248` | `38 36 50` | — | Card sticky-note bg |
| `--tag-violet-bg` etc | (7 tag colors × 2 themes) | (7 × 2) | — | Tag pill colors |

**Typography** — macOS uses SF Pro by default. We bundle Inter to match the web app's visual identity exactly. Spectral for occasional serif moments. Mono falls back to `SF Mono` if JetBrains Mono missing.

| Token | Web | macOS | Use |
|---|---|---|---|
| Sans | Inter (CDN) | Inter (bundled `.ttf`) — fallback SF Pro Text | All UI |
| Serif | Spectral | Spectral (bundled) — fallback New York | Weekly Review header, "My Day" mirror |
| Mono | JetBrains Mono | JetBrains Mono (bundled) — fallback SF Mono | Code blocks, IDs |
| Script | Kalam | Kalam (bundled, V1) | Telegram bot attribution chip only |

Sizes (lifted from Tailwind `fontSize`):
- `text-1` 11 px / line 1.4 — micro labels
- `text-2` 12.5 px / line 1.45 — secondary
- `text-3` 14 px / line 1.5 — body
- `text-base` 13 px (`btn-pill`) — pills
- `text-headline` 17 px — section headers
- `text-title` 28 px — modal headers
- `text-display` 10vw (Mirror only) — adapt to `Font.system(size: 96)` on macOS

Letter spacing: `-0.015em` and `-0.025em` for tightened headings. Apply via `.kerning(_:)` modifier.

**Spacing scale**
- 2 / 4 / 6 / 8 / 12 / 16 / 24 / 32 / 48 (matches Tailwind multiples of 4)

**Corner radius**
- `--r-card` 10 px — card tile
- `--r-md` 8 px — modals
- `--r-sm` 6 px — inputs
- `--r-pill` 999 px — pills

**Shadows** (NSShadow / `.shadow(_:)` modifier)
- `--sh-1` `0 0 0 1px rgb(17 17 24 / .04), 0 1px 2px rgb(17 17 24 / .04)` — card surface (light); inverse on dark
- `--sh-2` `0 0 0 1px ... .05, 0 4px 12px ... .06` — modal surface
- `--sh-3` `0 0 0 1px ... .06, 0 16px 32px ... .10` — modal hover / floating panel

**Vibrancy.** Add **`NSVisualEffectView`** as toolbar background and as window backdrop where appropriate. Material: `.headerView` for toolbar; `.popover` for NSPopover; `.menu` for menubar extra; `.windowBackground` for main window if user opts in (Preferences toggle, V1).

**Animation curves**
- `fadeIn` 200 ms ease — sheets and toasts
- `modalIn` 240 ms ease-out — window present (web uses `transform: translateY(8px) scale(0.98) → 1`)
- `cardLift` 180 ms — hover lift (`.offset(y: -2)` + shadow boost). Respect `NSAccessibility.shouldReduceMotion` — disable.
- `dragGhost` 100 ms — DragOverlay opacity
- `tickerScroll` 60 s linear infinite — ActivityTicker (V1); pause on hover
- `confetti` not implemented in web; do not add on macOS

### 3.2 WINDOW ARCHITECTURE

Every window in MVP listed below. Each row: window type, style mask, default/min/max, autosave name, toolbar, sidebar, split, full-screen behavior.

| ID | Window | Type | Style mask | Default size | Min | Max | Autosave name | Toolbar | Sidebar | Split | Full-screen |
|---|---|---|---|---|---|---|---|---|---|---|---|
| W-01 | Main (Board + Knowledge) | NSWindow | titled, closable, miniaturizable, resizable, unifiedTitleAndToolbar, fullSizeContentView | 1280×800 | 960×600 | none | `KanbanMainWindow` | Yes (W-T01) | Yes (NavigationSplitView: Board ▸ Knowledge ▸ Archive button) | Yes (split view: sidebar / content) | Allowed; content reflows |
| W-02 | EditCard | NSWindow | titled, closable, miniaturizable, resizable, fullSizeContentView | 720×640 | 560×480 | none | `KanbanEditCard.<cardId>` | Compact toolbar (W-T02) | None | None | Allowed |
| W-03 | Capture (`⌘N` panel) | NSPanel (floating) | titled OFF, closable, fullSizeContentView, nonactivatingPanel, hudWindow=NO | 560×220 | 480×220 | 640×240 | `KanbanCapture` | None | None | None | NO |
| W-04 | Preferences | NSWindow | titled, closable, NOT resizable | 640×520 | — | — | `KanbanPreferences` | NSToolbar (segmented tabs) | None | None | NO |
| W-05 | Archive (NSSheet) | NSWindow (sheet) | titled, closable | 700×500 | 560×400 | none | none (sheet) | None | None | None | NO |
| W-06 | Weekly Review (NSSheet) | NSWindow (sheet) | titled, closable | 720×560 | none | none | none | None | None | None | NO |
| W-07 | Card Chain (V1) | NSWindow | titled, closable, miniaturizable, resizable | 1024×720 | 720×480 | none | `KanbanCardChain.<cardId>` | Compact toolbar | None | None | Allowed |
| W-08 | Login | NSWindow | titled, closable (closes app on close), centered, NOT resizable | 440×560 | — | — | `KanbanLogin` | None | None | None | NO |
| W-09 | Status item NSPopover (notifications) | NSPopover anchored to menubar item | — | 360×480 | — | — | — | — | — | — | NO |
| W-10 | Mirror (V2) | NSWindow | borderless, fullScreen, ignoresCursor | screen size | screen | screen | none | None | None | None | YES enforced |

**Toolbar layouts**

W-T01 (Main): `Sidebar toggle | flexible-space | Scope segmented control | Search field (NSSearchToolbarItem) | flexible-space | Weather button (V1) | Notification bell button | Settings button | Profile avatar with NSMenu trigger`

W-T02 (EditCard): `Card title (uneditable copy chip — short id) | flexible-space | QR button (👁) | Chain button (🧬) | Brainstorm button (🤔) | flexible-space | Archive button (🗑) | Save button (✓ — primary)`

**Multi-window rules**
- Opening the same cardId twice ⇒ activate the existing window (`NSApp.windows.first { $0.identifier?.rawValue == "edit-\(cardId)" }`).
- Closing the Main window does NOT terminate the app (menubar persists).
- Closing the last window with menubar disabled ⇒ `applicationShouldTerminateAfterLastWindowClosed` returns true.
- Capture panel is `.nonactivatingPanel` so the user's previous app stays in focus contextually for "quick capture from anywhere" UX (V1: global hotkey via `Carbon.RegisterEventHotKey` to summon from any app).

### 3.3 APPLICATION MENU SPEC (top-of-screen NSMenu)

Every menu item below has: title | shortcut | action selector / SwiftUI command | enabled-when condition.

**KanbanClaude** (application menu)
| Item | Shortcut | Action | Enabled when |
|---|---|---|---|
| About SmartKanban | — | NSApp.orderFrontStandardAboutPanel(_:) | Always |
| Preferences… | `⌘,` | open Preferences window | Logged in |
| — Services > | — | NSServicesMenu | Always (system) |
| Hide SmartKanban | `⌘H` | NSApp.hide(_:) | Always |
| Hide Others | `⌥⌘H` | NSApp.hideOtherApplications(_:) | Always |
| Show All | — | NSApp.unhideAllApplications(_:) | Always |
| Sign Out | — | AuthCoordinator.signOut() | Logged in |
| Quit SmartKanban | `⌘Q` | NSApp.terminate(_:) | Always |

**File**
| Item | Shortcut | Action | Enabled when |
|---|---|---|---|
| New Card… | `⌘N` | openCaptureWindow | Logged in |
| New Card from Clipboard | `⌥⌘N` | createCardFromClipboardImage | Pasteboard has image AND logged in |
| New Knowledge Item… | `⇧⌘N` | openKnowledgeCreateDialog | Logged in |
| Open Card… | `⌘O` | openCardByIdPrompt (paste UUID) | Logged in |
| Close Window | `⌘W` | NSWindow.performClose(_:) | Window key |
| Close All | `⌥⌘W` | closeAllWindows | Any window open |
| Print Board… | `⌘P` | placeholder noop V2 | Disabled in MVP |

**Edit**
| Item | Shortcut | Action | Enabled when |
|---|---|---|---|
| Undo | `⌘Z` | First responder undoManager | If responder supports |
| Redo | `⇧⌘Z` | First responder undoManager | If responder supports |
| Cut | `⌘X` | NSText.cut(_:) | Text selected |
| Copy | `⌘C` | NSText.copy(_:) OR copyCardLink | Card selected OR text selected |
| Copy Link to Card | `⌥⌘C` | copyCardDeepLink | Card selected OR card window key |
| Paste | `⌘V` | paste(_:) → attach-or-create-from-image OR text paste | Always |
| Paste and Match Style | `⌥⇧⌘V` | NSText.pasteAsPlainText(_:) | Text field key |
| Delete | `⌫` | archiveSelectedCard OR delete-attachment | Card selected OR attachment selected |
| Select All | `⌘A` | NSText.selectAll(_:) | Text field key |
| Find | `⌘F` | focusToolbarSearch | Main window key |
| Find Next | `⌘G` | navigateToNextSearchResult | Search results > 0 |
| Find Previous | `⇧⌘G` | navigateToPrevSearchResult | Search results > 0 |
| Spelling and Grammar > | (system submenu) | (system) | Text field key |

**View**
| Item | Shortcut | Action | Enabled when |
|---|---|---|---|
| Show Sidebar | `⌃⌘S` | toggleSidebar | Main window key |
| Board | `⌘1` | showSection(.board) | Logged in |
| Knowledge | `⌘2` | showSection(.knowledge) | Logged in |
| Archive | `⌘3` | openArchive | Logged in |
| Weekly Review | `⌘R` | openWeeklyReview | Logged in |
| Scope: Personal | `⌃⌘P` | setScope(.personal) | Logged in |
| Scope: Inbox | `⌃⌘I` | setScope(.inbox) | Logged in |
| Scope: All | `⌃⌘A` | setScope(.all) | Logged in |
| Scope: Shared | `⌃⌘H` | setScope(.shared) | Logged in |
| Focus: Backlog | `⌘⇧1` | scrollToColumn(.backlog) | Board section |
| Focus: Today | `⌘⇧2` | scrollToColumn(.today) | Board section |
| Focus: In Progress | `⌘⇧3` | scrollToColumn(.in_progress) | Board section |
| Focus: Done | `⌘⇧4` | scrollToColumn(.done) | Board section |
| Enter Full Screen | `⌃⌘F` | toggleFullScreen | Main window key |
| Toggle Light/Dark | `⌥⌘T` | cycleTheme | Always |

**Card** (custom menu — only present when card window is key)
| Item | Shortcut | Action | Enabled when |
|---|---|---|---|
| Save | `⌘S` | saveEdits | Dirty |
| Save and Close | `⌥⌘S` | saveAndClose | Dirty |
| Move to Backlog | `⌃1` | moveToStatus(.backlog) | Card open |
| Move to Today | `⌃2` | moveToStatus(.today) | Card open |
| Move to In Progress | `⌃3` | moveToStatus(.in_progress) | Card open |
| Move to Done | `⌃4` | moveToStatus(.done) | Card open |
| Archive Card | `⌘⌫` | archiveCard | Card open |
| Restore Card | `⇧⌘R` | restoreCard | Archive panel showing this card |
| Brainstorm | `⌘B` | runBrainstorm | Card open |
| Open Card Chain | `⌥⌘L` | openChainWindow | Card open |
| Attach File… | `⌘I` | showOpenPanelForAttachment | Card open |
| Show QR Code | `⌘Y` | toggleQRPanel | Card open |

**Window**
| Item | Shortcut | Action | Enabled when |
|---|---|---|---|
| Minimize | `⌘M` | NSWindow.miniaturize(_:) | Window key |
| Zoom | — | NSWindow.zoom(_:) | Window key |
| Bring All to Front | — | NSApp.arrangeInFront(_:) | Always |
| (dynamic window list) | — | activate window | Always |

**Help**
| Item | Shortcut | Action | Enabled when |
|---|---|---|---|
| SmartKanban Help | `⌘?` | Open kanban.npalakurla.com/docs in browser | Always |
| GitHub Repository | — | open repo URL | Always |

### 3.4 KEYBOARD SHORTCUTS MASTER LIST (conflict check applied)

All shortcuts from §3.3 plus the in-window ones below. **No conflict with macOS-reserved shortcuts** (`⌘Tab`, `⌘`, `⌘⇧3`, etc.). Conflicts inside the app are resolved by scope-pinning (e.g. `⌃1..⌃4` scoped to card window only).

| Combo | Scope | Action |
|---|---|---|
| `⌘N` | Global | Open Capture |
| `⌥⌘N` | Global (when clipboard image) | Create card from clipboard image |
| `⇧⌘N` | Global | Open Knowledge new |
| `⌘O` | Global | Open card by id prompt |
| `⌘W` | Window key | Close window |
| `⌘Q` | Global | Quit |
| `⌘,` | Global | Preferences |
| `⌘Z / ⇧⌘Z` | Text edit | Undo/Redo |
| `⌘X / ⌘C / ⌘V` | Standard | Cut/Copy/Paste |
| `⌥⌘C` | Card selected | Copy deep link |
| `⌘F` | Main window | Focus search |
| `⌘G / ⇧⌘G` | Main window | Next/prev search result |
| `⌃⌘S` | Main window | Toggle sidebar |
| `⌘1 / ⌘2` | Logged in | Section: Board / Knowledge |
| `⌘3` | Logged in | Archive |
| `⌘⇧1..⌘⇧4` | Board section | Focus column |
| `⌃⌘P / ⌃⌘I / ⌃⌘A / ⌃⌘H` | Logged in | Scope select |
| `⌘R` | Logged in | Weekly Review |
| `⌥⌘T` | Global | Cycle theme |
| `⌃⌘F` | Window key | Toggle full screen |
| `⌘S / ⌥⌘S` | Card window | Save / Save+close |
| `⌃1..⌃4` | Card window | Move status |
| `⌘⌫` | Card window | Archive |
| `⌘B` | Card window | Brainstorm |
| `⌥⌘L` | Card window | Card Chain |
| `⌘I` | Card window | Attach file |
| `⌘Y` | Card window | Toggle QR |
| `Esc` | Sheets / popovers / Capture | Dismiss |
| `Space` | Attachment selected | Quick Look (V1) |
| `Return` | Capture panel input | Submit |
| `⇧Return` | Description / Note textarea | Newline |
| `Tab / ⇧Tab` | Form fields | Field nav (standard) |
| `↑/↓` | Search results list, Notification list | Navigate |
| `Enter` | Selected list row | Activate |
| `⌘?` | Global | Help |

Conflict notes: `⌘1..⌘4` for sections is a common pattern; `⌘⇧1..⌘⇧4` for columns is unambiguous. `⌃⌘P` reserved by no system action.

### 3.5 CONTEXT MENU SPECS (right-click)

**On CardView tile** (`.contextMenu` modifier in SwiftUI)
- Open in new window (`⌘O`)
- Move to ▸ Backlog / Today / In Progress / Done
- Copy link (`⌥⌘C`)
- Copy ID
- Show QR (`⌘Y`)
- Brainstorm (`⌘B`)
- — separator —
- Archive (red) (`⌘⌫`)

**On Column header**
- Add card to this column…
- Sort by ▸ Manual / Updated / Title / Due date
- Show count: ✓ N cards (info row)
- — separator —
- Mark all as read

**On Knowledge row**
- Open
- Edit (owner only)
- Copy URL
- Refetch (owner only)
- — separator —
- Archive (red) (owner only)

**On Notification row**
- Mark as read
- Open card
- — separator —
- Mark all as read

**On Attachment tile** (inside EditCardWindow)
- Quick Look (`Space`)
- Open in Preview
- Reveal in Finder (after Save As)
- Copy image
- Save As…
- — separator —
- Delete attachment (red)

**On EditCard window title** (proxy icon — Cocoa standard)
- Standard NSWindow path proxy (Reveal in Finder shows the cached attachment dir)

### 3.6 COMPONENT LIBRARY — macOS native equivalents

For each reusable component used 3+ times in the web app, the macOS replacement.

| Web component | macOS replacement | Backed by |
|---|---|---|
| `.btn-pill-*` | `PillButton` view (custom SwiftUI) | `Button { } .buttonStyle(PillStyle(filled, color, size))` |
| `.input-pill` | `PillTextField` view | `TextField` + `.textFieldStyle(.plain)` + custom modifier |
| `.tag-pill` | `TagChip` view | `Text` + `.padding(.horizontal, 8)` + capsule |
| `.card-surface` | `CardSurface` modifier | `.background(.thinMaterial)` + `.cornerRadius(10)` + custom shadow |
| `.modal-surface` | `ModalSurface` modifier | Combined background + shadow + hairline border |
| `.modal-header-strip` | `ModalHeaderStrip` view | violet rectangle with white text |
| `.fab` | (Replaced with `⌘N` + menubar — no FAB) | — |
| Toast | `ToastOverlay` | `ZStack` overlay at `.bottomTrailing`; `Combine.Timer` for auto-dismiss |
| CardView | `CardTileView` | `VStack` + image strip + initials + badges |
| BoardHeader | `BoardToolbar` (NSToolbar items) | Toolbar `ToolbarItem`s |
| Column | `BoardColumnView` | `ScrollView { LazyVStack { ForEach(cards) { CardTileView } } }` + droppable overlay |
| Board | `BoardView` | `HStack { ForEach(STATUSES) { BoardColumnView } }` + drag controller |
| EditDialog | `EditCardView` hosted in `EditCardWindowController` | full SwiftUI in NSHostingView |
| ChatInput | `ChatInputView` | `TextField` + Send button |
| ScopeSwitcher | `ScopeSegmentedControl` | `Picker(...).pickerStyle(.segmented)` |
| SearchBar | `NSSearchToolbarItem` | native search field — beats SwiftUI's by 30% perf |
| LoginView | `LoginView` SwiftUI | Plain form |
| TemplatesTab | `TemplatesPreferencesPane` | Preferences tab |
| ActivityTicker | `ActivityTickerView` | `ScrollView(.horizontal)` + `Timer.publish` |
| WeatherWidget | `WeatherToolbarButton` + `WeatherPopover` | NSPopover |
| NotificationBell | `NotificationBellButton` + `NotificationsPopover` | NSPopover |
| WeeklyReview | `WeeklyReviewSheet` | sheet attached to main window |
| ArchiveDialog | `ArchiveSheet` | sheet attached to main window |
| KnowledgeView | `KnowledgeListView` | List + detail in split view |
| KnowledgeRow | `KnowledgeRowView` | List row |
| KnowledgeDetail | `KnowledgeDetailView` | NSWindow OR inline detail pane |
| KnowledgeEditDialog | `KnowledgeEditSheet` | sheet |
| CardChainModal | `CardChainView` (V1) | native Canvas graph (§3.7) |
| LinkPickerDialog | `LinkPickerSheet` | sheet on EditCardWindow |
| AiInsightsPanel | `AiInsightsPanelView` | DisclosureGroup-driven panel |
| RelatedCardsSection | `RelatedCardsView` | inline section |
| TrashDropZone | `TrashDropZoneOverlay` | conditional overlay shown during drag |
| CardTimeline | `CardTimelineView` | DisclosureGroup + ScrollView |
| MobileShell + sub-views | NONE (out of scope) | — |
| ServiceWorker | NONE (replaced) | UNUserNotificationCenter |

### 3.7 VIEW-BY-VIEW DESIGN SPECS

Below: every MVP view. Each gets: layout sketch, intrinsic content size, dynamic data sources, dark-mode swaps, motion behaviors, edge cases.

#### V-01 Login Window
- 440×560 NSWindow, not resizable, centered on launch.
- Vertical stack: K logo (violet square 56×56 with white "K"), wordmark "SmartKanban" 24 pt Inter, mode chip ("Sign in" / "Create account") in violet pill, email field, password field, optional name+short_name fields when register mode, error pill (red bg), primary submit button (filled violet pill — "Sign in" / "Create account"), mode toggle text link.
- Backgrounds: soft violet bloom (radial gradient from top, 30% opacity); same dual-bloom as web (`web/src/index.css` body::before).
- Fields use 16 px font (no iOS-zoom concern but consistent visual rhythm).
- Submit busy: button text "Working…", grey bg, cursor=wait.
- Error pill text comes from `ApiError.message`.
- `redirectTo` path validated by 200-char safe-relative regex; on success, navigate.
- Tab cycles email → password → (name → short_name in register) → submit.
- Esc closes app (since closing Login window terminates the app).

#### V-02 Main Window (Board section)
- NSWindow 1280×800, resizable.
- Top: NSToolbar (W-T01) — sidebar toggle, scope segmented, search, weather (V1), bell, settings, profile.
- Center: NavigationSplitView.
  - Sidebar (collapsible, 220 wide default; min 180, max 320): three rows — Board, Knowledge, Archive. Active row has violet tint.
  - Detail: BoardView — horizontal 4-column grid. Each column 240 wide, gap 16. Card tiles 220 wide × intrinsic-height.
- ActivityTicker (V1): 36 px height above column grid, full width.
- DragOverlay: shown during card drag, follows pointer with 4 px offset.
- TrashDropZone: floating bottom-right, 60 px circle, only visible during drag.
- Dark mode: lane backgrounds use `--lane-*-soft` dark values; card paper uses dark `--paper` 38/36/50.
- Empty state per column: "No cards" 12.5 pt italic ink-3.
- Loading state: skeleton tiles for first 500 ms while initial `/api/cards` resolves.

#### V-03 BoardHeader / NSToolbar
- macOS toolbar `displayMode: .iconAndLabel` for `prefers reduced motion` users; default `.iconOnly`.
- Items left to right:
  - Sidebar toggle (NSToolbarToggleSidebarItem)
  - Scope segmented (Personal / Inbox / All / Shared) with `pickerStyle(.segmented)`
  - Weather chip (V1) — temp + emoji
  - Search field — NSSearchToolbarItem `searchFieldStyle(.toolbar)`
  - Spacer
  - Notification bell — SF Symbol `bell` with red badge dot when unread; button triggers NSPopover (W-09)
  - Settings — SF Symbol `gearshape`
  - Profile — circle initials (short_name)
- Toolbar `.unifiedCompact` to align with traffic-light controls.

#### V-04 ScopeSegmentedControl
- 4 segments: PERSONAL / INBOX / ALL / SHARED.
- Active segment violet bg + white text.
- Shortcut hint shown as tooltip on hover (`⌃⌘P`, etc).
- Persists to UserDefaults key `lastScope`.

#### V-05 SearchBar (NSSearchToolbarItem)
- Placeholder "Search cards…" on Board, "Search knowledge…" on Knowledge.
- Live filter at every keystroke (Combine `.debounce(0.05, .main)`).
- Escape clears + blurs.
- `⌘F` focuses (also via menu).

#### V-06 NotificationBellButton + Popover
- Button: bell SF Symbol; red dot overlay when `unreadCount > 0`; "+" badge for 99+.
- Popover 360×480; arrow attached.
- Header strip violet "Notifications" + "Mark all read" link if unread > 0.
- List: notification rows — actor name bold + preview (truncate 80 chars) + relative time chip.
- Click row → `markNotificationsRead([id])` + opens card window + closes popover.
- Hover: row bg tint.
- Empty state: "No notifications" centered 12.5 pt ink-3.

#### V-07 ProfileButton + NSMenu
- Toolbar item: circle bg violet, white text `user.short_name` (e.g. "Jay" or "JC"), ▾ caret.
- NSMenu attached:
  - User name + email (disabled section header)
  - ⚙ Preferences… (`⌘,`)
  - — separator —
  - ↩ Sign Out

#### V-08 Capture (W-03 NSPanel)
- Title bar hidden; rounded 12 px corners; subtle shadow `--sh-3`.
- Body:
  - "Save next card to" lane chip (clickable → lane picker NSMenu): backlog/today/in_progress/done with current count
  - Title textfield (Inter 14 pt, placeholder "What's on your mind?")
  - Inline action row: 📷 Photo (NSOpenPanel images) | ✱ Template (NSMenu) | 🎙️ Voice (V2 — disabled) | → Send (filled when text non-empty)
- Auto-focus title field on open.
- Enter submits.
- Esc dismisses (also click outside via NSWindow's resignsKey).
- "/" first character: template autocomplete dropdown shows.

#### V-09 CardView tile
- Width: 220. Height: intrinsic (title + description + footer).
- Bg: `--paper` (light) / dark `--paper` 38/36/50.
- Corner radius `--r-card` 10 px. Shadow `--sh-1`.
- Header strip if `source==='telegram'`: small Telegram glyph 11 pt.
- AI summary chip (✨) bottom-left if latest insight is OK.
- Insight pending chip (⏳) if there's a pending insight.
- needs_review chip (⚠) if true.
- Title: Inter 13 pt semibold, ≤2 lines.
- Description: Inter 11 pt, ink-2, ≤2 lines (clamped).
- Tag pills row (max 4 visible, "+N" overflow chip).
- Footer:
  - Due date dot (lane color of urgency) + "in 3d" relative
  - Attachment count badge (clip icon + N)
  - Unread chat badge (💬 + N) if `unreadCounts[card.id] > 0`
  - Assignee initials (avatars 18×18, max 3, +N)
  - Share initials (smaller, 14×14, max 2, +N)
- Image thumbnails: up to 3 visible; 4th and beyond hidden behind "+N" overlay.
- Hover: lift y=-2 px with shadow boost `--sh-2`; tinted bloom inside (CSS `radial-gradient`). Respect `reduceMotion`.
- Drag: opacity 0.4 placeholder remains; ghost view follows pointer.
- ContextMenu: see §3.5.

#### V-10 EditCard Window (W-02)
- 720×640 NSWindow per card.
- Toolbar (compact): card title (read-only chip showing first 8 chars of UUID — click copies full UUID to pasteboard), spacer, QR/Chain/Brainstorm buttons (compact size), spacer, Archive (red, secondary), Save (primary).
- Body scroll view (vertical), padding 24:
  - Title textfield (Inter 18 pt)
  - Status segmented control (4 segments)
  - Description textfield (multiline, Inter 13 pt, ≥120 px tall, grows on input)
  - Tags input (Inter 13 pt; comma- or space-separated; `#` stripped; lowercased)
  - Due date date picker (compact field style)
  - "Attachments" section: grid (3 col on width ≥500, 2 col otherwise), 88×88 thumbnails for images, file pills for non-images. "+" tile last → Open file panel.
  - Assignees pill row (toggleable user chips with `short_name` initials)
  - Shares pill row (same, but "Share now" button next to it; shows "✓ Shared" toast on success)
  - Knowledge linked items (collapsible; remove/attach picker)
  - AI Insights panel (DisclosureGroup, default expanded)
  - Related Cards section (V1; collapsible)
  - Chat & Activity DisclosureGroup (expanded by default; sticky chat input below messages list)
- QR Code popover: 256×256 SVG; URL caption `${origin}/m/card/<id>` with copy button.
- Edits debounced to `setCard` via API; explicit `⌘S` calls `PATCH /api/cards/:id`.
- Closing window: prompts save if dirty (NSAlert).

#### V-11 AI Insights Panel
- "🤔 Brainstorm this card" button (visible only when no insight or last insight is `failed`).
- "🔄 Re-run" button on the side when an insight exists and not pending.
- Pending state: rotating sparkles glyph + "Running brainstorm…" with elapsed seconds counter.
- OK state:
  - Summary block (Inter 14 pt, max 4 lines initially, "Show more" expands)
  - Related items list: per item — kind chip (card/knowledge) + title + reason (italic 11 pt) + Open button
  - Web findings: per item — title (link blue) + Open ↗ button + Copy 📋 button (with "✓ Copied" toast)
  - Next steps: bulleted list, indent 16, ink-2 13 pt
  - "Degraded mode" amber badge when no Tavily key set
- Failed state: red pill "Brainstorm failed: <err>"; "Retry" button.

#### V-12 Card Timeline
- Collapsible group "▶ Chat & Activity" — caret rotates 90° on expand.
- Body: scrollable list of events (system / message / ai).
  - system: italic ink-3 "user @ time — action" (e.g. "Jay assigned this to Alex")
  - message: actor avatar + name + bubble (max 80% width, role-colored bg); time chip
  - ai: violet-tinted bg + sparkles glyph; content + chips for `ai_suggestions[]` (button: "✓ <label>" if applied)
  - share: same as system with different glyph (👥)
- Bottom: ChatInput (sticky).
- Auto-scroll to bottom on new events; mark-read fires on scroll-to-bottom.
- `incomingChatEvents` from WS bypass full fetch; appended directly.

#### V-13 ChatInput
- Single-line text field full width; "Send" pill button on right.
- Enter sends (no Shift+Enter unless `⌃Return` for newline — but server only accepts single-line per row anyway; this is a 1-line input).
- POST `/api/cards/:id/messages` → 201 CardEvent → optimistic append + WS reconcile.
- Disabled while busy.
- Hint placeholder: `Type a message — @ai to ask AI`.

#### V-14 Knowledge Section (Main Window, Knowledge tab)
- Left of split: same sidebar as Board section.
- Right: green "Knowledge" feature band (height 80) with title + subtitle + "+ New note" button on right.
- Filter row: scope picker (`mine` / `inbox` / `all`) + search field + (V1) tag chip row.
- Grid: 1/2/3 columns by available width; KnowledgeRow tiles.
- Empty state: "No knowledge yet." 14 pt ink-3 + "+ New note" CTA centered.

#### V-15 KnowledgeRow
- 320×140 tile.
- Header: host pill (e.g. `nytimes.com`) + visibility badge (🔒/📥/👥).
- Body: title (Inter 14 pt semibold, ≤2 lines) + snippet 11 pt ≤4 lines.
- Footer: fetch-status chip (⏳/⚠/✓) + tag chips + linked-card count.
- Click → KnowledgeDetail.

#### V-16 KnowledgeDetail (NSPopover OR detail pane)
- Pinned-detail panel in split-view OR modal popover (decision §5).
- Content: title (h2), URL (link blue), tags row, body (long form), visibility chip.
- Linked cards list with Open + Remove buttons (owner only).
- "+ Attach card" → picker.
- Actions row: Refetch (owner) | Edit (owner) | Archive (owner-red) | Close.

#### V-17 KnowledgeEditSheet
- 560×500 sheet attached to Main window.
- Fields: URL, Title (auto-fill from URL hostname if empty), Body (textarea), Tags, Visibility (radio: 🔒 Private / 📥 Inbox / 👥 Shared), Auto-fetch (checkbox).
- Save disabled unless `title.nonEmpty && (url.nonEmpty || body.nonEmpty)`.
- Cancel / Save buttons.

#### V-18 ArchiveSheet
- Sheet on main window, 700×500.
- Header bar "Archived cards" + count.
- List of archived cards: title + status pill + restore / delete-forever buttons per row.
- Footer: "Delete all (N)" red button + Close button.

#### V-19 WeeklyReview Sheet (V1)
- Sheet 720×560.
- 3 stat cards: Shipped / Stale / Stuck with counts.
- Sections per bucket: list of card titles + tags.
- AI summary block (serif Spectral, italics).
- "Generate again" button + Close.

#### V-20 TrashDropZone overlay
- Bottom-right of Main window, 60 px circle.
- Visible only during drag operation.
- Hover state: scales to 72 px + glow ring red.
- Drop → archives card.

#### V-21 Toast
- Bottom-right stack, 320 wide tiles.
- Icon by level (✓ green / ! red / i blue).
- Auto-dismiss 4 s; click ✕ dismisses early.
- Max visible 5; queue beyond that.

#### V-22 Card Chain Window (W-07, V1)
- 1024×720.
- Header: card title + chain depth picker (1..6, default 2).
- Body: native Canvas with force-directed layout — nodes are mini-card tiles (96×56), edges are arrows labeled with link type.
- Pan (drag empty area), zoom (`⌘+`/`⌘-` and trackpad pinch).
- Double-click node → opens that card window.
- Edge hover → shows note in tooltip if any.
- Empty state: "No related cards yet."

#### V-23 LinkPicker Sheet (V1)
- 520×440 sheet on EditCardWindow.
- Step 1 (Pick): search field + list of candidates (title + status chip). Click → step 2.
- Step 2 (Label): "What's the relationship?" — Picker with 6 labels + optional note textarea (≤500 chars).
- Back / Save buttons.

#### V-24 ActivityTicker (V1)
- 36 px height strip above board.
- Up to 8 chips, scrolling left at 60 s linear.
- Hover pauses.
- Click chip → opens its card.
- Hot-list = recent + attachment-count.

#### V-25 WeatherWidget (V1)
- Toolbar chip: emoji + temp.
- Popover 320×260: today details + 5-day forecast row.
- 30 min cache.

### 3.8 PREFERENCES WINDOW SPEC (W-04)

`⌘,` opens. Five tabs (NSToolbar segmented):

**T1 General**
- Theme: Light / Dark / System (segmented).
- Start at login (checkbox — persists via SMAppService.mainApp Login Item API).
- Show in menu bar (checkbox — toggles NSStatusItem; on toggles off, restores Dock icon if previously hidden).
- Hide Dock icon (checkbox — sets `activationPolicy(.accessory)` next launch).

**T2 Account**
- Display name (textfield + Save button).
- Short name (textfield, 1-16 chars + Save).
- Email (readonly).
- Sign Out button (red).

**T3 Tokens**
- "Mirror tokens" section: list (label + created date + Revoke). "New" form (label + Create → shows URL once with Copy button).
- "API tokens" section: list (label + created date + Revoke). "New" form (label + Generate → shows token ONCE with Copy + Dismiss).

**T4 Telegram**
- List of linked identities (telegram_user_id + @username + Unlink).
- "Link new" form: numeric ID + optional @username + Link.
- Helper text: "Find your ID by DM'ing @userinfobot on Telegram."

**T5 Templates**
- List of templates (private + shared); columns: Name, Visibility, Status, Due offset, Actions.
- Edit / Delete buttons per row (owner only).
- "+ New template" form: same fields as web TemplatesTab.

### 3.9 MACOS-NATIVE INTERACTION PATTERNS

**Drag and drop**
- Card → Card: reorder.
- Card → Column: move (server-side position math; client computes midpoint).
- Card → TrashDropZone: archive (confirm via toast undo).
- Card → outside app: produces `text/uri-list` = `kanbanclaude://card/<uuid>`.
- Finder file → Card window: attach if image (NSItemProvider + UTType.image conformance check).
- Finder file → Board: create card from image via `/api/cards/from-image`.
- Web image (from Safari) → Card or Board: same as Finder.
- Knowledge row → Card window: link (`POST /api/knowledge/:id/links`).

**Finder integration**
- Attachment file save-as via NSSavePanel (Card menu > Attach > "Save Original").
- Reveal in Finder for downloaded attachments (V1).

**Undo/Redo**
- NSUndoManager scoped to focus context:
  - Title / description text edits — standard text undo via NSTextView's built-in undo manager.
  - Move / archive — register on shared `BoardUndoManager`; PATCH-reverse on undo.
- Limit stack depth to 50.

**Auto-save**
- Title / description debounced 800 ms after last keystroke → PATCH.
- Explicit `⌘S` flushes any pending debounce.
- Failure → toast + retry button; debounce restarts on next edit.

**Drag-out as link**
- A card dragged outside the app provides `text/uri-list` = its deep link. Compatible with Mail, Messages, Notes for paste-as-rich-link.

**Quick Look**
- `Space` on a selected attachment thumbnail in EditCardWindow opens QLPreviewPanel.
- Implement `QLPreviewPanelDataSource` returning the attachment's downloaded file URL.

**URL scheme**
- `kanbanclaude://card/<uuid>` → opens EditCardWindow.
- `kanbanclaude://knowledge/<uuid>` → opens KnowledgeDetail.
- `kanbanclaude://my-day?token=...` → opens Mirror (V2).
- Routed via `NSAppleEventManager` handler in `applicationDidFinishLaunching`.

**Continuity / Universal Clipboard (V2)**
- Insert from iPhone (Continuity Camera) when right-click on a card's attachment grid.
- Universal Clipboard works transparently — paste of an iPhone-copied image becomes attach.

**Spotlight (V2)**
- Index every card via `CSSearchableItemAttributeSet(contentType: .text)` with title, description, tags.

---

## 4. TECHNICAL ARCHITECTURE

### 4.1 FRAMEWORK DECISION

**Locked: SwiftUI + AppKit interop (Swift 5.10, Xcode 15.4+, macOS 13.3+ deployment target).**

Three frameworks evaluated:

1. **Tauri 2 (Rust + WebView)** — REJECTED. (a) Already have a perfectly good React web app — Tauri would just shell it. (b) WKWebView on macOS has known CSS quirks that the web app's dnd-kit + Tailwind don't fully account for, per Rule 7.3 reference to "WKWebView CSS quirks." (c) No native NSMenu unless we reimplement via Tauri's experimental menu APIs. (d) No real native paste/drag interop — Tauri sandboxes the WebView. (e) Building a Rust toolchain on top of an already TypeScript-heavy codebase doubles maintenance surface. (f) Distribution requires shipping a 30-40 MB binary that bundles webview-glue Rust libraries.

2. **Electron** — REJECTED. (a) 80-150 MB binary minimum (Chromium runtime). (b) Massive memory footprint (~300+ MB idle). (c) Same lack-of-native-menu argument as Tauri (Electron has menu primitives but they hot-reload poorly with our React app). (d) Battery cost on M-series Macs noticeably worse than native. (e) Build pipeline (electron-builder + auto-updater) adds two more npm packages we don't have today.

3. **SwiftUI + AppKit interop** — CHOSEN. (a) Single Swift toolchain; the Swift Concurrency model maps directly to the agent-rules.md hard constraints (Rule 3 — exact patterns we already know). (b) Native NSMenu, NSToolbar, NSWindow, NSStatusBar are free. (c) Keychain access via Security.framework is one-line in Swift (`SecItemAdd`). (d) URLSessionWebSocketTask is built in — no third-party dependency. (e) `UNUserNotificationCenter` solves the push problem for MVP without VAPID. (f) Single arm64 binary is ≤25 MB. (g) Memory profile ≤200 MB cold-start. (h) Existing `LocalOCR.macOS` precedent — agent-rules.md and FEATURE_PARITY_REGISTRY workflow were forged on this exact stack. (i) SwiftUI on macOS 13.3 gaps (programmatic window opening, sidebar styling on NavigationSplitView) are patched via AppKit interop — well-trodden path.

**Language(s) and versions (LOCKED)**
- Swift 5.10 (Xcode 15.4 default)
- Xcode 15.4+ (Swift Concurrency final ABI, macOS 13.3 SDK)
- SwiftUI 4.0+ (introduced macOS 13)
- AppKit (system)
- Combine (system) — used for Timer publishers + decoupled state stores; Swift Concurrency for I/O
- Deployment target: macOS 13.3 (Ventura)
- Architectures: arm64 (MVP). Universal binary considered in V2 (Rosetta tested).

### 4.2 PROJECT STRUCTURE

Xcode project lives at `macOS/` in the repo root, NOT under `web/` or `server/`. Top-level Swift Package optional (NO — keep single Xcode project for MVP simplicity).

```
KanbanClaude/                                         # repo root
├── BUILD_CONSTANTS.md                                # optional; if present, overrides default constants
├── MACOS_APP_PLAN.md                                 # this doc
├── FEATURE_PARITY_REGISTRY.md                        # do not edit existing rows; macOS Impl column gets ✅/🔄/🚫
├── AGENT_LEARNINGS.md                                # if not present, create on first incident
├── agent-rules.md                                    # binding
├── web/ ...                                          # existing — DO NOT MODIFY
├── server/ ...                                       # existing — DO NOT MODIFY
└── macOS/
    ├── KanbanClaude.xcodeproj/                       # Xcode project
    │   └── project.pbxproj
    ├── KanbanClaude/                                 # primary app target
    │   ├── KanbanClaudeApp.swift                     # @main App; scenes; URL scheme handler
    │   ├── Info.plist                                # bundle id; URL scheme; UN entitlement
    │   ├── KanbanClaude.entitlements                 # network client; outgoing connections; Keychain
    │   ├── Assets.xcassets/
    │   │   ├── AppIcon.appiconset/                   # 1024+ master + variants
    │   │   ├── Colors.xcassets/                      # palette as Color Assets (light + dark)
    │   │   └── Symbols/                              # custom SF Symbols if any
    │   ├── Resources/
    │   │   ├── Fonts/                                # Inter, Spectral, JetBrainsMono .ttf
    │   │   └── Sounds/                               # NONE for MVP
    │   ├── App/
    │   │   ├── AppDelegate.swift                     # AppKit lifecycle bridge (NSStatusItem, URL handler)
    │   │   ├── SceneRouter.swift                     # Map URL/section → window
    │   │   ├── ColorTokens.swift                     # Color extension exposing --canvas etc as named Colors
    │   │   ├── Typography.swift                      # Font extensions (Inter loader)
    │   │   ├── ThemeManager.swift                    # follow system + override; writes NSApp.appearance
    │   │   ├── ShortcutManager.swift                 # NSEvent monitor for non-menu shortcuts (V1)
    │   │   ├── NotificationCenterBridge.swift       # UNUserNotificationCenter delegate
    │   │   ├── StatusItemController.swift            # NSStatusBar.system.statusItem
    │   │   ├── WindowCoordinator.swift               # Track open windows; deep-link routing
    │   │   ├── URLSchemeHandler.swift                # parse kanbanclaude://… and dispatch
    │   │   ├── DragController.swift                  # Cross-component drag state
    │   │   ├── UndoController.swift                  # BoardUndoManager
    │   │   ├── Constants.swift                       # bundle id, server URL fallback, prod URL
    │   │   ├── Build.swift                           # buildNumber, version, gitHash via Info.plist
    │   │   └── Errors.swift                          # KanbanError enum (api, auth, decode, network)
    │   ├── Networking/
    │   │   ├── APIClient.swift                       # URLSession wrapper with cookie + Bearer support
    │   │   ├── Endpoint.swift                        # Enum of every endpoint (Rule 1 — confirmed against server)
    │   │   ├── Codables/                             # ONE FILE per response type
    │   │   │   ├── User.swift
    │   │   │   ├── Card.swift
    │   │   │   ├── Attachment.swift
    │   │   │   ├── CardEvent.swift
    │   │   │   ├── AiSuggestion.swift
    │   │   │   ├── Template.swift
    │   │   │   ├── KnowledgeItem.swift
    │   │   │   ├── Insight.swift
    │   │   │   ├── CardLink.swift
    │   │   │   ├── Notification.swift
    │   │   │   ├── MirrorToken.swift
    │   │   │   ├── ApiToken.swift
    │   │   │   ├── TelegramIdentity.swift
    │   │   │   ├── ReviewData.swift
    │   │   │   └── BroadcastEvent.swift               # WS union type
    │   │   ├── WebSocketClient.swift                  # URLSessionWebSocketTask wrapper with backoff
    │   │   ├── BroadcastEventDecoder.swift            # discriminated-union JSON decoder
    │   │   ├── BroadcastDispatcher.swift              # routes BroadcastEvent → stores
    │   │   ├── AttachmentDownloader.swift             # auth'd image cache
    │   │   ├── QRGenerator.swift                      # CIQRCodeGenerator wrapper
    │   │   └── ServerTime.swift                       # Date-header skew tracker
    │   ├── Keychain/
    │   │   └── KeychainStore.swift                    # save/load/delete token
    │   ├── Stores/                                    # @MainActor observable state
    │   │   ├── AuthStore.swift                        # user + login/register/logout/me
    │   │   ├── CardStore.swift                        # [UUID: Card]; per-scope filters
    │   │   ├── TemplateStore.swift
    │   │   ├── KnowledgeStore.swift
    │   │   ├── InsightStore.swift
    │   │   ├── CardLinkStore.swift
    │   │   ├── NotificationStore.swift
    │   │   ├── UnreadStore.swift                      # [CardID: Int] running counts
    │   │   ├── ToastStore.swift                       # queue + auto-dismiss
    │   │   ├── WeatherStore.swift                     # 30 min cache + Open-Meteo client
    │   │   ├── UserListStore.swift                    # household roster
    │   │   ├── DragStore.swift                        # active drag state
    │   │   └── BoardScopeStore.swift                  # current scope + last-search per scope
    │   ├── UI/
    │   │   ├── Components/                            # reusable views (§3.6)
    │   │   │   ├── PillButton.swift
    │   │   │   ├── PillTextField.swift
    │   │   │   ├── TagChip.swift
    │   │   │   ├── CardSurface.swift
    │   │   │   ├── ModalSurface.swift
    │   │   │   ├── ModalHeaderStrip.swift
    │   │   │   ├── ToastOverlay.swift
    │   │   │   ├── AuthenticatedImage.swift
    │   │   │   ├── InitialsAvatar.swift
    │   │   │   ├── SourceBadge.swift
    │   │   │   ├── DueDateChip.swift
    │   │   │   ├── ScopeSegmentedControl.swift
    │   │   │   ├── SearchToolbarItem.swift            # NSSearchToolbarItem bridge
    │   │   │   └── DragGhost.swift
    │   │   ├── Auth/
    │   │   │   ├── LoginWindowController.swift
    │   │   │   ├── LoginView.swift
    │   │   ├── Main/
    │   │   │   ├── MainWindowController.swift
    │   │   │   ├── MainView.swift                     # NavigationSplitView root
    │   │   │   ├── BoardSidebar.swift
    │   │   │   ├── BoardView.swift
    │   │   │   ├── BoardColumnView.swift
    │   │   │   ├── CardTileView.swift
    │   │   │   ├── TrashDropZoneOverlay.swift
    │   │   │   ├── BoardToolbar.swift                 # ToolbarContent + items
    │   │   │   ├── ActivityTickerView.swift           # V1
    │   │   │   ├── WeatherPopover.swift               # V1
    │   │   │   ├── NotificationBellButton.swift
    │   │   │   └── NotificationsPopover.swift
    │   │   ├── Card/
    │   │   │   ├── EditCardWindowController.swift
    │   │   │   ├── EditCardView.swift
    │   │   │   ├── EditCardToolbar.swift
    │   │   │   ├── QRPopover.swift
    │   │   │   ├── AiInsightsPanelView.swift
    │   │   │   ├── RelatedCardsView.swift              # V1
    │   │   │   ├── CardChainWindowController.swift     # V1
    │   │   │   ├── CardChainView.swift                  # V1 native canvas
    │   │   │   ├── LinkPickerSheet.swift                # V1
    │   │   │   ├── CardTimelineView.swift
    │   │   │   └── ChatInputView.swift
    │   │   ├── Capture/
    │   │   │   ├── CaptureWindowController.swift
    │   │   │   └── CaptureView.swift
    │   │   ├── Knowledge/
    │   │   │   ├── KnowledgeListView.swift
    │   │   │   ├── KnowledgeRowView.swift
    │   │   │   ├── KnowledgeDetailView.swift
    │   │   │   ├── KnowledgeEditSheet.swift
    │   │   │   └── KnowledgeAttachPicker.swift
    │   │   ├── Archive/
    │   │   │   └── ArchiveSheet.swift
    │   │   ├── Review/                                  # V1
    │   │   │   └── WeeklyReviewSheet.swift
    │   │   ├── Preferences/
    │   │   │   ├── PreferencesWindowController.swift
    │   │   │   ├── GeneralTab.swift
    │   │   │   ├── AccountTab.swift
    │   │   │   ├── TokensTab.swift
    │   │   │   ├── TelegramTab.swift
    │   │   │   └── TemplatesTab.swift                   # V1
    │   │   └── Mirror/                                   # V2
    │   │       ├── MirrorWindowController.swift
    │   │       └── MirrorView.swift
    │   ├── Menus/
    │   │   ├── AppMenuCommands.swift                    # SwiftUI .commands{} for all menus from §3.3
    │   │   └── CardContextMenu.swift
    │   └── PreviewSupport/
    │       └── PreviewMockData.swift
    ├── KanbanClaudeTests/                              # unit + integration tests
    │   ├── CodableMirrorTests.swift                    # one test per Codable confirming verbatim shape
    │   ├── VisibilityPredicateTests.swift              # card visibility math
    │   ├── DragControllerTests.swift
    │   ├── BroadcastDispatcherTests.swift
    │   ├── WebSocketReconnectTests.swift
    │   ├── KeychainStoreTests.swift
    │   └── ServerTimeSkewTests.swift
    ├── KanbanClaudeUITests/
    │   ├── BoardSmokeUITests.swift
    │   ├── CaptureUITests.swift
    │   ├── EditCardUITests.swift
    │   └── KnowledgeUITests.swift
    └── Scripts/
        ├── build-dmg.sh                                 # builds + makes .dmg
        ├── reinstall.sh                                 # pkill, copy to /Applications, xattr -cr, open
        ├── tail-logs.sh                                 # log show --predicate 'subsystem == "com.kanbanclaude.kanbanclaude"'
        └── api-preflight.sh                             # Rule 1 helper — greps server for an endpoint
```

Folder purposes:
- `App/` — application-level singletons, lifecycle, app-wide controllers.
- `Networking/` — HTTP + WS + Codables. **NEVER** put domain logic here.
- `Stores/` — observable state. `@MainActor` everywhere. NEVER mutate from non-main actor.
- `UI/` — views. No I/O. Only render + dispatch actions to stores.
- `Menus/` — NSMenu definitions; one file per menu region.
- `Keychain/` — Keychain wrappers — DO NOT use UserDefaults for tokens.
- `Resources/Fonts/` — bundled .ttf; loaded in `AppDelegate.applicationDidFinishLaunching`.

### 4.3 DEPENDENCY LIST — LOCKED

**Zero third-party Swift Package dependencies for MVP.** Everything is system-framework.

| System framework | Why |
|---|---|
| `SwiftUI` | UI |
| `AppKit` | NSWindow / NSMenu / NSToolbar / NSStatusBar / NSPasteboard / NSItemProvider |
| `Combine` | Timer.publish, async-bridge, debounce |
| `Foundation` | URLSession, URLCache, JSON, Date |
| `UserNotifications` | UNUserNotificationCenter banners |
| `Security` | Keychain (SecItem*) |
| `CryptoKit` | (V1) request signing if needed |
| `QuickLookUI` | QLPreviewPanel |
| `CoreImage` | CIQRCodeGenerator |
| `UniformTypeIdentifiers` | UTType.image, UTType.url |
| `os.log` | unified logger with subsystem `com.kanbanclaude.kanbanclaude` |
| `WebKit` | WKWebView for QR popover OR card-chain fallback (V1 only — preferred replaced by native) |
| `CoreSpotlight` | V2 indexing |
| `IntentsUI` | V2 App Intents |
| `Network` | (V2) NWPathMonitor for offline detection |

**Why no SPMs.** SwiftPM dependencies risk version drift; we keep ABI stability and binary size at the floor. Justification: every capability above is either a system framework or reproducible in ≤200 LoC of Swift.

If at any point during build the agent feels tempted to add a dependency (Alamofire, Kingfisher, GRDB, etc.) — STOP. Re-read this row. Solve the problem with stdlib.

### 4.4 ENVIRONMENT CONFIGURATION

**Build-time constants** (`Constants.swift`):
- `kProdBaseURL = URL(string: "https://kanban.npalakurla.com")!`
- `kDevBaseURL = URL(string: "http://localhost:3001")!`
- `kBundleID = "com.kanbanclaude.kanbanclaude"`
- `kAppName = "SmartKanban"`
- `kURLScheme = "kanbanclaude"`
- `kKeychainService = kBundleID`
- `kKeychainTokenAccount = "kanban_session"`
- `kUserDefaultsKey_theme = "theme"`
- `kUserDefaultsKey_scope = "lastScope"`
- `kUserDefaultsKey_startAtLogin = "startAtLogin"`
- `kUserDefaultsKey_showInMenuBar = "showInMenuBar"`
- `kUserDefaultsKey_hideDockIcon = "hideDockIcon"`
- `kUserDefaultsKey_userJSONCached = "lastUserJSON"` — non-sensitive; id+name only
- `kUserDefaultsKey_weatherCache = "weather_cache"`

**Runtime config**
- Server URL: read from `UserDefaults.string(forKey: "serverURL")` if set (advanced debug), else `kProdBaseURL`. NEVER hardcoded inside views.
- Build configuration:
  - Debug: `kDevBaseURL` default + debug subsystem logging + UN sound for testing
  - Release: `kProdBaseURL` default + info-only logging
- `.env` files NEVER read at runtime. No process.env. Tokens come from Keychain only.

**Secrets and where they live**

| Secret | Stored | Read by |
|---|---|---|
| Session token (`kanban_session`) | Keychain `kSecClassGenericPassword` + cookie store | APIClient |
| API token (user-generated) | Keychain (V1, if ever used by app for its own requests; today: NOT used) | n/a |
| OpenRouter / OpenAI / Tavily / VAPID | SERVER ONLY — never in macOS app | server only |

**Info.plist keys**
- `CFBundleIdentifier` = `com.kanbanclaude.kanbanclaude`
- `CFBundleDisplayName` = `SmartKanban`
- `CFBundleName` = `KanbanClaude`
- `CFBundleVersion` = build number
- `CFBundleShortVersionString` = `1.0.0`
- `LSMinimumSystemVersion` = `13.3`
- `LSApplicationCategoryType` = `public.app-category.productivity`
- `NSHumanReadableCopyright` = `© 2026 KanbanClaude`
- `CFBundleURLTypes` = `[{ CFBundleURLSchemes: ["kanbanclaude"], CFBundleURLName: "com.kanbanclaude.deeplink" }]`
- `NSAppTransportSecurity` = `{ NSAllowsArbitraryLoads: NO }` — strict HTTPS only; localhost exception only for `kDevBaseURL` via `NSExceptionDomains.localhost`.
- `NSUserNotificationAlertStyle` = `alert`
- `LSUIElement` = NO (regular app); flipped at runtime if `hideDockIcon` is set
- `SMAppService.LoginItemBundleIdentifier` (for Start at login)

**Entitlements**
- `com.apple.security.network.client` = YES
- `com.apple.security.network.server` = NO
- `com.apple.security.files.user-selected.read-only` = YES (Open file panel attachments)
- `com.apple.security.files.user-selected.read-write` = NO (no Save panel modifications)
- App Sandbox: NOT ENABLED for MVP (direct DMG, unsigned). When notarizing for V2, enable sandbox with the entitlements above plus `com.apple.security.keychain-access-groups = [$(AppIdentifierPrefix)com.kanbanclaude.kanbanclaude]`.

### 4.5 API INTEGRATION STRATEGY

**APIClient (`Networking/APIClient.swift`)** — single point of HTTP entry.

- Base URL from runtime config.
- Shared `URLSession` with `.default` config, `httpCookieAcceptPolicy = .always`, `httpShouldSetCookies = true`.
- Auth: session cookie acquired on login; persisted automatically by URLSession's cookie store. Mirror to Keychain on login success; restore from Keychain on launch if cookie store empty.
- API token auth: Bearer header — used ONLY for tests / advanced flows; default app traffic is cookie.
- Response handling: every response triggers `ServerTime.captureSkew(from: response.allHeaderFields["Date"])`.
- Error model:
  - `APIError.status(Int, String)` — non-2xx
  - `APIError.decode(DecodingError)` — Codable mismatch (BUG — fix Codable to match server per Rule 2)
  - `APIError.network(URLError)` — transport
  - `APIError.cancelled` — task cancellation (silent per Rule 3)
- Retry policy: no automatic retry on 4xx; on 5xx + network errors retry once after 1 s; on second failure surface to user.

**Endpoint enum (`Networking/Endpoint.swift`)**

```swift
enum Endpoint {
    // auth
    case me
    case login(email: String, password: String)
    case register(name: String, shortName: String, email: String, password: String)
    case logout
    case updateMe(shortName: String?, name: String?)
    // users
    case users
    // cards
    case listCards(scope: Scope, project: String?)
    case archivedCards
    case getCard(id: UUID)
    case createCard(CardCreate)
    case updateCard(id: UUID, CardPatch)
    case archiveCard(id: UUID)
    case restoreCard(id: UUID)
    case permanentDelete(id: UUID)
    case purgeArchived
    case attachToCard(id: UUID, fileURL: URL)
    case createCardFromImage(fileURL: URL, status: Status?)
    case knowledgeForCard(id: UUID)
    // mirror / api tokens
    case listMirrorTokens
    case createMirrorToken(label: String?)
    case deleteMirrorToken(token: String)
    case listApiTokens
    case createApiToken(label: String?)
    case deleteApiToken(token: String)
    // review / telegram
    case review
    case linkTelegram(userId: Int64, username: String?)
    case listTelegramIdentities
    case unlinkTelegram(userId: Int64)
    // templates
    case listTemplates
    case getTemplate(id: UUID)
    case createTemplate(TemplateInput)
    case updateTemplate(id: UUID, TemplateInput)
    case deleteTemplate(id: UUID)
    case instantiateTemplate(id: UUID, statusOverride: Status?)
    // knowledge
    case listKnowledge(scope: KScope, q: String?, tag: String?, limit: Int?, cursor: String?)
    case getKnowledge(id: UUID)
    case createKnowledge(KnowledgeInput)
    case updateKnowledge(id: UUID, KnowledgePatch)
    case archiveKnowledge(id: UUID)
    case refetchKnowledge(id: UUID)
    case linkKnowledgeToCard(knowledgeId: UUID, cardId: UUID)
    case unlinkKnowledgeFromCard(knowledgeId: UUID, cardId: UUID)
    case knowledgeFromCard(cardId: UUID)
    // insights
    case brainstormCard(id: UUID)
    case listCardInsights(id: UUID)
    case getInsight(id: UUID)
    // card links
    case createCardLink(fromCardId: UUID, payload: CardLinkCreate)
    case deleteCardLink(fromCardId: UUID, linkId: UUID)
    case listCardLinks(cardId: UUID)
    case cardChain(cardId: UUID, depth: Int)
    // chat
    case cardEvents(id: UUID)
    case postMessage(cardId: UUID, content: String)
    case markRead(cardId: UUID, lastReadId: Int64)
    case unreadCounts
    // notifications
    case listNotifications
    case markNotificationsRead(ids: [Int])
    case markAllNotificationsRead
    // push (MVP: unused)
    case vapidPublicKey
    // qr
    case cardQR(id: UUID)
    case attachmentURL(storagePath: String)
}
```

Each case `urlRequest(base:) -> URLRequest` builds path, method, headers, body. Body uses `JSONEncoder` with `dateEncodingStrategy = .iso8601` (`ISO8601DateFormatter` with `.withFractionalSeconds` UNSET — server uses second precision).

**WebSocket client (`Networking/WebSocketClient.swift`)**

- Uses `URLSessionWebSocketTask` with `wss://` URL derived from base URL (replace `http→ws`, `https→wss`).
- Cookie attached automatically via URLSession cookie store.
- Mirror token mode: query `?mirror=<token>` (V2 only).
- Receive loop: `Task { while !Task.isCancelled { ... await ws.receive() ... } }` — runs on background, dispatches decoded events to BroadcastDispatcher on `@MainActor`.
- Backoff: 500 ms → 1 s → 2 s → 4 s → 8 s → 10 s (cap). Reset on successful open. Matches `web/src/ws.ts` logic.
- Reconnect triggers:
  - Initial connect after auth success.
  - `NSWorkspace.didWakeNotification` (sleep recovery).
  - `URLSession` connect-lost / `URLError.notConnectedToInternet`.
  - User-initiated retry (Settings button "Reconnect").
- Heartbeat: server's `hello` is the first frame; client expects it within 5 s of open; otherwise close + reconnect.
- Disconnect cleanup: `ws.cancel(with: .normalClosure, reason: nil)`.

**BroadcastEvent decoding (`BroadcastEventDecoder.swift`)**
- Single discriminated union — peek `type` field, then decode the corresponding payload struct. Decode errors logged + dropped (do NOT crash).
- All 19 event types from §1.4 are decoded.
- BroadcastDispatcher routes each to the right store on MainActor.

**Auth header attachment**
- Cookie storage handles `kanban_session` automatically.
- Manual injection on launch: `HTTPCookieStorage.shared.setCookie(HTTPCookie(properties: [.name: "kanban_session", .value: <fromKeychain>, .domain: host, .path: "/", .expires: futureDate]))` if cookie store empty AND Keychain has token.

**Token storage (Keychain)**
- On login success: extract `Set-Cookie` value; persist via `KeychainStore.save(token:)`.
- On logout: `KeychainStore.delete()`.

**Refresh strategy**
- No refresh tokens. 30-day session. If 401 returned mid-session → drop to LoginWindow.

**Interceptors / logging**
- All requests logged via `Logger(subsystem: kBundleID, category: "network")` at `.debug` level — URL + status code only (no body, no cookies). `.public` flag for production.

**Offline strategy (MVP)**
- No persistent local cache (V2 will add).
- On launch with no network: show "Offline — cached data" banner; render last-known stores from in-memory (which is empty on first launch).
- All mutations require online — show toast + retry button on failure.

**Image attachment auth**
- `AttachmentDownloader` uses `URLSession.shared.dataTask` (which inherits cookie store).
- `NSCache<NSURL, NSImage>` with 50 MB max + 200 image count.
- LRU eviction.

### 4.6 NATIVE macOS INTEGRATION PLAN

Every native capability with API, file, frontend trigger, permissions, fallback.

| ID | Capability | API | File | Trigger | Permissions | Fallback |
|---|---|---|---|---|---|---|
| N-01 | NSMenu (top-of-screen) | NSMenu + SwiftUI `.commands {}` | `Menus/AppMenuCommands.swift` | App launch | none | n/a |
| N-02 | NSToolbar with vibrancy | NSToolbar + `NSVisualEffectView` | `UI/Main/BoardToolbar.swift` | Main window load | none | n/a |
| N-03 | NSStatusItem (menubar) | NSStatusBar.system.statusItem(withLength:) | `App/StatusItemController.swift` | App launch (if `showInMenuBar` true) | none | n/a |
| N-04 | Dock badge | NSApp.dockTile.badgeLabel | `App/StatusItemController.swift` (updates from UnreadStore) | unread total changes | none | n/a |
| N-05 | Local notifications | UNUserNotificationCenter | `App/NotificationCenterBridge.swift` | WS card.message / card.ai_response | request permission on first run | banner suppressed if denied |
| N-06 | URL scheme handler | NSAppleEventManager + Info.plist URLTypes | `App/URLSchemeHandler.swift` | app receives `kanbanclaude://...` | none | n/a |
| N-07 | Drag-out (card → URL) | `.draggable { URL }` | `UI/Main/CardTileView.swift` | user drags card | none | n/a |
| N-08 | Drag-in (Finder file → attach) | `.onDrop(of: [.image], delegate:)` + NSItemProvider | `UI/Card/EditCardView.swift` + `UI/Main/BoardView.swift` | drop image on card/board | none | toast "Only images may be attached" for non-image |
| N-09 | Paste from clipboard | NSPasteboard + `paste(_:)` First Responder action | `UI/Main/MainWindowController.swift` + `UI/Card/EditCardWindowController.swift` | `⌘V` | none | n/a |
| N-10 | Open file panel | NSOpenPanel | `UI/Card/EditCardView.swift` | "+ Attach" button | user-selected file read | n/a |
| N-11 | Quick Look | QLPreviewPanel | `UI/Card/EditCardView.swift` | `Space` on selected attachment | none (read of cached file) | open via NSWorkspace.open(url:) instead |
| N-12 | Keychain | Security framework | `Keychain/KeychainStore.swift` | login/logout | none for non-sandbox; access-group entitlement for V2 | n/a — error → relogin |
| N-13 | Sleep/wake | NSWorkspace.didWakeNotification | `Networking/WebSocketClient.swift` | system wake | none | n/a |
| N-14 | Theme follow | NSApp.appearance + NSDistributedNotificationCenter "AppleInterfaceThemeChangedNotification" | `App/ThemeManager.swift` | OS theme change | none | n/a |
| N-15 | Login Item (Start at login) | SMAppService.mainApp.register() | `App/AppDelegate.swift` | Preferences toggle | none | toast if registration fails |
| N-16 | Dock policy | NSApp.setActivationPolicy(.regular / .accessory) | `App/AppDelegate.swift` | Preferences toggle | none | n/a |
| N-17 | NSWindow restoration | NSWindow.restorationClass + invalidateRestorableState | `UI/Main/MainWindowController.swift` + `UI/Card/EditCardWindowController.swift` | app quit/launch | none | first-launch defaults |
| N-18 | NSPopover anchored to NSToolbarItem | NSPopover.show(relativeTo:of:preferredEdge:) | `UI/Main/NotificationsPopover.swift`, `WeatherPopover.swift` | toolbar button click | none | n/a |
| N-19 | NSSheet | `.sheet(isPresented:)` on parent window | `UI/Archive/ArchiveSheet.swift` etc | menu / button | none | n/a |
| N-20 | QR generation client-side | CIQRCodeGenerator | `Networking/QRGenerator.swift` | toggle QR in EditCardWindow | none | fallback to `/api/cards/:id/qr.svg` via WKWebView |
| N-21 | NSPasteboard `text/uri-list` for drag-out | NSItemProvider with `.fileURL` or `.url` | `UI/Main/CardTileView.swift` | drag start | none | n/a |
| N-22 | NSColor semantic + custom Color Assets | Asset catalog | `Assets.xcassets/Colors.xcassets` | runtime read | none | n/a |
| N-23 | Inter font loading | CTFontManagerRegisterFontsForURL | `App/AppDelegate.swift` (load on launch) | app launch | none | SF Pro fallback |
| N-24 | NSWorkspace.open(URL) for external links | NSWorkspace.shared.open(url) | `UI/Card/EditCardView.swift` etc | click external link | none | n/a |
| N-25 | Spotlight (V2) | CoreSpotlight | (V2) | card create/update | none | n/a |
| N-26 | App Intents (V2) | AppIntent | (V2) | Shortcuts.app | none | n/a |

### 4.7 WINDOW MANAGEMENT IMPLEMENTATION

For each window from §3.2 — implementation details.

**W-01 Main**
- Defined as a SwiftUI `Scene` with `WindowGroup("Main", id: "main") { MainView() }`.
- Set `.windowToolbarStyle(.unifiedCompact)` and `.commands { AppMenuCommands() }`.
- AppKit interop: in `applicationDidFinishLaunching`, locate the window via `NSApp.windows.first { $0.identifier?.rawValue == "main-AppWindow-1" }` and call `setFrameAutosaveName("KanbanMainWindow")`.
- Min size enforced via `.frame(minWidth: 960, minHeight: 600)`.
- Sidebar toggle uses `NSToolbarToggleSidebarItem` injected via UIRepresentable wrapper.

**W-02 EditCard**
- Programmatic NSWindow creation via `EditCardWindowController(cardId:)`.
- Each instance:
  - `windowAutosaveName = "KanbanEditCard.\(cardId)"`
  - styleMask `[.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView]`
  - contentView = `NSHostingView(rootView: EditCardView(...))`
  - identifier = `"edit-\(cardId)"`
- `WindowCoordinator.shared.openEditCard(id:)` reuses existing window if already open.
- Closing prompts save if dirty (NSAlert with `.warning`).

**W-03 Capture**
- `NSPanel` subclass — `styleMask = [.titled, .closable, .nonactivatingPanel, .fullSizeContentView]` and `becomesKeyOnlyIfNeeded = true` so the user's previous app stays in focus contextually.
- `level = .floating`.
- Centered on main screen on first open.
- Esc dismisses via `NSEvent.addLocalMonitorForEvents(matching: .keyDown)` registered on `windowWillBecomeKey`.

**W-04 Preferences**
- SwiftUI Settings scene: `Settings { PreferencesView() }`. Tab via `TabView { ... .tabItem { ... } }`.
- Width 640 × Height 520 enforced; not resizable (`.windowResizability(.contentSize)`).

**W-05 / W-06 Sheets**
- `.sheet(isPresented:)` on parent window.

**W-07 CardChain (V1)**
- `CardChainWindowController(cardId:)` — analogous to W-02 lifecycle but separate identifier `chain-\(cardId)`.

**W-08 Login**
- `LoginWindowController` — `styleMask = [.titled, .closable]` (not miniaturizable, not resizable).
- Closing terminates app: `NSApplication.shared.terminate(self)`.
- Centers on screen via `window.center()`.

**W-09 Notifications Popover**
- `NSPopover` instance owned by NotificationBellButton.
- `behavior = .transient` — auto-dismiss on outside click.
- Arrow attached to bell toolbar item.

**W-10 Mirror (V2)**
- `MirrorWindowController` — borderless, full-screen, ignores mouse.
- Routed via `kanbanclaude://my-day?token=<token>` URL scheme entry.

**Multi-window state**
- `WindowCoordinator.shared` owns `openCardWindows: [UUID: EditCardWindowController]`.
- On card archive: closes its window.
- On WS `card.deleted` for an open card: shows confirm alert "This card was deleted by someone else. Close window?"

**Window restoration**
- Each NSWindow's `restorationClass = SceneRouter.self`.
- `encodeRestorableState(with:)` saves `cardId`. `restoreWindow(withIdentifier:state:completionHandler:)` decodes and re-creates the controller.

### 4.8 BUILD & DISTRIBUTION PLAN

**Build configurations**

| Configuration | Target | Server | Logging | Codesign | Notarize |
|---|---|---|---|---|---|
| Debug | Local dev | `http://localhost:3001` | verbose | none | NO |
| ReleaseDev | Internal test | `https://kanban.npalakurla.com` | info | ad-hoc | NO |
| Release | Distribution | `https://kanban.npalakurla.com` | info | ad-hoc | NO (MVP); YES (V2 with Developer ID) |

**Build steps (Scripts/build-dmg.sh)**

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. Clean derived data
rm -rf ./DerivedData

# 2. Release build (arm64)
xcodebuild \
  -project macOS/KanbanClaude.xcodeproj \
  -scheme KanbanClaude \
  -configuration Release \
  -destination 'platform=macOS,arch=arm64' \
  -derivedDataPath ./DerivedData \
  build \
  2>&1 | grep -E "error:|\*\* BUILD"

# 3. Strip quarantine
xattr -dr com.apple.quarantine ./DerivedData/Build/Products/Release/KanbanClaude.app

# 4. Ad-hoc sign (no Developer ID — MVP)
codesign --sign - --force --deep ./DerivedData/Build/Products/Release/KanbanClaude.app

# 5. DMG via hdiutil
APP_PATH=./DerivedData/Build/Products/Release/KanbanClaude.app
DMG_PATH=./dist/KanbanClaude-$(date +%Y%m%d).dmg
mkdir -p ./dist
hdiutil create -volname "SmartKanban" -srcfolder "$APP_PATH" -ov -format UDZO "$DMG_PATH"
echo "Built: $DMG_PATH"
```

**Reinstall (Scripts/reinstall.sh)**

```bash
#!/usr/bin/env bash
set -euo pipefail

pkill -x KanbanClaude || true
sleep 1
rm -rf /Applications/KanbanClaude.app
cp -R ./DerivedData/Build/Products/Release/KanbanClaude.app /Applications/
xattr -dr com.apple.quarantine /Applications/KanbanClaude.app
open -a /Applications/KanbanClaude.app
```

**Tail logs (Scripts/tail-logs.sh)**

```bash
#!/usr/bin/env bash
/usr/bin/log show --last 30s \
  --predicate 'subsystem == "com.kanbanclaude.kanbanclaude"' \
  --info --debug 2>&1 | tail -80
```

**Signing (V2)**

For notarized distribution:
- Acquire Apple Developer ID Application certificate ($99/yr Apple Developer Program).
- Codesign: `codesign --sign "Developer ID Application: <Name>" --force --deep --options runtime --entitlements KanbanClaude.entitlements ...`
- Notarize: `xcrun notarytool submit ./dist/KanbanClaude.dmg --apple-id <id> --team-id <id> --password <app-password> --wait`
- Staple: `xcrun stapler staple ./dist/KanbanClaude.dmg`

**Distribution channel**
- GitHub Releases attached to a tag matching `vX.Y.Z`.
- Side-loaded DMG hosted at `https://kanban.npalakurla.com/macos/latest.dmg` (optional V1).
- Release notes published per tag.

**Auto-update (V2)**
- Sparkle 2.x via `https://kanban.npalakurla.com/appcast.xml`. ❗ DO NOT install MVP — adds dependency. V2 only.

**CI (optional, V1)**
- GitHub Actions matrix on `macos-14` runner — runs `xcodebuild test`, builds Release, uploads artifact. Manual release approval gates publication.

---

## 5. IMPLEMENTATION SPEC

### 5.1 COMPONENT IMPLEMENTATION SPECS

Per component from §3.6 — file, props, internal state, hover/focus/keyboard, render, dark-mode, a11y, tests.

#### C-01 `PillButton` (`UI/Components/PillButton.swift`)
- Props: `title: String`, `icon: Image?`, `style: PillStyle` (filledGreen, filledBlack, outlinedGreen, outlinedDark, destructive, onDarkFilled, onDarkOutlined), `size: PillSize` (`.small`/`.regular`/`.large`), `isLoading: Bool`, `action: () -> Void`.
- Internal: `@State private var hovering: Bool` (only used for outlined variants).
- Hover: bg lightens (style-specific). `@Environment(\.colorScheme)` swaps tokens.
- Focus: 2 px violet outline + 2 px offset (matches `:focus-visible` in `web/src/index.css`).
- Keyboard: Enter triggers action when focused; default Button accessibility.
- Dark mode: tokens automatically resolve via Color Assets.
- A11y: `.accessibilityLabel(title)`; `.accessibilityHint("Press to ...")` when `action` is destructive.
- Tests: snapshot per style × per color scheme (8 styles × 2 = 16 snapshots).

#### C-02 `PillTextField` (`UI/Components/PillTextField.swift`)
- Props: `placeholder: String`, `text: Binding<String>`, `onCommit: (() -> Void)?`, `isSecure: Bool` (default false).
- Internal: `@FocusState private var focused`.
- Hover: bg darkens by 5%.
- Focus: border becomes `--green-accent`; outline 2 px violet.
- Keyboard: standard.
- Tests: focus state snapshot; secure-entry roundtrip.

#### C-03 `TagChip` (`UI/Components/TagChip.swift`)
- Props: `text: String`, `color: TagColor` (`.violet/.blue/.teal/.amber/.rose/.stone/.mint`), `onTap: (() -> Void)? = nil`.
- Internal: none.
- Render: capsule bg + fg from token pair (`--tag-X-bg/-fg`).
- A11y: `.accessibilityRole(.button)` if onTap set.

#### C-04 `CardSurface` (`UI/Components/CardSurface.swift`)
- View modifier exposed as `.cardSurface()`.
- Implementation: `.background(Color("paper"))`, `.clipShape(RoundedRectangle(cornerRadius: 10))`, `.overlay(RoundedRectangle.stroke(.gray.opacity(0.08), lineWidth: 1))`, `.shadow(color: .black.opacity(0.04), radius: 2, y: 1)`.

#### C-05 `ModalSurface` modifier
- Same pattern, but `cornerRadius: 14`, larger shadow `--sh-3`.

#### C-06 `ModalHeaderStrip` (`UI/Components/ModalHeaderStrip.swift`)
- Props: `title: String`, `actions: () -> some View`.
- Render: violet rectangle 56 px tall + Inter 16 pt semibold white + trailing action slot.

#### C-07 `ToastOverlay` (`UI/Components/ToastOverlay.swift`)
- Props: bound to `ToastStore` via `@EnvironmentObject`.
- Internal: implicit timers per toast (Combine `Timer.publish(every: 4, on: .main, in: .common)` cancelled on dismiss).
- Render: bottom-right stack, max 5 visible.
- Dismiss: ✕ click OR auto-timeout 4 s.
- A11y: `.accessibilityLiveRegion(.polite)` so VoiceOver reads new toasts.

#### C-08 `AuthenticatedImage` (`UI/Components/AuthenticatedImage.swift`)
- Props: `storagePath: String`, `placeholder: Image = Image(systemName: "photo")`.
- Internal: `@State var image: NSImage?`.
- Render: AsyncImage replacement using URLSession.shared cookie-bearing data task.
- Caches via `AttachmentDownloader.shared`.
- A11y: `.accessibilityLabel(originalFilename ?? "Attachment")`.

#### C-09 `InitialsAvatar` (`UI/Components/InitialsAvatar.swift`)
- Props: `user: User`, `size: CGFloat` (default 18).
- Render: violet circle + white initials (first 2 chars of short_name).
- A11y: `.accessibilityLabel(user.name)`.

#### C-10 `SourceBadge` (`UI/Components/SourceBadge.swift`)
- Props: `source: Card.Source`.
- Render: glyph (✈ for telegram, none for manual/mirror).
- Hidden if `source == .manual`.

#### C-11 `DueDateChip` (`UI/Components/DueDateChip.swift`)
- Props: `date: Date`, `serverSkew: TimeInterval`.
- Render: dot + relative text ("in 2d" / "today" / "overdue 3d").
- Color: depends on urgency: red if overdue, gold if today, ink-2 if future, ink-3 if far future.

#### C-12 `ScopeSegmentedControl` (`UI/Components/ScopeSegmentedControl.swift`)
- Picker(`selection: scope`) `.pickerStyle(.segmented)` with 4 cases.

#### C-13 `SearchToolbarItem` (`UI/Components/SearchToolbarItem.swift`)
- `NSSearchToolbarItem` wrapped via `NSViewRepresentable`.
- Binding: `text: Binding<String>`.
- Submits on Enter (no-op — live filter).
- Esc clears + blurs.

#### C-14 `DragGhost` (`UI/Components/DragGhost.swift`)
- Mini CardTileView with opacity 0.85, scale 0.97, rotated 1°.
- Rendered into `DragOverlay` controlled by `DragStore`.

#### C-15 `CardTileView` — implements §3.7 V-09
- Props: `card: Card`, `users: [User]`, `unread: Int = 0`, `compact: Bool = false`, `onClick: () -> Void`.
- Internal: `@State private var hovering = false`.
- Hover: y=-2 px + shadow `--sh-2` (respect `accessibilityReduceMotion`).
- Click → `onClick()`.
- Drag handle: entire view; uses `.draggable(card.deepLinkURL) { DragGhost(card: card) }` for cross-app drag.
- Inside-app drag handled by `DragStore` via `.onDrag { DragStore.shared.beginDrag(card) ; return NSItemProvider(...) }`.
- Right-click: `.contextMenu { CardContextMenu(card: card) }`.
- A11y: composed label "<title>. Status <statusLabel>. <N> tags. Due <relativeDate>. <Nu> unread."
- Tests: snapshot (8 variations of state: needs_review, ai_summarized, with insight, with attachment, etc).

#### C-16 `BoardColumnView` — implements column rendering
- Props: `status: Status`, `cards: [Card]`, `users: [User]`, `unreadCounts: [UUID: Int]`, `onCreate: (Status) -> Void`, `onEdit: (Card) -> Void`, `onDelete: (Card) -> Void`.
- Internal: drop-target indicator state.
- ScrollView { LazyVStack { ForEach(cards, id: \.id) { CardTileView(...) } } }
- Drop target: `.onDrop(of: ["public.text"], delegate: ColumnDropDelegate(status:))` — handles inbound card drops with position calculation via midpoint.
- Empty state below: italic ink-3 text + slide-in animation.
- Header: status pill + count chip + "+" button (rotate 90° on hover).

#### C-17 `BoardView` — implements §3.7 V-02
- Props: bound to `CardStore`, `BoardScopeStore`, `UserListStore`, `UnreadStore`.
- Layout: HStack { ForEach(STATUSES) { BoardColumnView } }.
- Trash drop zone overlay: position bottom-right; conditional on `DragStore.isDragging`.
- Activity ticker (V1) above grid.

#### C-18 `BoardToolbar` — implements §3.7 V-03
- `ToolbarContent` with placement `.navigation`, `.principal`, `.primaryAction`.

#### C-19 `LoginView` — implements §3.7 V-01
- Props: `redirectTo: String? = nil`.
- Internal: `@State` for mode, fields, error, busy.
- Validation: short_name 1..16 chars; password ≥6.
- Submit: calls AuthStore.login/register.

#### C-20 `EditCardView` — implements §3.7 V-10
- Largest component. Props: `cardId: UUID`. Reads from `CardStore`.
- Internal: dirty state, debounced patch timer, QR popover visibility, chain window launch.
- Splits the body into sub-views: `EditTitleField`, `EditDescriptionField`, `EditTagsField`, `EditDueDateField`, `AttachmentsGrid`, `AssigneePillRow`, `SharePillRow`, `KnowledgeLinksSection`, `AiInsightsPanelView`, `RelatedCardsView (V1)`, `CardTimelineView`.
- Save action: collects patch dictionary, calls `CardStore.update(id:patch:)`.

#### C-21 `AiInsightsPanelView` — implements §3.7 V-11
- Props: `cardId: UUID`. Reads `InsightStore`.
- Behaviors: brainstorm → POST; re-run → POST; pending → spinner; ok → render; failed → retry.

#### C-22 `CardTimelineView` — implements §3.7 V-12
- Props: `cardId: UUID`. Reads from `CardEventStore`.
- Auto-scroll to bottom on new events.
- Mark read on scroll bottom.

#### C-23 `ChatInputView` — implements §3.7 V-13
- TextField + Send button.

#### C-24 `KnowledgeListView`, `KnowledgeRowView`, `KnowledgeDetailView`, `KnowledgeEditSheet`
- Standard list/row/detail/sheet pattern. Reads from `KnowledgeStore`.

#### C-25 `CaptureView` — implements §3.7 V-08
- Props: `initialStatus: Status`. Auto-focuses TitleField via `@FocusState`.
- Calls `CardStore.create(...)` on submit.
- Template autocomplete via `/` prefix.

#### C-26 `PreferencesView` — implements §3.8
- TabView with 5 tabs.

#### C-27 Activity / Weather / Notification / Trash / Toast — implements §3.7 V-06, V-20, V-21, V-24, V-25.

### 5.2 VIEW IMPLEMENTATION SPECS (data fetching wiring)

Per MVP view from §3.7:

| View | File | Data fetch on appear | Data fetch on action | Mutations | Local state | Keyboard | Drag-drop | Context menu | Selection |
|---|---|---|---|---|---|---|---|---|---|
| V-01 LoginView | `UI/Auth/LoginView.swift` | `AuthStore.bootstrap()` (calls /auth/me) | login/register submit | POST /auth/login or /auth/register | mode, fields, busy, err | Enter submit; Esc terminates | none | none | tab cycle |
| V-02 MainView (Board) | `UI/Main/MainView.swift` | `CardStore.refresh(scope:)`, `UserListStore.refresh()`, `UnreadStore.refresh()` | scope/search changes | PATCH /cards/:id (drag-move) | section, scope, search | `⌘F` focus search; `⌘1..⌘4` scroll columns | drop image → create from image | column header CM | active card |
| V-03 BoardToolbar | `UI/Main/BoardToolbar.swift` | (driven by stores) | (driven by stores) | scope change → CardStore.refresh | none | (passes to MainView) | none | profile CM | — |
| V-06 Notifications | `UI/Main/NotificationsPopover.swift` | `NotificationStore.refresh()` | row click → markRead | PUT /notifications/read | open, hovered | ↑/↓ navigate, Enter open | none | row CM | — |
| V-08 Capture | `UI/Capture/CaptureView.swift` | `TemplateStore.refresh()` if not cached | template `/slash` autocomplete | POST /cards or /cards/from-image or instantiate | text, target | Enter submit, Esc dismiss | image paste → from-image | none | — |
| V-09 CardTileView | (in BoardColumnView) | none (props) | none | none | hovering | none | drag to column / trash / out-of-app | card CM | — |
| V-10 EditCardView | `UI/Card/EditCardView.swift` | `CardStore.get(id:)`, `CardEventStore.refresh(cardId:)`, `KnowledgeStore.linkedToCard(cardId:)` | save → PATCH; brainstorm → POST | PATCH /cards/:id | dirty, debounce timer | `⌘S`, `⌘B`, `⌘W`, `⌘Y`, `⌃1..⌃4` | file → attach | attachment CM | attachment selection |
| V-11 AI Insights | `UI/Card/AiInsightsPanelView.swift` | `InsightStore.list(cardId:)` | brainstorm → POST | POST /cards/:id/insights/brainstorm | submitting, err | (passes to parent) | none | none | none |
| V-12 Card Timeline | `UI/Card/CardTimelineView.swift` | `CardEventStore.refresh(cardId:)` + WS subscribe | mark read on scroll bottom | PUT /cards/:id/events/read | open, scrollState | scroll keys; Enter in ChatInput | none | none | none |
| V-13 ChatInput | `UI/Card/ChatInputView.swift` | (no fetch) | submit → POST | POST /cards/:id/messages | text, busy | Enter submit | none | none | none |
| V-14 Knowledge | `UI/Knowledge/KnowledgeListView.swift` | `KnowledgeStore.refresh(scope:q:tag:)` | scope/q/tag changes | none here | scope, q, tag | `⌘F` focus search | none | row CM | — |
| V-15 KnowledgeRow | (in list) | none | click → open detail | none | hovering | Enter open | drag to card → link | row CM | — |
| V-16 KnowledgeDetail | `UI/Knowledge/KnowledgeDetailView.swift` | linked cards via `CardStore.byIds(item.linked_card_ids)` | actions | PATCH /knowledge/:id, etc | picker open | Esc dismiss | none | none | — |
| V-17 KnowledgeEditSheet | `UI/Knowledge/KnowledgeEditSheet.swift` | none | save | POST /knowledge or PATCH | form fields | Esc cancel | none | none | — |
| V-18 ArchiveSheet | `UI/Archive/ArchiveSheet.swift` | `CardStore.refreshArchived()` | restore / permanent / purge | PATCH/DELETE /cards/:id/restore /permanent /purge | restoring, deleting | Esc dismiss | none | row CM | — |
| V-21 Toast | (overlay) | (no fetch) | dismiss | none | timers | ✕ click | none | none | — |
| V-25 Weather (V1) | `UI/Main/WeatherPopover.swift` | `WeatherStore.refresh()` (Open-Meteo, ipapi.co) | none | none | open | (none) | none | none | — |

### 5.3 NATIVE COMMAND SPECS (TauriCommand-equivalent — native callable Swift functions)

For each native operation:

| ID | Name | File | Inputs | Outputs | Side effects | Used by |
|---|---|---|---|---|---|---|
| CMD-01 | `Keychain.save(token:)` | `Keychain/KeychainStore.swift` | `String` | throws | SecItemAdd | AuthStore on login |
| CMD-02 | `Keychain.load() -> String?` | same | — | `String?` | SecItemCopyMatching | AuthStore on launch |
| CMD-03 | `Keychain.delete()` | same | — | throws | SecItemDelete | AuthStore on logout |
| CMD-04 | `Pasteboard.readImage() -> NSImage?` | `App/PasteboardBridge.swift` | — | `NSImage?` | none | EditCardWindow paste, MainWindow paste |
| CMD-05 | `Pasteboard.writeURL(_:)` | same | URL | — | sets pasteboard | Copy link action |
| CMD-06 | `OpenPanel.pickImage() async -> URL?` | `App/OpenPanelBridge.swift` | — | `URL?` | shows NSOpenPanel | Attach file menu |
| CMD-07 | `Notifications.scheduleLocal(title:body:cardId:)` | `App/NotificationCenterBridge.swift` | strings + UUID | — | UNUserNotificationCenter.add | WS message handler |
| CMD-08 | `Notifications.requestPermission() async -> Bool` | same | — | `Bool` | UN permission prompt | App launch (first time) |
| CMD-09 | `StatusItem.setBadgeCount(_:)` | `App/StatusItemController.swift` | Int | — | NSStatusItem.button.attributedTitle | UnreadStore observer |
| CMD-10 | `Dock.setBadge(_:)` | same | Int | — | NSApp.dockTile.badgeLabel | UnreadStore observer |
| CMD-11 | `WindowCoordinator.openEditCard(id:)` | `App/WindowCoordinator.swift` | UUID | NSWindowController | activates existing or creates | Click card, deep-link, notification tap |
| CMD-12 | `WindowCoordinator.openCapture()` | same | — | NSWindowController | shows NSPanel | `⌘N` |
| CMD-13 | `WindowCoordinator.openPreferences(_:)` | same | tab? | — | shows W-04 | `⌘,` |
| CMD-14 | `WindowCoordinator.openArchive()` | same | — | NSWindowController (sheet) | shows W-05 | menu / sidebar |
| CMD-15 | `Theme.set(_:)` | `App/ThemeManager.swift` | enum | — | NSApp.appearance + UserDefaults | Preferences toggle |
| CMD-16 | `URLScheme.handle(_:)` | `App/URLSchemeHandler.swift` | URL | — | route to window | NSAppleEventManager |
| CMD-17 | `QRGenerator.svg(for:)` | `Networking/QRGenerator.swift` | URL | `NSImage` | none | EditCardWindow QR popover |
| CMD-18 | `AttachmentDownloader.fetch(_:)` | `Networking/AttachmentDownloader.swift` | storagePath | `NSImage` | URLSession + cache | AuthenticatedImage |
| CMD-19 | `ServerTime.now()` | `Networking/ServerTime.swift` | — | Date | none | DueDateChip, ActivityTicker |
| CMD-20 | `LoginItem.setEnabled(_:)` | `App/AppDelegate.swift` | Bool | throws | SMAppService.register/unregister | Preferences toggle |
| CMD-21 | `Sound.beep()` (V2) | — | — | — | NSBeep | error fallback |

### 5.4 MENU IMPLEMENTATION

Each item in §3.3 gets a constant ID and handler. SwiftUI `.commands { ... }` block uses `CommandMenu("Card")`, etc. Identifiers:

```swift
enum MenuID: String {
    case fileNew = "kc.file.new"            // ⌘N
    case fileNewFromClipboard = "kc.file.newFromClipboard"  // ⌥⌘N
    // ... one per row in §3.3
}
```

Each handler hangs off:
- `SceneRouter.shared.openCapture()` for new
- `WindowCoordinator.shared.openPreferences(nil)` for `⌘,`
- `CardStore.shared.archive(id:)` for `⌘⌫` (only when EditCard window key)
- `InsightStore.shared.brainstorm(cardId:)` for `⌘B`
- `ThemeManager.shared.cycle()` for `⌥⌘T`
- `AuthStore.shared.signOut()` for File > Sign Out
- `BoardScopeStore.shared.setScope(.personal/.inbox/.all/.shared)` for scope shortcuts
- `BoardScopeStore.shared.scrollTo(column:)` for `⌘⇧1..⌘⇧4`

`Enabled-when` is implemented via `@FocusedValue` to determine which window is key. Example:

```swift
struct FocusedCardKey: FocusedValueKey { typealias Value = UUID }
extension FocusedValues { var focusedCardId: UUID? { ... } }
```

So `CommandMenu("Card")` only enables items when `focusedValues.focusedCardId != nil`.

### 5.5 KEYBOARD SHORTCUT IMPLEMENTATION

Most shortcuts are registered as `KeyboardShortcut(...)` on SwiftUI `Button` inside `.commands {}`. Non-menu shortcuts (e.g. ↑/↓ in notification list, Tab cycling) are local. Conflicts checked against macOS reserved shortcuts via NSMenu validation.

For global hotkey support (V1 — invoke Capture from any app, even when main window backgrounded), use Carbon `RegisterEventHotKey` in `ShortcutManager.swift`. Default shortcut: `⌃⌥⌘K`. User-configurable.

### 5.6 STATE MANAGEMENT

| Store | File | Type | Persistence | Notes |
|---|---|---|---|---|
| AuthStore | `Stores/AuthStore.swift` | `@MainActor class ObservableObject` | Keychain (token) + UserDefaults (cached User JSON, non-sensitive) | bootstrap on launch |
| CardStore | `Stores/CardStore.swift` | `@MainActor class ObservableObject` | none (in-memory; refetch on scope change) | dict `[UUID: Card]` + per-scope indices |
| TemplateStore | `Stores/TemplateStore.swift` | same | none | sorted shared-first |
| KnowledgeStore | `Stores/KnowledgeStore.swift` | same | none | single-key cache like web |
| InsightStore | `Stores/InsightStore.swift` | same | none | per-card list (limit 10) |
| CardLinkStore | `Stores/CardLinkStore.swift` | same | none | per-card list + related |
| NotificationStore | `Stores/NotificationStore.swift` | same | none | last 100 |
| UnreadStore | `Stores/UnreadStore.swift` | same | none | observed by Dock + Status Item |
| ToastStore | `Stores/ToastStore.swift` | same | none | queue + timers |
| WeatherStore | `Stores/WeatherStore.swift` | same | UserDefaults `weather_cache` (30 min TTL) | external Open-Meteo |
| UserListStore | `Stores/UserListStore.swift` | same | none | refresh on login |
| DragStore | `Stores/DragStore.swift` | same | none | active drag |
| BoardScopeStore | `Stores/BoardScopeStore.swift` | same | UserDefaults `lastScope`, `lastSearch.<scope>` | survives launches |

**UserDefaults keys** (persisted):
- `theme` — "light" / "dark" / "system"
- `lastScope` — "personal" / "inbox" / "all" / "shared"
- `lastSearch.personal` / `lastSearch.inbox` / `lastSearch.all` / `lastSearch.shared` — last query per scope
- `startAtLogin` — Bool
- `showInMenuBar` — Bool
- `hideDockIcon` — Bool
- `lastUserJSON` — JSON of `{id, name, short_name, email}` (id-only used for cold-start hint)
- `weather_cache` — `{data, ts}` JSON

**In-memory state**:
- Anywhere a `@State` would suffice (e.g. window-local form state)
- Use `@StateObject` for view-owned stores; `@EnvironmentObject` for app-wide.

### 5.7 DESKTOP LAYOUT WRAPPER

Top-level scene hierarchy in `KanbanClaudeApp.swift`:

```swift
@main
struct KanbanClaudeApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject var auth = AuthStore.shared
    @StateObject var cards = CardStore.shared
    // etc

    var body: some Scene {
        WindowGroup("KanbanClaude", id: "main") {
            if auth.isAuthed {
                MainView()
                    .environmentObject(cards)
                    // ... other stores
            } else {
                LoginView()
                    .environmentObject(auth)
            }
        }
        .windowToolbarStyle(.unifiedCompact)
        .commands { AppMenuCommands() }
        .defaultSize(width: 1280, height: 800)

        Settings { PreferencesView() }
    }
}
```

`AppDelegate` orchestrates AppKit-only concerns: NSStatusItem, URL scheme registration, font loading, NSAppleEventManager. NSWindow autosave applied in `applicationDidFinishLaunching` once the SwiftUI windows have been created.

### 5.8 BUILD ORDER — PHASE PLAN

**Phase 0 — Prereqs (1 day)**
- Create Xcode project under `macOS/`.
- Bundle ID, Info.plist, entitlements per §4.4.
- Load Inter / Spectral / JetBrainsMono fonts from `Resources/Fonts/`.
- Add Asset catalogs (Colors, AppIcon placeholder).
- Build target arm64 macOS 13.3.
- `Scripts/build-dmg.sh`, `reinstall.sh`, `tail-logs.sh` wired.
- Health-check: `xcodebuild build` succeeds; app opens to empty window; `log show ... subsystem == kBundleID` emits one line.

**Phase 1 — Foundation (3 days)**
- APIClient + Endpoint enum + Codables for User, Card, Attachment.
- WebSocketClient + BroadcastEventDecoder + BroadcastDispatcher.
- AuthStore + Keychain + LoginWindow.
- ThemeManager + Color Assets.
- Toast + ToastStore.
- Smoke test: log in to `kanban.npalakurla.com`, log out, observe Toast.
- Rule 1 preflight executed for `/auth/me`, `/auth/login`, `/auth/logout`, `/auth/register`, `/users`.

**Phase 2 — Design System (3 days)**
- PillButton, PillTextField, TagChip, CardSurface, ModalSurface, ModalHeaderStrip, InitialsAvatar, SourceBadge, DueDateChip, AuthenticatedImage.
- Snapshot tests for each (light + dark).
- Audit registry rows F-001..F-018 + F-482..F-487 (Login + Toast) — mark ✅ where verified.

**Phase 3 — Auth (1 day)**
- LoginView feature-complete per V-01.
- Registration mode parity.
- redirectTo support (deep link).
- Audit rows F-001..F-018, F-488..F-507.

**Phase 4 — Core MVP Views (12 days)**
- Phase 4a — Board (3 days): MainView, MainToolbar, BoardSidebar, BoardView, BoardColumnView, CardTileView (no drag). Audit F-019..F-040, F-041..F-049, F-102..F-110.
- Phase 4b — Drag-drop (2 days): DragController, drop handlers, TrashDropZoneOverlay, midpoint math, optimistic + WS reconcile. Audit F-111..F-131, F-840..F-842.
- Phase 4c — CardView details (2 days): badges, thumbnails, due dot, assignee/share initials, hover effects, context menu. Audit F-132..F-167.
- Phase 4d — EditCardWindow (3 days): full editor, debounced patch, save, QR popover. Audit F-168..F-217.
- Phase 4e — Capture panel (1 day): NSPanel, `⌘N`, paste, template autocomplete. Audit F-390..F-411.
- Phase 4f — CardTimeline + ChatInput (1 day): scroll, mark-read, `@ai`. Audit F-273..F-301.

**Phase 5 — Native Integrations (5 days)**
- StatusItem (NSStatusBar). Audit F-031, F-062..F-082 (the desktop notification arm).
- UNUserNotificationCenter for WS-driven banners.
- Dock badge.
- Window restoration.
- Sleep/wake reconnect.
- URL scheme handler.
- Drag-from-Finder + paste-image. Audit F-635..F-651.
- Quick Look (V1).
- Open file panel.
- Audit F-713..F-723.

**Phase 6 — Preferences (2 days)**
- PreferencesView with 5 tabs.
- Theme, Account, Tokens, Telegram, Templates (V1).
- Audit F-412..F-460, F-705..F-712.

**Phase 7 — AI + Knowledge + Notifications (5 days)**
- AiInsightsPanel + brainstorm. Audit F-218..F-237.
- KnowledgeListView + Row + Detail + Edit. Audit F-302..F-359.
- NotificationBell + popover. Audit F-062..F-082.

**Phase 8 — Polish (4 days)**
- Archive sheet. Audit F-360..F-378.
- Weekly Review (V1). Audit F-379..F-389.
- Activity ticker (V1). Audit F-091..F-101.
- Weather widget (V1). Audit F-050..F-061.
- Related cards + Link picker + Card Chain (V1). Audit F-238..F-272.
- Final per-screen screenshot diff (Rule 14).

**Phase 9 — Testing (5 days)**
- Unit + integration tests (§6.2..6.3).
- E2E smoke (§6.4).
- macOS-specific scenarios (§6.5).
- Performance + a11y (§6.6..6.7).
- Audit any 🚫 row justifications.

**Phase 10 — Build & Ship (2 days)**
- Final Release build.
- DMG.
- Release notes.
- Tag `v1.0.0` on git.
- Hand-off doc updated.

**Estimated total: 45 days** (Phase 4 dominates; Phase 5 + 7 + 8 partially parallelizable).

---

## 6. TEST PLAN

### 6.1 TEST MATRIX

**Hardware**

| Model | Chip | OS | Memory | Display | Notes |
|---|---|---|---|---|---|
| MacBook Air M1 | M1 | 13.3 Ventura | 8 GB | built-in 13.3" Retina | minimum spec |
| MacBook Air M1 | M1 | 14.4 Sonoma | 8 GB | external Studio Display | external display path |
| MacBook Pro M2 | M2 | 13.3 | 16 GB | built-in 14" + notch | notch layout |
| MacBook Pro M3 | M3 | 14.0 | 16 GB | built-in 16" | high-DPI |
| Mac Mini M2 | M2 | 13.3 | 16 GB | LG 27" 4K | external-only |
| Intel MacBook Pro 2019 | x86_64 | 13.3 | 16 GB | built-in | Rosetta path (V2) |

Minimum requirement: macOS 13.3 / Apple Silicon / 8 GB / Retina or HiDPI.

**Display configurations**

- Built-in Retina single display
- External Studio Display (5K) single
- Built-in + external mirrored
- Built-in + external extended
- Multi-monitor extended
- 16:10 vs notch (14"/16" MBP)

**OS versions**

- 13.3 Ventura (minimum, locked)
- 13.6
- 14.0 Sonoma
- 14.5
- 15.x Sequoia (smoke only — released after planning; not blocking)

### 6.2 UNIT TESTS

Per component / class:

| File | Tests | Why |
|---|---|---|
| `CodableMirrorTests.swift` | 19 Codable round-trips (one per server response shape) | Rule 2 — server JSON ⇄ Swift struct verbatim. Reference response payloads captured from local prod via curl, persisted as fixtures. |
| `VisibilityPredicateTests.swift` | 16 cases of card visibility (creator, assignee, share, unassigned, intersections) | Rule per §1.7.1 |
| `PositionMathTests.swift` | midpoint of two doubles; insertion at top (min-1); precision-drift detection | C1 from §1.8 |
| `DragControllerTests.swift` | drag begin/cancel/drop within column, across columns, to trash | C1 |
| `BroadcastDispatcherTests.swift` | parses each of 19 BroadcastEvent types; mis-typed events drop silently | §1.4 WS |
| `WebSocketReconnectTests.swift` | backoff schedule 500→1k→2k→4k→8k→10k; reset on success; wake notification triggers reconnect | §4.5 |
| `KeychainStoreTests.swift` | save → load → delete round-trip; load when missing returns nil | §4.4 |
| `ServerTimeSkewTests.swift` | applies skew correctly; surfaces `now()` corrected | §1.7.19 |
| `ThemeManagerTests.swift` | persist + recall light/dark/system; NSApp.appearance applied | §3.1, §5.6 |
| `ToastStoreTests.swift` | enqueue, auto-dismiss after 4 s, max-visible 5, manual dismiss | §3.7 V-21 |
| `UnreadStoreTests.swift` | WS message increments, markRead clears, never decrements optimistically | §1.7.7 |
| `URLSchemeHandlerTests.swift` | parses `kanbanclaude://card/<uuid>`, malformed → no-op | §4.6 N-06 |
| `EndpointTests.swift` | every Endpoint case builds correct URLRequest path + method + body | Rule 1 |
| `QRGeneratorTests.swift` | CIQRCodeGenerator output matches deep-link URL | C8 |
| `AttachmentDownloaderTests.swift` | cache hit/miss + LRU + cookie attached | §4.6 N-18 |
| `OptimisticReconcileTests.swift` | optimistic mutation followed by WS broadcast yields single card state | C2 |

Run via `xcodebuild test -scheme KanbanClaude` and `swift test` for any future SPM modules.

### 6.3 INTEGRATION TESTS

| File | Path under test | Strategy |
|---|---|---|
| `AuthFlowTests.swift` | login → me → logout | Mock server via `URLProtocol` subclass returning canned JSON; verify token saved to Keychain. |
| `CardCRUDFlowTests.swift` | createCard → updateCard → archiveCard → restoreCard → permanentDelete | Same mock-protocol stack. |
| `WSEventApplyTests.swift` | inbound `card.created/updated/deleted/message/ai_response` mutate CardStore + NotificationStore | Inject events into BroadcastDispatcher; assert store state. |
| `BrainstormFlowTests.swift` | POST → 202 → WS `insight.queued` → WS `insight.updated(ok)` | |
| `KnowledgeFlowTests.swift` | create → auto-fetch pending → fetch ok WS event → render | |
| `ChatFlowTests.swift` | post message → WS `card.message` → unread increments → markRead clears | |
| `TemplateInstantiateTests.swift` | instantiate → optimistic card with due_date anchored | |
| `OpenSignupGuardTests.swift` | OPEN_SIGNUP=false post-first-user → register fails 403, UI shows error | |

### 6.4 E2E TEST SCRIPTS

**Framework choice:** `XCUITest` (built-in to Xcode). Three E2E suites under `KanbanClaudeUITests/`:

| Test | Steps | Expected | Failure mode |
|---|---|---|---|
| **E-01 Login + Board** | Launch app → enter email/password → submit → see 4 columns. | `app.windows["Main"]` exists; `app.collectionViews["BoardColumn-today"]` non-empty within 2 s. | Toast shows error. |
| **E-02 Create card** | `⌘N` → type "Test card from E2E" → Enter → assert visible in Today column → `⌘W` close capture. | Card with title appears in column. | Optimistic insert visible ≤200 ms. |
| **E-03 Drag card** | Drag card from Today → In Progress. | Card visible in In Progress within 500 ms; WS reconcile completes 1.5 s. | DragController state cleaned. |
| **E-04 Paste image** | Put PNG on pasteboard (programmatically) → bring app to front → `⌘V`. | New card appears with needs_review chip; AI-rewrite arrives within 10 s. | Disable if no AI key. |
| **E-05 Edit card** | Click card → Edit window opens → change title → `⌘S`. | WS broadcast updates board. | Save disabled if not dirty. |
| **E-06 Knowledge create** | `⇧⌘N` → fill form with URL → Save. | Knowledge appears in list; ⏳ chip → ✓ within 10 s (auto-fetch). | If URL bad, ⚠ chip + tooltip. |
| **E-07 Chat + notification** | Open card in window 1 → close → on second account post message → assert UN banner shows. | Banner text matches preview. | Use second mock account. |
| **E-08 Sleep/wake** | Programmatically post `NSWorkspace.didWakeNotification` → WS reconnects ≤3 s. | New events arrive after wake. | Backoff verified. |
| **E-09 Multi-window** | Open 3 cards via context menu "Open in new window" → edit each. | All 3 windows reflect WS broadcasts. | No deadlock; main actor isolated. |
| **E-10 Quit + relaunch restore** | Open 2 cards → quit → relaunch. | Both windows reopen at last positions. | NSWindow.restorationClass works. |
| **E-11 Search** | `⌘F` → type "buy" → assert filtered cards. | All matching cards visible; non-matching hidden. | Search field focus + filter ≤100 ms. |
| **E-12 Theme toggle** | Preferences → Theme → Dark → assert window dark. | Color tokens swap. | Live, no relaunch. |
| **E-13 Logout + relogin** | File → Sign Out → assert Login window → log in again. | Board re-renders. | Keychain cleared. |
| **E-14 URL scheme deep link** | `open kanbanclaude://card/<uuid>` from terminal → assert Edit window opens for that card. | Window opens within 1 s. | If not authed, Login first. |

### 6.5 MACOS-SPECIFIC SCENARIOS

| ID | Scenario | Pass criterion |
|---|---|---|
| MS-01 | Cold start | Board visible ≤2.0 s on M1 |
| MS-02 | Sleep ≥10 min → wake | WS reconnect ≤3 s; banner notifications resume |
| MS-03 | Window resize 960 → 1920 | No layout glitches; columns reflow |
| MS-04 | Full screen toggle | Toolbar hides; Esc still dismisses sheets |
| MS-05 | All keyboard shortcuts | Each shortcut from §3.4 fires the expected action; menu items show shortcut |
| MS-06 | Context menus on every card / column / knowledge row / notification / attachment | All actions per §3.5 work |
| MS-07 | Dark mode | All colors swap; no white-flash on app launch |
| MS-08 | Light mode | Same |
| MS-09 | External display | Window can be moved to external; toolbar correct |
| MS-10 | MBP notch | Toolbar items respect notch (NSApp's safe-area handled) |
| MS-11 | VoiceOver | All interactive elements labeled; navigation cycles through |
| MS-12 | Large text (Settings → Display → Larger Text) | Text scales; no truncation in critical labels |
| MS-13 | Drag .png from Finder onto card window | Attaches |
| MS-14 | Drag .pdf from Finder onto card window | Toast "Only images may be attached" |
| MS-15 | `kanbanclaude://card/<uuid>` deep link from Mail/Messages | Opens EditCardWindow |
| MS-16 | App quit while WS is mid-receive | No hang; clean exit |
| MS-17 | Click menubar status item | Popover opens; capture from menubar works |
| MS-18 | Dock right-click "Quit" | Quit succeeds with open windows |
| MS-19 | Force-quit (kill -9) | Relaunch restores via NSWindow restoration |
| MS-20 | Activity Monitor — idle for 1 h | CPU ≤ 1% average; memory ≤ 200 MB |
| MS-21 | Paste image from Safari | New card from image with AI title |
| MS-22 | Paste text from Notes | If no card open: NO card created (text paste should ONLY work when text field focused) |
| MS-23 | Locale: Spanish | UI labels stay English (V2 i18n); date formats follow OS |
| MS-24 | 24-bit color limited monitor | Vibrancy degrades gracefully |
| MS-25 | Reduce Motion accessibility setting | Hover lift disabled; ticker static |
| MS-26 | Reduce Transparency accessibility setting | Vibrancy disabled; solid bg |
| MS-27 | Increase Contrast | Border opacities boosted |
| MS-28 | High CPU load on server (slow `/api/cards`) | Skeleton state remains; toast on timeout (10 s) |
| MS-29 | Network drop (Wi-Fi off) mid-edit | Optimistic state held; reconnect on Wi-Fi return |
| MS-30 | Token expired (server returns 401 mid-session) | Drop to Login window; restore on next login |

### 6.6 PERFORMANCE BENCHMARKS

| Metric | Target | Measurement |
|---|---|---|
| Cold launch to Board paint (M1, 8 GB) | < 2.0 s | os_signpost from `applicationDidFinishLaunching` to first non-skeleton CardTileView |
| Column scroll | 60 fps with 200 cards | `Instruments.app` Time Profiler |
| Memory idle (10 min after launch) | < 200 MB resident | Activity Monitor |
| Memory under load (50 cards open + 4 EditWindows) | < 400 MB | same |
| CPU idle | < 1% average | same |
| Capture panel open | < 250 ms | os_signpost |
| Drag → optimistic update | < 500 ms | os_signpost |
| Drag → WS reconcile | < 1.5 s (LAN) | os_signpost |
| Brainstorm result | < 30 s (`BRAINSTORM_TIMEOUT_MS`) | os_signpost |
| Push-to-notification-visible | < 2 s after server broadcast | os_signpost |
| WS handshake | < 800 ms (LAN) | URLSessionMetrics |
| WS reconnect | < 3 s | os_signpost |
| Search filter latency | < 100 ms / keystroke | Instruments |
| Binary size (arm64) | ≤ 25 MB | `du -sh KanbanClaude.app` |
| Binary size (universal V2) | ≤ 40 MB | same |
| App icon resolution | 1024×1024 master | inspection |

### 6.7 ACCESSIBILITY CHECKLIST

- VoiceOver labels on every interactive control (Button, Toggle, TextField, custom views via `.accessibilityLabel`).
- Keyboard-only navigation: every action reachable via Tab / Shift-Tab / Enter / Esc / arrow keys.
- Focus indicators visible: 2 px violet outline + 2 px offset (matches web).
- Touch targets ≥ 28 × 28 (hover targets); macOS doesn't enforce 44 pt like iOS but match HIG.
- Color contrast: text-on-bg ≥ 4.5:1 (AA); UI controls ≥ 3:1.
- Dark + Light + High Contrast all meet AA.
- Increase Contrast setting boosts hairlines from 0.06 to 0.18 opacity.
- Reduce Motion: hover lift, drag ghost animation, ticker scroll, modal-in animations disabled.
- Reduce Transparency: vibrancy `.thinMaterial` swapped to opaque equivalent.
- Larger Text: respects user font size preference via dynamic type or `Font.body` etc.
- Screen reader announcements for: card moved, card archived, message received, brainstorm complete, toast (live region `.polite`).
- VoiceOver rotor includes "Cards" custom rotor that walks all visible cards in board.
- Audit run with Accessibility Inspector in Xcode — zero warnings before MVP ship.

---

## 7. REVIEW & CONFLICT RESOLUTION

### 7.1 CONFLICTS FOUND

| ID | Conflict | Sections | Resolution |
|---|---|---|---|
| CF-01 | Section 3 specifies "Capture panel" with `⌘N` as floating NSPanel; Section 4 lists W-03 as `.nonactivatingPanel`. Section 5 menu has `File > New Card… ⌘N`. | §3.2 W-03, §3.3 File menu, §4.7 | RESOLVED: NSPanel with `.nonactivatingPanel` (so user's previous app stays focused for quick capture); `⌘N` is global via Carbon hotkey in V1, NSMenu shortcut in MVP. |
| CF-02 | `⌘1..⌘4` scope vs column conflict. §3.4 had `⌘⇧1..⌘⇧4` for columns and `⌃⌘P/I/A/H` for scope, but §2.4 (MVP) listed `⌘1..⌘4` for scope. | §2.4, §3.3, §3.4 | RESOLVED: scope = `⌃⌘P/I/A/H`; columns = `⌘⇧1..⌘⇧4`; sections (Board / Knowledge / Archive) = `⌘1 / ⌘2 / ⌘3`. §2.4 corrected during synthesis. |
| CF-03 | QR code: Section 3.7 V-22 says client-side via CIQRCodeGenerator; Section 1.8 C8 listed two options. | §1.8 C8, §3.7, §5.3 | RESOLVED: MVP uses client-side CIQRCodeGenerator (CMD-17). Server SVG endpoint exists as fallback but not used by macOS by default. |
| CF-04 | Push notifications: §0 says no VAPID for MVP; §1.7.5 web behavior fans out push. §4.6 N-05 says UN local notification. | §0, §1.7.5, §4.6 | RESOLVED: macOS app does NOT subscribe to server push (VAPID). It receives WS `card.message` / `card.ai_response`, then schedules a local `UNNotificationRequest`. Push subscribe endpoints exist on the server but macOS does not call them. |
| CF-05 | Section 5 Phase 5 includes NotificationBell; Section 5 Phase 7 also lists NotificationBell. | §5.8 | RESOLVED: Phase 5 builds the underlying UN bridge + Dock badge + StatusItem badge. Phase 7 builds the in-app NotificationBell popover UI. Renamed Phase 7 line item to "NotificationBell popover UI". |
| CF-06 | "Section" naming: §2.4 uses Board / Knowledge / Archive as 3 sections; web's App.tsx had section: `'board' | 'knowledge' | 'archive'`. | §2.4, §1.2 | NOT A CONFLICT — names match. |
| CF-07 | EditDialog as NSWindow vs NSSheet | §2.3 D-06 vs §3.2 W-02 | RESOLVED: NSWindow (multi-window pattern, NOT sheet). Multiple cards open simultaneously. |
| CF-08 | Mirror View disposition: §1.2 lists MVP "TBD"; §2.2 lists V2. | §1.2, §2.2 | RESOLVED: V2. §1.2 entry corrected to "V2 — separate Xcode target or `--kiosk` window mode". |
| CF-09 | Sandbox: §4.4 says NOT enabled for MVP; entitlements list `network.client = YES`. Sandbox + network client require entitlement only if sandboxed. | §4.4 | RESOLVED: MVP unsandboxed (direct DMG). Entitlements file still specifies the values for forward-compat when V2 enables sandbox for notarization. |
| CF-10 | Telegram identities in Preferences: §1.2 group #38 marks Telegram 🚫; §3.8 T4 includes Telegram tab. | §1.2, §2.2, §3.8 | RESOLVED: Server-side Telegram bot is 🚫; user-side Telegram identity admin (F-455..F-460) IS exposed in Preferences. The 🚫 covers bot commands and capture pipeline, not the local CRUD UI. §1.2 entry annotated. |

### 7.2 GAPS FOUND

| ID | Gap | Resolution |
|---|---|---|
| G-01 | No backup/restore strategy for offline / interrupted state. | Defer to V2; document offline strategy in §4.5. MVP refuses mutations when offline; reads return cached in-memory state. |
| G-02 | No analytics / crash reporting. | Defer to V2 (would require Sentry-SwiftSDK or similar SPM dep — banned MVP). MVP relies on `Console.app` for crash logs at `~/Library/Logs/DiagnosticReports/`. |
| G-03 | No theme accent color override (user pick). | Defer to V2. |
| G-04 | No automatic OPENROUTER_API_KEY UI — macOS user can't toggle AI. | Out of scope: AI keys live server-side. Documented in §4.4. |
| G-05 | No CardChain native graph algorithm chosen | §3.7 V-22 specifies force-directed layout via custom Canvas; if too complex, fall back to WKWebView hosting a static page. Locked: prefer native. |
| G-06 | No Spotlight indexing UI in Preferences | Defer to V2. |
| G-07 | No keychain migration path between bundle ID changes | Bundle ID is locked. If it ever changes, manual user re-login required. Document in release notes. |
| G-08 | No update channel (Sparkle) | Defer to V2. |
| G-09 | No multi-account support | Defer indefinitely; existing web doesn't have it either. |
| G-10 | No tests for sleep/wake reconnect race (event during reconnect window) | Listed in §6.3 WSEventApplyTests — add explicit `WSReconnectRaceTests.swift` to that file. |
| G-11 | No `BUILD_CONSTANTS.md` file in repo | If user creates one in repo root, build agent reads it first and overrides §4.4 / §0 constants. Doc references that fall-through. |
| G-12 | No detailed font license check | Bundled .ttf must include SIL OFL or equivalent license. Inter and JetBrains Mono are OFL; Spectral is OFL. Document in `Resources/Fonts/LICENSES.txt`. |
| G-13 | No notarization plan for Developer ID — V2 | Documented in §4.8. |
| G-14 | No iCloud Drive integration for attachments | Server stores attachments; iCloud not needed. |
| G-15 | No App Sandbox migration plan for V2 | Add to V2 roadmap with explicit entitlements list. |

### 7.3 MACOS-SPECIFIC RISK REGISTER

| ID | Risk | Severity | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R-01 | SwiftUI 13.3 NavigationSplitView quirks (sidebar collapse animations stutter; programmatic open) | HIGH | 80% on min version | Layout bugs | AppKit fallback via NSSplitViewController + NSHostingView per pane. |
| R-02 | WKWebView CSS quirks if used for QR or chain | MED | 40% | Visual mismatch | Avoid WKWebView for production paths; use CIQRCodeGenerator and native Canvas. |
| R-03 | Direct-DMG distribution Gatekeeper friction (each install requires `xattr -cr`) | MED | 100% | User confusion | One-line installer script + DMG README slide. V2: Developer ID + notarization. |
| R-04 | Universal binary regression under Rosetta (Intel V2) | LOW | 30% | Performance | Defer Intel to V2; Rosetta-test before commit. |
| R-05 | Keychain access group required if V2 sandbox enabled | MED | 100% V2 | Token loss on app update | Set access group entitlement BEFORE first sandboxed release. |
| R-06 | NSWindow leaks on aggressive multi-open + close | MED | 30% | Memory creep | `WindowCoordinator` releases controllers on close; Instruments check during QA. |
| R-07 | WKWebView CSS quirks (Rule 7.3) — if any path uses it | (R-02 covers) | — | — | — |
| R-08 | URLSession cookie persistence across launches | LOW | 10% | Login state lost | Backup token in Keychain (CF-04 / §4.5) is the safety net. |
| R-09 | Cmd-W terminating from Capture panel | LOW | 20% | UX | Capture panel close behavior: dismiss without terminating; only Login window close terminates. |
| R-10 | Push fan-out divergence between web (web-push) and macOS (UN local) | MED | 60% | Notifications missed when WS disconnected | Document explicitly: macOS only notifies while WS is active. V2 adds APNs bridge. |
| R-11 | Inter / Spectral font license must be bundled | LOW | 100% | License compliance | Include LICENSES.txt; OFL allows redistribution. |
| R-12 | Multiple cards open simultaneously can race optimistic patches | MED | 40% | Stale state | EditCardViewModel uses last-write-wins on `updated_at`. Server is source of truth via WS. |
| R-13 | macOS 13.3 Combine vs Swift Concurrency interop bugs | LOW | 15% | Rare crashes | Stick to async/await for I/O, Combine only for Timer.publish. |
| R-14 | Server's APP_URL must be set to https://kanban.npalakurla.com for QR endpoint to embed the correct host | LOW | 100% | QR points to wrong host | Document in deployment notes; client uses CIQRCodeGenerator path → independent of server APP_URL. |
| R-15 | TLS pinning not implemented | LOW | 10% | MITM in hostile network | V2: implement via URLSessionDelegate trust eval. |
| R-16 | First-user bootstrap inherits orphan cards (§1.7.15) | LOW | 0% | macOS rarely the first user | Document; do not implement special UI. |
| R-17 | Postgres 22P02 UUID errors mapped to 404 server-side | LOW | 0% | macOS validates UUIDs first | Regex-validate before request. |
| R-18 | Webhook secret in URL path | N/A | — | server-side only | macOS never touches. |
| R-19 | App quit while WS receive loop is suspended | LOW | 20% | Hang on quit | `applicationShouldTerminate` cancels WS task. |
| R-20 | Cancellation cascade per Rule 3 — `async let _ =` / `.task { await heavyWork() }` | HIGH | 100% if not followed | All endpoints "cancelled" → empty board | Rule 3 explicit; enforce via local lint script in CI. |

### 7.4 HANDOFF CHECKLIST

Every box must be checkable before the build agent says "MVP DONE". Any UNCHECKED item is a veto.

- [ ] Xcode 15.4+ installed; arm64 macOS 13.3 deployment target set.
- [ ] `macOS/KanbanClaude.xcodeproj` created at the structure in §4.2.
- [ ] Bundle ID = `com.kanbanclaude.kanbanclaude`.
- [ ] URL scheme `kanbanclaude://` registered in Info.plist.
- [ ] Entitlements per §4.4 (network client; user-selected read-only).
- [ ] Fonts loaded (Inter, Spectral, JetBrainsMono); LICENSES.txt present.
- [ ] AppDelegate orchestrates AppKit lifecycle; SwiftUI App scene declared.
- [ ] APIClient + Endpoint enum + 19 Codables present (`KanbanClaudeTests/CodableMirrorTests.swift` green).
- [ ] WebSocketClient + 19 BroadcastEvent decoders present and tested.
- [ ] AuthStore + LoginView feature-complete; can log in/out against `kanban.npalakurla.com`.
- [ ] Token stored in Keychain (NEVER plaintext UserDefaults).
- [ ] Main window opens at 1280×800; toolbar with scope + search + bell + settings + profile.
- [ ] 4 columns render real data from `/api/cards?scope=personal`.
- [ ] CardTileView renders all 8 state variations correctly in light + dark.
- [ ] Drag-and-drop across columns works with optimistic state + WS reconcile.
- [ ] Trash drop zone archives.
- [ ] `⌘N` opens Capture panel; submit creates card.
- [ ] Paste image (`⌘V` outside text field) creates card from image.
- [ ] Drag .png from Finder onto board creates card; onto card window attaches.
- [ ] EditCardWindow opens per card; multi-window works.
- [ ] EditCardView shows all 12 sections (title/status/desc/tags/due/attachments/assignees/shares/knowledge/AI/related/timeline).
- [ ] `⌘S` saves; `⌘W` closes; `⌘B` brainstorms.
- [ ] Brainstorm round-trip works ≤30 s; chips render.
- [ ] CardTimeline shows system, message, ai entries; ChatInput posts.
- [ ] `@ai` mention triggers server AI reply via WS.
- [ ] NotificationBell popover opens; marks read; opens card on click.
- [ ] UN banner fires on WS message when card window NOT focused.
- [ ] Dock badge shows total unread.
- [ ] Status item shows badge; `⌘N` works from menubar.
- [ ] Knowledge list/detail/edit complete.
- [ ] Archive sheet works (restore, permanent delete, purge).
- [ ] Preferences (theme/account/tokens/telegram/templates) work.
- [ ] Theme follows system + override applies live.
- [ ] Sleep/wake reconnects WS ≤3 s.
- [ ] Multi-window restores on relaunch.
- [ ] URL scheme `kanbanclaude://card/<uuid>` opens window.
- [ ] All keyboard shortcuts in §3.4 verified.
- [ ] All context menus in §3.5 verified.
- [ ] All unit tests (§6.2) pass.
- [ ] All integration tests (§6.3) pass.
- [ ] E2E suite (§6.4) E-01..E-14 pass.
- [ ] Performance benchmarks (§6.6) met or documented as deviations.
- [ ] Accessibility checklist (§6.7) passes — VoiceOver smoke OK, Accessibility Inspector zero warnings.
- [ ] FEATURE_PARITY_REGISTRY.md updated: every MVP row ✅ or 🔄 with justification.
- [ ] DMG built; reinstall script tested; xattr step documented.
- [ ] AGENT_LEARNINGS.md created/updated with any incidents encountered during build.
- [ ] No `async let _ = ...` anywhere in source (`grep -rn 'async let _'` returns nothing).
- [ ] No `.task { await loadAll | refreshAll | fetchAll }` (Rule 3 compliance).
- [ ] No bare-array decode of envelope responses (Rule 2 compliance).
- [ ] Release configuration uses `kProdBaseURL`; debug uses `kDevBaseURL`.
- [ ] Logs visible via `Scripts/tail-logs.sh`; "loaded N cards" line present within 5 s of launch.
- [ ] Screenshot comparison (Rule 14) for each MVP screen vs the corresponding desktop web screen — no unjustified differences.
- [ ] Container/renderX-style registry rows decomposed into per-element sub-rows BEFORE implementation (Rule 13).

### 7.5 FINAL CONFIDENCE SCORE

| Dimension | Score / 10 | Reason |
|---|---|---|
| Completeness | 9 | All 42 screens accounted for. All ~50 endpoints + 19 WS event types catalogued. All 27 components mapped to native equivalents. Design tokens, menus, shortcuts, and risks all enumerated. |
| Buildability | 8 | Stack locked; project structure prescribed file-by-file; phase plan with day estimates. Two risk areas (CardChain native graph, drag-drop optimistic+WS reconcile) require careful first-cut prototypes. |
| Risk | 7 | 20 risks enumerated; mostly LOW/MED. The two HIGH risks (R-01 SwiftUI 13.3 gaps; R-20 Rule 3 enforcement) are well-known to the team and have prescribed mitigations. |

**Overall: 8/10 (worst-link).** No dimension below 7; no veto items unchecked at handoff time. Plan is buildable by a single Swift-fluent engineer in ~45 days.

✅ MACOS_APP_PLAN.md written — 42 views | 27 components | 26 native operations mapped
🎯 Confidence: Completeness 9/10 | Buildability 8/10 | Risk 7/10

STAGE_COMPLETE: plan vetoes=0 confidence=8






