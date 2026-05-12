import { chatPrimary, chatFallback } from './openai.js';

export type Candidate = {
  kind: 'card' | 'knowledge';
  id: string;
  title: string;
  snippet: string;
  contextLine: string;
};

export type RankedMatch = Candidate & {
  confidence?: number;
  why?: string;
};

const MIN_CONFIDENCE = 40;
const MAX_MATCHES = 3;
const TIMEOUT_MS = 4000;

export function buildDedupePrompt(originalText: string, candidates: Candidate[]): string {
  const lines = candidates
    .map((c, i) => `${i + 1}. [${c.kind}] '${c.title}' (${c.contextLine}) — ${c.snippet}`)
    .join('\n');
  return [
    `User wants to capture this message: "${originalText.replace(/\n/g, ' ')}"`,
    '',
    'Existing items (numbered):',
    lines,
    '',
    'Return strict JSON: {"matches":[{"ix":number,"confidence":0-100,"why":string}]}',
    `Only include items with confidence >= ${MIN_CONFIDENCE}. Cap at ${MAX_MATCHES} items.`,
    `"ix" is the number above. "why" is a short reason (under 60 chars).`,
  ].join('\n');
}

export function parseDedupeResponse(raw: string, candidates: Candidate[]): RankedMatch[] {
  let parsed: { matches?: Array<{ ix: number; confidence: number; why: string }> } | null = null;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return candidates.map((c) => ({ ...c }));
  }
  if (!parsed?.matches || !Array.isArray(parsed.matches)) {
    return candidates.map((c) => ({ ...c }));
  }
  const seen = new Set<string>();
  const ranked: RankedMatch[] = [];
  for (const m of parsed.matches) {
    if (typeof m.ix !== 'number' || typeof m.confidence !== 'number') continue;
    if (m.confidence < MIN_CONFIDENCE) continue;
    const cand = candidates[m.ix - 1];
    if (!cand) continue;
    if (seen.has(cand.id)) continue;
    seen.add(cand.id);
    ranked.push({
      ...cand,
      confidence: Math.max(0, Math.min(100, Math.round(m.confidence))),
      why: typeof m.why === 'string' ? m.why.slice(0, 80) : '',
    });
    if (ranked.length >= MAX_MATCHES) break;
  }
  return ranked;
}

export async function rankCandidates(
  originalText: string,
  candidates: Candidate[],
): Promise<RankedMatch[]> {
  if (candidates.length === 0) return [];

  const target = chatPrimary() ?? chatFallback();
  if (!target) {
    return candidates.map((c) => ({ ...c }));
  }

  const prompt = buildDedupePrompt(originalText, candidates);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const completion = await target.client.chat.completions.create(
      {
        model: target.model,
        messages: [
          { role: 'system', content: 'You return only valid JSON. No prose.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      },
      { signal: controller.signal },
    );
    const raw = completion.choices[0]?.message?.content ?? '';
    return parseDedupeResponse(raw, candidates);
  } catch {
    return candidates.map((c) => ({ ...c }));
  } finally {
    clearTimeout(timer);
  }
}
