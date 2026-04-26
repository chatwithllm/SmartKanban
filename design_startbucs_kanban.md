# SmartKanban — Design System Inspired by Starbucks

A Starbucks-flavored visual system applied to the SmartKanban product (`web/src`). It re-skins the existing dark-neutral kanban with the warm-cream canvas, four-tier green palette, full-pill geometry, and floating-CTA elevation language of the Starbucks retail flagship — without changing any of the underlying behavior (drag-and-drop, four columns, scopes, mobile shell, knowledge base, templates).

## 1. Visual Theme & Atmosphere

The kanban becomes a **warm, confident workspace** wearing the Starbucks apron green. The page canvas is a neutral-warm cream (`#f2f0eb`) with ceramic off-white (`#edebe9`) for separators and zone-strips — referencing café paper and wood finishes, not corporate gray. The signature **Starbucks Green** (`#006241`) anchors the brand moment on the board title, the hero "My Day" mirror, and active scope pills. The four-tier green system maps onto distinct kanban surfaces: **Starbucks** for headings, **Accent** for CTAs and the floating "+ Card" FAB, **House** for the top app-bar and the dark-green Knowledge feature band, **Uplift** for decorative dividers and the in-progress column rail. Gold (`#cba258`) appears only around ceremony moments — the AI-summarized weekly review, the "needs review" flag, the priority pin — never as a general accent.

Typography carries the brand voice. **SoDoSans** (or its open-source substitute, see §3) sits across nearly every surface with a tight `-0.16px` letter-spacing — confident and friendly, not severe. The Weekly Review modal switches to the warm serif (`"Lander Tall", "Iowan Old Style", Georgia`) for its headline and the AI-written summary paragraph, echoing a coffeehouse chalkboard. The bot-capture quote in card details (when a card was created from Telegram) uses a subtle script (`"Kalam"`) for the "from-the-bot" attribution line — a personal cup-name touch. Three typefaces, three contexts.

Surfaces breathe through rounded geometry. Every button is a 50px full-pill — including the column "+ Add card" affordance, the search field, the scope segmented control, and the modal save/cancel pair. Cards take a 12px rounded-rectangle. The **"+ Card" floating FAB** — a 56px circular Green Accent (`#00754A`) order-button on the mobile shell and a 48px desktop variant pinned bottom-right of the board — is the product's signature depth move: a layered shadow stack (`0 0 6px rgba(0,0,0,0.24)` base + `0 8px 12px rgba(0,0,0,0.14)` ambient) that compresses via `scale(0.95)` on press. Elevations are otherwise restrained — card shadows stay at a whispered `0.14/0.24` alpha, the top app-bar gets a quiet three-layer shadow stack. The whole board feels like clean café signage on a cream apron.

**Key Characteristics:**
- Four-tier green system (Starbucks / Accent / House / Uplift) mapped to distinct kanban surfaces — not a single "brand green"
- Gold reserved for AI-ceremony moments (Weekly Review, needs-review flag, priority pin); never a general accent
- Warm-neutral canvas (`#f2f0eb` / `#edebe9`) replaces the dark `bg-neutral-950` of the current build
- Custom proprietary typeface (SoDoSans) with tight `-0.16px` tracking as the universal voice
- Context-specific type swaps: serif (Lander Tall) on Weekly Review headlines, script (Kalam) on "from-bot" attribution lines
- Full-pill buttons (`50px` radius) universal — quick-add inputs, scope tabs, save buttons, due-date badges
- `transform: scale(0.95)` press is the signature micro-interaction on every CTA
- Floating "+ Card" circular FAB (`56px` mobile / `48px` desktop, Green Accent fill, layered shadow stack) — the product's signature elevation element
- Card avatars treated as circular **photographed product** on a cream surface — never as flat colored initials
- 12px card radius + whisper-soft shadows keep the column flat-plus-hint-of-lift
- Rem-based spacing scale anchored at `1.6rem` (~16px) = `--space-3`, stepping to `6.4rem` (~64px)

**Color-block page rhythm:** Cream board canvas → White cards → Dark-green (`#1E3932`) top app-bar with white text → Cream column gutters → Dark-green Knowledge feature band → Cream utility zone → Dark-green mobile bottom tab-bar with gold active dot — an espresso-dark bookend around the bright kanban body.

## 2. Color Palette & Roles

**Source surfaces analyzed:** `BoardHeader.tsx`, `Board.tsx`, `Column.tsx`, `CardView.tsx`, `EditDialog.tsx`, `MobileShell.tsx`, `MobileCardActions.tsx`, `MobileMore.tsx`, `KnowledgeView.tsx`, `KnowledgeDetail.tsx`, `WeeklyReview.tsx`, `ArchiveDialog.tsx`, `SettingsDialog.tsx`, `TemplatesTab.tsx`, `LoginView.tsx`, `MirrorView.tsx`, `Toast.tsx`.

### Primary

- **Starbucks Green** (`#006241`): The historic brand green. Used on the board H1 ("Kanban"), the "My Day" mirror branding, the active scope-tab text, and as the primary brand signal wherever a single dominant color is needed.
- **Green Accent** (`#00754A`): Slightly brighter, more luminous green. Primary filled-CTA color ("Add card", "Save", "Create template", "Link to me") and the fill of the floating "+ Card" FAB.
- **House Green** (`#1E3932`): Deep near-black brand green. Top app-bar background, mobile bottom tab-bar, modal header strips, the dark-green Knowledge feature band, the `/my-day` mirror canvas, and footer attribution.
- **Green Uplift** (`#2b5148`): Secondary mid-dark green used sparingly on the **In Progress** column rail (a 4px left border) and the active-tab underline on the bottom tab-bar.
- **Green Light** (`#d4e9e2`): Pale mint wash used for valid-input tints, the **Done** column subtle background fill, and "saved" toast bg.

### Secondary & Accent

- **Gold** (`#cba258`): Reserved for AI-ceremony moments — Weekly Review headline accents, the "AI-summarized" badge on cards, the gold-star "needs review" flag, the priority pin. Never a general-purpose color.
- **Gold Light** (`#dfc49d`): Softer gold for the Weekly Review modal background wash.
- **Gold Lightest** (`#faf6ee`): Cream-gold page-surface wash used under the Templates tab heading and the AI-summary card section — ties the gold accent back into the warm neutral system.

### Surface & Background

