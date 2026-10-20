# C-I3D Protected Source Operation / Acquisition Command Foundation

Date: 2026-10-04 (Pacific/Auckland).
Status: **C-I3D OWNERSHIP REGRESSION EVIDENCE COMPLETE — REVIEW PENDING**.
Source commands remain disabled. Activation gate: **CLOSED**.

## Baseline and scope

Recovery startup verified `/Users/xoery/Project/otr-mobile-import`, branch
`trip/import`, HEAD `45eed53880263633afeb0b9c8f7bb20469eff5f6`. The only initial
untracked file was this stopped-attempt report. Every repository shell command
used explicit import `workdir`; directory/branch/HEAD/status checks preceded
writes. No sibling checkout was edited, staged or used for execution.

Authority: accepted C-I3A/C-I3B/C-I3C and the original
`OTR_C_C-I3D_CODEX_INSTRUCTION.md`. The implementation uses only additive
`20261004000500_trip_source_command_foundation.sql`, following B `00400`.
All 69 historical migration files remain byte-identical to baseline.
No Backend route, provider worker, Mobile SQLite/queue/UI, domain adapter,
receipt behavior or A/B/financial semantic change is included.

## Previous stopped attempt

The previous attempt created an untracked migration in canonical through shell
writes lacking explicit workdir, then stopped and removed that file from canonical.
It was preserved only at
`/private/tmp/otr-ci3d-evidence/20261004000500_trip_source_command_foundation.sql.draft`.
That draft remains unaccepted, unvalidated and uninstalled. This rerun inspected
it as scratch, independently derived the schema/security/phase machinery from
accepted contracts and B-T3D, and retained only individually reviewed codec,
metadata/result and proof fragments with fresh validation. It was not installed
wholesale. This rerun created no sibling file.

## Independent-review P1 ownership correction

Independent review found that the original function/relation/schema ownership
checks omitted `pg_type`: a reserved domain owner could `DROP DOMAIN CASCADE`
and remove a column of an administrator-owned table without table ACLs. The
previous implementation-complete status did not resolve this P1.

Both inventories now use `pg_shdepend` ownership dependencies (`deptype='o'`,
`refclassid=pg_authid`, exact reserved-role `refobjid`) across all object classes,
including shared objects and other databases. Pre-install ownership allowlist:
**none**. Reused polluted roles reject atomically; no ownership transfer, object
removal, privilege revocation or automatic repair occurs.

The final ownership allowlist permits only `pg_proc`, in the current database,
`objsubid=0`, schema `public`, exact resolved signature and exact owner role:

- `otr_trip_source_writer` owns only `trip_source_acquire_source(uuid,text)`,
  `trip_source_prepare_representation(uuid,text)`,
  `trip_source_verify_representation(uuid,text)`,
  `trip_source_replace_material(uuid,text)`,
  `trip_source_mark_representation_lost(uuid,text)`,
  `trip_source_recover_representation(uuid,text)` and
  `trip_source_upload_original(uuid,text)`.
- `otr_trip_source_operation_reader` owns only
  `trip_source_admission(uuid,uuid,boolean)` and
  `trip_source_operation_lookup(uuid,uuid,uuid,uuid,text,text)`.
- `otr_trip_source_command_gateway` owns **nothing**.

Every other owned class/object fails closed, including types/domains, relations,
schemas, extensions, databases, collations, operators/classes/families, text
search, foreign-data objects, publications and subscriptions. Existing effective
ACL, CREATE, membership/SET ROLE and default-privilege checks remain intact.

At the P1 correction checkpoint, twelve tests supplemented all original 91 Node
tests (then 103 total PASS). For
each of the three identities, both a hostile domain (`pg_type`) and a hostile
collation (`pg_collation`) reference an administrator-owned victim column. Each
installation rejects without partial operations/gate objects; owner identity
survives rollback. A transaction executing as the hostile role then proves
`DROP ... CASCADE` still removes the administrator's victim column without table
ACLs, and rolls that demonstration back before fixture cleanup. Six additional
installation-tail injections (domain/collation for each identity) fail at the
final ownership inventory and roll back all installed objects and injected types.

The P1 correction validation below was rerun at that checkpoint, including B-T3D's 78-test
role/security suite, two new clean 70-version full-chain replays, manifest/diff,
strict verifier/negative tests and historical-byte checks. Final catalog evidence
shows exactly seven writer-owned plus two reader-owned routines, no gateway-owned
object, closed Source/Event gates, three NOLOGIN reserved roles and no Source or
operation rows. No independent-review acceptance is claimed.

## Ownership closure: exact-routine regression evidence

