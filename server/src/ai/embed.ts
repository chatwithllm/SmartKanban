import OpenAI from 'openai';

export const EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Returns true when embedding is both requested (KNOWLEDGE_EMBEDDINGS=true) and
 * an OpenAI API key is available.  Re-reads the env on every call so that tests
 * can toggle the vars without reloading modules.
 */
export function embeddingsEnabled(): boolean {
  if (process.env.KNOWLEDGE_EMBEDDINGS !== 'true') return false;
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Embed a piece of text using OpenAI text-embedding-3-small.
 * Returns null when embeddings are disabled or the call fails.
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (!embeddingsEnabled()) return null;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const client = new OpenAI({ apiKey: key });
  const trimmed = text.slice(0, 32_000);
  const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input: trimmed });
  return res.data[0]!.embedding as number[];
}
