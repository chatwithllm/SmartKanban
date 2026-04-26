# Knowledge Section — Design Spec

**Date:** 2026-04-25
**Status:** Approved (brainstorming complete; awaiting user spec review)
**Author:** brainstorming session, chatwithllm@gmail.com

## 1. Goal

Add a "Knowledge" section to SmartKanban for storing reference material (URL bookmarks, full articles, free-form notes) capturable from web/Telegram/cards, retrievable via browse + tag filter, full-text search, and AI semantic search, attachable to cards.

## 2. Scope

In scope:

- `knowledge_items` entity + `knowledge_shares` + `knowledge_card_links` tables
- Web UI: dedicated Knowledge page with list, filter, search, CRUD
- Telegram commands: `/save <url>`, `/note <text>`, `/k <query>`, `/klist`
- Auto-fetch URL → readable text via `@mozilla/readability` + `jsdom` (Node 22 native fetch)
- Card↔knowledge attach/detach UI on card edit dialog and knowledge view
- Auto-detect URL in card → optional "Save as knowledge" button (not automatic)
- Postgres FTS index on title + body + url
- pgvector + OpenAI embeddings for semantic search (gated behind `KNOWLEDGE_EMBEDDINGS=true`)
- WS broadcasts: `knowledge.created/updated/deleted` + link events with per-client visibility filter
- PWA `share_target` manifest entry → prefill form route

Out of scope (YAGNI):

- Per-user assignees on knowledge (visibility model uses owner + shares + inbox; no assignees)
- Versioning / edit history
- Attachments on knowledge items (URL link is sufficient)
- AI Q&A chat ("ask my knowledge") — stretch, only if requested after retrieval ships
- Bookmarklet (PWA share target covers it)
- Browser extension (separate project)
- Activity log entries for knowledge CRUD
- Re-fetching on schedule (only manual refetch button)

**Risk note:** Single-spec all-in approach is large. Implementation plan will sequence into 5–6 tasks; each independently shippable. Recommend halt between tasks to validate.

## 3. Data Model

Additive change to `server/schema.sql` (idempotent):

```sql
CREATE TABLE IF NOT EXISTS knowledge_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  title_auto    BOOLEAN NOT NULL DEFAULT FALSE,
  url           TEXT,
  body          TEXT NOT NULL DEFAULT '',
  tags          TEXT[] NOT NULL DEFAULT '{}',
  visibility    TEXT NOT NULL CHECK (visibility IN ('private','inbox','shared')),
  source        TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual','telegram','share_target','from_card')),
  fetch_status  TEXT CHECK (fetch_status IN ('pending','ok','failed','skipped')),
  fetch_error   TEXT,
  fetched_at    TIMESTAMPTZ,
  archived      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title,'') || ' ' || coalesce(body,'') || ' ' || coalesce(url,'')
    )
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_knowledge_fts   ON knowledge_items USING GIN(fts);
CREATE INDEX IF NOT EXISTS idx_knowledge_owner ON knowledge_items(owner_id) WHERE NOT archived;
CREATE INDEX IF NOT EXISTS idx_knowledge_tags  ON knowledge_items USING GIN(tags);

CREATE TABLE IF NOT EXISTS knowledge_shares (
  knowledge_id UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (knowledge_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_shares_user ON knowledge_shares(user_id);

CREATE TABLE IF NOT EXISTS knowledge_card_links (
  knowledge_id UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  card_id      UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (knowledge_id, card_id)
);
CREATE INDEX IF NOT EXISTS idx_klc_card ON knowledge_card_links(card_id);
```

pgvector embeddings table (created conditionally at startup; not part of `schema.sql`):

```sql
-- Created at app startup if KNOWLEDGE_EMBEDDINGS=true and extension available.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS knowledge_embeddings (
  knowledge_id UUID PRIMARY KEY REFERENCES knowledge_items(id) ON DELETE CASCADE,
  embedding    vector(1536) NOT NULL,
  model        TEXT NOT NULL,
  embedded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_embed_cos
  ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

Visibility predicate:

```
visible(k, user) =
  k.owner_id = user.id
  OR k.visibility = 'inbox'
  OR (k.visibility = 'shared'
      AND EXISTS (
        SELECT 1 FROM knowledge_shares ks
        WHERE ks.knowledge_id = k.id AND ks.user_id = user.id
      ))
