# Push Notifications + UI Redesign

**Date:** 2026-05-03  
**Status:** Approved  
**Scope:** In-app bell notifications + browser Web Push for card chat messages, plus full UI visual overhaul (sticky-note design system)

---

## Overview

When a user posts a message (or the AI replies) in a card thread, all card assignees and thread participants receive:
1. A real-time in-app notification via a bell icon in the nav bar
2. A browser push notification (native OS popup) via the Web Push API

Notifications auto-clear when the card thread is opened, and can also be bulk-dismissed via "Mark all read."

---

## Data Layer

### `notifications` table

```sql
CREATE TABLE notifications (
  id          serial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  card_id     uuid not null references cards(id) on delete cascade,
  event_id    integer not null references card_events(id) on delete cascade,
  actor_name  text not null,
  preview     text not null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

CREATE INDEX notifications_user_unread ON notifications(user_id) WHERE read = false;
```

One row per (user, event). Cascade-deletes when card or event is deleted.

### `push_subscriptions` table

```sql
CREATE TABLE push_subscriptions (
  id          serial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
```

One row per browser/device subscription. A user can have multiple active subscriptions (phone + laptop).

---

## Server Architecture

### `server/src/notifications.ts`

Core fan-out and query logic:

- `fanOutNotification(cardId, eventId, actorUserId, actorName, preview)` — queries card assignees + users who previously posted in the thread, excludes the actor, bulk-inserts `notifications` rows
- `getNotifications(userId)` — returns unread notifications + last 50 read, ordered newest first
- `markNotificationsRead(userId, ids: number[])` — sets `read = true` for given ids
- `markAllRead(userId)` — bulk sets `read = true` for all user's notifications

### `server/src/push.ts`

Web Push delivery using the `web-push` npm package:

- VAPID keys loaded from env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- `sendPush(subscription, payload)` — sends push; on 410 Gone, deletes stale subscription from DB; other errors logged and swallowed
- `pushToUser(userId, payload)` — loads all subscriptions for user, calls `sendPush` for each concurrently; no-ops if VAPID keys not configured

### `server/src/routes/notifications.ts`

REST endpoints (all require auth):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/notifications` | Fetch notifications for bell panel |
| `PUT` | `/api/notifications/read` | Mark specific ids read `{ ids: number[] }` |
| `PUT` | `/api/notifications/read-all` | Mark all read |
| `POST` | `/api/push/subscribe` | Save/upsert push subscription |
| `DELETE` | `/api/push/subscribe` | Remove push subscription |
| `GET` | `/api/push/vapid-public-key` | Return public VAPID key to frontend |

### Hook into chat flow

**Human messages** — in `server/src/routes/chat.ts`, after broadcasting `card.message`:

```ts
// Non-blocking — never delays the 201 response
fanOutNotification(cardId, event.id, userId, actorName, preview).then(async (recipientIds) => {
  const pushPayload = { title: cardTitle, body: `${actorName}: ${preview}`, cardId };
  await Promise.all(recipientIds.map(id => pushToUser(id, pushPayload)));
}).catch(err => console.warn('[notifications] fan-out failed:', err));
```

**AI replies** — in `server/src/ai/card_chat.ts`, after `postAiEvent` and before/after the broadcast, same pattern with `actorName = 'AI Assistant'` and the AI response text as preview.

---

## Frontend Architecture

### Service Worker (`public/sw.js`)

- Handles `push` event → calls `self.showNotification(title, { body, icon: '/icon.png', data: { cardId } })`
- Handles `notificationclick` → `clients.openWindow('/?card=<cardId>')` to open the app with the card thread focused; closes notification

### `usePushNotifications` hook (`web/src/hooks/usePushNotifications.ts`)

- Registers service worker on mount (`navigator.serviceWorker.register('/sw.js')`)
- Exposes `{ supported, permission, subscribe, unsubscribe }`
- `subscribe()` — calls `Notification.requestPermission()`, creates PushSubscription via `pushManager.subscribe`, posts to `POST /api/push/subscribe`
- Permission is only requested when user explicitly clicks the bell for the first time — no aggressive prompt on load
- `unsubscribe()` — calls `pushManager.unsubscribe`, calls `DELETE /api/push/subscribe`

### `useNotifications` hook (`web/src/hooks/useNotifications.ts`)

- Fetches `/api/notifications` on mount
- Listens on existing WebSocket for `card.message` and `card.ai_response` events — prepends new notification objects to local state in real-time (no polling)
- On WS reconnect, re-fetches `/api/notifications` to recover missed items
- Exposes `{ notifications, unreadCount, markRead(ids), markAllRead() }`

### `NotificationBell` component (`web/src/components/NotificationBell.tsx`)

Placed in `BoardHeader`:

- Bell icon with red badge showing total unread count
- Click → opens dropdown panel (max-height scrollable, closes on outside click)
- Each notification row:
  - Avatar initial (actor name, colored by hash)
  - Card title (bold)
  - Message preview (~80 chars, truncated)
  - Relative timestamp ("2m ago", "1h ago")
  - Unread indicator dot (left border accent)
  - Click → closes panel, opens card thread, marks that notification read
- "Mark all read" button at panel top-right (hidden when all read)
- Empty state: subtle icon + "No new notifications"
- Panel width: 380px, max-height: 480px with scroll

---

## Error Handling & Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Push delivery failure | Logged and swallowed; never blocks message posting |
| 410 Gone from push endpoint | Stale subscription auto-deleted from DB |
| User denies browser permission | In-app bell still works; push silently disabled; no repeated prompts |
| Sender receives own message | Actor excluded from fan-out |
| User offline | Notifications persist in DB; visible on next load |
| Card deleted | Notifications cascade-delete via FK |
| VAPID keys not set | `pushToUser` no-ops; server boots without AI/push keys |
| Duplicate subscription endpoint | Upsert on `endpoint` unique constraint |
| WS disconnect/reconnect | `useNotifications` re-fetches on reconnect |

---

## Out of Scope

- Per-card notification mute/unmute preferences
- Email notifications
- Notification retention/cleanup job
- Mobile app push (Telegram bot covers that use case)

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VAPID_PUBLIC_KEY` | No | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | No | Web Push VAPID private key |
| `VAPID_SUBJECT` | No | `mailto:` or URL for VAPID contact |

