# CP13A.2 — Independent implementation review

Date: 2026-10-06 (Pacific/Auckland).
Worktree: `/Users/xoery/.codex/worktrees/cp13a-flight-admission/otr-mobile-canonical`.
Branch: `codex/cp13a-flight-admission`.
Verified HEAD: `1b2bf98c24f0fb000e438e5cbfbccbc537346577`.

**Verdict: PASS WITH REQUIRED CORRECTIONS. Three IMPORTANT correctness findings remain. This implementation is not ready for acceptance or activation.**

The owner's subsequent instruction narrows this review to ordinary software correctness, existing regression harnesses, disposable fixtures and static inspection. No further exploitation, hostile-principal, privilege-escalation or bypass testing was performed after that instruction. Security-specific scenarios not independently executed are marked **NOT INDEPENDENTLY EXECUTED — PLATFORM RESTRICTION**. Passing schema/ACL assertions is not a complete independent security verdict.

## Required corrections

### R1 — IMPORTANT / P1: reviewed fields are not checked against the complete executable operation

Locations:

- `supabase/migrations/20261005001000_trip_import_flight_value_guards.sql:65–88`, `trip_import_review_valid`.
- `supabase/migrations/20261005000600_trip_import_confirmation_admission.sql:236–286`, `trip_source_admit_event_proof`.
- `supabase/migrations/20261005000700_trip_flight_commands.sql:126–137`, `trip_event_execute_flight`.
- `src/domain/trip/flightImportReview.ts:335–351`, Confirmation refinement; `src/data/repositories/tripImportAdmissionRepository.ts:239–285`, local review validation.

**Concrete failure:** the existing I2 fixture reviews both a departure retime from `2026-12-16T20:00:00.123456Z` to `20:30:00.123456Z` and arrival completion. An otherwise ordinary UPDATE envelope containing only the arrival component and its proofs, with its digest consistently bound in the Confirmation, is accepted. The receipt says `APPLIED`, but departure remains `20:00:00.123456Z`, contrary to the selected review. Required selected support is silently unused.

The disposable integration observation was:

```text
APPLIED
ACTUAL_ORIGIN=2026-12-16T20:00:00.123456Z
REVIEWED_ORIGIN=2026-12-16T20:30:00.123456Z
```

This observation was obtained before the owner's narrowed testing instruction. Subsequent ordinary unit validation independently confirms the same missing reverse relation: removing `support_payload.services` from an executable Confirmation that still selects `services` does not make `parseFlightConfirmation` reject it.

**Why existing tests pass:** `validateFlightCommand` checks required leaves derived from the submitted command. Local and SQL review validation predominantly iterate supplied support entries; B predominantly iterates supplied proofs. These checks do not compare the operation's full leaf/value set with the immutable reviewed selection. A digest proves exact command bytes, not that those bytes implement every selected reviewed action. Endpoint/service aggregate validation cannot detect a whole reviewed component omitted from UPDATE.

**Violated authority:** CP13A.1 §§2/5 requires the normalizer to verify all selected values, including complete composite-to-leaf correspondence; CP12 I2 requires one supported same-Event operation to carry the selected combined action atomically. The owner's explicit both-directions requirement is not satisfied.

**Smallest correction:** resolve the executable review's selected fields, extracted/edited/user-entered values and required supports into the finite canonical leaf set. Require every executable selected component/leaf to have its exact value and evidence coverage in the command, and reject unused selected support. Perform the comparison at the protected server operation boundary as well as local preparation/dispatch. Preserve explicit deferred dimensions, nullable clears and exact RETAINED-value rules; omission must not substitute for an explicit defer or a different reviewed intent.

Regression cases should include: missing selected support; a reviewed departure+arrival UPDATE reduced to arrival only; composite and leaf selections; selected unchanged retained values; explicit null clears; and extra/unused support. No implementation was fixed by this review.

