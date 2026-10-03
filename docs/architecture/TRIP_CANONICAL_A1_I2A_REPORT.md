# Trip Canonical A1-I2A — Local Implementation Attempt

Status: **BLOCKED — baseline migration manifest gate failed; implementation stopped**.
Date: 2026-10-03 (Pacific/Auckland).

## A. Baseline

- pwd: `/Users/xoery/Project/otr-mobile-canonical`.
- Branch: `integration/ledger-polish-canonical`.
- HEAD: `bd777c51a2218c7e9da38e4da575fef535a9b88e`,
  `docs(trip): define participation lifecycle schema contract`.
- Workspace clean before work. Accepted identity, persistence preflight and schema
  contract remain authoritative. No legacy Web checkout inspection.
- Requested stop condition: “migration replay exposes inconsistent schema history”.
  The current migration replay succeeds, but its canonical schema manifest gate
  fails before any Trip participation migration is applied. This report does not
  claim the SQL migration chain itself fails to execute.

## B. Migration files

No retained server/SQLite migration. A draft server migration and local migration
42 were prepared after the private-role capability probe, then removed/restored
when baseline manifest validation failed. The server draft was never applied.
No migration was applied to Hosted Dev or Production.

## C. Exact implemented server contract

Not implemented. The existing server schema remains the baseline. The accepted
future Boolean/revision definitions remain in
`docs/architecture/TRIP_CANONICAL_A1_I2A_SCHEMA_CONTRACT.md`; this report does not
turn them into runtime truth.

## D. Write protection implementation

No retained guard, private writer role, grants or command function.
A transaction-rolled-back capability probe on isolated Supabase PostgreSQL 17
proved:

- NOLOGIN/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOINHERIT/NOBYPASSRLS role creation works.
- authenticated and service_role are not members of the private probe role.
- A SECURITY INVOKER BEFORE INSERT trigger executes for service_role and normalizes
  false to true despite its RLS bypass.
- Probe role/table/function/trigger were rolled back. No fake product bypass added.

This proves basic local capability only, not complete lifecycle write protection,
claim/upsert compatibility or the implementation acceptance gate.

## E. Local SQLite implementation

No retained change. The draft nullable-pair migration and preserving Member upsert
were restored to HEAD. Existing local schema remains v41; no application database
was opened/upgraded.

## F. Bootstrap/DTO changes

No retained change. Draft DTO and bootstrap additions were restored. No cursor,
Member change entity, timer or I2B mechanism was introduced.

## G. TripPerson extension

No retained change. The current type still exposes Trip ID, Person ID and display
name. No filtering or lifecycle command.

## H. Old-client compatibility evidence

Implementation tests not executed; PENDING. Private-role capability evidence in D
is insufficient to claim old-client update/upsert/claim compatibility.

## I. Financial non-interference evidence

Application/schema changes restored; no new migration applied and no financial
source code retained changes. Existing Member IDs, FKs, financial data and role/
status semantics were not changed by this attempt. Before/after migration financial
safety tests are PENDING because the baseline gate stopped implementation.

## J. Local migration replay

Used a new temporary project at `/private/tmp/otr-trip-i2a`, project ID
`otr-trip-i2a`, DB container `supabase_db_otr-trip-i2a`, localhost port 55322.
Copied the exact baseline migration chain/seed/config into that temporary project;
only its project ID/ports changed for isolation. Existing local project database
was not reset. Starting the existing Colima runtime also resumed its previously
configured local containers; no query/reset was performed against those databases.

Executed:

```text
colima start
npx supabase start --workdir /private/tmp/otr-trip-i2a -x gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
# Transactional role/trigger capability probe via local docker exec psql.
docker exec -i supabase_db_otr-trip-i2a psql -X -qAt -U postgres -d postgres < supabase/schema_manifest.sql > /private/tmp/otr-trip-i2a/before-schema.json
node scripts/supabase/compare-manifests.mjs supabase/schema-manifest.json /private/tmp/otr-trip-i2a/before-schema.json
```

The isolated startup replayed the baseline through
`20260930000100_expense_participation_preserve_valuation.sql` and seeded synthetic
local data successfully. Manifest comparison failed:

```text
Error: Schema manifest mismatch for tables: expected 105, received 107.
```

| Metric              | Committed manifest / verifier expectation | Baseline replay |
| ------------------- | ----------------------------------------: | --------------: |
| tables / RLS tables |                                       105 |             107 |
| columns             |                                      1470 |            1488 |
| constraints         |                                       814 |             824 |
| indexes             |                                       344 |             349 |
| functions           |                                       123 |             141 |
| triggers            |                                       108 |             114 |
| policies            |                                       178 |             178 |
| buckets             |                                         3 |               3 |

Committed checksum:
`6616a88591a750f8a8345021deb5268c71a327339ae3dc6da9a7527a8c689822`.
Replay checksum:
`201f6b0f42a50e6185233a07604f06907e71bec0dca372645949100cb95c1897`.

Concrete source evidence: `20260929000100_expense_consistency_v2.sql` adds
`expense_revision_evidence` and `expense_conflict_outcomes_v2`, their indexes,
constraints and triggers. Later retained forward migrations also add/replace
functions. `scripts/supabase/verify-baseline-artifacts.mjs` still hardcodes the old
105-table/1470-column counts. Thus refreshing only the JSON manifest would not
repair the repository's canonical validation workflow. This is a pre-existing
artifact/verification mismatch, not a difference introduced by Trip participation.

