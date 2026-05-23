import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import { issueTicket, consumeTicket } from '../auth_tickets.js';
import { createSession } from '../auth.js';

let userId = '';
let sessionToken = '';

before(async () => {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (name, short_name, email, auth_hash)
     VALUES ('Ticket', 'T', $1, '$argon2id$x') RETURNING id`,
    [`ticket_${Math.random()}@test.local`],
  );
  userId = rows[0]!.id;
  sessionToken = await createSession(userId);
});

after(async () => {
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
});

test('issueTicket creates a 60s ticket bound to the session', async () => {
  const t = await issueTicket(sessionToken);
  assert.ok(t.length > 20);
  const { rows } = await pool.query(
    `SELECT consumed, expires_at FROM auth_tickets WHERE ticket = $1`, [t],
  );
  assert.equal(rows[0]!.consumed, false);
  assert.ok(new Date(rows[0]!.expires_at).getTime() > Date.now());
});

test('consumeTicket returns the session token and marks consumed', async () => {
  const t = await issueTicket(sessionToken);
  const token = await consumeTicket(t);
  assert.equal(token, sessionToken);
  await assert.rejects(() => consumeTicket(t), /ticket_invalid/);
});

test('consumeTicket rejects unknown tickets', async () => {
  await assert.rejects(() => consumeTicket('does-not-exist'), /ticket_invalid/);
});

test('consumeTicket rejects expired tickets', async () => {
  const t = await issueTicket(sessionToken);
  await pool.query(`UPDATE auth_tickets SET expires_at = NOW() - INTERVAL '1 second' WHERE ticket = $1`, [t]);
  await assert.rejects(() => consumeTicket(t), /ticket_invalid/);
});
