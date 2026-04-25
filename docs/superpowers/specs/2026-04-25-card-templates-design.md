# Card Templates — Design Spec

**Date:** 2026-04-25
**Status:** Approved (brainstorming complete; awaiting user spec review)
**Author:** brainstorming session, chatwithllm@gmail.com

## 1. Goal

Let users save reusable card configurations as named templates and instantiate cards from them quickly — from the web app and from the Telegram bot. Reduces friction for recurring tasks (e.g. weekly groceries, daily standup).

## 2. Scope

In scope:

- Per-user private templates and family-shared templates (user picks visibility on creation)
- Template fields: title, description, tags, status (default `today`), due_date as relative offset in days
- Web management UI in Settings dialog
- Web instantiation via column quick-add dropdown and `/name` slash autocomplete
- Telegram instantiation via `/use <name>`, `/t <name>` (alias), and `/templates` listing — DM-only

Out of scope (YAGNI):

- Per-user-targeted template sharing (only flat private/shared)
- Template attachments
- Template versions / edit history
- Cascading edits from template to instantiated cards
- Group-chat `/use` command
- Template categories / folders
- Telegram interactive template builder
- Activity log entries for template CRUD

## 3. Data Model

Additive change to `server/schema.sql` (idempotent):

```sql
CREATE TABLE IF NOT EXISTS card_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  visibility       text NOT NULL CHECK (visibility IN ('private','shared')),
  title            text NOT NULL,
  description      text NOT NULL DEFAULT '',
  tags             text[] NOT NULL DEFAULT '{}',
  status           text NOT NULL DEFAULT 'today'
                   CHECK (status IN ('backlog','today','doing','done')),
  due_offset_days  integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS card_templates_owner_name_key
  ON card_templates (owner_id, lower(name));

CREATE INDEX IF NOT EXISTS card_templates_visibility_idx
  ON card_templates (visibility);
```

Notes:

- `name` is unique per owner, case-insensitive. Two users may both have a "grocery" template — Telegram lookup disambiguates by sender.
- `visibility` is a flat enum (no per-user share targets).
- `due_offset_days` is nullable. When non-null, instantiation computes `due_date = today + N days` using the server clock.
- No assignees/shares columns — instantiated cards default to creator-as-assignee per existing logic.
- Hard-delete templates; no soft-archive, no activity log entries (templates are configuration, not first-class entities).

## 4. Backend API

New file `server/src/routes/templates.ts`, mounted at `/api/templates`. All endpoints require `requireUser`.

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | `/api/templates`               | List visible: `WHERE owner_id = me OR visibility = 'shared'` |
| POST   | `/api/templates`               | Create (owner = caller) |
| GET    | `/api/templates/:id`           | Fetch one (visibility-checked) |
| PATCH  | `/api/templates/:id`           | Update (owner-only; 403 otherwise) |
| DELETE | `/api/templates/:id`           | Hard delete (owner-only) |
| POST   | `/api/templates/:id/instantiate` | Create card from template, return card |

Request body (POST/PATCH):

```ts
{
  name: string,
  visibility: 'private' | 'shared',
  title: string,
  description?: string,
  tags?: string[],
  status?: 'backlog' | 'today' | 'doing' | 'done',
  due_offset_days?: number | null,
}
```

Validation rules:

- `name`: 1–40 chars, no whitespace-only; unique per owner case-insensitive (DB enforces; route returns 409 on conflict)
- `title`: 1–120 chars (matches existing card title hard cap)
- `tags`: max 5, lowercased, deduplicated
- `status`: enum check
- `due_offset_days`: integer 0–365 or null

### Instantiate logic

