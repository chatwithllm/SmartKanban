# Mobile Shell — Design Spec

**Date:** 2026-04-26
**Status:** Approved (brainstorming complete; awaiting user spec review)
**Author:** brainstorming session, chatwithllm@gmail.com

## 1. Goal

When the SmartKanban web app is opened on a viewport ≤ 767 px wide, render a phone-optimised shell with a bottom tab bar, a sticky compact top bar, single-status-at-a-time card view with status tabs, long-press card actions, and a PWA-install prompt. Tapping a card opens the existing `MobileCardView` route. The desktop UI is untouched above 768 px.

## 2. Scope

In scope:

- New `useIsMobile` hook based on `(max-width: 767px)` media query
- New `MobileShell` top-level component swapped in for `Authed` when mobile
- Sticky top bar: scope dropdown, app title, search button, quick-add button
- Status tabs row with per-status card counts; only the active status renders
- Card row: tap → `MobileCardView` (`/m/card/:id`), long-press → bottom-sheet actions
- New `MobileCardActions` bottom sheet (move to status / archive)
- Bottom tab bar: Board / Knowledge / More
- New `MobileMore` screen (Weekly review, Archive, Settings, Telegram, Sign out, Install)
- New `useLongPress` and `useInstallPrompt` hooks
- PWA install banner (browser-driven `beforeinstallprompt`); dismiss persists per session
- Confirm `web/public/manifest.json` has `display: "standalone"`

Out of scope (YAGNI):

- Drag-and-drop on mobile (replaced by long-press bottom sheet)
- Native shell (Capacitor / Tauri) — much bigger effort
- Offline-mode UX (existing service worker still applies)
- Mobile-specific knowledge-base layout (the existing `KnowledgeView` is mounted as-is for v1; mobile polish for that screen is a follow-up)
- Push notifications

## 3. Layout switch and viewport detection

New file `web/src/hooks/useIsMobile.ts`:

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

Used in `AuthedWithToast`:

```tsx
const isMobile = useIsMobile();
return isMobile ? <MobileShell meId={meId} /> : <Authed meId={meId} />;
```

Both components share the existing `useAuth`, `useToast`, `useTemplates`, `connectWS`, and `api.*` surfaces. No backend changes.

When the viewport crosses 767 px (rotation, dev-tools resize), the swap happens. Local component state is reset; this is acceptable v1.

## 4. MobileShell — Board view

New file `web/src/MobileShell.tsx`. Approximate layout:

```
┌──────────────────────────────────┐
│ Sticky top bar (h-12)             │
│ [Scope ▼]  Kanban  [🔍] [+]       │
├──────────────────────────────────┤
│ Status tabs (h-10)                │
│ [Backlog 3][Today *][Doing][Done] │
├──────────────────────────────────┤
│ Card list (scrollable, single)    │
│ ┌──────────────────────────────┐ │
│ │ Card title         [avatar]  │ │
│ │ tags · 3m ago                │ │
│ └──────────────────────────────┘ │
│ ...                               │
├──────────────────────────────────┤
│ Bottom tab bar (h-14, sticky)     │
│ [📋 Board] [📚 Knowledge] [⋯ More]│
└──────────────────────────────────┘
```

State held by `MobileShell`:

| State | Type | Default | Purpose |
| ----- | ---- | ------- | ------- |
| `scope` | `Scope` | `'personal'` | shared scope filter |
| `activeStatus` | `Status` | `'today'` | which status tab's cards are shown |
| `cards` | `Card[]` | `[]` | full card list (all statuses) |
| `users` | `User[]` | `[]` | family users for avatar |
| `quickAddOpen` | `boolean` | `false` | quick-add input visibility |
| `searchQuery` | `string` | `''` | inline filter |
| `tab` | `'board' \| 'knowledge' \| 'more'` | `'board'` | active bottom tab |

Card rows are filtered: `cards.filter(c => !c.archived && c.status === activeStatus)`. Within tabs, count badges reflect each status's filtered count for the current scope.

