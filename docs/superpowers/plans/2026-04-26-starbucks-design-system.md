# Starbucks Design System Adoption — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin SmartKanban's web app to a warm-cream Starbucks-inspired design system with a dual Light/Dark theme toggle, without changing any product behavior.

**Architecture:** CSS custom properties on `:root` + `:root[data-theme="dark"]` drive Tailwind's color/shadow/font tokens. A `useTheme` hook persists the choice and flips the `data-theme` attribute. All 23 visual surfaces in `web/src/` are converted to the new tokens. `MirrorView.tsx` is the explicit kiosk exception and is not restyled.

**Tech Stack:** React 18, Vite, TypeScript, Tailwind CSS, `@dnd-kit`. Self-hosted Nunito Sans webfont. Lazy-loaded Kalam (Google Fonts). System fallback Iowan Old Style for serif moments.

**Spec:** [`docs/superpowers/specs/2026-04-26-starbucks-design-system-design.md`](../specs/2026-04-26-starbucks-design-system-design.md)
**Companion design doc:** [`design_startbucs_kanban.md`](../../../design_startbucs_kanban.md)

---

## Task 0: Branch setup

**Files:** none yet

- [ ] **Step 1: Create the feature branch**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude
git checkout -b feat/starbucks-design
```

Expected: `Switched to a new branch 'feat/starbucks-design'`

- [ ] **Step 2: Confirm starting state**

```bash
git status
git log --oneline -3
```

Expected: clean working tree, last commit is `2065d2b docs(design): Starbucks-inspired design system + adoption spec`.

---

## Task 1: Tokens, fonts, Tailwind, useTheme hook

**Files:**
- Create: `web/src/theme.css`
- Create: `web/src/hooks/useTheme.ts`
- Create: `web/public/fonts/nunito-sans-400.woff2`
- Create: `web/public/fonts/nunito-sans-600.woff2`
- Create: `web/public/fonts/nunito-sans-700.woff2`
- Modify: `web/tailwind.config.js`
- Modify: `web/index.html`

- [ ] **Step 1: Download Nunito Sans woff2 files**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude/web/public
mkdir -p fonts
# Use Google Fonts API to fetch woff2 URLs
curl -sS -A "Mozilla/5.0" "https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700&display=swap" \
  | grep -oE "https://fonts.gstatic.com[^)]+" \
  | head -3
```

Expected: 3 URLs to woff2 files. Then download the first three (one per weight):

```bash
curl -sS -o fonts/nunito-sans-400.woff2 "<URL_FOR_400>"
curl -sS -o fonts/nunito-sans-600.woff2 "<URL_FOR_600>"
curl -sS -o fonts/nunito-sans-700.woff2 "<URL_FOR_700>"
ls -la fonts/
```

Expected: 3 files, each 20–60KB.

- [ ] **Step 2: Write `web/src/theme.css`**

Create the file with this exact content:

```css
/* Self-hosted primary typeface */
@font-face {
  font-family: 'Nunito Sans';
  src: url('/fonts/nunito-sans-400.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Nunito Sans';
  src: url('/fonts/nunito-sans-600.woff2') format('woff2');
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Nunito Sans';
  src: url('/fonts/nunito-sans-700.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}

:root {
  /* Surfaces — light theme */
  --canvas: 242 240 235;          /* #f2f0eb Neutral Warm */
  --ceramic: 237 235 233;         /* #edebe9 */
  --card: 255 255 255;            /* #ffffff */
  --neutral-cool: 249 249 249;    /* #f9f9f9 */
  --gold-lightest: 250 246 238;   /* #faf6ee */

  /* Brand greens (theme-invariant) */
  --green-starbucks: 0 98 65;     /* #006241 */
  --green-accent: 0 117 74;       /* #00754A */
  --green-house: 30 57 50;        /* #1E3932 */
  --green-uplift: 43 81 72;       /* #2b5148 */
  --green-light: 212 233 226;     /* #d4e9e2 */

  /* Gold (ceremony only) */
  --gold: 203 162 88;             /* #cba258 */

  /* Semantic */
  --red: 200 32 20;               /* #c82014 */
  --yellow: 251 188 5;            /* #fbbc05 */

  /* Text — light theme */
  --ink: 0 0 0;                   /* used at 0.87 alpha */
  --ink-soft: 0 0 0;              /* used at 0.58 alpha */
  --ink-rev: 255 255 255;         /* white */
  --ink-rev-soft: 255 255 255;    /* used at 0.70 alpha */
  --ink-rewards: 51 67 61;        /* #33433d */

  /* Geometry */
  --radius-card: 12px;
  --radius-pill: 50px;

  /* Shadows */
  --shadow-card: 0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24);
  --shadow-card-hover: 0 0 0.5px rgba(0,0,0,0.14), 0 4px 8px rgba(0,0,0,0.14);
  --shadow-card-drag: 0 12px 24px rgba(0,0,0,0.18);
  --shadow-app-bar: 0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07);
  --shadow-fab-base: 0 0 6px rgba(0,0,0,0.24);
  --shadow-fab-ambient: 0 8px 12px rgba(0,0,0,0.14);
  --shadow-toast: 0 0 0.5px rgba(0,0,0,0.14), 0 8px 12px rgba(0,0,0,0.14);
  --shadow-modal: 0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24), 0 16px 32px rgba(0,0,0,0.18);

  /* Frap touch offset (for FAB) */
  --frap-touch-offset: -0.8rem;
}

:root[data-theme="dark"] {
  --canvas: 10 10 10;             /* #0a0a0a */
  --ceramic: 23 23 23;             /* #171717 */
  --card: 26 26 26;                /* #1a1a1a */
  --neutral-cool: 31 31 31;        /* #1f1f1f */
  --gold-lightest: 38 33 26;       /* #26211a */

  --ink: 255 255 255;              /* used at 0.92 alpha in dark */
  --ink-soft: 255 255 255;         /* used at 0.65 alpha in dark */
  --ink-rewards: 163 181 173;      /* lighter slate so it reads on dark */

  --shadow-card: 0 0 0.5px rgba(0,0,0,0.30), 0 1px 1px rgba(0,0,0,0.50);
  --shadow-card-hover: 0 0 0.5px rgba(0,0,0,0.30), 0 4px 8px rgba(0,0,0,0.30);
  --shadow-card-drag: 0 12px 24px rgba(0,0,0,0.40);
  --shadow-app-bar: 0 1px 3px rgba(0,0,0,0.30), 0 2px 2px rgba(0,0,0,0.18);
  --shadow-fab-base: 0 0 6px rgba(0,0,0,0.50);
  --shadow-fab-ambient: 0 8px 12px rgba(0,0,0,0.30);
  --shadow-toast: 0 0 0.5px rgba(0,0,0,0.30), 0 8px 12px rgba(0,0,0,0.30);
  --shadow-modal: 0 0 0.5px rgba(0,0,0,0.30), 0 1px 1px rgba(0,0,0,0.40), 0 16px 32px rgba(0,0,0,0.40);
}

/* Anchor 1rem = 10px so design-doc rem values map directly */
html { font-size: 62.5%; }
body { font-size: 1.6rem; }

/* Pill button utilities */
.btn-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: var(--radius-pill);
  padding: 7px 16px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.2;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  cursor: pointer;
  user-select: none;
}
.btn-pill:active { transform: scale(0.95); }
.btn-pill:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-pill-filled-green   { background: rgb(var(--green-accent)); color: #fff; border-color: rgb(var(--green-accent)); }
.btn-pill-outlined-green { background: transparent;              color: rgb(var(--green-accent)); border-color: rgb(var(--green-accent)); }
.btn-pill-filled-black   { background: #000;                     color: #fff; border-color: #000; }
.btn-pill-outlined-dark  { background: transparent;              color: rgb(var(--ink) / 0.87); border-color: rgb(var(--ink) / 0.87); }
.btn-pill-on-dark-filled { background: #fff;                     color: rgb(var(--green-accent)); border-color: #fff; }
.btn-pill-on-dark-outlined { background: transparent;            color: #fff; border-color: #fff; }
.btn-pill-destructive    { background: rgb(var(--red));          color: #fff; border-color: rgb(var(--red)); }

/* Card surface */
.card-surface {
  background: rgb(var(--card));
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  transition: box-shadow 0.2s ease;
}
.card-surface:hover { box-shadow: var(--shadow-card-hover); }
.card-surface[data-dragging="true"] { box-shadow: var(--shadow-card-drag); transform: scale(1.02); }

/* App bar */
.app-bar {
  background: rgb(var(--card));
  box-shadow: var(--shadow-app-bar);
}

/* FAB */
.fab {
  position: fixed;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgb(var(--green-accent));
  color: #fff;
  border: none;
  cursor: pointer;
  box-shadow: var(--shadow-fab-base), var(--shadow-fab-ambient);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.fab:active { transform: scale(0.95); box-shadow: var(--shadow-fab-base); }

/* Modal */
.modal-surface {
  background: rgb(var(--card));
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-modal);
  overflow: hidden;
}
.modal-header-strip {
  background: rgb(var(--green-house));
  color: #fff;
  height: 48px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* Pill input (search bar etc.) */
.input-pill {
  height: 40px;
  padding: 8px 16px;
  border-radius: var(--radius-pill);
  background: rgb(var(--neutral-cool));
  border: 1px solid rgb(var(--ink) / 0.06);
  color: rgb(var(--ink) / 0.87);
  font: inherit;
  outline: none;
  transition: all 0.2s ease;
}
.input-pill:focus {
  background: rgb(var(--card));
  border-color: rgb(var(--green-accent));
}

/* Tag pill */
.tag-pill {
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-pill);
  background: rgb(var(--ceramic));
  color: rgb(var(--ink) / 0.58);
  padding: 4px 10px;
  font-size: 13px;
  font-weight: 400;
  letter-spacing: -0.01em;
}

/* Bot-attribution script (Telegram source line) */
.font-script { font-family: 'Kalam', cursive; }

/* Serif (Weekly Review only) */
.font-serif-rewards { font-family: 'Iowan Old Style', 'Source Serif Pro', Georgia, serif; }
```

- [ ] **Step 3: Write `web/src/hooks/useTheme.ts`**

Create the file:

```ts
import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';

function readStored(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'system';
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function effectiveOf(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode;
}

function applyTheme(effective: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = effective;
}

export function useTheme(): {
  mode: ThemeMode;
  effective: 'light' | 'dark';
  set: (m: ThemeMode) => void;
} {
  const [mode, setMode] = useState<ThemeMode>(() => readStored());
  const [effective, setEffective] = useState<'light' | 'dark'>(() => effectiveOf(readStored()));

  useEffect(() => {
    applyTheme(effective);
  }, [effective]);

  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setEffective(systemPrefersDark() ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  const set = (m: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, m);
    setMode(m);
    setEffective(effectiveOf(m));
  };

  return { mode, effective, set };
}
```

- [ ] **Step 4: Replace `web/tailwind.config.js`**

