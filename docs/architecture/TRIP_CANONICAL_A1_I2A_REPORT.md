# Trip Canonical A1-I2A — Participation Persistence & Passive Projection

Status: **A1-I2A IMPLEMENTATION COMPLETE — REVIEW PENDING**.
Date: 2026-10-03 (Pacific/Auckland). Human + independent review: **PENDING**.
Local only; no commit or automatic I2B/I2C continuation.

## A. Baseline

- pwd: `/Users/xoery/Project/otr-mobile-canonical`.
- Branch: `integration/ledger-polish-canonical`.
- Clean starting HEAD: `0285aced36ca468a955648fc8a651c21c57c8f29`,
  `chore(db): reconcile canonical schema manifest`.
- Owner confirmed the infrastructure fix passed Builder + Independent Review and
  explicitly authorized this rerun. The older attachment's `bd777c5` baseline is
  superseded by that instruction. No blocked-attempt draft files were reused.
- Starting isolated 64-migration replay matched the committed manifest:
  107 tables/RLS tables, 1,488 columns, 824 constraints, 349 indexes, 141 functions,
  114 triggers, 178 policies, three buckets; checksum
  `201f6b0f42a50e6185233a07604f06907e71bec0dca372645949100cb95c1897`.
- Accepted identity, persistence preflight and schema SPEC remain authoritative.
  No redesign, legacy Web inspection, dependency or product scope added.

## B. Migration files

- New server migration: `supabase/migrations/20261003000100_trip_person_participation.sql`.
- SQLite migration 42: `trip_person_participation_observation` in
  `src/data/db/migrations.ts`, appended after existing 41 migrations.
- Historical server migrations are unchanged. No table rebuild, ID renumbering,
  data deletion, financial FK rewrite or remote migration.

## C. Exact implemented server contract

`journey_members.participation_active BOOLEAN NOT NULL DEFAULT true` and
`participation_revision BIGINT NOT NULL DEFAULT 0`, constrained inclusively to
`0..9007199254740991`. Existing rows become true/0 without changing prior columns.
The pair describes ordinary new Trip participation selection only; role, status,
link, access, financial validity and deletion retain their current semantics.

The additive schema delta is exactly **+2 columns, +1 constraint, +1 function,
+1 trigger**. Tables, indexes, RLS policies and buckets are unchanged.

## D. Write protection implementation

The BEFORE INSERT/UPDATE trigger `journey_members_participation_guard` invokes
`guard_trip_person_participation()` with `SECURITY INVOKER` and fixed
`search_path=pg_catalog`. Ordinary INSERT normalizes true/0, including supplied
pairs. UPDATE preserves OLD pair, including conflict upserts whose EXCLUDED pair
was normalized during the INSERT trigger. Existing timestamp/history triggers
remain installed; old column updates and existing unreferenced deletes work.

The reserved `otr_trip_person_lifecycle_writer` role is NOLOGIN, NOSUPERUSER,
NOCREATEDB, NOCREATEROLE, NOINHERIT and NOBYPASSRLS. Migration reuse across local
resets validates those attributes and rejects API-role membership. It receives no
Member write grants and owns no callable functions. PUBLIC/API roles have no
EXECUTE grant on the guard. Actual private execution identity is fail-closed with
`PARTICIPATION_COMMANDS_DISABLED`; I2A provides **no enabled lifecycle writer**.
I2C must separately install its reviewed guarded command/evidence path.

Local SQL proves authenticated/service_role cannot assume that role, ordinary
service writes/upserts preserve false/7, and spoofed client GUC/JWT role values do
not bypass the execution-identity guard. Existing SECURITY DEFINER notes/claim,
invite acceptance, auto-claim and owner-creation flows retain their behavior.
Test-only privileged DDL temporarily disables the trigger to seed inactive
fixtures and exercise bounds; it creates no runtime bypass function or grant.
No command, API, queue operation, UI, lifecycle receipt or audit table is added.

## E. Local SQLite implementation

