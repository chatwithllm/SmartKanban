import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHostBlockedForSSRF, fetchAndExtract } from '../knowledge_fetch.js';

test('SSRF guard blocks localhost', async () => {
  assert.equal(await isHostBlockedForSSRF('localhost'), true);
});
test('SSRF guard blocks 127.0.0.1', async () => {
  assert.equal(await isHostBlockedForSSRF('127.0.0.1'), true);
});
test('SSRF guard blocks 169.254.169.254 (metadata)', async () => {
  assert.equal(await isHostBlockedForSSRF('169.254.169.254'), true);
});
test('SSRF guard blocks 10.0.0.1', async () => {
  assert.equal(await isHostBlockedForSSRF('10.0.0.1'), true);
});
test('SSRF guard allows public host', async () => {
  // Use a stable public address that resolves to public IP. Skip if offline.
  try {
    assert.equal(await isHostBlockedForSSRF('example.com'), false);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOTFOUND') return;
    throw e;
  }
});

test('fetchAndExtract parses HTML via injected fetcher', async () => {
  const html = `<!doctype html><html><head><title>T</title></head>
    <body><article><h1>T</h1><p>Hello world body content for readability extraction.</p></article></body></html>`;
  const { title, body } = await fetchAndExtract(
    'https://example.com/x',
    async () => new Response(html, { headers: { 'content-type': 'text/html' } }),
  );
  assert.match(body, /Hello world/);
  assert.equal(title, 'T');
});

test('fetchAndExtract rejects non-text content-type', async () => {
  await assert.rejects(
    fetchAndExtract(
      'https://example.com/x',
      async () => new Response('binary', { headers: { 'content-type': 'application/octet-stream' } }),
    ),
    /unsupported content-type/,
  );
});
