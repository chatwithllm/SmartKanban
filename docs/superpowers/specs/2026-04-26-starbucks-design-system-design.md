# Starbucks Design System Adoption — Spec

**Date:** 2026-04-26
**Branch:** `feat/starbucks-design`
**Companion design doc:** [`design_startbucs_kanban.md`](../../../design_startbucs_kanban.md) (root of repo)

## 1. Goal

Re-skin the SmartKanban web app to the Starbucks-inspired design system documented in `design_startbucs_kanban.md`. Replace the current dark `bg-neutral-950` aesthetic with a warm-cream cafe canvas and a four-tier green palette anchored by the Starbucks apron green. Add a **Light / Dark / System** theme toggle so the dark experience remains a first-class option.

No behavior change. No API, schema, or backend changes. No new product features. The work is purely visual + token plumbing.

## 2. Scope

### In scope
- New token + theme infrastructure (`web/src/theme.css`, Tailwind extend, `useTheme` hook).
- Conversion of all 23 visual surfaces in `web/src/` per the per-file map in §6.
- Self-hosted **Nunito Sans** as the primary typeface; **Kalam** lazy-loaded for Telegram-source bot attribution; **Iowan Old Style** (system) fallback for the Weekly Review serif moment.
- A theme toggle row added to `SettingsDialog.tsx` and `MobileMore.tsx`.
- Big-Bang rollout on a single branch with logically-grouped commits.

### Out of scope
- No changes to API, server, schema, telegram bot, knowledge fetcher, AI plumbing.
- No new automated UI tests; manual smoke is the verification model (matches existing project posture).
- No avatar photography (the `users` schema does not carry profile images; keep first-initial-on-deterministic-ring).
- No animation library — CSS transitions only.
- No icon library swap — keep current emoji + inline SVG.
- `MirrorView.tsx` (`/my-day`) is the explicit kiosk exception and is **not** restyled.

## 3. Decisions captured during brainstorming

| Decision | Choice |
|---|---|
| Rollout shape | **A — Big Bang single PR** (multiple grouped commits inside) |
| Theme strategy | **B — Dual theme** (Light + Dark with toggle) |
| Primary font substitute for SoDoSans | **C — Nunito Sans**, self-hosted |
| Mirror view | Unchanged (kiosk exception) |
| Test strategy | Manual smoke; no new automated UI tests |

## 4. Architecture

### 4.1 Token layer

`web/src/theme.css` defines all design tokens as CSS custom properties scoped to `:root` (light) and `:root[data-theme="dark"]` (dark). Tailwind reads from those vars via the `rgb(var(--token) / <alpha-value>)` pattern, so existing utility classes such as `bg-canvas`, `text-ink`, `shadow-card` work seamlessly under both themes.

**Surface tokens**
- `--canvas` — primary page bg (light: `#f2f0eb` Neutral Warm; dark: `#0a0a0a`)
- `--canvas-warm` — alias used by knowledge gold band area
- `--ceramic` — secondary surface (light: `#edebe9`; dark: `#171717`)
- `--card` — card surface (light: `#ffffff`; dark: `#1a1a1a`)
- `--neutral-cool` — search idle bg (light: `#f9f9f9`; dark: `#1f1f1f`)
- `--gold-lightest` — Templates / WeeklyReview wash (light: `#faf6ee`; dark: `#26211a`)

**Brand tokens (theme-invariant — same hex in both themes)**
- `--green-starbucks: #006241`
- `--green-accent: #00754A`
- `--green-house: #1E3932`
- `--green-uplift: #2b5148`
- `--green-light: #d4e9e2`
- `--gold: #cba258`

**Text tokens**
- `--ink` — primary text on light canvas (light: `rgba(0,0,0,0.87)`; dark: `rgba(255,255,255,0.92)`)
- `--ink-soft` — secondary metadata (light: `rgba(0,0,0,0.58)`; dark: `rgba(255,255,255,0.65)`)
- `--ink-rev` — text on dark-green bands (always white)
- `--ink-rev-soft` — secondary on dark-green (always `rgba(255,255,255,0.70)`)
- `--ink-rewards` — Weekly Review summary slate (`#33433d` light; lightened to `#a3b5ad` dark)

