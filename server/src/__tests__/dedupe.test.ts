import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankCandidates, type Candidate, buildDedupePrompt, parseDedupeResponse } from '../ai/dedupe.js';

const sampleCandidates: Candidate[] = [
  { kind: 'card', id: 'c1', title: 'Buy eggs', snippet: 'pasture-raised', contextLine: 'Today, 2d ago' },
  { kind: 'knowledge', id: 'k1', title: 'Egg storage tips', snippet: 'best at 40F', contextLine: 'Knowledge' },
];

test('buildDedupePrompt includes original text + indexed candidates', () => {
  const prompt = buildDedupePrompt('eggs for breakfast', sampleCandidates);
  assert.match(prompt, /eggs for breakfast/);
  assert.match(prompt, /1\. \[card\] 'Buy eggs'/);
  assert.match(prompt, /2\. \[knowledge\] 'Egg storage tips'/);
  assert.match(prompt, /confidence >= 40/);
});

test('parseDedupeResponse extracts matches with confidence', () => {
  const raw = JSON.stringify({
    matches: [
      { ix: 1, confidence: 85, why: 'same item' },
      { ix: 2, confidence: 50, why: 'related' },
    ],
  });
  const ranked = parseDedupeResponse(raw, sampleCandidates);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0]!.confidence, 85);
  assert.equal(ranked[0]!.id, 'c1');
  assert.equal(ranked[0]!.why, 'same item');
});

test('parseDedupeResponse caps at 3 and filters confidence < 40', () => {
  const raw = JSON.stringify({
    matches: [
      { ix: 1, confidence: 85, why: 'a' },
      { ix: 2, confidence: 30, why: 'b' },
      { ix: 1, confidence: 70, why: 'c' },
      { ix: 1, confidence: 60, why: 'd' },
      { ix: 1, confidence: 55, why: 'e' },
    ],
  });
  const ranked = parseDedupeResponse(raw, sampleCandidates);
  assert.equal(ranked.length, 1, 'caps at 3 AND dedupes by id — ix=1 only appears once');
  assert.ok(!ranked.some((r) => r.confidence !== undefined && r.confidence < 40), 'filter below 40');
});

test('parseDedupeResponse on invalid JSON returns FTS fallback (raw candidates, no confidence)', () => {
  const ranked = parseDedupeResponse('not json{', sampleCandidates);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0]!.id, 'c1');
  assert.equal(ranked[0]!.confidence, undefined);
  assert.equal(ranked[0]!.why, undefined);
});

test('rankCandidates with empty input short-circuits to []', async () => {
  const ranked = await rankCandidates('anything', []);
  assert.deepEqual(ranked, []);
});
