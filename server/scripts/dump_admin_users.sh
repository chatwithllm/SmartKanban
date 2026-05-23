#!/usr/bin/env bash
# Dumps the GET /api/admin/users response to stdout as formatted JSON.
# Usage: bash server/scripts/dump_admin_users.sh > macOS/Scripts/decode_samples/admin_users.json
#
# Requires: psql, curl, jq, DATABASE_URL or default postgres credentials.
# Set PUBLIC_APP_URL to point at a non-local server (default: http://localhost:3001).
#
# Re-run whenever the admin users API shape changes to keep the decode smoke
# test sample in sync (macOS/Scripts/decode_smoke_test.swift loads this file).

set -e

DB_URL="${DATABASE_URL:-postgresql://kanban:kanban@localhost:5432/kanban}"
APP_URL="${PUBLIC_APP_URL:-http://localhost:3001}"

TOK=$(psql "$DB_URL" -tAc \
  "SELECT s.token FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.is_admin = TRUE ORDER BY s.created_at DESC LIMIT 1")

if [ -z "$TOK" ]; then
  echo "ERROR: No admin session found in $DB_URL" >&2
  exit 1
fi

echo "# Fetching $APP_URL/api/admin/users ..." >&2
curl -sS --fail -H "cookie: kanban_session=$TOK" "$APP_URL/api/admin/users" | jq .
