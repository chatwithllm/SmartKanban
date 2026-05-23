import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { adminRoutes } from '../routes/admin.js';

const app = Fastify();
await app.register(cookie, { secret: 't' });
await app.register(authRoutes);
await app.register(adminRoutes);
await app.ready();

let adminCookie = '';

async function makePending(email: string, sub: string) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO pending_users (provider, provider_sub, email, email_verified, name)
     VALUES ('google', $1, $2, true, 'Tester') RETURNING id`,
    [sub, email],
  );
  return rows[0]!.id;
}

before(async () => {
  const email = `pa_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const res = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name: 'A', short_name: 'A', email, password: 'password123' },
  });
  adminCookie = (Array.isArray(res.headers['set-cookie'])
    ? res.headers['set-cookie'][0]
    : res.headers['set-cookie']!)!.split(';')[0]!;
  await pool.query(`UPDATE users SET is_admin = TRUE WHERE email = $1`, [email]);
});

after(async () => { await app.close(); });

test('approve creates user, identity, session, ticket; sets outcome=approved; writes audit', async () => {
  const email = `pend_${Math.random().toString(36).slice(2, 8)}@ex.com`;
  const sub = `sub-${Math.random().toString(36).slice(2, 10)}`;
  const id = await makePending(email, sub);
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/pending/${id}/approve`,
    headers: { cookie: adminCookie },
    payload: { short_name: 'Pend' },
  });
  assert.equal(res.statusCode, 200);
  const u = await pool.query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
  assert.equal(u.rowCount, 1);
  const p = await pool.query(`SELECT outcome, outcome_ticket FROM pending_users WHERE id = $1`, [id]);
  assert.equal(p.rows[0]!.outcome, 'approved');
  assert.ok(p.rows[0]!.outcome_ticket);
  const i = await pool.query(`SELECT 1 FROM user_identities WHERE user_id = $1`, [u.rows[0]!.id]);
  assert.equal(i.rowCount, 1);
  const a = await pool.query(
    `SELECT 1 FROM admin_audit WHERE action='approve_user' AND target_pending_id=$1`, [id],
  );
  assert.equal(a.rowCount, 1);
});

test('approving an already-approved row returns 409 pending_gone', async () => {
  const email = `dup_${Math.random().toString(36).slice(2, 8)}@ex.com`;
  const sub = `sub-${Math.random().toString(36).slice(2, 10)}`;
  const id = await makePending(email, sub);
  await app.inject({
    method: 'POST', url: `/api/admin/pending/${id}/approve`,
    headers: { cookie: adminCookie }, payload: { short_name: 'X' },
  });
  const res2 = await app.inject({
    method: 'POST', url: `/api/admin/pending/${id}/approve`,
    headers: { cookie: adminCookie }, payload: { short_name: 'X' },
  });
  assert.equal(res2.statusCode, 409);
  assert.equal(res2.json().error, 'pending_gone');
});

test('reject sets outcome=rejected AND writes audit with email + name snapshot', async () => {
  const email = `r_${Math.random().toString(36).slice(2, 8)}@ex.com`;
  const sub = `sub-${Math.random().toString(36).slice(2, 10)}`;
  const id = await makePending(email, sub);
  const res = await app.inject({
    method: 'POST', url: `/api/admin/pending/${id}/reject`,
    headers: { cookie: adminCookie },
  });
  assert.equal(res.statusCode, 200);
  const p = await pool.query(`SELECT outcome FROM pending_users WHERE id = $1`, [id]);
  assert.equal(p.rows[0]!.outcome, 'rejected');
  const a = await pool.query<{ metadata: { email?: string; name?: string } }>(
    `SELECT metadata FROM admin_audit
     WHERE action='reject_user' AND target_pending_id=$1
     ORDER BY created_at DESC LIMIT 1`, [id],
  );
  assert.equal(a.rows[0]!.metadata.email, email);
  assert.equal(a.rows[0]!.metadata.name, 'Tester');
});

test('approve with email of an existing user returns 409 email_in_use', async () => {
  const email = `taken_${Math.random().toString(36).slice(2, 8)}@ex.com`;
  await pool.query(
    `INSERT INTO users (name, short_name, email, auth_hash) VALUES ('Taken','T',$1,'$argon2id$x')`,
    [email],
  );
  const sub = `sub-${Math.random().toString(36).slice(2, 10)}`;
  const id = await makePending(email, sub);
  const res = await app.inject({
    method: 'POST', url: `/api/admin/pending/${id}/approve`,
    headers: { cookie: adminCookie }, payload: { short_name: 'X' },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error, 'email_in_use');
});

test('GET /api/admin/pending lists only outcome=pending rows', async () => {
  const email = `only_${Math.random().toString(36).slice(2, 8)}@ex.com`;
  const sub = `sub-${Math.random().toString(36).slice(2, 10)}`;
  const id = await makePending(email, sub);
  const res = await app.inject({
    method: 'GET', url: '/api/admin/pending',
    headers: { cookie: adminCookie },
  });
  assert.equal(res.statusCode, 200);
  const list = res.json() as Array<{ id: string }>;
  assert.ok(list.some(r => r.id === id));
});
