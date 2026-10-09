# Platform P2c dormant Integrated C4 Composer Builder report

Date: 2026-10-09 (Pacific/Auckland). Status: **BUILDER COMPLETE — INDEPENDENT REVIEW REQUIRED.**

**Ready for Independent Review: YES.** This is dormant source implementation and
local test evidence, not Owner acceptance, canonical integration or runtime activation.

## Source gate and accepted scope

Local main, origin/main, remote main and fresh detached Builder HEAD verified at
`094cf3beb6b05f2a7f1c8cca1fa007ed630651c4` before work and reverified after implementation.
Worktree: `/Users/xoery/.codex/worktrees/p2c-composer-builder/otr-mobile-canonical`.
Original checkout and its existing unrelated changes were not modified.

The Owner accepted the [P2c preflight](OTR_PLATFORM_P2C_INTEGRATED_C4_COMPOSER_PREFLIGHT.md)
and four minimal deltas. Its original proposed-status text is preserved byte-exact
as historical evidence; the Owner message authorizes this Builder checkpoint.
Mandatory current-state/architecture documents and accepted C2/SQLite51, C4a,
SQLite52/53, P2b-A and Continuation contracts were audited at this same canonical base.

Authenticated Publication Transport remains provisional/unavailable. No unaccepted
Transport source, endpoint, principal, provisioning or live installation was imported.
Local tests use existing explicitly TEST-ONLY CLOSED reader fixtures to install trusted
Membership; this is no production Transport acceptance claim.

## Exact changed files

1. `src/data/operations/captureBatchAssessmentComposer.ts` — new explicit factory and three APIs.
2. `src/data/operations/captureBatchAssessmentComposer.test.ts` —47 Composer/seal/hook tests.
3. `src/data/repositories/captureBatchAssessmentAdapter.ts` — original-context observation and private append seal; reuse complete existing observation queries.
4. `src/data/repositories/captureBatchAssessmentAdapter.test.ts` — reuse extracted fixture; all38 accepted test bodies preserved.
5. `src/data/repositories/__fixtures__/captureBatchAssessment.ts` — shared real SQLite1–53 fixture, optional disposable file/reopen for recovery.
6. `src/data/repositories/captureBatchAssessmentObservationRepository.ts` — only optional synchronous NEW activity hooks at INSERT/pre-COMMIT; accepted body/CAS/replay logic unchanged.
7. `docs/architecture/OTR_PLATFORM_P2C_INTEGRATED_C4_COMPOSER_PREFLIGHT.md` — accepted document carried unchanged from Architect worktree.
8. `docs/architecture/OTR_PLATFORM_P2C_COMPOSER_BUILDER_REPORT.md` — this evidence.
9. `docs/adr/2026-10-09-p2c-dormant-integrated-c4-composer.md` — approved decision and rollback.
10. `docs/API_CONTRACT.md` — incremental dormant API contract.
11. `docs/CURRENT_IMPLEMENTATION_STATE.md` — incremental Independent Review handoff.

No package/config/export barrel, Backend, schema/migration, owning C2/Import/Membership/
Capture/Account/Continuation repository, UI, route or default runtime file changes.

## Contract implementation evidence

The only externally supplied intent is original Account/generation context, Job UUID,
optional signal, or strict five-field receipt. Require empty Job Trip scope, initialized
SQLite52/53 and identical owning Import connection. No implicit bootstrap/fallback.

`assess` implements the accepted APPENDED, EXACT_REPLAY, UNCHANGED, REASSESS_REQUIRED,
REJECTED, INTEGRITY_BLOCKED, UNAVAILABLE, CANCELED and OUTCOME_UNKNOWN discriminants.
Errors expose finite safe codes, never private SQL/exception text. Successful summaries
and separate AssessmentProjection are explicitly historical-only with NOT_ASSERTED
current authority and closed preparation/admission/mature-attention flags.

The Adapter's public `assess(jobId)` remains read-only revision1. Internal
`observeForComposer(context,jobId)` retains original context and returns an opaque
frozen seal. A private per-factory WeakMap retains exact C2/manifest/snapshot content
and canonical complete owning observation, including discovery/absence. Copied,
forged, foreign-factory, mismatched-attempt/body and stale-generation seals reject.
Mutating returned content cannot alter private retained admission.

