import { useEffect, useMemo, useState } from 'react';
import type { Card, User } from '../types.ts';
import type { KnowledgeItem } from '../types.ts';
import { api } from '../api.ts';
import { ActivityTimeline } from './ActivityTimeline.tsx';

type Props = {
  card: Card;
  users: User[];
  onSave: (patch: Partial<Card>) => void;
  onClose: () => void;
};

export function EditDialog({ card, users, onSave, onClose }: Props) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [tags, setTags] = useState(card.tags.join(', '));
  const [assignees, setAssignees] = useState<string[]>(card.assignees);
  const [shares, setShares] = useState<string[]>(card.shares);
  const [dueDate, setDueDate] = useState(card.due_date ?? '');

  const [showQr, setShowQr] = useState(false);

  const [linked, setLinked] = useState<KnowledgeItem[]>([]);
  const [picking, setPicking] = useState(false);
  const [pickerQ, setPickerQ] = useState('');
  const [candidates, setCandidates] = useState<KnowledgeItem[]>([]);

  useEffect(() => {
    if (!card?.id) return;
    api.listKnowledgeForCard(card.id).then(setLinked).catch(() => { /* ignore */ });
  }, [card?.id]);

  const cardUrl = useMemo(() => {
    const m = (card?.description ?? '').match(/https?:\/\/[^\s)\]]+/);
    return m?.[0] ?? null;
  }, [card?.description]);

  const alreadyHasUrlLink = useMemo(() => {
    if (!cardUrl) return false;
    return linked.some((k) => k.url === cardUrl);
  }, [linked, cardUrl]);

  async function saveAsKnowledge() {
    if (!card?.id) return;
    await api.createKnowledgeFromCard(card.id);
    const items = await api.listKnowledgeForCard(card.id);
    setLinked(items);
  }

  useEffect(() => {
    if (!picking || !card?.id) return;
    (async () => {
      try {
        const r = await api.listKnowledge({ scope: 'all', q: pickerQ || undefined });
        const linkedIds = new Set(linked.map((k) => k.id));
        setCandidates(r.items.filter((k) => !linkedIds.has(k.id)).slice(0, 12));
      } catch { /* ignore */ }
    })();
  }, [picking, pickerQ, linked, card?.id]);

  async function attach(id: string) {
    if (!card?.id) return;
    await api.linkKnowledge(id, card.id);
    setLinked(await api.listKnowledgeForCard(card.id));
    setPicking(false);
    setPickerQ('');
  }

  async function detach(id: string) {
    if (!card?.id) return;
    await api.unlinkKnowledge(id, card.id);
    setLinked((prev) => prev.filter((k) => k.id !== id));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const save = () => {
    onSave({
      title: title.trim() || card.title,
      description,
      tags: tags
        .split(',')
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean),
      assignees,
      shares,
      due_date: dueDate || null,
      needs_review: false,
    } as Partial<Card>);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-neutral-800 bg-neutral-900 p-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 bg-transparent text-lg font-medium text-neutral-100 outline-none"
            placeholder="Title"
          />
          <button
            onClick={() => setShowQr((v) => !v)}
            aria-label="Show QR code"
            title="Show QR code"
            className="text-neutral-400 hover:text-neutral-100 mr-1"
          >
            📱
          </button>
        </div>

        {showQr && (
          <div className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <img
              src={api.cardQrUrl(card.id)}
              alt="QR code"
              className="mx-auto h-48 w-48 bg-white p-2"
            />
            <p className="mt-2 text-center text-xs text-neutral-400">Scan to open on phone</p>
            <code className="mt-2 block break-all text-center text-xs text-neutral-500">
              {`${location.origin}/m/card/${card.id}`}
            </code>
          </div>
        )}

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-3 w-full min-h-[120px] resize-none rounded-lg bg-neutral-950 p-2 text-sm text-neutral-200 outline-none border border-neutral-800 focus:border-neutral-700"
          placeholder="Description"
        />
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="mt-3 w-full rounded-lg bg-neutral-950 px-2 py-1.5 text-sm text-neutral-200 outline-none border border-neutral-800 focus:border-neutral-700"
          placeholder="tags, comma, separated"
        />

        {card?.id && (
          <section className="mt-3">
            <div className="mb-1 text-xs font-medium text-neutral-300">Knowledge</div>
            <ul className="text-xs">
              {linked.map((k) => (
                <li key={k.id} className="flex items-center justify-between border-b border-neutral-800 py-1">
                  <span className="truncate text-neutral-200">
                    {k.url ? '🔗 ' : ''}
                    {k.title}
                    <span className="ml-1 text-neutral-500">
                      {k.visibility === 'private' ? '🔒' : k.visibility === 'inbox' ? '📥' : '👥'}
                    </span>
                  </span>
                  <button onClick={() => detach(k.id)} className="text-red-400 hover:text-red-300">
                    remove
                  </button>
                </li>
              ))}
              {linked.length === 0 && <li className="text-neutral-500">none</li>}
            </ul>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setPicking((p) => !p)}
                className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
              >
                + Attach
              </button>
              {cardUrl && !alreadyHasUrlLink && (
                <button
                  onClick={saveAsKnowledge}
                  className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                >
                  Save as knowledge
                </button>
              )}
            </div>
            {picking && (
              <div className="mt-2 rounded border border-neutral-700 bg-neutral-800 p-2">
                <input
                  className="mb-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100"
                  placeholder="search knowledge..."
                  value={pickerQ}
                  onChange={(e) => setPickerQ(e.target.value)}
                />
                <ul className="max-h-48 overflow-auto">
                  {candidates.map((k) => (
                    <li key={k.id}>
                      <button
                        onClick={() => attach(k.id)}
                        className="block w-full px-2 py-1 text-left text-xs text-neutral-200 hover:bg-neutral-700"
                      >
                        {k.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <div className="mt-3 flex items-center gap-2">
          <label className="text-xs text-neutral-500 shrink-0">Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="flex-1 rounded-lg bg-neutral-950 px-2 py-1.5 text-sm text-neutral-200 outline-none border border-neutral-800 focus:border-neutral-700"
          />
          {dueDate && (
            <button
              onClick={() => setDueDate('')}
              className="text-xs text-neutral-500 hover:text-neutral-200"
            >
              ✕
            </button>
          )}
        </div>

        {card.attachments.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-neutral-500 mb-2">Attachments</div>
            <div className="flex flex-wrap gap-2">
              {card.attachments.map((a) => (
                <a
                  key={a.id}
                  href={`/attachments/${a.storage_path}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-700"
                >
                  {a.kind === 'audio' ? '🎙️ audio' : a.kind === 'image' ? '🖼️ image' : '📎 file'}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-neutral-500 mb-2">Assignees</div>
            <div className="flex flex-wrap gap-1">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => toggle(assignees, setAssignees, u.id)}
                  className={`rounded-full px-2 py-0.5 text-xs border ${
                    assignees.includes(u.id)
                      ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                      : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  {u.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-2">Shared with</div>
            <div className="flex flex-wrap gap-1">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => toggle(shares, setShares, u.id)}
                  className={`rounded-full px-2 py-0.5 text-xs border ${
                    shares.includes(u.id)
                      ? 'bg-sky-200 text-sky-950 border-sky-200'
                      : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  {u.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <ActivityTimeline cardId={card.id} />

        <div className="mt-4 flex justify-end gap-2 text-sm">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-neutral-400 hover:text-neutral-100"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="rounded bg-neutral-100 px-3 py-1.5 text-neutral-900 hover:bg-white"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
