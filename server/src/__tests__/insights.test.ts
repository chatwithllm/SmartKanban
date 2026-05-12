import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import {
  createInsight,
  getInsight,
  listInsightsForCard,
  countPendingByUser,
  countPendingByCard,
  countTodayByUser,
  markOk,
  markFailed,
  recoverPendingInsights,
} from '../insights.js';

let userId: string;
let cardId: string;

before(async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, auth_hash) VALUES ('Ins', 'ins@test', 'x') RETURNING id`,
  );
  userId = u.rows[0]!.id;
  const c = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, status, source, created_by, position)
     VALUES ('test card', 'today', 'manual', $1, 1) RETURNING id`,
    [userId],
  );
  cardId = c.rows[0]!.id;
});

after(async () => {
  await pool.query(`DELETE FROM ai_insights WHERE requested_by = $1`, [userId]);
  await pool.query(`DELETE FROM cards WHERE id = $1`, [cardId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
});

test('createInsight returns row with status=pending', async () => {
  const i = await createInsight(cardId, userId);
  assert.equal(i.card_id, cardId);
  assert.equal(i.status, 'pending');
  assert.equal(i.degraded, false);
});

test('getInsight by id returns the row', async () => {
  const created = await createInsight(cardId, userId);
  const fetched = await getInsight(created.id);
  assert.equal(fetched?.id, created.id);
});

test('listInsightsForCard returns latest first', async () => {
  await createInsight(cardId, userId);
  await new Promise((r) => setTimeout(r, 10));
  await createInsight(cardId, userId);
  const rows = await listInsightsForCard(cardId, 10);
  assert.ok(rows.length >= 2);
  assert.ok(new Date(rows[0]!.created_at).getTime() >= new Date(rows[1]!.created_at).getTime());
});

test('countPendingByUser counts only pending', async () => {
  const i = await createInsight(cardId, userId);
  const before = await countPendingByUser(userId);
  assert.ok(before >= 1);
  await markOk(i.id, 'summary', { related_items: [], web_findings: [], next_steps: [] }, false);
  const after = await countPendingByUser(userId);
  assert.equal(after, before - 1);
});

test('countPendingByCard counts only pending', async () => {
  const i = await createInsight(cardId, userId);
  const c = await countPendingByCard(cardId);
  assert.ok(c >= 1);
  await markFailed(i.id, 'boom');
  const c2 = await countPendingByCard(cardId);
  assert.equal(c2, c - 1);
});

test('countTodayByUser counts insights created today', async () => {
  await createInsight(cardId, userId);
  const c = await countTodayByUser(userId);
  assert.ok(c >= 1);
});

test('markOk sets summary, body, completed_at; clears error', async () => {
  const i = await createInsight(cardId, userId);
  await markOk(i.id, 'a summary', { next_steps: ['x'] }, true);
  const r = await getInsight(i.id);
  assert.equal(r?.status, 'ok');
  assert.equal(r?.summary, 'a summary');
  assert.deepEqual(r?.body, { next_steps: ['x'] });
  assert.equal(r?.degraded, true);
  assert.ok(r?.completed_at);
});

test('markFailed sets error and status', async () => {
  const i = await createInsight(cardId, userId);
  await markFailed(i.id, 'bad things');
  const r = await getInsight(i.id);
  assert.equal(r?.status, 'failed');
  assert.equal(r?.error, 'bad things');
});

test('recoverPendingInsights returns recent pending ids and abandons old', async () => {
  const recent = await createInsight(cardId, userId);
  const old = await createInsight(cardId, userId);
  await pool.query(
    `UPDATE ai_insights SET created_at = now() - interval '2 hours' WHERE id = $1`,
    [old.id],
  );
  const ids = await recoverPendingInsights();
  assert.ok(ids.includes(recent.id));
  assert.ok(!ids.includes(old.id));
  const stale = await getInsight(old.id);
  assert.equal(stale?.status, 'failed');
});
