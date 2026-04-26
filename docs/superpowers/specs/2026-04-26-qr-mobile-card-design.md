# QR Code + Mobile Card Route — Design Spec

**Date:** 2026-04-26
**Status:** Approved (brainstorming complete; awaiting user spec review)
**Author:** brainstorming session, chatwithllm@gmail.com

## 1. Goal

Show a QR code per card in the desktop edit dialog. Scanning the QR opens a phone-friendly URL (`/m/card/<id>`) that lets the scanner view and fully edit the card, including taking a photo to attach.

## 2. Scope

In scope:

- Server endpoint `GET /api/cards/:id/qr.svg` returning a visibility-checked SVG
- QR icon button in the existing `EditDialog` modal that toggles an inline panel showing the QR + URL
- New web route `/m/card/:id` with a dedicated mobile-friendly view (`MobileCardView`)
- Auth gate: if no session, render `LoginView` with a redirect-back path; reuse the existing login form
- Full edit parity: title, description, status, tags, due date, assignees, shares, attachments (camera capture), knowledge linking, archive
- All edits go through existing endpoints (`PATCH /api/cards/:id`, `POST /api/cards/:id/attachments`, knowledge link/unlink) — no new edit/attach routes
- Live sync via existing WS broadcast for the loaded card
- Backend test for the QR endpoint

Out of scope (YAGNI):

- Batch / print-sheet QR generation
- Magic-link auth (one-time tokens in QR)
- Custom in-app camera (uses standard `<input type="file" capture>`)
- Mobile route for non-card resources (templates, knowledge, mirror)
- Custom router lib — keep using `location.pathname` switch in `App.tsx`

## 3. QR generation

### Server endpoint

```
GET /api/cards/:id/qr.svg
preHandler: requireUser
```

Behavior:

1. `canUserSeeCard(req.user!.id, req.params.id)` → 404 if not visible.
2. Build the URL: `${process.env.APP_URL || `${req.protocol}://${req.hostname}`}/m/card/${id}`. `APP_URL` is the canonical source — it is set by the installer and is HTTPS in any production deploy. The request-based fallback is only used in local dev where `APP_URL` may be unset; behind Cloudflare/NPM the request scheme/host may be inaccurate, so production deployments must set `APP_URL`.
3. Generate SVG via the `qrcode` npm package: `await QRCode.toString(url, { type: 'svg', width: 256, margin: 1 })`.
4. Reply: `Content-Type: image/svg+xml`, `Cache-Control: private, max-age=86400`, body = svg string.

The SVG is fully self-contained — `<img src=...>` works without any client-side QR lib.

### Web client

Add to `web/src/api.ts`:

```ts
cardQrUrl: (id: string) => `/api/cards/${id}/qr.svg`,
```

That is the entire frontend QR surface. Browsers cache the SVG via standard image cache.

## 4. QR display in EditDialog

`web/src/components/EditDialog.tsx` gains:

- `const [showQr, setShowQr] = useState(false)`
- A small button in the dialog header next to close (✕):
  ```tsx
  <button onClick={() => setShowQr(v => !v)} aria-label="Show QR code" title="Show QR code">📱</button>
  ```
- An inline panel rendered when `showQr` is true, immediately under the header:
  ```tsx
  {showQr && (
    <div className="…">
      <img src={api.cardQrUrl(card.id)} alt="QR code" className="mx-auto h-48 w-48" />
      <p className="text-center text-xs text-neutral-400">Scan to open on phone</p>
      <code className="block break-all text-xs text-neutral-500">{`${location.origin}/m/card/${card.id}`}</code>
    </div>
  )}
  ```

The button is always present in the header; the panel toggle is local state. No route change.

## 5. Mobile route `/m/card/:id`

### Routing

`web/src/App.tsx`'s top-level switch grows a third branch:

```ts
const path = location.pathname;
const mobileCardMatch = path.match(/^\/m\/card\/([0-9a-f-]+)$/);

if (path === '/my-day') return <MirrorView />;
if (mobileCardMatch) {
  const cardId = mobileCardMatch[1]!;
  return user
    ? <MobileCardView cardId={cardId} />
    : <LoginView redirectTo={path} />;
}
return user ? <Authed ... /> : <LoginView />;
```

### MobileCardView component

New file `web/src/MobileCardView.tsx`. Single file, ~250 lines.

Lifecycle:

1. On mount, calls `api.cards.get(cardId)`. If 404, render a "Not found" page with a back link to `/`.
2. Subscribes to `connectWS()` for `card.updated`/`card.deleted` matching this id; updates local state on match.
3. Each editable field uses inline editing with autosave on blur (debounce 500 ms). PATCH calls update local state optimistically and revert on failure with a red toast.

Layout (single column, touch-friendly, 44 px minimum hit area):

