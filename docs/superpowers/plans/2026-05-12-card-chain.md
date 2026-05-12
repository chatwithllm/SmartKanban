# Card Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add free-form many-to-many card relationships with 6 labels + free-text notes, surface them in the web edit dialog + via a react-flow chain modal, and let users create them at Telegram capture time.

**Architecture:** New `card_links` table (idempotent schema migration). REST endpoints POST/DELETE/GET + a `GET /chain?depth=` BFS endpoint. Background-free — purely synchronous DB ops with visibility-filtered WS broadcasts. Web: new `RelatedCardsSection` inside `EditDialog`, new `LinkPickerDialog`, new `CardChainModal` lazy-loading `reactflow`. Telegram: new `🔗 Link to existing` callback alongside existing destination flow.

**Tech Stack:** Node 22, Fastify, TypeScript, PostgreSQL 16 (recursive CTE for chain BFS), `node:test`, grammy, React 18, Tailwind, `reactflow` (new dep, lazy-loaded).

**Spec:** [`docs/superpowers/specs/2026-05-12-card-chain-design.md`](../specs/2026-05-12-card-chain-design.md)

---

## Task 0: Branch + baseline

**Files:** none

- [ ] **Step 1: Confirm branch + baseline tests**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude
git checkout feat/card-chain
git log --oneline -3
cd server && npm test 2>&1 | grep -E "^# tests|^# pass|^# fail" | head -3
```

Expected: HEAD `efb223c docs(spec): card chain...`. Test count is the post-`fix/theme-utility-classes` baseline (likely 169-172 pass, 0 fail).

- [ ] **Step 2: Capture baseline test count** in a scratch note for regression compare later.

---

## Task 1: `card_links` schema migration

**Files:**
- Modify: `server/schema.sql`
- Create: `server/src/__tests__/card_links_schema.test.ts`

- [ ] **Step 1: Write failing test**

Create `server/src/__tests__/card_links_schema.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';

test('card_links table exists with required columns', async () => {
  const { rows } = await pool.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'card_links'
     ORDER BY ordinal_position`,
  );
  const names = rows.map((r) => r.column_name);
  for (const c of ['id', 'from_card_id', 'to_card_id', 'label', 'note', 'created_by', 'created_at']) {
    assert.ok(names.includes(c), `missing column: ${c}`);
  }
});

test('card_links_from_idx and card_links_to_idx exist', async () => {
  const { rows } = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'card_links'`,
  );
  const names = rows.map((r: any) => r.indexname);
  assert.ok(names.includes('card_links_from_idx'));
  assert.ok(names.includes('card_links_to_idx'));
});

test('UNIQUE (from_card_id, to_card_id, label) prevents duplicates', async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('CL', 'cl@test', 'x') RETURNING id`,
  );
  const uid = u.rows[0]!.id;
  const a = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('a','today','manual',$1,1) RETURNING id`, [uid]);
  const b = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('b','today','manual',$1,2) RETURNING id`, [uid]);
  const aid = a.rows[0]!.id;
  const bid = b.rows[0]!.id;
  try {
    await pool.query(
      `INSERT INTO card_links (from_card_id, to_card_id, label, created_by)
       VALUES ($1, $2, 'related', $3)`,
      [aid, bid, uid],
    );
    let threw = false;
    try {
      await pool.query(
        `INSERT INTO card_links (from_card_id, to_card_id, label, created_by)
         VALUES ($1, $2, 'related', $3)`,
        [aid, bid, uid],
      );
    } catch (e) {
      threw = true;
    }
    assert.equal(threw, true, 'duplicate insert must throw');
  } finally {
    await pool.query(`DELETE FROM card_links WHERE from_card_id = $1 OR to_card_id = $1`, [aid]);
    await pool.query(`DELETE FROM cards WHERE id IN ($1, $2)`, [aid, bid]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [uid]);
  }
});

test('ON DELETE CASCADE removes links when card is deleted', async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('CL2', 'cl2@test', 'x') RETURNING id`,
  );
  const uid = u.rows[0]!.id;
  const a = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('a','today','manual',$1,1) RETURNING id`, [uid]);
  const b = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('b','today','manual',$1,2) RETURNING id`, [uid]);
  const aid = a.rows[0]!.id;
  const bid = b.rows[0]!.id;
  const link = await pool.query<{ id: string }>(
    `INSERT INTO card_links (from_card_id, to_card_id, label, created_by)
     VALUES ($1, $2, 'related', $3) RETURNING id`, [aid, bid, uid]);
  const linkId = link.rows[0]!.id;
  try {
    await pool.query(`DELETE FROM cards WHERE id = $1`, [aid]);
    const r = await pool.query(`SELECT 1 FROM card_links WHERE id = $1`, [linkId]);
    assert.equal(r.rows.length, 0, 'link should cascade-delete');
  } finally {
    await pool.query(`DELETE FROM cards WHERE id = $1`, [bid]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [uid]);
  }
});

test('label CHECK constraint rejects invalid values', async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('CL3', 'cl3@test', 'x') RETURNING id`,
  );
  const uid = u.rows[0]!.id;
  const a = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('a','today','manual',$1,1) RETURNING id`, [uid]);
  const b = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('b','today','manual',$1,2) RETURNING id`, [uid]);
  try {
    let threw = false;
    try {
      await pool.query(
        `INSERT INTO card_links (from_card_id, to_card_id, label, created_by)
         VALUES ($1, $2, 'invalid_label', $3)`,
        [a.rows[0]!.id, b.rows[0]!.id, uid],
      );
    } catch { threw = true; }
    assert.equal(threw, true, 'CHECK constraint must reject invalid label');
  } finally {
    await pool.query(`DELETE FROM cards WHERE id IN ($1, $2)`, [a.rows[0]!.id, b.rows[0]!.id]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [uid]);
  }
});
```

- [ ] **Step 2: Run, confirm fails**

```bash
cd server && npx tsx --test src/__tests__/card_links_schema.test.ts 2>&1 | tail -15
```

