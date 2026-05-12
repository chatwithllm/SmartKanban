import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import {
  getNotifications,
  markNotificationsRead,
  markAllRead,
} from '../notifications.js';
import {
  saveSubscription,
  deleteSubscription,
  getVapidPublicKey,
} from '../push.js';

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/api/notifications', { preHandler: requireUser }, async (req) => {
    return getNotifications(req.user!.id);
  });

  app.put<{ Body: { ids: number[] } }>(
    '/api/notifications/read',
    { preHandler: requireUser },
    async (req, reply) => {
      const { ids } = req.body ?? {};
      if (!Array.isArray(ids) || ids.some(id => typeof id !== 'number')) {
        return reply.code(400).send({ error: 'ids must be array of numbers' });
      }
      await markNotificationsRead(req.user!.id, ids);
      return reply.code(204).send();
    },
  );

  app.put(
    '/api/notifications/read-all',
    { preHandler: requireUser },
    async (req, reply) => {
      await markAllRead(req.user!.id);
      return reply.code(204).send();
    },
  );

  app.post<{ Body: { endpoint: string; p256dh: string; auth: string } }>(
    '/api/push/subscribe',
    { preHandler: requireUser },
    async (req, reply) => {
      const { endpoint, p256dh, auth } = req.body ?? {};
      if (!endpoint || !p256dh || !auth) {
        return reply.code(400).send({ error: 'endpoint, p256dh, auth required' });
      }
      await saveSubscription(req.user!.id, endpoint, p256dh, auth);
      return reply.code(204).send();
    },
  );

  app.delete<{ Body: { endpoint: string } }>(
    '/api/push/subscribe',
    { preHandler: requireUser },
    async (req, reply) => {
      const { endpoint } = req.body ?? {};
      if (!endpoint) return reply.code(400).send({ error: 'endpoint required' });
      await deleteSubscription(endpoint);
      return reply.code(204).send();
    },
  );

  app.get('/api/push/vapid-public-key', async (_req, reply) => {
    const key = getVapidPublicKey();
    if (!key) return reply.code(404).send({ error: 'VAPID not configured' });
    return { publicKey: key };
  });
}
