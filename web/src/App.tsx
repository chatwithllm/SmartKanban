import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.ts';
import { useAuth } from './auth.tsx';
import type { Card, Scope, Status, User } from './types.ts';
import { Board } from './components/Board.tsx';
import { EditDialog } from './components/EditDialog.tsx';
import { LoginView } from './components/LoginView.tsx';
import { BoardHeader } from './components/BoardHeader.tsx';
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

export function App() {
  const { user, loading } = useAuth();
  const path = location.pathname;

  if (loading) return <div className="p-8 text-sm text-neutral-500">Loading…</div>;

  const mobileCardMatch = path.match(/^\/m\/card\/([0-9a-f-]+)$/);
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
  return (
    <ToastProvider value={toast}>
      <Authed meId={meId} />
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
  const [section, setSection] = useState<'board' | 'knowledge'>('board');
  const [shareInitial, setShareInitial] = useState<{ title?: string; url?: string; body?: string } | null>(null);
  const { addToast } = useToast();

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
    else if (archiveOpen) setArchiveOpen(false);
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

  return (
    <div className="min-h-full p-4">
      <BoardHeader
        scope={scope}
        onScope={(s) => { setScope(s); setSearchQuery(''); }}
        cardCount={cards.length}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenReview={() => setReviewOpen(true)}
        onOpenArchive={() => setArchiveOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        section={section}
        onSection={setSection}
      />
      {section === 'board' ? (
        <Board
          cards={cards}
          searchQuery={searchQuery}
          users={users}
          onCreate={handleCreate}
          onEdit={setEditing}
          onDelete={handleDelete}
          onMove={handleMove}
        />
      ) : (
        <KnowledgeView
          shareInitial={shareInitial}
          onShareConsumed={() => setShareInitial(null)}
        />
      )}
      {editing && (
        <EditDialog
          card={editing}
          users={users}
          onSave={handleSaveEdit}
          onClose={() => setEditing(null)}
        />
      )}
      {reviewOpen && <WeeklyReview onClose={() => setReviewOpen(false)} />}
      {archiveOpen && (
        <ArchiveDialog
          onClose={() => setArchiveOpen(false)}
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