**Semantic**
- `--red: #c82014`
- `--yellow: #fbbc05`

**Geometry / depth**
- `--radius-card: 12px`
- `--radius-pill: 50px`
- `--shadow-card: 0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)`
- `--shadow-card-hover: 0 0 0.5px rgba(0,0,0,0.14), 0 4px 8px rgba(0,0,0,0.14)`
- `--shadow-card-drag: 0 12px 24px rgba(0,0,0,0.18)`
- `--shadow-app-bar: 0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)`
- `--shadow-fab-base: 0 0 6px rgba(0,0,0,0.24)`
- `--shadow-fab-ambient: 0 8px 12px rgba(0,0,0,0.14)`
- `--shadow-toast: 0 0 0.5px rgba(0,0,0,0.14), 0 8px 12px rgba(0,0,0,0.14)`
- `--shadow-modal: 0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24), 0 16px 32px rgba(0,0,0,0.18)`

Dark-theme shadow alphas may need a small bump (e.g. `0.30` instead of `0.14`) — verify visually.

### 4.2 Theme switcher

**`web/src/hooks/useTheme.ts`** (new file):
```ts
type Mode = 'light' | 'dark' | 'system';
function useTheme(): { mode: Mode; effective: 'light' | 'dark'; set: (m: Mode) => void };
```
- Reads from `localStorage["theme"]`, defaulting to `system`
- Listens to `window.matchMedia('(prefers-color-scheme: dark)')`
- Sets `document.documentElement.dataset.theme = effective` so CSS vars switch
- Updates `localStorage` on `set()`

The hook is consumed by:
- A new "Theme" row in `SettingsDialog.tsx` (segmented control: Light / Dark / System)
- A new "Theme" row in `MobileMore.tsx`

### 4.3 Tailwind config

`web/tailwind.config.js` extends:
- `colors` from CSS vars (canvas, ceramic, card, ink, ink-soft, ink-rev, ink-rev-soft, ink-rewards, neutral-cool, gold-lightest, green-starbucks, green-accent, green-house, green-uplift, green-light, gold, red, yellow)
- `boxShadow` (card, card-hover, card-drag, app-bar, fab-base, fab-ambient, toast, modal)
- `borderRadius` (card: 12px, pill: 50px, sheet: '12px 12px 0 0')
- `fontFamily.sans = ['Nunito Sans', ...]`, `fontFamily.serif = ['Iowan Old Style', 'Source Serif Pro', 'Georgia', 'serif']`, `fontFamily.script = ['Kalam', 'cursive']`
- `letterSpacing.tight2 = '-0.01em'`
- `fontSize` scale anchored to 1rem = 10px (text-1 .. text-10) on top of the existing default scale
- `safelist` for the dynamic due-date badge classes generated in `CardView.tsx` (the cream-canvas-friendly red/gold/yellow tinted variants)

Root `font-size: 62.5%` is set in `index.css` so 1rem = 10px (matches the design doc semantics).

### 4.4 Utility classes

`theme.css` exposes hand-written utility classes for components used widely enough that a Tailwind chain becomes noisy:
- `.btn-pill` — base pill button geometry (`50px` radius, `7px 16px` pad, font, transition, `:active { transform: scale(0.95) }`)
- `.btn-pill-filled-green` — Green Accent variant
- `.btn-pill-outlined-green` — outlined variant
- `.btn-pill-filled-black` — login / "Sign in"
- `.btn-pill-outlined-dark` — top app-bar "Sign out", "?" etc.
- `.btn-pill-on-dark-filled` / `.btn-pill-on-dark-outlined` — Green-on-Green Inverted pair
- `.btn-pill-destructive` — Red variant for archive
- `.card-surface` — White bg + 12px radius + card shadow + hover lift
- `.app-bar` — White bg + 3-layer shadow
- `.fab` — 48px / 56px circular Green Accent + layered shadow stack
- `.modal-surface` — White + 12px radius + modal shadow
- `.modal-header-strip` — full-width 48px House-Green band at `12px 12px 0 0`
- `.input-pill` — 50px-pill input shell (search bar)
- `.tag-pill` — Ceramic full-pill tag

