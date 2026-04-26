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
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="modal-surface w-full max-w-[560px] max-h-[90vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header strip */}
        <div className="modal-header-strip flex items-center justify-between px-5 py-3 shrink-0">
          <span className="text-3 font-semibold tracking-tight2 text-white">Edit card</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-2 text-white/80 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4">
          {/* Title row with QR toggle */}
          <div className="flex items-center gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 bg-transparent text-3 font-medium text-ink tracking-tight2 outline-none placeholder:text-ink-soft"
              placeholder="Title"
            />
            <button
              onClick={() => setShowQr((v) => !v)}
              aria-label="Show QR code"
              title="Show QR code"
              className="text-ink-soft hover:text-ink"
            >
              📱
            </button>
          </div>

          {showQr && (
            <div className="rounded-card border border-ink/10 bg-card p-4">
              <img
                src={api.cardQrUrl(card.id)}
                alt="QR code"
                className="mx-auto h-48 w-48 bg-white p-2"
              />
              <p className="mt-2 text-center text-1 tracking-tight2 text-ink-soft">Scan to open on phone</p>
              <code className="mt-2 block break-all text-center text-1 tracking-tight2 text-ink-soft">
                {`${location.origin}/m/card/${card.id}`}
              </code>
            </div>
          )}

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full min-h-[120px] resize-none bg-card border border-ink/10 rounded-card px-3 py-2 text-3 text-ink tracking-tight2 placeholder:text-ink-soft focus:border-green-accent focus:outline-none"
            placeholder="Description"
          />

          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="bg-card border border-ink/10 rounded-card px-3 py-2 text-3 text-ink tracking-tight2 placeholder:text-ink-soft focus:border-green-accent focus:outline-none w-full"
            placeholder="tags, comma, separated"
          />

          {card?.id && (
            <section>
              <div className="mb-2 text-2 font-semibold text-green-starbucks tracking-tight2">Knowledge</div>
              <ul className="text-2 tracking-tight2">
                {linked.map((k) => (
                  <li key={k.id} className="flex items-center justify-between border-b border-ink/10 py-1">
                    <span className="truncate text-ink">
                      {k.url ? '🔗 ' : ''}
                      {k.title}
                      <span className="ml-1 text-ink-soft">
                        {k.visibility === 'private' ? '🔒' : k.visibility === 'inbox' ? '📥' : '👥'}
                      </span>
                    </span>
                    <button onClick={() => detach(k.id)} className="text-red hover:underline text-2 tracking-tight2">
                      remove
                    </button>
                  </li>
                ))}
                {linked.length === 0 && <li className="text-ink-soft">none</li>}
              </ul>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setPicking((p) => !p)}
                  className="btn-pill btn-pill-outlined-green text-2"
                >
                  + Attach
                </button>
                {cardUrl && !alreadyHasUrlLink && (
                  <button
                    onClick={saveAsKnowledge}
                    className="btn-pill btn-pill-outlined-green text-2"
                  >
                    Save as knowledge
                  </button>
                )}
              </div>
              {picking && (
                <div className="mt-2 rounded-card border border-ink/10 bg-ceramic p-2">
                  <input
                    className="mb-1 bg-card border border-ink/10 rounded-card px-3 py-2 text-3 text-ink tracking-tight2 placeholder:text-ink-soft focus:border-green-accent focus:outline-none w-full"
                    placeholder="search knowledge..."
                    value={pickerQ}
                    onChange={(e) => setPickerQ(e.target.value)}
                  />
                  <ul className="max-h-48 overflow-auto">
                    {candidates.map((k) => (
                      <li key={k.id}>
                        <button
                          onClick={() => attach(k.id)}
                          className="block w-full px-2 py-1 text-left text-2 tracking-tight2 text-ink hover:bg-card"
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

          <div className="flex items-center gap-2">
            <label className="text-1 tracking-tight2 text-ink-soft shrink-0">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="flex-1 bg-card border border-ink/10 rounded-card px-3 py-2 text-3 text-ink tracking-tight2 placeholder:text-ink-soft focus:border-green-accent focus:outline-none"
            />
            {dueDate && (
              <button
                onClick={() => setDueDate('')}
                className="text-1 tracking-tight2 text-ink-soft hover:text-ink"
              >
                ✕
              </button>
            )}
          </div>

          {card.attachments.length > 0 && (
            <div>
              <div className="text-1 tracking-tight2 text-ink-soft mb-2">Attachments</div>
              <div className="flex flex-wrap gap-2">
                {card.attachments.map((a) => (
                  <a
                    key={a.id}
                    href={`/attachments/${a.storage_path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-card border border-ink/10 bg-card px-2 py-1 text-1 tracking-tight2 text-ink hover:border-green-accent"
                  >
                    {a.kind === 'audio' ? '🎙️ audio' : a.kind === 'image' ? '🖼️ image' : '📎 file'}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-1 tracking-tight2 text-ink-soft mb-2">Assignees</div>
              <div className="flex flex-wrap gap-1">
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => toggle(assignees, setAssignees, u.id)}
                    className={`rounded-pill px-2 py-0.5 text-1 tracking-tight2 border ${
                      assignees.includes(u.id)
                        ? 'bg-green-starbucks text-white border-green-starbucks'
                        : 'bg-card text-ink-soft border-ink/10 hover:border-green-accent'
                    }`}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-1 tracking-tight2 text-ink-soft mb-2">Shared with</div>
              <div className="flex flex-wrap gap-1">
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => toggle(shares, setShares, u.id)}
                    className={`rounded-pill px-2 py-0.5 text-1 tracking-tight2 border ${
                      shares.includes(u.id)
                        ? 'bg-green-uplift text-white border-green-uplift'
                        : 'bg-card text-ink-soft border-ink/10 hover:border-green-accent'
                    }`}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="text-3 font-semibold text-green-starbucks tracking-tight2 mb-2">Activity</div>
            <ActivityTimeline cardId={card.id} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-ink/6 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="btn-pill btn-pill-outlined-dark">
            Cancel
          </button>
          <button onClick={save} className="btn-pill btn-pill-filled-green">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
