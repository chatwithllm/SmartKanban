import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api.ts';
import type { Card, Status, User } from './types.ts';
import { STATUSES, STATUS_LABELS } from './types.ts';
import { connectWS } from './ws.ts';
import { useToast } from './hooks/useToast.ts';

type Props = { cardId: string };

export function MobileCardView({ cardId }: Props) {
  const [card, setCard] = useState<Card | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const { addToast } = useToast();
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});

  useEffect(() => {
    let mounted = true;
    api
      .getCard(cardId)
      .then((c) => { if (mounted) { setCard(c); setLoading(false); } })
      .catch((e) => {
        if (!mounted) return;
        setErr(e instanceof ApiError && e.status === 404 ? 'Card not found or not visible.' : String(e));
        setLoading(false);
      });
    api.users().then((u) => { if (mounted) setUsers(u); }).catch(() => {});
    const disconnect = connectWS((ev) => {
      if (ev.type === 'card.updated' && ev.card.id === cardId) setCard(ev.card);
      if (ev.type === 'card.deleted' && ev.id === cardId) setCard(null);
    });
    return () => { mounted = false; disconnect(); };
  }, [cardId]);

  if (loading) {
    return <div className="p-6 text-center text-2 text-ink-soft tracking-tight2">Loading…</div>;
  }
  if (err) {
    return (
      <div className="p-6 text-center bg-canvas min-h-screen">
        <p className="text-2 text-red tracking-tight2">{err}</p>
        <a href="/" className="mt-3 inline-block text-1 text-ink-soft hover:text-ink underline tracking-tight2">Back to board</a>
      </div>
    );
  }
  if (!card) {
    return (
      <div className="p-6 text-center bg-canvas min-h-screen">
        <p className="text-2 text-ink tracking-tight2">This card was archived or deleted.</p>
        <a href="/" className="mt-3 inline-block text-1 text-ink-soft hover:text-ink underline tracking-tight2">Back to board</a>
      </div>
    );
  }

  const patch = async (body: Partial<Card>) => {
    setBusy(true);
    try {
      const updated = await api.updateCard(card.id, body);
      setCard(updated);
    } catch (e) {
      addToast(`Save failed: ${e instanceof Error ? e.message : 'error'}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const debouncedPatch = (field: keyof Card, body: Partial<Card>, delay = 500) => {
    if (debounceRefs.current[field as string]) {
      clearTimeout(debounceRefs.current[field as string]!);
    }
    debounceRefs.current[field as string] = setTimeout(() => {
      patch(body);
      debounceRefs.current[field as string] = null;
    }, delay);
  };

  const setStatus = (s: Status) => patch({ status: s });

  const toggleAssignee = (uid: string) => {
    const next = card.assignees.includes(uid)
      ? card.assignees.filter((id) => id !== uid)
      : [...card.assignees, uid];
    patch({ assignees: next });
  };

  const toggleShare = (uid: string) => {
    const next = card.shares.includes(uid)
      ? card.shares.filter((id) => id !== uid)
      : [...card.shares, uid];
    patch({ shares: next });
  };

  const onCameraInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const updated = await api.uploadAttachment(card.id, file);
      setCard(updated);
      addToast('Photo attached', 'success');
    } catch (err) {
      addToast(`Upload failed: ${err instanceof Error ? err.message : 'error'}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!confirm(`Archive "${card.title}"?`)) return;
    setBusy(true);
    try {
      await api.deleteCard(card.id);
      location.assign('/');
    } catch (e) {
      addToast(`Archive failed: ${e instanceof Error ? e.message : 'error'}`, 'error');
      setBusy(false);
    }
  };

  const fieldInputCls = 'mt-1 w-full rounded-card bg-card border border-ink/10 px-3 py-2 text-3 text-ink tracking-tight2 placeholder:text-ink-soft focus:border-green-accent focus:outline-none';
  const labelCls = 'mb-3 block text-1 text-ink-soft tracking-tight2';

  return (
    <div className="mx-auto max-w-md p-3 pb-24 text-ink bg-canvas min-h-screen">
      <header className="sticky top-0 z-10 -mx-3 mb-3 flex items-center gap-3 bg-card px-3 py-2 shadow-app-bar">
        <a href="/" className="text-ink-soft hover:text-ink text-xl">←</a>
        <h1 className="flex-1 truncate text-3 font-semibold text-ink tracking-tight2">{card.title || 'Untitled'}</h1>
        {busy && <span className="text-1 text-ink-soft tracking-tight2">saving…</span>}
      </header>

      <label className={labelCls}>
        Title
        <input
          defaultValue={card.title}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== card.title) patch({ title: v });
          }}
          onChange={(e) => debouncedPatch('title', { title: e.target.value })}
          className={fieldInputCls}
        />
      </label>

      <div className="mb-3">
        <p className="mb-1 text-1 text-ink-soft tracking-tight2">Status</p>
        <div className="grid grid-cols-2 gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-pill px-3 py-3 text-2 tracking-tight2 transition-colors ${
                card.status === s ? 'bg-green-accent text-white font-semibold' : 'bg-ceramic text-ink-soft'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <label className={labelCls}>
        Description
        <textarea
          defaultValue={card.description}
          onBlur={(e) => {
            if (e.target.value !== card.description) patch({ description: e.target.value });
          }}
          onChange={(e) => debouncedPatch('description', { description: e.target.value }, 800)}
          className={`${fieldInputCls} min-h-[120px]`}
        />
      </label>

      <label className={labelCls}>
        Tags (space-separated)
        <input
          defaultValue={card.tags.join(' ')}
          onBlur={(e) => {
            const next = e.target.value.split(/\s+/).map((t) => t.replace(/^#/, '')).filter(Boolean);
            patch({ tags: next });
          }}
          className={fieldInputCls}
        />
      </label>

      <label className={labelCls}>
        Due date
        <input
          type="date"
          value={card.due_date ?? ''}
          onChange={(e) => patch({ due_date: e.target.value || null })}
          className={fieldInputCls}
        />
      </label>

      <div className="mb-3">
        <p className="mb-1 text-1 text-ink-soft tracking-tight2">Assignees</p>
        <div className="flex flex-wrap gap-2">
          {users.map((u) => {
            const on = card.assignees.includes(u.id);
            return (
              <button
                key={u.id}
                onClick={() => toggleAssignee(u.id)}
                className={`rounded-pill px-3 py-2 text-1 tracking-tight2 transition-colors ${
                  on ? 'bg-green-accent text-white font-semibold' : 'bg-ceramic text-ink-soft'
                }`}
              >
                {u.short_name || u.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-1 text-ink-soft tracking-tight2">Shared with</p>
        <div className="flex flex-wrap gap-2">
          {users.map((u) => {
            const on = card.shares.includes(u.id);
            return (
              <button
                key={u.id}
                onClick={() => toggleShare(u.id)}
                className={`rounded-pill px-3 py-2 text-1 tracking-tight2 transition-colors ${
                  on ? 'bg-green-uplift text-white font-semibold' : 'bg-ceramic text-ink-soft'
                }`}
              >
                {u.short_name || u.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-1 text-ink-soft tracking-tight2">Attachments</p>
        <div className="grid grid-cols-3 gap-2">
          {card.attachments.map((a) =>
            a.kind === 'image' ? (
              <img
                key={a.id}
                src={api.attachmentUrl(a.storage_path)}
                alt=""
                className="aspect-square rounded-card object-cover"
                style={{ transition: 'opacity 0.3s ease-in' }}
              />
            ) : (
              <a
                key={a.id}
                href={api.attachmentUrl(a.storage_path)}
                className="flex aspect-square items-center justify-center rounded-card bg-ceramic text-1 text-ink-soft tracking-tight2"
              >
                {a.kind}
              </a>
            ),
          )}
          <label className="flex aspect-square cursor-pointer items-center justify-center rounded-card border-2 border-dashed border-ink/20 text-1 text-ink-soft tracking-tight2 hover:border-green-accent transition-colors">
            + Camera
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onCameraInput}
              className="hidden"
            />
          </label>
        </div>
      </div>

      <button
        onClick={archive}
        disabled={busy}
        className="btn-pill btn-pill-destructive w-full mt-6 disabled:opacity-50"
      >
        Archive card
      </button>
    </div>
  );
}
