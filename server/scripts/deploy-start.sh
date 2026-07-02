#!/bin/sh
set -u

attempt=1
max_attempts="${DB_MIGRATION_ATTEMPTS:-4}"
base_delay_seconds="${DB_MIGRATION_RETRY_DELAY_SECONDS:-5}"

if [ "${SKIP_DB_MIGRATIONS:-false}" = "true" ]; then
  echo "[deploy] skipping database migrations because SKIP_DB_MIGRATIONS=true"
else
  while [ "$attempt" -le "$max_attempts" ]; do
    echo "[deploy] running database migrations (attempt $attempt/$max_attempts)"

    if pnpm db:migrate; then
      echo "[deploy] database migrations complete"
      break
    fi

    if [ "$attempt" -eq "$max_attempts" ]; then
      echo "[deploy] database migrations failed after $max_attempts attempts" >&2
      exit 1
    fi

    delay_seconds=$((base_delay_seconds * attempt))
    echo "[deploy] database migration attempt $attempt failed; retrying in ${delay_seconds}s" >&2
    sleep "$delay_seconds"
    attempt=$((attempt + 1))
  done
fi

echo "[deploy] starting Pach server"
exec pnpm --filter server start
