# Per-Card Chat with AI Suggestions — Design Spec

**Date:** 2026-05-02
**Status:** Approved

---

## Overview

Add per-card threaded chat for registered users. Messages persist in DB, appear inline with existing activity events in a unified timeline. Users can mention `@ai` to invoke an AI assistant that reads the card + recent context and replies with clickable suggestion chips. Unread message badges appear on board card tiles.

---

## Scope

- Per-card threads (not global room, not DMs)
- Persistent messages (full history on reload)
- User-to-user + AI assistant (mention-triggered)
- AI replies with suggestions user clicks to apply
- Unified timeline: system activity events + chat messages + AI responses
- In-app unread badge on board card tiles

---

## Schema

```sql
-- Rename activity_log to card_events (unified table)
ALTER TABLE activity_log RENAME TO card_events;

-- Add chat columns (existing rows get defaults — zero breakage)
ALTER TABLE card_events
  ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'system'
    CHECK (entry_type IN ('system', 'message', 'ai')),
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS ai_suggestions JSONB;

-- action was NOT NULL — messages don't use it
ALTER TABLE card_events ALTER COLUMN action DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_card_events_card
  ON card_events(card_id, created_at DESC);

-- Unread tracking: last event id seen per (card, user)
CREATE TABLE IF NOT EXISTS card_event_reads (
  card_id      UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_id BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (card_id, user_id)
);
```

**Migration safety:** existing `logActivity()` inserts omit new columns — all three have DB-level defaults (`entry_type='system'`, `content=NULL`, `ai_suggestions=NULL`). No existing call sites need changing.

---

## Types

```ts
// Replaces ActivityEntry in web/src/types.ts
type CardEvent = {
  id: string;
  card_id: string;
  actor_id: string | null;
  actor_name: string | null;
  entry_type: 'system' | 'message' | 'ai';
  action: string | null;          // system events only
  content: string | null;         // message + ai events
  ai_suggestions: AiSuggestion[] | null;
  details: Record<string, unknown>;
  created_at: string;
};

type AiSuggestion = {
  label: string;
  action: 'update_status' | 'set_due_date' | 'assign_user' | 'create_card';
  params: Record<string, unknown>;
};
```

