import type { Card, CardEvent, CardLink, Insight, KnowledgeItem, KnowledgeVisibility, Template, TemplateVisibility } from './types.ts';

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
  | { type: 'card.ai_response'; event: CardEvent; card_id: string; card: Card }
  | { type: 'insight.queued';  insight: Insight; card_id: string; owner_id: string }
  | { type: 'insight.updated'; insight: Insight; card_id: string; owner_id: string }
  | { type: 'insight.failed';  insight: Insight; card_id: string; owner_id: string }
  | { type: 'card.link.created'; link: CardLink; from_owner_id: string; to_owner_id: string }
  | { type: 'card.link.deleted'; id: string; from_card_id: string; to_card_id: string; from_owner_id: string; to_owner_id: string };

/**
 * WebSocket client with capped exponential backoff + stable-connection gating.
 *
 * Backoff:
 *  - floor 1s, cap 30s, double per failure
 *  - jitter ±50% so multiple tabs don't synchronize
 *  - reset to floor ONLY after a "stable" connection: onopen fired,
 *    at least one server frame received (hello), AND socket stayed open >= 10s.
 *    A flap (open -> immediate close) is treated as a failure and keeps the
 *    backoff growing.
 *
 * Single-socket guard: if a socket already exists with readyState CONNECTING
 * or OPEN, do not open another.
 *
 * Policy/auth close (code 1008): stop reconnecting and surface a hint.
 */
export function connectWS(
  onEvent: (ev: BroadcastEvent) => void,
  opts: { mirrorToken?: string; onAuthClose?: () => void } = {},
): () => void {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const qs = opts.mirrorToken ? `?mirror=${encodeURIComponent(opts.mirrorToken)}` : '';

  const FLOOR_MS = 1_000;
  const CAP_MS = 30_000;
  const STABLE_MS = 10_000;

  let alive = true;
  let ws: WebSocket | null = null;
  let reconnectDelay = FLOOR_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stableTimer: ReturnType<typeof setTimeout> | null = null;
  let receivedFirstFrame = false;

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };
  const clearStableTimer = () => {
    if (stableTimer !== null) {
      clearTimeout(stableTimer);
      stableTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (!alive || reconnectTimer !== null) return;
    const jitter = 0.5 + Math.random() * 0.5;
    const wait = Math.floor(reconnectDelay * jitter);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open();
    }, wait);
    reconnectDelay = Math.min(reconnectDelay * 2, CAP_MS);
    if (typeof console !== 'undefined') {
      console.info(`[ws] reconnect in ${wait}ms (next floor=${reconnectDelay}ms)`);
    }
  };

  const open = () => {
    if (!alive) return;
    // Single-socket guard — don't stack multiple sockets.
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return;
    }
    clearReconnectTimer();
    clearStableTimer();
    receivedFirstFrame = false;

    const socket = new WebSocket(`${proto}//${location.host}/ws${qs}`);
    ws = socket;

    socket.onmessage = (e) => {
      receivedFirstFrame = true;
      try {
        onEvent(JSON.parse(e.data));
      } catch {}
    };

    socket.onopen = () => {
      // DO NOT reset reconnectDelay here — wait for sustained connection.
      // A flap (open -> immediate close before STABLE_MS elapses) must keep
      // backoff growing, not reset it.
      clearReconnectTimer();
      clearStableTimer();
      stableTimer = setTimeout(() => {
        stableTimer = null;
        if (alive && socket === ws && socket.readyState === WebSocket.OPEN && receivedFirstFrame) {
          reconnectDelay = FLOOR_MS;
          if (typeof console !== 'undefined') {
            console.info('[ws] connection stable, backoff reset');
          }
        }
      }, STABLE_MS);
    };

    socket.onclose = (ev) => {
      clearStableTimer();
      if (socket === ws) ws = null;
      if (!alive) return;

      // Policy/auth close: server told us "stop." Don't retry.
      if (ev.code === 1008) {
        if (typeof console !== 'undefined') {
          console.warn('[ws] policy close (1008) — session likely expired; not reconnecting');
        }
        opts.onAuthClose?.();
        return;
      }

      scheduleReconnect();
    };

    socket.onerror = () => {
      // Trigger close; onclose handles the reconnect path.
      try { socket.close(); } catch {}
    };
  };

  open();

  return () => {
    alive = false;
    clearReconnectTimer();
    clearStableTimer();
    if (ws) {
      try { ws.close(); } catch {}
      ws = null;
    }
  };
}
