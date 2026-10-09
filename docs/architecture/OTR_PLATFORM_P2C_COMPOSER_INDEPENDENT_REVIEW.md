# P2c Integrated C4 Composer Independent Review

Date: 2026-10-09 (Pacific/Auckland). Role: Independent Reviewer, separate from Builder.

**Verdict: PASS WITH REQUIRED CORRECTIONS.**
**Findings: CRITICAL 0 / IMPORTANT 1 / MINOR 0.**
**Ready for Dormant-Code Final Owner Acceptance: NO.**

What this change does: The explicit dormant Composer turns complete local C2 intake
and already trusted publication Membership into immutable SQLite52 assessment history.
It allocates durable revisions, checks current owning data inside the append transaction,
and exposes only historical summaries and exact recovery receipts.

The append, seal, revision and cancellation boundaries passed the reviewed local tests.
Recovery has one reproducible Job/Batch correlation defect on the ABSENT path. Correct
F1 and independently recheck it before final dormant-code acceptance. No correction
was applied to Builder production code.

## Source, authorization and preservation

- Reviewed worktree: `/Users/xoery/.codex/worktrees/p2c-composer-builder/otr-mobile-canonical`.
- Exact HEAD/base: `094cf3beb6b05f2a7f1c8cca1fa007ed630651c4`.
- Initial dirty scope is exactly the Builder's 11 paths listed below. No extra source,
  migration, configuration, dependency, Backend, UI or runtime path was changed.
- The preflight is byte-exact against the separate Architect worktree. The Owner's
  current authorization names the original four approved deltas; the Builder report,
  ADR and incremental contract record them. Historical PROPOSED labels remain intact.
  This review does not supply new contract or activation authorization.
- All **1,270 tracked paths outside the five modified tracked Builder paths** match
  the expected base byte-for-byte. This includes SQLite1–53 definitions/registry,
  accepted C2, Import, Membership, Account and Continuation owners, C4a/body contracts,
  C3 Activity DTO/UI, default operations and lifecycle wiring. The other six Builder
  paths are additions. The entire accepted Adapter test `describe` body is byte-exact;
  fixture extraction did not remove or weaken its 38 accepted test bodies.
- SHA-256 fingerprints of all 11 Builder paths were retained and rechecked; none
  changed during review. Only this new review document is delivered to the worktree.
- Local `main` and `origin/main` now resolve to `ad52275c00ea0d0e2cdd956e6c86eeecfc3fe28d`.
  Builder HEAD remains the requested base. The Builder's earlier three-ref source
  verification is historical; this review does not claim current main equality or
  independently verify the remote. Future integration needs its own source gate.

Exact Builder scope:

1. `src/data/operations/captureBatchAssessmentComposer.ts`
2. `src/data/operations/captureBatchAssessmentComposer.test.ts`
3. `src/data/repositories/captureBatchAssessmentAdapter.ts`
4. `src/data/repositories/captureBatchAssessmentAdapter.test.ts`
5. `src/data/repositories/__fixtures__/captureBatchAssessment.ts`
6. `src/data/repositories/captureBatchAssessmentObservationRepository.ts`
7. `docs/architecture/OTR_PLATFORM_P2C_INTEGRATED_C4_COMPOSER_PREFLIGHT.md`
8. `docs/architecture/OTR_PLATFORM_P2C_COMPOSER_BUILDER_REPORT.md`
9. `docs/adr/2026-10-09-p2c-dormant-integrated-c4-composer.md`
10. `docs/API_CONTRACT.md`
11. `docs/CURRENT_IMPLEMENTATION_STATE.md`

## Required correction

### F1 — IMPORTANT: Wrong-Job receipt can be reported as proven ABSENT

Location: `src/data/operations/captureBatchAssessmentComposer.ts:199–218`, especially
line215. `recover` checks the retained body's Job only when `readExact` returns FOUND.
On ABSENT, it returns the Batch-scoped lookup result without checking that the
receipt's Job owns that Batch.

Reproduction uses two real registered Jobs under the same Account, no damaged schema
or bypassed fixture guards:

```ts
const f = fixture();
const first = await f.submit();
const second = await f.submit();
const result = await composer.recover(context, {
  accountId: first.accountId,
  batchId: first.batchId,
  jobId: second.jobId,
  revision: 1,
  bodySha256: "0".repeat(64),
});
// Actual: ABSENT. Required: UNAVAILABLE for mismatched Job/Batch ownership.
```

