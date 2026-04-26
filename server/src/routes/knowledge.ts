import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireUser } from '../auth.js';
import { broadcast } from '../ws.js';
import {
  archiveKnowledge,
  canUserSeeKnowledge,
  createFromCard,
  createKnowledge,
  KnowledgeValidationError,
  linkCard,
  listKnowledge,
  listKnowledgeForCard,
  loadKnowledge,
  unlinkCard,
  updateKnowledge,
  type KnowledgeInput,
  type KnowledgePatch,
} from '../knowledge.js';
import { triggerFetch } from '../knowledge_fetch.js';
import { enqueueEmbed } from '../ai/embed_queue.js';
import { pool } from '../db.js';
import { embedText, embeddingsEnabled } from '../ai/embed.js';

function handleValidation(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof KnowledgeValidationError) {
    if (err.field === 'owner') {
      reply.code(403).send({ error: 'forbidden' });
    } else {
      reply.code(400).send({ error: err.message, field: err.field });
    }
    return true;
  }
  return false;
}

type ListQuery = {
  scope?: 'mine' | 'inbox' | 'all';
  q?: string;
  tag?: string;
  limit?: string;
  cursor?: string;
};

export async function knowledgeRoutes(app: FastifyInstance) {
  // GET /api/knowledge
  app.get<{ Querystring: ListQuery }>(
    '/api/knowledge',
    { preHandler: requireUser },
    async (req, reply) => {
      const q = req.query;
      const scope: 'mine' | 'inbox' | 'all' =
        q.scope === 'mine' || q.scope === 'inbox' ? q.scope : 'all';
      const limit = q.limit ? Math.min(Math.max(Number(q.limit), 1), 200) : 50;
      let cursor: { updated_at: string; id: string } | undefined;
      if (q.cursor) {
        try {
          const decoded = JSON.parse(Buffer.from(q.cursor, 'base64url').toString('utf8'));
          cursor = { updated_at: String(decoded.u), id: String(decoded.i) };
        } catch { /* ignore malformed cursor */ }
      }
      const items = await listKnowledge(req.user!.id, {
        scope,
        q: q.q || undefined,
        tag: q.tag || undefined,
        limit,
        cursor,
      });
      const next_cursor =
        items.length === limit
          ? Buffer.from(
              JSON.stringify({
                u: items[items.length - 1]!.updated_at,
                i: items[items.length - 1]!.id,
              }),
            ).toString('base64url')
          : null;
      return reply.send({ items, next_cursor });
    },
  );

  // GET /api/knowledge/:id
  app.get<{ Params: { id: string } }>(
    '/api/knowledge/:id',
    { preHandler: requireUser },
    async (req, reply) => {
      const k = await loadKnowledge(req.params.id);
      if (!k || k.archived || !(await canUserSeeKnowledge(req.user!.id, k))) {
        return reply.code(404).send({ error: 'not found' });
      }
      return reply.send(k);
    },
  );

  // POST /api/knowledge
  app.post<{ Body: KnowledgeInput }>(
    '/api/knowledge',
    { preHandler: requireUser },
    async (req, reply) => {
      try {
        const k = await createKnowledge(req.user!.id, req.body);
        broadcast({ type: 'knowledge.created', knowledge: k });
        if (k.fetch_status === 'pending') triggerFetch(k.id);
        enqueueEmbed(k.id);
        return reply.send(k);
      } catch (err) {
        if (handleValidation(reply, err)) return;
        throw err;
      }
    },
  );

  // PATCH /api/knowledge/:id
  app.patch<{ Params: { id: string }; Body: KnowledgePatch }>(
    '/api/knowledge/:id',
    { preHandler: requireUser },
    async (req, reply) => {
      try {
        const existing = await loadKnowledge(req.params.id);
        if (!existing || existing.archived || !(await canUserSeeKnowledge(req.user!.id, existing))) {
          return reply.code(404).send({ error: 'not found' });
        }
        const k = await updateKnowledge(req.user!.id, req.params.id, req.body);
        if (!k) return reply.code(404).send({ error: 'not found' });
        broadcast({ type: 'knowledge.updated', knowledge: k });
        enqueueEmbed(k.id);
        return reply.send(k);
      } catch (err) {
        if (handleValidation(reply, err)) return;
        throw err;
      }
    },
  );

  // DELETE /api/knowledge/:id (soft archive)
  app.delete<{ Params: { id: string } }>(
    '/api/knowledge/:id',
    { preHandler: requireUser },
    async (req, reply) => {
      const existing = await loadKnowledge(req.params.id);
      if (!existing || existing.archived) return reply.code(404).send({ error: 'not found' });
      if (existing.owner_id !== req.user!.id) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const ok = await archiveKnowledge(req.user!.id, req.params.id);
      if (!ok) return reply.code(404).send({ error: 'not found' });
      broadcast({
        type: 'knowledge.deleted',
        id: req.params.id,
        owner_id: existing.owner_id,
        visibility: existing.visibility,
        shares: existing.shares ?? [],
      });
      return reply.code(204).send();
    },
  );

  // POST /api/knowledge/:id/refetch
  app.post<{ Params: { id: string } }>(
    '/api/knowledge/:id/refetch',
    { preHandler: requireUser },
    async (req, reply) => {
      const existing = await loadKnowledge(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'not found' });
      if (existing.owner_id !== req.user!.id) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      if (!existing.url) return reply.code(400).send({ error: 'item has no url' });
      triggerFetch(existing.id);
      return reply.send({ queued: true });
    },
  );

  // POST /api/knowledge/:id/links { card_id }
  app.post<{ Params: { id: string }; Body: { card_id: string } }>(
    '/api/knowledge/:id/links',
    { preHandler: requireUser },
    async (req, reply) => {
      try {
        await linkCard(req.user!.id, req.params.id, req.body.card_id);
        broadcast({
          type: 'knowledge.link.created',
          knowledge_id: req.params.id,
          card_id: req.body.card_id,
        });
        return reply.code(204).send();
      } catch (err) {
        if (err instanceof KnowledgeValidationError) {
          if (err.message === 'forbidden') return reply.code(403).send({ error: err.message });
          if (err.message === 'not found') return reply.code(404).send({ error: err.message });
          return reply.code(400).send({ error: err.message, field: err.field });
        }
        throw err;
      }
    },
  );

  // DELETE /api/knowledge/:id/links/:card_id
  app.delete<{ Params: { id: string; card_id: string } }>(
    '/api/knowledge/:id/links/:card_id',
    { preHandler: requireUser },
    async (req, reply) => {
      await unlinkCard(req.user!.id, req.params.id, req.params.card_id);
      broadcast({
        type: 'knowledge.link.deleted',
        knowledge_id: req.params.id,
        card_id: req.params.card_id,
      });
      return reply.code(204).send();
    },
  );

  // POST /api/knowledge/from-card/:card_id
  app.post<{ Params: { card_id: string } }>(
    '/api/knowledge/from-card/:card_id',
    { preHandler: requireUser },
    async (req, reply) => {
      const k = await createFromCard(req.user!.id, req.params.card_id);
      if (!k) return reply.code(404).send({ error: 'card not found or not visible' });
      broadcast({ type: 'knowledge.created', knowledge: k });
      broadcast({
        type: 'knowledge.link.created',
        knowledge_id: k.id,
        card_id: req.params.card_id,
      });
      if (k.fetch_status === 'pending') triggerFetch(k.id);
      return reply.send(k);
    },
  );

  // POST /api/knowledge/search/semantic
  app.post<{
    Body: { q: string; limit?: number; scope?: 'mine' | 'inbox' | 'all' };
  }>(
    '/api/knowledge/search/semantic',
    { preHandler: requireUser },
    async (req, reply) => {
      if (!embeddingsEnabled()) {
        return reply.code(501).send({ error: 'semantic search disabled' });
      }
      const { q, limit = 10, scope = 'all' } = req.body ?? ({} as any);
      if (!q || typeof q !== 'string') {
        return reply.code(400).send({ error: 'q required' });
      }
      const vec = await embedText(q);
      if (!vec) return reply.code(501).send({ error: 'embed failed' });

      const params: unknown[] = [JSON.stringify(vec), req.user!.id];
      const where: string[] = ['NOT k.archived'];
      where.push(`(
        k.owner_id = $2
        OR k.visibility = 'inbox'
        OR (k.visibility = 'shared'
            AND EXISTS (SELECT 1 FROM knowledge_shares ks
                        WHERE ks.knowledge_id = k.id AND ks.user_id = $2))
      )`);
      if (scope === 'mine') where.push(`k.owner_id = $2`);
      if (scope === 'inbox') where.push(`k.visibility = 'inbox'`);
      params.push(Math.min(Math.max(Number(limit), 1), 20));

      const sql = `
        SELECT k.*, (e.embedding <=> $1::vector) AS dist
        FROM knowledge_items k
        JOIN knowledge_embeddings e ON e.knowledge_id = k.id
        WHERE ${where.join(' AND ')}
        ORDER BY dist ASC
        LIMIT $${params.length}`;
      const r = await pool.query(sql, params);
      const items = r.rows.map((row: { dist: number; [k: string]: unknown }) => ({
        ...row,
        score: 1 - row.dist,
      }));
      return reply.send({ items });
    },
  );
}