- **White** (`#ffffff`): Primary card surface, modal surface, dropdown menu surface (Templates picker, scope dropdown).
- **Neutral Cool** (`#f9f9f9`): Subtle cool-gray surface for the search bar idle state, the column quick-add textarea, and quiet utility containers.
- **Neutral Warm** (`#f2f0eb`): The warm cream **primary board canvas** — replaces `bg-neutral-950` everywhere outside `MirrorView`.
- **Ceramic** (`#edebe9`): Slightly warmer/darker cream for column gutters, the empty-column droppable zone, and the section divider between Board and Knowledge tabs.
- **Black** (`#000000`): Reserved for the `MirrorView` (`/my-day`) kiosk canvas — the mirror keeps its black-on-white kiosk aesthetic for low-light wall mounting.

### Neutrals & Text

- **Text Black** (`rgba(0,0,0,0.87)`): Primary heading and body text on light surfaces. Not pure black — an 87%-opacity black that reads warmer.
- **Text Black Soft** (`rgba(0,0,0,0.58)`): Secondary/metadata text — relative-time stamps, tag pill text, assignee short_name caption, "N cards" count.
- **Text White** (`rgba(255,255,255,1)`): Primary text on dark green surfaces (top app-bar, mobile bottom tabs, House-Green Knowledge band).
- **Text White Soft** (`rgba(255,255,255,0.70)`): Secondary text on dark-green — the bot attribution caption, mobile bottom-tab inactive labels, Knowledge band subhead.
- **Rewards Green** (`#33433d`): A muted slate-green used only on the AI Weekly Review summary paragraph — a "dustier" reading color that signals "ceremony surface" without using full Starbucks Green.

### Semantic & Accent

- **Red** (`#c82014`): Error and destructive state — destructive confirms in `ArchiveDialog` ("Delete forever", "Delete all (N)"), invalid-input border, error toast bg.
- **Yellow** (`#fbbc05`): Warning state — overdue due-date badge text, archive-dialog warning header.
- **Green Light** at 33% (`hsl(160 32% 87% / 33%)`): Form valid-field tint background.
- **Red Tint** (`hsl(4 82% 43% / 5%)`): Invalid-field tint on form inputs (login, edit dialog).

### Due-Date Badge Color Mapping

Replaces the existing dark-mode `bg-red-900/40` / `bg-amber-900/40` / `bg-yellow-900/40` / `bg-neutral-800` ladder with the cream-canvas-friendly equivalents:

| Diff days | Background | Text |
|---|---|---|
| Overdue (`< 0`) | Red Tint (`hsl(4 82% 43% / 5%)`) + `1px` Red border | Red (`#c82014`) |
| Today (`= 0`) | Gold Lightest (`#faf6ee`) + `1px` Gold border | Gold (`#cba258`) |
| Soon (`1–3`) | Cream Yellow (`#fef7e1`) + `1px` Yellow border | Yellow text shifted darker (`#8a6a02`) |
| Future (`> 3`) | Ceramic (`#edebe9`) | Text Black Soft |

### Black / White Alpha Ladders

Two parallel translucent scales for overlay and secondary-text use:
- `rgba(0,0,0,0.06)` through `rgba(0,0,0,0.90)` in 10% steps — for dark overlays on light surfaces (modal scrim, dropdown shadow underlay)
- `rgba(255,255,255,0.10)` through `rgba(255,255,255,0.90)` in 10% steps — for light overlays on dark green surfaces

### Gradient System

No structural gradient tokens. Surface hierarchy is solid-color-block throughout — the system relies on the five-tier cream/green surface palette rather than gradients. The only exception is the Rewards-style **status-tier accent stripe** at the top of each Mobile Shell status pill (Backlog grayscale → Today gold → In Progress green-uplift → Done green-light), which uses solid-color stripes, not blends.

## 3. Typography Rules

### Font Family

- **Primary:** `SoDoSans, "Helvetica Neue", Helvetica, Arial, sans-serif` — used across every surface in the kanban (board, mobile shell, dialogs, knowledge view, login)
- **Loading Fallback:** `"Helvetica Neue", Helvetica, Arial, sans-serif` — what users see before SoDoSans loads
- **Weekly Review Serif:** `"Lander Tall", "Iowan Old Style", Georgia, serif` — used on the `WeeklyReview.tsx` headline ("Last week, in your world…") and the AI-written summary paragraph
- **Bot Attribution Script:** `"Kalam", "Comic Sans MS", cursive` — used exclusively for the "captured by bot from @username" attribution line on cards with `source = telegram`

No OpenType stylistic sets explicitly activated at `:root`.

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing | Notes |
|---|---|---|---|---|---|
| Display (text-10) | 5.0rem / 80px | 400–600 | 1.2 | -0.16px | `MirrorView` "My Day" hero |
| Jumbo (text-9) | 3.6rem / 58px | 400–600 | 1.2 | -0.16px | Login screen "SmartKanban" headline |
| Hero Large (text-8) | 2.8rem / 45px | 400–600 | 1.2–1.5 | -0.16px | Weekly Review headline (in Lander Tall serif) |
| H1 | 24px | 600 | 36px | -0.16px | Board title "Kanban" in Starbucks Green |
| H2 | 24px | 400 | 36px | -0.16px | Column titles ("Backlog" / "Today" / "In Progress" / "Done") in Text Black |
| Body Large | 19px | 400–600 | 33.25px | -0.16px | Edit-dialog field labels, knowledge-detail body |
| Body (text-3) | 1.6rem / 16px | 400 | 1.5 | -0.01em | Card title, default body copy |
| Small (text-2) | 1.4rem / 14px | 400–600 | 1.5 | -0.01em | Pill button label, scope-tab label, "N cards" count, tag pill |
| Micro (text-1) | 1.3rem / 13px | 400 | 1.5 | -0.01em | Relative time, assignee short_name caption, due-date badge text |
| Button Label | 14–16px | 400–600 | 1.2 | -0.01em | All pill-button labels |

**Letter-spacing tokens:**
- `letterSpacingNormal`: `-0.01em` (default — tight, characteristic)
- `letterSpacingLoose`: `0.1em` (emphasized caps — column-header sub-label "X cards")
- `letterSpacingLooser`: `0.15em` (uppercase mode — "ARCHIVE" header in `ArchiveDialog`)

**Line-height tokens:**
- `lineHeightNormal`: `1.5` (body, card description preview)
- `lineHeightCompact`: `1.2` (display, button labels, column headers)

### Principles

