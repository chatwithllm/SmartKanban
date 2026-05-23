import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { issueTicket } from '../auth_tickets.js';
import { createSession } from '../auth.js';

const app = Fastify();
await app.register(cookie, { secret: 't' });
await app.register(authRoutes);
await app.ready();

after(async () => { await app.close(); });

test('GET /api/auth/config returns flags', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/auth/config' });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { google_enabled: boolean; open_signup: boolean };
  assert.equal(typeof body.google_enabled, 'boolean');
  assert.equal(typeof body.open_signup, 'boolean');
});

test('GET /api/auth/pending/:id returns 404 for unknown id', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/auth/pending/00000000-0000-0000-0000-000000000000',
  });
  assert.equal(res.statusCode, 404);
});

test('GET /api/auth/pending/:id returns approved + ticket when outcome=approved', async () => {
  // create a user + session + ticket to back the pending row's outcome_ticket
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (name, short_name, email, auth_hash)
     VALUES ('Pend', 'P', $1, '$argon2id$x') RETURNING id`,
    [`pend_${Math.random()}@test.local`],
  );
  const session = await createSession(u.rows[0]!.id);
  const ticket = await issueTicket(session);
  const p = await pool.query<{ id: string }>(
    `INSERT INTO pending_users (provider, provider_sub, email, name, outcome, outcome_ticket, outcome_at)
     VALUES ('google', $1, $2, 'P', 'approved', $3, NOW()) RETURNING id`,
    [`sub_${Math.random()}`, `p_${Math.random()}@ex.com`, ticket],
  );
  const res = await app.inject({ method: 'GET', url: `/api/auth/pending/${p.rows[0]!.id}` });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { status: string; ticket?: string };
  assert.equal(body.status, 'approved');
  assert.equal(body.ticket, ticket);
  // cleanup
  await pool.query(`DELETE FROM pending_users WHERE id = $1`, [p.rows[0]!.id]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [u.rows[0]!.id]);
});

test('POST /api/auth/ticket/exchange returns 410 on unknown ticket', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/ticket/exchange',
    payload: { ticket: 'definitely-not-a-real-ticket' },
  });
  assert.equal(res.statusCode, 410);
  assert.equal(res.json().error, 'ticket_invalid');
});

test('POST /api/auth/ticket/exchange consumes a valid ticket', async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (name, short_name, email, auth_hash)
     VALUES ('Ex', 'E', $1, '$argon2id$x') RETURNING id`,
    [`ex_${Math.random()}@test.local`],
  );
  const session = await createSession(u.rows[0]!.id);
  const ticket = await issueTicket(session);
  const res = await app.inject({
    method: 'POST', url: '/api/auth/ticket/exchange',
    payload: { ticket },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { token: string };
  assert.equal(body.token, session);
  // cleanup
  await pool.query(`DELETE FROM users WHERE id = $1`, [u.rows[0]!.id]);
});
