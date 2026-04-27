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
let userAId = '';

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
});

after(async () => {
  await pool.query(`DELETE FROM cards WHERE created_by = $1`, [userAId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userAId]);
  await app.close();
  try { if (!(pool as { ended?: boolean }).ended) await pool.end(); } catch {}
});

beforeEach(async () => {
  await pool.query(`DELETE FROM mirror_tokens WHERE user_id = $1`, [userAId]);
  await pool.query(`DELETE FROM cards WHERE created_by = $1`, [userAId]);
});

test('POST /api/tokens creates an api-scope token', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/tokens',
    headers: { cookie: cookieA },
    payload: { label: 'laptop' },
  });
  assert.equal(res.statusCode, 201);
  const body = res.json() as { token: string; label: string; scope: string };
  assert.match(body.token, /^[A-Za-z0-9_-]+$/);
  assert.equal(body.scope, 'api');
});

test('GET /api/tokens lists user tokens, hides others', async () => {
  await app.inject({
    method: 'POST', url: '/api/tokens', headers: { cookie: cookieA },
    payload: { label: 't1' },
  });
  const res = await app.inject({
    method: 'GET', url: '/api/tokens', headers: { cookie: cookieA },
  });
  assert.equal(res.statusCode, 200);
  const tokens = res.json() as Array<{ label: string; scope: string }>;
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].label, 't1');
});

test('DELETE /api/tokens/:token revokes', async () => {
  const create = await app.inject({
    method: 'POST', url: '/api/tokens', headers: { cookie: cookieA },
    payload: { label: 'x' },
  });
  const { token } = create.json() as { token: string };
  const del = await app.inject({
    method: 'DELETE', url: `/api/tokens/${token}`, headers: { cookie: cookieA },
  });
  assert.equal(del.statusCode, 204);
  const list = await app.inject({
    method: 'GET', url: '/api/tokens', headers: { cookie: cookieA },
  });
  assert.equal((list.json() as unknown[]).length, 0);
});

test('Mirror token rejected on api-scope endpoints', async () => {
  const mt = await app.inject({
    method: 'POST', url: '/api/mirror/tokens', headers: { cookie: cookieA },
    payload: { label: 'm' },
  });
  const { token } = mt.json() as { token: string };
  const card = await app.inject({
    method: 'POST', url: '/api/cards', headers: { cookie: cookieA },
    payload: { title: 'x' },
  });
  const cardId = (card.json() as { id: string }).id;
  const act = await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/activity`,
    headers: { authorization: `Bearer ${token}` },
    payload: { type: 'note', body: 'should fail' },
  });
  assert.equal(act.statusCode, 403);
});

test('API-scope token accepted on api-scope endpoints', async () => {
  const at = await app.inject({
    method: 'POST', url: '/api/tokens', headers: { cookie: cookieA },
    payload: { label: 'a' },
  });
  const { token } = at.json() as { token: string };
  const card = await app.inject({
    method: 'POST', url: '/api/cards', headers: { cookie: cookieA },
    payload: { title: 'y' },
  });
  const cardId = (card.json() as { id: string }).id;
  const act = await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/activity`,
    headers: { authorization: `Bearer ${token}` },
    payload: { type: 'session_summary', body: 'ok' },
  });
  assert.equal(act.statusCode, 201);
});

test('POST /api/cards with Bearer api token works', async () => {
  const at = await app.inject({
    method: 'POST', url: '/api/tokens', headers: { cookie: cookieA },
    payload: { label: 'b' },
  });
  const { token } = at.json() as { token: string };

  const r = await app.inject({
    method: 'POST',
    url: '/api/cards',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    payload: { title: 'via api', project: 'p1' },
  });
  assert.equal(r.statusCode, 201);
  const card = r.json() as { project: string; title: string };
  assert.equal(card.project, 'p1');
  assert.equal(card.title, 'via api');
});

test('PATCH /api/cards/:id with Bearer api token replaces tags', async () => {
  const at = await app.inject({
    method: 'POST', url: '/api/tokens', headers: { cookie: cookieA },
    payload: { label: 'c' },
  });
  const { token } = at.json() as { token: string };
  const c = await app.inject({
    method: 'POST', url: '/api/cards', headers: { cookie: cookieA },
    payload: { title: 'tagging', tags: ['a', 'b'] },
  });
  const cardId = (c.json() as { id: string }).id;

  const p = await app.inject({
    method: 'PATCH',
    url: `/api/cards/${cardId}`,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    payload: { tags: ['a', 'b', 'deployed-local'] },
  });
  assert.equal(p.statusCode, 200);
  const updated = p.json() as { tags: string[] };
  assert.deepEqual(updated.tags.sort(), ['a', 'b', 'deployed-local'].sort());
});

test('GET /api/mirror/tokens does not return api-scope tokens', async () => {
  // mint one of each scope
  await app.inject({
    method: 'POST', url: '/api/mirror/tokens', headers: { cookie: cookieA },
    payload: { label: 'mirror1' },
  });
  await app.inject({
    method: 'POST', url: '/api/tokens', headers: { cookie: cookieA },
    payload: { label: 'api1' },
  });
  const list = await app.inject({
    method: 'GET', url: '/api/mirror/tokens', headers: { cookie: cookieA },
  });
  assert.equal(list.statusCode, 200);
  const tokens = list.json() as Array<{ label: string }>;
  assert.equal(tokens.length, 1, 'expected only the mirror-scope token');
  assert.equal(tokens[0].label, 'mirror1');
});

test('x-mirror-token header rejects api-scope tokens', async () => {
  const at = await app.inject({
    method: 'POST', url: '/api/tokens', headers: { cookie: cookieA },
    payload: { label: 'api2' },
  });
  const { token } = at.json() as { token: string };
  // GET /api/cards uses requireUserOrMirror — mirror auth via x-mirror-token.
  // An api-scope token must NOT authenticate this endpoint.
  const r = await app.inject({
    method: 'GET',
    url: '/api/cards?scope=personal',
    headers: { 'x-mirror-token': token },
  });
  // Without a valid cookie or valid mirror token, requireUser falls through.
  // Expect 401 (auth required) — no cookie + invalid mirror token = unauthorized.
  assert.equal(r.statusCode, 401);
});
