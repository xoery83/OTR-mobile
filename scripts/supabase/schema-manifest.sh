#!/usr/bin/env bash
set -euo pipefail

project_id="$(sed -n 's/^project_id = "\([^"]*\)"/\1/p' supabase/config.toml)"
container="supabase_db_${project_id}"

if ! docker inspect "$container" >/dev/null 2>&1; then
  echo "Local Supabase database container is not running: $container" >&2
  exit 1
fi

docker exec -i "$container" psql -X -qAt -U postgres -d postgres \
  < supabase/schema_manifest.sql
