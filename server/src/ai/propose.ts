import { withChatFallback } from './openai.js';

export type Proposal = {
  is_actionable: boolean;
  title: string;
  description: string;
  tags: string[];
  reason: string;
};

const SYSTEM = `You help someone turn chat messages into kanban task cards.

Given a message (and optionally a prior proposal + correction), produce a concise card:
- is_actionable: true only if the message expresses a concrete task, idea worth tracking, or reminder. False for greetings, chit-chat, questions to others, acknowledgements.
- title: imperative, one sentence, <60 chars (e.g. "Buy milk", "Book dentist appt")
- description: optional 1-2 sentences of extra detail; empty string if nothing adds value
- tags: up to 3 lowercase single-word tags inferred from content ("groceries", "home", "work"); empty array is fine
- reason: one-line explanation of your classification

Reply with ONLY JSON, no prose.`;

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

export async function proposeFromText(
  original: string,
  priorProposal?: Proposal,
  correction?: string,
): Promise<Proposal | null> {
  const messages: Msg[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Message: ${JSON.stringify(original)}` },
  ];
  if (priorProposal && correction) {
    messages.push({
      role: 'assistant',
      content: JSON.stringify({
        is_actionable: priorProposal.is_actionable,
        title: priorProposal.title,
        description: priorProposal.description,
        tags: priorProposal.tags,
        reason: priorProposal.reason,
      }),
    });
    messages.push({
      role: 'user',
      content: `Correction from user: ${JSON.stringify(correction)}. Apply it and return updated JSON.`,
    });
  }

  return withChatFallback(async ({ client, model }) => {
    const res = await client.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages,
      temperature: 0.2,
    });
    // OpenRouter sometimes returns 200 with a per-choice error (provider rate-limit, etc).
    const choiceErr = (res.choices[0] as unknown as { error?: { message?: string } })?.error;
    if (choiceErr) throw new Error(`provider: ${choiceErr.message ?? 'error'}`);
    const text = res.choices[0]?.message?.content?.trim();
    if (!text) throw new Error('empty response');
    const parsed = JSON.parse(text) as Partial<Proposal>;
    const aiTitle = String(parsed.title ?? '').trim().slice(0, 120);
    // If the AI declares "not actionable" and omits a title, fall back to the
    // original (truncated) so the user still gets a Save-Anyway prompt.
    const fallbackTitle = original.trim().slice(0, 60) || '(empty message)';
    const title = aiTitle || fallbackTitle;
    return {
      is_actionable: !!parsed.is_actionable,
      title,
      description: String(parsed.description ?? '').trim(),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 3)
        : [],
      reason: String(parsed.reason ?? '').trim(),
    };
  });
}
