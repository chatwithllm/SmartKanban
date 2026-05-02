import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { cardRoutes } from '../routes/cards.js';
import { chatRoutes } from '../routes/chat.js';

const app = Fastify();
await app.register(cookie, { secret: 'test-secret' });
await app.register(authRoutes);
await app.register(cardRoutes);
await app.register(chatRoutes);
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
  await pool.query(`DELETE FROM cards WHERE created_by = ANY($1::uuid[])`, [[userAId, userBId]]);
});

async function createCard(cookie: string, title = 'test card') {
  const res = await app.inject({
    method: 'POST', url: '/api/cards',
    headers: { cookie },
    payload: { title },
  });
  return (res.json() as { id: string }).id;
}

// ---- GET /api/cards/:id/events ----

test('GET /api/cards/:id/events returns array for new card', async () => {
  const cardId = await createCard(cookieA);
  const res = await app.inject({
    method: 'GET', url: `/api/cards/${cardId}/events`,
    headers: { cookie: cookieA },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.json()));
});

test('GET /api/cards/:id/events 401 without auth', async () => {
  const cardId = await createCard(cookieA);
  const res = await app.inject({ method: 'GET', url: `/api/cards/${cardId}/events` });
  assert.equal(res.statusCode, 401);
});

test('GET /api/cards/:id/events 404 for invisible card', async () => {
  const cardId = await createCard(cookieB);
  const res = await app.inject({
    method: 'GET', url: `/api/cards/${cardId}/events`,
    headers: { cookie: cookieA },
  });
  assert.equal(res.statusCode, 404);
});

// ---- POST /api/cards/:id/messages ----

test('POST /api/cards/:id/messages creates message event', async () => {
  const cardId = await createCard(cookieA);
  const res = await app.inject({
    method: 'POST', url: `/api/cards/${cardId}/messages`,
    headers: { cookie: cookieA },
    payload: { content: 'hello world' },
  });
  assert.equal(res.statusCode, 201);
  const ev = res.json() as { entry_type: string; content: string; actor_name: string };
  assert.equal(ev.entry_type, 'message');
  assert.equal(ev.content, 'hello world');
  assert.equal(ev.actor_name, 'alice');
});

test('POST /api/cards/:id/messages 400 for empty content', async () => {
  const cardId = await createCard(cookieA);
  const res = await app.inject({
    method: 'POST', url: `/api/cards/${cardId}/messages`,
    headers: { cookie: cookieA },
    payload: { content: '' },
  });
  assert.equal(res.statusCode, 400);
});

test('POST /api/cards/:id/messages 400 for content over 2000 chars', async () => {
  const cardId = await createCard(cookieA);
  const res = await app.inject({
    method: 'POST', url: `/api/cards/${cardId}/messages`,
    headers: { cookie: cookieA },
    payload: { content: 'x'.repeat(2001) },
  });
  assert.equal(res.statusCode, 400);
});

test('POST /api/cards/:id/messages 404 for invisible card', async () => {
  const cardId = await createCard(cookieB);
  const res = await app.inject({
    method: 'POST', url: `/api/cards/${cardId}/messages`,
    headers: { cookie: cookieA },
    payload: { content: 'hi' },
  });
  assert.equal(res.statusCode, 404);
});

test('GET /api/cards/:id/events shows message after post', async () => {
  const cardId = await createCard(cookieA);
  await app.inject({
    method: 'POST', url: `/api/cards/${cardId}/messages`,
    headers: { cookie: cookieA },
    payload: { content: 'first message' },
  });
  const res = await app.inject({
    method: 'GET', url: `/api/cards/${cardId}/events`,
    headers: { cookie: cookieA },
  });
  const events = res.json() as Array<{ entry_type: string; content: string }>;
  const msg = events.find(e => e.entry_type === 'message');
  assert.ok(msg);
  assert.equal(msg!.content, 'first message');
});

// ---- PUT /api/cards/:id/events/read ----

test('PUT /api/cards/:id/events/read returns 204', async () => {
  const cardId = await createCard(cookieA);
  const res = await app.inject({
    method: 'PUT', url: `/api/cards/${cardId}/events/read`,
    headers: { cookie: cookieA },
    payload: { last_read_id: 999 },
  });
  assert.equal(res.statusCode, 204);
});

// ---- GET /api/messages/unread ----

test('GET /api/messages/unread returns count then zero after marking read', async () => {
  // Card with no assignees = visible to all via inbox
  const sharedRes = await app.inject({
    method: 'POST', url: '/api/cards',
    headers: { cookie: cookieA },
    payload: { title: 'shared card', assignees: [] },
  });
  const sharedCardId = (sharedRes.json() as { id: string }).id;

  // Bob posts on the shared card
  await app.inject({
    method: 'POST', url: `/api/cards/${sharedCardId}/messages`,
    headers: { cookie: cookieB },
    payload: { content: 'hi alice' },
  });

  // Alice should see 1 unread
  const before = await app.inject({
    method: 'GET', url: '/api/messages/unread',
    headers: { cookie: cookieA },
  });
  const beforeCounts = before.json() as Record<string, number>;
  assert.equal(beforeCounts[sharedCardId], 1);

  // Alice marks read
  const eventsRes = await app.inject({
    method: 'GET', url: `/api/cards/${sharedCardId}/events`,
    headers: { cookie: cookieA },
  });
  const events = eventsRes.json() as Array<{ id: string }>;
  const maxId = Math.max(...events.map(e => parseInt(e.id, 10)));
  await app.inject({
    method: 'PUT', url: `/api/cards/${sharedCardId}/events/read`,
    headers: { cookie: cookieA },
    payload: { last_read_id: maxId },
  });

  // Now 0 unread
  const after = await app.inject({
    method: 'GET', url: '/api/messages/unread',
    headers: { cookie: cookieA },
  });
  const afterCounts = after.json() as Record<string, number>;
  assert.equal(afterCounts[sharedCardId] ?? 0, 0);
});
