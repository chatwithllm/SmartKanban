import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Template } from '../types.ts';
import type { BroadcastEvent } from '../ws.ts';

let cache: Template[] | null = null;
let inFlight: Promise<Template[]> | null = null;
const subscribers = new Set<(t: Template[]) => void>();
const errorSubs = new Set<(e: string | null) => void>();

function publish(next: Template[]) {
  cache = next;
  for (const fn of subscribers) fn(next);
}

function publishError(e: string | null) {
  for (const fn of errorSubs) fn(e);
}

async function loadOnce(): Promise<Template[]> {
  if (!inFlight) {
    inFlight = api
      .listTemplates()
      .then((list) => list.slice().sort(sortFn))
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function applyTemplateEvent(ev: BroadcastEvent) {
  if (cache === null) return;
  if (ev.type === 'template.created') {
    publish([...cache, ev.template].sort(sortFn));
  } else if (ev.type === 'template.updated') {
    publish(cache.map((t) => (t.id === ev.template.id ? ev.template : t)).sort(sortFn));
  } else if (ev.type === 'template.deleted') {
    publish(cache.filter((t) => t.id !== ev.id));
  }
}

function sortFn(a: Template, b: Template): number {
  if (a.visibility !== b.visibility) return a.visibility === 'shared' ? -1 : 1;
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

export function useTemplates(): {
  templates: Template[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [templates, setTemplates] = useState<Template[]>(cache ?? []);
  const [loading, setLoading] = useState(cache === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sub = (next: Template[]) => setTemplates(next);
    const errSub = (e: string | null) => setError(e);
    subscribers.add(sub);
    errorSubs.add(errSub);
    if (cache === null) {
      loadOnce()
        .then((list) => {
          publish(list);
          publishError(null);
          setLoading(false);
        })
        .catch((e: Error) => {
          publishError(e.message);
          setLoading(false);
        });
    }
    return () => {
      subscribers.delete(sub);
      errorSubs.delete(errSub);
    };
  }, []);

  const refresh = async () => {
    setLoading(true);
    publishError(null);
    try {
      const list = await loadOnce();
      publish(list);
    } catch (e) {
      publishError((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  return { templates, loading, error, refresh };
}
