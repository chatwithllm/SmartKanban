# Agent Rules — Web-Stack Baseline
# Skill: web-app-builder · This is the BASELINE copied into each new project.
# Status: BINDING — every rule here was locked in by a real defect.
# An agent that violates a rule will reproduce the exact bug that created it.
#
# READ THIS FILE AT THE START OF EVERY TASK. Treat every applicable rule as a
# hard constraint, not a suggestion.
#
# APPLICABILITY TAGS — each rule is tagged. Apply only the rules that match your task:
#   [all]      every task
#   [server]   backend / API / Node / Fastify / Express tasks
#   [db]       schema, migrations, SQL, transactions
#   [client]   React / frontend tasks
#   [planning] writing or reviewing specs and plans
#
# The project-level copy of this file is authoritative. New rules append here as
# incidents occur (see learning-loop.md). The skill baseline is the starting point.

---

## RULE 0 — What "Done" Means  [all]

A passing build or `tsc` exit 0 is **compile proof only**. It is **not** done.
Done means every line of the done-gate checklist is true — see `done-gate.md`.

In one sentence: a green compile, a clean log, and "it renders" each prove a
different small thing; none of them prove the task. The done-gate proves the task.

If any gate line is not true → NOT done. Debug, fix, repeat. Do not report done.
**Never** hand the user a smoke-test checklist — that transfers verification to them.
Perform every check yourself. At most one or two explicit "could not auto-verify X
because Y" lines are acceptable; a numbered list of manual steps is not.

---

## RULE 1 — Pre-Flight Before Writing API or Client Code  [server] [client]

Before writing a route handler, a fetch call, a TypeScript request/response type, or
a client API function, confirm reality from the code — not from the plan.

```bash
# 1. Confirm the route exists and its HTTP method (read the actual router file)
grep -rnE "\.(get|post|put|patch|delete)\(" src/ | grep -i "<feature>"

# 2. Read the EXACT response shape the handler returns
grep -rn "reply.send\|res.json\|return {" src/ | grep -i "<feature>"
# then read the whole handler — note every key, exactly as spelled

# 3. Confirm what the existing frontend sends/expects for the SAME endpoint
grep -rn "fetch(\|api\.\|axios" src/ web/ | grep -i "<feature>"
```

**Why:** plans drift from code. The plan can name an endpoint that does not exist, or
a shape that was refactored. A handler invented from the plan returns 404 or decodes
into an empty screen. The build looks correct and ships broken.

If any check returns zero matches → STOP and ask. Do not guess the path or the shape.

---

## RULE 2 — Mirror the API Contract Verbatim  [server] [client]

The client type must match the server's actual JSON, key-for-key, envelope and all.

- Server returns `{ items: [...], next_before: "..." }` → the client decodes a wrapper
  type, then reads `.items`. Do **not** decode a bare array.
- Server returns flat fields (`short_name`, `is_admin`) → the client type is flat. Do
  **not** invent nesting because it would be "cleaner."
- A field the server may omit is `T | undefined` on the client, not `T`.

Reality beats opinion. Mirror the schema exactly, even when a tidier shape is tempting.
A shape mismatch is a silent empty-data bug, not a compile error.

---

## RULE 3 — Audit and Side-Effect Writes Share the Mutation's Transaction  [server] [db]

**Source: review of admin-role spec/plan** — a reject endpoint ran the row UPDATE and
its audit-log INSERT as two separate `pool.query` calls. A crash between them leaves the
mutation done and the audit row missing.

Any write that *records* another write — an audit row, an event log, an outbox row, a
counter — must run in the **same transaction** as the mutation it records. Either both
land or neither does.

```ts
// ❌ Wrong — two independent statements; a crash between them desyncs them
await pool.query(`UPDATE pending_users SET outcome='rejected' WHERE id=$1`, [id]);
await writeAudit(pool, { action: 'reject_user', target_pending_id: id });

// ✅ Correct — one transaction, both or neither
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(`UPDATE pending_users SET outcome='rejected' WHERE id=$1`, [id]);
  await writeAudit(client, { action: 'reject_user', target_pending_id: id });
  await client.query('COMMIT');
} catch (e) { await client.query('ROLLBACK'); throw e; }
finally { client.release(); }
```

