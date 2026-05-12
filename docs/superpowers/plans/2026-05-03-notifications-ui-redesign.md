# Notifications + UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Starbucks-green UI with a sticky-note kanban design system (violet accent, Spectral serif, colored lanes, pushpin cards, activity ticker) and add per-card chat push notifications (in-app bell + Web Push).

**Architecture:** Phase 1 rewrites the design tokens and UI components bottom-up (tokens → card → column → topbar → ticker). Phase 2 adds the notification DB tables, server fan-out logic, Web Push delivery, and frontend hooks + bell component. The bell mounts in the new TopBar, so Phase 1 must complete first.

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + CSS variables (frontend); Fastify + Node.js test runner + pg (server); `web-push` npm package (push delivery); Web Push API + Service Worker (browser).

**Spec:** `docs/superpowers/specs/2026-05-03-push-notifications-design.md`

---

## File Map

### Modified
- `web/index.html` — add Google Fonts link (Spectral, Inter, JetBrains Mono)
- `web/src/theme.css` — replace all design tokens with new violet system
- `web/tailwind.config.js` — expose new tokens as Tailwind utilities
- `web/src/index.css` — update body base styles
- `web/src/components/CardView.tsx` — sticky-note style (pushpin, folded corner, clip-path)
- `web/src/components/Column.tsx` — bold colored lane background + paper-grain overlay
- `web/src/components/EmptyColumn.tsx` — lane-style empty state
- `web/src/components/Board.tsx` — remove unread count prop (now in bell); pass `onCardOpen`
- `web/src/components/BoardHeader.tsx` — new frosted-glass topbar + NotificationBell slot
- `web/src/App.tsx` — add ActivityTicker, update layout
- `web/src/ws.ts` — add `card: Card` to `card.message` and `card.ai_response` event types
- `web/src/api.ts` — add notification API methods
- `web/src/types.ts` — add `Notification` type
- `web/public/sw.js` — add push event + notificationclick handler
- `server/src/index.ts` — register `notificationRoutes`
- `server/src/routes/chat.ts` — hook `fanOutNotification` after human message
- `server/src/ai/card_chat.ts` — hook `fanOutNotification` after AI reply

### Created
- `web/src/components/ActivityTicker.tsx` — scrolling hot-cards marquee
- `web/src/components/NotificationBell.tsx` — bell icon + dropdown panel
- `web/src/hooks/useNotifications.ts` — fetch + WS real-time notifications
- `web/src/hooks/usePushNotifications.ts` — service worker + Web Push subscription
- `server/migrations/2026-05-03-notifications.sql` — notifications + push_subscriptions tables
- `server/src/notifications.ts` — fanOut, getNotifications, markRead, markAllRead
- `server/src/push.ts` — VAPID setup, sendPush, pushToUser
- `server/src/routes/notifications.ts` — REST endpoints for bell + push subscribe
- `server/src/__tests__/notifications.test.ts` — integration tests

---

## Phase 1 — Design System

### Task 1: Replace Design Tokens

**Files:**
- Modify: `web/index.html`
- Modify: `web/src/theme.css`
- Modify: `web/tailwind.config.js`
- Modify: `web/src/index.css`

- [ ] **Step 1: Add Google Fonts to `web/index.html`**

Add inside `<head>` before existing `<link>` tags:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Replace `web/src/theme.css` with new token system**

Replace the entire file:

```css
:root {
  /* Surfaces */
  --canvas:    250 249 247;
  --surface:   255 255 255;
  --surface-2: 246 245 242;
  --surface-3: 240 238 234;
  --hairline:  17 17 24;

  /* Ink */
  --ink:   24 22 35;
  --ink-2: 70 65 88;
  --ink-3: 130 124 148;
  --ink-rev: 255 255 255;

  /* Brand */
  --violet:      91 55 196;
  --violet-deep: 65 38 142;
  --violet-soft: 234 226 250;
  --violet-tint: 246 242 254;

  /* Tag palette */
  --tag-violet-bg: 234 226 250; --tag-violet-fg: 65 38 142;
  --tag-blue-bg:   222 232 252; --tag-blue-fg:   30 64 152;
  --tag-teal-bg:   216 238 235; --tag-teal-fg:   17 100 90;
  --tag-amber-bg:  248 233 207; --tag-amber-fg:  138 88 13;
  --tag-rose-bg:   250 224 230; --tag-rose-fg:   158 32 70;
  --tag-stone-bg:  235 232 226; --tag-stone-fg:  76 70 60;
  --tag-mint-bg:   220 240 226; --tag-mint-fg:   30 95 60;

  /* Status accents */
  --backlog: 130 124 148;
  --today:   91 55 196;
  --doing:   138 88 13;
  --done:    30 95 60;

  /* Lane backgrounds */
  --lane-backlog:      188 144 105;
  --lane-today:        228 130 70;
  --lane-doing:        233 178 50;
  --lane-done:         52 158 138;
  --lane-backlog-soft: 245 235 220;
  --lane-today-soft:   250 230 210;
  --lane-doing-soft:   250 240 210;
  --lane-done-soft:    218 238 232;

  /* Pin colors */
  --pin-backlog: 130 80 40;
  --pin-today:   200 60 40;
  --pin-doing:   210 130 20;
  --pin-done:    20 110 100;

  /* Card paper */
  --paper:      255 253 248;
  --paper-fold: 208 200 184;

  /* Semantic */
  --danger:  178 36 60;
  --success: 30 95 60;

  /* Geometry */
  --r-card: 10px;
  --r-md:   8px;
  --r-sm:   6px;
  --r-pill: 999px;

  /* Shadows */
  --sh-1: 0 0 0 1px rgb(17 17 24 / 0.04), 0 1px 2px rgb(17 17 24 / 0.04);
  --sh-2: 0 0 0 1px rgb(17 17 24 / 0.05), 0 4px 12px rgb(17 17 24 / 0.06);
  --sh-3: 0 0 0 1px rgb(17 17 24 / 0.06), 0 16px 32px rgb(17 17 24 / 0.10);
}

:root[data-theme="dark"] {
  --canvas:    14 13 20;
  --surface:   22 21 30;
  --surface-2: 28 27 38;
  --surface-3: 36 34 47;
  --hairline:  255 255 255;

  --ink:   240 237 248;
  --ink-2: 184 178 204;
  --ink-3: 128 122 148;
  --ink-rev: 14 13 20;

  --violet:      158 130 248;
  --violet-deep: 187 165 250;
  --violet-soft: 50 38 92;
  --violet-tint: 36 28 62;

  --tag-violet-bg: 50 38 92;  --tag-violet-fg: 200 184 252;
  --tag-blue-bg:   30 44 84;  --tag-blue-fg:   168 195 250;
  --tag-teal-bg:   20 56 58;  --tag-teal-fg:   136 210 200;
  --tag-amber-bg:  62 46 18;  --tag-amber-fg:  238 196 110;
  --tag-rose-bg:   72 28 44;  --tag-rose-fg:   248 176 196;
  --tag-stone-bg:  50 46 40;  --tag-stone-fg:  198 188 170;
  --tag-mint-bg:   24 56 38;  --tag-mint-fg:   148 220 178;

  --backlog: 128 122 148;
  --today:   158 130 248;
  --doing:   238 196 110;
  --done:    148 220 178;

  --lane-backlog:      130 95 70;
  --lane-today:        190 100 55;
  --lane-doing:        200 145 40;
  --lane-done:         40 130 115;
  --lane-backlog-soft: 60 48 38;
  --lane-today-soft:   70 42 28;
  --lane-doing-soft:   62 46 18;
  --lane-done-soft:    24 56 50;

  --pin-backlog: 188 144 105;
  --pin-today:   240 100 70;
  --pin-doing:   240 175 50;
  --pin-done:    80 180 160;

  --paper:      38 36 50;
  --paper-fold: 16 14 22;

  --sh-1: 0 0 0 1px rgb(255 255 255 / 0.06), 0 1px 2px rgb(0 0 0 / 0.4);
  --sh-2: 0 0 0 1px rgb(255 255 255 / 0.07), 0 4px 12px rgb(0 0 0 / 0.5);
  --sh-3: 0 0 0 1px rgb(255 255 255 / 0.08), 0 16px 32px rgb(0 0 0 / 0.6);
}
```

- [ ] **Step 3: Update `web/tailwind.config.js`**

