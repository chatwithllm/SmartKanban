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

test('POST /api/cards/:id/attachments: 413 on oversize file', async () => {
  const cardId = await createCard(cookieA, 'sample');
  // 6 MB exceeds the default 5 MB ATTACHMENT_MAX_BYTES limit. Bytes are
  // arbitrary (filler 0x42); MIME type is what matters for the validation
  // ordering — must be in the allowlist so we reach the size check.
  const big = Buffer.alloc(6_000_000, 0x42);
  const { body, headers } = multipartBody('file', 'big.png', 'image/png', big);
  const res = await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/attachments`,
    headers: { ...headers, cookie: cookieA },
    payload: body,
  });
  assert.equal(res.statusCode, 413);
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
