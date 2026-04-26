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
      className="block w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-left transition-colors hover:border-neutral-500"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-neutral-100">
            {item.url ? '🔗 ' : ''}
            {item.title}
          </div>
          {host && <div className="mt-0.5 text-xs text-neutral-500">{host}</div>}
          {snippet && (
            <div className="mt-1 line-clamp-2 text-xs text-neutral-400">{snippet}</div>
          )}
          {item.tags.length > 0 && (
            <div className="mt-1 text-xs text-neutral-500">
              {item.tags.map((t) => `#${t}`).join(' ')}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-xs text-neutral-400">
          <span title={item.visibility}>{VIS_BADGE[item.visibility]}</span>
          {linked > 0 && <span title="linked cards">📎 {linked}</span>}
          {item.fetch_status === 'pending' && <span title="fetching">⏳</span>}
          {item.fetch_status === 'failed' && (
            <span className="text-red-400" title={item.fetch_error ?? 'fetch failed'}>⚠</span>
          )}
        </div>
      </div>
    </button>
  );
}
