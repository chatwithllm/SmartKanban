import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { requireUser } from '../auth.js';
import { maybeWeeklySummary } from '../ai/weekly_summary.js';

type ReviewRow = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  created_at: string;
  tags: string[];
};

export async function reviewRoutes(app: FastifyInstance) {
  app.get('/api/review', { preHandler: requireUser }, async (req) => {
    const userId = req.user!.id;

    const done = await pool.query<ReviewRow>(
      `SELECT c.id, c.title, c.status, c.updated_at, c.created_at, c.tags
       FROM cards c
       WHERE NOT c.archived AND c.status = 'done' AND c.updated_at > NOW() - INTERVAL '7 days'
         AND (c.created_by = $1
              OR EXISTS (SELECT 1 FROM card_assignees WHERE card_id = c.id AND user_id = $1))
       ORDER BY c.updated_at DESC`,
      [userId],
    );

    const stale = await pool.query<ReviewRow>(
      `SELECT c.id, c.title, c.status, c.updated_at, c.created_at, c.tags
       FROM cards c
       WHERE NOT c.archived AND c.status IN ('today', 'in_progress')
         AND c.updated_at < NOW() - INTERVAL '7 days'
         AND (c.created_by = $1
              OR EXISTS (SELECT 1 FROM card_assignees WHERE card_id = c.id AND user_id = $1))
       ORDER BY c.updated_at ASC`,
      [userId],
    );

    const stuck = await pool.query<ReviewRow>(
      `SELECT c.id, c.title, c.status, c.updated_at, c.created_at, c.tags
       FROM cards c
       WHERE NOT c.archived AND c.status = 'in_progress'
         AND c.updated_at < NOW() - INTERVAL '3 days'
         AND (c.created_by = $1
              OR EXISTS (SELECT 1 FROM card_assignees WHERE card_id = c.id AND user_id = $1))
       ORDER BY c.updated_at ASC`,
      [userId],
    );

    const summary = await maybeWeeklySummary(done.rows, stale.rows, stuck.rows);

    return {
      done: done.rows,
      stale: stale.rows,
      stuck: stuck.rows,
      summary,
    };
  });
}
