# Card Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users save reusable card configurations as named templates and instantiate cards from them via the web app and the Telegram bot.

**Architecture:** A new `card_templates` table holds per-user (private) and family-shared templates. A new `/api/templates` route module handles CRUD + a server-side `instantiate` endpoint that produces a card. The web Settings dialog gains a Templates tab; each Column gets a 📋 picker and a `/name` slash autocomplete. The Telegram bot adds `/use`, `/t`, and `/templates` DM commands.

**Tech Stack:** Node 22 + Fastify 4 + TypeScript ESM, PostgreSQL 16 (idempotent SQL), `pg` driver, `@fastify/websocket`, grammY (Telegram), React 18 + Vite + Tailwind, `node:test` (`tsx --test ...`) for backend tests.

**Spec:** `docs/superpowers/specs/2026-04-25-card-templates-design.md`

---

## File Structure

**Backend (server/):**
- Modify: `schema.sql` (add `card_templates` table + indexes)
- Create: `src/templates.ts` (data layer: types, queries, instantiate helper)
- Create: `src/routes/templates.ts` (HTTP routes)
- Modify: `src/index.ts` (register route module)
- Modify: `src/ws.ts` (extend `BroadcastEvent` with `template.*` events + visibility filter)
- Modify: `src/telegram/bot.ts` (handle `/use`, `/t`, `/templates`)
- Create: `src/__tests__/templates.test.ts` (data + visibility + instantiate)
- Modify: `src/__tests__/telegram_parse.test.ts` (extend with `/use`, `/t`, `/templates` parse cases)

**Frontend (web/):**
- Modify: `src/types.ts` (add `Template` type, extend `BroadcastEvent` types)
- Modify: `src/api.ts` (add `templates` API surface)
- Modify: `src/ws.ts` (extend `BroadcastEvent` with `template.*`)
- Create: `src/hooks/useTemplates.ts` (live list + WS subscription)
- Create: `src/components/TemplatesTab.tsx` (Settings dialog content)
- Modify: `src/components/SettingsDialog.tsx` (mount Templates tab)
- Modify: `src/components/Column.tsx` (📋 picker + slash autocomplete in quick-add)

---

## Task 1: Schema migration

**Files:**
- Modify: `server/schema.sql` (append new section at end of file, before any closing remarks)

- [ ] **Step 1: Append `card_templates` table to `schema.sql`**

Append after the `activity_log` block:

```sql
-- ---------- card templates ----------
CREATE TABLE IF NOT EXISTS card_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  visibility       TEXT NOT NULL CHECK (visibility IN ('private','shared')),
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  tags             TEXT[] NOT NULL DEFAULT '{}',
  status           card_status NOT NULL DEFAULT 'today',
  due_offset_days  INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS card_templates_owner_name_key
  ON card_templates (owner_id, lower(name));

CREATE INDEX IF NOT EXISTS card_templates_visibility_idx
  ON card_templates (visibility);
```

- [ ] **Step 2: Apply schema to local dev DB**

Run: `cd server && npm run db:init`
Expected: command succeeds (idempotent — safe to re-run on existing DB).

- [ ] **Step 3: Verify table exists**

Run: `psql postgresql://kanban:kanban@localhost:5432/kanban -c "\d card_templates"`
Expected: table description prints with all columns and the two indexes.

- [ ] **Step 4: Commit**

```bash
git add server/schema.sql
git commit -m "feat(templates): add card_templates table"
```

---

## Task 2: Data layer — types and basic queries

**Files:**
- Create: `server/src/templates.ts`
- Test: `server/src/__tests__/templates.test.ts`

- [ ] **Step 1: Write the failing test for `listTemplates` visibility**

Create `server/src/__tests__/templates.test.ts`:

```ts
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import {
  createTemplate,
  listTemplates,
  loadTemplate,
  updateTemplate,
  deleteTemplate,
  instantiateTemplate,
} from '../templates.js';

let userA = '';
let userB = '';

async function freshUser(name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash, short_name)
     VALUES ($1, $1 || '@test.local', 'x', $1) RETURNING id`,
    [name + '_' + Math.random().toString(36).slice(2, 8)],
  );
  return rows[0]!.id;
}

before(async () => {
  userA = await freshUser('alice');
  userB = await freshUser('bob');
});

after(async () => {
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userA, userB]]);
  await pool.end();
});

beforeEach(async () => {
  await pool.query(`DELETE FROM card_templates WHERE owner_id = ANY($1::uuid[])`, [[userA, userB]]);
});

test('listTemplates: private templates only visible to owner', async () => {
  await createTemplate(userA, {
    name: 'priv',
    visibility: 'private',
    title: 'private title',
  });
  const aList = await listTemplates(userA);
  const bList = await listTemplates(userB);
  assert.equal(aList.length, 1);
  assert.equal(bList.length, 0);
});

test('listTemplates: shared templates visible to all', async () => {
  await createTemplate(userA, {
    name: 'shared',
    visibility: 'shared',
    title: 'shared title',
  });
  const bList = await listTemplates(userB);
  assert.equal(bList.length, 1);
  assert.equal(bList[0]!.title, 'shared title');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --test-name-pattern='listTemplates'`
Expected: FAIL — `templates.js` does not exist.

- [ ] **Step 3: Create `server/src/templates.ts` with types and the queries the tests use**

```ts
import { pool } from './db.js';
import { isStatus, type Status } from './cards.js';

export type Visibility = 'private' | 'shared';

export type Template = {
  id: string;
  owner_id: string;
  name: string;
  visibility: Visibility;
  title: string;
  description: string;
  tags: string[];
  status: Status;
  due_offset_days: number | null;
  created_at: string;
  updated_at: string;
};

export type TemplateInput = {
  name: string;
  visibility: Visibility;
  title: string;
  description?: string;
  tags?: string[];
  status?: Status;
  due_offset_days?: number | null;
};

export type TemplatePatch = Partial<TemplateInput>;

const NAME_RE = /^\S(?:.{0,38}\S)?$/; // 1–40 chars, no leading/trailing whitespace, no whitespace-only

export class TemplateValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
  }
}

function validateInput(input: TemplateInput | TemplatePatch, partial: boolean): void {
  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || !NAME_RE.test(input.name)) {
      throw new TemplateValidationError('name', 'name must be 1–40 non-whitespace chars');
    }
  } else if (!partial) {
    throw new TemplateValidationError('name', 'name required');
  }
  if (input.visibility !== undefined) {
    if (input.visibility !== 'private' && input.visibility !== 'shared') {
      throw new TemplateValidationError('visibility', 'visibility must be private or shared');
    }
  } else if (!partial) {
    throw new TemplateValidationError('visibility', 'visibility required');
  }
  if (input.title !== undefined) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120) {
      throw new TemplateValidationError('title', 'title required, max 120 chars');
    }
  } else if (!partial) {
    throw new TemplateValidationError('title', 'title required');
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.length > 5) {
      throw new TemplateValidationError('tags', 'tags must be array of <=5');
    }
  }
  if (input.status !== undefined && !isStatus(input.status)) {
    throw new TemplateValidationError('status', 'invalid status');
  }
  if (input.due_offset_days !== undefined && input.due_offset_days !== null) {
    const n = input.due_offset_days;
    if (!Number.isInteger(n) || n < 0 || n > 365) {
      throw new TemplateValidationError('due_offset_days', 'must be integer 0–365');
    }
  }
}

function normaliseTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  for (const t of tags) {
    const v = String(t).toLowerCase().trim();
    if (v) seen.add(v);
  }
  return Array.from(seen).slice(0, 5);
}

export async function createTemplate(ownerId: string, input: TemplateInput): Promise<Template> {
  validateInput(input, false);
  const tags = normaliseTags(input.tags);
  const { rows } = await pool.query<Template>(
    `INSERT INTO card_templates
       (owner_id, name, visibility, title, description, tags, status, due_offset_days)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      ownerId,
      input.name,
      input.visibility,
      input.title,
      input.description ?? '',
      tags,
      input.status ?? 'today',
      input.due_offset_days ?? null,
    ],
  );
  return rows[0]!;
}

export async function listTemplates(userId: string): Promise<Template[]> {
  const { rows } = await pool.query<Template>(
    `SELECT * FROM card_templates
     WHERE owner_id = $1 OR visibility = 'shared'
     ORDER BY visibility DESC, lower(name) ASC`,
    [userId],
  );
  return rows;
}

export async function loadTemplate(id: string): Promise<Template | null> {
  const { rows } = await pool.query<Template>(
    `SELECT * FROM card_templates WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export function canUserSeeTemplate(userId: string, t: Template): boolean {
  return t.owner_id === userId || t.visibility === 'shared';
}

export async function updateTemplate(
  ownerId: string,
  id: string,
  patch: TemplatePatch,
): Promise<Template | null> {
  validateInput(patch, true);
  const t = await loadTemplate(id);
  if (!t) return null;
  if (t.owner_id !== ownerId) throw new TemplateValidationError('owner', 'forbidden');

  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, v: unknown) => {
    values.push(v);
    sets.push(`${col} = $${values.length}`);
  };

  if (patch.name !== undefined) push('name', patch.name);
  if (patch.visibility !== undefined) push('visibility', patch.visibility);
  if (patch.title !== undefined) push('title', patch.title);
  if (patch.description !== undefined) push('description', patch.description);
  if (patch.tags !== undefined) push('tags', normaliseTags(patch.tags));
  if (patch.status !== undefined) push('status', patch.status);
  if (patch.due_offset_days !== undefined) push('due_offset_days', patch.due_offset_days);
  if (sets.length === 0) return t;

  sets.push(`updated_at = NOW()`);
  values.push(id);
  const { rows } = await pool.query<Template>(
    `UPDATE card_templates SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteTemplate(ownerId: string, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM card_templates WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return (rowCount ?? 0) > 0;
}

// Look up a template by case-insensitive name visible to `userId`.
// Owner's private template wins ties over shared with same name.
export async function findTemplateByName(
  userId: string,
  name: string,
): Promise<Template | null> {
  const { rows } = await pool.query<Template>(
    `SELECT * FROM card_templates
     WHERE lower(name) = lower($1)
       AND (owner_id = $2 OR visibility = 'shared')
     ORDER BY (owner_id = $2) DESC
     LIMIT 1`,
    [name, userId],
  );
  return rows[0] ?? null;
}

// Instantiate is implemented in Task 4 — deliberately not yet exported here.
export async function instantiateTemplate(): Promise<never> {
  throw new Error('not implemented yet');
}
```

- [ ] **Step 4: Run tests to verify list visibility passes**

Run: `cd server && npm test -- --test-name-pattern='listTemplates'`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/templates.ts server/src/__tests__/templates.test.ts
git commit -m "feat(templates): data layer types, validation, list/load/create/update/delete"
```

---

## Task 3: Data layer — name uniqueness and lookup

**Files:**
- Modify: `server/src/__tests__/templates.test.ts` (add tests)

- [ ] **Step 1: Add the failing tests for uniqueness and findTemplateByName**

Append to `server/src/__tests__/templates.test.ts`:

```ts
test('createTemplate: duplicate name (case-insensitive) per owner rejects', async () => {
  await createTemplate(userA, { name: 'Grocery', visibility: 'private', title: 't' });
  await assert.rejects(
    createTemplate(userA, { name: 'grocery', visibility: 'private', title: 't' }),
    /duplicate key/,
  );
});

test('createTemplate: same name allowed across owners', async () => {
  await createTemplate(userA, { name: 'shared', visibility: 'private', title: 'A' });
  await createTemplate(userB, { name: 'shared', visibility: 'private', title: 'B' });
  const bList = await listTemplates(userB);
  assert.equal(bList.length, 1);
  assert.equal(bList[0]!.title, 'B');
});

test('findTemplateByName: private wins over shared on same name for owner', async () => {
  // userA has private "grocery", userB has shared "grocery"
  await createTemplate(userA, { name: 'grocery', visibility: 'private', title: 'A private' });
  await createTemplate(userB, { name: 'grocery', visibility: 'shared', title: 'B shared' });
  const t = await findTemplateByName(userA, 'GROCERY');
  assert.ok(t);
  assert.equal(t!.title, 'A private');
});

test('findTemplateByName: shared visible to non-owner', async () => {
  await createTemplate(userB, { name: 'grocery', visibility: 'shared', title: 'B shared' });
  const t = await findTemplateByName(userA, 'grocery');
  assert.ok(t);
  assert.equal(t!.title, 'B shared');
});

test('findTemplateByName: not found returns null', async () => {
  const t = await findTemplateByName(userA, 'missing');
  assert.equal(t, null);
});

test('updateTemplate: non-owner is rejected', async () => {
  const t = await createTemplate(userA, { name: 't', visibility: 'private', title: 'a' });
  await assert.rejects(
    updateTemplate(userB, t.id, { title: 'hacked' }),
    /forbidden/,
  );
});

test('deleteTemplate: non-owner cannot delete', async () => {
  const t = await createTemplate(userA, { name: 't', visibility: 'private', title: 'a' });
  const ok = await deleteTemplate(userB, t.id);
  assert.equal(ok, false);
  const still = await loadTemplate(t.id);
  assert.ok(still);
});

test('createTemplate: validation rejects empty title', async () => {
  await assert.rejects(
    createTemplate(userA, { name: 'x', visibility: 'private', title: '   ' }),
    /title/,
  );
});

test('createTemplate: validation rejects whitespace-only name', async () => {
  await assert.rejects(
    createTemplate(userA, { name: '   ', visibility: 'private', title: 't' }),
    /name/,
  );
});

test('createTemplate: tags lowercased and deduped', async () => {
  const t = await createTemplate(userA, {
    name: 'tagged',
    visibility: 'private',
    title: 't',
    tags: ['Home', 'home', 'DIY'],
  });
  assert.deepEqual(t.tags.sort(), ['diy', 'home']);
});
```

- [ ] **Step 2: Run all template tests**

Run: `cd server && npm test`
Expected: all template tests pass. The `instantiateTemplate` placeholder is not yet exercised.

- [ ] **Step 3: Commit**

```bash
git add server/src/__tests__/templates.test.ts
git commit -m "test(templates): name uniqueness, owner-only mutation, validation"
```

---

## Task 4: `instantiateTemplate` helper

**Files:**
- Modify: `server/src/templates.ts` (replace placeholder with real implementation)
- Modify: `server/src/__tests__/templates.test.ts` (add tests)

- [ ] **Step 1: Add the failing tests**

Append to `server/src/__tests__/templates.test.ts`:

```ts
test('instantiateTemplate: creates card with template fields, creator-as-assignee', async () => {
  const t = await createTemplate(userA, {
    name: 'g',
    visibility: 'private',
    title: 'Buy eggs',
    description: 'dozen',
    tags: ['groceries'],
    status: 'today',
  });
  const card = await instantiateTemplate(userA, t.id, { source: 'manual' });
  assert.ok(card);
  assert.equal(card!.title, 'Buy eggs');
  assert.equal(card!.description, 'dozen');
  assert.equal(card!.status, 'today');
  assert.deepEqual(card!.tags, ['groceries']);
  assert.equal(card!.created_by, userA);
  assert.deepEqual(card!.assignees, [userA]);
  assert.equal(card!.due_date, null);
});

test('instantiateTemplate: due_offset_days computes due_date = today + N', async () => {
  const t = await createTemplate(userA, {
    name: 'd',
    visibility: 'private',
    title: 'x',
    due_offset_days: 3,
  });
  const card = await instantiateTemplate(userA, t.id, { source: 'manual' });
  const todayUtc = new Date();
  todayUtc.setUTCDate(todayUtc.getUTCDate() + 3);
  const expected = todayUtc.toISOString().slice(0, 10);
  assert.equal(String(card!.due_date).slice(0, 10), expected);
});

test('instantiateTemplate: status_override wins over template status', async () => {
  const t = await createTemplate(userA, {
    name: 'col',
    visibility: 'private',
    title: 'x',
    status: 'today',
  });
  const card = await instantiateTemplate(userA, t.id, {
    source: 'manual',
    statusOverride: 'in_progress',
  });
  assert.equal(card!.status, 'in_progress');
});

test('instantiateTemplate: not visible returns null', async () => {
  const t = await createTemplate(userA, { name: 'p', visibility: 'private', title: 'x' });
  const card = await instantiateTemplate(userB, t.id, { source: 'manual' });
  assert.equal(card, null);
});

test('instantiateTemplate: source=telegram tagged correctly', async () => {
  const t = await createTemplate(userA, { name: 's', visibility: 'private', title: 'x' });
  const card = await instantiateTemplate(userA, t.id, { source: 'telegram' });
  assert.equal(card!.source, 'telegram');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npm test -- --test-name-pattern='instantiateTemplate'`
Expected: FAIL with "not implemented yet".

- [ ] **Step 3: Replace the placeholder in `server/src/templates.ts`**

Replace the placeholder `instantiateTemplate` export at the bottom of `server/src/templates.ts` with the implementation below. Also update the existing top-of-file import from `./cards.js` to add `loadCard, logActivity, type Card, type Source` (keeping the existing `isStatus, type Status` already imported in Task 2).

```ts
// Top-of-file imports (merge with existing line):
import { loadCard, logActivity, isStatus, type Card, type Source, type Status } from './cards.js';

export type InstantiateOpts = {
  source: Source;
  statusOverride?: Status;
  telegramChatId?: number;
  telegramMessageId?: number;
};

export async function instantiateTemplate(
  userId: string,
  templateId: string,
  opts: InstantiateOpts,
): Promise<Card | null> {
  const t = await loadTemplate(templateId);
  if (!t) return null;
  if (!canUserSeeTemplate(userId, t)) return null;

  const status: Status = opts.statusOverride ?? t.status;
  const dueDate =
    t.due_offset_days != null
      ? new Date(Date.now() + t.due_offset_days * 86_400_000).toISOString().slice(0, 10)
      : null;

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO cards
       (title, description, status, tags, due_date, source, created_by,
        telegram_chat_id, telegram_message_id, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
       COALESCE((SELECT MIN(position) - 1 FROM cards WHERE status = $3 AND NOT archived), 0))
     RETURNING id`,
    [
      t.title,
      t.description,
      status,
      t.tags,
      dueDate,
      opts.source,
      userId,
      opts.telegramChatId ?? null,
      opts.telegramMessageId ?? null,
    ],
  );
  const cardId = rows[0]!.id;

  // Default assignee = creator, mirroring the manual create path.
  await pool.query(
    `INSERT INTO card_assignees (card_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [cardId, userId],
  );

  await logActivity(userId, cardId, 'create', { template_id: t.id, template_name: t.name });
  return await loadCard(cardId);
}
```

Also remove the previous `instantiateTemplate` placeholder that throws, and ensure the new function is exported.

- [ ] **Step 4: Run all tests**

Run: `cd server && npm test`
Expected: all template tests pass, including the 5 new instantiate tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/templates.ts server/src/__tests__/templates.test.ts
git commit -m "feat(templates): instantiateTemplate creates card from template"
```

---

## Task 5: HTTP routes

**Files:**
- Create: `server/src/routes/templates.ts`
- Modify: `server/src/index.ts` (register route module)

- [ ] **Step 1: Create the route file**

Create `server/src/routes/templates.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { broadcast } from '../ws.js';
import {
  createTemplate,
  deleteTemplate,
  instantiateTemplate,
  listTemplates,
  loadTemplate,
  canUserSeeTemplate,
  updateTemplate,
  TemplateValidationError,
  type TemplateInput,
  type TemplatePatch,
} from '../templates.js';
import type { Status } from '../cards.js';

function handleValidation(reply: any, err: unknown): boolean {
  if (err instanceof TemplateValidationError) {
    if (err.field === 'owner') {
      reply.code(403).send({ error: 'forbidden' });
    } else {
      reply.code(400).send({ error: err.message, field: err.field });
    }
    return true;
  }
  // Unique-violation surface
  if (err && typeof err === 'object' && (err as { code?: string }).code === '23505') {
    reply.code(409).send({ error: 'Template name already exists' });
    return true;
  }
  return false;
}

export async function templateRoutes(app: FastifyInstance) {
  // GET /api/templates
  app.get('/api/templates', { preHandler: requireUser }, async (req) => {
    return listTemplates(req.user!.id);
  });

  // GET /api/templates/:id
  app.get<{ Params: { id: string } }>(
    '/api/templates/:id',
    { preHandler: requireUser },
    async (req, reply) => {
      const t = await loadTemplate(req.params.id);
      if (!t || !canUserSeeTemplate(req.user!.id, t)) {
        return reply.code(404).send({ error: 'not found' });
      }
      return t;
    },
  );

  // POST /api/templates
  app.post<{ Body: TemplateInput }>(
    '/api/templates',
    { preHandler: requireUser },
    async (req, reply) => {
      try {
        const t = await createTemplate(req.user!.id, req.body);
        broadcast({ type: 'template.created', template: t } as any);
        return reply.code(201).send(t);
      } catch (err) {
        if (handleValidation(reply, err)) return;
        throw err;
      }
    },
  );

  // PATCH /api/templates/:id
  app.patch<{ Params: { id: string }; Body: TemplatePatch }>(
    '/api/templates/:id',
    { preHandler: requireUser },
    async (req, reply) => {
      try {
        const existing = await loadTemplate(req.params.id);
        if (!existing || !canUserSeeTemplate(req.user!.id, existing)) {
          return reply.code(404).send({ error: 'not found' });
        }
        const t = await updateTemplate(req.user!.id, req.params.id, req.body);
        if (!t) return reply.code(404).send({ error: 'not found' });
        broadcast({ type: 'template.updated', template: t } as any);
        return t;
      } catch (err) {
        if (handleValidation(reply, err)) return;
        throw err;
      }
    },
  );

  // DELETE /api/templates/:id
  app.delete<{ Params: { id: string } }>(
    '/api/templates/:id',
    { preHandler: requireUser },
    async (req, reply) => {
      const existing = await loadTemplate(req.params.id);
      if (!existing || !canUserSeeTemplate(req.user!.id, existing)) {
        return reply.code(404).send({ error: 'not found' });
      }
      const ok = await deleteTemplate(req.user!.id, req.params.id);
      if (!ok) return reply.code(403).send({ error: 'forbidden' });
      broadcast({ type: 'template.deleted', id: req.params.id, owner_id: existing.owner_id, visibility: existing.visibility } as any);
      return reply.code(204).send();
    },
  );

  // POST /api/templates/:id/instantiate
  app.post<{ Params: { id: string }; Body: { status_override?: Status } }>(
    '/api/templates/:id/instantiate',
    { preHandler: requireUser },
    async (req, reply) => {
      const card = await instantiateTemplate(req.user!.id, req.params.id, {
        source: 'manual',
        statusOverride: req.body?.status_override,
      });
      if (!card) return reply.code(404).send({ error: 'not found' });
      broadcast({ type: 'card.created', card });
      return reply.code(201).send(card);
    },
  );
}
```

- [ ] **Step 2: Register the route module in `server/src/index.ts`**

In `server/src/index.ts`, add the import alongside the other route imports:

```ts
import { templateRoutes } from './routes/templates.js';
```

Add the registration alongside the others (after `await app.register(reviewRoutes);`):

```ts
await app.register(templateRoutes);
```

- [ ] **Step 3: Type-check the server**

Run: `cd server && npx tsc --noEmit`
Expected: no errors. (The `as any` casts on broadcast events are intentional placeholders — Task 6 narrows the `BroadcastEvent` union and removes them.)

- [ ] **Step 4: Smoke test routes manually**

Run the dev server, then:

```bash
# create a template
curl -i -X POST http://localhost:3001/api/templates \
  -H 'Content-Type: application/json' \
  -b cookie.txt \
  -d '{"name":"grocery","visibility":"private","title":"Buy eggs"}'
# instantiate
curl -i -X POST http://localhost:3001/api/templates/<id>/instantiate \
  -b cookie.txt -H 'Content-Type: application/json' -d '{}'
```

Expected: 201 on create, 201 on instantiate with full card payload.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/templates.ts server/src/index.ts
git commit -m "feat(templates): HTTP routes (GET/POST/PATCH/DELETE/instantiate)"
```

---

## Task 6: WebSocket broadcast for templates

**Files:**
- Modify: `server/src/ws.ts`
- Modify: `server/src/routes/templates.ts` (drop the `as any` casts)
- Modify: `web/src/ws.ts`
- Modify: `web/src/types.ts`

- [ ] **Step 1: Extend the server `BroadcastEvent` union and add a per-client filter for templates**

Replace `server/src/ws.ts`'s `BroadcastEvent` and `broadcast` with:

```ts
import type { Template } from './templates.js';

export type BroadcastEvent =
  | { type: 'card.created'; card: Card }
  | { type: 'card.updated'; card: Card }
  | { type: 'card.deleted'; id: string }
  | { type: 'template.created'; template: Template }
  | { type: 'template.updated'; template: Template }
  | { type: 'template.deleted'; id: string; owner_id: string; visibility: 'private' | 'shared' };

function templateVisibleTo(t: Template | { owner_id: string; visibility: 'private' | 'shared' }, userId: string): boolean {
  return t.owner_id === userId || t.visibility === 'shared';
}

export function broadcast(ev: BroadcastEvent) {
  for (const c of clients) {
    if (c.socket.readyState !== 1 /* OPEN */) continue;
    if (ev.type === 'card.created' || ev.type === 'card.updated') {
      if (!cardVisibleTo(ev.card, c.userId)) continue;
    }
    if (ev.type === 'template.created' || ev.type === 'template.updated') {
      if (!templateVisibleTo(ev.template, c.userId)) continue;
    }
    if (ev.type === 'template.deleted') {
      if (!templateVisibleTo(ev, c.userId)) continue;
    }
    c.socket.send(JSON.stringify(ev));
  }
}
```

- [ ] **Step 2: Drop `as any` casts from `routes/templates.ts`**

In `server/src/routes/templates.ts`, remove the four `as any` casts on `broadcast({ ... } as any)` — TypeScript now infers correctly. Confirm that the `template.deleted` payload includes `id`, `owner_id`, `visibility` exactly.

- [ ] **Step 3: Type-check the server**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Mirror the union on the client**

Replace `web/src/ws.ts`'s `BroadcastEvent` with:

```ts
import type { Card } from './types.ts';
import type { Template } from './types.ts';

export type BroadcastEvent =
  | { type: 'hello'; user_id: string }
  | { type: 'card.created'; card: Card }
  | { type: 'card.updated'; card: Card }
  | { type: 'card.deleted'; id: string }
  | { type: 'template.created'; template: Template }
  | { type: 'template.updated'; template: Template }
  | { type: 'template.deleted'; id: string; owner_id: string; visibility: 'private' | 'shared' };
```

- [ ] **Step 5: Add the `Template` type to `web/src/types.ts`**

Append to `web/src/types.ts`:

```ts
export type TemplateVisibility = 'private' | 'shared';

export type Template = {
  id: string;
  owner_id: string;
  name: string;
  visibility: TemplateVisibility;
  title: string;
  description: string;
  tags: string[];
  status: Status;
  due_offset_days: number | null;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 6: Type-check the web build**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add server/src/ws.ts server/src/routes/templates.ts web/src/ws.ts web/src/types.ts
git commit -m "feat(templates): typed WS broadcast events with per-client visibility filter"
```

---

## Task 7: Web API client + `useTemplates` hook

**Files:**
- Modify: `web/src/api.ts`
- Create: `web/src/hooks/useTemplates.ts`

- [ ] **Step 1: Add the `templates` surface to `web/src/api.ts`**

Append inside the `api` object literal:

```ts
listTemplates: () => req<Template[]>('/api/templates'),
createTemplate: (b: {
  name: string;
  visibility: 'private' | 'shared';
  title: string;
  description?: string;
  tags?: string[];
  status?: Status;
  due_offset_days?: number | null;
}) => req<Template>('/api/templates', json(b)),
updateTemplate: (id: string, b: Partial<Template>) =>
  req<Template>(`/api/templates/${id}`, { ...json(b), method: 'PATCH' }),
deleteTemplate: (id: string) => req<void>(`/api/templates/${id}`, { method: 'DELETE' }),
instantiateTemplate: (id: string, body?: { status_override?: Status }) =>
  req<Card>(`/api/templates/${id}/instantiate`, json(body ?? {})),
```

Add `Template` to the existing import line at the top:

```ts
import type { ActivityEntry, Card, MirrorToken, ReviewData, Scope, Status, Template, User } from './types.ts';
```

- [ ] **Step 2: Create `web/src/hooks/useTemplates.ts`**

```ts
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Template } from '../types.ts';
import type { BroadcastEvent } from '../ws.ts';

let cache: Template[] | null = null;
const subscribers = new Set<(t: Template[]) => void>();

function publish(next: Template[]) {
  cache = next;
  for (const fn of subscribers) fn(next);
}

export function applyTemplateEvent(ev: BroadcastEvent) {
  if (cache === null) return;
  if (ev.type === 'template.created') {
    publish([...cache, ev.template].sort(sortFn));
  } else if (ev.type === 'template.updated') {
    publish(cache.map((t) => (t.id === ev.template.id ? ev.template : t)).sort(sortFn));
  } else if (ev.type === 'template.deleted') {
    publish(cache.filter((t) => t.id !== ev.id));
  }
}

function sortFn(a: Template, b: Template): number {
  if (a.visibility !== b.visibility) return a.visibility === 'shared' ? -1 : 1;
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

export function useTemplates(): {
  templates: Template[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [templates, setTemplates] = useState<Template[]>(cache ?? []);
  const [loading, setLoading] = useState(cache === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sub = (next: Template[]) => setTemplates(next);
    subscribers.add(sub);
    if (cache === null) {
      api
        .listTemplates()
        .then((list) => {
          publish(list.slice().sort(sortFn));
          setLoading(false);
        })
        .catch((e: Error) => {
          setError(e.message);
          setLoading(false);
        });
    }
    return () => {
      subscribers.delete(sub);
    };
  }, []);

  const refresh = async () => {
    const list = await api.listTemplates();
    publish(list.slice().sort(sortFn));
  };

  return { templates, loading, error, refresh };
}
```

- [ ] **Step 3: Wire `applyTemplateEvent` into the WS dispatcher in `web/src/App.tsx`**

Find the `connectWS(...)` call. The callback currently switches on card events. Add at the top of the callback (before the existing card cases):

```ts
import { applyTemplateEvent } from './hooks/useTemplates.ts';
// ...
if (ev.type === 'template.created' || ev.type === 'template.updated' || ev.type === 'template.deleted') {
  applyTemplateEvent(ev);
  return;
}
```

If `App.tsx` does not have a single dispatcher block, locate where the WS event handler is defined and add the early-return there. Run `grep -n connectWS web/src/App.tsx` to find the exact spot.

- [ ] **Step 4: Type-check the web build**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/api.ts web/src/hooks/useTemplates.ts web/src/App.tsx
git commit -m "feat(templates): web API surface + useTemplates hook with WS subscription"
```

---

## Task 8: Settings dialog Templates tab

**Files:**
- Create: `web/src/components/TemplatesTab.tsx`
- Modify: `web/src/components/SettingsDialog.tsx`

- [ ] **Step 1: Create `web/src/components/TemplatesTab.tsx`**

```tsx
import { useState } from 'react';
import { api } from '../api.ts';
import { STATUSES, STATUS_LABELS } from '../types.ts';
import type { Status, Template, TemplateVisibility, User } from '../types.ts';
import { useTemplates } from '../hooks/useTemplates.ts';

type Props = { me: User };

type FormState = {
  id: string | null;
  name: string;
  visibility: TemplateVisibility;
  title: string;
  description: string;
  tags: string;
  status: Status;
  dueOffsetDays: string;
};

const empty: FormState = {
  id: null,
  name: '',
  visibility: 'private',
  title: '',
  description: '',
  tags: '',
  status: 'today',
  dueOffsetDays: '',
};

export function TemplatesTab({ me }: Props) {
  const { templates, loading, error } = useTemplates();
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const startNew = () => {
    setErrMsg(null);
    setForm({ ...empty });
  };

  const startEdit = (t: Template) => {
    setErrMsg(null);
    setForm({
      id: t.id,
      name: t.name,
      visibility: t.visibility,
      title: t.title,
      description: t.description,
      tags: t.tags.join(' '),
      status: t.status,
      dueOffsetDays: t.due_offset_days == null ? '' : String(t.due_offset_days),
    });
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErrMsg(null);
    const tagsArr = form.tags.split(/\s+/).map((t) => t.replace(/^#/, '')).filter(Boolean);
    const payload = {
      name: form.name.trim(),
      visibility: form.visibility,
      title: form.title.trim(),
      description: form.description,
      tags: tagsArr,
      status: form.status,
      due_offset_days: form.dueOffsetDays === '' ? null : Number(form.dueOffsetDays),
    };
    try {
      if (form.id) {
        await api.updateTemplate(form.id, payload as Partial<Template>);
      } else {
        await api.createTemplate(payload);
      }
      setForm(null);
    } catch (e) {
      setErrMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: Template) => {
    if (t.owner_id !== me.id) return;
    if (!confirm(`Delete template "${t.name}"?`)) return;
    setBusy(true);
    try {
      await api.deleteTemplate(t.id);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="p-4 text-sm text-neutral-400">Loading…</div>;
  if (error) return <div className="p-4 text-sm text-red-400">{error}</div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Templates</h3>
        <button
          onClick={startNew}
          className="rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600"
        >
          + New template
        </button>
      </div>

      {form && (
        <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-sm">
          {errMsg && <p className="mb-2 text-xs text-red-400">{errMsg}</p>}
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-1 flex flex-col text-xs">
              Name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 rounded bg-neutral-800 px-2 py-1 text-sm"
              />
            </label>
            <label className="col-span-1 flex flex-col text-xs">
              Visibility
              <select
                value={form.visibility}
                onChange={(e) =>
                  setForm({ ...form, visibility: e.target.value as TemplateVisibility })
                }
                className="mt-1 rounded bg-neutral-800 px-2 py-1 text-sm"
              >
                <option value="private">🔒 Private</option>
                <option value="shared">👥 Shared</option>
              </select>
            </label>
            <label className="col-span-2 flex flex-col text-xs">
              Title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="mt-1 rounded bg-neutral-800 px-2 py-1 text-sm"
              />
            </label>
            <label className="col-span-2 flex flex-col text-xs">
              Description
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1 min-h-[60px] rounded bg-neutral-800 px-2 py-1 text-sm"
              />
            </label>
            <label className="col-span-2 flex flex-col text-xs">
              Tags (space-separated)
              <input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                className="mt-1 rounded bg-neutral-800 px-2 py-1 text-sm"
              />
            </label>
            <label className="col-span-1 flex flex-col text-xs">
              Status
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
                className="mt-1 rounded bg-neutral-800 px-2 py-1 text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-1 flex flex-col text-xs">
              Due offset (days, optional)
              <input
                type="number"
                min={0}
                max={365}
                value={form.dueOffsetDays}
                onChange={(e) => setForm({ ...form, dueOffsetDays: e.target.value })}
                className="mt-1 rounded bg-neutral-800 px-2 py-1 text-sm"
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              disabled={busy}
              onClick={save}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setForm(null)}
              className="rounded bg-neutral-700 px-3 py-1 text-xs hover:bg-neutral-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-1">
        {templates.length === 0 && (
          <li className="py-3 text-center text-xs text-neutral-500">No templates yet.</li>
        )}
        {templates.map((t) => {
          const mine = t.owner_id === me.id;
          return (
            <li
              key={t.id}
              className="flex items-center justify-between rounded bg-neutral-800 px-3 py-2 text-sm"
            >
              <div className="flex flex-col">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs">{t.visibility === 'private' ? '🔒' : '👥'}</span>
                </span>
                <span className="text-xs text-neutral-400">{t.title}</span>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={!mine || busy}
                  onClick={() => startEdit(t)}
                  className="text-xs text-neutral-300 hover:text-neutral-100 disabled:opacity-30"
                >
                  Edit
                </button>
                <button
                  disabled={!mine || busy}
                  onClick={() => remove(t)}
                  className="text-xs text-red-400 hover:text-red-300 disabled:opacity-30"
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Mount the tab in `SettingsDialog.tsx`**

Read `web/src/components/SettingsDialog.tsx` to find the existing tab pattern. Add a "Templates" tab in the same style and render `<TemplatesTab me={me} />` when active. The user object (`me`) should already be available — pass it through.

If the dialog uses a switch/match on a `tab` state variable, add a new case `'templates'`. If it uses an array of tab definitions, add an entry `{ id: 'templates', label: 'Templates', render: () => <TemplatesTab me={me} /> }` at the appropriate spot.

- [ ] **Step 3: Build the web app to confirm no errors**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual smoke**

```
cd web && npm run dev
```

Open the app, sign in, open Settings → Templates tab. Verify:
- "+ New template" opens the form.
- Saving a private template appears in the list with 🔒 badge.
- Edit + Delete buttons are disabled for templates owned by other users.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/TemplatesTab.tsx web/src/components/SettingsDialog.tsx
git commit -m "feat(templates): Settings dialog Templates tab with full CRUD"
```

---

## Task 9: Column quick-add picker (📋 button)

**Files:**
- Modify: `web/src/components/Column.tsx`

- [ ] **Step 1: Add the picker UI to `Column.tsx`**

Replace the header block of the existing `Column.tsx` (the `<div className="mb-3 flex items-center justify-between px-1">` row) with a version that adds a 📋 button. Also add a popover for the template list. Updated component structure:

```tsx
import { useEffect, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { api } from '../api.ts';
import type { Card, Status, User } from '../types.ts';
import { STATUS_LABELS } from '../types.ts';
import { CardView } from './CardView.tsx';
import { EmptyColumn } from './EmptyColumn.tsx';
import { useTemplates } from '../hooks/useTemplates.ts';

type Props = {
  status: Status;
  cards: Card[];
  users: User[];
  searchActive?: boolean;
  onCreate: (title: string) => void;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
};

export function Column({ status, cards, users, searchActive, onCreate, onEdit, onDelete }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}`, data: { status } });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const { templates } = useTemplates();

  useEffect(() => {
    const onAddCard = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.status === status) setAdding(true);
    };
    window.addEventListener('kanban:add-card', onAddCard);
    return () => window.removeEventListener('kanban:add-card', onAddCard);
  }, [status]);

  const submit = async () => {
    const t = draft.trim();
    if (t.startsWith('/') && !/\s/.test(t)) {
      const name = t.slice(1);
      const tpl = templates.find((tt) => tt.name.toLowerCase() === name.toLowerCase());
      if (tpl) {
        await api.instantiateTemplate(tpl.id, { status_override: status });
        setDraft('');
        setAdding(false);
        return;
      }
    }
    if (t) onCreate(t);
    setDraft('');
    setAdding(false);
  };

  const useTemplate = async (id: string) => {
    setShowPicker(false);
    await api.instantiateTemplate(id, { status_override: status });
  };

  return (
    <div
      ref={setNodeRef}
      data-column-status={status}
      className={`flex flex-col rounded-xl bg-neutral-900/40 p-3 min-h-[60vh] transition-colors
        ${isOver ? 'bg-neutral-800/60' : ''}`}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-neutral-200">{STATUS_LABELS[status]}</h2>
          <span className="text-xs text-neutral-500">{cards.length}</span>
        </div>
        <div className="flex items-center gap-1">
          {templates.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowPicker((v) => !v)}
                className="text-neutral-500 hover:text-neutral-200 text-sm"
                aria-label={`Use template in ${STATUS_LABELS[status]}`}
                title="Use template"
              >
                📋
              </button>
              {showPicker && (
                <ul className="absolute right-0 top-6 z-10 w-48 rounded border border-neutral-700 bg-neutral-900 py-1 shadow-lg">
                  {templates.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => useTemplate(t.id)}
                        className="block w-full px-3 py-1 text-left text-xs hover:bg-neutral-800"
                      >
                        <span className="mr-1">{t.visibility === 'private' ? '🔒' : '👥'}</span>
                        {t.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <button
            onClick={() => setAdding(true)}
            className="text-neutral-500 hover:text-neutral-200 text-lg leading-none"
            aria-label={`Add card to ${STATUS_LABELS[status]}`}
          >
            +
          </button>
        </div>
      </div>

      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {adding && (
            <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-2">
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  } else if (e.key === 'Escape') {
                    setDraft('');
                    setAdding(false);
                  }
                }}
                onBlur={submit}
                placeholder="New card… (or /template-name)"
                className="w-full resize-none bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
                rows={2}
              />
            </div>
          )}
          {cards.map((card) => (
            <CardView
              key={card.id}
              card={card}
              users={users}
              onClick={() => onEdit(card)}
              onDelete={() => onDelete(card.id)}
            />
          ))}
          {!adding && cards.length === 0 && (
            searchActive ? (
              <p className="py-8 text-center text-xs text-neutral-500">No cards match your search</p>
            ) : (
              <EmptyColumn status={status} />
            )
          )}
        </div>
      </SortableContext>
    </div>
  );
}
```

Note: the slash shortcut is folded into the existing `submit()` rather than a separate autocomplete popover. Reason: keeps the edit surface tiny and the placeholder hint communicates the feature. A richer autocomplete UI is YAGNI for v1.

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke**

Open dev server. Create a private template named `grocery`. In any column:
1. Click 📋 → list shows `grocery`. Click → card lands in the column.
2. Click `+`, type `/grocery`, press Enter → card lands in the column.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Column.tsx
git commit -m "feat(templates): column 📋 picker + /name slash shortcut in quick-add"
```

---

## Task 10: Telegram bot — parse helper for `/use`, `/t`, `/templates`

**Files:**
- Modify: `server/src/__tests__/telegram_parse.test.ts` (extend tests)

- [ ] **Step 1: Add the failing parse tests**

Append to `server/src/__tests__/telegram_parse.test.ts`:

```ts
test('parseCommand: /use <name>', () => {
  const r = parseCommand('/use grocery');
  assert.equal(r.command, 'use');
  assert.equal(r.rest, 'grocery');
});

test('parseCommand: /t alias', () => {
  const r = parseCommand('/t grocery');
  assert.equal(r.command, 't');
  assert.equal(r.rest, 'grocery');
});

test('parseCommand: /templates list command', () => {
  const r = parseCommand('/templates');
  assert.equal(r.command, 'templates');
  assert.equal(r.rest, '');
});

test('parseCommand: /use with @botname suffix', () => {
  const r = parseCommand('/use@familybot grocery');
  assert.equal(r.command, 'use');
  assert.equal(r.rest, 'grocery');
});

test('parseCommand: /use no arg', () => {
  const r = parseCommand('/use');
  assert.equal(r.command, 'use');
  assert.equal(r.rest, '');
});
```

- [ ] **Step 2: Run tests**

Run: `cd server && npm test -- --test-name-pattern='parseCommand'`
Expected: all pass — the existing `parseCommand` regex (`^\/(\w+)(?:@\w+)?\s*(.*)$`) already handles these without changes. If a test fails, fix the regex; otherwise no code change needed.

- [ ] **Step 3: Commit**

```bash
git add server/src/__tests__/telegram_parse.test.ts
git commit -m "test(telegram): /use, /t, /templates command parsing"
```

---

## Task 11: Telegram bot — handle `/use`, `/t`, `/templates`

**Files:**
- Modify: `server/src/telegram/bot.ts`

- [ ] **Step 1: Wire imports + handler**

In `server/src/telegram/bot.ts`, add at the top alongside other imports from `../templates.js`:

```ts
import { findTemplateByName, instantiateTemplate, listTemplates } from '../templates.js';
```

- [ ] **Step 2: Add the command branches in `handleText`**

Inside `handleText`, after the `/today` branch and before the AI-proposal block, insert:

```ts
// Templates: only meaningful in DM. Skip in group chats — silent.
if ((command === 'use' || command === 't') && isPrivate) {
  const name = rest.trim();
  if (!name) {
    await ctx.reply('Usage: `/use <template>` — see `/templates` for the list.', {
      parse_mode: 'Markdown',
    });
    return;
  }
  const tpl = await findTemplateByName(createdBy, name);
  if (!tpl) {
    await ctx.reply(`No template \`${escapeMd(name)}\`. Try /templates.`, {
      parse_mode: 'Markdown',
    });
    return;
  }
  const card = await instantiateTemplate(createdBy, tpl.id, {
    source: 'telegram',
    telegramChatId: chatId,
    telegramMessageId: ctx.msg?.message_id,
  });
  if (!card) {
    await ctx.reply('Template no longer exists.');
    return;
  }
  broadcast({ type: 'card.created', card });
  await logActivity(createdBy, card.id, 'telegram.template.use', { template_name: tpl.name });
  await reactOk(ctx);
  await ctx.reply(`✓ Saved · ${STATUS_EMOJI[card.status]} ${STATUS_LABEL[card.status]} — ${escapeMd(card.title)}`, {
    parse_mode: 'Markdown',
    reply_markup: postSaveKeyboard(card.id, card.status),
  });
  return;
}