No baseline artifact/verification repair, migration renumbering, history rewrite
or weaker guard was attempted. The isolated project is stopped without retaining
its disposable DB volume; local log/manifest evidence remains under the temporary
project path. The existing local project/runtime remains available.

## K. Automated validation

| Command / gate                                                          | Result                                                      |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| Git baseline pwd/branch/HEAD/status                                     | PASS, expected HEAD and clean workspace                     |
| Isolated Supabase baseline startup/replay/seed                          | PASS, PostgreSQL 17 baseline chain executed                 |
| Local transactional role/invoker probe                                  | PASS, capability only, all probe objects rolled back        |
| compare-manifests.mjs expected vs before-schema.json                    | BLOCKED, exact table-count failure above                    |
| New server migration/reset/SQL acceptance suite                         | PENDING, stopped before application                         |
| TripPerson/account/auth/bootstrap/Ledger/financial/queue TS regressions | PENDING, draft restored; not executed                       |
| TypeScript/scoped lint/UI guard                                         | PENDING, implementation stopped; no source changes retained |
| Report Prettier / whitespace / final file scope                         | PASS, documentation-only validation                         |

No test counts or financial/runtime PASS inferred from source inspection.

## L. Known limitations

The next action requires separately authorized baseline-manifest/validator
reconciliation, with isolated replay evidence. Do not blindly replace checksums or
hardcoded counts: establish the current retained migration shape and deterministic
reset result first. Then rerun I2A from a clean approved baseline.

This attempt is not implementation complete and does not authorize I2B/I2C.
No lifecycle state write surface, command receipt/audit table, financial predicate,
permission redesign or second Person authority was introduced.

## M. Acceptance matrix

| Criterion                                           | Evidence                                          | Result  |
| --------------------------------------------------- | ------------------------------------------------- | ------- |
| Server participation_active implemented exactly     | No retained implementation                        | PENDING |
| Server participation_revision implemented exactly   | No retained implementation                        | PENDING |
| Existing server Persons baseline true/0             | New migration not applied                         | PENDING |
| New server Persons default true/0                   | New migration not applied                         | PENDING |
| Revision range enforced                             | New migration not applied                         | PENDING |
| Ordinary updates preserve lifecycle                 | No lifecycle SQL acceptance executed              | PENDING |
| Claim/link preserves lifecycle                      | No lifecycle SQL acceptance executed              | PENDING |
| Old upserts preserve lifecycle                      | No lifecycle SQL acceptance executed              | PENDING |
| Service-role ordinary writes cannot alter lifecycle | Probe only, no implementation proof               | PENDING |
| Private writer protection works locally             | Capability probe only                             | PENDING |
| No product lifecycle command exists                 | Draft restored; no retained runtime changes       | PASS    |
| No receipt/audit table created yet                  | No new migration applied                          | PASS    |
| Local nullable lifecycle pair added                 | Draft restored                                    | PENDING |
| Existing local rows remain unobserved NULL/NULL     | Local migration not implemented                   | PENDING |
| Pair validation enforced                            | Local migration not implemented                   | PENDING |
| Member REPLACE lifecycle-loss risk removed          | Draft restored                                    | PENDING |
| Missing wire pair preserves known observation       | Draft restored, tests not executed                | PENDING |
| Greater revision replaces                           | Tests not executed                                | PENDING |
| Lower revision preserves                            | Tests not executed                                | PENDING |
| Equal/opposite revision rejected                    | Tests not executed                                | PENDING |
| Bootstrap paired DTO backward-compatible            | Draft restored                                    | PENDING |
| TripPerson observation object/null                  | Draft restored                                    | PENDING |
| listTripPersons remains complete                    | Existing source unchanged                         | PASS    |
| No active filtering added                           | No retained source changes                        | PASS    |
| No Member ID changed                                | No new migration/data update                      | PASS    |
| status/role semantics unchanged                     | No retained changes                               | PASS    |
| trip_members unchanged                              | No retained changes                               | PASS    |
| No permission redesign                              | No retained changes                               | PASS    |
| Financial fingerprints/results unchanged            | Migration comparison not executed                 | PENDING |
| Account isolation tests pass                        | Not executed in this attempt                      | PENDING |
| Offline repository contract passes                  | Not executed in this attempt                      | PENDING |
| Local server migration replay passes                | Baseline SQL replays but canonical manifest fails | BLOCKED |
| Relevant SQL regressions pass                       | Not executed after stop                           | PENDING |
| Relevant TS regressions pass                        | Not executed after stop                           | PENDING |
| No I2B sync mechanism implemented                   | No retained changes                               | PASS    |
| No Hosted Dev deployment                            | Local-only tools                                  | PASS    |
| No Production access                                | Local-only project, no remote project calls       | PASS    |
| Documentation/report complete                       | This blocked-attempt report                       | PASS    |

Summary: **12 PASS / 25 PENDING / 1 BLOCKED**. No implementation-complete claim.

## N. Git status

Only `docs/architecture/TRIP_CANONICAL_A1_I2A_REPORT.md` is added. All eight
application/test file drafts were restored byte-for-byte from HEAD; the server
migration draft was removed. Approved SPEC and canonical current-state/architecture
remain unchanged because no implementation stage was completed. No commit.

Production accessed: **NO**. Hosted Dev accessed/mutated: **NO**.
Deployment performed: **NO**. Lifecycle command implemented: **NO**.

**STOP — baseline manifest reconciliation requires a separately approved scope.**
