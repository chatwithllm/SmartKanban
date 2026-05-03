import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.ts';
import { useAuth } from './auth.tsx';
import type { Card, CardEvent, Scope, Status, User } from './types.ts';
import { Board } from './components/Board.tsx';
import { EditDialog } from './components/EditDialog.tsx';
import { LoginView } from './components/LoginView.tsx';
import { BoardHeader } from './components/BoardHeader.tsx';
import { ActivityTicker } from './components/ActivityTicker.tsx';
import { WeeklyReview } from './components/WeeklyReview.tsx';
import { SettingsDialog } from './components/SettingsDialog.tsx';
import { ArchiveDialog } from './components/ArchiveDialog.tsx';
import { ToastContainer } from './components/Toast.tsx';
import { ToastProvider, useToast, useToastState } from './hooks/useToast.ts';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.ts';
import { connectWS } from './ws.ts';
import { applyTemplateEvent } from './hooks/useTemplates.ts';
import { KnowledgeView } from './KnowledgeView.tsx';
import { applyKnowledgeEvent } from './hooks/useKnowledge.ts';
import { MobileCardView } from './MobileCardView.tsx';
import { MobileShell } from './MobileShell.tsx';
import { useIsMobile } from './hooks/useIsMobile.ts';
import { useNotifications } from './hooks/useNotifications.ts';
import { NotificationBell } from './components/NotificationBell.tsx';

export function App() {
  const { user, loading } = useAuth();
  const path = location.pathname;

  if (loading) return <div className="p-8 text-2 text-ink-soft tracking-tight2">Loading…</div>;

  // Strict UUID shape — looser regex would let typoed URLs reach the
  // server where Postgres throws 22P02 on the cards.id cast and returns 500.
  const mobileCardMatch = path.match(
    /^\/m\/card\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
  );
  if (mobileCardMatch) {
    const cardId = mobileCardMatch[1]!;
    if (!user) return <LoginView redirectTo={path} />;
    return <MobileCardWithToast cardId={cardId} />;
  }

  return user ? <AuthedWithToast meId={user.id} /> : <LoginView />;
}

function MobileCardWithToast({ cardId }: { cardId: string }) {
  const toast = useToastState();
  return (
    <ToastProvider value={toast}>
      <MobileCardView cardId={cardId} />
      <ToastContainer toasts={toast.toasts} onDismiss={toast.removeToast} />
    </ToastProvider>
  );
}

function AuthedWithToast({ meId }: { meId: string }) {
  const toast = useToastState();
  const isMobile = useIsMobile();
  return (
    <ToastProvider value={toast}>
      {isMobile ? <MobileShell meId={meId} /> : <Authed meId={meId} />}
      <ToastContainer toasts={toast.toasts} onDismiss={toast.removeToast} />
    </ToastProvider>
  );
}

