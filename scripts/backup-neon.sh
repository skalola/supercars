#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" || -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
  echo "DATABASE_URL and BACKUP_ENCRYPTION_KEY are required." >&2
  exit 1
fi

command -v pg_dump >/dev/null || { echo "pg_dump is required." >&2; exit 1; }
command -v pg_restore >/dev/null || { echo "pg_restore is required." >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required." >&2; exit 1; }

backup_dir="${BACKUP_DIR:-.db-backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
plain_file="$(mktemp "${TMPDIR:-/tmp}/supercardash-${timestamp}.XXXXXX.dump")"
encrypted_file="$backup_dir/supercardash-${timestamp}.dump.enc"
trap 'rm -f "$plain_file"' EXIT

pg_dump --format=custom --compress=9 --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$plain_file"
pg_restore --list "$plain_file" >/dev/null
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
  -pass env:BACKUP_ENCRYPTION_KEY -in "$plain_file" -out "$encrypted_file"

echo "Encrypted backup created and archive-verified: $encrypted_file"
