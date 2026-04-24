import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { newToken, requireUser } from '../auth.js';

export async function mirrorRoutes(app: FastifyInstance) {
  // Issue a long-lived mirror token for the logged-in user.
  app.post<{ Body?: { label?: string } }>(
    '/api/mirror/tokens',
    { preHandler: requireUser },
    async (req, reply) => {
      const token = newToken();
      const label = req.body?.label?.trim() || 'mirror';
      await pool.query(
        `INSERT INTO mirror_tokens (token, user_id, label) VALUES ($1, $2, $3)`,
        [token, req.user!.id, label],
      );
      return reply.code(201).send({ token, label, url: `/my-day?token=${token}` });
    },
  );

  app.get('/api/mirror/tokens', { preHandler: requireUser }, async (req) => {
    const { rows } = await pool.query<{ token: string; label: string; created_at: string }>(
      `SELECT token, label, created_at FROM mirror_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user!.id],
    );
    return rows;
  });

  app.delete<{ Params: { token: string } }>(
    '/api/mirror/tokens/:token',
    { preHandler: requireUser },
    async (req, reply) => {
      await pool.query(`DELETE FROM mirror_tokens WHERE token = $1 AND user_id = $2`, [
        req.params.token,
        req.user!.id,
      ]);
      return reply.code(204).send();
    },
  );
}
