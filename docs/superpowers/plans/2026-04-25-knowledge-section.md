# Knowledge Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Knowledge section to SmartKanban for storing URL bookmarks, full articles, and free-form notes; capturable from web/Telegram/cards/PWA-share-target; retrievable via browse + tag filter, FTS, and AI semantic search; attachable to cards.

**Architecture:** New `knowledge_items` table mirrors the cards visibility model (private / inbox / shared via `knowledge_shares`). A `knowledge_card_links` join table connects items to cards. New backend module `src/knowledge.ts` (data layer) + `src/routes/knowledge.ts` (HTTP). A background URL fetcher uses Node 22 native fetch + `@mozilla/readability` + `jsdom` with SSRF guard. Optional AI semantic search uses pgvector + OpenAI `text-embedding-3-small`, gated by `KNOWLEDGE_EMBEDDINGS=true`. Web app gains a top-level Knowledge view next to the Board. Telegram bot adds `/save`, `/note`, `/k`, `/klist` DM commands. PWA manifest gains a `share_target` for "Share to Knowledge".

**Tech Stack:** Node 22 + Fastify 4 + TypeScript ESM, PostgreSQL 16 (+ pgvector optional), `pg`, `@fastify/websocket`, grammY (Telegram), React 18 + Vite + Tailwind, `node:test` (`tsx --test ...`) for backend tests, `@mozilla/readability`, `jsdom`.

**Spec:** `docs/superpowers/specs/2026-04-25-knowledge-section-design.md`

**Sequencing:** 10 tasks. Each task ends with a green test run + commit. Halt between tasks for user validation. Tasks 1–5 = backend MVP (web CRUD shippable). Tasks 6–8 = web UI. Task 9 = Telegram. Task 10 = optional AI embeddings.

---

## File Structure

**Backend (server/):**
- Modify: `schema.sql` (add `knowledge_items`, `knowledge_shares`, `knowledge_card_links`)
- Modify: `package.json` (add `@mozilla/readability`, `jsdom`)
- Create: `src/knowledge.ts` (types, validation, visibility predicate, CRUD queries, FTS search)
- Create: `src/knowledge_fetch.ts` (SSRF guard + URL fetch + readability extraction + worker)
- Create: `src/routes/knowledge.ts` (HTTP routes)
- Modify: `src/routes/cards.ts` (mount `GET /:id/knowledge`)
- Modify: `src/index.ts` (register route module + optional embeddings bootstrap)
- Modify: `src/ws.ts` (broadcast event types + visibility filter for knowledge events)
- Modify: `src/telegram/bot.ts` (handle `/save`, `/note`, `/k`, `/klist`)
- Create: `src/ai/embed.ts` (OpenAI `text-embedding-3-small` client, gated)
- Create: `src/ai/embed_queue.ts` (single-flight queue with retry)
- Create: `src/scripts/backfill_embeddings.ts` (CLI backfill)
- Create: `src/__tests__/knowledge_routes.test.ts`
- Create: `src/__tests__/knowledge_fetch.test.ts`
- Create: `src/__tests__/knowledge_links.test.ts`
- Create: `src/__tests__/knowledge_embed.test.ts`
- Modify: `src/__tests__/telegram_parse.test.ts` (extend)

**Frontend (web/):**
- Modify: `src/types.ts` (add `KnowledgeItem`, `KnowledgeVisibility`, `KnowledgeFetchStatus`; extend `BroadcastEvent`)
- Modify: `src/api.ts` (add `knowledge` API surface)
- Modify: `src/ws.ts` (extend event types)
- Create: `src/hooks/useKnowledge.ts` (live list + WS subscription)
- Create: `src/KnowledgeView.tsx` (top-level Knowledge page)
- Create: `src/components/KnowledgeRow.tsx` (list row)
- Create: `src/components/KnowledgeEditDialog.tsx` (create/edit modal)
- Create: `src/components/KnowledgeDetail.tsx` (full-detail view + linked cards + attach picker)
- Modify: `src/components/EditDialog.tsx` (Knowledge subsection: list/attach/save-from-card)
- Modify: `src/components/BoardHeader.tsx` (Board / Knowledge tab)
- Modify: `src/App.tsx` (route between Board and Knowledge views; handle `/knowledge/share` PWA route)
- Modify: `public/manifest.webmanifest` (add `share_target`)
- Modify: `vite.config.ts` (no changes expected; verify `/api`, `/ws` proxy already covers new endpoints)

---

## Task 1: Schema migration

**Files:**
- Modify: `server/schema.sql` (append knowledge tables after `card_templates` section)

- [ ] **Step 1: Append knowledge tables to `schema.sql`**

Append at end of file:

```sql
-- ---------- knowledge ----------
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

- [ ] **Step 2: Apply schema to local dev DB**

Run: `cd server && npm run db:init`
Expected: succeeds; idempotent.

- [ ] **Step 3: Verify tables exist**

Run: `psql postgresql://kanban:kanban@localhost:5432/kanban -c "\d knowledge_items"` and same for `knowledge_shares`, `knowledge_card_links`.
Expected: each table description prints with the listed columns + indexes.

- [ ] **Step 4: Commit**

```bash
git add server/schema.sql
git commit -m "feat(knowledge): add knowledge_items + shares + card_links tables"
```

---

## Task 2: Data layer (`src/knowledge.ts`)

**Files:**
- Create: `server/src/knowledge.ts`
- Create: `server/src/__tests__/knowledge_routes.test.ts` (initial: data layer only; HTTP added in Task 3)

- [ ] **Step 1: Write failing tests for create + list + visibility**

Create `server/src/__tests__/knowledge_routes.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import {
  createKnowledge, listKnowledge, loadKnowledge,
  canUserSeeKnowledge, KnowledgeValidationError,
} from '../knowledge.js';

async function makeUser(name: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (name, short_name, email, auth_hash) VALUES ($1, $1, $2, 'x') RETURNING id`,
    [name, `${name}-${Date.now()}@t.dev`],
  );
  return r.rows[0]!.id;
}

test('createKnowledge persists and defaults', async () => {
  const u = await makeUser('alice');
  const k = await createKnowledge(u, {
    title: 'Hello', url: 'https://example.com', visibility: 'private',
  });
  assert.equal(k.owner_id, u);
  assert.equal(k.title, 'Hello');
  assert.equal(k.body, '');
  assert.equal(k.archived, false);
  assert.equal(k.title_auto, false);
});

test('createKnowledge rejects empty title', async () => {
  const u = await makeUser('bob');
  await assert.rejects(
    () => createKnowledge(u, { title: '', url: 'https://x.com', visibility: 'private' }),
    KnowledgeValidationError,
  );
});

test('createKnowledge rejects when both url and body empty', async () => {
  const u = await makeUser('carol');
  await assert.rejects(
    () => createKnowledge(u, { title: 't', visibility: 'private' }),
    KnowledgeValidationError,
  );
});

test('listKnowledge applies visibility predicate', async () => {
  const a = await makeUser('a');
  const b = await makeUser('b');
  const priv  = await createKnowledge(a, { title: 'priv',   url: 'https://1', visibility: 'private' });
  const inbx  = await createKnowledge(a, { title: 'inbox',  url: 'https://2', visibility: 'inbox' });
  const shrd  = await createKnowledge(a, { title: 'shared', url: 'https://3', visibility: 'shared', shares: [b] });

  const visibleToB = await listKnowledge(b, { scope: 'all' });
  const ids = new Set(visibleToB.map(k => k.id));
  assert.ok(!ids.has(priv.id), 'b must not see private');
  assert.ok(ids.has(inbx.id),   'b must see inbox');
  assert.ok(ids.has(shrd.id),   'b must see shared');
});

test('canUserSeeKnowledge reflects predicate', async () => {
  const a = await makeUser('aa');
  const b = await makeUser('bb');
  const k = await createKnowledge(a, { title: 't', url: 'https://x', visibility: 'private' });
  assert.equal(await canUserSeeKnowledge(a, k), true);
  assert.equal(await canUserSeeKnowledge(b, k), false);
});
```

- [ ] **Step 2: Run tests; expect failure (module missing)**

Run: `cd server && npm test -- --test-name-pattern='knowledge'`
Expected: import error / module not found for `../knowledge.js`.

- [ ] **Step 3: Implement `src/knowledge.ts`**

Create `server/src/knowledge.ts`:

```ts
import { pool } from './db.js';

export type KnowledgeVisibility = 'private' | 'inbox' | 'shared';
export type KnowledgeFetchStatus = 'pending' | 'ok' | 'failed' | 'skipped';
export type KnowledgeSource = 'manual' | 'telegram' | 'share_target' | 'from_card';

export type KnowledgeItem = {
  id: string;
  owner_id: string;
  title: string;
  title_auto: boolean;
  url: string | null;
  body: string;
  tags: string[];
  visibility: KnowledgeVisibility;
  source: KnowledgeSource;
  fetch_status: KnowledgeFetchStatus | null;
  fetch_error: string | null;
  fetched_at: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  shares?: string[];
  linked_card_ids?: string[];
};

export type KnowledgeInput = {
  title: string;
  title_auto?: boolean;
  url?: string | null;
  body?: string;
  tags?: string[];
  visibility: KnowledgeVisibility;
  shares?: string[];
  auto_fetch?: boolean;
  source?: KnowledgeSource;
};

export type KnowledgePatch = Partial<Omit<KnowledgeInput, 'source'>> & { archived?: boolean };

export class KnowledgeValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = 'KnowledgeValidationError';
  }
}

const TITLE_MAX = 200;
const BODY_MAX = Number(process.env.KNOWLEDGE_BODY_MAX_CHARS ?? 200_000);
const TAG_MAX_LEN = 32;
const MAX_TAGS = 10;

export function validateUrl(url: string): URL {
  let u: URL;
  try { u = new URL(url); }
  catch { throw new KnowledgeValidationError('url', 'invalid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new KnowledgeValidationError('url', 'only http/https URLs allowed');
  }
  if (!u.hostname) throw new KnowledgeValidationError('url', 'URL missing host');
  return u;
}

export function normaliseTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  for (const t of tags) {
    const v = String(t).toLowerCase().trim();
    if (!v) continue;
    if (v.length > TAG_MAX_LEN) {
      throw new KnowledgeValidationError('tags', `tag exceeds ${TAG_MAX_LEN} chars`);
    }
    seen.add(v);
  }
  const result = Array.from(seen);
  if (result.length > MAX_TAGS) {
    throw new KnowledgeValidationError('tags', `at most ${MAX_TAGS} tags`);
  }
  return result;
}

function validateInput(input: KnowledgeInput | KnowledgePatch, partial: boolean): void {
  if (input.title !== undefined) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > TITLE_MAX) {
      throw new KnowledgeValidationError('title', `title required, 1..${TITLE_MAX} chars`);
    }
  } else if (!partial) {
    throw new KnowledgeValidationError('title', 'title required');
  }
  if (input.visibility !== undefined) {
    if (!['private', 'inbox', 'shared'].includes(input.visibility)) {
      throw new KnowledgeValidationError('visibility', 'visibility must be private | inbox | shared');
    }
  } else if (!partial) {
    throw new KnowledgeValidationError('visibility', 'visibility required');
  }
  if (input.url) validateUrl(input.url);
  if (input.body !== undefined && input.body.length > BODY_MAX) {
    throw new KnowledgeValidationError('body', `body exceeds ${BODY_MAX} chars`);
  }
  if (!partial) {
    const hasUrl = !!input.url;
    const hasBody = !!(input.body && input.body.trim());
    if (!hasUrl && !hasBody) {
      throw new KnowledgeValidationError('body', 'one of url or body required');
    }
  }
}

