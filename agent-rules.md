# Agent Rules — Locked In From Production Incidents
# Source: AGENT_LEARNINGS.md (LocalOCR macOS build)
# Status: BINDING — every rule here was locked in by a real incident.
# An agent that violates these rules will reproduce the exact bug that created the rule.
#
# READ THIS FILE AT THE START OF EVERY SESSION.
# Treat every rule as a hard constraint, not a suggestion.

---

## RULE 0 — What "Done" Means

`xcodebuild build` returning SUCCEEDED is **compile proof only**.
It is **not** done. Done means all of the following are true:

- [ ] Pre-flight bash checks passed (Rule 1) before client code was written
- [ ] Every ❌ registry row for this screen is closed (Rule 5)
- [ ] Release build succeeded with zero errors
- [ ] App reinstalled, launched, logs tailed (Rule 6)
- [ ] Zero failure log lines found (Rule 6, failure conditions)
- [ ] "loaded N <thing>" line found for every new endpoint within 5s of launch
- [ ] Screenshot of macOS screen taken and compared against web app (Rule 11)
- [ ] Every element visible on web is present on macOS or explicitly justified as 🔄/🚫
- [ ] Interactive behaviors grepped from index.html and verified (Rule 11)
- [ ] NO smoke-test checklist generated — agent performed every check itself
- [ ] Container/renderX() rows decomposed into per-element sub-rows before implementation (Rule 13)
- [ ] Screenshot comparison taken and confirmed zero differences (Rule 14)
- [ ] Cannot move to next screen until current screen screenshot matches web exactly

If any of those is not true → NOT done. Debug, fix, repeat. Do not report done.

---

## RULE 1 — Pre-Flight Before Writing ANY Endpoint Client Code

Run ALL FOUR of these before writing a single Codable struct, Endpoint enum case, or
service function. If any returns zero matches → STOP and ask. Do not guess.

```bash
# 1. Confirm the route exists + HTTP method
grep -nE "@.*\.route" src/backend/<blueprint_file>.py | grep -i "<feature>"

# 2. Confirm the url_prefix on the blueprint
grep -n "Blueprint(" src/backend/<blueprint_file>.py

# 3. Read the EXACT JSON shape returned
grep -n "return jsonify" src/backend/<blueprint_file>.py
# Then read the full function to see what keys are in the dict

# 4. Confirm what the web frontend sends/expects for this SAME endpoint
grep -n "fetch\|api(" src/frontend/index.html | grep -i "<feature>"
```

**Why each check exists:**
- Check 1: I-3 — agent invented plausible paths that didn't match reality
- Check 2: I-3 — url_prefix + route path = full URL. Missing prefix = 404
- Check 3: I-2, I-5 — backend wraps lists in envelopes; client decoded bare arrays → empty screens
- Check 4: I-4 — `/spending` and `/spending-by-category` are different endpoints with different shapes

---

## RULE 2 — Mirror Backend JSON Verbatim

Before writing any Codable struct or response model:
1. Run Check 3 from Rule 1 to find `return jsonify({...})`
2. Read the full dict — note every key name exactly as spelled
3. If the backend returns `{"inventory": [...], "count": N}` → write a wrapper struct
4. If the backend returns flat fields (`product_name`, `category`) → do NOT nest them

```swift
// ❌ Wrong — assumed nested (I-5)
struct InventoryItem: Codable {
    let product: Product     // backend emits flat product_name, not nested
}

// ✅ Correct — mirrors backend exactly
struct InventoryItem: Codable {
    let productName: String
    let category: String
    enum CodingKeys: String, CodingKey {
        case productName = "product_name"
        case category
    }
}

// ❌ Wrong — assumed bare array (I-2)
let items = try decoder.decode([InventoryItem].self, from: data)

// ✅ Correct — matches actual envelope
struct InventoryListResponse: Codable {
    let inventory: [InventoryItem]
    let count: Int
}
let response = try decoder.decode(InventoryListResponse.self, from: data)
let items = response.inventory
```

**Rule:** Reality > opinion. Mirror the backend schema verbatim, even if it would be "cleaner" to nest.

---

## RULE 3 — Swift Concurrency: Banned Patterns

### BANNED: `async let _ = foo()`

```swift
// ❌ NEVER — discarded child task is cancelled when parent scope exits (I-6)
async let _ = loadInventory()
async let _ = loadReceipts()
```

**Why:** `async let _ =` creates a child task but `_ =` discards the binding. The child is
never awaited, so when the parent function returns, Swift cancels all unawaited children.
`URLSession.data(for:)` throws `CancellationError` ~2 ms after start. All endpoints
show "cancelled" in logs. All screens show empty data. The build looks correct.

### CORRECT: `withTaskGroup` for parallel fan-out