Independent re-review found no demonstrated ownership-inventory bypass. This
closure adds test evidence only; 00500 is unchanged and the inventory was not
redesigned. All four fixtures reject at both pre-install and final inventories:

| Role   | Family                           | Unexpected owned identity                                     | Result                     |
| ------ | -------------------------------- | ------------------------------------------------------------- | -------------------------- |
| Writer | Approved-name overload           | `public.trip_source_acquire_source(uuid,text,boolean)`        | Pre-install + final reject |
| Reader | Approved-name overload           | `public.trip_source_admission(uuid,uuid)`                     | Pre-install + final reject |
| Writer | Wrong schema, approved signature | `ci3d_routine_owned.trip_source_acquire_source(uuid,text)`    | Pre-install + final reject |
| Reader | Wrong schema, approved signature | `ci3d_routine_owned.trip_source_admission(uuid,uuid,boolean)` | Pre-install + final reject |

Pre-install fixtures are owned by the reserved role before migration execution;
failed installation preserves that ownership. Final fixtures pre-exist under the
administrator and acquire reserved-role ownership through a test-only statement
immediately before the unchanged final inventory. The final ownership error
rolls back both installation and that injected transfer, restoring the exact
administrator-owned fixture. Every case compares OID, database, object class,
schema, routine name, identity argument signature, owner, definition and ACL
before/after rollback. Cleanup follows those assertions. Unexpected successful
installation stops the suite and preserves evidence. Gateway's empty ownership
allowlist and domain/collation evidence remain covered.

Eight new tests plus all previous 103 pass: **111/111** complete C role/security
tests. Fresh validation also passes focused SQL **159 assertions**, strict
verifier and count/same-count-checksum drift negatives. One additional clean
replay passes **70 distinct migrations, 39 SQL files / 1,355 assertions** with an
identical schema manifest. 00500 SHA-256 before/after:
`a31e57388b90b27ea9d557da40a04407ffb372dc550e9b9a4c748258b106cf20`.
Manifest/verifier bytes and all 69 historical migration bytes remain unchanged.
Final gate is CLOSED, all three roles are NOLOGIN, Gateway owns no object and
Source/operation tables are empty. Disposable containers are stopped and removed.

This closure changes only the Node security runner, this report/current-state
wording and synthetic `.ci3d/closure-*` evidence. Previous P1 correction and
full-chain evidence remains historical validation; no independent acceptance or
activation is claimed.

## Operations, receipts and command families

`trip_source_operations` has immutable operation ID, exact Trip/Actor/Source/key,
version/command/digest, material/Representation pins, expected revision/state pairs,
binary hash/count/MIME binding and optional PREPARE parent. Trip, Account, Source,
parent operation and Action references use RESTRICT; Source registration is
transactionally deferred. `(trip_id,actor_account_id,operation_key)` is unique.
Rejected operations may pin a descriptor that was never created; successful
result scope/manifest/Action bindings are checked before persistence.

Operational columns contain phase, safe attempt generation, independent attempt
UUID, actual database execution identity, admission and I/O-finished times.
Terminal columns contain bounded outcome/error, completion time, result revision/
state/Action/verification observations and result SHA-256. No document body,
filename, URL, provider response, credential or arbitrary result JSON is duplicated
into this family. Stored terminal replies use explicit nulls and fixed UTC
microseconds; lookup returns the historic receipt rather than current-row content.
Row and statement guards prohibit deletion/truncation and terminal rewriting.

Seven fixed writer-owned entrypoints install ACQUIRE_SOURCE,
PREPARE_REPRESENTATION, VERIFY_REPRESENTATION, REPLACE_MATERIAL,
MARK_REPRESENTATION_LOST, RECOVER_REPRESENTATION and internal UPLOAD_ORIGINAL.
Acquisition creates Source/rev1/ORIGINAL/Action/receipt atomically; replacement
appends old+1/new ORIGINAL and advances Source once. PREPARE writes a receipt only.
Upload completion leaves PENDING and never claims VERIFIED. Trusted exact proof
can verify, mark prior VERIFIED material LOST or recover retained LOST material;
Representation advances once, Source remains unchanged, and old material survives.
Receipt insertion failure rolls the entire metadata acquisition back.

## Digests and exact recovery

Fixed positional capture, acquisition, command, upload and terminal-result codecs
implement C-I3C prefixes/order. The reviewed B pure JSON/UTC helpers are reused.
Raw metadata rejects recursive duplicate keys, unsafe/fraction/exponent/negative-zero
integer spellings, malformed canonical UUIDs, unknown keys/commands/versions,
contradictory states and oversized input. Exact inline UTF-8 hash/count is recomputed.
Internal proof mismatch counts must also be exact bounded integers.