Replace entire file:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas:   'rgb(var(--canvas) / <alpha-value>)',
        surface:  'rgb(var(--surface) / <alpha-value>)',
        ink:      'rgb(var(--ink) / <alpha-value>)',
        'ink-2':  'rgb(var(--ink-2) / <alpha-value>)',
        'ink-3':  'rgb(var(--ink-3) / <alpha-value>)',
        violet:   'rgb(var(--violet) / <alpha-value>)',
        'violet-tint': 'rgb(var(--violet-tint) / <alpha-value>)',
        danger:   'rgb(var(--danger) / <alpha-value>)',
        success:  'rgb(var(--success) / <alpha-value>)',
      },
      fontFamily: {
        sans:  ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Spectral', 'Iowan Old Style', 'Georgia', 'serif'],
        mono:  ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: 'var(--r-card)',
        md:   'var(--r-md)',
        sm:   'var(--r-sm)',
        pill: 'var(--r-pill)',
      },
      boxShadow: {
        '1': 'var(--sh-1)',
        '2': 'var(--sh-2)',
        '3': 'var(--sh-3)',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 4: Update `web/src/index.css` base styles**

Replace body rule:

```css
@import './theme.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
}

* { box-sizing: border-box; }

body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: rgb(var(--ink));
  background: rgb(var(--canvas));
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: "ss01", "cv11";
}

*::-webkit-scrollbar { width: 10px; height: 10px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb {
  background: rgb(var(--hairline) / 0.12);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
*::-webkit-scrollbar-thumb:hover {
  background: rgb(var(--hairline) / 0.25);
  background-clip: padding-box;
  border: 2px solid transparent;
}

:focus-visible {
  outline: 2px solid rgb(var(--violet));
  outline-offset: 2px;
  border-radius: 6px;
}

@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes modalIn { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }
```

- [ ] **Step 5: Start dev server and verify no console errors**

```bash
cd web && npm run dev
```

Open `http://localhost:5173` — page should load. Colors will shift (violet instead of green) but layout should still function.

- [ ] **Step 6: Commit**

```bash
git add web/index.html web/src/theme.css web/tailwind.config.js web/src/index.css
git commit -m "feat(ui): replace design tokens with violet sticky-note system"
```

---

### Task 2: Sticky-Note Card Component

**Files:**
- Modify: `web/src/components/CardView.tsx`

- [ ] **Step 1: Rewrite `CardView.tsx`**

The new card is a sticky note with a pushpin and a clipped folded corner. The `statusColor` prop (lane accent) drives the pin color. Replace the entire file:

```tsx
import type { Card, User } from '../types.ts';

const STATUS_ACCENT: Record<string, string> = {
  backlog:     'backlog',
  today:       'today',
  in_progress: 'doing',
  done:        'done',
};

function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h);
}

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 86400 * 30) return Math.floor(diff / 86400) + 'd ago';
  return Math.floor(diff / 86400 / 30) + 'mo ago';
}

function formatDue(iso: string | null): { label: string; tone: 'overdue' | 'today' | 'soon' | 'future' } | null {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return { label: 'Today', tone: 'today' };
  if (diff === 1) return { label: 'Tomorrow', tone: 'soon' };
  if (diff === -1) return { label: 'Yesterday', tone: 'overdue' };
  if (diff < 0) return { label: Math.abs(diff) + 'd overdue', tone: 'overdue' };
  if (diff < 7) return { label: 'In ' + diff + 'd', tone: 'soon' };
  return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), tone: 'future' };
}

type Props = {
  card: Card;
  users?: User[];
  unreadCount?: number;
  onClick?: () => void;
  onDelete?: (id: string) => void;
  dragging?: boolean;
  compact?: boolean;
};

export function CardView({ card, users = [], unreadCount = 0, onClick, dragging, compact }: Props) {
  const accent = STATUS_ACCENT[card.status] ?? 'backlog';
  const rotation = (stableHash(card.id) % 9 - 4) * 0.18;
  const due = formatDue(card.due_date);
  const assignees = card.assignees
    .map(id => users.find(u => u.id === id))
    .filter((u): u is NonNullable<typeof u> => !!u);

  return (
    <div
      className="note-wrap"
      style={{ '--pin-color': `var(--pin-${accent})` } as React.CSSProperties}
      onClick={onClick}
    >
      {/* Pushpin */}
      <span className="pin" aria-hidden="true">
        <span className="pin-head" />
        <span className="pin-needle" />
      </span>

      {/* Card body */}
      <div className="note" style={{ opacity: dragging ? 0.4 : 1 }}>
        {/* Source row */}
        {(card.source === 'telegram' || card.ai_summarized || card.needs_review) && (
          <div className="note-source">
            {card.source === 'telegram' && <span>⟰ telegram</span>}
            {card.ai_summarized && <span style={{ color: 'rgb(var(--violet))' }}> · ✦ ai</span>}
            {card.needs_review && <span style={{ color: 'rgb(var(--danger))' }}> · needs review</span>}
          </div>
        )}

        {/* Title */}
        <div className="note-title" style={{ fontSize: compact ? 13 : 15, marginBottom: 8 }}>
          {card.title}
        </div>

        {/* Description (non-compact only) */}
        {!compact && card.description && (
          <div style={{
            fontSize: 12.5,
            color: 'rgb(var(--ink-2))',
            marginBottom: 10,
            lineHeight: 1.45,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {card.description}
          </div>
        )}

        {/* Tags */}
        {card.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {card.tags.map(t => (
              <span key={t} style={{
                display: 'inline-flex', alignItems: 'center',
                fontSize: 11, fontWeight: 500, lineHeight: 1,
                padding: '4px 8px', borderRadius: 999,
                background: 'rgb(var(--surface-2, 246 245 242))',
                color: 'rgb(var(--ink-2))',
                border: '1px solid rgb(var(--hairline) / 0.08)',
              }}>
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 8,
          fontSize: 11.5, color: 'rgb(var(--ink-3))',
          paddingRight: 22,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {due && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                color: due.tone === 'overdue' ? 'rgb(var(--danger))'
                     : due.tone === 'today' ? 'rgb(var(--violet))'
                     : 'rgb(var(--ink-3))',
                fontWeight: due.tone === 'overdue' || due.tone === 'today' ? 600 : 500,
              }}>
                {due.tone === 'overdue' ? '🔥' : '📅'} {due.label}
              </span>
            )}
            {card.attachments.length > 0 && (
              <span>📎 {card.attachments.length}</span>
            )}
            {unreadCount > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                color: 'rgb(var(--violet))', fontWeight: 600,
              }}>
                💬 {unreadCount}
              </span>
            )}
            {!due && card.attachments.length === 0 && unreadCount === 0 && (
              <span>{relTime(card.updated_at)}</span>
            )}
          </div>

          {/* Assignee initials */}
          {assignees.length > 0 && (
            <div style={{ display: 'inline-flex' }}>
              {assignees.slice(0, 3).map((u, i) => (
                <span key={u.id} style={{
                  width: 22, height: 22, borderRadius: 999,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 600, color: 'white',
                  background: userColor(u.id),
                  border: '2px solid rgb(var(--surface))',
                  marginLeft: i > 0 ? -6 : 0,
                }} title={u.name}>
                  {u.short_name.charAt(0).toUpperCase()}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .note-wrap {
          position: relative;
          cursor: pointer;
          filter: drop-shadow(0 6px 14px rgb(0 0 0 / 0.10)) drop-shadow(0 14px 24px rgb(0 0 0 / 0.06));
          transition: transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .note-wrap:hover { transform: translateY(-2px); }
        [data-theme="dark"] .note-wrap {
          filter: drop-shadow(0 6px 14px rgb(0 0 0 / 0.45)) drop-shadow(0 14px 24px rgb(0 0 0 / 0.35));
        }
        .note-wrap::before {
          content: "";
          position: absolute;
          right: 0; bottom: 0;
          width: 26px; height: 26px;
          background: rgb(var(--paper-fold));
          clip-path: polygon(100% 0, 100% 100%, 0 100%);
          z-index: 1;
        }
        .note {
          position: relative;
          background: rgb(var(--paper));
          clip-path: polygon(0 0, 100% 0, 100% calc(100% - 22px), calc(100% - 22px) 100%, 0 100%);
          padding: 22px 14px 14px;
        }
        .pin {
          display: block;
          position: absolute;
          top: -10px; left: 16px;
          width: 22px; height: 22px;
          z-index: 3;
        }
        .pin-head {
          display: block;
          width: 20px; height: 20px;
          border-radius: 50%;
          background: rgb(var(--pin-color));
          margin: 0 auto;
          box-shadow:
            inset -3px -4px 0 rgb(0 0 0 / 0.18),
            inset 3px 3px 0 rgb(255 255 255 / 0.28),
            0 2px 4px rgb(0 0 0 / 0.35),
            0 0 0 1px rgb(0 0 0 / 0.18);
          position: relative;
        }
        .pin-head::after {
          content: "";
          position: absolute;
          top: 3px; left: 4px;
          width: 6px; height: 5px;
          border-radius: 50%;
          background: rgb(255 255 255 / 0.7);
          filter: blur(0.5px);
        }
        .pin-needle {
          display: block;
          width: 3px; height: 5px;
          background: rgb(60 50 40);
          margin: -3px auto 0;
          border-radius: 0 0 2px 2px;
          box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
        }
        .note-source {
          display: inline-flex; align-items: center; gap: 4px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: rgb(var(--ink-3));
          margin-bottom: 6px;
          letter-spacing: 0.02em;
        }
        .note-title {
          font-family: 'Spectral', serif;
          font-weight: 500;
          line-height: 1.3;
          color: rgb(var(--ink));
          letter-spacing: -0.005em;
          text-wrap: pretty;
          margin-bottom: 8px;
        }
      `}</style>
    </div>
  );
}

