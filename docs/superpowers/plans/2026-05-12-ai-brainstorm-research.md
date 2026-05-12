# AI Brainstorm Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand `🤔 Brainstorm` button on cards that triggers an async hybrid pipeline (local FTS + Tavily web search + Gemini Flash synthesis) producing a structured AI Insights panel.

**Architecture:** New `ai_insights` table stores results. POST endpoint inserts a `pending` row and enqueues; an in-process queue (mirroring `embed_queue.ts`) runs jobs sequentially with timeouts and emits WS broadcasts. Telegram post-save keyboard gains a `brainstorm:<cardId>` callback. Web app renders a dedicated `AiInsightsPanel` in the card edit dialog and a ✨ badge + snippet on the board card.

**Tech Stack:** Node 22, Fastify, TypeScript, PostgreSQL 16 (`jsonb`, `gen_random_uuid()`), `node:test`, grammy, React 18, Tailwind. New external: Tavily API (HTTPS). Existing OpenRouter / OpenAI clients for LLM synthesis.

**Spec:** [`docs/superpowers/specs/2026-05-12-ai-brainstorm-research-design.md`](../specs/2026-05-12-ai-brainstorm-research-design.md)

---

## Task 0: Branch + baseline

**Files:** none

- [ ] **Step 1: Confirm branch + baseline tests**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude
git checkout feat/ai-brainstorm
git log --oneline -3
cd server && npm test 2>&1 | tail -8
```

Expected: HEAD is `03c0588 docs(spec): AI brainstorm research pipeline`. Test count is whatever the merged `main` baseline shows (likely 140-ish since cards_fts + dedupe tests landed in PR #22).

- [ ] **Step 2: Capture baseline test count** for regression comparison later.

---

## Task 1: ai_insights schema migration

**Files:**
- Modify: `server/schema.sql`
- Create: `server/src/__tests__/ai_insights_schema.test.ts`

- [ ] **Step 1: Write failing test for table existence**

Create `server/src/__tests__/ai_insights_schema.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';

test('ai_insights table exists with required columns', async () => {
  const { rows } = await pool.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'ai_insights'
     ORDER BY ordinal_position`,
  );
  const names = rows.map((r) => r.column_name);
  for (const expected of [
    'id', 'card_id', 'requested_by', 'status',
    'summary', 'body', 'error', 'degraded',
    'created_at', 'completed_at',
  ]) {
    assert.ok(names.includes(expected), `missing column: ${expected}`);
  }
  const status = rows.find((r) => r.column_name === 'status');
  assert.equal(status?.data_type, 'text');
  const body = rows.find((r) => r.column_name === 'body');
  assert.equal(body?.data_type, 'jsonb');
});

test('ai_insights_card_idx exists', async () => {
  const { rows } = await pool.query(
    `SELECT indexdef FROM pg_indexes WHERE indexname = 'ai_insights_card_idx'`,
  );
  assert.equal(rows.length, 1);
});

test('ai_insights ON DELETE CASCADE from cards', async () => {
  const owner = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('AI', 'ai-fk@test', 'x') RETURNING id`,
  );
  const userId = owner.rows[0]!.id;
  const card = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('fk test', 'today', 'manual', $1, 1) RETURNING id`,
    [userId],
  );
  const cardId = card.rows[0]!.id;
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO ai_insights (card_id, requested_by, status)
     VALUES ($1, $2, 'pending') RETURNING id`,
    [cardId, userId],
  );
  const insId = ins.rows[0]!.id;
  try {
    await pool.query(`DELETE FROM cards WHERE id = $1`, [cardId]);
    const r = await pool.query(`SELECT 1 FROM ai_insights WHERE id = $1`, [insId]);
    assert.equal(r.rows.length, 0, 'insight should be cascade-deleted');
  } finally {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  }
});
```

- [ ] **Step 2: Run test, confirm fails**

```bash
cd server && npx tsx --test src/__tests__/ai_insights_schema.test.ts 2>&1 | tail -15
```

Expected: all 3 fail — table doesn't exist.

- [ ] **Step 3: Append schema to `server/schema.sql`**

Append at the bottom:

```sql

-- AI brainstorm research (2026-05-12): per-card insight rows
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

- [ ] **Step 4: Apply migration**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude
docker compose exec -T db psql -U kanban -d kanban < server/schema.sql 2>&1 | tail -5
```

Expected: clean (NOTICE if existing tables already there).

- [ ] **Step 5: Run test, confirm passes**

```bash
cd server && npx tsx --test src/__tests__/ai_insights_schema.test.ts 2>&1 | tail -10
```

Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude
git add server/schema.sql server/src/__tests__/ai_insights_schema.test.ts
git commit -m "$(cat <<'EOF'
feat(schema): ai_insights table + index

Per-card brainstorm result rows: status pending/ok/failed, summary text,
body JSONB, degraded flag, requested_by + created_at + completed_at.
GIN-less btree index on (card_id, created_at DESC) for latest-first.
ON DELETE CASCADE from cards so insight rows don't outlive the card.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Insight type + DB helpers

**Files:**
- Create: `server/src/insights.ts`
- Create: `server/src/__tests__/insights.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/src/__tests__/insights.test.ts`:

```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import {
  createInsight,
  getInsight,
  listInsightsForCard,
  countPendingByUser,
  countPendingByCard,
  countTodayByUser,
  markOk,
  markFailed,
  recoverPendingInsights,
} from '../insights.js';

let userId: string;
let cardId: string;

before(async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('Ins', 'ins@test', 'x') RETURNING id`,
  );
  userId = u.rows[0]!.id;
  const c = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('test card', 'today', 'manual', $1, 1) RETURNING id`,
    [userId],
  );
  cardId = c.rows[0]!.id;
});

