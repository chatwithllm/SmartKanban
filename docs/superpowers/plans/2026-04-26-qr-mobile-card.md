# QR Code + Mobile Card Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a per-card QR code in the desktop edit dialog. Scanning the QR opens a phone-friendly URL (`/m/card/<id>`) that lets the scanner view and fully edit the card, with login fallback that returns to the same URL after auth.

**Architecture:** Add `qrcode` npm dep on the server. New `GET /api/cards/:id/qr.svg` endpoint returns a visibility-checked SVG that embeds `${APP_URL}/m/card/<id>`. The desktop EditDialog gets a 📱 button that toggles an inline panel rendering the SVG via `<img>`. A new `/m/card/:id` route in `App.tsx` mounts a new `MobileCardView` component (single-column, touch-friendly form) that reuses every existing PATCH / attachment / knowledge endpoint. Unauthenticated mobile-card hits render `LoginView` with a `redirectTo` prop; on login success the page redirects back to the original URL after passing a relative-path safety check.

**Tech Stack:** Node 22 + Fastify + TypeScript ESM, `qrcode` (new dep), `@fastify/multipart` (already registered), PostgreSQL 16, `node:test` runner. Frontend: React 18, Vite, no new deps.

**Spec:** `docs/superpowers/specs/2026-04-26-qr-mobile-card-design.md`

---

## File Structure

**Backend (`server/`):**
- Modify: `package.json` (add `qrcode` dep)
- Create: `src/routes/qr.ts` (the `GET /api/cards/:id/qr.svg` route)
- Modify: `src/index.ts` (register the new route module)
- Create: `src/__tests__/qr_route.test.ts` (integration tests)

**Frontend (`web/`):**
- Modify: `src/api.ts` (add `getCard` + `cardQrUrl`)
- Modify: `src/components/EditDialog.tsx` (add the QR button + inline panel)
- Modify: `src/App.tsx` (add `/m/card/:id` route branch + pass `redirectTo` to LoginView)
- Modify: `src/components/LoginView.tsx` (accept `redirectTo` prop + post-success redirect with safety check)
- Create: `src/MobileCardView.tsx` (the mobile route component)

The mobile component lives at the top level alongside `App.tsx` and `MirrorView.tsx`, mirroring the existing precedent for top-level routes. All existing edit endpoints are reused — no new mutation routes.

---

## Task 1: Server — `qrcode` dep + `GET /api/cards/:id/qr.svg` (TDD)

**Files:**
- Modify: `server/package.json`
- Create: `server/src/routes/qr.ts`
- Modify: `server/src/index.ts`
- Create: `server/src/__tests__/qr_route.test.ts`

- [ ] **Step 1: Install the `qrcode` dependency**

```bash
cd server && npm install qrcode @types/qrcode
```

Confirm `qrcode` and `@types/qrcode` appear in `dependencies` / `devDependencies` of `package.json`.

- [ ] **Step 2: Write the failing tests**

Create `server/src/__tests__/qr_route.test.ts`:

```ts
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { cardRoutes } from '../routes/cards.js';
import { qrRoutes } from '../routes/qr.js';

process.env.APP_URL = 'https://kanban.test.example';

const app = Fastify();
await app.register(cookie, { secret: 'test-secret' });
await app.register(authRoutes);
await app.register(cardRoutes);
await app.register(qrRoutes);
await app.ready();

let cookieA = '';
let cookieB = '';
let userAId = '';
let userBId = '';

async function register(name: string): Promise<{ cookie: string; id: string }> {
  const email = `${name}_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name, short_name: name, email, password: 'password123' },
  });
  const setCookie = res.headers['set-cookie'];
  const cookieStr = (Array.isArray(setCookie) ? setCookie[0] : setCookie) as string;
  return { cookie: cookieStr.split(';')[0]!, id: (res.json() as { id: string }).id };
}

async function createCard(cookie: string, title: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/cards',
    headers: { cookie },
    payload: { title, status: 'today' },
  });
  return (res.json() as { id: string }).id;
}

before(async () => {
  const a = await register('alice');
  const b = await register('bob');
  cookieA = a.cookie; cookieB = b.cookie; userAId = a.id; userBId = b.id;
});