```

Notes:

- No assignees concept on knowledge. Reference material, not work item.
- Soft-archive (`archived` flag); matches cards pattern. Hard-delete optional later.
- `title_auto=true` marks a placeholder title (URL hostname or similar) that the auto-fetch worker is allowed to replace with the readability-extracted title. Set on creation when user did not supply a custom title (web paste-URL flow with default hostname; Telegram `/save <url>` without `| <title>`). Set `false` whenever a human typed a title.
- `source='from_card'` = saved via "Save as knowledge" button on card detail.
- pgvector applied conditionally by `server/src/index.ts` startup if `KNOWLEDGE_EMBEDDINGS=true` and extension exists. App boots fine without it — semantic endpoint returns 501.
- FTS uses generated column (Postgres 12+). `english` config matches typical content; switchable later.
- Tags GIN index supports tag-chip filter at scale.

## 4. Backend API

New file `server/src/routes/knowledge.ts`, mounted at `/api/knowledge`. All endpoints require `requireUser`.

| Method | Path | Behavior |
| ------ | ---- | -------- |
| GET    | `/api/knowledge?scope=mine\|inbox\|all&q=&tag=&limit=&cursor=` | List visible. `q` = FTS via `plainto_tsquery`. `tag` = array contains. Cursor pagination via `(updated_at, id)`. |
| POST   | `/api/knowledge`                          | Create. Body schema below. Returns full item. |
| GET    | `/api/knowledge/:id`                      | Fetch one. 404 if not visible (do not leak existence). |
| PATCH  | `/api/knowledge/:id`                      | Update. Owner-only (non-owner = 403). |
| DELETE | `/api/knowledge/:id`                      | Soft-archive. Owner-only. |
| POST   | `/api/knowledge/:id/refetch`              | Re-trigger auto-fetch. Owner-only. |
| POST   | `/api/knowledge/search/semantic`          | Body: `{q, limit?, scope?}`. Returns ranked items. 501 if embeddings disabled. |
| POST   | `/api/knowledge/:id/links`                | Body: `{card_id}`. Caller must see both. |
| DELETE | `/api/knowledge/:id/links/:card_id`       | Remove link. Caller must see both. |
| GET    | `/api/cards/:id/knowledge`                | Reverse: list knowledge linked to card (visibility filtered). Mounted in `routes/cards.ts`. |
| POST   | `/api/knowledge/from-card/:card_id`       | "Save as knowledge" from card. Pulls URL/title from card, creates item, auto-creates link. |

### 4.1 Create / update body

```ts
{
  title: string,            // 1..200, trimmed
  title_auto?: boolean,     // default false; true marks title as placeholder replaceable by auto-fetch
  url?: string | null,      // RFC 3986 http(s) only
  body?: string,            // 0..200_000
  tags?: string[],          // max 10, lowercased, deduped, each <=32 chars
  visibility: 'private' | 'inbox' | 'shared',
  shares?: string[],        // user_ids; only valid when visibility='shared'
  auto_fetch?: boolean,     // default: true if url && !body, false otherwise
}
```

### 4.2 Validation

- `title` required, 1–200 chars, trimmed.
- `url` if present: must parse, scheme `http`/`https` only, host non-empty.
- At least one of `url`, `body` non-empty.
- `tags` max 10, lowercased, deduped, each ≤32 chars.
- `shares` ignored unless `visibility='shared'`; share user_ids must exist.
- `body` hard cap 200,000 chars (~200KB) — protects DB and FTS index.

### 4.3 Auto-fetch flow

1. If `auto_fetch && url && !body`: insert with `fetch_status='pending'`, return immediately.
2. Background worker (in-process `setImmediate` + `Promise`, no queue infra): fetch → parse → update.
3. Fetch: Node 22 native `fetch`, 10s timeout via `AbortController`, max 5MB response, content-type must start with `text/html` or `application/xhtml`, redirects ≤5.
4. Parse: `@mozilla/readability` + `jsdom`. Extract text content. Replace `title` with extracted value only if `title_auto=true`; else preserve user-supplied title. After replacement, set `title_auto=false`.
5. On success: `fetch_status='ok'`, `body=<extracted>`, `fetched_at=now()`, broadcast `knowledge.updated`.
6. On failure: `fetch_status='failed'`, `fetch_error=msg`, broadcast.
7. **SSRF guard:** before fetch, resolve host via `dns.lookup({all:true})`. Reject if any A/AAAA falls in private ranges (`10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16`, `::1`, `fe80::/10`, `fc00::/7`) or if hostname is `localhost`.

### 4.4 Embedding pipeline (gated)

- New file `server/src/ai/embed.ts` exports `embedText(text)`. Uses OpenAI client only (`text-embedding-3-small`, 1536 dims). OpenRouter embedding coverage uneven; explicit OpenAI requirement when `KNOWLEDGE_EMBEDDINGS=true`. If `OPENAI_API_KEY` unset, log warning and disable.
- Truncate input to 32000 chars. Format: `${title}\n\n${body}`.
- Trigger points: `POST /api/knowledge` with non-empty body or title; `PATCH` if body/title changed; auto-fetch worker on success.
- Enqueue mechanism: in-process queue (single-flight `Promise` chain in `server/src/ai/embed_queue.ts`). Failures retried once with 5s delay; second failure logged + dropped (row stays unembedded).

### 4.5 Semantic search endpoint

```ts
POST /api/knowledge/search/semantic
{ q: string, limit?: number /* 1..20, default 10 */, scope?: 'mine'|'inbox'|'all' }
```

Logic:

1. If embeddings disabled → 501.
2. Compute query embedding.
3. SQL:
   ```sql
   SELECT k.*, (e.embedding <=> $1::vector) AS dist
   FROM knowledge_items k
   JOIN knowledge_embeddings e ON e.knowledge_id = k.id
   WHERE NOT k.archived
     AND <visibility predicate>
     AND <scope filter>
   ORDER BY dist ASC
   LIMIT $2
   ```
4. Return items + `score = 1 - dist`.

### 4.6 Backfill

Items created before `KNOWLEDGE_EMBEDDINGS=true` flipped on have no embedding row. Endpoint excludes them silently. CLI script `server/src/scripts/backfill_embeddings.ts` walks unembedded items in batches of 50 with 250ms gap. Documented in README. No automatic backfill on startup (avoids surprise API spend).

### 4.7 Error responses

| Condition | Status |
| --------- | ------ |
| Validation fail | 400 `{error}` |
| Not visible / not found | 404 |
| Non-owner mutation | 403 |
| URL fetch SSRF reject | 400 `{error: 'unsafe url'}` |
| Embeddings disabled | 501 `{error: 'semantic search disabled'}` |

### 4.8 WebSocket broadcasts

Mirror cards pattern, per-client filtered:

- `knowledge.created`, `knowledge.updated`, `knowledge.deleted`
- `knowledge.link.created`, `knowledge.link.deleted` (payload: `{knowledge_id, card_id}`)

Filter applies visibility predicate per connected user. Mirror tokens never receive knowledge events (knowledge ≠ today/doing kiosk).

## 5. Web UI

### 5.1 New route + nav

`web/src/App.tsx` gains route `/knowledge`. `BoardHeader` gets new tab control next to scope selector: **Board** | **Knowledge**. Same auth gate.

New top-level component `web/src/KnowledgeView.tsx`. Layout:

```
┌──────────────────────────────────────────────┐
│ [Board] [Knowledge]   scope: mine▼   [+ New] │
├──────────────────────────────────────────────┤
│ 🔎 search...                  [⌘K semantic]  │
│ #tag1 #tag2 #tag3 ... (chip filter)          │
├──────────────────────────────────────────────┤
│ ┌─ item ─────────────────────────────────┐   │
│ │ 🔗 Title goes here                  🔒 │   │
│ │ host.com — first 200 chars of body...  │   │
│ │ #tag1 #tag2  ·  3 cards linked  ·  2d  │   │
│ └────────────────────────────────────────┘   │
│ ┌─ item ─────────────────────────────────┐   │
│ ...                                          │
└──────────────────────────────────────────────┘
```

- Search box debounced 250ms, hits `/api/knowledge?q=`. Empty `q` = recent first.
- `⌘K semantic` toggle: routes to `/search/semantic` when embeddings enabled. Hidden if 501 returned once.
- Tag chips: top 20 tags from current visible set; click toggles filter (AND against `q`).
- Scope selector: `mine` / `inbox` / `all` mirroring board.
- Visibility badge: 🔒 private / 📥 inbox / 👥 shared.
- `fetch_status='pending'` → spinner; `failed` → red badge + retry button (`/refetch`).

### 5.2 New / Edit modal

`web/src/components/KnowledgeEditDialog.tsx`:

- Fields: URL (text), Title (text), Body (textarea, ~12 lines), Tags (chip input), Visibility (radio), Shares (user multi-select, only when shared), `[ ] Auto-fetch when I save`.
- Save disabled until validation passes.
- Paste-URL behavior: pasting URL into empty form auto-checks Auto-fetch, pre-fills Title with hostname, and sets internal `title_auto=true`. If the user edits Title, flip `title_auto=false`. Send both fields on submit.
- Edit mode: same form, owner-only access. Non-owner sees read-only detail view.

### 5.3 Detail view

Click an item → `KnowledgeDetail` (modal or right-pane):

- Title, URL (clickable, new tab), full body (markdown rendered if lib present, else preformatted), tags, owner, visibility, fetched_at.
- "Linked cards" section: list of linked cards (clickable → card edit dialog).
- "Attach to card" picker: typeahead over visible cards; on select calls `POST /:id/links`.
- Owner-only: Edit / Refetch / Archive buttons.

### 5.4 Card edit dialog integration

`web/src/components/EditDialog.tsx` gains "Knowledge" subsection below tags:

- Lists currently-linked knowledge items with title + visibility badge + unlink button.
- "Attach knowledge" button → picker (typeahead over visible knowledge).
- "Save as knowledge" button visible only when card has URL in description and no existing link covers it. Calls `POST /api/knowledge/from-card/:card_id`.

### 5.5 Live updates

`web/src/ws.ts` extended to dispatch knowledge events. New `useKnowledge()` hook in `web/src/hooks/useKnowledge.ts`:

- Loads `/api/knowledge?scope=...` once, subscribes to WS.
- On `knowledge.created/updated`: insert/replace if visible per current scope.
- On `knowledge.deleted`: remove.
- On link events: invalidate affected card's link list.

### 5.6 PWA share target

`web/public/manifest.webmanifest` gains:

```json
"share_target": {
  "action": "/knowledge/share",
  "method": "GET",
  "params": { "title": "title", "text": "text", "url": "url" }
}
```

Route `/knowledge/share` reads query, opens `KnowledgeEditDialog` pre-filled, defaults `auto_fetch=true` when URL present.

### 5.7 Frontend types

`web/src/types.ts` adds:

```ts
export type KnowledgeVisibility = 'private' | 'inbox' | 'shared';
export type KnowledgeFetchStatus = 'pending' | 'ok' | 'failed' | 'skipped';

