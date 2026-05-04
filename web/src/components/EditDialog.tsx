import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Card, CardEvent, User } from '../types.ts';
import type { KnowledgeItem } from '../types.ts';
import { api } from '../api.ts';
import { CardTimeline } from './CardTimeline.tsx';

type Props = {
  card: Card;
  users: User[];
  meId: string;
  incomingChatEvents?: CardEvent[];
  onSave: (patch: Partial<Card>) => void;
  onClose: () => void;
  onRead?: (cardId: string) => void;
  onOpenCard?: (cardId: string | null) => void;
};

export function EditDialog({ card, users, meId, incomingChatEvents, onSave, onClose, onRead, onOpenCard }: Props) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [tags, setTags] = useState(card.tags.join(', '));
  const [assignees, setAssignees] = useState<string[]>(card.assignees);
  const [shares, setShares] = useState<string[]>(card.shares);
  const [dueDate, setDueDate] = useState(card.due_date ?? '');

  const [showQr, setShowQr] = useState(false);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [sharesSaved, setSharesSaved] = useState(false);

  const handleRead = useCallback(() => onRead?.(card.id), [onRead, card.id]);

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
    onOpenCard?.(card.id);
    return () => onOpenCard?.(null);
  }, [card.id, onOpenCard]);

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

  const shareNow = async () => {
    setSharingBusy(true);
    try {
      await api.updateCard(card.id, { shares } as Partial<Card>);
      setSharesSaved(true);
      setTimeout(() => setSharesSaved(false), 2000);
    } catch { /* ignore */ } finally {
      setSharingBusy(false);
    }
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
          <span style={{ fontSize: 14, fontWeight: 600, color: 'white', fontFamily: 'Spectral, serif' }}>Edit card</span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', fontSize: 16 }}
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
              placeholder="Title"
              style={{
                flex: 1, background: 'transparent', outline: 'none', border: 'none',
                fontSize: 18, fontWeight: 600, color: 'rgb(var(--ink))',
                fontFamily: 'Spectral, serif', letterSpacing: '-0.01em',
              }}
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
            placeholder="Description"
            style={{
              width: '100%', minHeight: 120, resize: 'none',
              background: 'rgb(var(--card))',
              color: 'rgb(var(--ink))',
              border: '1px solid rgb(var(--hairline) / 0.14)',
              borderRadius: 10, padding: '10px 14px',
              fontSize: 13, fontFamily: 'Inter, sans-serif',
              outline: 'none',
            }}
          />

          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="tags, comma, separated"
            style={{
              width: '100%',
              background: 'rgb(var(--card))',
              color: 'rgb(var(--ink))',
              border: '1px solid rgb(var(--hairline) / 0.14)',
              borderRadius: 10, padding: '8px 14px',
              fontSize: 13, fontFamily: 'Inter, sans-serif',
              outline: 'none',
            }}
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
                    placeholder="search knowledge..."
                    value={pickerQ}
                    onChange={(e) => setPickerQ(e.target.value)}
                    style={{
                      width: '100%', marginBottom: 4,
                      background: 'rgb(var(--card))',
                      color: 'rgb(var(--ink))',
                      border: '1px solid rgb(var(--hairline) / 0.14)',
                      borderRadius: 8, padding: '7px 12px',
                      fontSize: 13, fontFamily: 'Inter, sans-serif',
                      outline: 'none',
                    }}
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
              style={{
                flex: 1,
                background: 'rgb(var(--card))',
                color: 'rgb(var(--ink))',
                border: '1px solid rgb(var(--hairline) / 0.14)',
                borderRadius: 10, padding: '8px 14px',
                fontSize: 13, fontFamily: 'Inter, sans-serif',
                outline: 'none',
                colorScheme: 'inherit',
              }}
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
              <div style={{ fontSize: 11, color: 'rgb(var(--ink-3))', marginBottom: 8, fontFamily: 'JetBrains Mono, monospace' }}>
                Attachments
              </div>
              {/* Image previews */}
              {card.attachments.filter(a => a.kind === 'image').length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  {card.attachments.filter(a => a.kind === 'image').map((a) => (
                    <a
                      key={a.id}
                      href={`/attachments/${a.storage_path}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: 'block', borderRadius: 10, overflow: 'hidden', border: '1px solid rgb(var(--hairline) / 0.12)' }}
                    >
                      <img
                        src={`/attachments/${a.storage_path}`}
                        alt="attachment"
                        style={{ width: '100%', maxHeight: 240, objectFit: 'cover', display: 'block' }}
                      />
                    </a>
                  ))}
                </div>
              )}
              {/* Non-image attachments */}
              {card.attachments.filter(a => a.kind !== 'image').length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {card.attachments.filter(a => a.kind !== 'image').map((a) => (
                    <a
                      key={a.id}
                      href={`/attachments/${a.storage_path}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '5px 12px', borderRadius: 99,
                        border: '1px solid rgb(var(--hairline) / 0.12)',
                        background: 'rgb(var(--card))',
                        fontSize: 12, color: 'rgb(var(--ink))',
                        textDecoration: 'none',
                      }}
                    >
                      {a.kind === 'audio' ? '🎙️ audio' : '📎 file'}
                    </a>
                  ))}
                </div>
              )}
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
              <div className="flex items-center gap-2 mb-2">
                <div className="text-1 tracking-tight2 text-ink-soft flex-1">Shared with</div>
                <button
                  onClick={shareNow}
                  disabled={sharingBusy}
                  className="rounded-pill px-2 py-0.5 text-1 tracking-tight2 border border-violet/30 bg-violet/8 text-violet hover:bg-violet/15 disabled:opacity-50"
                  style={{ fontSize: 11, color: 'rgb(var(--violet))', background: 'rgb(var(--violet) / 0.08)', borderColor: 'rgb(var(--violet) / 0.25)' }}
                >
                  {sharesSaved ? '✓ Shared' : sharingBusy ? '…' : 'Share now'}
                </button>
              </div>
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
            <CardTimeline
              cardId={card.id}
              meId={meId}
              incomingEvents={incomingChatEvents}
              onRead={handleRead}
            />
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
