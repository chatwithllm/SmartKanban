import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import {
  canUserSeeCard,
  getCardEvents,
  getUnreadCounts,
  loadCard,
  markCardEventsRead,
  postCardMessage,
} from '../cards.js';
import { broadcast } from '../ws.js';
import { processCardChatAI } from '../ai/card_chat.js';
import { fanOutNotification } from '../notifications.js';
import { pushToUser } from '../push.js';

export async function chatRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/api/cards/:id/events',
    { preHandler: requireUser },
    async (req, reply) => {
      const { id } = req.params;
      if (!(await canUserSeeCard(req.user!.id, id))) {
        return reply.code(404).send({ error: 'not found' });
      }
      return getCardEvents(id);
    },
  );

  app.post<{
    Params: { id: string };
    Body: { content: string };
  }>(
    '/api/cards/:id/messages',
    { preHandler: requireUser },
    async (req, reply) => {
      const { id } = req.params;
      const { content } = req.body ?? {};

      if (typeof content !== 'string' || !content.trim()) {
        return reply.code(400).send({ error: 'content required' });
      }
      if (content.length > 2000) {
        return reply.code(400).send({ error: 'content too long (max 2000 chars)' });
      }

      const card = await loadCard(id);
      if (!card) return reply.code(404).send({ error: 'not found' });
      if (!(await canUserSeeCard(req.user!.id, id))) {
        return reply.code(404).send({ error: 'not found' });
      }

      const event = await postCardMessage(id, req.user!.id, content.trim());
      broadcast({ type: 'card.message', event, card_id: id, card });

      // Non-blocking: fan out notifications + push
      const preview = content.trim().slice(0, 120);
      const actorName = req.user!.name ?? req.user!.short_name ?? 'Someone';
      fanOutNotification(id, Number(event.id), req.user!.id, actorName, preview)
        .then(async (recipientIds) => {
          const pushPayload = { title: card.title, body: `${actorName}: ${preview}`, cardId: id };
          await Promise.all(recipientIds.map(uid => pushToUser(uid, pushPayload)));
        })
        .catch(err => console.warn('[notifications] fan-out error:', String(err).slice(0, 200)));

      if (/(?:^|\s)@ai(?:\s|$)/i.test(content)) {
        processCardChatAI(id, card, req.user!.id).catch((err) => {
          console.warn('[chat] AI processing failed:', String(err).slice(0, 200));
        });
      }

      return reply.code(201).send(event);
    },
  );

  app.put<{
    Params: { id: string };
    Body: { last_read_id: number };
  }>(
    '/api/cards/:id/events/read',
    { preHandler: requireUser },
    async (req, reply) => {
      const { id } = req.params;
      const { last_read_id } = req.body ?? {};
      if (typeof last_read_id !== 'number') {
        return reply.code(400).send({ error: 'last_read_id required' });
      }
      if (!(await canUserSeeCard(req.user!.id, id))) {
        return reply.code(404).send({ error: 'not found' });
      }
      await markCardEventsRead(id, req.user!.id, last_read_id);
      return reply.code(204).send();
    },
  );

  app.get(
    '/api/messages/unread',
    { preHandler: requireUser },
    async (req) => {
      return getUnreadCounts(req.user!.id);
    },
  );
}
