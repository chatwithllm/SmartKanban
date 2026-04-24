#!/usr/bin/env bash
# Nightly backup: pg_dump + attachments tarball. Intended to be run from cron.
#
#   0 3 * * * /path/to/KanbanClaude/scripts/backup.sh /mnt/proxmox-backups/kanban
#
# Keeps the last 14 daily backups, then prunes.

set -euo pipefail

DEST="${1:-${BACKUP_DIR:-./backups}}"
DB_URL="${DATABASE_URL:-postgresql://kanban:kanban@localhost:5432/kanban}"
ATTACHMENTS_DIR="${ATTACHMENTS_DIR:-./data/attachments}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$DEST"

echo "[backup $STAMP] pg_dump -> $DEST/db-$STAMP.sql.gz"
if command -v pg_dump >/dev/null 2>&1; then
  pg_dump "$DB_URL" | gzip > "$DEST/db-$STAMP.sql.gz"
else
  # Fall back to dumping via the running docker container.
  docker exec -i kanbanclaude-db-1 pg_dump -U kanban -d kanban | gzip > "$DEST/db-$STAMP.sql.gz"
fi

if [ -d "$ATTACHMENTS_DIR" ]; then
  echo "[backup $STAMP] tar attachments -> $DEST/attachments-$STAMP.tar.gz"
  tar -czf "$DEST/attachments-$STAMP.tar.gz" -C "$(dirname "$ATTACHMENTS_DIR")" "$(basename "$ATTACHMENTS_DIR")"
fi

# Keep last 14 of each kind.
echo "[backup $STAMP] pruning"
ls -1t "$DEST"/db-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --
ls -1t "$DEST"/attachments-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm --

echo "[backup $STAMP] done"
