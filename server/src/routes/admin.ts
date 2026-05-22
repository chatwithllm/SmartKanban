import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { requireAdmin, hashPassword } from '../auth.js';
import { writeAudit } from '../admin_audit.js';

export async function adminRoutes(app: FastifyInstance) {
  app.get('/api/admin/users', { preHandler: requireAdmin }, async () => {
    const { rows } = await pool.query<{
      id: string;
      name: string;
      short_name: string;
      email: string;
      is_admin: boolean;
      last_login_at: string | null;
      session_count: number;
      created_at: string;
      identities: Array<{ provider: string; email: string }>;
    }>(`
      SELECT u.id, u.name,
             COALESCE(u.short_name, u.name) AS short_name,
             u.email, u.is_admin, u.created_at,
             (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_login_at,
             (SELECT COUNT(*)::int FROM sessions s
                WHERE s.user_id = u.id AND s.expires_at > NOW()) AS session_count,
             COALESCE(
               (SELECT json_agg(json_build_object('provider', i.provider, 'email', i.email))
                FROM user_identities i WHERE i.user_id = u.id),
               '[]'::json
             ) AS identities
      FROM users u
      ORDER BY u.created_at ASC
    `);
    return rows;
  });

  app.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/promote',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { id } = req.params;
      const exists = await pool.query<{ is_admin: boolean }>(
        `SELECT is_admin FROM users WHERE id = $1`, [id],
      );
      if (exists.rowCount === 0) return reply.code(404).send({ error: 'not_found' });
      if (exists.rows[0]!.is_admin) return reply.code(409).send({ error: 'already_admin' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`UPDATE users SET is_admin = TRUE WHERE id = $1`, [id]);
        await writeAudit(client, {
          actor_id: req.user!.id,
          action: 'promote',
          target_user_id: id,
        });
        await client.query('COMMIT');
        return { ok: true };
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/demote',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { id } = req.params;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const target = await client.query<{ is_admin: boolean }>(
          `SELECT is_admin FROM users WHERE id = $1 FOR UPDATE`, [id],
        );
        if (target.rowCount === 0) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'not_found' });
        }
        if (!target.rows[0]!.is_admin) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'already_not_admin' });
        }
        // Row-lock every OTHER admin. If zero rows are returned, demote would leave nobody.
        const others = await client.query(
          `SELECT id FROM users WHERE is_admin = TRUE AND id <> $1 FOR UPDATE`, [id],
        );
        if (others.rowCount === 0) {
          await client.query('ROLLBACK');
          const errorCode = id === req.user!.id ? 'cannot_demote_self_last_admin' : 'last_admin';
          return reply.code(409).send({ error: errorCode });
        }
        await client.query(`UPDATE users SET is_admin = FALSE WHERE id = $1`, [id]);
        await writeAudit(client, {
          actor_id: req.user!.id,
          action: 'demote',
          target_user_id: id,
        });
        await client.query('COMMIT');
        return { ok: true };
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
  );

  app.post<{ Params: { id: string }; Body: { new_password: string } }>(
    '/api/admin/users/:id/reset-password',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { id } = req.params;
      const { new_password } = req.body ?? ({} as { new_password: string });
      if (!new_password || new_password.length < 6) {
        return reply.code(400).send({ error: 'password_too_short' });
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const exists = await client.query(`SELECT 1 FROM users WHERE id = $1`, [id]);
        if (exists.rowCount === 0) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'not_found' });
        }
        const hash = await hashPassword(new_password);
        await client.query(
          `UPDATE users SET auth_hash = $1, must_change_password = TRUE WHERE id = $2`,
          [hash, id],
        );
        await client.query(`DELETE FROM sessions WHERE user_id = $1`, [id]);
        await writeAudit(client, {
          actor_id: req.user!.id,
          action: 'reset_password',
          target_user_id: id,
        });
        await client.query('COMMIT');
        return { ok: true };
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
  );

  app.get<{ Querystring: { limit?: string; before?: string } }>(
    '/api/admin/audit',
    { preHandler: requireAdmin },
    async (req) => {
      const rawLimit = Number(req.query.limit ?? '100');
      const limit = Math.max(1, Math.min(200, Number.isFinite(rawLimit) ? rawLimit : 100));
      const before = req.query.before;
      const params: unknown[] = [limit];
      let where = '';
      if (before) {
        params.push(before);
        where = `WHERE a.created_at < $2`;
      }
      const { rows } = await pool.query(
        `SELECT a.id, a.action, a.metadata, a.created_at,
                a.actor_id, ua.name AS actor_name,
                a.target_user_id, ut.name AS target_user_name,
                a.target_pending_id
         FROM admin_audit a
         LEFT JOIN users ua ON ua.id = a.actor_id
         LEFT JOIN users ut ON ut.id = a.target_user_id
         ${where}
         ORDER BY a.created_at DESC
         LIMIT $1`,
        params,
      );
      const next_before = rows.length === limit ? rows[rows.length - 1].created_at : undefined;
      return { items: rows, next_before };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/revoke-sessions',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { id } = req.params;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const exists = await client.query(`SELECT 1 FROM users WHERE id = $1`, [id]);
        if (exists.rowCount === 0) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'not_found' });
        }
        const del = await client.query(`DELETE FROM sessions WHERE user_id = $1`, [id]);
        await writeAudit(client, {
          actor_id: req.user!.id,
          action: 'revoke_sessions',
          target_user_id: id,
          metadata: { count: del.rowCount ?? 0 },
        });
        await client.query('COMMIT');
        return { ok: true, count: del.rowCount ?? 0 };
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
  );
}
