#!/usr/bin/env bash
# Runs the database integration tests against a throwaway PostgreSQL cluster.
#
#   npm run test:db
#
# Requires PostgreSQL 16 binaries (initdb, pg_ctl). Set PG_BIN to override the
# location. When run as root, the cluster is owned by the `postgres` system user.
# Set DATABASE_URL to reuse an existing empty database instead.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || echo /usr/lib/postgresql/16/bin/initdb)")}"
PORT="${PGTEST_PORT:-54329}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  DATA_DIR="$(mktemp -d /tmp/partyverse-pg.XXXXXX)"
  RUN_AS=()
  if [[ "$(id -u)" == "0" ]]; then
    chown postgres "$DATA_DIR"
    RUN_AS=(runuser -u postgres --)
  fi
  cleanup() { "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$DATA_DIR" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA_DIR"; }
  trap cleanup EXIT

  "${RUN_AS[@]}" "$PG_BIN/initdb" -D "$DATA_DIR" -U postgres --auth=trust --no-sync >/dev/null
  "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$DATA_DIR" -o "-p $PORT -k $DATA_DIR -c listen_addresses=127.0.0.1 -c fsync=off" -w start >/dev/null
  export DATABASE_URL="postgres://postgres@127.0.0.1:$PORT/postgres"
fi

psql_run() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X "$@"; }

psql_run -f "$ROOT/supabase/tests/supabase_shim.sql"
for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ $(basename "$migration")"
  psql_run -f "$migration"
done

cd "$ROOT"
npx jest --selectProjects db --runInBand "$@"
