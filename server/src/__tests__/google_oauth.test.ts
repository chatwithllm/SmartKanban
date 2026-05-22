import { test } from 'node:test';
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