- **Tight negative tracking (`-0.01em`)** is applied universally — the entire kanban reads slightly compressed, which gives SoDoSans its confident presence without feeling squeezed.
- **Weight shifts carry hierarchy, not size shifts.** Column header (24px / 400, Text Black) and the board H1 (24px / 600, Starbucks Green) share size; only weight + color separate them.
- **Size tokens use rem, anchored to `1rem = 10px`** via `font-size: 62.5%` on the root. So `1.6rem` = 16px, `2.4rem` = 24px. The scale is semantic (textSize-1 through textSize-10), not arbitrary pixel values.
- **Context-specific typeface swaps** are deliberate and localized. The serif belongs only to Weekly Review. The script belongs only to bot-attribution lines. Never mix them with the primary sans within the same surface.
- **Body text never goes pure black** — it sits at `rgba(0,0,0,0.87)` to match the warm-neutral canvas temperature.
- **Card titles wrap at 2 lines max** with `text-overflow: ellipsis` — the kanban prizes density without hyphen-breaking on small column widths.

### Note on Font Substitutes

SoDoSans is proprietary to Starbucks (licensed from House Industries, not publicly available). Reasonable open-source substitutes:
- **Inter** (Google Fonts) — similar humanist geometric proportions, wide weight range — recommended default substitute
- **Manrope** — slightly rounder, similar confident feel
- **Nunito Sans** — warmer, good for a "café" brand feel

If substituting, verify the tight `-0.01em` / `-0.16px` tracking still reads well; some open-source fonts need `-0.005em` instead.

Lander Tall (Weekly Review serif) is custom — open-source substitutes: **Iowan Old Style** (already in fallback), **Lora**, or **Source Serif Pro**. Kalam (bot attribution script) is available on Google Fonts directly.

## 4. Component Stylings

### Buttons

**1. Primary Filled — "Add card", "Save", "Create template", "Link to me"**
- Background: `#00754A` (Green Accent)
- Text: `#ffffff`
- Border: `1px solid #00754A`
- Radius: `50px` (full pill)
- Padding: `7px 16px` (default), `10px 20px` (large in dialog footers)
- Font: SoDoSans, 16px, weight 600, letter-spacing `-0.01em`
- Active state: `transform: scale(0.95)` via `--buttonActiveScale`
- Transition: `all 0.2s ease`

**2. Primary Outlined — "Add link", "Edit", "Customize"**
- Background: transparent
- Text: `#00754A` (Green Accent)
- Border: `1px solid #00754A`
- Same radius / padding / active / transition as Primary Filled

**3. Black Filled — "Sign in", login submit on `LoginView`**
- Background: `#000000`
- Text: `#ffffff`
- Border: `1px solid #000000`
- Radius: `50px`, Padding: `7px 16px`
- Font: 14px, weight 600

**4. Dark Outlined — "Sign out", "?", utility nav links**
- Background: transparent
- Text: `rgba(0, 0, 0, 0.87)` (Text Black)
- Border: `1px solid rgba(0, 0, 0, 0.87)`
- Radius: `50px`, Padding: `7px 16px`
- Font: 14px, weight 600

**5. Green-on-Green Inverted — Knowledge band CTAs ("Open knowledge", "+ New note")**
- Background: `#ffffff`
- Text: `#00754A`
- Border: `1px solid #ffffff`
- Used when the surface behind the button is the dark-green House Green band — white button with green text

**6. Outlined on Dark — "Cancel" on Knowledge band, "Dismiss" on install-banner**
- Background: transparent
- Text: `#ffffff`
- Border: `1px solid #ffffff`
- Used on dark-green feature bands paired with a Green-on-Green Inverted primary

**7. Destructive — "Delete forever", "Delete all (N)" in `ArchiveDialog`**
- Background: `#c82014` (Red)
- Text: `#ffffff`
- Border: `1px solid #c82014`
- Radius: `50px`, Padding: `7px 16px`
- Font: 14px, weight 600
- Confirms via a second-tap pattern; the first tap reveals a one-second hold-affordance ring

**8. "+ Card" Floating FAB — the signature elevation element**
- Background: `#00754A` (Green Accent)
- Icon: white `+` glyph, `24px` stroke 2.5
- Size: `5.6rem / 56px` (mobile shell), `4.8rem / 48px` (desktop board overlay)
- Radius: `50%` (full circle)
- Position: fixed bottom-right; mobile offset `bottom: calc(56px + 16px)` to clear the bottom-tab bar; desktop `bottom: 24px right: 24px`
- Touch offset: `--frapTouchOffset: calc(-1 * .8rem)` for 8px-bigger tap target
- Shadow stack: base `0 0 6px rgba(0,0,0,0.24)` + ambient `0 8px 12px rgba(0,0,0,0.14)`
- Active state: ambient shadow fades to `0 8px 12px rgba(0,0,0,0)` + `scale(0.95)`
- Behavior: tap opens the column quick-add textarea inline at the bottom of the **active** status column (mobile) or focuses the global new-card field (desktop)

**9. Quick-Add "+ Card" Inline (Column footer)**
- Background: `transparent`
- Text: `#00754A` (Green Accent)
- Border: `1px dashed rgba(0,0,0,0.14)` (becomes solid Green Accent on hover)
- Radius: `12px` (matches card radius — appears as a "ghost card slot")
- Padding: `12px 16px`, full-width within the column
- Font: 14px, weight 400, leading-`+`

**10. Scope Segmented Control — "My board / Family Inbox / Everything"**
- Track: rounded `50px` pill in Ceramic (`#edebe9`), `2px` inner padding
- Active pill: White (`#ffffff`) bg, Starbucks Green (`#006241`) text, weight 600, soft shadow `0 1px 2px rgba(0,0,0,0.08)`
- Inactive pill: transparent bg, Text Black Soft, weight 400
- Padding inside pill: `7px 16px`
- Smooth slide of the active highlight: `transition: all 0.2s ease`

**11. Section Tab — "Board / Knowledge"**
- Same segmented-control pattern as Scope but anchored top-left of the header

**12. Toast — `Toast.tsx` notifications**
- Surface: White card, `12px` radius, layered shadow (`0 0 0.5px rgba(0,0,0,0.14), 0 8px 12px rgba(0,0,0,0.14)`)
- Success variant: leading icon in Green Accent, body text in Text Black
- Error variant: leading icon in Red, `1px` Red left rail
- Padding: `12px 16px`
- Animates in with `translateY(8px) → 0` + `opacity 0 → 1` over `0.2s ease-out`

### Cards & Containers