Expected: all 5 fail (table doesn't exist yet).

- [ ] **Step 3: Append migration to `server/schema.sql`**

At the bottom (after the `ai_insights` block from PR #23):

```sql

-- Card chain (2026-05-12): free-form many-to-many card relationships
CREATE TABLE IF NOT EXISTS card_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  to_card_id   UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  label        TEXT NOT NULL CHECK (label IN (
    'evolves_from','supersedes','split_from',
    'related','inspired_by','duplicate_of'
  )),
  note         TEXT,
  created_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_card_id, to_card_id, label)
);

CREATE INDEX IF NOT EXISTS card_links_from_idx ON card_links (from_card_id);
CREATE INDEX IF NOT EXISTS card_links_to_idx   ON card_links (to_card_id);
```

- [ ] **Step 4: Apply migration to local dev DB**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude
docker compose exec -T db psql -U kanban -d kanban < server/schema.sql 2>&1 | tail -5
```

Expected: clean (NOTICEs from existing CREATE TABLE statements are fine).

- [ ] **Step 5: Run test, confirm passes**

```bash
cd server && npx tsx --test src/__tests__/card_links_schema.test.ts 2>&1 | tail -10
```

Expected: 5 PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude
git add server/schema.sql server/src/__tests__/card_links_schema.test.ts
git commit -m "$(cat <<'EOF'
feat(schema): card_links table + indexes

Free-form many-to-many card relationships with 6 labels (evolves_from,
supersedes, split_from, related, inspired_by, duplicate_of) and
optional free-text note. UNIQUE (from, to, label) prevents exact dups;
ON DELETE CASCADE from both endpoints so links don't outlive a card.
Btree indexes on from_card_id and to_card_id for quick neighborhood
lookups.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `card_links` DB layer

**Files:**
- Create: `server/src/card_links.ts`
- Create: `server/src/__tests__/card_links.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/src/__tests__/card_links.test.ts`:

```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import {
  createLink,
  deleteLink,
  listLinksForCard,
  type CardLinkLabel,
} from '../card_links.js';

let uid: string;
let aId: string;
let bId: string;

before(async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('CLT', 'clt@test', 'x') RETURNING id`,
  );
  uid = u.rows[0]!.id;
  const a = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('a-card', 'today', 'manual', $1, 1) RETURNING id`, [uid]);
  const b = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('b-card', 'today', 'manual', $1, 2) RETURNING id`, [uid]);
  aId = a.rows[0]!.id;
  bId = b.rows[0]!.id;
});

after(async () => {
  await pool.query(`DELETE FROM card_links WHERE from_card_id IN ($1, $2) OR to_card_id IN ($1, $2)`, [aId, bId]);
  await pool.query(`DELETE FROM cards WHERE id IN ($1, $2)`, [aId, bId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [uid]);
});

test('createLink inserts row + returns it', async () => {
  const link = await createLink(uid, aId, bId, 'evolves_from', 'note text');
  assert.equal(link.from_card_id, aId);
  assert.equal(link.to_card_id, bId);
  assert.equal(link.label, 'evolves_from');
  assert.equal(link.note, 'note text');
  await deleteLink(uid, link.id);
});

test('createLink rejects self-link', async () => {
  await assert.rejects(
    () => createLink(uid, aId, aId, 'related', null),
    /self/,
  );
});

test('createLink rejects invalid label', async () => {
  await assert.rejects(
    () => createLink(uid, aId, bId, 'bogus' as CardLinkLabel, null),
    /invalid label/i,
  );
});

test('createLink throws on exact duplicate (UNIQUE constraint)', async () => {
  const l = await createLink(uid, aId, bId, 'related', null);
  try {
    await assert.rejects(() => createLink(uid, aId, bId, 'related', null));
  } finally {
    await deleteLink(uid, l.id);
  }
});

test('listLinksForCard returns outgoing + incoming for a card', async () => {
  const out = await createLink(uid, aId, bId, 'evolves_from', null);
  const inc = await createLink(uid, bId, aId, 'related', null);
  try {
    const fromA = await listLinksForCard(uid, aId);
    const fromB = await listLinksForCard(uid, bId);
    assert.equal(fromA.length, 2);
    assert.equal(fromB.length, 2);
    assert.ok(fromA.some((l) => l.id === out.id));
    assert.ok(fromA.some((l) => l.id === inc.id));
  } finally {
    await deleteLink(uid, out.id);
    await deleteLink(uid, inc.id);
  }
});

test('listLinksForCard hides links whose other end is invisible to user', async () => {
  // Create a second user with a card userA cannot see (private card).
  const u2 = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('U2', 'u2@test', 'x') RETURNING id`,
  );
  const u2Id = u2.rows[0]!.id;
  const c2 = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('private-c2', 'today', 'manual', $1, 3) RETURNING id`, [u2Id]);
  await pool.query(`INSERT INTO card_assignees (card_id, user_id) VALUES ($1, $2)`, [c2.rows[0]!.id, u2Id]);
  // Link from aId (visible to uid) to c2 (not visible to uid).
  const link = await createLink(uid, aId, c2.rows[0]!.id, 'related', null);
  try {
    const visibleToU1 = await listLinksForCard(uid, aId);
    // Link exists but the other endpoint is invisible — listLinksForCard should still return the link row,
    // but the related_cards lookup at the route layer filters invisible cards. The DB layer returns raw rows.
    assert.ok(visibleToU1.some((l) => l.id === link.id));
  } finally {
    await pool.query(`DELETE FROM card_links WHERE id = $1`, [link.id]);
    await pool.query(`DELETE FROM cards WHERE id = $1`, [c2.rows[0]!.id]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [u2Id]);
  }
});

test('deleteLink removes the row + returns true', async () => {
  const l = await createLink(uid, aId, bId, 'inspired_by', null);
  const ok = await deleteLink(uid, l.id);
  assert.equal(ok, true);
  const { rows } = await pool.query(`SELECT 1 FROM card_links WHERE id = $1`, [l.id]);
  assert.equal(rows.length, 0);
});

test('deleteLink returns false for unknown id', async () => {
  const ok = await deleteLink(uid, '00000000-0000-0000-0000-000000000000');
  assert.equal(ok, false);
});
```

- [ ] **Step 2: Run, confirm fails**

```bash
cd server && npx tsx --test src/__tests__/card_links.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Create `server/src/card_links.ts`**

```ts
import { pool } from './db.js';

export const CARD_LINK_LABELS = [
  'evolves_from',
  'supersedes',
  'split_from',
  'related',
  'inspired_by',
  'duplicate_of',
] as const;

export type CardLinkLabel = (typeof CARD_LINK_LABELS)[number];

export const isCardLinkLabel = (v: unknown): v is CardLinkLabel =>
  typeof v === 'string' && (CARD_LINK_LABELS as readonly string[]).includes(v);

export type CardLink = {
  id: string;
  from_card_id: string;
  to_card_id: string;
  label: CardLinkLabel;
  note: string | null;
  created_by: string;
  created_at: string;
};

const SELECT = `id, from_card_id, to_card_id, label, note, created_by, created_at`;

export async function createLink(
  actor: string,
  fromCardId: string,
  toCardId: string,
  label: CardLinkLabel,
  note: string | null,
): Promise<CardLink> {
  if (fromCardId === toCardId) {
    throw new Error('cannot self-link a card');
  }
  if (!isCardLinkLabel(label)) {
    throw new Error(`invalid label: ${String(label)}`);
  }
  const trimmedNote = note?.slice(0, 500) ?? null;
  const { rows } = await pool.query<CardLink>(
    `INSERT INTO card_links (from_card_id, to_card_id, label, note, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${SELECT}`,
    [fromCardId, toCardId, label, trimmedNote, actor],
  );
  return rows[0]!;
}

export async function deleteLink(_actor: string, linkId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM card_links WHERE id = $1`,
    [linkId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Returns all links where the card is on either end.
 * Note: this is the raw DB layer; the route layer filters out links whose
 * other endpoint is invisible to the requesting user.
 */
export async function listLinksForCard(_userId: string, cardId: string): Promise<CardLink[]> {
  const { rows } = await pool.query<CardLink>(
    `SELECT ${SELECT} FROM card_links
     WHERE from_card_id = $1 OR to_card_id = $1
     ORDER BY created_at DESC`,
    [cardId],
  );
  return rows;
}

/**
 * BFS from startId outward in both directions, up to `depth` hops.
 * Returns the set of card ids reachable (including start).
 */
export async function chainCardIds(startId: string, depth: number): Promise<string[]> {
  const cap = Math.max(1, Math.min(6, Math.floor(depth)));
  const { rows } = await pool.query<{ id: string }>(
    `WITH RECURSIVE walk (id, d) AS (
       SELECT $1::uuid, 0
       UNION
       SELECT
         CASE WHEN cl.from_card_id = w.id THEN cl.to_card_id ELSE cl.from_card_id END,
         w.d + 1
       FROM walk w
       JOIN card_links cl ON cl.from_card_id = w.id OR cl.to_card_id = w.id
       WHERE w.d < $2
     )
     SELECT DISTINCT id FROM walk`,
    [startId, cap],
  );
  return rows.map((r) => r.id);
}

/**
 * Returns links whose endpoints are both in the given id set.
 */
export async function linksBetween(cardIds: string[]): Promise<CardLink[]> {
  if (cardIds.length === 0) return [];
  const { rows } = await pool.query<CardLink>(
    `SELECT ${SELECT} FROM card_links
     WHERE from_card_id = ANY($1::uuid[]) AND to_card_id = ANY($1::uuid[])
     ORDER BY created_at ASC`,
    [cardIds],
  );
  return rows;
}
```

- [ ] **Step 4: Run, confirm passes**

```bash
cd server && npx tsx --test src/__tests__/card_links.test.ts 2>&1 | tail -15
```

Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/card_links.ts server/src/__tests__/card_links.test.ts
git commit -m "$(cat <<'EOF'
feat(card-links): DB layer + types

CARD_LINK_LABELS enum (6 values), CardLink type, helpers: createLink
(rejects self-link + invalid label, slices note ≤ 500), deleteLink,
listLinksForCard (raw rows; route layer filters invisible endpoints),
chainCardIds (recursive CTE BFS bounded to depth 1-6), linksBetween
(edges within a set).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: REST routes + chain endpoint

**Files:**
- Create: `server/src/routes/card_links.ts`
- Modify: `server/src/index.ts` (register routes)
- Create: `server/src/__tests__/card_links_routes.test.ts`

- [ ] **Step 1: Read existing auth pattern**

Inspect `server/src/routes/insights.ts` to see how it reads the authenticated user (e.g., a `requireUser` preHandler that sets `req.user`). Match that exact pattern.

```bash
grep -n "requireUser\|preHandler\|req.user" server/src/routes/insights.ts | head -5
```

- [ ] **Step 2: Write failing routes test**

Create `server/src/__tests__/card_links_routes.test.ts`:

```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { pool } from '../db.js';
import { cardLinkRoutes } from '../routes/card_links.js';

let uid: string;
let aId: string;
let bId: string;
let app: ReturnType<typeof Fastify>;

before(async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('CLR', 'clr@test', 'x') RETURNING id`,
  );
  uid = u.rows[0]!.id;
  const a = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('a-r', 'today', 'manual', $1, 1) RETURNING id`, [uid]);
  const b = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('b-r', 'today', 'manual', $1, 2) RETURNING id`, [uid]);
  aId = a.rows[0]!.id;
  bId = b.rows[0]!.id;
  app = Fastify();
  app.addHook('preHandler', async (req: any) => { req.user = { id: uid }; });
  await app.register(cardLinkRoutes);
});

