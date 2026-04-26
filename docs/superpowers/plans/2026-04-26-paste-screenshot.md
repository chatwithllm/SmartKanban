# Paste Screenshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users paste an image from the OS clipboard to attach it to the open card or to create a new card in Today with the image and an AI-generated title.

**Architecture:** Two new server endpoints (`POST /api/cards/:id/attachments` and `POST /api/cards/from-image`) accept multipart uploads, validate MIME + size, persist to disk under `data/attachments/<card_id>/<uuid>.<ext>`, and insert a `card_attachments` row. The `from-image` endpoint additionally calls the existing `summarizeImage(filePath)` helper for an AI title; on failure it falls back to a timestamped title and sets `needs_review=true`. Frontend adds a single document-level `paste` listener that branches on whether the edit dialog is open.

**Tech Stack:** Node 22 + Fastify + `@fastify/multipart` (already registered) + TypeScript ESM, PostgreSQL 16, `pg` driver, `node:test` runner. Frontend: React 18, Vite, existing `useToast` hook.

**Spec:** `docs/superpowers/specs/2026-04-26-paste-screenshot-design.md`

---

## File Structure

**Backend (`server/`):**
- Create: `src/routes/attachments_upload.ts` (both new endpoints + shared validate/save helper)
- Modify: `src/index.ts` (register the new route module)
- Create: `src/__tests__/attachment_upload.test.ts` (integration tests via `app.inject`)

**Frontend (`web/`):**
- Modify: `src/api.ts` (add `uploadAttachment` + `createCardFromImage`)
- Modify: `src/App.tsx` (document-level `paste` listener inside `Authed`)

The route module is a single file because the two endpoints share the validate/save helper and the file is small (~150 lines). No new module on the data layer is needed — `card_attachments` writes are local to the route.

---

## Task 1: Server — validation helper + attach-to-existing endpoint (TDD)

**Files:**
- Create: `server/src/routes/attachments_upload.ts`
- Modify: `server/src/index.ts`
- Create: `server/src/__tests__/attachment_upload.test.ts`

- [ ] **Step 1: Write the failing tests for the attach endpoint**

Create `server/src/__tests__/attachment_upload.test.ts`:

```ts
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { cardRoutes } from '../routes/cards.js';
import { attachmentUploadRoutes } from '../routes/attachments_upload.js';

const TMP_ATTACH_DIR = path.join(os.tmpdir(), 'kanban-test-attach-' + Math.random().toString(36).slice(2, 8));
process.env.ATTACHMENTS_DIR = TMP_ATTACH_DIR;

const app = Fastify();
await app.register(cookie, { secret: 'test-secret' });
await app.register(multipart);
await app.register(authRoutes);
await app.register(cardRoutes);
await app.register(attachmentUploadRoutes);
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
  return { cookie: cookieStr.split(';')[0]!, id: (res.json() as { id: string }).id };
}

async function createCard(cookie: string, title: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/cards',
    headers: { cookie },
    payload: { title, status: 'today' },
  });
  return (res.json() as { id: string }).id;
}

// Build a multipart body with a single image field. Buffer-based.
function multipartBody(fieldName: string, filename: string, mime: string, content: Buffer): {
  body: Buffer;
  headers: Record<string, string>;
} {
  const boundary = '----test' + Math.random().toString(36).slice(2);
  const head =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
    `Content-Type: ${mime}\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([Buffer.from(head, 'utf8'), content, Buffer.from(tail, 'utf8')]);
  return { body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

// Minimal valid 1x1 PNG (8-byte signature + IHDR + IDAT + IEND).
const TINY_PNG = Buffer.from(
  '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489000000' +
  '0D49444154789C636060000000000300010BF34D0F0000000049454E44AE426082',
  'hex',
);

before(async () => {
  await fs.mkdir(TMP_ATTACH_DIR, { recursive: true });
  const a = await register('alice');
  const b = await register('bob');
  cookieA = a.cookie; cookieB = b.cookie; userAId = a.id; userBId = b.id;
});

after(async () => {
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userAId, userBId]]);
  await app.close();
  try { await pool.end(); } catch {}
  try { await fs.rm(TMP_ATTACH_DIR, { recursive: true, force: true }); } catch {}
});