**Card (`CardView.tsx`)**
- Background: `#ffffff` (`--cardBackgroundColor`)
- Radius: `12px` (`--cardBorderRadius`)
- Shadow: `0px 0px .5px 0px rgba(0,0,0,0.14), 0px 1px 1px 0px rgba(0,0,0,0.24)` (`--cardBoxShadow`)
- Hover: shadow lifts to `0 0 0.5px rgba(0,0,0,0.14), 0 4px 8px rgba(0,0,0,0.14)`
- Drag (active in `@dnd-kit`): shadow `0 12px 24px rgba(0,0,0,0.18)`, slight `1.02` scale
- Padding: `12px` (`--space-2.5`)
- Inner spacing: title `16/600`; description preview `13/400` Text Black Soft, max 2 lines; tag row `8px` gap; avatar row right-aligned
- Tag pill: full-pill `50px` radius, Ceramic bg, Text Black Soft `13/400`, `4px 10px` padding
- Due-date badge: full-pill, semantic colors per §2 mapping
- Avatar: circular `24px` (compact), `28px` (default), photographed-product feel — the user's first initial in SoDoSans `13/600` over a per-user accent ring (deterministic from user id)
- Audio attachment glyph: small mint-green speaker icon (Green Accent fill at 70% opacity)
- Image attachment thumbnail: `12px` radius mini-tile, slight `0.3s ease-in` opacity fade-in on load (`--imageFadeTransition`)

**Card AI-Ceremony Variant (when `ai_summarized = true` or `needs_review = true`)**
- Adds a `2px` Gold (`#cba258`) left rail to the card
- Adds a small gold star icon in the top-right corner
- Otherwise identical card surface — keeps the cream context calm

**Empty Column (`EmptyColumn.tsx`)**
- Background: Ceramic (`#edebe9`) with `1px dashed rgba(0,0,0,0.14)` border
- Radius: `12px`
- Padding: `24px 16px`
- Centered illustration glyph (cup silhouette in Text Black Soft) + "Drop a card here" caption in `13/400` Text Black Soft

**Edit Dialog (`EditDialog.tsx`)**
- Surface: White, `12px` radius
- Padding: `2.4rem` (`--modalPadding`); top padding `8.8rem` (`--modalTopPadding`) to clear close button
- Header strip: full-width House-Green band (`#1E3932`) at `12px 12px 0 0` radius, `48px` tall, white close-X right + breadcrumb-ish title left
- Scrim: `rgba(0,0,0,0.40)` underneath, blur `2px`
- Field stack: floating-label inputs (see Inputs)
- Footer row: pill button pair right-aligned (Save filled + Cancel outlined), separated by `12px`, full-bleed top border `1px solid rgba(0,0,0,0.06)`

**Settings Dialog (`SettingsDialog.tsx`)** and **Archive Dialog (`ArchiveDialog.tsx`)**
- Same modal surface spec as Edit Dialog
- Settings uses a left-rail tab nav (Profile / Telegram / Templates / Mirror tokens) — pills inside a Ceramic-bg vertical track
- Archive header strip uses the standard House-Green band; the destructive "Delete all (N)" sits inside its own Red-tinted footer band

**Knowledge Detail Card (`KnowledgeDetail.tsx`)**
- Same card spec as Card with extra padding `16px`
- The fetched URL preview thumbnail uses the gift-card-style "physical card on canvas" treatment — `12px` radius, `0 4px 8px rgba(0,0,0,0.14)` shadow

**Templates Tab (`TemplatesTab.tsx`)**
- Surface uses Gold Lightest (`#faf6ee`) wash to subtly differentiate "templates ceremony" from regular settings
- Each template row: White card on the gold-cream wash, `12px` radius

**Cookie/Install Banner (mobile)**
- Dark-green modal card pinned bottom of the page (above the bottom tab-bar) with "Install app" (green-filled) and "Dismiss" (outlined-on-dark) buttons
- Same layout pattern as the Starbucks consent module

### Inputs & Forms

**Floating Label Input** (Edit Dialog title/description, Login, Knowledge edit)
- Label floats above the input border when focused/filled
- Desktop label font size: `1.9rem` default, animates to `1.4rem` when active
- Mobile label font size: `1.6rem` default, animates to `1.3rem` active
- Label horizontal offset: `12px` from left
- Active label translate: up to `-12px` with `-50%` Y translation
- Field padding: `12px`
- Form horizontal padding: `1.6rem`
- Validation: valid-field gets `rgba(green-light, 0.33)` tint; invalid-field gets `rgba(red, 0.05)` tint and `1px solid #c82014` border
- Transition: `0.3s option-label-marker-expansion cubic-bezier(0.32, 2.32, 0.61, 0.27)` on checked-input

**Search Bar (`SearchBar.tsx`)**
- Background: Neutral Cool (`#f9f9f9`) idle / White (`#ffffff`) focused
- Border: `1px solid rgba(0,0,0,0.06)` idle / `1px solid #00754A` focused
- Radius: `50px` (full pill — matches the Starbucks language even on inputs)
- Height: `40px`, padding `8px 16px 8px 40px` (left padding accommodates the magnifier glyph)
- Magnifier glyph in Text Black Soft, shifts to Green Accent on focus
- Clear "x" appears at right when value present, in Text Black Soft

**Tag Input (multi-pill, edit dialog)**
- Each tag is a Ceramic-bg full-pill with a tiny "x" close glyph at right
- Add-input is an inline minimum-width text field that grows with input
- "Enter" / "comma" commits the pill; backspace on empty input deletes the last pill

**Date Picker (due_date)**
- Native control wrapped to match the floating-label input visual; calendar icon at right in Text Black Soft

**Assignee/Share Picker**
- Multi-select using circular avatar pills (24px) with a leading "+" affordance on the row
- Selected avatars have a `2px` Green Accent ring; unselected have no ring
- Background: White card, `12px` radius

**Numeric Stepper (template `due_offset_days`)**
- Used inside the template edit form for the `due_offset_days` numeric value
- `−` minus button + count number + `+` plus button, all inline
- Buttons: circular `32×32px` with `1px solid #d6dbde` border, neutral gray icon
- Count: 16/700 Text Black centered

### Navigation

