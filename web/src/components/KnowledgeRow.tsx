import type { KnowledgeItem } from '../types.ts';

const VIS_BADGE: Record<KnowledgeItem['visibility'], string> = {
  private: '🔒',
  inbox: '📥',
  shared: '👥',
};

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function KnowledgeRow({
  item,
  onOpen,
}: {
  item: KnowledgeItem;
  onOpen: () => void;
}) {
  const host = item.url ? safeHost(item.url) : null;
  const snippet = item.body ? item.body.slice(0, 240) : '';
  const linked = item.linked_card_ids?.length ?? 0;
  return (
    <button
      onClick={onOpen}
      className="card-surface p-4 block w-full text-left"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-3 font-semibold text-ink tracking-tight2">
            {item.url ? <span className="text-green-accent">🔗</span> : null}
            {item.url ? ' ' : ''}
            {item.title}
          </div>
          {host && <div className="mt-0.5 tag-pill text-1 tracking-tight2">{host}</div>}
          {snippet && (
            <div className="mt-1 line-clamp-2 text-1 text-ink-soft tracking-tight2">{snippet}</div>
          )}
          {item.tags.length > 0 && (
            <div className="mt-1 text-1 text-ink-soft tracking-tight2">
              {item.tags.map((t) => `#${t}`).join(' ')}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-1 text-ink-soft tracking-tight2">
          <span title={item.visibility}>{VIS_BADGE[item.visibility]}</span>
          {linked > 0 && <span title="linked cards">📎 {linked}</span>}
          {item.fetch_status === 'pending' && <span title="fetching">⏳</span>}
          {item.fetch_status === 'failed' && (
            <span className="text-red" title={item.fetch_error ?? 'fetch failed'}>⚠</span>
          )}
        </div>
      </div>
    </button>
  );
}