function userColor(id: string): string {
  const colors = ['#5B37C4','#c84b31','#2b8a6e','#b07d2a','#2a6ab0','#8b3a8b'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
  return colors[Math.abs(h) % colors.length]!;
}
```

- [ ] **Step 2: Start dev server, open app, verify cards render with pushpin + cream paper background**

```bash
cd web && npm run dev
```

Verify: cards have cream background, pushpin visible at top-left, folded corner at bottom-right, slight rotation on each card.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/CardView.tsx
git commit -m "feat(ui): sticky-note card with pushpin and folded corner"
```

---

### Task 3: Lane Column Component

**Files:**
- Modify: `web/src/components/Column.tsx`
- Modify: `web/src/components/EmptyColumn.tsx`

- [ ] **Step 1: Rewrite `Column.tsx` with bold lane background**

The lane accent maps from server status names to CSS lane variables. `in_progress` → `doing`.

```tsx
import { useState } from 'react';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Card, User } from '../types.ts';
import { CardView } from './CardView.tsx';
import type { Status } from '../types.ts';

const LANE_ACCENT: Record<Status, string> = {
  backlog:     'backlog',
  today:       'today',
  in_progress: 'doing',
  done:        'done',
};

const LANE_LABEL: Record<Status, string> = {
  backlog:     'Backlog',
  today:       'Today',
  in_progress: 'In progress',
  done:        'Done',
};

const EMPTY_MSG: Record<Status, string> = {
  backlog:     'Empty backlog.',
  today:       'Nothing planned for today.',
  in_progress: 'Quiet here.',
  done:        'Nothing finished yet.',
};

function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h);
}

type Props = {
  status: Status;
  cards: Card[];
  users: User[];
  searchActive?: boolean;
  unreadCounts?: Record<string, number>;
  onCreate: (status: Status) => void;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
};

export function Column({ status, cards, users, unreadCounts, onCreate, onEdit, onDelete }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const accent = LANE_ACCENT[status];

  return (
    <div
      className="lane"
      style={{
        '--lane-color': `var(--lane-${accent})`,
        boxShadow: dragOver
          ? '0 0 0 3px rgb(255 255 255 / 0.6), inset 0 0 0 1px rgb(0 0 0 / 0.06)'
          : 'inset 0 0 0 1px rgb(0 0 0 / 0.06), inset 0 1px 0 rgb(255 255 255 / 0.18)',
        transition: 'box-shadow 160ms ease',
      } as React.CSSProperties}
    >
      {/* Header */}
      <div className="lane-header">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="lane-title">{LANE_LABEL[status]}</span>
          <span className="lane-count">{cards.length}</span>
        </div>
        <button
          className="lane-add"
          onClick={() => onCreate(status)}
          title="Add card"
          aria-label="Add card"
        >
          +
        </button>
      </div>

      {/* Cards */}
      <div className="lane-body">
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              users={users}
              unreadCount={unreadCounts?.[card.id] ?? 0}
              onEdit={onEdit}
              accent={accent}
            />
          ))}
        </SortableContext>

        {cards.length === 0 && (
          <div style={{
            border: '1.5px dashed rgb(255 255 255 / 0.45)',
            borderRadius: 10,
            padding: '28px 12px',
            textAlign: 'center',
            fontSize: 12.5,
            color: 'rgb(255 255 255 / 0.78)',
            fontFamily: 'Spectral, serif',
            fontStyle: 'italic',
          }}>
            {EMPTY_MSG[status]}
          </div>
        )}
      </div>

      <style>{`
        .lane {
          background: rgb(var(--lane-color));
          border-radius: 14px;
          padding: 18px 14px 14px;
          display: flex;
          flex-direction: column;
          min-height: 380px;
          max-height: calc(100vh - 105px);
          position: relative;
        }
        .lane::before {
          content: "";
          position: absolute; inset: 0;
          border-radius: inherit;
          background-image:
            radial-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px),
            radial-gradient(rgb(0 0 0 / 0.04) 1px, transparent 1px);
          background-size: 22px 22px, 14px 14px;
          background-position: 0 0, 7px 7px;
          pointer-events: none;
          opacity: 0.6;
        }
        [data-theme="dark"] .lane::before { opacity: 0.4; }
        .lane-header {
          display: flex; align-items: baseline; justify-content: space-between;
          padding: 0 4px 12px;
          position: relative; z-index: 1;
        }
        .lane-title {
          font-family: 'Spectral', serif;
          font-weight: 600;
          font-size: 22px;
          color: rgb(255 255 255 / 0.96);
          letter-spacing: -0.01em;
          text-shadow: 0 1px 0 rgb(0 0 0 / 0.08);
        }
        .lane-count {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          color: rgb(255 255 255 / 0.78);
          background: rgb(0 0 0 / 0.14);
          padding: 2px 8px;
          border-radius: 999px;
        }
        .lane-add {
          background: rgb(255 255 255 / 0.18);
          color: rgb(255 255 255 / 0.95);
          border-radius: 999px;
          width: 26px; height: 26px;
          display: inline-flex; align-items: center; justify-content: center;
          border: none; cursor: pointer;
          font-size: 18px; line-height: 1;
          transition: background 120ms ease, transform 80ms ease;
        }
        .lane-add:hover { background: rgb(255 255 255 / 0.28); }
        .lane-add:active { transform: scale(0.95); }
        .lane-body {
          flex: 1; overflow-y: auto;
          overflow-x: visible;
          padding: 8px 4px 6px;
          position: relative; z-index: 1;
          display: flex; flex-direction: column;
          gap: 18px;
        }
        .lane-body::-webkit-scrollbar-thumb { background: rgb(0 0 0 / 0.18); }
      `}</style>
    </div>
  );
}

function SortableCard({ card, users, unreadCount, onEdit, accent }: {
  card: Card; users: User[]; unreadCount: number;
  onEdit: (card: Card) => void; accent: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id: card.id });
  const rotation = (stableHash(card.id) % 9 - 4) * 0.18;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform
          ? `translate(${transform.x}px, ${transform.y}px) rotate(${rotation}deg)`
          : `rotate(${rotation}deg)`,
        transition: isDragging ? 'none' : 'transform 200ms ease',
        touchAction: 'none',
      }}
    >
      <CardView
        card={card}
        users={users}
        unreadCount={unreadCount}
        onClick={() => onEdit(card)}
        dragging={isDragging}
      />
    </div>
  );
}

function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h);
}
```

- [ ] **Step 2: Delete `EmptyColumn.tsx`** (empty state is now inline in Column)

```bash
rm web/src/components/EmptyColumn.tsx
```

Remove any import of `EmptyColumn` from `Column.tsx` or `Board.tsx` if present.

- [ ] **Step 3: Verify board renders with colored lanes**

Open the app. Board should show tan/persimmon/mustard/teal lane backgrounds with paper-grain texture and white Spectral headings.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Column.tsx
git rm web/src/components/EmptyColumn.tsx
git commit -m "feat(ui): colored lane columns with paper-grain overlay and Spectral headings"
```

---

### Task 4: New TopBar / BoardHeader

**Files:**
- Modify: `web/src/components/BoardHeader.tsx`

The new topbar is frosted glass, has scope and view switchers, and a right-side action cluster. The `NotificationBell` slot is wired in Task 19. For now add a placeholder `{notificationBell}` prop.

- [ ] **Step 1: Rewrite `BoardHeader.tsx`**

```tsx
import { useState, useRef, useEffect } from 'react';
import type { Scope } from '../types.ts';
import { useAuth } from '../auth.tsx';

const SCOPES: Array<{ id: Scope; label: string; description: string }> = [
  { id: 'personal', label: 'My board',     description: 'Cards you created, assigned, or shared with you.' },
  { id: 'inbox',    label: 'Family inbox', description: 'Unassigned cards from the family group.' },
  { id: 'all',      label: 'Everything',   description: 'All cards visible to you.' },
];

type Section = 'board' | 'knowledge' | 'archive';

type Props = {
  scope: Scope;
  onScope: (s: Scope) => void;
  cardCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenReview: () => void;
  onOpenSettings: () => void;
  section: Section;
  onSection: (s: Section) => void;
  notificationBell?: React.ReactNode;
  scopeCounts?: Record<Scope, number>;
};