**Top App-Bar (desktop, `BoardHeader.tsx`)**
- Fixed position with progressive heights: `64px` xs → `72px` mobile → `83px` tablet → `99px` desktop
- Background: White (`#ffffff`)
- Shadow stack: `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` — three-layer soft lift
- Left cluster: SmartKanban wordmark (Starbucks Green H1), Section tab segmented control (Board / Knowledge), Scope segmented control (My board / Family Inbox / Everything), "N cards" count, Search bar
- Right cluster: "Weekly review" link, "Archive" link, "Settings" link, user `short_name`, "Sign out", "?" shortcut button
- All inline links in SoDoSans `14/400` Text Black; hover underline `1px` solid Starbucks Green

**Mobile Bottom Tab-Bar (`MobileShell.tsx`)**
- Height: `56px` + safe-area inset bottom
- Background: House Green (`#1E3932`)
- Shadow: top edge inverse `0 -1px 3px rgba(0,0,0,0.1)`
- Three tabs: Board, Knowledge, More — each `33%` width
- Inactive tab: icon + label in Text White Soft (`rgba(255,255,255,0.70)`), `12/400`
- Active tab: icon + label in white, `12/600`, with a `4px` Gold (`#cba258`) dot underneath the icon — the only place gold is used outside Weekly Review

**Status Tab Strip (mobile, above the column list)**
- Horizontal pill row of four status chips: Backlog / Today / In Progress / Done
- Inactive chip: Ceramic bg, Text Black Soft, `13/400`, `50px` radius, `7px 14px` padding
- Active chip: White bg, Starbucks Green text, weight 600, the same Gold dot under the label
- Each chip carries a leading status emoji from the existing `STATUS_BADGE` table (📥 / 📅 / ⚡ / ✅) preserved as-is

**Mobile Card Actions Sheet (`MobileCardActions.tsx`)**
- Bottom-sheet modal at `12px 12px 0 0` radius, White surface
- Drag-handle at top (`32px × 4px` Ceramic pill, centered)
- Action rows: full-width `48px` rows with leading icon in Green Accent, label in `16/400` Text Black, trailing chevron in Text Black Soft
- Destructive row ("Archive") at the bottom in Red

### Image Treatment

- **Card image attachments**: thumbnail at `12px` radius, soft drop shadow around the image to feel like a "polaroid on cream"; `opacity 0.3s ease-in` fade on load
- **Avatar photography (when implemented)**: circular, soft inner shadow `inset 0 0 0 1px rgba(0,0,0,0.06)`; user-id-deterministic accent ring color
- **Knowledge URL thumbnail**: full-width `12px`-radius hero image at the top of the Knowledge Detail; same fade-in
- **Empty-state illustrations**: Use the cup-silhouette glyph as the universal "nothing here" mark — never use Material-style placeholder rectangles

### Dark-Green Knowledge Feature Band

Full-width `#1E3932` (House Green) band at the top of `KnowledgeView.tsx` with:
- Left: white headline "Knowledge" + subhead "URLs, snippets, notes — all linked back to cards" in Text White Soft
- Right: a Green-on-Green Inverted "+ New note" CTA paired with an Outlined-on-Dark "Open in app" CTA
- Split ratio ~60/40 desktop, stacked vertically on mobile
- White text throughout with `rgba(255,255,255,0.70)` for secondary copy
- Padding: `40px` vertical, `24px` horizontal

### Weekly Review Modal (`WeeklyReview.tsx`) — the ceremony surface

This is the single Lander-Tall serif moment in the product:
- Modal surface: White, `12px` radius
- Top band: Gold Lightest (`#faf6ee`) wash, `48px` tall, no border — flows into the white content
- Headline: "Last week, in your world…" in Lander Tall serif, `28/400`, Starbucks Green
- AI summary paragraph: Lander Tall `19/400`, line-height `1.5`, Rewards Green (`#33433d`)
- Stat tiles: 3-up grid of Cream-bg cards (`12px` radius), each showing a number (Lander Tall `36/600` Starbucks Green) + label (SoDoSans `13/400` Text Black Soft)
- Footer pill pair: "Got it" (Green Accent filled) + "Generate again" (Green Accent outlined)

### Activity Timeline (`ActivityTimeline.tsx`)

- Vertical rail with `2px` Ceramic line down the left
- Each event: small circular Green Accent dot on the rail, time-stamp on the left in `13/400` Text Black Soft, action description on the right in `14/400` Text Black
- Group days with a sticky day-label pill at the top of each group (Ceramic bg, full-pill)

### Mirror View (`MirrorView.tsx`)

The kiosk view keeps the original black-on-white aesthetic — wall-mounted in a dark room, this is the only surface where black is the canvas:
- Background: `#000000`
- Headline: `Display (text-10)` size in white SoDoSans
- Card list: white text on black, with Gold (`#cba258`) for "today" highlights — the only other gold-ceremony surface

### Expander / Accordion (knowledge body, settings sections)

- Duration: `300ms` (`--expanderDuration`)
- Timing curve: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` — a measured ease-out
- Used for collapsible Knowledge body, Settings groups, and Templates "Stored fields" preview

### Login / Register View (`LoginView.tsx`)

- Page: full-bleed Neutral Warm canvas (`#f2f0eb`)
- Card: White, `12px` radius, max-width `500px`, centered
- Brand: SmartKanban wordmark (Starbucks Green H1) at the top
- Inputs: floating-label spec from above
- Submit: Black Filled "Sign in" pill (`50px`)
- Toggle to register: Dark Outlined link below the form
- The login card is a single coffeehouse-receipt-feel surface on cream — minimal chrome

### Toast / Snackbar (`Toast.tsx`) — see Buttons section

### Cookie/Install Consent — see Cards section

## 5. Layout Principles

### Spacing System

Rem-based semantic scale (anchored `1rem = 10px`):

| Token | Rem | Pixels | Typical Use |
|---|---|---|---|
| `--space-1` | `0.4rem` | 4px | Tightest inline padding (chip-internal) |
| `--space-2` | `0.8rem` | 8px | Tag pill gap, button vertical padding |
| `--space-3` | `1.6rem` | 16px | Default — card padding, outer gutter xs, column gap |
| `--space-4` | `2.4rem` | 24px | Section inner spacing, modal padding, outer gutter md |
| `--space-5` | `3.2rem` | 32px | Major between-section spacing, knowledge band vertical |
| `--space-6` | `4rem` | 40px | Large gaps, outer gutter lg, top-app-bar to first column |
| `--space-7` | `4.8rem` | 48px | Section-to-section spacing |
| `--space-8` | `5.6rem` | 56px | Mobile bottom-tab height; FAB size |
| `--space-9` | `6.4rem` | 64px | Widest section padding (mirror view) |

