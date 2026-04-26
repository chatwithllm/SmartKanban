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
  // Debounce timers per field name
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});

  // Initial load + WS subscription
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
    return <div className="p-6 text-center text-sm text-neutral-400">Loading…</div>;
  }
  if (err) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-400">{err}</p>
        <a href="/" className="mt-3 inline-block text-xs text-neutral-400 underline">Back to board</a>
      </div>
    );
  }
  if (!card) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-neutral-300">This card was archived or deleted.</p>
        <a href="/" className="mt-3 inline-block text-xs text-neutral-400 underline">Back to board</a>
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

  // Debounced patch — used for free-text fields where the user types continuously
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
    e.target.value = ''; // reset so picking the same file again still fires
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

  return (
    <div className="mx-auto max-w-md p-3 pb-24 text-neutral-100">
      <header className="sticky top-0 z-10 -mx-3 mb-3 flex items-center gap-3 bg-neutral-900 px-3 py-2 shadow">
        <a href="/" className="text-neutral-400 hover:text-neutral-100">←</a>
        <h1 className="flex-1 truncate text-base font-medium">{card.title || 'Untitled'}</h1>
        {busy && <span className="text-xs text-neutral-500">saving…</span>}
      </header>

      <label className="mb-3 block text-xs text-neutral-400">
        Title
        <input
          defaultValue={card.title}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== card.title) patch({ title: v });
          }}
          onChange={(e) => debouncedPatch('title', { title: e.target.value })}
          className="mt-1 w-full rounded bg-neutral-800 px-3 py-2 text-base"
        />
      </label>

      <div className="mb-3">
        <p className="mb-1 text-xs text-neutral-400">Status</p>
        <div className="grid grid-cols-2 gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded px-3 py-3 text-sm ${
                card.status === s ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-300'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <label className="mb-3 block text-xs text-neutral-400">
        Description
        <textarea
          defaultValue={card.description}
          onBlur={(e) => {
            if (e.target.value !== card.description) patch({ description: e.target.value });
          }}
          onChange={(e) => debouncedPatch('description', { description: e.target.value }, 800)}
          className="mt-1 min-h-[120px] w-full rounded bg-neutral-800 px-3 py-2 text-sm"
        />
      </label>

      <label className="mb-3 block text-xs text-neutral-400">
        Tags (space-separated)
        <input
          defaultValue={card.tags.join(' ')}
          onBlur={(e) => {
            const next = e.target.value.split(/\s+/).map((t) => t.replace(/^#/, '')).filter(Boolean);
            patch({ tags: next });
          }}
          className="mt-1 w-full rounded bg-neutral-800 px-3 py-2 text-sm"
        />
      </label>

      <label className="mb-3 block text-xs text-neutral-400">
        Due date
        <input
          type="date"
          value={card.due_date ?? ''}
          onChange={(e) => patch({ due_date: e.target.value || null })}
          className="mt-1 w-full rounded bg-neutral-800 px-3 py-2 text-sm"
        />
      </label>

      <div className="mb-3">
        <p className="mb-1 text-xs text-neutral-400">Assignees</p>
        <div className="flex flex-wrap gap-2">
          {users.map((u) => {
            const on = card.assignees.includes(u.id);
            return (
              <button
                key={u.id}
                onClick={() => toggleAssignee(u.id)}
                className={`rounded-full px-3 py-2 text-xs ${
                  on ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-300'
                }`}
              >
                {u.short_name || u.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs text-neutral-400">Shared with</p>
        <div className="flex flex-wrap gap-2">
          {users.map((u) => {
            const on = card.shares.includes(u.id);
            return (
              <button
                key={u.id}
                onClick={() => toggleShare(u.id)}
                className={`rounded-full px-3 py-2 text-xs ${
                  on ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-300'
                }`}
              >
                {u.short_name || u.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs text-neutral-400">Attachments</p>
        <div className="grid grid-cols-3 gap-2">
          {card.attachments.map((a) =>
            a.kind === 'image' ? (
              <img
                key={a.id}
                src={api.attachmentUrl(a.storage_path)}
                alt=""
                className="aspect-square rounded object-cover"
              />
            ) : (
              <a
                key={a.id}
                href={api.attachmentUrl(a.storage_path)}
                className="flex aspect-square items-center justify-center rounded bg-neutral-800 text-xs text-neutral-300"
              >
                {a.kind}
              </a>
            ),
          )}
          <label className="flex aspect-square cursor-pointer items-center justify-center rounded border-2 border-dashed border-neutral-700 text-xs text-neutral-400">
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
        className="mt-6 w-full rounded bg-red-900/40 px-4 py-3 text-sm text-red-200 hover:bg-red-900/60 disabled:opacity-50"
      >
        Archive card
      </button>
    </div>
  );
}