after(async () => {
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userAId, userBId]]);
  await app.close();
  try { await pool.end(); } catch {}
});

beforeEach(async () => {
  await pool.query(`DELETE FROM cards WHERE created_by = ANY($1::uuid[])`, [[userAId, userBId]]);
});

test('GET /api/cards/:id/qr.svg: 200 with SVG content for own card', async () => {
  const cardId = await createCard(cookieA, 'sample');
  const res = await app.inject({
    method: 'GET',
    url: `/api/cards/${cardId}/qr.svg`,
    headers: { cookie: cookieA },
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'] as string, /^image\/svg\+xml/);
  assert.match(res.body, /<svg/);
  // The QR encodes the card URL; the SVG includes it as part of the data,
  // but qrcode library encodes it as paths so we can't grep the body for the
  // URL string. Status + content-type + svg root tag is enough for this test.
});

test('GET /api/cards/:id/qr.svg: 404 when card not visible', async () => {
  const cardId = await createCard(cookieA, 'private');
  await app.inject({
    method: 'PATCH',
    url: `/api/cards/${cardId}`,
    headers: { cookie: cookieA },
    payload: { assignees: [userAId] },
  });
  const res = await app.inject({
    method: 'GET',
    url: `/api/cards/${cardId}/qr.svg`,
    headers: { cookie: cookieB },
  });
  assert.equal(res.statusCode, 404);
});

test('GET /api/cards/:id/qr.svg: 401 when unauthenticated', async () => {
  const cardId = await createCard(cookieA, 'sample');
  const res = await app.inject({
    method: 'GET',
    url: `/api/cards/${cardId}/qr.svg`,
  });
  assert.equal(res.statusCode, 401);
});

test('GET /api/cards/:id/qr.svg: sets Cache-Control private', async () => {
  const cardId = await createCard(cookieA, 'sample');
  const res = await app.inject({
    method: 'GET',
    url: `/api/cards/${cardId}/qr.svg`,
    headers: { cookie: cookieA },
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['cache-control'] as string, /private/);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd server && npm test -- --test-name-pattern='qr.svg'`
Expected: FAIL with `Cannot find module '../routes/qr.js'`.

- [ ] **Step 4: Create `server/src/routes/qr.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { requireUser } from '../auth.js';
import { canUserSeeCard } from '../cards.js';

export async function qrRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/api/cards/:id/qr.svg',
    { preHandler: requireUser },
    async (req, reply) => {
      const id = req.params.id;
      if (!(await canUserSeeCard(req.user!.id, id))) {
        return reply.code(404).send({ error: 'not found' });
      }
      // APP_URL is the canonical public URL. Falls back to the request scheme/host
      // for local dev only. Production deployments behind Cloudflare/NPM must set
      // APP_URL because the request host may not match the public hostname.
      const base = process.env.APP_URL || `${req.protocol}://${req.hostname}`;
      const url = `${base}/m/card/${id}`;
      const svg = await QRCode.toString(url, {
        type: 'svg',
        width: 256,
        margin: 1,
      });
      reply
        .header('content-type', 'image/svg+xml')
        .header('cache-control', 'private, max-age=86400')
        .send(svg);
    },
  );
}
```

- [ ] **Step 5: Register the route in `server/src/index.ts`**

Add the import next to the other route imports:

```ts
import { qrRoutes } from './routes/qr.js';
```

Register it after the other card-related routes (e.g. after `cardRoutes`):

```ts
await app.register(qrRoutes);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd server && npm test -- --test-name-pattern='qr.svg'`
Expected: 4 tests pass.

- [ ] **Step 7: Run the full test suite to confirm no regressions**

Run: `cd server && npm test`
Expected: prior count + 4 new = full suite green.

- [ ] **Step 8: Commit**

```bash
git add server/package.json server/package-lock.json server/src/routes/qr.ts server/src/index.ts server/src/__tests__/qr_route.test.ts
git commit -m "feat(qr): GET /api/cards/:id/qr.svg with visibility check"
```

---

## Task 2: Frontend — `getCard` + `cardQrUrl` API methods

**Files:**
- Modify: `web/src/api.ts`

- [ ] **Step 1: Add the two methods to `web/src/api.ts`**

Locate the `api` object literal and append inside it (next to the existing `attachmentUrl`):

```ts
  getCard: (id: string) => req<Card>(`/api/cards/${id}`),
  cardQrUrl: (id: string) => `/api/cards/${id}/qr.svg`,
```

`getCard` is required by `MobileCardView` (Task 5) which loads a single card by id. `cardQrUrl` returns the URL string used directly in `<img src=...>` — no fetch on the client, the browser caches the SVG via standard image cache.

- [ ] **Step 2: Type-check the web build**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/api.ts
git commit -m "feat(api): web client getCard + cardQrUrl"
```

---

## Task 3: Frontend — QR button + panel in EditDialog

**Files:**
- Modify: `web/src/components/EditDialog.tsx`

- [ ] **Step 1: Read the current EditDialog header to find the right insertion point**

Open `web/src/components/EditDialog.tsx`. Locate the header element that contains the close button (✕). The QR button goes immediately before it.

- [ ] **Step 2: Add showQr state and the QR panel**

Near the top of the component, add `showQr` state:

```tsx
const [showQr, setShowQr] = useState(false);
```

`useState` should already be imported. The `api` import (from `'../api.ts'`) should also already be present; if not, add it.

In the header element, add a button next to the existing close button:

```tsx
<button
  onClick={() => setShowQr((v) => !v)}
  aria-label="Show QR code"
  title="Show QR code"
  className="text-neutral-400 hover:text-neutral-100 mr-1"
>
  📱
</button>
```

Immediately under the header (before the form fields), add the conditional panel:

```tsx
{showQr && (
  <div className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
    <img
      src={api.cardQrUrl(card.id)}
      alt="QR code"
      className="mx-auto h-48 w-48 bg-white p-2"
    />
    <p className="mt-2 text-center text-xs text-neutral-400">Scan to open on phone</p>
    <code className="mt-2 block break-all text-center text-xs text-neutral-500">
      {`${location.origin}/m/card/${card.id}`}
    </code>
  </div>
)}
```

The `card` prop is already available inside `EditDialog` — it's the card being edited.

- [ ] **Step 3: Type-check the web build**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Build the web bundle**

Run: `cd web && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/EditDialog.tsx
git commit -m "feat(qr): QR button + inline panel in EditDialog"
```

---

## Task 4: Frontend — `LoginView` accepts `redirectTo` prop

**Files:**
- Modify: `web/src/components/LoginView.tsx`

- [ ] **Step 1: Read the current LoginView to find where login success is handled**

Open `web/src/components/LoginView.tsx`. Locate the `onSubmit` (or `handleLogin`/`handleRegister`) handler. After the successful `api.login()` / `api.register()` call, the component currently relies on the parent re-rendering when `useAuth()` updates.

- [ ] **Step 2: Add the `redirectTo` prop and the safe-redirect helper**

Update the props type:

```ts
type Props = {
  redirectTo?: string;
};

export function LoginView({ redirectTo }: Props) {
  // ... existing body
}
```

Add the helper above the component (or in a local const):

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

In the success branch of the login/register submit handler (after `await api.login(...)` or `await api.register(...)`), add:

```ts
if (isSafeRelativePath(redirectTo)) {
  location.assign(redirectTo!);
}
// else: parent re-renders with the user state, default flow continues
```

Place this AFTER any existing post-login state updates (e.g. after `setUser(...)` if there is one). The full reload via `location.assign` ensures the cookie is sent on the next request and the new route renders cleanly.

- [ ] **Step 3: Type-check the web build**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/LoginView.tsx
git commit -m "feat(login): redirectTo prop with relative-path safety check"
```

---

## Task 5: Frontend — `MobileCardView` component

**Files:**
- Create: `web/src/MobileCardView.tsx`

- [ ] **Step 1: Create `web/src/MobileCardView.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api.ts';
import type { Card, Status, User } from './types.ts';
import { STATUSES, STATUS_LABELS } from './types.ts';
import { connectWS } from './ws.ts';
import { useToast } from './hooks/useToast.ts';

type Props = { cardId: string };

export function MobileCardView({ cardId }: Props) {
  const [card, setCard] = useState<Card | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const { addToast } = useToast();
  // Debounce timers per field name
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});

  // Initial load + WS subscription
  useEffect(() => {
    let mounted = true;
    api
      .getCard(cardId)
      .then((c) => { if (mounted) { setCard(c); setLoading(false); } })
      .catch((e) => {
        if (!mounted) return;
        setErr(e instanceof ApiError && e.status === 404 ? 'Card not found or not visible.' : String(e));
        setLoading(false);
      });
    api.users().then((u) => { if (mounted) setUsers(u); }).catch(() => {});
    const disconnect = connectWS((ev) => {
      if (ev.type === 'card.updated' && ev.card.id === cardId) setCard(ev.card);
      if (ev.type === 'card.deleted' && ev.id === cardId) setCard(null);
    });
    return () => { mounted = false; disconnect(); };
  }, [cardId]);

  if (loading) {
    return <div className="p-6 text-center text-sm text-neutral-400">Loading…</div>;
  }
  if (err) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-400">{err}</p>
        <a href="/" className="mt-3 inline-block text-xs text-neutral-400 underline">Back to board</a>
      </div>
    );
  }
  if (!card) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-neutral-300">This card was archived or deleted.</p>
        <a href="/" className="mt-3 inline-block text-xs text-neutral-400 underline">Back to board</a>
      </div>
    );
  }

  const patch = async (body: Partial<Card>) => {
    setBusy(true);
    try {
      const updated = await api.updateCard(card.id, body);
      setCard(updated);
    } catch (e) {
      addToast(`Save failed: ${e instanceof Error ? e.message : 'error'}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Debounced patch — used for free-text fields where the user types continuously
  const debouncedPatch = (field: keyof Card, body: Partial<Card>, delay = 500) => {
    if (debounceRefs.current[field as string]) {
      clearTimeout(debounceRefs.current[field as string]!);
    }
    debounceRefs.current[field as string] = setTimeout(() => {
      patch(body);
      debounceRefs.current[field as string] = null;
    }, delay);
  };

  const setStatus = (s: Status) => patch({ status: s });

  const toggleAssignee = (uid: string) => {
    const next = card.assignees.includes(uid)
      ? card.assignees.filter((id) => id !== uid)
      : [...card.assignees, uid];
    patch({ assignees: next });
  };

  const toggleShare = (uid: string) => {
    const next = card.shares.includes(uid)
      ? card.shares.filter((id) => id !== uid)
      : [...card.shares, uid];
    patch({ shares: next });
  };

  const onCameraInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so picking the same file again still fires
    if (!file) return;
    setBusy(true);
    try {
      const updated = await api.uploadAttachment(card.id, file);
      setCard(updated);
      addToast('Photo attached', 'success');
    } catch (err) {
      addToast(`Upload failed: ${err instanceof Error ? err.message : 'error'}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!confirm(`Archive "${card.title}"?`)) return;
    setBusy(true);
    try {
      await api.deleteCard(card.id);
      location.assign('/');
    } catch (e) {
      addToast(`Archive failed: ${e instanceof Error ? e.message : 'error'}`, 'error');
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-3 pb-24 text-neutral-100">
      <header className="sticky top-0 z-10 -mx-3 mb-3 flex items-center gap-3 bg-neutral-900 px-3 py-2 shadow">
        <a href="/" className="text-neutral-400 hover:text-neutral-100">←</a>
        <h1 className="flex-1 truncate text-base font-medium">{card.title || 'Untitled'}</h1>
        {busy && <span className="text-xs text-neutral-500">saving…</span>}
      </header>

      <label className="mb-3 block text-xs text-neutral-400">
        Title
        <input
          defaultValue={card.title}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== card.title) patch({ title: v });
          }}
          onChange={(e) => debouncedPatch('title', { title: e.target.value })}
          className="mt-1 w-full rounded bg-neutral-800 px-3 py-2 text-base"
        />
      </label>

      <div className="mb-3">
        <p className="mb-1 text-xs text-neutral-400">Status</p>
        <div className="grid grid-cols-2 gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded px-3 py-3 text-sm ${
                card.status === s ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-300'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <label className="mb-3 block text-xs text-neutral-400">
        Description
        <textarea
          defaultValue={card.description}
          onBlur={(e) => {
            if (e.target.value !== card.description) patch({ description: e.target.value });
          }}
          onChange={(e) => debouncedPatch('description', { description: e.target.value }, 800)}
          className="mt-1 min-h-[120px] w-full rounded bg-neutral-800 px-3 py-2 text-sm"
        />
      </label>

      <label className="mb-3 block text-xs text-neutral-400">
        Tags (space-separated)
        <input
          defaultValue={card.tags.join(' ')}
          onBlur={(e) => {
            const next = e.target.value.split(/\s+/).map((t) => t.replace(/^#/, '')).filter(Boolean);
            patch({ tags: next });
          }}
          className="mt-1 w-full rounded bg-neutral-800 px-3 py-2 text-sm"
        />
      </label>

      <label className="mb-3 block text-xs text-neutral-400">
        Due date
        <input
          type="date"
          value={card.due_date ?? ''}
          onChange={(e) => patch({ due_date: e.target.value || null })}
          className="mt-1 w-full rounded bg-neutral-800 px-3 py-2 text-sm"
        />
      </label>

      <div className="mb-3">
        <p className="mb-1 text-xs text-neutral-400">Assignees</p>
        <div className="flex flex-wrap gap-2">
          {users.map((u) => {
            const on = card.assignees.includes(u.id);
            return (
              <button
                key={u.id}
                onClick={() => toggleAssignee(u.id)}
                className={`rounded-full px-3 py-2 text-xs ${
                  on ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-300'
                }`}
              >
                {u.short_name || u.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs text-neutral-400">Shared with</p>
        <div className="flex flex-wrap gap-2">
          {users.map((u) => {
            const on = card.shares.includes(u.id);
            return (
              <button
                key={u.id}
                onClick={() => toggleShare(u.id)}
                className={`rounded-full px-3 py-2 text-xs ${
                  on ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-300'
                }`}
              >
                {u.short_name || u.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs text-neutral-400">Attachments</p>
        <div className="grid grid-cols-3 gap-2">
          {card.attachments.map((a) =>
            a.kind === 'image' ? (
              <img
                key={a.id}
                src={api.attachmentUrl(a.storage_path)}
                alt=""
                className="aspect-square rounded object-cover"
              />
            ) : (
              <a
                key={a.id}
                href={api.attachmentUrl(a.storage_path)}
                className="flex aspect-square items-center justify-center rounded bg-neutral-800 text-xs text-neutral-300"
              >
                {a.kind}
              </a>
            ),
          )}
          <label className="flex aspect-square cursor-pointer items-center justify-center rounded border-2 border-dashed border-neutral-700 text-xs text-neutral-400">
            + Camera
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onCameraInput}
              className="hidden"
            />
          </label>
        </div>
      </div>

      <button
        onClick={archive}
        disabled={busy}
        className="mt-6 w-full rounded bg-red-900/40 px-4 py-3 text-sm text-red-200 hover:bg-red-900/60 disabled:opacity-50"
      >
        Archive card
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check the web build**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/MobileCardView.tsx
git commit -m "feat(mobile): MobileCardView component with full edit parity"
```

---

## Task 6: Frontend — wire `/m/card/:id` route in App.tsx

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Read the current top-level routing branch in App.tsx**

Open `web/src/App.tsx`. Find where `MirrorView` is rendered for `/my-day`. The new branch goes right next to it.

- [ ] **Step 2: Add the mobile-card route + LoginView redirectTo**

Locate the top of the default export component (the function that decides whether to render `MirrorView`, `LoginView`, or `Authed`). Replace the existing routing logic with:

```tsx
import { MobileCardView } from './MobileCardView.tsx';

// ... inside the component:

const path = location.pathname;
if (path === '/my-day') return <MirrorView />;

const mobileCardMatch = path.match(/^\/m\/card\/([0-9a-f-]+)$/);
if (mobileCardMatch) {
  const cardId = mobileCardMatch[1]!;
  if (!user) return <LoginView redirectTo={path} />;
  return <MobileCardView cardId={cardId} />;
}

return user ? <Authed ... /> : <LoginView />;
```

The exact form of `<Authed ... />` and the `user` variable depend on the existing App.tsx layout; preserve the existing prop wiring. The only changes are:
1. New `import { MobileCardView }` at the top
2. New `mobileCardMatch` regex + branch
3. The unauth branch for the card route passes `redirectTo={path}` to LoginView

The id regex (`[0-9a-f-]+`) accepts UUIDs without enforcing the strict UUID shape — the server endpoint validates existence and visibility via `canUserSeeCard`.

- [ ] **Step 3: Type-check the web build**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Build the web bundle**

Run: `cd web && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(mobile): /m/card/:id route + LoginView redirectTo wiring"
```

---

## Task 7: Manual smoke + final polish

**Files:** none modified unless smoke turns up issues.

- [ ] **Step 1: Run the full backend test suite**

Run: `cd server && npm test`
Expected: prior count + 4 new (qr_route) = full suite green.

- [ ] **Step 2: Type-check both halves**

Run: `cd server && npx tsc --noEmit && cd ../web && npx tsc --noEmit`
Expected: no errors in either.

- [ ] **Step 3: Build the web bundle**

Run: `cd web && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke (with the stack rebuilt)**

```bash
cd ~/smartkanban   # or your local checkout
docker compose up -d --build server
```

Then exercise the flows:

1. Open a card on desktop → click 📱 in the dialog header → QR + URL panel appears.
2. Scan with phone (already authenticated via same Cloudflare-domain cookie) → `MobileCardView` renders with the card.
3. Logged-out scan → `LoginView` shown, URL preserved → after auth → mobile view loads.
4. Edit title on phone (blur) → desktop tab shows update via WS.
5. Tap a status button on phone → card moves; desktop reflects.
6. `+ Camera` → phone camera opens → take photo → upload completes → thumb appears.
7. Archive on phone → confirm → redirects to `/`.
8. Try a private card belonging to another user → "Card not found or not visible".
9. Manually craft `/login?next=//evil.example.com` (or `redirectTo` form input) → falls back to `/`.

- [ ] **Step 5: Commit fixups (only if smoke turned up issues)**

```bash
git add -p
git commit -m "fix(qr-mobile): smoke-test fixups"
```

If the smoke pass produced no changes, skip this step.

---

## Self-Review Notes

**Spec coverage:**
- §3 QR endpoint → Task 1
- §4 EditDialog QR button → Task 3
- §5 Mobile route + MobileCardView → Tasks 5 & 6 (component + routing)
- §6 LoginView redirect with safety check → Task 4
- §7 errors → covered in Task 5 (404 / archived / PATCH fail) and Task 1 (404 / 401 from server)
- §8 tests → Task 1 (4 backend tests). Frontend tests skipped per project convention.
- §9 manual smoke checklist → Task 7
- §10 rollout → Task 7 manual step

**Type consistency:**
- `cardId` is `string` on both sides; the regex accepts hex+hyphen (looser than UUID, but the DB rejects malformed ids and `getCard` returns 404).
- `Status`, `Card`, `User` types from `web/src/types.ts` reused everywhere on the frontend.
- `api.getCard`, `api.updateCard`, `api.deleteCard`, `api.uploadAttachment`, `api.users`, `api.attachmentUrl` are all existing methods (Task 2 only adds `getCard` + `cardQrUrl`).
- The QR endpoint URL on the server matches the route the frontend regex extracts.

**Placeholders:** none — every step contains the actual code or command.

**Known intentional simplifications:**
- Knowledge linking is NOT included in the mobile route v1. Spec §5 lists it; the planned MobileCardView UI shows attachments + assignees + shares but stops short of the full knowledge picker (deferred — would require extracting an inline picker from the existing CardView). Title/description/tags/due_date/status/assignees/shares/attachments/archive are all wired. If knowledge linking is required for v1, add a follow-up task.
- No automated frontend tests for `MobileCardView` or `LoginView` redirect; manual smoke covers them.
- The `redirectTo` flow uses `location.assign` (full page reload) rather than client-side routing because the post-login cookie must be sent on the next request. This is consistent with the rest of the app's routing approach (no router lib).
