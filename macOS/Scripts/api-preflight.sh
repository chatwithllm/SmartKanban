#!/usr/bin/env bash
# Rule 1 four-check helper. Usage: api-preflight.sh <route-file-glob> <feature>
set -euo pipefail
SRC_GLOB="${1:-server/src/*.ts}"
FEATURE="${2:?usage: api-preflight.sh <glob> <feature>}"

echo "== 1. Route + method ==" ; grep -nE "@.*\.route|router\.(get|post|put|delete|patch)|app\.(get|post|put|delete|patch)|fastify\.(get|post|put|delete|patch)" $SRC_GLOB | grep -i "$FEATURE" || echo "no route hits"
echo "== 2. Blueprint / router ==" ; grep -nE "Blueprint\(|APIRouter\(|express\.Router|register\(" $SRC_GLOB || echo "no blueprint hits"
echo "== 3. Response shape ==" ; grep -nE "return jsonify|return.*json\(|reply\.send|res\.json|res\.send" $SRC_GLOB | grep -i "$FEATURE" || echo "no jsonify hits"
echo "== 4. Web frontend usage ==" ; grep -nE "fetch\(|api\.|await fetch" web/src/api.ts web/index.html 2>/dev/null | grep -i "$FEATURE" || echo "no frontend hits"
