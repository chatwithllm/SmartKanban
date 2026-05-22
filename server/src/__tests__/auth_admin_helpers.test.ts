import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import { reconcileEnvAdmin } from '../auth.js';

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

    // Confirm audit row was written atomically (same CTE)
    const { rows: aRows } = await pool.query<{ action: string }>(
      `SELECT action FROM admin_audit WHERE target_user_id = $1 AND action = 'env_promote'`,
      [userId],
    );
    assert.equal(aRows.length, 1);
    assert.equal(aRows[0]!.action, 'env_promote');
  } finally {
    if (orig === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = orig;
  }
});

test('reconcileEnvAdmin is additive — already-admin user returns true but writes no dup audit', async () => {
  // User is already admin from the previous test; calling again should not insert another audit row
  const orig = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = userEmail;
  try {
    const result = await reconcileEnvAdmin(userId, userEmail);
    // Returns true (email is in the list); CTE WHERE is_admin = FALSE matches 0 rows so no extra audit
    assert.equal(result, true);

    // Still only 1 audit row (the one from the previous test)
    const { rows: aRows } = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text c FROM admin_audit WHERE target_user_id = $1 AND action = 'env_promote'`,
      [userId],
    );
    assert.equal(Number(aRows[0]!.c), 1);
  } finally {
    if (orig === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = orig;
  }
});