WebSocket dispatcher: identical to `Authed` (template events → `applyTemplateEvent`, knowledge events → `applyKnowledgeEvent`, card events → state update with the dedup pattern from PR #8).

Interactions:

- **Tap card row:** `location.assign(\`/m/card/\${card.id}\`)` → existing `MobileCardView`.
- **Long-press card:** opens `MobileCardActions` bottom sheet (see §5).
- **+ button:** opens quick-add input pinned below the top bar; submit creates a card with `status = activeStatus` and `scope`-appropriate assignees (defaults to `[meId]` like the desktop quick-add).
- **🔍 button:** toggles a search input that filters the visible card list locally.
- **Scope dropdown:** native `<select>` with three options.
- **Status tabs:** four buttons rendered as a horizontal row; tap to set `activeStatus`. Active tab pill-styled.

Reuse:

- `useTemplates` for the `/template-name` slash shortcut already implemented in `Column.tsx` (port the same submit logic).
- `useToast` for create/move/archive feedback.
- `connectWS` from `web/src/ws.ts` (no changes).
- All `api.*` methods already in use by `Authed`.

## 5. MobileCardActions bottom sheet

New file `web/src/components/MobileCardActions.tsx` (~80 lines).

**Trigger:** card row uses a new `useLongPress` hook (see §6). On long-press, parent receives the press and opens the sheet with the pressed card.

**Tap suppression:** the hook exposes `didLongPress()`. The card row's `onClick` checks it before navigating; if a long-press fired, the click is suppressed.

**Sheet content:**

```
┌──────────────────────────────────┐
│   Buy eggs                        │
│   ─────────                       │
│   📥 Move to Backlog              │
│   📅 Move to Today                │
│   ⚡ Move to In Progress          │
│   ✅ Move to Done                 │
│   🗑  Archive                     │
│   ──────────────                  │
│   Cancel                          │
└──────────────────────────────────┘
```

- 48 px tap targets per row.
- The row matching the card's current status is dimmed and disabled.
- Move tap → `api.moveCard(cardId, status, position)` (uses existing min-position helper); on success, parent updates state, sheet closes, toast `"Moved to ${LABEL}"`.
- Archive tap → `confirm()` → `api.deleteCard(cardId)`; parent removes card from state, sheet closes, toast `"Archived"`.
- Backdrop tap closes the sheet without action.
- Animation: backdrop `transition-opacity`, panel `transition-transform translate-y-full → translate-y-0` (Tailwind, 200 ms).

## 6. New hooks

### `useLongPress`

`web/src/hooks/useLongPress.ts`:

```ts
import { useCallback, useRef } from 'react';

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

Touch-only. We don't need mousedown variants because mobile UI is gated to touch viewports.

### `useInstallPrompt`

`web/src/hooks/useInstallPrompt.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';

type DeferredPrompt = {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

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

iOS Safari does not fire `beforeinstallprompt`, so `canInstall` stays `false` for iOS users. They install via Share → Add to Home Screen.

## 7. Bottom tab bar + More screen

Inside `MobileShell` body:

```tsx
<nav className="fixed bottom-0 inset-x-0 z-20 flex h-14 border-t border-neutral-800 bg-neutral-900 pb-[env(safe-area-inset-bottom)]">
  <button onClick={() => setTab('board')} className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs">
    <span className="text-lg">📋</span>
    <span className={tab === 'board' ? 'text-blue-400' : 'text-neutral-400'}>Board</span>
  </button>
  <button onClick={() => setTab('knowledge')} className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs">
    <span className="text-lg">📚</span>
    <span className={tab === 'knowledge' ? 'text-blue-400' : 'text-neutral-400'}>Knowledge</span>
  </button>
  <button onClick={() => setTab('more')} className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs">
    <span className="text-lg">⋯</span>
    <span className={tab === 'more' ? 'text-blue-400' : 'text-neutral-400'}>More</span>
  </button>
</nav>
```

Body padding-bottom is `pb-20` (4 rem) to leave room above the bar.

When `tab === 'knowledge'`, render the existing `KnowledgeView` component instead of the board. When `tab === 'more'`, render `MobileMore` (new).

### `MobileMore`

New file `web/src/MobileMore.tsx` (~70 lines). Stacks rows:

```
Hi, Alex                                  >
─────────────────────────────────────────
📅 Weekly review                          >
📦 Archived cards                         >
🔔 Telegram setup                         >  (opens SettingsDialog focused on Telegram)
⚙ Settings                                >  (opens SettingsDialog)
─────────────────────────────────────────
📲 Install as app                            (only when useInstallPrompt.canInstall)
─────────────────────────────────────────
🚪 Sign out
```

Each row 56 px, full-width, taps open the existing dialog/component (`WeeklyReview`, `ArchiveDialog`, `SettingsDialog`) via local state. Sign-out calls `useAuth().logout()` and the parent re-renders to `LoginView`. Install button triggers `useInstallPrompt.install()`.

### Auto install banner

Inside `MobileShell`, when `canInstall === true && !localStorage.getItem('install-dismissed')`:

```tsx
<div className="fixed bottom-16 inset-x-2 z-30 rounded-lg bg-blue-900/95 p-3 text-sm shadow-lg">
  <p className="text-white">Install Kanban as an app for a better experience.</p>
  <div className="mt-2 flex gap-2">
    <button
      onClick={async () => { await install(); setDismissed(true); }}
      className="rounded bg-white px-3 py-1 text-blue-900"
    >
      Install
    </button>
    <button
      onClick={() => { localStorage.setItem('install-dismissed', '1'); setDismissed(true); }}
      className="px-3 py-1 text-blue-100"
    >
      Later
    </button>
  </div>
</div>
```

`bottom-16` keeps it above the tab bar.

## 8. Manifest

Confirm `web/public/manifest.json` includes `"display": "standalone"`. If not, add it. Other fields (name, short_name, icons, theme_color, background_color) should already be present from the existing PWA setup.

## 9. Errors and edge cases

| Condition | Behavior |
| --------- | -------- |
| Viewport resize crosses 767 px | `useIsMobile` flips → component swap; local state reset (acceptable v1) |
| Long-press while scrolling | `onTouchMove` cancels the timer before fire |
| iOS Safari `beforeinstallprompt` never fires | `canInstall === false`; banner never shows; users use Share → Add to Home Screen |
| WS disconnect on cellular drop | Existing exponential-backoff reconnect handles it |
| Mobile keyboard pushing tab bar offscreen | `position: fixed` + `pb-[env(safe-area-inset-bottom)]` keeps the bar above safe area; iOS Safari may still cover it briefly while keyboard animates — accept |
| User on `/m/card/<id>` (mobile route) | Independent route; `MobileShell` not mounted — `MobileCardWithToast` already handles that path |
| User on `/my-day` | `MirrorView` is checked first in `App.tsx`; mobile shell not mounted there |

## 10. Tests

Frontend tests skipped per project pattern. Manual smoke checklist:

1. iPhone Safari → app loads → mobile layout active. Bottom tabs visible.
2. Scope dropdown switches between My / Inbox / All.
3. Status tab switch — only that status's cards visible. Counts accurate.
4. Tap card → MobileCardView opens.
5. Long-press card → bottom sheet appears with status moves + archive. Tap "Move to Today" → card moves, sheet closes, toast.
6. + button → quick-add opens → submit → card appears in active status tab.
7. Knowledge tab → existing KnowledgeView loads.
8. More tab → all rows tap-able. Sign out works.
9. Chrome desktop → enable mobile emulation → install banner appears. Click Install → A2HS prompt fires.
10. Resize viewport > 768 px → desktop layout swaps in.
11. Open `/m/card/:id` directly → still routes to MobileCardView (Mobile shell not involved).

## 11. Rollout

- No backend changes, no schema changes, no env vars.
- Web bundle grows ~15–20 KB (six small new files).
- Manifest may need a one-line `"display": "standalone"` addition.
- Re-deploy: `docker compose up -d --build server` after `git pull` (server image rebuilds the web bundle).

## 12. Open Questions

None — Q1 (bottom tabs + sticky top), Q2 (single status at a time), Q3 (tap → MobileCardView), Q4 (long-press → bottom sheet), Q5 (auto install + standalone), Q6 (md: breakpoint, 767 px) all locked.