beforeEach(async () => {
  await pool.query(`DELETE FROM cards WHERE created_by = ANY($1::uuid[])`, [[userAId, userBId]]);
});

test('POST /api/cards/:id/attachments: 201 attaches image to card', async () => {
  const cardId = await createCard(cookieA, 'sample');
  const { body, headers } = multipartBody('file', 'paste.png', 'image/png', TINY_PNG);
  const res = await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/attachments`,
    headers: { ...headers, cookie: cookieA },
    payload: body,
  });
  assert.equal(res.statusCode, 201);
  const card = res.json() as { attachments: Array<{ kind: string; storage_path: string }> };
  assert.equal(card.attachments.length, 1);
  assert.equal(card.attachments[0]!.kind, 'image');
  // file exists on disk
  const stat = await fs.stat(path.join(TMP_ATTACH_DIR, card.attachments[0]!.storage_path));
  assert.ok(stat.size > 0);
});

test('POST /api/cards/:id/attachments: 404 when card not visible', async () => {
  const cardId = await createCard(cookieA, 'private');
  // userA's card is private to A. Set assignees to only A so B cannot see it.
  await app.inject({
    method: 'PATCH',
    url: `/api/cards/${cardId}`,
    headers: { cookie: cookieA },
    payload: { assignees: [userAId] },
  });
  const { body, headers } = multipartBody('file', 'paste.png', 'image/png', TINY_PNG);
  const res = await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/attachments`,
    headers: { ...headers, cookie: cookieB },
    payload: body,
  });
  assert.equal(res.statusCode, 404);
});