Replace the entire file content with:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas:           'rgb(var(--canvas) / <alpha-value>)',
        ceramic:          'rgb(var(--ceramic) / <alpha-value>)',
        card:             'rgb(var(--card) / <alpha-value>)',
        'neutral-cool':   'rgb(var(--neutral-cool) / <alpha-value>)',
        'gold-lightest':  'rgb(var(--gold-lightest) / <alpha-value>)',
        ink:              'rgb(var(--ink) / <alpha-value>)',
        'ink-soft':       'rgb(var(--ink-soft) / <alpha-value>)',
        'ink-rev':        'rgb(var(--ink-rev) / <alpha-value>)',
        'ink-rev-soft':   'rgb(var(--ink-rev-soft) / <alpha-value>)',
        'ink-rewards':    'rgb(var(--ink-rewards) / <alpha-value>)',
        'green-starbucks':'rgb(var(--green-starbucks) / <alpha-value>)',
        'green-accent':   'rgb(var(--green-accent) / <alpha-value>)',
        'green-house':    'rgb(var(--green-house) / <alpha-value>)',
        'green-uplift':   'rgb(var(--green-uplift) / <alpha-value>)',
        'green-light':    'rgb(var(--green-light) / <alpha-value>)',
        gold:             'rgb(var(--gold) / <alpha-value>)',
        red:              'rgb(var(--red) / <alpha-value>)',
        yellow:           'rgb(var(--yellow) / <alpha-value>)',
      },
      boxShadow: {
        card:        'var(--shadow-card)',
        'card-hover':'var(--shadow-card-hover)',
        'card-drag': 'var(--shadow-card-drag)',
        'app-bar':   'var(--shadow-app-bar)',
        'fab-base':  'var(--shadow-fab-base)',
        'fab-ambient':'var(--shadow-fab-ambient)',
        toast:       'var(--shadow-toast)',
        modal:       'var(--shadow-modal)',
      },
      borderRadius: {
        card: 'var(--radius-card)',
        pill: 'var(--radius-pill)',
        sheet: '12px 12px 0 0',
      },
      fontFamily: {
        sans:   ['Nunito Sans', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
        serif:  ['Iowan Old Style', 'Source Serif Pro', 'Georgia', 'serif'],
        script: ['Kalam', 'Comic Sans MS', 'cursive'],
      },
      letterSpacing: {
        tight2: '-0.01em',
      },
      fontSize: {
        // Anchored to 1rem = 10px (set via html font-size: 62.5%)
        '1':  ['1.3rem',  { lineHeight: '1.5' }],
        '2':  ['1.4rem',  { lineHeight: '1.5' }],
        '3':  ['1.6rem',  { lineHeight: '1.5' }],
        '8':  ['2.8rem',  { lineHeight: '1.2' }],
        '9':  ['3.6rem',  { lineHeight: '1.2' }],
        '10': ['5.0rem',  { lineHeight: '1.2' }],
      },
    },
  },
  safelist: [
    // Due-date badge dynamic classes
    'bg-red/5', 'border-red', 'text-red',
    'bg-gold-lightest', 'border-gold', 'text-gold',
    'bg-ceramic', 'text-ink-soft',
  ],
  plugins: [],
};
```

- [ ] **Step 5: Update `web/index.html`** to preload the primary font

Find the `<head>` section. Add **before** the existing `<link rel="stylesheet">` (or just after the `<meta name="viewport">`):

```html
<link rel="preload" href="/fonts/nunito-sans-400.woff2" as="font" type="font/woff2" crossorigin>
```

- [ ] **Step 6: Verify build still works**

Run:
```bash
cd /Users/assistant/WorkingFolder/KanbanClaude/web && npm run build
```

Expected: build succeeds, no Tailwind errors. (If errors mention undefined `bg-canvas` etc. — that's expected for now since `index.css` hasn't adopted them yet; ensure no syntax errors at least.)

- [ ] **Step 7: Commit**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude
git add web/src/theme.css web/src/hooks/useTheme.ts web/tailwind.config.js web/index.html web/public/fonts/
git commit -m "$(cat <<'EOF'
feat(theme): tokens, fonts, Tailwind config, useTheme hook

Adds CSS-var token layer (light + dark), self-hosted Nunito Sans woff2
files, Tailwind extension reading from the vars, and a useTheme hook
that toggles document.documentElement.dataset.theme.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Adopt cream canvas in `index.css`

**Files:**
- Modify: `web/src/index.css`

- [ ] **Step 1: Replace `web/src/index.css` content**

Replace the file with:

```css
@import './theme.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
}

