import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import { writeAudit } from '../admin_audit.js';

let actorId = '';
let targetId = '';

before(async () => {
  const a = await pool.query<{ id: string }>(
    `INSERT INTO users (name, short_name, email, auth_hash)
     VALUES ('Actor', 'A', $1, '$argon2id$x') RETURNING id`,
    [`audit_actor_${Math.random()}@test.local`],
  );
  actorId = a.rows[0]!.id;
  const b = await pool.query<{ id: string }>(
    `INSERT INTO users (name, short_name, email, auth_hash)
     VALUES ('Target', 'T', $1, '$argon2id$x') RETURNING id`,
    [`audit_target_${Math.random()}@test.local`],
  );
  targetId = b.rows[0]!.id;
});

after(async () => {
  await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [actorId, targetId]);
});

test('writeAudit inserts a row with the expected fields', async () => {
  await writeAudit(pool, {
    actor_id: actorId,
    action: 'promote',
    target_user_id: targetId,
    metadata: { reason: 'unit test' },
  });
  const { rows } = await pool.query(
    `SELECT actor_id, action, target_user_id, metadata
     FROM admin_audit WHERE actor_id = $1 ORDER BY created_at DESC LIMIT 1`, [actorId],
  );
  assert.equal(rows[0]!.action, 'promote');
  assert.equal(rows[0]!.target_user_id, targetId);
  assert.deepEqual(rows[0]!.metadata, { reason: 'unit test' });
});
