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
  findTemplateByName,
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

test('createTemplate: duplicate name (case-insensitive) per owner rejects', async () => {
  await createTemplate(userA, { name: 'Grocery', visibility: 'private', title: 't' });
  // PG unique-violation surfaces as code 23505. Match on raw message to confirm
  // the constraint we expect (`card_templates_owner_name_key`) is the one that fires.
  await assert.rejects(
    createTemplate(userA, { name: 'grocery', visibility: 'private', title: 't' }),
    (err: unknown) => {
      const e = err as { code?: string; message?: string };
      return e.code === '23505' && /card_templates_owner_name_key/.test(e.message ?? '');
    },
  );
});

test('createTemplate: same name allowed across owners', async () => {
  await createTemplate(userA, { name: 'shared', visibility: 'private', title: 'A' });
  await createTemplate(userB, { name: 'shared', visibility: 'private', title: 'B' });
  const aList = await listTemplates(userA);
  const bList = await listTemplates(userB);
  assert.equal(aList.length, 1);
  assert.equal(aList[0]!.title, 'A');
  assert.equal(bList.length, 1);
  assert.equal(bList[0]!.title, 'B');
});

test('findTemplateByName: private wins over shared on same name for owner', async () => {
  // userA has private "grocery", userB has shared "grocery"
  await createTemplate(userA, { name: 'grocery', visibility: 'private', title: 'A private' });
  await createTemplate(userB, { name: 'grocery', visibility: 'shared', title: 'B shared' });
  const t = await findTemplateByName(userA, 'GROCERY');
  assert.ok(t);
  assert.equal(t!.title, 'A private');
});

test('findTemplateByName: shared visible to non-owner', async () => {
  await createTemplate(userB, { name: 'grocery', visibility: 'shared', title: 'B shared' });
  const t = await findTemplateByName(userA, 'grocery');
  assert.ok(t);
  assert.equal(t!.title, 'B shared');
});

test('findTemplateByName: not found returns null', async () => {
  const t = await findTemplateByName(userA, 'missing');
  assert.equal(t, null);
});

test('updateTemplate: non-owner is rejected', async () => {
  const t = await createTemplate(userA, { name: 't', visibility: 'private', title: 'a' });
  await assert.rejects(
    updateTemplate(userB, t.id, { title: 'hacked' }),
    /forbidden/,
  );
});

test('updateTemplate: owner can update', async () => {
  const t = await createTemplate(userA, { name: 'u', visibility: 'private', title: 'a' });
  const updated = await updateTemplate(userA, t.id, { title: 'b' });
  assert.ok(updated);
  assert.equal(updated!.title, 'b');
});

test('deleteTemplate: non-owner cannot delete', async () => {
  const t = await createTemplate(userA, { name: 't', visibility: 'private', title: 'a' });
  const ok = await deleteTemplate(userB, t.id);
  assert.equal(ok, false);
  const still = await loadTemplate(t.id);
  assert.ok(still);
});

test('deleteTemplate: owner deletes successfully', async () => {
  const t = await createTemplate(userA, { name: 'd', visibility: 'private', title: 'a' });
  const ok = await deleteTemplate(userA, t.id);
  assert.equal(ok, true);
  const gone = await loadTemplate(t.id);
  assert.equal(gone, null);
});

test('createTemplate: validation rejects empty title', async () => {
  await assert.rejects(
    createTemplate(userA, { name: 'x', visibility: 'private', title: '   ' }),
    /title/,
  );
});

test('createTemplate: validation rejects whitespace-only name', async () => {
  await assert.rejects(
    createTemplate(userA, { name: '   ', visibility: 'private', title: 't' }),
    /name/,
  );
});

test('createTemplate: tags lowercased and deduped', async () => {
  const t = await createTemplate(userA, {
    name: 'tagged',
    visibility: 'private',
    title: 't',
    tags: ['Home', 'home', 'DIY'],
  });
  assert.deepEqual(t.tags.sort(), ['diy', 'home']);
});

test('instantiateTemplate: creates card with template fields, creator-as-assignee', async () => {
  const t = await createTemplate(userA, {
    name: 'g',
    visibility: 'private',
    title: 'Buy eggs',
    description: 'dozen',
    tags: ['groceries'],
    status: 'today',
  });
  const card = await instantiateTemplate(userA, t.id, { source: 'manual' });
  assert.ok(card);
  assert.equal(card!.title, 'Buy eggs');
  assert.equal(card!.description, 'dozen');
  assert.equal(card!.status, 'today');
  assert.deepEqual(card!.tags, ['groceries']);
  assert.equal(card!.created_by, userA);
  assert.deepEqual(card!.assignees, [userA]);
  assert.equal(card!.due_date, null);
});

test('instantiateTemplate: due_offset_days computes due_date = today + N', async () => {
  const t = await createTemplate(userA, {
    name: 'd',
    visibility: 'private',
    title: 'x',
    due_offset_days: 3,
  });
  const card = await instantiateTemplate(userA, t.id, { source: 'manual' });
  const todayUtc = new Date();
  todayUtc.setUTCDate(todayUtc.getUTCDate() + 3);
  const expected = todayUtc.toISOString().slice(0, 10);
  assert.equal(String(card!.due_date).slice(0, 10), expected);
});

test('instantiateTemplate: status_override wins over template status', async () => {
  const t = await createTemplate(userA, {
    name: 'col',
    visibility: 'private',
    title: 'x',
    status: 'today',
  });
  const card = await instantiateTemplate(userA, t.id, {
    source: 'manual',
    statusOverride: 'in_progress',
  });
  assert.equal(card!.status, 'in_progress');
});

test('instantiateTemplate: not visible returns null', async () => {
  const t = await createTemplate(userA, { name: 'p', visibility: 'private', title: 'x' });
  const card = await instantiateTemplate(userB, t.id, { source: 'manual' });
  assert.equal(card, null);
});

test('instantiateTemplate: source=telegram tagged correctly', async () => {
  const t = await createTemplate(userA, { name: 's', visibility: 'private', title: 'x' });
  const card = await instantiateTemplate(userA, t.id, { source: 'telegram' });
  assert.equal(card!.source, 'telegram');
});
