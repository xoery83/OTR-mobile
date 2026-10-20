# CP14 C2 — independent continuation runtime review

Date: 2026-10-06 (Pacific/Auckland). Review only.

**Verdict: PASS WITH REQUIRED CORRECTIONS**

**New findings: 0 CRITICAL, 4 IMPORTANT. Ready for Owner Review: NO.**

Durable claim/signal finalization, attempt reservation, UNKNOWN redispatch fencing,
Account generations and installation fences hold in the inspected implementation
and executed tests. Four implementation defects remain: generic dependency release
misinterprets wake completion; newly signaled work can remain dormant after scheduler
idle; a competing execution caller can regress another caller's execution/meter
observations; and invalid wakes can indefinitely obstruct the queue. These require
bounded corrections and independent recheck, not a new scheduler, migration or
architecture redesign. Closed provider gates remain intact.

## Reviewed snapshot and authority

Worktree: `/Users/xoery/.codex/worktrees/cp14-c2-continuation/otr-mobile-canonical`.
Branch: `intelligence/cp14-continuation-runtime`. Verified HEAD/accepted base:
`439168065df182975dda03a75e94908f8d9cc389`. The implementation is uncommitted;
review covers working-tree modifications and untracked deliverables, not just HEAD.
The calling canonical checkout has unrelated Agent A/C work and was not the source
of this review's implementation snapshot.

Read the complete C2 report, including its historical stop, QUEUE OPERATION PREFLIGHT
and implemented scope. Independently retrieved the human **OWNER APPROVAL — CP14
C2 CONTINUATION WAKE CONTRACT** from “Execute CP14 Agent C2 adaptation”, chat
`01a10f4b-d858-7030-84cd-e073ad503bfe`, final implementation turn
`01a10f66-9965-79a2-9470-c122074cac7c`. The approval authorizes the strict v1 wake
contract and existing central scheduling/activity integration, while explicitly
withholding provider activation. No message was sent to that chat.

Other reviewed inputs: repository guide/current state and mandatory foundation
documents; accepted CP14 persistence preflight, implementation and final independent
F5/F6 recheck; SQLite50 and task/attempt contracts; CP12 offline/pass contracts and
correction report; CP13A admission/recovery and R1–R3 recheck; CP13B final integration;
Account request/apply gate; actual queue repository/engine and operational activity.
The persistence review's original FAIL is historical: its final independent recheck
is PASS. This review does not reopen or upgrade its live-security limitations.
Legacy Web, Hosted Dev and Production were not accessed.

Actual inventory matches the Builder's declared files: **13 tracked modifications
and 3 additions**, with no undeclared implementation change.

```text
Modified:
docs/API_CONTRACT.md
docs/CURRENT_IMPLEMENTATION_STATE.md
docs/OFFLINE_SYNC.md
src/data/repositories/intelligenceContinuationRepository.test.ts
src/data/repositories/intelligenceContinuationRepository.ts
src/data/sync/ledgerOperationalSync.test.ts
src/data/sync/ledgerOperationalSync.ts
src/data/sync/ledgerQueueActivity.test.ts
src/data/sync/ledgerQueueActivity.ts
src/data/sync/syncEngine.test.ts
src/data/sync/syncEngine.ts
src/data/sync/syncOperationRepository.ts
src/domain/intelligence/persistence.ts

Added:
docs/adr/2026-10-06-cp14-continuation-wake-contract.md
docs/architecture/TRIP_CHECKPOINT_14_AGENT_C2_CONTINUATION_RUNTIME_REPORT.md
src/data/sync/intelligenceContinuationWakeWorker.ts
```

No standalone wake-worker test was added; lifecycle coverage extends the existing
continuation suite. This differs from the preflight's proposed test layout, not its
required behavior. This review creates only the requested review report in the
reviewed worktree; implementation and Builder report remain unchanged.

## Independent execution

Tests ran against a disposable copy at `/private/tmp/cp14-c2-independent-review`,
linked to the existing canonical dependency tree. No package installation, real
provider, credentials, startup activation, deployment, commit or push occurred.
Review-owned tests exist only as temporary review artifacts.