export interface KnowledgeItem {
  id: string; owner_id: string;
  title: string; url: string | null; body: string;
  tags: string[]; visibility: KnowledgeVisibility;
  source: 'manual' | 'telegram' | 'share_target' | 'from_card';
  fetch_status: KnowledgeFetchStatus | null;
  fetch_error: string | null; fetched_at: string | null;
  archived: boolean; created_at: string; updated_at: string;
  title_auto: boolean;
  shares?: string[]; linked_card_ids?: string[];
}
```

## 6. Telegram Bot

### 6.1 Commands (DM-only)

| Command | Behavior |
| ------- | -------- |
| `/save <url>`             | Auto-fetch URL, create knowledge item. Owner = sender. Default visibility = `private`. |
| `/save <url> \| <title>`  | Explicit title (pipe separator). Skip readability title extraction. |
| `/note <body>`            | Free-form note. First line = title (≤200 chars), rest = body. |
| `/k <query>`              | FTS search. Returns top 5 with inline buttons. Falls back to semantic if FTS empty + embeddings enabled. |
| `/klist`                  | List 10 most-recent visible items with title + host. |

Group-chat invocations silently ignored (matches templates pattern).

### 6.2 `/save` flow

1. Parse args; if no URL → usage hint.
2. Reply with placeholder: `🔗 Saving <host>...`.
3. Insert with `fetch_status='pending'`, `source='telegram'`, `visibility='private'`. Title = URL hostname if no `| <title>` supplied (and `title_auto=true`); else explicit title (`title_auto=false`).
4. Trigger same auto-fetch worker as web.
5. On worker complete: edit placeholder → `✓ Saved · <title>` with inline buttons:
   - `[👥 Share with family]` → flips visibility to `inbox`
   - `[🏷 Tag]` → prompts for tags (single message reply, parsed as space-separated)
   - `[🗑 Discard]` → archive
6. On fetch failure: edit message → `⚠ Saved (no preview): <error>` with same buttons.

### 6.3 `/note` flow

Insert immediately with `body=<rest>`, `title=<first line>`, `source='telegram'`, no fetch. Same post-save buttons as `/save`.

### 6.4 `/k <query>` flow

1. FTS search via existing `/api/knowledge?q=` logic, scoped to caller's visibility.
2. Reply: numbered list of titles + `host.com` snippet. Each result has callback button `[1] [2] [3] …`.
3. Tap result → reply with full body (truncated to 4000 chars; longer linked back to web app `/knowledge/<id>`).
4. Empty FTS + `KNOWLEDGE_EMBEDDINGS=true` → fallback to `/search/semantic`, prefix reply with `🤖 Semantic match:`.
5. Empty both → `Nothing matched.`

### 6.5 `/klist` flow

Same as `/k` but list-by-recency, no query. Same callback buttons.

### 6.6 Edge cases

- URL fails SSRF guard → reply `Cannot fetch <url>: blocked.`
- URL fetch timeout → save with `fetch_status='failed'`; `/k` can still surface URL.
- `/save` with multiple URLs in one message → use first; rest ignored. Hint in reply.
- `/note` with body >200KB → reject with size hint.
- Sender unlinked → reply `Link your Telegram identity in the app first.`

### 6.7 Tests

Extend `server/src/__tests__/telegram_parse.test.ts`:

- `/save https://...` → `{cmd:'save', url, title:undefined}`
- `/save https://... | My Title` → `{cmd:'save', url, title:'My Title'}`
- `/note line1\nline2\nline3` → `{title:'line1', body:'line2\nline3'}`
- `/k some query` → `{cmd:'k', q:'some query'}`
- Empty-arg edge cases for each command.