### 4.5 Font loading

- Self-hosted Nunito Sans 400 / 600 / 700 in `web/public/fonts/` as `.woff2`, subset to Latin + Latin-Extended.
- `@font-face` declared in `theme.css` with `font-display: swap`.
- `<link rel="preload" as="font" type="font/woff2" crossorigin>` in `web/index.html` for the 400 weight (most common).
- Kalam loaded only when a `source = telegram` card mounts: `CardView.tsx` injects a `<link>` for Google Fonts Kalam on first such render and caches a flag so subsequent renders don't re-inject.
- Source Serif Pro (Weekly Review serif fallback) loaded lazily when the Weekly Review modal opens; defaults to Iowan Old Style (system on macOS) and Georgia otherwise.

## 5. Key visual treatments

### Card (`CardView.tsx`)
- White (`var(--card)`) bg, `12px` radius, whisper shadow, hover lift
- Tag pills: Ceramic bg full-pill, `13/400` ink-soft, `4px 10px` pad
- Avatars: circular `24px` (compact) or `28px` (default) with first-initial in Nunito Sans `13/600` over a deterministic per-user accent ring
- Audio glyph: small mint speaker icon (Green Accent at 70%)
- Image thumb: `12px` radius mini-tile with `0.3s ease-in` fade
- AI ceremony variant: `2px` Gold left rail + small gold star top-right (when `ai_summarized` or `needs_review`)
- Telegram attribution: `<small class="font-script">from @username via bot</small>` in Kalam, `12/400`, ink-soft

### Due-date badge color ladder (`CardView.tsx`)
Replaces the dark-mode `bg-red-900/40` etc.:

| Diff days | Background | Border | Text |
|---|---|---|---|
| Overdue (`< 0`) | `hsl(4 82% 43% / 5%)` | `1px var(--red)` | `var(--red)` |
| Today (`= 0`) | `var(--gold-lightest)` | `1px var(--gold)` | `var(--gold)` |
| Soon (`1–3`) | `#fef7e1` | `1px var(--yellow)` | `#8a6a02` |
| Future (`> 3`) | `var(--ceramic)` | none | `var(--ink-soft)` |

These colors are added to Tailwind safelist so JIT picks them up.

### Top app-bar (`BoardHeader.tsx`)
- White surface, `app-bar` shadow stack, progressive heights `64 → 72 → 83 → 99px`
- Brand "SmartKanban" wordmark in Starbucks Green H1 left-most
- Section + Scope segmented controls = ceramic-track + white-active-pill (each pill `7px 16px` pad, active text Starbucks Green `14/600`)
- Search bar (50px pill input)
- Right-cluster utility links in dark-outlined small style + user short_name + sign-out + `?`

### Mobile bottom tab-bar (`MobileShell.tsx`)
- House Green (`#1E3932`) bg, `56px` + safe-area
- Inverse top edge shadow `0 -1px 3px rgba(0,0,0,0.1)`
- Three tabs: Board / Knowledge / More
- Active tab: white icon + `12/600` label + `4px` Gold dot under icon
- Inactive: ink-rev-soft

### Status tab strip (mobile, `MobileShell.tsx`)
- Pill row of 4 chips below top bar: Backlog 📥 / Today 📅 / In Progress ⚡ / Done ✅
- Inactive: Ceramic bg, ink-soft, 13/400, 50px pill
- Active: White bg, Starbucks Green text, 13/600, with Gold dot under label

### "+ Card" FAB (`MobileShell.tsx` mobile, `Board.tsx` desktop)
- 56px mobile / 48px desktop, circular Green Accent, white `+` glyph
- Mobile: `bottom: calc(56px + 16px)` (clears tab-bar) `right: 16px`
- Desktop: `bottom: 24px right: 24px`
- `--frapTouchOffset: -0.8rem`
- Shadow stack: `--shadow-fab-base, --shadow-fab-ambient`
- `:active { transform: scale(0.95); --shadow-fab-ambient: 0 8px 12px rgba(0,0,0,0); }`
- Hides while `MobileCardActions` bottom-sheet is open (`pointer-events: none + opacity 0`)

