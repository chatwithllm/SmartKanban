import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import { searchKnowledgeFts } from '../knowledge.js';

let owner: string;
let kId: string;

before(async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('K', 'k@test', 'x') RETURNING id`,
  );
  owner = u.rows[0]!.id;
  const k = await pool.query<{ id: string }>(
    `INSERT INTO knowledge_items (owner_id, title, body, visibility, source, fetch_status)
     VALUES ($1, 'Egg storage tips', 'best at 40F', 'private', 'manual', 'ok') RETURNING id`,
    [owner],
  );
  kId = k.rows[0]!.id;
});

after(async () => {
  await pool.query(`DELETE FROM knowledge_items WHERE id = $1`, [kId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [owner]);
});

test('searchKnowledgeFts returns own private item matching query', async () => {
  const hits = await searchKnowledgeFts(owner, 'egg', 10);
  assert.ok(hits.some((h) => h.id === kId));
});

test('searchKnowledgeFts returns [] for empty query', async () => {
  const hits = await searchKnowledgeFts(owner, '', 10);
  assert.deepEqual(hits, []);
});
