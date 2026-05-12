# Structured Telegram Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-step Telegram proposal flow with a deterministic two-step destination/column picker, photo+voice "new vs attach" path, and an on-demand FTS+LLM duplicate-check button.

**Architecture:** Extend the existing in-memory `PendingProposal` state machine in `server/src/telegram/proposals.ts` with destination + attach + dedupe fields. Add new keyboard builders and callback handlers in `server/src/telegram/bot.ts`. Add Postgres FTS to `cards` (idempotent migration) and expose FTS search helpers in `cards.ts` / `knowledge.ts`. New `server/src/ai/dedupe.ts` calls OpenRouter Gemini Flash with JSON-mode for re-rank, with a 4s timeout fallback to raw FTS rank.

**Tech Stack:** Node 22, Fastify, TypeScript, grammy (Telegram), PostgreSQL 16 (`tsvector`, `websearch_to_tsquery`, `GIN`), OpenRouter (Gemini 2.0 Flash). Tests via `node:test` + `tsx --test`.

**Spec:** [`docs/superpowers/specs/2026-05-11-telegram-structured-capture-design.md`](../specs/2026-05-11-telegram-structured-capture-design.md)

---

## Task 0: Branch + working tree setup

**Files:** none yet

- [ ] **Step 1: Create feature branch off current working branch**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude
git checkout fix/test-strict-undefined
git pull --ff-only origin fix/test-strict-undefined 2>/dev/null || true
git checkout -b feat/telegram-structured-capture
git log --oneline -3
```

Expected: working tree clean, branch shown is `feat/telegram-structured-capture`, last commit on branch is `61d4e40 docs(spec): structured Telegram capture flow`.

- [ ] **Step 2: Confirm test infrastructure runs**

```bash
cd server && npm test 2>&1 | tail -10
```

Expected: existing tests pass. Capture the count for regression comparison.

---

## Task 1: `cards.fts` generated column + GIN index

**Files:**
- Modify: `server/schema.sql`
- Create: `server/src/__tests__/cards_fts_schema.test.ts`

- [ ] **Step 1: Write failing test for FTS column existence**

Create `server/src/__tests__/cards_fts_schema.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';

test('cards.fts is a STORED generated tsvector column', async () => {
  const { rows } = await pool.query<{ data_type: string; generation_expression: string | null; is_generated: string }>(
    `SELECT data_type, generation_expression, is_generated
     FROM information_schema.columns
     WHERE table_name = 'cards' AND column_name = 'fts'`,
  );
  assert.equal(rows.length, 1, 'cards.fts column must exist');
  assert.equal(rows[0]!.data_type, 'tsvector');
  assert.match(rows[0]!.is_generated, /^ALWAYS$/);
  assert.match(rows[0]!.generation_expression ?? '', /to_tsvector/i);
});

