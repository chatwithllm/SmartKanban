import type { Card, CardEvent, KnowledgeItem, KnowledgeVisibility, Template, TemplateVisibility } from './types.ts';

export type BroadcastEvent =
  | { type: 'hello'; user_id: string }
  | { type: 'card.created'; card: Card }
  | { type: 'card.updated'; card: Card }
  | { type: 'card.deleted'; id: string }
  | { type: 'template.created'; template: Template }
  | { type: 'template.updated'; template: Template }
  | { type: 'template.deleted'; id: string; owner_id: string; visibility: TemplateVisibility }
  | { type: 'knowledge.created'; knowledge: KnowledgeItem }
  | { type: 'knowledge.updated'; knowledge: KnowledgeItem }
  | { type: 'knowledge.deleted'; id: string; owner_id: string; visibility: KnowledgeVisibility; shares: string[] }
  | { type: 'knowledge.link.created'; knowledge_id: string; card_id: string }
  | { type: 'knowledge.link.deleted'; knowledge_id: string; card_id: string }
  | { type: 'card.message'; event: CardEvent; card_id: string; card: Card }
  | { type: 'card.ai_response'; event: CardEvent; card_id: string; card: Card };

export function connectWS(
  onEvent: (ev: BroadcastEvent) => void,
  opts: { mirrorToken?: string } = {},
): () => void {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const qs = opts.mirrorToken ? `?mirror=${encodeURIComponent(opts.mirrorToken)}` : '';
  let alive = true;
  let ws: WebSocket | null = null;
  let retry = 500;

  const open = () => {
    if (!alive) return;
    ws = new WebSocket(`${proto}//${location.host}/ws${qs}`);
    ws.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data));
      } catch {}
    };
    ws.onopen = () => {
      retry = 500;
    };
    ws.onclose = () => {
      if (!alive) return;
      setTimeout(open, retry);
      retry = Math.min(retry * 2, 10_000);
    };
    ws.onerror = () => ws?.close();
  };
  open();

  return () => {
    alive = false;
    ws?.close();
  };
}
