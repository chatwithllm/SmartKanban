import { pool } from './db.js';
import { loadCard, logActivity, isStatus, type Card, type Source, type Status } from './cards.js';

export type Visibility = 'private' | 'shared';

export type Template = {
  id: string;
  owner_id: string;
  name: string;
  visibility: Visibility;
  title: string;
  description: string;
  tags: string[];
  status: Status;
  due_offset_days: number | null;
  created_at: string;
  updated_at: string;
};

export type TemplateInput = {
  name: string;
  visibility: Visibility;
  title: string;
  description?: string;
  tags?: string[];
  status?: Status;
  due_offset_days?: number | null;
};

export type TemplatePatch = Partial<TemplateInput>;

const NAME_RE = /^\S(?:.{0,38}\S)?$/; // 1–40 chars, no leading/trailing whitespace, no whitespace-only

export class TemplateValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = 'TemplateValidationError';
  }
}

function validateInput(input: TemplateInput | TemplatePatch, partial: boolean): void {
  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || !NAME_RE.test(input.name)) {
      throw new TemplateValidationError('name', 'name must be 1–40 non-whitespace chars');
    }
  } else if (!partial) {
    throw new TemplateValidationError('name', 'name required');
  }
  if (input.visibility !== undefined) {
    if (input.visibility !== 'private' && input.visibility !== 'shared') {
      throw new TemplateValidationError('visibility', 'visibility must be private or shared');
    }
  } else if (!partial) {
    throw new TemplateValidationError('visibility', 'visibility required');
  }
  if (input.title !== undefined) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120) {
      throw new TemplateValidationError('title', 'title required, max 120 chars');
    }
  } else if (!partial) {
    throw new TemplateValidationError('title', 'title required');
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags)) {
      throw new TemplateValidationError('tags', 'tags must be an array');
    }
  }
  if (input.status !== undefined && !isStatus(input.status)) {
    throw new TemplateValidationError('status', 'invalid status');
  }
  if (input.due_offset_days !== undefined && input.due_offset_days !== null) {
    const n = input.due_offset_days;
    if (!Number.isInteger(n) || n < 0 || n > 365) {
      throw new TemplateValidationError('due_offset_days', 'must be integer 0–365');
    }
  }
}

function normaliseTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  for (const t of tags) {
    const v = String(t).toLowerCase().trim();
    if (v) seen.add(v);
  }
  const result = Array.from(seen);
  if (result.length > 5) {
    throw new TemplateValidationError('tags', 'tags must have at most 5 unique values');
  }
  return result;
}

export async function createTemplate(ownerId: string, input: TemplateInput): Promise<Template> {
  validateInput(input, false);
  const tags = normaliseTags(input.tags);
  const { rows } = await pool.query<Template>(
    `INSERT INTO card_templates
       (owner_id, name, visibility, title, description, tags, status, due_offset_days)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      ownerId,
      input.name,
      input.visibility,
      input.title,
      input.description ?? '',
      tags,
      input.status ?? 'today',
      input.due_offset_days ?? null,
    ],
  );
  return rows[0]!;
}

export async function listTemplates(userId: string): Promise<Template[]> {
  const { rows } = await pool.query<Template>(
    `SELECT * FROM card_templates
     WHERE owner_id = $1 OR visibility = 'shared'
     ORDER BY visibility DESC, lower(name) ASC`,
    [userId],
  );
  return rows;
}

export async function loadTemplate(id: string): Promise<Template | null> {
  const { rows } = await pool.query<Template>(
    `SELECT * FROM card_templates WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export function canUserSeeTemplate(userId: string, t: Template): boolean {
  return t.owner_id === userId || t.visibility === 'shared';
}

export async function updateTemplate(
  ownerId: string,
  id: string,
  patch: TemplatePatch,
): Promise<Template | null> {
  validateInput(patch, true);
  const t = await loadTemplate(id);
  if (!t) return null;
  if (t.owner_id !== ownerId) throw new TemplateValidationError('owner', 'forbidden');

  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, v: unknown) => {
    values.push(v);
    sets.push(`${col} = $${values.length}`);
  };

  if (patch.name !== undefined) push('name', patch.name);
  if (patch.visibility !== undefined) push('visibility', patch.visibility);
  if (patch.title !== undefined) push('title', patch.title);
  if (patch.description !== undefined) push('description', patch.description);
  if (patch.tags !== undefined) push('tags', normaliseTags(patch.tags));
  if (patch.status !== undefined) push('status', patch.status);
  if (patch.due_offset_days !== undefined) push('due_offset_days', patch.due_offset_days);
  if (sets.length === 0) return t;

  sets.push(`updated_at = NOW()`);
  values.push(id);
  values.push(ownerId);
  // Both id and owner_id are constrained so this UPDATE cannot write to a row the
  // caller doesn't own even if a race invalidates the pre-load above. If the row
  // was deleted between SELECT and UPDATE, rows[0] is undefined and we return null
  // (treated as 404 by the route layer).
  const { rows } = await pool.query<Template>(
    `UPDATE card_templates SET ${sets.join(', ')}
     WHERE id = $${values.length - 1} AND owner_id = $${values.length}
     RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteTemplate(ownerId: string, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM card_templates WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return (rowCount ?? 0) > 0;
}

// Look up a template by case-insensitive name visible to `userId`.
// Owner's private template wins ties over shared with same name.
export async function findTemplateByName(
  userId: string,
  name: string,
): Promise<Template | null> {
  const { rows } = await pool.query<Template>(
    `SELECT * FROM card_templates
     WHERE lower(name) = lower($1)
       AND (owner_id = $2 OR visibility = 'shared')
     ORDER BY (owner_id = $2) DESC
     LIMIT 1`,
    [name, userId],
  );
  return rows[0] ?? null;
}

export type InstantiateOpts = {
  source: Source;
  statusOverride?: Status;
  telegramChatId?: number;
  telegramMessageId?: number;
};

export async function instantiateTemplate(
  userId: string,
  templateId: string,
  opts: InstantiateOpts,
): Promise<Card | null> {
  const t = await loadTemplate(templateId);
  if (!t) return null;
  if (!canUserSeeTemplate(userId, t)) return null;

  const status: Status = opts.statusOverride ?? t.status;
  const dueDate =
    t.due_offset_days != null
      ? new Date(Date.now() + t.due_offset_days * 86_400_000).toISOString().slice(0, 10)
      : null;

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO cards
       (title, description, status, tags, due_date, source, created_by,
        telegram_chat_id, telegram_message_id, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
       COALESCE((SELECT MIN(position) - 1 FROM cards WHERE status = $3 AND NOT archived), 0))
     RETURNING id`,
    [
      t.title,
      t.description,
      status,
      t.tags,
      dueDate,
      opts.source,
      userId,
      opts.telegramChatId ?? null,
      opts.telegramMessageId ?? null,
    ],
  );
  const cardId = rows[0]!.id;

  // Default assignee = creator, mirroring the manual create path.
  await pool.query(
    `INSERT INTO card_assignees (card_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [cardId, userId],
  );

  await logActivity(userId, cardId, 'create', { template_id: t.id, template_name: t.name });
  return await loadCard(cardId);
}