## 7. Embeddings & Semantic Search Bootstrap

`server/src/index.ts` startup hook (after schema load):

```ts
if (process.env.KNOWLEDGE_EMBEDDINGS === 'true') {
  try {
    await db.query('CREATE EXTENSION IF NOT EXISTS vector');
    await db.query(`
      CREATE TABLE IF NOT EXISTS knowledge_embeddings (
        knowledge_id UUID PRIMARY KEY REFERENCES knowledge_items(id) ON DELETE CASCADE,
        embedding    vector(1536) NOT NULL,
        model        TEXT NOT NULL,
        embedded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_embed_cos
        ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)`);
  } catch (err) {
    log.warn('pgvector unavailable; semantic search disabled', err);
    EMBEDDINGS_DISABLED = true;
  }
}
```

If `OPENAI_API_KEY` unset, also disable. Endpoint returns 501 in either case.

Cost note: `text-embedding-3-small` ≈ $0.02 / 1M tokens. Family-scale (a few hundred items, ~5K tokens average) ≈ $0.0001 per item. Negligible. Documented in `.env.example`.

## 8. Tests

Backend (`server/src/__tests__/`):

- `knowledge_routes.test.ts` — visibility predicate (private/inbox/shared/cross-user); validation; FTS happy path; cursor pagination; owner-only PATCH/DELETE 403; from-card flow.
- `knowledge_fetch.test.ts` — auto-fetch happy path (mocked HTML → readability); SSRF guard rejects `localhost`/`10.0.0.1`/`169.254.169.254`; size cap; timeout; non-text content-type rejected; redirect cap.
- `knowledge_embed.test.ts` — embed queue enqueues on create/body-change; skips when disabled; retry logic; semantic search SQL filters by visibility (mocked embeddings).
- `telegram_parse.test.ts` (extend) — see §6.7.
- `knowledge_links.test.ts` — link creation requires visibility on both sides; reverse `GET /api/cards/:id/knowledge` filters by visibility.