if (command === 'templates' && isPrivate) {
  const list = await listTemplates(createdBy);
  if (list.length === 0) {
    await ctx.reply('No templates yet. Add one in Settings → Templates.');
    return;
  }
  const lines = list.map(
    (t) => `${t.visibility === 'private' ? '🔒' : '👥'} \`${escapeMd(t.name)}\` — ${escapeMd(t.title)}`,
  );
  await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  return;
}
```

Add the two helper maps near the other module-level constants (e.g. just below `ATTACHMENTS_DIR`):

```ts
const STATUS_EMOJI: Record<Status, string> = {
  backlog: '📥',
  today: '📅',
  in_progress: '⚡',
  done: '✅',
};

const STATUS_LABEL: Record<Status, string> = {
  backlog: 'Backlog',
  today: 'Today',
  in_progress: 'Doing',
  done: 'Done',
};
```

(They mirror the column labels users see in the UI; "Doing" is the human label for `in_progress`.)

- [ ] **Step 3: Type-check the server**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual smoke (requires linked Telegram account)**

DM the bot:
1. `/templates` — replies with list (or "no templates yet")
2. `/use grocery` — creates a card, reacts, replies with quick-action keyboard
3. `/use unknown` — friendly "no template" reply
4. `/use` — usage hint

In a group: `/use grocery` should be ignored (no response).

- [ ] **Step 5: Commit**

```bash
git add server/src/telegram/bot.ts
git commit -m "feat(templates): /use, /t, /templates DM commands"
```

---

## Task 12: HTTP route integration tests (visibility, 409, 403, 404)

**Files:**
- Create: `server/src/__tests__/template_routes.test.ts`

Note: existing tests use `node:test` with direct DB access — there is no Fastify-test harness in this project. Match that pattern: drive the route handlers via `app.inject()` (Fastify's built-in lightweight request injection — no port binding needed).

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/template_routes.test.ts`:

```ts
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { templateRoutes } from '../routes/templates.js';

const app = Fastify();
await app.register(cookie, { secret: 'test-secret' });
await app.register(authRoutes);
await app.register(templateRoutes);
await app.ready();

let cookieA = '';
let cookieB = '';
let userAId = '';
let userBId = '';

async function register(name: string): Promise<{ cookie: string; id: string }> {
  const email = `${name}_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name, short_name: name, email, password: 'password123' },
  });
  const setCookie = res.headers['set-cookie'];
  const cookieStr = (Array.isArray(setCookie) ? setCookie[0] : setCookie) as string;
  const id = (res.json() as { id: string }).id;
  return { cookie: cookieStr.split(';')[0]!, id };
}

before(async () => {
  const a = await register('alice');
  const b = await register('bob');
  cookieA = a.cookie;
  cookieB = b.cookie;
  userAId = a.id;
  userBId = b.id;
});

after(async () => {
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userAId, userBId]]);
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await pool.query(`DELETE FROM card_templates WHERE owner_id = ANY($1::uuid[])`, [[userAId, userBId]]);
});

test('POST /api/templates: 201 and returns template', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/templates',
    headers: { cookie: cookieA },
    payload: { name: 'g', visibility: 'private', title: 'Buy eggs' },
  });
  assert.equal(res.statusCode, 201);
  const t = res.json() as { id: string; name: string };
  assert.equal(t.name, 'g');
});

