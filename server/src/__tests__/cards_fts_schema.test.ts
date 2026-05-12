import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';

test('cards.fts is a STORED generated tsvector column', async () => {
  const { rows } = await pool.query<{ data_type: string; generation_expression: string | null; is_generated: string }>(
    `SELECT data_type, generation_expression, is_generated
     FROM information_schema.columns
     WHERE table_name = 'cards' AND column_name = 'fts'`,
  );
  assert.equal(rows.length, 1, 'cards.fts column must exist');
  assert.equal(rows[0]!.data_type, 'tsvector');
  assert.match(rows[0]!.is_generated, /^ALWAYS$/);
  assert.match(rows[0]!.generation_expression ?? '', /to_tsvector/i);
});

test('cards_fts_idx exists and is a GIN index on cards.fts', async () => {
  const { rows } = await pool.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes WHERE indexname = 'cards_fts_idx'`,
  );
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.indexdef, /USING gin \(fts\)/);
});