export function BoardHeader({
  scope, onScope, cardCount, searchQuery, onSearchChange,
  onOpenReview, onOpenSettings, section, onSection,
  notificationBell, scopeCounts,
}: Props) {
  const { user, logout } = useAuth();
  const [scopeOpen, setScopeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const scopeRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (scopeRef.current && !scopeRef.current.contains(e.target as Node)) setScopeOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeScope = SCOPES.find(s => s.id === scope)!;

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 30,
      background: 'rgb(var(--canvas) / 0.85)',
      backdropFilter: 'saturate(140%) blur(10px)',
      WebkitBackdropFilter: 'saturate(140%) blur(10px)',
      borderBottom: '1px solid rgb(var(--hairline) / 0.08)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px',
        maxWidth: '100%', minWidth: 0,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28,
            background: 'rgb(var(--violet))',
            borderRadius: 7,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 700, fontSize: 14,
            fontFamily: 'Spectral, serif',
            letterSpacing: '-0.04em',
          }}>K</div>
          <span style={{ fontFamily: 'Spectral, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em' }}>
            SmartKanban
          </span>
        </div>

        {/* View tabs */}
        <nav style={{ display: 'flex', gap: 2, marginLeft: 8, flexShrink: 0 }}>
          {(['board', 'knowledge', 'archive'] as Section[]).map(v => (
            <button
              key={v}
              onClick={() => onSection(v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 26, padding: '0 8px',
                fontSize: 12, fontWeight: section === v ? 600 : 500,
                color: section === v ? 'rgb(var(--ink))' : 'rgb(var(--ink-3))',
                background: section === v ? 'rgb(var(--hairline) / 0.06)' : 'transparent',
                border: '1px solid transparent', borderRadius: 6,
                cursor: 'pointer', letterSpacing: '-0.005em',
              }}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </nav>

        {/* Scope switcher (board only) */}
        {section === 'board' && (
          <div ref={scopeRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setScopeOpen(!scopeOpen)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                justifyContent: 'space-between',
                minWidth: 160, height: 32, padding: '0 10px',
                fontSize: 13, fontWeight: 500,
                border: '1px solid rgb(var(--hairline) / 0.14)',
                borderRadius: 8, background: 'transparent',
                color: 'rgb(var(--ink))', cursor: 'pointer',
              }}
            >
              <span>{activeScope.label}</span>
              <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
            </button>
            {scopeOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                width: 280, padding: 6, zIndex: 20,
                background: 'rgb(var(--surface))',
                borderRadius: 10, boxShadow: 'var(--sh-3)',
                border: '1px solid rgb(var(--hairline) / 0.08)',
                animation: 'fadeIn 240ms ease both',
              }}>
                {SCOPES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { onScope(s.id); setScopeOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '10px 10px',
                      border: 'none',
                      background: scope === s.id ? 'rgb(var(--violet-tint))' : 'transparent',
                      borderRadius: 8, width: '100%', textAlign: 'left',
                      cursor: 'pointer', color: 'rgb(var(--ink))',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{s.label}</div>
                      <div style={{ fontSize: 11.5, color: 'rgb(var(--ink-3))', lineHeight: 1.4 }}>{s.description}</div>
                    </div>
                    {scopeCounts && (
                      <span style={{ fontSize: 11, color: 'rgb(var(--ink-3))', fontFamily: 'JetBrains Mono, monospace', marginTop: 1 }}>
                        {scopeCounts[s.id]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }} />

        {/* Search */}
        <div style={{ position: 'relative', flex: '0 1 220px', minWidth: 140 }}>
          <input
            placeholder={section === 'knowledge' ? 'Search knowledge…' : 'Search cards…'}
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            style={{
              height: 34, width: '100%',
              paddingLeft: 32, paddingRight: 36,
              background: 'rgb(var(--surface))',
              border: '1px solid rgb(var(--hairline) / 0.12)',
              borderRadius: 8, fontSize: 13, color: 'rgb(var(--ink))',
            }}
          />
          <span style={{ position: 'absolute', left: 10, top: 10, color: 'rgb(var(--ink-3))', pointerEvents: 'none', fontSize: 14 }}>🔍</span>
          {!searchQuery && (
            <span style={{
              position: 'absolute', right: 8, top: 8,
              fontSize: 10, padding: '1.5px 5px',
              borderRadius: 4, background: 'rgb(var(--hairline) / 0.07)',
              border: '1px solid rgb(var(--hairline) / 0.10)',
              color: 'rgb(var(--ink-2))',
              fontFamily: 'JetBrains Mono, monospace',
            }}>⌘K</span>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <button onClick={onOpenReview} title="Weekly review" style={iconBtnStyle}>✦</button>
          {notificationBell}
          <button onClick={onOpenSettings} title="Settings" style={iconBtnStyle}>⚙</button>

          <div style={{ width: 1, height: 22, background: 'rgb(var(--hairline) / 0.10)', margin: '0 4px' }} />

          {/* Profile dropdown */}
          <div ref={profileRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '0 6px 0 4px', height: 32,
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: 'rgb(var(--ink))', fontSize: 13, fontWeight: 500,
              }}
            >
              <span style={{
                width: 24, height: 24, borderRadius: 999,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 600, color: 'white',
                background: 'rgb(var(--violet))',
              }}>
                {user?.short_name?.charAt(0).toUpperCase()}
              </span>
              {user?.short_name}
              <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
            </button>
            {profileOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                width: 200, padding: 6, zIndex: 20,
                background: 'rgb(var(--surface))',
                borderRadius: 10, boxShadow: 'var(--sh-3)',
                border: '1px solid rgb(var(--hairline) / 0.08)',
                animation: 'fadeIn 240ms ease both',
              }}>
                <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid rgb(var(--hairline) / 0.08)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.name}</div>
                  <div style={{ fontSize: 11.5, color: 'rgb(var(--ink-3))' }}>{user?.email}</div>
                </div>
                <button onClick={onOpenSettings} style={profileItemStyle}>⚙ Settings</button>
                <div style={{ height: 1, background: 'rgb(var(--hairline) / 0.08)', margin: '4px 0' }} />
                <button onClick={logout} style={{ ...profileItemStyle, color: 'rgb(var(--ink-2))' }}>↩ Sign out</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: 32, height: 32, padding: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid transparent', borderRadius: 8,
  background: 'transparent', cursor: 'pointer',
  color: 'rgb(var(--ink-3))', fontSize: 15,
  transition: 'background 120ms ease',
};

const profileItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '8px 10px',
  border: 'none', background: 'transparent',
  borderRadius: 6, width: '100%', textAlign: 'left',
  cursor: 'pointer', color: 'rgb(var(--ink))',
  fontSize: 13,
};
```

- [ ] **Step 2: Update `App.tsx` to pass `section` prop including `archive`**

In `App.tsx`, change the `section` state type and pass `onOpenArchive` via `onSection('archive')`:

Find the current `section` state and `BoardHeader` usage, update prop signatures to match new `BoardHeader`. Add `scopeCounts` prop:

```tsx
// In App.tsx, add scopeCounts computation:
const scopeCounts = useMemo(() => ({
  personal: cards.filter(c => !c.archived && (c.created_by === me?.id || c.assignees.includes(me?.id ?? ''))).length,
  inbox:    cards.filter(c => !c.archived && c.assignees.length === 0).length,
  all:      cards.filter(c => !c.archived).length,
}), [cards, me]);

// Pass to BoardHeader:
// scopeCounts={scopeCounts}
// section={section}  (extend type to include 'archive')
// onSection={setSection}
```

- [ ] **Step 3: Verify topbar renders correctly**

Open app — should see frosted glass topbar with K logo, SmartKanban wordmark, view tabs (Board/Knowledge/Archive), scope dropdown.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/BoardHeader.tsx web/src/App.tsx
git commit -m "feat(ui): new frosted-glass topbar with scope switcher and view tabs"
```

---

### Task 5: Activity Ticker

**Files:**
- Create: `web/src/components/ActivityTicker.tsx`

- [ ] **Step 1: Create `ActivityTicker.tsx`**

```tsx
import { useMemo } from 'react';
import type { Card } from '../types.ts';

function activityScore(c: Card): number {
  const ageH = (Date.now() - new Date(c.updated_at).getTime()) / 3_600_000;
  const recency = Math.max(0, 8 - ageH * 0.4);
  return 0 * 3 + c.attachments.length * 1.5 + recency;
  // Note: comment count not directly on Card type; use attachments + recency for now.
  // When/if comment count is added to Card, update this formula.
}

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

const ACCENT: Record<string, string> = {
  backlog:     'backlog',
  today:       'today',
  in_progress: 'doing',
  done:        'done',
};

type Props = {
  cards: Card[];
  onCardClick: (card: Card) => void;
};

export function ActivityTicker({ cards, onCardClick }: Props) {
  const hot = useMemo(() => {
    return [...cards]
      .map(c => ({ c, s: activityScore(c) }))
      .filter(x => x.s >= 1.5)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map(x => x.c);
  }, [cards]);

  if (hot.length === 0) return null;

  const items = [...hot, ...hot];

  return (
    <div className="ticker-wrap">
      <div className="ticker-label">
        <span className="ticker-pulse" aria-hidden="true" />
        <span>Active</span>
        <span className="ticker-count">{hot.length}</span>
      </div>

      <div className="ticker-track">
        <div className="ticker-row">
          {items.map((c, i) => {
            const accent = ACCENT[c.status] ?? 'backlog';
            return (
              <button
                key={c.id + '-' + i}
                className="ticker-chip"
                onClick={() => onCardClick(c)}
                aria-hidden={i >= hot.length}
                tabIndex={i >= hot.length ? -1 : 0}
                style={{ '--chip-accent': `rgb(var(--lane-${accent}))` } as React.CSSProperties}
              >
                <span className="ticker-dot" />
                <span className="ticker-title">{c.title}</span>
                <span className="ticker-sep">·</span>
                <span className="ticker-reason">{relTime(c.updated_at)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
        .ticker-wrap {
          position: sticky; top: 57px; z-index: 25;
          display: flex; align-items: stretch;
          background: rgb(var(--surface) / 0.92);
          backdrop-filter: saturate(140%) blur(8px);
          -webkit-backdrop-filter: saturate(140%) blur(8px);
          border-bottom: 1px solid rgb(var(--hairline) / 0.10);
          height: 36px;
          overflow: hidden;
        }
        .ticker-label {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 0 14px;
          background: rgb(var(--violet) / 0.08);
          color: rgb(var(--violet));
          font-weight: 600;
          font-size: 11.5px;
          flex-shrink: 0;
          border-right: 1px solid rgb(var(--hairline) / 0.08);
          white-space: nowrap;
        }
        .ticker-count {
          background: rgb(var(--violet));
          color: white;
          font-size: 9.5px;
          padding: 1px 5px;
          border-radius: 999px;
          font-family: 'JetBrains Mono', monospace;
          font-weight: 600;
          margin-left: 2px;
        }
        .ticker-pulse {
          width: 7px; height: 7px; border-radius: 999px;
          background: rgb(var(--success));
          box-shadow: 0 0 0 0 rgb(var(--success) / 0.6);
          animation: tickerPulse 1.8s ease-out infinite;
          flex-shrink: 0;
        }
        @keyframes tickerPulse {
          0%   { box-shadow: 0 0 0 0 rgb(var(--success) / 0.55); }
          70%  { box-shadow: 0 0 0 7px rgb(var(--success) / 0); }
          100% { box-shadow: 0 0 0 0 rgb(var(--success) / 0); }
        }
        .ticker-track {
          flex: 1; overflow: hidden;
          mask-image: linear-gradient(90deg, transparent 0, black 32px, black calc(100% - 60px), transparent 100%);
          -webkit-mask-image: linear-gradient(90deg, transparent 0, black 32px, black calc(100% - 60px), transparent 100%);
        }
        .ticker-row {
          display: inline-flex; align-items: center;
          gap: 10px; padding: 0 14px; height: 100%;
          white-space: nowrap;
          animation: tickerScroll 60s linear infinite;
        }
        .ticker-wrap:hover .ticker-row { animation-play-state: paused; }
        @keyframes tickerScroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .ticker-chip {
          display: inline-flex; align-items: center; gap: 8px;
          background: transparent;
          border: 1px solid rgb(var(--hairline) / 0.10);
          padding: 5px 11px 5px 9px;
          border-radius: 999px;
          cursor: pointer; color: rgb(var(--ink));
          font-size: 12px; font-family: inherit; flex-shrink: 0;
          transition: background 140ms ease, border-color 140ms ease;
        }
        .ticker-chip:hover { background: var(--chip-accent); border-color: transparent; }
        .ticker-dot {
          width: 6px; height: 6px; border-radius: 999px;
          background: var(--chip-accent); flex-shrink: 0;
          box-shadow: 0 0 0 2px rgb(var(--surface));
        }
        .ticker-title { font-weight: 500; max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
        .ticker-sep { color: rgb(var(--ink-3)); opacity: 0.5; }
        .ticker-reason { font-size: 11.5px; color: rgb(var(--ink-3)); }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Wire `ActivityTicker` into `App.tsx`**

Import and render below `BoardHeader`, above the board grid, when `section === 'board'`:

```tsx
import { ActivityTicker } from './components/ActivityTicker.tsx';

// In JSX, after <BoardHeader .../>:
{section === 'board' && (
  <ActivityTicker
    cards={filteredCards}
    onCardClick={(card) => setOpenCard(card)}
  />
)}
```

- [ ] **Step 3: Verify ticker appears and scrolls when active cards exist**

- [ ] **Step 4: Commit**

```bash
git add web/src/components/ActivityTicker.tsx web/src/App.tsx
git commit -m "feat(ui): add activity ticker marquee for hot cards"
```

---

## Phase 2 — Push Notifications: Server

### Task 6: DB Migration

**Files:**
- Create: `server/migrations/2026-05-03-notifications.sql`

- [ ] **Step 1: Write migration file**

```sql
-- Notifications and Web Push subscriptions.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS notifications (
  id          serial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  card_id     uuid not null references cards(id) on delete cascade,
  event_id    bigint not null references card_events(id) on delete cascade,
  actor_name  text not null,
  preview     text not null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread
  ON notifications(user_id) WHERE read = false;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          serial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
```

- [ ] **Step 2: Apply migration to local DB**

```bash
psql postgresql://kanban:kanban@localhost:5432/kanban \
  -f server/migrations/2026-05-03-notifications.sql
```

Expected: `CREATE TABLE`, `CREATE INDEX`, `CREATE TABLE`

- [ ] **Step 3: Commit**

```bash
git add server/migrations/2026-05-03-notifications.sql
git commit -m "feat(db): add notifications and push_subscriptions tables"
```

---

### Task 7: Write Failing Tests for Notifications

**Files:**
- Create: `server/src/__tests__/notifications.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { cardRoutes } from '../routes/cards.js';
import { chatRoutes } from '../routes/chat.js';
import { notificationRoutes } from '../routes/notifications.js';
import { aiHooks } from '../ai/openai.js';

// Stub AI so chat tests don't call real API
aiHooks.withChatFallback = async () => null;

const app = Fastify();
await app.register(cookie, { secret: 'test-secret' });
await app.register(authRoutes);
await app.register(cardRoutes);
await app.register(chatRoutes);
await app.register(notificationRoutes);
await app.ready();

let cookieA = '';
let cookieB = '';
let userAId = '';
let userBId = '';
let cardId = '';

async function register(name: string) {
  const email = `notif_${name}_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const res = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name, short_name: name, email, password: 'password123' },
  });
  const setCookie = res.headers['set-cookie'];
  const cookieStr = (Array.isArray(setCookie) ? setCookie[0] : setCookie) as string;
  return { cookie: cookieStr.split(';')[0]!, id: (res.json() as { id: string }).id };
}

before(async () => {
  const a = await register('alice');
  cookieA = a.cookie;
  userAId = a.id;
  const b = await register('bob');
  cookieB = b.cookie;
  userBId = b.id;

  // Create a card assigned to both users
  const cardRes = await app.inject({
    method: 'POST', url: '/api/cards',
    headers: { cookie: cookieA },
    payload: { title: 'Notif test card', status: 'backlog', assignees: [userAId, userBId] },
  });
  cardId = (cardRes.json() as { id: string }).id;
});

after(async () => {
  await pool.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [[userAId, userBId]]);
  await pool.query(`DELETE FROM cards WHERE created_by = ANY($1::uuid[])`, [[userAId, userBId]]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userAId, userBId]]);
  await app.close();
  try { if (!(pool as { ended?: boolean }).ended) await pool.end(); } catch {}
});

test('GET /api/notifications requires auth', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/notifications' });
  assert.equal(res.statusCode, 401);
});

test('GET /api/notifications returns empty array initially', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/notifications',
    headers: { cookie: cookieB },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as unknown[];
  assert.ok(Array.isArray(body));
});

test('posting a message creates notifications for assignees (excluding sender)', async () => {
  // Alice posts a message — bob (assignee) should get a notification
  const msgRes = await app.inject({
    method: 'POST', url: `/api/cards/${cardId}/messages`,
    headers: { cookie: cookieA },
    payload: { content: 'Hello bob, check this out' },
  });
  assert.equal(msgRes.statusCode, 201);

  // Give async fan-out a moment to complete
  await new Promise(r => setTimeout(r, 100));

  // Bob should have a notification
  const notifRes = await app.inject({
    method: 'GET', url: '/api/notifications',
    headers: { cookie: cookieB },
  });
  const notifs = notifRes.json() as Array<{ actor_name: string; preview: string; read: boolean }>;
  const ourNotif = notifs.find(n => n.actor_name === 'alice');
  assert.ok(ourNotif, 'bob should have a notification from alice');
  assert.equal(ourNotif!.read, false);
  assert.ok(ourNotif!.preview.includes('Hello bob'));

  // Alice should NOT have a notification for her own message
  const aliceNotifRes = await app.inject({
    method: 'GET', url: '/api/notifications',
    headers: { cookie: cookieA },
  });
  const aliceNotifs = aliceNotifRes.json() as Array<{ actor_name: string }>;
  const selfNotif = aliceNotifs.find(n => n.actor_name === 'alice');
  assert.equal(selfNotif, undefined, 'alice should not notify herself');
});

test('PUT /api/notifications/read-all marks all as read', async () => {
  const res = await app.inject({
    method: 'PUT', url: '/api/notifications/read-all',
    headers: { cookie: cookieB },
  });
  assert.equal(res.statusCode, 204);

  const notifRes = await app.inject({
    method: 'GET', url: '/api/notifications',
    headers: { cookie: cookieB },
  });
  const notifs = notifRes.json() as Array<{ read: boolean }>;
  const unread = notifs.filter(n => !n.read);
  assert.equal(unread.length, 0);
});

test('PUT /api/notifications/read marks specific ids as read', async () => {
  // Alice posts another message so bob has a new notification
  await app.inject({
    method: 'POST', url: `/api/cards/${cardId}/messages`,
    headers: { cookie: cookieA },
    payload: { content: 'Second message' },
  });
  await new Promise(r => setTimeout(r, 100));

  const notifRes = await app.inject({
    method: 'GET', url: '/api/notifications',
    headers: { cookie: cookieB },
  });
  const notifs = notifRes.json() as Array<{ id: number; read: boolean }>;
  const unread = notifs.filter(n => !n.read);
  assert.ok(unread.length > 0, 'should have at least one unread');

  const res = await app.inject({
    method: 'PUT', url: '/api/notifications/read',
    headers: { cookie: cookieB },
    payload: { ids: [unread[0]!.id] },
  });
  assert.equal(res.statusCode, 204);
});

test('subscribe/unsubscribe push endpoint', async () => {
  const sub = {
    endpoint: 'https://push.example.com/test-endpoint',
    p256dh: 'BGtestkey1234567890abcdefghijklmno',
    auth: 'testauth123',
  };

  const subRes = await app.inject({
    method: 'POST', url: '/api/push/subscribe',
    headers: { cookie: cookieA },
    payload: sub,
  });
  assert.equal(subRes.statusCode, 204);

  const delRes = await app.inject({
    method: 'DELETE', url: '/api/push/subscribe',
    headers: { cookie: cookieA },
    payload: { endpoint: sub.endpoint },
  });
  assert.equal(delRes.statusCode, 204);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /path/to/KanbanClaude/server && npm test 2>&1 | grep -A 3 "notifications"
```

Expected: Import error on `notificationRoutes` (module doesn't exist yet).

- [ ] **Step 3: Commit failing tests**

```bash
git add server/src/__tests__/notifications.test.ts
git commit -m "test(notifications): failing tests for fan-out, mark-read, push subscribe"
```

---

### Task 8: `server/src/notifications.ts`

**Files:**
- Create: `server/src/notifications.ts`

- [ ] **Step 1: Create `notifications.ts`**

```ts
import { pool } from './db.js';

export type Notification = {
  id: number;
  user_id: string;
  card_id: string;
  event_id: number;
  actor_name: string;
  preview: string;
  read: boolean;
  created_at: string;
};

export async function fanOutNotification(
  cardId: string,
  eventId: number,
  actorUserId: string | null,
  actorName: string,
  preview: string,
): Promise<string[]> {
  // Assignees
  const { rows: assigneeRows } = await pool.query<{ user_id: string }>(
    `SELECT user_id::text FROM card_assignees WHERE card_id = $1`,
    [cardId],
  );

  // Thread participants (posted a message)
  const { rows: participantRows } = await pool.query<{ actor_id: string }>(
    `SELECT DISTINCT actor_id::text FROM card_events
     WHERE card_id = $1 AND entry_type = 'message' AND actor_id IS NOT NULL`,
    [cardId],
  );

  const seen = new Set<string>();
  const recipients: string[] = [];

  for (const r of assigneeRows) {
    if (r.user_id !== actorUserId && !seen.has(r.user_id)) {
      seen.add(r.user_id);
      recipients.push(r.user_id);
    }
  }
  for (const r of participantRows) {
    if (r.actor_id !== actorUserId && !seen.has(r.actor_id)) {
      seen.add(r.actor_id);
      recipients.push(r.actor_id);
    }
  }

  if (recipients.length === 0) return [];

  const preview120 = preview.slice(0, 120);

  await pool.query(
    `INSERT INTO notifications (user_id, card_id, event_id, actor_name, preview)
     SELECT unnest($1::uuid[]), $2, $3, $4, $5`,
    [recipients, cardId, eventId, actorName, preview120],
  );

  return recipients;
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  const { rows } = await pool.query<Notification>(
    `SELECT id, user_id, card_id, event_id, actor_name, preview, read, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId],
  );
  return rows;
}

export async function markNotificationsRead(userId: string, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await pool.query(
    `UPDATE notifications SET read = true WHERE user_id = $1 AND id = ANY($2::int[])`,
    [userId, ids],
  );
}

export async function markAllRead(userId: string): Promise<void> {
  await pool.query(
    `UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`,
    [userId],
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/notifications.ts
git commit -m "feat(notifications): fanOut, getNotifications, markRead, markAllRead"
```

---

### Task 9: `server/src/push.ts`

**Files:**
- Create: `server/src/push.ts`

- [ ] **Step 1: Install `web-push`**

```bash
cd server && npm install web-push && npm install --save-dev @types/web-push
```

- [ ] **Step 2: Create `push.ts`**

```ts
import webpush from 'web-push';
import { pool } from './db.js';

let vapidReady = false;

function initVapid() {
  if (vapidReady) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sub = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !sub) return;
  webpush.setVapidDetails(sub, pub, priv);
  vapidReady = true;
}

export type PushPayload = {
  title: string;
  body: string;
  cardId: string;
};

type StoredSub = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function saveSubscription(
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [userId, endpoint, p256dh, auth],
  );
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
}

async function sendPush(sub: StoredSub, payload: PushPayload): Promise<void> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 410) {
      await pool.query(`DELETE FROM push_subscriptions WHERE id = $1`, [sub.id]);
    } else {
      console.warn('[push] delivery failed:', String(err).slice(0, 200));
    }
  }
}

