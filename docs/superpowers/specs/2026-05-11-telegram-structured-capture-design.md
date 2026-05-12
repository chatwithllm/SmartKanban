# Structured Telegram Capture Flow — Spec

**Date:** 2026-05-11
**Branch (work):** `feat/telegram-structured-capture` (to be created from `fix/test-strict-undefined`)

## 1. Goal

Restructure the Telegram capture interaction so every incoming text, photo, or voice message goes through a deterministic, two-step interactive flow that lets the sender pick a destination (private card / public card / knowledge) and, for cards, a column (Backlog / Today / In Progress / Done). Optionally, on demand, the bot performs an FTS + LLM-reranked duplicate check across the user's visible cards and knowledge items so duplicates can be linked instead of re-created. Photos and voice notes additionally ask whether the capture is new or should be attached to an existing item.

The goal is to eliminate accidental duplicates, give the user explicit control over destination + column, and surface relevant existing items without forcing the user to remember or search the web app.

## 2. Scope

### In scope
- Text DM and group messages get a 3-button destination row + auto-detected default + Check / Edit / Cancel affordances.
- Knowledge destination saves directly: URL → existing auto-fetch path; plain text → note.
- Card destination triggers a 4-button column picker before save.
- Photo and voice messages: New vs Attach prompt. Attach path lists recent items (top 5 cards + top 3 knowledge) plus a search-by-reply filter.
- Optional duplicate check button: Postgres FTS across cards + knowledge, top 20 hits → LLM (Gemini 2.0 Flash via OpenRouter) re-rank → top 3 shown with confidence + reason.
- New idempotent `cards.fts` generated column + GIN index in `server/schema.sql`.
- All existing reply commands (`/today`, `/assign`, `/share`, `/use`, `/t`, `/templates`, `/save`, `/note`, `/k`, `/klist`) preserved.

### Out of scope
- Card commenting / threaded discussion in Telegram.
- Editing knowledge body via Telegram after save (still web-only).
- Multi-language FTS (English only this phase).
- Embedding-based semantic search across cards (FTS + LLM re-rank chosen instead).
- Bulk attach (one photo → multiple targets).
- Server-side rate limiting on the duplicate-check button (rely on Gemini quotas).
- Backfill of `cards.fts` on existing rows — generated columns populate automatically.

## 3. Decisions captured during brainstorming

| Decision | Choice |
|---|---|
| Destination chooser shape | **C — hybrid**: auto-detected default highlighted, all 3 options visible, one-tap override |
| Duplicate check timing + scope | **On-demand button only**: FTS + LLM re-rank fired by `🔍 Check duplicates` tap |
| Group chat destination row | **C**: `[Family Inbox card] [Private (to me only)] [Knowledge]` |
| Column picker UX | **A**: required tap on one of 4 columns — no default |
| Photo / voice flow | New vs Attach prompt; Attach picker lists recent + search-by-reply |
| Re-rank model | Gemini 2.0 Flash via OpenRouter (existing primary, ~$0.00007 / call) |

## 4. State machine

### 4.1 Text message

```
TEXT arrives (DM or group)
  ↓
[Step 1: AI propose] (existing) — extract title, tags, links
  ↓
[Step 2: Destination prompt]
   "📝 <title>
    Tags: #<tags>

    [✓ <auto>] [<other>] [<other>]
    [🔍 Check duplicates?] [✏️ Edit] [❌ Cancel]"

   Auto-default rules:
     - URL in body            → Knowledge
     - DM, no URL             → Private card
     - Group, no URL          → Public card (Family Inbox)
   DM row options:    Private / Public / Knowledge
   Group row options: Public / Private (mine) / Knowledge

[3a: Knowledge picked]
   - URL present  → save knowledge_items with source='telegram', kick existing auto-fetch
   - No URL       → save as note (title from AI, body = original text, source='telegram')
   - Reply: "📚 Saved · <title>"

[3b: Private or Public card picked]
   "Which column?
    [📥 Backlog] [📅 Today] [⚡ In Progress] [✅ Done]"

[Step 4: Card save]
   - Reply: "✓ Saved · <emoji> <column> — <title>"
   - Existing post-save row [⚡ Doing] [✅ Done] [🗑] reused (move-column shortcuts)
```