**Gutter tokens:**
- `--outerGutter: 1.6rem` (16px, default / mobile)
- `--outerGutterMedium: 2.4rem` (24px, tablet)
- `--outerGutterLarge: 4.0rem` (40px, desktop)

**Universal rhythm constant:** `1.6rem` (16px) — outer gutter mobile, card padding baseline, default body. Most-used unit.

### Grid & Container

- Column width scale: `--columnWidthSmall: 320px` / `Medium: 360px` / `Large: 400px` / `XLarge: 1440px` for the board container
- Board layout: 4 columns side-by-side on desktop with `16px` gap; horizontal scroll on tablet at `<1024px`; mobile collapses to one-column-at-a-time via the Status Tab Strip
- Knowledge grid: 1-up mobile, 2-up tablet, 3-up desktop, max-width `1280px` content cap
- Edit Dialog: max-width `560px`, vertically centered with `48px` margin on mobile

### Whitespace Philosophy

Whitespace carries the feeling of "plenty of space in the café." Section padding leans generous (40–64px between board header and first column). Cards within a column are separated by `8px` of canvas — the cream itself is the divider. The cream canvas (`#f2f0eb`) is the visual breath between white cards and dark-green bands; never use 1px hairline dividers between cards.

### Border Radius Scale

| Value | Use |
|---|---|
| `12px` | Cards, modals, knowledge tiles, empty-column droppable, toast (`--cardBorderRadius`) |
| `12px 12px 0 0` | Mobile bottom-sheet, modal header strip (top-rounded only) |
| `50px` | All buttons, scope tabs, search bar, tag pills, due-date badges (`--buttonBorderRadius`) |
| `50%` | Circular avatars, FAB, status indicator dots, activity timeline dots |

## 6. Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| Card | `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)` | Default cards — whisper-soft dual-shadow |
| Card Hover | `0 0 0.5px rgba(0,0,0,0.14), 0 4px 8px rgba(0,0,0,0.14)` | Subtle lift on cursor presence |
| Card Drag | `0 12px 24px rgba(0,0,0,0.18)` | Active dragging in `@dnd-kit` |
| Top App-Bar | `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` | Triple-layer soft lift on the fixed top bar |
| Mobile Bottom Tab-Bar | `0 -1px 3px rgba(0,0,0,0.1)` | Inverse top edge soft lift |
| FAB Base | `0 0 6px rgba(0,0,0,0.24)` | Base halo around the circular CTA |
| FAB Ambient | `0 8px 12px rgba(0,0,0,0.14)` | Stacked directional ambient — floats the FAB forward |
| Toast | `0 0 0.5px rgba(0,0,0,0.14), 0 8px 12px rgba(0,0,0,0.14)` | Notification surface |
| Modal | Card spec + `0 16px 32px rgba(0,0,0,0.18)` ambient | Edit dialog, archive dialog, settings |
| Knowledge URL Thumb | `0 4px 8px rgba(0,0,0,0.14)` | Physical-card feel for fetched-URL preview |

**Shadow philosophy:** Whisper-soft, layered over solid — never a single heavy drop shadow. Stack 2–3 low-alpha shadows with different offsets to simulate ambient + direct lighting. The FAB is the most elevated element on any page.

### Decorative Depth

- **No gradient system** — surfaces are solid color-block
- **Color-block banding** carries perceived depth (the dark-green Knowledge band reads as a "recessed feature zone" between cream body sections)
- **Column rails**: a `4px` left border on the **In Progress** column in Green Uplift adds a single hint of vertical depth without using a divider line

## 7. Do's and Don'ts

### Do
- Use Neutral Warm (`#f2f0eb`) or Ceramic (`#edebe9`) as the board canvas instead of pure white or `bg-neutral-950` — the warm cream is the signature replacement for the current dark theme
- Map the green tiers to their intended surface role — Starbucks Green for the board H1, Green Accent for "+ Card" / "Save" CTAs, House Green for the top app-bar and Knowledge band, Uplift for the In Progress column rail
- Keep tracking tight at `-0.01em` / `-0.16px` on SoDoSans across the whole system
- Use 50px full-pill radius on every button without exception — including the column quick-add affordance and the search bar
- Apply `transform: scale(0.95)` as the universal button active state
- Reserve Gold for AI-ceremony moments only — Weekly Review headline, AI-summarized card flag, needs-review indicator, mobile bottom-tab active dot, mirror "today" highlight
- Use SoDoSans for nearly everything; switch to Lander Tall serif **only** for the Weekly Review headline and AI summary paragraph; reserve Kalam script for the "from-bot @username" attribution line on Telegram-sourced cards
- Layer 2–3 low-alpha shadows instead of one heavier drop shadow for elevation
- Use the FAB circular CTA as the persistent floating "+ Card" entry on every board surface (mobile shell + desktop board overlay)
- Let the cream canvas breathe between cards — use whitespace, not 1px dividers
- Keep `MirrorView` black-on-white — its kiosk-on-a-wall context overrides the general cream-canvas rule

### Don't
- Don't use pure white as the board canvas — the warm cream temperature is load-bearing
- Don't keep `bg-neutral-950` / dark-mode neutrals — the system inverts to cream by design
- Don't pick "one brand green" — the four-green system is intentional; using only `#006241` everywhere flattens the brand
- Don't use Gold as a general-purpose accent — it's an AI-ceremony signal only
- Don't square the corners on buttons or input pills — the 50px pill is universal
- Don't introduce gradient fills — the system is color-block throughout
- Don't weight-contrast H1 and column-header by size — hierarchy comes from weight + color (600 Starbucks-Green vs 400 Text Black)
- Don't use pure black for body text — `rgba(0,0,0,0.87)` matches the warm canvas
- Don't skip the `scale(0.95)` active feedback on buttons — it's a signature micro-interaction
- Don't stack single heavy shadows; always layer 2–3 low-alpha ones
- Don't introduce serifs or scripts into the main board flow — they belong to Weekly Review and bot-attribution contexts respectively
- Don't put a 1px hairline between cards — use the cream gap
- Don't bring the dark-green app-bar styling into modal bodies; modal bodies stay white with a House-Green header strip only

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| xs | `< 480px` | Top app-bar collapses to mobile shell only; bottom tab-bar; status tab strip; single-column board view; FAB at 56px clearing the bottom-tab bar |
| Mobile | `480–767px` | Same as xs; FAB still 56px; knowledge grid 1-up |
| Tablet | `768–1023px` | Top app-bar appears at `83px`; horizontal-scroll 4-column board; knowledge grid 2-up; FAB drops to 48px |
| Desktop | `1024–1439px` | Top app-bar `99px`; full 4-column board fits without scroll; knowledge grid 3-up; FAB 48px |
| XLarge | `1440px+` | Content caps at `--columnWidthXLarge`; extra cream margin on either side of the board |

