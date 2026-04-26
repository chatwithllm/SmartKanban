# Mobile Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a phone-app-style shell (sticky compact top bar, status tabs, single-column card list, long-press bottom-sheet actions, bottom tab bar with PWA install prompt) when the viewport is ≤ 767 px wide. Desktop UI stays untouched above 768 px.

**Architecture:** A `useIsMobile` hook based on `(max-width: 767px)` chooses between the existing `Authed` desktop shell and a new `MobileShell`. `MobileShell` reuses every existing API call, hook, and dispatcher; it only changes layout, navigation, and per-card interaction. Long-press cards open a `MobileCardActions` bottom sheet. The bottom tab bar exposes Board / Knowledge / More; More mounts existing dialogs (`WeeklyReview`, `ArchiveDialog`, `SettingsDialog`).

**Tech Stack:** React 18 + TypeScript + Tailwind. No new deps. Backend untouched.

**Spec:** `docs/superpowers/specs/2026-04-26-mobile-shell-design.md`

---

## File Structure

**Frontend (`web/src/`):**
- Create: `hooks/useIsMobile.ts` (viewport detection)
- Create: `hooks/useLongPress.ts` (touch long-press handlers)
- Create: `hooks/useInstallPrompt.ts` (`beforeinstallprompt` capture + `install()`)
- Create: `components/MobileCardActions.tsx` (bottom sheet for status moves + archive)
- Create: `MobileMore.tsx` (More tab content)
- Create: `MobileShell.tsx` (top-level mobile board UI)
- Modify: `App.tsx` (wire `useIsMobile` switch in `AuthedWithToast`)

The existing manifest at `web/public/manifest.webmanifest` already has `display: "standalone"` — no change needed there.

---

## Task 1: `useIsMobile` hook

**Files:**
- Create: `web/src/hooks/useIsMobile.ts`

- [ ] **Step 1: Create the hook**

```ts
import { useEffect, useState } from 'react';

const QUERY = '(max-width: 767px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/hooks/useIsMobile.ts
git commit -m "feat(mobile): useIsMobile hook keyed to (max-width: 767px)"
```

---

## Task 2: `useLongPress` hook

**Files:**
- Create: `web/src/hooks/useLongPress.ts`

- [ ] **Step 1: Create the hook**

```ts
import { useCallback, useRef } from 'react';
import type React from 'react';

/**
 * Touch-only long-press handler. Returns event handlers to spread onto an
 * element plus `didLongPress()` so the consumer's onClick can suppress the
 * navigation/click that would otherwise fire on touchend.
 */
export function useLongPress(cb: () => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  const start = useCallback(() => {
    fired.current = false;
    timer.current = setTimeout(() => {
      fired.current = true;
      cb();
    }, ms);
  }, [cb, ms]);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const didLongPress = useCallback(() => fired.current, []);

  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: cancel,
    onTouchCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    didLongPress,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/hooks/useLongPress.ts
git commit -m "feat(mobile): useLongPress hook with touch-only handlers"
```

---

## Task 3: `useInstallPrompt` hook

**Files:**
- Create: `web/src/hooks/useInstallPrompt.ts`

- [ ] **Step 1: Create the hook**

```ts
import { useCallback, useEffect, useState } from 'react';

type DeferredPrompt = {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * Captures the browser's `beforeinstallprompt` event and exposes a manual
 * `install()` trigger. iOS Safari does not fire this event; `canInstall`
 * stays false there.
 */
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState<DeferredPrompt | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as unknown as DeferredPrompt);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = useCallback(async () => {
    if (!prompt) return null;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    return choice.outcome;
  }, [prompt]);

  return { canInstall: !!prompt, install };
}
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/hooks/useInstallPrompt.ts
git commit -m "feat(mobile): useInstallPrompt hook for beforeinstallprompt"
```

---

## Task 4: `MobileCardActions` bottom sheet

