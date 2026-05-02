import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import type { AiSuggestion, CardEvent, Status } from '../types.ts';
import { ChatInput } from './ChatInput.tsx';

type Props = {
  cardId: string;
  meId: string;
  incomingEvents?: CardEvent[];
  onRead?: (lastId: string) => void;
};

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 0) return 'just now';
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function SystemEntry({ e }: { e: CardEvent }) {
  return (
    <>
      <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-green-accent" aria-hidden />
      <time className="block text-1 text-ink-soft tracking-tight2" title={new Date(e.created_at).toLocaleString()}>
        {relativeTime(e.created_at)}
      </time>
      <p className="text-2 text-ink tracking-tight2">
        <span className="font-medium">{e.actor_name ?? 'System'}</span>
        {' '}
        <span>{e.action}</span>
      </p>
    </>
  );
}

function MessageEntry({ e, meId }: { e: CardEvent; meId: string }) {
  const isMe = e.actor_id === meId;
  return (
    <>
      <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-ceramic" aria-hidden />
      <time className="block text-1 text-ink-soft tracking-tight2">{relativeTime(e.created_at)}</time>
      <p className={`text-2 tracking-tight2 ${isMe ? 'text-ink' : 'text-ink'}`}>
        <span className="font-medium">{e.actor_name ?? 'Unknown'}</span>
        {': '}
        <span>{e.content}</span>
      </p>
    </>
  );
}

function AiEntry({ e, cardId }: { e: CardEvent; cardId: string }) {
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function apply(s: AiSuggestion) {
    setBusy(s.label);
    setErr(null);
    try {
      if (s.action === 'update_status') {
        await api.updateCard(cardId, { status: s.params['status'] as Status });
      } else if (s.action === 'set_due_date') {
        await api.updateCard(cardId, { due_date: s.params['due_date'] as string });
      } else if (s.action === 'assign_user') {
        const card = await api.getCard(cardId);
        const assignees = [...card.assignees, s.params['user_id'] as string];
        await api.updateCard(cardId, { assignees });
      } else if (s.action === 'create_card') {
        await api.createCard({ title: s.params['title'] as string });
      }
      setApplied((prev) => new Set([...prev, s.label]));
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-green-accent/60" aria-hidden />
      <time className="block text-1 text-ink-soft tracking-tight2">{relativeTime(e.created_at)}</time>
      <p className="text-2 text-ink tracking-tight2">
        <span className="font-medium text-green-accent">AI</span>
        {': '}
        <span>{e.content}</span>
      </p>
      {err && <p className="text-1 text-red mt-0.5 tracking-tight2">{err}</p>}
      {e.ai_suggestions && e.ai_suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {e.ai_suggestions.map((s) => (
            <button
              key={s.label}
              disabled={applied.has(s.label) || busy === s.label}
              onClick={() => void apply(s)}
              className="text-1 px-2 py-0.5 rounded border border-green-accent text-green-accent hover:bg-green-accent hover:text-white disabled:opacity-50 disabled:cursor-not-allowed tracking-tight2 transition-colors"
            >
              {applied.has(s.label) ? `✓ ${s.label}` : s.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function CardTimeline({ cardId, meId, incomingEvents, onRead }: Props) {
  const [events, setEvents] = useState<CardEvent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const seenIds = useRef(new Set<string>());
  const bottomRef = useRef<HTMLDivElement>(null);

  const markRead = useCallback(
    async (evs: CardEvent[]) => {
      const last = evs.at(-1);
      if (!last) return;
      await api.markRead(cardId, last.id);
      onRead?.(last.id);
    },
    [cardId, onRead],
  );

  useEffect(() => {
    if (!open) return;
    api.cardEvents(cardId)
      .then((evs) => {
        setEvents(evs);
        for (const e of evs) seenIds.current.add(e.id);
        void markRead(evs);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      })
      .catch((e) => setErr(String(e)));
  }, [cardId, open, markRead]);

  useEffect(() => {
    if (!incomingEvents?.length || !open) return;
    const fresh = incomingEvents.filter((e) => !seenIds.current.has(e.id));
    if (!fresh.length) return;
    for (const e of fresh) seenIds.current.add(e.id);
    setEvents((prev) => (prev ? [...prev, ...fresh] : fresh));
    void markRead(fresh);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [incomingEvents, open, markRead]);

  function appendEvent(ev: CardEvent) {
    if (seenIds.current.has(ev.id)) return;
    seenIds.current.add(ev.id);
    setEvents((prev) => (prev ? [...prev, ev] : [ev]));
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  return (
    <div className="mt-4 border-t border-ink/10 pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-1 tracking-tight2 text-ink-soft hover:text-ink"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        Chat &amp; Activity
      </button>
      {open && (
        <div className="mt-2">
          {err && <div className="text-1 tracking-tight2 text-red">{err}</div>}
          {!events && !err && <div className="text-1 tracking-tight2 text-ink-soft">Loading…</div>}
          {events && (
            <ol className="relative ml-3 border-l-2 border-ceramic">
              {events.length === 0 && (
                <li className="pl-6 pb-2 text-1 text-ink-soft tracking-tight2">No activity yet. Say hello!</li>
              )}
              {events.map((e) => (
                <li key={e.id} className="relative pl-6 pb-4">
                  {e.entry_type === 'system' && <SystemEntry e={e} />}
                  {e.entry_type === 'message' && <MessageEntry e={e} meId={meId} />}
                  {e.entry_type === 'ai' && <AiEntry e={e} cardId={cardId} />}
                </li>
              ))}
            </ol>
          )}
          <div ref={bottomRef} />
          <ChatInput cardId={cardId} onSent={appendEvent} />
        </div>
      )}
    </div>
  );
}
