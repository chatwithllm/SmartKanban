import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import path from 'node:path';
import fs from 'node:fs';
import { cardRoutes } from './routes/cards.js';
import { authRoutes } from './routes/auth.js';
import { mirrorRoutes } from './routes/mirror.js';
import { reviewRoutes } from './routes/review.js';
import { telegramRoutes } from './routes/telegram.js';
import { attachmentRoutes } from './routes/attachments.js';
import { templateRoutes } from './routes/templates.js';
import { wsRoutes } from './ws.js';
import { startTelegramBot } from './telegram/bot.js';

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  credentials: true,
});
await app.register(cookie, { secret: process.env.COOKIE_SECRET ?? 'dev-cookie-secret-change-me' });
await app.register(multipart);
await app.register(websocket);

const attachmentsDir = path.resolve(process.env.ATTACHMENTS_DIR ?? 'data/attachments');
fs.mkdirSync(attachmentsDir, { recursive: true });

await app.register(authRoutes);
await app.register(cardRoutes);
await app.register(mirrorRoutes);
await app.register(reviewRoutes);
await app.register(templateRoutes);
await app.register(telegramRoutes);
await app.register(attachmentRoutes, { attachmentsDir });
await app.register(wsRoutes);

// Serve frontend build if present (production mode). SPA fallback for /my-day etc.
const webDist = path.resolve('../web/dist');
if (fs.existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, prefix: '/' });
  app.setNotFoundHandler((req, reply) => {
    const url = req.raw.url ?? '';
    if (
      req.method === 'GET' &&
      !url.startsWith('/api') &&
      !url.startsWith('/ws') &&
      !url.startsWith('/telegram') &&
      !url.startsWith('/attachments')
    ) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not found' });
  });
}

app.get('/health', async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });

// Start Telegram bot in polling mode for local dev; webhook mode in production.
if (process.env.TELEGRAM_BOT_TOKEN) {
  startTelegramBot().catch((err) => app.log.error(err, 'telegram bot error'));
}
