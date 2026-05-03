import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { requireApiToken, requireUser, requireUserOrApiToken, requireUserOrMirror } from '../auth.js';
import {
  type Card,
  type Scope,
  type Status,
  canUserSeeCard,
  isStatus,
  listArchivedCards,
  listCards,
  loadCard,
  logActivity,
} from '../cards.js';
import { broadcast } from '../ws.js';
import { listKnowledgeForCard } from '../knowledge.js';
import { fanOutNotification } from '../notifications.js';

const ATTACHMENTS_DIR = path.resolve(process.env.ATTACHMENTS_DIR ?? 'data/attachments');

async function rmAttachmentsDir(cardId: string): Promise<void> {
  // Delete the per-card attachments directory if it exists. Errors are ignored
  // (best-effort cleanup; missing directory is fine).
  try {
    await fs.rm(path.join(ATTACHMENTS_DIR, cardId), { recursive: true, force: true });
  } catch {}
}

export async function cardRoutes(app: FastifyInstance) {
  // GET /api/cards?scope=personal|inbox|all
  app.get<{ Querystring: { scope?: Scope; project?: string } }>(
    '/api/cards',
    { preHandler: requireUserOrMirror },
    async (req) => {
      const scope: Scope = req.query.scope ?? 'personal';
      const project = req.query.project?.trim() || undefined;
      return listCards(req.user!.id, scope, project);
    },
  );

  // GET /api/cards/archived
  app.get(
    '/api/cards/archived',
    { preHandler: requireUser },
    async (req) => {
      return listArchivedCards(req.user!.id);
    },
  );

  // GET /api/cards/:id
  app.get<{ Params: { id: string } }>(
    '/api/cards/:id',
    { preHandler: requireUser },
    async (req, reply) => {
      const card = await loadCard(req.params.id);
      if (!card) return reply.code(404).send({ error: 'not found' });
      if (!(await canUserSeeCard(req.user!.id, card.id))) {
        return reply.code(404).send({ error: 'not found' });
      }
      return card;
    },
  );

  app.post<{
    Body: {
      title: string;
      description?: string;
      status?: Status;
      tags?: string[];
      due_date?: string | null;
      assignees?: string[];
      source?: 'manual' | 'telegram' | 'mirror';
      project?: string | null;
    };
  }>('/api/cards', { preHandler: requireUserOrApiToken }, async (req, reply) => {
    const {
      title,
      description = '',
      status = 'backlog',
      tags = [],
      due_date = null,
      assignees,
      source = 'manual',
      project = null,
    } = req.body;
    if (!title || typeof title !== 'string' || !title.trim()) {
      return reply.code(400).send({ error: 'title required' });
    }
    if (!isStatus(status)) return reply.code(400).send({ error: 'invalid status' });

    const userId = req.user!.id;
    const actualAssignees = assignees ?? [userId]; // default: assign to self

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO cards (title, description, status, tags, due_date, source, created_by, project, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
         COALESCE((SELECT MIN(position) - 1 FROM cards WHERE status = $3 AND NOT archived), 0))
       RETURNING id`,
      [title.trim(), description, status, tags, due_date, source, userId, project ? project.trim() : null],
    );
    const cardId = rows[0]!.id;

    if (actualAssignees.length > 0) {
      await pool.query(
        `INSERT INTO card_assignees (card_id, user_id)
         SELECT $1, UNNEST($2::uuid[]) ON CONFLICT DO NOTHING`,
        [cardId, actualAssignees],
      );
    }
    await logActivity(userId, cardId, 'create', { title: title.trim() });
    const card = (await loadCard(cardId))!;
    broadcast({ type: 'card.created', card });
    return reply.code(201).send(card);
  });

  app.patch<{
    Params: { id: string };
    Body: Partial<{
      title: string;
      description: string;
      status: Status;
      tags: string[];
      due_date: string | null;
      position: number;
      assignees: string[];
      shares: string[];
      needs_review: boolean;
      project: string | null;
    }>;
  }>('/api/cards/:id', { preHandler: requireUserOrApiToken }, async (req, reply) => {
    const { id } = req.params;
    const body = req.body;

    const existing = await loadCard(id);
    if (!existing) return reply.code(404).send({ error: 'not found' });
    if (!(await canUserSeeCard(req.user!.id, id))) {
      return reply.code(404).send({ error: 'not found' });
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    const push = (col: string, val: unknown) => {
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    };

    if (body.title !== undefined) push('title', body.title);
    if (body.description !== undefined) push('description', body.description);
    if (body.status !== undefined) {
      if (!isStatus(body.status)) return reply.code(400).send({ error: 'invalid status' });
      push('status', body.status);
    }
    if (body.tags !== undefined) push('tags', body.tags);
    if (body.due_date !== undefined) push('due_date', body.due_date);
    if (body.position !== undefined) push('position', body.position);
    if (body.needs_review !== undefined) push('needs_review', body.needs_review);
    if (body.project !== undefined) {
      push('project', body.project === null ? null : body.project.trim());
    }

    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`);
      values.push(id);
      await pool.query(`UPDATE cards SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
    }

    if (body.assignees !== undefined) {
      await pool.query(`DELETE FROM card_assignees WHERE card_id = $1`, [id]);
      if (body.assignees.length > 0) {
        await pool.query(
          `INSERT INTO card_assignees (card_id, user_id) SELECT $1, UNNEST($2::uuid[]) ON CONFLICT DO NOTHING`,
          [id, body.assignees],
        );
      }
    }
    let newShareRecipients: string[] = [];
    if (body.shares !== undefined) {
      const { rows: prevShares } = await pool.query<{ user_id: string }>(
        `SELECT user_id::text FROM card_shares WHERE card_id = $1`,
        [id],
      );
      const prevSet = new Set(prevShares.map((r) => r.user_id));
      newShareRecipients = body.shares.filter((uid) => !prevSet.has(uid));

      await pool.query(`DELETE FROM card_shares WHERE card_id = $1`, [id]);
      if (body.shares.length > 0) {
        await pool.query(
          `INSERT INTO card_shares (card_id, user_id) SELECT $1, UNNEST($2::uuid[]) ON CONFLICT DO NOTHING`,
          [id, body.shares],
        );
      }
    }

    const updated = (await loadCard(id))!;
    await logActivity(req.user!.id, id, 'update', { changed: Object.keys(body) });

    if (newShareRecipients.length > 0) {
      const actor = req.user!;
      const { rows: evRows } = await pool.query<{ id: number }>(
        `INSERT INTO card_events (card_id, entry_type, actor_id, body)
         VALUES ($1, 'share', $2, $3) RETURNING id`,
        [id, actor.id, JSON.stringify({ shared_with: newShareRecipients })],
      );
      const eventId = evRows[0]!.id;
      const actorName = actor.short_name || actor.name;
      const preview = `${actorName} shared "${updated.title}" with you`;
      for (const uid of newShareRecipients) {
        await pool.query(
          `INSERT INTO notifications (user_id, card_id, event_id, actor_name, preview)
           VALUES ($1, $2, $3, $4, $5)`,
          [uid, id, eventId, actorName, preview],
        );
      }
    }

    broadcast({ type: 'card.updated', card: updated });
    return updated;
  });

  // PATCH /api/cards/:id/restore
  app.patch<{ Params: { id: string } }>(
    '/api/cards/:id/restore',
    { preHandler: requireUser },
    async (req, reply) => {
      const { id } = req.params;
      if (!(await canUserSeeCard(req.user!.id, id))) {
        return reply.code(404).send({ error: 'not found' });
      }
      const { rowCount } = await pool.query(
        `UPDATE cards SET archived = FALSE, updated_at = NOW() WHERE id = $1 AND archived`,
        [id],
      );
      if (rowCount === 0) return reply.code(404).send({ error: 'not found' });
      await logActivity(req.user!.id, id, 'restore');
      const card = (await loadCard(id))!;
      broadcast({ type: 'card.updated', card });
      return card;
    },
  );

  // POST /api/cards/:id/activity — append an activity entry from an api-scope token.
  app.post<{
    Params: { id: string };
    Body: { type: string; body: string; details?: Record<string, unknown> };
  }>(
    '/api/cards/:id/activity',
    { preHandler: requireApiToken },
    async (req, reply) => {
      const { id } = req.params;
      const body = req.body ?? ({} as { type?: string; body?: string; details?: Record<string, unknown> });
      const { type, body: text, details = {} } = body;
      if (typeof type !== 'string' || !type.trim()) {
        return reply.code(400).send({ error: 'type required' });
      }
      if (typeof text !== 'string' || !text.trim()) {
        return reply.code(400).send({ error: 'body required' });
      }
      const card = await loadCard(id);
      if (!card) return reply.code(404).send({ error: 'not found' });
      if (!(await canUserSeeCard(req.user!.id, id))) {
        return reply.code(404).send({ error: 'not found' });
      }
      await logActivity(req.user!.id, id, type.trim(), { ...details, body: text.trim() });
      const updated = (await loadCard(id))!;
      broadcast({ type: 'card.updated', card: updated });
      return reply.code(201).send({ ok: true });
    },
  );

  // GET /api/cards/:id/knowledge
  app.get<{ Params: { id: string } }>(
    '/api/cards/:id/knowledge',
    { preHandler: requireUser },
    async (req, reply) => {
      // Visibility check: user must be able to see the card itself.
      if (!(await canUserSeeCard(req.user!.id, req.params.id))) {
        return reply.code(404).send({ error: 'not found' });
      }
      const items = await listKnowledgeForCard(req.user!.id, req.params.id);
      return reply.send({ items });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/cards/:id',
    { preHandler: requireUser },
    async (req, reply) => {
      if (!(await canUserSeeCard(req.user!.id, req.params.id))) {
        return reply.code(404).send({ error: 'not found' });
      }
      const { rowCount } = await pool.query(
        `UPDATE cards SET archived = TRUE, updated_at = NOW() WHERE id = $1 AND NOT archived`,
        [req.params.id],
      );
      if (rowCount === 0) return reply.code(404).send({ error: 'not found' });
      await logActivity(req.user!.id, req.params.id, 'archive');
      broadcast({ type: 'card.deleted', id: req.params.id });
      return reply.code(204).send();
    },
  );

  // Permanently delete a single archived card. Visibility-checked. Cascades via FKs;
  // attachment directory is removed best-effort.
  app.delete<{ Params: { id: string } }>(
    '/api/cards/:id/permanent',
    { preHandler: requireUser },
    async (req, reply) => {
      const id = req.params.id;
      if (!(await canUserSeeCard(req.user!.id, id))) {
        return reply.code(404).send({ error: 'not found' });
      }
      const { rowCount } = await pool.query(
        `DELETE FROM cards WHERE id = $1 AND archived`,
        [id],
      );
      if (rowCount === 0) return reply.code(404).send({ error: 'not found' });
      await rmAttachmentsDir(id);
      broadcast({ type: 'card.deleted', id });
      return reply.code(204).send();
    },
  );

  // Purge all archived cards visible to the caller. Returns count deleted.
  app.post(
    '/api/cards/archived/purge',
    { preHandler: requireUser },
    async (req) => {
      const userId = req.user!.id;
      const visible = await listArchivedCards(userId);
      if (visible.length === 0) return { deleted: 0 };
      const ids = visible.map((c) => c.id);
      await pool.query(`DELETE FROM cards WHERE id = ANY($1::uuid[])`, [ids]);
      for (const id of ids) {
        await rmAttachmentsDir(id);
        broadcast({ type: 'card.deleted', id });
      }
      return { deleted: ids.length };
    },
  );
}