export async function createKnowledge(
  ownerId: string, input: KnowledgeInput,
): Promise<KnowledgeItem> {
  validateInput(input, false);
  const tags = normaliseTags(input.tags);
  const wantAutoFetch =
    input.auto_fetch ?? (!!input.url && !(input.body && input.body.trim()));
  const fetchStatus: KnowledgeFetchStatus | null = wantAutoFetch ? 'pending' : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<KnowledgeItem>(
      `INSERT INTO knowledge_items
         (owner_id, title, title_auto, url, body, tags, visibility, source, fetch_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        ownerId, input.title.trim(), !!input.title_auto, input.url ?? null,
        input.body ?? '', tags, input.visibility,
        input.source ?? 'manual', fetchStatus,
      ],
    );
    const k = rows[0]!;
    if (input.visibility === 'shared' && input.shares?.length) {
      const values: string[] = [];
      const params: unknown[] = [k.id];
      for (let i = 0; i < input.shares.length; i++) {
        params.push(input.shares[i]);
        values.push(`($1, $${i + 2})`);
      }
      await client.query(
        `INSERT INTO knowledge_shares (knowledge_id, user_id) VALUES ${values.join(', ')}
         ON CONFLICT DO NOTHING`,
        params,
      );
      k.shares = input.shares;
    }
    await client.query('COMMIT');
    return k;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function loadKnowledge(id: string): Promise<KnowledgeItem | null> {
  const { rows } = await pool.query<KnowledgeItem>(
    `SELECT * FROM knowledge_items WHERE id = $1`, [id],
  );
  const k = rows[0];
  if (!k) return null;
  const s = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM knowledge_shares WHERE knowledge_id = $1`, [id],
  );
  k.shares = s.rows.map(r => r.user_id);
  const l = await pool.query<{ card_id: string }>(
    `SELECT card_id FROM knowledge_card_links WHERE knowledge_id = $1`, [id],
  );
  k.linked_card_ids = l.rows.map(r => r.card_id);
  return k;
}

export async function canUserSeeKnowledge(
  userId: string, k: KnowledgeItem,
): Promise<boolean> {
  if (k.owner_id === userId) return true;
  if (k.visibility === 'inbox') return true;
  if (k.visibility === 'shared') {
    const r = await pool.query(
      `SELECT 1 FROM knowledge_shares WHERE knowledge_id = $1 AND user_id = $2`,
      [k.id, userId],
    );
    return r.rowCount! > 0;
  }
  return false;
}

export type ListOptions = {
  scope?: 'mine' | 'inbox' | 'all';
  q?: string;
  tag?: string;
  limit?: number;
  cursor?: { updated_at: string; id: string };
};

export async function listKnowledge(
  userId: string, opts: ListOptions = {},
): Promise<KnowledgeItem[]> {
  const scope = opts.scope ?? 'all';
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const params: unknown[] = [userId];
  const where: string[] = ['NOT archived'];

  // visibility predicate
  where.push(`(
    owner_id = $1
    OR visibility = 'inbox'
    OR (visibility = 'shared'
        AND EXISTS (SELECT 1 FROM knowledge_shares ks
                    WHERE ks.knowledge_id = knowledge_items.id AND ks.user_id = $1))
  )`);

  if (scope === 'mine')  where.push(`owner_id = $1`);
  if (scope === 'inbox') where.push(`visibility = 'inbox'`);

  if (opts.q) {
    params.push(opts.q);
    where.push(`fts @@ plainto_tsquery('english', $${params.length})`);
  }
  if (opts.tag) {
    params.push(opts.tag.toLowerCase());
    where.push(`$${params.length} = ANY(tags)`);
  }
  if (opts.cursor) {
    params.push(opts.cursor.updated_at, opts.cursor.id);
    where.push(`(updated_at, id) < ($${params.length - 1}, $${params.length})`);
  }
  params.push(limit);
  const sql = `
    SELECT * FROM knowledge_items
    WHERE ${where.join(' AND ')}
    ORDER BY updated_at DESC, id DESC
    LIMIT $${params.length}`;
  const { rows } = await pool.query<KnowledgeItem>(sql, params);
  return rows;
}

export async function updateKnowledge(
  ownerId: string, id: string, patch: KnowledgePatch,
): Promise<KnowledgeItem | null> {
  validateInput(patch, true);
  const k = await loadKnowledge(id);
  if (!k) return null;
  if (k.owner_id !== ownerId) {
    throw new KnowledgeValidationError('owner', 'forbidden');
  }
  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, v: unknown) => { values.push(v); sets.push(`${col} = $${values.length}`); };

  if (patch.title !== undefined)      push('title', patch.title.trim());
  if (patch.title_auto !== undefined) push('title_auto', !!patch.title_auto);
  if (patch.url !== undefined)        push('url', patch.url);
  if (patch.body !== undefined)       push('body', patch.body);
  if (patch.tags !== undefined)       push('tags', normaliseTags(patch.tags));
  if (patch.visibility !== undefined) push('visibility', patch.visibility);
  if (patch.archived !== undefined)   push('archived', !!patch.archived);
  if (sets.length === 0 && patch.shares === undefined) return k;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let updated: KnowledgeItem = k;
    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`);
      values.push(id, ownerId);
      const { rows } = await client.query<KnowledgeItem>(
        `UPDATE knowledge_items SET ${sets.join(', ')}
         WHERE id = $${values.length - 1} AND owner_id = $${values.length}
         RETURNING *`,
        values,
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      updated = rows[0];
    }
    if (patch.shares !== undefined) {
      await client.query(`DELETE FROM knowledge_shares WHERE knowledge_id = $1`, [id]);
      if (updated.visibility === 'shared' && patch.shares.length > 0) {
        const params: unknown[] = [id];
        const ph: string[] = [];
        for (let i = 0; i < patch.shares.length; i++) {
          params.push(patch.shares[i]);
          ph.push(`($1, $${i + 2})`);
        }
        await client.query(
          `INSERT INTO knowledge_shares (knowledge_id, user_id) VALUES ${ph.join(', ')}
           ON CONFLICT DO NOTHING`,
          params,
        );
      }
      updated.shares = patch.shares;
    }
    await client.query('COMMIT');
    return updated;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function archiveKnowledge(ownerId: string, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE knowledge_items SET archived = TRUE, updated_at = NOW()
     WHERE id = $1 AND owner_id = $2 AND NOT archived`,
    [id, ownerId],
  );
  return (rowCount ?? 0) > 0;
}

