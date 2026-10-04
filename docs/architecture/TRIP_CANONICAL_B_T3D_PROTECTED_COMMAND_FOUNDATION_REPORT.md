# B-T3D Protected Canonical Event Command / Receipt Foundation

Status: **B-T3D FOUR-FINDING CORRECTION COMPLETE — REVIEW PENDING** (2026-10-04).
Canonical commands remain disabled. Activation gate: **CLOSED**.

## Independent-review four-finding correction

1. **P1 reserved capabilities.** Reuse previously omitted effective routine EXECUTE
   and CREATE outside public, allowing a privileged helper to survive. Pre-install
   now checks every non-system schema, owned schema/relation/sequence/routine,
   effective routine EXECUTE, table/live-column/sequence capability, memberships,
   replication and other reserved attributes, and explicit default ACLs. Effective
   PostgreSQL privilege predicates include PUBLIC/inherited grants. Post-install
   inventories enforce exact routine ownership/EXECUTE and table/column privilege
   classes, with no schema CREATE. Gateway's new application EXECUTE set is exactly
   six entrypoints plus lookup; reader's is admission, lookup, codec and UTC formatter.
   Writer's fixed owned entrypoints and precise implementation/validator signatures
   are enumerated. A migration-local table contains 50 exact retained baseline
   platform/trigger utility signatures with SHA-256 definition fingerprints computed under fixed `pg_catalog` search_path
   and fully qualified signatures; a
   replaced signature fails. System namespaces and actual extension-member routines/relations/sequences
   are excluded explicitly; user-defined helpers in any such application schema are
   still scanned. The seven retained public application utilities return trigger and are SECURITY
   INVOKER, not privileged direct-call helpers; the other 43 are fixed Supabase
   platform utilities. Ordinary baseline PUBLIC/platform ACLs are not globally revoked.
   Explicit reserved/PUBLIC default routine/table/sequence grants fail before
   materialization/cleanup. No polluted reused role is silently repaired.
   All original 56 tests remain; 22 new tests cover each identity's direct/PUBLIC/
   inherited hostile SECURITY DEFINER EXECUTE, direct/inherited other-schema CREATE,
   reserved default routine EXECUTE, application sequence USAGE, and PUBLIC default routine EXECUTE. All 78 PASS;
   rollback leaves fixture capabilities unchanged and no installed gate to bypass.

2. **P1 isolation fence.** Advisory locking does not refresh a REPEATABLE READ
   snapshot. New semantic execution now checks PostgreSQL's actual
   `transaction_isolation` and requires READ COMMITTED before acquiring operation,
   activation or Event locks, inserting a receipt or consuming a key. Unsupported
   isolation raises `25000 / UNSUPPORTED_TRANSACTION_ISOLATION` with no durable
   receipt. No SET TRANSACTION or caller isolation metadata is used. Immutable exact
   lookup and matching historic replay stay available at higher isolation through
   their read-only path; no lookup advisory lock is needed for immutable rows.
   The live reproduction holds the exclusive gate lock with the gate initially true,
   establishes an old snapshot, rejects RR/SERIALIZABLE fresh commands before they
   wait, observes an actual RC shared-lock waiter, commits gate=false, and proves
   the RC waiter returns CANONICAL_WRITES_DISABLED with unchanged revision and zero
   keys 50/51/52. Ordinary concurrent RC CAS and equal-key serialization still PASS.

3. **P1 receipt timezone.** Default timestamptz-to-JSON serialization made lookup
   recompute different bytes in another session timezone. One private formatter,
   `trip_event_utc_timestamp(timestamptz)`, now emits UTC
   `YYYY-MM-DDTHH:mm:ss.ffffffZ` with exactly six digits, a fixed safe search_path,
   no PUBLIC EXECUTE, and explicit writer/reader allowlist entries. Construction,
   committed_at hash input, projected timestamps, lookup and response use it.
   First responses and later lookup return identical full receipt objects/bytes and
   SHA-256 under UTC, Pacific/Auckland and America/Los_Angeles, including after later
   Event edits. DST-date formatter vectors preserve `2026-11-01T09:00:00.123456Z`.