test('POST /api/templates: 409 on duplicate name', async () => {
  await app.inject({
    method: 'POST',
    url: '/api/templates',
    headers: { cookie: cookieA },
    payload: { name: 'g', visibility: 'private', title: 'x' },
  });
  const res = await app.inject({
    method: 'POST',
    url: '/api/templates',
    headers: { cookie: cookieA },
    payload: { name: 'g', visibility: 'private', title: 'x2' },
  });
  assert.equal(res.statusCode, 409);
});

test('PATCH /api/templates/:id by non-owner: 404', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/api/templates',
    headers: { cookie: cookieA },
    payload: { name: 'p', visibility: 'private', title: 'x' },
  });
  const id = (create.json() as { id: string }).id;
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/templates/${id}`,
    headers: { cookie: cookieB },
    payload: { title: 'hacked' },
  });
  // Non-visible (private + not owner) → 404 first.
  assert.equal(res.statusCode, 404);
});

test('PATCH /api/templates/:id by visible non-owner (shared): 403', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/api/templates',
    headers: { cookie: cookieA },
    payload: { name: 's', visibility: 'shared', title: 'x' },
  });
  const id = (create.json() as { id: string }).id;
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/templates/${id}`,
    headers: { cookie: cookieB },
    payload: { title: 'hacked' },
  });
  assert.equal(res.statusCode, 403);
});