`POST /api/templates/:id/instantiate` accepts an optional body `{ status_override?: string }` (used by web column dropdown to force the column's status).

1. Load template; reject with 404 if not visible to caller (do not leak existence).
2. Compute `due_date = due_offset_days != null ? server_today + N days : null`.
3. Insert card via the existing card-creation path with: `created_by = caller`, status from override else template, default position helper, `source = 'manual'` (web) or `'telegram'` (bot — see §6).
4. Existing logic continues: assignees default to creator, WS broadcast fires, activity log records `action='create'` with `details={ template_id }`.
5. Return the new card.

Server controls the date math because the README documents server-clock skew correction; the client must not compute due dates.

## 5. Web UI

### 5.1 Settings dialog → Templates tab

`web/src/components/SettingsDialog.tsx` adds a "Templates" tab alongside the existing tabs. The tab contains:

- List of visible templates (mine + shared)
- "+ New template" button → inline form
- Each row: name, visibility badge (🔒 private / 👥 shared), title preview, edit/delete buttons (disabled for non-owners)
- Form fields: name, visibility radio, title, description (textarea), tags (chip input), status (dropdown), due_offset_days (number, blank = none)

### 5.2 Quick-add dropdown on Column

`web/src/components/Column.tsx`'s quick-add row gains a 📋 button next to the existing text input. Clicking opens a popover listing visible templates; selecting one instantiates with `status_override = column.status` so the new card lands in the column the user clicked from.

### 5.3 Slash autocomplete in quick-add input

When the input starts with `/` and contains no whitespace, an inline popover shows matching template names. `Tab` or `Enter` instantiates and clears the input. `Esc` cancels — the text remains as plain text.

Implementation: a small `useTemplateAutocomplete` hook backed by a `useTemplates()` data hook that reads `/api/templates` once and stays live via WS events.

### 5.4 WebSocket events

Add three event types: `template.created`, `template.updated`, `template.deleted`. Per-client filter mirrors the cards filter:

- Private templates → owner-only
- Shared templates → all authenticated users (not mirror tokens)

This keeps the Settings tab and quick-add dropdown live across tabs and devices.

### 5.5 Frontend types

`web/src/types.ts` gains a `Template` interface mirroring the backend shape.

## 6. Telegram Bot

### 6.1 Commands

In `server/src/telegram/bot.ts`:

| Command | Behavior |
| ------- | -------- |
| `/use <name>`  | Instantiate template, create card, send post-save keyboard |
| `/t <name>`    | Alias for `/use` |
| `/templates`   | Reply with caller's visible templates (private + shared) |

`/use` and `/t` skip the AI proposal flow entirely — fast path for known patterns.

### 6.2 Lookup logic

1. Resolve sender via `telegram_identities` → `app_user_id`. Unlinked → reply "Link your Telegram identity in the app first."
2. Query:

   ```sql
   SELECT * FROM card_templates
   WHERE lower(name) = lower($1)
     AND (owner_id = $2 OR visibility = 'shared')
   ORDER BY (owner_id = $2) DESC
   LIMIT 1
   ```

   The owner's private template wins ties over a shared template with the same name (lets a user override shared).
3. Not found → reply "No template `<name>`. Try `/templates` to list."
4. Found → call the same instantiate helper as web with `source = 'telegram'`. Creator = sender.
5. Send the existing post-save quick-action keyboard (Today / Doing / Done / Archive).

### 6.3 DM vs group behavior

- `/use` and `/t`: DM-only. Group-chat invocations are silently ignored — matches existing privacy norm where DM is private and group flow is the AI inbox path.
- `/templates`: DM-only.

### 6.4 Edge cases

- Empty name (`/use` with no arg) → usage hint + suggestion to run `/templates`.
- Template deleted between list and use → "Template no longer exists." reply.
- Multiple-match resolution is deterministic via the `ORDER BY` above.

### 6.5 Tests

Extend `server/src/__tests__/telegram_parse.test.ts` with cases for `/use <name>`, `/t <name>`, `/templates`, and empty-arg handling.

## 7. Error Handling Summary

| Condition | Response |
| --------- | -------- |
| Duplicate name (same owner, case-insensitive) | 409 `{ error: "Template name already exists" }` |
| Template not visible to caller (any read or instantiate) | 404 — do not leak existence |
| PATCH/DELETE by non-owner | 403 |
| Telegram sender unlinked | DM reply with link instructions |
| WS broadcast | Per-client filter mirrors cards: private → owner only, shared → all users |

## 8. Tests

Backend (`server/src/__tests__/`):

- `templates.test.ts` — visibility predicate (private/shared/cross-user), name uniqueness 409, instantiate due_offset math, owner-only PATCH/DELETE 403, status_override behavior
- `telegram_parse.test.ts` (extend) — see §6.5

Frontend: matches existing project's minimal FE-test footprint. Manual smoke checklist below substitutes.

## 9. Rollout

- Schema is additive and idempotent. Re-running `schema.sql` on the existing prod DB is safe.
- No backfill — the feature ships with an empty table.
- No feature flag. Blast radius is contained: new routes, new table, new UI tab, new bot commands. Existing card flow is untouched.
- Deploy order: schema → server → web. Telegram handler picks up on the next server restart.

## 10. Manual Smoke Checklist (post-deploy)

1. Create a private template via Settings — visible to me, hidden for another user.
2. Create a shared template — visible to both users.
3. Quick-add dropdown in the Today column → instantiate → card lands in Today.
4. `/grocery` in the quick-add input → autocomplete → Enter → card created.
5. `/use grocery` in DM to bot → card created, post-save keyboard appears.
6. `/use unknown` → "no template" reply.
7. PATCH another user's template → 403.
8. `due_offset_days=3` → instantiated card has `due_date = today + 3`.
9. Open two browsers as the same user; edit a template in one → the other updates via WS.

## 11. Open Questions

None. All Q1–Q4 answers locked: visibility=both (C), fields=B, UX=D (dropdown + slash + Telegram), management=A (Settings tab), no cascade.