| Section | Control | Persistence |
| ------- | ------- | ----------- |
| Sticky header | `← Back`, card title (non-edit), sync indicator | — |
| Title | `<input>` inline edit | `PATCH { title }` on blur |
| Status | 4 large buttons (Backlog/Today/In progress/Done) — current is highlighted | `PATCH { status }` immediate |
| Description | `<textarea>` autosize | `PATCH { description }` on blur |
| Tags | space-separated `<input>` (matches TemplatesTab pattern) | `PATCH { tags }` on blur |
| Due date | `<input type="date">` | `PATCH { due_date }` on change |
| Assignees | multi-select chip list | `PATCH { assignees }` on toggle |
| Shares | multi-select chip list | `PATCH { shares }` on toggle |
| Attachments | grid of existing thumbs + `+ Camera` button | `<input type="file" accept="image/*" capture="environment">` → `POST /api/cards/:id/attachments` |
| Knowledge | linked items list + `+ Link` (opens an inline picker) | existing `linkKnowledge`/`unlinkKnowledge` endpoints |
| Archive | red button at bottom with `confirm()` | `DELETE /api/cards/:id` then `location.assign('/')` |

Uses existing `useToast` for feedback. Uses existing `users` list (fetched once via `api.users()` — fine on mobile).

### Live sync

```ts
useEffect(() => {
  return connectWS((ev) => {
    if (ev.type === 'card.updated' && ev.card.id === cardId) setCard(ev.card);
    if (ev.type === 'card.deleted' && ev.id === cardId) setCard(null);
  });
}, [cardId]);
```

Mirror tokens are not allowed for the mobile route — `MobileCardView` requires a real session (just like `Authed`).

## 6. Login redirect (`?next=` semantics)

`LoginView` accepts an optional `redirectTo` prop:

```ts
type Props = { redirectTo?: string };
```

After `api.login()` or `api.register()` succeeds:

```ts
const safe = isSafeRelativePath(redirectTo) ? redirectTo : '/';
location.assign(safe);
```

`isSafeRelativePath`:

```ts
function isSafeRelativePath(p: string | undefined): boolean {
  if (!p) return false;
  if (!p.startsWith('/')) return false;
  if (p.startsWith('//')) return false;     // protocol-relative
  if (p.includes('://')) return false;      // absolute URL
  if (p.length > 200) return false;
  return true;
}
```

This is the only validation surface; the regex on the route already constrains the id format.

## 7. Errors and edge cases

| Condition | Behavior |
| --------- | -------- |
| QR endpoint, card not visible | 404 (no info leak) |
| QR endpoint, no session | 401 from `requireUser` |
| QR endpoint, qrcode lib throws | 500 logged; client `<img>` shows broken image |
| Mobile view, card 404 | "Card not found or not visible." with back-to-home link |
| Mobile view, archived externally during view | WS `card.deleted` fires → show "This card was archived." with back link |
| Mobile view, PATCH fails | red toast with error; field reverts to last-saved value |
| Concurrent edit from another client | last-write-wins (existing behavior); WS broadcast brings remote state in |
| Unsafe `redirectTo` | falls back to `/` |

## 8. Tests

Backend (`server/src/__tests__/`):

- `qr_route.test.ts` via `app.inject`:
  - 200 + `image/svg+xml` + body contains `<svg` for own card
  - 404 for not-visible card
  - 401 (or 200/404 depending on `requireUser` behavior in test setup)
  - URL embedded in SVG matches `${APP_URL}/m/card/${id}` when env var is set

Frontend: skip per project convention. Manual smoke checklist (§9 below).

## 9. Manual smoke checklist

1. Open a card on desktop → click 📱 → QR + URL displayed
2. Scan with phone (already authenticated via same Cloudflare-domain cookie) → `MobileCardView` renders with the card
3. Logged-out scan → `LoginView` shown with the same URL preserved → after auth → mobile view loads
4. Edit title on phone → desktop tab sees update via WS within ~1 s
5. Tap a status button on phone → card moves; desktop reflects immediately
6. `+ Camera` button → phone camera opens → take photo → upload completes → thumbnail appears in attachments grid
7. Tap Archive on phone → confirm → redirects to `/`; desktop removes the card
8. Try a QR for a private card from a different user's account → "Card not found" message
9. Bad `redirectTo` (manually craft `/login?next=//evil.example.com`) → falls back to `/`

## 10. Rollout

- New server dep: `qrcode` (`~30 KB`, no native deps). Update `server/package.json` and `package-lock.json`.
- No schema change.
- New server route registered alongside existing card routes.
- New web file `MobileCardView.tsx`. Web bundle grows ~10–15 KB (no new deps; uses existing API client).
- Re-deploy: `docker compose up -d --build server` after `git pull`.

## 11. Open Questions

None — Q1 (hybrid auth), Q2 (mobile route), Q3 (QR in CardView only), Q4 (full parity edits), Q5 (server SVG, no client lib needed), Q6 (login redirect with `?next=`/`redirectTo` prop), Q7 (`<input capture>`) all locked.
