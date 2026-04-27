import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { mirrorRoutes } from '../routes/mirror.js';
import { cardRoutes } from '../routes/cards.js';
import { apiTokenRoutes } from '../routes/api_tokens.js';

const app = Fastify();
await app.register(cookie, { secret: 'test-secret' });
await app.register(authRoutes);
await app.register(mirrorRoutes);
await app.register(apiTokenRoutes);
await app.register(cardRoutes);
await app.ready();

let cookieA = '';
let cookieB = '';
let userAId = '';
let userBId = '';

async function register(name: string) {
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

before(async () => {
  const a = await register('alice');
  cookieA = a.cookie;
  userAId = a.id;
  const b = await register('bob');
  cookieB = b.cookie;
  userBId = b.id;
});

after(async () => {
  await pool.query(`DELETE FROM cards WHERE created_by = ANY($1::uuid[])`, [[userAId, userBId]]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userAId, userBId]]);
  await app.close();
  try { if (!(pool as { ended?: boolean }).ended) await pool.end(); } catch {}
});

beforeEach(async () => {
  await pool.query(`DELETE FROM mirror_tokens WHERE user_id = $1`, [userAId]);
  await pool.query(`DELETE FROM cards WHERE created_by = ANY($1::uuid[])`, [[userAId, userBId]]);
});

test('POST /api/cards/:id/activity returns 201 with valid api token', async () => {
  const at = await app.inject({
    method: 'POST', url: '/api/tokens', headers: { cookie: cookieA },
    payload: { label: 'test-token' },
  });
  const { token } = at.json() as { token: string };

  const card = await app.inject({
    method: 'POST', url: '/api/cards', headers: { cookie: cookieA },
    payload: { title: 'activity test card' },
  });
  const cardId = (card.json() as { id: string }).id;

  const res = await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/activity`,
    headers: { authorization: `Bearer ${token}` },
    payload: { type: 'session_summary', body: 'Finished implementing the feature.' },
  });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.json(), { ok: true });
});

test('POST /api/cards/:id/activity 400 when body missing', async () => {
  const at = await app.inject({
    method: 'POST', url: '/api/tokens', headers: { cookie: cookieA },
    payload: { label: 'test-token-2' },
  });
  const apiTokenA = (at.json() as { token: string }).token;
  const card = await app.inject({
    method: 'POST', url: '/api/cards', headers: { cookie: cookieA },
    payload: { title: 't2' },
  });
  const cardId = (card.json() as { id: string }).id;
  const r = await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/activity`,
    headers: { authorization: `Bearer ${apiTokenA}` },
    payload: { type: 'note' },
  });
  assert.equal(r.statusCode, 400);
});

test('POST /api/cards/:id/activity 404 when card invisible', async () => {
  const at = await app.inject({
    method: 'POST', url: '/api/tokens', headers: { cookie: cookieA },
    payload: { label: 'test-token-3' },
  });
  const apiTokenA = (at.json() as { token: string }).token;
  const card = await app.inject({
    method: 'POST', url: '/api/cards', headers: { cookie: cookieB },
    payload: { title: 'bob private' },
  });
  const cardId = (card.json() as { id: string }).id;
  const r = await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/activity`,
    headers: { authorization: `Bearer ${apiTokenA}` },
    payload: { type: 'note', body: 'x' },
  });
  assert.equal(r.statusCode, 404);
});