Migration 42 appends nullable INTEGER columns to existing `ledger_members`, both
DEFAULT NULL. A combined CHECK requires either NULL/NULL or two non-null integers:
active in 0/1 and revision within the safe range. Null is unobserved metadata,
not a third lifecycle state. Upgrade tests preserve every old row field.

Member hydration replaces `INSERT OR REPLACE` with an ID-preserving conflict
UPDATE in the existing bootstrap transaction. Both fields absent preserve the
known pair; unobserved or higher revision accepts the observation; lower or equal
matching revision preserves it. Equal revision/opposite state and malformed or
partial pairs reject application, rolling back Journey/member/actor/cursor changes.
A Member ID already attached to another Trip is rejected rather than reassigned.
No unrelated local write, queue, financial projection or read behavior changes.

## F. Bootstrap/DTO changes

Existing Member DTO accepts optional paired `isParticipating` Boolean and bounded
integer `participationRevision`. Both absent remains valid; partial, null,
malformed, fractional or out-of-range values fail validation. Hydration validates
again at its direct-call boundary, so bypassing the transport parser remains safe.

New backend bootstrap explicitly selects and emits both database fields and
rejects missing/malformed data instead of inventing a baseline observation.
Capabilities still derive only from existing role/status. The eight gateway tests
mock all fetches; their approved Dev-shaped URL is configuration validation only,
not a Hosted Dev request. No backend route, cursor, polling or delta entity added.

## G. TripPerson extension

`TripPerson.participation` is `{isParticipating:boolean;revision:number} | null`.
The account-scoped repository reads the existing Member cache, preserves account
identity/generation guards, and returns the complete canonical list including
inactive Persons. No role/status/user-link inference or active filtering.

## H. Old-client compatibility evidence

- Legacy DTO omission is accepted; an old non-strict parser strips additive fields.
- Repeated old bootstrap after false/7 preserves it while still updating old metadata.
- Lower, equal matching, greater and ABA revision sequences are covered.
- Nine invalid/inconsistent observations prove atomic rejection; another Trip's
  Member ID cannot move the observation.
- Actual SQLite file close/reopen preserves false/7 with an expired-token cached
  session and failed offline bootstrap; account-switch isolation remains tested.
- SQL exercises old omitted/default/stale upserts, ordinary link/status/role updates,
  real explicit unlinked claim, invite placeholder acceptance, auto-claim and new
  invite-created Person baseline. Link paths keep the existing canonical ID.

## I. Financial non-interference evidence

A baseline local fixture contains an accepted Expense, payer/Participant/split
links, active same-currency valuation, ledger settings, Personal Payment and its
read grants. Before/after forward migration JSON manifests are byte-identical:

`d9195bda2befe200d3c76c6f2b0385f035aa46224f72f18ba8a932456c1bd461` (SHA-256, both).

Compared: old Member rows/IDs/status/role, old role/status constraints, all public
financial FK definitions, `trip_members`, Member grants/policies/existing triggers,
Expense aggregates/participants/splits/valuations, currency, Personal Payment
Member links/read grants, representative Settlement source/digest/result and
Review personal financial source. PostgreSQL OIDs and the new columns/guard are
excluded from this unchanged-data comparison.

The new SQL suite separately compares Settlement/Review source JSON, Expense rows,
Personal Payment/read grants and currency revision before/after inactive fixture
state and ordinary write attempts. TS test D preserves financial row identities
and complete Ledger Member reads after passive inactive hydration. Existing
Settlement, Expense, Personal Payment, Adjustment/correction, Review and FX suites
pass. No lifecycle predicate is introduced into financial selection or validity.

## J. Local migration replay

Disposable project: `otr-trip-i2a-rerun`, PostgreSQL 17, separate ports 55420–55426,
under `/Users/xoery/.codex/visualizations/2026/10/03/01a10025-8c3f-7a22-b6ef-a98ef47c6e27/trip-i2a-rerun`.
The existing project/container was not reset or queried. The disposable project
was stopped with `--no-backup` after validation; its containers/DB volume were
removed, while temporary evidence logs remain.