```swift
// ✅ Always use this for parallel data fetches
await withTaskGroup(of: Void.self) { group in
    group.addTask { @MainActor in await self.loadInventory() }
    group.addTask { @MainActor in await self.loadReceipts() }
    group.addTask { @MainActor in await self.loadShopping() }
}
```

### BANNED: `.task { await heavyWork() }` for data fetches

```swift
// ❌ NEVER for heavy fetches — cancelled on view identity change (I-7)
.task { await self.refreshAll() }
```

**Why:** SwiftUI's `.task` modifier cancels its closure when the view's body re-evaluates
with a different identity. Heavy `@Published` traffic → frequent re-evaluations →
frequent cancellations → same "cancelled" symptom as I-6.

### CORRECT: `.onAppear` + `Task.detached` for heavy fetches

```swift
// ✅ Survives re-renders — use for any data fetch fan-out
.onAppear {
    Task.detached(priority: .userInitiated) {
        await self.refreshAll()
    }
}

// ✅ .task is fine for short, idempotent, view-bound work only (≤500 ms)
.task { await initSession() }
```

### CORRECT: Catch cancellation politely

```swift
do {
    try await api.request(...)
} catch is CancellationError {
    return  // user-driven cancel, ignore silently
} catch {
    let ns = error as NSError
    if ns.domain == NSURLErrorDomain, ns.code == NSURLErrorCancelled {
        return  // URLSession cancel, ignore silently
    }
    logger.error("\(error.localizedDescription, privacy: .public)")
}
```

---

## RULE 4 — Match the Web's Exact Endpoint

When porting any web visual to macOS, grep `index.html` for the exact fetch URL
the web uses for that feature before writing any Swift:

```bash
grep -n "fetch\|api(" src/frontend/index.html | grep -i "<feature name>"
```

Two endpoints with similar names are NOT interchangeable:
- `/analytics/spending` ≠ `/analytics/spending-by-category` (I-4)
- Different response shapes, different query params, different data

**Rule:** If the web uses `/analytics/spending-by-category?month=YYYY-MM&limit=50`,
the Swift endpoint must use the EXACT same path and query params.

---

## RULE 5 — Registry Workflow (Every Screen, No Exceptions)

```
Step 1 — Pull the rows before touching the view file
  awk '/Screen: <name>/,/^---/' FEATURE_PARITY_REGISTRY.md

Step 2 — Count the ❌ rows. This is your task list.

Step 3 — Implement every ❌ row.
  Annotate sections: // MARK: - F-NNN ... F-MMM <feature group>

Step 4 — BEFORE marking any row ✅ — verb check (Rule 9):
  Re-read the row's UI Element and feature description.
  Extract every action verb: button, toggle, expand, collapse, swipe,
  tap, navigate, edit, drag, sort, filter, delete, submit.
  Verify the Swift implementation supports each verb interactively.

  | Row says       | Impl MUST be                      | NOT acceptable       |
  | button         | Button { } label: { }             | Text, HStack, Image  |
  | toggle/expand  | @State var + Button that mutates  | static display       |
  | swipe action   | .swipeActions { Button }          | none                 |
  | tap/navigate   | NavigationLink or Button { nav() }| Text                 |
  | persisted      | UserDefaults write + read on init | @State only          |

  If the row says "button" and impl is Text → mark ❌, fix, re-verify.

Step 5 — Run post-build validation (Rule 6).

Step 6 — Update registry statuses:
  ❌ → ✅  (implemented AND all verbs verified interactively)
  ❌ → 🔄  (adapted for desktop — add note in macOS Impl column)
  ❌ → 🚫  (explicitly out of scope — must justify in column)

Step 7 — Report:
  ✅ <ScreenName> — N implemented, M adapted, K out-of-scope, 0 ❌ remaining
```

**No screen is done while it has ❌ rows.**
**No row gets ✅ without passing the verb check (Step 4).**

---

## RULE 6 — Post-Build Self-Validation (Run Before Every "Done" Claim)

```bash
# Step 1: Release build
cd LocalOCR.macOS && xcodebuild -scheme LocalOCR -configuration Release \
  -derivedDataPath ./DerivedData \
  -destination 'platform=macOS,arch=arm64' build \
  2>&1 | grep -E "error:|\*\* BUILD"

# Step 2: Reinstall + launch
pkill -x LocalOCR; sleep 1
rm -rf /Applications/LocalOCR.app
cp -R ./DerivedData/Build/Products/Release/LocalOCR.app /Applications/
xattr -dr com.apple.quarantine /Applications/LocalOCR.app
open -a /Applications/LocalOCR.app

# Step 3: Wait + grab logs
sleep 6
/usr/bin/log show --last 30s \
  --predicate 'subsystem == "com.localocr.extended"' \
  --info --debug 2>&1 | tail -80
```

### Failure conditions — any of these = NOT done