A single CTE is also fine when it expresses the whole operation:
`WITH done AS (UPDATE ... RETURNING id) INSERT INTO audit SELECT id, ... FROM done`.

---

## RULE 4 — Postgres `FOR UPDATE` Is Rejected With Aggregates  [db]

**Source: review of admin-role spec** — a last-admin guard used
`SELECT COUNT(*) ... FOR UPDATE`. Postgres rejects it: `ERROR: FOR UPDATE is not
allowed with aggregate functions`. The query never runs.

To lock a set and act on its size, lock the rows, then count them in application code:

```sql
-- ❌ Wrong — throws at runtime
SELECT COUNT(*) FROM users WHERE is_admin AND id <> $1 FOR UPDATE;

-- ✅ Correct — lock the candidate rows, count the result in code
SELECT id FROM users WHERE is_admin AND id <> $1 FOR UPDATE;
-- if the returned row count is 0 → reject; the lock blocks a racing writer
```

`FOR UPDATE` is also rejected with `GROUP BY`, `DISTINCT`, `UNION`, and window
functions. When you need a locked count, lock the plain rowset.

---

## RULE 5 — `ON DELETE SET NULL` Requires a Nullable Column  [db]

**Source: review of admin-role spec** — an audit table declared
`actor_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL`. The two clauses
contradict: when the referenced user is deleted, Postgres tries to set the column NULL
and the `NOT NULL` constraint rejects it — the delete fails.

If a foreign key uses `ON DELETE SET NULL`, the column must be nullable. If the column
must be `NOT NULL`, use `ON DELETE RESTRICT`, `NO ACTION`, or `CASCADE` instead — pick
the one that matches the intended retention semantics. Self-contradictory DDL may even
fail at `CREATE TABLE` time depending on the Postgres version.

---

## RULE 6 — Verify Column Constraints Before Writing an INSERT  [db] [server]

**Source: review of admin-role plan** — code `INSERT`ed into `users(short_name, ...)`
with a derived value, without ever reading whether `short_name` had a `UNIQUE`
constraint. If it does, a collision raises an unhandled Postgres unique-violation that
surfaces as a 500 instead of a clean error.

Before writing any `INSERT` into an existing table, read that table's definition in
`schema.sql` (or the migrations). Note every `NOT NULL`, `UNIQUE`, `CHECK`, and default.
Then:

- A value that could collide with a `UNIQUE` column → catch Postgres error code `23505`
  and return a clean `409` (or auto-suffix / regenerate), never let it 500.
- A `NOT NULL` column with no default → the INSERT must supply it.
- A `CHECK` constraint → validate before the INSERT so the user gets a real message.

---

## RULE 7 — Cleanup Jobs Null FK References — Snapshot Identity Before Reaping  [db] [server]

**Source: review of admin-role plan** — a reaper deletes rows after a TTL; an audit
table referenced those rows via `ON DELETE SET NULL`. Minutes after the event, the
audit row's foreign key is NULL and the row no longer says *which* record it was about.

If a row may be deleted by a cleanup/reaper job, and other tables (audit, history,
analytics) reference it for the record, do not rely on the foreign key for identity.
**Snapshot the identifying fields** — email, name, a human label — into the referencing
row's own columns or its `metadata` JSON at write time. The FK is for joins while the
row lives; the snapshot is what survives the reaper.

---

## RULE 8 — Migrations Are Additive and Idempotent; Never Edit an Applied Migration  [db]

A migration that has run on any shared or production database is immutable. To change
schema, write a **new** migration.

- Use `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS` so re-running is safe.
- New columns on a populated table are nullable or carry a default — a bare
  `NOT NULL` add on existing rows fails.
- Editing an already-applied migration desyncs every environment that ran the old
  version. The fix is always a forward migration, never an edit.

---

## RULE 9 — React Effects That Subscribe or Poll Must Clean Up  [client]

**Source: admin-role approval-queue polling** — an "awaiting approval" view polls an
endpoint every few seconds. An effect that starts a `setInterval`, a WebSocket, or an
event listener and does not return a cleanup function leaks: the timer keeps firing
after the component unmounts, and on every dependency change a new one stacks on top.