### 4.2 Photo

```
PHOTO arrives → vision summary (existing) → bot replies:
   "📷 <vision summary>

    Is this new, or attaching to existing?
    [✨ New] [🔗 Attach to existing] [❌ Cancel]"

[✨ New]
   → fall through to text destination prompt (§4.1 Step 2 onwards),
     with original photo attached on final save

[🔗 Attach to existing]
   → secondary picker prompt:

   "Pick a card / knowledge item to attach to:

    Recent cards (visible to you):
    • 📅 Buy eggs (Today, 2h ago)             [pick]
    • ⚡ Fix sink leak (In Progress, 1d ago)  [pick]
    • 📥 Plan trip (Backlog, 3d ago)          [pick]

    Recent knowledge:
    • 📚 Egg storage tips                     [pick]

    Or search by name:  (reply with text to filter)
    [❌ Cancel]"

   - Initial list: top 5 cards + top 3 knowledge items from user's visible scope,
     ORDER BY updated_at DESC
   - Reply-with-text → re-render list using FTS on title+description matching reply text
   - [pick] → attach photo to that card/knowledge as image attachment, reply
              "📷 Attached to <title>"
```

### 4.3 Voice

Same as §4.2 but with Whisper transcript instead of vision summary, and audio attachment instead of image.

### 4.4 Duplicate check (triggered by 🔍 tap from §4.1 Step 2)

```
1. Server runs Postgres FTS on cards + knowledge:
     - cards:     to_tsquery on cards.fts WHERE NOT archived AND visible_to(user_id)
     - knowledge: existing knowledge_items.fts WHERE NOT archived AND visible_to(user_id)
     - LIMIT 10 from each, ORDER BY ts_rank DESC

2. LLM re-rank via OpenRouter Gemini 2.0 Flash:
     Prompt: "User wants to capture: '<original_text>'. Existing items:
              1. [card]      'Buy eggs' (Today, 2d ago)
              2. [knowledge] 'Egg storage tips' (URL)
              ...
              Return JSON: { matches: [{ ix: number, confidence: 0-100, why: string }] }
              Only include items with confidence >= 40. Cap at 3."

     - 4-second timeout
     - On timeout/error → fall back to raw FTS rank, no confidence/why

3. Bot reply:
   "🔍 Found 2 possibly related:
    • 'Buy eggs' (Today column, 2d ago) — 85% match
        why: same item, different day
    • 'Egg storage tips' (Knowledge) — 60% match
        why: related topic

    [🔗 Link to first] [+ Save anyway] [❌ Cancel]"

   [🔗 Link to first]
     - card → discard new capture, reply "Linked to existing card · <title>"
     - knowledge → discard, reply "Linked to existing knowledge · <title>"
   [+ Save anyway] → return to destination prompt (§4.1 Step 2)
   [❌ Cancel] → discard pending proposal
```

## 5. Component touch points

### Files modified
- `server/src/telegram/bot.ts` (significant additions — see §6)
- `server/src/telegram/proposals.ts` (extend `PendingProposal` shape)
- `server/src/cards.ts` (new FTS search helper)
- `server/src/knowledge.ts` (expose existing FTS as a helper if not already)
- `server/schema.sql` (idempotent `cards.fts` column + GIN index)
- `README.md` (Telegram bot commands section refreshed)

### Files created
- `server/src/ai/dedupe.ts` — LLM re-rank helper
- `server/src/__tests__/telegram_flow.test.ts` — destination defaults + flow guards
- `server/src/__tests__/dedupe.test.ts` — prompt + JSON parse + timeout fallback
- `server/src/__tests__/cards_fts.test.ts` — FTS query + visibility filter

## 6. Implementation specifics

### 6.1 `PendingProposal` extensions (proposals.ts)

