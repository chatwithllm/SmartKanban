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
import { apiTokenRoutes } from './routes/api_tokens.js';
import { reviewRoutes } from './routes/review.js';
import { telegramRoutes } from './routes/telegram.js';
import { attachmentRoutes } from './routes/attachments.js';
import { attachmentUploadRoutes } from './routes/attachments_upload.js';
import { templateRoutes } from './routes/templates.js';
import { knowledgeRoutes } from './routes/knowledge.js';
import { chatRoutes } from './routes/chat.js';
import { qrRoutes } from './routes/qr.js';
import { wsRoutes } from './ws.js';
import { startTelegramBot } from './telegram/bot.js';
import { pool } from './db.js';

const app = Fastify({ logger: true });

// Translate Postgres invalid_text_representation (22P02 — e.g. malformed UUID
// passed to a uuid column) into 404 instead of letting Fastify return 500.
// Routes that read :id directly into queries can rely on this rather than
// each one validating the param shape.
app.setErrorHandler((err, _req, reply) => {
  const code = (err as { code?: string }).code;
  if (code === '22P02') {
    return reply.code(404).send({ error: 'not found' });
  }
  reply.send(err);
});

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
await app.register(chatRoutes);
await app.register(mirrorRoutes);
await app.register(apiTokenRoutes);
await app.register(reviewRoutes);
await app.register(templateRoutes);
await app.register(knowledgeRoutes);
await app.register(qrRoutes);
await app.register(telegramRoutes);
await app.register(attachmentRoutes, { attachmentsDir });
await app.register(attachmentUploadRoutes);
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

if (process.env.KNOWLEDGE_EMBEDDINGS === 'true') {
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_embeddings (
        knowledge_id UUID PRIMARY KEY REFERENCES knowledge_items(id) ON DELETE CASCADE,
        embedding    vector(1536) NOT NULL,
        model        TEXT NOT NULL,
        embedded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_embed_cos
        ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)`);
    app.log.info('knowledge embeddings: pgvector ready');
  } catch (e) {
    app.log.warn({ err: e }, 'pgvector unavailable; semantic search disabled');
  }
}

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });

// Start Telegram bot in polling mode for local dev; webhook mode in production.
if (process.env.TELEGRAM_BOT_TOKEN) {
  startTelegramBot().catch((err) => app.log.error(err, 'telegram bot error'));
}