### R2 — IMPORTANT / P1: service mirrors obstruct certified Event removal

Locations:

- `src/data/db/migrations/tripImportAdmission.ts:430–440`, `trip_transport_service_mirrors` FK with `ON DELETE RESTRICT`.
- `src/data/repositories/tripCanonicalEventRepository.ts:290–305`, certified-absence removal.
- `src/data/repositories/tripImportAdmissionRepository.ts:958–989`, service mirror installation/read.

**Concrete failure:** on SQLite49, store an ordinary canonical TRANSPORT mirror and its service extension, then apply a newer valid complete collection that excludes that Event. The existing refresh removes endpoints and attempts to remove the Event without first removing its service extension.

- FK ON: `refreshCollection` rejects with `FOREIGN KEY constraint failed` at the parent DELETE; the transaction rolls back the new certificate/membership and mirror changes.
- FK OFF: refresh succeeds, but the service extension remains as an orphan. A later re-admission of the same Event/revision can expose the old service extension again through the existing revision join.

Both first-stage outcomes were independently reproduced with ordinary tests using the existing collection fixture and actual native SQLite, after applying migrations 1–49. The stale-service re-admission consequence follows statically from `readServices`; it was not separately executed.

**Violated authority:** accepted B-T3I complete-set reconciliation and absence fencing; CP13A.1 §4 requires the service extension to preserve collection/certificate behavior; CP13A's FK ON/OFF and Day non-interference acceptance requirements. Certificate bytes remain unchanged, but successful application of newer completeness is broken. Day does not receive a direct Import write; its ability to refresh from a newly certified set is nevertheless affected.

**Smallest correction:** explicitly delete only Account/Trip-scoped service mirrors belonging to certified-absent Events in the same collection-apply transaction, before deleting parent mirrors. Cover both FK modes. Cascading alone would not address the FK-OFF case. Keep certificate/membership and extension removal atomic and leave unrelated Accounts/Trips untouched.

**Test gap:** existing canonical/collection fixtures commonly default to SQLite46, and CP13A service tests do not compose service installation with certified absence. Passing those suites alone misses this SQLite49 integration regression.

### R3 — IMPORTANT / P2: local recovery rejects valid transitive Candidate lineage

Location: `src/data/repositories/tripImportCatalogRecovery.ts:240–248`, `validateImportSnapshot`.

**Concrete failure:** Runs form `R3 → R2 → R1`, with a Candidate lineage edge from a Candidate in R3 to its selected predecessor in R1. There is no redundant direct Run edge `R3 → R1`. This is valid under the accepted transitive Run relation. The local validator instead requires `.some(child_run_id === child.run_id && parent_run_id === parent.run_id)` and rejects the complete snapshot with `IMPORT_CATALOG_INTEGRITY`.

An ordinary fixture test removed only the redundant R3→R1 Run edge from the checked-in catalog snapshot while retaining R3→R2→R1 and the Candidate edge. The typed snapshot schema accepted it; `validateImportSnapshot` rejected at line 248. SQL `trip_import_catalog_scope_guard` uses recursive Run ancestry for this relation, so local and server rules disagree. No additional server scenario was executed after the owner's narrowed instruction.

**Violated authority:** CP13A.1 §3 explicitly permits a corresponding transitive Run relation for Candidate lineage; offline recovery must preserve complete admitted lineage rather than reject it on a stricter local rule. This fails closed and does not demonstrate a second CREATE, but can prevent recovery of an otherwise valid admitted history.

**Smallest correction:** use bounded Run-ancestor reachability in the local validator, retaining existing same-scope, cycle and node-limit checks. Add a three-generation test without the redundant direct edge, plus disconnected and cyclic negative cases.

## Scope and migration observations

The full tracked diff and untracked path inventory were inspected. No UI, passenger/booking persistence, participant-aware certificate, civil resolver, provider/LLM, HTTP route, startup worker or Ledger product change was found. The shared Event JSON codec extraction preserves the old parsing/canonicalization behavior; the two new command names remain behind disabled runtime capability paths.