Generate keys once with: `npx web-push generate-vapid-keys`

---

## Frontend Design Overhaul

Design files sourced from `Smartkanban.zip` (claude.ai/design). All components adopt this design system before the notification bell is added.

### Design System

**Typography** (loaded via Google Fonts):
- `Spectral` — serif, card titles, lane headings, dialog titles, brand wordmark
- `Inter` — UI sans, all buttons/labels/body text
- `JetBrains Mono` — metadata, timestamps, badges, kbd hints

**CSS Variables** (full token set in `theme.css`, light + dark):
- `--canvas`, `--surface`, `--surface-2/3` — background layers
- `--ink`, `--ink-2`, `--ink-3` — text hierarchy
- `--violet` (`#5B37C4`) — primary brand accent
- `--lane-backlog/today/doing/done` — bold saturated lane colors (tan/persimmon/mustard/teal)
- `--pin-*` — pushpin colors per lane
- `--paper`, `--paper-fold` — sticky-note paper tones
- `--sh-1/2/3`, `--sh-drag` — shadow scale

### Components to Rewrite

| Current file | New design | Key changes |
|---|---|---|
| `BoardHeader.tsx` | `topbar.jsx` | Frosted glass, scope switcher, view tabs, weather slot |
| `Column.tsx` | `column.jsx` | Bold colored lane bg, paper-grain overlay, Spectral heading |
| `CardView.tsx` | `card.jsx` | Sticky-note with pushpin + folded corner clip-path, slight rotation |
| *(new)* | `ticker.jsx` | Activity ticker bar — scrolling marquee of hot cards |
| `Board.tsx` | `app.jsx` (BoardView) | 4-col grid + optional right-side mobile shell panel |

### Sticky-Note Card Design

- `.note-wrap` — outer wrapper with `drop-shadow` filter + hover lift (`translateY(-2px)`)
- `.note-wrap::before` — folded-corner triangle, `clip-path: polygon(100% 0, 100% 100%, 0 100%)`, colored `--paper-fold`
- `.note` — card body, `clip-path: polygon(0 0, 100% 0, 100% calc(100%-22px), calc(100%-22px) 100%, 0 100%)` cuts the corner
- `.pin` / `.pin-head` / `.pin-needle` — pushpin positioned above card, color from `--pin-<lane>`
- Cards get a deterministic small rotation (±4 × 0.18deg) from stable hash of card ID for natural feel

### Lane Design

- `.lane` — `background: rgb(var(--lane-color))`, `border-radius: 14px`, inset shadow ring
- `.lane::before` — CSS paper-grain dot pattern overlay at 0.6 opacity
- `.lane-header` — Spectral 22px white title + JetBrains Mono count badge + circular `+` button
- `.lane-body` — scrollable, gap 18px between cards
- Drag-over state: white ring shadow `0 0 0 3px rgb(255 255 255 / 0.6)`

### TopBar Design

- Sticky, frosted glass: `backdrop-filter: saturate(140%) blur(10px)`, `background: rgb(var(--canvas)/0.85)`
- Left: `K` logo box (violet, Spectral) + "SmartKanban" wordmark
- Centre-left: view tabs (Board / Knowledge / Archive)
- Centre: scope dropdown (My board / Family inbox / Everything) with card counts
- Right: weather widget slot → search (⌘K) → icon actions (review/theme/settings) → **NotificationBell** → divider → profile dropdown

### Activity Ticker

New sticky bar (`position: sticky; top: 65px`) below TopBar:
- Left label: pulsing green dot + "Active now" + count badge
- Scrolling marquee: chips showing hot cards (score ≥ 2.5, max 8 cards, duplicated for seamless loop)
- Activity score: `comments × 3 + attachments × 1.5 + recency_boost`
- Marquee pauses on hover; mask-image fade on edges
- Clicking a chip opens that card's thread

### NotificationBell Placement

Sits in TopBar action cluster between settings icon and the divider before the profile dropdown. Consistent with existing icon button style (`.btn.btn-ghost.btn-icon`). Badge uses `--danger` red token.