function Authed({ meId }: { meId: string }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [scope, setScope] = useState<Scope>('personal');
  const [searchQuery, setSearchQuery] = useState('');
  const [editing, setEditing] = useState<Card | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [section, setSection] = useState<'board' | 'knowledge' | 'archive'>('board');
  const [shareInitial, setShareInitial] = useState<{ title?: string; url?: string; body?: string } | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [activeChatEvents, setActiveChatEvents] = useState<CardEvent[]>([]);
  const openCardId = useRef<string | null>(null);
  const [lastWsEvent, setLastWsEvent] = useState<{ type: string } | null>(null);
  const { addToast } = useToast();

  const { notifications, unreadCount: notifUnreadCount, markRead: markNotifRead, markAllRead: markAllNotifsRead } = useNotifications(lastWsEvent, meId);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname === '/knowledge/share') {
      const p = new URLSearchParams(window.location.search);
      setShareInitial({
        title: p.get('title') ?? undefined,
        url: p.get('url') ?? undefined,
        body: p.get('text') ?? undefined,
      });
      setSection('knowledge');
      window.history.replaceState({}, '', '/knowledge');
    }
  }, []);

  const handleCloseDialog = useCallback(() => {
    if (settingsOpen) setSettingsOpen(false);
    else if (archiveOpen) { setArchiveOpen(false); setSection('board'); }
    else if (reviewOpen) setReviewOpen(false);
    else if (editing) setEditing(null);
  }, [editing, reviewOpen, archiveOpen, settingsOpen]);

  useKeyboardShortcuts({
    searchQuery,
    onSearchChange: setSearchQuery,
    editing: !!editing,
    reviewOpen,
    settingsOpen,
    onCloseDialog: handleCloseDialog,
  });

  const refresh = () =>
    api
      .listCards(scope)
      .then(setCards)
      .catch((e) => addToast(String(e)));

  useEffect(() => {
    refresh();
  }, [scope]);

  useEffect(() => {
    api.users().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    api.unreadCounts().then(setUnreadCounts).catch(() => {});
  }, []);

  useEffect(() => {
    const disconnect = connectWS((ev) => {
      if (ev.type === 'template.created' || ev.type === 'template.updated' || ev.type === 'template.deleted') {
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
      if (ev.type === 'card.message' || ev.type === 'card.ai_response') {
        setLastWsEvent(ev);
        if (openCardId.current === ev.card_id) {
          setActiveChatEvents((prev) => [...prev, ev.event]);
        } else {
          setUnreadCounts((c) => ({ ...c, [ev.card_id]: (c[ev.card_id] ?? 0) + 1 }));
        }
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
        // Match the server's per-scope visibility rules so broadcasts don't
        // leak cards that belong to a different user's private channel.
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

  // Document-level paste-to-attach. Reads `editing` via a ref so the handler
  // doesn't re-register on every state change.
  const editingRef = useRef(editing);
  useEffect(() => { editingRef.current = editing; }, [editing]);

  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const images: File[] = [];
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) images.push(f);
        }
      }
      if (images.length === 0) return; // let text paste behave normally
      e.preventDefault();
      for (const file of images) {
        try {
          if (editingRef.current) {
            const updated = await api.uploadAttachment(editingRef.current.id, file);
            // Update local state so the dialog reflects the new attachment immediately.
            setCards((prev) =>
              prev.map((c) => (c.id === updated.id ? updated : c)),
            );
            setEditing(updated);
            addToast('Image attached', 'success');
          } else {
            const created = await api.createCardFromImage(file);
            setCards((prev) =>
              prev.some((c) => c.id === created.id) ? prev : [...prev, created],
            );
            addToast(
              `Card created from screenshot${created.ai_summarized ? ' (AI titled)' : ''}`,
              'success',
            );
          }
        } catch (err) {
          addToast(
            `Paste failed: ${err instanceof Error ? err.message : 'error'}`,
            'error',
          );
        }
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
    // Listener registers once. setCards/setEditing are stable React setters
    // and addToast comes from a stable context value; the closure captures
    // them safely. Mutable `editing` is read via editingRef so it doesn't
    // need to be in the dep array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (title: string, status: Status) => {
    try {
      const created = await api.createCard({ title, status });
      // Dedup: the WS card.created broadcast may arrive before this resolves.
      // Without this guard the same id ends up in state twice until refresh.
      setCards((prev) =>
        prev.some((c) => c.id === created.id) ? prev : [...prev, created],
      );
      addToast('Card created', 'success');
    } catch (e) {
      addToast(`Failed to create card: ${e}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    try {
      await api.deleteCard(id);
      addToast('Card archived', 'success');
    } catch (e) {
      addToast(`Failed to delete card: ${e}`, 'error');
      refresh();
    }
  };

  const handleMove = async (id: string, status: Status, position: number) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, status, position } : c)));
    try {
      await api.moveCard(id, status, position);
    } catch (e) {
      addToast(`Failed to move card: ${e}`, 'error');
      refresh();
    }
  };

  const handleRead = useCallback((cardId: string) => {
    setUnreadCounts((c) => { const next = { ...c }; delete next[cardId]; return next; });
    setActiveChatEvents([]);
  }, []);

  const handleOpenCard = (cardId: string | null) => {
    openCardId.current = cardId;
    if (!cardId) setActiveChatEvents([]);
  };

  const handleCardOpenById = useCallback((cardId: string) => {
    const card = cards.find(c => c.id === cardId);
    if (card) {
      setEditing(card);
      const cardNotifIds = notifications.filter(n => n.card_id === cardId && !n.read).map(n => n.id);
      if (cardNotifIds.length > 0) markNotifRead(cardNotifIds);
    }
  }, [cards, notifications, markNotifRead]);

  // Service worker message listener (push notification clicks)
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'open-card' && e.data.cardId) {
        handleCardOpenById(e.data.cardId);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, [handleCardOpenById]);

  // Handle ?card=<id> query param on load (from push notification click → openWindow)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const cardId = params.get('card');
    if (cardId && cards.length > 0) {
      const card = cards.find(c => c.id === cardId);
      if (card) {
        handleCardOpenById(cardId);
        history.replaceState({}, '', '/');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  const handleSaveEdit = async (patch: Partial<Card>) => {
    if (!editing) return;
    const id = editing.id;
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    try {
      await api.updateCard(id, patch);
      addToast('Card saved', 'success');
    } catch (e) {
      addToast(`Failed to save card: ${e}`, 'error');
      refresh();
    }
  };

  const searchActive = searchQuery.trim().length > 0;
  const filteredCards = useMemo(() => {
    if (!searchActive) return cards;
    const q = searchQuery.trim().toLowerCase();
    return cards.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q),
    );
  }, [cards, searchQuery, searchActive]);

  return (
    <div className="min-h-full p-4">
      <BoardHeader
        scope={scope}
        onScope={(s) => { setScope(s); setSearchQuery(''); }}
        cardCount={cards.length}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenReview={() => setReviewOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        section={section}
        onSection={(s) => {
          setSection(s);
          if (s === 'archive') setArchiveOpen(true);
          else setArchiveOpen(false);
        }}
        notificationBell={
          <NotificationBell
            notifications={notifications}
            unreadCount={notifUnreadCount}
            onMarkRead={markNotifRead}
            onMarkAllRead={markAllNotifsRead}
            onCardOpen={handleCardOpenById}
          />
        }
      />
      {section === 'board' && (
        <ActivityTicker
          cards={filteredCards}
          onCardClick={setEditing}
        />
      )}
      {section === 'board' ? (
        <Board
          cards={cards}
          searchQuery={searchQuery}
          users={users}
          unreadCounts={unreadCounts}
          onCreate={handleCreate}
          onEdit={setEditing}
          onDelete={handleDelete}
          onMove={handleMove}
        />
      ) : section === 'knowledge' ? (
        <KnowledgeView
          shareInitial={shareInitial}
          onShareConsumed={() => setShareInitial(null)}
        />
      ) : null}
      {editing && (
        <EditDialog
          card={editing}
          users={users}
          meId={meId}
          incomingChatEvents={activeChatEvents}
          onSave={handleSaveEdit}
          onClose={() => setEditing(null)}
          onRead={handleRead}
          onOpenCard={handleOpenCard}
        />
      )}
      {reviewOpen && <WeeklyReview onClose={() => setReviewOpen(false)} />}
      {archiveOpen && (
        <ArchiveDialog
          onClose={() => { setArchiveOpen(false); setSection('board'); }}
          onRestore={(card) => {
            setCards((prev) =>
              prev.some((c) => c.id === card.id) ? prev : [...prev, card],
            );
            addToast(`Restored "${card.title}"`);
          }}
        />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