`assertCurrentForAppend` requires the existing owning transaction and invokes the
same complete Adapter observation using C2/Import/Capture/Membership transaction-local
stores. It compares complete read set and sealed body, permitting only durable snapshot
revision substitution. No nested gate/transaction or parallel authority query exists.
Cached Trip admission and current Capture/Source/Run/Input/Candidate/Representation
checks remain their owning stores' responsibility.

## Transaction, revision and recovery results

1. Validate original Account/schema, observe complete C2 roster under accepted Adapter
   gates and retain private seal. No network work exists in this checkpoint.
2. Read verified healthy SQLite52 head and exact latest body. Compare complete canonical
   logical tuple: C2 request/manifest/context digests, full manifest and snapshot with
   only assessmentRevision normalized to1. Equality yields historical UNCHANGED without
   INSERT; comparison is against latest, preserving A→B→A history.
3. Allocate proposed safe head+1; recompute snapshot digest, complete current pins and
   C4a envelope at that durable revision. Validate exact v1 canonical whole body and
   capacity before append. No revision relabel, truncation or artificial Job splitting.
4. SQLite52 owns one final Account-gated transaction: chain/CAS/C2 checks, private
   Adapter whole-read-set admission, independent current C2 validation, synchronous
   original-generation/signal/unresolved-attempt fence, one INSERT, chain readback and
   synchronous pre-COMMIT fence. Replay retains accepted byte-exact historical semantics
   and bypasses NEW hooks/current authority. No stale sealed content is silently rebased.
5. Fence result disclosure. Possible COMMIT followed by cancellation, Account transition
   or lost ACK returns OUTCOME_UNKNOWN with exact receipt, never claimed cancellation.
   Retain exact raw/head privately in transient memory; block later NEW for this Job,
   including already-sealed concurrent work.
6. `recover` performs exact read-only Account/Job/Batch/revision/hash lookup. FOUND,
   healthy ABSENT or REVISION_CONFLICT resolves that precise transient uncertainty.
   Failed/corrupt reads preserve it. Recovery never writes/reallocates. Fresh same
   Account generation may read old history; stale A→B→A callbacks cannot disclose it.
   Cold restart without receipt may reassess but makes no unidentified-recovery claim.

BUSY/IOERR/FULL/rollback uncertainty preserves older head and C2 data. Disposable
file-backed restart proves receipt FOUND after actual COMMIT/lost ACK, including current
authority loss, and ABSENT after failed INSERT/rollback. Corrupt tails block NEW/latest
projection. Accepted separate-WAL writer regression proves stale snapshot conflict
cannot blindly rebase. Exact body and C2 context bytes remain retained.

## Validation

**21 focused files /811 tests PASS**, including47 new Composer/seal/hook tests and38
unchanged accepted Adapter tests. Command: `npx vitest run <focused files> --configLoader
runner --cache=false --maxWorkers=1 --no-file-parallelism`.

| Coverage                                                                                                  | Executed evidence                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete roster, duplicate occurrences, UNKNOWN, unproven sibling dependency                              | Composer, Adapter, C4a, C2 and local Capture                                                                                                                     |
| Trusted/missing/stale Membership; late Capture/Trip/Source/Run/Candidate/Representation/Input/C2 mutation | Composer final transaction probes; Adapter and SQLite53 owning/migration regressions                                                                             |
| Account original generation and A→B→A                                                                     | Seven sampled assessment/seal/transaction boundaries, real queued transitions before INSERT/pre-COMMIT/post-COMMIT, fresh/stale receipt recovery; Account suites |
| Concurrent identical/different attempts; UNCHANGED; logical A→B→A                                         | One append plus exact replay, revision conflict without rebase, three retained parent-linked rows, concurrent unresolved attempt denied                          |
| Revision+digest CAS, old exact replay, lost ACK, cancellation                                             | Composer and accepted SQLite52 tests; both synchronous hook rejection boundaries, replay hook bypass, exact raw preservation                                     |
| SQLite BUSY/FULL/IOERR, rollback, cold/partial failure                                                    | Composer fault/file-reopen probes, real disposable FULL and accepted separate-WAL/rollback/recovery tests                                                        |
| Oversized whole Job / C4a-valid oversized complete body                                                   | 65-occurrence Composer rejection; accepted C4a/observation capacity tests reject intact at1MiB/2MiB, no INSERT/splitting                                         |
| C3 historical projection/no notifications; missing Transport/offline/closed gates                         | Write-free bounded projection, unchanged C2 capability/DTO facts, C3 lifecycle regression, network-denied test, sole observation INSERT and dormant source audit |
| Import and Continuation ownership                                                                         | Import admission, flight closure/integration and SQLite50 Continuation regressions                                                                               |

