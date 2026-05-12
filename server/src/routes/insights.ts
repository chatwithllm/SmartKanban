import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import {
  createInsight,
  listInsightsForCard,
  getInsight,
  countPendingByCard,
  countPendingByUser,
  countTodayByUser,
} from '../insights.js';
import { loadCard, canUserSeeCard } from '../cards.js';
import { enqueueBrainstorm } from '../ai/brainstorm_queue.js';
import { AI_ENABLED } from '../ai/openai.js';
import { broadcast } from '../ws.js';

const MAX_PENDING_PER_USER = 5;
const MAX_PENDING_PER_CARD = 1;
const MAX_PER_DAY_PER_USER = 50;

export async function insightsRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>(
    '/api/cards/:id/insights/brainstorm',
    { preHandler: requireUser },
    async (req, reply) => {
      const userId = req.user!.id;
      if (!AI_ENABLED()) return reply.code(503).send({ error: 'AI not configured' });

      const cardId = req.params.id;
      const card = await loadCard(cardId);
      if (!card) return reply.code(404).send({ error: 'card not found' });
      if (!(await canUserSeeCard(userId, cardId))) {
        return reply.code(403).send({ error: 'forbidden' });
      }

      const [pendingUser, pendingCard, today] = await Promise.all([
        countPendingByUser(userId),
        countPendingByCard(cardId),
        countTodayByUser(userId),
      ]);
      if (pendingCard >= MAX_PENDING_PER_CARD) {
        return reply.code(429).send({ error: 'already researching this card' });
      }
      if (pendingUser >= MAX_PENDING_PER_USER) {
        return reply.code(429).send({ error: 'too many pending insights' });
      }
      if (today >= MAX_PER_DAY_PER_USER) {
        return reply.code(429).send({ error: 'daily brainstorm limit reached' });
      }

      const insight = await createInsight(cardId, userId);
      enqueueBrainstorm(insight.id);
      broadcast({ type: 'insight.queued', insight, card_id: cardId, owner_id: card.created_by ?? '' });
      return reply.code(202).send({ id: insight.id, status: insight.status });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/cards/:id/insights',
    { preHandler: requireUser },
    async (req, reply) => {
      const userId = req.user!.id;
      const cardId = req.params.id;
      if (!(await canUserSeeCard(userId, cardId))) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const insights = await listInsightsForCard(cardId, 10);
      return reply.send({ insights });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/insights/:id',
    { preHandler: requireUser },
    async (req, reply) => {
      const userId = req.user!.id;
      const ins = await getInsight(req.params.id);
      if (!ins) return reply.code(404).send({ error: 'not found' });
      if (!(await canUserSeeCard(userId, ins.card_id))) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      return reply.send({ insight: ins });
    },
  );
}
