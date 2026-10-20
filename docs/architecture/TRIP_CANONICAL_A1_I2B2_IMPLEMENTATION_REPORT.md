# Trip Canonical A1-I2B2 implementation report

Date: 2026-10-04  
Status: **A1-I2B2 P1 CORRECTION #2 COMPLETE — REVIEW PENDING**

## Baseline and scope

- Worktree: `/Users/xoery/Project/otr-mobile-canonical`.
- Branch: `integration/ledger-polish-canonical`.
- Verified clean starting HEAD: `f196f9840d49d7184cbba121ad80c8e6ed82e707`.
  Startup path, branch, status and recent history passed before edits.
- Authority: [A1-I2B1 snapshot/cursor contract](TRIP_CANONICAL_A1_I2B1_SNAPSHOT_CURSOR_CONTRACT.md).
  The attached I2B2 instruction authorizes implementation and local validation only.
- No commit, remote deployment, lifecycle command, new Person table, Member feed,
  Trip counter, UI feature or Track B/C contract change.

## Changed files

| Area                   | Files                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared pure protocol   | `src/domain/trip/participationSnapshot.ts`, `.test.ts`                                                                                                                     |
| Backend                | `backend/src/supabaseGateway.ts`, `tripPersonBootstrap.test.ts`                                                                                                            |
| Server migration/tests | `supabase/migrations/20261004000200_trip_person_snapshot_read.sql`, `supabase/tests/trip_person_snapshot_read.test.sql`                                                    |
| Schema artifacts       | `supabase/schema-manifest.json`, `scripts/supabase/verify-baseline-artifacts.mjs`                                                                                          |
| API/transport          | `src/data/api/ledgerReadContracts.ts`, `authenticatedClient.ts`, `authenticatedClient.test.ts`, `src/data/sync/ledgerReadTransport.ts`, `.test.ts`                         |
| Account boundary       | `src/data/auth/accountRequestContext.ts`, `accountSwitchCoordinator.ts`, `.test.ts`                                                                                        |
| Local persistence      | `src/data/db/migrations.ts`, `database.test.ts`, `src/data/repositories/ledgerReadRepository.ts`, `tripPersonCertificate.ts`, `.test.ts`, `ledgerExpenseCausality.test.ts` |
| Refresh owner          | `src/data/sync/ledgerReportingCoordinator.ts`, `.test.ts`                                                                                                                  |
| Documentation          | This report, `docs/CURRENT_IMPLEMENTATION_STATE.md`, `docs/ARCHITECTURE.md`, `docs/API_CONTRACT.md`, `docs/OFFLINE_SYNC.md`                                                |

No dependency additions. The existing Expo Crypto dependency computes Mobile SHA-256;
backend uses Node Crypto. Domain serialization/cursor code has no native dependency.
The existing causality test now triggers its account change on the preserving
`INSERT ... ON CONFLICT` statement, retaining all original rollback assertions.

## Complete server snapshot and coherence

`public.read_trip_person_snapshot_v1(uuid)` is a stable, security-invoker SQL
function with fixed `pg_catalog` search path and qualified table reference.
Execution is revoked from PUBLIC/anon/authenticated and granted only to
service_role, behind existing backend Trip admission. One aggregate statement
returns the entire current roster, count and six-digit UTC statement observation
as one JSON result. PostgREST row caps cannot truncate its embedded Member array.
Resource, database, malformed or interrupted-body failures yield no usable certificate.

The SQL aggregate preserves existing display-name ordering. Fingerprint sorting
uses an independent copy; `members[]` is never sorted by ID. Inactive, unlinked,
invite-pending, owner and guest rows are not filtered. Raw `user_id` is used only
for existing actor resolution and is not included in the Member DTO or hash.
Native and backend fixtures verify a 1,203-person roster above ordinary row caps.

Each bootstrap reads V0, then M plus existing aggregates, then V1. All three hashes
and existing sequence/settings checks must agree. There are at most three attempts;
exhaustion returns 503 `PARTICIPATION_SNAPSHOT_UNSTABLE`. Malformed snapshot data
returns 500 `PARTICIPATION_SNAPSHOT_INVALID` without a churn retry. Envelope time
comes from V1. Empty financial sequence still issues a real non-null v2 cursor.

## Fingerprint and shared cursor