Exact focused files: Composer; Adapter; batchAssessment; batchAssessmentObservation;
captureBatchAssessmentObservationRepository; tripPublicationMembershipRepository;
publicationMembershipMigration; captureSubmissionRepository; defaultCaptureSubmission;
localCaptureInboxRepository; localCapture; tripImportAdmissionRepository;
flightImportClosure; flightImportIntegration; accountRequestContext; accountLocalState;
accountSwitchFoundation; accountSwitchCoordinator; intelligenceContinuationRepository;
databaseConnection; captureActivityLifecycle.

Typecheck, full lint/UI guard, Backend build (compile only), changed-file Prettier,
whitespace and exact-scope preservation checks PASS. UI guard:80 representative files,
473 accepted baseline occurrences. Final logs are local `/private/tmp/otr-p2c-*` evidence,
not tracked deliverables. No full-repository test or native/device/Hosted run was requested.

## Preservation, gates and review plan

SQLite registry/migration1–53, canonical body/C4a definitions, accepted owning stores,
C2/Continuation durable responsibilities, C3 Activity/processing DTOs, UI navigation,
default operations and startup/sync lifecycles remain byte-exact. Accepted Adapter
test bodies and historical documents are retained. No notification subscription,
lifecycle callback, worker, polling, queue kind or provider is installed.

| Gate                                                                      | Result                                                                        |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Dormant local explicit composition using already trusted local Membership | Implemented; awaits Independent Review and Owner acceptance                   |
| Authenticated Publication Transport acceptance/provisioning/live install  | CLOSED; separate independent acceptance and activation authorization required |
| Native deployment/runtime persistence and physical SQLite behavior        | Unverified; separately authorized native validation required                  |
| Experience/C3 summary rendering or notifications                          | CLOSED; separate UI/lifecycle design and authorization required               |
| Default factory/startup/background activation                             | Absent; separate runtime authorization required                               |
| C5 canonical admission, C9 AI, providers and domain/business writes       | CLOSED                                                                        |
| Canonical integration, commit/push/merge, Hosted/device                   | Not performed; separately gated                                               |

Independent Review should inspect seals and full absence/discovery read set, original
generation/disclosure fences, exact CAS/replay versus UNCHANGED, transient uncertainty
including concurrent in-flight attempts, cancellation hook placement, projection privacy,
and byte preservation. Reproduce race/fault probes with accepted tests; no live Transport,
Hosted or provider authority is needed to review this dormant checkpoint.

No additional Owner contract decision is requested for this Builder. Owner acceptance
follows Independent Review; Transport/native/Experience activation decisions remain separate.
Rollback means disabling any future explicit Composer caller while retaining C2 and
SQLite52/53 history, not deleting observations or reversing schema.

**STOP — P2c COMPOSER BUILDER / INDEPENDENT REVIEW REQUIRED.**

## F1 recovery correlation correction — targeted Independent Recheck required

Date: 2026-10-09. Owner authorized correction of the IMPORTANT recovery finding in
[the original Independent Review](OTR_PLATFORM_P2C_COMPOSER_INDEPENDENT_REVIEW.md).
This appendix supersedes the recovery readiness claim only; the original Builder
report and Independent Review text remain unchanged.

**F1 corrected; ready for targeted Independent Recheck: YES.**
Final dormant-code Owner acceptance remains pending that recheck.

### Reproduction and smallest correction

The original independent probe was copied byte-exact from its retained disposable
review source into the Builder worktree temporarily. On untouched Builder code:
**1 FAIL /18 skipped**, expected UNAVAILABLE, received ABSENT. Two real Jobs shared
one Account and had different Batches; the receipt combined the first Batch with
the second Job and an absent revision. Log:
`/private/tmp/otr-p2c-f1-original-probe.log`.

The correction changes only the Composer's existing internal `job` helper and
`recover`: reuse the exact immutable C2 Account/Batch header query already used
by SQLite52, require its Job to equal the receipt Job, then invoke the existing C2
transaction-local loader to verify the owning header/declarations/custody. These
checks run in the existing Account-gated transaction and retain original context
checks before/after reads and disclosure. Only after correlation succeeds may
`recover` call the unchanged SQLite52 `readExact`.

