import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { requireUser } from '../auth.js';
import { canUserSeeCard } from '../cards.js';

export async function qrRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/api/cards/:id/qr.svg',
    { preHandler: requireUser },
    async (req, reply) => {
      const id = req.params.id;
      if (!(await canUserSeeCard(req.user!.id, id))) {
        return reply.code(404).send({ error: 'not found' });
      }
      // APP_URL is the canonical public URL. Falls back to the request scheme/host
      // for local dev only. Production deployments behind Cloudflare/NPM must set
      // APP_URL because the request host may not match the public hostname.
      const base = process.env.APP_URL || `${req.protocol}://${req.hostname}`;
      const url = `${base}/m/card/${id}`;
      const svg = await QRCode.toString(url, {
        type: 'svg',
        width: 256,
        margin: 1,
      });
      reply
        .header('content-type', 'image/svg+xml')
        .header('cache-control', 'private, max-age=86400')
        .send(svg);
    },
  );
}