Frontend: matches project's minimal FE-test footprint. Manual smoke checklist below substitutes.

## 9. Rollout

- Schema additive + idempotent. Re-running `schema.sql` on prod DB safe.
- pgvector extension creation gated by `KNOWLEDGE_EMBEDDINGS=true`. Default off.
- Auto-fetch on by default (`KNOWLEDGE_AUTOFETCH=true`); opt-out via `false`.
- New env vars in `.env.example`:
  - `KNOWLEDGE_EMBEDDINGS=false` (set `true` to enable semantic search; requires `OPENAI_API_KEY` and pgvector)
  - `KNOWLEDGE_AUTOFETCH=true`
  - `KNOWLEDGE_FETCH_TIMEOUT_MS=10000`
  - `KNOWLEDGE_BODY_MAX_CHARS=200000`
- No feature flag for base feature. Blast radius contained: new tables, new routes, new UI tab, new bot commands. Existing card flow untouched.
- Deploy order: schema → server → web. Telegram handler picks up on next server restart.
- Backfill embeddings: manual script run after enabling. Documented.

## 10. Manual Smoke Checklist (post-deploy)

1. Web `+ New` → URL only, auto-fetch on → item appears with `fetch_status=pending`, transitions to `ok` with body within ~10s.
2. Web `+ New` → plain text body, no URL → instant save, no fetch.
3. Web search box → query matches title; tag chip filter intersects.
4. Web scope toggle mine/inbox/all behaves like board scope.
5. Web edit visibility private→shared, add a sharee → other user sees via WS without reload.
6. Web card edit dialog → attach knowledge → linked count appears on knowledge row.
7. Web open card with URL in description → "Save as knowledge" creates item + auto-link.
8. PWA share target on phone → share Chrome page → form opens prefilled → save works.
9. Telegram `/save https://example.com` in DM → placeholder → fetched body → post-save buttons.
10. Telegram `/note buy eggs\nremember organic` → item created, title="buy eggs".
11. Telegram `/k eggs` → returns the note; tap result → full body.
12. Telegram `/klist` → 10 most recent.
13. Telegram group-chat `/save` → silently ignored.
14. SSRF: `/save http://localhost:3001` → blocked reply.
15. Embeddings off: `POST /search/semantic` → 501.
16. Embeddings on: enable env, run backfill script, semantic search ranks by relevance not recency.
17. Two browsers same user: edit item in one → other updates via WS.
18. Non-owner attempts PATCH on shared item → 403.
19. Archive item → disappears from list; not yet returned by `/api/knowledge`.

## 11. Open Questions

None. All Q1–Q5 answers locked:

- Relation: separate section, attachable to cards (B)
- Item kinds: URL bookmarks + paste body + auto-fetch + free-form notes (all four)
- Capture: web form + Telegram + auto-detect URL in card + PWA share target (all four)
- Retrieval: browse+tag + FTS + semantic + linked-from-card (all four)
- Visibility: cards-like (private / inbox / shared); no assignees concept
