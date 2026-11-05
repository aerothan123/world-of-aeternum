#!/usr/bin/env bash
# Wyndlewood off-machine database backup (TEMPLATE: fill the env, never the file).
#
# What it does, in order, and stops on the first failure:
#   1. pg_dump the game database from the running Postgres container
#      (custom format, compressed: restores selectively, see the runbook);
#   2. encrypt the dump for an age recipient (public key only on this host,
#      the private key lives OFF this machine with the owner);
#   3. copy it off the machine with rclone to a remote you configured
#      (S3, Backblaze B2, R2, ... `rclone config` keeps its secrets in its own
#      config file, never here);
#   4. verify the remote copy's size matches, prune local copies past
#      LOCAL_KEEP_DAYS, and stamp a textfile metric for the BackupMissing alert.
#
# Runbook: docs/launch/backup-restore-runbook.md. Schedule nightly via cron, e.g.
#   15 3 * * * root /opt/wyndlewood/deploy/backup_offsite.sh >> /var/log/wyndlewood-backup.log 2>&1
#
# Required env (put them in /etc/wyndlewood/backup.env, mode 600, sourced below):
#   AGE_RECIPIENT    the age PUBLIC key (age1...) the dump is encrypted to
#   RCLONE_REMOTE    rclone destination, e.g. wyndlewood-b2:wyndlewood-backups/db
# Optional:
#   PG_CONTAINER     default eastbrook-db       PG_USER  default eastbrook
#   PG_DB            default eastbrook          LOCAL_DIR default /var/backups/wyndlewood
#   LOCAL_KEEP_DAYS  default 7                  BACKUP_METRIC_FILE (node_exporter textfile)
set -euo pipefail

ENV_FILE="${BACKUP_ENV_FILE:-/etc/wyndlewood/backup.env}"
# shellcheck disable=SC1090
if [ -f "$ENV_FILE" ]; then . "$ENV_FILE"; fi

: "${AGE_RECIPIENT:?set AGE_RECIPIENT (age public key) in $ENV_FILE}"
: "${RCLONE_REMOTE:?set RCLONE_REMOTE (rclone destination) in $ENV_FILE}"
PG_CONTAINER="${PG_CONTAINER:-eastbrook-db}"
PG_USER="${PG_USER:-eastbrook}"
PG_DB="${PG_DB:-eastbrook}"
LOCAL_DIR="${LOCAL_DIR:-/var/backups/wyndlewood}"
LOCAL_KEEP_DAYS="${LOCAL_KEEP_DAYS:-7}"

for tool in docker age rclone; do
  command -v "$tool" >/dev/null || { echo "backup: missing $tool" >&2; exit 2; }
done

stamp="$(date -u +%Y-%m-%dT%H%MZ)"
mkdir -p "$LOCAL_DIR"
chmod 700 "$LOCAL_DIR"
out="$LOCAL_DIR/wyndlewood-$stamp.dump.age"

echo "backup: dumping $PG_DB from $PG_CONTAINER"
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" --format=custom --compress=6 \
  | age -r "$AGE_RECIPIENT" -o "$out"
[ -s "$out" ] || { echo "backup: empty dump" >&2; exit 3; }

echo "backup: copying $(basename "$out") to $RCLONE_REMOTE"
rclone copyto "$out" "$RCLONE_REMOTE/$(basename "$out")" --immutable
local_size="$(stat -c %s "$out")"
remote_size="$(rclone size --json "$RCLONE_REMOTE/$(basename "$out")" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')"
[ "$local_size" = "$remote_size" ] || { echo "backup: size mismatch ($local_size vs $remote_size)" >&2; exit 4; }

find "$LOCAL_DIR" -name 'wyndlewood-*.dump.age' -mtime +"$LOCAL_KEEP_DAYS" -delete

if [ -n "${BACKUP_METRIC_FILE:-}" ]; then
  printf 'wyndlewood_backup_last_success_timestamp_seconds %s\n' "$(date +%s)" > "$BACKUP_METRIC_FILE.tmp"
  mv "$BACKUP_METRIC_FILE.tmp" "$BACKUP_METRIC_FILE"
fi
echo "backup: ok ($local_size bytes)"
