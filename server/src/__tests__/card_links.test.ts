import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import {
  createLink,
  deleteLink,
  listLinksForCard,
  type CardLinkLabel,
} from '../card_links.js';

let uid: string;
let aId: string;
let bId: string;

before(async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('CLT', 'clt@test', 'x') RETURNING id`,
  );
  uid = u.rows[0]!.id;
  const a = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('a-card', 'today', 'manual', $1, 1) RETURNING id`, [uid]);
  const b = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('b-card', 'today', 'manual', $1, 2) RETURNING id`, [uid]);
  aId = a.rows[0]!.id;
  bId = b.rows[0]!.id;
});

after(async () => {
  await pool.query(`DELETE FROM card_links WHERE from_card_id IN ($1, $2) OR to_card_id IN ($1, $2)`, [aId, bId]);
  await pool.query(`DELETE FROM cards WHERE id IN ($1, $2)`, [aId, bId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [uid]);
});

test('createLink inserts row + returns it', async () => {
  const link = await createLink(uid, aId, bId, 'evolves_from', 'note text');
  assert.equal(link.from_card_id, aId);
  assert.equal(link.to_card_id, bId);
  assert.equal(link.label, 'evolves_from');
  assert.equal(link.note, 'note text');
  await deleteLink(uid, link.id);
});

test('createLink rejects self-link', async () => {
  await assert.rejects(
    () => createLink(uid, aId, aId, 'related', null),
    /self/,
  );
});

test('createLink rejects invalid label', async () => {
  await assert.rejects(
    () => createLink(uid, aId, bId, 'bogus' as CardLinkLabel, null),
    /invalid label/i,
  );
});

test('createLink throws on exact duplicate (UNIQUE constraint)', async () => {
  const l = await createLink(uid, aId, bId, 'related', null);
  try {
    await assert.rejects(() => createLink(uid, aId, bId, 'related', null));
  } finally {
    await deleteLink(uid, l.id);
  }
});

test('listLinksForCard returns outgoing + incoming for a card', async () => {
  const out = await createLink(uid, aId, bId, 'evolves_from', null);
  const inc = await createLink(uid, bId, aId, 'related', null);
  try {
    const fromA = await listLinksForCard(uid, aId);
    const fromB = await listLinksForCard(uid, bId);
    assert.equal(fromA.length, 2);
    assert.equal(fromB.length, 2);
    assert.ok(fromA.some((l) => l.id === out.id));
    assert.ok(fromA.some((l) => l.id === inc.id));
  } finally {
    await deleteLink(uid, out.id);
    await deleteLink(uid, inc.id);
  }
});

test('deleteLink removes the row + returns true', async () => {
  const l = await createLink(uid, aId, bId, 'inspired_by', null);
  const ok = await deleteLink(uid, l.id);
  assert.equal(ok, true);
  const { rows } = await pool.query(`SELECT 1 FROM card_links WHERE id = $1`, [l.id]);
  assert.equal(rows.length, 0);
});

test('deleteLink returns false for unknown id', async () => {
  const ok = await deleteLink(uid, '00000000-0000-0000-0000-000000000000');
  assert.equal(ok, false);
});
