import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { cardRoutes } from '../routes/cards.js';

const RUN_ID = Math.random().toString(36).slice(2, 8);

const app = Fastify();
await app.register(cookie, { secret: 'test-secret' });
await app.register(authRoutes);
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
  const id = (res.json() as { id: string }).id;
  return { cookie: cookieStr.split(';')[0]!, id };
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
  await pool.query(`DELETE FROM cards WHERE created_by = $1`, [userAId]);
});

test('POST /api/cards accepts project field; GET /api/cards?project=<key> filters', async () => {
  const create1 = await app.inject({
    method: 'POST',
    url: '/api/cards',
    headers: { cookie: cookieA },
    payload: { title: 'A in proj-x', project: `proj-x-${RUN_ID}` },
  });
  assert.equal(create1.statusCode, 201);
  assert.equal(create1.json().project, `proj-x-${RUN_ID}`);

  const create2 = await app.inject({
    method: 'POST',
    url: '/api/cards',
    headers: { cookie: cookieA },
    payload: { title: 'B in proj-y', project: `proj-y-${RUN_ID}` },
  });
  assert.equal(create2.statusCode, 201);

  const create3 = await app.inject({
    method: 'POST',
    url: '/api/cards',
    headers: { cookie: cookieA },
    payload: { title: 'C no project' },
  });
  assert.equal(create3.statusCode, 201);
  assert.equal(create3.json().project, null);

  const filtered = await app.inject({
    method: 'GET',
    url: `/api/cards?scope=personal&project=proj-x-${RUN_ID}`,
    headers: { cookie: cookieA },
  });
  assert.equal(filtered.statusCode, 200);
  const cards = filtered.json() as Array<{ title: string; project: string | null }>;
  assert.equal(cards.length, 1);
  assert.equal(cards[0]!.title, 'A in proj-x');
});
