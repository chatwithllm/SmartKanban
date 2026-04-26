import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { cardRoutes } from '../routes/cards.js';
import { qrRoutes } from '../routes/qr.js';

process.env.APP_URL = 'https://kanban.test.example';

const app = Fastify();
await app.register(cookie, { secret: 'test-secret' });
await app.register(authRoutes);
await app.register(cardRoutes);
await app.register(qrRoutes);
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

before(async () => {
  const a = await register('alice');
  const b = await register('bob');
  cookieA = a.cookie; cookieB = b.cookie; userAId = a.id; userBId = b.id;
});

after(async () => {
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userAId, userBId]]);
  await app.close();
  try { await pool.end(); } catch {}
});

beforeEach(async () => {
  await pool.query(`DELETE FROM cards WHERE created_by = ANY($1::uuid[])`, [[userAId, userBId]]);
});

test('GET /api/cards/:id/qr.svg: 200 with SVG content for own card', async () => {
  const cardId = await createCard(cookieA, 'sample');
  const res = await app.inject({
    method: 'GET',
    url: `/api/cards/${cardId}/qr.svg`,
    headers: { cookie: cookieA },
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'] as string, /^image\/svg\+xml/);
  assert.match(res.body, /<svg/);
});

test('GET /api/cards/:id/qr.svg: 404 when card not visible', async () => {
  const cardId = await createCard(cookieA, 'private');
  await app.inject({
    method: 'PATCH',
    url: `/api/cards/${cardId}`,
    headers: { cookie: cookieA },
    payload: { assignees: [userAId] },
  });
  const res = await app.inject({
    method: 'GET',
    url: `/api/cards/${cardId}/qr.svg`,
    headers: { cookie: cookieB },
  });
  assert.equal(res.statusCode, 404);
});

test('GET /api/cards/:id/qr.svg: 401 when unauthenticated', async () => {
  const cardId = await createCard(cookieA, 'sample');
  const res = await app.inject({
    method: 'GET',
    url: `/api/cards/${cardId}/qr.svg`,
  });
  assert.equal(res.statusCode, 401);
});

test('GET /api/cards/:id/qr.svg: sets Cache-Control private', async () => {
  const cardId = await createCard(cookieA, 'sample');
  const res = await app.inject({
    method: 'GET',
    url: `/api/cards/${cardId}/qr.svg`,
    headers: { cookie: cookieA },
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['cache-control'] as string, /private/);
});