What this is: ABSENT is a proven negative outcome for an exact five-field receipt.
Problem: this result instead proves only that a revision is absent from another Job's
Batch. The approved API requires exact Account/Job/Batch correlation, including cold
recovery. The receipt is syntactically valid but is not a valid locator for that Job.

Smallest fix: resolve the immutable C2 Account/Batch header and require its Job to
match `receipt.jobId` before accepting recovery outcomes. Retain existing Account
fences, read-only behavior and historical recovery after current authority loss.
Do not require current publication/Trip/Capture authority to recover old history.
Add the missing ABSENT mismatch assertion alongside the existing FOUND mismatch test.

If skipped: callers receive a conclusive recovery result for an invalid composite
locator. The existing exact-key uncertainty map limits the immediate impact: this
probe does not clear a genuine attempt with a different valid receipt, disclose
private payloads, cross Accounts, or append a row. Those limits do not satisfy the
required recovery contract.

The independent test fails on untouched Builder code: expected UNAVAILABLE, received
ABSENT. A disposable header-correlation correction made all 19 independent probes
and all 47 Builder Composer tests pass (66/66); it was then removed. This is correction
feasibility evidence, not a delivered fix or final recheck of corrected Builder code.

## Review matrix

| Requested boundary                       | Independent conclusion and evidence                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Base, exact scope, dormant state      | Exact requested HEAD and 11 paths verified; no production Composer caller or default wiring.                                                                                                                                                                                                                                                                                                                                   |
| 2. Context, initialized same DB          | Empty Job Trip scope, original Account/generation, schema availability and identical Import connection enforced. Assess/readAssessment ownership passed. Recovery Job correlation on ABSENT fails F1. No DB opener/migrator is called.                                                                                                                                                                                         |
| 3. Private seal                          | Per-factory WeakMap identity and frozen opaque seal deny forged/copy/serialized/prototype/proxy/foreign-factory/wrong-Job seals, mutated returned content and old A→B→A generation. Body equality privately retains all content except allocated snapshot revision.                                                                                                                                                            |
| 4–6. Whole roster and final reload       | C2 loader verifies full ordered declarations, duplicate occurrences, original custody and lineage. Final observation reloads admitted bindings and Run discovery, complete owning catalogs/Membership and Capture/Trip/Source/Run/Input/Candidate/Representation support. Legal late mutations and absent→present discovery reject without INSERT. Silent/non-finding-bearing Candidates and unreferenced Inputs are included. |
| 7. Transaction, network, disclosure      | Final validator uses transaction-local owners; no nested transaction. Shared fixture asserts against nesting. Original-generation tests include real queued Account transitions before INSERT, before COMMIT and post-COMMIT. No stale private summary is disclosed; possible outcomes return only the exact receipt. Local composition fetch spy remains unused.                                                              |
| 8–9. Allocation, hashes, CAS, replay     | Healthy head+1 allocation, snapshot hash and C4a recomputation, exact parent links and safe revision validation passed. Both expected revision and parent digest are checked. Exact historical replay requires canonical bytes; whitespace mutation rejects. Separate-WAL stale writer regression passed.                                                                                                                      |
| 10–11. UNCHANGED and history             | Tuple includes complete C2/context/manifest/snapshot content; only snapshot allocation revision is normalized. Latest healthy row is compared. A→B→A retains three parent-linked rows and recomputed envelopes; unchanged callbacks do not append. Historical-only status does not promise the head remains current after concurrent writes.                                                                                   |
| 12. Concurrent/unknown attempts          | Identical contenders append once/replay; different content loses revision CAS without automatic rebase. Already sealed NEW is denied while a sibling outcome is unresolved. Lost ACK blocks replacement until exact recovery. Failed recovery retains uncertainty. This is per-instance volatile state, with the approved cold-instance/no-receipt limitation.                                                                 |
| 13. Cancellation                         | Preflight abort returns CANCELED with no row. Pre-INSERT and pre-COMMIT hooks roll back rows and conservatively return OUTCOME_UNKNOWN with receipt; exact recovery proves ABSENT. Post-COMMIT abort returns unknown and recovery FOUND. The accepted repository does not expose positive rollback ACK, so an aborted signal alone does not prove CANCELED once append is attempted.                                           |
| 14. Storage/recovery faults              | Actual SQLite BUSY and FULL, injected IOERR/readback failure, open-transaction COMMIT/rollback-ACK failure, lost committed ACK and file-close/reopen recovery reproduced. Failed read is UNAVAILABLE, never ABSENT. Old history remains intact in Builder/accepted regression cases.                                                                                                                                           |
| 15. Whole limits                         | 65-occurrence Composer rejects whole with zero rows. Accepted C4a/body suites reproduce inclusive byte boundaries and a C4a-valid body over2MiB rejected intact; observation repository tests verify no partial append. No truncation or splitting exists.                                                                                                                                                                     |
| 16. Unknown/independence                 | Accepted no-binding originals stay UNKNOWN. Unsupported sibling dependency remains UNKNOWN/BLOCKED; no caller INDEPENDENT assertion clears unproven closure. No fabricated decisions or processing success.                                                                                                                                                                                                                    |
| 17–18. Projection and owner preservation | Projection exposes only barrier/counts/receipt and historical/closed authority flags; no payload, locator, context text or Candidate data. Read-only assertions pass. C2 Job processing capabilities, C3 DTO and Continuation owners remain byte-exact.                                                                                                                                                                        |
| 19. Closed runtime                       | Caller search reaches only explicit Composer, Adapter seams and tests. No export barrel/default factory, scheduler/worker/startup/notification hook, Transport/token/provider/C5/C9/business writer added.                                                                                                                                                                                                                     |
| 20. Test quality                         | Accepted Adapter assertions preserved. New tests use real SQLite1–53 and successful mutation checks; main race/CAS/cancellation probes reach the intended boundaries. No weakened assertion found. Missing absent-receipt correlation coverage is F1. Injected fault results and real SQLite faults are distinguished below.                                                                                                   |

