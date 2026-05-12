# Card Chain — Tie Cards Together to Track Evolution

**Date:** 2026-05-12
**Branch (work):** `feat/card-chain` (off `main` post all prior merges)

## 1. Goal

Let users tie a new kanban card to one or more existing cards via labeled, free-form relationships (e.g., "evolves from", "supersedes", "split from") and view how an idea developed over time as a graph. Users can create links from the web edit dialog or at capture-time via Telegram. A chain modal renders the surrounding neighborhood as a react-flow node-link graph, with AI Insights attached as side-nodes so the brainstorming history travels with the idea chain.

This is a structural feature that adds long-term memory to the kanban — six months from now the user can open any card and trace the conversation that led to it.

## 2. Scope

### In scope
- New `card_links` table — free-form many-to-many between cards with one of 6 labels + optional note.
- REST endpoints: POST/DELETE/GET links + GET chain (BFS to N hops).
- WS broadcasts on link create/delete with visibility filter.
- EditDialog: new "Related cards" section listing in/out links + linker picker + label/note dialog.
- Chain modal: react-flow graph centered on the current card, ✨ AI insight side-nodes, click-to-recenter, double-click-to-open.
- Telegram destination keyboard: 🔗 Link to existing button + label picker + optional note.
- DB helpers + types (server + web).
- Tests for DB helpers, BFS depth bound, visibility filter, Telegram parser.
- README updated with the relationship-types table.

### Out of scope
- Graph layout persistence (re-runs dagre on each open).
- Drag-to-reposition saved to DB.
- Bulk link creation (one at a time only).
- Cross-tenant linking.
- Link weights / strength scoring.
- LLM duplicate detection ("this looks like a follow-up to X — confirm?") — phase-2.
- Telegram callback for the chain modal (web-only graph view in v1).
- Archived cards in the chain — archive removes the card and its links from the visible graph.

## 3. Decisions captured during brainstorming

| Decision | Choice |
|---|---|
| Relationship shape | **C** — free-form M:N, labeled, free-text notes per link |
| Where users create links | **C** — both web edit dialog and Telegram capture-time |
| How to view the chain | **C → B** — graph view (Q3) rendered as a modal (Q5) |
| Node + edge richness | **C** — rich node (title + status + age) + AI insights as side-nodes |
| Trigger surface | **B** — per-card `🧬 Chain` button in card edit dialog header |
| Rendering library | **A** — react-flow (~50KB, lazy-loaded) |

## 4. Data model

```sql
CREATE TABLE IF NOT EXISTS card_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  to_card_id   UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  label        TEXT NOT NULL CHECK (label IN (
    'evolves_from', 'supersedes', 'split_from',
    'related', 'inspired_by', 'duplicate_of'
  )),
  note         TEXT,
  created_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_card_id, to_card_id, label)
);

CREATE INDEX IF NOT EXISTS card_links_from_idx ON card_links (from_card_id);
CREATE INDEX IF NOT EXISTS card_links_to_idx   ON card_links (to_card_id);
```

**Direction convention:** `from_card_id` = child (new card), `to_card_id` = parent (existing card it relates to).

**Cycles:** allowed at the schema level. UI traversal caps depth at 6 hops to prevent runaway BFS.

**Visibility:** a link is visible if both endpoint cards are visible to the user (existing card-visibility predicate applied to both ends).

**Audit:** every create/delete writes an entry to `activity_log` (`action = 'card.link.create' | 'card.link.delete'`).

## 5. State machine

### Web flow

```
User clicks [🔗 Link to existing card] in Related cards section
  ↓
LinkPickerDialog opens:
  Step 1 — pick card:
    - top-10 recent cards visible to user (excl. self + already-linked)
    - search input → live FTS filter via searchCardsFts
    - tap a card row → proceeds to step 2
  Step 2 — label + note:
    - label dropdown (6 valid values, default 'related')
    - note textarea (optional, ≤ 500 chars)
    - [Save] → POST /api/cards/:id/links
    - [Back] → step 1
  ↓
On success:
  - WS broadcast card.link.created
  - Local cache update (useCardLinks hook)
  - LinkPickerDialog closes; Related cards list refreshes
On 409 duplicate:
  - Toast "Already linked with that label"
On 403:
  - Toast "Can't link — card not visible"
```