**Files:**
- Create: `web/src/components/MobileCardActions.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { Card, Status } from '../types.ts';
import { STATUSES, STATUS_LABELS } from '../types.ts';

const STATUS_EMOJI: Record<Status, string> = {
  backlog: '📥',
  today: '📅',
  in_progress: '⚡',
  done: '✅',
};

type Props = {
  card: Card;
  onClose: () => void;
  onMove: (status: Status) => void;
  onArchive: () => void;
};

export function MobileCardActions({ card, onClose, onMove, onArchive }: Props) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-2xl bg-neutral-900 p-3 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="px-3 pb-2 text-sm text-neutral-300 truncate">{card.title || 'Untitled'}</p>
        <hr className="border-neutral-800" />
        {STATUSES.map((s) => {
          const isCurrent = card.status === s;
          return (
            <button
              key={s}
              onClick={() => !isCurrent && onMove(s)}
              disabled={isCurrent}
              className="flex w-full items-center gap-3 px-3 py-3 text-sm text-neutral-100 disabled:opacity-30"
            >
              <span className="text-lg">{STATUS_EMOJI[s]}</span>
              <span>Move to {STATUS_LABELS[s]}</span>
            </button>
          );
        })}
        <button
          onClick={onArchive}
          className="flex w-full items-center gap-3 px-3 py-3 text-sm text-red-300"
        >
          <span className="text-lg">🗑</span>
          <span>Archive</span>
        </button>
        <hr className="my-1 border-neutral-800" />
        <button
          onClick={onClose}
          className="w-full px-3 py-3 text-center text-sm text-neutral-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/MobileCardActions.tsx
git commit -m "feat(mobile): MobileCardActions bottom sheet"
```

---

## Task 5: `MobileMore` screen

