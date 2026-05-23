# Agent Learnings — KanbanClaude macOS build

### I-1: Screen locked at session start — visual audit degraded
- **Symptom**: `screencapture -x /tmp/macos_login.png` produced identical 665299-byte image regardless of foreground app; the app launched (PID confirmed via `ps`) but every capture returned the lock-screen wallpaper.
- **Root cause**: `CGSessionCopyCurrentDictionary()['CGSSessionScreenIsLocked'] == True`. macOS routes captures of the offscreen backing store while locked, but only for menu-driven AX nav, not for the user's actual desktop. The Rule 17 pre-flight caught this on the first attempt.
- **User prompt that exposed it**: > "Session setup: build the macOS app phase by phase per §5.8 of the plan."
- **Fix**: Switched to code-verified mode for the duration of this session: every screen ✅ requires `xcodebuild` Release green + app launch + `log show` showing the expected subsystem line. Rule-14 screenshot diff is deferred to a follow-up session run by the user with an unlocked display, and every screen in the FEATURE_PARITY_REGISTRY is marked 🔄 with the note "code-verified during locked-session build; visual diff pending Rule 14 re-run".
- **Rule locked in**: **RULE 17 pre-flight is mandatory — if locked, switch to menu-driven AX nav for navigation and never claim Rule 14 visual parity from a captured frame during this run.**
