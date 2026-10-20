# A1-I2C2 — Protected SET_PARTICIPATION command foundation

Status: **A1-I2C2 SQLITE VERSION CORRECTION COMPLETE — REVIEW PENDING**.
Lifecycle runtime activation: **CLOSED**. Date: 2026-10-04.

## Focused SQLite version correction

SQLite migration 45 reserved for A1-I2C2;
migration 44 belongs to accepted B-T3F after integration.

Only A's migration ID changed from 44 to 45. Its SQL body and registration position
are unchanged. No B implementation or empty migration 44 was copied/created in A.
The existing runner checks applied IDs individually and permits a registration gap;
when integrated, B44 precedes A45. No runner change or integration constraint is required.

Two persistent tests verify an already-recorded integration-owned 44 is preserved
while A45 executes once, and real SQLite v43→45 upgrade/restart across the current
registration gap retains receipts and immutability. A separate temporary integration
check reads the real B44 SQL from accepted commit `b7ca2b8`, applies it outside A,
populates an Event, then runs the unchanged A runner and reopens the database.
Both B mirror tables, their schema/data and version44 ledger entry remain identical;
A45/receipt persistence succeeds. B code remains outside this worktree.

Correction validation: 15 files / 264 tests PASS, including 27 migration/result tests;
typecheck, full `npm run lint`, targeted ESLint, backend build and UI guard PASS.
Temporary evidence:
`/private/tmp/otr-ai2c2-version-correction/`. Full server suites were not rerun for
this local correction: server 00600 remains byte-identical to the pre-correction
snapshot (SHA-256
`c347362be54875b951b2f1bdc51c2c1869cce4af644b2740b2d2c8584665752f`).
Original server evidence below still applies.

- A local migration version: **45**
- migration body semantic change: **NO** (SQL body byte-identical)
- server 00600 changed: **NO**
- SET_PARTICIPATION enabled: **NO**
- lifecycle gate open: **NO**
- Production/Hosted Dev: **NO**
- commit: **NO**

## Scope and baseline

Started from a clean `/Users/xoery/Project/otr-mobile-canonical`, branch
`integration/ledger-polish-canonical`, exact HEAD
`edd41a41ff00a163e78434cdc754a65fcd8e2577`. HEAD remains unchanged.
The accepted A1-I2C1 contract and I2A/I2B complete-vector protocol remain authoritative.
Organizer means the Actor's current linked `journey_members` row has `role=owner`;
this includes the organizer changing self. Participation never supplies authority
or removes collaboration access.

No UI, self leave/rejoin, link/claim/remove-member, Event participant mutation,
new scheduler, normal command queue authoring/dispatch, backend route, deployment
or runtime connector was introduced. The Backend addition is a pure strict intent
codec, reusing the existing raw JSON parser. A future authenticated transport must
derive Actor from authenticated Account and pass it through the dedicated gateway;
caller-supplied Actor/JWT/GUC cannot substitute for that future authentication seam.

## Server foundation

`20261004000600_trip_person_command_foundation.sql` adds two tables:
`trip_person_command_gate` and `trip_person_participation_receipts`. The singleton
gate is false with an enforced `CHECK (not enabled)`. There is no activation setter
or Member DML/locking grant in the installed foundation. Fresh closed execution
consumes no idempotency key or receipt; authorized exact historic lookup is read-only.

`trip_person_set_participation(uuid,text)` uses exact Actor/operation intent SHA-256,
per-key advisory serialization, current linked-owner admission, deterministic Member
row locking, expected Boolean plus safe-integer revision CAS, and a shared activation
fence. Fresh semantic execution requires READ COMMITTED; RR/SERIALIZABLE fail closed.
A real flip increments revision exactly once. Stale revision returns a durable
REVISION_CONFLICT even when desired state already matches; exact-base same-value is
UNCHANGED. Changed intent under an existing Actor/key rejects. Exact replay returns
the immutable historic UTC result after later changes/ABA or gate closure.

