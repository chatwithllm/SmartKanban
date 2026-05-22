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