after(async () => {
  await pool.query(`DELETE FROM ai_insights WHERE requested_by = $1`, [userId]);
  await pool.query(`DELETE FROM cards WHERE id = $1`, [cardId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
});

test('createInsight returns row with status=pending', async () => {
  const i = await createInsight(cardId, userId);
  assert.equal(i.card_id, cardId);
  assert.equal(i.status, 'pending');
  assert.equal(i.degraded, false);
});

test('getInsight by id returns the row', async () => {
  const created = await createInsight(cardId, userId);
  const fetched = await getInsight(created.id);
  assert.equal(fetched?.id, created.id);
});

test('listInsightsForCard returns latest first', async () => {
  await createInsight(cardId, userId);
  await new Promise((r) => setTimeout(r, 10));
  await createInsight(cardId, userId);
  const rows = await listInsightsForCard(cardId, 10);
  assert.ok(rows.length >= 2);
  assert.ok(new Date(rows[0]!.created_at).getTime() >= new Date(rows[1]!.created_at).getTime());
});

test('countPendingByUser counts only pending', async () => {
  const i = await createInsight(cardId, userId);
  const before = await countPendingByUser(userId);
  assert.ok(before >= 1);
  await markOk(i.id, 'summary', { foo: 1 }, false);
  const after = await countPendingByUser(userId);
  assert.equal(after, before - 1);
});

test('countPendingByCard counts only pending', async () => {
  const i = await createInsight(cardId, userId);
  const c = await countPendingByCard(cardId);
  assert.ok(c >= 1);
  await markFailed(i.id, 'boom');
  const c2 = await countPendingByCard(cardId);
  assert.equal(c2, c - 1);
});

test('countTodayByUser counts insights created today', async () => {
  await createInsight(cardId, userId);
  const c = await countTodayByUser(userId);
  assert.ok(c >= 1);
});

test('markOk sets summary, body, completed_at; clears error', async () => {
  const i = await createInsight(cardId, userId);
  await markOk(i.id, 'a summary', { x: 1 }, true);
  const r = await getInsight(i.id);
  assert.equal(r?.status, 'ok');
  assert.equal(r?.summary, 'a summary');
  assert.deepEqual(r?.body, { x: 1 });
  assert.equal(r?.degraded, true);
  assert.ok(r?.completed_at);
});

test('markFailed sets error and status', async () => {
  const i = await createInsight(cardId, userId);
  await markFailed(i.id, 'bad things');
  const r = await getInsight(i.id);
  assert.equal(r?.status, 'failed');
  assert.equal(r?.error, 'bad things');
});

test('recoverPendingInsights returns recent pending ids only', async () => {
  const recent = await createInsight(cardId, userId);
  // Manually backdate one to simulate >1h old pending
  const old = await createInsight(cardId, userId);
  await pool.query(
    `UPDATE ai_insights SET created_at = now() - interval '2 hours' WHERE id = $1`,
    [old.id],
  );
  const ids = await recoverPendingInsights();
  assert.ok(ids.includes(recent.id));
  assert.ok(!ids.includes(old.id));
  // Old one should have been marked failed by the helper
  const stale = await getInsight(old.id);
  assert.equal(stale?.status, 'failed');
});
```

- [ ] **Step 2: Run, confirm fails (module not found)**

```bash
cd server && npx tsx --test src/__tests__/insights.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Create `server/src/insights.ts`**

```ts
import { pool } from './db.js';

export type InsightStatus = 'pending' | 'ok' | 'failed';

export type InsightBody = {
  related_items?: Array<{ kind: 'card' | 'knowledge'; id: string; title: string; why: string }>;
  web_findings?: Array<{ title: string; url: string; why: string }>;
  next_steps?: string[];
};

export type Insight = {
  id: string;
  card_id: string;
  requested_by: string;
  status: InsightStatus;
  summary: string | null;
  body: InsightBody | null;
  error: string | null;
  degraded: boolean;
  created_at: string;
  completed_at: string | null;
};

const SELECT = `
  id, card_id, requested_by, status, summary, body, error, degraded,
  created_at, completed_at
`;

export async function createInsight(cardId: string, requestedBy: string): Promise<Insight> {
  const { rows } = await pool.query<Insight>(
    `INSERT INTO ai_insights (card_id, requested_by, status)
     VALUES ($1, $2, 'pending')
     RETURNING ${SELECT}`,
    [cardId, requestedBy],
  );
  return rows[0]!;
}

export async function getInsight(id: string): Promise<Insight | null> {
  const { rows } = await pool.query<Insight>(
    `SELECT ${SELECT} FROM ai_insights WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listInsightsForCard(cardId: string, limit: number): Promise<Insight[]> {
  const { rows } = await pool.query<Insight>(
    `SELECT ${SELECT} FROM ai_insights
     WHERE card_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [cardId, limit],
  );
  return rows;
}

export async function countPendingByUser(userId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM ai_insights WHERE requested_by = $1 AND status = 'pending'`,
    [userId],
  );
  return Number(rows[0]!.n);
}

export async function countPendingByCard(cardId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM ai_insights WHERE card_id = $1 AND status = 'pending'`,
    [cardId],
  );
  return Number(rows[0]!.n);
}

export async function countTodayByUser(userId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM ai_insights
     WHERE requested_by = $1 AND created_at::date = CURRENT_DATE`,
    [userId],
  );
  return Number(rows[0]!.n);
}

export async function markOk(
  id: string,
  summary: string,
  body: InsightBody,
  degraded: boolean,
): Promise<void> {
  await pool.query(
    `UPDATE ai_insights
     SET status = 'ok', summary = $2, body = $3::jsonb,
         degraded = $4, completed_at = now(), error = NULL
     WHERE id = $1`,
    [id, summary, JSON.stringify(body), degraded],
  );
}

export async function markFailed(id: string, error: string): Promise<void> {
  await pool.query(
    `UPDATE ai_insights
     SET status = 'failed', error = $2, completed_at = now()
     WHERE id = $1`,
    [id, error.slice(0, 500)],
  );
}

/**
 * Returns recent pending insight ids that should be re-enqueued on startup.
 * Pending rows older than 1 hour are marked failed (abandoned).
 */
export async function recoverPendingInsights(): Promise<string[]> {
  await pool.query(
    `UPDATE ai_insights
     SET status = 'failed', error = 'abandoned on restart', completed_at = now()
     WHERE status = 'pending' AND created_at < now() - interval '1 hour'`,
  );
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM ai_insights
     WHERE status = 'pending' AND created_at >= now() - interval '1 hour'
     ORDER BY created_at ASC`,
  );
  return rows.map((r) => r.id);
}
```

- [ ] **Step 4: Run, confirm passes**

```bash
cd server && npx tsx --test src/__tests__/insights.test.ts 2>&1 | tail -15
```

Expected: 9 PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/insights.ts server/src/__tests__/insights.test.ts
git commit -m "$(cat <<'EOF'
feat(insights): DB layer for ai_insights

createInsight / getInsight / listInsightsForCard, three rate-limit
counters (pending-by-user, pending-by-card, today-by-user), markOk /
markFailed, and recoverPendingInsights for startup recovery (older
than 1h marked failed, recent re-enqueued).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Tavily HTTP client

**Files:**
- Create: `server/src/ai/tavily.ts`
- Create: `server/src/__tests__/tavily.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/src/__tests__/tavily.test.ts`:

```ts
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { searchTavily, type TavilyResult } from '../ai/tavily.js';

test('searchTavily returns [] when no API key', async () => {
  const prev = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  const r = await searchTavily('anything');
  assert.deepEqual(r, []);
  if (prev) process.env.TAVILY_API_KEY = prev;
});

test('searchTavily posts to api.tavily.com and parses results', async () => {
  process.env.TAVILY_API_KEY = 'test-key';
  const fakeResponse = {
    results: [
      { title: 'Frigate docs', url: 'https://docs.frigate.video', content: 'NVR', score: 0.9 },
      { title: 'Scrypted', url: 'https://scrypted.app', content: 'NVR alt', score: 0.7 },
    ],
  };
  const fetchSpy = mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify(fakeResponse), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  try {
    const r = await searchTavily('frigate nvr');
    assert.equal(r.length, 2);
    assert.equal(r[0]!.url, 'https://docs.frigate.video');
    assert.equal(fetchSpy.mock.calls.length, 1);
    const [url, init] = fetchSpy.mock.calls[0]!.arguments as [string, RequestInit];
    assert.equal(url, 'https://api.tavily.com/search');
    assert.equal(init.method, 'POST');
    const body = JSON.parse(String(init.body));
    assert.equal(body.api_key, 'test-key');
    assert.equal(body.query, 'frigate nvr');
    assert.equal(body.search_depth, 'basic');
    assert.equal(body.max_results, 5);
  } finally {
    fetchSpy.mock.restore();
    delete process.env.TAVILY_API_KEY;
  }
});

test('searchTavily returns [] on HTTP error', async () => {
  process.env.TAVILY_API_KEY = 'test-key';
  const fetchSpy = mock.method(globalThis, 'fetch', async () =>
    new Response('{"error":"bad"}', { status: 401 }),
  );
  try {
    const r = await searchTavily('x');
    assert.deepEqual(r, []);
  } finally {
    fetchSpy.mock.restore();
    delete process.env.TAVILY_API_KEY;
  }
});

test('searchTavily returns [] on AbortError (timeout)', async () => {
  process.env.TAVILY_API_KEY = 'test-key';
  const fetchSpy = mock.method(globalThis, 'fetch', async (_url: any, init: any) => {
    // Simulate the abort by waiting until the signal fires
    const sig: AbortSignal = init.signal;
    await new Promise((_resolve, reject) => {
      sig.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    return new Response('{}'); // unreachable
  });
  try {
    const r = await searchTavily('x', 50); // 50ms timeout
    assert.deepEqual(r, []);
  } finally {
    fetchSpy.mock.restore();
    delete process.env.TAVILY_API_KEY;
  }
});

test('TavilyResult type shape exposes required fields', () => {
  const r: TavilyResult = { title: 't', url: 'u', content: 'c', score: 0.1 };
  assert.equal(r.title, 't');
});
```

- [ ] **Step 2: Run, confirm fails**

```bash
cd server && npx tsx --test src/__tests__/tavily.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Create `server/src/ai/tavily.ts`**

```ts
export type TavilyResult = {
  title: string;
  url: string;
  content: string;
  score: number;
};

const ENDPOINT = 'https://api.tavily.com/search';

/**
 * Performs a Tavily basic web search. Returns up to 5 results.
 *
 * On missing API key, HTTP error, network error, or timeout: returns [].
 * Callers must treat empty results as "degraded mode" rather than failure.
 */
export async function searchTavily(query: string, timeoutMs = 8000): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  const q = query.trim();
  if (!q) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: q,
        search_depth: 'basic',
        max_results: 5,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: Array<Partial<TavilyResult>> };
    if (!data.results || !Array.isArray(data.results)) return [];
    return data.results
      .filter(
        (r): r is TavilyResult =>
          typeof r.title === 'string' &&
          typeof r.url === 'string' &&
          typeof r.content === 'string' &&
          typeof r.score === 'number',
      )
      .slice(0, 5);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run, confirm passes**

```bash
cd server && npx tsx --test src/__tests__/tavily.test.ts 2>&1 | tail -10
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/tavily.ts server/src/__tests__/tavily.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): Tavily HTTP client

POST https://api.tavily.com/search with basic depth + max_results=5.
Returns [] on missing API key, HTTP error, network error, or 8s
timeout — callers treat empty as degraded mode. Strictly validates
the response shape before returning.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Brainstorm pipeline orchestrator

**Files:**
- Create: `server/src/ai/brainstorm.ts`
- Create: `server/src/__tests__/brainstorm.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/src/__tests__/brainstorm.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractKeyTerms,
  buildBrainstormPrompt,
  parseBrainstormResponse,
  type LocalContext,
  type WebContext,
} from '../ai/brainstorm.js';