Receipts bind version/key/Actor/Trip/target/expected/desired/intent/outcome/prior/result/
UTC committed_at/result digest. Their unique Actor/key spans Trips. They have no
cascading parent foreign key. Mutation and receipt commit atomically. A conditional,
deferred Member constraint trigger requires exact same-transaction APPLIED evidence;
its WHEN predicate avoids pending evidence events for ordinary unchanged lifecycle
updates. The command defers this named guard even if its caller chose immediate
constraints. A failed receipt insertion rolls back the Member flip. Receipt statement
guards reject UPDATE/DELETE/TRUNCATE, including zero-row UPDATE/DELETE.

Reserved identities are NOLOGIN/no broad privilege/no credentials. The writer owns
only the fixed command; the receipt reader owns exact owner admission and historic
lookup; the gateway owns nothing and executes only the fixed command/lookup.
Pre-install and final `pg_shdepend` inventories cover every ownership class and
allow only exact database/schema/signature identities. Effective direct/PUBLIC/
inherited EXECUTE, schema CREATE, live-column/table/sequence ACL and explicit default
ACL are checked. Polluted state rejects transactionally without sanitation.
Definers have fixed pg_catalog search_path and qualified references. service_role,
SET ROLE, spoofed JWT/GUC and booleans do not confer semantic authority.

Semantic tests open a rollback-only trusted fixture with narrowly temporary grants.
The actual command and evidence guards remain enabled. The runnable test script is
bound to the dedicated disposable container, with no remote URL or runtime override.

## Local result and certificate boundary

SQLite v45 adds the small immutable Account/operation result table. It reuses the
existing `sync_operations` intent/key/status; no durable queue redesign or dispatcher
is installed. `applyParticipationResult` validates exact intent/result digest and
Account/Trip/Person/Actor/key/queue ownership before applying. Under the existing
Account apply gate, one SQLite transaction retains the immutable receipt, advances
only an older target pair, rejects equal-revision contradictory observations,
reconciles queue status, and clears all seven participation certificate fields on
existing cursors for this Trip. Historic results never regress newer local rows;
exact duplicate consumption does not invalidate a newer certificate again.

The financial shared checkpoint/server time, private payment cursor, finance data
and cached collaboration admission remain unchanged. A single result cannot create
a complete roster/fingerprint certificate. The central reporting cycle drains a
pre-command in-flight read before applying the result, releases the Account apply
gate, then performs bounded fresh convergence. It rechecks Account/Trip/generation
through commit and refresh; there is no network while the apply gate is held.
Offline refresh failure leaves the accepted result and cached access intact with
an invalid certificate, recoverable by existing reporting/wake convergence.

## Exact changed files

| Area                                   | Files                                                                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server                                 | `supabase/migrations/20261004000600_trip_person_command_foundation.sql`                                                                                        |
| Contract/codec                         | `src/domain/trip/personParticipationCommand.ts`; `backend/src/tripPersonParticipationIntent.ts`                                                                |
| Local persistence                      | `src/data/db/migrations.ts`; `src/data/db/database.test.ts`; `src/data/repositories/ledgerReadRepository.ts`; `src/data/repositories/tripPersonCertificate.ts` |
| Existing reporting owner               | `src/data/sync/ledgerReportingCoordinator.ts`                                                                                                                  |
| Local tests                            | `src/data/repositories/tripPersonParticipationResult.test.ts`                                                                                                  |
| SQL/security/codec/races/forward tests | `supabase/tests/trip_person_command_foundation.test.sql`; `scripts/supabase/trip-person-command-foundation.test.mjs`                                           |
| Existing fixture/count updates         | `supabase/tests/trip_person_participation.test.sql`; `supabase/tests/trip_person_snapshot_read.test.sql`; `supabase/tests/rls_matrix.test.sql`                 |
| Manifest/verifier                      | `supabase/schema-manifest.json`; `scripts/supabase/verify-baseline-artifacts.mjs`                                                                              |
| Documentation                          | `docs/DATA_MODEL.md`; `docs/CURRENT_IMPLEMENTATION_STATE.md`; this report                                                                                      |

Old I2A test fixtures explicitly suspend/restore the new evidence trigger only during
trusted seed setup; their ordinary access, invite/claim/upsert assertions remain.
No historical migration or seed bytes changed. No new dependencies were added.

## Validation

All database execution used disposable project `otr-trip-ai2c2` (583xx local ports),
separate from the user's existing canonical local stack. The disposable stack was
stopped without backup after final closed-state checks. No Hosted Dev or Production
was contacted. Evidence logs are local under `/private/tmp/otr-ai2c2/evidence/`.