| Log pattern | Meaning | Rule to apply |
|-------------|---------|--------------|
| `cancelled` (> 1 instance) | Task cancellation cascade | Rule 3 — fix concurrency pattern |
| `failed:` | Runtime error | Read the full error, find root cause |
| `401` or `403` | Auth not attached or token revoked | Check APIClient header injection |
| `decode` or `DecodingError` | Response shape mismatch | Rule 2 — re-read jsonify, fix Codable |
| `404` | Wrong URL path | Rule 1 Check 1 — grep blueprint |
| No `loaded N <thing>` for new screen | Endpoint never returned data | Run Rule 1 pre-flight, check wrapper |

If any failure condition → debug, fix, re-run from Step 1. Never skip to "done".

---

## RULE 7 — Anti-Patterns (Never Do These)

| Anti-pattern | Why it fails | Correct pattern |
|---|---|---|
| `async let _ = foo()` | Child task cancelled on scope exit | `withTaskGroup` |
| `.task { await heavyWork() }` | Cancelled on view re-render | `.onAppear { Task.detached { ... } }` |
| Invent endpoint paths from plan | Backend doesn't match the plan | Rule 1 — grep blueprint first |
| Decode `[T]` as bare array | Backend wraps in `{"key": [...]}` | Wrapper struct, decode wrapper |
| `xcodebuild build` = "done" | Compile ≠ runtime | Rule 6 — tail log show |
| "Standard CRUD / all fields" | Misses sub-fields, modals, states | Atomic registry — one row per element |
| Skip pre-flight to save time | Guarantees wrong path/shape | Rule 1 — no exceptions |
| Read plan for endpoint path | Plan can be wrong | Read blueprint + grep index.html |
| SwiftUI view branches on data property and recursively renders a sub-view that re-evaluates the same branch | Infinite ViewBuilder recursion → EXC_BAD_ACCESS stack overflow deep in SwiftUICore | Rule 15: inline the leaf-shape body in the wrapping view, OR pass a `nested: true` flag that suppresses the branch on the recursive call |

---

## RULE 8 — Open Scars (Watch These, Add Rule When Pattern Confirms)

These have happened once but not yet ruled. Next incident locks in the rule.

- **PROD count 0 on `/products`** — returns `{total}` but some sessions return nothing.
  Watch: is it a session scope issue or a query parameter issue?

- **Receipts Processed sparkline empty** — `/analytics/spending?period=daily&months=1`
  returns empty `spending_by_period`. Confirm: backend bug vs wrong query params.

- **`UNErrorDomain error 1` on every launch** — notification permission denied silently.
  Should distinguish "denied" from "not determined" and only request once.

When any of these hits a second time → promote to a numbered Rule here.

---

## RULE 9 — Registry ✅ Requires Verb Verification, Not Visual Rendering

**Source: I-9** — F-028 and F-038 marked ✅ because the badge rendered. Both rows said
"button / toggle `toggleDashboardSection`". Both implementations were static `Text` views.
Clicking did nothing. User had to report it.

**The mistake:** "the badge is rendered" ≠ "the row is implemented".
A registry row describes BEHAVIOR, not appearance.

### Before marking ANY row ✅ — run this check:

1. Re-read the full row text — extract every action verb:
   `button` `toggle` `expand` `collapse` `swipe` `drag` `tap` `navigate`
   `open` `dismiss` `select` `sort` `filter` `edit` `delete` `submit`

2. For each verb found — verify the Swift implementation matches:

| Row says | Implementation MUST be | NOT acceptable |
|----------|------------------------|----------------|
| button | `Button { } label: { }` | `Text`, `HStack`, `Image` |
| toggle / expand / collapse | state var + `Button` that mutates it | static display |
| swipe action | `.swipeActions { Button }` | none |
| tap / navigate | `NavigationLink` or `Button { navigate() }` | `Text` |
| drag | `.draggable` or `onDrag` | static view |
| edit inline | `TextField` or edit mode | `Text` |

3. If the row says "button" and the impl is a `Text` → mark ❌, fix, then re-verify.

4. Persistence: if the row says "persisted" or "remembers" → verify UserDefaults/Keychain
   write + read. A state var that resets on relaunch is not ✅.

### The rule in one sentence:
**A registry-status update is a claim. Be ready to demo every verb in the row
interactively. If you cannot demo it, it is ❌.**

### Updated anti-pattern for section 3:
| Mark ✅ because "it renders" | Rendering ≠ behavior — re-read verbs, verify interactivity |
| Implement "renderX()" row without decomposing | Sub-elements have no rows — missed forever | Rule 13: decompose into per-element rows first |
| Move to next screen before screenshot matches | User finds mismatch, must re-prompt | Rule 14: screenshot both, fix all diffs, confirm zero gaps |
| Generate smoke-test checklist | Transfers validation to user — banned | Perform every check yourself; max 2 "could not auto-verify" lines |
| Screenshot matches but JS has drag/hover | Static diff misses interactive behaviors | Grep index.html for mouseover/drag/slider on this screen |
| Mark ✅ because log is clean | Log clean ≠ visual parity — images, buttons, counts can be missing silently | Rule 11 screenshot diff vs web before every screen ✅ |