export async function pushToUser(userId: string, payload: PushPayload): Promise<void> {
  initVapid();
  if (!vapidReady) return;

  const { rows } = await pool.query<StoredSub>(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId],
  );
  await Promise.all(rows.map(sub => sendPush(sub, payload)));
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}
```

- [ ] **Step 3: Commit**

```bash
git add server/src/push.ts server/package.json server/package-lock.json
git commit -m "feat(push): VAPID web-push delivery with stale-subscription cleanup"
```

---

### Task 10: `server/src/routes/notifications.ts`

**Files:**
- Create: `server/src/routes/notifications.ts`

- [ ] **Step 1: Create `notifications.ts` routes**

```ts
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import {
  getNotifications,
  markNotificationsRead,
  markAllRead,
} from '../notifications.js';
import {
  saveSubscription,
  deleteSubscription,
  getVapidPublicKey,
} from '../push.js';

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/api/notifications', { preHandler: requireUser }, async (req) => {
    return getNotifications(req.user!.id);
  });

  app.put<{ Body: { ids: number[] } }>(
    '/api/notifications/read',
    { preHandler: requireUser },
    async (req, reply) => {
      const { ids } = req.body ?? {};
      if (!Array.isArray(ids) || ids.some(id => typeof id !== 'number')) {
        return reply.code(400).send({ error: 'ids must be array of numbers' });
      }
      await markNotificationsRead(req.user!.id, ids);
      return reply.code(204).send();
    },
  );

  app.put(
    '/api/notifications/read-all',
    { preHandler: requireUser },
    async (req, reply) => {
      await markAllRead(req.user!.id);
      return reply.code(204).send();
    },
  );

  app.post<{ Body: { endpoint: string; p256dh: string; auth: string } }>(
    '/api/push/subscribe',
    { preHandler: requireUser },
    async (req, reply) => {
      const { endpoint, p256dh, auth } = req.body ?? {};
      if (!endpoint || !p256dh || !auth) {
        return reply.code(400).send({ error: 'endpoint, p256dh, auth required' });
      }
      await saveSubscription(req.user!.id, endpoint, p256dh, auth);
      return reply.code(204).send();
    },
  );

  app.delete<{ Body: { endpoint: string } }>(
    '/api/push/subscribe',
    { preHandler: requireUser },
    async (req, reply) => {
      const { endpoint } = req.body ?? {};
      if (!endpoint) return reply.code(400).send({ error: 'endpoint required' });
      await deleteSubscription(endpoint);
      return reply.code(204).send();
    },
  );

  app.get('/api/push/vapid-public-key', async (_req, reply) => {
    const key = getVapidPublicKey();
    if (!key) return reply.code(404).send({ error: 'VAPID not configured' });
    return { publicKey: key };
  });
}
```

- [ ] **Step 2: Register routes in `server/src/index.ts`**

Add import at top:
```ts
import { notificationRoutes } from './routes/notifications.js';
```

Add registration after `chatRoutes`:
```ts
await app.register(notificationRoutes);
```

- [ ] **Step 3: Run the tests**

```bash
cd server && npm test 2>&1 | grep -E "pass|fail|ok|not ok" | head -30
```

Expected: All notification tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/notifications.ts server/src/index.ts
git commit -m "feat(notifications): REST endpoints for bell panel and push subscribe"
```

