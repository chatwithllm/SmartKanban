import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { CardLink, Card } from '../types.ts';
import type { BroadcastEvent } from '../ws.ts';

type LinksData = { links: CardLink[]; related_cards: Card[] };

const cache = new Map<string, LinksData>();
const listeners = new Map<string, Set<(v: LinksData) => void>>();

function notify(cardId: string): void {
  const subs = listeners.get(cardId);
  if (!subs) return;
  const v = cache.get(cardId);
  if (!v) return;
  for (const s of subs) s(v);
}

export function applyCardLinkEvent(ev: BroadcastEvent): void {
  if (ev.type !== 'card.link.created' && ev.type !== 'card.link.deleted') return;
  for (const cardId of cache.keys()) {
    const v = cache.get(cardId);
    if (!v) continue;
    if (ev.type === 'card.link.created') {
      if (ev.link.from_card_id === cardId || ev.link.to_card_id === cardId) {
        const exists = v.links.some((l) => l.id === ev.link.id);
        cache.set(cardId, { ...v, links: exists ? v.links : [ev.link, ...v.links] });
        notify(cardId);
      }
    } else {
      if (ev.from_card_id === cardId || ev.to_card_id === cardId) {
        cache.set(cardId, { ...v, links: v.links.filter((l) => l.id !== ev.id) });
        notify(cardId);
      }
    }
  }
}

export function useCardLinks(cardId: string | null): LinksData & { loading: boolean } {
  const [data, setData] = useState<LinksData>(() =>
    cardId ? cache.get(cardId) ?? { links: [], related_cards: [] } : { links: [], related_cards: [] },
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cardId) {
      setData({ links: [], related_cards: [] });
      return;
    }
    let cancelled = false;
    const subs = listeners.get(cardId) ?? new Set<(v: LinksData) => void>();
    const h = (v: LinksData) => { if (!cancelled) setData(v); };
    subs.add(h);
    listeners.set(cardId, subs);
    setData(cache.get(cardId) ?? { links: [], related_cards: [] });
    setLoading(true);
    api.cardLinks(cardId)
      .then((v) => {
        if (cancelled) return;
        cache.set(cardId, v);
        notify(cardId);
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      subs.delete(h);
      if (subs.size === 0) listeners.delete(cardId);
    };
  }, [cardId]);

  return { ...data, loading };
}