### Telegram flow

```
User in proposal-flow taps [🔗 Link to existing]
  ↓
Bot replies with recent-card picker (same pattern as photo attach):
  - top-5 cards + top-3 knowledge items visible to user
  - Reply-with-text → FTS-filter re-render
  - [Pick] button per item
  ↓
User taps Pick on a card → pendingLinkTargetId set on PendingProposal
Bot replies "Link to '<title>' — what kind of relationship?" with 6-button keyboard
  ↓
User taps a label → pendingLinkLabel set, awaitingLinkNote = true
Bot replies "Add a note? Reply with text or tap Skip."
  ↓
[User reply with text]   → note captured; finalize
[User taps Skip]         → no note; finalize
  ↓
Finalize:
  - Save card (existing finalizeCard flow + status from earlier picks)
  - Insert card_links row
  - Reply: "✓ Saved · <emoji> <status> — <title>\n🔗 <label> '<target-title>'\n   note: '<note>'"
  - Post-save keyboard with Brainstorm + Doing + Done + Trash
```

### Chain modal

```
[🧬 Chain] tapped on edit-dialog header
  ↓
CardChainModal opens; React.lazy loads react-flow chunk on demand
  ↓
useCardChain hook fetches GET /api/cards/:id/chain?depth=2
  ↓
Server BFS:
  WITH RECURSIVE walk AS (
    SELECT :start AS id, 0 AS depth
    UNION
    SELECT CASE WHEN cl.from_card_id = w.id THEN cl.to_card_id ELSE cl.from_card_id END AS id,
           w.depth + 1
    FROM walk w
    JOIN card_links cl ON cl.from_card_id = w.id OR cl.to_card_id = w.id
    WHERE w.depth < :depth
  )
  SELECT DISTINCT id FROM walk;
  -- followed by visibility-filtered card + insight + edge lookups
  ↓
Response: { nodes: Card[], edges: CardLink[], insights: Insight[] }
  ↓
Modal renders react-flow:
  - dagre layout, horizontal direction (LR)
  - centered card highlighted (thicker border + ✨ glow if insight present)
  - rich nodes (status emoji + title + age + tag-count)
  - edges with label always shown, note truncated to 40 chars below
  - ✨ side-nodes per card with insight (dashed edge)
  - top-left: [+1 hop] [-1 hop] buttons (depth ∈ [1, 6])
  - top-right: [← Back] closes modal
  ↓
Interactions:
  - click node → re-center on it (re-fetch chain at new center)
  - double-click node → close modal, open that card's EditDialog
  - click ✨ side-node → tooltip overlay with insight summary
  - drag to pan, scroll/pinch to zoom (react-flow defaults)
```

## 6. REST + WS

### REST

```
POST   /api/cards/:id/links
  body: { to_card_id, label, note? }
  validates: card visibility (both ends), label in enum, note ≤ 500 chars, no self-link
  inserts + UPSERT on UNIQUE (from, to, label)
  logActivity + WS broadcast
  201 { link } | 400 | 403 | 409 duplicate

DELETE /api/cards/:id/links/:linkId
  visibility check on either endpoint
  DELETE + logActivity + WS broadcast
  204 | 404 | 403

GET    /api/cards/:id/links
  immediate (1-hop) outgoing + incoming
  200 { links: CardLink[], related_cards: Card[] }

GET    /api/cards/:id/chain?depth=2
  BFS bounded by depth (1..6)
  200 { nodes: Card[], edges: CardLink[], insights: Insight[] }
```

### WS

```
{ type: 'card.link.created'; link: CardLink; from_owner_id: string; to_owner_id: string }
{ type: 'card.link.deleted'; id: string; from_card_id: string; to_card_id: string; from_owner_id: string; to_owner_id: string }
```

Visibility filter: emit only if receiving client has visibility on at least one endpoint card.

## 7. Component / file map

### New server
- `server/src/card_links.ts` — DB layer (`CardLinkLabel` enum + `CardLink` type + 4 helpers: `createLink`, `deleteLink`, `listLinksForCard`, `chainForCard`)
- `server/src/routes/card_links.ts` — 4 endpoints, auth + visibility + rate-limit
- `server/src/__tests__/card_links.test.ts` — unit tests on DB helpers
- `server/src/__tests__/card_links_routes.test.ts` — integration via Fastify inject
- `server/src/__tests__/card_chain.test.ts` — BFS depth bound + cycle handling + visibility