test('extractKeyTerms picks capitalized words + hashtags', () => {
  const r = extractKeyTerms('Rethink Frigate setup on the HA mirror', ['camera', 'streaming']);
  assert.ok(r.includes('Rethink'));
  assert.ok(r.includes('Frigate'));
  assert.ok(r.includes('HA'));
  assert.ok(r.includes('camera'));
  assert.ok(r.includes('streaming'));
});

test('extractKeyTerms drops short words and stopwords', () => {
  const r = extractKeyTerms('on the of an and HA', []);
  assert.ok(!r.includes('on'));
  assert.ok(!r.includes('the'));
  assert.ok(r.includes('HA'));
});

test('buildBrainstormPrompt includes card, local, web sections', () => {
  const prompt = buildBrainstormPrompt(
    { title: 'My card', description: 'desc', tags: ['t1'] },
    {
      cards: [{ id: 'c1', title: 'related card', snippet: 'snip' }],
      knowledge: [{ id: 'k1', title: 'related kb', snippet: 'snip2' }],
    } satisfies LocalContext,
    {
      results: [{ title: 'web', url: 'https://x', content: 'web snip', score: 0.9 }],
    } satisfies WebContext,
  );
  assert.match(prompt, /My card/);
  assert.match(prompt, /related card/);
  assert.match(prompt, /related kb/);
  assert.match(prompt, /https:\/\/x/);
  assert.match(prompt, /strict JSON/i);
});

test('parseBrainstormResponse extracts well-formed JSON', () => {
  const raw = JSON.stringify({
    summary: 'a',
    related_items: [{ kind: 'card', id: 'c1', title: 't', why: 'w' }],
    web_findings: [{ title: 'wt', url: 'https://x', why: 'ww' }],
    next_steps: ['1', '2'],
  });
  const r = parseBrainstormResponse(raw);
  assert.equal(r.summary, 'a');
  assert.equal(r.body.related_items?.length, 1);
  assert.equal(r.body.web_findings?.length, 1);
  assert.equal(r.body.next_steps?.length, 2);
});

test('parseBrainstormResponse handles markdown fences', () => {
  const raw = '```json\n{"summary":"x","related_items":[],"web_findings":[],"next_steps":[]}\n```';
  const r = parseBrainstormResponse(raw);
  assert.equal(r.summary, 'x');
});

test('parseBrainstormResponse caps arrays', () => {
  const raw = JSON.stringify({
    summary: 's',
    related_items: Array(20).fill({ kind: 'card', id: 'x', title: 't', why: 'w' }),
    web_findings: Array(20).fill({ title: 't', url: 'https://x', why: 'w' }),
    next_steps: Array(20).fill('step'),
  });
  const r = parseBrainstormResponse(raw);
  assert.ok((r.body.related_items?.length ?? 0) <= 8);
  assert.ok((r.body.web_findings?.length ?? 0) <= 3);
  assert.ok((r.body.next_steps?.length ?? 0) <= 4);
});

test('parseBrainstormResponse throws on bad JSON', () => {
  assert.throws(() => parseBrainstormResponse('not json{'));
});
```

- [ ] **Step 2: Run, confirm fails**

```bash
cd server && npx tsx --test src/__tests__/brainstorm.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Create `server/src/ai/brainstorm.ts`**

```ts
import { chatPrimary, chatFallback } from './openai.js';
import { searchTavily, type TavilyResult } from './tavily.js';
import { searchCardsFts, loadCard, type Status } from '../cards.js';
import { searchKnowledgeFts } from '../knowledge.js';
import { getInsight, markOk, markFailed, type InsightBody } from '../insights.js';
import { broadcast } from '../ws.js';
import { pool } from '../db.js';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'on', 'in', 'and', 'or', 'to', 'for', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'this', 'that', 'these', 'those',
  'it', 'its', 'as', 'at', 'by', 'from', 'we', 'i', 'you', 'they', 'he', 'she',
]);

export type LocalContext = {
  cards: Array<{ id: string; title: string; snippet: string }>;
  knowledge: Array<{ id: string; title: string; snippet: string }>;
};

export type WebContext = {
  results: TavilyResult[];
};

export type BrainstormParsed = {
  summary: string;
  body: InsightBody;
};

export function extractKeyTerms(text: string, tags: string[]): string[] {
  const fromText = (text.match(/\b[A-Z][A-Za-z0-9_-]{1,}\b/g) ?? []).filter(
    (w) => !STOPWORDS.has(w.toLowerCase()) && w.length > 1,
  );
  const all = [...fromText, ...tags];
  return Array.from(new Set(all)).slice(0, 8);
}

export function buildBrainstormPrompt(
  card: { title: string; description: string; tags: string[] },
  local: LocalContext,
  web: WebContext,
): string {
  const localLines = [
    ...local.cards.map((c, i) => `  C${i + 1}. [card] '${c.title}' — ${c.snippet}`),
    ...local.knowledge.map((k, i) => `  K${i + 1}. [knowledge] '${k.title}' — ${k.snippet}`),
  ].join('\n') || '  (none)';
  const webLines = web.results
    .map((r, i) => `  W${i + 1}. '${r.title}' (${r.url}) — ${r.content.slice(0, 200)}`)
    .join('\n') || '  (none — web search unavailable or empty)';

  return [
    'You are a research assistant for a personal kanban.',
    '',
    'User card:',
    `  Title: ${card.title}`,
    `  Description: ${card.description || '(empty)'}`,
    `  Tags: ${card.tags.join(', ') || '(none)'}`,
    '',
    'Related items the user already has:',
    localLines,
    '',
    'Fresh web search results:',
    webLines,
    '',
    'Write a concise structured response. Output strict JSON with these keys:',
    '  summary       — 2-3 sentences overall',
    '  related_items — up to 8 items from the local list above, with reason ({kind,id,title,why})',
    '  web_findings  — up to 3 items from web list ({title,url,why})',
    '  next_steps    — up to 4 short imperative steps for the user',
    '',
    'For related_items, the id field must match exactly one of the local ids:',
    `    cards: ${local.cards.map((c) => c.id).join(', ') || 'none'}`,
    `    knowledge: ${local.knowledge.map((k) => k.id).join(', ') || 'none'}`,
    'Skip ids you do not recognize.',
  ].join('\n');
}

export function parseBrainstormResponse(raw: string): BrainstormParsed {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const obj = JSON.parse(cleaned) as Partial<{
    summary: string;
    related_items: Array<{ kind: string; id: string; title: string; why: string }>;
    web_findings: Array<{ title: string; url: string; why: string }>;
    next_steps: string[];
  }>;

  const summary = typeof obj.summary === 'string' ? obj.summary.slice(0, 600) : '';

  const related_items = (obj.related_items ?? [])
    .filter(
      (r) =>
        (r.kind === 'card' || r.kind === 'knowledge') &&
        typeof r.id === 'string' &&
        typeof r.title === 'string' &&
        typeof r.why === 'string',
    )
    .slice(0, 8)
    .map((r) => ({ kind: r.kind as 'card' | 'knowledge', id: r.id, title: r.title.slice(0, 200), why: r.why.slice(0, 200) }));

  const web_findings = (obj.web_findings ?? [])
    .filter(
      (w) =>
        typeof w.title === 'string' &&
        typeof w.url === 'string' &&
        typeof w.why === 'string' &&
        /^https?:\/\//.test(w.url),
    )
    .slice(0, 3)
    .map((w) => ({ title: w.title.slice(0, 200), url: w.url, why: w.why.slice(0, 200) }));

  const next_steps = (obj.next_steps ?? [])
    .filter((s) => typeof s === 'string')
    .slice(0, 4)
    .map((s) => s.slice(0, 240));

  return {
    summary,
    body: { related_items, web_findings, next_steps },
  };
}

/**
 * Runs the full pipeline for a given insight id.
 * Reads the card snapshot, builds local + web context, calls LLM, persists,
 * broadcasts. Caller (the queue) catches errors and calls markFailed.
 */
export async function runBrainstorm(insightId: string): Promise<void> {
  const insight = await getInsight(insightId);
  if (!insight) throw new Error('insight not found');

  const card = await loadCard(insight.card_id);
  if (!card) throw new Error('card not found');

  const query = (card.title + ' ' + (card.description ?? '')).trim();
  const keyTerms = extractKeyTerms(card.title + ' ' + (card.description ?? ''), card.tags);
  const ftsQuery = keyTerms.join(' ') || card.title;

  const [cardHits, kHits, tavilyHits] = await Promise.all([
    searchCardsFts(insight.requested_by, ftsQuery, 5),
    searchKnowledgeFts(insight.requested_by, ftsQuery, 3),
    searchTavily(query),
  ]);

  // Filter the requesting card itself out of the local context
  const local: LocalContext = {
    cards: cardHits
      .filter((c) => c.id !== card.id)
      .map((c) => ({ id: c.id, title: c.title, snippet: (c.description || '').slice(0, 160) })),
    knowledge: kHits.map((k) => ({ id: k.id, title: k.title, snippet: k.snippet })),
  };
  const web: WebContext = { results: tavilyHits };
  const degraded = web.results.length === 0;

  const target = chatPrimary() ?? chatFallback();
  if (!target) {
    throw new Error('no AI configured');
  }
  const prompt = buildBrainstormPrompt(
    { title: card.title, description: card.description ?? '', tags: card.tags },
    local,
    web,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let parsed: BrainstormParsed;
  try {
    const completion = await target.client.chat.completions.create(
      {
        model: target.model,
        messages: [
          { role: 'system', content: 'You return only valid JSON. No prose outside the JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      },
      { signal: controller.signal },
    );
    const raw = completion.choices[0]?.message?.content ?? '';
    parsed = parseBrainstormResponse(raw);
  } finally {
    clearTimeout(timer);
  }

  await markOk(insightId, parsed.summary, parsed.body, degraded);
  const final = await getInsight(insightId);
  if (final) {
    broadcast({ type: 'insight.updated', insight: final, card_id: insight.card_id, owner_id: card.created_by ?? '' });
  }
}

export async function failBrainstorm(insightId: string, error: string): Promise<void> {
  await markFailed(insightId, error);
  const final = await getInsight(insightId);
  if (final) {
    const card = await loadCard(final.card_id);
    broadcast({ type: 'insight.failed', insight: final, card_id: final.card_id, owner_id: card?.created_by ?? '' });
  }
}

/** Test-only: exposes pool for cleanup. */
export const _pool = pool;
```