| Check                                                     | Independently observed result                                                                                     |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Selected regressions                                      | 18 files / 600 tests PASS                                                                                         |
| Review-owned adversarial checks                           | 10 tests: 6 PASS, 4 expected-behavior failures, each reproducing one finding below                                |
| Unmodified C2 full suite                                  | 198 files / 2,236 tests: 2,235 PASS, 1 failed assertion, 1 failed file                                            |
| Exact accepted-base full suite, identical dependency tree | 198 files / 2,055 tests: 2,054 PASS, 1 failed assertion, 11 failed files including ten native collection blockers |
| Base with only lazy native import change                  | All ten formerly blocked files collect; 134 tests PASS                                                            |
| Typecheck                                                 | PASS                                                                                                              |
| Lint including UI guard                                   | PASS; 473 existing legacy occurrences / 76 representative UI files                                                |
| Backend build                                             | PASS, in disposable output directory                                                                              |
| Original implementation whitespace                        | `git diff --check` PASS                                                                                           |
| Historical preservation                                   | All 86 manifest entries PASS; Server83 and SQLite50 byte-identical to accepted base                               |

The common full-suite assertion is the existing `LedgerExpenseDetailScreen.tsx`
UI→API import in `src/domain/architectureBoundary.test.ts`. No global full-suite
PASS is claimed. Ordinary suites do not contain the four review-owned regressions;
their passing results do not contradict these findings. An initial supplemental
fixture omitted required queue enqueue fields; that fixture was corrected before
the final adversarial result. No implementation change was made to obtain it.

Selected regression paths:

```text
backend/src/externalIntegrationPersistence.test.ts
src/data/repositories/intelligenceContinuationRepository.test.ts
src/data/sync/syncOperationRepository.test.ts
src/data/sync/syncEngine.test.ts
src/data/sync/ledgerOperationalSync.test.ts
src/data/sync/ledgerQueueActivity.test.ts
src/data/auth/accountRequestContext.test.ts
src/data/repositories/tripImportAdmissionRepository.test.ts
src/data/interpretation/flightImportIntegration.test.ts
src/domain/trip/flightImportReview.test.ts
src/data/repositories/localCaptureInboxRepository.test.ts
src/data/repositories/tripDayReadRepository.test.ts
src/domain/trip/dayReadModel.test.ts
src/data/operations/ledgerMaintenance.test.ts
src/data/db/database.test.ts
src/data/db/checkpoint11Integration.test.ts
src/data/repositories/tripCanonicalEventRepository.test.ts
src/data/repositories/tripEventCollection.test.ts
```

Reproduction evidence retained locally:

- `/private/tmp/c2IndependentReview.test.ts` — review-owned checks plus copies of existing SQLite fixture/helpers; no production module replacement.
- `/private/tmp/c2-review-adversarial.log` and `/private/tmp/c2-review-regressions.log`.
- `/private/tmp/c2-review-full.json`, `/private/tmp/c2-review-base-full.json`, `/private/tmp/c2-review-lazy-only.log`.
- `/private/tmp/c2-review-typecheck.log`, `/private/tmp/c2-review-lint.log`, `/private/tmp/c2-review-build.log`.

To rerun supplemental checks, copy the temporary test into the disposable copy's
`src/data/repositories/c2IndependentReview.test.ts`, then run
`npm test -- --configLoader runner --maxWorkers=1 src/data/repositories/c2IndependentReview.test.ts`.
The full-suite command is the same runner without a test path. Supplemental tests
were removed from test discovery before typecheck/lint and the unmodified C2 full run.

## Required corrections

### F1 — IMPORTANT: generic dependencies mistake wake-pass completion for success

**Location:** `src/data/sync/syncOperationRepository.ts:312–336`, called by
`listPending()` at115 and ordinary `markCompleted()` at197. Sibling consumers:
`ledgerQueueActivity.ts:42–50,71–76`; `ledgerOperationalSync.ts:205–221`.

**Executed R6:** complete a wake whose continuation remains
WAITING_FOR_REMOTE_INTELLIGENCE. Enqueue an ordinary queue operation representing
work requiring an intelligence result; use the public generic
`markDependencyBlocked(child, wakeId)`, then call `listPending()`. The child changes
from DEPENDENCY_BLOCKED to **PENDING**, while the task is still **WAITING** and no
attempt/result exists. No private SQL dependency insertion is needed. The generic
admission method accepts this dependency, and its release SQL lacks a wake-kind
exclusion. The Ledger-command APPLIED-receipt condition does not protect a wake row.

