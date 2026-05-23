# The Done-Gate — What "Task Complete" Means

This is the web-stack equivalent of a native build's "Rule 0." A task subagent runs
this gate before it reports a task complete. A green compile is not done. Every
applicable line below must be true.

The gate is deliberately strict because the cost of a false "done" is the user
discovering the gap and re-prompting — far more expensive than the agent checking.

## The gate — run every applicable line

A line marked `[server]`, `[client]`, or `[db]` applies only to tasks that touch that
layer. Lines marked `[all]` always apply.

- [ ] `[all]` The task's own plan steps are all checked off — nothing skipped.
- [ ] `[all]` If the plan task is TDD-style: the failing test was written first, was
      watched to fail for the right reason, and now passes. A test that passed on first
      write tested nothing — rewrite it.
- [ ] `[all]` The full test suite (or the task's scoped subset, per the plan) passes —
      not just the new test.
- [ ] `[all]` Typecheck is clean: `tsc --noEmit` (or the project's typecheck) exits 0.
- [ ] `[all]` Lint introduces no new warnings or errors on the touched files.
- [ ] `[all]` The build command for the touched package succeeds with zero errors.
- [ ] `[server]` The new/changed endpoint was exercised against a running server (curl
      or an integration test) and returned the expected status and body shape — not
      assumed from the code.
- [ ] `[server]` Server logs at startup and during the smoke check show no errors,
      no unhandled rejections, no `decode`/`DecodingError`, no unexpected `4xx`/`5xx`.
- [ ] `[client]` The view renders, and every interactive element the task added —
      every button, toggle, input, link — was verified to actually do its action, not
      just appear. A `<button>` that looks right but is wired to nothing is not done.
- [ ] `[client]` No errors in the browser console during the smoke check.
- [ ] `[db]` The migration applied cleanly to a fresh database AND re-applied cleanly
      to an already-migrated one (idempotency — Rule 8).
- [ ] `[all]` Before commit, the touched files were re-grepped for active rule
      violations and any live match was remediated in the same commit (Rule 10).
- [ ] `[all]` The work is committed with a clear message; `build_status.json` is
      updated (current task, phase, last commit, last gate passed, open count, time).
- [ ] `[all]` No smoke-test checklist was generated for the user. Every check above
      was performed by the agent. At most one or two explicit "could not auto-verify
      X because Y" lines are acceptable.
- [ ] `[all]` If this task has an empty-state bootstrap path (first user, first record, first init),
      the test for it cleared the relevant table and exercised the real trigger, not seed + flag.
- [ ] `[all]` If this task added or changed an auth path or any config-gated UI,
      every other client that has the equivalent surface (web/native/mobile) was
      updated to match — same fetch, same gate, same fallback when disabled.
- [ ] `[client]` Every new/modified Codable that mirrors a server response was
      decoded against a CURL-CAPTURED JSON payload loaded from a committed file
      (not a hand-constructed or hardcoded inline sample). The sample was obtained
      by running `curl` against a live server and saving the output. Null and
      missing-key variants for every DB-nullable column were included as regression
      cases. Script under `macOS/Scripts/decode_smoke_test.swift` (or equivalent)
      loads the sample file and exits 0.
- [ ] `[client]` If this task added or modified any retry/reconnect loop, the loop
      uses capped exponential backoff (floor ≥1s, cap ≥10s, doubling) with reset
      ONLY after a sustained successful operation (not on first handshake/ack alone).
      Verified by reading the code OR running the included backoff smoke test
      (`macOS/Scripts/ws_backoff_smoke_test.swift` or equivalent).

- [ ] `[client]` If this task modified a retry/reconnect loop, EVERY caller of
      the loop's entry point was grepped and verified to be gated on the loop's
      preconditions (auth, prerequisites). The gate also exists inside the
      function being called (defense in depth). For multi-client apps, EVERY
      client implementation of the same protocol was audited — not just the
      client the bug initially appeared in. (Rule 16 extension from I-9)

- [ ] `[client]` If this task changed any compiled frontend asset on a project
      with a service worker, the SW cache name was bumped AND the activate
      handler deletes caches not matching the current name. Verified by
      reloading a tab that was open against the OLD bundle and confirming the
      fix landed. (Rule 18)

- [ ] `[db]` If this task added or modified any table/column/index, the change
      landed in BOTH the dated migration file AND `server/schema.sql` (idempotent
      with IF NOT EXISTS). A fresh `npm run db:init` produces a complete schema.

- [ ] `[server]` If the task's test suite had any pre-existing failure on the
      target table/area, that failure was diagnosed and either fixed in this
      commit OR explicitly classified with a tracked reason — never dismissed
      as "infra."

## If a line fails

Do not report done. Find the root cause, fix it, and re-run the gate from the top —
a fix can break an earlier line. Repeat until every applicable line is true.

## Why each class of line exists

- **Test lines** — a compile proves syntax, not behavior. The "watched it fail" step
  proves the test can detect the bug it is meant to guard.
- **Typecheck/lint/build lines** — catch the regressions a single test does not.
- **`[server]` smoke line** — an endpoint that compiles can still 404, return the wrong
  shape, or throw at runtime. Only a real request proves it.
- **`[client]` interaction line** — "it renders" is not "it works." A registry/plan row
  describes behavior; verify the behavior, not the appearance.
- **`[db]` idempotency line** — a migration is run more than once across environments;
  it must be safe every time.
- **Re-grep line** — keeps every touched file healthier than it was found (Rule 10).
- **No-checklist line** — the agent owns verification; handing it back to the user is
  the failure mode this whole harness exists to prevent.

## Extending the gate

When the learning loop locks a rule that introduces a new verification step, add a
checkbox here in the same commit. The gate grows with the project's institutional
memory.

- [ ] `[all]` If this task ran `npm install <pkg>` / `pnpm add` / `cargo add` /
      `pip install` against the project's package manifest, the new dep is
      explicitly version-pinned to a range compatible with the project's
      framework major. For framework plugins, the plugin's peerDeps were
      checked against the project's framework version BEFORE the install.
      Verified by a boot-time smoke (real `app.register` succeeds), not just
      `npm install` + `tsc` exit 0. (Rule 19)
- [ ] `[all]` `git status` is clean and `git stash list` is empty for any
      hunk produced or modified by this task. Every fix is committed AND
      pushed to a branch that the deploy artifact reads from. A working-tree
      or stashed change is not a delivered fix. (Rule 20)
