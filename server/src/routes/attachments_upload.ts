import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { pool } from '../db.js';
import { requireUser } from '../auth.js';
import { canUserSeeCard, isStatus, loadCard, logActivity, type Status } from '../cards.js';
import { broadcast } from '../ws.js';
import { AI_ENABLED } from '../ai/openai.js';
import { summarizeImage } from '../ai/vision.js';

function getAttachmentsDir(): string {
  return path.resolve(process.env.ATTACHMENTS_DIR ?? 'data/attachments');
}
const ATTACHMENT_MAX_BYTES = Number(process.env.ATTACHMENT_MAX_BYTES ?? 5_000_000);

const IMAGE_MIME_ALLOWLIST = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

class HttpError extends Error {
  constructor(public status: number, public body: Record<string, unknown>) {
    super(typeof body.error === 'string' ? body.error : 'http error');
  }
}

async function readImagePart(req: FastifyRequest): Promise<{
  buffer: Buffer;
  mime: string;
  ext: string;
  status?: string;
}> {
  // We accept exactly one image field named "file". Allow an optional `status`
  // text field for the from-image endpoint.
  let part: MultipartFile | null = null;
  let status: string | undefined;
  for await (const p of req.parts()) {
    if (p.type === 'file' && p.fieldname === 'file' && !part) {
      part = p;
      break; // stream consumption stops at the first file; trailing fields would block.
    }
    if (p.type === 'field' && p.fieldname === 'status') {
      status = String((p as unknown as { value: string }).value);
    }
  }
  if (!part) throw new HttpError(400, { error: 'file required' });
  if (!IMAGE_MIME_ALLOWLIST.has(part.mimetype)) {
    // Drain the stream to free memory.
    part.file.resume();
    throw new HttpError(415, {
      error: 'unsupported media type',
      allowed: Array.from(IMAGE_MIME_ALLOWLIST),
    });
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of part.file) {
    total += chunk.length;
    if (total > ATTACHMENT_MAX_BYTES) {
      throw new HttpError(413, { error: 'file too large', max_bytes: ATTACHMENT_MAX_BYTES });
    }
    chunks.push(chunk);
  }
  return {
    buffer: Buffer.concat(chunks),
    mime: part.mimetype,
    ext: MIME_TO_EXT[part.mimetype] ?? '.bin',
    status,
  };
}

async function persistImage(cardId: string, ext: string, buffer: Buffer): Promise<string> {
  // storage_path is relative to ATTACHMENTS_DIR so the attachment routes can serve it.
  const dir = path.join(getAttachmentsDir(), cardId);
  await fs.mkdir(dir, { recursive: true });
  const fileId = crypto.randomUUID();
  const filename = `${fileId}${ext}`;
  await fs.writeFile(path.join(dir, filename), buffer);
  return path.posix.join(cardId, filename);
}

function handleHttpError(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof HttpError) {
    reply.code(err.status).send(err.body);
    return true;
  }
  return false;
}

export async function attachmentUploadRoutes(app: FastifyInstance) {
  // POST /api/cards/:id/attachments — attach an image to an existing card.
  app.post<{ Params: { id: string } }>(
    '/api/cards/:id/attachments',
    { preHandler: requireUser },
    async (req, reply) => {
      try {
        if (!(await canUserSeeCard(req.user!.id, req.params.id))) {
          return reply.code(404).send({ error: 'not found' });
        }
        const { buffer, mime, ext } = await readImagePart(req);
        const relPath = await persistImage(req.params.id, ext, buffer);
        await pool.query(
          `INSERT INTO card_attachments (card_id, kind, storage_path, original_filename)
           VALUES ($1, 'image', $2, NULL)`,
          [req.params.id, relPath],
        );
        await logActivity(req.user!.id, req.params.id, 'attach', { kind: 'image', mime });
        const card = await loadCard(req.params.id);
        if (!card) return reply.code(404).send({ error: 'not found' });
        broadcast({ type: 'card.updated', card });
        return reply.code(201).send(card);
      } catch (err) {
        if (handleHttpError(reply, err)) return;
        throw err;
      }
    },
  );

  // POST /api/cards/from-image — create a new card from a pasted image.
  // (Implementation arrives in Task 2.)
}