test('POST /api/cards/:id/attachments: 415 on bad MIME', async () => {
  const cardId = await createCard(cookieA, 'sample');
  const { body, headers } = multipartBody('file', 'note.txt', 'text/plain', Buffer.from('hello'));
  const res = await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/attachments`,
    headers: { ...headers, cookie: cookieA },
    payload: body,
  });
  assert.equal(res.statusCode, 415);
});

test('POST /api/cards/:id/attachments: 400 when file field missing', async () => {
  const cardId = await createCard(cookieA, 'sample');
  const boundary = '----test' + Math.random().toString(36).slice(2);
  const empty = `--${boundary}--\r\n`;
  const res = await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/attachments`,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      cookie: cookieA,
    },
    payload: Buffer.from(empty),
  });
  assert.equal(res.statusCode, 400);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npm test -- --test-name-pattern='POST /api/cards/:id/attachments'`
Expected: FAIL with "Cannot find module '../routes/attachments_upload.js'".

- [ ] **Step 3: Create `server/src/routes/attachments_upload.ts` with the attach endpoint**

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { pool } from '../db.js';
import { requireUser } from '../auth.js';
import { canUserSeeCard, isStatus, loadCard, logActivity, type Status } from '../cards.js';
import { broadcast } from '../ws.js';
import { AI_ENABLED } from '../ai/openai.js';
import { summarizeImage } from '../ai/vision.js';

const ATTACHMENTS_DIR = path.resolve(process.env.ATTACHMENTS_DIR ?? 'data/attachments');
const ATTACHMENT_MAX_BYTES = Number(process.env.ATTACHMENT_MAX_BYTES ?? 5_000_000);

const IMAGE_MIME_ALLOWLIST = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

class HttpError extends Error {
  constructor(public status: number, public body: Record<string, unknown>) {
    super(typeof body.error === 'string' ? body.error : 'http error');
  }
}

async function readImagePart(req: FastifyRequest): Promise<{
  buffer: Buffer;
  mime: string;
  ext: string;
  status?: string;
}> {
  // We accept exactly one image field named "file". Allow an optional `status`
  // text field for the from-image endpoint.
  let part: MultipartFile | null = null;
  let status: string | undefined;
  for await (const p of req.parts()) {
    if (p.type === 'file' && p.fieldname === 'file' && !part) {
      part = p;
      break; // stream consumption stops at the first file; trailing fields would block.
    }
    if (p.type === 'field' && p.fieldname === 'status') {
      status = String((p as unknown as { value: string }).value);
    }
  }
  if (!part) throw new HttpError(400, { error: 'file required' });
  if (!IMAGE_MIME_ALLOWLIST.has(part.mimetype)) {
    // Drain the stream to free memory.
    part.file.resume();
    throw new HttpError(415, {
      error: 'unsupported media type',
      allowed: Array.from(IMAGE_MIME_ALLOWLIST),
    });
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of part.file) {
    total += chunk.length;
    if (total > ATTACHMENT_MAX_BYTES) {
      throw new HttpError(413, { error: 'file too large', max_bytes: ATTACHMENT_MAX_BYTES });
    }
    chunks.push(chunk);
  }
  return {
    buffer: Buffer.concat(chunks),
    mime: part.mimetype,
    ext: MIME_TO_EXT[part.mimetype] ?? '.bin',
    status,
  };
}

async function persistImage(cardId: string, ext: string, buffer: Buffer): Promise<string> {
  // storage_path is relative to ATTACHMENTS_DIR so the attachment routes can serve it.
  const dir = path.join(ATTACHMENTS_DIR, cardId);
  await fs.mkdir(dir, { recursive: true });
  const fileId = crypto.randomUUID();
  const filename = `${fileId}${ext}`;
  await fs.writeFile(path.join(dir, filename), buffer);
  return path.posix.join(cardId, filename);
}

function handleHttpError(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof HttpError) {
    reply.code(err.status).send(err.body);
    return true;
  }
  return false;
}

export async function attachmentUploadRoutes(app: FastifyInstance) {
  // POST /api/cards/:id/attachments — attach an image to an existing card.
  app.post<{ Params: { id: string } }>(
    '/api/cards/:id/attachments',
    { preHandler: requireUser },
    async (req, reply) => {
      try {
        if (!(await canUserSeeCard(req.user!.id, req.params.id))) {
          return reply.code(404).send({ error: 'not found' });
        }
        const { buffer, mime, ext } = await readImagePart(req);
        const relPath = await persistImage(req.params.id, ext, buffer);
        await pool.query(
          `INSERT INTO card_attachments (card_id, kind, storage_path, original_filename)
           VALUES ($1, 'image', $2, NULL)`,
          [req.params.id, relPath],
        );
        await logActivity(req.user!.id, req.params.id, 'attach', { kind: 'image', mime });
        const card = await loadCard(req.params.id);
        if (!card) return reply.code(404).send({ error: 'not found' });
        broadcast({ type: 'card.updated', card });
        return reply.code(201).send(card);
      } catch (err) {
        if (handleHttpError(reply, err)) return;
        throw err;
      }
    },
  );

  // POST /api/cards/from-image — create a new card from a pasted image.
  // (Implementation arrives in Task 2.)
}
```

- [ ] **Step 4: Wire the new route module into the server**

In `server/src/index.ts`, add the import alongside the other route imports:

```ts
import { attachmentUploadRoutes } from './routes/attachments_upload.js';
```

And register it after `attachmentRoutes`:

```ts
await app.register(attachmentUploadRoutes);
```

- [ ] **Step 5: Run tests for the attach endpoint**

Run: `cd server && npm test -- --test-name-pattern='POST /api/cards/:id/attachments'`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/attachments_upload.ts server/src/index.ts server/src/__tests__/attachment_upload.test.ts
git commit -m "feat(attach): POST /api/cards/:id/attachments image upload endpoint"
```

---

## Task 2: Server — `from-image` endpoint with vision title fallback (TDD)

**Files:**
- Modify: `server/src/routes/attachments_upload.ts` (add the `from-image` handler)
- Modify: `server/src/__tests__/attachment_upload.test.ts` (add tests)

- [ ] **Step 1: Add the failing tests**

Append to `server/src/__tests__/attachment_upload.test.ts`:

```ts
test('POST /api/cards/from-image: 201 creates card with timestamped title when AI disabled', async () => {
  const prevORK = process.env.OPENROUTER_API_KEY;
  const prevOAI = process.env.OPENAI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const { body, headers } = multipartBody('file', 'paste.png', 'image/png', TINY_PNG);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cards/from-image',
      headers: { ...headers, cookie: cookieA },
      payload: body,
    });
    assert.equal(res.statusCode, 201);
    const card = res.json() as {
      title: string;
      status: string;
      created_by: string;
      assignees: string[];
      attachments: Array<{ kind: string; storage_path: string }>;
      ai_summarized: boolean;
      needs_review: boolean;
    };
    assert.match(card.title, /^Screenshot \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    assert.equal(card.status, 'today');
    assert.equal(card.created_by, userAId);
    assert.deepEqual(card.assignees, [userAId]);
    assert.equal(card.attachments.length, 1);
    assert.equal(card.attachments[0]!.kind, 'image');
    assert.equal(card.ai_summarized, false);
    assert.equal(card.needs_review, true);
  } finally {
    if (prevORK) process.env.OPENROUTER_API_KEY = prevORK;
    if (prevOAI) process.env.OPENAI_API_KEY = prevOAI;
  }
});

