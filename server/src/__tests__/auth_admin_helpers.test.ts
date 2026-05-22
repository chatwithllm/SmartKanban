import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { reconcileEnvAdmin } from '../auth.js';
import { authRoutes } from '../routes/auth.js';

let userId = '';
let userEmail = '';

before(async () => {
  userEmail = `admin_test_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (name, short_name, email, auth_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
    ['Admin Test', 'adm', userEmail, '$argon2id$placeholder'],
  );
  userId = rows[0]!.id;
});

after(async () => {
  await pool.query(`DELETE FROM admin_audit WHERE target_user_id = $1`, [userId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  try { if (!(pool as { ended?: boolean }).ended) await pool.end(); } catch {}
});

test('reconcileEnvAdmin returns false when email not in ADMIN_EMAILS', async () => {
  const orig = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = 'other@example.com';
  try {
    const result = await reconcileEnvAdmin(userId, userEmail);
    assert.equal(result, false);
  } finally {
    if (orig === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = orig;
  }
});

test('reconcileEnvAdmin promotes user and writes audit row when email matches', async () => {
  // Reset state so this test is independent of run order
  await pool.query(`UPDATE users SET is_admin = FALSE WHERE id = $1`, [userId]);
  await pool.query(`DELETE FROM admin_audit WHERE actor_id = $1 AND action = 'env_promote'`, [userId]);

  const orig = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = `${userEmail}, other@example.com`;
  try {
    const result = await reconcileEnvAdmin(userId, userEmail);
    assert.equal(result, true);

    // Confirm is_admin flipped
    const { rows: uRows } = await pool.query<{ is_admin: boolean }>(
      `SELECT is_admin FROM users WHERE id = $1`,
      [userId],
    );
    assert.equal(uRows[0]!.is_admin, true);

    // Confirm audit row was written atomically (same CTE) and metadata contains source + email
    const a = await pool.query<{ metadata: { source: string; email: string } }>(
      `SELECT metadata FROM admin_audit
       WHERE actor_id = $1 AND action = 'env_promote'
       ORDER BY created_at DESC LIMIT 1`, [userId],
    );
    assert.equal(a.rows.length, 1);
    assert.equal(a.rows[0]!.metadata.source, 'ADMIN_EMAILS');
    assert.equal(a.rows[0]!.metadata.email.toLowerCase(), userEmail.toLowerCase());
  } finally {
    if (orig === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = orig;
  }
});

test('reconcileEnvAdmin is additive — already-admin user returns true but writes no dup audit', async () => {
  // Reset state so this test is independent of run order:
  // start with is_admin = FALSE so we can do one controlled promote, then verify no second audit row.
  await pool.query(`UPDATE users SET is_admin = FALSE WHERE id = $1`, [userId]);
  await pool.query(`DELETE FROM admin_audit WHERE actor_id = $1 AND action = 'env_promote'`, [userId]);

  const orig = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = userEmail;
  try {
    // First call: promotes user (is_admin was FALSE) and writes 1 audit row
    await reconcileEnvAdmin(userId, userEmail);

    // Second call: user is now already admin; CTE WHERE is_admin = FALSE matches 0 rows → no second audit row
    const result = await reconcileEnvAdmin(userId, userEmail);
    assert.equal(result, true);

    // Exactly 1 audit row for this test's actor+action
    const { rows: aRows } = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text c FROM admin_audit WHERE actor_id = $1 AND action = 'env_promote'`,
      [userId],
    );
    assert.equal(Number(aRows[0]!.c), 1);
  } finally {
    if (orig === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = orig;
  }
});

test('login response includes is_admin and reflects ADMIN_EMAILS reconciliation', async () => {
  const email = `login_admin_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const origAdminEmails = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = email;
  const app = Fastify();
  await app.register(cookie, { secret: 't' });
  await app.register(authRoutes);
  await app.ready();
  try {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'L', short_name: 'L', email, password: 'password123' },
    });
    assert.equal(reg.statusCode, 201);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'password123' },
    });
    assert.equal(login.statusCode, 200);
    const body = login.json() as { is_admin: boolean; must_change_password: boolean };
    assert.equal(body.is_admin, true);
    assert.equal(body.must_change_password, false);

    // /api/auth/me also returns is_admin
    const setCookieHeader = login.headers['set-cookie'];
    const rawCookie = Array.isArray(setCookieHeader)
      ? setCookieHeader[0]!
      : (setCookieHeader as string)!;
    const cookieHeader = rawCookie.split(';')[0]!;
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookieHeader },
    });
    assert.equal(me.statusCode, 200);
    const meBody = me.json() as { is_admin: boolean };
    assert.equal(meBody.is_admin, true);
  } finally {
    await app.close();
    await pool.query(`DELETE FROM admin_audit WHERE target_user_id IN (SELECT id FROM users WHERE email = $1)`, [email]);
    await pool.query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [email]);
    await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
    if (origAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = origAdminEmails;
  }
});