export async function setFetchResult(
  id: string,
  result:
    | { status: 'ok'; body: string; title?: string }
    | { status: 'failed'; error: string }
    | { status: 'skipped' },
): Promise<KnowledgeItem | null> {
  if (result.status === 'ok') {
    const { rows } = await pool.query<KnowledgeItem>(
      `UPDATE knowledge_items
         SET body = $2,
             title = CASE WHEN title_auto AND $3::text IS NOT NULL THEN $3 ELSE title END,
             title_auto = CASE WHEN title_auto AND $3::text IS NOT NULL THEN FALSE ELSE title_auto END,
             fetch_status = 'ok',
             fetch_error = NULL,
             fetched_at = NOW(),
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, result.body, result.title ?? null],
    );
    return rows[0] ?? null;
  }
  if (result.status === 'failed') {
    const { rows } = await pool.query<KnowledgeItem>(
      `UPDATE knowledge_items
         SET fetch_status = 'failed', fetch_error = $2,
             fetched_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, result.error.slice(0, 500)],
    );
    return rows[0] ?? null;
  }
  const { rows } = await pool.query<KnowledgeItem>(
    `UPDATE knowledge_items
       SET fetch_status = 'skipped', fetched_at = NOW(), updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}
```

- [ ] **Step 4: Run tests; expect pass**

Run: `cd server && npm test -- --test-name-pattern='knowledge'`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/knowledge.ts server/src/__tests__/knowledge_routes.test.ts
git commit -m "feat(knowledge): data layer with visibility predicate, validation, FTS list"
```

---

## Task 3: HTTP routes (`/api/knowledge`)

**Files:**
- Create: `server/src/routes/knowledge.ts`
- Modify: `server/src/index.ts` (register route)
- Modify: `server/src/ws.ts` (add knowledge event types + visibility filter)
- Modify: `server/src/__tests__/knowledge_routes.test.ts` (add HTTP-level tests)

- [ ] **Step 1: Add HTTP test cases**

Append to `server/src/__tests__/knowledge_routes.test.ts`:

```ts
import { buildApp } from '../index.js';

async function authedRequest(app: Awaited<ReturnType<typeof buildApp>>, userId: string) {
  // Create a session for userId for direct cookie injection.
  const tok = `tst-${Math.random().toString(36).slice(2)}`;
  await pool.query(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 day')`,
    [tok, userId],
  );
  return { cookie: `kanban_session=${tok}` };
}

test('POST /api/knowledge creates and 400s on validation', async () => {
  const app = await buildApp();
  try {
    const u = await makeUser('http_a');
    const { cookie } = await authedRequest(app, u);

    const ok = await app.inject({
      method: 'POST', url: '/api/knowledge',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { title: 'A', url: 'https://example.com', visibility: 'private' },
    });
    assert.equal(ok.statusCode, 200);
    const body = ok.json() as any;
    assert.equal(body.title, 'A');

    const bad = await app.inject({
      method: 'POST', url: '/api/knowledge',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { title: '', url: 'https://x', visibility: 'private' },
    });
    assert.equal(bad.statusCode, 400);
  } finally { await app.close(); }
});

test('GET /api/knowledge filters by scope + q', async () => {
  const app = await buildApp();
  try {
    const u = await makeUser('http_b');
    const { cookie } = await authedRequest(app, u);
    await createKnowledge(u, { title: 'Eggs recipe', body: 'beat 3 eggs and fry', visibility: 'private' });
    await createKnowledge(u, { title: 'Cars',         body: 'pistons and gears',  visibility: 'private' });

    const r = await app.inject({
      method: 'GET', url: '/api/knowledge?q=eggs', headers: { cookie },
    });
    assert.equal(r.statusCode, 200);
    const body = r.json() as any;
    assert.ok(body.items.some((i: any) => i.title === 'Eggs recipe'));
    assert.ok(!body.items.some((i: any) => i.title === 'Cars'));
  } finally { await app.close(); }
});

test('PATCH by non-owner returns 403', async () => {
  const app = await buildApp();
  try {
    const a = await makeUser('http_c');
    const b = await makeUser('http_d');
    const { cookie } = await authedRequest(app, b);
    const k = await createKnowledge(a, {
      title: 't', url: 'https://x', visibility: 'inbox',
    });
    const r = await app.inject({
      method: 'PATCH', url: `/api/knowledge/${k.id}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { title: 'hax' },
    });
    assert.equal(r.statusCode, 403);
  } finally { await app.close(); }
});

test('GET /api/knowledge/:id returns 404 when not visible', async () => {
  const app = await buildApp();
  try {
    const a = await makeUser('http_e');
    const b = await makeUser('http_f');
    const { cookie } = await authedRequest(app, b);
    const k = await createKnowledge(a, { title: 'p', url: 'https://x', visibility: 'private' });
    const r = await app.inject({ method: 'GET', url: `/api/knowledge/${k.id}`, headers: { cookie } });
    assert.equal(r.statusCode, 404);
  } finally { await app.close(); }
});

test('DELETE archives item', async () => {
  const app = await buildApp();
  try {
    const u = await makeUser('http_g');
    const { cookie } = await authedRequest(app, u);
    const k = await createKnowledge(u, { title: 't', url: 'https://x', visibility: 'private' });
    const r = await app.inject({ method: 'DELETE', url: `/api/knowledge/${k.id}`, headers: { cookie } });
    assert.equal(r.statusCode, 204);
    const after = await loadKnowledge(k.id);
    assert.equal(after?.archived, true);
  } finally { await app.close(); }
});
```

If `buildApp()` is not exported from `src/index.ts`, refactor `src/index.ts` Step 4 to export it.

- [ ] **Step 2: Run tests; expect failure**

Run: `cd server && npm test -- --test-name-pattern='knowledge'`
Expected: HTTP tests fail (route not registered).

- [ ] **Step 3: Implement `src/routes/knowledge.ts`**

Create `server/src/routes/knowledge.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import {
  createKnowledge, listKnowledge, loadKnowledge, updateKnowledge,
  archiveKnowledge, canUserSeeKnowledge, KnowledgeValidationError,
} from '../knowledge.js';
import { broadcast } from '../ws.js';
import { triggerFetch } from '../knowledge_fetch.js';
import { enqueueEmbed } from '../ai/embed_queue.js';

export async function knowledgeRoutes(app: FastifyInstance) {
  // GET /api/knowledge?scope=mine|inbox|all&q=&tag=&limit=&cursor=
  app.get('/api/knowledge', async (req, reply) => {
    const user = req.requireUser();
    const q = (req.query as any) ?? {};
    const scope = (['mine','inbox','all'].includes(q.scope) ? q.scope : 'all') as 'mine'|'inbox'|'all';
    const limit = q.limit ? Math.min(Math.max(Number(q.limit), 1), 200) : 50;
    let cursor: { updated_at: string; id: string } | undefined;
    if (q.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(q.cursor, 'base64url').toString('utf8'));
        cursor = { updated_at: String(decoded.u), id: String(decoded.i) };
      } catch { /* ignore */ }
    }
    const items = await listKnowledge(user.id, {
      scope, q: q.q ?? undefined, tag: q.tag ?? undefined, limit, cursor,
    });
    const next = items.length === limit
      ? Buffer.from(JSON.stringify({
          u: items[items.length - 1]!.updated_at,
          i: items[items.length - 1]!.id,
        })).toString('base64url')
      : null;
    return reply.send({ items, next_cursor: next });
  });

  // GET /api/knowledge/:id
  app.get<{ Params: { id: string } }>('/api/knowledge/:id', async (req, reply) => {
    const user = req.requireUser();
    const k = await loadKnowledge(req.params.id);
    if (!k || k.archived || !(await canUserSeeKnowledge(user.id, k))) {
      return reply.code(404).send({ error: 'not found' });
    }
    return reply.send(k);
  });

  // POST /api/knowledge
  app.post('/api/knowledge', async (req, reply) => {
    const user = req.requireUser();
    try {
      const k = await createKnowledge(user.id, req.body as any);
      broadcast({ type: 'knowledge.created', knowledge: k });
      if (k.fetch_status === 'pending') triggerFetch(k.id);
      enqueueEmbed(k.id);
      return reply.send(k);
    } catch (e) {
      if (e instanceof KnowledgeValidationError) return reply.code(400).send({ error: e.message, field: e.field });
      throw e;
    }
  });

  // PATCH /api/knowledge/:id
  app.patch<{ Params: { id: string } }>('/api/knowledge/:id', async (req, reply) => {
    const user = req.requireUser();
    try {
      const k = await updateKnowledge(user.id, req.params.id, req.body as any);
      if (!k) return reply.code(404).send({ error: 'not found' });
      broadcast({ type: 'knowledge.updated', knowledge: k });
      enqueueEmbed(k.id);
      return reply.send(k);
    } catch (e) {
      if (e instanceof KnowledgeValidationError) {
        const code = e.field === 'owner' ? 403 : 400;
        return reply.code(code).send({ error: e.message, field: e.field });
      }
      throw e;
    }
  });

  // DELETE /api/knowledge/:id (soft archive)
  app.delete<{ Params: { id: string } }>('/api/knowledge/:id', async (req, reply) => {
    const user = req.requireUser();
    const k = await loadKnowledge(req.params.id);
    if (!k) return reply.code(404).send({ error: 'not found' });
    if (k.owner_id !== user.id) return reply.code(403).send({ error: 'forbidden' });
    const ok = await archiveKnowledge(user.id, req.params.id);
    if (!ok) return reply.code(404).send({ error: 'not found' });
    broadcast({ type: 'knowledge.deleted', id: req.params.id, owner_id: k.owner_id, visibility: k.visibility, shares: k.shares ?? [] });
    return reply.code(204).send();
  });

  // POST /api/knowledge/:id/refetch
  app.post<{ Params: { id: string } }>('/api/knowledge/:id/refetch', async (req, reply) => {
    const user = req.requireUser();
    const k = await loadKnowledge(req.params.id);
    if (!k) return reply.code(404).send({ error: 'not found' });
    if (k.owner_id !== user.id) return reply.code(403).send({ error: 'forbidden' });
    if (!k.url) return reply.code(400).send({ error: 'item has no url' });
    triggerFetch(k.id);
    return reply.send({ queued: true });
  });
}
```

- [ ] **Step 4: Register route + export `buildApp`**

In `server/src/index.ts`, locate where existing routes register (e.g. `app.register(cardsRoutes)`). Refactor app construction into an exported `buildApp()` function if not already, and add:

```ts
import { knowledgeRoutes } from './routes/knowledge.js';
// ...
await app.register(knowledgeRoutes);
```

Also stub `triggerFetch` and `enqueueEmbed` so HTTP tests don't pull in fetch/embed infra yet:

Create `server/src/knowledge_fetch.ts`:
```ts
export function triggerFetch(_id: string): void { /* implemented in Task 4 */ }
```
Create `server/src/ai/embed_queue.ts`:
```ts
export function enqueueEmbed(_id: string): void { /* implemented in Task 10 */ }
```

- [ ] **Step 5: Extend WS broadcast types and visibility filter**

In `server/src/ws.ts`:

Add to the `BroadcastEvent` union:

```ts
| { type: 'knowledge.created'; knowledge: KnowledgeItem }
| { type: 'knowledge.updated'; knowledge: KnowledgeItem }
| { type: 'knowledge.deleted'; id: string; owner_id: string; visibility: KnowledgeVisibility; shares: string[] }
| { type: 'knowledge.link.created'; knowledge_id: string; card_id: string }
| { type: 'knowledge.link.deleted'; knowledge_id: string; card_id: string }
```

(Import `KnowledgeItem`, `KnowledgeVisibility` from `./knowledge.js`.)

In the per-client filter function, add a branch:

```ts
if (event.type === 'knowledge.created' || event.type === 'knowledge.updated') {
  if (mirrorClient) return false;            // mirror tokens never get knowledge
  const k = event.knowledge;
  if (k.owner_id === client.userId) return true;
  if (k.visibility === 'inbox') return true;
  if (k.visibility === 'shared' && (k.shares ?? []).includes(client.userId)) return true;
  return false;
}
if (event.type === 'knowledge.deleted') {
  if (mirrorClient) return false;
  if (event.owner_id === client.userId) return true;
  if (event.visibility === 'inbox') return true;
  if (event.visibility === 'shared' && event.shares.includes(client.userId)) return true;
  return false;
}
if (event.type === 'knowledge.link.created' || event.type === 'knowledge.link.deleted') {
  // Coarse filter: any authenticated user. Caller checked visibility before broadcast.
  return !mirrorClient;
}
```

- [ ] **Step 6: Run tests; expect pass**

Run: `cd server && npm test -- --test-name-pattern='knowledge'`
Expected: HTTP tests PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/knowledge.ts server/src/index.ts server/src/ws.ts \
        server/src/knowledge_fetch.ts server/src/ai/embed_queue.ts \
        server/src/__tests__/knowledge_routes.test.ts
git commit -m "feat(knowledge): /api/knowledge CRUD routes + WS broadcasts"
```

---

## Task 4: Auto-fetch worker (`src/knowledge_fetch.ts`)

**Files:**
- Modify: `server/package.json` (add deps)
- Replace: `server/src/knowledge_fetch.ts`
- Create: `server/src/__tests__/knowledge_fetch.test.ts`

- [ ] **Step 1: Add dependencies**

Run:
```bash
cd server && npm install @mozilla/readability jsdom
npm install --save-dev @types/jsdom
```

- [ ] **Step 2: Write failing tests**

Create `server/src/__tests__/knowledge_fetch.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHostBlockedForSSRF, fetchAndExtract } from '../knowledge_fetch.js';

test('SSRF guard blocks localhost', async () => {
  assert.equal(await isHostBlockedForSSRF('localhost'), true);
});
test('SSRF guard blocks 127.0.0.1', async () => {
  assert.equal(await isHostBlockedForSSRF('127.0.0.1'), true);
});
test('SSRF guard blocks 169.254.169.254 (metadata)', async () => {
  assert.equal(await isHostBlockedForSSRF('169.254.169.254'), true);
});
test('SSRF guard blocks 10.0.0.1', async () => {
  assert.equal(await isHostBlockedForSSRF('10.0.0.1'), true);
});
test('SSRF guard allows public host', async () => {
  // Use a stable public address that resolves to public IP. Skip if offline.
  try {
    assert.equal(await isHostBlockedForSSRF('example.com'), false);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOTFOUND') return;
    throw e;
  }
});

test('fetchAndExtract parses HTML', async () => {
  const html = `<!doctype html><html><head><title>T</title></head>
    <body><article><h1>T</h1><p>Hello world body content for readability extraction.</p></article></body></html>`;
  const { title, body } = await fetchAndExtract(
    'https://example.com/x',
    async () => new Response(html, { headers: { 'content-type': 'text/html' } }),
  );
  assert.match(body, /Hello world/);
  assert.equal(title, 'T');
});
```

- [ ] **Step 3: Run tests; expect failure**

Run: `cd server && npm test -- --test-name-pattern='SSRF|fetchAndExtract'`
Expected: import error or function-undefined failures.

- [ ] **Step 4: Replace `src/knowledge_fetch.ts` with full implementation**

Replace contents of `server/src/knowledge_fetch.ts`:

```ts
import dns from 'node:dns/promises';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { setFetchResult, loadKnowledge } from './knowledge.js';
import { broadcast } from './ws.js';
import { enqueueEmbed } from './ai/embed_queue.js';

const TIMEOUT_MS = Number(process.env.KNOWLEDGE_FETCH_TIMEOUT_MS ?? 10_000);
const MAX_BYTES = 5 * 1024 * 1024;
const ENABLED = process.env.KNOWLEDGE_AUTOFETCH !== 'false';

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^0\./,
];
const PRIVATE_V6_PREFIX = ['::1', 'fc', 'fd', 'fe80'];

export async function isHostBlockedForSSRF(host: string): Promise<boolean> {
  if (!host || host === 'localhost') return true;
  let addrs: { address: string; family: number }[] = [];
  try { addrs = await dns.lookup(host, { all: true }); }
  catch { return true; }
  for (const a of addrs) {
    if (a.family === 4 && PRIVATE_V4.some(re => re.test(a.address))) return true;
    if (a.family === 6) {
      const lo = a.address.toLowerCase();
      if (PRIVATE_V6_PREFIX.some(p => lo === p || lo.startsWith(p + ':') || lo.startsWith(p))) return true;
    }
  }
  return false;
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export async function fetchAndExtract(
  url: string,
  fetcher: Fetcher = (u, i) => fetch(u, i),
): Promise<{ title: string | null; body: string }> {
  const u = new URL(url);
  if (await isHostBlockedForSSRF(u.hostname)) {
    throw new Error('blocked: private/local host');
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetcher(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'SmartKanban-Knowledge/1.0' },
    });
  } finally { clearTimeout(t); }

  if (!res.ok) throw new Error(`http ${res.status}`);
  const ct = (res.headers.get('content-type') ?? '').toLowerCase();
  if (!ct.startsWith('text/html') && !ct.startsWith('application/xhtml')) {
    throw new Error(`unsupported content-type ${ct}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error('empty body');
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      ctrl.abort();
      throw new Error('response too large');
    }
    chunks.push(value);
  }
  const html = new TextDecoder('utf-8').decode(Buffer.concat(chunks.map(c => Buffer.from(c))));
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (!article) {
    return { title: null, body: dom.window.document.body?.textContent?.trim().slice(0, 50_000) ?? '' };
  }
  const body = (article.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 200_000);
  return { title: article.title?.trim() || null, body };
}

const inflight = new Set<string>();

export function triggerFetch(id: string): void {
  if (!ENABLED) return;
  if (inflight.has(id)) return;
  inflight.add(id);
  setImmediate(async () => {
    try {
      const k = await loadKnowledge(id);
      if (!k || !k.url) return;
      try {
        const { title, body } = await fetchAndExtract(k.url);
        const updated = await setFetchResult(id, {
          status: 'ok', body, title: title ?? undefined,
        });
        if (updated) {
          broadcast({ type: 'knowledge.updated', knowledge: updated });
          enqueueEmbed(id);
        }
      } catch (err) {
        const updated = await setFetchResult(id, {
          status: 'failed', error: (err as Error).message ?? String(err),
        });
        if (updated) broadcast({ type: 'knowledge.updated', knowledge: updated });
      }
    } finally { inflight.delete(id); }
  });
}
```

- [ ] **Step 5: Run tests; expect pass**

Run: `cd server && npm test -- --test-name-pattern='SSRF|fetchAndExtract'`
Expected: all PASS. (Note: `'SSRF guard allows public host'` will skip if offline.)

- [ ] **Step 6: Manual integration smoke**

```bash
cd server && npm run dev
# in another terminal:
curl -X POST -b kanban_session=<your_session> -H 'content-type: application/json' \
  http://localhost:3001/api/knowledge \
  -d '{"title":"example","url":"https://example.com","visibility":"private","title_auto":true}'
sleep 3
curl -b kanban_session=<your_session> http://localhost:3001/api/knowledge | jq '.items[0]'
```
Expected: `fetch_status` transitions `pending → ok`, `body` contains extracted text, `title` updated.

- [ ] **Step 7: Commit**

```bash
git add server/package.json server/package-lock.json \
        server/src/knowledge_fetch.ts server/src/__tests__/knowledge_fetch.test.ts
git commit -m "feat(knowledge): URL auto-fetch with SSRF guard + readability extraction"
```

---

## Task 5: Card linking + from-card

**Files:**
- Modify: `server/src/knowledge.ts` (add `linkCard`, `unlinkCard`, `listKnowledgeForCard`, `createFromCard`)
- Modify: `server/src/routes/knowledge.ts` (link/unlink/from-card endpoints)
- Modify: `server/src/routes/cards.ts` (mount `GET /:id/knowledge`)
- Create: `server/src/__tests__/knowledge_links.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/src/__tests__/knowledge_links.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import {
  createKnowledge, linkCard, unlinkCard, listKnowledgeForCard,
} from '../knowledge.js';

async function makeUser(name: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (name, short_name, email, auth_hash) VALUES ($1, $1, $2, 'x') RETURNING id`,
    [name, `${name}-${Date.now()}@t.dev`],
  );
  return r.rows[0]!.id;
}
async function makeCard(userId: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, created_by) VALUES ('c', 'today', $1) RETURNING id`,
    [userId],
  );
  return r.rows[0]!.id;
}

test('link + unlink card', async () => {
  const u = await makeUser('lk_a');
  const c = await makeCard(u);
  const k = await createKnowledge(u, { title: 't', url: 'https://x', visibility: 'private' });

  await linkCard(u, k.id, c);
  let linked = await listKnowledgeForCard(u, c);
  assert.equal(linked.length, 1);
  assert.equal(linked[0]!.id, k.id);

  await unlinkCard(u, k.id, c);
  linked = await listKnowledgeForCard(u, c);
  assert.equal(linked.length, 0);
});

test('listKnowledgeForCard filters by visibility', async () => {
  const a = await makeUser('lk_b');
  const b = await makeUser('lk_c');
  const c = await makeCard(a);
  const priv = await createKnowledge(a, { title: 'p', url: 'https://x', visibility: 'private' });
  const inbx = await createKnowledge(a, { title: 'i', url: 'https://y', visibility: 'inbox' });
  await linkCard(a, priv.id, c);
  await linkCard(a, inbx.id, c);
  // b sees the card (inbox via card unassigned-or-other rules) — but only the inbox knowledge
  const linked = await listKnowledgeForCard(b, c);
  const ids = new Set(linked.map(k => k.id));
  assert.ok(!ids.has(priv.id));
  assert.ok(ids.has(inbx.id));
});
```

- [ ] **Step 2: Run tests; expect failure**

Run: `cd server && npm test -- --test-name-pattern='link'`
Expected: function not found.

- [ ] **Step 3: Implement linking helpers in `src/knowledge.ts`**

Append to `server/src/knowledge.ts`:

```ts
export async function linkCard(
  userId: string, knowledgeId: string, cardId: string,
): Promise<void> {
  const k = await loadKnowledge(knowledgeId);
  if (!k) throw new KnowledgeValidationError('knowledge', 'not found');
  if (!(await canUserSeeKnowledge(userId, k))) {
    throw new KnowledgeValidationError('knowledge', 'forbidden');
  }
  // Reuse cards visibility check
  const { canUserSeeCard } = await import('./cards.js');
  const c = await pool.query(`SELECT * FROM cards WHERE id = $1`, [cardId]);
  if (!c.rows[0]) throw new KnowledgeValidationError('card', 'not found');
  if (!(await canUserSeeCard(userId, c.rows[0]))) {
    throw new KnowledgeValidationError('card', 'forbidden');
  }
  await pool.query(
    `INSERT INTO knowledge_card_links (knowledge_id, card_id, created_by)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [knowledgeId, cardId, userId],
  );
}

export async function unlinkCard(
  userId: string, knowledgeId: string, cardId: string,
): Promise<void> {
  const k = await loadKnowledge(knowledgeId);
  if (!k) return;
  if (!(await canUserSeeKnowledge(userId, k))) return;
  await pool.query(
    `DELETE FROM knowledge_card_links WHERE knowledge_id = $1 AND card_id = $2`,
    [knowledgeId, cardId],
  );
}

export async function listKnowledgeForCard(
  userId: string, cardId: string,
): Promise<KnowledgeItem[]> {
  const { rows } = await pool.query<KnowledgeItem>(
    `SELECT k.* FROM knowledge_items k
     JOIN knowledge_card_links l ON l.knowledge_id = k.id
     WHERE l.card_id = $1 AND NOT k.archived
       AND (
         k.owner_id = $2
         OR k.visibility = 'inbox'
         OR (k.visibility = 'shared'
             AND EXISTS (SELECT 1 FROM knowledge_shares ks
                         WHERE ks.knowledge_id = k.id AND ks.user_id = $2))
       )
     ORDER BY l.created_at DESC`,
    [cardId, userId],
  );
  return rows;
}

export async function createFromCard(
  userId: string, cardId: string,
): Promise<KnowledgeItem | null> {
  const c = await pool.query<{ id: string; title: string; description: string }>(
    `SELECT id, title, description FROM cards WHERE id = $1`, [cardId],
  );
  const card = c.rows[0];
  if (!card) return null;
  // Extract first URL from description
  const m = card.description.match(/https?:\/\/[^\s)\]]+/);
  const url = m?.[0] ?? null;
  const k = await createKnowledge(userId, {
    title: card.title.slice(0, 200),
    title_auto: !!url,
    url,
    body: url ? '' : card.description.slice(0, 200_000),
    visibility: 'inbox',
    source: 'from_card',
    auto_fetch: !!url,
  });
  await linkCard(userId, k.id, cardId);
  return k;
}
```

If `canUserSeeCard` doesn't exist in `cards.ts`, add it (read existing `cards.ts` for the visibility predicate; export as a function with the same signature).

- [ ] **Step 4: Add link/unlink/from-card routes**

Append to `server/src/routes/knowledge.ts`:

```ts
  // POST /api/knowledge/:id/links { card_id }
  app.post<{ Params: { id: string }; Body: { card_id: string } }>(
    '/api/knowledge/:id/links',
    async (req, reply) => {
      const user = req.requireUser();
      try {
        await (await import('../knowledge.js')).linkCard(user.id, req.params.id, req.body.card_id);
        broadcast({ type: 'knowledge.link.created', knowledge_id: req.params.id, card_id: req.body.card_id });
        return reply.code(204).send();
      } catch (e) {
        if (e instanceof KnowledgeValidationError) {
          return reply.code(e.message === 'forbidden' ? 403 : 404).send({ error: e.message, field: e.field });
        }
        throw e;
      }
    },
  );

  // DELETE /api/knowledge/:id/links/:card_id
  app.delete<{ Params: { id: string; card_id: string } }>(
    '/api/knowledge/:id/links/:card_id',
    async (req, reply) => {
      const user = req.requireUser();
      await (await import('../knowledge.js')).unlinkCard(user.id, req.params.id, req.params.card_id);
      broadcast({ type: 'knowledge.link.deleted', knowledge_id: req.params.id, card_id: req.params.card_id });
      return reply.code(204).send();
    },
  );

  // POST /api/knowledge/from-card/:card_id
  app.post<{ Params: { card_id: string } }>(
    '/api/knowledge/from-card/:card_id',
    async (req, reply) => {
      const user = req.requireUser();
      const k = await (await import('../knowledge.js')).createFromCard(user.id, req.params.card_id);
      if (!k) return reply.code(404).send({ error: 'card not found' });
      broadcast({ type: 'knowledge.created', knowledge: k });
      broadcast({ type: 'knowledge.link.created', knowledge_id: k.id, card_id: req.params.card_id });
      if (k.fetch_status === 'pending') triggerFetch(k.id);
      return reply.send(k);
    },
  );
