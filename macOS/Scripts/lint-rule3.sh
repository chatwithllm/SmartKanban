#!/usr/bin/env bash
set -eu
SRC="${1:-KanbanClaude}"
fail=0
if grep -rnE '^[^/]*async let _ *=' "$SRC" --include='*.swift' 2>/dev/null; then
  echo "RULE 3 violation: async let _ ="
  fail=1
fi
if grep -rnE '\.task[[:space:]]*\{[[:space:]]*await[[:space:]]+(self\.)?(refreshAll|loadAll|fetchAll)' "$SRC" --include='*.swift' 2>/dev/null; then
  echo "RULE 3 violation: .task { await heavyWork() }"
  fail=1
fi
if grep -rnE 'try (decoder|JSONDecoder\(\))\.decode\(\[' "$SRC" --include='*.swift' 2>/dev/null; then
  echo "RULE 2 violation: bare-array decode"
  fail=1
fi
exit $fail