---

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/cards/:id/events` | requireUser | Unified timeline, oldest-first |
| POST | `/api/cards/:id/messages` | requireUser | Post user message |
| PUT | `/api/cards/:id/events/read` | requireUser | Mark read up to event id |
| GET | `/api/messages/unread` | requireUser | `{ [card_id]: count }` for all visible cards |

**POST `/api/cards/:id/messages`** body: `{ content: string }`
- 400 if content empty or >2000 chars
- 404 if card not visible to requesting user
- Returns inserted `CardEvent` (the user message) immediately — response does not wait for AI
- If `@ai` detected, AI flow fires in background after response is sent

**GET `/api/messages/unread`** — single query: for each card visible to user, count `card_events` where `id > last_read_id` and `actor_id != user_id`.

**PUT `/api/cards/:id/events/read`** body: `{ last_read_id: number }` — upserts `card_event_reads`.

Old `GET /api/cards/:id/activity` route removed; replaced by `/events`. No external consumers (behind `requireUser`, not documented as public API).

---

## WebSocket

Two new events added to `BroadcastEvent` union in `server/src/ws.ts`:

```ts
| { type: 'card.message';     event: CardEvent; card_id: string }
| { type: 'card.ai_response'; event: CardEvent; card_id: string }
```

Visibility: same predicate as `card.created/updated` — `cardVisibleTo(card, userId)`. Server fetches the card row at broadcast time (already in memory from the POST handler — pass it through to `broadcast()`).

Frontend handling:
- Card currently open → append event to timeline immediately
- Card not open → increment client-side unread counter for `card_id`

On app init: `GET /api/messages/unread` populates unread map. WebSocket events keep it live. No polling.

---

## AI Flow

Triggered when `POST /api/cards/:id/messages` content contains `@ai` (case-insensitive).

1. Insert user message → broadcast `card.message`
2. Fetch card row + last 20 `card_events` for context
3. Call `chatPrimary()` (existing OpenRouter client in `server/src/ai/openai.ts`)
4. System prompt includes: card title, description, status, assignees, due date, last 20 events as conversation history, instruction to respond with text + optional suggestions
5. Parse response: free text + `<!-- suggestions: [...] -->` marker
6. Validate suggestions against `AiSuggestion` schema (max 3)
7. Insert AI event (`entry_type='ai'`, `content=text`, `ai_suggestions=validated JSON`)
8. Broadcast `card.ai_response`

**Failure:** if `chatPrimary()` throws → insert AI event with `content="Sorry, I couldn't reach the AI right now."`, `ai_suggestions=null`. Never propagates 500 to client — user message already saved.

**Suggestion chips** — frontend renders each `AiSuggestion` as a button:
- `update_status` → `api.updateCard(id, { status })`
- `set_due_date` → `api.updateCard(id, { due_date })`
- `assign_user` → `api.updateCard(id, { assignees: [...existing, user_id] })`
- `create_card` → `api.createCard(params)`
- Button disables after click; shows toast on error + re-enables

---

## Frontend

### Files changed

| File | Change |
|------|--------|
| `web/src/components/ActivityTimeline.tsx` | Rename → `CardTimeline.tsx`, extend for all entry types |
| `web/src/components/ChatInput.tsx` | New — text input + send, lives at bottom of CardTimeline |
| `web/src/types.ts` | Replace `ActivityEntry` with `CardEvent`, add `AiSuggestion` |
| `web/src/api.ts` | Add `cardEvents()`, `postMessage()`, `markRead()`, `unreadCounts()` |
| `web/src/App.tsx` | Fetch unread map on init, pass down; handle WS message events |
| `web/src/ws.ts` | Handle `card.message` + `card.ai_response` events |
| `web/src/components/CardView.tsx` | Swap `ActivityTimeline` → `CardTimeline`; show unread badge |
| `web/src/MobileCardView.tsx` | Same swap |
| `web/src/components/Board.tsx` / `CardView.tsx` | Render unread badge on card tile |

### CardTimeline rendering

```
entry_type === 'system'  → existing dot + actor + action text (unchanged)
entry_type === 'message' → avatar bubble, sender name, content, timestamp
entry_type === 'ai'      → distinct accent bubble, content text,
                           suggestion chips below (if ai_suggestions present)
```

Timeline sorted oldest-first, `ChatInput` pinned at bottom. Marks read on mount.

### Unread badge

- `App.tsx` holds `unreadCounts: Record<string, number>` state
- Populated by `GET /api/messages/unread` on auth
- Updated by WS `card.message` events (increment for cards not open)
- Cleared when `CardTimeline` mounts (calls `PUT .../read`, zeros local count)
- Shown as small dot or `N` badge on card tile in `Board.tsx`

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Empty / >2000 char message | 400, shown inline below input |
| Post to non-visible card | 404 |
| AI call fails | Graceful AI error event, user message preserved |
| WS client disconnects during broadcast | Existing `readyState !== OPEN` guard handles it |
| `GET /api/messages/unread` DB error | Returns `{}` — badge silently missing, app functional |
| Suggestion action fails | Toast error, button re-enables |

---

## Tests

New file: `server/src/__tests__/card_messages.test.ts`

- POST message → 201, `entry_type='message'` in DB
- POST empty content → 400
- POST content >2000 chars → 400
- POST to non-visible card → 404
- GET events → system + message events merged, ordered by `created_at`
- PUT read → upserts `card_event_reads`; subsequent unread count = 0
- GET /api/messages/unread → correct counts per card
- POST with `@ai` + mocked `chatPrimary()` → AI event inserted with parsed suggestions
- POST with `@ai` + `chatPrimary()` throws → AI error event inserted, no 500

---

## Out of Scope

- Global chat room
- Direct messages between users
- Message editing or deletion
- Reactions
- Notifications outside the app (email, push)
- AI proactively posting (only responds when `@ai` mentioned)