The serializer emits exactly `otr-trip-participation-v1\n` followed by compact
JSON tuples of lowercase canonical Person UUID, Boolean and decimal revision
string. It sorts only this participation vector by ordinal Person ID. Six literal
I2B1 digests and byte lengths pass, including empty and maximum-safe revision.
Duplicate IDs after normalization, malformed IDs, missing/null/partial pairs,
non-Boolean active and negative/fractional/unsafe revisions fail closed.

Shared cursor v2 has the exact eight keys, canonical compact JSON and unpadded
base64url. Decode requires re-encoding equality, safe nonnegative sequence,
matching Account/Trip, purpose and versions, with the 1,024-character ASCII limit.
Padded tokens, noncanonical JSON, duplicate/extra keys, wrong scopes/purpose/version
and negative zero are rejected. Private-payment `encodeLedgerCursor` /
`decodeLedgerCursor` v1 helpers and their callers remain unchanged.

Every authorized shared pull, including empty/final/continuation pages, reads the
complete current vector before the financial page. Mismatch returns `INVALID_CURSOR`
before financial reads/checkpoint advancement. Matching output retains the token's
original fingerprint and advances only the financial sequence; verification carries
that hash and the current statement observation time. New Person, missing Person
and ABA drift tests reject before page reads. A continuation test preserves page 1
and rejects drift before page 2.

## Local certificate and atomic application

SQLite migration 43 extends existing Account/Trip `ledger_sync_cursors` with
exactly the seven I2B1 fields. Existing scoped and null-user rows upgrade to all-null
metadata without inferred freshness. The SQLite CHECK requires all-null or a
complete typed/versioned metadata shape and forbids certifying null-user rows.
Repository validation supplies canonical unique sorted UUID-set, exact compact
JSON, real timestamp, cursor/scope and digest semantics; invalid stored metadata
is never returned as a valid certificate.

Bootstrap validates envelope, actor/request/Trip bindings, count, pairs and hash.
The existing transaction hydrates Journey, Members and financial aggregates,
retains historical Persons, merges participation monotonically, writes actor state,
then preserves/upserts cursor and saves the certificate. A certified older incoming
revision or equal/opposite Boolean rolls back. Hash is recomputed over exactly
received IDs and resulting cached pairs; historical extra rows are excluded.

A certified page requires the same request cursor, active cursor equal to bound
cursor, and a valid certificate recomputed inside the transaction. Financial rows,
new cursor, bound cursor and verified time commit together. Full-snapshot observed
time and ID set remain unchanged. Cursor-save/commit failures roll back both
bootstrap and page; file-backed SQLite reopen verifies committed durability and
rollback of an uncommitted verification-time change. Success is returned after commit.

## Account fence, rollout and recovery

An immutable `{accountId, tripId, generation}` is captured before credentials or
network. Checks follow session resolution, precede every initial/retry request,
follow typed response parsing and run at transaction start and immediately before
commit. The credential provider is pinned to the captured Account from its first
call. Delayed A→B and A→B→A responses and 401 refresh transitions are rejected.

The narrow FIFO apply gate covers DB transaction commit/rollback, not network.
Account transition marks requests inadmissible, waits for this gate, advances
generation and then changes session. The old apply cannot cross that transition;
new Account bootstrap starts after its session/adoption boundary. A deterministic
paused-DB test proves rollback and transition serialization. This is a process-wide
Account boundary, matching the single active Account model.

Central shared refresh cycles serialize the same generation/Trip; concurrent pulls
coalesce through existing ownership. Server v1 rejection or missing/stale local
certificate takes one recovery bootstrap. A failure after that bootstrap exits the
cycle; no recursion, new timer or unbounded retry. Bootstrap itself remains bounded
by three coherence attempts. An entirely absent participation envelope is the
explicit old-backend path: known Member observations and certificate metadata are
preserved, but no new certificate/verification time is asserted. A changed legacy
active cursor cannot validate an old bound certificate. Present invalid envelopes
never fall back to legacy. A full old-backend/device rollout remains I2B3 acceptance.

## Independent-review P1 correction — Account recovery fence

Independent review found that `finish()` correctly ended the forward transition
before bootstrap/restart, but `recover()` then restored the previous Account outside
the shared gate without another generation advance. A B transaction could pass its
final context check, pause before COMMIT, and commit after recovery made A current.
The initial implementation's recovery path therefore did not satisfy COMMIT isolation.

