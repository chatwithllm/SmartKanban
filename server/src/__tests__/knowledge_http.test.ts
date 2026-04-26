import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { knowledgeRoutes } from '../routes/knowledge.js';

const app = Fastify();
await app.register(cookie, { secret: 'test-secret' });
await app.register(authRoutes);
await app.register(knowledgeRoutes);
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
  const a = await register('khttp_a');
  const b = await register('khttp_b');
  cookieA = a.cookie;
  cookieB = b.cookie;
  userAId = a.id;
  userBId = b.id;
});

after(async () => {
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userAId, userBId]]);
  await app.close();
  try {
    if (!(pool as { ended?: boolean }).ended) await pool.end();
  } catch {
    // pool may already be ended by another test file in the same process
  }
});

beforeEach(async () => {
  await pool.query(`DELETE FROM knowledge_items WHERE owner_id = ANY($1::uuid[])`, [[userAId, userBId]]);
});

test('POST /api/knowledge creates and returns the item', async () => {
  const r = await app.inject({
    method: 'POST',
    url: '/api/knowledge',
    headers: { cookie: cookieA, 'content-type': 'application/json' },
    payload: { title: 'A', url: 'https://example.com', visibility: 'private' },
  });
  assert.equal(r.statusCode, 200);
  const body = r.json() as { title: string; owner_id: string };
  assert.equal(body.title, 'A');
  assert.equal(body.owner_id, userAId);
});

test('POST /api/knowledge returns 400 on validation failure', async () => {
  const r = await app.inject({
    method: 'POST',
    url: '/api/knowledge',
    headers: { cookie: cookieA, 'content-type': 'application/json' },
    payload: { title: '', url: 'https://x', visibility: 'private' },
  });
  assert.equal(r.statusCode, 400);
});

test('GET /api/knowledge filters by FTS query', async () => {
  await app.inject({
    method: 'POST', url: '/api/knowledge',
    headers: { cookie: cookieA, 'content-type': 'application/json' },
    payload: { title: 'Eggs recipe', body: 'beat 3 eggs and fry', visibility: 'private' },
  });
  await app.inject({
    method: 'POST', url: '/api/knowledge',
    headers: { cookie: cookieA, 'content-type': 'application/json' },
    payload: { title: 'Cars', body: 'pistons and gears', visibility: 'private' },
  });

  const r = await app.inject({
    method: 'GET',
    url: '/api/knowledge?q=eggs',
    headers: { cookie: cookieA },
  });
  assert.equal(r.statusCode, 200);
  const body = r.json() as { items: { title: string }[] };
  assert.ok(body.items.some(i => i.title === 'Eggs recipe'));
  assert.ok(!body.items.some(i => i.title === 'Cars'));
});

test('PATCH by non-owner returns 403', async () => {
  const create = await app.inject({
    method: 'POST', url: '/api/knowledge',
    headers: { cookie: cookieA, 'content-type': 'application/json' },
    payload: { title: 't', url: 'https://x', visibility: 'inbox' },
  });
  const id = (create.json() as { id: string }).id;

  const r = await app.inject({
    method: 'PATCH',
    url: `/api/knowledge/${id}`,
    headers: { cookie: cookieB, 'content-type': 'application/json' },
    payload: { title: 'hax' },
  });
  assert.equal(r.statusCode, 403);
});

test('GET /api/knowledge/:id returns 404 when not visible', async () => {
  const create = await app.inject({
    method: 'POST', url: '/api/knowledge',
    headers: { cookie: cookieA, 'content-type': 'application/json' },
    payload: { title: 'p', url: 'https://x', visibility: 'private' },
  });
  const id = (create.json() as { id: string }).id;

  const r = await app.inject({
    method: 'GET',
    url: `/api/knowledge/${id}`,
    headers: { cookie: cookieB },
  });
  assert.equal(r.statusCode, 404);
});

test('DELETE archives the item (soft) and 404 thereafter', async () => {
  const create = await app.inject({
    method: 'POST', url: '/api/knowledge',
    headers: { cookie: cookieA, 'content-type': 'application/json' },
    payload: { title: 't', url: 'https://x', visibility: 'private' },
  });
  const id = (create.json() as { id: string }).id;

  const del = await app.inject({
    method: 'DELETE',
    url: `/api/knowledge/${id}`,
    headers: { cookie: cookieA },
  });
  assert.equal(del.statusCode, 204);

  const get = await app.inject({
    method: 'GET',
    url: `/api/knowledge/${id}`,
    headers: { cookie: cookieA },
  });
  assert.equal(get.statusCode, 404);
});

test('refetch requires url; returns 400 if absent', async () => {
  const create = await app.inject({
    method: 'POST', url: '/api/knowledge',
    headers: { cookie: cookieA, 'content-type': 'application/json' },
    payload: { title: 'note only', body: 'just a note', visibility: 'private' },
  });
  const id = (create.json() as { id: string }).id;

  const r = await app.inject({
    method: 'POST',
    url: `/api/knowledge/${id}/refetch`,
    headers: { cookie: cookieA },
  });
  assert.equal(r.statusCode, 400);
});