```ts
type Destination = 'private_card' | 'public_card' | 'knowledge';
type AttachState = 'new' | 'pickExisting' | 'pickFiltered';

interface PendingProposal {
  // ... existing fields
  destination?: Destination;
  attachMode?: AttachState;
  attachFilter?: string;          // last reply text used to filter attach picker
  attachPickerIds?: string[];     // ordered card/knowledge ids currently shown
  dupCandidates?: Array<{
    kind: 'card' | 'knowledge';
    id: string;
    title: string;
    snippet: string;
    confidence?: number;
    why?: string;
  }>;
  pendingPhotoFileId?: string;    // grammy file_id, pending until destination/attach pick
  pendingAudioFileId?: string;
}
```

TTL bumped from 10 → 15 minutes.

### 6.2 Default destination rule

```ts
function defaultDestination(p: AIProposal, isPrivateChat: boolean): Destination {
  if (p.links?.length || /https?:\/\//.test(p.title + ' ' + (p.description ?? ''))) {
    return 'knowledge';
  }
  return isPrivateChat ? 'private_card' : 'public_card';
}
```

### 6.3 Keyboards (bot.ts)

```ts
function destinationKeyboard(pid: string, def: Destination, isPrivateChat: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  const opts: Array<{ key: Destination; label: string }> = isPrivateChat
    ? [
        { key: 'private_card', label: '🔒 Private' },
        { key: 'public_card',  label: '👥 Public' },
        { key: 'knowledge',    label: '📚 Knowledge' },
      ]
    : [
        { key: 'public_card',  label: '👥 Inbox' },
        { key: 'private_card', label: '🔒 Mine' },
        { key: 'knowledge',    label: '📚 Knowledge' },
      ];
  for (const o of opts) {
    kb.text(`${o.key === def ? '✓ ' : ''}${o.label}`, `dest:${o.key}:${pid}`);
  }
  kb.row()
    .text('🔍 Check duplicates?', `dup:check:${pid}`)
    .text('✏️ Edit',              `edit:${pid}`)
    .text('❌ Cancel',            `cancel:${pid}`);
  return kb;
}

function columnKeyboard(pid: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('📥 Backlog',     `col:backlog:${pid}`)
    .text('📅 Today',       `col:today:${pid}`)
    .text('⚡ In Progress', `col:in_progress:${pid}`)
    .text('✅ Done',        `col:done:${pid}`);
}

function attachmentKindKeyboard(pid: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✨ New',                 `att:new:${pid}`)
    .text('🔗 Attach to existing',  `att:pick:${pid}`)
    .text('❌ Cancel',              `cancel:${pid}`);
}

function attachPickerKeyboard(pid: string, items: Array<{ id: string; kind: 'card' | 'knowledge' }>): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const it of items) {
    kb.text('Pick', `att:to:${it.kind}:${it.id}:${pid}`).row();
  }
  kb.row().text('❌ Cancel', `cancel:${pid}`);
  return kb;
}
```

### 6.4 FTS helpers (cards.ts / knowledge.ts)

```ts
// cards.ts
export async function searchCardsFts(
  userId: string,
  query: string,
  limit = 10,
): Promise<Array<{ id: string; title: string; description: string; status: Status; updated_at: string; rank: number }>> {
  if (!query.trim()) return [];
  const sql = `
    SELECT c.id, c.title, c.description, c.status, c.updated_at,
           ts_rank(c.fts, websearch_to_tsquery('english', $2)) AS rank
    FROM cards c
    WHERE NOT c.archived
      AND ${cardVisibilityPredicate}     -- existing visibility helper
      AND c.fts @@ websearch_to_tsquery('english', $2)
    ORDER BY rank DESC, c.updated_at DESC
    LIMIT $3
  `;
  return db.query(sql, [userId, query, limit]);
}

// knowledge.ts (similar, uses existing knowledge_items.fts)
export async function searchKnowledgeFts(userId: string, query: string, limit = 10): Promise<KnowledgeMatch[]> { ... }
```