The correction changes only these six files:

- `src/data/auth/accountRequestContext.ts`
- `src/data/auth/accountRequestContext.test.ts` (new)
- `src/data/auth/accountSwitchCoordinator.ts`
- `src/data/auth/accountSwitchCoordinator.test.ts`
- `src/data/repositories/tripPersonCertificate.test.ts`
- `docs/architecture/TRIP_CANONICAL_A1_I2B2_IMPLEMENTATION_REPORT.md`

The first correction made `beginAccountTransition` accept an optional local-state
installation callback. It advanced generation and awaited that callback inside the
same `withAccountApplyGate` used by repository transactions. There is no second lock.
In that initial correction, both entry points used `recover()` to close any
still-open failed forward transition, reacquire the canonical transition, advance
generation again, restore the previous local Account/session and clear in-memory
state under the gate. A failed selection is rejected; an originally signed-out
session is restored by clearing the target session. End the transition before
post-recovery bootstrap/restart. No network/bootstrap/restart wait holds the gate.
Successful normal switching remains unchanged.

Recovery pending behind B's admitted apply does not make A visible. B may complete
its already-admitted transaction before recovery advances generation/restores A, or
roll back if an existing check fails. Once recovery becomes visible, delayed B and
pre-switch A contexts fail even though A is current again. Recovery-install failure
still consumes the newer generation, releases the gate and cannot resurrect either
stale context; existing activation-error propagation is preserved.

Deterministic migrated-SQLite regression tests cover both coordinator entry points
and both bootstrap/restart failure triggers. They pause B after the repository's
final request-context validation and immediately before SQLite COMMIT, start
recovery, prove Account/session and generation remain B while blocked, release the
transaction, and prove B COMMIT precedes restoration of A. Recovery then bootstraps
A's actual actor/certificate/cursor projection. Additional tests recover first and
reject delayed B apply without any B actor/cursor/certificate writes, reject the old
A response after A→B→A, exercise recovery installation failure and signed-out
recovery, and acquire the shared gate from bootstrap/restart to prove network work
runs outside it. All earlier account-race tests are retained.

P1 validation evidence is in `/private/tmp/otr-i2b2-evidence/p1-*.log`:

- Account request-context/coordinator and certificate races: **3 files / 39 tests PASS**.
- Complete focused I2B2 suite plus request-context and session-refresh tests:
  **12 files / 172 tests PASS** (`p1-focused-final.log`). Includes authenticated
  credential retry, typed transport response fence, reporting recovery, migration
  tests, private v1 codec and Expense causality regressions.
- Typecheck, backend build, scoped zero-warning ESLint, changed-file Prettier and
  whitespace checks PASS.
- No SQL/migration/schema/protocol changes and no SQL or remote validation rerun.
  The prior full-repository baseline architecture-boundary failure remains recorded
  below; this correction does not claim FULL PASS.

Status: **A1-I2B2 P1 CORRECTION COMPLETE — REVIEW PENDING**. Recovery uses the same
Account transition/apply gate and advances generation; network work holds no gate.
Production: **NO**. Hosted Dev: **NO**. Lifecycle command: **NO**. Commit: **NO**.
I2B3/I2C and human/independent review remain pending. Stop at this correction.

## Independent-review P1 correction #2 — global lease ownership

Focused independent review confirmed the first correction fixed the single-
coordinator COMMIT race, but found that its process-global Boolean fence still had
no owner. Multiple coordinator instances exist. An unconditional
`endAccountTransition()` in old B recovery/finally could clear another coordinator's
B→C fence; blind recovery could also restore A after C had already superseded B.
The instance-local `switching` flag was not global ownership proof.

The final primitive has one process-global active lease and uses the original FIFO
Account/apply gate. `beginAccountTransition()` returns a frozen unique lease with
an opaque Symbol token and the admitted generation. The same gate remains owned
through local session/account installation. `endAccountTransition(lease)` requires
exact active object identity: stale, cloned or mismatched leases throw without
changing active ownership, generation or releasing the gate. There is no unowned
end operation and no second mutex. Pending transition count fences requests while
waiting for the existing gate; it is admission metadata, not another lock.

Both coordinator entry points share local activation handling and retain only their
own lease. Existing sync draining happens before lease acquisition because it may
wait for network. Session selection/write, local adoption and memory clearing run
under the lease; the lease ends before bootstrap/restart. Logout also ends its own
lease before its bootstrap. Successful Account/session behavior and original errors
remain intact; correctness does not depend on singleton construction.

