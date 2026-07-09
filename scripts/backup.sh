#!/usr/bin/env bash
#
# Nightly backup: Postgres dump + the uploads volume (incident documents, expense
# invoices, branding logos). Both are irreplaceable — an expense attachment is a
# statutory record that exists nowhere else.
#
# Install (on the server, once):
#   chmod +x /opt/dom/scripts/backup.sh
#   crontab -e   →   15 2 * * *  /opt/dom/scripts/backup.sh >> /var/log/dom-backup.log 2>&1
#
# Restore: see BACKUP.md. A backup you have never restored is not a backup.

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/dom}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
PG_CONTAINER="${PG_CONTAINER:-dom_postgres}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-dom_backend}"

# Optional offsite copy. Set BACKUP_REMOTE to an rclone target (e.g. "vultr:dom-backups").
# Left unset, everything below still runs — but the backup then lives on the same disk it
# is meant to protect you from losing, so the script says so loudly.
BACKUP_REMOTE="${BACKUP_REMOTE:-}"

log() { echo "[$(date -u '+%Y-%m-%d %H:%M:%S')Z] $*"; }
die() { log "ERROR: $*"; exit 1; }

STAMP="$(date -u '+%Y%m%d-%H%M%S')"
mkdir -p "$BACKUP_DIR"

# DB_USER / DB_NAME live in the compose .env alongside everything else. Read the two
# keys out rather than sourcing the file: `. .env` runs it as shell, and an unquoted
# value like `SLA_SWEEP_CRON=*/15 * * * *` glob-expands into a command. Parsing is also
# the only way to keep a compromised .env from executing as root out of cron.
env_val() {
  sed -n -E "s/^[[:space:]]*$1=[\"']?([^\"']*)[\"']?[[:space:]]*$/\1/p" "$PROJECT_DIR/.env" | tail -1
}
[ -f "$PROJECT_DIR/.env" ] || die "$PROJECT_DIR/.env not found"
DB_USER="$(env_val DB_USER)"
DB_NAME="$(env_val DB_NAME)"
[ -n "$DB_USER" ] || die "DB_USER missing from .env"
[ -n "$DB_NAME" ] || die "DB_NAME missing from .env"

docker inspect "$PG_CONTAINER"      >/dev/null 2>&1 || die "container $PG_CONTAINER is not running"
docker inspect "$BACKEND_CONTAINER" >/dev/null 2>&1 || die "container $BACKEND_CONTAINER is not running"

# ─── 1. Database ────────────────────────────────────────────────────────────
# -Fc (custom format) so a restore can be selective and parallel. Write to a temp
# name and only rename on success: a half-written .dump that looks like yesterday's
# good one is worse than no file at all.
DB_FILE="$BACKUP_DIR/db-$STAMP.dump"
log "dumping database $DB_NAME"
docker exec "$PG_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$DB_FILE.part" \
  || die "pg_dump failed"
mv "$DB_FILE.part" "$DB_FILE"

# Prove the dump is readable before trusting it. pg_restore --list parses the whole
# archive header + TOC, so a truncated or corrupt file fails here rather than during
# the emergency six months from now.
docker exec -i "$PG_CONTAINER" pg_restore --list > /dev/null < "$DB_FILE" \
  || die "dump is unreadable — pg_restore --list rejected it"
log "database ok: $(du -h "$DB_FILE" | cut -f1)"

# ─── 2. Uploads volume ──────────────────────────────────────────────────────
# Mount whatever the backend has at /app/uploads rather than guessing the volume's
# name (it is prefixed by the compose project name, which follows the directory).
UP_FILE="$BACKUP_DIR/uploads-$STAMP.tgz"
log "archiving uploads volume"
docker run --rm \
  --volumes-from "$BACKEND_CONTAINER" \
  -v "$BACKUP_DIR:/backup" \
  alpine:3 tar czf "/backup/$(basename "$UP_FILE").part" -C /app uploads \
  || die "uploads archive failed"
mv "$UP_FILE.part" "$UP_FILE"

# Verify with the same tar that wrote the archive, inside the container — no dependency
# on whatever tar the host happens to ship.
docker run --rm -v "$BACKUP_DIR:/backup" alpine:3 \
  tar tzf "/backup/$(basename "$UP_FILE")" > /dev/null || die "uploads archive is corrupt"
log "uploads ok: $(du -h "$UP_FILE" | cut -f1)"

# ─── 3. Offsite ─────────────────────────────────────────────────────────────
if [ -n "$BACKUP_REMOTE" ]; then
  command -v rclone >/dev/null 2>&1 || die "BACKUP_REMOTE is set but rclone is not installed"
  log "copying offsite → $BACKUP_REMOTE"
  rclone copy "$DB_FILE" "$BACKUP_REMOTE/" || die "offsite copy of the dump failed"
  rclone copy "$UP_FILE" "$BACKUP_REMOTE/" || die "offsite copy of the uploads archive failed"
  log "offsite copy done"
else
  log "WARNING: BACKUP_REMOTE is unset — backups exist only on this server's disk."
  log "WARNING: a disk failure loses the data AND its backup. Configure an offsite target."
fi

# ─── 4. Retention ───────────────────────────────────────────────────────────
# Only ever prune here, and only files this script names. Never touch the remote.
find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.dump'     -mtime "+$KEEP_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'uploads-*.tgz' -mtime "+$KEEP_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name '*.part'        -mtime +1           -delete

log "done. $(find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.dump' | wc -l) dump(s) retained, keep=${KEEP_DAYS}d"
log "disk: $(df -h "$BACKUP_DIR" | awk 'NR==2 {print $4" free of "$2}')"
