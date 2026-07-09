#!/usr/bin/env bash
#
# Restore a backup produced by scripts/backup.sh.
#
#   ./scripts/restore.sh /opt/dom/backups/db-20260709-021501.dump \
#                        /opt/dom/backups/uploads-20260709-021501.tgz
#
# This OVERWRITES the live database and the uploads volume. It refuses to run without
# an explicit CONFIRM=yes, and it stops the backend first so nothing writes underneath it.
#
# Restore the pair from the SAME timestamp. A database that references attachment rows
# whose files came from a different night will show broken downloads.

set -euo pipefail

DB_FILE="${1:-}"
UP_FILE="${2:-}"
PROJECT_DIR="${PROJECT_DIR:-/opt/dom}"
PG_CONTAINER="${PG_CONTAINER:-dom_postgres}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-dom_backend}"

log() { echo "[$(date -u '+%H:%M:%S')Z] $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

[ -n "$DB_FILE" ] && [ -n "$UP_FILE" ] || die "usage: restore.sh <db-*.dump> <uploads-*.tgz>"
[ -f "$DB_FILE" ] || die "$DB_FILE not found"
[ -f "$UP_FILE" ] || die "$UP_FILE not found"
[ "${CONFIRM:-}" = "yes" ] || die "refusing to overwrite live data. Re-run with CONFIRM=yes"

env_val() {
  sed -n -E "s/^[[:space:]]*$1=[\"']?([^\"']*)[\"']?[[:space:]]*$/\1/p" "$PROJECT_DIR/.env" | tail -1
}
DB_USER="$(env_val DB_USER)"; DB_NAME="$(env_val DB_NAME)"
[ -n "$DB_USER" ] && [ -n "$DB_NAME" ] || die "DB_USER/DB_NAME missing from $PROJECT_DIR/.env"

log "stopping backend so nothing writes during the restore"
docker stop "$BACKEND_CONTAINER" >/dev/null

# ─── Database ───────────────────────────────────────────────────────────────
# --clean --if-exists drops each object before recreating it, so a restore over a
# populated database replaces it rather than colliding with it.
log "restoring database $DB_NAME"
docker exec -i "$PG_CONTAINER" \
  pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner < "$DB_FILE" \
  || die "pg_restore failed — the backend is still stopped, investigate before starting it"

# ─── Uploads volume ─────────────────────────────────────────────────────────
# Wipe first: an overlay would leave files that the restored database has no rows for.
log "restoring uploads volume"
UP_DIR="$(cd "$(dirname "$UP_FILE")" && pwd)"
UP_BASE="$(basename "$UP_FILE")"
docker run --rm --volumes-from "$BACKEND_CONTAINER" -v "$UP_DIR:/backup" alpine:3 \
  sh -c 'rm -rf /app/uploads/* && tar xzf "/backup/'"$UP_BASE"'" -C /app' \
  || die "uploads restore failed"

log "starting backend"
docker start "$BACKEND_CONTAINER" >/dev/null

log "done. Verify: open Accounting → an expense with an attachment and download it."
