import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Card } from '../types.ts';

type Props = {
  onClose: () => void;
  onRestore: (card: Card) => void;
};

const LANE_COLORS: Record<string, string> = {
  backlog: 'rgb(var(--lane-backlog))',
  today: 'rgb(var(--lane-today))',
  in_progress: 'rgb(var(--lane-doing))',
  done: 'rgb(var(--lane-done))',
};

const LANE_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  today: 'Today',
  in_progress: 'Doing',
  done: 'Done',
};

export function ArchiveDialog({ onClose, onRestore }: Props) {
  const [cards, setCards] = useState<Card[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    api.listArchived().then(setCards).catch((e) => setErr(String(e)));
  }, []);

  const handleRestore = async (id: string) => {
    setRestoring(id);
    try {
      const restored = await api.restoreCard(id);
      setCards((prev) => prev.filter((c) => c.id !== id));
      onRestore(restored);
    } catch (e) {
      setErr(String(e));
    } finally {
      setRestoring(null);
    }
  };

  const handlePermanentDelete = async (id: string, title: string) => {
    if (!confirm(`Permanently delete "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    setErr(null);
    try {
      await api.permanentDeleteCard(id);
      setCards((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setErr(String(e));
    } finally {
      setDeleting(null);
    }
  };

  const handlePurgeAll = async () => {
    if (cards.length === 0) return;
    if (!confirm(`Permanently delete all ${cards.length} archived cards? This cannot be undone.`)) return;
    setPurging(true);
    setErr(null);
    try {
      await api.purgeArchived();
      setCards([]);
    } catch (e) {
      setErr(String(e));
    } finally {
      setPurging(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto flex flex-col"
        style={{
          background: 'rgb(var(--surface))',
          borderRadius: 14,
          boxShadow: 'var(--sh-3)',
          border: '1px solid rgb(var(--hairline) / 0.08)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header strip */}
        <div
          className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ background: 'rgb(var(--violet))', borderRadius: '14px 14px 0 0' }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: 'white', fontFamily: 'Spectral, serif' }}>
            Archived cards
            {cards.length > 0 && (
              <span style={{
                marginLeft: 8, fontSize: 11,
                background: 'rgba(255,255,255,0.2)', borderRadius: 99,
                padding: '1px 8px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 500,
              }}>{cards.length}</span>
            )}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', fontSize: 16 }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-3 flex-1">
          {err && (
            <div style={{ fontSize: 12, color: 'rgb(var(--red, 220 38 38))', padding: '8px 12px', background: 'rgba(220,38,38,0.06)', borderRadius: 8 }}>
              {err}
            </div>
          )}
          {!cards.length && !err && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgb(var(--ink-3))', fontSize: 14 }}>
              🗑️ No archived cards
            </div>
          )}
          {cards.length > 0 && (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cards.map((c) => (
                <li
                  key={c.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: 'rgb(var(--card))',
                    borderRadius: 10,
                    border: '1px solid rgb(var(--hairline) / 0.08)',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {/* Lane badge */}
                    <span style={{
                      flexShrink: 0,
                      fontSize: 10, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace',
                      padding: '2px 7px', borderRadius: 99, color: 'white',
                      background: LANE_COLORS[c.status] ?? 'rgb(var(--violet))',
                    }}>
                      {LANE_LABELS[c.status] ?? c.status}
                    </span>
                    {/* Title */}
                    <span style={{
                      fontSize: 13, fontWeight: 500, color: 'rgb(var(--ink))',
                      fontFamily: 'Spectral, serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {c.title}
                    </span>
                    {/* Date */}
                    {c.updated_at && (
                      <span style={{ flexShrink: 0, fontSize: 10, color: 'rgb(var(--ink-3))', fontFamily: 'JetBrains Mono, monospace' }}>
                        {new Date(c.updated_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    <button
                      onClick={() => handleRestore(c.id)}
                      disabled={restoring === c.id || deleting === c.id || purging}
                      className="btn-pill btn-pill-outlined-green text-2 tracking-tight2 disabled:opacity-50"
                    >
                      {restoring === c.id ? 'Restoring…' : 'Restore'}
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(c.id, c.title)}
                      disabled={restoring === c.id || deleting === c.id || purging}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 11, color: 'rgba(220,38,38,0.75)', fontFamily: 'Inter, sans-serif',
                        padding: '3px 0',
                      }}
                      className="disabled:opacity-50 hover:underline"
                    >
                      {deleting === c.id ? 'Deleting…' : '✕ Delete forever'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Destructive footer */}
        {cards.length > 0 && (
          <div
            className="px-5 py-4 flex justify-end gap-3 shrink-0"
            style={{ borderTop: '1px solid rgba(220,38,38,0.15)', background: 'rgba(220,38,38,0.03)' }}
          >
            <button type="button" onClick={onClose} className="btn-pill btn-pill-outlined-dark">
              Close
            </button>
            <button
              type="button"
              onClick={handlePurgeAll}
              disabled={purging}
              className="btn-pill btn-pill-destructive disabled:opacity-50"
            >
              {purging ? 'Purging…' : `Delete all (${cards.length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