test('cards_fts_idx exists and is a GIN index on cards.fts', async () => {
  const { rows } = await pool.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes WHERE indexname = 'cards_fts_idx'`,
  );
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.indexdef, /USING gin \(fts\)/);
});
```

- [ ] **Step 2: Run test, confirm it fails**

```bash
cd server && npx tsx --test src/__tests__/cards_fts_schema.test.ts 2>&1 | tail -20
```

Expected: both tests FAIL (`cards.fts column must exist` assertion fails — column doesn't exist yet).

- [ ] **Step 3: Append idempotent migration to `server/schema.sql`**

Open `server/schema.sql`. At the very bottom (after the existing tables and indexes), append:

```sql

-- Structured Telegram capture (2026-05-11): cards FTS for duplicate detection
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(description, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS cards_fts_idx ON cards USING GIN (fts);
```

- [ ] **Step 4: Apply migration to local dev database**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude
docker compose exec -T db psql -U kanban -d kanban < server/schema.sql 2>&1 | tail -5
```

Expected: no errors; `ALTER TABLE` and `CREATE INDEX` either run or report "already exists" (idempotent).

- [ ] **Step 5: Run test, confirm it passes**

```bash
cd server && npx tsx --test src/__tests__/cards_fts_schema.test.ts 2>&1 | tail -20
```

Expected: both tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/schema.sql server/src/__tests__/cards_fts_schema.test.ts
git commit -m "$(cat <<'EOF'
feat(schema): cards.fts generated tsvector + GIN index

Adds a STORED generated column on cards that concatenates title and
description into an English-language tsvector, plus a GIN index for
fast websearch_to_tsquery lookups. Used by the new Telegram structured
capture flow to surface duplicate candidates on demand.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: FTS search helpers

**Files:**
- Modify: `server/src/cards.ts`
- Modify: `server/src/knowledge.ts`
- Create: `server/src/__tests__/cards_fts_search.test.ts`
- Create: `server/src/__tests__/knowledge_fts_search.test.ts`

- [ ] **Step 1: Write failing test for `searchCardsFts` visibility filter**

Create `server/src/__tests__/cards_fts_search.test.ts`:

```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import { searchCardsFts } from '../cards.js';

let userA: string;
let userB: string;
let cardOfA: string;

before(async () => {
  const a = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('A', 'a@test', 'x') RETURNING id`,
  );
  const b = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('B', 'b@test', 'x') RETURNING id`,
  );
  userA = a.rows[0]!.id;
  userB = b.rows[0]!.id;

  const c = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, description, status, source, created_by, position)
     VALUES ('Buy eggs from farm', 'pasture-raised dozen', 'today', 'manual', $1, 1) RETURNING id`,
    [userA],
  );
  cardOfA = c.rows[0]!.id;
  await pool.query(
    `INSERT INTO card_assignees (card_id, user_id) VALUES ($1, $2)`,
    [cardOfA, userA],
  );
});

after(async () => {
  await pool.query(`DELETE FROM cards WHERE id = $1`, [cardOfA]);
  await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [userA, userB]);
});

test('searchCardsFts returns user A own card when searching matching term', async () => {
  const hits = await searchCardsFts(userA, 'eggs', 10);
  assert.ok(hits.some((h) => h.id === cardOfA), 'user A should see their own card');
});

test('searchCardsFts hides user A private card from user B', async () => {
  const hits = await searchCardsFts(userB, 'eggs', 10);
  assert.ok(!hits.some((h) => h.id === cardOfA), 'user B must not see user A private card');
});

test('searchCardsFts returns [] for empty query', async () => {
  const hits = await searchCardsFts(userA, '   ', 10);
  assert.deepEqual(hits, []);
});

test('searchCardsFts respects limit', async () => {
  const hits = await searchCardsFts(userA, 'eggs', 1);
  assert.ok(hits.length <= 1);
});
```

- [ ] **Step 2: Run test, confirm it fails**

```bash
cd server && npx tsx --test src/__tests__/cards_fts_search.test.ts 2>&1 | tail -20
```

Expected: FAIL — `searchCardsFts` not exported.

- [ ] **Step 3: Add `searchCardsFts` to `server/src/cards.ts`**

At the bottom of `server/src/cards.ts`, append:

```ts
export type CardFtsHit = {
  id: string;
  title: string;
  description: string;
  status: Status;
  updated_at: string;
  rank: number;
};

// Visibility predicate: card visible to user iff
//   - user is creator, OR
//   - user is an assignee, OR
//   - user is a sharer
// Matches existing visibility semantics in listCards().
export async function searchCardsFts(
  userId: string,
  query: string,
  limit = 10,
): Promise<CardFtsHit[]> {
  const q = query.trim();
  if (!q) return [];
  const { rows } = await pool.query<CardFtsHit>(
    `SELECT DISTINCT c.id, c.title, c.description, c.status, c.updated_at,
            ts_rank(c.fts, websearch_to_tsquery('english', $2)) AS rank
     FROM cards c
     LEFT JOIN card_assignees ca ON ca.card_id = c.id
     LEFT JOIN card_shares cs ON cs.card_id = c.id
     WHERE NOT c.archived
       AND c.fts @@ websearch_to_tsquery('english', $2)
       AND (
         c.created_by = $1
         OR ca.user_id = $1
         OR cs.user_id = $1
       )
     ORDER BY rank DESC, c.updated_at DESC
     LIMIT $3`,
    [userId, q, limit],
  );
  return rows;
}
```

- [ ] **Step 4: Run test, confirm it passes**

```bash
cd server && npx tsx --test src/__tests__/cards_fts_search.test.ts 2>&1 | tail -20
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Write failing test for `searchKnowledgeFts`**

Create `server/src/__tests__/knowledge_fts_search.test.ts`:

```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import { searchKnowledgeFts } from '../knowledge.js';

let owner: string;
let kId: string;

before(async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('K', 'k@test', 'x') RETURNING id`,
  );
  owner = u.rows[0]!.id;
  const k = await pool.query<{ id: string }>(
    `INSERT INTO knowledge_items (owner_id, title, body, visibility, source, fetch_status)
     VALUES ($1, 'Egg storage tips', 'best at 40F', 'private', 'manual', 'ok') RETURNING id`,
    [owner],
  );
  kId = k.rows[0]!.id;
});

after(async () => {
  await pool.query(`DELETE FROM knowledge_items WHERE id = $1`, [kId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [owner]);
});

test('searchKnowledgeFts returns own private item matching query', async () => {
  const hits = await searchKnowledgeFts(owner, 'egg', 10);
  assert.ok(hits.some((h) => h.id === kId));
});

test('searchKnowledgeFts returns [] for empty query', async () => {
  const hits = await searchKnowledgeFts(owner, '', 10);
  assert.deepEqual(hits, []);
});
```

- [ ] **Step 6: Run test, confirm it fails**

```bash
cd server && npx tsx --test src/__tests__/knowledge_fts_search.test.ts 2>&1 | tail -10
```

Expected: FAIL — `searchKnowledgeFts` not exported.

- [ ] **Step 7: Add `searchKnowledgeFts` to `server/src/knowledge.ts`**

At the bottom of `server/src/knowledge.ts`, append:

```ts
export type KnowledgeFtsHit = {
  id: string;
  title: string;
  snippet: string;
  url: string | null;
  updated_at: string;
  rank: number;
};

export async function searchKnowledgeFts(
  userId: string,
  query: string,
  limit = 10,
): Promise<KnowledgeFtsHit[]> {
  const q = query.trim();
  if (!q) return [];
  const { rows } = await pool.query<KnowledgeFtsHit>(
    `SELECT DISTINCT k.id,
            COALESCE(NULLIF(k.title, ''), k.title_auto, '(untitled)') AS title,
            LEFT(COALESCE(k.body, ''), 160) AS snippet,
            k.url,
            k.updated_at,
            ts_rank(k.fts, websearch_to_tsquery('english', $2)) AS rank
     FROM knowledge_items k
     LEFT JOIN knowledge_shares ks ON ks.knowledge_id = k.id
     WHERE NOT k.archived
       AND k.fts @@ websearch_to_tsquery('english', $2)
       AND (
         k.owner_id = $1
         OR k.visibility = 'inbox'
         OR (k.visibility = 'shared' AND ks.user_id = $1)
       )
     ORDER BY rank DESC, k.updated_at DESC
     LIMIT $3`,
    [userId, q, limit],
  );
  return rows;
}
```

Note: `pool` is already imported at the top of `knowledge.ts`.

- [ ] **Step 8: Run test, confirm it passes**

```bash
cd server && npx tsx --test src/__tests__/knowledge_fts_search.test.ts 2>&1 | tail -10
```

Expected: both tests PASS.

- [ ] **Step 9: Commit**

```bash
git add server/src/cards.ts server/src/knowledge.ts server/src/__tests__/cards_fts_search.test.ts server/src/__tests__/knowledge_fts_search.test.ts
git commit -m "$(cat <<'EOF'
feat(search): searchCardsFts + searchKnowledgeFts helpers

Both helpers run websearch_to_tsquery against the respective fts column
with the existing visibility predicates (creator/assignee/shares for
cards; owner/inbox/shared for knowledge). Empty queries short-circuit
to []. Used by the Telegram duplicate-check button.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: LLM re-rank helper

**Files:**
- Create: `server/src/ai/dedupe.ts`
- Create: `server/src/__tests__/dedupe.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/src/__tests__/dedupe.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankCandidates, type Candidate, buildDedupePrompt, parseDedupeResponse } from '../ai/dedupe.js';

const sampleCandidates: Candidate[] = [
  { kind: 'card', id: 'c1', title: 'Buy eggs', snippet: 'pasture-raised', contextLine: 'Today, 2d ago' },
  { kind: 'knowledge', id: 'k1', title: 'Egg storage tips', snippet: 'best at 40F', contextLine: 'Knowledge' },
];

test('buildDedupePrompt includes original text + indexed candidates', () => {
  const prompt = buildDedupePrompt('eggs for breakfast', sampleCandidates);
  assert.match(prompt, /eggs for breakfast/);
  assert.match(prompt, /1\. \[card\] 'Buy eggs'/);
  assert.match(prompt, /2\. \[knowledge\] 'Egg storage tips'/);
  assert.match(prompt, /confidence >= 40/);
});

test('parseDedupeResponse extracts matches with confidence', () => {
  const raw = JSON.stringify({
    matches: [
      { ix: 1, confidence: 85, why: 'same item' },
      { ix: 2, confidence: 50, why: 'related' },
    ],
  });
  const ranked = parseDedupeResponse(raw, sampleCandidates);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0]!.confidence, 85);
  assert.equal(ranked[0]!.id, 'c1');
  assert.equal(ranked[0]!.why, 'same item');
});

test('parseDedupeResponse caps at 3 and filters confidence < 40', () => {
  const raw = JSON.stringify({
    matches: [
      { ix: 1, confidence: 85, why: 'a' },
      { ix: 2, confidence: 30, why: 'b' },
      { ix: 1, confidence: 70, why: 'c' },
      { ix: 1, confidence: 60, why: 'd' },
      { ix: 1, confidence: 55, why: 'e' },
    ],
  });
  const ranked = parseDedupeResponse(raw, sampleCandidates);
  assert.equal(ranked.length, 3, 'cap at 3');
  assert.ok(!ranked.some((r) => r.confidence < 40), 'filter below 40');
});

test('parseDedupeResponse on invalid JSON returns FTS fallback (raw candidates, no confidence)', () => {
  const ranked = parseDedupeResponse('not json{', sampleCandidates);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0]!.id, 'c1');
  assert.equal(ranked[0]!.confidence, undefined);
  assert.equal(ranked[0]!.why, undefined);
});

test('rankCandidates with empty input short-circuits to []', async () => {
  const ranked = await rankCandidates('anything', []);
  assert.deepEqual(ranked, []);
});
```

- [ ] **Step 2: Run test, confirm it fails**

```bash
cd server && npx tsx --test src/__tests__/dedupe.test.ts 2>&1 | tail -15
```

Expected: FAIL — module `../ai/dedupe.js` not found.

- [ ] **Step 3: Create `server/src/ai/dedupe.ts`**

Create the file with this exact content:

```ts
import { chatPrimary, chatFallback } from './openai.js';