Changed tracked paths:

```text
backend/src/tripEventIntent.ts
docs/API_CONTRACT.md
docs/CURRENT_IMPLEMENTATION_STATE.md
docs/DATA_MODEL.md
docs/OFFLINE_SYNC.md
src/data/api/tripCanonicalReadContracts.ts
src/data/db/checkpoint11Integration.test.ts
src/data/db/database.test.ts
src/data/db/migrations.ts
src/data/repositories/tripCanonicalEventRepository.test.ts
src/data/sync/syncEngine.test.ts
src/data/sync/syncEngine.ts
supabase/tests/trip_event_command_foundation.test.sql
supabase/tests/trip_source_command_foundation.test.sql
supabase/tests/trip_source_protected_foundation.test.sql
supabase/tests/trip_temporal_protected_foundation.test.sql
```

New paths present at review entry:

```text
docs/adr/2026-10-05-cp13a-flight-admission.md
docs/architecture/TRIP_CHECKPOINT_13A1_EXACT_SCHEMA_COMMAND_PREFLIGHT.md
docs/architecture/TRIP_CHECKPOINT_13A2_CANONICAL_FLIGHT_IMPORT_IMPLEMENTATION_REPORT.md
docs/architecture/TRIP_CHECKPOINT_13A2_SECURITY_MANIFEST.json
docs/architecture/TRIP_CHECKPOINT_13A_CANONICAL_IMPORT_ADMISSION_REPORT.md
scripts/cp13a/verify-local-admission-races.py
scripts/supabase/trip-import-flight-security-inventory.sql
src/data/api/tripImportCatalogContracts.ts
src/data/db/migrations/tripImportAdmission.ts
src/data/repositories/__fixtures__/tripImportCatalogs.json
src/data/repositories/__fixtures__/tripImportIntents.json
src/data/repositories/__fixtures__/tripImportPhases.json
src/data/repositories/captureSourceAdmissionRepository.ts
src/data/repositories/tripImportAdmissionRepository.test.ts
src/data/repositories/tripImportAdmissionRepository.ts
src/data/repositories/tripImportCatalogRecovery.ts
src/domain/trip/eventIntentJson.ts
src/domain/trip/flightAdmission.test.ts
src/domain/trip/flightAdmission.ts
src/domain/trip/flightImportReview.ts
supabase/migrations/20261005000400_trip_import_admission_catalogs.sql
supabase/migrations/20261005000500_trip_import_admission_guards.sql
supabase/migrations/20261005000600_trip_import_confirmation_admission.sql
supabase/migrations/20261005000700_trip_flight_commands.sql
supabase/migrations/20261005000800_trip_import_locking_and_service_reads.sql
supabase/migrations/20261005000900_trip_import_private_catalog_reads.sql
supabase/migrations/20261005001000_trip_import_flight_value_guards.sql
supabase/migrations/20261005001100_trip_import_undispatched_revocation.sql
supabase/tests/trip_import_flight_admission.test.sql
supabase/tests/trip_import_flight_security.test.sql
```

All 74 historical server migration files were compared byte-for-byte with HEAD: zero differences. Eight new ordered migrations bring the count to 82. SQLite49 is registered immediately after 48; historical definitions are unchanged. Additive migrations include transactional replacement of existing receipt constraints and the Source lock helper, as documented, rather than historical-file edits. Old transport rows are not service-backfilled.

A network-isolated disposable PostgreSQL 17.6.1.167 instance replayed all 82 migrations, with the normal synthetic seed and upgrade fixture installed at exact migration 74. All 121 old public table projections and isolated-role metadata/memberships remained identical across 74→82. This combined replay verifies construction and seeded upgrade; a separate entirely unseeded second replay was not run. Platform utilities were restored from the available local schema fixture and checked against existing accepted utility fingerprints; this is local fixture evidence, not deployed-platform validation.

