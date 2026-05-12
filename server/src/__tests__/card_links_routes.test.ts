import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { cardLinkRoutes } from '../routes/card_links.js';

const app = Fastify();
await app.register(cookie, { secret: 'test-secret' });
await app.register(authRoutes);
await app.register(cardLinkRoutes);
await app.ready();

let cookieA = '';
let userId = '';
let aId = '';
let bId = '';

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
  const u = await register('rt_links');
  cookieA = u.cookie;
  userId = u.id;
  const a = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('a-r', 'today', 'manual', $1, 1) RETURNING id`, [userId]);
  const b = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('b-r', 'today', 'manual', $1, 2) RETURNING id`, [userId]);
  aId = a.rows[0]!.id;
  bId = b.rows[0]!.id;
  await pool.query(`INSERT INTO card_assignees (card_id, user_id) VALUES ($1, $2), ($3, $2)`, [aId, userId, bId]);
});

beforeEach(async () => {
  await pool.query(`DELETE FROM card_links WHERE from_card_id IN ($1, $2) OR to_card_id IN ($1, $2)`, [aId, bId]);
});

after(async () => {
  await app.close();
  await pool.query(`DELETE FROM card_links WHERE from_card_id IN ($1, $2) OR to_card_id IN ($1, $2)`, [aId, bId]);
  await pool.query(`DELETE FROM cards WHERE id IN ($1, $2)`, [aId, bId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
});

test('POST /api/cards/:id/links creates a link', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/api/cards/${aId}/links`,
    headers: { cookie: cookieA },
    payload: { to_card_id: bId, label: 'evolves_from', note: 'a note' },
  });
  assert.equal(res.statusCode, 201);
  const body = res.json() as { link: { id: string; label: string } };
  assert.equal(body.link.label, 'evolves_from');
});

test('POST returns 400 for invalid label', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/api/cards/${aId}/links`,
    headers: { cookie: cookieA },
    payload: { to_card_id: bId, label: 'bogus' },
  });
  assert.equal(res.statusCode, 400);
});

test('POST returns 409 on duplicate exact link', async () => {
  const first = await app.inject({
    method: 'POST',
    url: `/api/cards/${aId}/links`,
    headers: { cookie: cookieA },
    payload: { to_card_id: bId, label: 'related' },
  });
  assert.equal(first.statusCode, 201);
  const dup = await app.inject({
    method: 'POST',
    url: `/api/cards/${aId}/links`,
    headers: { cookie: cookieA },
    payload: { to_card_id: bId, label: 'related' },
  });
  assert.equal(dup.statusCode, 409);
});

test('POST returns 400 on self-link', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/api/cards/${aId}/links`,
    headers: { cookie: cookieA },
    payload: { to_card_id: aId, label: 'related' },
  });
  assert.equal(res.statusCode, 400);
});

test('DELETE removes the link', async () => {
  const created = await app.inject({
    method: 'POST',
    url: `/api/cards/${aId}/links`,
    headers: { cookie: cookieA },
    payload: { to_card_id: bId, label: 'split_from' },
  });
  const id = (created.json() as { link: { id: string } }).link.id;
  const res = await app.inject({
    method: 'DELETE',
    url: `/api/cards/${aId}/links/${id}`,
    headers: { cookie: cookieA },
  });
  assert.equal(res.statusCode, 204);
  const { rows } = await pool.query(`SELECT 1 FROM card_links WHERE id = $1`, [id]);
  assert.equal(rows.length, 0);
});

test('GET /api/cards/:id/links returns links + related_cards', async () => {
  await app.inject({
    method: 'POST',
    url: `/api/cards/${aId}/links`,
    headers: { cookie: cookieA },
    payload: { to_card_id: bId, label: 'inspired_by' },
  });
  const res = await app.inject({
    method: 'GET',
    url: `/api/cards/${aId}/links`,
    headers: { cookie: cookieA },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { links: Array<{ id: string }>; related_cards: Array<{ id: string }> };
  assert.ok(body.links.length >= 1);
  assert.ok(body.related_cards.some((c) => c.id === bId));
});

test('GET /api/cards/:id/chain returns nodes + edges + insights', async () => {
  await app.inject({
    method: 'POST',
    url: `/api/cards/${aId}/links`,
    headers: { cookie: cookieA },
    payload: { to_card_id: bId, label: 'related' },
  });
  const res = await app.inject({
    method: 'GET',
    url: `/api/cards/${aId}/chain?depth=2`,
    headers: { cookie: cookieA },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { nodes: Array<{ id: string }>; edges: unknown[]; insights: unknown[] };
  assert.ok(body.nodes.some((n) => n.id === aId));
  assert.ok(body.nodes.some((n) => n.id === bId));
  assert.ok(body.edges.length >= 1);
  assert.ok(Array.isArray(body.insights));
});

test('GET /chain clamps depth to [1, 6]', async () => {
  const r1 = await app.inject({
    method: 'GET',
    url: `/api/cards/${aId}/chain?depth=99`,
    headers: { cookie: cookieA },
  });
  assert.equal(r1.statusCode, 200);
  const r2 = await app.inject({
    method: 'GET',
    url: `/api/cards/${aId}/chain?depth=0`,
    headers: { cookie: cookieA },
  });
  assert.equal(r2.statusCode, 200);
  const r3 = await app.inject({
    method: 'GET',
    url: `/api/cards/${aId}/chain?depth=-5`,
    headers: { cookie: cookieA },
  });
  assert.equal(r3.statusCode, 200);
});
