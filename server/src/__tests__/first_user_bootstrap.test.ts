import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';

const app = Fastify();
await app.register(cookie, { secret: 't' });
await app.register(authRoutes);
await app.ready();

// IMPORTANT: this test runs against a GENUINELY EMPTY users table.
// Other tests seed users; this one must not — that's the whole point.

before(async () => {
  // Clear any state from prior runs of this test in the same DB.
  // Cascades: sessions → users (FK), admin_audit (actor + target FKs are SET NULL).
  await pool.query(`DELETE FROM sessions`);
  await pool.query(`DELETE FROM admin_audit`);
  await pool.query(`DELETE FROM card_assignees`);
  await pool.query(`UPDATE cards SET created_by = NULL`);
  await pool.query(`DELETE FROM user_identities`);
  await pool.query(`DELETE FROM pending_users`);
  await pool.query(`DELETE FROM users`);
});

after(async () => {
  await app.close();
});

test('first user registered on an empty users table becomes admin and gets an audit row', async () => {
  const empty = await pool.query<{ c: string }>(`SELECT COUNT(*)::text c FROM users`);
  assert.equal(empty.rows[0]!.c, '0', 'precondition failed — users table must be empty');

  const email = `first_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const res = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name: 'First', short_name: 'First', email, password: 'password123' },
  });
  assert.equal(res.statusCode, 201);

  const u = await pool.query<{ is_admin: boolean }>(
    `SELECT is_admin FROM users WHERE email = $1`, [email],
  );
  assert.equal(u.rows[0]!.is_admin, true, 'first user must be is_admin=true');

  const a = await pool.query<{ metadata: { source: string } }>(
    `SELECT metadata FROM admin_audit
     WHERE actor_id = (SELECT id FROM users WHERE email = $1)
       AND action = 'env_promote'`,
    [email],
  );
  assert.equal(a.rowCount, 1, 'one env_promote audit row must exist for the bootstrap user');
  assert.equal(a.rows[0]!.metadata.source, 'first_user_bootstrap');

  // cleanup
  await pool.query(`DELETE FROM admin_audit WHERE actor_id = (SELECT id FROM users WHERE email = $1)`, [email]);
  await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
});

test('second user registered after the first is NOT auto-promoted', async () => {
  // Seed a first user so the table is non-empty
  const seedEmail = `seed_${Math.random().toString(36).slice(2, 8)}@test.local`;
  await pool.query(
    `INSERT INTO users (name, short_name, email, auth_hash, is_admin)
     VALUES ('Seed', 'Seed', $1, '$argon2id$placeholder', TRUE)`,
    [seedEmail],
  );

  const email = `second_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const res = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name: 'Second', short_name: 'Second', email, password: 'password123' },
  });
  assert.equal(res.statusCode, 201);

  const u = await pool.query<{ is_admin: boolean }>(
    `SELECT is_admin FROM users WHERE email = $1`, [email],
  );
  assert.equal(u.rows[0]!.is_admin, false, 'second user must NOT be is_admin=true');

  const a = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text c FROM admin_audit
     WHERE target_user_id = (SELECT id FROM users WHERE email = $1)`, [email],
  );
  assert.equal(a.rows[0]!.c, '0', 'no audit row should be written for the second user');

  // cleanup
  await pool.query(`DELETE FROM users WHERE email IN ($1, $2)`, [email, seedEmail]);
});
