import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { requireUser, requireUserOrMirror } from '../auth.js';
import {
  type Card,
  type Scope,
  type Status,
  canUserSeeCard,
  getCardActivity,
  isStatus,
  listArchivedCards,
  listCards,
  loadCard,
  logActivity,
} from '../cards.js';
import { broadcast } from '../ws.js';

export async function cardRoutes(app: FastifyInstance) {
  // GET /api/cards?scope=personal|inbox|all
  app.get<{ Querystring: { scope?: Scope } }>(
    '/api/cards',
    { preHandler: requireUserOrMirror },
    async (req) => {
      const scope: Scope = req.query.scope ?? 'personal';
      return listCards(req.user!.id, scope);
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
    };
  }>('/api/cards', { preHandler: requireUser }, async (req, reply) => {
    const {
      title,
      description = '',
      status = 'backlog',
      tags = [],
      due_date = null,
      assignees,
      source = 'manual',
    } = req.body;
    if (!title || typeof title !== 'string' || !title.trim()) {
      return reply.code(400).send({ error: 'title required' });
    }
    if (!isStatus(status)) return reply.code(400).send({ error: 'invalid status' });

    const userId = req.user!.id;
    const actualAssignees = assignees ?? [userId]; // default: assign to self

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO cards (title, description, status, tags, due_date, source, created_by, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
         COALESCE((SELECT MIN(position) - 1 FROM cards WHERE status = $3 AND NOT archived), 0))
       RETURNING id`,
      [title.trim(), description, status, tags, due_date, source, userId],
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
    }>;
  }>('/api/cards/:id', { preHandler: requireUser }, async (req, reply) => {
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
    if (body.shares !== undefined) {
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

  // GET /api/cards/:id/activity
  app.get<{ Params: { id: string } }>(
    '/api/cards/:id/activity',
    { preHandler: requireUser },
    async (req, reply) => {
      const { id } = req.params;
      const card = await loadCard(id);
      if (!card) return reply.code(404).send({ error: 'not found' });
      if (!(await canUserSeeCard(req.user!.id, id))) {
        return reply.code(404).send({ error: 'not found' });
      }
      return getCardActivity(id);
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
}