4. **P2 exact coordinates.** Number conversion rounded an out-of-range decimal to
   90/180 before rejection. Backend now compares canonical unsigned integer length /
   digits and boundary fractional presence before binary64 conversion. No tolerance
   or dependency is added. All twelve requested signed latitude/longitude boundary
   vectors plus fourteen existing grammar-edge executions agree with PostgreSQL;
   the Backend suite adds twelve individual regressions. Exact out-of-range fractions
   are rejected before coordinate storage conversion.

Nine files were amended for this correction: migration, B-T3D SQL test, role/codec/
concurrency runner, Backend codec and its test, manifest, verifier, this report and
current-state handoff. Existing rls_matrix/B-T3B test edits listed below belong to the
original uncommitted foundation and were not further changed by this correction.
No 00500 migration was created. Activation remains CLOSED; runtime gateway
credentials/Backend connection/Mobile integration remain intentionally PENDING.

## Baseline and scope

Worktree `/Users/xoery/Project/otr-mobile-temporal`, branch `trip/temporal`, clean
starting HEAD `b3fe04b3184cf2ecee70b1e5d69970cc73faa006`. Authority is accepted
B-T3A/B-T3B/B-T3C. Migration `20261004000400_trip_event_command_foundation.sql`
adds the 69th unique version after reconciled A `00200` and C `00300`.
All 68 historical migration files are unchanged. B-T3C wording is unchanged.

Only POINT/CALENDAR/ALL_DAY, UNASSIGNED and CREATE_EVENT, UPDATE_CORE_TEXT,
UPDATE_TIME, UPDATE_LOCATION, UPDATE_GROUPING, UPDATE_STATUS machinery is installed.
No HTTP route, capability advertisement, Mobile/SQLite or product UI is added.
Deferred semantic fields are not declared permanently immutable; first-slice
whitelists cannot change shape, scope or existing event type. CREATE uses activity.

## Receipts, intent and proofs

`trip_event_operation_receipts` uses `(trip_id, actor_account_id, operation_key)`
as the immutable identity. It persists command/contract/intent versions, digest,
target/base, canonical intended envelope, terminal outcome, result Event/revision,
observed conflict revision, result projection, confirmations, safe error/status,
receipt version/hash and server time. No IN_PROGRESS record exists. Statement
UPDATE/DELETE/TRUNCATE guards reject even zero-row tampering. Receipt insertion and
semantic mutation share one transaction; failed INSERT rolls back the mutation.
Server time is an observation inside the transaction, not a claimed commit timestamp.

Backend and PostgreSQL implement `otr-event-intent-v1`, including its encoding
marker in the SHA-256 input. Raw ingress rejects recursive duplicate keys, unsafe
integer spellings, fraction/exponent numeric tokens, negative zero, invalid Unicode,
non-ASCII object keys and oversized input (32 KiB UTF-8). Strings and array order
are preserved; object keys sort by ASCII; missing and null differ. Coordinates use
bounded canonical decimal strings and retain intended precision independently of
the stored binary coordinate. PostgreSQL text cannot represent U+0000, so both
runtimes reject it explicitly rather than silently rewriting it. No dependency added.

MANUAL confirmations bind Actor/Trip/Event/operation/field/value/precision and are
stored in the terminal receipt. RETAINED requires the current exact value/ref and
an actual immutable successful confirmation for the same Trip/Event/field/value;
a fabricated prefix is insufficient. Clear operations are recorded. Changed proof
is semantic even when display text matches. TRACK_C proofs remain rejected.
Provider candidate/cache bodies never enter accepted result projections, including
NO_CHANGE with fractional candidate confidence. A location semantic edit increments
its input generation once and clears candidates; a true NO_CHANGE preserves them.

Time permits only rule-independent unknown/date-only/unzoned partial civil and
confirmed UTC SOURCE_INSTANT facts. Microsecond strings remain lossless. Zoned or
fold-resolved input returns TIME_RESOLUTION_UNAVAILABLE; no tzdb artifact is invented.

## Roles, grants and closed installation

Reserved roles are NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT,
NOBYPASSRLS. Reuse validation checks attributes, ownership, membership/SET ROLE,
schema capabilities, effective table privileges and every live user column's
SELECT/INSERT/UPDATE/REFERENCES, including direct, PUBLIC and inherited effects.
Incompatible state fails atomically; it is not revoked or repaired. New-object
PUBLIC default grants are checked before normal API ACL cleanup, preventing that
cleanup from concealing a compromised reserved identity.

