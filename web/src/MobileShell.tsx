import { useEffect, useState } from 'react';
import { api } from './api.ts';
import type { Card, Scope, Status, User } from './types.ts';
import { STATUSES, STATUS_LABELS } from './types.ts';
import { connectWS } from './ws.ts';
import { useToast } from './hooks/useToast.ts';
import { useTemplates, applyTemplateEvent } from './hooks/useTemplates.ts';
import { applyKnowledgeEvent } from './hooks/useKnowledge.ts';
import { useLongPress } from './hooks/useLongPress.ts';
import { useInstallPrompt } from './hooks/useInstallPrompt.ts';
import { MobileCardActions } from './components/MobileCardActions.tsx';
import { MobileMore } from './MobileMore.tsx';
import { KnowledgeView } from './KnowledgeView.tsx';

type Tab = 'board' | 'knowledge' | 'more';

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'personal', label: 'My board' },
  { value: 'inbox', label: 'Family Inbox' },
  { value: 'all', label: 'Everything' },
];

const STATUS_BADGE: Record<Status, string> = {
  backlog: '📥',
  today: '📅',
  in_progress: '⚡',
  done: '✅',
};

export function MobileShell({ meId }: { meId: string }) {
  const [tab, setTab] = useState<Tab>('board');
  const [scope, setScope] = useState<Scope>('personal');
  const [activeStatus, setActiveStatus] = useState<Status>('today');
  const [cards, setCards] = useState<Card[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [actionsCard, setActionsCard] = useState<Card | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [installDismissed, setInstallDismissed] = useState(
    () => typeof localStorage !== 'undefined' && !!localStorage.getItem('install-dismissed'),
  );
  const { addToast } = useToast();
  const { templates } = useTemplates();
  const { canInstall, install } = useInstallPrompt();

  // Initial data load
  useEffect(() => {
    api.listCards(scope).then(setCards).catch((e) => addToast(`Load failed: ${e}`, 'error'));
  }, [scope]);
  useEffect(() => {
    api.users().then(setUsers).catch(() => {});
  }, []);

  // WS dispatcher (mirrors Authed's logic)
  useEffect(() => {
    const disconnect = connectWS((ev) => {
      if (
        ev.type === 'template.created' ||
        ev.type === 'template.updated' ||
        ev.type === 'template.deleted'
      ) {
        applyTemplateEvent(ev);
        return;
      }
      if (
        ev.type === 'knowledge.created' ||
        ev.type === 'knowledge.updated' ||
        ev.type === 'knowledge.deleted' ||
        ev.type === 'knowledge.link.created' ||
        ev.type === 'knowledge.link.deleted'
      ) {
        applyKnowledgeEvent(ev, meId);
        return;
      }
      if (ev.type === 'card.created' || ev.type === 'card.updated') {
        const incoming = ev.card;
        if (incoming.archived) {
          setCards((prev) => prev.filter((c) => c.id !== incoming.id));
          return;
        }
        const isMine =
          incoming.created_by === meId ||
          incoming.assignees.includes(meId) ||
          incoming.shares.includes(meId);
        const isInbox = incoming.assignees.length === 0;
        const visible =
          scope === 'inbox' ? isInbox : scope === 'personal' ? isMine : isMine || isInbox;
        setCards((prev) => {
          const without = prev.filter((c) => c.id !== incoming.id);
          return visible ? [...without, incoming] : without;
        });
      } else if (ev.type === 'card.deleted') {
        setCards((prev) => prev.filter((c) => c.id !== ev.id));
      }
    });
    return disconnect;
  }, [scope, meId]);

  // Card-list filters
  const visible = cards.filter((c) => !c.archived);
  const counts: Record<Status, number> = { backlog: 0, today: 0, in_progress: 0, done: 0 };
  for (const c of visible) counts[c.status]++;
  const filtered = visible
    .filter((c) => c.status === activeStatus)
    .filter((c) =>
      searchQuery
        ? (c.title + ' ' + c.description + ' ' + c.tags.join(' '))
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
        : true,
    )
    .sort((a, b) => a.position - b.position);

  // Card creation
  const submitCreate = async () => {
    const t = draft.trim();
    setDraft('');
    setAdding(false);
    if (!t) return;
    if (t.startsWith('/') && !/\s/.test(t)) {
      const name = t.slice(1);
      const tpl = templates.find((tt) => tt.name.toLowerCase() === name.toLowerCase());
      if (tpl) {
        try {
          await api.instantiateTemplate(tpl.id, { status_override: activeStatus });
        } catch (e) {
          addToast(`Template failed: ${e instanceof Error ? e.message : 'error'}`, 'error');
        }
        return;
      }
    }
    try {
      const created = await api.createCard({ title: t, status: activeStatus });
      setCards((prev) =>
        prev.some((c) => c.id === created.id) ? prev : [...prev, created],
      );
      addToast('Card created', 'success');
    } catch (e) {
      addToast(`Failed to create: ${e instanceof Error ? e.message : 'error'}`, 'error');
    }
  };

  const handleMove = async (status: Status) => {
    if (!actionsCard) return;
    const card = actionsCard;
    setActionsCard(null);
    try {
      const updated = await api.updateCard(card.id, { status });
      setCards((prev) => prev.map((c) => (c.id === card.id ? updated : c)));
      addToast(`Moved to ${STATUS_LABELS[status]}`, 'success');
    } catch (e) {
      addToast(`Move failed: ${e instanceof Error ? e.message : 'error'}`, 'error');
    }
  };

  const handleArchive = async () => {
    if (!actionsCard) return;
    const card = actionsCard;
    if (!confirm(`Archive "${card.title}"?`)) {
      setActionsCard(null);
      return;
    }
    setActionsCard(null);
    try {
      await api.deleteCard(card.id);
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      addToast('Archived', 'success');
    } catch (e) {
      addToast(`Archive failed: ${e instanceof Error ? e.message : 'error'}`, 'error');
    }
  };

  const onCardRestored = (card: Card) => {
    setCards((prev) => (prev.some((c) => c.id === card.id) ? prev : [...prev, card]));
    addToast(`Restored "${card.title}"`, 'success');
  };

  return (
    <div className="bg-canvas min-h-screen pb-[calc(56px+env(safe-area-inset-bottom))]">
      {tab === 'board' && (
        <>
          <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-ink/10 bg-card px-3">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as Scope)}
              className="bg-card text-ink text-sm outline-none"
            >
              {SCOPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <h1 className="flex-1 text-center text-3 font-medium text-ink tracking-tight2">Kanban</h1>
            <button onClick={() => setSearchOpen((v) => !v)} aria-label="Search" className="text-lg">
              🔍
            </button>
          </header>

          {searchOpen && (
            <div className="border-b border-ink/10 bg-card p-2">
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cards…"
                className="input-pill w-full"
              />
            </div>
          )}

          <div className="flex gap-2 overflow-x-auto px-4 py-3 bg-canvas">
            {STATUSES.map((s) => {
              const active = activeStatus === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setActiveStatus(s)}
                  className={`relative shrink-0 inline-flex items-center gap-1 rounded-pill px-3.5 py-1.5 text-2 tracking-tight2 transition-colors ${
                    active ? 'bg-card text-green-starbucks font-semibold' : 'bg-ceramic text-ink-soft'
                  }`}
                >
                  <span aria-hidden>{STATUS_BADGE[s]}</span>
                  <span>{STATUS_LABELS[s]}</span>
                  {active && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-gold" aria-hidden />}
                </button>
              );
            })}
          </div>

          {adding && (
            <div className="mx-3 mt-3 rounded-card border border-ink/10 bg-card p-2">
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submitCreate();
                  } else if (e.key === 'Escape') {
                    setDraft('');
                    setAdding(false);
                  }
                }}
                onBlur={submitCreate}
                placeholder="New card… (or /template-name)"
                className="input-pill w-full resize-none bg-transparent outline-none"
                rows={2}
              />
            </div>
          )}

          <ul className="flex flex-col gap-2 p-3">
            {filtered.length === 0 && (
              <li className="py-8 text-center text-2 text-ink-soft">
                {searchQuery ? 'No cards match your search' : `No cards in ${STATUS_LABELS[activeStatus]}`}
              </li>
            )}
            {filtered.map((c) => (
              <MobileCardRow
                key={c.id}
                card={c}
                users={users}
                onLongPress={() => setActionsCard(c)}
              />
            ))}
          </ul>

          {actionsCard && (
            <MobileCardActions
              card={actionsCard}
              onClose={() => setActionsCard(null)}
              onMove={handleMove}
              onArchive={handleArchive}
            />
          )}

          {tab === 'board' && (
            <button
              type="button"
              className="fab"
              style={{
                width: '56px',
                height: '56px',
                right: 'calc(16px + env(safe-area-inset-right))',
                bottom: 'calc(56px + 16px + env(safe-area-inset-bottom))',
                opacity: actionsCard ? 0 : 1,
                pointerEvents: actionsCard ? 'none' : 'auto',
                transition: 'opacity 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease',
              }}
              onClick={() => setAdding(true)}
              aria-label="Add card"
            >
              <span className="text-2xl leading-none" aria-hidden>+</span>
            </button>
          )}

          {canInstall && !installDismissed && (
            <div className="fixed left-4 right-4 bottom-[calc(56px+16px+env(safe-area-inset-bottom))] z-30 bg-green-house text-ink-rev rounded-card p-4 flex items-center gap-3">
              <div className="flex-1">
                <div className="text-3 font-semibold tracking-tight2">Install SmartKanban</div>
                <div className="text-1 text-ink-rev-soft tracking-tight2">Add to home screen for full-screen access</div>
              </div>
              <button
                onClick={async () => {
                  await install();
                  setInstallDismissed(true);
                }}
                className="btn-pill btn-pill-on-dark-filled"
              >
                Install
              </button>
              <button
                onClick={() => {
                  localStorage.setItem('install-dismissed', '1');
                  setInstallDismissed(true);
                }}
                className="btn-pill btn-pill-on-dark-outlined"
              >
                Dismiss
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'knowledge' && <KnowledgeView />}
      {tab === 'more' && <MobileMore onCardRestored={onCardRestored} />}

      <nav
        className="fixed bottom-0 left-0 right-0 z-30 bg-green-house text-ink-rev grid grid-cols-3"
        style={{ height: 'calc(56px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -1px 3px rgba(0,0,0,0.1)' }}
      >
        {(['board', 'knowledge', 'more'] as const).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="flex flex-col items-center justify-center gap-1 relative"
            >
              <span className="text-xl" aria-hidden>{t === 'board' ? '📋' : t === 'knowledge' ? '📚' : '⋯'}</span>
              <span className={`text-[12px] tracking-tight2 ${active ? 'font-semibold text-white' : 'text-ink-rev-soft'}`}>{t === 'board' ? 'Board' : t === 'knowledge' ? 'Knowledge' : 'More'}</span>
              {active && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-gold" aria-hidden />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function MobileCardRow({
  card,
  users,
  onLongPress,
}: {
  card: Card;
  users: User[];
  onLongPress: () => void;
}) {
  const lp = useLongPress(onLongPress, 500);
  const owner = users.find((u) => u.id === card.created_by);
  const handleClick = () => {
    if (lp.didLongPress()) return; // long-press fired; suppress navigation
    location.assign(`/m/card/${card.id}`);
  };
  return (
    <li
      onClick={handleClick}
      onTouchStart={lp.onTouchStart}
      onTouchEnd={lp.onTouchEnd}
      onTouchMove={lp.onTouchMove}
      onTouchCancel={lp.onTouchCancel}
      onContextMenu={lp.onContextMenu}
      className="card-surface px-3 py-2 active:bg-ceramic"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-3 text-ink">{card.title || 'Untitled'}</p>
          {card.tags.length > 0 && (
            <p className="mt-1 text-1 text-ink-soft truncate">
              {card.tags.map((t) => `#${t}`).join(' ')}
            </p>
          )}
        </div>
        {owner && (
          <span className="tag-pill">
            {owner.short_name || owner.name}
          </span>
        )}
      </div>
    </li>
  );
}