### Touch Targets

- Pill buttons at `7px 16px` padding measure ~32px tall — below 44px WCAG AAA minimum for touch-only surfaces. On mobile, expand padding to `10px 16px` to land at ~44px
- FAB at `56px` mobile / `48px` desktop is well above minimum; uses `--frapTouchOffset: calc(-1 * .8rem)` to extend tap area 8px beyond visual edge
- Mobile bottom tab targets are `33% × 56px` — well over minimum
- Status tab chips minimum `40px` tall on mobile
- Form float-label inputs grow their label font size on mobile (1.6rem base vs 1.9rem desktop)

### Collapsing Strategy

- **Top app-bar → mobile shell**: At `<768px`, the desktop `BoardHeader` is replaced by the `MobileShell` with bottom tabs (Board / Knowledge / More) and a status tab strip
- **4-column board → single status column**: Mobile shows one status at a time, swiped/tapped via the status strip — preserves all content density
- **Knowledge feature band → stacked**: Image right + text left becomes text-on-top-image-below
- **Outer gutter scales**: 16px → 24px → 40px as viewport grows
- **Edit dialog → full-screen sheet on mobile**: Below `480px`, the edit dialog goes full-screen with a sticky House-Green header

### Image Behavior

- Card image thumbnails crop to `square` on mobile, retain aspect ratio on desktop
- Knowledge URL hero images preserve aspect; never stretch
- `opacity 0.3s ease-in` fade-in on image load (prevents jarring pop-in)
- FAB icon uses currentColor SVG; no raster

## 9. Agent Prompt Guide

### Quick Color Reference

- Primary CTA: "Green Accent (`#00754A`)"
- Primary CTA text: "White (`#ffffff`)"
- Brand heading: "Starbucks Green (`#006241`)"
- Top app-bar / mobile bottom tabs / Knowledge band: "House Green (`#1E3932`)"
- Board canvas: "Neutral Warm (`#f2f0eb`)"
- Card canvas: "White (`#ffffff`)"
- Heading text on light: "Text Black (`rgba(0,0,0,0.87)`)"
- Body text on light: "Text Black Soft (`rgba(0,0,0,0.58)`)"
- Body text on dark-green: "Text White Soft (`rgba(255,255,255,0.70)`)"
- AI-ceremony accent: "Gold (`#cba258`)"
- Weekly Review summary text: "Rewards Green (`#33433d`)"
- Destructive: "Red (`#c82014`)"

### Example Component Prompts

1. "Create a SmartKanban primary CTA pill button with Green Accent (`#00754A`) background, white text 'Add card', SoDoSans font at 16px weight 600 with `-0.01em` letter-spacing, `50px` border-radius (full pill), `7px 16px` padding. Apply `transform: scale(0.95)` as the active state with a `0.2s ease` transition."

2. "Design a kanban card surface — White (`#ffffff`) background, `12px` border-radius, layered shadow `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)`. Pad contents `12px`. Title in SoDoSans 16/600 Text Black, max 2 lines. Description preview in 13/400 Text Black Soft, max 2 lines. Tag row of full-pill chips (Ceramic bg, 13/400 Text Black Soft, `4px 10px` padding) with `8px` gap. Avatar row right-aligned with circular 24px assignee avatars. Place on a Neutral Warm (`#f2f0eb`) column canvas with `8px` gap to siblings."

3. "Build the SmartKanban '+ Card' floating FAB — `56px` diameter on mobile (`48px` desktop), Green Accent (`#00754A`) fill, white `+` icon centered (24px stroke 2.5). Layered shadow: `0 0 6px rgba(0,0,0,0.24)` + `0 8px 12px rgba(0,0,0,0.14)`. Fixed position bottom-right; mobile offset `bottom: calc(56px + 16px)` to clear the bottom-tab bar; desktop `bottom: 24px right: 24px`. Active state collapses ambient shadow to `0 8px 12px rgba(0,0,0,0)` with `scale(0.95)`."

4. "Build the Knowledge feature band — full-width section with House Green (`#1E3932`) background, `40px` vertical padding. Left column: white SoDoSans h2 'Knowledge' at 24px weight 600, followed by Text White Soft (`rgba(255,255,255,0.70)`) subhead 'URLs, snippets, notes — all linked back to cards', then a CTA row with two buttons (White-filled with Green Accent text for '+ New note' primary, Outlined-on-Dark white border 'Open in app' secondary). Right column: contextual product photography. Split ratio 60/40, stacked vertically below `768px`."

5. "Create the SmartKanban Weekly Review modal — White surface at `12px` radius, scrim `rgba(0,0,0,0.40)` underneath. Top band: Gold Lightest (`#faf6ee`) wash, `48px` tall, no border, flowing into the white content. Headline: 'Last week, in your world…' in Lander Tall serif, `28/400`, Starbucks Green (`#006241`). AI summary paragraph: Lander Tall `19/400`, line-height `1.5`, Rewards Green (`#33433d`). Three Cream-bg stat tiles (`12px` radius) in a 3-up grid, each showing a number (Lander Tall `36/600` Starbucks Green) + label (SoDoSans `13/400` Text Black Soft). Footer pair: 'Got it' (Green Accent filled) + 'Generate again' (Green Accent outlined)."

6. "Design the SmartKanban scope segmented control — track is a rounded `50px` pill in Ceramic (`#edebe9`) with `2px` inner padding. Three tab options: 'My board', 'Family Inbox', 'Everything'. Active pill: White (`#ffffff`) bg, Starbucks Green (`#006241`) text, weight 600, soft shadow `0 1px 2px rgba(0,0,0,0.08)`. Inactive pill: transparent, Text Black Soft, weight 400. Each pill: `7px 16px` padding. Smooth slide of the active highlight: `transition: all 0.2s ease`."

7. "Build the SmartKanban mobile bottom tab-bar — fixed-bottom, `56px` + safe-area inset, full-width. Background: House Green (`#1E3932`). Inverse top edge soft shadow `0 -1px 3px rgba(0,0,0,0.1)`. Three tabs (Board / Knowledge / More), each 33% width. Inactive tab: icon + label in Text White Soft (`rgba(255,255,255,0.70)`), `12/400`. Active tab: icon + label in white, `12/600`, with a `4px` Gold (`#cba258`) dot underneath the icon. The Gold dot is the only AI-ceremony color outside the Weekly Review surface."

