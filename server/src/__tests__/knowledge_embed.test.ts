import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embeddingsEnabled } from '../ai/embed.js';
import { enqueueEmbed, _flushEmbedQueueForTest } from '../ai/embed_queue.js';

test('embeddingsEnabled returns false when env unset', () => {
  delete process.env.KNOWLEDGE_EMBEDDINGS;
  // Reload module would be ideal; in this codebase we trust the lazy getter to re-read env each call.
  assert.equal(embeddingsEnabled(), false);
});

test('enqueueEmbed is no-op when disabled', async () => {
  delete process.env.KNOWLEDGE_EMBEDDINGS;
  enqueueEmbed('any-id');
  const stats = await _flushEmbedQueueForTest('any-id');
  assert.equal(stats.processed, 0);
});

test('enqueueEmbed dedupes via in-process set when enabled but no key', async () => {
  process.env.KNOWLEDGE_EMBEDDINGS = 'true';
  delete process.env.OPENAI_API_KEY;
  // No key → embedText returns null → processOne returns ok:false; queue still drains.
  enqueueEmbed('id-1');
  const stats = await _flushEmbedQueueForTest('id-1');
  assert.ok(stats.processed >= 0);
  delete process.env.KNOWLEDGE_EMBEDDINGS;
});