---

---

---

## RULE 13 — Decompose Container Registry Rows Before Implementation

**Source: I-11** — Inventory passed RULE 9 verb-check. All rows ✅. User opened side-by-side
and found three visible features missing: product photos, defer button, expiry counts.
None had a dedicated row — they were rolled into "Rendered by renderInventory()" and
"Inventory tile — consume action". The registry said done. The screen was not done.

### The problem with container rows

A row labelled "Rendered by renderFoo()" or "Container for X items" is a lie.
It promises "all of foo's outputs are covered" but cannot keep that promise
because it has no sub-element list. RULE 9 verb-checks the row — finds no verbs —
marks ✅. Every sub-element the renderer creates invisibly is missed.

### Required: decompose before implement

Before implementing ANY row that contains:
- "Rendered by `renderX()`"
- "Container for..."
- "Tile / Card / Row component"
- "Section with..."

Do this FIRST:

```bash
# 1. Find the render function
grep -n "function renderX\|function _buildX\|function.*Tile\|function.*Row\|function.*Card"   src/frontend/index.html

# 2. Read the ENTIRE function body (Rule 11 slow-read)
# view src/frontend/index.html START END

# 3. List every visible element the function outputs:
#    [element] → [visible?] → [interactive?] → [endpoint]
#    Example:
#    product thumbnail  → visible always      → hover zoom popup  → /product-snapshots/
#    defer button       → visible always      → +3d expiry push   → PATCH /inventory/<id>/adjust-expiry
#    expiry count tag   → visible when N>0    → display only      → derived from item.days_left
#    status pill        → visible always      → tap cycles status → PATCH /inventory/<id>/status

# 4. For each element NOT already in the registry as its own row:
#    CREATE the row in FEATURE_PARITY_REGISTRY.md before writing any Swift
#    Row ID: next available F-NNN
#    Never implement an unregistered element

# 5. Only THEN begin implementation — now every element has a row to ✅
```

### The rule in one sentence
**Any registry row containing "renderX", "container", "tile", "card", or "row component"
must be decomposed into per-element sub-rows before a single line of Swift is written.
The decomposition IS the implementation plan.**

---

## RULE 14 — Screenshot Match Required Before Moving to Next Screen

**Source: Bills layout mismatch + ongoing user frustration**

The user should never discover a layout mismatch. The agent discovers it by comparing
screenshots before reporting done. If it does not match — fix it before reporting.
Do not move to the next screen. Do not ask the user if it looks right.

### Required screenshot comparison — every screen, every time

```bash
# After build + install + log validation:

# 1. Screenshot the macOS screen
screencapture -x /tmp/macos_[screen].png

# 2. Navigate to the same screen in the web app (prod URL)
#    Use osascript to switch to Chrome, navigate to the screen URL
osascript -e 'tell application "Google Chrome" to set URL of active tab to "[prod_url]/[screen]"'
sleep 2

# 3. Screenshot the web screen
screencapture -l $(GetWindowID "Google Chrome" "*") /tmp/web_[screen].png

# 4. Read BOTH screenshots with the Read tool
# 5. List EVERY element visible in web screenshot but absent or different in macOS screenshot:
#    - Missing columns
#    - Missing buttons
#    - Wrong layout (grid vs list)
#    - Missing status indicators
#    - Wrong data density
#    - Missing tabs or sub-sections
# 6. Fix ALL items in the list
# 7. Re-screenshot, re-compare, confirm zero differences
# 8. Only then report done and await confirmation for next screen
```

### What "match" means

Web layout = macOS layout. Not "similar". Not "close enough". Not "desktop adaptation".
Every column, every button, every status pill, every section header present on web
must be present on macOS — or explicitly registered as 🔄 with a written justification.

A 🔄 adaptation requires:
- Written reason why the web behavior doesn't apply to desktop
- Alternative implementation that provides equivalent function
- NOT just "deferred" or "not applicable"

### The rule in one sentence
**Before reporting any screen done, take screenshots of both apps, read both,
list every difference, fix every difference, re-screenshot and confirm zero gaps.
The user sees the confirmation screenshot, not the live app.**


---

## RULE 16 — Touched Files Get a Full Rule-Grep Pass Before Commit

**Source: I-14** — Fix-agent committed FIX-027 and FIX-047 to `DashboardView.swift` without noticing four `async let _ = ` calls at lines 82-85 — the exact I-6 cancellation pattern, sitting in the same file the agent had just edited. The pattern even has warning comments in three sibling files (`InventoryState.swift`, `ReceiptsState.swift`, `AppMenuCommands.swift`), proving the agent knew the rule and only applied it to net-new code.