test('GET /api/templates: lists own + shared, hides others private', async () => {
  await app.inject({
    method: 'POST',
    url: '/api/templates',
    headers: { cookie: cookieA },
    payload: { name: 'apriv', visibility: 'private', title: 'a' },
  });
  await app.inject({
    method: 'POST',
    url: '/api/templates',
    headers: { cookie: cookieA },
    payload: { name: 'ash', visibility: 'shared', title: 'a' },
  });
  const res = await app.inject({
    method: 'GET',
    url: '/api/templates',
    headers: { cookie: cookieB },
  });
  const list = res.json() as Array<{ name: string }>;
  assert.equal(list.length, 1);
  assert.equal(list[0]!.name, 'ash');
});

test('POST /api/templates/:id/instantiate: returns 201 and a card', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/api/templates',
    headers: { cookie: cookieA },
    payload: { name: 'inst', visibility: 'private', title: 'Eggs', status: 'today' },
  });
  const id = (create.json() as { id: string }).id;
  const res = await app.inject({
    method: 'POST',
    url: `/api/templates/${id}/instantiate`,
    headers: { cookie: cookieA },
    payload: {},
  });
  assert.equal(res.statusCode, 201);
  const card = res.json() as { title: string; status: string };
  assert.equal(card.title, 'Eggs');
  assert.equal(card.status, 'today');
});

