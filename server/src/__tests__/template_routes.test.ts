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
  try {
    if (!(pool as { ended?: boolean }).ended) await pool.end();
  } catch {
    // pool may already be ended by another test file in the same process
  }
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