Independent Node SHA-256 vectors agree with PostgreSQL for Unicode TEXT, exact
LOCATOR, BINARY descriptors, pinned commands, upload tuples and UTC terminal results.
No production Backend Source codec is introduced. Exact ID/key/digest replay
returns the original receipt/status; changed intent rejects and never refreshes
CAS bases. Private exact lookup provides no enumeration or new dispatch.

## Roles, admission and closed installation

`otr_trip_source_writer`, `otr_trip_source_command_gateway` and
`otr_trip_source_operation_reader` are NOLOGIN, NOSUPERUSER, NOCREATEDB,
NOCREATEROLE, NOINHERIT, NOBYPASSRLS and non-replicating. Atomic pre/post inventories
check memberships/SET ROLE, ownership, CREATE in every non-system schema,
effective direct/PUBLIC/inherited routine EXECUTE, table plus every live column,
sequences and explicit default ACLs. Retained platform routines use B-T3D's exact
signature/definition fingerprints. Polluted roles reject without sanitation;
fixture capabilities survive failed installation unchanged.

Gateway gets only seven fixed commands and exact lookup. Writer owns those seven
commands and receives explicit implementation/pure helper capabilities plus gate
SELECT; it receives no protected business/operation DML or admission-row locking
grants. Reader owns admission/lookup and receives narrowly assigned SELECT
policies and pure receipt helpers. Temporary migration ownership CREATE/SET ROLE
rights are removed before commit; final inventories enforce exact capability sets.
No service_role semantic authority, JWT/GUC override or caller boolean bypass exists.

The one-row gate defaults false and a named CHECK forbids true. Operations/gate
use enabled and forced RLS; C-I3B Source guards remain byte-unchanged. Fresh closed
commands consume no key/receipt. Runtime connection credentials and positive
mutation grants are absent. Historic lookup requires current acquiring owner and
exact-Trip read admission; every new command/resume/semantic finalization additionally
requires current write admission. Guest downgrade retains historic reads while
blocking preparation/resume/finalization; subsequent read loss denies results.

## CAS, ownership and I/O protection

New execution requires PostgreSQL READ COMMITTED before locks. Lock order is
activation fence, Trip/admission rows in stable order, operation identity, Source,
Representation, then immutable children/Action/result. Current authorization and
original bases/states are rechecked before mutation. No helper performs network
or provider I/O; its transaction completes before future external dispatch.

Allowed phases are ADMITTED→IO_ACTIVE→IO_UNKNOWN|IO_QUIESCENT→FINAL, with
IO_UNKNOWN→IO_QUIESCENT only through the private trusted completion helper and
IO_QUIESCENT→IO_ACTIVE allocating a new attempt and incrementing generation once.
Exact prior phase/generation/attempt/execution identity fence every transition.
A partial unique index protects one ADMITTED/ACTIVE/UNKNOWN upload/recovery writer
per Representation. There is no lease/timeout-based release. UNKNOWN cannot restart,
finalize or release that slot. Operational completion can record quiescence after
write admission loss; semantic finalization still fails until fresh write admission.
No completion producer is exposed to the gateway or provisioned at runtime.

Parallel fixtures prove one exact replay/mutation, one winner for competing Source
CAS, one first-attempt owner and rejection of old generations. An observed RC
activation-lock waiter sees gate closure without consuming a key; RR/SERIALIZABLE
fresh commands reject. Late proof cannot resurrect newer LOST, PURGED or
IDENTITY_ONLY material. Historic VERIFIED receipts remain history after LOST.

## Validation and final signature

All database execution used only `supabase_db_otr-trip-ci3d-recovery`. Trusted
fixture grants/opening/guard suspension roll back or restore in finally; final
clean reset confirms closed gate, NOLOGIN roles, enabled old guards and zero
Source/operation rows. The disposable stack was stopped with `--no-backup`;
no matching containers remain.