**Files:**
- Create: `web/src/MobileMore.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react';
import { useAuth } from './auth.tsx';
import { useInstallPrompt } from './hooks/useInstallPrompt.ts';
import { ArchiveDialog } from './components/ArchiveDialog.tsx';
import { SettingsDialog } from './components/SettingsDialog.tsx';
import { WeeklyReview } from './components/WeeklyReview.tsx';
import type { Card } from './types.ts';

type Props = {
  onCardRestored: (card: Card) => void;
};

export function MobileMore({ onCardRestored }: Props) {
  const { user, logout } = useAuth();
  const { canInstall, install } = useInstallPrompt();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const Row = ({
    icon,
    label,
    onClick,
    danger,
  }: {
    icon: string;
    label: string;
    onClick: () => void;
    danger?: boolean;
  }) => (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 border-b border-neutral-800 px-4 py-4 text-left text-sm ${
        danger ? 'text-red-400' : 'text-neutral-100'
      }`}
    >
      <span className="text-lg">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="text-neutral-600">›</span>
    </button>
  );

  return (
    <div className="text-neutral-100">
      <div className="border-b border-neutral-800 px-4 py-4 text-sm">
        Hi, {user?.short_name || user?.name || 'there'}
      </div>
      <Row icon="📅" label="Weekly review" onClick={() => setReviewOpen(true)} />
      <Row icon="📦" label="Archived cards" onClick={() => setArchiveOpen(true)} />
      <Row icon="⚙" label="Settings" onClick={() => setSettingsOpen(true)} />
      {canInstall && (
        <Row icon="📲" label="Install as app" onClick={() => { install(); }} />
      )}
      <Row icon="🚪" label="Sign out" onClick={() => logout()} danger />

      {reviewOpen && <WeeklyReview onClose={() => setReviewOpen(false)} />}
      {archiveOpen && (
        <ArchiveDialog
          onClose={() => setArchiveOpen(false)}
          onRestore={onCardRestored}
        />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/MobileMore.tsx
git commit -m "feat(mobile): MobileMore tab with existing dialogs + install button"
```

---

## Task 6: `MobileShell` component (Board view)

**Files:**
- Create: `web/src/MobileShell.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState } from 'react';
import { api, ApiError } from './api.ts';
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
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/MobileShell.tsx
git commit -m "feat(mobile): MobileShell with status tabs, long-press, install banner"
```

---

## Task 7: Wire `useIsMobile` switch in App.tsx

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Add the import + switch**

In `web/src/App.tsx`:

1. Add the imports near the top with the other module imports:

```tsx
import { useIsMobile } from './hooks/useIsMobile.ts';
import { MobileShell } from './MobileShell.tsx';
```

2. Modify `AuthedWithToast` to switch shells based on viewport:

```tsx
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
```

The `MobileCardWithToast` for `/m/card/:id` (added in PR #11) is unchanged — that route bypasses `AuthedWithToast` entirely.

- [ ] **Step 2: Type-check + build**

Run: `cd web && npx tsc --noEmit && npm run build 2>&1 | tail -3`
Expected: tsc clean, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(mobile): swap Authed for MobileShell when viewport is mobile"
```

---

## Task 8: Manual smoke + final polish

**Files:** none modified unless smoke turns up issues.

- [ ] **Step 1: Build the web bundle**

Run: `cd web && npm run build 2>&1 | tail -3`
Expected: build succeeds.

- [ ] **Step 2: Run server tests for regressions**

Run: `cd server && npm test 2>&1 | tail -3`
Expected: prior count green (mobile change is web-only; no backend impact).

- [ ] **Step 3: Manual smoke**

Bring up the stack: `docker compose up -d --build server`. Open the app on phone OR use Chrome DevTools mobile emulation.

1. Viewport ≤ 767 px → mobile layout active. Bottom tabs visible.
2. Scope dropdown switches My / Inbox / All.
3. Status tab switch — only that status's cards visible. Counts accurate.
4. Tap card → `/m/card/:id` opens (existing MobileCardView).
5. Long-press card → bottom sheet appears with status moves + archive. Tap "Move to Today" → card moves; sheet dismisses; toast `Moved to Today`.
6. + button → quick-add opens → submit → card appears in active status tab.
7. `/template-name` slash shortcut works in mobile quick-add (if any templates exist).
8. Knowledge tab → existing `KnowledgeView` loads.
9. More tab — Weekly review / Archive / Settings open the existing dialogs. Sign-out logs out.
10. Chrome desktop emulation → Install banner appears (if not dismissed). Click Install → A2HS prompt.
11. Resize viewport > 768 px → desktop layout swaps in. State resets (acceptable).
12. Open `/m/card/:id` directly → still routes to MobileCardView (mobile shell not involved).

- [ ] **Step 4: Commit fixups (only if smoke turned up issues)**

```bash
git add -p
git commit -m "fix(mobile): smoke-test fixups"
```

If the smoke pass produced no changes, skip this step.

---

## Self-Review Notes

**Spec coverage:**
- §3 viewport detection → Task 1
- §4 MobileShell board view → Task 6
- §5 long-press bottom sheet → Tasks 2 + 4 (hook + component)
- §6 hooks → Tasks 1, 2, 3
- §7 bottom tab bar + More + install banner → Tasks 5 + 6
- §8 manifest — already `display: "standalone"` (no task needed)
- §9 errors and edge cases → handled inline in Task 6 (resize swap, long-press cancel on touchmove, iOS Safari fallback, env(safe-area-inset-bottom) on tab bar)
- §10 manual smoke checklist → Task 8

**Type consistency:**
- `Card`, `Status`, `Scope`, `User` from `web/src/types.ts` reused.
- `STATUSES`, `STATUS_LABELS` reused.
- `useToast` provider already wraps via `AuthedWithToast` (Task 7 keeps the wrap; the swap happens inside the provider).
- `applyTemplateEvent` and `applyKnowledgeEvent` exports reused as-is.
- `connectWS`, `api.*` reused.

**Placeholders:** none — every step contains the actual code.

**Known intentional simplifications:**
- Drag-and-drop is not provided on mobile; long-press → bottom sheet replaces it.
- Knowledge tab on mobile mounts the existing `KnowledgeView` without mobile-specific polish; v2 follow-up.
- Resize across the breakpoint resets local component state (search input, active status tab, in-flight quick-add). Acceptable v1.
- No frontend tests; manual smoke checklist substitutes (matches existing project footprint).
