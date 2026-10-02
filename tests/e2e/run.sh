#!/usr/bin/env bash
# End-to-end test of the real app against a real (local) Supabase-compatible
# backend: PostgreSQL 16 + Supabase Auth (GoTrue) + PostgREST behind a small
# gateway. Realtime is deliberately absent so the polling fallback is tested.
#
#   npm run test:e2e            # needs PostgreSQL 16 binaries and Chromium
#
# Binaries are downloaded once into .cache/e2e. Screenshots land in
# tests/e2e/artifacts. Never point this at production: it creates users.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CACHE="$ROOT/.cache/e2e"
ARTIFACTS="$ROOT/tests/e2e/artifacts"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || echo /usr/lib/postgresql/16/bin/initdb)")}"
PG_PORT=54340 AUTH_PORT=54331 REST_PORT=54332 API_PORT=54321 WEB_PORT=8081
POSTGREST_VERSION=v12.2.3 AUTH_VERSION=v2.177.0
JWT_SECRET="partyverse-e2e-secret-that-is-at-least-32-chars"

mkdir -p "$CACHE/bin" "$ARTIFACTS"
if [[ ! -x "$CACHE/bin/postgrest" ]]; then
  curl -sSL "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x64.tar.xz" | tar xJ -C "$CACHE/bin"
fi
if [[ ! -x "$CACHE/bin/auth" ]]; then
  curl -sSL "https://github.com/supabase/auth/releases/download/$AUTH_VERSION/auth-$AUTH_VERSION-x86.tar.gz" | tar xz -C "$CACHE/bin"
fi

DATA_DIR="$(mktemp -d /tmp/partyverse-e2e.XXXXXX)"
RUN_AS=()
if [[ "$(id -u)" == "0" ]]; then chown postgres "$DATA_DIR"; RUN_AS=(runuser -u postgres --); fi
PIDS=()
cleanup() {
  local status=$?
  if [[ $status -ne 0 ]]; then
    for log in "$DATA_DIR"/*.log; do [[ -f "$log" ]] && { echo "--- $(basename "$log")"; tail -n 30 "$log"; }; done
  fi
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$DATA_DIR" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT

wait_for() { for _ in $(seq 1 100); do curl -sf "$1" >/dev/null 2>&1 && return 0; sleep 0.2; done; echo "timeout: $1" >&2; return 1; }

echo "→ PostgreSQL"
"${RUN_AS[@]}" "$PG_BIN/initdb" -D "$DATA_DIR" -U postgres --auth=trust --no-sync >/dev/null
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$DATA_DIR" -l "$DATA_DIR/postgres.log" \
  -o "-p $PG_PORT -k $DATA_DIR -c listen_addresses=127.0.0.1 -c fsync=off" -w start >/dev/null
DB="postgres://postgres@127.0.0.1:$PG_PORT/postgres"
psql_run() { psql "$DB" -v ON_ERROR_STOP=1 -q -X "$@"; }
psql_run -f "$ROOT/tests/e2e/bootstrap.sql" 2>/dev/null

echo "→ Supabase Auth"
(
  cd "$CACHE/bin"
  GOTRUE_API_HOST=127.0.0.1 PORT=$AUTH_PORT API_EXTERNAL_URL="http://127.0.0.1:$API_PORT/auth/v1" \
  GOTRUE_DB_DRIVER=postgres GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin@127.0.0.1:$PG_PORT/postgres?sslmode=disable" GOTRUE_DB_NAMESPACE=auth \
  GOTRUE_DB_MIGRATIONS_PATH="$CACHE/bin/migrations" GOTRUE_SITE_URL="http://127.0.0.1:$WEB_PORT" GOTRUE_URI_ALLOW_LIST='*' \
  GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
  GOTRUE_JWT_ADMIN_ROLES=service_role GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true \
  GOTRUE_DISABLE_SIGNUP=false GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_LOG_LEVEL=warn \
  exec ./auth >"$DATA_DIR/auth.log" 2>&1
) &
PIDS+=($!)
wait_for "http://127.0.0.1:$AUTH_PORT/health"
psql_run -f "$ROOT/tests/e2e/after-auth.sql"

echo "→ PARTYVERSE migrations"
for migration in "$ROOT"/supabase/migrations/*.sql; do psql_run -f "$migration" 2>/dev/null; done

echo "→ PostgREST"
PGRST_DB_URI="postgres://authenticator:e2e@127.0.0.1:$PG_PORT/postgres" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
PGRST_JWT_SECRET="$JWT_SECRET" PGRST_SERVER_HOST=127.0.0.1 PGRST_SERVER_PORT=$REST_PORT PGRST_LOG_LEVEL=warn \
  "$CACHE/bin/postgrest" >"$DATA_DIR/postgrest.log" 2>&1 &
PIDS+=($!)
wait_for "http://127.0.0.1:$REST_PORT/"

ANON_KEY="$(node "$ROOT/tests/e2e/jwt.mjs" anon "$JWT_SECRET")"

echo "→ Web build"
WEB_ROOT="$CACHE/web"
rm -rf "$WEB_ROOT"
(cd "$ROOT" && EXPO_OFFLINE=1 CI=1 EXPO_PUBLIC_SUPABASE_URL="http://127.0.0.1:$API_PORT" EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
  npx expo export --platform web --clear --output-dir "$WEB_ROOT" >/dev/null)

node "$ROOT/tests/e2e/gateway.mjs" $API_PORT $AUTH_PORT $REST_PORT $WEB_PORT "$WEB_ROOT" &
PIDS+=($!)
wait_for "http://127.0.0.1:$WEB_PORT/"

echo "→ Scenarios"
DATABASE_URL="$DB" BASE_URL="http://127.0.0.1:$WEB_PORT" ARTIFACTS="$ARTIFACTS" node "$ROOT/tests/e2e/flows.mjs"
