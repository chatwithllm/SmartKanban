import { AI_ENABLED, withChatFallback } from './openai.js';

type Row = { title: string; status: string; tags: string[] };

export async function maybeWeeklySummary(
  done: Row[],
  stale: Row[],
  stuck: Row[],
): Promise<string | null> {
  if (!AI_ENABLED()) return null;
  if (done.length + stale.length + stuck.length === 0) return null;

  const line = (r: Row) => `- ${r.title}${r.tags.length ? ` [${r.tags.join(', ')}]` : ''}`;
  const prompt = `Write a single-paragraph weekly review (3-5 sentences, warm but factual).

Shipped (Done this week):
${done.slice(0, 20).map(line).join('\n') || '(none)'}

Stale (no update in 7+ days):
${stale.slice(0, 15).map(line).join('\n') || '(none)'}

Stuck (In Progress for 3+ days without update):
${stuck.slice(0, 15).map(line).join('\n') || '(none)'}

Rules: no bullet points, no headers, plain text. Mention stuck items explicitly if any. Celebrate wins briefly.`;

  return withChatFallback(async ({ client, model }) => {
    const res = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
    });
    const choiceErr = (res.choices[0] as unknown as { error?: { message?: string } })?.error;
    if (choiceErr) throw new Error(`provider: ${choiceErr.message ?? 'error'}`);
    return res.choices[0]?.message?.content?.trim() ?? null;
  });
}