The continuation repository correctly rejects a QUEUE_OPERATION dependency on a
wake and reads TASK dependency readiness from retained PUBLISHED disposition.
That local guard does not cover generic queue dependents. Activity/completion
consumers likewise use completed dependency status without distinguishing its kind.
No existing product producer currently links a Ledger operation to a wake; this is
a new contract hole at the shared admissible boundary, not a demonstrated current
financial mutation or a bypass of the five C denials.

**Required:** reject intelligence-success dependencies on wake rows at generic
admission and prevent their release at the shared completion/dependency consumers.
Keep result-dependent continuation work on TASK disposition. Preserve the existing
Ledger receipt condition. Add a real shared-repository regression; checking only
`intelligenceContinuationRepository.create()` is insufficient.

### F2 — IMPORTANT: first/re-armed wakes do not notify an idle central owner

**Location:** `intelligenceContinuationRepository.ts:380–396`;
`syncOperationRepository.ts:375–445`; existing owner listener/timer in
`ledgerOperationalSync.ts:65–119`.

**Executed R7:** subscribe to the existing queue-work notification, then call the
approved `scheduleWake()`. The durable queue reports **actionableNow=1**, but the
listener receives **zero signals**. Neither the repository nor the scheduling
helper announces committed work or kicks the owner.

After a cycle with no actionable/due work, `scheduleQueueWake()` deliberately
removes its timer. A later newly scheduled or re-armed wake consequently remains
PENDING until some unrelated Ledger activity, reconnect, cold-start or explicit
caller-run revives the owner. This is dormant work, not deletion of the SQLite
signal. Cold-start/reconnect wrappers explicitly kick and therefore mask this gap
in existing tests. Direct queue runners also mask it by calling `run()` manually.

**Required:** notify the existing owner after the Account-gated enqueue/re-arm
transaction commits successfully. Reuse its current listener/timer and fence
rollback/account transitions; do not create another scheduler. Add an idle-owner
integration test covering both first enqueue and completed-row re-arm.

### F3 — IMPORTANT: competing pre-start meter error overwrites active execution

**Location:** `intelligenceContinuationWakeWorker.ts:200–237`, especially224–237;
`intelligenceContinuationRepository.ts:observeAttempt()`.

**Executed R9:** use one retained metered, injected attempt. Both execution callers
read NOT_STARTED and pass positive undispatched proof. Caller1 prepares durable
usage, wins `beginExecution()`, and enters its injected executor. Caller2's already
in-flight `prepareUsage()` then throws before Caller2 has won execution admission.
Caller2's catch reloads Caller1's newer revision and writes **UNKNOWN/UNKNOWN** over
Caller1's **RUNNING/START_DURABLE** observation.

The catch's `!usagePrepared && integration_id !== null` branch has no check that
this invocation still owns the initial revision. It converts uncertainty about one
caller’s meter request into uncertainty about another caller's already-admitted
execution. A subsequent normal terminal report now encounters the UNKNOWN→TERMINAL
trusted-recovery requirement instead of the normal RUNNING completion path.

No duplicate provider invocation or blind redispatch was demonstrated: execution
CAS still admits one caller. This is an execution/meter recovery integrity defect,
not a new CRITICAL authority defect. Immutable request/call identity survives.

**Required:** condition pre-start uncertainty updates on the invocation's exact
initial observation/revision; never reload-and-overwrite a different caller's newer
execution. Keep execution certainty and meter uncertainty independent, preserving
confirmed durable START. Test a competing meter error while the winning executor
is active and then its normal terminal completion, with no extra provider call.

### F4 — IMPORTANT: invalid wake can remain actionable and block later work forever

**Location:** `syncEngine.ts:180–189`; `syncOperationRepository.ts:472–490,535–539`;
`intelligenceContinuationWakeWorker.ts:349–363`.

**Executed R8:** corrupt the retained wake body to `{}` in the disposable SQLite
fixture, then run the injected scheduler. Strict validation correctly rejects the
body, but `claimOperation()` runs before the engine's try/catch; the run aborts and
the row remains **PENDING**, not an admitted invalid/FAILED disposition. Repeating
the run meets the same due row and fails again before later rows are processed.
The central owner's allSettled/catch handling does not resolve or quarantine it.

