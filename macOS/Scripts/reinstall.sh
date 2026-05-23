#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pkill -x KanbanClaude || true
sleep 1
rm -rf /Applications/KanbanClaude.app
cp -R ./DerivedData/Build/Products/Release/KanbanClaude.app /Applications/
xattr -dr com.apple.quarantine /Applications/KanbanClaude.app
open -a /Applications/KanbanClaude.app
