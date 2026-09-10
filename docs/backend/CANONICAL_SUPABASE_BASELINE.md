# Canonical Supabase Baseline

## Status

Validated locally and against the hosted `OTR Development` project on
2026-09-10. No write was made to the production Supabase project or legacy OTR
repository.

## Lineage Boundary

The legacy repository's 76 migrations are historical evidence, not executable
input for a new environment. They contain duplicate versions, ordering hazards,
repo-only changes, and policy history that does not exactly describe production.

The canonical Dev/Staging lineage begins with:

1. `20260910000100_canonical_production_baseline.sql`: the verified production
   shape, ordered as enum, tables, constraints, indexes, functions, triggers,
   RLS, policies, grants, and bucket declarations.
2. `20260910000200_canonical_security_hardening.sql`: the explicitly approved
   security model layered over that shape.

Do not apply these baseline migrations to the current production project. New
Dev/Staging changes must be new timestamped forward migrations. Do not append
legacy files or renumber them into this directory.

The baseline intentionally excludes the repo-only fields
`memory_entries.parent_memory_id` and `ai_jobs.current_step`. Either field may
only return through a separately reviewed future migration.

## Included Artifacts

- `supabase/config.toml`: local project services, ports, Auth defaults, Storage,
  and deterministic seed configuration.
- `supabase/seed.sql`: four synthetic `.invalid` users, one synthetic journey,
  membership fixtures, and minimal parser/Capture/RLS fixtures.
- `supabase/schema_manifest.sql`: canonical object inventory and SHA-256 digest.
- `supabase/schema-manifest.json`: approved local schema counts and checksum.
- `supabase/tests/rls_matrix.test.sql`: anon, member, owner-derived membership,
  admin, and service-role authorization checks.
- `scripts/supabase/validate-local.sh`: two resets, two test runs, checksum
  comparison, schema diff, and production-data guard.
- `scripts/supabase/verify-baseline-artifacts.mjs`: expected counts, deferred
  column checks, secret/identifier checks, and migration checksum output.

The one-time generator in `scripts/supabase/generate-canonical-baseline.mjs`
requires the read-only audit exports and exists for provenance. The checked-in
baseline migration and manifest are the canonical source for normal work.

## Local Workflow

Prerequisites are Node/npm and a running Docker-compatible engine. On this Mac,
Colima was installed as the lightweight engine; it is not required when Docker
Desktop or another compatible engine is already available.

```bash
npm install
colima start
npm run supabase:validate
npm run supabase:stop
```

`npm run supabase:validate` is deliberately strict. It:

1. starts the local Supabase services;
2. performs a clean reset and runs the RLS tests;
3. performs a second clean reset and reruns the tests;
4. requires both generated manifests to match each other and the committed
   manifest;
5. requires `supabase db diff --local --schema public` to be empty;
6. checks object counts, deferred-column exclusions, and committed SQL/seed for
   production identifiers, JWT-like values, key assignments, and non-reserved
   email addresses.

Local keys printed by the Supabase CLI are disposable development credentials.
They are not written to this repository.

## Verified Result

| Check                       | Result                                                             |
| --------------------------- | ------------------------------------------------------------------ |
| Clean reset 1               | PASS                                                               |
| Clean reset 2               | PASS                                                               |
| RLS matrix                  | PASS, 28 assertions per reset                                      |
| Schema diff after reset     | PASS, no changes found                                             |
| Public tables               | 64                                                                 |
| Public columns              | 910                                                                |
| Constraints                 | 329                                                                |
| Indexes                     | 240                                                                |
| Public functions            | 29                                                                 |
| Public triggers             | 32                                                                 |
| RLS-enabled public tables   | 64                                                                 |
| Public and Storage policies | 178                                                                |
| Storage buckets             | 2 private buckets                                                  |
| Schema checksum             | `319176c04e305e73bf57f6a592fa0aad58610b8d7065ae042224bfabf2b94167` |

The 178-policy result is intentional: the security migration adds own-rating
delete, replaces policy definitions without increasing their count, and removes
six direct face/embedding mutation policies. Service-role backend operations
continue to bypass RLS.

## Security Validation

The local matrix confirms:

- anon cannot read journey data or execute `SECURITY DEFINER` functions;
- a linked member can read the journey but cannot directly read `trip_members`;
- the approved member RPC returns membership data;
- ordinary profile edits work while self-promotion to admin fails;
- ordinary users cannot modify global parser or Capture configuration;
- linked group members can publish their own Live Location and guests cannot;
- users can delete their own itinerary rating;
- direct Memory deletion is blocked while the owner RPC succeeds;
- only author/owner Memory Artifact mutation policies remain;
- no user-facing `daily_reports` policy exists;
- no direct face or embedding mutation policy remains;
- system admins can manage parser/Capture configuration;
- service-role backend mutation remains available.

## Synthetic Data Boundary

The seed uses fixed UUIDs, reserved `@otr.invalid` email addresses, fixed dates,
and clearly synthetic text. It contains no production users, customer emails,
production project reference, production IDs, secrets, Storage objects, or OTR
content. The two bucket rows declare metadata only and remain empty.

Before creating a hosted Dev project, configure dashboard-only Auth provider
credentials, redirect allowlists, third-party secrets, and environment-specific
Storage limits separately. None belongs in this baseline.

## Hosted Validation

The canonical lineage and synthetic seed were applied to the hosted
`OTR Development` project in the Sydney region. After removing the project
creation wizard's non-canonical automatic-RLS event trigger, the hosted manifest
matched all local counts and checksum exactly. The 28-assertion RLS matrix passed
with zero failures, all four Auth identities were synthetic `@otr.invalid`
fixtures, and both private buckets contained zero objects.

Hosted identifiers, Auth defaults, migration-ledger handling, and the rebuild
runbook are documented in `docs/backend/HOSTED_DEV_SUPABASE.md`. Secrets are not
recorded there or elsewhere in this repository.