test('POST /api/cards/from-image: honors status field', async () => {
  const prev = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const boundary = '----test' + Math.random().toString(36).slice(2);
    const head1 =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="status"\r\n\r\n` +
      `backlog\r\n`;
    const head2 =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="paste.png"\r\n` +
      `Content-Type: image/png\r\n\r\n`;
    const tail = `\r\n--${boundary}--\r\n`;
    const body = Buffer.concat([
      Buffer.from(head1, 'utf8'),
      Buffer.from(head2, 'utf8'),
      TINY_PNG,
      Buffer.from(tail, 'utf8'),
    ]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cards/from-image',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        cookie: cookieA,
      },
      payload: body,
    });
    assert.equal(res.statusCode, 201);
    const card = res.json() as { status: string };
    assert.equal(card.status, 'backlog');
  } finally {
    if (prev) process.env.OPENROUTER_API_KEY = prev;
  }
});

test('POST /api/cards/from-image: 415 on bad MIME', async () => {
  const { body, headers } = multipartBody('file', 'note.txt', 'text/plain', Buffer.from('hello'));
  const res = await app.inject({
    method: 'POST',
    url: '/api/cards/from-image',
    headers: { ...headers, cookie: cookieA },
    payload: body,
  });
  assert.equal(res.statusCode, 415);
});