### 6.5 Re-rank helper (ai/dedupe.ts)

```ts
export interface Candidate {
  kind: 'card' | 'knowledge';
  id: string;
  title: string;
  snippet: string;
  contextLine: string;             // "Today column, 2d ago" or "Knowledge"
}

export interface RankedMatch extends Candidate {
  confidence: number;              // 0-100
  why: string;
}

export async function rankCandidates(
  original: string,
  candidates: Candidate[],
  signal?: AbortSignal,
): Promise<RankedMatch[]> {
  if (candidates.length === 0) return [];
  // Build prompt with indexed list
  // Call openrouter chat completion with response_format json
  // Parse, validate, cap at 3
  // On timeout or invalid JSON: return candidates with no confidence/why
}
```

Timeout = 4s. Uses existing `openrouterChat` wrapper from `server/src/ai/openai.ts`.

### 6.6 Schema migration (server/schema.sql)

Append at the end (idempotent — safe to re-run):

```sql
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(description, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS cards_fts_idx ON cards USING GIN (fts);
```

Existing rows: PostgreSQL `STORED GENERATED` columns populate on `ALTER TABLE` automatically — no separate backfill needed.

### 6.7 Tests

- `telegram_flow.test.ts`:
  - `defaultDestination` returns `knowledge` when proposal has links
  - `defaultDestination` returns `private_card` in DM with no URL
  - `defaultDestination` returns `public_card` in group with no URL
  - `destinationKeyboard` includes ✓ on the default option
- `dedupe.test.ts`:
  - prompt formatting includes all candidates with stable indices
  - JSON parse handles valid response
  - timeout returns fallback (raw FTS rank order, no confidence)
- `cards_fts.test.ts`:
  - FTS query respects visibility predicate (private card of user A not returned to user B)
  - Empty query returns empty array
  - Ranking returns most recently updated card first when ranks tie

## 7. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Duplicate check button rate-abuse | Gemini's own quotas; gateway cost still trivial |
| LLM JSON malformed | Strict parse with try/catch → fall back to raw FTS rank |
| FTS index slow to build on large `cards` table | GIN is concurrent-safe; for tiny family-sized tables (<10K rows) build is sub-second |
| Telegram callback_data 64-byte limit | All callback strings stay under 50 bytes: `att:to:card:<uuid8>:<pid8>` = ~30 bytes |
| Photo Attach mode race when pending TTL expires | New 15-min TTL covers slow user; on expiry, reply "Session expired" + cleanup |
| Existing reply commands break | Preserve all existing handlers verbatim; new handlers gate on `cb.data.startsWith(...)` |
| Schema migration fails on prod | `IF NOT EXISTS` makes it idempotent; can be re-run by hand |

## 8. Verification

- `cd server && npm test` passes (existing + new tests)
- `cd web && npm run build` clean (no web changes, sanity)
- Manual smoke on prod (after `docker compose up -d --force-recreate server` post-deploy):
  1. DM bot plain text → 3 destination buttons + check + edit + cancel
  2. DM bot URL → Knowledge button is the ✓ default
  3. Group post → first option is Inbox (✓ default)
  4. Pick `Private card` → column row appears → tap `Today` → card visible in My Board
  5. Pick `Knowledge` on URL → fetched + indexed knowledge item visible in Knowledge tab
  6. Tap `🔍 Check duplicates` on a "Buy eggs" message after one already exists → top match shown with ≥70% confidence
  7. Send a photo → "New / Attach to existing" prompt → tap Attach → recent list appears → reply with text → list filters → tap Pick → photo attached
  8. Send a voice note → same flow as photo
  9. `/today buy bread` still saves directly with no flow

## 9. Done state

- All flows in §4 work end-to-end on prod via `@KB4340P_bot`
- `cards.fts` column + index exists in the running database
- Both old reply commands and new structured flow co-exist without regression
- Three test files added, all passing
- README Telegram section updated to describe the new flow
- Spec + plan committed to repo; PR opened against `main`
