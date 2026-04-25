import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import {
  createTemplate,
  listTemplates,
  loadTemplate,
  updateTemplate,
  deleteTemplate,
  instantiateTemplate,
} from '../templates.js';

let userA = '';
let userB = '';

async function freshUser(name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash, short_name)
     VALUES ($1, $1 || '@test.local', 'x', $1) RETURNING id`,
    [name + '_' + Math.random().toString(36).slice(2, 8)],
  );
  return rows[0]!.id;
}

before(async () => {
  userA = await freshUser('alice');
  userB = await freshUser('bob');
});

after(async () => {
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userA, userB]]);
  await pool.end();
});

beforeEach(async () => {
  await pool.query(`DELETE FROM card_templates WHERE owner_id = ANY($1::uuid[])`, [[userA, userB]]);
});

test('listTemplates: private templates only visible to owner', async () => {
  await createTemplate(userA, {
    name: 'priv',
    visibility: 'private',
    title: 'private title',
  });
  const aList = await listTemplates(userA);
  const bList = await listTemplates(userB);
  assert.equal(aList.length, 1);
  assert.equal(bList.length, 0);
});

test('listTemplates: shared templates visible to all', async () => {
  await createTemplate(userA, {
    name: 'shared',
    visibility: 'shared',
    title: 'shared title',
  });
  const bList = await listTemplates(userB);
  assert.equal(bList.length, 1);
  assert.equal(bList[0]!.title, 'shared title');
});