Even after claim, ordinary Zod/identity Error values are classified UNKNOWN by
`syncFailureDetails()`, so the new finalizer's VALIDATION/PERMISSION terminal branch
does not cover its own local validation failures. This violates the approved
preflight requirement that invalid bodies be fenced rather than endlessly retried.
The test simulates retained corruption; it does not show normal `scheduleWake()`
creating malformed bytes, a provider dispatch, or cross-Account access.

**Required:** handle wake validation failures at the scoped admission boundary and
persist a safe, Account/generation/observed-row-conditional invalid disposition,
without trusting invalid payload identity or invoking a provider. Distinguish local
terminal validation from transient CAS/SQLite failures. Continue unrelated work;
never quarantine a changed newer signal/claim. Test both pre-claim and post-claim
validation failure, with an unrelated valid wake behind the invalid row.

## Lifecycle conclusions and limits

**Wake and attempt races:** real SQLite tests cover concurrent first enqueue,
pending coalescing, completion before/after signals, old success/error finalizers,
claim-owner mismatch, interruption/expiry, stale task CAS and concurrent runners.
A later base_version survives as PENDING; an old owner cannot settle a new claim.
Queue counts/signals/leases never allocate model attempt_sequence. The independent
cold-start plus duplicate reconnect/concurrent-run/ACK-replay vector retains exactly
one NOT_STARTED attempt even with queue attempt_count=90. F2 concerns delivery to
the idle owner, not this conditional finalization invariant.

**UNKNOWN and Account:** dispatch exceptions, possible-start timeout, missing
result/meter ACK, lease expiry and file reopen retain exact attempts; wake evaluation
cannot create a replacement for NOT_STARTED/RUNNING/UNKNOWN, retained results or
unresolved meter. `execute()` requires positive undispatched proof and persists
RUNNING before invoking its executor. UNKNOWN terminal attachment requires the
accepted exact verifier. Independent A→B→A vectors reject old attachment/evaluation/
finalization after identity returns to A. B cannot read or claim A's task; a fresh A
context can attach exact retained terminal responsibility. An old A finalizer cannot
mutate a fresh A claim. F3 requires preserving these observations under competing
pre-start meter callbacks.

**Cancellation, stale and installation:** cancel NOT_STARTED blocks dispatch;
RUNNING/UNKNOWN retains responsibility without claiming provider cancellation.
Independent canceled/stale UNKNOWN vectors attach exact late success and late COMPLETE
meter observations, preserve identity/outcome, and reject installation without calling
the installer. Existing real SQLite tests revalidate Capture bytes, Source/material,
Trip/manifest admission, Run generation, Candidate hash and Event revision; installation
rollback leaves usage/result responsibility and exact replay calls the installer once.
There is no manufactured provider failure. Owning admission/recovery callbacks are
injected local trust boundaries, not new proof of deployed membership or live provider
terminality. Prior CP13A restricted security assurance remains unchanged.

**WAIT/pass and execution separation:** all three requested WAIT reasons remain
durable with current-pass-complete true; identical WAIT is task-revision-neutral,
creates no attempt/usage and has no forced nonurgent attention. Route eligibility
and execution I/O occur outside repository gates/transactions. Enqueue, claim,
WAIT and exact installation replay never call the executor. Shadow is never current
or installable. Real provider/shadow execution remains unactivated. Typed facts
preserve independent execution, install, meter and outstanding/pass axes.

**Identity/scheduler preservation:** immutable task→attempt→request/call/usage
bindings survive cancel/stale and install failure. Fallback and shadow have distinct
ordered identities; nullable measurements remain unknown, with no local cost ledger.
The sole scheduler remains sync_operations; its existing central timer is reused,
with a null default adapter and no product-startup injection. All five C denials
are byte-identical and their permissive-filter tests pass. No new provider/vendor
selector, SDK, UI, CXE or notification sender exists. F1 is the outstanding shared
completion-semantic leak.

## Lazy native loading and historical preservation

