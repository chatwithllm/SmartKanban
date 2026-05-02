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
  project: string | null;
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

export async function listCards(
  userId: string,
  scope: Scope,
  project?: string,
): Promise<Card[]> {
  const baseWhere =
    scope === 'inbox'
      ? `NOT c.archived AND NOT EXISTS (SELECT 1 FROM card_assignees a WHERE a.card_id = c.id)`
      : scope === 'personal'
        ? `NOT c.archived AND (
             c.created_by = $1
             OR EXISTS (SELECT 1 FROM card_assignees WHERE card_id = c.id AND user_id = $1)
             OR EXISTS (SELECT 1 FROM card_shares    WHERE card_id = c.id AND user_id = $1)
           )`
        : `NOT c.archived AND ${VISIBLE_TO_USER}`;

  const params: unknown[] = scope === 'inbox' ? [] : [userId];
  let where = baseWhere;
  if (project) {
    params.push(project);
    where = `${baseWhere} AND c.project = $${params.length}`;
  }

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

export type AiSuggestion = {
  label: string;
  action: 'update_status' | 'set_due_date' | 'assign_user' | 'create_card';
  params: Record<string, unknown>;
};

export type CardEvent = {
  id: string;
  actor_id: string | null;
  card_id: string | null;
  action: string | null;
  details: Record<string, unknown>;
  entry_type: 'system' | 'message' | 'ai';
  content: string | null;
  ai_suggestions: AiSuggestion[] | null;
  created_at: string;
  actor_name: string | null;
};

export async function listArchivedCards(userId: string): Promise<Card[]> {
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
    WHERE c.archived AND (
      c.created_by = $1
      OR EXISTS (SELECT 1 FROM card_assignees WHERE card_id = c.id AND user_id = $1)
      OR EXISTS (SELECT 1 FROM card_shares    WHERE card_id = c.id AND user_id = $1)
      OR NOT EXISTS (SELECT 1 FROM card_assignees WHERE card_id = c.id)
    )
    ORDER BY c.updated_at DESC
    `,
    [userId],
  );
  return rows;
}

export async function getCardEvents(cardId: string): Promise<CardEvent[]> {
  const { rows } = await pool.query<CardEvent>(
    `
    SELECT
      ce.id::text, ce.actor_id, ce.card_id, ce.action, ce.details, ce.created_at,
      ce.entry_type, ce.content, ce.ai_suggestions,
      u.name AS actor_name
    FROM card_events ce
    LEFT JOIN users u ON u.id = ce.actor_id
    WHERE ce.card_id = $1
    ORDER BY ce.created_at ASC
    `,
    [cardId],
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
    `INSERT INTO card_events (actor_id, card_id, action, details) VALUES ($1, $2, $3, $4)`,
    [actorId, cardId, action, details],
  );
}

export async function postCardMessage(
  cardId: string,
  userId: string,
  content: string,
): Promise<CardEvent> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO card_events (actor_id, card_id, entry_type, content)
     VALUES ($1, $2, 'message', $3)
     RETURNING id::text`,
    [userId, cardId, content],
  );
  const id = rows[0]!.id;
  const ev = await pool.query<CardEvent>(
    `SELECT ce.id::text, ce.actor_id, ce.card_id, ce.action, ce.details, ce.created_at,
            ce.entry_type, ce.content, ce.ai_suggestions,
            u.name AS actor_name
     FROM card_events ce LEFT JOIN users u ON u.id = ce.actor_id
     WHERE ce.id = $1`,
    [id],
  );
  return ev.rows[0]!;
}

export async function postAiEvent(
  cardId: string,
  content: string,
  aiSuggestions: AiSuggestion[] | null,
): Promise<CardEvent> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO card_events (card_id, entry_type, content, ai_suggestions)
     VALUES ($1, 'ai', $2, $3)
     RETURNING id::text`,
    [cardId, content, aiSuggestions ? JSON.stringify(aiSuggestions) : null],
  );
  const id = rows[0]!.id;
  const ev = await pool.query<CardEvent>(
    `SELECT ce.id::text, ce.actor_id, ce.card_id, ce.action, ce.details, ce.created_at,
            ce.entry_type, ce.content, ce.ai_suggestions,
            u.name AS actor_name
     FROM card_events ce LEFT JOIN users u ON u.id = ce.actor_id
     WHERE ce.id = $1`,
    [id],
  );
  return ev.rows[0]!;
}

export async function markCardEventsRead(
  cardId: string,
  userId: string,
  lastReadId: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO card_event_reads (card_id, user_id, last_read_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (card_id, user_id) DO UPDATE SET last_read_id = GREATEST(card_event_reads.last_read_id, $3)`,
    [cardId, userId, lastReadId],
  );
}

export async function getUnreadCounts(userId: string): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ card_id: string; cnt: string }>(
    `
    SELECT ce.card_id::text, COUNT(*)::text AS cnt
    FROM card_events ce
    WHERE ce.entry_type IN ('message', 'ai')
      AND (ce.actor_id IS NULL OR ce.actor_id::text != $1)
      AND ce.id > COALESCE(
        (SELECT last_read_id FROM card_event_reads
         WHERE card_id = ce.card_id AND user_id = $1::uuid),
        0
      )
      AND (
        EXISTS (SELECT 1 FROM card_assignees WHERE card_id = ce.card_id AND user_id = $1::uuid)
        OR EXISTS (SELECT 1 FROM card_shares    WHERE card_id = ce.card_id AND user_id = $1::uuid)
        OR EXISTS (SELECT 1 FROM cards WHERE id = ce.card_id AND created_by = $1::uuid)
        OR NOT EXISTS (SELECT 1 FROM card_assignees WHERE card_id = ce.card_id)
      )
    GROUP BY ce.card_id
    `,
    [userId],
  );
  const result: Record<string, number> = {};
  for (const r of rows) result[r.card_id] = parseInt(r.cnt, 10);
  return result;
}