| Check                                                                               | Result                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Focused C-I3D SQL                                                                   | 159 assertions PASS in each final full run                                |
| Preserved C-I3B security/structural regressions                                     | 246 assertions PASS                                                       |
| Polluted-role/security reuse                                                        | Original 91 + 12 object-class + 8 exact-routine tests = 111 PASS          |
| Source independent vectors / real races, isolation and gate-close waiter            | 2 Node tests PASS                                                         |
| B-T3D role/security reuse                                                           | 78 Node tests PASS                                                        |
| Unchanged B-T3D cross-runtime codec / concurrency, gate fence and UTC replay        | 4 Node tests PASS                                                         |
| Relevant A/B/receipt/sync/financial TypeScript regression                           | 63 files / 547 tests PASS                                                 |
| Two clean full-chain replays                                                        | 70 distinct versions each; 39 SQL files / 1,355 assertions each PASS      |
| Deterministic manifests / strict verifier / count and same-count checksum negatives | PASS                                                                      |
| public/storage schema diff, both final replays                                      | Empty                                                                     |
| Historical migration byte check                                                     | All 69 unchanged                                                          |
| Populated forward non-interference                                                  | 114 prior tables, 23 nonempty; data/schema/old routines/buckets identical |
| Typecheck, scoped ESLint, UI guard, artifact formatting and whitespace              | PASS                                                                      |

Forward comparison permits only the explicitly new private reader policies and
C helper grants; prior columns/constraints/indexes/guards/RLS/routine bodies and
other capability facts remain identical. Synthetic forward data SHA-256:
`5d8364ade948d2ba6c3600aa4e20226a3f10cf6b44a622251144c34e162059d0`.
The initial broad Backend selection included unrelated Stage 9 extractor tests
that prohibit a private directory inside a worktree. They failed at that directory
gate before HTTP and were excluded instead of writing outside import. The relevant
regression selection above passes; no full-repository green claim is made.

Manifest: **116 RLS tables / 1,746 columns / 1,004 constraints / 365 indexes /
198 functions / 141 triggers / 194 policies / four buckets**. Delta from baseline:
two tables, 40 columns, 55 constraints, four indexes, 23 functions, two guards and
six private policies. Checksum:
`c7aa6ff4dfa3992f86816b642e94a5cdb66723674710edc66059ec60afc9388f`.
Fresh correction evidence uses `.ci3d/correction-*` logs/manifests/byte inventory;
previous synthetic evidence remains under import `.ci3d/`.
Disposable copied project/configuration and intermediate evidence were removed.

## Files and reproduction

This ownership correction changes only 00500, its Node security runner, this
report and the current-state handoff, plus fresh synthetic `.ci3d/` evidence.
The correction changes installation checks rather than persistent schema objects;
therefore the freshly confirmed manifest checksum remains unchanged. Existing
C-I3D delivery changes below are retained.

Delivery changes: new 00500 migration, new
`supabase/tests/trip_source_command_foundation.test.sql`, new
`scripts/supabase/trip-source-command-foundation.test.mjs`, manifest/strict verifier,
current-state handoff and this report. `rls_matrix.test.sql` changes only manifest
counts. C-I3B's test changes only its obsolete zero-owned-function assertion and
adds a temporary TRUNCATE grant for the new RESTRICT child so old CASCADE probes
still reach and verify the exact original guard error.

Execute with explicit import workdir and only the hard-bound disposable container.
`reuse` and `forward` each require a fresh 69-migration baseline; `sql`, `vectors`
and `concurrency` require the installed 70-version foundation:

```sh
node scripts/supabase/trip-source-command-foundation.test.mjs reuse
node scripts/supabase/trip-source-command-foundation.test.mjs forward
node scripts/supabase/trip-source-command-foundation.test.mjs sql
node scripts/supabase/trip-source-command-foundation.test.mjs vectors
node scripts/supabase/trip-source-command-foundation.test.mjs concurrency
node scripts/supabase/verify-baseline-artifacts.mjs
# Keep negative-test temporary files inside import:
TMPDIR=/Users/xoery/Project/otr-mobile-import/.ci3d node --test scripts/supabase/verify-baseline-artifacts.test.mjs
```

## Review and activation blockers

Independent/human review remains PENDING. Actual provider create-only behavior,
execution-owner quiescence after crash/cancellation, bounded MIME/parser/resource
validation and an independently trusted completion producer remain unimplemented.
Runtime gateway provisioning, positive grants/guard admission, Backend routes and
lossless Account/generation-scoped local mirror/queue/device acceptance require
separate review. No real bytes or provider quiescence were assumed. Purge,
redaction, logical deletion and downstream adapters remain disabled; retention/
erasure policy is not invented. The stopped attempt is now superseded only by
this completed local foundation evidence, not by activation or deployment approval.

- P1 correction implemented: **YES**.
- Polluted role automatically sanitized: **NO**.
- service_role semantic authority: **NO**.
- Source commands enabled: **NO**.
- Activation gate open: **NO**.
- Purge/redaction enabled: **NO**.
- Runtime credentials added: **NO**.
- Production accessed: **NO**.
- Hosted Dev accessed/mutated: **NO**.
- Sibling worktrees modified: **NO**.
- Commit: **NO**.

**STOP — REVIEW PENDING.**