### Modal pattern (Edit / Settings / Archive / WeeklyReview / KnowledgeEdit)
- White `card-surface`, `modal-shadow`
- 48px House-Green header strip at `12px 12px 0 0` with white close-X right + breadcrumb-ish title left
- Scrim `rgba(0,0,0,0.40)` blur `2px`
- Footer pill pair right-aligned, 12px gap
- Mobile: full-screen below 480px with sticky header

### Weekly Review (`WeeklyReview.tsx`) — single ceremony surface
- Gold Lightest (`var(--gold-lightest)`) top wash, 48px tall, no border
- Headline: Iowan-Old-Style serif, `28/400`, Starbucks Green ("Last week, in your world…")
- AI summary paragraph: serif `19/400`, line-height `1.5`, `var(--ink-rewards)`
- 3-up Cream stat tiles, each: number serif `36/600` Starbucks Green + label sans `13/400` ink-soft
- Footer: "Got it" filled + "Generate again" outlined

### MirrorView (`/my-day`)
- **Unchanged.** Black canvas, white text, Gold today-highlight remains the kiosk surface.

## 6. Per-file conversion map

| File | Conversion |
|---|---|
| `web/src/index.css` | Drop `bg-neutral-950 text-neutral-100`. Set `font-size: 62.5%` on html. Body uses `bg-canvas text-ink font-sans`. Import `theme.css` first. |
| `web/src/theme.css` *(new)* | All CSS vars (light + dark) + `@font-face` Nunito Sans + utility classes (§4.4). |
| `web/tailwind.config.js` | Extend `colors`, `boxShadow`, `borderRadius`, `fontFamily`, `letterSpacing`, `fontSize`, `safelist`. |
| `web/src/hooks/useTheme.ts` *(new)* | Theme state hook (§4.2). |
| `web/src/components/BoardHeader.tsx` | White app-bar shell + 3-layer shadow. Section + Scope pills = ceramic-track + white-active-pill. Title in Starbucks Green H1. Right-cluster utility links + dark-outlined `?` button. |
| `web/src/components/Board.tsx` | Add desktop FAB overlay. Cream gutters between columns. |
| `web/src/components/Column.tsx` | Column title H2 spec. Quick-add becomes dashed-pill ghost-card affordance. In-Progress column gets `4px` Green Uplift left rail. |
| `web/src/components/CardView.tsx` | White card spec. Tag pills, avatar initial-on-ring, AI gold rail+star, due-date ladder, Kalam attribution for telegram source. |
| `web/src/components/EmptyColumn.tsx` | Ceramic dashed droppable + cup-glyph SVG + `13/400` ink-soft caption. |
| `web/src/components/EditDialog.tsx` | Modal pattern + floating-label inputs + tag-pill multi-input + assignee avatar-pill multi-select + footer pill pair. |
| `web/src/components/SettingsDialog.tsx` | Modal pattern + left-rail tab nav inside ceramic track. **Add Theme toggle row.** |
| `web/src/components/ArchiveDialog.tsx` | Modal pattern + red destructive footer band ("Delete forever", "Delete all (N)"). |
| `web/src/components/TemplatesTab.tsx` | Gold Lightest washed surface + white template cards. |
| `web/src/components/WeeklyReview.tsx` | Serif headline + gold-lightest wash + ink-rewards summary text + 3-up stat tiles. |
| `web/src/components/SearchBar.tsx` | 50px-pill input + neutral-cool idle / white focused + green magnifier on focus + clear-x on right. |
| `web/src/components/Toast.tsx` | White card + 12px radius + colored leading icon + slide-up animation. Mobile bottom offset above tab-bar. |
| `web/src/components/ActivityTimeline.tsx` | Ceramic vertical rail + green-accent dots + ceramic day-label pills. |
| `web/src/components/KnowledgeRow.tsx` | Card spec + leading link icon green-accent. |
| `web/src/components/KnowledgeDetail.tsx` | White card + 12px URL hero thumb with shadow. |
| `web/src/components/KnowledgeEditDialog.tsx` | Modal pattern. |
| `web/src/KnowledgeView.tsx` | House-Green feature band hero + cream grid below. |
| `web/src/components/LoginView.tsx` | Cream page + white card + black-filled "Sign in" pill + brand wordmark. |
| `web/src/MirrorView.tsx` | **Unchanged** — kiosk exception. |
| `web/src/MobileShell.tsx` | House-Green bottom tab-bar + gold active dot. Status tab strip pill row. 56px FAB pinned `bottom: calc(56px + 16px)`. Search opens overlay with pill input. |
| `web/src/components/MobileCardActions.tsx` | White bottom-sheet, `12px 12px 0 0` radius, drag-handle, action rows with green-accent leading icons + chevron-right + bottom destructive Archive row. |
| `web/src/MobileMore.tsx` | Cream canvas + pill-row utility list. **Add Theme toggle row.** |
| `web/index.html` | `<link>` self-hosted Nunito Sans 400 preload. |

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `@dnd-kit` drag overlay visual regression | Spec'd `--shadow-card-drag` + `1.02` scale; manual cycle on each column during smoke. |
| Tailwind JIT misses dynamic classes | Explicit `safelist` for due-date ladder + drag states. |
| FAB / bottom-sheet collision on mobile | FAB `pointer-events: none + opacity 0` while `MobileCardActions` open. |
| Kalam font flash on first telegram card | Lazy-load with `font-display: swap`; brief fallback acceptable. |
| Dark-mode House Green bleeding into canvas | Add `1px solid rgba(255,255,255,0.06)` hairline on House-Green bands when dark theme active. Verify in QA. |
| Self-hosted font sourcing | Pull woff2 from Google Fonts CSS once, commit subset to `public/fonts/`. License: Nunito Sans is OFL — redistribution allowed. |
| Existing `bg-red-900/40` etc. references | Grep audit before final commit; replace with new tokens. |
| Theme toggle conflict with Mirror view | Mirror reads its own hardcoded styles, not tokens — toggle state ignored on `/my-day`. |

