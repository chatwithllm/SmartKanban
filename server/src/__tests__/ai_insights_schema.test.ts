import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';

test('ai_insights table exists with required columns', async () => {
  const { rows } = await pool.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'ai_insights'
     ORDER BY ordinal_position`,
  );
  const names = rows.map((r) => r.column_name);
  for (const expected of [
    'id', 'card_id', 'requested_by', 'status',
    'summary', 'body', 'error', 'degraded',
    'created_at', 'completed_at',
  ]) {
    assert.ok(names.includes(expected), `missing column: ${expected}`);
  }
  const status = rows.find((r) => r.column_name === 'status');
  assert.equal(status?.data_type, 'text');
  const body = rows.find((r) => r.column_name === 'body');
  assert.equal(body?.data_type, 'jsonb');
});

test('ai_insights_card_idx exists', async () => {
  const { rows } = await pool.query(
    `SELECT indexdef FROM pg_indexes WHERE indexname = 'ai_insights_card_idx'`,
  );
  assert.equal(rows.length, 1);
});

test('ai_insights ON DELETE CASCADE from cards', async () => {
  const owner = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('AI', 'ai-fk@test-' || gen_random_uuid(), 'x') RETURNING id`,
  );
  const userId = owner.rows[0]!.id;
  const card = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('fk test', 'today', 'manual', $1, 1) RETURNING id`,
    [userId],
  );
  const cardId = card.rows[0]!.id;
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO ai_insights (card_id, requested_by, status)
     VALUES ($1, $2, 'pending') RETURNING id`,
    [cardId, userId],
  );
  const insId = ins.rows[0]!.id;
  try {
    await pool.query(`DELETE FROM cards WHERE id = $1`, [cardId]);
    const r = await pool.query(`SELECT 1 FROM ai_insights WHERE id = $1`, [insId]);
    assert.equal(r.rows.length, 0, 'insight should be cascade-deleted');
  } finally {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  }
});
