import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { googleEnabled, verifyIdToken } from '../google.js';

test('googleEnabled() returns false when GOOGLE_CLIENT_ID/SECRET are unset', () => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  assert.equal(googleEnabled(), false);
});

test('googleEnabled() returns true when both are set', () => {
  process.env.GOOGLE_CLIENT_ID = 'x';
  process.env.GOOGLE_CLIENT_SECRET = 'y';
  assert.equal(googleEnabled(), true);
});

test('verifyIdToken rejects an empty token', async () => {
  await assert.rejects(() => verifyIdToken(''), /id_token_invalid/);
});

// Route-level tests — use Fastify inject so no real DB/Google calls needed.
// These tests only exercise the CSRF guard and the disabled-guard which are
// purely in-process and require no external services.

process.env.GOOGLE_CLIENT_ID = 'test';
process.env.GOOGLE_CLIENT_SECRET = 'test';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost/callback';
process.env.PUBLIC_APP_URL = 'http://localhost:5173';

const Fastify = (await import('fastify')).default;
const cookie = (await import('@fastify/cookie')).default;
const { googleOauthRoutes } = await import('../routes/google_oauth.js');

const app2 = Fastify();
await app2.register(cookie, { secret: 't' });
await app2.register(googleOauthRoutes);
await app2.ready();

after(async () => { await app2.close(); });

test('callback with mismatched state returns 400 csrf_invalid', async () => {
  const res = await app2.inject({
    method: 'GET',
    url: '/api/auth/google/callback?code=c&state=web.aaa',
    headers: { cookie: 'g_oauth_state=web.bbb' },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'csrf_invalid');
});

test('callback with missing state cookie returns 400 csrf_invalid', async () => {
  const res = await app2.inject({
    method: 'GET',
    url: '/api/auth/google/callback?code=c&state=web.aaa',
  });
  assert.equal(res.statusCode, 400);
});

test('start with google disabled returns 503', async () => {
  delete process.env.GOOGLE_CLIENT_ID;
  const res = await app2.inject({ method: 'GET', url: '/api/auth/google/start' });
  assert.equal(res.statusCode, 503);
  process.env.GOOGLE_CLIENT_ID = 'test';
});