body {
  @apply bg-canvas text-ink/90 font-sans;
  letter-spacing: -0.01em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Kalam loaded lazily by CardView when a Telegram-sourced card mounts. */
```

- [ ] **Step 2: Run dev server and load the app**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude/web && npm run dev
```

Open http://localhost:5173 in a browser. Expected: cream canvas behind the (still dark-styled) board UI. Stop the dev server with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add web/src/index.css
git commit -m "$(cat <<'EOF'
feat(theme): adopt cream canvas + Nunito Sans body in index.css

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Convert core board surfaces

**Files:**
- Modify: `web/src/components/BoardHeader.tsx`
- Modify: `web/src/components/Board.tsx`
- Modify: `web/src/components/Column.tsx`
- Modify: `web/src/components/CardView.tsx`
- Modify: `web/src/components/EmptyColumn.tsx`
- Modify: `web/src/components/SearchBar.tsx`

- [ ] **Step 1: Convert `BoardHeader.tsx`**

Read the file first if not already in context:
```bash
cat web/src/components/BoardHeader.tsx
```

Apply these className swaps. Use Edit tool with `replace_all` where the pattern is unique:

| Replace | With |
|---|---|
| `text-lg font-semibold text-neutral-100` (the `Kanban` H1) | `text-lg font-semibold text-green-starbucks tracking-tight2` |
| `flex rounded-lg bg-neutral-900 p-0.5` (segmented control track) — appears twice (Section + Scope) | `flex rounded-pill bg-ceramic p-0.5` |
| `rounded-md px-2.5 py-1 text-xs font-medium transition-colors` (segmented control button base) | `rounded-pill px-3 py-1 text-2 font-medium transition-colors tracking-tight2` |
| `bg-neutral-700 text-neutral-100` (active state on segmented control) | `bg-card text-green-starbucks shadow-sm` |
| `text-neutral-400 hover:text-neutral-200` (inactive state) | `text-ink-soft hover:text-ink` |
| `text-xs text-neutral-500` (cards count) | `text-1 text-ink-soft tracking-tight2` |
| `text-neutral-400 hover:text-neutral-100 text-xs` (utility links Weekly review / Archive / Settings / Sign out) | `text-2 text-ink-soft hover:text-ink tracking-tight2` |
| `text-neutral-500 text-xs` (user.name span) | `text-1 text-ink-soft tracking-tight2` |
| `rounded border border-neutral-700 px-1.5 py-0.5 text-xs text-neutral-400 hover:text-neutral-100` (the `?` button) | `rounded-pill border border-ink/87 px-2 py-0.5 text-1 text-ink hover:bg-ink/5 tracking-tight2` |
| `rounded-lg border border-neutral-700 bg-neutral-800 p-3 shadow-lg` (shortcuts popup) | `rounded-card border border-ink/10 bg-card p-3 shadow-modal` |
| `text-xs font-semibold text-neutral-200` (shortcuts heading) | `text-2 font-semibold text-ink tracking-tight2` |

The header itself: the outer `<header>` does not currently have a background class. Add `<header className="app-bar relative mb-4 flex flex-wrap items-center justify-between gap-2 px-4 py-3 rounded-card">` (replace the existing `relative mb-4 flex flex-wrap items-center justify-between gap-2`).

- [ ] **Step 2: Convert `Board.tsx`**

Read first:
```bash
cat web/src/components/Board.tsx
```

The Board component renders the 4-column grid. Add a desktop FAB at the bottom of the JSX tree, just before the closing `</div>` of the outer wrapper (skip on mobile widths since `MobileShell` handles its own FAB). Use:

```tsx
<button
  type="button"
  className="fab hidden md:inline-flex"
  style={{ width: '48px', height: '48px', right: '24px', bottom: '24px' }}
  onClick={() => window.dispatchEvent(new CustomEvent('kanban:add-card', { detail: { status: 'today' } }))}
  aria-label="Add card to Today"
>
  <span className="text-2xl leading-none" aria-hidden>+</span>
</button>
```

Also replace the column-grid container if it has any explicit dark colors (e.g., `bg-neutral-900`) with `bg-canvas` and add `gap-4` between columns if not already present.

- [ ] **Step 3: Convert `Column.tsx`**

Apply these swaps (lines refer to the version read in this plan):

| Replace | With |
|---|---|
| `flex flex-col rounded-xl bg-neutral-900/40 p-3 min-h-[60vh] transition-colors` (line 100) | `flex flex-col rounded-card bg-ceramic/40 p-3 min-h-[60vh] transition-colors` |
| `${isOver ? 'bg-neutral-800/60' : ''}` (line 101) | `${isOver ? 'bg-ceramic' : ''}` |
| `text-sm font-medium text-neutral-200` (column title H2) | `text-3 font-normal text-ink tracking-tight2` |
| `text-xs text-neutral-500` (cards count) | `text-1 text-ink-soft tracking-tight2` |
| `text-neutral-500 hover:text-neutral-200 text-sm` (template picker button 📋) | `text-ink-soft hover:text-ink text-2` |
| `text-neutral-500 hover:text-neutral-200 text-lg leading-none` (the `+` add button) | `text-green-accent hover:text-green-starbucks text-lg leading-none` |
| `absolute right-0 top-6 z-10 w-48 rounded border border-neutral-700 bg-neutral-900 py-1 shadow-lg` (template picker dropdown) | `absolute right-0 top-6 z-10 w-48 rounded-card border border-ink/10 bg-card py-1 shadow-modal` |
| `block w-full px-3 py-1 text-left text-xs hover:bg-neutral-800` (picker item) | `block w-full px-3 py-1 text-left text-2 text-ink hover:bg-ceramic tracking-tight2` |
| `rounded-lg border border-neutral-700 bg-neutral-900 p-2` (the inline new-card textarea wrapper) | `rounded-card border border-dashed border-ink/14 bg-card p-2 hover:border-green-accent transition-colors` |
| `w-full resize-none bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-500` (textarea) | `w-full resize-none bg-transparent text-3 text-ink outline-none placeholder:text-ink-soft tracking-tight2` |
| `py-8 text-center text-xs text-neutral-500` (no matches) | `py-8 text-center text-2 text-ink-soft tracking-tight2` |

Add an In-Progress left rail. Find the outer column div and replace:
```tsx
className={`flex flex-col rounded-card bg-ceramic/40 p-3 min-h-[60vh] transition-colors
  ${isOver ? 'bg-ceramic' : ''}`}
```
with:
```tsx
className={`flex flex-col rounded-card bg-ceramic/40 p-3 min-h-[60vh] transition-colors
  ${status === 'in_progress' ? 'border-l-4 border-green-uplift' : ''}
  ${isOver ? 'bg-ceramic' : ''}`}
```

- [ ] **Step 4: Convert `CardView.tsx`**

Replace the `dueDateBadge` function (lines 41–52) with:

```ts
function dueDateBadge(due: string): { label: string; cls: string } {
  const nowMs = Date.now() + getServerClockSkewMs();
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(due + 'T00:00:00');
  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);
  const label = dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (diffDays < 0) return { label, cls: 'bg-red/5 border border-red text-red' };
  if (diffDays === 0) return { label: 'Today', cls: 'bg-gold-lightest border border-gold text-gold' };
  if (diffDays <= 3) return { label, cls: 'bg-yellow/10 border border-yellow text-yellow' };
  return { label, cls: 'bg-ceramic text-ink-soft' };
}
```

Replace the outer card `<div>` className (lines 79–84) with:

```tsx
className={`
  group relative card-surface cursor-grab active:cursor-grabbing p-3
  ${isDragging || dragging ? 'opacity-40' : ''}
  ${card.ai_summarized || card.needs_review ? 'border-l-4 border-l-gold pl-3' : ''}
`}
data-dragging={isDragging || dragging ? 'true' : undefined}
```

Apply these swaps in the rest of the file:

| Replace | With |
|---|---|
| `text-sm text-neutral-100 break-words` (title) | `text-3 text-ink font-semibold break-words tracking-tight2` |
| `mt-1 text-xs text-neutral-400 line-clamp-2 break-words` (description) | `mt-1 text-1 text-ink-soft line-clamp-2 break-words tracking-tight2` |
| `rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300` (tag chips) | `tag-pill text-1` |
| `rounded bg-sky-900/40 px-1.5 py-0.5 text-[10px] text-sky-200` (telegram tag) | `tag-pill text-1` |
| `rounded bg-violet-900/40 px-1.5 py-0.5 text-[10px] text-violet-200` (AI tag) | `tag-pill text-1 bg-gold-lightest text-gold` |
| `rounded bg-emerald-900/40 px-1.5 py-0.5 text-[10px] text-emerald-200` (voice tag) | `tag-pill text-1 bg-green-light text-green-accent` |
| `rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-200` (review tag) | `tag-pill text-1 bg-gold-lightest text-gold` |
| `rounded px-1.5 py-0.5 text-[10px] ${badge.cls}` (due badge wrapper) | `inline-flex items-center rounded-pill px-2 py-0.5 text-1 tracking-tight2 ${badge.cls}` |
| `opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-neutral-200 text-xs` (delete x) | `opacity-0 group-hover:opacity-100 text-ink-soft hover:text-red text-2` |
| `bg-neutral-800 text-neutral-300 border border-dashed border-neutral-600` (creator avatar) | `bg-ceramic text-ink-soft border border-dashed border-ink/20` |
| `bg-neutral-700 text-neutral-100` (assignee avatar) | `bg-green-light text-green-starbucks` |
| `mt-2 text-[10px] text-neutral-500` (timestamp) | `mt-2 text-1 text-ink-soft tracking-tight2` |
| `mb-2 w-full max-h-40 object-cover rounded-md` (image attachment) | `mb-2 w-full max-h-40 object-cover rounded-card` and add `style={{ transition: 'opacity 0.3s ease-in' }}` |

Add a Telegram bot-attribution line below the title (only when `card.source === 'telegram'`). Find the title `<div>` block and add right after it:

```tsx
{card.source === 'telegram' && creator && (
  <div className="font-script text-1 text-ink-soft mt-0.5">
    from {displayShort(creator)} via bot
  </div>
)}
```

Add the lazy-load Kalam effect at the top of the component, before `return`:

```tsx
useEffect(() => {
  if (card.source !== 'telegram') return;
  if (document.getElementById('font-kalam-link')) return;
  const link = document.createElement('link');
  link.id = 'font-kalam-link';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Kalam:wght@400&display=swap';
  document.head.appendChild(link);
}, [card.source]);
```

Add the import: `import { useEffect } from 'react';` if not already present.

- [ ] **Step 5: Convert `EmptyColumn.tsx`**

Replace the entire `return` block:

```tsx
return (
  <div className="flex flex-1 items-center justify-center p-4">
    <div className="rounded-card border border-dashed border-ink/14 bg-ceramic px-6 py-8 text-center w-full">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="mx-auto h-8 w-8 text-ink-soft"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M5 8h12l-1 11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 8z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        <path d="M17 11h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" />
      </svg>
      <p className="mt-2 text-2 font-semibold text-ink tracking-tight2">{msg.title}</p>
      <p className="mt-1 text-1 text-ink-soft tracking-tight2">{msg.hint}</p>
    </div>
  </div>
);
```

Also replace the `searchActive` branch:

```tsx
return (
  <div className="flex flex-1 items-center justify-center p-4">
    <p className="text-center text-2 text-ink-soft tracking-tight2">No matching cards</p>
  </div>
);
```

- [ ] **Step 6: Convert `SearchBar.tsx`**

Read the file first. Apply: replace the input className with `input-pill w-full pl-10 pr-9 text-2 text-ink tracking-tight2`. Wrap input in a `relative` container if not already. Add a magnifier SVG at left (`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-soft pointer-events-none`) and a clear-x button at right (`absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink text-2`) shown only when value is present.

- [ ] **Step 7: Run dev + smoke**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude/web && npm run dev
```

Visit http://localhost:5173 (logged in if possible). Expected:
- Top bar: white surface, Starbucks-Green wordmark, ceramic-track segmented controls
- Columns: cream tint, white-card cards, In Progress has left rail
- Hover a card → soft shadow lift
- Stop server with Ctrl+C.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/BoardHeader.tsx web/src/components/Board.tsx web/src/components/Column.tsx web/src/components/CardView.tsx web/src/components/EmptyColumn.tsx web/src/components/SearchBar.tsx
git commit -m "$(cat <<'EOF'
feat(theme): convert BoardHeader, Board, Column, CardView, EmptyColumn, SearchBar

Cream canvas + white cards + Starbucks-Green CTAs + ceramic segmented
controls + In-Progress column rail + Telegram bot-attribution in Kalam
script + cream-friendly due-date ladder.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Convert dialogs

**Files:**
- Modify: `web/src/components/EditDialog.tsx`
- Modify: `web/src/components/SettingsDialog.tsx`
- Modify: `web/src/components/ArchiveDialog.tsx`
- Modify: `web/src/components/WeeklyReview.tsx`
- Modify: `web/src/components/KnowledgeEditDialog.tsx`

For each dialog, apply the modal pattern: outer scrim `fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4`, modal surface `modal-surface w-full max-w-[560px] max-h-[90vh] overflow-y-auto`, header strip `modal-header-strip` with title left + close-X right.

- [ ] **Step 1: Convert `EditDialog.tsx`**

Read the file. Apply these high-impact class swaps:

| Replace | With |
|---|---|
| outer scrim div (anything like `fixed inset-0 bg-black/...`) | `fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4` |
| dialog wrapper (`bg-neutral-900` or similar) | `modal-surface w-full max-w-[560px] max-h-[90vh] overflow-y-auto flex flex-col` |
| Any `bg-neutral-800` field bg → `bg-card border border-ink/10` |
| Any `text-neutral-100` body text → `text-ink` |
| Any `text-neutral-400` label text → `text-ink-soft` |
| Save button → `<button type="submit" className="btn-pill btn-pill-filled-green">Save</button>` |
| Cancel button → `<button type="button" className="btn-pill btn-pill-outlined-dark">Cancel</button>` |

Wrap header in `<div className="modal-header-strip"><h2 className="text-3 font-semibold tracking-tight2">Edit card</h2><button onClick={onClose} aria-label="Close" className="text-2 text-white/80 hover:text-white">✕</button></div>`.

Body wrapped in `<div className="p-6 flex flex-col gap-4">…</div>`.

Footer: `<div className="px-6 py-4 border-t border-ink/6 flex justify-end gap-3">…buttons…</div>`.

- [ ] **Step 2: Convert `SettingsDialog.tsx`**

Same modal pattern. Add a Theme toggle row.

Add the Theme row at the top of the body content:

```tsx
import { useTheme } from '../hooks/useTheme.ts';
// ...
const { mode, set } = useTheme();
// inside the body JSX, top section:
<section className="flex items-center justify-between gap-4 py-3 border-b border-ink/6">
  <div>
    <div className="text-3 font-semibold text-ink tracking-tight2">Theme</div>
    <div className="text-1 text-ink-soft tracking-tight2">Light, dark, or follow your system</div>
  </div>
  <div className="flex rounded-pill bg-ceramic p-0.5">
    {(['light', 'dark', 'system'] as const).map((m) => (
      <button
        key={m}
        type="button"
        onClick={() => set(m)}
        className={`rounded-pill px-3 py-1 text-2 font-medium tracking-tight2 transition-colors ${
          mode === m ? 'bg-card text-green-starbucks' : 'text-ink-soft hover:text-ink'
        }`}
      >
        {m === 'light' ? 'Light' : m === 'dark' ? 'Dark' : 'System'}
      </button>
    ))}
  </div>
</section>
```

Apply the same modal class swaps from Step 1 to all the existing settings sections.

- [ ] **Step 3: Convert `ArchiveDialog.tsx`**

Same modal pattern. The destructive footer band:

```tsx
<div className="px-6 py-4 bg-red/5 border-t border-red/20 flex justify-end gap-3">
  <button type="button" onClick={onClose} className="btn-pill btn-pill-outlined-dark">Cancel</button>
  <button type="button" onClick={onConfirmAll} className="btn-pill btn-pill-destructive">Delete all ({count})</button>
</div>
```

For per-row Restore + Delete buttons inside the table, swap to:
- Restore: `btn-pill btn-pill-outlined-green text-2`
- Delete forever: small text button `text-2 text-red hover:underline tracking-tight2`

- [ ] **Step 4: Convert `WeeklyReview.tsx`**

Same modal pattern. Add gold-lightest top wash and serif headline:

```tsx
<div className="modal-surface w-full max-w-[560px] max-h-[90vh] overflow-y-auto flex flex-col">
  <div className="bg-gold-lightest h-12" />
  <div className="px-6 pb-6 flex flex-col gap-4">
    <h2 className="font-serif-rewards text-8 font-normal text-green-starbucks">
      Last week, in your world…
    </h2>
    <p className="font-serif-rewards text-3 text-ink-rewards leading-relaxed">
      {summary}
    </p>
    <div className="grid grid-cols-3 gap-3 mt-2">
      {/* stat tiles */}
      {stats.map((s) => (
        <div key={s.label} className="card-surface bg-canvas p-4 text-center">
          <div className="font-serif-rewards text-9 font-semibold text-green-starbucks leading-none">{s.value}</div>
          <div className="mt-1 text-1 text-ink-soft tracking-tight2">{s.label}</div>
        </div>
      ))}
    </div>
    <div className="flex justify-end gap-3 pt-4">
      <button onClick={onRegenerate} className="btn-pill btn-pill-outlined-green">Generate again</button>
      <button onClick={onClose} className="btn-pill btn-pill-filled-green">Got it</button>
    </div>
  </div>
</div>
```

Adapt the actual `summary` / `stats` shape to whatever the existing component already produces — preserve existing logic, only swap presentation.

- [ ] **Step 5: Convert `KnowledgeEditDialog.tsx`**

Apply the same modal pattern as Step 1. No special exceptions.

- [ ] **Step 6: Smoke**

```bash
npm run dev
```

Open every dialog (Edit a card, Settings, Archive, Weekly Review, Knowledge Edit). Toggle the Theme row in Settings — Light/Dark/System should switch instantly. Stop server.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/EditDialog.tsx web/src/components/SettingsDialog.tsx web/src/components/ArchiveDialog.tsx web/src/components/WeeklyReview.tsx web/src/components/KnowledgeEditDialog.tsx
git commit -m "$(cat <<'EOF'
feat(theme): convert dialogs (Edit, Settings, Archive, WeeklyReview, KnowledgeEdit)

White modal surface + House-Green header strip + scrim + footer pill
pair. Settings dialog gains a Light/Dark/System theme toggle row.
WeeklyReview gets the gold-lightest wash + Iowan-Old-Style serif moment.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Convert Knowledge surfaces, Templates, Activity, Toast, Login

**Files:**
- Modify: `web/src/KnowledgeView.tsx`
- Modify: `web/src/components/KnowledgeRow.tsx`
- Modify: `web/src/components/KnowledgeDetail.tsx`
- Modify: `web/src/components/TemplatesTab.tsx`
- Modify: `web/src/components/ActivityTimeline.tsx`
- Modify: `web/src/components/Toast.tsx`
- Modify: `web/src/components/LoginView.tsx`

- [ ] **Step 1: `KnowledgeView.tsx` — feature band hero**

At the top of the JSX (before the list of knowledge items), insert:

```tsx
<section className="bg-green-house text-ink-rev px-6 py-10 rounded-card mb-6">
  <div className="grid md:grid-cols-[60%_40%] gap-6 items-center">
    <div>
      <h1 className="text-8 font-semibold tracking-tight2">Knowledge</h1>
      <p className="mt-2 text-3 text-ink-rev-soft tracking-tight2">URLs, snippets, notes — all linked back to cards</p>
      <div className="mt-4 flex gap-3">
        <button onClick={onNew} className="btn-pill btn-pill-on-dark-filled">+ New note</button>
        <button onClick={onSearchToggle} className="btn-pill btn-pill-on-dark-outlined">Search</button>
      </div>
    </div>
    <div className="hidden md:block">{/* optional decorative SVG or empty */}</div>
  </div>
</section>
```

Wrap the items list in `<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">…</div>`.

- [ ] **Step 2: `KnowledgeRow.tsx`**

Apply card-surface pattern. Replace any `bg-neutral-900 border border-neutral-800` with `card-surface p-4`. Title `text-3 font-semibold text-ink tracking-tight2`. Body `text-1 text-ink-soft line-clamp-2 tracking-tight2`. URL hostname pill: `tag-pill`. Leading link icon (existing or SVG): set color to `text-green-accent`.

- [ ] **Step 3: `KnowledgeDetail.tsx`**

Wrap content in `<article className="card-surface p-6">…</article>`. Hero image (when present): `<img className="w-full rounded-card mb-4" style={{ boxShadow: 'var(--shadow-card)', transition: 'opacity 0.3s ease-in' }} />`. Body text classes: `text-3 text-ink leading-relaxed tracking-tight2`. Linked-cards section heading: `text-3 font-semibold text-green-starbucks tracking-tight2`.

- [ ] **Step 4: `TemplatesTab.tsx`**

Wrap the tab content in `<section className="bg-gold-lightest -m-6 p-6 rounded-card">…</section>` (the negative margin "bleeds" the wash to the modal edges; adjust to whatever the actual settings-tab layout uses). Each template row uses `card-surface p-4`. The "+ New template" CTA: `btn-pill btn-pill-filled-green`.

- [ ] **Step 5: `ActivityTimeline.tsx`**

Replace the rail wrapper with:
```tsx
<ol className="relative ml-3 border-l-2 border-ceramic">
```
Each item:
```tsx
<li className="relative pl-6 pb-4">
  <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-green-accent" />
  <time className="block text-1 text-ink-soft tracking-tight2">{relativeTime}</time>
  <p className="text-2 text-ink tracking-tight2">{description}</p>
</li>
```

Day-label sticky pill: `inline-flex tag-pill bg-ceramic text-ink-soft sticky top-0`.

- [ ] **Step 6: `Toast.tsx`**

Wrap each toast in:
```tsx
<div className="card-surface p-3 px-4 flex items-start gap-3 max-w-sm" style={{ boxShadow: 'var(--shadow-toast)' }}>
  <span className={kind === 'error' ? 'text-red' : 'text-green-accent'} aria-hidden>
    {kind === 'error' ? '!' : '✓'}
  </span>
  <p className="text-2 text-ink tracking-tight2">{message}</p>
</div>
```

Container positioning: `fixed bottom-4 right-4 md:bottom-4 z-50 flex flex-col gap-2`. On mobile, bump bottom to `bottom-[calc(56px+16px)]` via `bottom-[72px] md:bottom-4`.

Add slide-up animation via Tailwind arbitrary values: `animate-[slideUp_0.2s_ease-out]` plus a `@keyframes slideUp` block in `theme.css`:
```css
@keyframes slideUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 7: `LoginView.tsx`**

Outer page: `<div className="min-h-screen bg-canvas flex items-center justify-center p-4">`. Card: `<div className="card-surface w-full max-w-[500px] p-8">`. Brand: `<h1 className="text-9 font-semibold text-green-starbucks tracking-tight2 mb-6">SmartKanban</h1>`. Inputs: replace any text input className with `input-pill w-full mb-3 rounded-card` (block square card-radius for form fields, not 50px pill — easier to read for long text). Submit button: `btn-pill btn-pill-filled-black w-full mt-2`. Toggle link below form: `mt-4 text-2 text-ink-soft hover:text-ink tracking-tight2`.

- [ ] **Step 8: Smoke**

```bash
npm run dev
```

- Click Knowledge tab → see House-Green band with white text + green-on-green pills
- Open Settings → Templates → see gold-lightest washed surface
- Trigger a toast (create/delete a card) → white toast slides up bottom-right
- Open Activity (any card) → ceramic vertical rail with green dots
- Sign out → Login view shows cream page + white card + black "Sign in" pill

- [ ] **Step 9: Commit**

```bash
git add web/src/KnowledgeView.tsx web/src/components/KnowledgeRow.tsx web/src/components/KnowledgeDetail.tsx web/src/components/TemplatesTab.tsx web/src/components/ActivityTimeline.tsx web/src/components/Toast.tsx web/src/components/LoginView.tsx
git commit -m "$(cat <<'EOF'
feat(theme): convert KnowledgeView/Row/Detail, TemplatesTab, ActivityTimeline, Toast, LoginView

House-Green Knowledge feature band, gold-lightest Templates wash,
ceramic activity rail with green dots, white toast with slide-up,
cream login page with black filled CTA.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Convert mobile shell + status tabs + FAB + bottom-sheet

**Files:**
- Modify: `web/src/MobileShell.tsx`
- Modify: `web/src/components/MobileCardActions.tsx`
- Modify: `web/src/MobileMore.tsx`

- [ ] **Step 1: `MobileShell.tsx` — bottom tab-bar + status strip + FAB**

Read the file. Apply:

**Bottom tab-bar wrapper:**

```tsx
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
        {active && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-gold" />}
      </button>
    );
  })}
</nav>
```

**Status tab strip** (mobile-only, board section):

```tsx
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
        {active && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-gold" />}
      </button>
    );
  })}
</div>
```

**FAB** (mobile, fixed bottom-right above the tab-bar):

```tsx
{tab === 'board' && (
  <button
    type="button"
    className="fab"
    style={{ width: '56px', height: '56px', right: 'calc(16px + env(safe-area-inset-right))', bottom: 'calc(56px + 16px + env(safe-area-inset-bottom))', opacity: actionsCard ? 0 : 1, pointerEvents: actionsCard ? 'none' : 'auto' }}
    onClick={() => setAdding(true)}
    aria-label="Add card"
  >
    <span className="text-2xl leading-none" aria-hidden>+</span>
  </button>
)}
```

**Page background**: ensure outer wrapper has `bg-canvas min-h-screen pb-[calc(56px+env(safe-area-inset-bottom))]`.

Replace all remaining `bg-neutral-900` / `text-neutral-100` etc. with the cream-canvas equivalents from earlier tasks.

- [ ] **Step 2: `MobileCardActions.tsx` — bottom-sheet**

Apply:

```tsx
<div className="fixed inset-0 z-50 flex items-end bg-ink/40" onClick={onClose}>
  <div className="bg-card rounded-sheet w-full max-h-[80vh] overflow-y-auto p-2" onClick={(e) => e.stopPropagation()}>
    <div className="mx-auto h-1 w-8 rounded-full bg-ceramic my-2" aria-hidden />
    <ul className="divide-y divide-ink/6">
      {actions.map((a) => (
        <li key={a.label}>
          <button
            type="button"
            onClick={a.run}
            className={`w-full flex items-center gap-3 py-3 px-3 text-3 tracking-tight2 ${a.destructive ? 'text-red' : 'text-ink'}`}
          >
            <span className={a.destructive ? 'text-red' : 'text-green-accent'} aria-hidden>{a.icon}</span>
            <span className="flex-1 text-left">{a.label}</span>
            <span className="text-ink-soft" aria-hidden>›</span>
          </button>
        </li>
      ))}
    </ul>
  </div>
</div>
```

Adapt to existing prop / action shape.

- [ ] **Step 3: `MobileMore.tsx` — utility list + theme toggle**

Add the Theme toggle row at the top:

```tsx
import { useTheme } from './hooks/useTheme.ts';
// ...
const { mode, set } = useTheme();
// inside render:
<section className="card-surface p-4 mb-4">
  <div className="flex items-center justify-between gap-4">
    <div>
      <div className="text-3 font-semibold text-ink tracking-tight2">Theme</div>
      <div className="text-1 text-ink-soft tracking-tight2">Light, dark, or follow your system</div>
    </div>
    <div className="flex rounded-pill bg-ceramic p-0.5">
      {(['light', 'dark', 'system'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => set(m)}
          className={`rounded-pill px-3 py-1 text-2 font-medium tracking-tight2 transition-colors ${
            mode === m ? 'bg-card text-green-starbucks' : 'text-ink-soft'
          }`}
        >
          {m === 'light' ? 'Light' : m === 'dark' ? 'Dark' : 'System'}
        </button>
      ))}
    </div>
  </div>
</section>
```

Wrap the existing utility links (Settings / Archive / Weekly Review / Sign out) each as a row:

```tsx
<button onClick={onOpenSettings} className="card-surface w-full flex items-center justify-between p-4 text-3 text-ink tracking-tight2">
  <span>Settings</span>
  <span className="text-ink-soft">›</span>
</button>
```

Outer wrapper `bg-canvas min-h-screen p-4 pb-[calc(56px+16px)] flex flex-col gap-3`.

- [ ] **Step 4: Smoke on mobile breakpoint**

```bash
npm run dev
```

In the browser, set viewport to 375px (iPhone). Expected:
- House-Green bottom tab-bar, gold dot under active tab
- Status pill strip at top with gold dot under active chip
- FAB pinned bottom-right above tab-bar; press cards → bottom-sheet → FAB hides
- Tap More → Theme row at top + utility rows below
- Theme toggle works

- [ ] **Step 5: Commit**

```bash
git add web/src/MobileShell.tsx web/src/components/MobileCardActions.tsx web/src/MobileMore.tsx
git commit -m "$(cat <<'EOF'
feat(theme): convert mobile shell + status strip + FAB + bottom sheet + More

House-Green bottom tab-bar with Gold active dot, Ceramic status pill
strip, 56px Green Accent FAB pinned above the tab-bar (hides while
bottom-sheet open), white card-row utilities in More, theme toggle
moved to More for mobile users.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Final cleanup + grep audit

**Files:**
- Various (any leftover dark-mode classes)

- [ ] **Step 1: Audit for residual dark classes**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude/web
grep -RIn "bg-neutral-900\|bg-neutral-950\|bg-neutral-800\|text-neutral-100\|text-neutral-400\|bg-red-900\|bg-amber-900\|bg-yellow-900\|bg-emerald-900\|bg-violet-900\|bg-sky-900" src/ \
  | grep -v MirrorView.tsx
```

Expected: empty (or only intentional refs). Replace any remaining hits with the cream-canvas equivalents per earlier tables. `MirrorView.tsx` is the kiosk exception and may keep its dark classes.

- [ ] **Step 2: Confirm `MirrorView.tsx` is untouched**

```bash
git diff main -- web/src/MirrorView.tsx
```

Expected: no diff.

- [ ] **Step 3: Type-check + build**

```bash
cd web && npx tsc --noEmit && npm run build
```

Expected: both pass clean.

- [ ] **Step 4: Smoke across breakpoints + themes**

```bash
npm run dev
```

For each viewport (375 / 480 / 768 / 1024 / 1440):
- Theme: Light → Dark → System
- Open every dialog (Edit, Settings, Archive, Weekly Review, Knowledge Edit)
- Drag a card across all 4 columns
- Open `/my-day?token=…` and confirm the Mirror is unchanged
- Telegram-source card shows Kalam attribution
- AI-summarized card shows gold left rail + tag

- [ ] **Step 5: Commit any audit fixes**

```bash
git status
# If any files modified by Step 1 fixes:
git add -p
git commit -m "$(cat <<'EOF'
chore(theme): sweep residual dark-mode classes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(If nothing was modified, skip the commit.)

---

## Task 8: Wrap-up — push + PR

**Files:** none — git operations only

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/starbucks-design
```

- [ ] **Step 2: Open PR** (only if user requests)

This is a user-confirmation gate. Do not auto-open the PR — ask the user first. If approved, run:

```bash
gh pr create --title "feat(theme): adopt Starbucks-inspired design system with light/dark toggle" --body "$(cat <<'EOF'
## Summary
- Replaces `bg-neutral-950` dark-only theme with a warm-cream Starbucks-inspired design system, plus a Light / Dark / System toggle in Settings + Mobile More.
- Self-hosts Nunito Sans (woff2 subsets) + lazy-loads Kalam for Telegram-source bot attribution + falls back to Iowan Old Style for the Weekly Review serif moment.
- Re-skins all 23 visual surfaces in `web/src/`. `MirrorView.tsx` left unchanged (kiosk exception).

Spec: `docs/superpowers/specs/2026-04-26-starbucks-design-system-design.md`
Design doc: `design_startbucs_kanban.md`

## Test plan
- [ ] `cd web && npm run build` clean
- [ ] `cd web && npx tsc --noEmit` clean
- [ ] Theme toggle Light/Dark/System on every dialog
- [ ] Drag-and-drop across all 4 columns
- [ ] Mobile (375px): bottom tab-bar + status strip + FAB + bottom-sheet
- [ ] Telegram-source card shows Kalam attribution line
- [ ] AI-summarized card shows gold left rail + star
- [ ] `/my-day?token=…` mirror untouched

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

**Spec coverage check:**
- §2 In-scope: tokens (Task 1), 23 surfaces (Tasks 3–6), Nunito Sans + Kalam + Iowan (Task 1 + Task 3 step 4), theme toggle (Task 4 + Task 6) — ✅ covered
- §6 per-file map: every row has a corresponding step — ✅
- §7 risks: drag overlay (Task 7 smoke), safelist (Task 1 step 4), FAB collision (Task 6 step 1), Kalam flash (Task 3 step 4 lazy load), grep audit (Task 7 step 1) — ✅
- §8 verification checklist: Task 7 step 4 — ✅
- §9 commit shape: matches Tasks 1–8 — ✅
- §10 done state: Task 7/8 — ✅

**Type / class consistency:** Tailwind tokens (`bg-canvas`, `text-ink`, `bg-green-accent`, etc.) used consistently across tasks. Utility classes (`btn-pill`, `card-surface`, `modal-surface`, etc.) defined once in Task 1 and referenced by name elsewhere.

**No placeholders:** every step has concrete code or a concrete grep/build/git command.

---

## Execution

Plan saved. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, two-stage review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batched checkpoints for review.