### The mistake pattern

A fix spec says "change line X to Y." Agent reads the spec, opens the file, edits the named lines, runs the build, commits. The rest of the file is treated as out of scope. Any pre-existing RULE violation in that file survives the touch.

### Why it fails

- The user expects every commit to leave the file healthier than it found it.
- Pre-existing violations become permanent fixtures because no future FIX spec will ever name them.
- The agent has full context of the rules — silence about a known anti-pattern in a touched file is itself a regression.

### Required before committing any file edit

Before `git commit` on any file you touched (including via `Edit`, `Write`, or `NotebookEdit`):

```bash
# 1. Re-grep the FULL file for every active banned pattern
grep -n "async let _ =" <file>
grep -nE "try (decoder|JSONDecoder\(\))\.decode\(\[" <file>
grep -nE "\.task \{ await refreshAll|loadAll|fetchAll" <file>

# 2. If any match in <file> is real (not a comment) → fix it in the SAME commit.
#    Do not defer with a TODO. Do not open a separate PR. Do not leave it for the next fix.

# 3. Mention the cleanup in the commit message:
#    "fix: FIX-NNN — <spec> (attempt 1); also remediate RULE 3 violation at <file>:<line> per I-14"
```

### The rule in one sentence

**Every file you touch is your responsibility end-to-end — re-grep the full file for active RULE violations before commit and remediate any live match in the same commit.** Pre-existing violations in a touched file are regressions in disguise.

### How to spot this before commit

When you finish an `Edit` or `Write`:
1. Read the file's RULE-relevant sections (concurrency-heavy code → check `async let _ =`; networking code → check bare-array decode; SwiftUI view code → check recursive ViewBuilders).
2. If you find a violation, fix it before commit.
3. If you don't fix it, the next audit will find it and log a new incident.

### Anti-pattern row for RULE 7 table

| Edit a file but skip RULE-grep on the rest of it | Pre-existing violations survive every touch | RULE 16: re-grep whole file before commit; remediate in same commit |

---

## RULE 15 — SwiftUI ViewBuilder Recursion: Inline Leaf Body or Pass a Nested Flag

**Source: I-13** — `CardGroupView` set `anyOwner = group.accounts.contains { ownerLabel non-empty }`.
When true it rendered each owner sub-group via `OwnerSubgroup`, which then called back into
`CardGroupView` with the sub-group's accounts. Every account in that sub-group shared the
same `owner_label`, so `anyOwner` re-evaluated to true and the call recursed forever.
Build was green, log show was clean, then the app crashed with `EXC_BAD_ACCESS` /
"Thread stack size exceeded due to excessive recursion" deep inside `SwiftUICore` and
`AttributeGraph` frames.

### The pattern that fails

```swift
struct CardGroupView: View {
    let group: Group
    var body: some View {
        if group.accounts.contains(matchingCondition) {
            ForEach(subgroups()) { sg in
                OwnerSubgroup(accounts: sg.accounts)   // ← recursion
            }
        } else {
            leafBody(group.accounts)
        }
    }
}
struct OwnerSubgroup: View {
    let accounts: [Account]
    var body: some View {
        // ❌ sg.accounts still matches `matchingCondition` → infinite recursion
        CardGroupView(group: Group(accounts: accounts))
    }
}
```

### Two safe rewrites

**Option A — inline the leaf shape in the wrapping view:**
```swift
struct OwnerSubgroup: View {
    let accounts: [Account]
    var body: some View {
        // Render the leaf body directly. Never re-enter the recursive view.
        leafBody(accounts)
    }
}
```

**Option B — pass a flag that suppresses the branch on the recursive call:**
```swift
struct CardGroupView: View {
    let group: Group
    var nested: Bool = false
    var body: some View {
        if !nested && group.accounts.contains(matchingCondition) {
            ForEach(subgroups()) { sg in
                CardGroupView(group: sg.group, nested: true)   // ← bottoms out
            }
        } else {
            leafBody(group.accounts)
        }
    }
}
```

### How to spot this before it crashes

A SwiftUI view that:
1. branches on a property of its data (`contains`, `filter`, `any`), AND
2. recurses into a sub-view that re-renders the same view type with the same property pattern

…is presumed infinite-recursive until proven otherwise. Either inline the leaf body, or
pass a `nested: Bool` / depth counter that breaks the cycle.

### Diagnosis when the symptoms are misleading

Clean compile, clean log (subsystem logger fires before SwiftUI lays out), then the app
disappears with no terminal output. Check `~/Library/Logs/DiagnosticReports/<app>*.ips`:
- `"exception":"EXC_BAD_ACCESS","subtype":"KERN_PROTECTION_FAILURE"`
- `"message":"Thread stack size exceeded due to excessive recursion"`
- Stack frames in `SwiftUICore` and `AttributeGraph` framework

