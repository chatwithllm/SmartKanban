import { pool } from './db.js';

export const CARD_LINK_LABELS = [
  'evolves_from',
  'supersedes',
  'split_from',
  'related',
  'inspired_by',
  'duplicate_of',
] as const;

export type CardLinkLabel = (typeof CARD_LINK_LABELS)[number];

export const isCardLinkLabel = (v: unknown): v is CardLinkLabel =>
  typeof v === 'string' && (CARD_LINK_LABELS as readonly string[]).includes(v);

export type CardLink = {
  id: string;
  from_card_id: string;
  to_card_id: string;
  label: CardLinkLabel;
  note: string | null;
  created_by: string;
  created_at: string;
};

const SELECT = `id, from_card_id, to_card_id, label, note, created_by, created_at`;

export async function createLink(
  actor: string,
  fromCardId: string,
  toCardId: string,
  label: CardLinkLabel,
  note: string | null,
): Promise<CardLink> {
  if (fromCardId === toCardId) {
    throw new Error('cannot self-link a card');
  }
  if (!isCardLinkLabel(label)) {
    throw new Error(`invalid label: ${String(label)}`);
  }
  const trimmedNote = note?.slice(0, 500) ?? null;
  const { rows } = await pool.query<CardLink>(
    `INSERT INTO card_links (from_card_id, to_card_id, label, note, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${SELECT}`,
    [fromCardId, toCardId, label, trimmedNote, actor],
  );
  return rows[0]!;
}

export async function deleteLink(_actor: string, linkId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM card_links WHERE id = $1`,
    [linkId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Returns all links where the card is on either end.
 * Note: this is the raw DB layer; the route layer filters out links whose
 * other endpoint is invisible to the requesting user.
 */
export async function listLinksForCard(_userId: string, cardId: string): Promise<CardLink[]> {
  const { rows } = await pool.query<CardLink>(
    `SELECT ${SELECT} FROM card_links
     WHERE from_card_id = $1 OR to_card_id = $1
     ORDER BY created_at DESC`,
    [cardId],
  );
  return rows;
}

/**
 * BFS from startId outward in both directions, up to `depth` hops.
 * Returns the set of card ids reachable (including start).
 */
export async function chainCardIds(startId: string, depth: number): Promise<string[]> {
  const cap = Math.max(1, Math.min(6, Math.floor(depth)));
  const { rows } = await pool.query<{ id: string }>(
    `WITH RECURSIVE walk (id, d) AS (
       SELECT $1::uuid, 0
       UNION
       SELECT
         CASE WHEN cl.from_card_id = w.id THEN cl.to_card_id ELSE cl.from_card_id END,
         w.d + 1
       FROM walk w
       JOIN card_links cl ON cl.from_card_id = w.id OR cl.to_card_id = w.id
       WHERE w.d < $2
     )
     SELECT DISTINCT id FROM walk`,
    [startId, cap],
  );
  return rows.map((r) => r.id);
}

/**
 * Returns links whose endpoints are both in the given id set.
 */
export async function linksBetween(cardIds: string[]): Promise<CardLink[]> {
  if (cardIds.length === 0) return [];
  const { rows } = await pool.query<CardLink>(
    `SELECT ${SELECT} FROM card_links
     WHERE from_card_id = ANY($1::uuid[]) AND to_card_id = ANY($1::uuid[])
     ORDER BY created_at ASC`,
    [cardIds],
  );
  return rows;
}
