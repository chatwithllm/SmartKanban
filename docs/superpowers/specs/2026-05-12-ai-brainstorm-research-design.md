# AI Brainstorm Research — Spec

**Date:** 2026-05-12
**Branch (work):** `feat/ai-brainstorm` (created from `main` after PR #22 merge)

## 1. Goal

When the user explicitly opts in via a `🤔 Brainstorm` button on a card, run an asynchronous hybrid research pipeline (local FTS + Tavily web search + LLM synthesis) that produces a structured AI Insights panel attached to the card. The panel surfaces three things: related items the user already has, fresh web findings with citations, and suggested next steps. Results are visible without diving into chat — they render as a dedicated panel in the card edit dialog and a truncated snippet on the board card preview.

This is a follow-up to the structured Telegram capture (PR #22). It does not change capture behavior; it adds an after-the-save deep-dive option.

## 2. Scope

### In scope
- New `ai_insights` table for storing pipeline results.
- New POST `/api/cards/:id/insights/brainstorm` to enqueue, GET endpoints to fetch.
- New background queue mirroring the existing embed_queue pattern.
- New `server/src/ai/brainstorm.ts` orchestrator and `server/src/ai/tavily.ts` HTTP client.
- Telegram post-save keyboard gains a `🤔 Brainstorm` button + `brainstorm:<cardId>` callback handler.
- Telegram nudge to the requesting user when an insight completes (or fails).
- Web app:
  - `AiInsightsPanel.tsx` (new) renders the panel inside the card edit dialog and mobile bottom-sheet.
  - Board card preview shows ✨ icon + truncated summary when an insight is ready; pulsing 🤔 while pending.
- WS broadcast events `insight.queued`, `insight.updated`, `insight.failed` filtered by card visibility.
- New env var `TAVILY_API_KEY` — optional; when absent, pipeline runs in degraded mode (no web step).
- Tests: FTS-key-terms extraction, Tavily client (mocked HTTP), prompt builder + parser, integration tests for POST endpoint.
- README + .env.example updated.

### Out of scope
- Streaming responses (LLM token-by-token push).
- Multi-turn brainstorm conversations (one-shot only; follow-up still goes through existing `@ai` chat).
- Image / OCR research; only card title + description text in v1.
- Cross-user insight sharing beyond standard card visibility.
- Insight history UI (DB keeps history; v1 surfaces latest only).
- Rate-limit bypass for admins.
- Email or push notification on completion (Telegram nudge + WS only).
- Insight-aware search (don't include insight bodies in card FTS).

## 3. Decisions captured during brainstorming

| Decision | Choice |
|---|---|
| Trigger | **C** — explicit opt-in per card via a `🤔 Brainstorm` button on the post-save keyboard (and a web equivalent in card chat) |
| Research scope | **C** — hybrid: local FTS context + Tavily web search + LLM synthesis |
| Output location | **E** — dedicated panel in card edit dialog + truncated snippet on board card preview |
| Web search provider | **A** — Tavily (free tier 1000/mo, $0.005/search after, AI-friendly JSON) |
| Sync vs async | **B** — async via background queue; Telegram acks immediately, completion via WS + Telegram nudge |
| Schema migration | Idempotent `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` |

## 4. State machine

```
User taps 🤔 Brainstorm (Telegram or web)
  ↓
1. INSERT INTO ai_insights (card_id, requested_by, status='pending')
2. enqueueBrainstorm(insightId)
3. Reply on Telegram: "✓ Research queued — open card for results when ready"
   WS broadcast: { type: 'insight.queued', insight: {...} }
  ↓ Queue worker picks up
4. Local context:
     - searchCardsFts(user_id, title + key_terms, limit=5)
     - searchKnowledgeFts(user_id, same, limit=3)
     - key_terms = capitalized words + tags (regex, no LLM)
5. Web search:
     POST https://api.tavily.com/search
       body: { api_key, query: card.title + ' ' + description.slice(0,200),
               search_depth: 'basic', max_results: 5,
               include_answer: false, include_raw_content: false }
     Timeout: 8s. On any failure → degraded=true, skip section.
6. LLM synthesis (OpenRouter Gemini 2.0 Flash):
     System: "Research assistant. Output strict JSON: { summary, related_items[],
              web_findings[], next_steps[] }. Cap next_steps at 4, web_findings at 3."
     User: card snapshot + local FTS hits + Tavily results
     temperature=0.3, response_format=json_object, timeout=10s
7. UPDATE ai_insights SET status='ok', summary, body, degraded, completed_at
8. WS broadcast: { type: 'insight.updated', insight }
9. Telegram nudge to requested_by: "📚 Brainstorm done — <card title>"

If any step throws:
   UPDATE ai_insights SET status='failed', error
   WS broadcast: { type: 'insight.failed', insight }
   Telegram nudge: "⚠ Brainstorm failed — try again"
```

Total expected duration: 5–12s.

## 5. Schema

```sql
CREATE TABLE IF NOT EXISTS ai_insights (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id       UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  requested_by  UUID NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL CHECK (status IN ('pending','ok','failed')) DEFAULT 'pending',
  summary       TEXT,
  body          JSONB,
  error         TEXT,
  degraded      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ai_insights_card_idx
  ON ai_insights (card_id, created_at DESC);
```

`body` JSONB shape:
```json
{
  "related_items": [
    { "kind": "card" | "knowledge", "id": "<uuid>", "title": "...", "why": "..." }
  ],
  "web_findings": [
    { "title": "...", "url": "https://...", "why": "..." }
  ],
  "next_steps": ["step 1", "step 2"]
}
```

## 6. API + WebSocket

### REST

```
POST   /api/cards/:id/insights/brainstorm
  - Auth: session required
  - Visibility check on card
  - Rate limit: max 5 pending insights per user; max 1 pending per card; max 50/day per user
  - Side effect: insert pending insight + enqueue
  - 202 { id, status: 'pending' }
  - 403 if no visibility, 404 if not found, 429 if any rate limit hit

GET    /api/cards/:id/insights
  - Latest 10, ordered DESC
  - Visibility check
  - 200 { insights: [...] }

GET    /api/insights/:id
  - Single fetch
  - Visibility = visibility of parent card
```

### WS events

```
{ type: 'insight.queued',  insight: { id, card_id, status: 'pending', created_at } }
{ type: 'insight.updated', insight: { id, card_id, status, summary, body, degraded, completed_at } }
{ type: 'insight.failed',  insight: { id, card_id, status: 'failed', error } }
```

Per-client broadcast filtering: reuse the existing `cardVisibilityPredicate` to emit only to clients with card visibility.

## 7. Background queue

New file `server/src/ai/brainstorm_queue.ts` mirroring `server/src/ai/embed_queue.ts`:

```ts
type Job = { insightId: string };
const queue: Job[] = [];
let busy = false;

export function enqueueBrainstorm(insightId: string): void {
  queue.push({ insightId });
  if (!busy) void drain();
}

async function drain(): Promise<void> {
  busy = true;
  while (queue.length > 0) {
    const job = queue.shift()!;
    try { await runBrainstorm(job.insightId); }
    catch (e) { await markInsightFailed(job.insightId, e); }
  }
  busy = false;
}
```

**Startup recovery:** on boot, scan `SELECT id FROM ai_insights WHERE status='pending' AND created_at > now() - interval '1 hour'` and re-enqueue. Older pending rows are marked failed with `error='abandoned on restart'`.

## 8. UI surfaces

### Card Edit Dialog — AI Insights panel

Renders between description+tags and the Knowledge section. Light gold-lightest background tint. ✨ icon on header.

**Empty state** (no insight yet for this card): panel header + a single CTA button:
```
┌─ ✨ AI Insights ──────────────────────────┐
│  [🤔 Brainstorm this card]                │
│  Hybrid research: local context + web     │
└───────────────────────────────────────────┘
```
Clicking the CTA calls POST `/api/cards/:id/insights/brainstorm` and the panel flips to the pending skeleton.

**Filled state** (latest insight exists): renders content with `[🔄 Re-run]` in the header to start a fresh insight (replaces UI snippet; previous rows stay in DB).

```
┌─ ✨ AI Insights ──────────  [🔄 Re-run]  ─┐
│ <summary>                                 │
│                                           │
│ Related items you have                    │
│  • [card] "..." — why                     │
│  • [knowledge] "..." — why                │
│                                           │
│ Web findings                              │
│  • "..." — why  →  https://...            │
│                                           │
│ Next steps                                │
│  1. ...                                   │
│  2. ...                                   │
└───────────────────────────────────────────┘
```

States:
- `pending`: skeleton bars + spinner + "Researching…" caption
- `ok`: full render as above
- `failed`: red banner with retry button
- `degraded=true`: "(web search disabled)" caption above missing web section

### Board card preview

When `latest_insight.status='ok'`:
- ✨ icon top-right of card
- Truncated `insight.summary` (80 chars + ellipsis) under description preview, in muted color
- Tooltip on ✨: "AI Insights ready"

When `latest_insight.status='pending'`:
- Pulsing 🤔 icon top-right
- No snippet yet

### Mobile

`MobileCardActions` bottom-sheet renders the same panel under description, with same retry/loading/error states.

## 9. Telegram integration

### Post-save keyboard adds 🤔 Brainstorm button

```
✓ Saved · 📅 Today — <title>

[⚡ Doing] [✅ Done] [🤔 Brainstorm] [🗑]
```

### New callback `brainstorm:<cardId>`

Handler:
1. Resolve requesting Telegram user → app_user_id
2. Visibility check on card
3. Rate-limit check (same as REST)
4. Call shared internal helper that inserts pending insight + enqueues
5. Edit message: replace keyboard with the standard move-column row (no Brainstorm button anymore)
6. Reply inline: "✓ Research queued — open card for results when ready"

### Telegram nudge on completion

Sent to `requested_by` user as a DM. Format:
- Success: `📚 Brainstorm done — <card title>`
- Failure: `⚠ Brainstorm failed: <error short> — try again from the card`

If the requesting user has no DM channel with the bot (never DM'd), nudge is silently skipped; web UI still surfaces via WS.

## 10. Configuration

New env in `server/.env`:
```
TAVILY_API_KEY=
```

Behavior:
- Set + valid: full hybrid pipeline
- Unset or invalid: web step skipped, `degraded=true`, pipeline still completes with local + LLM synthesis
- The brainstorm CTA is always shown (no env-gated UI)

`AI_ENABLED()` check still gates the LLM step. If no AI is configured at all, brainstorm is rejected at submission time with 503.

## 11. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Tavily quota exhausted | Free tier 1000/mo; rate limits per-user (5 pending, 50/day); `degraded=true` on Tavily error |
| Malformed LLM JSON | try/catch parse; `status='failed'` + diagnostic in `error`; retry button |
| Process restart loses queue | Startup recovery scan re-enqueues `pending` rows created in last hour; older rows marked failed |
| Drain blocks request handlers | Async drain; per-job timeouts (Tavily 8s, LLM 10s); ~20s max wall-clock |
| Card edit during pending insight | Job uses snapshot at start; not auto-invalidated. User clicks Re-run to refresh. |
| Multiple concurrent re-runs | Allowed — new rows; UI shows latest only |
| Cost runaway | Per-user daily cap 50; per-card pending cap 1; ~$0.25/day max worst case |
| Visibility leak via WS | Reuse `cardVisibilityPredicate` filter on emit |
| Missing TAVILY_API_KEY | `degraded=true`; pipeline still useful |
| Schema migration on populated DB | `IF NOT EXISTS` idempotent; no backfill |

## 12. Verification

```bash
cd server && npm test           # green
cd server && npx tsc --noEmit   # clean
cd web && npm run build && npx tsc --noEmit   # clean

# Manual smoke after deploy
1. DM bot a research-y message ("Rethink smartmirror streaming. Frigate vs scrypted vs HA.")
2. Pick destination → column → save
3. Tap 🤔 Brainstorm on post-save keyboard
4. Bot replies "✓ Research queued"
5. Web app: card shows pulsing 🤔 icon
6. Wait 10-15s
7. Card flips to ✨ + snippet under description on the board
8. Open card → AI Insights panel shows summary + 3 sections with clickable links
9. Click a related-card link → navigates to that card
10. Click a web finding URL → opens externally
11. Tap "🔄 Re-run" → status flips back to pending → new insight ~10-15s later
12. Unset TAVILY_API_KEY + restart → tap Brainstorm → insight completes with "(web search disabled)" caption
13. Tap 🤔 on a card with one pending → 429 returned
14. Telegram DM: "📚 Brainstorm done — <title>" arrives shortly after completion
```

## 13. Done state

- New `ai_insights` table + index exist in dev + prod
- POST /api/cards/:id/insights/brainstorm queues a job; returns 202
- GET /api/cards/:id/insights returns latest 10
- WS events `insight.queued|updated|failed` arrive only on visibility match
- Background queue processes sequentially with timeouts
- Telegram post-save keyboard has 🤔 Brainstorm button
- Telegram nudge sent on completion to requesting user (if DM available)
- Card edit dialog renders AI Insights panel (gold-lightest tint)
- Board card preview shows ✨ + truncated summary when ready; pulsing 🤔 while pending
- Mobile bottom-sheet renders same panel
- `TAVILY_API_KEY` documented in `.env.example`; absent → degraded mode works
- New tests pass: insights routes, brainstorm pipeline, Tavily client, FTS key-terms helper, JSON parser
- README updated with feature description and env var
- Spec + plan committed; PR open against `main`

## 14. Affected files (~19)

**New:**
- `server/src/insights.ts`
- `server/src/routes/insights.ts`
- `server/src/ai/brainstorm.ts`
- `server/src/ai/brainstorm_queue.ts`
- `server/src/ai/tavily.ts`
- `server/src/__tests__/insights.test.ts`
- `server/src/__tests__/brainstorm.test.ts`
- `server/src/__tests__/tavily.test.ts`
- `web/src/components/AiInsightsPanel.tsx`

**Modified:**
- `server/schema.sql` (append `ai_insights` table + index)
- `server/src/telegram/bot.ts` (`brainstorm:` callback + post-save keyboard)
- `server/src/ws.ts` (allow new event types under existing visibility filter)
- `server/src/types.ts` (`Insight` type)
- `server/src/index.ts` (register routes; startup recovery)
- `web/src/components/EditDialog.tsx` (render panel)
- `web/src/components/MobileCardActions.tsx` (render panel in mobile sheet)
- `web/src/components/CardView.tsx` (✨ badge + snippet)
- `web/src/types.ts` (`Insight` type mirror)
- `web/src/api.ts` (`brainstormCard`, `listInsights`)
- `web/src/App.tsx` (handle `insight.*` WS events)
- `.env.example` (add `TAVILY_API_KEY=`)
- `README.md` (document feature + env var)
