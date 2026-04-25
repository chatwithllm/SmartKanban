import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { KnowledgeItem } from '../types.ts';
import type { BroadcastEvent } from '../ws.ts';

type Scope = 'mine' | 'inbox' | 'all';
type Filter = { scope: Scope; q: string; tag: string | null };

let cache: KnowledgeItem[] | null = null;
let cacheKey: string | null = null;
let inFlight: Promise<KnowledgeItem[]> | null = null;
const subscribers = new Set<(items: KnowledgeItem[]) => void>();
const errorSubs = new Set<(e: string | null) => void>();

function keyOf(f: Filter): string {
  return `${f.scope}|${f.q}|${f.tag ?? ''}`;
}

function publish(next: KnowledgeItem[]) {
  cache = next;
  for (const fn of subscribers) fn(next);
}

function publishError(e: string | null) {
  for (const fn of errorSubs) fn(e);
}

async function loadOnce(filter: Filter): Promise<KnowledgeItem[]> {
  const key = keyOf(filter);
  if (cacheKey !== key) {
    cache = null;
    cacheKey = key;
    inFlight = null;
  }
  if (!inFlight) {
    inFlight = api
      .listKnowledge({
        scope: filter.scope,
        q: filter.q || undefined,
        tag: filter.tag ?? undefined,
      })
      .then((r) => r.items)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

// Visibility check used to decide whether a WS event affects the current view.
function visibleTo(item: KnowledgeItem, meId: string): boolean {
  if (item.owner_id === meId) return true;
  if (item.visibility === 'inbox') return true;
  if (item.visibility === 'shared' && (item.shares ?? []).includes(meId)) return true;
  return false;
}

export function applyKnowledgeEvent(ev: BroadcastEvent, meId: string): void {
  if (cache === null) return;
  if (ev.type === 'knowledge.created' || ev.type === 'knowledge.updated') {
    if (!visibleTo(ev.knowledge, meId)) {
      publish(cache.filter((k) => k.id !== ev.knowledge.id));
      return;
    }
    const exists = cache.some((k) => k.id === ev.knowledge.id);
    publish(
      exists
        ? cache.map((k) => (k.id === ev.knowledge.id ? ev.knowledge : k))
        : [ev.knowledge, ...cache],
    );
  } else if (ev.type === 'knowledge.deleted') {
    publish(cache.filter((k) => k.id !== ev.id));
  }
  // link.created / link.deleted — no-op for the list view; detail view re-queries.
}

export function useKnowledge(filter: Filter): {
  items: KnowledgeItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [items, setItems] = useState<KnowledgeItem[]>(cache ?? []);
  const [loading, setLoading] = useState(cache === null || cacheKey !== keyOf(filter));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sub = (next: KnowledgeItem[]) => setItems(next);
    const errSub = (e: string | null) => setError(e);
    subscribers.add(sub);
    errorSubs.add(errSub);
    setLoading(true);
    loadOnce(filter)
      .then((list) => {
        publish(list);
        publishError(null);
        setLoading(false);
      })
      .catch((e: Error) => {
        publishError(e.message);
        setLoading(false);
      });
    return () => {
      subscribers.delete(sub);
      errorSubs.delete(errSub);
    };
    // Refetch whenever filter changes:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.scope, filter.q, filter.tag]);

  const refresh = async () => {
    setLoading(true);
    publishError(null);
    try {
      cache = null; // force refetch
      const list = await loadOnce(filter);
      publish(list);
    } catch (e) {
      publishError((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  return { items, loading, error, refresh };
}