- Semantic writer owns six fixed SECURITY DEFINER entrypoints. It receives gate
  SELECT, receipt SELECT/INSERT and specific pure/read-only validator EXECUTE.
  It receives no Event/admission-row DML or locking UPDATE capability.
- Gateway receives only those six entrypoints and exact receipt lookup EXECUTE;
  it has no protected table/column DML and no writer/reader SET ROLE path.
- Private receipt reader owns admission and lookup, with SELECT on receipts and
  trips/trip_members/journey_members through seven narrowly assigned new policies.
  Admission follows existing Account-based read/write rules; no Person conflation.
- Temporary migration ownership setup grants schema CREATE and postgres SET ROLE
  only within the installation transaction. CREATE is revoked, postgres memberships
  finish with INHERIT false / SET false. No runtime opening setter is shipped.

`trip_event_command_gate` has one disabled row and a named CHECK forbidding true.
Gateway remains NOLOGIN, writer lacks parent DML, and the existing B-T3B semantic
write guard is unchanged. Spoofed JWT/GUC cannot open these layers. Fresh operations
fail CANONICAL_WRITES_DISABLED without consuming an operation key. Authorized exact
historical replay/lookup remains available after closure, without enumeration.
Runtime credential provisioning and authenticated Backend gateway connection are
PENDING. No credentials or remote connection are committed.

## CAS and locking

Six fixed signatures bind their command family; callers cannot supply arbitrary
function/path/SQL authority. Shared code remains private SECURITY INVOKER.
Current read admission and actual isolation admission precede an operation-key transaction lock. Exact historical
intent returns the original receipt before new CAS/gate checks; changed intent
rejects key reuse. New admission holds the shared activation transaction lock.
Lock order is Trip, admission rows in stable ID order, existing and proposed Day /
Reservation / Place references in relation/UUID order, then parent Event (or CREATE
ID reservation). Admission is rechecked under locks. Optional deleted Place pointers
are reloaded from the parent rather than recreated. A future gate transition must
use the corresponding exclusive activation lock.

CREATE is revision 1; UPDATE locks and compares exact base, advances once on a
semantic edit, permits true NO_CHANGE, rejects stale base and safe-integer overflow.
Static field whitelists and full existing aggregate validation run before completion.
Internal rejection rolls back tentative changes before recording a terminal receipt;
receipt failure rolls back everything. No LWW or ID remapping exists.

## Validation and replay evidence

All execution used disposable local `supabase_db_otr-trip-bt3d`; existing local
containers were untouched. Test-only opening, positive grants and guard suspension
occur under trusted owner fixtures, rolled back or explicitly restored. No bypass
is installed by the migration.

| Check | Result |
| --- | --- |
| Focused B-T3D SQL | 87 assertions PASS |
| Complete SQL, each clean replay | 38 files / 1,196 assertions PASS |
| Reserved-role adversarial suite | 77 cases + parent = 78 node tests PASS |
| Backend / Track A / sync / financial regressions | 68 files / 657 tests PASS, including 30 intent tests |
| Backend/PostgreSQL golden codec | 1 node test, multiple exact-byte/digest vectors PASS |
| Real parallel CAS, gate close / isolation and timezone replay | 3 node tests PASS |
| TypeScript and focused ESLint | PASS |
| Strict artifact verifier and count/same-count checksum negatives | PASS |
| Two complete migration replays / manifest comparison | 69 distinct versions each; identical manifests |
| public/storage schema diff | Empty |
| Populated forward migration non-interference | 112 prior tables, 23 nonempty: identical before/after |

Adversarial role cases cover three reserved roles × three protected relations ×
four column privilege classes (36), nine table DELETE/TRUNCATE/TRIGGER cases,
three bad LOGIN cases, four PUBLIC column cases, inherited membership, PUBLIC
new-table default grants and exact clean-role success, plus the 22 correction cases above. Polluted grants survive
failed migrations unchanged. Existing membership / SET ROLE / table checks remain.