The Ledger activity change replaces only its eager database/auth imports with
awaited dynamic imports inside `getLedgerQueueActivity()`. Existing Ledger SQL,
classifiers, asset linkage and journey display scopes are otherwise unchanged.
Imports still run before database/session reads; import errors propagate from the
getter. No native method is skipped and no new suppression is added by this change.
The independent scheduling activity is separately typed and does not enter Ledger
UI counts. The added exclusion in operational completion prevents intelligence
Trip scopes appearing as Ledger completion events.

The independent exact-base experiment changed **only** the two eager imports and
added their lazy Promise.all inside the getter, without any C2 runtime, dependency
or test changes. All ten former Flow-blocked suites then collected and passed:
**10 files /134 tests**. This establishes the reported collection improvement is
due to avoiding unnecessary eager native loading, not disabled tests. No unrelated
Ledger query/display behavior change was found. This is static production-flow
inspection and Node collection/regression evidence; device launch/native bundling
was not independently executed.

Server83 SHA-256 remains
`c759a41981f631271df7b960a7ce50dbc32e2317163ca84a7021d1cbf5e46f93`.
SQLite50 remains
`63d11a4486660d1b609395234eb3d1309960be1a2766f59f8185477f2880d2b0`.
Both match accepted-base bytes. All86 historical manifest entries match after only
the documented SQLite50 registration normalization; server count remains83 and
SQLite tail50. Accepted preflight/reviews and historical SQL remain unchanged.
No Server84/SQLite51, gate activation or hosted database access occurred.

## Explicit answers

| Question                                            | Answer                                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Wake race safe                                      | YES — durable claim/signal finalization; idle delivery defect F2 remains separate                  |
| New signal can be lost by old finalizer             | NO                                                                                                 |
| Duplicate wake can create duplicate attempt         | NO                                                                                                 |
| UNKNOWN can blind redispatch                        | NO                                                                                                 |
| Queue lease treated as execution truth              | NO                                                                                                 |
| A→B→A stale callback fenced                         | YES                                                                                                |
| Cancel/stale late install blocked                   | YES                                                                                                |
| Late usage responsibility preserved                 | YES — F3 concerns observation regression, not deletion                                             |
| Wake COMPLETED leaks intelligence-success semantics | YES — generic dependents, F1                                                                       |
| Pass-complete independent of quiescence             | YES                                                                                                |
| WAIT creates attempt/usage                          | NO                                                                                                 |
| Executor called under gate/transaction              | NO                                                                                                 |
| Shadow can install                                  | NO                                                                                                 |
| sync_operations sole scheduler                      | YES                                                                                                |
| Five C denials unchanged                            | YES                                                                                                |
| Ledger UI/activity semantics changed                | NO — direct Ledger query/display semantics preserved; invalid wake-dependent work is covered by F1 |
| Lazy native loading safe                            | YES — inspected flow plus isolated collection regression; device acceptance unexecuted             |
| Server83/SQLite50 unchanged                         | YES                                                                                                |
| Runtime/provider gates CLOSED                       | YES                                                                                                |
| New CRITICAL findings                               | 0                                                                                                  |
| New IMPORTANT findings                              | 4                                                                                                  |
| Ready for Owner Review                              | NO — correct F1–F4 and independently recheck                                                       |

**STOP — C2 INDEPENDENT CONTINUATION REVIEW COMPLETE.**

## TARGETED F1–F4 RECHECK

Date: 2026-10-06 (Pacific/Auckland). Independent, review-only targeted recheck.

**TARGETED RECHECK PASS**

All four original IMPORTANT findings are corrected. **Original IMPORTANT findings
remaining: 0. New CRITICAL findings: 0. New IMPORTANT findings: 0. New regressions:
NO. Ready for Final Owner Review: YES.** This readiness does not authorize runtime
or provider activation.

### Snapshot, scope and independent method

Reviewed the same uncommitted C2 worktree and accepted HEAD
`439168065df182975dda03a75e94908f8d9cc389`. Read the original review, updated
Builder report's `TARGETED F1–F4 CORRECTION`, actual correction diff relative to
this review's original implementation snapshot, and approved wake contract/ADR.
The human Owner approval cited above remains the authority. Builder YES answers
were treated as claims requiring verification.

The correction diff contains seven implementation files, three test files, and
incremental Builder/current-state documentation. The added Data Health changes
were included explicitly in this review. There is no corrected persistence/schema,
API contract, offline contract, ADR or product UI change. Inspected sibling
consumers independently rather than limiting review to the Builder's named tests.

