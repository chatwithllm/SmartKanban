# Deferred native-app-builder rules — PENDING v19 sync

> **PENDING — fold into the native-app-builder skill on the next (v19) sync.**
> Source: KanbanClaude incident I-9 (web WS storm misattributed to macOS across
> three fix rounds; one of those rounds was a stub-vs-real-dylib build-artifact
> diagnosis red herring).
>
> The native-app-builder skill is packaged externally (not installed at
> `~/.claude/skills/native-app-builder/` in this environment). When v19 ships
> and the skill is available, lift the rule below into its `references/agent-rules.md`
> baseline and the AGENT_LEARNINGS one-liner into its incident log.

---

## RULE — Build Verification Must Target the Real Code Object  [native] [client] [all]

**Source: KanbanClaude / Xcode 16+ macOS Debug build investigation.**

For Xcode 16+ Debug builds, `Contents/MacOS/<App>` can be a **stub executor** —
the real Swift code lives in a sibling `<App>.debug.dylib` inside the same
bundle (`Contents/MacOS/<App>.debug.dylib` or analogous path). Apple introduced
this layout to speed up incremental builds; the main Mach-O is a thin loader
that dynamically links the dylib at launch.

Consequence: a `strings` / `grep` / `nm` probe against `Contents/MacOS/<App>`
will return no matches for your code's log strings even when the build IS up to
date. The probe lies — not because the build is stale, but because the symbols
moved.

Required practice:

1. **Never trust** a `strings` or `grep` probe of `Contents/MacOS/<App>` without
   first checking for a `.debug.dylib` sibling. If one exists, that's where the
   code is. Probe the dylib, not the launcher.

2. **For QA / install artifacts**, build with `ENABLE_DEBUG_DYLIB=NO` (Xcode
   build setting) or use a Release configuration so the main binary IS the code.
   This makes `strings`/`nm` probes meaningful and avoids the "is this even my
   build?" rabbit hole.

3. **Verify by runtime behavior + a built-vs-installed shasum**, not by arbitrary
   strings probes:
   ```bash
   # Compare what was built vs what's installed/running:
   shasum -a 256 <DerivedData>/<Build>/<Configuration>/<App>.app/Contents/MacOS/<App>
   shasum -a 256 /Applications/<App>.app/Contents/MacOS/<App>
   # If they differ, the install pipeline is the bug — not the source.
   # If both differ from your expectation, your build mode (Debug-dylib vs
   # Release) is masking the truth.
   ```

A "the fix doesn't reach the running binary" diagnosis must rule out the
debug-dylib stub before reaching for "stale install." Three KanbanClaude
fix-then-retest cycles failed because the macOS source was correct, but the
verification methodology assumed the launcher binary held the code.

---

## Incident I-9 — one-liner for the skill's AGENT_LEARNINGS

A storm or symptom hitting a shared backend from a multi-client app MUST be
pinned to a specific client by elimination — server-side tag / per-client log
prefix / process-of-elimination by stopping each client and watching the log —
BEFORE any patch is written. Stub-vs-real-binary mismatches (Xcode 16+ Debug
dylib stub; install-pipeline-out-of-sync) can masquerade as a "stale build"
diagnosis and burn fix rounds against the wrong client. (KanbanClaude: three
fix rounds on the macOS WebSocket client while the real defect lived in the
web frontend's `connectWS`; one of those rounds chased a phantom stale-binary
red herring driven by stripped Logger format strings in a Debug-dylib build.)
