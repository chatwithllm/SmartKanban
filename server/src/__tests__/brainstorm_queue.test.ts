import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enqueueBrainstorm,
  _setRunnerForTest,
  _resetForTest,
  _drainOnceForTest,
} from '../ai/brainstorm_queue.js';

test('enqueue + drain calls runner with insight id', async () => {
  _resetForTest();
  const seen: string[] = [];
  _setRunnerForTest(async (id) => { seen.push(id); });
  enqueueBrainstorm('id-1');
  enqueueBrainstorm('id-2');
  await _drainOnceForTest();
  assert.deepEqual(seen, ['id-1', 'id-2']);
});

test('runner failure does not stop subsequent jobs', async () => {
  _resetForTest();
  const seen: string[] = [];
  _setRunnerForTest(async (id) => {
    seen.push(id);
    if (id === 'bad') throw new Error('boom');
  });
  enqueueBrainstorm('a');
  enqueueBrainstorm('bad');
  enqueueBrainstorm('c');
  await _drainOnceForTest();
  assert.deepEqual(seen, ['a', 'bad', 'c']);
});
