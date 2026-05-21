# SHIP READY — KanbanClaude macOS
Date: 2026-05-21
Round: 6 (synthesis round 7)
Verdict: **SHIP_READY**

Sources: AUDIT_A7.md (0 new gaps · 3/3 V6 fixes verified) + AUDIT_B7.md (0 new gaps · 3/3 V6 fixes verified)
Cross-reference: 0 P0 · 0 P1 · 0 P2 · 0 fix-verification failures
Branch tip: `cccfd91` (`fix: FIX-V6-002 — CardTimeline AI dot+label to greenAccent (round 6)`)

---

## Cross-reference matrix

| Gap | In A7? | In B7? | Cross-priority | Spot-check verdict | Final |
|-----|--------|--------|----------------|--------------------|-------|
| — | — | — | — | Both audits returned **zero new gaps**. | n/a |

Carry-over inspection:
| Item | Source | Status this round |
|------|--------|-------------------|
| RESIDUE-B5-001 — unused `accent: Color` parameter in `WeeklyReviewSheet.section(...)` | B5 / B6 / B7 carry-over | Acknowledged housekeeping note — explicitly **not a visual gap, not a risk** per B7. Drop on the next polish touch to `WeeklyReviewSheet.swift`. Does **not** block ship. |
| Card Chain / Related Cards / Weather / Activity Ticker widgets | All rounds | 🔄 V1-deferred per ROADMAP / VETO; registered intentional. Does **not** block ship. |
| ScopePicker per-scope counts | V5 | 🔄 V1 — closed intentional. Does **not** block ship. |
| `CardEvent.EntryType.share` dead case | A7 note | Mirrors live server union; harmless dead branch. Does **not** block ship. |

No P2 visual-only gap to spot-check this round (B7 returned zero). All A7 / B7 findings reconciled before this synthesis.

---

## Coverage

- **MVP screen groups**: 22/22 ✅ code-verified
- **Intentional adaptations (🔄)**: 5 — Card Chain V1, Related Cards V1, Weather V1, Activity Ticker V1, ScopePicker per-scope counts V1 — all justified in registry / VETO
- **Explicitly out-of-scope (🚫)**: 6 groups — Mirror V2, all mobile screens, service worker, server-side Telegram, backend-only routes, web-push subscribe endpoints
- **P0 gaps**: 0
- **P1 gaps**: 0
- **P2 gaps**: 0
- **Latent risks**: 0
- **Fix-verification failures**: 0

---

## Fix verification summary (FINAL_FIXES_V6.md)

3/3 ✅ landed correctly. Independently confirmed by both auditors against `cccfd91`.

| Fix | Commit | Evidence | A7 | B7 |
|-----|--------|----------|----|----|
| FIX-V6-001 — CardTimeline system rows inline `details.body` | `de0b39b` | `CardTimelineView.swift:101-106` (body branch) + `:121-126` (`systemBody`) + `:128-138` (label collapse) | ✅ | ✅ |
| FIX-V6-002 — CardTimeline AI dot+label → `greenAccent` (Path A parity) | `cccfd91` | `CardTimelineView.swift:145` (dot `greenAccent.opacity(0.6)`) + `:151` (label `greenAccent`) | ✅ | ✅ |
| FIX-V6-003 — Gate `setObserving` on `expanded` not view lifecycle | `f6876aa` | `CardTimelineView.swift:35-41` (`onChange(of: expanded)`) + `:42` (`.onDisappear` safety net); R5 `onAppear { setObserving(true) }` removed | ✅ | ✅ |

Spot-check (synthesizer): `CardTimelineView.swift` re-read in full at `cccfd91`. All three landing points present at the cited lines. No partial implementations, no overshoots.

---

## Regression scan

| Pattern | Scope | Result | Round streak |
|---------|-------|--------|--------------|
| `async let _ =` (RULE 3 / I-6) | `macOS/KanbanClaude/**/*.swift` | 0 matches | 3rd consecutive round green |
| Bare-array `try (decoder\|JSONDecoder()).decode([…])` (RULE 2 / I-2) | `macOS/KanbanClaude/**/*.swift` | 0 matches | 3rd consecutive round green |
| `.task { await refresh\|loadAll\|fetchAll\|reload\|load }` (RULE 3 / I-7) | `macOS/KanbanClaude/**/*.swift` | 0 matches | 3rd consecutive round green |
| `setObserving(true)` outside `onChange(of: expanded)` (V6-003 regression check) | `macOS/KanbanClaude/**/*.swift` | 0 matches | new this round |

RULE 16 (touched-file integrity) — `CardTimelineView.swift` re-grepped at `cccfd91`: clean across all four patterns above.

---

## Trend line

Gap count by round:
```
R2: 17 → R3: 7 → R4: 6 → R5: 6 → R6: 3 → R7: 0
```

Fix-cycle convergence:
| Round | New gaps | Fixes landed | Regressions |
|-------|----------|--------------|-------------|
| R2 | 17 | 17/17 ✅ | 0 |
| R3 | 7 | 7/7 ✅ | 0 |
| R4 | 6 | 6/6 ✅ | 0 |
| R5 | 6 | 5/5 ✅ (V5 set) | 0 |
| R6 | 3 | 3/3 ✅ (V6 set) | 0 |
| R7 | **0** | n/a | **0** |

Every fix the synthesis files ever requested has landed. No regressions across six rounds. No banned-pattern reintroductions for three rounds. The R7 sweep across all 22 MVP groups found nothing new on either auditor's column.

---

## Audit-ceiling caveats (carried forward; do not block ship)

1. **I-1 locked-screen ceiling**: B7 (like B2…B6) ran under `CGSSessionScreenIsLocked == True`. Per RULE 17, synthetic-click navigation aborted; per RULE 18, the auth'd Chrome reference window was not touched. B7's verdict is therefore **code-verified visual parity**, not pixel-diff parity. A7's source-read sweep is dispositive for code parity. For a future pixel-diff RULE 14 pass, ops needs to pre-stage: `caffeinate -dimsu sleep 3600 &` started before lock + signed-in macOS state via `--audit-mode` flag or mock-auth defaults injection. This is an operational follow-up, **not a ship blocker** — six rounds of source-read + structural verification + banned-pattern grep have not surfaced anything pixel-diff would catch beyond what was already filed and fixed.

2. **AI brand split (intentional)**: post-FIX-V6-002 Path A, the macOS AI brand split is the documented behavior — CardTimeline AI dot/label = `greenAccent` (matches web), AiInsightsPanel + ✨ pulse on tiles + suggestion pills = `violet` (intentional desktop accent per `feedback_premium_not_slop.md`). If the user later prefers single-tone unification, that is a separate registry decision; not a gap today.

---

## Recommended next steps

- **Code sign & notarize** for distribution (Developer ID Application cert + `notarytool submit --wait`)
- **Sparkle auto-update** if direct distribution (appcast.xml + EdDSA signing key)
- **App icon final review** at all required `.icns` resolutions (16, 32, 128, 256, 512 @1x and @2x)
- **Pixel-diff audit follow-up** (optional, not a ship blocker): run R8 with `caffeinate` pre-armed + signed-in macOS state so RULE 14 can finally cross 🔄 visual-diff rows off the registry across all 22 groups
- **One-touch polish opportunity** (not a ship blocker): when next editing `WeeklyReviewSheet.swift`, drop the unused `accent: Color` parameter from `section(title:rows:empty:accent:)` and its three call sites — closes RESIDUE-B5-001

---

✅ SHIP_READY.md written
STAGE_COMPLETE: verdict=SHIP_READY remaining=0
