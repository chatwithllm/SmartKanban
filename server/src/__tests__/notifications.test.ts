import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { cardRoutes } from '../routes/cards.js';
import { chatRoutes } from '../routes/chat.js';
import { notificationRoutes } from '../routes/notifications.js';

const app = Fastify();
await app.register(cookie, { secret: 'test-secret' });
await app.register(authRoutes);
await app.register(cardRoutes);
await app.register(chatRoutes);
await app.register(notificationRoutes);
await app.ready();

let cookieA = '';
let cookieB = '';
let userAId = '';
let userBId = '';
let cardId = '';

async function register(name: string) {
  const email = `notif_${name}_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const res = await app.inject({
    method: 'POST', url: '/api/auth/register',
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

  // Create a card assigned to both users
  const cardRes = await app.inject({
    method: 'POST', url: '/api/cards',
    headers: { cookie: cookieA },
    payload: { title: 'Notif test card', status: 'backlog', assignees: [userAId, userBId] },
  });
  cardId = (cardRes.json() as { id: string }).id;
});

after(async () => {
  await pool.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [[userAId, userBId]]);
  await pool.query(`DELETE FROM cards WHERE created_by = ANY($1::uuid[])`, [[userAId, userBId]]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userAId, userBId]]);
  await app.close();
  try { if (!(pool as { ended?: boolean }).ended) await pool.end(); } catch {}
});

test('GET /api/notifications requires auth', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/notifications' });
  assert.equal(res.statusCode, 401);
});

test('GET /api/notifications returns empty array initially', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/notifications',
    headers: { cookie: cookieB },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as unknown[];
  assert.ok(Array.isArray(body));
});

test('posting a message creates notifications for assignees (excluding sender)', async () => {
  const msgRes = await app.inject({
    method: 'POST', url: `/api/cards/${cardId}/messages`,
    headers: { cookie: cookieA },
    payload: { content: 'Hello bob, check this out' },
  });
  assert.equal(msgRes.statusCode, 201);

  // Give async fan-out a moment to complete
  await new Promise(r => setTimeout(r, 200));

  // Bob should have a notification
  const notifRes = await app.inject({
    method: 'GET', url: '/api/notifications',
    headers: { cookie: cookieB },
  });
  const notifs = notifRes.json() as Array<{ actor_name: string; preview: string; read: boolean }>;
  const ourNotif = notifs.find(n => n.actor_name === 'alice');
  assert.ok(ourNotif, 'bob should have a notification from alice');
  assert.equal(ourNotif!.read, false);
  assert.ok(ourNotif!.preview.includes('Hello bob'));

  // Alice should NOT have a notification for her own message
  const aliceNotifRes = await app.inject({
    method: 'GET', url: '/api/notifications',
    headers: { cookie: cookieA },
  });
  const aliceNotifs = aliceNotifRes.json() as Array<{ actor_name: string }>;
  const selfNotif = aliceNotifs.find(n => n.actor_name === 'alice');
  assert.equal(selfNotif, undefined, 'alice should not notify herself');
});

test('PUT /api/notifications/read-all marks all as read', async () => {
  const res = await app.inject({
    method: 'PUT', url: '/api/notifications/read-all',
    headers: { cookie: cookieB },
  });
  assert.equal(res.statusCode, 204);

  const notifRes = await app.inject({
    method: 'GET', url: '/api/notifications',
    headers: { cookie: cookieB },
  });
  const notifs = notifRes.json() as Array<{ read: boolean }>;
  const unread = notifs.filter(n => !n.read);
  assert.equal(unread.length, 0);
});

test('PUT /api/notifications/read marks specific ids as read', async () => {
  await app.inject({
    method: 'POST', url: `/api/cards/${cardId}/messages`,
    headers: { cookie: cookieA },
    payload: { content: 'Second message' },
  });
  await new Promise(r => setTimeout(r, 200));

  const notifRes = await app.inject({
    method: 'GET', url: '/api/notifications',
    headers: { cookie: cookieB },
  });
  const notifs = notifRes.json() as Array<{ id: number; read: boolean }>;
  const unread = notifs.filter(n => !n.read);
  assert.ok(unread.length > 0, 'should have at least one unread');

  const res = await app.inject({
    method: 'PUT', url: '/api/notifications/read',
    headers: { cookie: cookieB },
    payload: { ids: [unread[0]!.id] },
  });
  assert.equal(res.statusCode, 204);
});

test('subscribe/unsubscribe push endpoint', async () => {
  const sub = {
    endpoint: 'https://push.example.com/test-endpoint',
    p256dh: 'BGtestkey1234567890abcdefghijklmno',
    auth: 'testauth123',
  };

  const subRes = await app.inject({
    method: 'POST', url: '/api/push/subscribe',
    headers: { cookie: cookieA },
    payload: sub,
  });
  assert.equal(subRes.statusCode, 204);

  const delRes = await app.inject({
    method: 'DELETE', url: '/api/push/subscribe',
    headers: { cookie: cookieA },
    payload: { endpoint: sub.endpoint },
  });
  assert.equal(delRes.statusCode, 204);
});
