import { useEffect, useState } from 'react';
import type { Card, KnowledgeItem } from '../types.ts';
import { api } from '../api.ts';

export function KnowledgeDetail({
  item,
  currentUserId,
  onClose,
  onEdit,
  onAfterMutate,
}: {
  item: KnowledgeItem;
  currentUserId: string;
  onClose: () => void;
  onEdit: () => void;
  onAfterMutate: () => void;
}) {
  const [linked, setLinked] = useState<Card[]>([]);
  const [picker, setPicker] = useState(false);
  const [pickerQ, setPickerQ] = useState('');
  const [candidates, setCandidates] = useState<Card[]>([]);

  useEffect(() => {
    (async () => {
      if (!item.linked_card_ids?.length) {
        setLinked([]);
        return;
      }
      try {
        const all = await api.listCards('all');
        setLinked(all.filter((c) => item.linked_card_ids!.includes(c.id)));
      } catch { /* ignore */ }
    })();
  }, [item.id, item.linked_card_ids]);

  useEffect(() => {
    if (!picker) return;
    (async () => {
      try {
        const all = await api.listCards('all');
        const q = pickerQ.toLowerCase();
        setCandidates(
          all
            .filter((c) => !item.linked_card_ids?.includes(c.id))
            .filter((c) => !q || c.title.toLowerCase().includes(q))
            .slice(0, 12),
        );
      } catch { /* ignore */ }
    })();
  }, [picker, pickerQ, item.linked_card_ids]);

  async function attach(cardId: string) {
    await api.linkKnowledge(item.id, cardId);
    setPicker(false);
    setPickerQ('');
    onAfterMutate();
  }

  async function detach(cardId: string) {
    await api.unlinkKnowledge(item.id, cardId);
    setLinked((prev) => prev.filter((c) => c.id !== cardId));
    onAfterMutate();
  }

  const isOwner = item.owner_id === currentUserId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-2xl">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-neutral-100">{item.title}</h2>
          <button onClick={onClose} className="text-xs text-neutral-400 hover:text-neutral-100">
            Close
          </button>
        </div>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="break-all text-xs text-blue-400 underline"
          >
            {item.url}
          </a>
        )}
        <div className="mt-1 text-xs text-neutral-500">
          {item.visibility} · {item.fetched_at ? `fetched ${item.fetched_at}` : 'no fetch'}
        </div>
        {item.fetch_error && <div className="mt-1 text-xs text-red-400">{item.fetch_error}</div>}
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded border border-neutral-700 bg-neutral-800 p-2 text-xs text-neutral-200">
          {item.body || <span className="text-neutral-500">(no body)</span>}
        </pre>

        <div className="mt-4">
          <div className="mb-1 text-xs font-medium text-neutral-300">Linked cards</div>
          <ul className="text-xs">
            {linked.map((c) => (
              <li key={c.id} className="flex items-center justify-between border-b border-neutral-800 py-1">
                <span className="text-neutral-200">{c.title}</span>
                {isOwner && (
                  <button onClick={() => detach(c.id)} className="text-red-400 hover:text-red-300">
                    remove
                  </button>
                )}
              </li>
            ))}
            {linked.length === 0 && <li className="text-neutral-500">none</li>}
          </ul>
          <div className="mt-2">
            <button
              onClick={() => setPicker((p) => !p)}
              className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              + Attach card
            </button>
            {picker && (
              <div className="mt-2 rounded border border-neutral-700 bg-neutral-800 p-2">
                <input
                  className="mb-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100"
                  placeholder="search..."
                  value={pickerQ}
                  onChange={(e) => setPickerQ(e.target.value)}
                />
                <ul className="max-h-48 overflow-auto">
                  {candidates.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => attach(c.id)}
                        className="block w-full px-2 py-1 text-left text-xs text-neutral-200 hover:bg-neutral-700"
                      >
                        {c.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {isOwner && (
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={async () => { await api.refetchKnowledge(item.id); onAfterMutate(); }}
              className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              Refetch
            </button>
            <button
              onClick={onEdit}
              className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              Edit
            </button>
            <button
              onClick={async () => { await api.archiveKnowledge(item.id); onClose(); onAfterMutate(); }}
              className="rounded border border-red-800 px-2 py-1 text-xs text-red-300 hover:bg-red-900/30"
            >
              Archive
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