export type Candidate = {
  kind: 'card' | 'knowledge';
  id: string;
  title: string;
  snippet: string;
  contextLine: string;
};

export type RankedMatch = Candidate & {
  confidence?: number;
  why?: string;
};

const MIN_CONFIDENCE = 40;
const MAX_MATCHES = 3;
const TIMEOUT_MS = 4000;

export function buildDedupePrompt(originalText: string, candidates: Candidate[]): string {
  const lines = candidates
    .map((c, i) => `${i + 1}. [${c.kind}] '${c.title}' (${c.contextLine}) — ${c.snippet}`)
    .join('\n');
  return [
    `User wants to capture this message: "${originalText.replace(/\n/g, ' ')}"`,
    '',
    'Existing items (numbered):',
    lines,
    '',
    'Return strict JSON: {"matches":[{"ix":number,"confidence":0-100,"why":string}]}',
    `Only include items with confidence >= ${MIN_CONFIDENCE}. Cap at ${MAX_MATCHES} items.`,
    `"ix" is the number above. "why" is a short reason (under 60 chars).`,
  ].join('\n');
}

export function parseDedupeResponse(raw: string, candidates: Candidate[]): RankedMatch[] {
  let parsed: { matches?: Array<{ ix: number; confidence: number; why: string }> } | null = null;
  try {
    // LLM may wrap JSON in markdown fences; strip them.
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return candidates.map((c) => ({ ...c }));
  }
  if (!parsed?.matches || !Array.isArray(parsed.matches)) {
    return candidates.map((c) => ({ ...c }));
  }
  const seen = new Set<string>();
  const ranked: RankedMatch[] = [];
  for (const m of parsed.matches) {
    if (typeof m.ix !== 'number' || typeof m.confidence !== 'number') continue;
    if (m.confidence < MIN_CONFIDENCE) continue;
    const cand = candidates[m.ix - 1];
    if (!cand) continue;
    if (seen.has(cand.id)) continue;
    seen.add(cand.id);
    ranked.push({
      ...cand,
      confidence: Math.max(0, Math.min(100, Math.round(m.confidence))),
      why: typeof m.why === 'string' ? m.why.slice(0, 80) : '',
    });
    if (ranked.length >= MAX_MATCHES) break;
  }
  return ranked;
}