A wrong/missing owner or corrupt C2 header returns UNAVAILABLE. Correct ownership
still requires a successful healthy exact lookup for ABSENT. FOUND remains exact
Account/Batch/Job/revision/hash historical recovery. The five-field receipt,
uncertainty-map resolution, CAS, append, replay and chain validation are unchanged.
No new Repository abstraction, schema, journal or persistence exists.

Historical recovery does not call Adapter/current Membership/Trip/Capture/Source
admission. The accepted C2 loader checks retained historical custody, not current
assignment or server authority. Fresh generation of the same Account can recover;
old A→B→A callbacks and a generation change during recovery cannot disclose success.

### Correction-only changed files

- `src/data/operations/captureBatchAssessmentComposer.ts`: optional internal Batch
  correlation in the existing Job helper; one recovery call before exact lookup.
- `src/data/operations/captureBatchAssessmentComposer.test.ts`: seven additional
  F1 tests; original47 Composer tests preserved.
- `docs/architecture/OTR_PLATFORM_P2C_COMPOSER_BUILDER_REPORT.md`: this appendix.
- `docs/CURRENT_IMPLEMENTATION_STATE.md`: short targeted-recheck handoff.

All other delivered Builder files and the original Independent Review remain
byte-exact to correction-start fingerprints. Review SHA-256:
`e2a5b02b79c071ff70afbf3c6ac58fad1747546b972d40c52190600af030baf2`.
Temporary independent-probe copy was removed after execution.

### Executed correction evidence

- Original independent probes on corrected Builder source: **19/19 PASS**.
  Corrected Composer: **54/54 PASS**, including all original47 and seven additions.
  Combined focused run: **73/73 PASS**.
  Log: `/private/tmp/otr-p2c-f1-corrected-focused.log`.
- Final affected matrix: **21 files /818 tests PASS**, using the original review's
  focused file list and the same runner/cache/worker options as the original Builder.
  Includes C2, SQLite52/53, Adapter, C4a, Account, Import, Continuation and C3 lifecycle.
  Log: `/private/tmp/otr-p2c-f1-regressions.log`.
- Added coverage: real same-Account/different-Job/different-Batch correlation;
  wrong Job with absent and committed revisions both UNAVAILABLE; correct absent
  revision ABSENT and committed revision FOUND; failed exact read UNAVAILABLE;
  missing/corrupt header rejects both presence and absence claims; real A→B→A and
  same-Account new-generation fences at header/exact/post-read boundaries.
- Historical file-close/reopen recovery passes after current Capture unassignment,
  cached Trip access removal and Source revision mutation. No network call occurs.
  Existing lost committed ACK and cold uncommitted absence recovery tests remain PASS.
- Write spies, total_changes and exact retained-row comparisons establish no recovery
  writes or new revisions. Original independent storage/cancellation/seal controls
  pass without changing SQLite52 or accepted owners.
- Typecheck, full lint/UI guard, compile-only Backend build, changed-file formatting,
  whitespace and preservation checks PASS. UI guard:80 representative files and473
  accepted baseline occurrences. Validation logs: `/private/tmp/otr-p2c-f1-*`.

### Source and remaining gates

Builder HEAD remains `094cf3beb6b05f2a7f1c8cca1fa007ed630651c4`.
At correction start, local main/origin/main were already
`ad52275c00ea0d0e2cdd956e6c86eeecfc3fe28d`, as recorded by the original review.
No ref was changed; this correction is not an integration against advanced main.

SQLite1–53, SQLite52 repository bytes, accepted Adapter and owning repositories,
C4a/body definitions, five-field receipt, UI/default operations/lifecycle wiring
remain unchanged. No runtime/Transport/Experience/C5/C9/provider activation,
Hosted/device action, business write, commit, push, merge or rebase occurred.

Not checked: native/Hosted behavior, physical I/O/power loss or live Transport.
Those remain separately gated. No additional Owner contract delta is needed;
targeted independent recheck of F1 is the next authorized review checkpoint.

**STOP — P2c COMPOSER F1 CORRECTION COMPLETE / TARGETED INDEPENDENT RECHECK REQUIRED.**
