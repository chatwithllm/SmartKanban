import { useEffect, useState } from 'react';
import { api, getServerClockSkewMs } from '../api.ts';
import type { ActivityEntry } from '../types.ts';

type Props = { cardId: string };

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const nowMs = Date.now() + getServerClockSkewMs();
  const diff = nowMs - d.getTime();
  if (diff < 0) return 'just now';
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ActivityTimeline({ cardId }: Props) {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.cardActivity(cardId).then(setEntries).catch((e) => setErr(String(e)));
  }, [cardId, open]);

  return (
    <div className="mt-4 border-t border-ink/10 pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-1 tracking-tight2 text-ink-soft hover:text-ink"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        Activity
      </button>
      {open && (
        <div className="mt-2">
          {err && <div className="text-1 tracking-tight2 text-red">{err}</div>}
          {!entries && !err && <div className="text-1 tracking-tight2 text-ink-soft">Loading…</div>}
          {entries && entries.length === 0 && (
            <div className="text-1 tracking-tight2 text-ink-soft">No activity recorded</div>
          )}
          {entries && entries.length > 0 && (
            <ol className="relative ml-3 border-l-2 border-ceramic">
              {entries.map((e) => (
                <li key={e.id} className="relative pl-6 pb-4">
                  <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-green-accent" aria-hidden />
                  <time className="block text-1 text-ink-soft tracking-tight2" title={new Date(e.created_at).toLocaleString()}>
                    {relativeTime(e.created_at)}
                  </time>
                  <p className="text-2 text-ink tracking-tight2">
                    <span className="font-medium">{e.actor_name ?? 'System'}</span>
                    {' '}
                    <span>{e.action}</span>
                  </p>
                  {(() => {
                    const body = (e.details as { body?: unknown } | null | undefined)?.body;
                    return typeof body === 'string' && body.trim() ? (
                      <pre className="mt-1 whitespace-pre-wrap text-1 tracking-tight2 text-ink-soft font-mono">
                        {body}
                      </pre>
                    ) : null;
                  })()}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