export async function rankCandidates(
  originalText: string,
  candidates: Candidate[],
): Promise<RankedMatch[]> {
  if (candidates.length === 0) return [];

  const target = chatPrimary() ?? chatFallback();
  if (!target) {
    // No AI configured — fall back to raw FTS order.
    return candidates.map((c) => ({ ...c }));
  }

  const prompt = buildDedupePrompt(originalText, candidates);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const completion = await target.client.chat.completions.create(
      {
        model: target.model,
        messages: [
          { role: 'system', content: 'You return only valid JSON. No prose.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      },
      { signal: controller.signal },
    );
    const raw = completion.choices[0]?.message?.content ?? '';
    return parseDedupeResponse(raw, candidates);
  } catch {
    return candidates.map((c) => ({ ...c }));
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run tests, confirm pure-function tests pass**

```bash
cd server && npx tsx --test src/__tests__/dedupe.test.ts 2>&1 | tail -15
```

Expected: all 5 tests PASS. (The `rankCandidates` test only verifies empty-input short-circuit, which doesn't call the LLM.)

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/dedupe.ts server/src/__tests__/dedupe.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): dedupe re-rank helper

rankCandidates() takes FTS-surfaced candidates and asks Gemini Flash
(via OpenRouter or OpenAI fallback) to assign 0-100 confidence per
candidate, capped at 3 results, minimum 40. Strict JSON response;
4s timeout; on any failure, falls back to raw FTS order with no
confidence/why annotation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Extend `PendingProposal` state shape

**Files:**
- Modify: `server/src/telegram/proposals.ts`

- [ ] **Step 1: Read current `proposals.ts`**

```bash
cat server/src/telegram/proposals.ts
```

Confirm fields: id, tgUserId, appUserId, chatId, isPrivateChat, original, proposal, links, promptMessageId, awaitingEdit, awaitingLinks, createdAt. TTL is `10 * 60 * 1000`.

- [ ] **Step 2: Replace `server/src/telegram/proposals.ts` with the extended version**

Write the file with this exact content:

```ts
import crypto from 'node:crypto';
import type { Proposal as AIProposal } from '../ai/propose.js';

export type Destination = 'private_card' | 'public_card' | 'knowledge';
export type AttachState = 'new' | 'pickRecent' | 'pickFiltered';

export type DupCandidate = {
  kind: 'card' | 'knowledge';
  id: string;
  title: string;
  snippet: string;
  contextLine: string;
  confidence?: number;
  why?: string;
};

export type PendingProposal = {
  id: string;
  tgUserId: number;
  appUserId: string;
  chatId: number;
  isPrivateChat: boolean;
  original: string;
  proposal: AIProposal;
  links: string[];
  promptMessageId: number | null;
  awaitingEdit: boolean;
  awaitingLinks: boolean;
  createdAt: number;
  // Structured-capture extensions
  destination?: Destination;
  attachMode?: AttachState;
  attachFilter?: string;
  attachPickerIds?: Array<{ kind: 'card' | 'knowledge'; id: string }>;
  dupCandidates?: DupCandidate[];
  pendingPhotoFileId?: string;
  pendingAudioFileId?: string;
};

const TTL_MS = 15 * 60 * 1000;

const byId = new Map<string, PendingProposal>();
const byTgUser = new Map<number, string>();

function prune() {
  const now = Date.now();
  for (const [id, p] of byId) {
    if (now - p.createdAt > TTL_MS) {
      byId.delete(id);
      if (byTgUser.get(p.tgUserId) === id) byTgUser.delete(p.tgUserId);
    }
  }
}

export function createPending(
  p: Omit<
    PendingProposal,
    | 'id'
    | 'createdAt'
    | 'awaitingEdit'
    | 'awaitingLinks'
    | 'links'
    | 'promptMessageId'
    | 'destination'
    | 'attachMode'
    | 'attachFilter'
    | 'attachPickerIds'
    | 'dupCandidates'
    | 'pendingPhotoFileId'
    | 'pendingAudioFileId'
  >,
): PendingProposal {
  prune();
  const id = crypto.randomBytes(6).toString('base64url');
  const full: PendingProposal = {
    ...p,
    id,
    createdAt: Date.now(),
    awaitingEdit: false,
    awaitingLinks: false,
    links: [],
    promptMessageId: null,
  };
  byId.set(id, full);
  byTgUser.set(p.tgUserId, id);
  return full;
}

export function getPending(id: string): PendingProposal | null {
  prune();
  return byId.get(id) ?? null;
}

export function getLatestForUser(tgUserId: number): PendingProposal | null {
  prune();
  const id = byTgUser.get(tgUserId);
  return id ? byId.get(id) ?? null : null;
}

export function updatePending(id: string, patch: Partial<PendingProposal>): void {
  const p = byId.get(id);
  if (!p) return;
  Object.assign(p, patch);
}

export function deletePending(id: string): void {
  const p = byId.get(id);
  if (!p) return;
  byId.delete(id);
  if (byTgUser.get(p.tgUserId) === id) byTgUser.delete(p.tgUserId);
}
```

- [ ] **Step 3: Typecheck**

```bash
cd server && npx tsc --noEmit 2>&1 | tail -5
```

Expected: clean (no new TS errors — the new fields are all optional).

- [ ] **Step 4: Commit**

```bash
git add server/src/telegram/proposals.ts
git commit -m "$(cat <<'EOF'
feat(telegram): extend PendingProposal with destination+attach+dedupe fields

Adds optional destination, attachMode/Filter/PickerIds, dupCandidates,
and pendingPhoto/AudioFileId fields. Bumps TTL from 10 to 15 minutes
to accommodate the longer two-step flow. Existing callers unchanged
because all new fields are optional.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `defaultDestination` helper + tests

**Files:**
- Create: `server/src/telegram/destination.ts`
- Create: `server/src/__tests__/destination.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/src/__tests__/destination.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDestination, destinationOptions } from '../telegram/destination.js';
import type { Proposal as AIProposal } from '../ai/propose.js';

const baseProposal: AIProposal = {
  title: 'Buy eggs',
  description: '',
  tags: [],
  is_actionable: true,
  links: [],
};

test('defaultDestination: knowledge when proposal has links', () => {
  const p: AIProposal = { ...baseProposal, links: ['https://example.com'] };
  assert.equal(defaultDestination(p, true), 'knowledge');
});

test('defaultDestination: knowledge when title contains URL', () => {
  const p: AIProposal = { ...baseProposal, title: 'check https://x.com today' };
  assert.equal(defaultDestination(p, true), 'knowledge');
});

test('defaultDestination: private_card in DM with no URL', () => {
  assert.equal(defaultDestination(baseProposal, true), 'private_card');
});

test('defaultDestination: public_card in group with no URL', () => {
  assert.equal(defaultDestination(baseProposal, false), 'public_card');
});

test('destinationOptions DM order: private, public, knowledge', () => {
  const opts = destinationOptions(true);
  assert.deepEqual(opts.map((o) => o.key), ['private_card', 'public_card', 'knowledge']);
});

test('destinationOptions group order: public, private, knowledge', () => {
  const opts = destinationOptions(false);
  assert.deepEqual(opts.map((o) => o.key), ['public_card', 'private_card', 'knowledge']);
});
```

- [ ] **Step 2: Run test, confirm it fails**

```bash
cd server && npx tsx --test src/__tests__/destination.test.ts 2>&1 | tail -15
```

Expected: FAIL — `server/src/telegram/destination.ts` does not exist.

- [ ] **Step 3: Create `server/src/telegram/destination.ts`**

```ts
import type { Proposal as AIProposal } from '../ai/propose.js';
import type { Destination } from './proposals.js';

const URL_RE = /https?:\/\//i;

export function defaultDestination(p: AIProposal, isPrivateChat: boolean): Destination {
  const hasLink =
    (p.links && p.links.length > 0) ||
    URL_RE.test(p.title) ||
    URL_RE.test(p.description ?? '');
  if (hasLink) return 'knowledge';
  return isPrivateChat ? 'private_card' : 'public_card';
}

export function destinationOptions(
  isPrivateChat: boolean,
): Array<{ key: Destination; label: string }> {
  return isPrivateChat
    ? [
        { key: 'private_card', label: '🔒 Private' },
        { key: 'public_card', label: '👥 Public' },
        { key: 'knowledge', label: '📚 Knowledge' },
      ]
    : [
        { key: 'public_card', label: '👥 Inbox' },
        { key: 'private_card', label: '🔒 Mine' },
        { key: 'knowledge', label: '📚 Knowledge' },
      ];
}
```

- [ ] **Step 4: Run test, confirm it passes**

```bash
cd server && npx tsx --test src/__tests__/destination.test.ts 2>&1 | tail -15
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/telegram/destination.ts server/src/__tests__/destination.test.ts
git commit -m "$(cat <<'EOF'
feat(telegram): defaultDestination + destinationOptions helpers

Pure functions that decide the auto-selected destination (knowledge if
URL detected, otherwise private in DM and public in groups) and the
ordered button labels per chat type. Will drive the new destination
keyboard.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Keyboard builders for new flow

**Files:**
- Modify: `server/src/telegram/bot.ts`

- [ ] **Step 1: Add new keyboard builders alongside existing ones**

Open `server/src/telegram/bot.ts`. Locate the existing `proposalKeyboard` function (around line 278). **Below** it (not replacing it — kept for now, removed in Task 7), add:

```ts
import { defaultDestination, destinationOptions } from './destination.js';
import type { Destination } from './proposals.js';

function destinationKeyboard(pid: string, def: Destination, isPrivateChat: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const o of destinationOptions(isPrivateChat)) {
    kb.text(`${o.key === def ? '✓ ' : ''}${o.label}`, `dest:${o.key}:${pid}`);
  }
  kb.row()
    .text('🔍 Check duplicates?', `dup:check:${pid}`);
  kb.row()
    .text('✏️ Edit', `edit:${pid}`)
    .text('❌ Cancel', `drop:${pid}`);
  return kb;
}

function columnKeyboard(pid: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('📥 Backlog', `col:backlog:${pid}`)
    .text('📅 Today', `col:today:${pid}`)
    .row()
    .text('⚡ In Progress', `col:in_progress:${pid}`)
    .text('✅ Done', `col:done:${pid}`);
}

function attachmentKindKeyboard(pid: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✨ New', `att:new:${pid}`)
    .text('🔗 Attach to existing', `att:pick:${pid}`)
    .row()
    .text('❌ Cancel', `drop:${pid}`);
}

function attachPickerKeyboard(
  pid: string,
  items: Array<{ id: string; kind: 'card' | 'knowledge'; label: string }>,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const it of items) {
    kb.text(`Pick: ${it.label.slice(0, 50)}`, `att:to:${it.kind}:${it.id}:${pid}`).row();
  }
  kb.text('❌ Cancel', `drop:${pid}`);
  return kb;
}

function dupResultsKeyboard(
  pid: string,
  matches: Array<{ kind: 'card' | 'knowledge'; id: string }>,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (matches[0]) {
    const m = matches[0];
    kb.text(`🔗 Link to "${matches[0].kind === 'card' ? 'card' : 'knowledge'}"`, `dup:link:${m.kind}:${m.id}:${pid}`);
  }
  kb.text('+ Save anyway', `dup:save:${pid}`).row().text('❌ Cancel', `drop:${pid}`);
  return kb;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd server && npx tsc --noEmit 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/src/telegram/bot.ts
git commit -m "$(cat <<'EOF'
feat(telegram): new keyboard builders for structured capture

Adds destinationKeyboard (3 destinations + auto-detected default mark +
check/edit/cancel), columnKeyboard (4-cell column picker), attachment
KindKeyboard (New vs Attach to existing for photo/voice), and the
attachPicker + dupResults keyboards. Existing proposalKeyboard kept
in place; removed in the next task once the new flow wires up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wire text-message flow (destination → column → save)

**Files:**
- Modify: `server/src/telegram/bot.ts`

This task is the largest. Break into sub-steps.

- [ ] **Step 1: Read the current text handler + callback dispatch**

```bash
sed -n '339,800p' server/src/telegram/bot.ts | head -200
```

Identify:
- `handleText()` — currently calls `sendProposal()` using `proposalKeyboard`.
- The grammy callback registration `bot.callbackQuery(...)` block (search `callbackQuery`).

```bash
grep -n "callbackQuery\|bot.on" server/src/telegram/bot.ts | head -10
```

- [ ] **Step 2: Replace `sendProposal` to use `destinationKeyboard`**

Find `sendProposal` (around line 307). Replace its body so it uses `destinationKeyboard` keyed off `defaultDestination`:

```ts
async function sendProposal(
  ctx: Context,
  pendingId: string,
  p: AIProposal,
  isPrivateChat: boolean,
  links: string[] = [],
): Promise<number | null> {
  const def = defaultDestination(p, isPrivateChat);
  try {
    const msg = await ctx.reply(proposalText(p, links), {
      parse_mode: 'Markdown',
      reply_markup: destinationKeyboard(pendingId, def, isPrivateChat),
      reply_parameters: { message_id: ctx.msg!.message_id, allow_sending_without_reply: true },
    });
    return msg.message_id;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Remove the now-unused `proposalKeyboard` function and `sendPrivacyPrompt`**

These callers are about to be removed too. Locate `function proposalKeyboard` and `function sendPrivacyPrompt` and delete them entirely.

Search for callers of `sendPrivacyPrompt`:

```bash
grep -n "sendPrivacyPrompt" server/src/telegram/bot.ts
```

Each call to `sendPrivacyPrompt(ctx, cardId)` was used after the legacy direct-save path. The new flow gates destination *before* save, so these callers should be removed too. Remove every `if (!isPrivate) await sendPrivacyPrompt(ctx, cardId);` line and remove the legacy `priv:` / `pub:` / `savep:` / `savepub:` / `savet:` / `saved:` / `save:` callback handlers below (we replace with new `dest:` / `col:` handlers).

- [ ] **Step 4: Add new callback handlers**

Locate the existing `bot.callbackQuery(/^...$/, ...)` registrations (or `bot.on('callback_query:data', ...)` block). Add the new handlers **before** the existing `mv:` handler block. Insert this block:

```ts
// ---------- structured capture callbacks ----------

// Destination pick: dest:<destination>:<pid>
bot.callbackQuery(/^dest:(private_card|public_card|knowledge):([^:]+)$/, async (ctx) => {
  const dest = ctx.match![1] as Destination;
  const pid = ctx.match![2]!;
  const pending = getPending(pid);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: 'Session expired. Send your message again.', show_alert: true });
    return;
  }
  updatePending(pid, { destination: dest });
  await ctx.answerCallbackQuery();
  if (dest === 'knowledge') {
    await finalizeKnowledge(ctx, pending);
    return;
  }
  // Card path: show column picker
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: columnKeyboard(pid) });
    await ctx.reply('Which column?');
  } catch { /* edit-failures non-fatal */ }
});

// Column pick: col:<status>:<pid>
bot.callbackQuery(/^col:(backlog|today|in_progress|done):([^:]+)$/, async (ctx) => {
  const status = ctx.match![1] as Status;
  const pid = ctx.match![2]!;
  const pending = getPending(pid);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  await finalizeCard(ctx, pending, status);
});

// Duplicate check: dup:check:<pid>
bot.callbackQuery(/^dup:check:([^:]+)$/, async (ctx) => {
  const pid = ctx.match![1]!;
  const pending = getPending(pid);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery({ text: 'Scanning…' });
  await runDuplicateCheck(ctx, pending);
});

// Link to existing match: dup:link:<kind>:<id>:<pid>
bot.callbackQuery(/^dup:link:(card|knowledge):([^:]+):([^:]+)$/, async (ctx) => {
  const kind = ctx.match![1] as 'card' | 'knowledge';
  const id = ctx.match![2]!;
  const pid = ctx.match![3]!;
  const pending = getPending(pid);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  deletePending(pid);
  await ctx.reply(`🔗 Linked to existing ${kind}.`);
});

// Save anyway after dup check: dup:save:<pid>
bot.callbackQuery(/^dup:save:([^:]+)$/, async (ctx) => {
  const pid = ctx.match![1]!;
  const pending = getPending(pid);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  try {
    await ctx.editMessageReplyMarkup({
      reply_markup: destinationKeyboard(pid, defaultDestination(pending.proposal, pending.isPrivateChat), pending.isPrivateChat),
    });
  } catch {}
});
```

- [ ] **Step 5: Add `finalizeKnowledge`, `finalizeCard`, `runDuplicateCheck` helpers**

Add **above** the callback registrations:

```ts
import { createKnowledge, validateUrl } from '../knowledge.js';
import { searchCardsFts } from '../cards.js';
import { searchKnowledgeFts } from '../knowledge.js';
import { rankCandidates, type Candidate } from '../ai/dedupe.js';
import { triggerFetch } from '../knowledge_fetch.js';

async function finalizeKnowledge(ctx: Context, pending: PendingProposal): Promise<void> {
  const proposal = pending.proposal;
  // Determine URL (first link in proposal.links or first URL in description/title)
  const candidateUrls = [
    ...(proposal.links ?? []),
    ...extractUrls(proposal.title),
    ...extractUrls(proposal.description ?? ''),
    ...extractUrls(pending.original),
  ];
  let url: string | null = null;
  for (const u of candidateUrls) {
    try {
      validateUrl(u);
      url = u;
      break;
    } catch {}
  }
  const title = (proposal.title || pending.original.slice(0, 80)).trim();
  const created = await createKnowledge(pending.appUserId, {
    title,
    body: proposal.description || (url ? '' : pending.original),
    url,
    tags: proposal.tags ?? [],
    visibility: 'private',
    source: 'telegram',
  });
  if (url) {
    // Don't await — fetch runs async; existing pattern in knowledge.ts
    triggerFetch(created.id).catch(() => {});
  }
  deletePending(pending.id);
  await ctx.reply(`📚 Saved · ${title}`);
}

async function finalizeCard(
  ctx: Context,
  pending: PendingProposal,
  status: Status,
): Promise<void> {
  const proposal = pending.proposal;
  const isPrivate = pending.destination === 'private_card';
  const assignees = isPrivate ? [pending.appUserId] : undefined;
  const cardId = await createCard({
    title: proposal.title || pending.original.slice(0, 80),
    description: proposal.description ?? '',
    tags: proposal.tags ?? [],
    createdBy: pending.appUserId,
    source: 'telegram',
    status,
    aiSummarized: true,
    assignees,
    telegramChatId: pending.chatId,
    telegramMessageId: pending.promptMessageId ?? undefined,
  });

  // Attach pending photo/audio if present (set by Task 8/9)
  if (pending.pendingPhotoFileId) {
    try {
      const localPath = await downloadTelegramFile(bot, pending.pendingPhotoFileId, cardId, '.jpg');
      await attachFile(cardId, 'image', localPath);
    } catch { /* non-fatal */ }
  }
  if (pending.pendingAudioFileId) {
    try {
      const localPath = await downloadTelegramFile(bot, pending.pendingAudioFileId, cardId, '.ogg');
      await attachFile(cardId, 'audio', localPath);
    } catch { /* non-fatal */ }
  }

  await logActivity(pending.appUserId, cardId, isPrivate ? 'telegram.text.private' : 'telegram.text');
  deletePending(pending.id);
  const emoji = STATUS_EMOJI[status];
  const label = STATUS_LABEL[status];
  await ctx.reply(`✓ Saved · ${emoji} ${label} — ${proposal.title}`, {
    reply_markup: postSaveKeyboard(cardId, status),
  });
}

async function runDuplicateCheck(ctx: Context, pending: PendingProposal): Promise<void> {
  const q = pending.proposal.title || pending.original.slice(0, 120);
  const [cardHits, kHits] = await Promise.all([
    searchCardsFts(pending.appUserId, q, 10),
    searchKnowledgeFts(pending.appUserId, q, 10),
  ]);
  if (cardHits.length === 0 && kHits.length === 0) {
    await ctx.reply('🔍 No related items found. Pick a destination above to save.');
    return;
  }
  const candidates: Candidate[] = [
    ...cardHits.map((h) => ({
      kind: 'card' as const,
      id: h.id,
      title: h.title,
      snippet: (h.description || '').slice(0, 120),
      contextLine: `${STATUS_LABEL[h.status]}, ${relativeAge(h.updated_at)}`,
    })),
    ...kHits.map((h) => ({
      kind: 'knowledge' as const,
      id: h.id,
      title: h.title,
      snippet: h.snippet,
      contextLine: h.url ? 'Knowledge (URL)' : 'Knowledge (note)',
    })),
  ];
  const ranked = await rankCandidates(pending.original, candidates);
  if (ranked.length === 0) {
    await ctx.reply('🔍 No strong matches found. Pick a destination above to save.');
    return;
  }
  updatePending(pending.id, { dupCandidates: ranked });
  const lines = ranked.map((r) => {
    const conf = r.confidence !== undefined ? ` — ${r.confidence}% match` : '';
    const why = r.why ? `\n      why: ${r.why}` : '';
    return `• [${r.kind}] '${r.title}' (${r.contextLine})${conf}${why}`;
  });
  await ctx.reply(`🔍 Found ${ranked.length} possibly related:\n${lines.join('\n')}`, {
    reply_markup: dupResultsKeyboard(pending.id, ranked),
  });
}

const STATUS_LABEL: Record<Status, string> = {
  backlog: 'Backlog',
  today: 'Today',
  in_progress: 'In Progress',
  done: 'Done',
};

const STATUS_EMOJI: Record<Status, string> = {
  backlog: '📥',
  today: '📅',
  in_progress: '⚡',
  done: '✅',
};

function relativeAge(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const days = Math.floor(d / 86_400_000);
  if (days >= 1) return `${days}d ago`;
  const hrs = Math.floor(d / 3_600_000);
  if (hrs >= 1) return `${hrs}h ago`;
  const mins = Math.floor(d / 60_000);
  return `${Math.max(1, mins)}m ago`;
}
```

Note: this block adds the imports needed (`createKnowledge`, `triggerFetch`, `searchCardsFts`, `searchKnowledgeFts`, `rankCandidates`, `Candidate`, `validateUrl`). The existing `STATUS_LABELS` / `STATUS_BADGE` records at top of file may duplicate; if so, **reuse them** instead of defining new ones — search for them first:

```bash
grep -n "STATUS_LABEL\|STATUS_BADGE\|STATUS_EMOJI" server/src/telegram/bot.ts
```

If `STATUS_LABELS` / `STATUS_BADGE` already exist, alias them and drop the duplicate definitions to keep DRY.

- [ ] **Step 6: Remove the old `proposalKeyboard`-based callback handlers**

Search for legacy callback patterns and remove:

```bash
grep -n "save:\|savep:\|savepub:\|savet:\|saved:\|priv:\|pub:\|link:\|edit:\|drop:" server/src/telegram/bot.ts | head -30
```

Keep `mv:` (post-save move-column) and `arch:` (post-save archive). Keep `edit:` and `drop:` (used by new flow's Edit/Cancel buttons). Remove `save:` / `savep:` / `savepub:` / `savet:` / `saved:` / `priv:` / `pub:` / `link:` handlers.

If any of those handlers contained logic that's still needed (e.g., the `link:` "Add URL" affordance), port the logic to the new flow as a separate task — but for this plan, the Add Link affordance is **dropped** (knowledge destination supersedes it for URL captures, and tag-style links can still be edited via the web UI).

- [ ] **Step 7: Typecheck and run all tests**

```bash
cd server && npx tsc --noEmit 2>&1 | tail -10
cd server && npm test 2>&1 | tail -15
```

Expected: typecheck clean; all existing tests + new tests pass.

- [ ] **Step 8: Manual smoke (local docker)**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude
docker compose up -d --build server
sleep 3
docker compose exec -T server node -e '
const https = require("https");
https.get(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`, (r) => {
  let b=""; r.on("data",c=>b+=c);
  r.on("end",()=>{const j=JSON.parse(b); console.log(j.ok?"Bot OK: @"+j.result.username:"FAIL: "+j.description);});
});'
```

Then in Telegram:
1. DM the bot `Buy eggs` → expect 3 destination buttons (✓ on 🔒 Private) + Check + Edit + Cancel
2. Tap 🔒 Private → expect "Which column?" with 4 buttons
3. Tap 📅 Today → expect `✓ Saved · 📅 Today — Buy eggs` + post-save row
4. Open kanban → My board → Today column → card visible
5. DM the bot `Buy eggs again` → tap `🔍 Check duplicates?` → expect ≥1 result with confidence + Link/Save buttons
6. Tap `🔗 Link to card` → expect `🔗 Linked to existing card.`
7. DM the bot `https://example.com` → expect ✓ on 📚 Knowledge → tap it → expect `📚 Saved`
8. Open kanban → Knowledge tab → item visible

If any step fails, capture the chat transcript + server log and triage before committing.

- [ ] **Step 9: Commit**

```bash
git add server/src/telegram/bot.ts
git commit -m "$(cat <<'EOF'
feat(telegram): two-step structured capture for text messages

Replaces the single-step propose-with-private/public buttons with:
1. Destination prompt: Private/Public/Knowledge + auto-detected default
   + on-demand duplicate check + Edit/Cancel
2. Column prompt (cards only): Backlog/Today/In Progress/Done
3. Knowledge path saves directly with auto-fetch for URLs

Adds finalizeKnowledge, finalizeCard, runDuplicateCheck helpers. Removes
legacy save:/savep:/savepub:/savet:/saved:/priv:/pub:/link: callback
handlers; keeps mv:, arch:, edit:, drop: for post-save and shared flow
actions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Wire photo flow (New vs Attach to existing)

**Files:**
- Modify: `server/src/telegram/bot.ts`

- [ ] **Step 1: Locate current photo handler**

```bash
grep -n "ctx.message?.photo\|on('message:photo'\|on(':photo'" server/src/telegram/bot.ts
```

Find the handler that calls vision. It likely calls `proposeFromText`-equivalent then enters the proposal flow.

- [ ] **Step 2: Modify photo handler to ask New vs Attach before destination**

Replace the body of the photo handler so it:
1. Downloads the photo (or just keeps the file_id pending — defer download)
2. Runs vision summary as before
3. Creates a pending proposal **with `pendingPhotoFileId` set**
4. Sends a prompt with `attachmentKindKeyboard` instead of going straight to destination

Pseudo-code structure (adapt to existing code style):

```ts
const fileId = ctx.message!.photo!.at(-1)!.file_id;
// vision call (existing logic) — capture summary
const proposal = await proposeFromVision(/* ... */);  // existing fn
const pending = createPending({
  tgUserId: ctx.from!.id,
  appUserId,
  chatId: ctx.chat!.id,
  isPrivateChat: ctx.chat!.type === 'private',
  original: proposal.title,
  proposal,
});
updatePending(pending.id, { pendingPhotoFileId: fileId, attachMode: 'new' });
await ctx.reply(`📷 ${proposal.title}\n\nIs this new, or attaching to existing?`, {
  reply_markup: attachmentKindKeyboard(pending.id),
});
```

- [ ] **Step 3: Add `att:new` and `att:pick` callbacks**

Add to the callback section in `bot.ts` (alongside the others added in Task 7):

```ts
// att:new:<pid> — proceed to text destination flow with photo pending
bot.callbackQuery(/^att:new:([^:]+)$/, async (ctx) => {
  const pid = ctx.match![1]!;
  const pending = getPending(pid);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
    return;
  }
  updatePending(pid, { attachMode: 'new' });
  await ctx.answerCallbackQuery();
  const def = defaultDestination(pending.proposal, pending.isPrivateChat);
  try {
    await ctx.editMessageReplyMarkup({
      reply_markup: destinationKeyboard(pid, def, pending.isPrivateChat),
    });
  } catch {}
});

// att:pick:<pid> — show attach picker
bot.callbackQuery(/^att:pick:([^:]+)$/, async (ctx) => {
  const pid = ctx.match![1]!;
  const pending = getPending(pid);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  await showAttachPicker(ctx, pending, /* filter */ '');
});

// att:to:<kind>:<targetId>:<pid> — actually attach
bot.callbackQuery(/^att:to:(card|knowledge):([^:]+):([^:]+)$/, async (ctx) => {
  const kind = ctx.match![1] as 'card' | 'knowledge';
  const targetId = ctx.match![2]!;
  const pid = ctx.match![3]!;
  const pending = getPending(pid);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  await attachToTarget(ctx, pending, kind, targetId);
});
```

- [ ] **Step 4: Add `showAttachPicker` + `attachToTarget` helpers**

Above the callback registrations:

```ts
async function showAttachPicker(
  ctx: Context,
  pending: PendingProposal,
  filter: string,
): Promise<void> {
  let cardItems: Array<{ id: string; label: string }> = [];
  let kItems: Array<{ id: string; label: string }> = [];
  if (filter.trim()) {
    const cs = await searchCardsFts(pending.appUserId, filter, 5);
    const ks = await searchKnowledgeFts(pending.appUserId, filter, 3);
    cardItems = cs.map((c) => ({ id: c.id, label: `${STATUS_EMOJI[c.status]} ${c.title}` }));
    kItems = ks.map((k) => ({ id: k.id, label: `📚 ${k.title}` }));
  } else {
    // top-5 recent cards, top-3 recent knowledge visible to user
    const cs = await pool.query<{ id: string; title: string; status: Status }>(
      `SELECT DISTINCT c.id, c.title, c.status
       FROM cards c
       LEFT JOIN card_assignees ca ON ca.card_id = c.id
       LEFT JOIN card_shares cs ON cs.card_id = c.id
       WHERE NOT c.archived
         AND (c.created_by = $1 OR ca.user_id = $1 OR cs.user_id = $1)
       ORDER BY c.updated_at DESC LIMIT 5`,
      [pending.appUserId],
    );
    cardItems = cs.rows.map((c) => ({ id: c.id, label: `${STATUS_EMOJI[c.status]} ${c.title}` }));
    const ks = await pool.query<{ id: string; title: string }>(
      `SELECT k.id, COALESCE(NULLIF(k.title, ''), k.title_auto, '(untitled)') AS title
       FROM knowledge_items k
       LEFT JOIN knowledge_shares ks ON ks.knowledge_id = k.id
       WHERE NOT k.archived
         AND (k.owner_id = $1 OR k.visibility = 'inbox'
              OR (k.visibility = 'shared' AND ks.user_id = $1))
       ORDER BY k.updated_at DESC LIMIT 3`,
      [pending.appUserId],
    );
    kItems = ks.rows.map((k) => ({ id: k.id, label: `📚 ${k.title}` }));
  }
  const items = [
    ...cardItems.map((i) => ({ kind: 'card' as const, ...i })),
    ...kItems.map((i) => ({ kind: 'knowledge' as const, ...i })),
  ];
  updatePending(pending.id, {
    attachMode: filter.trim() ? 'pickFiltered' : 'pickRecent',
    attachFilter: filter,
    attachPickerIds: items.map((it) => ({ kind: it.kind, id: it.id })),
  });
  if (items.length === 0) {
    await ctx.reply('No items found. Reply with different words or tap Cancel.', {
      reply_markup: new InlineKeyboard().text('❌ Cancel', `drop:${pending.id}`),
    });
    return;
  }
  await ctx.reply('Pick one (or reply with a few words to filter):', {
    reply_markup: attachPickerKeyboard(pending.id, items),
  });
}

async function attachToTarget(
  ctx: Context,
  pending: PendingProposal,
  kind: 'card' | 'knowledge',
  targetId: string,
): Promise<void> {
  if (!pending.pendingPhotoFileId && !pending.pendingAudioFileId) {
    await ctx.reply('Nothing to attach.');
    deletePending(pending.id);
    return;
  }
  if (kind === 'card') {
    try {
      if (pending.pendingPhotoFileId) {
        const p = await downloadTelegramFile(bot, pending.pendingPhotoFileId, targetId, '.jpg');
        await attachFile(targetId, 'image', p);
      }
      if (pending.pendingAudioFileId) {
        const p = await downloadTelegramFile(bot, pending.pendingAudioFileId, targetId, '.ogg');
        await attachFile(targetId, 'audio', p);
      }
      await ctx.reply('📎 Attached to card.');
    } catch (e) {
      await ctx.reply(`Attach failed: ${e instanceof Error ? e.message : 'error'}`);
    }
  } else {
    // knowledge attach: we don't yet support binary attachments on knowledge_items.
    await ctx.reply('Knowledge items don\'t support attachments yet — saved as new card instead.');
    // Fall back to new-card path
    updatePending(pending.id, { destination: 'private_card', attachMode: 'new' });
    await finalizeCard(ctx, pending, 'backlog');
    return;
  }
  deletePending(pending.id);
}
```

- [ ] **Step 5: Route reply-with-text in attach mode through `showAttachPicker`**

Open `handleText` in `bot.ts` (line ~339). Add a branch early in the function (after the existing pending-proposal redirect block) that checks if the user has a pending proposal in `pickRecent` or `pickFiltered` mode:

```ts
const latest = getLatestForUser(ctx.from!.id);
if (latest && (latest.attachMode === 'pickRecent' || latest.attachMode === 'pickFiltered')) {
  await showAttachPicker(ctx, latest, text);
  return;
}
```

- [ ] **Step 6: Typecheck + tests**

```bash
cd server && npx tsc --noEmit 2>&1 | tail -5
cd server && npm test 2>&1 | tail -10
```

Both clean.

- [ ] **Step 7: Manual smoke**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude
docker compose up -d --build server
```

In Telegram:
1. DM the bot a photo → expect "📷 <summary>\n\nIs this new, or attaching to existing? [✨ New] [🔗 Attach to existing] [❌ Cancel]"
2. Tap **✨ New** → expect destination keyboard
3. Pick `🔒 Private` → column row → pick `📅 Today` → expect `✓ Saved … — <title>` + image attached on the card in kanban UI
4. DM another photo → tap **🔗 Attach to existing** → expect recent-items picker
5. Reply with text `buy eggs` → expect filtered list
6. Tap a card row → expect `📎 Attached to card.` + image visible on that card in kanban

- [ ] **Step 8: Commit**

```bash
git add server/src/telegram/bot.ts
git commit -m "$(cat <<'EOF'
feat(telegram): photo flow with New vs Attach-to-existing path

Photo handler now asks ✨ New / 🔗 Attach before running the destination
flow. Attach mode shows a recent-items picker (top 5 cards + top 3
knowledge by updated_at) that re-renders filtered by FTS when the user
replies with text. Attaching to a card writes the image as an
attachment; attaching to a knowledge item falls back to a new card
(knowledge attachments not yet supported in the schema).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Wire voice/audio flow

**Files:**
- Modify: `server/src/telegram/bot.ts`

- [ ] **Step 1: Locate voice handler**

```bash
grep -n "voice\|message:voice\|message:audio" server/src/telegram/bot.ts
```

- [ ] **Step 2: Mirror photo handler**

Apply the same transformation as Task 8 Step 2, but:
- File field is `ctx.message.voice?.file_id` (or `audio.file_id` as fallback)
- Vision call is replaced by Whisper (`whisperTranscribe(filePath)` — existing fn)
- `pendingAudioFileId` (not `pendingPhotoFileId`) is set
- Initial reply uses `🎙 ${transcript}` instead of `📷 ${summary}`

The `attachToTarget` helper already handles both photo and audio fileIds (it checks each in order), so no change needed there.

- [ ] **Step 3: Typecheck + tests**

```bash
cd server && npx tsc --noEmit 2>&1 | tail -5
cd server && npm test 2>&1 | tail -10
```

- [ ] **Step 4: Manual smoke**

In Telegram:
1. DM the bot a voice note → expect "🎙 <transcript>\n\nIs this new, or attaching to existing? …"
2. Tap **✨ New** → destination → column → save → expect audio attached on card
3. DM another voice → **Attach** → recent picker → pick → expect `📎 Attached to card.`

- [ ] **Step 5: Commit**

```bash
git add server/src/telegram/bot.ts
git commit -m "$(cat <<'EOF'
feat(telegram): voice flow with New vs Attach path (mirror of photo)

Voice/audio handler runs Whisper transcript, sets pendingAudioFileId on
the proposal, and prompts ✨ New / 🔗 Attach exactly like photos.
attachToTarget already handled both file kinds, so this re-uses that
helper unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: README + final integration smoke

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README Telegram section**

Open `README.md`. Locate the section starting with `### Capture (Telegram)` and the "Interactive proposal flow" block. Replace the block:

```
### Capture (Telegram)

- **DM the bot** — any message kicks off a 2-step interactive flow
- **Post to the family group** — same flow, with Family Inbox as default
- **Voice notes** → Whisper transcribe → "new vs attach to existing" → flow
- **Photos** → vision summary → "new vs attach to existing" → flow
- **URLs auto-detected** — default destination becomes Knowledge

### Interactive proposal flow (text messages)

The bot replies with an AI-extracted preview and a 3-button destination row:

```
📝 Buy eggs
Tags: #groceries

[✓ 🔒 Private] [👥 Public] [📚 Knowledge]
[🔍 Check duplicates?]
[✏️ Edit] [❌ Cancel]
```

- **🔒 Private / 👥 Public** — opens a column picker:
  `[📥 Backlog] [📅 Today] [⚡ In Progress] [✅ Done]`
- **📚 Knowledge** — saves directly (URL auto-fetch if present)
- **🔍 Check duplicates?** — runs FTS + LLM re-rank across your visible
  cards + knowledge; surfaces top 3 matches with confidence; offers
  [🔗 Link to existing] [+ Save anyway] [❌ Cancel]
- **✏️ Edit** — send replacement text; bot re-proposes
- **❌ Cancel** — discard

### Attaching photos / voice to existing items

After vision/Whisper extracts text, the bot asks:

```
📷 <summary>
[✨ New] [🔗 Attach to existing] [❌ Cancel]
```

**Attach** shows the top 5 recent cards + top 3 recent knowledge items
visible to you, with a `[Pick]` button per row and a "reply with text to
filter" hint. Filter replies re-run the picker with FTS narrowing.
Picking a card attaches the photo/audio as an image/audio attachment.
```

(Replace the corresponding existing paragraphs verbatim.)

- [ ] **Step 2: Confirm typecheck + tests still pass**

```bash
cd server && npm test 2>&1 | tail -10
cd server && npx tsc --noEmit 2>&1 | tail -3
cd web && npm run build 2>&1 | tail -5
```

All clean.

- [ ] **Step 3: Full integration smoke**

Stop and restart server, then walk through every scenario in §8 of the spec:

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude
docker compose up -d --build server
docker compose logs --tail 20 server | grep -iE "listening|error"
```

Run the §8 checklist from the spec end to end. Mark any deviations.

- [ ] **Step 4: Commit + push branch**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs(readme): describe new structured Telegram capture flow

Updates the Capture (Telegram) section and the Interactive proposal
flow block to reflect the destination → column two-step flow, the
duplicate-check button, and the photo/voice attach-to-existing path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin feat/telegram-structured-capture
```

- [ ] **Step 5: Open PR (ask user first)**

Do NOT auto-open. Ask user:

> Branch pushed. Want me to open a PR against `main`?

If yes:
```bash
gh pr create --base main --head feat/telegram-structured-capture --title "feat(telegram): structured 2-step capture + on-demand duplicate check" --body "$(cat <<'EOF'
## Summary
- Replaces the single-step Telegram proposal with a destination chooser (Private/Public/Knowledge) + column picker for cards.
- Photo and voice messages ask "New vs Attach to existing" first.
- Optional duplicate check button runs FTS + Gemini Flash re-rank across visible cards and knowledge.
- Adds idempotent `cards.fts` generated column + GIN index.

Spec: docs/superpowers/specs/2026-05-11-telegram-structured-capture-design.md
Plan: docs/superpowers/plans/2026-05-11-telegram-structured-capture.md

## Test plan
- [ ] `cd server && npm test` clean
- [ ] DM text → destination + column flow
- [ ] DM URL → default Knowledge
- [ ] Group message → Public default
- [ ] Photo → New path works
- [ ] Photo → Attach to recent works
- [ ] Photo → Attach with filter reply works
- [ ] Voice → same flows
- [ ] 🔍 Check duplicates surfaces correct matches
- [ ] Link-to-existing skips card creation

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

**Spec coverage:**
- §4.1 text state machine → Task 6 (keyboards) + Task 7 (handlers + finalize)
- §4.2 photo flow → Task 8
- §4.3 voice flow → Task 9
- §4.4 duplicate check → Task 6 (keyboards) + Task 7 (runDuplicateCheck + dup callbacks)
- §5 component touch points → Tasks 1–9
- §6.1 PendingProposal extensions → Task 4
- §6.2 default destination → Task 5
- §6.3 keyboards → Task 6
- §6.4 FTS helpers → Task 2
- §6.5 re-rank → Task 3
- §6.6 schema migration → Task 1
- §6.7 tests → Tasks 1, 2, 3, 5 (keyboard/handler integration left to manual smoke per existing project posture)
- §7 risks → mitigations included (idempotent migration, timeout fallback, callback_data size, TTL bumped)
- §8 verification → Task 7 step 8, Task 8 step 7, Task 9 step 4, Task 10 step 3
- §9 done state → Task 10

**Placeholder scan:** clean. Every step has concrete code or commands.

**Type consistency:** `Destination` defined once in `proposals.ts`, imported elsewhere. `Status` reused from existing `cards.ts`. `Candidate` defined in `ai/dedupe.ts`. `DupCandidate` on the pending proposal mirrors `RankedMatch` (same fields).

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-11-telegram-structured-capture.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review, fast iteration

**2. Inline Execution** — execute tasks in this session, batched checkpoints

Which approach?