Note: the `broadcast` call uses event types that don't exist yet (`insight.updated`, `insight.failed`). Task 6 adds them to `ws.ts`. Until then, this file won't typecheck. The build is broken between Task 4 and Task 6 — that's expected during incremental implementation. Each test in Task 4 only exercises pure functions (`extractKeyTerms`, `buildBrainstormPrompt`, `parseBrainstormResponse`), so the tests pass even though the orchestrator `runBrainstorm` won't compile yet. To keep typecheck clean, leave the `broadcast` calls commented-out in Task 4 and uncomment them in Task 6.

- [ ] **Step 4: Comment out the `broadcast` lines temporarily**

Replace:
```ts
broadcast({ type: 'insight.updated', insight: final, card_id: insight.card_id, owner_id: card.created_by ?? '' });
```
with:
```ts
// TODO(Task 6): broadcast insight.updated once ws.ts knows about the event
// broadcast({ type: 'insight.updated', insight: final, card_id: insight.card_id, owner_id: card.created_by ?? '' });
```

Same for `insight.failed`. Also remove the now-unused `broadcast` import.

- [ ] **Step 5: Run tests, confirm pure-function tests pass**

```bash
cd server && npx tsx --test src/__tests__/brainstorm.test.ts 2>&1 | tail -10
cd server && npx tsc --noEmit 2>&1 | tail -5
```

Expected: 7 PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add server/src/ai/brainstorm.ts server/src/__tests__/brainstorm.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): brainstorm pipeline orchestrator

Pure helpers: extractKeyTerms (capitalized words + tags, drops
stopwords), buildBrainstormPrompt (card + local context + web context
+ strict-JSON instruction with allowed id whitelist), parseBrainstorm
Response (strips fences, validates types, caps arrays). Orchestrator
runBrainstorm calls searchCardsFts + searchKnowledgeFts + searchTavily
in parallel, then OpenRouter Gemini Flash with json_object response
format and 10s timeout; persists via markOk/markFailed.

Broadcast wiring stubbed with TODO — Task 6 adds the WS event types.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Brainstorm queue + startup recovery

**Files:**
- Create: `server/src/ai/brainstorm_queue.ts`
- Modify: `server/src/index.ts`
- Create: `server/src/__tests__/brainstorm_queue.test.ts`

- [ ] **Step 1: Write failing tests for queue interface**

Create `server/src/__tests__/brainstorm_queue.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enqueueBrainstorm,
  _setRunnerForTest,
  _resetForTest,
  _drainOnceForTest,
} from '../ai/brainstorm_queue.js';

test('enqueue + drain calls runner with insight id', async () => {
  _resetForTest();
  const seen: string[] = [];
  _setRunnerForTest(async (id) => { seen.push(id); });
  enqueueBrainstorm('id-1');
  enqueueBrainstorm('id-2');
  await _drainOnceForTest();
  assert.deepEqual(seen, ['id-1', 'id-2']);
});

test('runner failure does not stop subsequent jobs', async () => {
  _resetForTest();
  const seen: string[] = [];
  _setRunnerForTest(async (id) => {
    seen.push(id);
    if (id === 'bad') throw new Error('boom');
  });
  enqueueBrainstorm('a');
  enqueueBrainstorm('bad');
  enqueueBrainstorm('c');
  await _drainOnceForTest();
  assert.deepEqual(seen, ['a', 'bad', 'c']);
});
```

- [ ] **Step 2: Run, confirm fails**

```bash
cd server && npx tsx --test src/__tests__/brainstorm_queue.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Create `server/src/ai/brainstorm_queue.ts`**

```ts
import { runBrainstorm, failBrainstorm } from './brainstorm.js';

type Runner = (insightId: string) => Promise<void>;

let runner: Runner = runBrainstorm;
let onFailure: (insightId: string, error: string) => Promise<void> = failBrainstorm;

const queue: string[] = [];
let running = false;

export function enqueueBrainstorm(insightId: string): void {
  queue.push(insightId);
  if (!running) void drain();
}

async function drain(): Promise<void> {
  running = true;
  while (queue.length > 0) {
    const id = queue.shift()!;
    try {
      await runner(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      try {
        await onFailure(id, msg);
      } catch {
        console.warn('brainstorm queue failure handler threw:', msg);
      }
    }
  }
  running = false;
}

// Test-only hooks
export function _setRunnerForTest(r: Runner): void { runner = r; }
export function _setOnFailureForTest(f: typeof onFailure): void { onFailure = f; }
export function _resetForTest(): void {
  runner = runBrainstorm;
  onFailure = failBrainstorm;
  queue.length = 0;
  running = false;
}
export async function _drainOnceForTest(): Promise<void> {
  while (running || queue.length > 0) {
    await new Promise((r) => setTimeout(r, 5));
  }
}
```

- [ ] **Step 4: Run, confirm passes**

```bash
cd server && npx tsx --test src/__tests__/brainstorm_queue.test.ts 2>&1 | tail -10
```

- [ ] **Step 5: Wire startup recovery in `server/src/index.ts`**

Find where the server boots (existing `await app.listen(...)` or similar). After listen, add:

```ts
import { enqueueBrainstorm } from './ai/brainstorm_queue.js';
import { recoverPendingInsights } from './insights.js';
// ... existing code ...

// After app.listen and the telegram bot start block:
recoverPendingInsights()
  .then((ids) => {
    for (const id of ids) enqueueBrainstorm(id);
    if (ids.length > 0) app.log.info({ count: ids.length }, 'brainstorm: re-enqueued pending insights from prior run');
  })
  .catch((e) => app.log.warn(e, 'brainstorm recovery scan failed'));
```

- [ ] **Step 6: Typecheck + tests**

```bash
cd server && npx tsc --noEmit 2>&1 | tail -5
cd server && npm test 2>&1 | tail -10
```

Both clean. Suite passes.

- [ ] **Step 7: Commit**

```bash
git add server/src/ai/brainstorm_queue.ts server/src/index.ts server/src/__tests__/brainstorm_queue.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): brainstorm queue + startup recovery

In-process FIFO queue mirroring embed_queue: enqueueBrainstorm() pushes
and starts drain if idle; drain swallows per-job errors via failBrainstorm
so one bad insight doesn't stop the queue. Startup recovery scan in
index.ts re-enqueues any pending insights from the last hour and marks
older ones as failed (abandoned on restart).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: REST routes + WS event types

**Files:**
- Modify: `server/src/ws.ts`
- Create: `server/src/routes/insights.ts`
- Modify: `server/src/index.ts` (register the routes module)
- Modify: `server/src/ai/brainstorm.ts` (uncomment broadcast calls)
- Create: `server/src/__tests__/insights_routes.test.ts`

- [ ] **Step 1: Extend `server/src/ws.ts` with insight event types**

Find `export type BroadcastEvent = ...` and append three new variants:

```ts
  | { type: 'insight.queued';  insight: Insight; card_id: string; owner_id: string }
  | { type: 'insight.updated'; insight: Insight; card_id: string; owner_id: string }
  | { type: 'insight.failed';  insight: Insight; card_id: string; owner_id: string };
```

Add the import at top:
```ts
import type { Insight } from './insights.js';
```

In the `broadcast()` function body, add a visibility branch BEFORE the final `c.socket.send(...)` line:

