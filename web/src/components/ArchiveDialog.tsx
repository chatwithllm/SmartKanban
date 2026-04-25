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
                <button
                  onClick={() => handleRestore(c.id)}
                  disabled={restoring === c.id}
                  className="text-xs text-neutral-400 hover:text-neutral-100 disabled:opacity-50"
                >
                  {restoring === c.id ? 'Restoring…' : 'Restore'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
