import { pool } from '../db.js';
import { embeddingsEnabled, embedText, EMBEDDING_MODEL } from '../ai/embed.js';

async function main() {
  if (!embeddingsEnabled()) {
    console.error('Set KNOWLEDGE_EMBEDDINGS=true and OPENAI_API_KEY to run this backfill.');
    process.exit(1);
  }
  while (true) {
    const r = await pool.query<{ id: string; title: string; body: string }>(
      `SELECT k.id, k.title, k.body FROM knowledge_items k
       LEFT JOIN knowledge_embeddings e ON e.knowledge_id = k.id
       WHERE e.knowledge_id IS NULL AND NOT k.archived
       ORDER BY k.updated_at DESC
       LIMIT 50`,
    );
    if (r.rows.length === 0) break;
    for (const row of r.rows) {
      const vec = await embedText(`${row.title}\n\n${row.body ?? ''}`);
      if (!vec) continue;
      await pool.query(
        `INSERT INTO knowledge_embeddings (knowledge_id, embedding, model)
         VALUES ($1, $2::vector, $3)
         ON CONFLICT (knowledge_id) DO NOTHING`,
        [row.id, JSON.stringify(vec), EMBEDDING_MODEL],
      );
      console.log('embedded', row.id, '-', row.title);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log('done.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
