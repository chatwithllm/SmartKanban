import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireUser } from '../auth.js';
import { broadcast } from '../ws.js';
import {
  createTemplate,
  deleteTemplate,
  instantiateTemplate,
  listTemplates,
  loadTemplate,
  canUserSeeTemplate,
  updateTemplate,
  TemplateValidationError,
  type TemplateInput,
  type TemplatePatch,
} from '../templates.js';
import type { Status } from '../cards.js';

function handleValidation(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof TemplateValidationError) {
    if (err.field === 'owner') {
      reply.code(403).send({ error: 'forbidden' });
    } else {
      reply.code(400).send({ error: err.message, field: err.field });
    }
    return true;
  }
  // Unique-violation surface
  if (err && typeof err === 'object' && (err as { code?: string }).code === '23505') {
    reply.code(409).send({ error: 'Template name already exists' });
    return true;
  }
  return false;
}

export async function templateRoutes(app: FastifyInstance) {
  // GET /api/templates
  app.get('/api/templates', { preHandler: requireUser }, async (req) => {
    return listTemplates(req.user!.id);
  });

  // GET /api/templates/:id
  app.get<{ Params: { id: string } }>(
    '/api/templates/:id',
    { preHandler: requireUser },
    async (req, reply) => {
      const t = await loadTemplate(req.params.id);
      if (!t || !canUserSeeTemplate(req.user!.id, t)) {
        return reply.code(404).send({ error: 'not found' });
      }
      return t;
    },
  );

  // POST /api/templates
  app.post<{ Body: TemplateInput }>(
    '/api/templates',
    { preHandler: requireUser },
    async (req, reply) => {
      try {
        const t = await createTemplate(req.user!.id, req.body);
        broadcast({ type: 'template.created', template: t });
        return reply.code(201).send(t);
      } catch (err) {
        if (handleValidation(reply, err)) return;
        throw err;
      }
    },
  );

  // PATCH /api/templates/:id
  app.patch<{ Params: { id: string }; Body: TemplatePatch }>(
    '/api/templates/:id',
    { preHandler: requireUser },
    async (req, reply) => {
      try {
        const existing = await loadTemplate(req.params.id);
        if (!existing || !canUserSeeTemplate(req.user!.id, existing)) {
          return reply.code(404).send({ error: 'not found' });
        }
        const t = await updateTemplate(req.user!.id, req.params.id, req.body);
        if (!t) return reply.code(404).send({ error: 'not found' });
        broadcast({ type: 'template.updated', template: t });
        return t;
      } catch (err) {
        if (handleValidation(reply, err)) return;
        throw err;
      }
    },
  );

  // DELETE /api/templates/:id
  app.delete<{ Params: { id: string } }>(
    '/api/templates/:id',
    { preHandler: requireUser },
    async (req, reply) => {
      const existing = await loadTemplate(req.params.id);
      if (!existing || !canUserSeeTemplate(req.user!.id, existing)) {
        return reply.code(404).send({ error: 'not found' });
      }
      const ok = await deleteTemplate(req.user!.id, req.params.id);
      if (!ok) return reply.code(403).send({ error: 'forbidden' });
      broadcast({ type: 'template.deleted', id: req.params.id, owner_id: existing.owner_id, visibility: existing.visibility });
      return reply.code(204).send();
    },
  );

  // POST /api/templates/:id/instantiate
  app.post<{ Params: { id: string }; Body: { status_override?: Status } }>(
    '/api/templates/:id/instantiate',
    { preHandler: requireUser },
    async (req, reply) => {
      const card = await instantiateTemplate(req.user!.id, req.params.id, {
        source: 'manual',
        statusOverride: req.body?.status_override,
      });
      if (!card) return reply.code(404).send({ error: 'not found' });
      broadcast({ type: 'card.created', card });
      return reply.code(201).send(card);
    },
  );
}