test('POST /api/cards/from-image: 400 when file missing', async () => {
  const boundary = '----test' + Math.random().toString(36).slice(2);
  const empty = `--${boundary}--\r\n`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/cards/from-image',
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      cookie: cookieA,
    },
    payload: Buffer.from(empty),
  });
  assert.equal(res.statusCode, 400);
});
```

The "status field" test sends fields in order: `status` text first, then `file`. `readImagePart` reads parts in order: it captures the first `field` named `status`, then breaks at the first `file` named `file`. The implementation in Task 1 already supports this — the read loop checks for both types and only breaks once it has the file part.

⚠️ Note about `readImagePart`'s loop: the current loop in Task 1 breaks as soon as it finds the file. If `status` arrives AFTER `file`, it will be missed. The `from-image` test above sends `status` first, which works. The frontend (Task 4) will also send `status` first.

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd server && npm test -- --test-name-pattern='POST /api/cards/from-image'`
Expected: 4 tests fail with 404 (the route doesn't exist yet).

- [ ] **Step 3: Add the `from-image` handler in `attachments_upload.ts`**

Replace the placeholder comment `// (Implementation arrives in Task 2.)` near the bottom of `server/src/routes/attachments_upload.ts` with:

```ts
  app.post(
    '/api/cards/from-image',
    { preHandler: requireUser },
    async (req, reply) => {
      try {
        const { buffer, mime, ext, status: statusRaw } = await readImagePart(req);
        const status: Status = isStatus(statusRaw) ? statusRaw : 'today';

        // Insert a placeholder card first to get an id, then save the file under it.
        const userId = req.user!.id;
        const tsTitle = `Screenshot ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
        const insertCard = await pool.query<{ id: string }>(
          `INSERT INTO cards (title, description, status, source, created_by, position, needs_review)
           VALUES ($1, '', $2, 'manual', $3,
             COALESCE((SELECT MIN(position) - 1 FROM cards WHERE status = $2 AND NOT archived), 0),
             TRUE)
           RETURNING id`,
          [tsTitle, status, userId],
        );
        const cardId = insertCard.rows[0]!.id;

        // Default assignees = creator (mirrors manual create path).
        await pool.query(
          `INSERT INTO card_assignees (card_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [cardId, userId],
        );

        // Persist the image so vision can read it (vision helper takes a path).
        const relPath = await persistImage(cardId, ext, buffer);
        const absPath = path.join(ATTACHMENTS_DIR, relPath);
        await pool.query(
          `INSERT INTO card_attachments (card_id, kind, storage_path, original_filename)
           VALUES ($1, 'image', $2, NULL)`,
          [cardId, relPath],
        );

        // Try AI vision title; on success, swap title/description and clear needs_review.
        let aiSummarized = false;
        if (AI_ENABLED()) {
          const v = await summarizeImage(absPath);
          if (v) {
            await pool.query(
              `UPDATE cards
               SET title = $1, description = $2,
                   ai_summarized = TRUE, needs_review = FALSE,
                   updated_at = NOW()
               WHERE id = $3`,
              [v.title.slice(0, 500), v.description, cardId],
            );
            aiSummarized = true;
          }
        }

        await logActivity(userId, cardId, 'create', {
          from: 'paste-image',
          mime,
          ai_summarized: aiSummarized,
        });
        const card = await loadCard(cardId);
        if (!card) return reply.code(500).send({ error: 'card load failed' });
        broadcast({ type: 'card.created', card });
        return reply.code(201).send(card);
      } catch (err) {
        if (handleHttpError(reply, err)) return;
        throw err;
      }
    },
  );
```

- [ ] **Step 4: Run all attachment-upload tests**

Run: `cd server && npm test -- --test-name-pattern='attachment|attachments|from-image'`
Expected: 8 tests pass (4 from Task 1 + 4 from this task).

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `cd server && npm test`
Expected: prior pass count + 8 new = full suite green.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/attachments_upload.ts server/src/__tests__/attachment_upload.test.ts
git commit -m "feat(attach): POST /api/cards/from-image with vision-title fallback"
```

---

## Task 3: Frontend — API client methods

**Files:**
- Modify: `web/src/api.ts`

- [ ] **Step 1: Add the two upload methods to `web/src/api.ts`**

Locate the `api` object literal and append inside it (next to the existing `attachmentUrl`):

```ts
  uploadAttachment: async (cardId: string, file: File): Promise<Card> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/cards/${cardId}/attachments`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });
    const dateHeader = res.headers.get('date');
    if (dateHeader) {
      const serverMs = Date.parse(dateHeader);
      if (!Number.isNaN(serverMs)) {
        // Reuse the same skew-update path as `req()`. We can't easily call the
        // private function, so update via a no-op fetch on next API call.
      }
    }
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try { const b = await res.json(); if (b?.error) msg = b.error; } catch {}
      throw new ApiError(res.status, msg);
    }
    return res.json();
  },

  createCardFromImage: async (file: File, status?: Status): Promise<Card> => {
    const fd = new FormData();
    fd.append('file', file);
    if (status) fd.append('status', status);
    const res = await fetch('/api/cards/from-image', {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try { const b = await res.json(); if (b?.error) msg = b.error; } catch {}
      throw new ApiError(res.status, msg);
    }
    return res.json();
  },
```

- [ ] **Step 2: Type-check the web build**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/api.ts
git commit -m "feat(api): web client uploadAttachment + createCardFromImage"
```

---

## Task 4: Frontend — document-level paste listener

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Read the current `Authed` component to find the right place to add the listener**

Locate `function Authed(...)` in `web/src/App.tsx`. Find the existing `useEffect` that registers the WebSocket dispatcher (search `connectWS`). The new effect goes near it (any place inside the function body works; group with other effects for readability).

- [ ] **Step 2: Add the paste listener effect**

Add the following near the other `useEffect`s inside `Authed`. Replace `<existing destructure of editing/setEditing>` with the actual variable names already in scope:

```tsx
  // Document-level paste-to-attach. Reads `editing` via a ref so the handler
  // doesn't re-register on every state change.
  const editingRef = useRef(editing);
  useEffect(() => { editingRef.current = editing; }, [editing]);

  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const images: File[] = [];
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) images.push(f);
        }
      }
      if (images.length === 0) return; // let text paste behave normally
      e.preventDefault();
      for (const file of images) {
        try {
          if (editingRef.current) {
            const updated = await api.uploadAttachment(editingRef.current.id, file);
            // Update local state so the dialog reflects the new attachment immediately.
            setCards((prev) =>
              prev.map((c) => (c.id === updated.id ? updated : c)),
            );
            setEditing(updated);
            addToast('Image attached', 'success');
          } else {
            const created = await api.createCardFromImage(file);
            setCards((prev) =>
              prev.some((c) => c.id === created.id) ? prev : [...prev, created],
            );
            addToast(
              `Card created from screenshot${created.ai_summarized ? ' (AI titled)' : ''}`,
              'success',
            );
          }
        } catch (err) {
          addToast(
            `Paste failed: ${err instanceof Error ? err.message : 'error'}`,
            'error',
          );
        }
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);
```

You will need to import `useRef` from React if it's not already imported, and confirm `addToast` and `setEditing` are in scope at the point you place the effect.

- [ ] **Step 3: Type-check the web build**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Build the web bundle to confirm**

Run: `cd web && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(paste): document-level paste-to-attach listener"
```

---

## Task 5: Manual smoke + final polish

**Files:** none modified unless smoke turns up issues.

- [ ] **Step 1: Run the full test suite**

Run: `cd server && npm test`
Expected: full suite passes including all 8 new attachment tests.

- [ ] **Step 2: Type-check both halves**

Run: `cd server && npx tsc --noEmit && cd ../web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build the web bundle**

