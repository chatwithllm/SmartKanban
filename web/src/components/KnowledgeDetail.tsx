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
      <article className="card-surface p-6 max-h-[90vh] w-full max-w-3xl overflow-auto">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h2 className="text-3 font-semibold text-ink tracking-tight2">{item.title}</h2>
          <button onClick={onClose} className="text-1 tracking-tight2 text-ink-soft hover:text-ink">
            Close
          </button>
        </div>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="break-all text-1 tracking-tight2 text-green-starbucks underline"
          >
            {item.url}
          </a>
        )}
        <div className="mt-1 text-1 tracking-tight2 text-ink-soft">
          {item.visibility} · {item.fetched_at ? `fetched ${item.fetched_at}` : 'no fetch'}
        </div>
        {item.fetch_error && <div className="mt-1 text-1 tracking-tight2 text-red">{item.fetch_error}</div>}
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-card border border-ink/10 bg-card p-2 text-3 text-ink leading-relaxed tracking-tight2">
          {item.body || <span className="text-ink-soft">(no body)</span>}
        </pre>

        <div className="mt-4">
          <div className="mb-1 text-3 font-semibold text-green-starbucks tracking-tight2">Linked cards</div>
          <ul className="text-2 tracking-tight2">
            {linked.map((c) => (
              <li key={c.id} className="flex items-center justify-between border-b border-ink/10 py-1">
                <span className="text-ink">{c.title}</span>
                {isOwner && (
                  <button onClick={() => detach(c.id)} className="btn-pill btn-pill-destructive">
                    remove
                  </button>
                )}
              </li>
            ))}
            {linked.length === 0 && <li className="text-ink-soft">none</li>}
          </ul>
          <div className="mt-2">
            <button
              onClick={() => setPicker((p) => !p)}
              className="btn-pill btn-pill-outlined-green"
            >
              + Attach card
            </button>
            {picker && (
              <div className="mt-2 rounded-card border border-ink/10 bg-card p-2">
                <input
                  className="mb-1 w-full rounded-card border border-ink/10 bg-canvas px-2 py-1 text-1 tracking-tight2 text-ink"
                  placeholder="search..."
                  value={pickerQ}
                  onChange={(e) => setPickerQ(e.target.value)}
                />
                <ul className="max-h-48 overflow-auto">
                  {candidates.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => attach(c.id)}
                        className="block w-full px-2 py-1 text-left text-2 tracking-tight2 text-ink hover:bg-canvas"
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
              className="btn-pill btn-pill-outlined-dark"
            >
              Refetch
            </button>
            <button
              onClick={onEdit}
              className="btn-pill btn-pill-outlined-green"
            >
              Edit
            </button>
            <button
              onClick={async () => { await api.archiveKnowledge(item.id); onClose(); onAfterMutate(); }}
              className="btn-pill btn-pill-destructive"
            >
              Archive
            </button>
          </div>
        )}
      </article>
    </div>
  );
}