test('POST instantiate by non-owner of private: 404', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/api/templates',
    headers: { cookie: cookieA },
    payload: { name: 'priv', visibility: 'private', title: 'x' },
  });
  const id = (create.json() as { id: string }).id;
  const res = await app.inject({
    method: 'POST',
    url: `/api/templates/${id}/instantiate`,
    headers: { cookie: cookieB },
    payload: {},
  });
  assert.equal(res.statusCode, 404);
});
```

- [ ] **Step 2: Run tests**

Run: `cd server && npm test`
Expected: all template + route tests pass. Existing telegram_parse tests still pass.

- [ ] **Step 3: Commit**

```bash
git add server/src/__tests__/template_routes.test.ts
git commit -m "test(templates): HTTP route integration via app.inject"
```

---

## Task 13: End-to-end smoke + final review

- [ ] **Step 1: Run the full test suite**

Run: `cd server && npm test`
Expected: every test passes. Capture the count.

- [ ] **Step 2: Type-check both halves**

Run: `cd server && npx tsc --noEmit && cd ../web && npx tsc --noEmit`
Expected: no errors in either.

- [ ] **Step 3: Build the web bundle**

Run: `cd web && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke checklist (post-build)**

With `cd server && npm run dev` and `cd web && npm run dev`:

