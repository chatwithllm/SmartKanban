import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { CardLink, Card, Insight } from '../types.ts';

type ChainData = { nodes: Card[]; edges: CardLink[]; insights: Insight[] };

export function useCardChain(cardId: string | null, depth = 2): {
  data: ChainData | null;
  loading: boolean;
  err: string | null;
} {
  const [data, setData] = useState<ChainData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!cardId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    api.cardChain(cardId, depth)
      .then((v) => { if (!cancelled) setData(v); })
      .catch((e) => { if (!cancelled) setErr(e instanceof Error ? e.message : 'failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cardId, depth]);

  return { data, loading, err };
}