Forward migration preserves the safety manifest above. Two fresh resets replay
all 65 migrations; each final native SQL run passes 34 files / 705 assertions.
Both generated manifests are byte-identical and match updated committed artifacts.
The native `db diff --local --schema public` finds no changes.

Final counts: 107 tables/RLS tables, 1,490 columns, 825 constraints, 349 indexes,
142 functions, 115 triggers, 178 policies, three buckets. Checksum:
`539a75d3cc0d4dc8f7729132f2918a973c80eba8fcbb54b2c1577c01c9d11f89`.

The repo validator's reset/test/compare/diff/artifact gates were executed explicitly
against this isolated workdir; `validate-local.sh` was not run against the primary
project. Only the explained additive delta updates the manifest, independent
verifier counts/checksum and RLS column-count assertion. Negative count/checksum
drift tests still pass; no guard relaxation.

## K. Automated validation

Evidence logs remain locally in `/private/tmp/otr-trip-i2a-rerun-evidence`.
Temporary evidence is not a committed artifact or long-term review dependency;
checked-in tests and migrations reproduce the assertions.

| Gate                                                   | Result                                    |
| ------------------------------------------------------ | ----------------------------------------- |
| Clean HEAD + baseline manifest comparison              | PASS                                      |
| Baseline TripPerson/account/auth/bootstrap/read tests  | PASS, four files / 27 tests               |
| Relevant TS regression command below                   | PASS, 42 files / 354 tests                |
| New local SQL protection suite                         | PASS, 47 assertions                       |
| Native full SQL tests after reset 1 and reset 2        | PASS, 34 files / 705 assertions each      |
| Forward migration identity/financial safety manifest   | PASS, non-empty fixture and equal SHA-256 |
| Reset manifest byte comparison + committed comparison  | PASS                                      |
| Local public schema diff                               | PASS, no schema changes                   |
| Strict artifact verifier and drift-rejection Node test | PASS                                      |
| TypeScript, scoped lint (zero warnings), UI guard      | PASS                                      |
| Changed-file Prettier and whitespace checks            | PASS                                      |

Exact local commands (absolute disposable workdir is abbreviated by a task variable):

