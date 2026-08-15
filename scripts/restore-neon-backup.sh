#!/usr/bin/env bash
set -euo pipefail

if [[ "${CONFIRM_RESTORE:-}" != "supercardash" ]]; then
  echo "Set CONFIRM_RESTORE=supercardash to authorize a destructive restore." >&2
  exit 1
fi
if [[ -z "${RESTORE_DATABASE_URL:-}" || -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
  echo "RESTORE_DATABASE_URL and BACKUP_ENCRYPTION_KEY are required." >&2
  exit 1
fi
if [[ $# -ne 1 || ! -f "$1" ]]; then
  echo "Usage: npm run db:restore -- path/to/backup.dump.enc" >&2
  exit 1
fi

plain_file="$(mktemp "${TMPDIR:-/tmp}/supercardash-restore.XXXXXX.dump")"
trap 'rm -f "$plain_file"' EXIT

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass env:BACKUP_ENCRYPTION_KEY -in "$1" -out "$plain_file"
pg_restore --list "$plain_file" >/dev/null
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$RESTORE_DATABASE_URL" "$plain_file"

echo "Restore completed and archive verified against the designated restore database."
