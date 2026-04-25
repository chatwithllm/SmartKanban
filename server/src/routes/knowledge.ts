import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireUser } from '../auth.js';
import { broadcast } from '../ws.js';
import {
  archiveKnowledge,
  canUserSeeKnowledge,
  createKnowledge,
  KnowledgeValidationError,
  listKnowledge,
  loadKnowledge,
  updateKnowledge,
  type KnowledgeInput,
  type KnowledgePatch,
} from '../knowledge.js';
import { triggerFetch } from '../knowledge_fetch.js';
import { enqueueEmbed } from '../ai/embed_queue.js';

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
}