The focused suite additionally covers six closed families, API DML denial, caller
spoofing, immutable receipts, response-loss replay, changed intent, later edits,
stale base, invalid shape/scope, UTC microseconds, zoned and Track C rejection,
retained proof exactness, fractional provider-cache NO_CHANGE, cross-Trip Day,
receipt failure atomicity, overflow, foreign receipt denial, canonical old full-save
rejection and literal legacy create. Concurrent independent keys produce one APPLIED
and one CONFLICT; concurrent equal keys apply once and return the same historic hash.

Reproduction from this worktree (Docker access required):

```sh
node scripts/supabase/trip-event-command-foundation.test.mjs sql
node --import tsx scripts/supabase/trip-event-command-foundation.test.mjs codec
node scripts/supabase/trip-event-command-foundation.test.mjs concurrency
# reuse requires a fresh isolated 68-migration baseline before installing 00400:
node scripts/supabase/trip-event-command-foundation.test.mjs reuse
node scripts/supabase/verify-baseline-artifacts.mjs
node --test scripts/supabase/verify-baseline-artifacts.test.mjs
```

Final manifest: 114 tables/RLS tables, 1,706 columns, 949 constraints, 361 indexes,
175 functions, 139 triggers, 188 policies, four buckets. Delta: two tables,
23 columns, 25 constraints, two indexes, 16 functions, two guards, seven policies.
Checksum: `487437eec9615630f0d1f7e76c58c69ccf11095975a1f8a99de437afd5870f6e`.
Strict verifier retains historical lineage/secret checks and rejects both count
and same-count checksum drift.

Forward snapshots compare populated A membership/convergence, C Source revisions /
representations, Expense/participants/splits/valuation, Settlement/Review/FX/Personal
Payment, legacy Event participants and existing canonical revision/time facts.
All prior rows, definitions, guards, API grants, existing policies and storage buckets
match, allowing only the explicitly new private read/validator grants and named
policies above. Financial receipt architecture and A/C writers remain unchanged.

## Changed files

- `supabase/migrations/20261004000400_trip_event_command_foundation.sql`
- `supabase/tests/trip_event_command_foundation.test.sql`
- `supabase/tests/trip_temporal_protected_foundation.test.sql` (old business-role
  capability checks retained; distinguish new private objects and six closed owners)
- `supabase/tests/rls_matrix.test.sql` (new manifest totals only)
- `backend/src/tripEventIntent.ts`
- `backend/src/tripEventIntent.test.ts`
- `scripts/supabase/trip-event-command-foundation.test.mjs`
- `scripts/supabase/verify-baseline-artifacts.mjs`
- `supabase/schema-manifest.json`
- this report
- `docs/CURRENT_IMPLEMENTATION_STATE.md`

## Acceptance and activation blockers

| Acceptance | Status |
| --- | --- |
| Scope / unchanged historical migrations | PASS |
| Atomic closed installation | PASS |
| Immutable Event receipts / recovery | PASS |
| Exact intent / golden codec | PASS |
| Manual and retained proof binding | PASS |
| Fixed command families / whitelists | PASS |
| CAS / lock order / atomic receipts | PASS |
| Roles / table and live-column capabilities | PASS |
| Adversarial SQL / concurrency / role reuse | PASS |
| Complete SQL and focused Backend/A/finance regressions | PASS |
| Two replays / strict verifier / drift negatives / schema diff | PASS |
| Populated baseline non-interference | PASS |
| TypeScript / focused lint | PASS |
| Four independent-review findings: capabilities / isolation / UTC hash / decimal bounds | PASS |
| Independent review | PENDING |
| Runtime gateway credentials, Backend connection and separately reviewed positive grants/guard activation | PENDING |
| Lossless Mobile contract / activation acceptance | PENDING |
| Zoned resolution without reviewed authority artifact | BLOCKED |
| Track C proof adapter without separate review | BLOCKED |

Biggest activation blocker: reserved NOLOGIN gateway has no provisioned runtime
connection; positive writer grants and ordinary guard admission remain deliberately
absent. They require separate activation review alongside Backend integration and
lossless Mobile readiness. No activation permission is implied by these fixtures.

Production accessed: NO. Hosted Dev accessed/mutated: NO.
Canonical Event commands enabled: NO. Activation gate open: NO.
Track C adapter enabled: NO. Participant/Booking commands enabled: NO.
Sibling worktrees modified: NO. Commit: NO.

**STOP — REVIEW PENDING.**
