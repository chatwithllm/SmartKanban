import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Card } from '../types.ts';

type Props = {
  onClose: () => void;
  onRestore: (card: Card) => void;
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="modal-surface w-full max-w-[560px] max-h-[90vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header strip */}
        <div className="modal-header-strip flex items-center justify-between px-5 py-3 shrink-0">
          <span className="text-3 font-semibold tracking-tight2 text-white">Archived cards</span>
          <button onClick={onClose} aria-label="Close" className="text-2 text-white/80 hover:text-white">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4 flex-1">
          {err && <div className="text-1 tracking-tight2 text-red">{err}</div>}
          {!cards.length && !err && (
            <div className="text-3 tracking-tight2 text-ink-soft">No archived cards.</div>
          )}
          {cards.length > 0 && (
            <ul className="divide-y divide-ink/10 rounded-card border border-ink/10">
              {cards.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between px-3 py-2 text-3 text-ink"
                >
                  <div>
                    <span className="tracking-tight2">{c.title}</span>
                    {c.updated_at && (
                      <span className="ml-2 text-1 tracking-tight2 text-ink-soft">
                        {new Date(c.updated_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 items-center">
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
                      className="text-2 text-red hover:underline tracking-tight2 disabled:opacity-50"
                    >
                      {deleting === c.id ? 'Deleting…' : 'Delete forever'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Destructive footer band */}
        {cards.length > 0 && (
          <div className="px-6 py-4 bg-red/5 border-t border-red/20 flex justify-end gap-3 shrink-0">
            <button type="button" onClick={onClose} className="btn-pill btn-pill-outlined-dark">
              Cancel
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
