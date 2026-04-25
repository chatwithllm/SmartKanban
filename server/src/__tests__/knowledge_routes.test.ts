import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import {
  createKnowledge, listKnowledge, loadKnowledge,
  canUserSeeKnowledge, KnowledgeValidationError,
} from '../knowledge.js';

async function makeUser(name: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (name, short_name, email, auth_hash) VALUES ($1, $1, $2, 'x') RETURNING id`,
    [name, `${name}-${Date.now()}@t.dev`],
  );
  return r.rows[0]!.id;
}

test('createKnowledge persists and defaults', async () => {
  const u = await makeUser('alice');
  const k = await createKnowledge(u, {
    title: 'Hello', url: 'https://example.com', visibility: 'private',
  });
  assert.equal(k.owner_id, u);
  assert.equal(k.title, 'Hello');
  assert.equal(k.body, '');
  assert.equal(k.archived, false);
  assert.equal(k.title_auto, false);
});

test('createKnowledge rejects empty title', async () => {
  const u = await makeUser('bob');
  await assert.rejects(
    () => createKnowledge(u, { title: '', url: 'https://x.com', visibility: 'private' }),
    KnowledgeValidationError,
  );
});

test('createKnowledge rejects when both url and body empty', async () => {
  const u = await makeUser('carol');
  await assert.rejects(
    () => createKnowledge(u, { title: 't', visibility: 'private' }),
    KnowledgeValidationError,
  );
});

test('listKnowledge applies visibility predicate', async () => {
  const a = await makeUser('a');
  const b = await makeUser('b');
  const priv  = await createKnowledge(a, { title: 'priv',   url: 'https://1', visibility: 'private' });
  const inbx  = await createKnowledge(a, { title: 'inbox',  url: 'https://2', visibility: 'inbox' });
  const shrd  = await createKnowledge(a, { title: 'shared', url: 'https://3', visibility: 'shared', shares: [b] });

  const visibleToB = await listKnowledge(b, { scope: 'all' });
  const ids = new Set(visibleToB.map(k => k.id));
  assert.ok(!ids.has(priv.id), 'b must not see private');
  assert.ok(ids.has(inbx.id),   'b must see inbox');
  assert.ok(ids.has(shrd.id),   'b must see shared');
});

test('canUserSeeKnowledge reflects predicate', async () => {
  const a = await makeUser('aa');
  const b = await makeUser('bb');
  const k = await createKnowledge(a, { title: 't', url: 'https://x', visibility: 'private' });
  assert.equal(await canUserSeeKnowledge(a, k), true);
  assert.equal(await canUserSeeKnowledge(b, k), false);
});
