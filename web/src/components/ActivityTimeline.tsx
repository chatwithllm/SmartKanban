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
    <div className="mt-4 border-t border-neutral-800 pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        Activity
      </button>
      {open && (
        <div className="mt-2">
          {err && <div className="text-xs text-red-300">{err}</div>}
          {!entries && !err && <div className="text-xs text-neutral-500">Loading…</div>}
          {entries && entries.length === 0 && (
            <div className="text-xs text-neutral-600">No activity recorded</div>
          )}
          {entries && entries.length > 0 && (
            <ul className="space-y-1.5">
              {entries.map((e) => (
                <li key={e.id} className="flex items-baseline gap-2 text-xs">
                  <span className="font-medium text-neutral-300">
                    {e.actor_name ?? 'System'}
                  </span>
                  <span className="text-neutral-400">{e.action}</span>
                  <span className="ml-auto shrink-0 text-neutral-600" title={new Date(e.created_at).toLocaleString()}>
                    {relativeTime(e.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