```ts
    if (ev.type === 'insight.queued' || ev.type === 'insight.updated' || ev.type === 'insight.failed') {
      // Visibility piggy-backs on the card. Load it lazily — we already have
      // owner_id passed in, so quick check first; full predicate for inbox cards.
      // We don't have the card object here; trust the route layer to have done a check
      // OR look up the card. For simplicity: only send to owner + requested_by.
      if (ev.insight.requested_by !== c.userId && ev.owner_id !== c.userId) {
        // Could still be visible (assignee/share/inbox), but we lack the card here.
        // The web client also fetches insights via GET, so it doesn't strictly
        // need this push. Skip for non-owners.
        continue;
      }
    }
```

- [ ] **Step 2: Uncomment broadcast calls in `server/src/ai/brainstorm.ts`**

Find the two `TODO(Task 6)` lines added in Task 4 and replace with the actual broadcast calls (uncomment them). Re-add the `broadcast` import:

```ts
import { broadcast } from '../ws.js';
```

- [ ] **Step 3: Create `server/src/routes/insights.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import {
  createInsight,
  listInsightsForCard,
  countPendingByCard,
  countPendingByUser,
  countTodayByUser,
} from '../insights.js';
import { loadCard, canUserSeeCard } from '../cards.js';
import { enqueueBrainstorm } from '../ai/brainstorm_queue.js';
import { AI_ENABLED } from '../ai/openai.js';
import { broadcast } from '../ws.js';
import { getInsight } from '../insights.js';

const MAX_PENDING_PER_USER = 5;
const MAX_PENDING_PER_CARD = 1;
const MAX_PER_DAY_PER_USER = 50;

export async function insightsRoutes(app: FastifyInstance) {
  // POST /api/cards/:id/insights/brainstorm
  app.post<{ Params: { id: string } }>(
    '/api/cards/:id/insights/brainstorm',
    async (req, reply) => {
      const userId = (req as any).userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'unauthorized' });
      if (!AI_ENABLED()) return reply.code(503).send({ error: 'AI not configured' });

      const cardId = req.params.id;
      const card = await loadCard(cardId);
      if (!card) return reply.code(404).send({ error: 'card not found' });
      if (!(await canUserSeeCard(userId, cardId))) {
        return reply.code(403).send({ error: 'forbidden' });
      }

      const [pendingUser, pendingCard, today] = await Promise.all([
        countPendingByUser(userId),
        countPendingByCard(cardId),
        countTodayByUser(userId),
      ]);
      if (pendingCard >= MAX_PENDING_PER_CARD) {
        return reply.code(429).send({ error: 'already researching this card' });
      }
      if (pendingUser >= MAX_PENDING_PER_USER) {
        return reply.code(429).send({ error: 'too many pending insights' });
      }
      if (today >= MAX_PER_DAY_PER_USER) {
        return reply.code(429).send({ error: 'daily brainstorm limit reached' });
      }

      const insight = await createInsight(cardId, userId);
      enqueueBrainstorm(insight.id);
      broadcast({ type: 'insight.queued', insight, card_id: cardId, owner_id: card.created_by ?? '' });
      return reply.code(202).send({ id: insight.id, status: insight.status });
    },
  );

  // GET /api/cards/:id/insights
  app.get<{ Params: { id: string } }>(
    '/api/cards/:id/insights',
    async (req, reply) => {
      const userId = (req as any).userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'unauthorized' });
      const cardId = req.params.id;
      if (!(await canUserSeeCard(userId, cardId))) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const insights = await listInsightsForCard(cardId, 10);
      return reply.send({ insights });
    },
  );

  // GET /api/insights/:id
  app.get<{ Params: { id: string } }>(
    '/api/insights/:id',
    async (req, reply) => {
      const userId = (req as any).userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'unauthorized' });
      const ins = await getInsight(req.params.id);
      if (!ins) return reply.code(404).send({ error: 'not found' });
      if (!(await canUserSeeCard(userId, ins.card_id))) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      return reply.send({ insight: ins });
    },
  );
}
```

(Adjust `(req as any).userId` to whatever pattern the existing routes use to get the authenticated user — likely `req.session?.userId` or a Fastify decorator. Inspect `server/src/routes/cards.ts` for the actual pattern and match it.)

- [ ] **Step 4: Register routes in `server/src/index.ts`**

Add near the other `app.register(...)` calls:

```ts
import { insightsRoutes } from './routes/insights.js';
// ...
await app.register(insightsRoutes);
```

- [ ] **Step 5: Write integration test**

Create `server/src/__tests__/insights_routes.test.ts`:

```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { pool } from '../db.js';
import { insightsRoutes } from '../routes/insights.js';
import { _resetForTest, _setRunnerForTest, _drainOnceForTest } from '../ai/brainstorm_queue.js';
import { markOk } from '../insights.js';

let userId: string;
let cardId: string;
let app: ReturnType<typeof Fastify>;

before(async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('R', 'rt@test', 'x') RETURNING id`,
  );
  userId = u.rows[0]!.id;
  const c = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('rt card', 'today', 'manual', $1, 1) RETURNING id`,
    [userId],
  );
  cardId = c.rows[0]!.id;

  app = Fastify();
  // stub auth: set req.userId to our test user
  app.addHook('preHandler', async (req: any) => { req.userId = userId; });
  await app.register(insightsRoutes);
});

after(async () => {
  await app.close();
  await pool.query(`DELETE FROM ai_insights WHERE requested_by = $1`, [userId]);
  await pool.query(`DELETE FROM cards WHERE id = $1`, [cardId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
});

test('POST /api/cards/:id/insights/brainstorm returns 202 with pending insight', async () => {
  _resetForTest();
  _setRunnerForTest(async () => { /* noop — don't actually call LLM */ });
  const res = await app.inject({ method: 'POST', url: `/api/cards/${cardId}/insights/brainstorm` });
  assert.equal(res.statusCode, 202);
  const body = res.json() as { id: string; status: string };
  assert.equal(body.status, 'pending');
  assert.ok(body.id);
  await _drainOnceForTest();
});

test('POST returns 404 for unknown card', async () => {
  _setRunnerForTest(async () => {});
  const res = await app.inject({
    method: 'POST',
    url: `/api/cards/00000000-0000-0000-0000-000000000000/insights/brainstorm`,
  });
  assert.equal(res.statusCode, 404);
});

test('POST returns 429 when one pending already exists for the card', async () => {
  _resetForTest();
  _setRunnerForTest(async () => { await new Promise((r) => setTimeout(r, 200)); });
  const a = await app.inject({ method: 'POST', url: `/api/cards/${cardId}/insights/brainstorm` });
  assert.equal(a.statusCode, 202);
  const b = await app.inject({ method: 'POST', url: `/api/cards/${cardId}/insights/brainstorm` });
  assert.equal(b.statusCode, 429);
  await _drainOnceForTest();
});

test('GET /api/cards/:id/insights returns array', async () => {
  _resetForTest();
  _setRunnerForTest(async () => {});
  await app.inject({ method: 'POST', url: `/api/cards/${cardId}/insights/brainstorm` });
  await _drainOnceForTest();
  const res = await app.inject({ method: 'GET', url: `/api/cards/${cardId}/insights` });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { insights: any[] };
  assert.ok(Array.isArray(body.insights));
  assert.ok(body.insights.length >= 1);
});
```

- [ ] **Step 6: Run, confirm passes**

```bash
cd server && npx tsx --test src/__tests__/insights_routes.test.ts 2>&1 | tail -15
cd server && npm test 2>&1 | tail -8
```

Expected: all 4 new tests pass; full suite passes; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add server/src/ws.ts server/src/routes/insights.ts server/src/index.ts server/src/ai/brainstorm.ts server/src/__tests__/insights_routes.test.ts
git commit -m "$(cat <<'EOF'
feat(insights): REST routes + WS event types

POST /api/cards/:id/insights/brainstorm enforces three rate limits
(max 5 pending per user, max 1 pending per card, max 50/day per user),
inserts a pending insight, enqueues it, and broadcasts insight.queued.
GET /api/cards/:id/insights lists latest 10. GET /api/insights/:id
fetches one. All endpoints reuse canUserSeeCard for visibility.

ws.ts gains three new event variants (insight.queued/updated/failed)
with a piggy-back visibility filter on requested_by + owner_id.
brainstorm.ts uncomments the deferred broadcast calls.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Telegram brainstorm callback + post-save keyboard

**Files:**
- Modify: `server/src/telegram/bot.ts`

- [ ] **Step 1: Read existing post-save keyboard + callback wiring**

```bash
grep -nE "postSaveKeyboard|handlePostSaveCallback|mv:|arch:" server/src/telegram/bot.ts | head -10
```

`postSaveKeyboard(cardId, currentStatus)` lives near the existing keyboards (around line 393). It currently emits move-column + 🗑 buttons. Add `🤔 Brainstorm` to it.

- [ ] **Step 2: Add Brainstorm button to `postSaveKeyboard`**

Modify the function to add a row with Brainstorm after the move-column row:

