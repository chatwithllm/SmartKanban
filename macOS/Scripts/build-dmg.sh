#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf ./DerivedData
xcodebuild \
  -project KanbanClaude.xcodeproj \
  -scheme KanbanClaude \
  -configuration Release \
  -destination 'platform=macOS,arch=arm64' \
  -derivedDataPath ./DerivedData \
  build 2>&1 | grep -E "error:|\*\* BUILD"
APP_PATH=./DerivedData/Build/Products/Release/KanbanClaude.app
xattr -dr com.apple.quarantine "$APP_PATH"
codesign --sign - --force --deep "$APP_PATH"
mkdir -p ./dist
DMG_PATH=./dist/KanbanClaude-$(date +%Y%m%d).dmg
hdiutil create -volname "SmartKanban" -srcfolder "$APP_PATH" -ov -format UDZO "$DMG_PATH"
echo "Built: $DMG_PATH"