Static inspection found transaction boundaries, fixed `search_path=pg_catalog`, explicit function revocations/ownership, private forced RLS and structurally false import gate constraints. No migration replay/idempotency capability beyond the ordinary once-per-migration runner is claimed. Interrupted inter-migration installations remain closed under the inspected gateway/gate structure; exhaustive partial-install recovery was not independently executed.

## Validation and limits

Testing used a disposable copy at `/private/tmp/cp13a-independent-review`, with existing installed dependencies. No implementation/test/migration in the reviewed worktree was edited. The worktree has no installed dependencies; tests were therefore run from the disposable copy rather than installing packages or adding a worktree symlink.

- Existing Flight, Import repository and scheduler suites: **3 files / 93 tests PASS**.
- Existing Event intent/read, database, CP11 integration, Account request context, canonical Event repository, canonical transport, Capture and Day suites: **10 files / 272 tests PASS**.
- Existing collection suite: **89 tests PASS** in the extended disposable harness.
- Independent ordinary regression assertions: **4 expected-behavior failures**, reproducing missing selected support, transitive-lineage rejection, FK-ON collection failure and FK-OFF orphan retention. These are implementation findings, not baseline failures.
- Before the narrowed instruction, existing SQL admission and metadata/ACL assertion suites ran in rollback transactions: **90 + 83 assertions PASS**. These do not establish comprehensive adversarial principal isolation. The reviewed barrier script was inspected but not independently run.
- Neither whole-repository typecheck/lint/build nor device acceptance was rerun; the Builder's reported results are not represented as independent results here. No external documentation/network lookup was needed.

Cleanup limitation: ordinary removal of the review-only container `otr-cp13a-acceptance-review` was denied access to the local Docker socket. No broader access was requested or workaround attempted after the owner's instruction. That disposable, network-isolated container remains; the existing user Supabase containers were not modified. Temporary correctness fixtures/logs remain under `/private/tmp/cp13a-independent-review`.

Reproducible ordinary assertions and output are retained only in the disposable test copy:

```text
src/data/repositories/cp13aIndependentCorrectness.test.ts
src/data/repositories/tripEventCollection.test.ts (appended SQLite49 cases)
correctness-regressions.log
```

Their command is the existing Vitest runner with those two test paths, from the disposable copy. The worktree's tests remain unchanged.

Terminal recovery was inspected against the owner clarification: the bridge recomputes the immutable receipt hash, returns minimal correlation, exempts target read only for terminal no-commit CREATE, retains target checks for success/UPDATE, and leaves missing receipts unresolved. Existing ordinary receipt recovery assertions passed. No new receipt namespace is added. This is correctness evidence, not independent proof against every forged binding or Event-existence oracle.

The inspected server lineage functions retain unknown claims, traverse bounded related Runs, preserve DISTINCT_OUTPUT claims and use the scope lock. Existing CAS replay demonstrates revision 7→8 without replay to 9; unsupported dimensions remain deferred. R1 prevents a complete mixed-action correctness verdict. R3 prevents a complete offline lineage recovery verdict.

Existing ordinary tests cover exact temporal precision, midnight/null arrival, deferred civil/estimated inputs, scoped service/date/route matching, stale service baselines, Account transitions, cold SQLite files, Capture NEW/REUSE/REPLACEMENT and exact byte binding. Matching remains an unwired policy helper; passing it does not constitute runtime end-to-end match activation. Local mirror/receipt application does not create certified IDs or Day rows. Existing populated Ledger SQL observations and local integration checks passed; no financial operation was added.

**NOT INDEPENDENTLY EXECUTED — PLATFORM RESTRICTION:** exhaustive hostile principal access; privilege/membership escalation; service-role/RLS bypass attempts; forged Actor/Trip/Candidate/slot/digest/base access attempts; search-path exploitation; terminal-recovery oracle attacks; and any other unexecuted security attack scenario from the original brief. These are neither PASS nor FAIL by lack of execution. Static ACL/ownership review and existing metadata tests are narrower evidence.