```bash
trip_i2a_root=/Users/xoery/.codex/visualizations/2026/10/03/01a10025-8c3f-7a22-b6ef-a98ef47c6e27/trip-i2a-rerun
trip_i2a_evidence=/private/tmp/otr-trip-i2a-rerun-evidence
./node_modules/.bin/supabase start --workdir "$trip_i2a_root" -x gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
# Baseline capture occurs before adding the new migration to the disposable copy.
docker exec -i supabase_db_otr-trip-i2a-rerun psql -X -qAt -U postgres -d postgres < supabase/schema_manifest.sql > "$trip_i2a_evidence/baseline-manifest.json"
node scripts/supabase/compare-manifests.mjs supabase/schema-manifest.json "$trip_i2a_evidence/baseline-manifest.json"
# Local fixture, before/after source manifest and forward migration.
docker exec -i supabase_db_otr-trip-i2a-rerun psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$trip_i2a_evidence/safety-fixture.sql"
docker exec -i supabase_db_otr-trip-i2a-rerun psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$trip_i2a_evidence/safety-manifest.sql" > "$trip_i2a_evidence/safety-before.json"
docker exec -i supabase_db_otr-trip-i2a-rerun psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/migrations/20261003000100_trip_person_participation.sql
docker exec -i supabase_db_otr-trip-i2a-rerun psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$trip_i2a_evidence/safety-manifest.sql" > "$trip_i2a_evidence/safety-after.json"
cmp "$trip_i2a_evidence/safety-before.json" "$trip_i2a_evidence/safety-after.json"
# Executed twice, retaining reset-1/reset-2 manifests and native test logs.
./node_modules/.bin/supabase db reset --local --workdir "$trip_i2a_root"
docker exec -i supabase_db_otr-trip-i2a-rerun psql -X -qAt -U postgres -d postgres < supabase/schema_manifest.sql
./node_modules/.bin/supabase test db --workdir "$trip_i2a_root"
cmp "$trip_i2a_evidence/reset-1-manifest.json" "$trip_i2a_evidence/reset-2-manifest.json"
node scripts/supabase/compare-manifests.mjs supabase/schema-manifest.json "$trip_i2a_evidence/reset-2-manifest.json"
./node_modules/.bin/supabase db diff --local --schema public --workdir "$trip_i2a_root"
node --test scripts/supabase/verify-baseline-artifacts.test.mjs
node scripts/supabase/verify-baseline-artifacts.mjs
./node_modules/.bin/supabase stop --workdir "$trip_i2a_root" --no-backup
npm run typecheck
npm run ui:guard
./node_modules/.bin/eslint backend/src/supabaseGateway.ts backend/src/tripPersonBootstrap.test.ts scripts/supabase/verify-baseline-artifacts.mjs src/data/api/ledgerReadContracts.ts src/data/db/database.test.ts src/data/db/migrations.ts src/data/repositories/ledgerReadRepository.ts src/data/repositories/tripPersonRepository.test.ts src/data/repositories/tripPersonRepository.ts src/domain/trip/person.ts --max-warnings 0
./node_modules/.bin/prettier --check backend/src/supabaseGateway.ts backend/src/tripPersonBootstrap.test.ts scripts/supabase/verify-baseline-artifacts.mjs src/data/api/ledgerReadContracts.ts src/data/db/database.test.ts src/data/db/migrations.ts src/data/repositories/ledgerReadRepository.ts src/data/repositories/tripPersonRepository.test.ts src/data/repositories/tripPersonRepository.ts src/domain/trip/person.ts supabase/schema-manifest.json docs/ARCHITECTURE.md docs/CURRENT_IMPLEMENTATION_STATE.md docs/backend/CANONICAL_SUPABASE_BASELINE.md docs/architecture/TRIP_CANONICAL_A1_I2A_REPORT.md
git diff --check
# For each new file, --no-index --check against /dev/null returned no errors.
```

Exact final TS regression:

```bash
npm test -- src/data/repositories/tripPersonRepository.test.ts src/data/db/database.test.ts src/data/auth/accountSwitchFoundation.test.ts src/data/auth/accountSwitchCoordinator.test.ts src/data/auth/authRepository.test.ts src/data/auth/accountLocalState.test.ts src/data/bootstrap/bootstrapApplication.test.ts src/data/repositories/ledgerReadRepository.test.ts src/data/repositories/ledgerReadRepository.convergence.test.ts src/data/repositories/ledgerExpenseRepository.test.ts src/data/repositories/ledgerExpenseCausality.test.ts src/data/repositories/ledgerExpenseRetry.test.ts src/data/repositories/ledgerSettlementRepository.test.ts src/data/repositories/ledgerPersonalPaymentRepository.test.ts src/data/repositories/ledgerReviewRepository.test.ts src/data/repositories/ledgerReviewPersonal.test.ts src/data/repositories/personalSettlementReviewRepository.test.ts src/data/repositories/ledgerFxSnapshotRepository.test.ts src/data/repositories/ledgerCurrencyRepository.test.ts src/domain/ledger/settlementStage7.test.ts src/domain/ledger/settlementAdjustment.test.ts src/domain/ledger/settlementCorrection.test.ts src/domain/ledger/personalSettlementReview.test.ts src/domain/ledger/review.test.ts src/domain/ledger/reviewV2.test.ts src/domain/ledger/paymentLifecycle.test.ts src/domain/ledger/ledger.test.ts src/data/sync/syncEngine.test.ts src/data/sync/ledgerExpenseSyncWorker.test.ts src/data/sync/ledgerPersonalPaymentSyncWorker.test.ts src/data/sync/ledgerPersonalPaymentCoordinator.test.ts src/data/sync/ledgerSettlementCoordinator.test.ts src/data/sync/ledgerReportingCoordinator.test.ts src/data/sync/ledgerFxSnapshotCoordinator.test.ts src/data/sync/ledgerOperationalSync.test.ts backend/src/tripPersonBootstrap.test.ts backend/src/supabaseGateway.test.ts backend/src/ledgerBootstrapPagination.test.ts backend/src/ledgerCursor.test.ts backend/src/settlementCurrentSource.test.ts backend/src/reviewV2Gateway.test.ts backend/src/app.test.ts
```

