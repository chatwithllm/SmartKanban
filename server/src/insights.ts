import { pool } from './db.js';

export type InsightStatus = 'pending' | 'ok' | 'failed';

export type InsightBody = {
  related_items?: Array<{ kind: 'card' | 'knowledge'; id: string; title: string; why: string; url?: string | null }>;
  web_findings?: Array<{ title: string; url: string; why: string }>;
  next_steps?: string[];
};

export type Insight = {
  id: string;
  card_id: string;
  requested_by: string;
  status: InsightStatus;
  summary: string | null;
  body: InsightBody | null;
  error: string | null;
  degraded: boolean;
  created_at: string;
  completed_at: string | null;
};

const SELECT = `
  id, card_id, requested_by, status, summary, body, error, degraded,
  created_at, completed_at
`;

export async function createInsight(cardId: string, requestedBy: string): Promise<Insight> {
  const { rows } = await pool.query<Insight>(
    `INSERT INTO ai_insights (card_id, requested_by, status)
     VALUES ($1, $2, 'pending')
     RETURNING ${SELECT}`,
    [cardId, requestedBy],
  );
  return rows[0]!;
}

export async function getInsight(id: string): Promise<Insight | null> {
  const { rows } = await pool.query<Insight>(
    `SELECT ${SELECT} FROM ai_insights WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listInsightsForCard(cardId: string, limit: number): Promise<Insight[]> {
  const { rows } = await pool.query<Insight>(
    `SELECT ${SELECT} FROM ai_insights
     WHERE card_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [cardId, limit],
  );
  return rows;
}

export async function countPendingByUser(userId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM ai_insights WHERE requested_by = $1 AND status = 'pending'`,
    [userId],
  );
  return Number(rows[0]!.n);
}

export async function countPendingByCard(cardId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM ai_insights WHERE card_id = $1 AND status = 'pending'`,
    [cardId],
  );
  return Number(rows[0]!.n);
}

export async function countTodayByUser(userId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM ai_insights
     WHERE requested_by = $1 AND created_at::date = CURRENT_DATE`,
    [userId],
  );
  return Number(rows[0]!.n);
}

export async function markOk(
  id: string,
  summary: string,
  body: InsightBody,
  degraded: boolean,
): Promise<void> {
  await pool.query(
    `UPDATE ai_insights
     SET status = 'ok', summary = $2, body = $3::jsonb,
         degraded = $4, completed_at = now(), error = NULL
     WHERE id = $1`,
    [id, summary, JSON.stringify(body), degraded],
  );
}

export async function markFailed(id: string, error: string): Promise<void> {
  await pool.query(
    `UPDATE ai_insights
     SET status = 'failed', error = $2, completed_at = now()
     WHERE id = $1`,
    [id, error.slice(0, 500)],
  );
}

/**
 * Returns recent pending insight ids that should be re-enqueued on startup.
 * Pending rows older than 1 hour are marked failed (abandoned).
 */
export async function recoverPendingInsights(): Promise<string[]> {
  await pool.query(
    `UPDATE ai_insights
     SET status = 'failed', error = 'abandoned on restart', completed_at = now()
     WHERE status = 'pending' AND created_at < now() - interval '1 hour'`,
  );
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM ai_insights
     WHERE status = 'pending' AND created_at >= now() - interval '1 hour'
     ORDER BY created_at ASC`,
  );
  return rows.map((r) => r.id);
}