Run: `cd web && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke (with dev server up)**

Bring up the stack: `docker compose up -d --build server`. Open the app.

1. Take a screenshot. With no card dialog open, paste (Ctrl/Cmd-V). Toast: `Card created from screenshot` (with `(AI titled)` if AI keys configured). New card visible in Today.
2. Open the new card. Paste again. Toast: `Image attached`. Refresh; both attachments visible.
3. Try pasting plain text into the card title field. Title text inserts; no card created.
4. Try pasting a small image when offline (kill the server). Toast: `Paste failed: <message>`. UI does not duplicate.
5. (Optional) Disable both AI keys, restart server, paste. Title is `Screenshot YYYY-MM-DD HH:MM`, `needs_review` set on the card.

- [ ] **Step 5: Commit any fixups (only if smoke turned up issues)**

```bash
git add -p
git commit -m "fix(paste): smoke-test fixups"
```

If the smoke pass produced no changes, skip this step.

---

## Self-Review Notes

**Spec coverage:**
- §3 Frontend → Task 4
- §4.1 Attach endpoint → Task 1
- §4.2 from-image endpoint → Task 2
- §4.3 helpers (validate + persist) → Task 1 (`readImagePart`, `persistImage`)
- §5 constants → Task 1
- §6 error mapping → Tasks 1 & 2 (status codes verified by tests; frontend toasts in Task 4)
- §7 tests → Tasks 1 & 2
- §8 rollout → Task 5 manual step
- §9 manual smoke checklist → Task 5

**Type consistency:**
- `Status` from `cards.js` used consistently on server and `Status` from `web/src/types.ts` used in `createCardFromImage`. Values match (`'backlog'|'today'|'in_progress'|'done'`).
- `Card` type returned by all three new API methods (server returns full card; client typed as `Card`).
- `HttpError` lives entirely inside `attachments_upload.ts` — not exported.
- `ATTACHMENT_MAX_BYTES` env var documented in spec §5 + §8; defaulted in code.

**Placeholders:** none — every step contains the actual code or command.

**Known intentional simplifications:**
- The web `uploadAttachment` does not update `serverClockSkewMs` from the response Date header (the existing `req()` helper handles this for JSON paths only). This is acceptable for v1; the next plain GET will resync the skew.
- Frontend tests are not added (matches the project's existing FE-test footprint); manual smoke covers the paste flow.
- One image per paste batch is the common case; multiple images are processed sequentially and produce one toast each. No bulk-success toast.
