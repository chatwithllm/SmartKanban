import { useState, useMemo, useDeferredValue } from 'react';
import { useKnowledge } from './hooks/useKnowledge.ts';
import { useAuth } from './auth.tsx';
import { KnowledgeRow } from './components/KnowledgeRow.tsx';
import { KnowledgeEditDialog } from './components/KnowledgeEditDialog.tsx';
import { KnowledgeDetail } from './components/KnowledgeDetail.tsx';
import type { KnowledgeItem } from './types.ts';

type Scope = 'mine' | 'inbox' | 'all';

export function KnowledgeView({
  shareInitial,
  onShareConsumed,
}: {
  shareInitial?: { title?: string; url?: string; body?: string } | null;
  onShareConsumed?: () => void;
} = {}) {
  const { user } = useAuth();
  const [scope, setScope] = useState<Scope>('mine');
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [tag, setTag] = useState<string | null>(null);
  const { items, refresh } = useKnowledge({ scope, q: dq, tag });
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [detail, setDetail] = useState<KnowledgeItem | null>(null);
  const [creating, setCreating] = useState(!!shareInitial);

  const topTags = useMemo(() => {
    const c = new Map<string, number>();
    for (const k of items) for (const t of k.tags) c.set(t, (c.get(t) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map((e) => e[0]);
  }, [items]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center gap-2">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as Scope)}
          className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
        >
          <option value="mine">mine</option>
          <option value="inbox">inbox</option>
          <option value="all">all</option>
        </select>
        <input
          className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100"
          placeholder="search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          onClick={() => setCreating(true)}
          className="rounded bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-900"
        >
          + New
        </button>
      </div>
      {topTags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {topTags.map((t) => (
            <button
              key={t}
              onClick={() => setTag((prev) => (prev === t ? null : t))}
              className={`rounded-full border px-2 py-0.5 text-xs ${
                tag === t
                  ? 'border-neutral-100 bg-neutral-100 text-neutral-900'
                  : 'border-neutral-700 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              #{t}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {items.map((item) => (
          <KnowledgeRow key={item.id} item={item} onOpen={() => setDetail(item)} />
        ))}
        {items.length === 0 && (
          <div className="py-12 text-center text-xs text-neutral-500">No knowledge yet.</div>
        )}
      </div>
      {creating && (
        <KnowledgeEditDialog
          initial={shareInitial as Partial<KnowledgeItem> | undefined}
          onClose={() => {
            setCreating(false);
            onShareConsumed?.();
          }}
          onSaved={() => {
            setCreating(false);
            onShareConsumed?.();
            refresh();
          }}
        />
      )}
      {editing && (
        <KnowledgeEditDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(k) => {
            setEditing(null);
            setDetail(k);
            refresh();
          }}
        />
      )}
      {detail && user && (
        <KnowledgeDetail
          item={detail}
          currentUserId={user.id}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
          onAfterMutate={refresh}
        />
      )}
    </div>
  );
}
