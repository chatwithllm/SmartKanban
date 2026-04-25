import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Template } from '../types.ts';
import type { BroadcastEvent } from '../ws.ts';

let cache: Template[] | null = null;
const subscribers = new Set<(t: Template[]) => void>();

function publish(next: Template[]) {
  cache = next;
  for (const fn of subscribers) fn(next);
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
    subscribers.add(sub);
    if (cache === null) {
      api
        .listTemplates()
        .then((list) => {
          publish(list.slice().sort(sortFn));
          setLoading(false);
        })
        .catch((e: Error) => {
          setError(e.message);
          setLoading(false);
        });
    }
    return () => {
      subscribers.delete(sub);
    };
  }, []);

  const refresh = async () => {
    const list = await api.listTemplates();
    publish(list.slice().sort(sortFn));
  };

  return { templates, loading, error, refresh };
}