Executed against `/private/tmp/cp14-c2-independent-recheck`, a disposable corrected
snapshot using the existing dependency tree. Reviewer-owned tests copy existing
SQLite fixtures/helpers but add independent assertions; they do not replace
production modules. Synthetic executors/meters exercise ownership without calling
real providers. Implementation and Builder documents were not edited. No Hosted
Dev, Production, deployment, commit or push occurred.

### F1 — DEPENDENCY SEMANTICS: FIX VERIFIED

Independent R6 repeated for WAITING_FOR_REMOTE_INTELLIGENCE, WAITING_FOR_NETWORK
and WAITING_FOR_ENRICHMENT. Each completed wake leaves its task waiting. Public
`markDependencyBlocked(child, wakeId)` rejects with
`INTELLIGENCE_WAKE_NOT_SUCCESS_DEPENDENCY`. A manually retained pre-existing
wake-dependent child remains DEPENDENCY_BLOCKED through generic pending selection
and generic completion; no attempt or intelligence result is inferred.

Reviewed both explicit dependency admission and the omitted-ID/existing-dependency
case, plus the final admission UPDATE guard against a dependency changing to wake
kind between inspection and mutation. `wakeCompletedDependencies` excludes wake
kind. Ordinary completed queue dependencies still release; result-dependent
continuation work releases on TASK PUBLISHED evidence. Those positive controls
passed in the corrected continuation suite.

Sibling inspection covered Ledger activity, operational completion scopes, Data
Health scanner/manifest, automatic convergence candidates, final repair mutation,
Ledger expense repository/consistency/causality and receipt linkage. Ledger
APPLIED-receipt predicates in shared queue release and both expense dependency
release paths are unchanged. Asset dependencies remain scoped to the separate
`ledger_asset_operations` namespace and UPLOAD_RECEIPT linkage, not wake rows.

Data Health's three generic queue projections now expose wake dependencies as
WAITING. Its repair UPDATE independently requires an Account-matching COMPLETED
non-wake dependency. Independent Health tests verified: wake dependency does not
become automatic convergence work; scanner/repair/convergence leave it blocked
without a verified repair event; ordinary mapped completed dependency still
repairs; changing the parent to wake immediately before the final repair UPDATE
cannot release the child or claim VERIFIED repair. Relevant Health and Ledger
regressions passed. No unintended repair, receipt, causality or Ledger projection
regression was found.

Key inspected locations: `syncOperationRepository.ts:271,337`;
`ledgerQueueActivity.ts:72`; `ledgerOperationalSync.ts:221`;
`dataHealthCoordinator.ts:1125,1273,1642,1786`.

**F1 FIX VERIFIED: YES**

### F2 — IDLE OWNER DELIVERY: FIX VERIFIED

Independent R7 now receives the existing queue-work signal after first enqueue.
Further reviewer assertions observe committed PENDING after COMPLETED-row re-arm,
PROCESSING after a newer signal, and the next signal generation after finalization.
Notifications occur with no SQLite transaction open. Injected rollback emits no
additional notification. Corrected tests also exercise Account changes during the
write/apply boundary and stale generation before admission: rollback/stale contexts
emit no signal.

Executed the corrected real central-owner tests with its existing listener and
fake timer: idle owner has zero timers; first scheduleWake and completed-row re-arm
each produce one existing timer and a WAIT pass; a signal during PROCESSING produces
follow-up work after the current pass without a second timer while running. A's
scheduled callback does not run after switching to B; A's row stays pending and
no A attempt is created as B. The independent A→B→A vector also passed.

Traced `scheduleWake` through repository transaction COMMIT, Account revalidation,
`announceLedgerQueueWorkAvailable`, the existing central listener, its generation
fence and existing `workSignaledDuringRun` follow-up handling. There is one central
queueTimer; existing timer assignment sites reuse it. The wake adapter contains no
timer, poller, second scheduler or controller. `sync_operations` remains the only
wake scheduling store. Separate intelligence activity stays out of Ledger UI
counts and operational Ledger completion scopes; projection tests passed.

