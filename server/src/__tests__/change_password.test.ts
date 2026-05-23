import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';

const app = Fastify();
await app.register(cookie, { secret: 't' });
await app.register(authRoutes);
await app.ready();

after(async () => { await app.close(); });

test('change-password updates hash and clears must_change_password', async () => {
  const email = `cp_${Math.random().toString(36).slice(2,8)}@test.local`;
  const reg = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name: 'CP', short_name: 'CP', email, password: 'oldpass1' },
  });
  assert.equal(reg.statusCode, 201);
  const c = (Array.isArray(reg.headers['set-cookie'])
    ? reg.headers['set-cookie'][0] : reg.headers['set-cookie']!)!.split(';')[0]!;
  await pool.query(`UPDATE users SET must_change_password = TRUE WHERE email = $1`, [email]);

  const ch = await app.inject({
    method: 'POST', url: '/api/auth/change-password',
    headers: { cookie: c },
    payload: { current_password: 'oldpass1', new_password: 'newpass2' },
  });
  assert.equal(ch.statusCode, 200);

  const u = await pool.query<{ must_change_password: boolean }>(
    `SELECT must_change_password FROM users WHERE email = $1`, [email],
  );
  assert.equal(u.rows[0]!.must_change_password, false);

  // verify the new password works
  const login = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email, password: 'newpass2' },
  });
  assert.equal(login.statusCode, 200);

  // cleanup
  await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
});

test('change-password rejects wrong current password with 401', async () => {
  const email = `cpw_${Math.random().toString(36).slice(2,8)}@test.local`;
  const reg = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name: 'CPW', short_name: 'CPW', email, password: 'rightpass' },
  });
  const c = (Array.isArray(reg.headers['set-cookie'])
    ? reg.headers['set-cookie'][0] : reg.headers['set-cookie']!)!.split(';')[0]!;
  const ch = await app.inject({
    method: 'POST', url: '/api/auth/change-password',
    headers: { cookie: c },
    payload: { current_password: 'wrongpass', new_password: 'newpass2' },
  });
  assert.equal(ch.statusCode, 401);
  assert.equal(ch.json().error, 'invalid_credentials');
  await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
});

test('change-password rejects short passwords with 400', async () => {
  const email = `cps_${Math.random().toString(36).slice(2,8)}@test.local`;
  const reg = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name: 'CPS', short_name: 'CPS', email, password: 'oldpass1' },
  });
  const c = (Array.isArray(reg.headers['set-cookie'])
    ? reg.headers['set-cookie'][0] : reg.headers['set-cookie']!)!.split(';')[0]!;
  const ch = await app.inject({
    method: 'POST', url: '/api/auth/change-password',
    headers: { cookie: c },
    payload: { current_password: 'oldpass1', new_password: 'abc' },
  });
  assert.equal(ch.statusCode, 400);
  assert.equal(ch.json().error, 'password_too_short');
  await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
});
