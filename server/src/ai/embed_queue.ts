import { pool } from '../db.js';
import { embeddingsEnabled, embedText, EMBEDDING_MODEL } from './embed.js';

const queue: string[] = [];
const seen = new Set<string>();
let running = false;

export function enqueueEmbed(id: string): void {
  if (!embeddingsEnabled()) return;
  if (seen.has(id)) return;
  seen.add(id);
  queue.push(id);
  if (!running) drain();
}

async function processOne(id: string): Promise<{ ok: boolean }> {
  const r = await pool.query<{ title: string; body: string }>(
    `SELECT title, body FROM knowledge_items WHERE id = $1 AND NOT archived`,
    [id],
  );
  const row = r.rows[0];
  if (!row) return { ok: false };
  const text = `${row.title}\n\n${row.body ?? ''}`.trim();
  if (!text) return { ok: false };
  let attempt = 0;
  while (attempt < 2) {
    try {
      const vec = await embedText(text);
      if (!vec) return { ok: false };
      await pool.query(
        `INSERT INTO knowledge_embeddings (knowledge_id, embedding, model)
         VALUES ($1, $2::vector, $3)
         ON CONFLICT (knowledge_id) DO UPDATE
           SET embedding = EXCLUDED.embedding,
               model = EXCLUDED.model,
               embedded_at = NOW()`,
        [id, JSON.stringify(vec), EMBEDDING_MODEL],
      );
      return { ok: true };
    } catch (e) {
      attempt++;
      if (attempt >= 2) {
        console.warn('embed failed (giving up):', id, (e as Error).message);
        return { ok: false };
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  return { ok: false };
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const id = queue.shift()!;
      seen.delete(id);
      try {
        await processOne(id);
      } catch (e) {
        console.warn('embed drain error:', e);
      }
    }
  } finally {
    running = false;
  }
}

/**
 * Test hook: synchronously flush a specific id from the queue (if present),
 * bypassing the async drain loop and its 5-second retry delay.
 */
export async function _flushEmbedQueueForTest(id: string): Promise<{ processed: number }> {
  if (!embeddingsEnabled()) return { processed: 0 };
  const idx = queue.indexOf(id);
  if (idx < 0) return { processed: 0 };
  queue.splice(idx, 1);
  seen.delete(id);
  await processOne(id);
  return { processed: 1 };
}