```tsx
// ✅ Every subscribe/poll effect returns its teardown
useEffect(() => {
  const id = setInterval(poll, 5000);
  return () => clearInterval(id);   // runs on unmount and before re-run
}, [pendingId]);
```

Also: do not fetch in render; give list items stable keys (never the array index for a
reorderable or filterable list); never read or write `localStorage`/`sessionStorage`
inside a Claude artifact (use in-memory state there).

---

## RULE 10 — Every Touched File Gets a Rule Re-Grep Before Commit  [all]

**Source: native-app-builder I-14, generalized** — a fix agent edited the named lines
of a file and committed, leaving a pre-existing rule violation elsewhere in the same
file untouched. Because no future task will ever name those lines, the violation
becomes permanent.

Before `git commit` on any file you touched (via edit or write):

1. Re-grep the **whole file** for active banned patterns relevant to its kind —
   `[server]`/`[db]` file → check for split-transaction audit writes, `FOR UPDATE` with
   aggregates, un-handled unique violations; `[client]` file → check for cleanup-less
   effects, index keys.
2. Any live match (not in a comment) → fix it in the **same commit**. Do not defer
   with a TODO.
3. Note the cleanup in the commit message.

Every file you touch is your responsibility end-to-end. A pre-existing violation in a
touched file is a regression in disguise.

---

## RULE 11 — A Fact Stated in More Than One Place Is a Contradiction Risk  [planning]

**Source: review of admin-role spec** — the approve operation was described as
"DELETE the row" in three sections and "UPDATE the row" in the authoritative endpoint
spec. A build agent could implement either reading.

When writing or reviewing a spec or plan: each fact has one authoritative home. Other
places point to it; they do not restate it. If a fact is restated, the copies drift.
When reviewing, treat any fact stated in multiple places as a contradiction risk —
diff the statements and reconcile every copy to the authoritative one before the plan
is executed. The build agent should never have to guess which version is correct.

---

## ANTI-PATTERNS — Never Do These  [all]

| Anti-pattern | Why it fails | Correct pattern |
|---|---|---|
| Mutation and its audit/log write as separate statements | Crash between them desyncs them | Rule 3 — one transaction or one CTE |
| `SELECT COUNT(*) ... FOR UPDATE` | Postgres rejects FOR UPDATE with aggregates | Rule 4 — lock rows, count in code |
| `NOT NULL` column with `ON DELETE SET NULL` FK | Contradictory DDL — delete (or DDL) fails | Rule 5 — nullable column, or RESTRICT |
| `INSERT` without checking the table's constraints | Unique/NOT NULL/CHECK violation → 500 | Rule 6 — read schema, handle `23505` |
| Trust FK for identity of a reapable row | Reaper nulls the FK; record is lost | Rule 7 — snapshot identity into metadata |
| Edit an already-applied migration | Desyncs every environment | Rule 8 — write a forward migration |
| `useEffect` poll/subscribe with no cleanup | Timer/listener leaks past unmount | Rule 9 — return a teardown function |
| Build endpoint/type from the plan's wording | Plan drifts from code | Rule 1 — grep the real route + shape |
| Decode a bare `[]` when server wraps it | Empty screens, no compile error | Rule 2 — decode the envelope wrapper |
| Edit named lines, ignore rest of the file | Pre-existing violations survive | Rule 10 — re-grep whole file before commit |
| `tsc` exit 0 reported as "done" | Compile ≠ correct | Rule 0 — pass the full done-gate |
| Hand the user a smoke-test checklist | Transfers verification to the user | Rule 0 — do every check yourself |

---

## OPEN SCARS — Watch These; Next Occurrence Locks a Rule  [all]

Things that have happened once but are not yet ruled. When one recurs, promote it to a
numbered rule via the learning loop.

*(none yet — the baseline starts clean here; projects add their own)*

---

## LEARNING LOOP

Every incident updates this file. See `learning-loop.md` for the exact procedure:
append the incident to `AGENT_LEARNINGS.md`, add a numbered `RULE N` here, add an
anti-pattern row, update the done-gate if a new check is introduced, commit together.
