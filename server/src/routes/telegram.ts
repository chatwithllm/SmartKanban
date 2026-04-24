import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { requireUser } from '../auth.js';
import { telegramWebhookCallback } from '../telegram/bot.js';

export async function telegramRoutes(app: FastifyInstance) {
  // Webhook endpoint (secret in path to deter scanning)
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? 'dev-webhook';
  app.post(`/telegram/webhook/${secret}`, async (req, reply) => {
    const cb = telegramWebhookCallback();
    if (!cb) return reply.code(503).send({ error: 'bot not running' });
    return cb(req, reply);
  });

  // Link the current app user to a Telegram user id.
  app.post<{ Body: { telegram_user_id: number; telegram_username?: string } }>(
    '/api/telegram/link',
    { preHandler: requireUser },
    async (req, reply) => {
      const { telegram_user_id, telegram_username } = req.body ?? ({} as Record<string, never>);
      if (!telegram_user_id || typeof telegram_user_id !== 'number') {
        return reply.code(400).send({ error: 'telegram_user_id required' });
      }
      await pool.query(
        `INSERT INTO telegram_identities (telegram_user_id, app_user_id, telegram_username)
         VALUES ($1, $2, $3)
         ON CONFLICT (telegram_user_id) DO UPDATE
           SET app_user_id = EXCLUDED.app_user_id,
               telegram_username = EXCLUDED.telegram_username`,
        [telegram_user_id, req.user!.id, telegram_username ?? null],
      );
      return { ok: true };
    },
  );

  app.get('/api/telegram/identities', { preHandler: requireUser }, async () => {
    const { rows } = await pool.query(
      `SELECT telegram_user_id, app_user_id, telegram_username FROM telegram_identities ORDER BY created_at DESC`,
    );
    return rows;
  });

  app.delete<{ Params: { id: string } }>(
    '/api/telegram/identities/:id',
    { preHandler: requireUser },
    async (req, reply) => {
      await pool.query(`DELETE FROM telegram_identities WHERE telegram_user_id = $1`, [
        Number(req.params.id),
      ]);
      return reply.code(204).send();
    },
  );
}