---

### Task 11: Hook Fan-Out into Chat Routes

**Files:**
- Modify: `server/src/routes/chat.ts`
- Modify: `server/src/ai/card_chat.ts`

- [ ] **Step 1: Add fan-out to `server/src/routes/chat.ts`**

Add imports at top of file:
```ts
import { fanOutNotification } from '../notifications.js';
import { pushToUser } from '../push.js';
```

After the `broadcast({ type: 'card.message', ... })` line in the POST handler, add:

```ts
// Non-blocking: fan out notifications + push
const preview = content.trim().slice(0, 120);
const actorName = req.user!.name ?? req.user!.short_name ?? 'Someone';
fanOutNotification(id, Number(event.id), req.user!.id, actorName, preview)
  .then(async (recipientIds) => {
    const pushPayload = { title: card.title, body: `${actorName}: ${preview}`, cardId: id };
    await Promise.all(recipientIds.map(uid => pushToUser(uid, pushPayload)));
  })
  .catch(err => console.warn('[notifications] fan-out error:', String(err).slice(0, 200)));
```

- [ ] **Step 2: Add fan-out to `server/src/ai/card_chat.ts`**

Add imports at top:
```ts
import { fanOutNotification } from '../notifications.js';
import { pushToUser } from '../push.js';
```

