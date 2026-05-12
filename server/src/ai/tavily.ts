export type TavilyResult = {
  title: string;
  url: string;
  content: string;
  score: number;
};

const ENDPOINT = 'https://api.tavily.com/search';

/**
 * Performs a Tavily basic web search. Returns up to 5 results.
 *
 * On missing API key, HTTP error, network error, or timeout: returns [].
 * Callers must treat empty results as "degraded mode" rather than failure.
 */
export async function searchTavily(query: string, timeoutMs = 8000): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  const q = query.trim();
  if (!q) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: q,
        search_depth: 'basic',
        max_results: 5,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: Array<Partial<TavilyResult>> };
    if (!data.results || !Array.isArray(data.results)) return [];
    return data.results
      .filter(
        (r): r is TavilyResult =>
          typeof r.title === 'string' &&
          typeof r.url === 'string' &&
          typeof r.content === 'string' &&
          typeof r.score === 'number',
      )
      .slice(0, 5);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
