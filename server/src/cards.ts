import { pool } from './db.js';

export const STATUSES = ['backlog', 'today', 'in_progress', 'done'] as const;
export type Status = (typeof STATUSES)[number];
export const isStatus = (v: unknown): v is Status =>
  typeof v === 'string' && (STATUSES as readonly string[]).includes(v);

export type Source = 'manual' | 'telegram' | 'mirror';

export type Attachment = {
  id: string;
  kind: 'audio' | 'image' | 'file';
  storage_path: string;
  original_filename: string | null;
  created_at: string;
};

export type Card = {
  id: string;
  title: string;
  description: string;
  status: Status;
  tags: string[];
  due_date: string | null;
  source: Source;
  position: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  ai_summarized: boolean;
  needs_review: boolean;
  assignees: string[];
  shares: string[];
  attachments: Attachment[];
};

// Load a single card with assignees + shares + attachments.
export async function loadCard(id: string): Promise<Card | null> {
  const { rows } = await pool.query<Card>(
    `
    SELECT
      c.*,
      COALESCE((SELECT ARRAY_AGG(user_id::text) FROM card_assignees WHERE card_id = c.id), '{}') AS assignees,
      COALESCE((SELECT ARRAY_AGG(user_id::text) FROM card_shares WHERE card_id = c.id), '{}') AS shares,
      COALESCE((
        SELECT JSON_AGG(json_build_object(
          'id', a.id, 'kind', a.kind, 'storage_path', a.storage_path,
          'original_filename', a.original_filename, 'created_at', a.created_at
        ) ORDER BY a.created_at)
        FROM card_attachments a WHERE a.card_id = c.id
      ), '[]'::json) AS attachments
    FROM cards c WHERE c.id = $1
    `,
    [id],
  );
  return rows[0] ?? null;
}

// Cards visible to a given user: created by them, assigned to them, shared with them, OR in Family Inbox (unassigned).
// `scope` controls which board view the user is requesting.
export type Scope = 'personal' | 'inbox' | 'all';

// Shared visibility predicate: a card is visible to a user if they created it,
// are assigned, it's shared with them, or it's in the unassigned Family Inbox.
const VISIBLE_TO_USER = `(
  c.created_by = $1
  OR EXISTS (SELECT 1 FROM card_assignees WHERE card_id = c.id AND user_id = $1)
  OR EXISTS (SELECT 1 FROM card_shares    WHERE card_id = c.id AND user_id = $1)
  OR NOT EXISTS (SELECT 1 FROM card_assignees WHERE card_id = c.id)
)`;

export async function canUserSeeCard(userId: string, cardId: string): Promise<boolean> {
  const { rows } = await pool.query<{ ok: boolean }>(
    `SELECT ${VISIBLE_TO_USER} AS ok FROM cards c WHERE c.id = $2`,
    [userId, cardId],
  );
  return !!rows[0]?.ok;
}

export async function listCards(userId: string, scope: Scope): Promise<Card[]> {
  const where =
    scope === 'inbox'
      ? `NOT c.archived AND NOT EXISTS (SELECT 1 FROM card_assignees a WHERE a.card_id = c.id)`
      : scope === 'personal'
        ? `NOT c.archived AND (
             c.created_by = $1
             OR EXISTS (SELECT 1 FROM card_assignees WHERE card_id = c.id AND user_id = $1)
             OR EXISTS (SELECT 1 FROM card_shares    WHERE card_id = c.id AND user_id = $1)
           )`
        : `NOT c.archived AND ${VISIBLE_TO_USER}`;
  const params = scope === 'inbox' ? [] : [userId];
  const { rows } = await pool.query<Card>(
    `
    SELECT
      c.*,
      COALESCE((SELECT ARRAY_AGG(user_id::text) FROM card_assignees WHERE card_id = c.id), '{}') AS assignees,
      COALESCE((SELECT ARRAY_AGG(user_id::text) FROM card_shares WHERE card_id = c.id), '{}') AS shares,
      COALESCE((
        SELECT JSON_AGG(json_build_object(
          'id', a.id, 'kind', a.kind, 'storage_path', a.storage_path,
          'original_filename', a.original_filename, 'created_at', a.created_at
        ) ORDER BY a.created_at)
        FROM card_attachments a WHERE a.card_id = c.id
      ), '[]'::json) AS attachments
    FROM cards c
    WHERE ${where}
    ORDER BY c.status, c.position, c.created_at
    `,
    params,
  );
  return rows;
}

export async function logActivity(
  actorId: string | null,
  cardId: string | null,
  action: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO activity_log (actor_id, card_id, action, details) VALUES ($1, $2, $3, $4)`,
    [actorId, cardId, action, details],
  );
}