The coherent snapshot guarantee relies on the existing serialized owning transactions
and Account gate. It does not authorize arbitrary unscoped statements to join an open
transaction or claim a JS lock coordinates separate connections. Already installed
Membership is locally trusted evidence; local COMMIT does not prove server freshness.

## Executed validation and independent negative controls

Tests ran in `/private/tmp/otr-p2c-independent-review`, a disposable copy with the
Builder's source bytes and existing canonical dependencies. No dependencies were
installed and no Builder source, migration, accepted contract or original report was
edited. Negative controls and the temporary F1 correction changed only disposable copies.

- Focused regression: **21 files /811 tests PASS**, matching the Builder matrix:
  Composer, Adapter, batchAssessment, batchAssessmentObservation, observation repository,
  Membership, migration53, C2 submission/default operations, Capture repository/domain,
  Import admission/flight closure/integration, Account context/local-state/switch foundation/
  coordinator, Continuation, database serialization and Capture Activity lifecycle.
- Independent probes on original source: **19 tests:18 PASS /1 FAIL (F1)**. These
  add six seal attacks, no-binding absence→trusted-publication discovery, late legal
  sibling Candidate/Input changes, a non-finding-bearing Candidate, two cancellation
  fences, wrong parent digest/noncanonical replay, readback+recovery failure, DB mismatch,
  actual BUSY/FULL, failed COMMIT/rollback ACK with cold absence, and F1.
- Actual BUSY: second file connection holds `BEGIN IMMEDIATE`; observation INSERT
  throws SQLite error5 /database locked. Exact receipt recovers ABSENT after release/reopen.
- Actual FULL: disposable bounded file and test-only INSERT trigger require a10MiB
  blob; observation INSERT throws SQLite error13 /database or disk full. No observation
  survives; cold exact recovery is ABSENT. This trigger exists only in the disposable DB.
- IOERR is injected at INSERT/readback; it is not a claim of a physical I/O failure.
  Failed readback and failed recovery keep unknown intent blocked. A separate probe
  leaves the real SQLite transaction open after INSERT while reporting failed
  COMMIT/rollback ACK; closing the connection removes that uncommitted row, and cold
  receipt recovery proves ABSENT. Lost committed ACK instead recovers FOUND.
- Final-validation bypass: replace the seal-bound validator with a no-op. **3 tests
  fail as intended**, receiving APPENDED for late discovered publication and changed
  sibling Candidate/Input. These are assertion failures after successful setup.
- Cancellation bypass: remove both SQLite52 activity hook calls. **2 tests fail as
  intended**, finding1 committed row where0 is required at INSERT/COMMIT cancellation.
- UNCHANGED bypass: force logical equality false. **2 tests fail as intended**, receiving
  APPENDED instead of UNCHANGED, including the final stable A→B→A callback/cold restart.