If you see those three together, you have a ViewBuilder recursion — find the view type
that appears repeatedly in the crashed thread's call stack.

### The rule in one sentence
**A SwiftUI view that conditionally renders a sub-view of the same type with the same
branch-condition data is recursive — inline the leaf body, or pass a `nested` flag that
suppresses the branch on the recursive call.**


## LEARNING LOOP — Every Incident Updates Both Files Immediately

When you append a new incident to AGENT_LEARNINGS.md, you MUST in the same commit:

### Step 1 — Add the incident to AGENT_LEARNINGS.md (§2)
Follow the exact format of I-1 through I-9:
```
### I-N: <short symptom title>
- **Symptom**: [what the user saw]
- **Root cause**: [why it happened]
- **User prompt that exposed it**: > "[exact words]"
- **Fix**: [what was changed]
- **Rule locked in**: **[the rule, bold]**
```

### Step 2 — Add RULE N to agent-rules.md immediately after
```
## RULE N — <title matching I-N>

**Source: I-N** — <one-line summary of the mistake>

[Rule content — at minimum:]
- What went wrong (the mistake pattern)
- Why it fails
- The correct pattern with code example if applicable
- How to verify compliance before marking ✅
```

### Step 3 — Add the anti-pattern to the Rule 7 table
Add one row:
| <what the agent did wrong> | <why it fails> | <correct pattern> |

### Step 4 — Update Rule 0 Done criteria if the new rule adds a new gate
If the new rule requires a new verification step before "done", add it to the
Rule 0 checklist.

### Step 5 — Commit both files together
```bash
git add AGENT_LEARNINGS.md agent-rules.md
git commit -m "learning: I-N locked in — <symptom title>"
```

---

### How the two files relate

| File | Location | Who writes | When |
|------|----------|-----------|------|
| `AGENT_LEARNINGS.md` | project root | Agent | Every incident |
| `agent-rules.md` (project) | project root | Agent | Every incident (same commit) |
| `agent-rules.md` (skill) | `/mnt/skills/user/native-app-builder/references/` | Read-only — updated when user installs new skill version | Periodically |

The **project-level `agent-rules.md`** is the live version during a build.
The **skill-level `agent-rules.md`** is the baseline for a new project.

### Session start — which file to read

```bash
# Always prefer the project-level version if it exists (it has newer rules)
[ -f agent-rules.md ] && echo "Using project agent-rules.md" \
  || echo "Falling back to skill references"
```

In the session start prompt:
  Read agent-rules.md from the project root.
  If it does not exist, read /mnt/skills/user/native-app-builder/references/agent-rules.md.
  The project version always takes precedence — it has rules the skill may not have yet.

### When to sync back to the skill

After each build phase (or when the user asks), the user brings agent-rules.md and
AGENT_LEARNINGS.md to Claude.ai. Claude updates the skill and repackages. The new
skill version becomes the baseline for the next project — carrying all rules forward.

This means every new app you build starts with the full institutional memory of every
previous app. Mistakes that cost hours on project 1 never appear on project 2.


---

---

## RULE 11 — Read the Full Web Implementation Before Writing Any Swift

**Source: Inventory row incident** — pencil/edit, +3d, cart, -1, and checkmark all have
full JS implementations in index.html. Agent implemented some, skipped others, then
asked the user to verify. User should never discover a missing button.

### The mandatory slow-read protocol — for EVERY UI component

Before writing any SwiftUI view or row component, read the FULL web implementation:

```bash
# Step 1 — Find the render function for this component
grep -n "function.*[componentName]\|_build[ComponentName]\|render[ComponentName]" \
  src/frontend/index.html

# Step 2 — Read the ENTIRE function body (not just the grep match)
# Use view with the exact line range returned above
# Read every element: icons, buttons, labels, indicators, gestures, tooltips

# Step 3 — List every interactive element found
# Format: [element] → [action] → [endpoint or state change]
# Example:
#   pencil icon  → click → opens inline edit sheet → PATCH /inventory/products/<id>
#   +3d button   → click → pushes expiry +3 days  → PATCH /inventory/<id>/adjust-expiry
#   ⌥+3d         → option+click → pushes +7 days  → same endpoint, different body
#   cart icon    → click → adds to shopping list  → POST /shopping-list/items
#   -1 button    → click → decrements quantity    → PATCH /inventory/products/<id>
#   checkmark    → click → cycles status          → PATCH /inventory/<id>/status
#   green bar    → drag  → sets remaining %       → PATCH /inventory/<id>/remaining
#   thumbnail    → hover → shows zoom popup       → local, no endpoint

# Step 4 — Map EVERY item in that list to a registry row
# If no registry row exists for an element → create one before implementing
# If a row exists but you were about to skip it → implement it now

# Step 5 — Implement ALL elements in one pass
# Do not implement 3 of 6 and stop. Implement all 6 then validate.
```