Recovery carries the failed activation's exact Account ID and generation captured
under its forward lease. It requests the same canonical FIFO transition and,
after acquisition, re-reads current session identity and global generation before
any mutation. Exact match permits a new generation and restoration of the previous
session under a newly owned lease. Mismatch returns the internal `superseded`
result: no restoration, memory/session update, post-recovery bootstrap/restart or
generation bump. The failed activation's original error still propagates; no new
user-visible superseded error was introduced. Legitimate B→A recovery still gets
a newer generation than both original A and B. Installation failure cannot reuse
those old contexts and releases only the failed recovery's own lease.

This correction changes only:

- `src/data/auth/accountRequestContext.ts`
- `src/data/auth/accountRequestContext.test.ts`
- `src/data/auth/accountSwitchCoordinator.ts`
- `src/data/repositories/tripPersonCertificate.test.ts`
- `docs/architecture/TRIP_CANONICAL_A1_I2B2_IMPLEMENTATION_REPORT.md`

Existing switch/coordinator, apply-first/recovery-first, credential retry and
A→B→A tests remain. Primitive tests now exercise owned cleanup, stale/cloned lease
rejection, serialization behind another owner, and independent Account/generation
conditional checks. Twelve migrated-SQLite multi-coordinator cases cover all four
switchAccount/activateSession combinations, each with C holding an active local
transition, C's certified apply paused after final validation immediately before
COMMIT, and C fully completed before B failure. They prove pending B recovery
cannot close C's fence, C stays current, stale recovery makes no generation/session
mutation, C's actor/certificate/cursor is the only committed scoped projection,
and old A/B responses cannot commit. The pre-COMMIT case uses the actual migration-
backed repository transaction harness. Original legitimate recovery-first and
apply-first cases still prove no B COMMIT after A becomes visible.

Final correction #2 evidence (`/private/tmp/otr-i2b2-evidence/p1-2-*.log`):

- Account primitive/coordinator plus SQLite certificate/race tests:
  **3 files / 54 tests PASS**, including the 12 overlapping cases.
- Full focused I2B2, session-refresh and Person-read regression suite:
  **13 files / 210 tests PASS** (`p1-2-focused-final.log`).
- Typecheck, backend build, scoped zero-warning ESLint, changed-file Prettier and
  whitespace checks PASS. No SQL/migration, protocol, UI or other document change.
- No remote access or SQL replay. Prior full-repository baseline boundary failure
  remains documented; these focused results do not claim FULL PASS.

Status: **A1-I2B2 P1 CORRECTION #2 COMPLETE — REVIEW PENDING**.
Ownership is process-global; one coordinator cannot end another's transition;
stale recovery cannot overwrite a later transition; legitimate recovery advances
generation; network/bootstrap/restart does not hold the gate; no second gate.
SQL/migration unchanged. Production: **NO**. Hosted Dev: **NO**. Lifecycle command:
**NO**. Commit: **NO**. I2B3/I2C remain deferred. Stop at review pending.

## Validation and financial non-interference

Evidence directory: `/private/tmp/otr-i2b2-evidence` (local synthetic data only).

- Initial I2B2 focused Vitest: **10 files / 151 tests PASS** (`focused-final.log`). Covers
  codec/goldens, backend snapshots/pages, SQLite certificate/restart/upgrade,
  credential and response races, Account switch, bounded refresh, private v1 and
  expense causality regressions.
- Initial I2B2 full Vitest: **170 files passed, 1 failed; 1,257 tests passed, 1 failed**
  (`full-ts-final.log`). Sole failure is baseline `architectureBoundary.test.ts`
  for `LedgerExpenseDetailScreen.tsx` importing `@/data/api`. Both files were
  compared byte-for-byte with `git show HEAD:<path>` and are unchanged. The full
  repository green gate is therefore BLOCKED independently of I2B2.
- Typecheck, backend bundle, zero-warning scoped ESLint, UI/terminology guard,
  changed-file Prettier and whitespace checks PASS. No UI was modified.
- Fresh baseline manifest first matched the committed 66-migration baseline.
  Populated forward migration and both clean 67-migration resets pass.
  Forward/reset 1/reset 2 native suites each pass **36 files / 863 assertions**,
  including the protected I2A and temporal foundation suites and 14 new read tests.