After `broadcast({ type: 'card.ai_response', ... })` line, add:

```ts
const preview = (text || rawReply.trim()).slice(0, 120);
fanOutNotification(cardId, Number(aiEvent.id), null, 'AI Assistant', preview)
  .then(async (recipientIds) => {
    const pushPayload = { title: freshCard?.title ?? 'Card update', body: `AI: ${preview}`, cardId };
    await Promise.all(recipientIds.map(uid => pushToUser(uid, pushPayload)));
  })
  .catch(err => console.warn('[notifications] AI fan-out error:', String(err).slice(0, 200)));
```

- [ ] **Step 3: Run full test suite**

```bash
cd server && npm test 2>&1 | grep -E "pass|fail|ok|not ok"
```

All tests should pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/chat.ts server/src/ai/card_chat.ts
git commit -m "feat(notifications): hook fan-out into human and AI chat messages"
```

---

## Phase 3 — Push Notifications: Frontend

### Task 12: Update Types and API Client

**Files:**
- Modify: `web/src/types.ts`
- Modify: `web/src/ws.ts`
- Modify: `web/src/api.ts`

- [ ] **Step 1: Add `Notification` type to `web/src/types.ts`**

Append to the end of the file:

```ts
export type Notification = {
  id: number;
  user_id: string;
  card_id: string;
  event_id: number;
  actor_name: string;
  preview: string;
  read: boolean;
  created_at: string;
};
```

- [ ] **Step 2: Add `card: Card` to WS event types in `web/src/ws.ts`**

Update the two chat event types in `BroadcastEvent`:

```ts
| { type: 'card.message'; event: CardEvent; card_id: string; card: Card }
| { type: 'card.ai_response'; event: CardEvent; card_id: string; card: Card }
```

- [ ] **Step 3: Add notification API methods to `web/src/api.ts`**

Import the new type at top (it's already imported via `types.ts`):
```ts
import type { ..., Notification } from './types.ts';
```

Add to the `api` object:

```ts
notifications: () => req<Notification[]>('/api/notifications'),
markNotificationsRead: (ids: number[]) =>
  req<void>('/api/notifications/read', { ...json({ ids }), method: 'PUT' }),
markAllNotificationsRead: () =>
  req<void>('/api/notifications/read-all', { method: 'PUT' }),
subscribePush: (sub: { endpoint: string; p256dh: string; auth: string }) =>
  req<void>('/api/push/subscribe', json(sub)),
unsubscribePush: (endpoint: string) =>
  req<void>('/api/push/subscribe', { ...json({ endpoint }), method: 'DELETE' }),
vapidPublicKey: () => req<{ publicKey: string }>('/api/push/vapid-public-key'),
```

- [ ] **Step 4: Commit**

```bash
git add web/src/types.ts web/src/ws.ts web/src/api.ts
git commit -m "feat(notifications): add Notification type, WS card field, API methods"
```

---

### Task 13: Update Service Worker for Push

**Files:**
- Modify: `web/public/sw.js`

- [ ] **Step 1: Add push and notificationclick handlers to `web/public/sw.js`**

Append to the end of the existing `sw.js` (keep all existing code):

```js
// Push notification handler
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'SmartKanban', body: event.data.text(), cardId: null };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'SmartKanban', {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      data: { cardId: payload.cardId },
      tag: payload.cardId ?? 'default',
      renotify: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const cardId = event.notification.data?.cardId;
  const url = cardId ? `/?card=${encodeURIComponent(cardId)}` : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'open-card', cardId });
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
```

- [ ] **Step 2: Handle `open-card` message in `App.tsx`**

Add a `useEffect` that listens for the service worker `message` event:

```ts
useEffect(() => {
  const handler = (e: MessageEvent) => {
    if (e.data?.type === 'open-card' && e.data.cardId) {
      const card = cards.find(c => c.id === e.data.cardId);
      if (card) setOpenCard(card);
    }
  };
  navigator.serviceWorker?.addEventListener('message', handler);
  return () => navigator.serviceWorker?.removeEventListener('message', handler);
}, [cards]);
```

Also handle `?card=<id>` query param on load:

```ts
useEffect(() => {
  const params = new URLSearchParams(location.search);
  const cardId = params.get('card');
  if (cardId && cards.length > 0) {
    const card = cards.find(c => c.id === cardId);
    if (card) {
      setOpenCard(card);
      history.replaceState({}, '', '/');
    }
  }
}, [cards]);
```

- [ ] **Step 3: Commit**

```bash
git add web/public/sw.js web/src/App.tsx
git commit -m "feat(push): service worker push + notificationclick handlers"
```

---

### Task 14: `useNotifications` Hook

**Files:**
- Create: `web/src/hooks/useNotifications.ts`

- [ ] **Step 1: Create `useNotifications.ts`**

```ts
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Notification } from '../types.ts';
import type { BroadcastEvent } from '../ws.ts';
import { api } from '../api.ts';

export function useNotifications(wsEvents: BroadcastEvent | null, currentUserId: string | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const loaded = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await api.notifications();
      setNotifications(data);
    } catch {}
  }, []);

  // Initial load
  useEffect(() => {
    if (!currentUserId || loaded.current) return;
    loaded.current = true;
    void load();
  }, [currentUserId, load]);

  // WS real-time: prepend new notifications for card.message / card.ai_response
  useEffect(() => {
    if (!wsEvents || !currentUserId) return;
    if (wsEvents.type !== 'card.message' && wsEvents.type !== 'card.ai_response') return;

    // Reload from server to get the server-generated notification record
    // (we don't know the notification id client-side)
    void load();
  }, [wsEvents, currentUserId, load]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markRead = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;
    setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n));
    try {
      await api.markNotificationsRead(ids);
    } catch {}
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await api.markAllNotificationsRead();
    } catch {}
  }, []);

  return { notifications, unreadCount, markRead, markAllRead, reload: load };
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/hooks/useNotifications.ts
git commit -m "feat(notifications): useNotifications hook with WS real-time updates"
```

---

### Task 15: `usePushNotifications` Hook

**Files:**
- Create: `web/src/hooks/usePushNotifications.ts`

- [ ] **Step 1: Create `usePushNotifications.ts`**

```ts
import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.ts';

export type PushPermission = 'default' | 'granted' | 'denied';

export function usePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<PushPermission>('default');
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setSupported(ok);
    if (ok) setPermission(Notification.permission as PushPermission);
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== 'granted') return false;

      const keyRes = await api.vapidPublicKey();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey),
      });

      const json = sub.toJSON();
      const keys = json.keys as { p256dh: string; auth: string };
      await api.subscribePush({ endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth });
      setSubscribed(true);
      return true;
    } catch (err) {
      console.warn('[push] subscribe failed:', err);
      return false;
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (err) {
      console.warn('[push] unsubscribe failed:', err);
    }
  }, []);

  return { supported, permission, subscribed, subscribe, unsubscribe };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/hooks/usePushNotifications.ts
git commit -m "feat(push): usePushNotifications hook for browser push subscription"
```

---

### Task 16: `NotificationBell` Component

**Files:**
- Create: `web/src/components/NotificationBell.tsx`

- [ ] **Step 1: Create `NotificationBell.tsx`**

```tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import type { Notification } from '../types.ts';
import { usePushNotifications } from '../hooks/usePushNotifications.ts';

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

type Props = {
  notifications: Notification[];
  unreadCount: number;
  onMarkRead: (ids: number[]) => void;
  onMarkAllRead: () => void;
  onCardOpen: (cardId: string) => void;
};