| Check                                     | Final result                                                                                                                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two clean full-chain replays              | 71 unique migrations each; 40 SQL files / 1,391 assertions each PASS                                                                                                                                                    |
| Manifest determinism/comparator           | Two manifests identical and match repository expected signature                                                                                                                                                         |
| public/storage diff, both replays         | No schema changes                                                                                                                                                                                                       |
| Final reserved-role adversarial suite     | 111 Node tests PASS, including pre/final wrong-schema/overload and non-routine ownership                                                                                                                                |
| Independent Node/Backend/PostgreSQL codec | PASS; valid Unicode/control/exact integers and UTC/timezone result bytes; malformed duplicate/unknown keys/numeric lexemes/U0000/surrogates reject                                                                      |
| Real connection races/fence               | PASS; competing CAS one APPLIED/one conflict; same-key first/replay; ABA historic; RR/SERIALIZABLE rejection; observed blocked advisory waiter sees gate closure without mutation/key consumption                       |
| Populated forward migration               | 116 old tables, 24 nonempty; identical row data, old table/column/constraint/index/trigger facts, ACLs/policies, old routines and storage buckets, except explicit additive A capabilities and replaced lifecycle guard |
| Historical migration bytes                | All 70 byte-identical to edd41a4; aggregate path/content SHA256 `f3ed53ab2c4fac6fa0ea4803a3da2b81551c8cb9a01c62525ce82c477bceaf15`                                                                                      |
| TypeScript relevant regression            | 15 files / 262 tests PASS, including 11 real SQLite/result/reporting seam tests                                                                                                                                         |
| Verifier and existing drift negatives     | PASS; count and same-count checksum drift rejected by verifier and comparator                                                                                                                                           |
| Typecheck / targeted ESLint               | PASS, no targeted warnings/errors                                                                                                                                                                                       |
| Backend build / UI guard                  | PASS; no user-facing UI/copy change                                                                                                                                                                                     |

Final manifest: 118 tables / RLS tables, 4 buckets, 1,772 columns, 369 indexes,
199 policies, 144 triggers, 209 functions, 1,024 constraints. Checksum:
`82f91a57ae39c5ed5f04a752c26c5e2d791b711cbe4dd07e536ed67044c32bdb`.

Local tests cover atomic receipt/row/queue/all-seven invalidation, real financial
and private cursor preservation, durable conflict observation, duplicate after
newer certification, monotonic older result, equal/opposite rollback, injected
invalidation failure rollback, result/queue ownership mismatch, A→B→A, Account
transition held behind COMMIT, older in-flight bootstrap followed by fresh certified
convergence, and offline refresh failure. Existing SQL regressions retain Ledger,
legacy access, B Event and C Source behavior.

Runnable isolated modes from canonical: `node scripts/supabase/trip-person-command-foundation.test.mjs {reuse|sql|forward|concurrency}`; codec uses `node --import tsx`.
`reuse`/`forward` require the copied 70-version baseline; `sql`/`codec`/`concurrency`
require the final 71-version schema. Full replay uses a temporary Supabase config,
`supabase db reset --local`, the existing `schema_manifest.sql`, SQL mode and
`supabase db diff --local --schema public,storage`; it must never reset the user's
existing canonical project as part of reproducing this isolated evidence.

## Remaining review and boundaries

Independent review, future runtime authentication/activation/transport/queue
entry, and physical-device convergence acceptance remain pending. They are outside
this closed foundation. No implementation blocker remains within this slice.

Both sibling worktrees were clean at startup at edd41a4. End inspection observed
unrelated uncommitted B-T3F work in temporal and C-I3E work in import; both HEADs
still edd41a4. This task performed only read-only status/HEAD inspections there,
made no sibling edits, and did not restore, stage or commit their external work.
The next combined integration must reconcile parallel changes independently.

- SET_PARTICIPATION enabled: **NO**
- lifecycle gate open: **NO**
- self-service leave/rejoin: **NO**
- Event participant command: **NO**
- runtime credentials: **NO**
- Production/Hosted Dev: **NO**
- sibling modifications by this task: **NO** (external work observed as above)
- commit: **NO**
