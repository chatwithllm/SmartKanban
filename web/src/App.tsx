import { useCallback, useEffect, useState } from 'react';
import { api } from './api.ts';
import { useAuth } from './auth.tsx';
import type { Card, Scope, Status, User } from './types.ts';
import { Board } from './components/Board.tsx';
import { EditDialog } from './components/EditDialog.tsx';
import { LoginView } from './components/LoginView.tsx';
import { BoardHeader } from './components/BoardHeader.tsx';
import { WeeklyReview } from './components/WeeklyReview.tsx';
import { SettingsDialog } from './components/SettingsDialog.tsx';
import { ToastContainer } from './components/Toast.tsx';
import { ToastProvider, useToast, useToastState } from './hooks/useToast.ts';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.ts';
import { connectWS } from './ws.ts';

export function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="p-8 text-sm text-neutral-500">Loading…</div>;
  if (!user) return <LoginView />;
  return <AuthedWithToast meId={user.id} />;
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
  const { addToast } = useToast();

  const handleCloseDialog = useCallback(() => {
    if (settingsOpen) setSettingsOpen(false);
    else if (reviewOpen) setReviewOpen(false);
    else if (editing) setEditing(null);
  }, [editing, reviewOpen, settingsOpen]);

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

  const handleCreate = async (title: string, status: Status) => {
    const created = await api.createCard({ title, status });
    setCards((prev) => [...prev, created]);
  };

  const handleDelete = async (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    try {
      await api.deleteCard(id);
    } catch {
      refresh();
    }
  };

  const handleMove = async (id: string, status: Status, position: number) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, status, position } : c)));
    try {
      await api.moveCard(id, status, position);
    } catch {
      refresh();
    }
  };

  const handleSaveEdit = async (patch: Partial<Card>) => {
    if (!editing) return;
    const id = editing.id;
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    try {
      await api.updateCard(id, patch);
    } catch {
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
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <Board
        cards={cards}
        searchQuery={searchQuery}
        users={users}
        onCreate={handleCreate}
        onEdit={setEditing}
        onDelete={handleDelete}
        onMove={handleMove}
      />
      {editing && (
        <EditDialog
          card={editing}
          users={users}
          onSave={handleSaveEdit}
          onClose={() => setEditing(null)}
        />
      )}
      {reviewOpen && <WeeklyReview onClose={() => setReviewOpen(false)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
