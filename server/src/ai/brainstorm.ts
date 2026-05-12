import { chatPrimary, chatFallback } from './openai.js';
import { searchTavily, type TavilyResult } from './tavily.js';
import { searchCardsFts, loadCard } from '../cards.js';
import { searchKnowledgeFts } from '../knowledge.js';
import { getInsight, markOk, markFailed, type InsightBody } from '../insights.js';
import { broadcast } from '../ws.js';
import { sendBrainstormNudge } from '../telegram/bot.js';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'on', 'in', 'and', 'or', 'to', 'for', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'this', 'that', 'these', 'those',
  'it', 'its', 'as', 'at', 'by', 'from', 'we', 'i', 'you', 'they', 'he', 'she',
]);

export type LocalContext = {
  cards: Array<{ id: string; title: string; snippet: string }>;
  knowledge: Array<{ id: string; title: string; snippet: string }>;
};

export type WebContext = {
  results: TavilyResult[];
};

export type BrainstormParsed = {
  summary: string;
  body: InsightBody;
};

export function extractKeyTerms(text: string, tags: string[]): string[] {
  const fromText = (text.match(/\b[A-Z][A-Za-z0-9_-]{1,}\b/g) ?? []).filter(
    (w) => !STOPWORDS.has(w.toLowerCase()) && w.length > 1,
  );
  const all = [...fromText, ...tags];
  return Array.from(new Set(all)).slice(0, 8);
}

export function buildBrainstormPrompt(
  card: { title: string; description: string; tags: string[] },
  local: LocalContext,
  web: WebContext,
): string {
  const localLines = [
    ...local.cards.map((c, i) => `  C${i + 1}. [card] '${c.title}' — ${c.snippet}`),
    ...local.knowledge.map((k, i) => `  K${i + 1}. [knowledge] '${k.title}' — ${k.snippet}`),
  ].join('\n') || '  (none)';
  const webLines = web.results
    .map((r, i) => `  W${i + 1}. '${r.title}' (${r.url}) — ${r.content.slice(0, 200)}`)
    .join('\n') || '  (none — web search unavailable or empty)';

  return [
    'You are a research assistant for a personal kanban.',
    '',
    'User card:',
    `  Title: ${card.title}`,
    `  Description: ${card.description || '(empty)'}`,
    `  Tags: ${card.tags.join(', ') || '(none)'}`,
    '',
    'Related items the user already has:',
    localLines,
    '',
    'Fresh web search results:',
    webLines,
    '',
    'Write a concise structured response. Output strict JSON with these keys:',
    '  summary       — 2-3 sentences overall',
    '  related_items — up to 8 items from the local list above, with reason ({kind,id,title,why})',
    '  web_findings  — up to 3 items from web list ({title,url,why})',
    '  next_steps    — up to 4 short imperative steps for the user',
    '',
    'For related_items, the id field must match exactly one of the local ids:',
    `    cards: ${local.cards.map((c) => c.id).join(', ') || 'none'}`,
    `    knowledge: ${local.knowledge.map((k) => k.id).join(', ') || 'none'}`,
    'Skip ids you do not recognize.',
  ].join('\n');
}

export function parseBrainstormResponse(raw: string): BrainstormParsed {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const obj = JSON.parse(cleaned) as Partial<{
    summary: string;
    related_items: Array<{ kind: string; id: string; title: string; why: string }>;
    web_findings: Array<{ title: string; url: string; why: string }>;
    next_steps: string[];
  }>;

  const summary = typeof obj.summary === 'string' ? obj.summary.slice(0, 600) : '';

  const related_items = (obj.related_items ?? [])
    .filter(
      (r) =>
        (r.kind === 'card' || r.kind === 'knowledge') &&
        typeof r.id === 'string' &&
        typeof r.title === 'string' &&
        typeof r.why === 'string',
    )
    .slice(0, 8)
    .map((r) => ({ kind: r.kind as 'card' | 'knowledge', id: r.id, title: r.title.slice(0, 200), why: r.why.slice(0, 200) }));

  const web_findings = (obj.web_findings ?? [])
    .filter(
      (w) =>
        typeof w.title === 'string' &&
        typeof w.url === 'string' &&
        typeof w.why === 'string' &&
        /^https?:\/\//.test(w.url),
    )
    .slice(0, 3)
    .map((w) => ({ title: w.title.slice(0, 200), url: w.url, why: w.why.slice(0, 200) }));

  const next_steps = (obj.next_steps ?? [])
    .filter((s) => typeof s === 'string')
    .slice(0, 4)
    .map((s) => s.slice(0, 240));

  return {
    summary,
    body: { related_items, web_findings, next_steps },
  };
}

/**
 * Runs the full pipeline for a given insight id.
 * Reads the card snapshot, builds local + web context, calls LLM, persists.
 * Caller (the queue) catches errors and calls failBrainstorm.
 */
export async function runBrainstorm(insightId: string): Promise<void> {
  const insight = await getInsight(insightId);
  if (!insight) throw new Error('insight not found');

  const card = await loadCard(insight.card_id);
  if (!card) throw new Error('card not found');

  const query = (card.title + ' ' + (card.description ?? '')).trim();
  const keyTerms = extractKeyTerms(card.title + ' ' + (card.description ?? ''), card.tags);
  const ftsQuery = keyTerms.join(' ') || card.title;

  const [cardHits, kHits, tavilyHits] = await Promise.all([
    searchCardsFts(insight.requested_by, ftsQuery, 5),
    searchKnowledgeFts(insight.requested_by, ftsQuery, 3),
    searchTavily(query),
  ]);

  const local: LocalContext = {
    cards: cardHits
      .filter((c) => c.id !== card.id)
      .map((c) => ({ id: c.id, title: c.title, snippet: (c.description || '').slice(0, 160) })),
    knowledge: kHits.map((k) => ({ id: k.id, title: k.title, snippet: k.snippet })),
  };
  const web: WebContext = { results: tavilyHits };
  const degraded = web.results.length === 0;

  const target = chatPrimary() ?? chatFallback();
  if (!target) {
    throw new Error('no AI configured');
  }
  const prompt = buildBrainstormPrompt(
    { title: card.title, description: card.description ?? '', tags: card.tags },
    local,
    web,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let parsed: BrainstormParsed;
  try {
    const completion = await target.client.chat.completions.create(
      {
        model: target.model,
        messages: [
          { role: 'system', content: 'You return only valid JSON. No prose outside the JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      },
      { signal: controller.signal },
    );
    const raw = completion.choices[0]?.message?.content ?? '';
    parsed = parseBrainstormResponse(raw);
  } finally {
    clearTimeout(timer);
  }

  await markOk(insightId, parsed.summary, parsed.body, degraded);

  const final = await getInsight(insightId);
  if (final) {
    broadcast({ type: 'insight.updated', insight: final, card_id: insight.card_id, owner_id: card.created_by ?? '' });
    await sendBrainstormNudge(insight.requested_by, card.title, 'ok');
  }
}

export async function failBrainstorm(insightId: string, error: string): Promise<void> {
  await markFailed(insightId, error);
  const final = await getInsight(insightId);
  if (final) {
    const card = await loadCard(final.card_id);
    broadcast({ type: 'insight.failed', insight: final, card_id: final.card_id, owner_id: card?.created_by ?? '' });
    await sendBrainstormNudge(final.requested_by, card?.title ?? 'card', 'failed', error);
  }
}