Key locations: `intelligenceContinuationRepository.ts:390`;
`ledgerOperationalSync.ts:59,95,105`; `ledgerQueueActivity.ts:63,105`.

**F2 FIX VERIFIED: YES**

### F3 — COMPETING METER RACE: FIX VERIFIED

Independent R9 ran in both caller initiation orders with barriers proving both
callers observed NOT_STARTED and entered prepareUsage. Caller1 wins beginExecution
and enters the synthetic executor. Caller2's already-running meter preparation
then fails. The durable row remains RUNNING/START_DURABLE; caller1 subsequently
finishes TERMINAL/SUCCEEDED with COMPLETE metering. Exactly one executor invocation
occurs in each ordering, and no real provider is called.

An additional independent reverse-transition vector lets genuine meter uncertainty
arrive before the other prepared caller can beginExecution. Its revision CAS loses;
execution stays NOT_STARTED, metering UNKNOWN, neither caller reaches an executor,
and repeated execution requires exact recovery. This conservatively retains meter
uncertainty without claiming that execution started or became UNKNOWN.

Corrected targeted tests verify genuine post-start dispatch uncertainty stores
execution UNKNOWN while retaining confirmed START_DURABLE. Ordinary late reports
cannot resolve UNKNOWN without verified exact recovery; a bound recovery report
can. The independent expired-lease/restart/UNKNOWN vector still permits only the
original invocation and no blind redispatch. The correction preserves call, usage,
request and attempt identities rather than overwriting another caller's state.

Key location: `intelligenceContinuationWakeWorker.ts:200–255`. The catch now marks
pre-start meter uncertainty only against the caller's initial revision and marks
post-start execution uncertainty only after that caller won durable start.

**F3 FIX VERIFIED: YES**

### F4 — INVALID WAKE: FIX VERIFIED

Independent R8 now fences malformed `{}` as FAILED/VALIDATION. Reviewer-owned
vectors also cover malformed row ID, entity/task identity and idempotency key;
unrelated valid wake behind each invalid row completes. Invalid rows never reach
runtime evaluation/router, create an attempt or invoke an executor/provider.
Additional corrected vectors cover non-JSON, body fence mismatch, missing durable
task and malformed post-claim retained payload before router evaluation.

The existing immutable binding trigger and foreign key initially rejected the
reviewer's row-ID corruption setup. Only the disposable adversarial fixture removed
that trigger/disabled FK for the row-ID vector, simulating persisted corruption;
production protections were not modified. An initial rollback injection targeted
a task update absent on an already-bound re-arm; it was changed to the actual queue
update. These were fixture corrections, not implementation failures.

Reviewed typed validation error handling through claim, post-claim inspection and
conditional finalization. Disposition is fenced to trusted Account/Trip/kind scope
and the observed row identity, body, status, signal generation and claim. Malformed
payload Account/task fields are never authority for row mutation. Corrected race
vectors prevent stale invalid finalization from quarantining a newer signal/body;
an additional independent newer-claim vector rejects the old finalizer and retains
the new PROCESSING owner. Account switch during invalid disposition rolls back and
cannot apply A's disposition as B. A stale malformed in-memory snapshot does not
quarantine a valid retained body.

An independent injected SQLITE_BUSY before claim becomes RETRYABLE/UNKNOWN,
not VALIDATION. Corrected post-claim transient failure remains retryable. Admission
CAS mismatch returns without quarantining a changed row; final invalid-disposition
CAS cannot overwrite new row state. Typed payload/identity failures are separated
from SQLite/hash/CAS failures. Scoped claim now runs inside the engine's existing
error boundary, so invalid admission no longer obstructs subsequent valid work.

Key locations: `syncOperationRepository.ts:381,514,535,559,572,606`;
`intelligenceContinuationRepository.ts:410`; scoped claim in `syncEngine.ts`.

**F4 FIX VERIFIED: YES**

### Cross-smoke and preservation

Independent duplicate/concurrent wake, cold-start/reconnect/ACK replay vectors
preserve one attempt and immutable binding. UNKNOWN remains non-redispatchable;
lease expiry repairs transport only. A→B→A rejects old callbacks/finalizers, prevents
B reading/claiming A, and permits fresh A recovery. Cancel/stale late terminal facts
and late usage are retained while installation stays fenced. Corrected continuation
suite verifies all three WAIT/pass-complete axes, shadow no-install, late result
fences, rollback installation retry and executor/router I/O outside transactions.