## 8. Verification

Manual smoke checklist (matches existing project posture — no new automated UI tests):

1. `cd web && npm run build` — clean, no Tailwind warnings
2. `cd web && npx tsc --noEmit` — type-check green
3. Visual smoke per breakpoint: 375px (xs), 480px (mobile), 768px (tablet), 1024px (desktop), 1440px (xl)
4. Theme toggle cycle: Light → Dark → System on every dialog (Edit, Settings, Archive, Weekly Review, Knowledge Edit)
5. Drag-and-drop cycle on each of 4 columns (Backlog / Today / In Progress / Done)
6. `/my-day?token=…` opens unchanged (kiosk exception preserved)
7. Telegram-source card renders Kalam attribution line correctly
8. AI-summarized card shows `2px` gold left rail + gold star top-right
9. Mobile FAB hides while `MobileCardActions` open
10. Lighthouse Performance ≥ existing baseline (font preload should not regress)

## 9. Commit shape

Single branch `feat/starbucks-design`, multiple grouped commits:

1. `feat(theme): tokens, fonts, Tailwind config, useTheme hook`
2. `feat(theme): adopt cream canvas + utility classes in index.css`
3. `feat(theme): convert BoardHeader, Board, Column, CardView, EmptyColumn, SearchBar`
4. `feat(theme): convert dialogs (Edit, Settings, Archive, WeeklyReview, KnowledgeEdit)`
5. `feat(theme): convert KnowledgeView/Row/Detail, TemplatesTab, ActivityTimeline, Toast, LoginView`
6. `feat(theme): convert MobileShell, MobileCardActions, MobileMore + status tabs + FAB`
7. `feat(theme): theme toggle row in Settings + MobileMore`
8. `chore(theme): font preload in index.html, gitignore .superpowers, design spec`

## 10. Done state

- Both themes work via the new toggle (Light / Dark / System)
- All 23 surfaces match the design doc (`design_startbucs_kanban.md`)
- `MirrorView.tsx` unchanged
- `npm run build` + `tsc --noEmit` green
- Manual smoke OK on all breakpoints
- Spec + design doc committed
- `feat/starbucks-design` branch ready to merge into `main`
