import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import {
  createKnowledge, linkCard, unlinkCard, listKnowledgeForCard,
} from '../knowledge.js';

async function makeUser(name: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (name, short_name, email, auth_hash) VALUES ($1, $1, $2, 'x') RETURNING id`,
    [name, `${name}-${Date.now()}@t.dev`],
  );
  return r.rows[0]!.id;
}

async function makeCard(creatorId: string, assigneeId: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, created_by) VALUES ('c', 'today', $1) RETURNING id`,
    [creatorId],
  );
  const id = r.rows[0]!.id;
  // Default-assign so canUserSeeCard works the way the test expects (creator sees it via assignee row).
  await pool.query(
    `INSERT INTO card_assignees (card_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [id, assigneeId],
  );
  return id;
}

test('link + unlink card', async () => {
  const u = await makeUser('lk_a');
  const c = await makeCard(u, u);
  const k = await createKnowledge(u, { title: 't', url: 'https://x.example.com', visibility: 'private' });

  await linkCard(u, k.id, c);
  let linked = await listKnowledgeForCard(u, c);
  assert.equal(linked.length, 1);
  assert.equal(linked[0]!.id, k.id);

  await unlinkCard(u, k.id, c);
  linked = await listKnowledgeForCard(u, c);
  assert.equal(linked.length, 0);
});

test('listKnowledgeForCard filters by knowledge visibility', async () => {
  const a = await makeUser('lk_b');
  const b = await makeUser('lk_c');
  // Card is in the Family Inbox (no assignees) so both users can see it.
  const r = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, created_by) VALUES ('inbox-card', 'today', $1) RETURNING id`,
    [a],
  );
  const c = r.rows[0]!.id;
  const priv = await createKnowledge(a, { title: 'p', url: 'https://x.example.com', visibility: 'private' });
  const inbx = await createKnowledge(a, { title: 'i', url: 'https://y.example.com', visibility: 'inbox' });
  await linkCard(a, priv.id, c);
  await linkCard(a, inbx.id, c);

  const linked = await listKnowledgeForCard(b, c);
  const ids = new Set(linked.map(k => k.id));
  assert.ok(!ids.has(priv.id), 'b must not see private knowledge');
  assert.ok(ids.has(inbx.id), 'b must see inbox knowledge');
});

test('linkCard rejects when caller cannot see card', async () => {
  const a = await makeUser('lk_d');
  const b = await makeUser('lk_e');
  const cardId = await makeCard(a, a); // card belongs to a only
  const k = await createKnowledge(b, { title: 'm', url: 'https://z.example.com', visibility: 'inbox' });
  // b can see knowledge (inbox) but cannot see a's private card.
  await assert.rejects(() => linkCard(b, k.id, cardId), /forbidden/);
});
