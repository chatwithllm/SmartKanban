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
      {/* House-Green feature band */}
      <section className="bg-green-house text-ink-rev rounded-card mb-6 overflow-hidden">
        <div className="grid md:grid-cols-[1fr_auto] gap-6 items-center px-6 py-10">
          <div>
            <h1 className="text-8 font-semibold tracking-tight2">Knowledge</h1>
            <p className="mt-2 text-3 text-ink-rev-soft tracking-tight2">URLs, snippets, notes — all linked back to cards</p>
            <div className="mt-4 flex gap-3 flex-wrap">
              <button onClick={() => setCreating(true)} className="btn-pill btn-pill-on-dark-filled">+ New note</button>
            </div>
          </div>
        </div>
      </section>

      <div className="mb-3 flex items-center gap-2">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as Scope)}
          className="rounded border border-ink/10 bg-card px-2 py-1 text-1 tracking-tight2 text-ink"
        >
          <option value="mine">mine</option>
          <option value="inbox">inbox</option>
          <option value="all">all</option>
        </select>
        <input
          className="flex-1 rounded border border-ink/10 bg-card px-2 py-1 text-2 tracking-tight2 text-ink"
          placeholder="search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {topTags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {topTags.map((t) => (
            <button
              key={t}
              onClick={() => setTag((prev) => (prev === t ? null : t))}
              className={`tag-pill text-1 tracking-tight2 ${
                tag === t
                  ? 'bg-green-accent text-ink-rev'
                  : ''
              }`}
            >
              #{t}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <KnowledgeRow key={item.id} item={item} onOpen={() => setDetail(item)} />
        ))}
        {items.length === 0 && (
          <div className="col-span-full py-12 text-center text-1 tracking-tight2 text-ink-soft">No knowledge yet.</div>
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
