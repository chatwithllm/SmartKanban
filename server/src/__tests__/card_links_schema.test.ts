import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';

test('card_links table exists with required columns', async () => {
  const { rows } = await pool.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'card_links'
     ORDER BY ordinal_position`,
  );
  const names = rows.map((r) => r.column_name);
  for (const c of ['id', 'from_card_id', 'to_card_id', 'label', 'note', 'created_by', 'created_at']) {
    assert.ok(names.includes(c), `missing column: ${c}`);
  }
});

test('card_links_from_idx and card_links_to_idx exist', async () => {
  const { rows } = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'card_links'`,
  );
  const names = rows.map((r: { indexname: string }) => r.indexname);
  assert.ok(names.includes('card_links_from_idx'));
  assert.ok(names.includes('card_links_to_idx'));
});

test('UNIQUE (from_card_id, to_card_id, label) prevents duplicates', async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('CL', 'cl@test', 'x') RETURNING id`,
  );
  const uid = u.rows[0]!.id;
  const a = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('a','today','manual',$1,1) RETURNING id`, [uid]);
  const b = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('b','today','manual',$1,2) RETURNING id`, [uid]);
  const aid = a.rows[0]!.id;
  const bid = b.rows[0]!.id;
  try {
    await pool.query(
      `INSERT INTO card_links (from_card_id, to_card_id, label, created_by)
       VALUES ($1, $2, 'related', $3)`,
      [aid, bid, uid],
    );
    let threw = false;
    try {
      await pool.query(
        `INSERT INTO card_links (from_card_id, to_card_id, label, created_by)
         VALUES ($1, $2, 'related', $3)`,
        [aid, bid, uid],
      );
    } catch {
      threw = true;
    }
    assert.equal(threw, true, 'duplicate insert must throw');
  } finally {
    await pool.query(`DELETE FROM card_links WHERE from_card_id = $1 OR to_card_id = $1`, [aid]);
    await pool.query(`DELETE FROM cards WHERE id IN ($1, $2)`, [aid, bid]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [uid]);
  }
});

test('ON DELETE CASCADE removes links when card is deleted', async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('CL2', 'cl2@test', 'x') RETURNING id`,
  );
  const uid = u.rows[0]!.id;
  const a = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('a','today','manual',$1,1) RETURNING id`, [uid]);
  const b = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('b','today','manual',$1,2) RETURNING id`, [uid]);
  const aid = a.rows[0]!.id;
  const bid = b.rows[0]!.id;
  const link = await pool.query<{ id: string }>(
    `INSERT INTO card_links (from_card_id, to_card_id, label, created_by)
     VALUES ($1, $2, 'related', $3) RETURNING id`, [aid, bid, uid]);
  const linkId = link.rows[0]!.id;
  try {
    await pool.query(`DELETE FROM cards WHERE id = $1`, [aid]);
    const r = await pool.query(`SELECT 1 FROM card_links WHERE id = $1`, [linkId]);
    assert.equal(r.rows.length, 0, 'link should cascade-delete');
  } finally {
    await pool.query(`DELETE FROM cards WHERE id = $1`, [bid]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [uid]);
  }
});

test('label CHECK constraint rejects invalid values', async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('CL3', 'cl3@test', 'x') RETURNING id`,
  );
  const uid = u.rows[0]!.id;
  const a = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('a','today','manual',$1,1) RETURNING id`, [uid]);
  const b = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('b','today','manual',$1,2) RETURNING id`, [uid]);
  try {
    let threw = false;
    try {
      await pool.query(
        `INSERT INTO card_links (from_card_id, to_card_id, label, created_by)
         VALUES ($1, $2, 'invalid_label', $3)`,
        [a.rows[0]!.id, b.rows[0]!.id, uid],
      );
    } catch { threw = true; }
    assert.equal(threw, true, 'CHECK constraint must reject invalid label');
  } finally {
    await pool.query(`DELETE FROM cards WHERE id IN ($1, $2)`, [a.rows[0]!.id, b.rows[0]!.id]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [uid]);
  }
});
