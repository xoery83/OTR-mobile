#!/usr/bin/env bash
set -euo pipefail

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

if ! docker info >/dev/null 2>&1; then
  echo "A Docker-compatible local container runtime is required." >&2
  exit 1
fi

npx supabase start

npx supabase db reset --local
scripts/supabase/schema-manifest.sh > "$tmp_dir/reset-1.json"
npx supabase test db

npx supabase db reset --local
scripts/supabase/schema-manifest.sh > "$tmp_dir/reset-2.json"
npx supabase test db

cmp "$tmp_dir/reset-1.json" "$tmp_dir/reset-2.json"
if [[ -f supabase/schema-manifest.json ]]; then
  node scripts/supabase/compare-manifests.mjs \
    supabase/schema-manifest.json "$tmp_dir/reset-2.json"
else
  cp "$tmp_dir/reset-2.json" supabase/schema-manifest.json
fi

diff_file="$tmp_dir/schema-diff.sql"
npx supabase db diff --local --schema public > "$diff_file"
if grep -Eq '^(create|alter|drop|grant|revoke|comment|insert|update|delete)[[:space:]]' "$diff_file"; then
  echo "Unexpected schema diff after a clean reset:" >&2
  cat "$diff_file" >&2
  exit 1
fi

node scripts/supabase/verify-baseline-artifacts.mjs
cat supabase/schema-manifest.json