### Modified server
- `server/schema.sql` — append `card_links` table + indexes
- `server/src/ws.ts` — 2 new `BroadcastEvent` variants
- `server/src/index.ts` — register `card_links` routes
- `server/src/telegram/bot.ts` — `🔗 Link to existing` button + `link:` callback + label keyboard + note state
- `server/src/telegram/proposals.ts` — `pendingLinkTargetId`, `pendingLinkLabel`, `awaitingLinkNote` fields
- `server/src/__tests__/telegram_flow.test.ts` (existing) — extend with link-flow cases

### New web
- `web/src/components/CardChainModal.tsx` — react-flow modal
- `web/src/components/RelatedCardsSection.tsx` — section inside EditDialog
- `web/src/components/LinkPickerDialog.tsx` — pick-card + label + note flow
- `web/src/hooks/useCardChain.ts` — fetch + WS cache for chain
- `web/src/hooks/useCardLinks.ts` — fetch + cache for 1-hop list

### Modified web
- `web/src/types.ts` — `CardLink`, `CardLinkLabel`
- `web/src/api.ts` — 4 methods (`linkCards`, `unlinkCard`, `cardLinks`, `cardChain`)
- `web/src/App.tsx` + `MobileShell.tsx` — WS dispatch for `card.link.*`
- `web/src/components/EditDialog.tsx` — render `RelatedCardsSection` + `[🧬 Chain]` header button
- `web/package.json` — add `reactflow` dependency
- `README.md` — relationship-types table + UX walkthrough

≈ 18 files (9 new, 9 modified).

## 8. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Cycles cause infinite render loops | Server-side depth cap (6); react-flow handles cycles; UI shows toast on cycle detection |
| Large graphs slow render | Default depth = 2; family-scale fits well under 50 nodes |
| Accidental unlink | Confirm prompt on web; explicit cancel on Telegram; `activity_log` retains history |
| Duplicate links | `UNIQUE (from, to, label)` constraint; 409 on attempt |
| Visibility leak via chain BFS | Single SQL CTE applies visibility predicate before returning rows |
| react-flow bundle size | ~50KB gz; lazy-load via `React.lazy` so only paid when user opens the chain |
| Schema migration | `IF NOT EXISTS` idempotent; no backfill |
| WS spam on bulk link create | Rate-limit (10 link creates/minute per user) at REST layer |
| Telegram callback_data 64-byte limit | All callback strings stay under 50 bytes (`linkpick:<8>:<8>` etc.) |
| User picks knowledge item in Telegram link flow | Routes to existing `knowledge_card_links` path; doesn't create a `card_links` row |

## 9. Verification

- `cd server && npm test` clean (172 + ~12 new)
- `cd server && npx tsc --noEmit` clean
- `cd web && npm run build && npx tsc --noEmit` clean

Manual smoke (after deploy):
1. Open any card → "Related cards" section visible at bottom of edit dialog
2. Click `[🔗 Link to existing card]` → picker opens → pick a card → choose `evolves_from` → optional note → Save
3. New link appears in section + WS broadcast received by other connected clients
4. Click `[🧬 Chain]` → react-flow modal renders the 2-hop neighborhood
5. Click another node → graph re-centers
6. Double-click → modal closes, that card's edit dialog opens
7. ✨ side-node clickable → insight summary tooltip
8. `[Unlink]` button confirms then deletes; row disappears
9. DM bot text → destination keyboard now has `🔗 Link to existing` → pick card → pick label → reply note or Skip → card saves with linked relationship → check DB row
10. Search by reply text in the Telegram picker → filtered list

## 10. Done state

- `card_links` table created in dev + prod
- All 4 REST endpoints respond correctly with auth + visibility + rate-limit
- WS events delivered only to clients with visibility
- EditDialog renders Related cards + Chain button
- Chain modal lazy-loads react-flow + dagre, renders nodes/edges/insights, supports recenter + open-in-dialog
- Telegram destination keyboard adds `🔗 Link to existing` + label picker + note prompt
- Tests pass: card_links DB layer, routes, chain BFS, Telegram parser
- README documents the relationship types + UX walkthrough
- Spec + plan committed; PR opened against `main`
