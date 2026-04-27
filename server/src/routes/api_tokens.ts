import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { newToken, requireUser } from '../auth.js';

export async function apiTokenRoutes(app: FastifyInstance) {
  app.post<{ Body?: { label?: string } }>(
    '/api/tokens',
    { preHandler: requireUser },
    async (req, reply) => {
      const token = newToken();
      const label = req.body?.label?.trim() || 'api';
      await pool.query(
        `INSERT INTO mirror_tokens (token, user_id, label, scope) VALUES ($1, $2, $3, 'api')`,
        [token, req.user!.id, label],
      );
      return reply.code(201).send({ token, label, scope: 'api' });
    },
  );

  app.get('/api/tokens', { preHandler: requireUser }, async (req) => {
    const { rows } = await pool.query<{ token: string; label: string; created_at: string; scope: string }>(
      `SELECT token, label, created_at, scope
       FROM mirror_tokens
       WHERE user_id = $1 AND scope = 'api'
       ORDER BY created_at DESC`,
      [req.user!.id],
    );
    return rows;
  });

  app.delete<{ Params: { token: string } }>(
    '/api/tokens/:token',
    { preHandler: requireUser },
    async (req, reply) => {
      await pool.query(
        `DELETE FROM mirror_tokens WHERE token = $1 AND user_id = $2 AND scope = 'api'`,
        [req.params.token, req.user!.id],
      );
      return reply.code(204).send();
    },
  );
}