## Optional observation

`tripImportAdmission.ts` creates `local_trip_source_slot_create_claim` and `local_source_create_claim` with the same unique columns and predicate. One can be removed from this uncommitted migration to avoid duplicate index maintenance. This is OPTIONAL and not an acceptance blocker.

## Final answers

YES/NO below describe independently reviewed software properties. Security assurance has an explicit third status because the owner requires restricted scenarios to be distinguished from PASS/FAIL.

| Required answer | Result |
| --- | --- |
| Scope matches CP13A.1 | NO in invariant completeness: R1/R2/R3; intended path/product scope otherwise matches. |
| Historical migrations preserved | YES — 74 server files byte-identical; SQLite 1–48 retained. |
| Fresh/upgrade migration safe | YES for observed schema replay/data preservation; SQLite49 runtime deletion compatibility fails R2. |
| RLS/ACL/principal isolation safe | NOT INDEPENDENTLY EXECUTED — PLATFORM RESTRICTION; static/metadata checks only. |
| Runtime gates remain CLOSED | YES — schema defaults/constraints, disabled capability paths and scheduler exclusion. |
| Terminal CREATE recovery safe | YES for inspected correctness and existing regression behavior; adversarial assurance NOT INDEPENDENTLY EXECUTED — PLATFORM RESTRICTION. |
| I1 lineage fence safe | NO for complete local/server recovery parity, R3; inspected server claim-fence behavior has no confirmed correctness failure. |
| I2 CAS/mixed-action safe | NO — CAS/replay passes, but selected mixed action can be partially omitted, R1. |
| TRACK_C proof binding safe | NO — reverse selected-field/support/operation coverage missing, R1. |
| Temporal Option A enforced | YES for inspected grammar and ordinary regression coverage. |
| Flight match-v1 safe | YES for ordinary policy regression coverage; runtime integration remains unwired. |
| SQLite49 offline durability safe | NO for complete extension reconciliation/recovery, R2/R3; basic cold-file/pending/Account checks pass. |
| Capture→Source admission safe | YES for ordinary NEW/REUSE/REPLACEMENT, byte/revision/CAS/restart coverage; adversarial assurance restricted. |
| Certificate semantics preserved | YES for bytes/hash/meaning; NO for successful absence application with services, R2. |
| Day non-interference preserved | NO for refresh dependency behavior, R2; no direct Import→Day write found. |
| Ledger non-interference preserved | YES for inspected diff and ordinary regression/preservation evidence. |
| Passenger/booking capability accidentally added | NO. |
| Civil resolver accidentally added | NO. |
| Runtime activation accidentally added | NO. |
| Production/Hosted Dev accessed | NO. |

**PASS WITH REQUIRED CORRECTIONS.** Resolve R1–R3 and rerun their ordinary regressions before accepting CP13A.2. The restricted independent security scenarios remain explicitly unverified. No implementation modification, migration correction, staging, commit, push or deployment was performed.

**STOP — INDEPENDENT REVIEW COMPLETE.**

---

## TARGETED CORRECTION RECHECK

Date: 2026-10-06. Branch: `codex/cp13a-flight-admission`; HEAD:
`1b2bf98c24f0fb000e438e5cbfbccbc537346577` (unchanged).
Scope: R1, R2, R3 and the optional redundant SQLite49 index only. The preceding
findings remain historical evidence. This section supersedes their outstanding
correctness status, without reopening the original review or its security verdict.

### Independent execution and evidence limits

Read this review and the Builder's implementation report, including its targeted
corrections. Inspected the corrected implementation and related tests. Executed
ordinary tests against a fresh disposable source copy at
`/private/tmp/cp13a-targeted-recheck`, using the existing Vitest/native Node SQLite
harness and installed repository dependencies. No implementation file was changed
in the reviewed worktree.

