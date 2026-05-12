import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import { searchCardsFts } from '../cards.js';

let userA: string;
let userB: string;
let cardOfA: string;

before(async () => {
  const a = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('A', 'a@test', 'x') RETURNING id`,
  );
  const b = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('B', 'b@test', 'x') RETURNING id`,
  );
  userA = a.rows[0]!.id;
  userB = b.rows[0]!.id;

  const c = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, description, status, source, created_by, position)
     VALUES ('Buy eggs from farm', 'pasture-raised dozen', 'today', 'manual', $1, 1) RETURNING id`,
    [userA],
  );
  cardOfA = c.rows[0]!.id;
  await pool.query(
    `INSERT INTO card_assignees (card_id, user_id) VALUES ($1, $2)`,
    [cardOfA, userA],
  );
});

after(async () => {
  await pool.query(`DELETE FROM cards WHERE id = $1`, [cardOfA]);
  await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [userA, userB]);
});

test('searchCardsFts returns user A own card when searching matching term', async () => {
  const hits = await searchCardsFts(userA, 'eggs', 10);
  assert.ok(hits.some((h) => h.id === cardOfA), 'user A should see their own card');
});

test('searchCardsFts hides user A private card from user B', async () => {
  const hits = await searchCardsFts(userB, 'eggs', 10);
  assert.ok(!hits.some((h) => h.id === cardOfA), 'user B must not see user A private card');
});

test('searchCardsFts returns [] for empty query', async () => {
  const hits = await searchCardsFts(userA, '   ', 10);
  assert.deepEqual(hits, []);
});

test('searchCardsFts respects limit', async () => {
  const hits = await searchCardsFts(userA, 'eggs', 1);
  assert.ok(hits.length <= 1);
});