- CAS bypass: remove both parent-digest comparisons. **1 test fails as intended**,
  receiving APPENDED instead of HEAD_CONFLICT for a plausible revision/wrong digest.
- One initial cancellation mutant produced a parse error; it was discarded and is
  not evidence. The corrected executable mutant produced the two intended assertion
  failures above. All temporary mutations were restored after their runs.
- Typecheck PASS; full lint/UI guard PASS (80 representative files,473 accepted legacy
  occurrences); Backend build PASS (compile only); all11 Builder files Prettier PASS;
  `git diff --check` PASS; preservation/fingerprint checks PASS.
- Full formatting FAIL:28 existing paths. Every warning path is byte-exact to the
  expected base, and Prettier on those base bytes independently reproduces all28.
  No new Builder formatting failure is attributed to this checkpoint.

Reproduction command pattern:

```sh
node node_modules/vitest/vitest.mjs run <focused-file-list> \
  --configLoader runner --cache=false --maxWorkers=1 --no-file-parallelism
```

Local evidence: `/private/tmp/otr-p2c-review-focused.log`,
`/private/tmp/otr-p2c-review-independent.log`,
`/private/tmp/otr-p2c-review-control-{final-validation,cancellation,unchanged,cas}.log`,
`/private/tmp/otr-p2c-review-f1-correction-control.log`, and
`/private/tmp/otr-p2c-review-{typecheck,lint,backend,format,format-baseline,changed-format,preservation}.log`.
Focused paths: `/private/tmp/otr-p2c-review-suite-files.txt`.
Independent probe source:
`/private/tmp/otr-p2c-independent-review/src/data/operations/captureBatchAssessmentComposer.independent.test.ts`;
SHA-256 `b7288a18b2fb74bc0cb9dcbfdb07b50a2eb81ddcac462199b841d63f864018e2`.
These are local temporary evidence, not additional tracked deliverables.

## Remaining gates and final readiness

| Gate                                  | State                                                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dormant local final Owner acceptance  | NO; correct F1 and obtain targeted independent recheck.                                                                                                     |
| Canonical integration                 | Separate authorization/current-main source and preservation gate required.                                                                                  |
| Authenticated Publication Transport   | CLOSED; independent correction acceptance, principal/SQL driver, uncertain lease retirement, Hosted schema/ACL and live installation gates remain separate. |
| Native persistence/concurrency        | Unverified; Expo/device behavior, bounded native streaming, physical disk/power-loss acceptance require separate authorization.                             |
| Experience/C3 rendering/notifications | CLOSED; separate design, UI/lifecycle implementation and acceptance.                                                                                        |
| Default/runtime activation            | Absent; separately authorize factory/callers/startup/background lifecycle.                                                                                  |
| C5/C9/providers/domain writes         | CLOSED; no authority granted by this review.                                                                                                                |

Not checked: full repository tests, actual remote ref, Hosted DEV/Production, devices,
physical I/O/power failure, live Transport or native runtime. No commit, push, merge,
rebase, provisioning, runtime activation or business write was performed.
Risk: F1 must be corrected; local historical integrity remains distinct from current
server authority, and volatile attempts cannot identify lost receiptless invocations.

**STOP — P2c COMPOSER INDEPENDENT REVIEW COMPLETE.**

---

## F1 TARGETED RECHECK — PASS

Date: 2026-10-09 (Pacific/Auckland). Role: original P2c Independent Reviewer, original review session.

**F1 FIX VERIFIED: YES.**
**Original19 independent probes: PASS (19/19).**
**Remaining findings: CRITICAL0 / IMPORTANT0 / required MINOR0.**
**New regressions: NO within the executed affected matrix and targeted probes.**
**Ready for Dormant-Code Final Owner Acceptance: YES.**

This appendix closes F1 and supersedes the original review's F1/readiness verdict for
the corrected dormant source. All original review text above remains byte-for-byte
unchanged. It does not grant Owner acceptance, canonical integration or runtime activation.

### Exact source and correction scope

Reviewed worktree remains
`/Users/xoery/.codex/worktrees/p2c-composer-builder/otr-mobile-canonical`, at exact HEAD
`094cf3beb6b05f2a7f1c8cca1fa007ed630651c4`. The accepted preflight/contract deltas are
unchanged. The correction relative to the original reviewed Builder bytes touches
exactly four paths:

1. `src/data/operations/captureBatchAssessmentComposer.ts`: optional Batch correlation
   in the existing internal Job helper, and one awaited ownership verification in recovery.
2. `src/data/operations/captureBatchAssessmentComposer.test.ts`: seven F1 tests and one
   separating blank line; all original47 test bodies remain exact.
3. `docs/architecture/OTR_PLATFORM_P2C_COMPOSER_BUILDER_REPORT.md`: appended correction
   evidence; original report prefix remains exact.
4. `docs/CURRENT_IMPLEMENTATION_STATE.md`: targeted-recheck handoff.

No other originally delivered Builder path changed. Adapter private seals/read-set
validator, SQLite52 activity hooks/repository, C4a/body definitions, accepted preflight,
ADR and API contract remain byte-exact to the original review fingerprints.
The production diff contains no change to assess allocation, UNCHANGED, CAS/replay,
uncertainty-map resolution, cancellation or projection semantics.

### Independent reproduction and correction checks

The retained original19-probe source was verified byte-exact by its recorded SHA-256
`b7288a18b2fb74bc0cb9dcbfdb07b50a2eb81ddcac462199b841d63f864018e2`.
Retained pre-correction Composer bytes likewise matched the original review fingerprint.
The original wrong-Job/Batch probe was rerun against those bytes: **1 expected FAIL /
18 skipped**, expected UNAVAILABLE, received ABSENT. The same probe then passed on
corrected source as part of **19/19 PASS**, without altering its assertion or fixture.

As a disposable negative control, omitting only the new awaited recovery ownership
call reproduced the same ABSENT assertion failure. Restoring it left the corrected
source bytes exact. No Builder production code was edited by the reviewer.

The correction at Composer lines179–210 verifies Account/Batch ownership under the
existing Account apply gate and a serialized read transaction, requires the header's
Job to equal the receipt Job, then runs the accepted C2 transaction-local loader.
That loader validates immutable header/declaration hashes and retained custody.
Original Account checks occur before/after the reads and after transaction completion.
Recovery waits for this admission before invoking the unchanged SQLite52 exact lookup.
FOUND still checks retained Job, exact receipt digest and chain integrity; ABSENT still
requires a successful healthy exact lookup. Failed reads never become absence.

| Recheck requirement                       | Independently verified result                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong Job, valid Batch, missing revision  | UNAVAILABLE. The original F1 probe and additional query-order spy pass; no observation lookup occurs.                                                                                                                                                                                                     |
| Wrong Job, valid Batch, existing revision | UNAVAILABLE before observation lookup; no private historical summary disclosed.                                                                                                                                                                                                                           |
| Correct Job/Batch, missing revision       | ABSENT only after ownership and healthy exact lookup. Injected exact-read IOERR yields UNAVAILABLE.                                                                                                                                                                                                       |
| Correct Job/Batch, committed revision     | FOUND with exact receipt, historical-only flags and verified retained body/hash. Wrong hash remains REVISION_CONFLICT.                                                                                                                                                                                    |
| Missing/corrupt C2 header                 | UNAVAILABLE for both presence and absence requests. Builder tests cover missing Batch and corrupt request digest. An additional disposable test actually deletes the header after explicitly disabling its guards/FKs; both requests stop before observation lookup, retaining the existing SQLite52 row. |
| Current authority loss                    | Historical FOUND and healthy ABSENT remain available after Capture unassignment, cached Trip access removal, Source revision change and file-close/reopen. No current Adapter/Membership/Trip/Source admission or network call is introduced.                                                             |
| Account A→B→A                             | Old-generation context is UNAVAILABLE; fresh A recovers. Header/exact/post-read generation fences pass. B cannot recover either the original A receipt or a receipt relabeled with B's Account.                                                                                                           |
| Read-only recovery                        | Write spies, SQLite total_changes and exact row comparisons remain unchanged. Recovery performs no INSERT/UPDATE, revision allocation, replacement or SQLite52 mutation.                                                                                                                                  |
| Lost ACK/unknown/cold/concurrency         | Original probes and corrected matrix retain exact cold FOUND/ABSENT, failed-read uncertainty blocking, identical replay/different-content CAS, unresolved sibling blocking and cancellation behavior.                                                                                                     |
| Accepted semantics/dormancy               | Seal, final owning validation, UNCHANGED, cancellation hooks, C2/Import/Membership/Continuation owners and runtime call graph are preserved. No new application caller or activation.                                                                                                                     |

