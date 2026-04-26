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
    <div className="min-h-screen bg-neutral-950 pb-20 text-neutral-100">
      {tab === 'board' && (
        <>
          <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as Scope)}
              className="bg-neutral-900 text-sm outline-none"
            >
              {SCOPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <h1 className="flex-1 text-center text-sm font-medium">Kanban</h1>
            <button onClick={() => setSearchOpen((v) => !v)} aria-label="Search" className="text-lg">
              🔍
            </button>
            <button onClick={() => setAdding(true)} aria-label="Add card" className="text-xl leading-none">
              +
            </button>
          </header>

          {searchOpen && (
            <div className="border-b border-neutral-800 bg-neutral-900 p-2">
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cards…"
                className="w-full rounded bg-neutral-800 px-3 py-2 text-sm text-neutral-100"
              />
            </div>
          )}

          <nav className="flex gap-1 overflow-x-auto border-b border-neutral-800 px-2 py-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setActiveStatus(s)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${
                  activeStatus === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-800 text-neutral-300'
                }`}
              >
                {STATUS_BADGE[s]} {STATUS_LABELS[s]} <span className="opacity-60">{counts[s]}</span>
              </button>
            ))}
          </nav>

          {adding && (
            <div className="mx-3 mt-3 rounded-lg border border-neutral-700 bg-neutral-900 p-2">
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
                className="w-full resize-none bg-transparent text-sm text-neutral-100 outline-none"
                rows={2}
              />
            </div>
          )}

          <ul className="flex flex-col gap-2 p-3">
            {filtered.length === 0 && (
              <li className="py-8 text-center text-xs text-neutral-500">
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

          {canInstall && !installDismissed && (
            <div className="fixed bottom-16 inset-x-2 z-30 rounded-lg bg-blue-900/95 p-3 shadow-lg">
              <p className="text-sm text-white">Install Kanban as an app for a better experience.</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={async () => {
                    await install();
                    setInstallDismissed(true);
                  }}
                  className="rounded bg-white px-3 py-1 text-xs font-medium text-blue-900"
                >
                  Install
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem('install-dismissed', '1');
                    setInstallDismissed(true);
                  }}
                  className="px-3 py-1 text-xs text-blue-100"
                >
                  Later
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'knowledge' && <KnowledgeView />}
      {tab === 'more' && <MobileMore onCardRestored={onCardRestored} />}

      <nav className="fixed bottom-0 inset-x-0 z-20 flex h-14 border-t border-neutral-800 bg-neutral-900 pb-[env(safe-area-inset-bottom)]">
        <TabButton icon="📋" label="Board" active={tab === 'board'} onClick={() => setTab('board')} />
        <TabButton icon="📚" label="Knowledge" active={tab === 'knowledge'} onClick={() => setTab('knowledge')} />
        <TabButton icon="⋯" label="More" active={tab === 'more'} onClick={() => setTab('more')} />
      </nav>
    </div>
  );
}

function TabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 flex-col items-center justify-center gap-0.5 text-xs"
    >
      <span className="text-lg">{icon}</span>
      <span className={active ? 'text-blue-400' : 'text-neutral-400'}>{label}</span>
    </button>
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
      className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 active:bg-neutral-800"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-neutral-100">{card.title || 'Untitled'}</p>
          {card.tags.length > 0 && (
            <p className="mt-1 text-xs text-neutral-500 truncate">
              {card.tags.map((t) => `#${t}`).join(' ')}
            </p>
          )}
        </div>
        {owner && (
          <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
            {owner.short_name || owner.name}
          </span>
        )}
      </div>
    </li>
  );
}
