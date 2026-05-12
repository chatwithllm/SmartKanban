import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { searchTavily, type TavilyResult } from '../ai/tavily.js';

test('searchTavily returns [] when no API key', async () => {
  const prev = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  const r = await searchTavily('anything');
  assert.deepEqual(r, []);
  if (prev) process.env.TAVILY_API_KEY = prev;
});

test('searchTavily posts to api.tavily.com and parses results', async () => {
  process.env.TAVILY_API_KEY = 'test-key';
  const fakeResponse = {
    results: [
      { title: 'Frigate docs', url: 'https://docs.frigate.video', content: 'NVR', score: 0.9 },
      { title: 'Scrypted', url: 'https://scrypted.app', content: 'NVR alt', score: 0.7 },
    ],
  };
  const fetchSpy = mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify(fakeResponse), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  try {
    const r = await searchTavily('frigate nvr');
    assert.equal(r.length, 2);
    assert.equal(r[0]!.url, 'https://docs.frigate.video');
    assert.equal(fetchSpy.mock.calls.length, 1);
    const [url, init] = fetchSpy.mock.calls[0]!.arguments as [string, RequestInit];
    assert.equal(url, 'https://api.tavily.com/search');
    assert.equal(init.method, 'POST');
    const body = JSON.parse(String(init.body));
    assert.equal(body.api_key, 'test-key');
    assert.equal(body.query, 'frigate nvr');
    assert.equal(body.search_depth, 'basic');
    assert.equal(body.max_results, 5);
  } finally {
    fetchSpy.mock.restore();
    delete process.env.TAVILY_API_KEY;
  }
});

test('searchTavily returns [] on HTTP error', async () => {
  process.env.TAVILY_API_KEY = 'test-key';
  const fetchSpy = mock.method(globalThis, 'fetch', async () =>
    new Response('{"error":"bad"}', { status: 401 }),
  );
  try {
    const r = await searchTavily('x');
    assert.deepEqual(r, []);
  } finally {
    fetchSpy.mock.restore();
    delete process.env.TAVILY_API_KEY;
  }
});

test('searchTavily returns [] on AbortError (timeout)', async () => {
  process.env.TAVILY_API_KEY = 'test-key';
  const fetchSpy = mock.method(globalThis, 'fetch', async (_url: any, init: any) => {
    const sig: AbortSignal = init.signal;
    await new Promise((_resolve, reject) => {
      sig.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    return new Response('{}');
  });
  try {
    const r = await searchTavily('x', 50);
    assert.deepEqual(r, []);
  } finally {
    fetchSpy.mock.restore();
    delete process.env.TAVILY_API_KEY;
  }
});

test('TavilyResult type shape exposes required fields', () => {
  const r: TavilyResult = { title: 't', url: 'u', content: 'c', score: 0.1 };
  assert.equal(r.title, 't');
});