Initial unchanged repository run: **3 suites / 154 tests PASS**:
`flightImportReview.test.ts`, `tripImportAdmissionRepository.test.ts`, and
`tripEventCollection.test.ts`.

Final independent run: **5 suites / 181 tests PASS**, using:

```text
node /Users/xoery/Project/otr-mobile-canonical/node_modules/vitest/vitest.mjs run
  src/domain/trip/flightImportReview.test.ts
  src/data/repositories/tripImportAdmissionRepository.test.ts
  src/data/repositories/tripEventCollection.test.ts
  src/data/repositories/cp13aIndependentCorrectness.test.ts
  src/data/sync/syncEngine.test.ts
```

The command was issued on one line. Evidence log:
`/private/tmp/cp13a-targeted-recheck/independent-targeted-tests.log`.
The disposable copy additionally reran the two original independent R1/R3
regressions, added two CREATE-claim constraint tests, and instrumented the six R2
tests with abort-on-write triggers for all INSERT/UPDATE/DELETE operations on all
three Day tables. Those fixture changes were confined to the disposable copy.
Two intermediate index-fixture runs failed because the duplicate fixture reused
the confirmation/slot uniqueness keys; after giving the second confirmation its
own identity/key, the tests exercised the intended claim index and passed. These
were fixture construction errors, not implementation regressions.

**Protected-server SQL execution this recheck: NOT INDEPENDENTLY EXECUTED —
PLATFORM RESTRICTION.** Ordinary Docker access returned permission denied; no
broader access was requested and no alternative access path was attempted. Server
correctness conclusions below use static inspection, which the authorized review
allows. The Builder's SQL assertion counts are not counted as independent runs.
No restricted security/adversarial scenario was executed or newly verified;
every prior restricted security status remains unchanged.

### R1: FIX VERIFIED

Verified by independent local execution plus protected-server static inspection.

1. Reviewed departure retime + arrival completion, with an arrival-only operation
   and consistently rebound digest: local dispatch rejects `INVALID_PROVENANCE`
   before queue/state mutation; the slot stays PREPARED and no
   `C_EXECUTE_EVENT_SLOT` row appears. Both FK modes passed.
2. Complete reviewed departure + arrival with all required composite leaves:
   validation and durable dispatch succeed; replay produces exactly one queued
   operation. Both FK modes passed. Protected-server atomic application is
   supported by inspection of the admission-before-write and transaction paths;
   it was not dynamically rerun here.
3. Selected services without support: strict confirmation preparation rejects;
   the original independent regression now passes.
4. Extra unselected support and unused proof reject.
5. Selected unchanged retained value accepts its exact baseline reference/value;
   wrong retained reference rejects before dispatch. The domain value-mismatch
   assertion also passes. Both FK modes passed at the durable boundary.
6. Explicit reviewed nullable value accepts exact allowed null/support and rejects
   an unreviewed non-null replacement. Server clear persistence was inspected,
   not dynamically rerun.
7. Composite endpoint selection with a missing required leaf proof rejects.

Local `flightImportReview.ts:308` enforces selected/support key equality.
`resolveReviewedFlightSelection` independently resolves immutable selections and
expands finite canonical leaves; `validateReviewedFlightCommand` checks complete
composites, every required leaf, values and submitted leaves in both directions.
`tripImportAdmissionRepository.ts:362` applies resolution during preparation and
full command/retained-baseline validation during dispatch before durable mutation.

Protected-server inspection: `20261005001000` review validation enforces the same
selected/support equality. In `20261005000600`, the fixed operation-admission branch
of `trip_source_admit_event_proof` independently resolves every selected value,
builds expected components/leaves, requires each required proof, and rejects
unselected/mismatched proof coverage. `20261005000700:126` calls that branch with
the submitted values/proofs before canonical Event/endpoint/service mutation.
Its subsequent RETAINED checks compare the canonical old value and exact current
reference before writes. Thus the reverse relation is present at both local and
protected-server boundaries; it is not merely a submitted-proof allowlist.
The SQL fixture's partial-operation, missing-leaf, unused-proof, wrong-value,
wrong-retained and nullable-clear cases were read, not executed in this recheck.

