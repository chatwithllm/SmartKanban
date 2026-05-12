import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Insight } from '../types.ts';
import type { BroadcastEvent } from '../ws.ts';

const cache = new Map<string, Insight[]>();
const listeners = new Map<string, Set<(v: Insight[]) => void>>();

function notify(cardId: string): void {
  const subs = listeners.get(cardId);
  if (!subs) return;
  const items = cache.get(cardId) ?? [];
  for (const s of subs) s(items);
}

export function applyInsightEvent(ev: BroadcastEvent): void {
  if (
    ev.type !== 'insight.queued' &&
    ev.type !== 'insight.updated' &&
    ev.type !== 'insight.failed'
  ) {
    return;
  }
  const cardId = ev.card_id;
  const next = ev.insight;
  const list = cache.get(cardId) ?? [];
  const i = list.findIndex((x) => x.id === next.id);
  let updated: Insight[];
  if (i >= 0) {
    updated = [...list];
    updated[i] = next;
  } else {
    updated = [next, ...list].slice(0, 10);
  }
  cache.set(cardId, updated);
  notify(cardId);
}

export function getCachedLatest(cardId: string): Insight | undefined {
  return cache.get(cardId)?.[0];
}

export function useInsights(cardId: string | null): {
  insights: Insight[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [insights, setInsights] = useState<Insight[]>(() => (cardId ? cache.get(cardId) ?? [] : []));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cardId) {
      setInsights([]);
      return;
    }
    let cancelled = false;
    const subs = listeners.get(cardId) ?? new Set<(v: Insight[]) => void>();
    const handler = (v: Insight[]) => { if (!cancelled) setInsights(v); };
    subs.add(handler);
    listeners.set(cardId, subs);

    setInsights(cache.get(cardId) ?? []);
    if (!cache.has(cardId)) {
      setLoading(true);
      api.listInsights(cardId)
        .then((r) => {
          if (cancelled) return;
          cache.set(cardId, r.insights);
          notify(cardId);
        })
        .catch(() => { /* leave cache empty */ })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => {
      cancelled = true;
      subs.delete(handler);
      if (subs.size === 0) listeners.delete(cardId);
    };
  }, [cardId]);

  async function refresh(): Promise<void> {
    if (!cardId) return;
    setLoading(true);
    try {
      const r = await api.listInsights(cardId);
      cache.set(cardId, r.insights);
      notify(cardId);
    } finally {
      setLoading(false);
    }
  }

  return { insights, loading, refresh };
}
