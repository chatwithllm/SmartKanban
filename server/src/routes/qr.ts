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
      let svg: string;
      try {
        svg = await QRCode.toString(url, {
          type: 'svg',
          width: 256,
          margin: 1,
        });
      } catch (err) {
        req.log.error({ err, url }, 'QRCode.toString failed');
        return reply.code(500).send({ error: 'qr generation failed' });
      }
      // Short cache so a visibility revocation isn't masked by a stale SVG for
      // a full day. The SVG only encodes a URL (no card content), so the risk
      // is limited, but a 5-minute window is plenty for desktop dialog use.
      reply
        .header('content-type', 'image/svg+xml')
        .header('cache-control', 'private, max-age=300')
        .send(svg);
    },
  );
}