### R2: FIX VERIFIED

Verified on **actual SQLite49**, through normal certified collection refreshes.
The six R2 cases passed with FK ON and FK OFF:

- Newer complete collection excluding an installed Event succeeds and removes
  that Event and its service mirror; no excluded service orphan remains.
- Retained Event service, other Trip service and other Account service survive
  with their complete rows unchanged.
- Re-admission of the same Event identity and semantic revision leaves the stale
  service absent.
- Injected child-delete and parent-delete transaction failures each restore the
  coherent prior Events/endpoints/services/certificate/membership state in both
  FK modes.
- All six cases also pass with abort-on-write triggers on `trip_day_projections`,
  `trip_day_events`, and `trip_day_boundaries`: no direct Day write occurs.

Static inspection confirms that the account/trip-scoped service deletion precedes
parent deletion inside the existing collection transaction and uses the certified
membership set. The extension-table existence check retains pre-SQLite49
compatibility. The correction does not change certificate construction or
fingerprint inputs; the collection suite's five normative fingerprint goldens,
canonical read bytes and existing certificate acceptance/isolation tests pass.
This verifies service cleanup without changing certificate semantics/bytes.

### R3: FIX VERIFIED

Five ordinary recovery assertions pass: transitive, direct, disconnected, cycle,
and over-bound. The original independent schema-valid transitive regression also
now passes: Run R3 → R2 → R1 with Candidate(R3) → Candidate(R1), without a redundant
Run R3 → R1 edge. Direct ancestry accepts; disconnected and cyclic ancestry reject
`IMPORT_CATALOG_INTEGRITY`; the over-bound catalog fails closed before traversal.

Static inspection of `tripImportCatalogRecovery.ts:236–258` confirms scope/owner
and acyclic graph validation precede bounded ancestor reachability. Candidate
lineage checks membership in the ancestor set instead of requiring a direct edge.
This matches the server's recursive Run-ancestor relation for the reviewed
transitive case. No claim is made that all other local/server recovery semantics
were reopened or revalidated.

### Optional index and CLOSED gates

Both FK-mode independent SQLite49 constraint tests confirm
`local_source_create_claim` is absent and
`local_trip_source_slot_create_claim` remains a unique partial index. A second
active CREATE claim with the same Account/Candidate/slot-key/target-kind rejects
at that exact claim key; an inactive duplicate accepts and activating it rejects.
Removal of the identical redundant index preserves CREATE-claim uniqueness.

The five existing scheduler assertions for CP13A operation types pass and dispatch
none even with a permissive scheduler filter. Static schema inspection confirms
the admission gate remains initialized false/false with false-only constraints.
Runtime gates remain CLOSED; no activation was performed.

| Final targeted conclusion | Result |
| --- | --- |
| R1 | FIX VERIFIED — local execution and protected-server static inspection |
| R2 | FIX VERIFIED — actual SQLite49, FK ON/OFF |
| R3 | FIX VERIFIED — ordinary recovery tests and static server parity |
| Original findings resolved | YES |
| New regression discovered during targeted recheck | NO |
| Runtime gates still CLOSED | YES |
| Implementation ready for final owner review | YES |

Ready for final owner review is a correctness recheck conclusion, not new runtime
SQL execution evidence or independent security approval. Prior restricted security
scenarios remain **NOT INDEPENDENTLY EXECUTED — PLATFORM RESTRICTION**.
Only this review was appended; no implementation, migration, accepted report or
contract was modified, and no commit or push was performed.

**STOP — TARGETED RECHECK COMPLETE.**