Failures encountered and resolved:

- Initial test fixtures referenced the generated owner Member by an assumed ID,
  omitted ledger settings/economic date, or returned an invalid Review mock shape.
  Corrected fixtures resolve the real owner ID, provide required synthetic financial
  rows/date, and return the real projection object. Failed SQL fixture transactions
  rolled back. Empty early comparisons and incorrectly shaped mocks are not PASS
  evidence; the final non-empty comparison and complete fixtures were rerun.
- Refined Zod schema cannot use the old test's `.omit()` construction; compatibility
  test uses the prior unrefined shape with its original non-strict parsing behavior.
- First full SQL run failed only the old `rls_matrix` column-count expectation
  (1,488 vs new 1,490). Updated the explicit expectation; permission assertions
  were unchanged. Both final full runs pass.
- These are test setup/count corrections, not SPEC deviations or guard weakening.

## L. Known limitations

Passive bootstrap can observe participation; it does not guarantee fresh state
across devices. No lifecycle cursor/fingerprint, Trip revision, delta, polling,
invalidation or command convergence exists; I2B remains separate and unapproved.
No ACTIVE/INACTIVE mutation is enabled; I2C remains separate and unapproved.
No receipt/audit schema, API, queue, UI or filtering is provided.

`null` remains valid for an upgraded cache or old backend response. Backend must
use the new server schema to emit the new pair. Rollback/deployment sequencing,
Hosted Dev role availability and device acceptance were not exercised. Reserved
role privilege drift fails local migration checks but remote administration is not
certified by this local proof. Human and independent review remain required.
No deviations from the accepted SPEC; closed private execution is intentional I2A
scope, and the new clean HEAD is owner-authorized.

## M. Acceptance matrix

