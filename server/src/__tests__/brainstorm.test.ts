import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractKeyTerms,
  buildBrainstormPrompt,
  parseBrainstormResponse,
  type LocalContext,
  type WebContext,
} from '../ai/brainstorm.js';

test('extractKeyTerms picks capitalized words + hashtags', () => {
  const r = extractKeyTerms('Rethink Frigate setup on the HA mirror', ['camera', 'streaming']);
  assert.ok(r.includes('Rethink'));
  assert.ok(r.includes('Frigate'));
  assert.ok(r.includes('HA'));
  assert.ok(r.includes('camera'));
  assert.ok(r.includes('streaming'));
});

test('extractKeyTerms drops short words and stopwords', () => {
  const r = extractKeyTerms('on the of an and HA', []);
  assert.ok(!r.includes('on'));
  assert.ok(!r.includes('the'));
  assert.ok(r.includes('HA'));
});

test('buildBrainstormPrompt includes card, local, web sections', () => {
  const prompt = buildBrainstormPrompt(
    { title: 'My card', description: 'desc', tags: ['t1'] },
    {
      cards: [{ id: 'c1', title: 'related card', snippet: 'snip' }],
      knowledge: [{ id: 'k1', title: 'related kb', snippet: 'snip2' }],
    } satisfies LocalContext,
    {
      results: [{ title: 'web', url: 'https://x', content: 'web snip', score: 0.9 }],
    } satisfies WebContext,
  );
  assert.match(prompt, /My card/);
  assert.match(prompt, /related card/);
  assert.match(prompt, /related kb/);
  assert.match(prompt, /https:\/\/x/);
  assert.match(prompt, /strict JSON/i);
});

test('parseBrainstormResponse extracts well-formed JSON', () => {
  const raw = JSON.stringify({
    summary: 'a',
    related_items: [{ kind: 'card', id: 'c1', title: 't', why: 'w' }],
    web_findings: [{ title: 'wt', url: 'https://x', why: 'ww' }],
    next_steps: ['1', '2'],
  });
  const r = parseBrainstormResponse(raw);
  assert.equal(r.summary, 'a');
  assert.equal(r.body.related_items?.length, 1);
  assert.equal(r.body.web_findings?.length, 1);
  assert.equal(r.body.next_steps?.length, 2);
});

test('parseBrainstormResponse handles markdown fences', () => {
  const raw = '```json\n{"summary":"x","related_items":[],"web_findings":[],"next_steps":[]}\n```';
  const r = parseBrainstormResponse(raw);
  assert.equal(r.summary, 'x');
});

test('parseBrainstormResponse caps arrays', () => {
  const raw = JSON.stringify({
    summary: 's',
    related_items: Array(20).fill({ kind: 'card', id: 'x', title: 't', why: 'w' }),
    web_findings: Array(20).fill({ title: 't', url: 'https://x', why: 'w' }),
    next_steps: Array(20).fill('step'),
  });
  const r = parseBrainstormResponse(raw);
  assert.ok((r.body.related_items?.length ?? 0) <= 8);
  assert.ok((r.body.web_findings?.length ?? 0) <= 3);
  assert.ok((r.body.next_steps?.length ?? 0) <= 4);
});

test('parseBrainstormResponse throws on bad JSON', () => {
  assert.throws(() => parseBrainstormResponse('not json{'));
});
