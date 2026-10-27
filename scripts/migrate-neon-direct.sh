#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${NEON_PROJECT_ID:-twilight-bar-73854022}"
DATABASE_NAME="${NEON_DATABASE_NAME:-neondb}"
ROLE_NAME="${NEON_ROLE_NAME:-neondb_owner}"

if ! command -v neon >/dev/null 2>&1; then
  echo "Neon CLI is required. Install it and authenticate before running migrations." >&2
  exit 1
fi

DIRECT_URL="$(neon connection-string --project-id "$PROJECT_ID" --database-name "$DATABASE_NAME" --role-name "$ROLE_NAME" --ssl require)"

if [[ -z "$DIRECT_URL" || "$DIRECT_URL" == *-pooler* ]]; then
  echo "Refusing migration because Neon did not return a direct connection." >&2
  exit 1
fi

echo "Applying Prisma migrations through the direct Neon endpoint for project $PROJECT_ID."
DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
