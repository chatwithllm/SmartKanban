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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-neutral-800 bg-neutral-900 p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Archived cards</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-100">
            ✕
          </button>
        </div>
        {cards.length > 0 && (
          <div className="mb-3 flex justify-end">
            <button
              onClick={handlePurgeAll}
              disabled={purging}
              className="rounded bg-red-900/40 px-3 py-1 text-xs text-red-200 hover:bg-red-900/60 disabled:opacity-50"
            >
              {purging ? 'Purging…' : `Delete all (${cards.length})`}
            </button>
          </div>
        )}
        {err && <div className="text-xs text-red-300">{err}</div>}
        {!cards.length && !err && (
          <div className="text-sm text-neutral-500">No archived cards.</div>
        )}
        {cards.length > 0 && (
          <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
            {cards.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between px-3 py-2 text-sm text-neutral-300"
              >
                <div>
                  <span>{c.title}</span>
                  {c.updated_at && (
                    <span className="ml-2 text-xs text-neutral-500">
                      {new Date(c.updated_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleRestore(c.id)}
                    disabled={restoring === c.id || deleting === c.id || purging}
                    className="text-xs text-neutral-400 hover:text-neutral-100 disabled:opacity-50"
                  >
                    {restoring === c.id ? 'Restoring…' : 'Restore'}
                  </button>
                  <button
                    onClick={() => handlePermanentDelete(c.id, c.title)}
                    disabled={restoring === c.id || deleting === c.id || purging}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    {deleting === c.id ? 'Deleting…' : 'Delete forever'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
