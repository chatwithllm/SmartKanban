import { aiHooks } from './openai.js';
import {
  type AiSuggestion,
  type Card,
  type CardEvent,
  getRecentCardEvents,
  postAiEvent,
  loadCard,
} from '../cards.js';
import { broadcast } from '../ws.js';

const MAX_SUGGESTION_COUNT = 3;

function buildSystemPrompt(card: Card, recentEvents: CardEvent[]): string {
  const assignees = card.assignees.join(', ') || 'none';
  const timeline = recentEvents
    .map((e) => {
      if (e.entry_type === 'system') return `[system] ${e.action}: ${JSON.stringify(e.details)}`;
      if (e.entry_type === 'message') return `[${e.actor_name ?? 'user'}] ${e.content}`;
      return `[ai] ${e.content}`;
    })
    .join('\n');

  return `You are a helpful assistant embedded in a Kanban card thread.

Card details:
- Title: ${card.title}
- Description: ${card.description || '(none)'}
- Status: ${card.status}
- Due date: ${card.due_date ?? '(none)'}
- Assignees: ${assignees}

Recent thread (oldest first):
${timeline || '(no prior messages)'}

Instructions:
1. Reply helpfully to the user's @ai mention.
2. Optionally suggest up to ${MAX_SUGGESTION_COUNT} concrete actions as JSON after your text reply.
3. Format: write your reply, then on a new line: <!-- suggestions: [{"label":"...","action":"update_status|set_due_date|assign_user|create_card","params":{...}}] -->
4. If no suggestions are needed, omit the suggestions block entirely.
5. Valid action types and params:
   - update_status: { "status": "backlog"|"today"|"in_progress"|"done" }
   - set_due_date: { "due_date": "YYYY-MM-DD" }
   - assign_user: { "user_id": "<uuid>" }
   - create_card: { "title": "...", "status": "backlog" }
6. Be concise. Max 3 suggestions.`;
}

function parseSuggestions(raw: string): { text: string; suggestions: AiSuggestion[] | null } {
  const marker = '<!-- suggestions:';
  const idx = raw.indexOf(marker);
  if (idx === -1) return { text: raw.trim(), suggestions: null };

  const text = raw.slice(0, idx).trim();
  const jsonStart = idx + marker.length;
  const jsonEnd = raw.indexOf('-->', jsonStart);
  if (jsonEnd === -1) return { text, suggestions: null };

  try {
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd).trim()) as unknown;
    if (!Array.isArray(parsed)) return { text, suggestions: null };
    const valid: AiSuggestion[] = [];
    for (const s of parsed) {
      if (
        typeof s.label === 'string' &&
        ['update_status', 'set_due_date', 'assign_user', 'create_card'].includes(s.action) &&
        typeof s.params === 'object'
      ) {
        valid.push(s as AiSuggestion);
        if (valid.length >= MAX_SUGGESTION_COUNT) break;
      }
    }
    return { text, suggestions: valid.length ? valid : null };
  } catch {
    return { text, suggestions: null };
  }
}

export async function processCardChatAI(
  cardId: string,
  card: Card,
  _triggerUserId: string,
): Promise<void> {
  const last20 = await getRecentCardEvents(cardId, 20);
  const systemPrompt = buildSystemPrompt(card, last20);

  const rawReply = await aiHooks.withChatFallback(async (target) => {
    const response = await target.client.chat.completions.create({
      model: target.model,
      messages: [{ role: 'system', content: systemPrompt }],
      max_tokens: 600,
    });
    return response.choices[0]?.message?.content ?? null;
  });

  if (!rawReply) {
    const errEvent = await postAiEvent(cardId, "Sorry, I couldn't reach the AI right now.", null);
    const freshCard = await loadCard(cardId);
    if (freshCard) broadcast({ type: 'card.ai_response', event: errEvent, card_id: cardId, card: freshCard });
    return;
  }

  const { text, suggestions } = parseSuggestions(rawReply);
  const aiEvent = await postAiEvent(cardId, text || rawReply.trim(), suggestions);
  const freshCard = await loadCard(cardId);
  if (freshCard) broadcast({ type: 'card.ai_response', event: aiEvent, card_id: cardId, card: freshCard });
}