| Criterion                                           | Evidence                                            | Result |
| --------------------------------------------------- | --------------------------------------------------- | ------ |
| Server participation_active implemented exactly     | Migration + SQL type/null/default insertion tests   | PASS   |
| Server participation_revision implemented exactly   | Migration + SQL bigint/null/bounds tests            | PASS   |
| Existing server Persons baseline true/0             | Forward migration and seed SQL check                | PASS   |
| New server Persons default true/0                   | Ordinary/explicit/new invite insertion SQL          | PASS   |
| Revision range enforced                             | SQL and SQLite invalid bounds                       | PASS   |
| Ordinary updates preserve lifecycle                 | Authenticated/service SQL                           | PASS   |
| Claim/link preserves lifecycle                      | Real explicit claim, invite, auto-claim SQL         | PASS   |
| Old upserts preserve lifecycle                      | Omitted/default and stale pair SQL                  | PASS   |
| Service-role ordinary writes cannot alter lifecycle | Direct field and upsert SQL                         | PASS   |
| Private writer protection works locally             | Role attrs/grants/membership and SET ROLE rejection | PASS   |
| No product lifecycle command exists                 | Source diff; private branch closed                  | PASS   |
| No receipt/audit table created yet                  | Tables unchanged; migration/source scope            | PASS   |
| Local nullable lifecycle pair added                 | Migration 42 + SQLite upgrade                       | PASS   |
| Existing local rows remain unobserved NULL/NULL     | Real upgrade old-row comparison                     | PASS   |
| Pair validation enforced                            | SQLite constraints and parser/hydration tests       | PASS   |
| Member REPLACE lifecycle-loss risk removed          | Preserving conflict UPDATE + identity tests         | PASS   |
| Missing wire pair preserves known observation       | Old bootstrap after false/7                         | PASS   |
| Greater revision replaces                           | Monotonic/ABA test                                  | PASS   |
| Lower revision preserves                            | Stale response test                                 | PASS   |
| Equal/opposite revision rejected                    | Atomic rollback test                                | PASS   |
| Bootstrap paired DTO backward-compatible            | Old DTO and old parser tests                        | PASS   |
| TripPerson observation object/null                  | Repository tests                                    | PASS   |
| listTripPersons remains complete                    | Active/inactive/duplicate-name tests                | PASS   |
| No active filtering added                           | SQL queries/diff and complete lists                 | PASS   |
| No Member ID changed                                | Before/after manifest + TS financial IDs            | PASS   |
| status/role semantics unchanged                     | Old constraints/rows + actual ordinary update SQL   | PASS   |
| trip_members unchanged                              | Before/after manifest                               | PASS   |
| No permission redesign                              | Existing grants/policies + full RLS regression      | PASS   |
| Financial fingerprints/results unchanged            | Non-empty migration manifest + SQL/TS regressions   | PASS   |
| Account isolation tests pass                        | TripPerson + foundation/coordinator suites          | PASS   |
| Offline repository contract passes                  | Actual file reopen + expired cached session         | PASS   |
| Local server migration replay passes                | Two 65-migration resets + identical manifests       | PASS   |
| Relevant SQL regressions pass                       | 34 files / 705 assertions per final run             | PASS   |
| Relevant TS regressions pass                        | 42 files / 354 tests                                | PASS   |
| No I2B sync mechanism implemented                   | Source diff; existing sync unchanged                | PASS   |
| No Hosted Dev deployment                            | Only disposable local commands                      | PASS   |
| No Production access                                | Local-only container/CLI; gateway fetch mocks       | PASS   |
| Documentation/report complete                       | This report and narrow canonical updates            | PASS   |

Acceptance summary: **38 PASS / 0 PENDING / 0 BLOCKED** for the implementation
contract. Human and independent reviewer gates are **PENDING**; this is not a
combined reviewed approval or permission to start the next phase.

## N. Git status

No commit. Changed file inventory:

- `supabase/migrations/20261003000100_trip_person_participation.sql` (new)
- `supabase/tests/trip_person_participation.test.sql` (new)
- `supabase/tests/rls_matrix.test.sql`
- `supabase/schema-manifest.json`
- `scripts/supabase/verify-baseline-artifacts.mjs`
- `src/data/db/migrations.ts`
- `src/data/db/database.test.ts`
- `src/data/api/ledgerReadContracts.ts`
- `src/data/repositories/ledgerReadRepository.ts`
- `src/data/repositories/tripPersonRepository.ts`
- `src/data/repositories/tripPersonRepository.test.ts`
- `src/domain/trip/person.ts`
- `backend/src/supabaseGateway.ts`
- `backend/src/tripPersonBootstrap.test.ts` (new)
- `docs/ARCHITECTURE.md`
- `docs/CURRENT_IMPLEMENTATION_STATE.md`
- `docs/backend/CANONICAL_SUPABASE_BASELINE.md`
- `docs/architecture/TRIP_CANONICAL_A1_I2A_REPORT.md`

Changed files are the server/SQLite migration, passive DTO/backend/read
projection and tests, explicit schema manifest/verifier/RLS count updates, this
report, architecture/current-state and canonical local baseline documentation.
Accepted SPEC, historical migrations, permission functions/policies, financial
algorithms, queue/cursor and UI remain unchanged.

Production accessed: **NO**. Hosted Dev accessed/mutated: **NO**.
Deployment performed: **NO**. Lifecycle command implemented: **NO**.

**STOP — human + independent review pending; do not start I2B/I2C.**