### The rule in one sentence
**Read the entire web render function. List every element. Map every element to a
registry row. Implement every element. Then validate. Never implement a partial row.**

### What "going slow" means
- 1 component = 1 full read of its web render function
- No skipping elements because they "seem minor"
- No partial implementation — all buttons/gestures in a component ship together
- If reading takes 10 minutes, that is correct — it prevents 30 minutes of user re-prompting

### Anti-pattern this rule prevents
Agent implements the visible buttons (the ones it notices from a quick scan) and misses:
- Secondary gestures (⌥-click, long-press, right-click)
- State-dependent buttons (only show when item is low stock)
- Modifier key shortcuts
- Tooltip/hover behaviors
- Inline edit modes triggered by specific elements


## RULE 12 — Visual Parity Check Before Every Screen ✅

**Source: Post-Inventory observation** — agent reported Inventory complete with 0 ❌.
Side-by-side with the web app revealed missing product images, missing defer button,
missing expiry counts in section headers. Log validation cannot catch visual gaps.

### Required before marking ANY screen complete

After post-build log validation (Rule 6), run a visual parity check:

```bash
# 1. Screenshot the macOS screen
screencapture -x /tmp/macos_[screenname].png

# 2. Screenshot the equivalent web screen
# Open the prod URL in the background, screenshot that window
screencapture -l $(GetWindowID "Google Chrome" "*[screen feature]*") /tmp/web_[screenname].png

# 3. Read both screenshots using the Read tool (image)
# Compare visually — list every element present in web but absent in macOS
```

### What to look for in the diff

| Element | Where to check | Common miss |
|---------|---------------|-------------|
| Product/item images | Any list or card view | Agent skips image loading as "non-functional" |
| Action buttons | Each row/card | defer, archive, share often missed |
| Counts in headers | Section headers | "N expiring soon", "N low stock" subtitles |
| Color indicators | Status badges | Web uses color + icon, macOS may have icon only |
| Empty sub-sections | Collapsed areas | Web may show sub-category counts |
| Toolbar items | Top of screen | Web toolbar has more actions than macOS |

### Fix protocol

For every visual gap found:
1. Find the registry row — it will be ❌ or incorrectly marked 🔄/🚫
2. If 🔄 or 🚫 — re-read the justification. If the web shows it, it needs a reason to skip.
3. Implement missing elements
4. Re-screenshot, re-compare
5. Only mark ✅ when macOS screenshot matches web screenshot feature-for-feature

### Step 3 — Grep the web JS for interactive behaviors on this screen

After the screenshot diff, grep `src/frontend/index.html` for every interactive
behavior attached to this screen's elements:

```bash
# Find drag/slider behaviors
grep -n "drag\|slider\|range\|mousedown\|mousemove" src/frontend/index.html | grep -i "<screen>"

# Find hover behaviors  
grep -n "mouseover\|mouseenter\|hover\|tooltip\|popup\|preview" src/frontend/index.html | grep -i "<screen>"

# Find exact button sets
grep -n "btn\|button\|action" src/frontend/index.html | grep -i "<screen>" | head -30

# Find keyboard shortcuts
grep -n "keydown\|keyup\|shortcut\|hotkey" src/frontend/index.html | grep -i "<screen>"
```

For every interactive behavior found — verify the macOS implementation matches.
A static view where the web has a draggable slider is a gap. Fix it before ✅.

### Step 4 — NEVER generate a smoke-test checklist

Smoke-test checklists are banned. They transfer validation work to the user.
Instead, perform every check yourself:

| Instead of asking user to... | Do this yourself |
|------------------------------|-----------------|
| "Click +3d and verify expiry changes" | Write a UI test or tail log for the action |
| "Hover over image and verify popup" | Verify the gesture recognizer and overlay view exist in code |
| "Quit and relaunch to check persistence" | Run `pkill` + relaunch + tail log, grep for persisted value loading |
| "Switch tabs to verify thumbnails" | Navigate programmatically, screenshot, check for non-placeholder images |
| "Drag the slider" | Verify `.gesture(DragGesture())` or equivalent exists and mutates state |

If you cannot verify something automatically — say so explicitly with the reason.
Do not generate a checklist. One or two specific "I could not auto-verify X because Y,
please check" lines is acceptable. A numbered list of manual steps is not.

### The rule in one sentence
**Log clean + 0 ❌ rows + screenshot matches web + interactive behaviors verified = done.
Never generate a smoke-test checklist. You do the checking.**


## RULE 17 — Pre-flight a Locked Screen Before Any Synthetic-Click Audit