- Reset manifests match. `supabase db diff --local --schema public,storage`
  reports no schema changes. New inventory: 108 tables/RLS tables, 1,611 columns,
  838 constraints, 350 indexes, 155 functions, 125 triggers, 179 policies, 3 buckets.
  Only one function was added. Checksum:
  `890f6495fe22f08c01be12eb36c4c0d75d00ad9b1b09b55798b542a3e365d359`.
  Strict artifact verification and count/same-count checksum drift rejection pass.
- Synthetic populated financial/identity/permission/source JSON is byte-identical
  before/after migration (`safety-before.json`, `safety-after.json`), SHA-256:
  `87a85cfc7898a005013aab60c3e492076205db4f0dfdea590d7c87a1142758af`.
  It covers Members, legacy membership, role/status constraints, financial FKs,
  Member grants/policies/triggers, Expense/participants/splits/valuations, currency,
  Personal Payments/private grants, Settlement and personal Review source results.
- All production financial apply statements/calculations remain unchanged apart
  from transaction fencing and preserving shared cursor writes. No participant
  filtering, balance/Settlement/Review/FX/valuation/permission change. Track B/C
  fields, writer reservation, lifecycle guards and semantic revisions are untouched.
- An extra temporal writer-reuse script attempt was not applicable: its hardcoded
  B-T3B container was denied by the filesystem sandbox before Docker access. It
  was not escalated or retried. I2B2 native temporal regression and strict manifest
  guard evidence above are the applicable successful checks.
- Disposable `otr-trip-i2b2` stack stopped with `--no-backup`; existing project
  stacks and sibling worktrees were not modified.

## Acceptance matrix and deferred work

| Gate                                                | Status  | Evidence/remainder                                                   |
| --------------------------------------------------- | ------- | -------------------------------------------------------------------- |
| Clean expected starting baseline                    | PASS    | Exact path/branch/HEAD/status                                        |
| Complete roster and existing wire order             | PASS    | Single aggregate; >1,000 native/backend fixtures                     |
| Fingerprint v1 / all six goldens                    | PASS    | Domain codec tests                                                   |
| Canonical shared v2, zero sequence, private v1      | PASS    | Codec/backend/private regression                                     |
| V0/M/V1 coherence and bounded failure               | PASS    | Retry/exhaustion/malformed tests                                     |
| Empty/final/continuation verification               | PASS    | Backend and local page tests                                         |
| New/missing/ABA drift before checkpoint             | PASS    | Backend mismatch and coordinator recovery                            |
| Exact local certificate and retained history        | PASS    | Migration-backed repository tests                                    |
| Atomic save/commit failure and reopen               | PASS    | Bootstrap/page rollback and file-backed SQLite                       |
| A→B, A→B→A, apply-window and retry fence            | PASS    | Repository/credential/transport/Account tests                        |
| Old-backend preservation / bounded recovery         | PASS    | Local/coordinator branch tests                                       |
| Local migration/manifest replay                     | PASS    | Two equal clean resets, native SQL, empty diff                       |
| Financial/Track B/C non-interference                | PASS    | Synthetic manifest equality and regressions                          |
| Typecheck/build/scoped lint/format/guards           | PASS    | Local execution logs                                                 |
| Full repository green                               | BLOCKED | Unchanged baseline architecture-boundary violation                   |
| Human and independent review                        | PENDING | Required next checkpoint                                             |
| I2B3 device/reconnect/foreground/rollout acceptance | PENDING | Not performed or claimed                                             |
| I2C lifecycle commands and result integration       | PENDING | Commands disabled; future exact-result/read-side contract O retained |

Largest I2B3 risk: proving the existing wake/refresh ownership converges across
foreground/reconnect with an empty durable queue, actual native restart and two
devices under repeated churn. Unit/local replay evidence does not establish those
device scheduling guarantees. No instant cross-device freshness is claimed.
Future I2C exact result scope/pair/correlation, certificate invalidation and scoped
refresh integration remain governed by I2B1 section O and I2C's own admitted protocol.

Production accessed: **NO**. Hosted Dev accessed/mutated: **NO**. Lifecycle mutation
command enabled: **NO**. Private-payment cursor version changed: **NO**. Sibling
worktrees modified: **NO**. Commit created: **NO**. Stop at review pending.
