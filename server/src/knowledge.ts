import { pool } from './db.js';

export type KnowledgeVisibility = 'private' | 'inbox' | 'shared';
export type KnowledgeFetchStatus = 'pending' | 'ok' | 'failed' | 'skipped';
export type KnowledgeSource = 'manual' | 'telegram' | 'share_target' | 'from_card';

export type KnowledgeItem = {
  id: string;
  owner_id: string;
  title: string;
  title_auto: boolean;
  url: string | null;
  body: string;
  tags: string[];
  visibility: KnowledgeVisibility;
  source: KnowledgeSource;
  fetch_status: KnowledgeFetchStatus | null;
  fetch_error: string | null;
  fetched_at: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  shares?: string[];
  linked_card_ids?: string[];
};

export type KnowledgeInput = {
  title: string;
  title_auto?: boolean;
  url?: string | null;
  body?: string;
  tags?: string[];
  visibility: KnowledgeVisibility;
  shares?: string[];
  auto_fetch?: boolean;
  source?: KnowledgeSource;
};

export type KnowledgePatch = Partial<Omit<KnowledgeInput, 'source'>> & { archived?: boolean };

export class KnowledgeValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = 'KnowledgeValidationError';
  }
}

const TITLE_MAX = 200;
const BODY_MAX = Number(process.env.KNOWLEDGE_BODY_MAX_CHARS ?? 200_000);
const TAG_MAX_LEN = 32;
const MAX_TAGS = 10;

export function validateUrl(url: string): URL {
  let u: URL;
  try { u = new URL(url); }
  catch { throw new KnowledgeValidationError('url', 'invalid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new KnowledgeValidationError('url', 'only http/https URLs allowed');
  }
  if (!u.hostname) throw new KnowledgeValidationError('url', 'URL missing host');
  return u;
}

export function normaliseTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  for (const t of tags) {
    const v = String(t).toLowerCase().trim();
    if (!v) continue;
    if (v.length > TAG_MAX_LEN) {
      throw new KnowledgeValidationError('tags', `tag exceeds ${TAG_MAX_LEN} chars`);
    }
    seen.add(v);
  }
  const result = Array.from(seen);
  if (result.length > MAX_TAGS) {
    throw new KnowledgeValidationError('tags', `at most ${MAX_TAGS} tags`);
  }
  return result;
}

function validateInput(input: KnowledgeInput | KnowledgePatch, partial: boolean): void {
  if (input.title !== undefined) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > TITLE_MAX) {
      throw new KnowledgeValidationError('title', `title required, 1..${TITLE_MAX} chars`);
    }
  } else if (!partial) {
    throw new KnowledgeValidationError('title', 'title required');
  }
  if (input.visibility !== undefined) {
    if (!['private', 'inbox', 'shared'].includes(input.visibility)) {
      throw new KnowledgeValidationError('visibility', 'visibility must be private | inbox | shared');
    }
  } else if (!partial) {
    throw new KnowledgeValidationError('visibility', 'visibility required');
  }
  if (input.url) validateUrl(input.url);
  if (input.body !== undefined && input.body.length > BODY_MAX) {
    throw new KnowledgeValidationError('body', `body exceeds ${BODY_MAX} chars`);
  }
  if (!partial) {
    const hasUrl = !!input.url;
    const hasBody = !!(input.body && input.body.trim());
    if (!hasUrl && !hasBody) {
      throw new KnowledgeValidationError('body', 'one of url or body required');
    }
  }
}

export async function createKnowledge(
  ownerId: string, input: KnowledgeInput,
): Promise<KnowledgeItem> {
  validateInput(input, false);
  const tags = normaliseTags(input.tags);
  const wantAutoFetch =
    input.auto_fetch ?? (!!input.url && !(input.body && input.body.trim()));
  const fetchStatus: KnowledgeFetchStatus | null = wantAutoFetch ? 'pending' : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<KnowledgeItem>(
      `INSERT INTO knowledge_items
         (owner_id, title, title_auto, url, body, tags, visibility, source, fetch_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        ownerId, input.title.trim(), !!input.title_auto, input.url ?? null,
        input.body ?? '', tags, input.visibility,
        input.source ?? 'manual', fetchStatus,
      ],
    );
    const k = rows[0]!;
    if (input.visibility === 'shared' && input.shares?.length) {
      const values: string[] = [];
      const params: unknown[] = [k.id];
      for (let i = 0; i < input.shares.length; i++) {
        params.push(input.shares[i]);
        values.push(`($1, $${i + 2})`);
      }
      await client.query(
        `INSERT INTO knowledge_shares (knowledge_id, user_id) VALUES ${values.join(', ')}
         ON CONFLICT DO NOTHING`,
        params,
      );
      k.shares = input.shares;
    }
    await client.query('COMMIT');
    return k;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function loadKnowledge(id: string): Promise<KnowledgeItem | null> {
  const { rows } = await pool.query<KnowledgeItem>(
    `SELECT * FROM knowledge_items WHERE id = $1`, [id],
  );
  const k = rows[0];
  if (!k) return null;
  const s = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM knowledge_shares WHERE knowledge_id = $1`, [id],
  );
  k.shares = s.rows.map(r => r.user_id);
  const l = await pool.query<{ card_id: string }>(
    `SELECT card_id FROM knowledge_card_links WHERE knowledge_id = $1`, [id],
  );
  k.linked_card_ids = l.rows.map(r => r.card_id);
  return k;
}