```

(Replace existing in-file imports with explicit named imports if cleaner.)

- [ ] **Step 5: Mount `/api/cards/:id/knowledge` in `routes/cards.ts`**

In `server/src/routes/cards.ts`, add:

```ts
import { listKnowledgeForCard } from '../knowledge.js';
// ...
app.get<{ Params: { id: string } }>('/api/cards/:id/knowledge', async (req, reply) => {
  const user = req.requireUser();
  const items = await listKnowledgeForCard(user.id, req.params.id);
  return reply.send({ items });
});
```

- [ ] **Step 6: Run tests; expect pass**

Run: `cd server && npm test -- --test-name-pattern='link|knowledge'`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/knowledge.ts server/src/routes/knowledge.ts server/src/routes/cards.ts \
        server/src/__tests__/knowledge_links.test.ts
git commit -m "feat(knowledge): card linking + from-card creation"
```

---

## Task 6: Web — types, API client, hook

**Files:**
- Modify: `web/src/types.ts`
- Modify: `web/src/api.ts`
- Modify: `web/src/ws.ts`
- Create: `web/src/hooks/useKnowledge.ts`

- [ ] **Step 1: Add types**

In `web/src/types.ts` append:

```ts
export type KnowledgeVisibility = 'private' | 'inbox' | 'shared';
export type KnowledgeFetchStatus = 'pending' | 'ok' | 'failed' | 'skipped';

export interface KnowledgeItem {
  id: string;
  owner_id: string;
  title: string;
  title_auto: boolean;
  url: string | null;
  body: string;
  tags: string[];
  visibility: KnowledgeVisibility;
  source: 'manual' | 'telegram' | 'share_target' | 'from_card';
  fetch_status: KnowledgeFetchStatus | null;
  fetch_error: string | null;
  fetched_at: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  shares?: string[];
  linked_card_ids?: string[];
}
```