```ts
function postSaveKeyboard(cardId: string, currentStatus: Status): InlineKeyboard {
  const kb = new InlineKeyboard();
  const row: Array<['📅 Today' | '⚡ Doing' | '✅ Done', Status, string]> = [
    ['📅 Today', 'today', `mv:today:${cardId}`],
    ['⚡ Doing', 'in_progress', `mv:doing:${cardId}`],
    ['✅ Done', 'done', `mv:done:${cardId}`],
  ];
  for (const [label, s, cb] of row) {
    if (s !== currentStatus) kb.text(label, cb);
  }
  kb.text('🗑', `arch:${cardId}`);
  kb.row().text('🤔 Brainstorm', `brain:${cardId}`);
  return kb;
}
```

- [ ] **Step 3: Add `brain:<cardId>` callback handler**

Add a new callback handler near the other `bot.callbackQuery(...)` registrations (alongside the `dest:`, `col:`, `dup:*` handlers from PR #22):

```ts
import { createInsight, countPendingByCard, countPendingByUser, countTodayByUser } from '../insights.js';
import { enqueueBrainstorm } from '../ai/brainstorm_queue.js';
import { canUserSeeCard } from '../cards.js';
import { AI_ENABLED } from '../ai/openai.js';

bot.callbackQuery(/^brain:([^:]+)$/, async (ctx) => {
  const cardId = ctx.match![1]!;
  const tgUserId = ctx.from?.id;
  if (!tgUserId) {
    await ctx.answerCallbackQuery({ text: 'no user', show_alert: true });
    return;
  }
  const appUserId = await resolveAppUser(tgUserId, ctx.from?.username ?? undefined);
  if (!appUserId) {
    await ctx.answerCallbackQuery({ text: 'Link your Telegram identity first.', show_alert: true });
    return;
  }
  if (!AI_ENABLED()) {
    await ctx.answerCallbackQuery({ text: 'AI not configured.', show_alert: true });
    return;
  }
  if (!(await canUserSeeCard(appUserId, cardId))) {
    await ctx.answerCallbackQuery({ text: 'Card not visible to you.', show_alert: true });
    return;
  }
  const [pendingCard, pendingUser, today] = await Promise.all([
    countPendingByCard(cardId),
    countPendingByUser(appUserId),
    countTodayByUser(appUserId),
  ]);
  if (pendingCard >= 1) {
    await ctx.answerCallbackQuery({ text: 'Already researching this card.', show_alert: true });
    return;
  }
  if (pendingUser >= 5) {
    await ctx.answerCallbackQuery({ text: 'Too many pending — try later.', show_alert: true });
    return;
  }
  if (today >= 50) {
    await ctx.answerCallbackQuery({ text: 'Daily limit reached.', show_alert: true });
    return;
  }
  const insight = await createInsight(cardId, appUserId);
  enqueueBrainstorm(insight.id);
  await ctx.answerCallbackQuery({ text: 'Research queued' });
  // Strip the brainstorm button from the keyboard so it isn't re-tapped
  try {
    const card = await loadCard(cardId);
    if (card) {
      const kb = new InlineKeyboard();
      const row: Array<[string, Status, string]> = [
        ['📅 Today', 'today', `mv:today:${cardId}`],
        ['⚡ Doing', 'in_progress', `mv:doing:${cardId}`],
        ['✅ Done', 'done', `mv:done:${cardId}`],
      ];
      for (const [label, s, cb] of row) if (s !== card.status) kb.text(label, cb);
      kb.text('🗑', `arch:${cardId}`);
      await ctx.editMessageReplyMarkup({ reply_markup: kb });
    }
  } catch { /* edit non-fatal */ }
  await ctx.reply('✓ Research queued — open card for results when ready.');
});
```

- [ ] **Step 4: Add Telegram nudge on completion**

This requires the brainstorm pipeline to know how to send a Telegram message. Add a helper at the bottom of `bot.ts`:

```ts
export async function sendBrainstormNudge(appUserId: string, cardTitle: string, status: 'ok' | 'failed', error?: string): Promise<void> {
  if (!botInstance) return;
  // Look up the user's Telegram chat id (their DM with the bot)
  const { rows } = await pool.query<{ telegram_user_id: number }>(
    `SELECT telegram_user_id FROM telegram_identities WHERE app_user_id = $1 LIMIT 1`,
    [appUserId],
  );
  const tgUserId = rows[0]?.telegram_user_id;
  if (!tgUserId) return;
  const text = status === 'ok'
    ? `📚 Brainstorm done — ${cardTitle}`
    : `⚠ Brainstorm failed: ${error?.slice(0, 100) ?? 'unknown error'} — try again from the card.`;
  try {
    await botInstance.api.sendMessage(tgUserId, text);
  } catch { /* user blocked bot, etc. */ }
}
```

Wire it into `brainstorm.ts` `runBrainstorm` after `markOk`:

```ts
import { sendBrainstormNudge } from '../telegram/bot.js';
// ... after broadcast:
const card2 = await loadCard(insight.card_id);
if (card2) await sendBrainstormNudge(insight.requested_by, card2.title, 'ok');
```

And in `failBrainstorm`:
```ts
const card3 = await loadCard(final.card_id);
if (card3) await sendBrainstormNudge(final.requested_by, card3.title, 'failed', error);
```

- [ ] **Step 5: Typecheck + test**

```bash
cd server && npx tsc --noEmit 2>&1 | tail -5
cd server && npm test 2>&1 | tail -10
```

Both clean; full suite passes.

- [ ] **Step 6: Commit**

```bash
git add server/src/telegram/bot.ts server/src/ai/brainstorm.ts
git commit -m "$(cat <<'EOF'
feat(telegram): brain: callback + post-save Brainstorm button + nudge

postSaveKeyboard adds a 🤔 Brainstorm row. brain:<cardId> callback
enforces same rate limits as the REST endpoint (1 pending per card,
5 pending per user, 50/day per user), creates the insight, enqueues
the job, strips the Brainstorm button from the keyboard, and replies
"✓ Research queued".

sendBrainstormNudge helper messages the requesting user when the job
completes (or fails). Silent skip if no Telegram identity is linked.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Web app — types + api client + WS dispatch

**Files:**
- Modify: `web/src/types.ts`
- Modify: `web/src/api.ts`
- Modify: `web/src/ws.ts`
- Modify: `web/src/App.tsx`
- Create: `web/src/hooks/useInsights.ts`

- [ ] **Step 1: Add types to `web/src/types.ts`**

Append:

```ts
export type InsightStatus = 'pending' | 'ok' | 'failed';

export type InsightBody = {
  related_items?: Array<{ kind: 'card' | 'knowledge'; id: string; title: string; why: string }>;
  web_findings?: Array<{ title: string; url: string; why: string }>;
  next_steps?: string[];
};

export type Insight = {
  id: string;
  card_id: string;
  requested_by: string;
  status: InsightStatus;
  summary: string | null;
  body: InsightBody | null;
  error: string | null;
  degraded: boolean;
  created_at: string;
  completed_at: string | null;
};
```

- [ ] **Step 2: Add api client methods in `web/src/api.ts`**

Find the `api` object literal. Add two methods that mirror existing patterns (likely using a shared `fetchJSON` helper):

```ts
async brainstormCard(cardId: string): Promise<{ id: string; status: 'pending' }> {
  const res = await fetch(`/api/cards/${cardId}/insights/brainstorm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
},

async listInsights(cardId: string): Promise<{ insights: Insight[] }> {
  const res = await fetch(`/api/cards/${cardId}/insights`, { credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
},
```

Import `Insight` type and follow the existing api object's style.

- [ ] **Step 3: Add insight event handling to `web/src/ws.ts`**

Find the `connectWS` callback dispatch. Add cases for the three new event types:

```ts
// In the type union near the top:
| { type: 'insight.queued';  insight: Insight; card_id: string; owner_id: string }
| { type: 'insight.updated'; insight: Insight; card_id: string; owner_id: string }
| { type: 'insight.failed';  insight: Insight; card_id: string; owner_id: string }
```

- [ ] **Step 4: Create `web/src/hooks/useInsights.ts`**

```ts
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Insight } from '../types.ts';
import type { WSEvent } from '../ws.ts';

const cache = new Map<string, Insight[]>(); // cardId -> latest 10
const listeners = new Map<string, Set<(v: Insight[]) => void>>();

function notify(cardId: string): void {
  const subs = listeners.get(cardId);
  if (!subs) return;
  const items = cache.get(cardId) ?? [];
  for (const s of subs) s(items);
}

export function applyInsightEvent(ev: WSEvent): void {
  if (
    ev.type !== 'insight.queued' &&
    ev.type !== 'insight.updated' &&
    ev.type !== 'insight.failed'
  ) {
    return;
  }
  const cardId = ev.card_id;
  const next = ev.insight;
  const list = cache.get(cardId) ?? [];
  const i = list.findIndex((x) => x.id === next.id);
  let updated: Insight[];
  if (i >= 0) {
    updated = [...list];
    updated[i] = next;
  } else {
    updated = [next, ...list].slice(0, 10);
  }
  cache.set(cardId, updated);
  notify(cardId);
}

export function useInsights(cardId: string | null): {
  insights: Insight[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [insights, setInsights] = useState<Insight[]>(() => (cardId ? cache.get(cardId) ?? [] : []));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cardId) {
      setInsights([]);
      return;
    }
    let cancelled = false;
    const subs = listeners.get(cardId) ?? new Set<(v: Insight[]) => void>();
    const handler = (v: Insight[]) => { if (!cancelled) setInsights(v); };
    subs.add(handler);
    listeners.set(cardId, subs);

    setInsights(cache.get(cardId) ?? []);
    if (!cache.has(cardId)) {
      setLoading(true);
      api.listInsights(cardId).then((r) => {
        if (cancelled) return;
        cache.set(cardId, r.insights);
        notify(cardId);
      }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => {
      cancelled = true;
      subs.delete(handler);
      if (subs.size === 0) listeners.delete(cardId);
    };
  }, [cardId]);

  async function refresh(): Promise<void> {
    if (!cardId) return;
    setLoading(true);
    try {
      const r = await api.listInsights(cardId);
      cache.set(cardId, r.insights);
      notify(cardId);
    } finally {
      setLoading(false);
    }
  }

  return { insights, loading, refresh };
}
```

- [ ] **Step 5: Wire WS dispatch in `web/src/App.tsx`**

Find the existing WS event handler (the big switch on `ev.type`). Add a branch:

```ts
import { applyInsightEvent } from './hooks/useInsights.ts';
// ...
if (
  ev.type === 'insight.queued' ||
  ev.type === 'insight.updated' ||
  ev.type === 'insight.failed'
) {
  applyInsightEvent(ev);
  return;
}
```

Also add the same branch to `web/src/MobileShell.tsx` if it has its own WS dispatcher.

- [ ] **Step 6: Typecheck + build**

```bash
cd web && npx tsc --noEmit 2>&1 | tail -5
cd web && npm run build 2>&1 | tail -5
```

Both clean.

- [ ] **Step 7: Commit**

```bash
git add web/src/types.ts web/src/api.ts web/src/ws.ts web/src/hooks/useInsights.ts web/src/App.tsx web/src/MobileShell.tsx
git commit -m "$(cat <<'EOF'
feat(web): Insight types, api client, useInsights hook, WS dispatch

types.ts adds Insight + InsightBody + InsightStatus. api.ts adds
brainstormCard(cardId) and listInsights(cardId). useInsights hook
caches per card with module-level Map; subscribes to WS events via
applyInsightEvent. App.tsx and MobileShell.tsx route insight.queued/
updated/failed through the hook.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: AiInsightsPanel + integration

**Files:**
- Create: `web/src/components/AiInsightsPanel.tsx`
- Modify: `web/src/components/EditDialog.tsx`
- Modify: `web/src/components/MobileCardActions.tsx`
- Modify: `web/src/components/CardView.tsx`

- [ ] **Step 1: Create the panel component**

`web/src/components/AiInsightsPanel.tsx`:

```tsx
import { useState } from 'react';
import { api } from '../api.ts';
import { useInsights } from '../hooks/useInsights.ts';
import type { Insight } from '../types.ts';

type Props = {
  cardId: string;
  onOpenCard?: (id: string) => void;
  onOpenKnowledge?: (id: string) => void;
};

export function AiInsightsPanel({ cardId, onOpenCard, onOpenKnowledge }: Props) {
  const { insights, loading } = useInsights(cardId);
  const latest: Insight | undefined = insights[0];
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(): Promise<void> {
    setErr(null);
    setSubmitting(true);
    try {
      await api.brainstormCard(cardId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card-surface bg-gold-lightest p-4 my-3" aria-label="AI insights">
      <header className="flex items-center justify-between mb-2">
        <h3 className="text-3 font-semibold text-green-starbucks tracking-tight2">✨ AI Insights</h3>
        {latest && latest.status !== 'pending' && (
          <button
            type="button"
            onClick={run}
            disabled={submitting}
            className="btn-pill btn-pill-outlined-green text-2"
          >
            🔄 Re-run
          </button>
        )}
      </header>

      {!latest && (
        <div className="flex flex-col gap-2 items-start">
          <p className="text-2 text-ink-soft tracking-tight2">
            Hybrid research: related items you have + fresh web findings + suggested next steps.
          </p>
          <button
            type="button"
            onClick={run}
            disabled={submitting || loading}
            className="btn-pill btn-pill-filled-green"
          >
            🤔 Brainstorm this card
          </button>
        </div>
      )}

      {latest?.status === 'pending' && (
        <p className="text-2 text-ink-soft tracking-tight2 animate-pulse">Researching…</p>
      )}

      {latest?.status === 'failed' && (
        <div>
          <p className="text-2 text-red tracking-tight2">
            ⚠ Failed: {latest.error || 'unknown error'}
          </p>
          <button type="button" onClick={run} className="btn-pill btn-pill-outlined-green text-2 mt-2">
            Retry
          </button>
        </div>
      )}

      {latest?.status === 'ok' && latest.body && (
        <div className="flex flex-col gap-3">
          {latest.summary && (
            <p className="text-2 text-ink tracking-tight2">{latest.summary}</p>
          )}

          {latest.degraded && (
            <p className="text-1 text-ink-soft tracking-tight2 italic">
              (web search unavailable — local context only)
            </p>
          )}

          {(latest.body.related_items?.length ?? 0) > 0 && (
            <div>
              <h4 className="text-2 font-semibold text-ink tracking-tight2 mb-1">Related items you have</h4>
              <ul className="flex flex-col gap-1">
                {latest.body.related_items!.map((r) => (
                  <li key={r.id} className="text-2 text-ink tracking-tight2">
                    {r.kind === 'card' ? (
                      <button
                        type="button"
                        onClick={() => onOpenCard?.(r.id)}
                        className="text-green-accent hover:underline"
                      >
                        [card] {r.title}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenKnowledge?.(r.id)}
                        className="text-green-accent hover:underline"
                      >
                        [knowledge] {r.title}
                      </button>
                    )}
                    <span className="text-ink-soft"> — {r.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(latest.body.web_findings?.length ?? 0) > 0 && (
            <div>
              <h4 className="text-2 font-semibold text-ink tracking-tight2 mb-1">Web findings</h4>
              <ul className="flex flex-col gap-1">
                {latest.body.web_findings!.map((w, i) => (
                  <li key={i} className="text-2 text-ink tracking-tight2">
                    <a
                      href={w.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-accent hover:underline"
                    >
                      {w.title}
                    </a>
                    <span className="text-ink-soft"> — {w.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(latest.body.next_steps?.length ?? 0) > 0 && (
            <div>
              <h4 className="text-2 font-semibold text-ink tracking-tight2 mb-1">Next steps</h4>
              <ol className="list-decimal ml-5 flex flex-col gap-1">
                {latest.body.next_steps!.map((s, i) => (
                  <li key={i} className="text-2 text-ink tracking-tight2">{s}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {err && (
        <p className="text-1 text-red tracking-tight2 mt-2">{err}</p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Render the panel inside `EditDialog.tsx`**

Find the dialog body. After the description+tags inputs, before the Knowledge section, insert:

```tsx
import { AiInsightsPanel } from './AiInsightsPanel.tsx';
// ...
<AiInsightsPanel cardId={card.id} />
```

- [ ] **Step 3: Render the panel inside `MobileCardActions.tsx` (or the mobile edit screen)**

Same import + same usage. If `MobileCardActions` is just the action sheet (move-column / archive), find the actual mobile "edit card" view — likely `MobileCardView.tsx`. Render the panel under description there:

```tsx
<AiInsightsPanel cardId={card.id} />
```

- [ ] **Step 4: Add ✨ badge + snippet to `CardView.tsx`**

Use the cached insights map from `useInsights` — but the board card shouldn't fetch on mount (too many cards). Use a separate, lighter source: `useLatestInsightSummary(cardId)` that reads only from cache (populated by WS). For v1, simpler approach: read directly from the cache module.

Add to `useInsights.ts`:

```ts
export function getCachedLatest(cardId: string): Insight | undefined {
  return cache.get(cardId)?.[0];
}
```

Then in `CardView.tsx`, after a state hook for the cached snippet:

```tsx
import { getCachedLatest } from '../hooks/useInsights.ts';
// ... inside the component:
const insightLatest = getCachedLatest(card.id);
// ... in the JSX, top-right area of the card:
{insightLatest?.status === 'pending' && (
  <span className="text-1 animate-pulse" title="Researching…" aria-label="Researching">🤔</span>
)}
{insightLatest?.status === 'ok' && (
  <span className="text-1" title="AI Insights ready" aria-label="AI Insights ready">✨</span>
)}
// ... below description preview:
{insightLatest?.status === 'ok' && insightLatest.summary && (
  <p className="mt-1 text-1 text-ink-soft tracking-tight2 line-clamp-1">
    ✨ {insightLatest.summary}
  </p>
)}
```

Note: `getCachedLatest` returns whatever the cache has. If the user hasn't opened a card edit dialog yet, the cache is empty for that card and no badge shows up. WS events will populate as new insights arrive. This is acceptable for v1; a follow-up could pre-populate via the cards list endpoint.

- [ ] **Step 5: Typecheck + build**

```bash
cd web && npx tsc --noEmit 2>&1 | tail -5
cd web && npm run build 2>&1 | tail -5
```

Both clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/AiInsightsPanel.tsx web/src/components/EditDialog.tsx web/src/MobileCardView.tsx web/src/components/CardView.tsx web/src/hooks/useInsights.ts
git commit -m "$(cat <<'EOF'
feat(web): AiInsightsPanel component + EditDialog/Mobile/CardView wiring

AiInsightsPanel renders four states (empty/pending/failed/ok) with a
gold-lightest tint matching the existing AI ceremony palette. Related
items are clickable buttons; web findings open externally. Re-run
button triggers a fresh insight. EditDialog renders the panel between
description+tags and the Knowledge section; MobileCardView mirrors
the placement. CardView shows a pulsing 🤔 (pending) or ✨ + 1-line
summary (ok) on the board card preview.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Docs + smoke + push + PR

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

- [ ] **Step 1: Add `TAVILY_API_KEY` to `.env.example`**

Append:

```
# Optional: Tavily web-search API key (for AI Brainstorm research)
# https://tavily.com/  — free tier 1000 searches / month
TAVILY_API_KEY=
```

- [ ] **Step 2: Update README**

Add a new section under "Web app" (or as its own H3) describing the Brainstorm feature:

```markdown
### AI Brainstorm research

Tap **🤔 Brainstorm** on any card (via the Telegram post-save keyboard
or the AI Insights panel in the card edit dialog) to run a hybrid
research pipeline:

- **Local context** — full-text search across your visible cards and
  knowledge items for things you've already captured on related
  topics.
- **Web search** — fresh results via [Tavily](https://tavily.com/)
  (free tier 1000/mo; set `TAVILY_API_KEY` in `server/.env`).
- **LLM synthesis** — Gemini Flash composes a structured response:
  summary + related items + web findings + suggested next steps.

Results appear as a dedicated panel in the card edit dialog and a
✨ snippet on the board card. Async — research takes ~10s; a Telegram
nudge fires when it's done. Per-user rate limits (5 pending, 50/day)
keep cost bounded. Without `TAVILY_API_KEY` the pipeline runs in
"degraded" mode (local context only).
```

Also add the env var to the variables table near the bottom of README:

```markdown
| `TAVILY_API_KEY`             | Web search for AI Brainstorm        | *(optional)* |
```

- [ ] **Step 3: Run full test + build sweep**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude
cd server && npm test 2>&1 | tail -10
cd server && npx tsc --noEmit 2>&1 | tail -3
cd ../web && npm run build 2>&1 | tail -5
cd ../web && npx tsc --noEmit 2>&1 | tail -3
```

All green.

- [ ] **Step 4: Manual smoke (local docker)**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude
docker compose exec -T db psql -U kanban -d kanban < server/schema.sql 2>&1 | tail -3
docker compose up -d --build server
sleep 3
docker compose logs --tail 20 server | grep -iE "listening|error|ai_insights" | tail -10
```

Then in the browser:
1. Open any card → "AI Insights" panel shows `🤔 Brainstorm this card` CTA
2. Click it → panel flips to "Researching…" pulsing state
3. ~10s later → panel renders summary + 3 sections
4. Board card now shows ✨ + 1-line summary
5. Click a related-item button → navigates / opens that card
6. Click a web link → opens externally
7. Click 🔄 Re-run → panel goes pending again → new content arrives

In Telegram:
1. DM bot with a research-y message; pick destination → column → save
2. Tap `🤔 Brainstorm` on the post-save keyboard
3. Bot replies "✓ Research queued"
4. ~10s later, bot DMs "📚 Brainstorm done — <title>"
5. Open card in web app → panel populated

- [ ] **Step 5: Commit docs**

```bash
git add README.md .env.example
git commit -m "$(cat <<'EOF'
docs(readme): document AI Brainstorm + TAVILY_API_KEY

Adds a Brainstorm research section under Web app describing the
hybrid pipeline, the ✨ panel + board snippet surfaces, the Telegram
post-save trigger, the daily rate limit, and degraded mode when
Tavily isn't configured. Env var added to .env.example and to the
variables table.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Push branch**

```bash
git push -u origin feat/ai-brainstorm
```

- [ ] **Step 7: Open PR (ask user first)**

Do NOT auto-open the PR. Ask the user:

> Branch pushed. Open PR against `main`?

If yes:

```bash
gh pr create --base main --head feat/ai-brainstorm --title "feat(ai): on-demand brainstorm research with Tavily + Gemini Flash" --body "$(cat <<'EOF'
## Summary
- New 🤔 Brainstorm button on every card (Telegram post-save keyboard + AI Insights panel in card edit dialog).
- Async pipeline: local FTS context + Tavily web search + Gemini Flash synthesis.
- Results stored in new `ai_insights` table; surfaced as a dedicated panel + ✨ snippet on board card.
- Per-user rate limits (5 pending, 50/day) + per-card (1 pending).
- Telegram nudge on completion.
- `TAVILY_API_KEY` env var optional — graceful degraded mode (local context only) if absent.

Spec: docs/superpowers/specs/2026-05-12-ai-brainstorm-research-design.md
Plan: docs/superpowers/plans/2026-05-12-ai-brainstorm-research.md

## Test plan
- [ ] `cd server && npm test` clean
- [ ] `cd web && npm run build && npx tsc --noEmit` clean
- [ ] Brainstorm CTA appears on card without insights
- [ ] After tap: ✨ panel populates ~10s later
- [ ] Board card preview shows pulsing 🤔 → ✨ + 1-line summary
- [ ] Re-run replaces panel content
- [ ] Related-item links navigate / open correctly
- [ ] Web finding links open externally
- [ ] Telegram post-save 🤔 Brainstorm enqueues + DM nudge on completion
- [ ] Rate limit 429 on second brainstorm of same card while first pending
- [ ] Without TAVILY_API_KEY → "(web search unavailable)" caption
- [ ] Startup recovery re-enqueues pending insights from last hour after restart

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

**Spec coverage:**
- §2 in-scope:
  - ai_insights table → Task 1
  - REST endpoints → Task 6
  - background queue → Task 5
  - brainstorm.ts orchestrator → Task 4
  - tavily.ts client → Task 3
  - Telegram post-save 🤔 + callback + nudge → Task 7
  - WS broadcast events with visibility → Task 6
  - AiInsightsPanel + EditDialog + MobileCardView + CardView snippet → Task 9
  - TAVILY_API_KEY env + degraded mode → Task 3 + Task 10
  - Tests for key-terms, Tavily client, prompt+parser, POST endpoint → Tasks 2, 3, 4, 6
  - README + .env.example → Task 10
- §4 state machine → distributed across Tasks 4 (orchestrator), 5 (queue), 6 (routes + WS), 7 (Telegram)
- §6 API endpoints → Task 6 covers all three
- §7 queue → Task 5
- §8 UI surfaces (panel + states + mobile + board snippet) → Task 9
- §9 Telegram integration → Task 7
- §10 env config → Task 10
- §11 risks → mitigations live across the implementation (idempotent schema, timeouts in Task 3+4, rate limits in Task 6+7, visibility filter in Task 6 ws.ts)
- §13 done state → Task 10 step 4 smoke checklist + steps 5-7

**Placeholder scan:** clean — every step has concrete code or a concrete command.

**Type consistency:**
- `Insight` type declared in `server/src/insights.ts` (Task 2) and mirrored in `web/src/types.ts` (Task 8). Same field names.
- `InsightBody` shape declared once in server (`insights.ts`) and once in web (`types.ts`); identical structure.
- `searchCardsFts` / `searchKnowledgeFts` come from PR #22, used unchanged in Task 4.
- `chatPrimary` / `chatFallback` come from existing `ai/openai.ts`, signature matches what Task 4 expects.
- `broadcast` accepts the new event types added in Task 6.
- `enqueueBrainstorm` (Task 5) called by Task 6 (REST) and Task 7 (Telegram) with the same `insightId: string` signature.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-12-ai-brainstorm-research.md`. Two options:

**1. Subagent-Driven (recommended)** — fresh subagent per task + two-stage review, fast iteration

**2. Inline Execution** — execute tasks in this session with checkpoint commits

Which approach?