export async function canUserSeeKnowledge(
  userId: string, k: KnowledgeItem,
): Promise<boolean> {
  if (k.owner_id === userId) return true;
  if (k.visibility === 'inbox') return true;
  if (k.visibility === 'shared') {
    const r = await pool.query(
      `SELECT 1 FROM knowledge_shares WHERE knowledge_id = $1 AND user_id = $2`,
      [k.id, userId],
    );
    return r.rowCount! > 0;
  }
  return false;
}

export type ListOptions = {
  scope?: 'mine' | 'inbox' | 'all';
  q?: string;
  tag?: string;
  limit?: number;
  cursor?: { updated_at: string; id: string };
};

export async function listKnowledge(
  userId: string, opts: ListOptions = {},
): Promise<KnowledgeItem[]> {
  const scope = opts.scope ?? 'all';
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const params: unknown[] = [userId];
  const where: string[] = ['NOT archived'];

  // visibility predicate
  where.push(`(
    owner_id = $1
    OR visibility = 'inbox'
    OR (visibility = 'shared'
        AND EXISTS (SELECT 1 FROM knowledge_shares ks
                    WHERE ks.knowledge_id = knowledge_items.id AND ks.user_id = $1))
  )`);

  if (scope === 'mine')  where.push(`owner_id = $1`);
  if (scope === 'inbox') where.push(`visibility = 'inbox'`);

  if (opts.q) {
    params.push(opts.q);
    where.push(`fts @@ plainto_tsquery('english', $${params.length})`);
  }
  if (opts.tag) {
    params.push(opts.tag.toLowerCase());
    where.push(`$${params.length} = ANY(tags)`);
  }
  if (opts.cursor) {
    params.push(opts.cursor.updated_at, opts.cursor.id);
    where.push(`(updated_at, id) < ($${params.length - 1}, $${params.length})`);
  }
  params.push(limit);
  const sql = `
    SELECT * FROM knowledge_items
    WHERE ${where.join(' AND ')}
    ORDER BY updated_at DESC, id DESC
    LIMIT $${params.length}`;
  const { rows } = await pool.query<KnowledgeItem>(sql, params);
  return rows;
}

export async function updateKnowledge(
  ownerId: string, id: string, patch: KnowledgePatch,
): Promise<KnowledgeItem | null> {
  validateInput(patch, true);
  const k = await loadKnowledge(id);
  if (!k) return null;
  if (k.owner_id !== ownerId) {
    throw new KnowledgeValidationError('owner', 'forbidden');
  }
  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, v: unknown) => { values.push(v); sets.push(`${col} = $${values.length}`); };

  if (patch.title !== undefined)      push('title', patch.title.trim());
  if (patch.title_auto !== undefined) push('title_auto', !!patch.title_auto);
  if (patch.url !== undefined)        push('url', patch.url);
  if (patch.body !== undefined)       push('body', patch.body);
  if (patch.tags !== undefined)       push('tags', normaliseTags(patch.tags));
  if (patch.visibility !== undefined) push('visibility', patch.visibility);
  if (patch.archived !== undefined)   push('archived', !!patch.archived);
  if (sets.length === 0 && patch.shares === undefined) return k;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let updated: KnowledgeItem = k;
    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`);
      values.push(id, ownerId);
      const { rows } = await client.query<KnowledgeItem>(
        `UPDATE knowledge_items SET ${sets.join(', ')}
         WHERE id = $${values.length - 1} AND owner_id = $${values.length}
         RETURNING *`,
        values,
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      updated = rows[0];
    }
    if (patch.shares !== undefined) {
      await client.query(`DELETE FROM knowledge_shares WHERE knowledge_id = $1`, [id]);
      if (updated.visibility === 'shared' && patch.shares.length > 0) {
        const params: unknown[] = [id];
        const ph: string[] = [];
        for (let i = 0; i < patch.shares.length; i++) {
          params.push(patch.shares[i]);
          ph.push(`($1, $${i + 2})`);
        }
        await client.query(
          `INSERT INTO knowledge_shares (knowledge_id, user_id) VALUES ${ph.join(', ')}
           ON CONFLICT DO NOTHING`,
          params,
        );
      }
      updated.shares = patch.shares;
    }
    await client.query('COMMIT');
    return updated;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function archiveKnowledge(ownerId: string, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE knowledge_items SET archived = TRUE, updated_at = NOW()
     WHERE id = $1 AND owner_id = $2 AND NOT archived`,
    [id, ownerId],
  );
  return (rowCount ?? 0) > 0;
}

export async function setFetchResult(
  id: string,
  result:
    | { status: 'ok'; body: string; title?: string }
    | { status: 'failed'; error: string }
    | { status: 'skipped' },
): Promise<KnowledgeItem | null> {
  if (result.status === 'ok') {
    const { rows } = await pool.query<KnowledgeItem>(
      `UPDATE knowledge_items
         SET body = $2,
             title = CASE WHEN title_auto AND $3::text IS NOT NULL THEN $3 ELSE title END,
             title_auto = CASE WHEN title_auto AND $3::text IS NOT NULL THEN FALSE ELSE title_auto END,
             fetch_status = 'ok',
             fetch_error = NULL,
             fetched_at = NOW(),
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, result.body, result.title ?? null],
    );
    return rows[0] ?? null;
  }
  if (result.status === 'failed') {
    const { rows } = await pool.query<KnowledgeItem>(
      `UPDATE knowledge_items
         SET fetch_status = 'failed', fetch_error = $2,
             fetched_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, result.error.slice(0, 500)],
    );
    return rows[0] ?? null;
  }
  const { rows } = await pool.query<KnowledgeItem>(
    `UPDATE knowledge_items
       SET fetch_status = 'skipped', fetched_at = NOW(), updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}
