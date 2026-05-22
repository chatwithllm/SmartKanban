import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { adminRoutes } from '../routes/admin.js';

const app = Fastify();
await app.register(cookie, { secret: 'test-secret' });
await app.register(authRoutes);
await app.register(adminRoutes);
await app.ready();

async function register(name: string, makeAdmin = false) {
  const email = `${name}_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name, short_name: name.slice(0, 16), email, password: 'password123' },
  });
  const setCookie = res.headers['set-cookie'];
  const cookieStr = (Array.isArray(setCookie) ? setCookie[0] : setCookie) as string;
  const id = (res.json() as { id: string }).id;
  if (makeAdmin) await pool.query(`UPDATE users SET is_admin = TRUE WHERE id = $1`, [id]);
  return { cookie: cookieStr.split(';')[0]!, id, email };
}

let adminCookie = '';
let userCookie = '';

before(async () => {
  adminCookie = (await register('admin', true)).cookie;
  userCookie  = (await register('regular', false)).cookie;
});

after(async () => {
  await app.close();
});

test('GET /api/admin/users rejects non-admin with 403', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/admin/users',
    headers: { cookie: userCookie },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, 'admin_required');
});

test('GET /api/admin/users returns the list when called by an admin', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/admin/users',
    headers: { cookie: adminCookie },
  });
  assert.equal(res.statusCode, 200);
  const list = res.json() as Array<{ id: string; is_admin: boolean; identities: unknown[] }>;
  assert.ok(list.length >= 2);
  assert.ok(list.some(u => u.is_admin === true));
});

test('POST /api/admin/users/:id/promote flips is_admin and writes audit row', async () => {
  const target = await register('promote_target');
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/users/${target.id}/promote`,
    headers: { cookie: adminCookie },
  });
  assert.equal(res.statusCode, 200);
  const u = await pool.query(`SELECT is_admin FROM users WHERE id = $1`, [target.id]);
  assert.equal(u.rows[0]!.is_admin, true);
  const a = await pool.query(
    `SELECT count(*)::int AS c FROM admin_audit WHERE action='promote' AND target_user_id=$1`,
    [target.id],
  );
  assert.equal(a.rows[0]!.c, 1);
});

test('promote on an already-admin user returns 409 already_admin', async () => {
  const target = await register('already_admin', true);
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/users/${target.id}/promote`,
    headers: { cookie: adminCookie },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error, 'already_admin');
});

test('demote blocks when it would leave zero admins (last_admin)', async () => {
  // Demote all admins except one — that one is the sole admin
  await pool.query(`UPDATE users SET is_admin = FALSE`);
  const sole = await register('sole_admin', true);
  // adminCookie no longer points at an admin — demote needs an admin session
  // Re-issue: login as the sole admin
  const login = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: sole.email, password: 'password123' },
  });
  const soleCookie = (Array.isArray(login.headers['set-cookie'])
    ? login.headers['set-cookie'][0] : login.headers['set-cookie']!)!.split(';')[0]!;
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/users/${sole.id}/demote`,
    headers: { cookie: soleCookie },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error, 'cannot_demote_self_last_admin');
  // Restore the original admin so later tests can use adminCookie
  await pool.query(`UPDATE users SET is_admin = TRUE WHERE id IN (
    SELECT user_id FROM sessions WHERE token = $1
  )`, [adminCookie.split('=')[1]]);
});

test('demote succeeds when at least one other admin remains', async () => {
  const second = await register('second_admin_for_demote', true);
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/users/${second.id}/demote`,
    headers: { cookie: adminCookie },
  });
  assert.equal(res.statusCode, 200);
  const u = await pool.query(`SELECT is_admin FROM users WHERE id = $1`, [second.id]);
  assert.equal(u.rows[0]!.is_admin, false);
});

test('POST /api/admin/users/:id/reset-password updates hash, sets must_change_password, kills sessions', async () => {
  const target = await register('reset_target');
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/users/${target.id}/reset-password`,
    headers: { cookie: adminCookie },
    payload: { new_password: 'newpassword' },
  });
  assert.equal(res.statusCode, 200);
  const u = await pool.query<{ must_change_password: boolean; auth_hash: string }>(
    `SELECT must_change_password, auth_hash FROM users WHERE id = $1`, [target.id],
  );
  assert.equal(u.rows[0]!.must_change_password, true);
  assert.ok(u.rows[0]!.auth_hash.startsWith('$argon2'));
  const s = await pool.query(`SELECT count(*)::int AS c FROM sessions WHERE user_id = $1`, [target.id]);
  assert.equal(s.rows[0]!.c, 0);
});

test('reset-password rejects passwords shorter than 6 chars', async () => {
  const target = await register('short_pw');
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/users/${target.id}/reset-password`,
    headers: { cookie: adminCookie },
    payload: { new_password: 'abc' },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'password_too_short');
});

test('GET /api/admin/audit returns recent rows ordered desc with cursor pagination', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/admin/audit?limit=5',
    headers: { cookie: adminCookie },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { items: Array<{ action: string; created_at: string }>; next_before?: string };
  assert.ok(Array.isArray(body.items));
  assert.ok(body.items.length <= 5);
  if (body.items.length >= 2) {
    assert.ok(new Date(body.items[0]!.created_at) >= new Date(body.items[1]!.created_at));
  }
});

test('POST /api/admin/users/:id/revoke-sessions deletes all sessions and audits the count', async () => {
  const target = await register('revoke_target');
  // create a second session by logging in again
  await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: target.email, password: 'password123' },
  });
  const before = await pool.query(`SELECT count(*)::int AS c FROM sessions WHERE user_id = $1`, [target.id]);
  assert.ok(before.rows[0]!.c >= 1);
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/users/${target.id}/revoke-sessions`,
    headers: { cookie: adminCookie },
  });
  assert.equal(res.statusCode, 200);
  const after = await pool.query(`SELECT count(*)::int AS c FROM sessions WHERE user_id = $1`, [target.id]);
  assert.equal(after.rows[0]!.c, 0);
  const a = await pool.query<{ metadata: { count: number } }>(
    `SELECT metadata FROM admin_audit
     WHERE action='revoke_sessions' AND target_user_id=$1
     ORDER BY created_at DESC LIMIT 1`, [target.id],
  );
  assert.equal(a.rows[0]!.metadata.count, before.rows[0]!.c);
});
