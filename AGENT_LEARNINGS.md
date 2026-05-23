# Agent Learnings — Admin Role + Google OAuth + Approval Queue Build

Prior macOS-build learnings archived at `AGENT_LEARNINGS.macos-build.md`.

Format per incident:

```
### I-N: <one-line symptom>
- **Symptom:** what was observed
- **Root cause:** why it happened
- **User prompt that exposed it:** quote it
- **Fix:** what was changed
- **Rule locked in:** the numbered rule appended to agent-rules.md
```

---

## Seed (from spec/plan review — closed before execution)

The plan and spec for this build were reviewed twice before execution started. Both review passes turned into baseline rules in `agent-rules.md`:

- **Reject endpoint ran UPDATE + audit INSERT as two queries.** → Rule 3 (single-transaction audit writes).
- **Last-admin guard used `SELECT COUNT(*) ... FOR UPDATE`.** → Rule 4 (lock rows, count in code).
- **`admin_audit.actor_id` was `NOT NULL` with `ON DELETE SET NULL`.** → Rule 5.
- **`INSERT INTO users` had no `23505` handling on email collision.** → Rule 6.
- **Pending row reaped after 5 min while audit FK was `ON DELETE SET NULL` — rejected user identity lost.** → Rule 7 (snapshot identifying fields into audit metadata).
- **Approve was described as DELETE in three sections and UPDATE in the endpoint spec.** → Rule 11 (one authoritative home per fact).

Plan patches landed at commit `ece7d1c` before any task ran.

---

## Incidents (post-execution)

### I-2: First-user-auto-admin bootstrap silently no-op'd
- **Symptom**: Fresh DB, registered first user via /api/auth/register, `is_admin = false`, no audit row. Spec §11 step 1 expected `is_admin = true`.
- **Root cause**: The register handler had an `if (userCount === 0)` block (legacy, from Phase 1 of the kanban project) that inherited cards but never set `is_admin = true`. Plan Task 3 added env-admin reconciliation in `/login` but never touched the register path. Every test that exercised admin endpoints seeded users directly + flipped `is_admin` manually, so the real registration path was never tested empty.
- **User prompt that exposed it**: > "Manual QA Step 1 (spec §11): fresh DB, first user registers — is_admin should be true. It was false."
- **Fix**: Wrap register in a transaction with `pg_advisory_xact_lock('first_user_bootstrap')`; INSERT users with `is_admin = (userCount === 0)`; if first user, write env_promote audit row with metadata `{source: 'first_user_bootstrap'}` in the same transaction.
- **Rule locked in**: RULE 12 — empty-state bootstrap tests must run against the empty state.

### I-3: macOS Google sign-in entry point absent from LoginView
- **Symptom**: QA Step 9 — clicked through to the macOS app, LoginView only shows email/password. The Google button exists in AccountTab.swift but sits inside `if let user = auth.currentUser`, so it's invisible pre-login. Even when signed-in, it doesn't gate on /api/auth/config.
- **Root cause**: Plan Task 30 scoped Google to AccountTab (post-login linking) instead of LoginView (pre-login auth method). Plan never added an AuthConfig codable, Endpoint case, or /api/auth/config fetch on the macOS client. Web LoginView did this correctly — macOS lacked feature parity.
- **User prompt that exposed it**: > "QA Step 9: on macOS, click Sign in with Google. The button isn't there."
- **Fix**: Added `AuthConfig` codable + `Endpoint.authConfig` case. LoginView fetches config on mount, shows Google button + OR divider when `google_enabled == true`. AccountTab linking button now also gates on the same config — hides when google_enabled is false.
- **Rule locked in**: RULE 13 — login-affecting features must reach every client; gate on config, not on hardcoded assumptions.