### Executed validation

Tests ran in the disposable corrected-source copy
`/private/tmp/otr-p2c-f1-independent-recheck`, reusing existing canonical dependencies.
No packages were installed. Original pre-correction reproduction used the retained
`/private/tmp/otr-p2c-independent-review` copy. No Hosted/device operation was used.

- **Original19 independent probes:19/19 PASS** on corrected bytes.
- **Corrected affected matrix:21 files /818 tests PASS**, using the exact original
  focused-file list and runner/cache/worker settings. This includes54 Composer tests,
  accepted Adapter/C4a/SQLite52/53, C2, Account, Import, Continuation and C3 lifecycle suites.
- **Six additional independent targeted checks:6/6 PASS**: two wrong-Job lookup-order
  checks, correct ownership/presence/absence/hash/read-only check, actual missing header,
  Account B/stale A→B→A disclosure, and failed healthy-absence lookup.
- **Ownership-bypass negative control:1 intended assertion failure**, same as original F1.
- Typecheck PASS; full lint/UI guard PASS (80 representative files,473 accepted baseline
  occurrences); Backend build PASS, compile only.
- All12 delivered paths, including the review, pass changed-file Prettier;
  whitespace check PASS. This targeted recheck does not claim global formatting PASS;
  the original review's28 unchanged baseline formatting violations remain historical evidence.
- All **1,270 tracked paths outside the original five modified tracked Builder paths**
  remain byte-exact to the expected base. SQLite registry/migrations1–53, C2, Import,
  Membership, Capture, Account and Continuation owners, C3 DTO/UI, default factories,
  startup/sync and provider/runtime wiring are unchanged.
- SHA-256 fingerprints of all12 delivered paths were verified before append. The
  reviewer changes only this report by appending this section. All other delivered
  bytes remain exact to recheck-start fingerprints.

Reproduction command pattern remains:

```sh
node node_modules/vitest/vitest.mjs run <focused-file-list> \
  --configLoader runner --cache=false --maxWorkers=1 --no-file-parallelism
```

Evidence logs are `/private/tmp/otr-p2c-f1-recheck-pre-correction.log`,
`/private/tmp/otr-p2c-f1-recheck-original19.log`,
`/private/tmp/otr-p2c-f1-recheck-matrix818.log`,
`/private/tmp/otr-p2c-f1-recheck-extra.log`,
`/private/tmp/otr-p2c-f1-recheck-ownership-bypass.log`, and
`/private/tmp/otr-p2c-f1-recheck-{typecheck,lint,backend,format,preservation}.log`.
The six extra checks are in disposable
`src/data/operations/captureBatchAssessmentComposer.f1-recheck.test.ts` under that copy.
No independent test file was added to the Builder worktree.

Original review preservation is checked against its retained bytes and SHA-256
`e2a5b02b79c071ff70afbf3c6ac58fad1747546b972d40c52190600af030baf2`.
The final report consists of those exact original bytes followed by this separated appendix.

### Remaining gates

| Gate                                          | Status after F1 recheck                                                                                                                         |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Dormant local Composer final Owner acceptance | Ready: YES; Owner acceptance itself remains the next checkpoint.                                                                                |
| Native deployment/persistence/concurrency     | Unverified; separate native/device and physical fault acceptance required.                                                                      |
| Authenticated Publication Transport           | CLOSED; correction acceptance, principal/SQL driver, uncertain lease retirement, Hosted schema/ACL and live installation remain separate gates. |
| Experience/C3 rendering/notifications         | CLOSED; separate design, UI/lifecycle implementation and acceptance.                                                                            |
| Default/runtime activation                    | Absent; separate caller/factory/startup/background authorization required.                                                                      |
| C5/C9/providers/domain writes                 | CLOSED; no authority granted.                                                                                                                   |
| Canonical integration/Git closure             | Separate current-main source verification and Owner authorization required.                                                                     |

Not checked: full repository tests, Hosted DEV/Production, devices, native/physical
I/O or power loss, live Transport or remote ref state. No commit, push, merge, rebase,
provisioning, runtime activation or business write occurred.
Risk: remaining activation gates are unchanged; volatile receiptless invocation and
local-versus-server authority limitations remain as approved. No new regression found.

**STOP — P2c COMPOSER F1 TARGETED INDEPENDENT RECHECK COMPLETE.**