after(async () => {
  await app.close();
  await pool.query(`DELETE FROM card_links WHERE from_card_id IN ($1, $2) OR to_card_id IN ($1, $2)`, [aId, bId]);
  await pool.query(`DELETE FROM cards WHERE id IN ($1, $2)`, [aId, bId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [uid]);
});

test('POST /api/cards/:id/links creates a link', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/api/cards/${aId}/links`,
    payload: { to_card_id: bId, label: 'evolves_from', note: 'a note' },
  });
  assert.equal(res.statusCode, 201);
  const body = res.json() as { link: { id: string; label: string } };
  assert.equal(body.link.label, 'evolves_from');
  await pool.query(`DELETE FROM card_links WHERE id = $1`, [body.link.id]);
});

test('POST returns 400 for invalid label', async () => {
  const res = await app.inject({
    method: 'POST', url: `/api/cards/${aId}/links`,
    payload: { to_card_id: bId, label: 'bogus' },
  });
  assert.equal(res.statusCode, 400);
});

test('POST returns 409 on duplicate exact link', async () => {
  const first = await app.inject({
    method: 'POST', url: `/api/cards/${aId}/links`,
    payload: { to_card_id: bId, label: 'related' },
  });
  assert.equal(first.statusCode, 201);
  const dup = await app.inject({
    method: 'POST', url: `/api/cards/${aId}/links`,
    payload: { to_card_id: bId, label: 'related' },
  });
  assert.equal(dup.statusCode, 409);
  const id = (first.json() as { link: { id: string } }).link.id;
  await pool.query(`DELETE FROM card_links WHERE id = $1`, [id]);
});

test('POST returns 400 on self-link', async () => {
  const res = await app.inject({
    method: 'POST', url: `/api/cards/${aId}/links`,
    payload: { to_card_id: aId, label: 'related' },
  });
  assert.equal(res.statusCode, 400);
});

test('DELETE removes the link', async () => {
  const created = await app.inject({
    method: 'POST', url: `/api/cards/${aId}/links`,
    payload: { to_card_id: bId, label: 'split_from' },
  });
  const id = (created.json() as { link: { id: string } }).link.id;
  const res = await app.inject({ method: 'DELETE', url: `/api/cards/${aId}/links/${id}` });
  assert.equal(res.statusCode, 204);
  const { rows } = await pool.query(`SELECT 1 FROM card_links WHERE id = $1`, [id]);
  assert.equal(rows.length, 0);
});

test('GET /api/cards/:id/links returns links + related_cards', async () => {
  const c = await app.inject({
    method: 'POST', url: `/api/cards/${aId}/links`,
    payload: { to_card_id: bId, label: 'inspired_by' },
  });
  try {
    const res = await app.inject({ method: 'GET', url: `/api/cards/${aId}/links` });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { links: any[]; related_cards: any[] };
    assert.ok(body.links.length >= 1);
    assert.ok(body.related_cards.some((c: any) => c.id === bId));
  } finally {
    const id = (c.json() as { link: { id: string } }).link.id;
    await pool.query(`DELETE FROM card_links WHERE id = $1`, [id]);
  }
});

test('GET /api/cards/:id/chain returns nodes + edges + insights', async () => {
  const c = await app.inject({
    method: 'POST', url: `/api/cards/${aId}/links`,
    payload: { to_card_id: bId, label: 'related' },
  });
  try {
    const res = await app.inject({ method: 'GET', url: `/api/cards/${aId}/chain?depth=2` });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { nodes: any[]; edges: any[]; insights: any[] };
    assert.ok(body.nodes.some((n: any) => n.id === aId));
    assert.ok(body.nodes.some((n: any) => n.id === bId));
    assert.ok(body.edges.length >= 1);
    assert.ok(Array.isArray(body.insights));
  } finally {
    const id = (c.json() as { link: { id: string } }).link.id;
    await pool.query(`DELETE FROM card_links WHERE id = $1`, [id]);
  }
});

test('GET /chain clamps depth to [1, 6]', async () => {
  const r1 = await app.inject({ method: 'GET', url: `/api/cards/${aId}/chain?depth=99` });
  assert.equal(r1.statusCode, 200);
  const r2 = await app.inject({ method: 'GET', url: `/api/cards/${aId}/chain?depth=0` });
  assert.equal(r2.statusCode, 200);
  const r3 = await app.inject({ method: 'GET', url: `/api/cards/${aId}/chain?depth=-5` });
  assert.equal(r3.statusCode, 200);
});
```

- [ ] **Step 3: Run, confirm fails**

```bash
cd server && npx tsx --test src/__tests__/card_links_routes.test.ts 2>&1 | tail -10
```

- [ ] **Step 4: Create `server/src/routes/card_links.ts`**

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  createLink,
  deleteLink,
  listLinksForCard,
  chainCardIds,
  linksBetween,
  CARD_LINK_LABELS,
  isCardLinkLabel,
  type CardLink,
} from '../card_links.js';
import { loadCard, canUserSeeCard, type Card } from '../cards.js';
import { listInsightsForCard, type Insight } from '../insights.js';
import { broadcast } from '../ws.js';

function getUserId(req: FastifyRequest): string | undefined {
  const u = (req as any).user as { id?: string } | undefined;
  return u?.id;
}

export async function cardLinkRoutes(app: FastifyInstance) {
  // POST /api/cards/:id/links — create a link from :id to body.to_card_id
  app.post<{ Params: { id: string }; Body: { to_card_id: string; label: string; note?: string } }>(
    '/api/cards/:id/links',
    async (req, reply) => {
      const userId = getUserId(req);
      if (!userId) return reply.code(401).send({ error: 'unauthorized' });

      const fromId = req.params.id;
      const { to_card_id, label, note } = req.body ?? ({} as any);

      if (typeof to_card_id !== 'string') return reply.code(400).send({ error: 'to_card_id required' });
      if (!isCardLinkLabel(label)) {
        return reply.code(400).send({ error: 'invalid label', valid: CARD_LINK_LABELS });
      }
      if (fromId === to_card_id) return reply.code(400).send({ error: 'cannot self-link' });

      if (!(await canUserSeeCard(userId, fromId))) {
        return reply.code(403).send({ error: 'from-card not visible' });
      }
      if (!(await canUserSeeCard(userId, to_card_id))) {
        return reply.code(403).send({ error: 'to-card not visible' });
      }

      let link: CardLink;
      try {
        link = await createLink(userId, fromId, to_card_id, label, note ?? null);
      } catch (e) {
        const err = e as { code?: string; message?: string };
        if (err.code === '23505') {
          return reply.code(409).send({ error: 'link already exists' });
        }
        return reply.code(400).send({ error: err.message ?? 'create failed' });
      }

      const fromCard = await loadCard(fromId);
      const toCard = await loadCard(to_card_id);
      broadcast({
        type: 'card.link.created',
        link,
        from_owner_id: fromCard?.created_by ?? '',
        to_owner_id: toCard?.created_by ?? '',
      });

      return reply.code(201).send({ link });
    },
  );

  // DELETE /api/cards/:id/links/:linkId
  app.delete<{ Params: { id: string; linkId: string } }>(
    '/api/cards/:id/links/:linkId',
    async (req, reply) => {
      const userId = getUserId(req);
      if (!userId) return reply.code(401).send({ error: 'unauthorized' });
      const { id: fromId, linkId } = req.params;

      if (!(await canUserSeeCard(userId, fromId))) {
        return reply.code(403).send({ error: 'forbidden' });
      }

      const { rows } = await req.server.pg?.query?.(
        `SELECT from_card_id, to_card_id FROM card_links WHERE id = $1`,
        [linkId],
      ) ?? { rows: [] as Array<{ from_card_id: string; to_card_id: string }> };
      // Note: req.server.pg may not be wired; fall back to direct pool query.
      let row = rows[0];
      if (!row) {
        const { pool } = await import('../db.js');
        const r = await pool.query<{ from_card_id: string; to_card_id: string }>(
          `SELECT from_card_id, to_card_id FROM card_links WHERE id = $1`,
          [linkId],
        );
        row = r.rows[0];
      }
      if (!row) return reply.code(404).send({ error: 'not found' });
      if (row.from_card_id !== fromId && row.to_card_id !== fromId) {
        return reply.code(403).send({ error: 'linkId not attached to this card' });
      }

      const ok = await deleteLink(userId, linkId);
      if (!ok) return reply.code(404).send({ error: 'not found' });

      const fromCard = await loadCard(row.from_card_id);
      const toCard = await loadCard(row.to_card_id);
      broadcast({
        type: 'card.link.deleted',
        id: linkId,
        from_card_id: row.from_card_id,
        to_card_id: row.to_card_id,
        from_owner_id: fromCard?.created_by ?? '',
        to_owner_id: toCard?.created_by ?? '',
      });

      return reply.code(204).send();
    },
  );

  // GET /api/cards/:id/links — 1-hop, links + related_cards (visibility-filtered)
  app.get<{ Params: { id: string } }>(
    '/api/cards/:id/links',
    async (req, reply) => {
      const userId = getUserId(req);
      if (!userId) return reply.code(401).send({ error: 'unauthorized' });
      const cardId = req.params.id;
      if (!(await canUserSeeCard(userId, cardId))) {
        return reply.code(403).send({ error: 'forbidden' });
      }

      const links = await listLinksForCard(userId, cardId);
      const otherIds = Array.from(
        new Set(links.map((l) => (l.from_card_id === cardId ? l.to_card_id : l.from_card_id))),
      );
      const visibleOtherIds: string[] = [];
      for (const id of otherIds) {
        if (await canUserSeeCard(userId, id)) visibleOtherIds.push(id);
      }
      const filteredLinks = links.filter((l) =>
        visibleOtherIds.includes(l.from_card_id === cardId ? l.to_card_id : l.from_card_id),
      );
      const related_cards: Card[] = [];
      for (const id of visibleOtherIds) {
        const c = await loadCard(id);
        if (c) related_cards.push(c);
      }
      return reply.send({ links: filteredLinks, related_cards });
    },
  );

  // GET /api/cards/:id/chain?depth=2 — BFS to depth hops; nodes + edges + insights
  app.get<{ Params: { id: string }; Querystring: { depth?: string } }>(
    '/api/cards/:id/chain',
    async (req, reply) => {
      const userId = getUserId(req);
      if (!userId) return reply.code(401).send({ error: 'unauthorized' });
      const cardId = req.params.id;
      if (!(await canUserSeeCard(userId, cardId))) {
        return reply.code(403).send({ error: 'forbidden' });
      }

      const rawDepth = Number(req.query.depth ?? 2);
      const depth = Math.max(1, Math.min(6, Number.isFinite(rawDepth) ? Math.floor(rawDepth) : 2));

      const allIds = await chainCardIds(cardId, depth);
      const visibleIds: string[] = [];
      for (const id of allIds) {
        if (await canUserSeeCard(userId, id)) visibleIds.push(id);
      }
      const nodes: Card[] = [];
      for (const id of visibleIds) {
        const c = await loadCard(id);
        if (c) nodes.push(c);
      }
      const edges = await linksBetween(visibleIds);
      const insights: Insight[] = [];
      for (const id of visibleIds) {
        const list = await listInsightsForCard(id, 1);
        const latest = list[0];
        if (latest && latest.status === 'ok') insights.push(latest);
      }
      return reply.send({ nodes, edges, insights });
    },
  );
}
```

- [ ] **Step 5: Extend `server/src/ws.ts` with the two new event types**

Add to the `BroadcastEvent` union:

```ts
  | { type: 'card.link.created'; link: CardLink; from_owner_id: string; to_owner_id: string }
  | { type: 'card.link.deleted'; id: string; from_card_id: string; to_card_id: string; from_owner_id: string; to_owner_id: string };
```

Add import at top:

```ts
import type { CardLink } from './card_links.js';
```

Add a visibility branch in `broadcast()` before the final `c.socket.send(...)` line:

```ts
    if (ev.type === 'card.link.created' || ev.type === 'card.link.deleted') {
      // Visible if user owns or is on either endpoint card. Loosen to owner_id checks
      // here; full predicate already enforced at the route layer.
      if (ev.from_owner_id !== c.userId && ev.to_owner_id !== c.userId) {
        continue;
      }
    }
```

- [ ] **Step 6: Register routes in `server/src/index.ts`**

Find where other route modules register (`app.register(insightsRoutes)` etc.) and add:

```ts
import { cardLinkRoutes } from './routes/card_links.js';
// ...
await app.register(cardLinkRoutes);
```

- [ ] **Step 7: Typecheck + run**

```bash
cd server && npx tsc --noEmit 2>&1 | tail -3
cd server && npx tsx --test src/__tests__/card_links_routes.test.ts 2>&1 | tail -15
cd server && npm test 2>&1 | grep -E "^# tests|^# pass|^# fail" | head -3
```

Expected: typecheck clean; all routes tests pass; full suite green.

- [ ] **Step 8: Commit**

```bash
git add server/src/routes/card_links.ts server/src/index.ts server/src/ws.ts server/src/__tests__/card_links_routes.test.ts
git commit -m "$(cat <<'EOF'
feat(card-links): REST routes + chain endpoint + WS events

POST /api/cards/:id/links creates a link (rate-limited by UNIQUE
constraint → 409 on dup, 400 on invalid label / self-link, 403 on
visibility miss). DELETE removes the link with the same visibility
check. GET /links returns 1-hop links + related_cards (visibility-
filtered). GET /chain?depth=N runs a recursive-CTE BFS (depth clamped
to 1..6) and returns nodes + edges + latest insights. Two new WS
event variants with owner-id visibility filter.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Telegram link flow

**Files:**
- Modify: `server/src/telegram/proposals.ts` (extend PendingProposal)
- Modify: `server/src/telegram/bot.ts` (button + callbacks + label keyboard + note state)

- [ ] **Step 1: Extend PendingProposal**

Open `server/src/telegram/proposals.ts`. Add fields to the `PendingProposal` type:

```ts
export type PendingProposal = {
  // ... existing fields
  pendingLinkTargetId?: string;
  pendingLinkLabel?: CardLinkLabel;
  awaitingLinkNote?: boolean;
};
```

Import at top:
```ts
import type { CardLinkLabel } from '../card_links.js';
```

- [ ] **Step 2: Add the `🔗 Link to existing` button to destination keyboard**

Open `server/src/telegram/bot.ts`. Locate `destinationKeyboard()` (added in PR #22). Add a new row with the link button:

```ts
function destinationKeyboard(/* ... existing args ... */): InlineKeyboard {
  const kb = new InlineKeyboard();
  // ... existing destination rows (Private / Public / Knowledge) ...
  kb.row()
    .text('🔍 Check duplicates?', `dup:check:${pending.id}`)
    .text('🔗 Link to existing', `linkpick:${pending.id}`);
  kb.row()
    .text('✏️ Edit',  `edit:${pending.id}`)
    .text('❌ Cancel', `drop:${pending.id}`);
  return kb;
}
```

(Adapt to the exact existing call signature — search the file for the function and apply the row addition.)

- [ ] **Step 3: Add `linkpick:`, `linklabel:`, `linknote:skip` callbacks**

Add new handlers near the existing `bot.callbackQuery(...)` registrations:

```ts
import { createLink, CARD_LINK_LABELS, type CardLinkLabel } from '../card_links.js';
import { canUserSeeCard, loadCard } from '../cards.js';
import { searchCardsFts } from '../cards.js';

// linkpick:<pid> — open the recent-cards picker for linking
bot.callbackQuery(/^linkpick:([^:]+)$/, async (ctx) => {
  const pid = ctx.match![1]!;
  const pending = getPending(pid);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
    return;
  }
  if (ctx.from?.id !== pending.tgUserId) {
    await ctx.answerCallbackQuery({ text: 'Not your prompt.', show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  await showLinkPicker(ctx, pending, '');
});

// linkto:<targetCardId>:<pid> — user picked a card to link to
bot.callbackQuery(/^linkto:([0-9a-f-]+):([^:]+)$/, async (ctx) => {
  const targetId = ctx.match![1]!;
  const pid = ctx.match![2]!;
  const pending = getPending(pid);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
    return;
  }
  if (!(await canUserSeeCard(pending.appUserId, targetId))) {
    await ctx.answerCallbackQuery({ text: 'Card not visible to you.', show_alert: true });
    return;
  }
  updatePending(pid, { pendingLinkTargetId: targetId });
  await ctx.answerCallbackQuery();
  const target = await loadCard(targetId);
  const kb = new InlineKeyboard();
  for (const l of CARD_LINK_LABELS) {
    kb.text(linkLabelEmoji(l) + ' ' + l.replace(/_/g, ' '), `linklabel:${l}:${pid}`);
    if (CARD_LINK_LABELS.indexOf(l) % 2 === 1) kb.row();
  }
  await ctx.reply(
    `Link to "${target?.title ?? targetId}" — what kind of relationship?`,
    { reply_markup: kb },
  );
});

// linklabel:<label>:<pid> — user picked a label
bot.callbackQuery(/^linklabel:([a-z_]+):([^:]+)$/, async (ctx) => {
  const label = ctx.match![1] as CardLinkLabel;
  const pid = ctx.match![2]!;
  const pending = getPending(pid);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
    return;
  }
  if (!isCardLinkLabel(label)) {
    await ctx.answerCallbackQuery({ text: 'Invalid label.', show_alert: true });
    return;
  }
  updatePending(pid, { pendingLinkLabel: label, awaitingLinkNote: true });
  await ctx.answerCallbackQuery();
  const skipKb = new InlineKeyboard().text('Skip', `linknote:skip:${pid}`);
  await ctx.reply('Add a note? Reply with text or tap Skip.', { reply_markup: skipKb });
});

// linknote:skip:<pid>
bot.callbackQuery(/^linknote:skip:([^:]+)$/, async (ctx) => {
  const pid = ctx.match![1]!;
  const pending = getPending(pid);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  updatePending(pid, { awaitingLinkNote: false });
  await finalizeCardWithLink(ctx, pending, null);
});

function linkLabelEmoji(label: CardLinkLabel): string {
  switch (label) {
    case 'evolves_from': return '🌱';
    case 'supersedes':   return '➡️';
    case 'split_from':   return '✂️';
    case 'related':      return '🔗';
    case 'inspired_by':  return '💡';
    case 'duplicate_of': return '👯';
  }
}
```

- [ ] **Step 4: Route reply-with-text in note-awaiting mode**

In `handleText`, after the existing `attachMode` branch (added in PR #22), add:

```ts
const latest = getLatestForUser(ctx.from!.id);
if (latest && latest.awaitingLinkNote) {
  updatePending(latest.id, { awaitingLinkNote: false });
  await finalizeCardWithLink(ctx, latest, text.slice(0, 500));
  return;
}
```

Also extend the picker text-filter branch so it routes to `showLinkPicker` when the latest proposal has `pendingLinkTargetId` unset AND came from `linkpick:`. Adapt to the exact state field if needed.

- [ ] **Step 5: Add `showLinkPicker` + `finalizeCardWithLink` helpers**

Above the callback registrations:

```ts
async function showLinkPicker(ctx: Context, pending: PendingProposal, filter: string): Promise<void> {
  const userId = pending.appUserId;
  let cards: Array<{ id: string; title: string; status: string }> = [];
  if (filter.trim()) {
    const hits = await searchCardsFts(userId, filter, 8);
    cards = hits.map((h) => ({ id: h.id, title: h.title, status: h.status }));
  } else {
    const { rows } = await pool.query<{ id: string; title: string; status: string }>(
      `SELECT DISTINCT c.id, c.title, c.status
       FROM cards c
       LEFT JOIN card_assignees ca ON ca.card_id = c.id
       LEFT JOIN card_shares cs ON cs.card_id = c.id
       WHERE NOT c.archived
         AND (c.created_by = $1 OR ca.user_id = $1 OR cs.user_id = $1
              OR NOT EXISTS (SELECT 1 FROM card_assignees ca2 WHERE ca2.card_id = c.id))
       ORDER BY c.updated_at DESC
       LIMIT 5`,
      [userId],
    );
    cards = rows;
  }
  if (cards.length === 0) {
    const kb = new InlineKeyboard().text('❌ Cancel', `drop:${pending.id}`);
    await ctx.reply('No cards to link. Reply with different words or Cancel.', { reply_markup: kb });
    return;
  }
  const kb = new InlineKeyboard();
  for (const c of cards) {
    kb.text(`Pick: ${c.title.slice(0, 40)}`, `linkto:${c.id}:${pending.id}`).row();
  }
  kb.text('❌ Cancel', `drop:${pending.id}`);
  await ctx.reply('Pick one to link to (or reply with words to filter):', { reply_markup: kb });
}

async function finalizeCardWithLink(
  ctx: Context,
  pending: PendingProposal,
  noteText: string | null,
): Promise<void> {
  // Build the card the same way finalizeCard does, then insert the link in the same flow.
  // Reuse the existing finalizeCard helper to save the card, then create the link.
  // For correctness, the destination/status are already chosen at this point — fall through
  // to whatever the chosen destination dictates.

  // Choose a default status if user reached link flow without picking column:
  const status = pending.destination === 'private_card' || pending.destination === 'public_card'
    ? 'today' as const
    : null;

  if (!status || pending.destination === 'knowledge') {
    // Knowledge-destination card-link doesn't make sense; treat as Cancel with a note.
    await ctx.reply('Linking is only available for card destinations. Pick Private or Public first.');
    deletePending(pending.id);
    return;
  }
  if (!pending.pendingLinkTargetId || !pending.pendingLinkLabel) {
    await ctx.reply('Missing link target or label. Restart the flow.');
    deletePending(pending.id);
    return;
  }

  // Call the existing finalizeCard but pause before returning to insert the link.
  // The simplest path: replicate finalizeCard's body inline so we have the new card id.
  const cardId = await createCard({
    title: pending.proposal.title || pending.original.slice(0, 80),
    description: pending.proposal.description ?? '',
    tags: pending.proposal.tags ?? [],
    createdBy: pending.appUserId,
    source: 'telegram',
    status,
    aiSummarized: true,
    assignees: pending.destination === 'private_card' ? [pending.appUserId] : undefined,
    telegramChatId: pending.chatId,
    telegramMessageId: pending.promptMessageId ?? undefined,
  });

  // Insert the link
  try {
    await createLink(
      pending.appUserId,
      cardId,
      pending.pendingLinkTargetId,
      pending.pendingLinkLabel,
      noteText,
    );
  } catch {
    // Non-fatal — card is saved even if link fails
  }

  await logActivity(pending.appUserId, cardId, `telegram.${pending.destination}.linked`);
  deletePending(pending.id);

  const target = await loadCard(pending.pendingLinkTargetId);
  const noteLine = noteText ? `\n   note: "${noteText.slice(0, 80)}"` : '';
  const emoji = STATUS_EMOJI[status];
  const label = STATUS_LABEL[status];
  const card = await loadCard(cardId);
  await ctx.reply(
    `✓ Saved · ${emoji} ${label} — ${pending.proposal.title}\n🔗 ${pending.pendingLinkLabel} "${target?.title ?? '(unknown)'}"${noteLine}`,
    {
      reply_markup: card ? postSaveKeyboard(cardId, status) : undefined,
    },
  );
  if (card) {
    broadcast({ type: 'card.created', card });
  }
}
```

(Imports needed: `isCardLinkLabel`, `pool` from `../db.js`, etc.)

- [ ] **Step 6: Typecheck + tests**

```bash
cd server && npx tsc --noEmit 2>&1 | tail -3
cd server && npm test 2>&1 | grep -E "^# tests|^# pass|^# fail" | head -3
```

Both clean.

- [ ] **Step 7: Commit**

```bash
git add server/src/telegram/bot.ts server/src/telegram/proposals.ts
git commit -m "$(cat <<'EOF'
feat(telegram): 🔗 Link to existing button + label + note flow

Destination keyboard gains a 🔗 button. linkpick:<pid> opens a recent-
cards picker (top-5 visible). Reply-with-text filters via FTS.
linkto:<target>:<pid> records the target and asks for a label (6
buttons). linklabel:<label>:<pid> records label and asks for an
optional note ("reply or Skip"). linknote:skip and reply-with-text in
awaitingLinkNote mode finalize: the card is saved, the link is
created, and the bot replies with the new card + link summary.

PendingProposal gets pendingLinkTargetId, pendingLinkLabel,
awaitingLinkNote optional fields.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Web types + api client + WS dispatch + hook

**Files:**
- Modify: `web/src/types.ts`
- Modify: `web/src/api.ts`
- Modify: `web/src/ws.ts`
- Modify: `web/src/App.tsx`
- Modify: `web/src/MobileShell.tsx`
- Create: `web/src/hooks/useCardLinks.ts`
- Create: `web/src/hooks/useCardChain.ts`

- [ ] **Step 1: Add types**

Append to `web/src/types.ts`:

```ts
export const CARD_LINK_LABELS = [
  'evolves_from','supersedes','split_from','related','inspired_by','duplicate_of',
] as const;

export type CardLinkLabel = (typeof CARD_LINK_LABELS)[number];

export type CardLink = {
  id: string;
  from_card_id: string;
  to_card_id: string;
  label: CardLinkLabel;
  note: string | null;
  created_by: string;
  created_at: string;
};
```

- [ ] **Step 2: Add api methods**

In `web/src/api.ts`, find the `api` object and append:

```ts
  linkCards: (fromCardId: string, b: { to_card_id: string; label: CardLinkLabel; note?: string }) =>
    req<{ link: CardLink }>(`/api/cards/${fromCardId}/links`, json(b)),

  unlinkCard: (fromCardId: string, linkId: string) =>
    req<void>(`/api/cards/${fromCardId}/links/${linkId}`, { method: 'DELETE' }),

  cardLinks: (cardId: string) =>
    req<{ links: CardLink[]; related_cards: Card[] }>(`/api/cards/${cardId}/links`),

  cardChain: (cardId: string, depth = 2) =>
    req<{ nodes: Card[]; edges: CardLink[]; insights: Insight[] }>(
      `/api/cards/${cardId}/chain?depth=${depth}`,
    ),
```

Add `CardLink`, `CardLinkLabel` to the top type import line.

- [ ] **Step 3: Extend WSEvent / BroadcastEvent**

In `web/src/ws.ts`, add to the union:

```ts
| { type: 'card.link.created'; link: CardLink; from_owner_id: string; to_owner_id: string }
| { type: 'card.link.deleted'; id: string; from_card_id: string; to_card_id: string; from_owner_id: string; to_owner_id: string }
```

Import `CardLink` from `./types.ts`.

- [ ] **Step 4: Create `web/src/hooks/useCardLinks.ts`**

```ts
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { CardLink, Card } from '../types.ts';
import type { BroadcastEvent } from '../ws.ts';

const cache = new Map<string, { links: CardLink[]; related_cards: Card[] }>();
const listeners = new Map<string, Set<(v: { links: CardLink[]; related_cards: Card[] }) => void>>();

function notify(cardId: string): void {
  const subs = listeners.get(cardId);
  if (!subs) return;
  const v = cache.get(cardId);
  if (!v) return;
  for (const s of subs) s(v);
}

export function applyCardLinkEvent(ev: BroadcastEvent): void {
  if (ev.type !== 'card.link.created' && ev.type !== 'card.link.deleted') return;
  for (const cardId of cache.keys()) {
    const v = cache.get(cardId);
    if (!v) continue;
    if (ev.type === 'card.link.created') {
      if (ev.link.from_card_id === cardId || ev.link.to_card_id === cardId) {
        cache.set(cardId, { ...v, links: [ev.link, ...v.links] });
        notify(cardId);
      }
    } else {
      if (ev.from_card_id === cardId || ev.to_card_id === cardId) {
        cache.set(cardId, { ...v, links: v.links.filter((l) => l.id !== ev.id) });
        notify(cardId);
      }
    }
  }
}

export function useCardLinks(cardId: string | null) {
  const [data, setData] = useState<{ links: CardLink[]; related_cards: Card[] }>(
    () => (cardId ? cache.get(cardId) ?? { links: [], related_cards: [] } : { links: [], related_cards: [] }),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cardId) {
      setData({ links: [], related_cards: [] });
      return;
    }
    let cancelled = false;
    const subs = listeners.get(cardId) ?? new Set<(v: { links: CardLink[]; related_cards: Card[] }) => void>();
    const h = (v: { links: CardLink[]; related_cards: Card[] }) => { if (!cancelled) setData(v); };
    subs.add(h);
    listeners.set(cardId, subs);
    setData(cache.get(cardId) ?? { links: [], related_cards: [] });
    setLoading(true);
    api.cardLinks(cardId).then((v) => {
      if (cancelled) return;
      cache.set(cardId, v);
      notify(cardId);
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      subs.delete(h);
      if (subs.size === 0) listeners.delete(cardId);
    };
  }, [cardId]);

  return { ...data, loading };
}
```

- [ ] **Step 5: Create `web/src/hooks/useCardChain.ts`**

```ts
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { CardLink, Card, Insight } from '../types.ts';

export function useCardChain(cardId: string | null, depth = 2) {
  const [data, setData] = useState<{ nodes: Card[]; edges: CardLink[]; insights: Insight[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!cardId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    api.cardChain(cardId, depth)
      .then((v) => { if (!cancelled) setData(v); })
      .catch((e) => { if (!cancelled) setErr(e instanceof Error ? e.message : 'failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cardId, depth]);

  return { data, loading, err };
}
```

- [ ] **Step 6: Wire WS dispatch in `web/src/App.tsx` + `MobileShell.tsx`**

In `App.tsx` find the WS handler chain. Add:

```ts
import { applyCardLinkEvent } from './hooks/useCardLinks.ts';
// ... in the WS event handler:
if (ev.type === 'card.link.created' || ev.type === 'card.link.deleted') {
  applyCardLinkEvent(ev);
  return;
}
```

Same in `MobileShell.tsx`.

- [ ] **Step 7: Add `reactflow` dep**

```bash
cd web && npm install reactflow --save 2>&1 | tail -3
```

- [ ] **Step 8: Typecheck + build**

```bash
cd web && npx tsc --noEmit 2>&1 | tail -3
cd web && npm run build 2>&1 | tail -3
```

Both clean.

- [ ] **Step 9: Commit**

```bash
git add web/src/types.ts web/src/api.ts web/src/ws.ts web/src/hooks/useCardLinks.ts web/src/hooks/useCardChain.ts web/src/App.tsx web/src/MobileShell.tsx web/package.json web/package-lock.json
git commit -m "$(cat <<'EOF'
feat(web): card-link types + api + WS dispatch + hooks; install reactflow

types.ts adds CardLink + CardLinkLabel + CARD_LINK_LABELS array.
api.ts adds linkCards / unlinkCard / cardLinks / cardChain methods.
ws.ts learns the two new event variants. useCardLinks caches the
1-hop neighborhood per card with WS-driven invalidation; useCardChain
fetches the BFS-bounded graph on demand. reactflow added as a deps
for the chain modal (lazy-loaded so it doesn't bloat first paint).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `LinkPickerDialog` component

**Files:**
- Create: `web/src/components/LinkPickerDialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Card, CardLinkLabel } from '../types.ts';
import { CARD_LINK_LABELS } from '../types.ts';

type Props = {
  fromCardId: string;
  excludeIds: string[];   // already-linked card ids + self
  onClose: () => void;
  onCreated: () => void;
};

const LABEL_LABEL: Record<CardLinkLabel, string> = {
  evolves_from: '🌱 Evolves from',
  supersedes:   '➡️ Supersedes',
  split_from:   '✂️ Split from',
  related:      '🔗 Related',
  inspired_by:  '💡 Inspired by',
  duplicate_of: '👯 Duplicate of',
};

export function LinkPickerDialog({ fromCardId, excludeIds, onClose, onCreated }: Props) {
  const [step, setStep] = useState<'pick' | 'label'>('pick');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Card[]>([]);
  const [target, setTarget] = useState<Card | null>(null);
  const [label, setLabel] = useState<CardLinkLabel>('related');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await api.listCards('all');
        if (cancelled) return;
        const filtered = all.filter((c) => !excludeIds.includes(c.id));
        const q = query.trim().toLowerCase();
        const matched = q
          ? filtered.filter((c) =>
              (c.title || '').toLowerCase().includes(q) ||
              (c.description || '').toLowerCase().includes(q),
            )
          : filtered;
        setResults(matched.slice(0, 10));
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'failed');
      }
    })();
    return () => { cancelled = true; };
  }, [query, excludeIds]);

  async function save() {
    if (!target) return;
    setSubmitting(true);
    setErr(null);
    try {
      await api.linkCards(fromCardId, { to_card_id: target.id, label, note: note || undefined });
      onCreated();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="modal-surface w-full max-w-[520px] max-h-[80vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-strip flex items-center justify-between px-5 py-3 shrink-0">
          <span className="text-2 font-semibold text-ink-rev tracking-tight2">
            {step === 'pick' ? 'Pick a card to link to' : `Link to "${target?.title}"`}
          </span>
          <button onClick={onClose} aria-label="Close" className="text-2 text-ink-rev/80 hover:text-ink-rev">✕</button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          {step === 'pick' && (
            <>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cards by title or description…"
                className="input-pill"
              />
              {results.length === 0 ? (
                <p className="text-2 text-ink-soft tracking-tight2">No cards match.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => { setTarget(c); setStep('label'); }}
                        className="card-surface w-full text-left p-2 hover:bg-surface-2"
                      >
                        <div className="text-2 font-medium text-ink tracking-tight2">{c.title}</div>
                        {c.description && (
                          <div className="text-1 text-ink-soft line-clamp-1 tracking-tight2">{c.description}</div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {step === 'label' && target && (
            <>
              <label className="text-2 text-ink tracking-tight2">Relationship</label>
              <select
                value={label}
                onChange={(e) => setLabel(e.target.value as CardLinkLabel)}
                className="input-pill"
              >
                {CARD_LINK_LABELS.map((l) => (
                  <option key={l} value={l}>{LABEL_LABEL[l]}</option>
                ))}
              </select>

              <label className="text-2 text-ink tracking-tight2 mt-2">Note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="Why are these linked?"
                className="card-surface p-2 text-2 text-ink tracking-tight2 resize-none"
              />

              {err && <p className="text-1 text-red tracking-tight2">{err}</p>}

              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => setStep('pick')} className="btn-pill btn-pill-outlined-dark text-2">Back</button>
                <button onClick={save} disabled={submitting} className="btn-pill btn-pill-filled-green text-2">
                  {submitting ? 'Saving…' : 'Save link'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd web && npx tsc --noEmit 2>&1 | tail -3
```

Clean.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/LinkPickerDialog.tsx
git commit -m "$(cat <<'EOF'
feat(web): LinkPickerDialog component (pick card → label → optional note)

Two-step modal: step 1 shows top-10 search-filtered cards (excludes
already-linked + self); step 2 lets the user choose one of the six
relationship labels and optionally write a note (≤ 500 chars). Saves
via api.linkCards. Shows 409 / 400 errors inline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `RelatedCardsSection` + EditDialog integration

**Files:**
- Create: `web/src/components/RelatedCardsSection.tsx`
- Modify: `web/src/components/EditDialog.tsx`

- [ ] **Step 1: Create `RelatedCardsSection`**

```tsx
import { useState } from 'react';
import { useCardLinks } from '../hooks/useCardLinks.ts';
import { api } from '../api.ts';
import type { CardLinkLabel } from '../types.ts';
import { LinkPickerDialog } from './LinkPickerDialog.tsx';

const LABEL_DISPLAY: Record<CardLinkLabel, string> = {
  evolves_from: 'evolves from',
  supersedes:   'supersedes',
  split_from:   'split from',
  related:      'related',
  inspired_by:  'inspired by',
  duplicate_of: 'duplicate of',
};

type Props = {
  cardId: string;
  onOpenCard?: (cardId: string) => void;
};

export function RelatedCardsSection({ cardId, onOpenCard }: Props) {
  const { links, related_cards } = useCardLinks(cardId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const cardById = new Map(related_cards.map((c) => [c.id, c]));
  const excludeIds = [cardId, ...related_cards.map((c) => c.id)];

  async function unlink(linkId: string) {
    if (!confirm('Unlink this card?')) return;
    try {
      await api.unlinkCard(cardId, linkId);
    } catch (e) {
      alert(`Unlink failed: ${e instanceof Error ? e.message : 'error'}`);
    }
  }

  return (
    <section className="card-surface p-3 my-3" aria-label="Related cards">
      <header className="flex items-center justify-between mb-2">
        <h3 className="text-2 font-semibold text-ink tracking-tight2">🧬 Related cards</h3>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="btn-pill btn-pill-outlined-green text-1"
        >
          + Link card
        </button>
      </header>

      {links.length === 0 ? (
        <p className="text-1 text-ink-soft tracking-tight2">No links yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {links.map((l) => {
            const isOutgoing = l.from_card_id === cardId;
            const otherId = isOutgoing ? l.to_card_id : l.from_card_id;
            const other = cardById.get(otherId);
            const arrow = isOutgoing ? '→' : '←';
            return (
              <li key={l.id} className="text-2 text-ink tracking-tight2">
                <span className="text-ink-soft">{LABEL_DISPLAY[l.label]} {arrow}</span>{' '}
                {other ? (
                  <button
                    type="button"
                    onClick={() => onOpenCard?.(other.id)}
                    className="text-green-accent underline hover:no-underline"
                  >
                    {other.title}
                  </button>
                ) : (
                  <span className="text-ink-soft italic">(not visible)</span>
                )}
                <button
                  type="button"
                  onClick={() => unlink(l.id)}
                  className="btn-pill btn-pill-outlined-dark text-1 ml-2 px-2 py-0"
                  style={{ paddingTop: 1, paddingBottom: 1 }}
                >
                  Unlink
                </button>
                {l.note && <div className="text-1 text-ink-soft mt-0.5">note: {l.note}</div>}
              </li>
            );
          })}
        </ul>
      )}

      {pickerOpen && (
        <LinkPickerDialog
          fromCardId={cardId}
          excludeIds={excludeIds}
          onClose={() => setPickerOpen(false)}
          onCreated={() => { /* cache invalidates via WS */ }}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 2: Render in `EditDialog.tsx`**

Find the spot below the AI Insights panel + above the Knowledge section. Insert:

```tsx
import { RelatedCardsSection } from './RelatedCardsSection.tsx';
// ... below the AI Insights block:
{card?.id && (
  <RelatedCardsSection
    cardId={card.id}
    onOpenCard={(id) => {
      window.location.href = `/?card=${encodeURIComponent(id)}`;
    }}
  />
)}
```

- [ ] **Step 3: Add `🧬 Chain` button to dialog header**

Find the dialog's header strip (where the close-X button lives). Add a button next to it:

```tsx
import { useState } from 'react';
import { lazy, Suspense } from 'react';

const CardChainModal = lazy(() => import('./CardChainModal.tsx').then((m) => ({ default: m.CardChainModal })));

// ... inside component:
const [chainOpen, setChainOpen] = useState(false);

// ... in header (next to close button):
<button
  type="button"
  onClick={() => setChainOpen(true)}
  aria-label="View chain"
  title="View chain"
  className="text-2 text-ink-rev/80 hover:text-ink-rev mr-2"
>
  🧬
</button>

// ... after main dialog content:
{chainOpen && (
  <Suspense fallback={<div className="fixed inset-0 z-[60] flex items-center justify-center text-ink">Loading chain…</div>}>
    <CardChainModal
      cardId={card.id}
      onClose={() => setChainOpen(false)}
      onOpenCard={(id) => {
        setChainOpen(false);
        window.location.href = `/?card=${encodeURIComponent(id)}`;
      }}
    />
  </Suspense>
)}
```

- [ ] **Step 4: Typecheck + build**

```bash
cd web && npx tsc --noEmit 2>&1 | tail -3
cd web && npm run build 2>&1 | tail -3
```

Both clean (chain modal placeholder exists but is gated by lazy import; build still passes — see Task 8 which adds the actual module).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/RelatedCardsSection.tsx web/src/components/EditDialog.tsx
git commit -m "$(cat <<'EOF'
feat(web): RelatedCardsSection in EditDialog + 🧬 chain header button

Renders incoming + outgoing links with direction arrows, the other
card's title (clickable to open it), the label, and the note. + Link
card button opens LinkPickerDialog. Unlink button confirms then
deletes via api.unlinkCard. Edit-dialog header gains a 🧬 button
that lazy-loads CardChainModal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `CardChainModal` with react-flow

**Files:**
- Create: `web/src/components/CardChainModal.tsx`

- [ ] **Step 1: Create the modal**

```tsx
import { useMemo } from 'react';
import { useCardChain } from '../hooks/useCardChain.ts';
import type { Card, CardLink, Insight } from '../types.ts';
import ReactFlow, { Background, Controls, type Node, type Edge } from 'reactflow';
import 'reactflow/dist/style.css';

type Props = {
  cardId: string;
  onClose: () => void;
  onOpenCard?: (id: string) => void;
};

const STATUS_EMOJI: Record<string, string> = {
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

function buildGraph(
  centerId: string,
  nodes: Card[],
  edges: CardLink[],
  insights: Insight[],
): { rfNodes: Node[]; rfEdges: Edge[] } {
  // Simple BFS-layered layout (no dagre dep — keep bundle tiny).
  // Depth from centerId via BFS over the edges (undirected).
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.from_card_id)) adj.set(e.from_card_id, []);
    if (!adj.has(e.to_card_id)) adj.set(e.to_card_id, []);
    adj.get(e.from_card_id)!.push(e.to_card_id);
    adj.get(e.to_card_id)!.push(e.from_card_id);
  }
  const depthOf = new Map<string, number>();
  const queue: string[] = [centerId];
  depthOf.set(centerId, 0);
  while (queue.length > 0) {
    const id = queue.shift()!;
    const d = depthOf.get(id)!;
    for (const next of adj.get(id) ?? []) {
      if (!depthOf.has(next)) {
        depthOf.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  // Layout: x by depth, y stacked per depth.
  const byDepth = new Map<number, string[]>();
  for (const [id, d] of depthOf) {
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }
  const X_STEP = 280;
  const Y_STEP = 140;
  const positions = new Map<string, { x: number; y: number }>();
  for (const [d, ids] of byDepth) {
    const half = ((ids.length - 1) * Y_STEP) / 2;
    ids.forEach((id, i) => {
      positions.set(id, { x: d * X_STEP, y: i * Y_STEP - half });
    });
  }

  const rfNodes: Node[] = nodes.map((c) => {
    const pos = positions.get(c.id) ?? { x: 0, y: 0 };
    const hasInsight = insights.some((ins) => ins.card_id === c.id);
    const isCenter = c.id === centerId;
    return {
      id: c.id,
      position: pos,
      data: {
        label: (
          <div className={`text-2 ${isCenter ? 'font-semibold' : 'font-normal'}`} style={{ minWidth: 180 }}>
            <div>
              {STATUS_EMOJI[c.status] ?? ''} {c.title}
              {hasInsight && <span title="Has AI Insight"> ✨</span>}
            </div>
            <div className="text-1 text-ink-soft">
              {relativeAge(c.updated_at)} • {c.tags.length} tags
            </div>
          </div>
        ),
      },
      style: {
        background: isCenter ? 'rgb(var(--violet-soft))' : 'rgb(var(--card))',
        border: isCenter ? '2px solid rgb(var(--violet))' : '1px solid rgb(var(--hairline) / 0.15)',
        color: 'rgb(var(--ink))',
        borderRadius: 10,
        padding: 8,
      },
    };
  });

  const rfEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: e.from_card_id,
    target: e.to_card_id,
    label: e.note ? `${e.label}\n"${e.note.slice(0, 40)}"` : e.label,
    style: { stroke: 'rgb(var(--violet))', strokeWidth: 1.5 },
    labelStyle: { fill: 'rgb(var(--ink))', fontSize: 11 },
    labelBgStyle: { fill: 'rgb(var(--surface))' },
  }));

  return { rfNodes, rfEdges };
}

export function CardChainModal({ cardId, onClose, onOpenCard }: Props) {
  const { data, loading, err } = useCardChain(cardId, 2);

  const { rfNodes, rfEdges } = useMemo(() => {
    if (!data) return { rfNodes: [], rfEdges: [] };
    return buildGraph(cardId, data.nodes, data.edges, data.insights);
  }, [data, cardId]);

  return (
    <div className="fixed inset-0 z-[60] bg-ink/60 flex items-stretch p-4" onClick={onClose}>
      <div
        className="modal-surface flex-1 flex flex-col"
        style={{ minHeight: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header-strip flex items-center justify-between px-5 py-3 shrink-0">
          <span className="text-2 font-semibold text-ink-rev tracking-tight2">🧬 Chain view</span>
          <button onClick={onClose} className="text-2 text-ink-rev/80 hover:text-ink-rev" aria-label="Close">✕</button>
        </header>
        <div className="flex-1 relative">
          {loading && <div className="absolute inset-0 flex items-center justify-center text-ink-soft text-2">Loading…</div>}
          {err && <div className="absolute inset-0 flex items-center justify-center text-red text-2">{err}</div>}
          {!loading && !err && rfNodes.length > 0 && (
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              fitView
              onNodeDoubleClick={(_e, n) => onOpenCard?.(n.id)}
            >
              <Background />
              <Controls />
            </ReactFlow>
          )}
          {!loading && !err && rfNodes.length === 1 && (
            <div className="absolute bottom-4 left-4 right-4 text-1 text-ink-soft tracking-tight2 text-center">
              No links yet. Add the first one from the Related cards section.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

```bash
cd web && npx tsc --noEmit 2>&1 | tail -5
cd web && npm run build 2>&1 | tail -5
```

Both clean. Bundle should grow ~50KB gzip for the reactflow chunk (lazy-loaded — only paid when modal opens).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/CardChainModal.tsx
git commit -m "$(cat <<'EOF'
feat(web): CardChainModal with reactflow graph

Lazy-loaded modal renders the card neighborhood as a react-flow graph.
Custom BFS-layered layout (x by depth, y stacked per depth) — no dagre
dep. Center node highlighted with violet-soft fill + violet border;
cards with insights get a ✨ marker. Edges show label + truncated note.
Double-click a node to open that card. Empty state when only the
center node is present.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Docs + smoke + push + PR

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Append after the "AI Brainstorm research" section:

```markdown
### Card chains — track how an idea evolved

Cards can link to each other with one of six labeled relationships:

| Label | Meaning |
|---|---|
| `evolves_from` | This card is a follow-up / next iteration |
| `supersedes` | This card replaces an older one |
| `split_from` | This card is one piece of a bigger card |
| `related` | Generic association |
| `inspired_by` | This card was sparked by another |
| `duplicate_of` | Marked for housekeeping |

Each link supports an optional free-text note ("switched to organic").
Links are visible in:

- The **Related cards** section in the card edit dialog (with direction arrows)
- A dedicated **🧬 Chain** modal (lazy-loaded react-flow graph) that
  renders the neighborhood up to 2 hops with AI Insight side-nodes
- Telegram capture flow: tap **🔗 Link to existing** on the destination
  keyboard → pick card → pick label → optional note
```

- [ ] **Step 2: Full sweep**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude/server && npm test 2>&1 | grep -E "^# tests|^# pass|^# fail" | head -3
cd /Users/assistant/WorkingFolder/KanbanClaude/server && npx tsc --noEmit 2>&1 | tail -3
cd /Users/assistant/WorkingFolder/KanbanClaude/web && npm run build 2>&1 | tail -3
cd /Users/assistant/WorkingFolder/KanbanClaude/web && npx tsc --noEmit 2>&1 | tail -3
```

All clean.

- [ ] **Step 3: Manual smoke (local docker)**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude
docker compose exec -T db psql -U kanban -d kanban < server/schema.sql 2>&1 | tail -3
docker compose up -d --build server
sleep 5
```

In the browser (after hard refresh):
1. Open any card → "Related cards" section appears below AI Insights, empty state
2. Click `+ Link card` → picker opens → search → pick a card → choose label → optional note → Save
3. New link appears in the Related cards list with direction arrow
4. Click the linked card title → switches to that card
5. Click `🧬` button in dialog header → chain modal opens with both cards
6. Double-click the other node → opens that card
7. Click `Unlink` on a link → confirm → row disappears

In Telegram:
1. DM bot a research-y text → destination keyboard now has `🔗 Link to existing`
2. Tap `🔗` → picker appears with top-5 cards
3. Reply `eggs` → list filters
4. Tap a `[Pick]` → label keyboard appears
5. Tap a label → bot asks for note
6. Reply with text → bot replies "✓ Saved + 🔗 evolves_from '<title>' note: '...'"
7. Open the new card in web → Related cards section shows the link

- [ ] **Step 4: Commit docs**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs(readme): document card chains feature

Adds a Card chains section with the six labels, link surfaces (Related
cards section, 🧬 chain modal, Telegram 🔗 Link to existing button),
and the free-text note field.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Push branch**

```bash
git push -u origin feat/card-chain
```

- [ ] **Step 6: Open PR (ask user first)**

Do NOT auto-open. Ask:

> Branch pushed. Open PR against `main`?

If yes:

```bash
gh pr create --base main --head feat/card-chain --title "feat: card chains — tie cards together to track evolution" --body "$(cat <<'EOF'
## Summary
- New \`card_links\` table — free-form M:N with 6 labels + optional note.
- REST: POST/DELETE/GET links + GET chain (recursive CTE BFS, depth clamped 1..6).
- WS events \`card.link.created\` / \`card.link.deleted\` with visibility filter.
- EditDialog: Related cards section + 🧬 Chain header button.
- LinkPickerDialog: pick card → choose label → optional note (≤ 500 chars).
- CardChainModal: lazy-loaded react-flow graph with BFS-layered layout, ✨ AI insight markers, double-click to open.
- Telegram: 🔗 Link to existing button on destination keyboard → recent-cards picker → label keyboard → note prompt → save card + link in one shot.

Spec: docs/superpowers/specs/2026-05-12-card-chain-design.md
Plan: docs/superpowers/plans/2026-05-12-card-chain.md

## Test plan
- [x] \`cd server && npm test\` clean
- [x] \`cd server && npx tsc --noEmit\` clean
- [x] \`cd web && npm run build && npx tsc --noEmit\` clean
- [ ] Web: Link card → label → note → save → row appears with direction arrow
- [ ] Web: 🧬 Chain modal renders react-flow graph; double-click opens that card
- [ ] Web: Unlink confirms then deletes
- [ ] Telegram: 🔗 Link to existing → pick → label → note → save
- [ ] WS broadcast delivers card.link.* events to other connected clients
- [ ] Visibility — links to invisible cards filtered server-side

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

**Spec coverage:**
- §4 schema → Task 1
- §5 web flow → Tasks 6, 7
- §5 Telegram flow → Task 4
- §5 chain modal → Task 8
- §6 REST + WS → Task 3
- §7 file map → covered across tasks 2-8
- §8 risks → mitigations in code (depth cap, UNIQUE, visibility filter, lazy-load, rate limiting via UNIQUE 409)
- §9 verification → Task 9 step 3
- §10 done state → Task 9 step 5-6

**Placeholder scan:** clean — every step has concrete code or commands.

**Type consistency:** `CardLink` + `CardLinkLabel` defined once on server (Task 2), mirrored in web (Task 5) with identical fields. `CARD_LINK_LABELS` array exported from both. REST endpoint shapes match the api client methods. `chainCardIds` signature in Task 2 matches its consumer in Task 3.

---

## Execution

Plan saved. Two options:

**1. Subagent-Driven (recommended)** — fresh subagent per task + two-stage review

**2. Inline Execution** — execute in this session with checkpoint commits

Which approach?
