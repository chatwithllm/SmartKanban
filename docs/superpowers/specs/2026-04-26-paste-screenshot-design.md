# Paste Screenshot to Attach — Design Spec

**Date:** 2026-04-26
**Status:** Approved (brainstorming complete; awaiting user spec review)
**Author:** brainstorming session, chatwithllm@gmail.com

## 1. Goal

Let users paste an image from the OS clipboard (e.g. screenshot grab) directly into the kanban app. The image becomes an attachment on the currently-open card, or — if no card is open — a new card lands in Today with the image attached and an AI-generated title.

## 2. Scope

In scope:

- Document-level `paste` listener active when authenticated
- Two flows triggered by clipboard image content:
  - Edit dialog open → upload as attachment to that card
  - No dialog open → create a new card in `today` with the image attached and AI-titled
- Supported image MIME types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`
- Per-image size limit (default 5 MB, configurable)
- Vision-driven title for create-new flow when AI is enabled; deterministic timestamped title otherwise
- Toast feedback on success/failure
- Server tests via `app.inject`

Out of scope (YAGNI):

- Drag-and-drop upload (separate feature)
- Bulk image upload UI / multiple file picker
- Image cropping or transformation
- HEIC/AVIF conversion
- OCR text extraction (separate feature; could layer on later)
- Mirror / kiosk view (`/my-day`) does not gain paste

## 3. Frontend

A single document-level `paste` event listener registered in `App.tsx` inside the authenticated branch only. The handler:

1. Reads `event.clipboardData.items`. Filters items with `type` starting with `image/`.
2. If none → return (lets default behavior handle text paste in form fields).
3. For each image item, calls `getAsFile()` to get a `File` (Blob).
4. Branches on `editing` state (the same state CardView uses to show its modal):
   - non-null → upload as attachment to `editing!.id` via `api.uploadAttachment(id, file)`
   - null → upload as new card via `api.createCardFromImage(file)`
5. On success, fires a toast (`'Image attached'` or `'Card created from screenshot'`); appends ` (AI titled)` when the response indicates `ai_summarized=true`.
6. On error, fires a red toast with the server's error message (or a network fallback).

The listener is registered in a `useEffect` that depends on `editing`. The handler reads `editing` from a `useRef` mirror (kept in sync) so the closure always sees current state without re-registering on every change.

Multiple images in one paste event are processed in order. Most OS clipboards carry one image; this is for completeness.

## 4. Server endpoints

Both endpoints live in a new file `server/src/routes/attachments_upload.ts`. They reuse the existing `@fastify/multipart` plugin already registered in `index.ts`. Both require `requireUser` and validate via the existing `canUserSeeCard` predicate where applicable.

### 4.1 `POST /api/cards/:id/attachments`

**Body:** multipart with one field `file` (required).

**Behavior:**

1. Visibility-check the caller against `:id` via `canUserSeeCard`. 404 if not visible.
2. Validate MIME type against the allowlist (`image/png|jpeg|webp|gif`). 415 otherwise.
3. Validate size against `ATTACHMENT_MAX_BYTES` (default 5_000_000). 413 otherwise.
4. Persist to disk at `data/attachments/<card_id>/<uuid>.<ext>` (extension derived from MIME).
5. Insert into `card_attachments` (kind=`image`, storage_path=relative).
6. Reload card via `loadCard(id)`.
7. `broadcast({ type: 'card.updated', card })`.
8. Return 201 with the updated card.

### 4.2 `POST /api/cards/from-image`

**Body:** multipart with `file` (required) + optional text field `status` (default `today`, validated via `isStatus`).

**Behavior:**

1. Validate MIME + size as above.
2. If `AI_ENABLED()`:
   - Read the file into a buffer, call `summarizeImage(buffer)` (existing helper, returns `{ title, description } | null`).
   - On success: use returned values; set `ai_summarized=true`.
   - On failure: timestamped title `Screenshot YYYY-MM-DD HH:MM` (server UTC), empty description, `needs_review=true`.
3. If AI disabled: same timestamped fallback.
4. Insert into `cards` with: title, description, status, `source='manual'`, `created_by=caller`, `position` via existing midpoint helper.
5. Insert `card_assignees` row for `caller`.
6. Persist file to `data/attachments/<new_card_id>/<uuid>.<ext>`.
7. Insert into `card_attachments`.
8. `logActivity(caller, card.id, 'create', { from: 'paste-image', ai_summarized })`.
9. Reload card; `broadcast({ type: 'card.created', card })`.
10. Return 201 with the new card.

### 4.3 Helpers

Extract a small `validateAndSaveImage(file, dir)` helper (in the same route module) used by both endpoints. Returns `{ relPath, ext }` or throws `BadRequestError|TooLargeError|UnsupportedMediaError`.

## 5. Validation and constants

```ts
const IMAGE_MIME_ALLOWLIST = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const ATTACHMENT_MAX_BYTES = Number(process.env.ATTACHMENT_MAX_BYTES ?? 5_000_000);
```

`@fastify/multipart`'s built-in size limit is overridden by passing `limits: { fileSize: ATTACHMENT_MAX_BYTES }` on the route.

## 6. Error mapping

| Condition | Status | Body |
| --------- | ------ | ---- |
| Unauthenticated | 401 | `{ error: 'unauthorized' }` (existing requireUser) |
| Card not visible (attach endpoint) | 404 | `{ error: 'not found' }` |
| Missing `file` field | 400 | `{ error: 'file required' }` |
| MIME not allowed | 415 | `{ error: 'unsupported media type', allowed: [...] }` |
| File exceeds limit | 413 | `{ error: 'file too large', max_bytes: N }` |
| Disk write failed | 500 | `{ error: 'attachment write failed' }` (no DB row inserted) |
| Vision call failed | 200/201 | Falls back to timestamped title + `needs_review=true` (not surfaced as an error) |

Frontend translates each into an appropriate toast as listed in §3.

## 7. Tests

New file `server/src/__tests__/attachment_upload.test.ts` using the existing `app.inject` pattern from `template_routes.test.ts`:

- Happy path attach: 201, card returned with one attachment, file exists on disk
- Happy path from-image (AI disabled): 201, card with timestamped title and `needs_review=true`
- 404 attach to non-visible card
- 413 oversize (synthetic 6 MB buffer)
- 415 bad MIME (`text/plain`)
- 400 missing file field

Vision-enabled paths are NOT integration-tested (would require live API key); the fallback path is what we exercise.

## 8. Rollout

- No schema change; reuses `card_attachments` table.
- New env var `ATTACHMENT_MAX_BYTES` (optional; default 5_000_000).
- New routes wired in `server/src/index.ts` after the existing `attachmentRoutes` registration.
- Web bundle change: ~50 lines added to `App.tsx` plus two new `api.ts` methods.
- Re-deploy via `docker compose up -d --build server`.

## 9. Manual smoke checklist

1. Open the web app, no card dialog open. Take a screenshot, paste (Ctrl/Cmd-V or right-click) → toast `Card created from screenshot (AI titled)`. Card appears in Today.
2. Open an existing card, paste → toast `Image attached`. Refresh; image visible inline.
3. Try a 10 MB PNG → red toast `Image too large (max 5 MB)`. Card unchanged.
4. Disable `OPENROUTER_API_KEY` and `OPENAI_API_KEY`, restart, paste-create → card title is `Screenshot 2026-04-26 14:30`, `needs_review` flag set.
5. Paste plain text into an open `<textarea>` (e.g. card title field) → text inserts normally; no card created.
6. Open `/my-day?token=…`, attempt paste → no-op (kiosk is read-only).

## 10. Open Questions

None — Q1–Q4 locked: scope=both (C), new-card column=today (B), title=AI-vision-with-fallback (D), endpoints=separate (A).
