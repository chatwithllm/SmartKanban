// Set a dummy API key so AI_ENABLED() returns true during route tests.
// This must run before any route handler that checks AI_ENABLED().
// openai.ts lazily initializes; the dummy key makes openai() return a client
// object (constructor does not validate the key).
process.env.OPENAI_API_KEY = 'test-dummy-insights-routes';

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { insightsRoutes } from '../routes/insights.js';
import { _resetForTest, _setRunnerForTest, _drainOnceForTest } from '../ai/brainstorm_queue.js';

const app = Fastify();
await app.register(cookie, { secret: 'test-secret' });
await app.register(authRoutes);
await app.register(insightsRoutes);
await app.ready();

let cookieA = '';
let userId = '';
let cardId = '';

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
  const u = await register('rt_insights');
  cookieA = u.cookie;
  userId = u.id;

  const c = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('rt card', 'today', 'manual', $1, 1) RETURNING id`,
    [userId],
  );
  cardId = c.rows[0]!.id;
});

after(async () => {
  await pool.query(`DELETE FROM ai_insights WHERE card_id = $1`, [cardId]);
  await pool.query(`DELETE FROM cards WHERE id = $1`, [cardId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  await app.close();
  try {
    if (!(pool as { ended?: boolean }).ended) await pool.end();
  } catch {
    // pool may already be ended by another test file in the same process
  }
});

beforeEach(async () => {
  // Clean up any leftover insights between tests so rate-limit tests start clean.
  await pool.query(`DELETE FROM ai_insights WHERE card_id = $1`, [cardId]);
  _resetForTest();
});

test('POST /api/cards/:id/insights/brainstorm returns 202 with pending insight', async () => {
  _resetForTest();
  _setRunnerForTest(async () => { /* noop — don't call LLM */ });
  const res = await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/insights/brainstorm`,
    headers: { cookie: cookieA },
  });
  assert.equal(res.statusCode, 202);
  const body = res.json() as { id: string; status: string };
  assert.equal(body.status, 'pending');
  assert.ok(body.id);
  await _drainOnceForTest();
});

test('POST returns 404 for unknown card', async () => {
  _setRunnerForTest(async () => {});
  const res = await app.inject({
    method: 'POST',
    url: `/api/cards/00000000-0000-0000-0000-000000000000/insights/brainstorm`,
    headers: { cookie: cookieA },
  });
  assert.equal(res.statusCode, 404);
});

test('POST returns 429 when one pending already exists for the card', async () => {
  _resetForTest();
  _setRunnerForTest(async () => { await new Promise((r) => setTimeout(r, 200)); });
  const a = await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/insights/brainstorm`,
    headers: { cookie: cookieA },
  });
  assert.equal(a.statusCode, 202);
  const b = await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/insights/brainstorm`,
    headers: { cookie: cookieA },
  });
  assert.equal(b.statusCode, 429);
  await _drainOnceForTest();
});

test('GET /api/cards/:id/insights returns array', async () => {
  _resetForTest();
  _setRunnerForTest(async () => {});
  await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/insights/brainstorm`,
    headers: { cookie: cookieA },
  });
  await _drainOnceForTest();
  const res = await app.inject({
    method: 'GET',
    url: `/api/cards/${cardId}/insights`,
    headers: { cookie: cookieA },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { insights: any[] };
  assert.ok(Array.isArray(body.insights));
  assert.ok(body.insights.length >= 1);
});
