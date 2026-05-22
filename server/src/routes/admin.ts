import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { requireAdmin } from '../auth.js';
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
}
