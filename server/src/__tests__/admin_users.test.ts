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
    payload: { name, short_name: name, email, password: 'password123' },
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