8. "Create the SmartKanban status tab strip for mobile — horizontal pill row of four chips: Backlog 📥 / Today 📅 / In Progress ⚡ / Done ✅. Inactive chip: Ceramic (`#edebe9`) bg, Text Black Soft, `13/400`, `50px` radius, `7px 14px` padding. Active chip: White (`#ffffff`) bg, Starbucks Green (`#006241`) text, weight 600, with a `4px` Gold (`#cba258`) dot under the label. Place the strip immediately below the top app-bar, full-width with `16px` horizontal padding."

9. "Design the SmartKanban Edit Dialog — White surface, `12px` radius, max-width `560px`, padding `2.4rem` (top `8.8rem` to clear close-X). Scrim `rgba(0,0,0,0.40)`. Header strip: full-width House-Green band (`#1E3932`) at `12px 12px 0 0` radius, `48px` tall, white close-X right + breadcrumb-ish title left ('Edit card / Buy eggs'). Body: floating-label inputs for title, description, tags (multi-pill input with Ceramic chips), due date (native control wrapped), assignees (avatar-pill multi-select with `2px` Green Accent ring on selected). Footer pair right-aligned with `12px` gap: 'Save' (Green Accent filled) + 'Cancel' (outlined)."

10. "Build the SmartKanban toast notification — White card at `12px` radius, layered shadow (`0 0 0.5px rgba(0,0,0,0.14), 0 8px 12px rgba(0,0,0,0.14)`). Padding `12px 16px`. Success variant: leading check-icon in Green Accent (`#00754A`), body text in Text Black `14/400`. Error variant: leading alert-icon in Red (`#c82014`), `1px` Red left rail. Animates in with `translateY(8px) → 0` + `opacity 0 → 1` over `0.2s ease-out`. Pinned bottom-right with `16px` viewport offset; on mobile, pinned above the bottom tab-bar at `bottom: calc(56px + 16px)`."

### Iteration Guide

When refining existing kanban screens generated with this design system:
1. Focus on ONE component at a time (Card, Column, Edit Dialog, Mobile Shell, etc.)
2. Reference specific color names and hex codes from this document
3. Use natural language descriptions ("warm cream canvas," "four-tier green system") alongside exact values
4. Preserve the 50px pill + `scale(0.95)` active state universally
5. Check that greens are mapped to their correct role (Green Accent for CTA, Starbucks Green for heading, House Green for app-bar/Knowledge band, Uplift for In Progress rail)
6. Don't introduce gradients — the system is color-block
7. Keep SoDoSans tracking at `-0.01em` / `-0.16px` across the board
8. Verify the Mirror view stays black-on-white — it is the explicit kiosk exception

### Mapping to existing files

| Existing surface | Adapted treatment |
|---|---|
| `App.tsx` body (`bg-neutral-950 text-neutral-100`) | Neutral Warm canvas + Text Black |
| `BoardHeader.tsx` (dark `bg-neutral-900` pills) | White app-bar + Ceramic-track segmented controls |
| `Board.tsx` 4-column layout | Same 4-column, `16px` gap, cream gutters |
| `Column.tsx` header + add input | Column title H2 + dashed-pill quick-add affordance |
| `CardView.tsx` (`bg-neutral-900` card) | White card + 12px radius + whisper shadow + cream tag pills |
| `EmptyColumn.tsx` | Ceramic dashed-bordered droppable + cup-glyph |
| `EditDialog.tsx` modal | White surface + House-Green header strip + floating-label inputs |
| `SettingsDialog.tsx` | Same modal spec + left-rail tab nav inside Ceramic track |
| `ArchiveDialog.tsx` | Same modal spec + Red destructive footer band |
| `KnowledgeView.tsx` | House-Green feature band + cream grid below |
| `KnowledgeDetail.tsx` | White card + 12px URL-thumb with physical-card shadow |
| `KnowledgeEditDialog.tsx` | Edit Dialog spec |
| `KnowledgeRow.tsx` | Card spec + leading link icon in Green Accent |
| `WeeklyReview.tsx` | Lander Tall serif headline + Gold-Lightest top wash + Rewards Green summary text |
| `TemplatesTab.tsx` | Gold-Lightest washed surface (templates ceremony) + White template cards |
| `LoginView.tsx` | Cream page + White card + Black Filled "Sign in" pill |
| `MirrorView.tsx` | **Unchanged** — keeps black canvas + white text + Gold today highlight |
| `MobileShell.tsx` | House-Green bottom tab-bar with Gold active dot + Status tab strip + 56px FAB |
| `MobileCardActions.tsx` | White bottom-sheet at `12px 12px 0 0` radius + Green Accent action icons |
| `MobileMore.tsx` | Cream canvas + list of pill-row utility buttons (Settings, Archive, Weekly Review, Sign out) |
| `Toast.tsx` | White card + colored leading icon + animated entry |
| `SearchBar.tsx` | 50px-pill input + Neutral Cool idle / White focused + Green Accent magnifier on focus |
| `ActivityTimeline.tsx` | Ceramic vertical rail + Green Accent dots + Ceramic day-label pills |

### Known Gaps

- SoDoSans is a proprietary typeface not available on Google Fonts — substitute with **Inter** (recommended) or Manrope when implementing publicly, and document the swap in `web/index.html`
- Lander Tall (Weekly Review serif) is also custom — substitute with Iowan Old Style (already in fallback), Lora, or Source Serif Pro
- Specific per-component animation timings beyond the few documented (`--duration: 0.4s`, `--iconTransition: all ease-out 0.2s`, `--expanderDuration: 300ms`) are not captured for every interactive surface — define on a per-component basis using the existing tokens
- Form error-state full styling (red border weight, icon placement) is documented at the tint-token level but not exhaustively specified
- The avatar-photography treatment is described as a goal but the existing `users` schema only carries `name`/`short_name`/`email` — until a profile-image field exists, fall back to single-letter initials in SoDoSans `13/600` over a deterministic per-user accent ring
- The `MirrorView` Gold "today" highlight color rule overlaps with the AI-ceremony reservation; treat the mirror as a single approved exception
- Drag-state shadows on `@dnd-kit` cards (`0 12px 24px rgba(0,0,0,0.18)`) are specified but exact transform/scale values for the drag overlay element should be verified against `@dnd-kit/sortable` behavior at integration time