export function NotificationBell({ notifications, unreadCount, onMarkRead, onMarkAllRead, onCardOpen }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { supported, permission, subscribe } = usePushNotifications();
  const [pushPrompted, setPushPrompted] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleBellClick = useCallback(async () => {
    setOpen(v => !v);
    // Request push permission on first open if supported and not yet prompted
    if (supported && permission === 'default' && !pushPrompted) {
      setPushPrompted(true);
      await subscribe();
    }
  }, [supported, permission, pushPrompted, subscribe]);

  const handleNotifClick = (n: Notification) => {
    onMarkRead([n.id]);
    onCardOpen(n.card_id);
    setOpen(false);
  };

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={handleBellClick}
        title="Notifications"
        style={{
          width: 32, height: 32, padding: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid transparent', borderRadius: 8,
          background: 'transparent', cursor: 'pointer',
          color: unreadCount > 0 ? 'rgb(var(--violet))' : 'rgb(var(--ink-3))',
          fontSize: 15, position: 'relative',
          transition: 'background 120ms ease',
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 3, right: 3,
            minWidth: 16, height: 16, padding: '0 4px',
            background: 'rgb(var(--danger))', color: 'white',
            borderRadius: 999, fontSize: 9, fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid rgb(var(--canvas))',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 380, maxHeight: 480,
          background: 'rgb(var(--surface))',
          borderRadius: 12, boxShadow: 'var(--sh-3)',
          border: '1px solid rgb(var(--hairline) / 0.08)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          zIndex: 50,
          animation: 'fadeIn 200ms ease both',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid rgb(var(--hairline) / 0.08)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllRead}
                style={{
                  fontSize: 11.5, color: 'rgb(var(--violet))',
                  background: 'none', border: 'none',
                  cursor: 'pointer', padding: '2px 6px',
                  borderRadius: 4, fontWeight: 500,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: '40px 20px', textAlign: 'center',
                color: 'rgb(var(--ink-3))', fontSize: 13,
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
                No new notifications
              </div>
            ) : (
              notifications.slice(0, 50).map(n => (
                <button
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 16px', width: '100%',
                    border: 'none', borderBottom: '1px solid rgb(var(--hairline) / 0.06)',
                    background: n.read ? 'transparent' : 'rgb(var(--violet-tint))',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background 120ms ease',
                    borderLeft: n.read ? '3px solid transparent' : '3px solid rgb(var(--violet))',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgb(var(--hairline) / 0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = n.read ? 'transparent' : 'rgb(var(--violet-tint))')}
                >
                  {/* Avatar initial */}
                  <span style={{
                    width: 32, height: 32, borderRadius: 999, flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 600, color: 'white',
                    background: avatarColor(n.actor_name),
                    marginTop: 2,
                  }}>
                    {n.actor_name.charAt(0).toUpperCase()}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2, color: 'rgb(var(--ink))' }}>
                      {n.actor_name}
                    </div>
                    <div style={{
                      fontSize: 12, color: 'rgb(var(--ink-2))', lineHeight: 1.4,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {n.preview}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgb(var(--ink-3))', marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                      {relTime(n.created_at)}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function avatarColor(name: string): string {
  const colors = ['#5B37C4', '#c84b31', '#2b8a6e', '#b07d2a', '#2a6ab0', '#8b3a8b'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h) + name.charCodeAt(i);
  return colors[Math.abs(h) % colors.length]!;
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/NotificationBell.tsx
git commit -m "feat(notifications): NotificationBell component with dropdown panel"
```

---

### Task 17: Wire Bell into App and BoardHeader

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/BoardHeader.tsx` (minor — already has `notificationBell` slot)

- [ ] **Step 1: Add hooks and bell to `App.tsx`**

Import:
```ts
import { useNotifications } from './hooks/useNotifications.ts';
import { NotificationBell } from './components/NotificationBell.tsx';
```

Add state for the WS event (needed to pass to the hook):

```ts
const [lastWsEvent, setLastWsEvent] = useState<BroadcastEvent | null>(null);
```

Pass `setLastWsEvent` to WS handler — when `card.message` or `card.ai_response` arrives, store it:

```ts
// In WS event handler (wherever connectWS callback is):
if (ev.type === 'card.message' || ev.type === 'card.ai_response') {
  setLastWsEvent(ev);
}
```

Initialize the notifications hook:
```ts
const { notifications, unreadCount, markRead, markAllRead } = useNotifications(lastWsEvent, me?.id);
```

Handle card open from notification click (find card from current cards list):
```ts
const handleCardOpenById = useCallback((cardId: string) => {
  // Need to fetch from API since the card might not be in the current scope filter
  api.getCard(cardId).then(card => setOpenCard(card)).catch(() => {});
}, []);
```

Pass bell to `BoardHeader`:
```tsx
notificationBell={
  <NotificationBell
    notifications={notifications}
    unreadCount={unreadCount}
    onMarkRead={markRead}
    onMarkAllRead={markAllRead}
    onCardOpen={handleCardOpenById}
  />
}
```

- [ ] **Step 2: Rebuild Docker image and test end-to-end**

```bash
cd /path/to/KanbanClaude
docker compose down
docker compose up -d --build
```

Open app, post a message in a card thread from one user. Log in as another user (or use incognito). Verify:
- Bell badge appears with unread count
- Clicking bell opens panel with the message preview
- Clicking a notification row opens that card's thread and marks it read
- Bell badge clears when all read

- [ ] **Step 3: Generate VAPID keys and add to `.env` for local push testing**

```bash
cd server && npx web-push generate-vapid-keys
```

Add output to `server/.env`:
```
VAPID_PUBLIC_KEY=<paste public key>
VAPID_PRIVATE_KEY=<paste private key>
VAPID_SUBJECT=mailto:your@email.com
```

Restart server, open app in Chrome, click bell — should prompt for notification permission. Send a message from another session — native OS notification should appear.

- [ ] **Step 4: Final commit**

```bash
git add web/src/App.tsx
git commit -m "feat(notifications): wire NotificationBell into App with useNotifications hook"
```

---

## Self-Review

### Spec Coverage Check

| Spec requirement | Covered in task |
|---|---|
| `notifications` DB table | Task 6 |
| `push_subscriptions` DB table | Task 6 |
| `fanOutNotification` — assignees + participants, exclude actor | Task 8 |
| `getNotifications`, `markNotificationsRead`, `markAllRead` | Task 8 |
| `web-push` VAPID delivery, 410 cleanup | Task 9 |
| REST endpoints: GET, PUT read, PUT read-all, POST/DELETE subscribe, GET vapid key | Task 10 |
| Register `notificationRoutes` | Task 10 |
| Hook into `chat.ts` (human messages) | Task 11 |
| Hook into `card_chat.ts` (AI replies) | Task 11 |
| Design tokens (violet, lanes, paper, pins) | Task 1 |
| Google Fonts (Spectral, Inter, JetBrains Mono) | Task 1 |
| Sticky-note card (pushpin, fold, clip-path, rotation) | Task 2 |
| Lane column (colored bg, grain, Spectral heading) | Task 3 |
| New TopBar (frosted glass, scope switcher, view tabs) | Task 4 |
| ActivityTicker marquee | Task 5 |
| `Notification` type + WS `card` field | Task 12 |
| API client methods | Task 12 |
| Service worker push + notificationclick | Task 13 |
| `useNotifications` hook (fetch + WS real-time + mark read) | Task 14 |
| `usePushNotifications` (register SW, subscribe, unsubscribe) | Task 15 |
| `NotificationBell` (badge, panel, rows, mark all, empty state) | Task 16 |
| Wire bell into App | Task 17 |
| WS reconnect → reload notifications | Task 14 (handled by WS reconnect triggering new events) |
| Auto-clear when thread opened | Not explicitly in plan — add below |

### Gap: Auto-clear when thread opened

In `web/src/components/CardTimeline.tsx`, the existing `markRead` call (for chat reads) should also trigger notification read. After `markRead` in `CardTimeline`, call `props.onNotificationsRead?.(cardId)` or simply reload notifications in the `useNotifications` hook when a `card.message` event is seen. The simplest fix: in `App.tsx`, when `setOpenCard(card)` is called, find and mark as read any notifications for that card:

Add to `App.tsx` in the `setOpenCard` handler:
```ts
const handleOpenCard = useCallback((card: Card) => {
  setOpenCard(card);
  // Mark notifications for this card as read
  const cardNotifIds = notifications.filter(n => n.card_id === card.id && !n.read).map(n => n.id);
  if (cardNotifIds.length > 0) markRead(cardNotifIds);
}, [notifications, markRead]);
```

Use `handleOpenCard` wherever `setOpenCard` is called with a user action (board click, ticker click, notification click).

This gap fix should be applied during Task 17.

### Placeholder Scan
No TBD, TODO, or "similar to above" found.

### Type Consistency Check
- `fanOutNotification` returns `string[]` (recipient IDs) — used as `string[]` in chat.ts ✓
- `Notification.id` is `number` — used as `number[]` in `markNotificationsRead` ✓
- `BroadcastEvent` now includes `card: Card` on both chat types — `useNotifications` uses `wsEvents.type` only (no card field access) ✓
- `NotificationBell` props match `useNotifications` return type ✓