Extend the `BroadcastEvent` union (find existing union for `card.*` events) by adding:

```ts
| { type: 'knowledge.created'; knowledge: KnowledgeItem }
| { type: 'knowledge.updated'; knowledge: KnowledgeItem }
| { type: 'knowledge.deleted'; id: string; owner_id: string; visibility: KnowledgeVisibility; shares: string[] }
| { type: 'knowledge.link.created'; knowledge_id: string; card_id: string }
| { type: 'knowledge.link.deleted'; knowledge_id: string; card_id: string }
```

- [ ] **Step 2: Add API surface**

In `web/src/api.ts`, alongside the existing `cards` namespace, add:

```ts
export type KnowledgeListParams = {
  scope?: 'mine' | 'inbox' | 'all';
  q?: string;
  tag?: string;
  cursor?: string;
};

export const knowledge = {
  async list(params: KnowledgeListParams = {}): Promise<{ items: KnowledgeItem[]; next_cursor: string | null }> {
    const qs = new URLSearchParams();
    if (params.scope)  qs.set('scope', params.scope);
    if (params.q)      qs.set('q', params.q);
    if (params.tag)    qs.set('tag', params.tag);
    if (params.cursor) qs.set('cursor', params.cursor);
    const r = await fetch(`/api/knowledge?${qs.toString()}`, { credentials: 'include' });
    if (!r.ok) throw new Error(`list knowledge ${r.status}`);
    return r.json();
  },
  async get(id: string): Promise<KnowledgeItem> {
    const r = await fetch(`/api/knowledge/${id}`, { credentials: 'include' });
    if (!r.ok) throw new Error(`get knowledge ${r.status}`);
    return r.json();
  },
  async create(input: Partial<KnowledgeItem> & { title: string; visibility: KnowledgeVisibility }): Promise<KnowledgeItem> {
    const r = await fetch(`/api/knowledge`, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!r.ok) throw new Error(`create knowledge ${r.status}`);
    return r.json();
  },
  async update(id: string, patch: Partial<KnowledgeItem>): Promise<KnowledgeItem> {
    const r = await fetch(`/api/knowledge/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error(`update knowledge ${r.status}`);
    return r.json();
  },
  async archive(id: string): Promise<void> {
    const r = await fetch(`/api/knowledge/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!r.ok) throw new Error(`archive knowledge ${r.status}`);
  },
  async refetch(id: string): Promise<void> {
    const r = await fetch(`/api/knowledge/${id}/refetch`, { method: 'POST', credentials: 'include' });
    if (!r.ok) throw new Error(`refetch knowledge ${r.status}`);
  },
  async link(id: string, cardId: string): Promise<void> {
    const r = await fetch(`/api/knowledge/${id}/links`, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ card_id: cardId }),
    });
    if (!r.ok) throw new Error(`link ${r.status}`);
  },
  async unlink(id: string, cardId: string): Promise<void> {
    const r = await fetch(`/api/knowledge/${id}/links/${cardId}`, {
      method: 'DELETE', credentials: 'include',
    });
    if (!r.ok) throw new Error(`unlink ${r.status}`);
  },
  async listForCard(cardId: string): Promise<KnowledgeItem[]> {
    const r = await fetch(`/api/cards/${cardId}/knowledge`, { credentials: 'include' });
    if (!r.ok) throw new Error(`list-for-card ${r.status}`);
    return (await r.json()).items as KnowledgeItem[];
  },
  async fromCard(cardId: string): Promise<KnowledgeItem> {
    const r = await fetch(`/api/knowledge/from-card/${cardId}`, { method: 'POST', credentials: 'include' });
    if (!r.ok) throw new Error(`from-card ${r.status}`);
    return r.json();
  },
};
```

(Adjust the existing `KnowledgeItem` import to be re-exported alongside other types in `api.ts` if that file already manages exports.)

- [ ] **Step 3: Implement `useKnowledge` hook**

Create `web/src/hooks/useKnowledge.ts`:

```ts
import { useEffect, useState, useCallback } from 'react';
import { knowledge } from '../api';
import type { KnowledgeItem } from '../types';
import { onMessage } from '../ws';

export type Scope = 'mine' | 'inbox' | 'all';

export function useKnowledge(scope: Scope, q: string, tag: string | null) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await knowledge.list({ scope, q: q || undefined, tag: tag ?? undefined });
      setItems(r.items);
    } finally { setLoading(false); }
  }, [scope, q, tag]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const off = onMessage(ev => {
      if (ev.type === 'knowledge.created' || ev.type === 'knowledge.updated') {
        setItems(prev => {
          const i = prev.findIndex(p => p.id === ev.knowledge.id);
          if (i >= 0) {
            const next = prev.slice();
            next[i] = ev.knowledge;
            return next;
          }
          return [ev.knowledge, ...prev];
        });
      } else if (ev.type === 'knowledge.deleted') {
        setItems(prev => prev.filter(p => p.id !== ev.id));
      }
    });
    return off;
  }, []);

  return { items, loading, reload };
}
```

(Adapt to the project's existing WS subscriber API. If `onMessage` is named differently, find it in `web/src/ws.ts` and use the project pattern.)

- [ ] **Step 4: Type-check the web project**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/types.ts web/src/api.ts web/src/ws.ts web/src/hooks/useKnowledge.ts
git commit -m "feat(knowledge): web types + API client + useKnowledge hook"
```

---

## Task 7: Web — Knowledge view (list, search, edit)

**Files:**
- Create: `web/src/KnowledgeView.tsx`
- Create: `web/src/components/KnowledgeRow.tsx`
- Create: `web/src/components/KnowledgeEditDialog.tsx`
- Create: `web/src/components/KnowledgeDetail.tsx`
- Modify: `web/src/components/BoardHeader.tsx` (add Board / Knowledge tab toggle)
- Modify: `web/src/App.tsx` (route between Board and Knowledge)

- [ ] **Step 1: Add Board / Knowledge tab to header**

In `web/src/components/BoardHeader.tsx`, add a section before the scope selector:

```tsx
type Section = 'board' | 'knowledge';

// add prop: section: Section, onSection: (s: Section) => void

<div className="inline-flex rounded-md border border-slate-300">
  <button
    className={`px-3 py-1 text-sm ${props.section === 'board' ? 'bg-slate-200' : ''}`}
    onClick={() => props.onSection('board')}
  >Board</button>
  <button
    className={`px-3 py-1 text-sm ${props.section === 'knowledge' ? 'bg-slate-200' : ''}`}
    onClick={() => props.onSection('knowledge')}
  >Knowledge</button>
</div>
```

- [ ] **Step 2: Route in `App.tsx`**

In `web/src/App.tsx`, replace the section that renders the board with:

```tsx
const [section, setSection] = useState<'board' | 'knowledge'>(
  window.location.pathname.startsWith('/knowledge') ? 'knowledge' : 'board',
);

useEffect(() => {
  const wanted = section === 'knowledge' ? '/knowledge' : '/';
  if (window.location.pathname !== wanted) window.history.replaceState({}, '', wanted);
}, [section]);

// ...
<BoardHeader /* existing props */ section={section} onSection={setSection} />
{section === 'board' ? <Board ... /> : <KnowledgeView />}
```

- [ ] **Step 3: Implement `KnowledgeRow.tsx`**

Create `web/src/components/KnowledgeRow.tsx`:

```tsx
import type { KnowledgeItem } from '../types';

const VIS_BADGE: Record<KnowledgeItem['visibility'], string> = {
  private: '🔒', inbox: '📥', shared: '👥',
};

export function KnowledgeRow({ item, onOpen }: { item: KnowledgeItem; onOpen: () => void }) {
  const host = item.url ? new URL(item.url).hostname : null;
  const snippet = item.body ? item.body.slice(0, 240) : '';
  const linked = item.linked_card_ids?.length ?? 0;
  return (
    <button
      onClick={onOpen}
      className="block w-full rounded-md border border-slate-200 bg-white p-3 text-left hover:border-slate-400"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-900">
            {item.url && '🔗 '}{item.title}
          </div>
          {host && <div className="text-xs text-slate-500">{host}</div>}
          {snippet && <div className="mt-1 line-clamp-2 text-sm text-slate-600">{snippet}</div>}
          {item.tags.length > 0 && (
            <div className="mt-1 text-xs text-slate-500">
              {item.tags.map(t => `#${t}`).join(' ')}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-xs text-slate-500">
          <span>{VIS_BADGE[item.visibility]}</span>
          {linked > 0 && <span>📎 {linked}</span>}
          {item.fetch_status === 'pending' && <span>⏳</span>}
          {item.fetch_status === 'failed' && <span className="text-red-600">⚠</span>}
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Implement `KnowledgeEditDialog.tsx`**

Create `web/src/components/KnowledgeEditDialog.tsx`:

```tsx
import { useState, useEffect } from 'react';
import type { KnowledgeItem, KnowledgeVisibility } from '../types';
import { knowledge } from '../api';

export type Initial = Partial<KnowledgeItem>;

export function KnowledgeEditDialog({
  initial, onClose, onSaved,
}: { initial?: Initial; onClose: () => void; onSaved: (k: KnowledgeItem) => void }) {
  const [url, setUrl] = useState(initial?.url ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [titleAuto, setTitleAuto] = useState(initial?.title_auto ?? false);
  const [body, setBody] = useState(initial?.body ?? '');
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(' '));
  const [visibility, setVisibility] = useState<KnowledgeVisibility>(initial?.visibility ?? 'private');
  const [autoFetch, setAutoFetch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function onUrlChange(v: string) {
    setUrl(v);
    if (!title.trim() && v) {
      try {
        const h = new URL(v).hostname;
        setTitle(h);
        setTitleAuto(true);
      } catch { /* ignore */ }
    }
  }
  function onTitleChange(v: string) {
    setTitle(v);
    if (titleAuto) setTitleAuto(false);
  }

  const canSave = !busy && title.trim().length > 0 && (url.trim() || body.trim());

  async function save() {
    setBusy(true); setErr(null);
    try {
      const tags = tagsText.split(/\s+/).map(t => t.replace(/^#/, '')).filter(Boolean);
      const payload = {
        title: title.trim(),
        title_auto: titleAuto,
        url: url.trim() || null,
        body,
        tags,
        visibility,
        auto_fetch: autoFetch,
      };
      const k = initial?.id
        ? await knowledge.update(initial.id, payload)
        : await knowledge.create(payload as any);
      onSaved(k);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-md bg-white p-4 shadow-xl">
        <h2 className="mb-3 text-lg font-semibold">{initial?.id ? 'Edit' : 'New'} knowledge</h2>
        <label className="mb-2 block text-sm">URL
          <input className="mt-1 w-full rounded border px-2 py-1" type="url"
                 value={url} onChange={e => onUrlChange(e.target.value)} />
        </label>
        <label className="mb-2 block text-sm">Title
          <input className="mt-1 w-full rounded border px-2 py-1" type="text"
                 value={title} onChange={e => onTitleChange(e.target.value)} />
        </label>
        <label className="mb-2 block text-sm">Body
          <textarea className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" rows={12}
                    value={body} onChange={e => setBody(e.target.value)} />
        </label>
        <label className="mb-2 block text-sm">Tags (space-separated)
          <input className="mt-1 w-full rounded border px-2 py-1" type="text"
                 value={tagsText} onChange={e => setTagsText(e.target.value)} />
        </label>
        <fieldset className="mb-2 text-sm">
          <legend>Visibility</legend>
          {(['private','inbox','shared'] as const).map(v => (
            <label key={v} className="mr-3">
              <input type="radio" name="vis" checked={visibility === v} onChange={() => setVisibility(v)} /> {v}
            </label>
          ))}
        </fieldset>
        <label className="mb-3 block text-sm">
          <input type="checkbox" checked={autoFetch} onChange={e => setAutoFetch(e.target.checked)} />
          {' '}Auto-fetch when I save
        </label>
        {err && <div className="mb-2 text-sm text-red-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1 text-sm">Cancel</button>
          <button onClick={save} disabled={!canSave}
                  className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement `KnowledgeDetail.tsx`**

Create `web/src/components/KnowledgeDetail.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { KnowledgeItem, Card } from '../types';
import { knowledge, cards as cardsApi } from '../api';

export function KnowledgeDetail({
  item, currentUserId, onClose, onEdit,
}: {
  item: KnowledgeItem; currentUserId: string;
  onClose: () => void; onEdit: () => void;
}) {
  const [linked, setLinked] = useState<Card[]>([]);
  const [picker, setPicker] = useState(false);
  const [pickerQ, setPickerQ] = useState('');
  const [candidates, setCandidates] = useState<Card[]>([]);

  useEffect(() => {
    (async () => {
      // Fetch each linked card; or if cards API has bulk, use that. For simplicity, fetch from full list once.
      if (!item.linked_card_ids?.length) { setLinked([]); return; }
      const all = await cardsApi.list({ scope: 'all' });
      setLinked(all.filter(c => item.linked_card_ids!.includes(c.id)));
    })();
  }, [item.id, item.linked_card_ids]);

  async function attach(cardId: string) {
    await knowledge.link(item.id, cardId);
    const k = await knowledge.get(item.id);
    item.linked_card_ids = k.linked_card_ids;
    const all = await cardsApi.list({ scope: 'all' });
    setLinked(all.filter(c => k.linked_card_ids!.includes(c.id)));
    setPicker(false); setPickerQ('');
  }

  async function detach(cardId: string) {
    await knowledge.unlink(item.id, cardId);
    setLinked(prev => prev.filter(c => c.id !== cardId));
  }

  useEffect(() => {
    if (!picker) return;
    (async () => {
      const all = await cardsApi.list({ scope: 'all' });
      const q = pickerQ.toLowerCase();
      setCandidates(all
        .filter(c => !item.linked_card_ids?.includes(c.id))
        .filter(c => !q || c.title.toLowerCase().includes(q))
        .slice(0, 12));
    })();
  }, [picker, pickerQ]);

  const isOwner = item.owner_id === currentUserId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-md bg-white p-4 shadow-xl">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold">{item.title}</h2>
          <button onClick={onClose} className="text-sm text-slate-500">Close</button>
        </div>
        {item.url && (
          <a href={item.url} target="_blank" rel="noreferrer"
             className="break-all text-sm text-blue-600 underline">{item.url}</a>
        )}
        <div className="mt-1 text-xs text-slate-500">
          {item.visibility} · {item.fetched_at ? `fetched ${item.fetched_at}` : 'no fetch'}
        </div>
        {item.fetch_error && <div className="mt-1 text-xs text-red-600">{item.fetch_error}</div>}
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-sm">{item.body}</pre>

        <div className="mt-4">
          <div className="mb-1 text-sm font-medium">Linked cards</div>
          <ul className="text-sm">
            {linked.map(c => (
              <li key={c.id} className="flex items-center justify-between border-b py-1">
                <span>{c.title}</span>
                {isOwner && <button onClick={() => detach(c.id)} className="text-xs text-red-600">remove</button>}
              </li>
            ))}
            {linked.length === 0 && <li className="text-xs text-slate-500">none</li>}
          </ul>
          <div className="mt-2">
            <button onClick={() => setPicker(p => !p)} className="rounded border px-2 py-1 text-xs">
              + Attach card
            </button>
            {picker && (
              <div className="mt-2 rounded border p-2">
                <input className="mb-1 w-full rounded border px-2 py-1 text-sm"
                       placeholder="search..." value={pickerQ}
                       onChange={e => setPickerQ(e.target.value)} />
                <ul className="max-h-48 overflow-auto">
                  {candidates.map(c => (
                    <li key={c.id}>
                      <button onClick={() => attach(c.id)} className="block w-full px-2 py-1 text-left text-sm hover:bg-slate-100">
                        {c.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {isOwner && (
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={async () => { await knowledge.refetch(item.id); }} className="rounded border px-2 py-1 text-sm">
              Refetch
            </button>
            <button onClick={onEdit} className="rounded border px-2 py-1 text-sm">Edit</button>
            <button onClick={async () => { await knowledge.archive(item.id); onClose(); }}
                    className="rounded border border-red-300 px-2 py-1 text-sm text-red-700">Archive</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Implement `KnowledgeView.tsx`**

Create `web/src/KnowledgeView.tsx`:

```tsx
import { useState, useMemo, useDeferredValue } from 'react';
import { useKnowledge, type Scope } from './hooks/useKnowledge';
import { useAuth } from './auth';
import { KnowledgeRow } from './components/KnowledgeRow';
import { KnowledgeEditDialog } from './components/KnowledgeEditDialog';
import { KnowledgeDetail } from './components/KnowledgeDetail';
import type { KnowledgeItem } from './types';

export default function KnowledgeView() {
  const { me } = useAuth();
  const [scope, setScope] = useState<Scope>('mine');
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [tag, setTag] = useState<string | null>(null);
  const { items, reload } = useKnowledge(scope, dq, tag);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [detail, setDetail] = useState<KnowledgeItem | null>(null);
  const [creating, setCreating] = useState(false);

  const topTags = useMemo(() => {
    const c = new Map<string, number>();
    for (const k of items) for (const t of k.tags) c.set(t, (c.get(t) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(e => e[0]);
  }, [items]);

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <select value={scope} onChange={e => setScope(e.target.value as Scope)}
                className="rounded border px-2 py-1 text-sm">
          <option value="mine">mine</option>
          <option value="inbox">inbox</option>
          <option value="all">all</option>
        </select>
        <input
          className="flex-1 rounded border px-2 py-1 text-sm"
          placeholder="🔎 search..."
          value={q} onChange={e => setQ(e.target.value)}
        />
        <button onClick={() => setCreating(true)} className="rounded bg-slate-900 px-3 py-1 text-sm text-white">
          + New
        </button>
      </div>
      {topTags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {topTags.map(t => (
            <button key={t}
                    onClick={() => setTag(prev => prev === t ? null : t)}
                    className={`rounded-full border px-2 py-0.5 text-xs ${tag === t ? 'bg-slate-900 text-white' : ''}`}>
              #{t}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {items.map(item => (
          <KnowledgeRow key={item.id} item={item} onOpen={() => setDetail(item)} />
        ))}
        {items.length === 0 && <div className="py-12 text-center text-slate-500 text-sm">No knowledge yet.</div>}
      </div>
      {creating && (
        <KnowledgeEditDialog
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); reload(); }}
        />
      )}
      {editing && (
        <KnowledgeEditDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={k => { setEditing(null); setDetail(k); }}
        />
      )}
      {detail && me && (
        <KnowledgeDetail
          item={detail}
          currentUserId={me.id}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditing(detail); setDetail(null); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors. Fix any naming mismatches (e.g. `cards.list` vs project's actual API method names).

- [ ] **Step 8: Manual smoke**

Run dev (`cd web && npm run dev` and `cd server && npm run dev`). Open `http://localhost:5173`. Click Knowledge tab. Click `+ New`. Paste URL, save. Watch list update.

- [ ] **Step 9: Commit**

```bash
git add web/src/KnowledgeView.tsx web/src/components/KnowledgeRow.tsx \
        web/src/components/KnowledgeEditDialog.tsx web/src/components/KnowledgeDetail.tsx \
        web/src/components/BoardHeader.tsx web/src/App.tsx
git commit -m "feat(knowledge): web Knowledge view (list, search, edit, detail)"
```

---

## Task 8: Web — card edit dialog integration + PWA share target

**Files:**
- Modify: `web/src/components/EditDialog.tsx` (Knowledge subsection: list, attach, save-as-knowledge)
- Modify: `web/public/manifest.webmanifest`
- Modify: `web/src/App.tsx` (handle `/knowledge/share?...` query)

- [ ] **Step 1: Add Knowledge subsection to `EditDialog.tsx`**

In `web/src/components/EditDialog.tsx`, after the Tags section, add:

```tsx
import { knowledge } from '../api';
import type { KnowledgeItem } from '../types';

// inside the component, with the existing useState block:
const [linked, setLinked] = useState<KnowledgeItem[]>([]);
const [picking, setPicking] = useState(false);
const [pickerQ, setPickerQ] = useState('');
const [candidates, setCandidates] = useState<KnowledgeItem[]>([]);

useEffect(() => {
  if (!card?.id) return;
  knowledge.listForCard(card.id).then(setLinked).catch(() => {});
}, [card?.id]);

const cardUrl = useMemo(() => {
  const m = (card?.description ?? '').match(/https?:\/\/[^\s)\]]+/);
  return m?.[0] ?? null;
}, [card?.description]);

const alreadyHasUrlLink = useMemo(() => {
  if (!cardUrl) return false;
  return linked.some(k => k.url === cardUrl);
}, [linked, cardUrl]);

async function saveAsKnowledge() {
  if (!card?.id) return;
  await knowledge.fromCard(card.id);
  const items = await knowledge.listForCard(card.id);
  setLinked(items);
}

useEffect(() => {
  if (!picking) return;
  (async () => {
    const r = await knowledge.list({ scope: 'all', q: pickerQ || undefined });
    const linkedIds = new Set(linked.map(k => k.id));
    setCandidates(r.items.filter(k => !linkedIds.has(k.id)).slice(0, 12));
  })();
}, [picking, pickerQ]);

async function attach(id: string) {
  if (!card?.id) return;
  await knowledge.link(id, card.id);
  setLinked(await knowledge.listForCard(card.id));
  setPicking(false); setPickerQ('');
}

async function detach(id: string) {
  if (!card?.id) return;
  await knowledge.unlink(id, card.id);
  setLinked(prev => prev.filter(k => k.id !== id));
}
```

JSX (add below Tags):

```tsx
<section className="mt-3">
  <div className="mb-1 text-xs font-medium text-slate-700">Knowledge</div>
  <ul className="text-sm">
    {linked.map(k => (
      <li key={k.id} className="flex items-center justify-between border-b py-1">
        <span className="truncate">
          {k.url ? '🔗 ' : ''}{k.title}
          <span className="ml-1 text-xs text-slate-500">{k.visibility === 'private' ? '🔒' : k.visibility === 'inbox' ? '📥' : '👥'}</span>
        </span>
        <button onClick={() => detach(k.id)} className="text-xs text-red-600">remove</button>
      </li>
    ))}
    {linked.length === 0 && <li className="text-xs text-slate-500">none</li>}
  </ul>
  <div className="mt-2 flex gap-2">
    <button onClick={() => setPicking(p => !p)} className="rounded border px-2 py-1 text-xs">+ Attach</button>
    {cardUrl && !alreadyHasUrlLink && (
      <button onClick={saveAsKnowledge} className="rounded border px-2 py-1 text-xs">Save as knowledge</button>
    )}
  </div>
  {picking && (
    <div className="mt-2 rounded border p-2">
      <input className="mb-1 w-full rounded border px-2 py-1 text-sm"
             placeholder="search knowledge..." value={pickerQ}
             onChange={e => setPickerQ(e.target.value)} />
      <ul className="max-h-48 overflow-auto">
        {candidates.map(k => (
          <li key={k.id}>
            <button onClick={() => attach(k.id)} className="block w-full px-2 py-1 text-left text-sm hover:bg-slate-100">
              {k.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )}
</section>
```

- [ ] **Step 2: Add `share_target` to manifest**

Edit `web/public/manifest.webmanifest`. Add at the top level of the JSON object:

```json
"share_target": {
  "action": "/knowledge/share",
  "method": "GET",
  "params": { "title": "title", "text": "text", "url": "url" }
}
```

- [ ] **Step 3: Handle `/knowledge/share` in `App.tsx`**

In `web/src/App.tsx` after the existing `section` state:

```tsx
const [shareInitial, setShareInitial] = useState<{ title?: string; url?: string; body?: string } | null>(null);

useEffect(() => {
  if (window.location.pathname === '/knowledge/share') {
    const p = new URLSearchParams(window.location.search);
    setShareInitial({
      title: p.get('title') ?? undefined,
      url:   p.get('url') ?? undefined,
      body:  p.get('text') ?? undefined,
    });
    setSection('knowledge');
    window.history.replaceState({}, '', '/knowledge');
  }
}, []);

// pass shareInitial into KnowledgeView and clear after consumed
<KnowledgeView shareInitial={shareInitial} onShareConsumed={() => setShareInitial(null)} />
```

In `KnowledgeView.tsx`, accept those props:

```tsx
export default function KnowledgeView({
  shareInitial, onShareConsumed,
}: { shareInitial?: { title?: string; url?: string; body?: string } | null;
     onShareConsumed?: () => void } = {}) {
  // ...
  useEffect(() => {
    if (shareInitial) {
      setCreating(true);
      // pre-fill via local state — simplest: pass to KnowledgeEditDialog as initial
    }
  }, [shareInitial]);
  // when KnowledgeEditDialog is rendered for `creating`, pass `initial={shareInitial as any}` and call onShareConsumed in its onClose
}
```

- [ ] **Step 4: Type-check + smoke**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: build succeeds.

Manual smoke (web): create a card with URL in description, open edit, click "Save as knowledge"; verify item appears in Knowledge tab and as linked under card.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/EditDialog.tsx web/src/App.tsx web/src/KnowledgeView.tsx \
        web/public/manifest.webmanifest
git commit -m "feat(knowledge): card edit dialog integration + PWA share target"
```

---

## Task 9: Telegram bot (`/save`, `/note`, `/k`, `/klist`)

**Files:**
- Modify: `server/src/telegram/bot.ts` (handlers)
- Modify: `server/src/__tests__/telegram_parse.test.ts` (extend)

- [ ] **Step 1: Add parse tests**

Append to `server/src/__tests__/telegram_parse.test.ts`:

```ts
import { parseKnowledgeCommand } from '../telegram/bot.js';
// (Export parseKnowledgeCommand from bot.ts; see Step 3.)

test('parseKnowledgeCommand /save url only', () => {
  assert.deepEqual(
    parseKnowledgeCommand('/save https://example.com'),
    { cmd: 'save', url: 'https://example.com', title: undefined },
  );
});
test('parseKnowledgeCommand /save url | title', () => {
  assert.deepEqual(
    parseKnowledgeCommand('/save https://example.com | My Title'),
    { cmd: 'save', url: 'https://example.com', title: 'My Title' },
  );
});
test('parseKnowledgeCommand /note multi-line', () => {
  assert.deepEqual(
    parseKnowledgeCommand('/note buy eggs\nremember organic'),
    { cmd: 'note', title: 'buy eggs', body: 'remember organic' },
  );
});
test('parseKnowledgeCommand /k query', () => {
  assert.deepEqual(parseKnowledgeCommand('/k some query'), { cmd: 'k', q: 'some query' });
});
test('parseKnowledgeCommand /klist', () => {
  assert.deepEqual(parseKnowledgeCommand('/klist'), { cmd: 'klist' });
});
test('parseKnowledgeCommand empty /save', () => {
  assert.deepEqual(parseKnowledgeCommand('/save'), { cmd: 'save', error: 'no url' });
});
```

- [ ] **Step 2: Run tests; expect failure**

Run: `cd server && npm test -- --test-name-pattern='parseKnowledgeCommand'`
Expected: function not exported.

- [ ] **Step 3: Implement parser + handlers in `src/telegram/bot.ts`**

Add to `server/src/telegram/bot.ts`:

```ts
import {
  createKnowledge, listKnowledge, loadKnowledge, KnowledgeValidationError,
} from '../knowledge.js';
import { triggerFetch } from '../knowledge_fetch.js';
import { broadcast } from '../ws.js';

export type KnowledgeCommand =
  | { cmd: 'save'; url: string; title: string | undefined }
  | { cmd: 'save'; error: string }
  | { cmd: 'note'; title: string; body: string }
  | { cmd: 'note'; error: string }
  | { cmd: 'k'; q: string }
  | { cmd: 'k'; error: string }
  | { cmd: 'klist' }
  | null;

const URL_RE = /^https?:\/\/\S+/;

export function parseKnowledgeCommand(text: string): KnowledgeCommand {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('/save')) {
    const rest = trimmed.slice(5).trim();
    if (!rest) return { cmd: 'save', error: 'no url' };
    const [urlPart, ...titleParts] = rest.split('|').map(s => s.trim());
    if (!urlPart || !URL_RE.test(urlPart)) return { cmd: 'save', error: 'no url' };
    return { cmd: 'save', url: urlPart, title: titleParts.length ? titleParts.join('|').trim() : undefined };
  }
  if (trimmed.startsWith('/note')) {
    const rest = trimmed.slice(5);
    const stripped = rest.replace(/^\s+/, '');
    if (!stripped) return { cmd: 'note', error: 'no body' };
    const lines = stripped.split('\n');
    return { cmd: 'note', title: lines[0]!.slice(0, 200), body: lines.slice(1).join('\n').trimStart() };
  }
  if (trimmed.startsWith('/klist')) return { cmd: 'klist' };
  if (trimmed.startsWith('/k ') || trimmed === '/k') {
    const q = trimmed.slice(2).trim();
    if (!q) return { cmd: 'k', error: 'no query' };
    return { cmd: 'k', q };
  }
  return null;
}
```

In the message handler (locate the existing `bot.on('message:text', ...)` or DM check), add a branch before the AI proposal flow:

```ts
// Inside the DM (private chat) handler, before the AI proposal flow:
const cmd = parseKnowledgeCommand(ctx.message.text ?? '');
if (cmd) {
  const userId = await resolveAppUserFromTelegram(ctx.from?.id);
  if (!userId) {
    await ctx.reply('Link your Telegram identity in the app first.');
    return;
  }
  if (cmd.cmd === 'save') {
    if ('error' in cmd) {
      await ctx.reply('Usage: /save <url> [| title]');
      return;
    }
    const placeholder = await ctx.reply(`🔗 Saving ${new URL(cmd.url).hostname}...`);
    try {
      const titleAuto = !cmd.title;
      const k = await createKnowledge(userId, {
        title: cmd.title ?? new URL(cmd.url).hostname,
        title_auto: titleAuto,
        url: cmd.url,
        visibility: 'private',
        source: 'telegram',
        auto_fetch: true,
      });
      broadcast({ type: 'knowledge.created', knowledge: k });
      triggerFetch(k.id);
      // Edit placeholder after a short delay; re-fetch the row to read updated body.
      setTimeout(async () => {
        const updated = await loadKnowledge(k.id);
        const txt = updated?.fetch_status === 'ok'
          ? `✓ Saved · ${updated.title}`
          : updated?.fetch_status === 'failed'
            ? `⚠ Saved (no preview): ${updated.fetch_error ?? 'fetch failed'}`
            : `✓ Saved (still fetching) · ${k.title}`;
        await ctx.api.editMessageText(placeholder.chat.id, placeholder.message_id, txt, {
          reply_markup: {
            inline_keyboard: [[
              { text: '👥 Share with family', callback_data: `kshare:${k.id}` },
              { text: '🏷 Tag', callback_data: `ktag:${k.id}` },
              { text: '🗑 Discard', callback_data: `karchive:${k.id}` },
            ]],
          },
        }).catch(() => {});
      }, 4000);
    } catch (e) {
      const msg = e instanceof KnowledgeValidationError ? e.message : (e as Error).message;
      await ctx.api.editMessageText(placeholder.chat.id, placeholder.message_id,
        `Cannot save: ${msg}`).catch(() => {});
    }
    return;
  }
  if (cmd.cmd === 'note') {
    if ('error' in cmd) { await ctx.reply('Usage: /note <body>'); return; }
    try {
      const k = await createKnowledge(userId, {
        title: cmd.title, body: cmd.body, visibility: 'private',
        source: 'telegram', auto_fetch: false,
      });
      broadcast({ type: 'knowledge.created', knowledge: k });
      await ctx.reply(`✓ Note saved · ${k.title}`);
    } catch (e) {
      await ctx.reply(`Cannot save note: ${(e as Error).message}`);
    }
    return;
  }
  if (cmd.cmd === 'k') {
    if ('error' in cmd) { await ctx.reply('Usage: /k <query>'); return; }
    const items = await listKnowledge(userId, { q: cmd.q, scope: 'all', limit: 5 });
    if (items.length === 0) { await ctx.reply('Nothing matched.'); return; }
    const lines = items.map((k, i) =>
      `${i + 1}. ${k.title}${k.url ? ' — ' + new URL(k.url).hostname : ''}`).join('\n');
    await ctx.reply(lines, {
      reply_markup: {
        inline_keyboard: [items.map((k, i) => ({ text: `${i + 1}`, callback_data: `kshow:${k.id}` }))],
      },
    });
    return;
  }
  if (cmd.cmd === 'klist') {
    const items = await listKnowledge(userId, { scope: 'all', limit: 10 });
    if (items.length === 0) { await ctx.reply('No knowledge yet.'); return; }
    const lines = items.map((k, i) =>
      `${i + 1}. ${k.title}${k.url ? ' — ' + new URL(k.url).hostname : ''}`).join('\n');
    await ctx.reply(lines);
    return;
  }
}
```

Add callback handlers for `kshare`, `ktag`, `karchive`, `kshow` (mirror existing card callback pattern in same file).

For DM-only enforcement: wrap the entire knowledge-command branch with `if (ctx.chat?.type !== 'private') return;` (group invocations silently ignored).

- [ ] **Step 4: Run tests; expect pass**

Run: `cd server && npm test -- --test-name-pattern='parseKnowledgeCommand'`
Expected: PASS.

- [ ] **Step 5: Manual smoke**

DM the bot `/save https://example.com`. Expect placeholder, then edited final message with inline buttons. Then `/klist`. Then `/k example`.

- [ ] **Step 6: Commit**

```bash
git add server/src/telegram/bot.ts server/src/__tests__/telegram_parse.test.ts
git commit -m "feat(knowledge): Telegram /save /note /k /klist commands"
```

---

## Task 10: AI embeddings + semantic search (gated)

**Files:**
- Replace: `server/src/ai/embed_queue.ts`
- Create: `server/src/ai/embed.ts`
- Modify: `server/src/index.ts` (bootstrap pgvector)
- Modify: `server/src/routes/knowledge.ts` (`/search/semantic` endpoint)
- Create: `server/src/scripts/backfill_embeddings.ts`
- Create: `server/src/__tests__/knowledge_embed.test.ts`
- Modify: `.env.example` (add new vars)

- [ ] **Step 1: Write failing tests**

Create `server/src/__tests__/knowledge_embed.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueueEmbed, _flushEmbedQueueForTest } from '../ai/embed_queue.js';

test('enqueueEmbed is no-op when disabled', async () => {
  delete process.env.KNOWLEDGE_EMBEDDINGS;
  const stats = await _flushEmbedQueueForTest('any-id');
  assert.equal(stats.processed, 0);
});

test('enqueueEmbed queues and flushes when enabled (mocked)', async () => {
  process.env.KNOWLEDGE_EMBEDDINGS = 'true';
  process.env.OPENAI_API_KEY = 'test';
  enqueueEmbed('id-1');
  const stats = await _flushEmbedQueueForTest('id-1');
  assert.ok(stats.processed >= 0);
});
```

- [ ] **Step 2: Implement `src/ai/embed.ts`**

Create `server/src/ai/embed.ts`:

```ts
import OpenAI from 'openai';

const MODEL = 'text-embedding-3-small';

let client: OpenAI | null = null;
function getClient(): OpenAI | null {
  if (process.env.KNOWLEDGE_EMBEDDINGS !== 'true') return null;
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export function embeddingsEnabled(): boolean {
  return getClient() !== null;
}

export async function embedText(text: string): Promise<number[] | null> {
  const c = getClient();
  if (!c) return null;
  const trimmed = text.slice(0, 32_000);
  const res = await c.embeddings.create({ model: MODEL, input: trimmed });
  return res.data[0]!.embedding as number[];
}

export const EMBEDDING_MODEL = MODEL;
```

- [ ] **Step 3: Replace `src/ai/embed_queue.ts`**

Replace contents:

```ts
import { pool } from '../db.js';
import { embedText, embeddingsEnabled, EMBEDDING_MODEL } from './embed.js';

const queue: string[] = [];
const seen = new Set<string>();
let running = false;

export function enqueueEmbed(id: string): void {
  if (!embeddingsEnabled()) return;
  if (seen.has(id)) return;
  seen.add(id);
  queue.push(id);
  if (!running) drain();
}

async function processOne(id: string): Promise<{ ok: boolean }> {
  const r = await pool.query<{ title: string; body: string }>(
    `SELECT title, body FROM knowledge_items WHERE id = $1 AND NOT archived`, [id],
  );
  const row = r.rows[0];
  if (!row) return { ok: false };
  const text = `${row.title}\n\n${row.body ?? ''}`.trim();
  if (!text) return { ok: false };
  let attempt = 0;
  while (attempt < 2) {
    try {
      const vec = await embedText(text);
      if (!vec) return { ok: false };
      await pool.query(
        `INSERT INTO knowledge_embeddings (knowledge_id, embedding, model)
         VALUES ($1, $2::vector, $3)
         ON CONFLICT (knowledge_id) DO UPDATE
           SET embedding = EXCLUDED.embedding, model = EXCLUDED.model, embedded_at = NOW()`,
        [id, JSON.stringify(vec), EMBEDDING_MODEL],
      );
      return { ok: true };
    } catch (e) {
      attempt++;
      if (attempt >= 2) {
        console.warn('embed failed (giving up):', id, (e as Error).message);
        return { ok: false };
      }
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  return { ok: false };
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const id = queue.shift()!;
      seen.delete(id);
      try { await processOne(id); }
      catch (e) { console.warn('embed drain error:', e); }
    }
  } finally { running = false; }
}

export async function _flushEmbedQueueForTest(id: string): Promise<{ processed: number }> {
  if (!embeddingsEnabled()) return { processed: 0 };
  const idx = queue.indexOf(id);
  if (idx < 0) return { processed: 0 };
  queue.splice(idx, 1);
  seen.delete(id);
  await processOne(id);
  return { processed: 1 };
}
```

- [ ] **Step 4: Bootstrap pgvector at startup**

In `server/src/index.ts`, after schema/session setup (or wherever DB is initialized), add:

```ts
import { embeddingsEnabled } from './ai/embed.js';

if (process.env.KNOWLEDGE_EMBEDDINGS === 'true') {
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_embeddings (
        knowledge_id UUID PRIMARY KEY REFERENCES knowledge_items(id) ON DELETE CASCADE,
        embedding    vector(1536) NOT NULL,
        model        TEXT NOT NULL,
        embedded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_embed_cos
        ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)`);
    app.log.info(`knowledge embeddings enabled: ${embeddingsEnabled()}`);
  } catch (e) {
    app.log.warn({ err: e }, 'pgvector unavailable; semantic search disabled');
  }
}
```

- [ ] **Step 5: Add semantic search endpoint**

Append to `server/src/routes/knowledge.ts`:

```ts
import { embedText, embeddingsEnabled } from '../ai/embed.js';

  // POST /api/knowledge/search/semantic
  app.post<{ Body: { q: string; limit?: number; scope?: 'mine'|'inbox'|'all' } }>(
    '/api/knowledge/search/semantic',
    async (req, reply) => {
      const user = req.requireUser();
      if (!embeddingsEnabled()) {
        return reply.code(501).send({ error: 'semantic search disabled' });
      }
      const { q, limit = 10, scope = 'all' } = req.body ?? ({} as any);
      if (!q || typeof q !== 'string') return reply.code(400).send({ error: 'q required' });
      const vec = await embedText(q);
      if (!vec) return reply.code(501).send({ error: 'embed failed' });

      const params: unknown[] = [JSON.stringify(vec), user.id];
      const where: string[] = ['NOT k.archived'];
      where.push(`(
        k.owner_id = $2
        OR k.visibility = 'inbox'
        OR (k.visibility = 'shared'
            AND EXISTS (SELECT 1 FROM knowledge_shares ks
                        WHERE ks.knowledge_id = k.id AND ks.user_id = $2))
      )`);
      if (scope === 'mine')  where.push(`k.owner_id = $2`);
      if (scope === 'inbox') where.push(`k.visibility = 'inbox'`);
      params.push(Math.min(Math.max(limit, 1), 20));

      const sql = `
        SELECT k.*, (e.embedding <=> $1::vector) AS dist
        FROM knowledge_items k
        JOIN knowledge_embeddings e ON e.knowledge_id = k.id
        WHERE ${where.join(' AND ')}
        ORDER BY dist ASC
        LIMIT $${params.length}`;
      const r = await pool.query(sql, params);
      const items = r.rows.map((row: any) => ({ ...row, score: 1 - row.dist }));
      return reply.send({ items });
    },
  );
```

(`pool` import: add `import { pool } from '../db.js';` at top of file.)

- [ ] **Step 6: Backfill script**

Create `server/src/scripts/backfill_embeddings.ts`:

```ts
import { pool } from '../db.js';
import { embeddingsEnabled, embedText, EMBEDDING_MODEL } from '../ai/embed.js';

async function main() {
  if (!embeddingsEnabled()) {
    console.error('KNOWLEDGE_EMBEDDINGS=true and OPENAI_API_KEY required');
    process.exit(1);
  }
  while (true) {
    const r = await pool.query<{ id: string; title: string; body: string }>(
      `SELECT k.id, k.title, k.body FROM knowledge_items k
       LEFT JOIN knowledge_embeddings e ON e.knowledge_id = k.id
       WHERE e.knowledge_id IS NULL AND NOT k.archived
       ORDER BY k.updated_at DESC
       LIMIT 50`,
    );
    if (r.rows.length === 0) break;
    for (const row of r.rows) {
      const vec = await embedText(`${row.title}\n\n${row.body ?? ''}`);
      if (!vec) continue;
      await pool.query(
        `INSERT INTO knowledge_embeddings (knowledge_id, embedding, model)
         VALUES ($1, $2::vector, $3)`,
        [row.id, JSON.stringify(vec), EMBEDDING_MODEL],
      );
      console.log('embedded', row.id, row.title);
    }
    await new Promise(r => setTimeout(r, 250));
  }
  console.log('done');
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
```

Add npm script in `server/package.json`:
```json
"embed:backfill": "tsx src/scripts/backfill_embeddings.ts"
```

- [ ] **Step 7: Update `.env.example`**

Add:

```
# Knowledge — auto-fetch URL on save (default true)
KNOWLEDGE_AUTOFETCH=true
KNOWLEDGE_FETCH_TIMEOUT_MS=10000
KNOWLEDGE_BODY_MAX_CHARS=200000
# Knowledge — AI semantic search (requires OPENAI_API_KEY + pgvector extension)
KNOWLEDGE_EMBEDDINGS=false
```

- [ ] **Step 8: Run tests; expect pass**

Run: `cd server && npm test -- --test-name-pattern='enqueueEmbed'`
Expected: PASS (the API call test gracefully no-ops without real OpenAI key — `embedText` returns null when key missing).

- [ ] **Step 9: Manual smoke (optional, costs API calls)**

```bash
# Enable in .env: KNOWLEDGE_EMBEDDINGS=true and set OPENAI_API_KEY
cd server && npm run dev
# create some items, then:
npm run embed:backfill
curl -X POST -b kanban_session=<token> -H 'content-type: application/json' \
  http://localhost:3001/api/knowledge/search/semantic \
  -d '{"q":"how to fix sprinkler"}'
```
Expected: items list ranked by relevance.

- [ ] **Step 10: Commit**

```bash
git add server/src/ai/embed.ts server/src/ai/embed_queue.ts \
        server/src/scripts/backfill_embeddings.ts server/src/index.ts \
        server/src/routes/knowledge.ts server/src/__tests__/knowledge_embed.test.ts \
        server/package.json .env.example
git commit -m "feat(knowledge): pgvector + OpenAI semantic search (gated)"
```

---

## Final smoke checklist (post all tasks)

Re-run the spec's manual smoke checklist (§10) end-to-end:

1. Web `+ New` URL only, auto-fetch on → pending → ok with body within ~10s.
2. Web `+ New` body only → instant save, no fetch.
3. Web search box matches title; tag chip filter intersects.
4. Scope toggle mine/inbox/all behaves like board scope.
5. Edit visibility private→shared, add sharee → other user sees via WS.
6. Card edit dialog → attach knowledge → linked count appears.
7. Card with URL in description → "Save as knowledge" → item + auto-link.
8. PWA share target on phone → form prefilled → save works.
9. Telegram `/save https://example.com` in DM → placeholder → fetched body → buttons.
10. Telegram `/note buy eggs\nremember organic` → title="buy eggs".
11. Telegram `/k eggs` → returns the note; tap result → full body.
12. Telegram `/klist` → 10 most recent.
13. Telegram group `/save` → silently ignored.
14. SSRF: `/save http://localhost:3001` → blocked reply.
15. Embeddings off: `POST /search/semantic` → 501.
16. Embeddings on: enable env, run backfill, semantic search ranks by relevance.
17. Two browsers same user: edit in one → other updates via WS.
18. Non-owner PATCH on shared → 403.
19. Archive item → disappears from list.