The five C operation denials remain the same closed set and their permissive-filter
tests passed. Static startup-reference inspection finds no adapter/runtime factory
activation; the central adapter defaults to null. Runtime/provider gates remain
CLOSED. No new provider, SDK, UI, notification sender or alternative scheduler exists.

Lazy database/auth imports in Ledger activity remain awaited inside the getter;
errors propagate and reads follow loading. The correction does not change that
loading boundary. Relevant Node suites collect/pass; device/native launch was not
performed and no new device-validation claim is made.

All 86 historical manifest entries independently match after the already-approved
SQLite50 registration normalization. Server migration count remains83; SQLite tail
remains50. Server83 SHA-256:
`c759a41981f631271df7b960a7ce50dbc32e2317163ca84a7021d1cbf5e46f93`.
SQLite50 SHA-256:
`63d11a4486660d1b609395234eb3d1309960be1a2766f59f8185477f2880d2b0`.
Migration directory bytes are unchanged from the original C2 snapshot. No Server84
or SQLite51 was introduced.

### Independently executed validation

| Check | Observed result |
| --- | --- |
| Corrected C2 and selected regressions, including Health coordinator | 19 files / 666 tests PASS |
| Additional Health policy/scheduler/presentation and Ledger causality/retry/receipt/repository regressions | 8 files / 80 tests PASS |
| Historical Ledger recovery regression | 1 file / 11 tests PASS |
| Reviewer-owned R1–R9/cross-smoke and extra race checks | 20 tests PASS |
| Reviewer-owned Data Health scanner/repair/convergence checks | 3 tests PASS |
| Typecheck | PASS |
| Lint, including UI guard | PASS; 473 existing legacy occurrences / 76 representative files |
| Backend build, disposable output | PASS |
| Implementation whitespace | git diff --check PASS |
| Historical manifest and Server83/SQLite50 preservation | PASS |

Total independently executed tests: **780 PASS** (757 corrected/selected regression
tests plus23 reviewer-owned tests). Full repository rerun was optional and was not
repeated: no new regression was found. The original report's established full-suite
baseline failure remains recorded; this appendix does not claim global full-suite
PASS or silently remove that limitation.

Local reproduction artifacts:
`/private/tmp/c2IndependentRecheck.test.ts`,
`/private/tmp/c2IndependentHealthRecheck.test.ts`,
`/private/tmp/c2-recheck-independent.log`,
`/private/tmp/c2-recheck-selected.log`,
`/private/tmp/c2-recheck-siblings.log`,
`/private/tmp/c2-recheck-historical-ledger.log`,
`/private/tmp/c2-recheck-typecheck.log`,
`/private/tmp/c2-recheck-lint.log`,
`/private/tmp/c2-recheck-build.log`.
To reproduce supplemental tests, copy the two review-owned files into the disposable
snapshot's corresponding repository/health directories and run Vitest with
`--configLoader runner --maxWorkers=1` and those two paths. They were removed from
discovery before typecheck/lint.

The original report prefix is preserved byte-for-byte:24,269 bytes, SHA-256
`7b6ba0d947aa9226566397546a2b3ccd753b5d78c7e8561a348db94eec47fb3d`.
Only this review appendix was written to the reviewed worktree; entry hashes of
implementation and other review inputs were checked for preservation.

### Required answers

| Question | Answer |
| --- | --- |
| F1 FIX VERIFIED | YES |
| F2 FIX VERIFIED | YES |
| F3 FIX VERIFIED | YES |
| F4 FIX VERIFIED | YES |
| Original IMPORTANT findings remaining | 0 |
| New CRITICAL findings | 0 |
| New IMPORTANT findings | 0 |
| New regressions | NO |
| Duplicate attempt protection preserved | YES |
| UNKNOWN redispatch protection preserved | YES |
| A→B→A preserved | YES |
| Five C denials unchanged | YES |
| sync_operations sole scheduler | YES |
| Server83/SQLite50 unchanged | YES |
| Runtime/provider gates CLOSED | YES |
| Ready for Final Owner Review | YES |

STOP — C2 TARGETED INDEPENDENT RECHECK COMPLETE.