1. Settings → Templates: create a private template `grocery`. Visible only to me.
2. Create a shared template `standup`. Both users see it.
3. Click 📋 in the Today column → instantiate `grocery` → card lands in Today.
4. In the Today column, click +, type `/standup`, Enter → card lands in Today.
5. Edit a template owned by another user → buttons disabled.
6. DM the bot `/templates` → list reply.
7. DM the bot `/use grocery` → card created, post-save keyboard shown.
8. DM `/use unknown` → friendly "no template" reply.
9. Two browsers same user: edit template in tab A → tab B updates.
10. Set `due_offset_days=3` → instantiated card has `due_date = today + 3`.

- [ ] **Step 5: Final commit (only if any fixups were needed)**

If any fixups are required during smoke testing, commit them as a final pass.

```bash
git add -p
git commit -m "fix(templates): final smoke pass"
```

If the smoke pass produced no changes, skip this step.

---

## Self-Review Notes

**Spec coverage:**
- §3 schema → Task 1
- §4 API → Tasks 2–5, 12
- §5 Web UI → Tasks 7–9
- §6 Telegram → Tasks 10–11
- §7 errors → Tasks 5, 12
- §8 tests → Tasks 2–4, 10, 12
- §9 rollout → Task 13 manual smoke

**Type consistency:** `Status` always uses the existing `card_status` enum values (`backlog | today | in_progress | done`). `Visibility` is `'private' | 'shared'` consistently. `instantiateTemplate` is implemented in Task 4 after being declared as a placeholder in Task 2 — both tasks reference the same eventual signature.

**Placeholders:** none — every step shows the actual code.

**Known minor gaps from "ideal":**
- The slash autocomplete is a substring exact-match in `submit()` rather than an inline popover. The placeholder hint communicates the feature; richer autocomplete is YAGNI.
- No FE tests — matches the existing project's footprint. Manual smoke checklist substitutes.