**Source: I-15** — Audit silently degraded to half-coverage because the screen
auto-locked mid-run. Quartz/System-Events clicks routed to `loginwindow`; only
menu-bar AX actions still reached the app, so the audit appeared to keep working
while sub-tab / sidebar-click navigation broke completely.

### What goes wrong

Once `CGSessionCopyCurrentDictionary().get("CGSSessionScreenIsLocked") == True`:
- `osascript "tell System Events to click at {x,y}"` returns `window Login of application process loginwindow`
- `Quartz.CGEventPost(kCGHIDEventTap, …)` mouse events are intercepted before reaching the target app
- BUT `osascript "tell process X to tell menu bar 1 …"` still fires (AX path, not HID)
- AND `screencapture -l <window-id>` still captures the offscreen backing store of every window

Net effect: menu-driven screens look fine in captures, sub-tab / segmented-picker
screens silently freeze on the previous selection, and the audit reports
"navigated" when it didn't.

### Pre-flight check (run before any visual-audit script)

```bash
python3 -c "
from Quartz import CGSessionCopyCurrentDictionary
d = CGSessionCopyCurrentDictionary() or {}
locked = d.get('CGSSessionScreenIsLocked', False)
import sys
if locked:
    print('ABORT: screen is locked — synthetic clicks will route to loginwindow.')
    sys.exit(1)
"
```

Re-run the check every N captures (e.g. every 5) — auto-lock can fire mid-run.

### Mitigations

- Disable auto-lock for the audit duration (`System Settings > Lock Screen > Start Screen Saver when inactive: Never`).
- For long unattended runs, prefer `caffeinate -dimsu sleep 3600 &` to keep the display awake.
- If the screen has locked already and the user is unavailable: switch to **menu-driven** navigation only and explicitly mark every other screen as "code-verified" in the report.

### The rule in one sentence

**Before any visual-audit run that uses synthetic mouse events, check `CGSSessionScreenIsLocked` and abort early if `True`. Half-coverage audits are worse than no audit because partial captures look complete.**

---

## RULE 18 — Never Reload the Authoritative Web Reference Window

**Source: I-16** — A single `tell active tab to reload` on the authenticated
extended.npalakurla.com window dropped the session cookie and returned the
logged-out shell for the rest of the audit run. AUDIT_B2 lost its ability to
re-shoot web captures and had to fall back to Round 1 images.

### What goes wrong

- The web app's auth cookie may not survive a forced-reload triggered from outside the page (cookie scope, SameSite, or session-rotation behavior varies by deployment).
- Once the session is gone, every subsequent screenshot shows the logged-out shell — but the URL bar still shows `/#dashboard` etc, so the agent doesn't notice the regression until it Reads the image.
- The Round 1 captures (`/tmp/web_*.png`) describe the gap that the FIXes were targeting, so they remain authoritative. Reloading the live window to "freshen" the comparison **adds no information** and can only cost the run its capability.

### Required pattern

1. **Snapshot first.** Before any navigation: capture URL + `document.title` + `document.body.className` + presence of `.sidebar` / `.nav-item.active` via `execute javascript`. Save them so you can detect session loss after each nav.
2. **SPA navigation only.**

   ```javascript
   if (typeof window.nav === 'function') window.nav('dashboard');
   else location.hash = '#dashboard';
   ```

   Do NOT use `tell active tab to reload`. Do NOT use `set URL of active tab to`. Both can trigger a full document load that the auth cookie may not survive.
3. **Probe after every nav.** Re-fetch the JS state and abort if `.sidebar` is missing or `.nav-item.active` is null — these mean the page bounced to the login route.
4. **Round-1 captures stay authoritative.** AUDIT_B descriptions were written against specific images; the FIXes target those documented states. Re-shooting the web side is only useful if the live state can be confirmed authenticated and themed identically.

### The rule in one sentence

**Treat the authenticated web-reference window as fragile single-shot state. Never `reload`, never replace `URL`, only `nav()` / hash-set. Probe `body.className` + `.nav-item.active` after every nav. If the session is gone, re-auth before continuing — do not silently fall through to half-coverage.**

---

## SESSION START CHECKLIST

At the start of every build session, before writing a single line:

- [ ] Read FEATURE_PARITY_REGISTRY.md — know the screen queue
- [ ] Read MACOS_APP_PLAN.md §7.4 (or VETO_RESOLUTION_PATCH.md) — confirm no open gates
- [ ] Read this file (agent-rules.md) — all rules are active this session
- [ ] Confirm PROD_BASE_URL is set and reachable: `curl -s -o /dev/null -w "%{http_code}" $PROD_BASE_URL/auth/me`
- [ ] Confirm you know the test credentials for post-build log validation
- [ ] If audit involves synthetic clicks: confirm `CGSSessionScreenIsLocked == False` (Rule 16)
- [ ] If audit re-captures web reference: snapshot session state before nav (Rule 17)
