# CP14 Agent C2 — durable continuation runtime

Date: 2026-10-06 (Pacific/Auckland).
Status: **AGENT C2 COMPLETE — READY FOR CONTINUATION REVIEW.**

The startup stop and approved preflight below are historical. The IMPLEMENTATION section records the final delivered capability; provider/runtime gates remain CLOSED.

## Exact start state

- Fresh managed worktree: `/Users/xoery/.codex/worktrees/cp14-c2-continuation/otr-mobile-canonical`.
- Fresh branch: `intelligence/cp14-continuation-runtime`.
- Exact HEAD/base: `439168065df182975dda03a75e94908f8d9cc389`.
- Worktree was clean before this report. No implementation was copied from another checkout.
- Server chain: 83 files, tail `20261006000100_external_integration_persistence.sql`.
- SQLite50 is registered; its source SHA-256 is `63d11a4486660d1b609395234eb3d1309960be1a2766f59f8185477f2880d2b0`.
- All 86 accepted historical baseline manifest entries match current bytes after removing only SQLite50 import/registration from the historical registration source. No Server84/SQLite51.
- Server83 retains `runtime_enabled=false` default and closed CHECK. Runtime/provider gates were not changed.
- The five C Import scheduler exclusions and their permissive-filter tests are unchanged. No scheduler, poller, provider worker or startup hook was added.

## Gate evidence

Section 6 of the supplied instruction says: “If no suitable approved operation kind exists, STOP and report the exact minimum queue-operation contract change required.” It also prohibits repurposing unrelated kinds or bypassing the five C denials. The final instruction explicitly requires stopping at this gate.

SQLite50 defines `INTELLIGENCE_CONTINUATION` as queue **entity_type**, not an operation kind. The repository `queue()` validates Account/task/entity/Trip/status but neither selects nor authorizes `operation_type`. `bindQueue()` attaches an already existing row; it does not create a scheduling contract. Attempt reservation requires a retained PROCESSING queue row.

The persistence test helper inserts `operation_type='CP14_CLOSED'` directly with status PROCESSING. This is synthetic persistence acceptance, not scheduler/runtime admission. Searches of the continuation repository/tests, sync implementation and accepted persistence preflight/report found no approved continuation wake/resume operation kind. The generic string type on `SyncOperation.operationType` permits storage; it is not authorization to invent an operation.

The five denied C kinds concern Confirmation/Event/Capture admission and cannot be reused for continuation intelligence. Existing business sync kinds likewise own unrelated mutations. The accepted preflight establishes sole scheduler ownership but does not name a continuation operation kind or define its scheduling disposition contract.

## Exact minimum contract change required

Approve one new operation kind in the existing `sync_operations` contract, provisionally **`INTELLIGENCE_CONTINUATION_WAKE_V1`**. This name is a proposal only; it was not added to code or schema. Approval must specify:

1. **Scope and immutable binding:** entity_type `INTELLIGENCE_CONTINUATION`, entity_id equal to task_id, owner_user_id equal to Account, Trip equal to the retained task where present; versioned payload `{ version: 1, account_id, task_id, publication_fence }`. Queue id/key/body stay exact for recovery; no private material or result body in queue JSON. Define stale-fence disposition and explicit supersession before replacing a binding.
2. **Scheduling ownership:** existing queue repository/engine alone enqueues, claims, blocks, wakes and backs off. Task journals remain logical/execution authority. Specify one retained binding per task and atomic enqueue/bind under the Account apply gate. No model attempt on create, enqueue or waiting wake; attempt sequence is independent of queue attempt_count.
3. **Wake/dispatch admission:** permit only an explicitly injected, closed continuation adapter in deterministic acceptance. It reloads task/dependencies/pins and checks current Account generation, fence and local admission; router/executor I/O runs outside gates/transactions. Existing five C exclusions remain unconditional and real-provider/runtime gates remain CLOSED.
4. **Queue disposition:** explicitly map resolvable waits to retained blocked/retryable responsibility and central wake triggers; define pass-complete independently. A waiting handler must not return through generic successful `push()` and falsely complete its outstanding queue responsibility. Specify cancellation/staleness handling when execution or usage remains unresolved.
5. **Recovery/UNKNOWN:** reclaims, process restart, reconnect, missing callback, timeout and lease expiry inspect the same retained attempt; none authorize redispatch. RUNNING/UNKNOWN requires exact admitted recovery. Define queue responsibility while recovery/metering/install is pending, and how late terminal/usage attaches after cancel/stale.
6. **Terminal completion:** complete queue responsibility only after the admitted durable disposition; successful execution, installation, publication and metering remain independent. Exact result installation retry cannot execute the provider again. Shadow never installs.

This is an operation-kind/adapter contract preflight, not a request for a second scheduler or new durable table. **No migration need is established by this gate.** Existing queue storage uses string operation kinds and SQLite50 supplies journals, references and retention. Any later proof that a migration is needed must trigger the separate migration hard stop before authoring it.

## Validation and scope

Static startup checks above PASS. Gate evidence was inspected in the exact-base source. No runtime implementation or tests were added. Focused lifecycle tests, migration replay, selected regressions, typecheck, lint/UI guard and Backend build were not executed after the mandatory stop; no runtime acceptance or full-suite PASS is claimed. The fresh worktree has no dependency installation; dependencies were not installed or changed.

Classification: **existing approved-contract blocker**, not a new regression or implementation defect. The existing persistence capabilities are not presented as completed C2 reconnect/runtime adaptation. Remaining normative implementation inputs and lifecycle acceptance are deferred until the queue contract is approved; no claim that all implementation inputs were read is made.

Only this report was added. CURRENT_IMPLEMENTATION_STATE and accepted preflight/review/Apple reports remain unchanged because no capability closed. No provider/vendor hard-coding, real provider call, notification, UI, Apple activation, Hosted Dev/Production access, migration, commit or push.

**STOP — QUEUE-OPERATION CONTRACT REQUIRED.**

## QUEUE OPERATION PREFLIGHT

Date: 2026-10-06 (Pacific/Auckland). **Bounded proposal; no contract implementation.**
Owner-approved semantic direction: `INTELLIGENCE_CONTINUATION_WAKE` means only wake the referenced durable continuation and re-evaluate WAIT / CREATE_ATTEMPT / TERMINATE. The unversioned operation name replaces the earlier provisional `INTELLIGENCE_CONTINUATION_WAKE_V1`; version belongs in the payload. This section also supersedes the earlier proposal that queue completion must await intelligence closure: **completion of this operation means completion of its wake evaluation pass only.**

### 1–2. Actual vocabulary and validation locations

There is no central sync operation enum or registration table. Vocabulary is distributed across producers and consumers. In particular, the generic queue is not constrained by a TypeScript operation union.

| Boundary                           | Exact location and current behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SQLite queue schema                | `src/data/db/migrations.ts`, migration1 `foundation_sync_tables`, lines17–33: `operation_type TEXT NOT NULL`; no kind CHECK, enum table or operation-key UNIQUE. The primary key is `id`. Later alterations at lines757–758, 888–890 and1193–1205 add claims, Account ownership, failure/dependency fields and indexes, without restricting kinds.                                                                                                                                         |
| Separate asset vocabulary          | Same file lines457 and1321: operation CHECKs belong to `ledger_asset_operations`, not `sync_operations`. `src/data/repositories/ledgerReceiptRepository.ts:41` has an asset-operation union. Neither needs modification for intelligence wake.                                                                                                                                                                                                                                             |
| Generic TS queue shape             | `src/data/sync/syncOperationRepository.ts:21`, `SyncOperation.operationType: string`; `EnqueueSyncOperation` derives from it. The status union restricts statuses only.                                                                                                                                                                                                                                                                                                                    |
| Generic queue repository           | Same file `enqueue()` inserts supplied kind/key/payload without runtime kind/schema validation or dedup; `listPending()` reads kinds as strings. `claim()` admits due PENDING/RETRYABLE rows for the active Account, irrespective of kind. `recoverInterrupted()`, `markRetryable()` and `wakeCompletedDependencies()` manage queue lifecycle, not operation vocabulary.                                                                                                                   |
| Engine gate                        | `src/data/sync/syncEngine.ts:132–138`, `closedImportOperations`; `createSyncEngine()` lines160–164 applies that deny set plus caller `shouldProcess`. There is no global positive-kind allowlist or switch; default filter is permissive. Worker success currently causes unconditional `markCompleted(id)`.                                                                                                                                                                               |
| Basic producer/consumer kinds      | `src/data/repositories/expenseRepository.ts:24` and `itineraryRepository.ts:27`; worker checks in `src/data/sync/expenseSyncWorker.ts:15–25` and `itinerarySyncWorker.ts:15–25`; coordinator filters in `expenseDemoCoordinator.ts:24–29` and `itineraryDemoCoordinator.ts:22–28`.                                                                                                                                                                                                         |
| Ledger Expense vocabulary          | `src/data/repositories/ledgerExpenseRepository.ts:286–290` constants and its enqueue helpers; `ledgerCollaborationRepository.ts:140,191,232` adds resolution/correction kinds. `src/data/sync/ledgerExpenseDemoCoordinator.ts:31–44` filters entities, not a complete kind list; `ledgerExpenseSyncWorker.ts` `push()` and `buildMutation()` branch on supported kinds, ending with unsupported rejection at line542.                                                                      |
| Ledger Personal Payment vocabulary | `src/data/repositories/ledgerPersonalPaymentRepository.ts:38–42`, `personalPaymentOperations`; `src/data/sync/ledgerPersonalPaymentSyncWorker.ts:28–36` validates entity and `Object.values(personalPaymentOperations)`; `ledgerPersonalPaymentCoordinator.ts:17–25` selects the entity.                                                                                                                                                                                                   |
| Ledger settlement vocabulary       | `src/data/repositories/ledgerSettlementRepository.ts:197,231,324,364` creates payment/action/correction/finalization kinds; `src/data/sync/ledgerSettlementPaymentSyncWorker.ts:28–69` checks kinds and rejects unsupported; `ledgerSettlementPaymentCoordinator.ts:16–27` filters entities.                                                                                                                                                                                               |
| Review vocabulary                  | `src/data/repositories/ledgerReviewRepository.ts:203,311`; `src/data/sync/ledgerReviewCoordinator.ts:14–46` selects `LEDGER_REVIEW_ACTION` / `RAISE_LEDGER_REVIEW_FINDING`. `personalSettlementReviewRepository.ts:121` and `personalSettlementReviewCoordinator.ts:29–54` use `CREATE_SETTLEMENT_REVIEW_CHECKPOINT`.                                                                                                                                                                      |
| Participation vocabulary           | `src/domain/trip/personParticipationCommand.ts:88`, `participationOperationType`; `src/data/repositories/tripPersonParticipationPendingRepository.ts` `retain()`/stored-body validation and `ledgerReadRepository.ts:122` validate its own kind. This closed recovery seam is not a continuation operation.                                                                                                                                                                                |
| C Import vocabulary                | `src/data/repositories/tripImportAdmissionRepository.ts`, shared `enqueue()` lines96–112 and callers at883,966,1047,1086; Capture admission lives in `src/data/repositories/captureSourceAdmissionRepository.ts:489`. These create the five existing C kinds and remain scheduler-denied.                                                                                                                                                                                                  |
| SQLite50 queue binding             | `src/data/db/migrations/intelligenceContinuations.ts`: `intelligence_queue_scope` line6; task/attempt scope triggers158–161; retain trigger162; binding-immutable trigger179–183. These check scope/reference/PROCESSING status, not kind/key/body.                                                                                                                                                                                                                                        |
| Continuation repository            | `src/data/repositories/intelligenceContinuationRepository.ts`, `queue()` lines278–298, `bindQueue()` lines340–356, `reserveAttempt()` from447: exact Account/task/entity/Trip/claim checks, but no operation-kind or payload validation.                                                                                                                                                                                                                                                   |
| Tests and guards                   | `src/data/sync/syncEngine.test.ts:195–221` tests all five denials under a permissive filter; `syncOperationRepository.test.ts` tests Account-scoped listing and claim after switching; individual `*SyncWorker.test.ts` and coordinator tests cover their own kinds. `intelligenceContinuationRepository.test.ts:152` uses synthetic `CP14_CLOSED`. `src/domain/architectureBoundary.test.ts` and `scripts/ui/check.ts` supply architectural/UI guards, not a central queue-kind registry. |

All paths above are relative to this exact-base C2 worktree. No supported kind is inferred from mere string storage or test fixtures.

### 3. Migration answer

**No SQLite51, Server84, historical migration edit or second scheduler is required.** A disposable in-memory Node SQLite replay of all existing migrations through50 accepted an `INTELLIGENCE_CONTINUATION_WAKE` row. The resulting schema confirms TEXT kind storage, `id` primary-key dedup and SQLite50's composite Account/id unique index. This proves storage compatibility only, not admission or runtime readiness. No server command is involved in scheduling a local wake.

### 4. Minimum references and identity

Proposed strict payload:

```json
{
  "version": 1,
  "account_id": "<Account UUID>",
  "task_id": "<continuation UUID>",
  "expected_publication_fence": 1,
  "wake_reason": "REEVALUATE"
}
```

Account/task must equal queue owner/entity and the retained continuation. Queue `entity_type` is `INTELLIGENCE_CONTINUATION`; `trip_id` is the task's nullable Trip; no Trip/policy/input/result state is duplicated in payload. Validate UUIDs, positive safe-integer fence, exact version/reason and unknown-field rejection. `REEVALUATE` is one finite v1 scheduling reason, independent of the task's three wait reasons. Reconnect, dependency availability, cold recovery and capability changes all coalesce into it; they do not allocate separate reason-specific rows.

**Do not persist an expected task row_revision in the payload.** Binding, waiting and pass completion advance it, so a fixed value would invalidate a legitimate delayed wake. Evaluation loads the current row_revision under a fresh Account context and uses it as the exact CAS revision for every task mutation. The expected publication fence is durable in the payload and must match before new attempt admission. A CAS miss reloads/re-evaluates; it never relaxes pins or creates an attempt from stale state.

Use deterministic queue `id` and `idempotency_key`, both `icw:` plus the SHA-256 of a canonical tuple `(operation name, payload version, Account, task, initial publication fence, REEVALUATE)`. This fits the existing128-character label bound. Recompute/verify it at enqueue and wake. Same identity with changed body/scope rejects. A queue key is not a task logical request key, model request key or usage correlation.

Propose using the existing queue `base_version` as a positive safe-integer **wake signal generation**, starting at1. For this kind only it tracks scheduling signals; it is neither a task revision nor an Event baseline, and never provider execution evidence. This avoids adding a column or putting scheduler state in the continuation journal. Bound overflow rejects without clearing responsibility.

### 5. Bounded dedup and re-arming

One retained queue row per task's admitted initial fence/version/reason, with the same ID/key/body throughout v1. First enqueue and `bindQueue()` must occur atomically under the Account apply gate and SQLite transaction; use existing transaction ownership, not nested transactions or external I/O.

- Concurrent first enqueue uses the deterministic primary key; on conflict read/validate the existing exact row. Do not rely on `idempotency_key`, which has no UNIQUE constraint.
- Repeated scheduling while PENDING/RETRYABLE coalesces into that row, optionally advances its wake signal generation and brings its due time forward. It does not reset model responsibility or queue attempt_count.
- A new admitted scheduling signal after COMPLETED re-arms that same row to PENDING. Completion is not a permanent tombstone for future evaluation.
- A signal during PROCESSING advances wake signal generation while retaining the current claim. The worker finishes against its claimed signal snapshot; conditional finalization leaves the row PENDING if a later signal exists. Completion/error handling must not overwrite that signal.
- Same-task cancellation/staleness advances its task fence. The old row may evaluate an admitted fenced disposition/recovery responsibility but cannot create an attempt under its obsolete fence. Do not allocate a replacement wake binding. Explicit supersession retains the predecessor and uses the separately admitted successor task. Any future same-task rebinding contract is outside this v1 preflight.

SQLite50 `bindQueue()` currently rejects switching to a different queue ID; this design respects that invariant. Journal references retain the completed row. Row count stays bounded even over repeated reconnects and wakes. A scheduling signal is not a poller or autonomous retry loop.

### 6. Claim and evaluation

The existing queue claims the row; an explicitly injected closed adapter selects **both** exact entity and operation kind. Claim verifies Account, deterministic identity/payload and the observed wake signal generation, then captures a fresh AccountRequestContext and loads the exact task. A stale pre-claim signal snapshot fails/reloads the queue claim. Only the continuation runtime chooses:

| Decision       | Meaning                                                                                                                                                                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WAIT           | Persist/retain admitted wait and current-pass state; no attempt or usage.                                                                                                                                                                                                                       |
| CREATE_ATTEMPT | After independent dependencies, network/capability/router/policy/budget/pin/fence admission, reserve/bind the exact attempt locally through SQLite50. No provider I/O in the wake operation. Duplicate evaluation inspects the retained current attempt, never allocates another automatically. |
| TERMINATE      | Persist or observe an admitted terminal/canceled/stale disposition while retaining unresolved execution/usage responsibility.                                                                                                                                                                   |

The bounded queue implementation should expose only this decision seam and deterministic adapters; full continuation/runtime adaptation remains a later C2 step. The wake kind cannot invoke an executor/provider. A RUNNING/UNKNOWN attempt routes to WAIT/exact recovery responsibility, never CREATE_ATTEMPT merely due to a claim. Any later dispatch remains separately gated and is not implied by this contract.

### 7. Completion is a wake-pass fact

`COMPLETED` means **this wake/re-evaluation pass completed**. WAIT, safe local attempt reservation, and admitted TERMINATE can all complete a pass once its decision is durable. It does not certify remote completion, successful execution, usage completion, quiescence or canonical Import completion. This corrects the earlier stop report's broader completion proposal.

The journal keeps outstanding work and wait state after queue completion. An actual later central scheduling signal re-arms the same row; cold start/reconnect must inspect retained journals rather than equating completed queue rows with closed tasks. No in-memory authoritative wait state or feature-owned timer.

Conditional completion must verify Account, exact row/kind/body, captured generation, PROCESSING claim owner and wake signal snapshot. A newer signal keeps PENDING; no later signal allows COMPLETED. Apply the same conditional ownership rule to error/retry disposition so an old handler cannot erase another claim or wake. Release claim fields only for the owned claim. A durable decision followed by lost completion ACK repeats evaluation of the same task/attempt; it does not repeat provider execution.

**A dependency on a wake row's COMPLETED status proves only evaluation completion.** It must not release work requiring intelligence/publication completion. Such dependencies use the existing TASK dependency and exact retained task disposition, not QUEUE_OPERATION completion of this kind. Future admission must reject such misuse. Existing generic dependency wake SQL cannot infer intelligence success.

### 8. Retry/backoff

Use existing `nextSyncAttemptAt()`, RETRYABLE and attempt_count for evaluation failures only. Normal WAIT is a successful evaluation, not an error or a model retry. New events/explicit policy due times re-arm through the existing scheduler; do not repeatedly enqueue while an unchanged wait is unresolved.

Validation/body mismatch is a fenced invalid queue disposition, not endless retry. Transient SQLite/CAS/evaluation failure can retry the same wake; Account changes pause/recover without applying another Account's disposition. Lease/process recovery may make the wake RETRYABLE and preserve the signal, while leaving NOT_STARTED/RUNNING/TERMINAL/UNKNOWN unchanged. A timeout or missing metering/result/ACK never authorizes redispatch. Positive undispatched evidence remains an independent continuation admission requirement.

### 9. Account, revision and Trip fences

| Case                         | Required behavior                                                                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A→B                          | Account-scoped claim excludes A; in-flight A evaluation fails its generation/context check before local apply or queue finalization. It cannot update B or disclose A material.                                                               |
| A→B→A                        | Old A generation still fails even though Account equality returns. A fresh explicit wake captures new generation and revalidates exact task/fence/pins; cold restart also requires fresh context, never a persisted process-generation value. |
| Task row_revision changed    | Reload and CAS on the actual current revision. No stale decision write, automatic attempt or guessed merge. Exact input/manifest/Run/Candidate/Event pins remain normative.                                                                   |
| Fence changed/canceled/stale | No fresh attempt/install/publication from the old fence. Complete the wake only after admitted fenced observation; retained late terminal/usage responsibility survives.                                                                      |
| Trip deleted/inaccessible    | Current local admission denies protected evaluation/attempt/install/disclosure. Persist an admitted safe blocked/terminal fact when permitted; retain execution/usage evidence. No network re-login or invented provider failure.             |

Current generic queue completion/error methods mostly update by ID and do not enforce the full Account/claim/signal fence. The new kind requires scoped conditional repository finalizers, not reliance on the engine's generation check alone. No external I/O under Account gate or SQLite transaction.

### 10–11. Unchanged denials and independent counters

Verified source retains exactly `C_PREPARE_CONFIRMATION`, `C_EXECUTE_EVENT_SLOT`, `C_FINALIZE_EVENT_SLOT`, `C_ADMIT_CAPTURE_SOURCE`, `C_REVOKE_EVENT_SLOT` in the unconditional engine deny set and all five permissive-filter tests. The proposed operation neither renames nor aliases them.

`syncOperationRepository.ts` `markRetryable()` increments queue attempt_count; `syncEngine.ts` passes it to backoff. SQLite50 `attempt_sequence` is separate, and `reserveAttempt()` validates concrete execution lineage. Neither claim nor queue count/signal nor lease creates a model sequence. This distinction must remain covered by bounded acceptance.

### 12. Existing references and exact missing application invariants

SQLite50 already supplies composite Account/queue FKs, FK-OFF scope triggers, claimed-row requirement for attempt insertion, queue binding immutability, retained task/attempt/dependency rows and protected evidence. `src/data/operations/ledgerMaintenance.ts` `cleanupReconstructibleLedgerData()` excludes all three intelligence queue references from completed-row cleanup. Reusing a retained completed wake row does not defeat these guards. Historical SQL remains unchanged.

Missing **application** invariants are precise: (a) kind/body/key validation at enqueue/bind/claim; (b) deterministic duplicate read/replay under one transaction; (c) coalesced re-arm and claim/signal-aware Account-gated finalization; (d) no intelligence-success dependency inference from wake completion. SQLite does not enforce immutable operation_type/key/payload/base_version on referenced rows; the existing queue-binding trigger covers id/owner/entity/Trip only. All writers of this new kind must use the validated repository boundary. No database-enforced new uniqueness or new durable authority is needed for the bounded existing single-device repository model.

Actual scheduler integration is also absent: `ledgerQueueActivity.ts` filters Ledger entities and `ledgerOperationalSync.ts` runs only Ledger coordinators. Adding this name alone will not provide automatic reconnect/cold wake. Future C2 integration must extend the existing central scheduling/activity seam with typed scoped intelligence activity, preserving Ledger-only UI counts; no new timer/controller/poller. The bounded queue contract remains unwired and must not activate startup/providers.

### 13. Exact proposed change inventory (future; none performed)

For bounded contract implementation after approval:

- `src/domain/intelligence/persistence.ts`: strict wake payload/kind/identity contract; reuse canonical JSON/hash conventions.
- `src/data/repositories/intelligenceContinuationRepository.ts`: atomic enqueue-or-exact-replay/bind and operation/body/scope checks, using the existing transaction owner. No duplicated task state.
- `src/data/sync/syncOperationRepository.ts`: wake-specific dedup/re-arm/claim/signal conditional finalization using existing fields; keep ordinary business behavior intact.
- `src/data/sync/syncEngine.ts`: pass the claimed wake identity/signal to scoped finalization on success/error; retain unconditional five-kind denial. Keep generic business worker semantics unchanged.
- New `src/data/sync/intelligenceContinuationWakeWorker.ts`: smallest injected evaluation-only worker/filter seam, unwired, no executor/provider/scheduler.
- Tests: existing `intelligenceContinuationRepository.test.ts`, `syncOperationRepository.test.ts`, `syncEngine.test.ts`, plus new `intelligenceContinuationWakeWorker.test.ts`. Cover first/concurrent dedup, changed body, re-arm, in-flight signal/finish race, Account transition, stale fence, WAIT completion, retry count independent of attempt sequence and all five denials.
- This C2 report: implemented facts/validation only after that stage closes.

Later C2 scheduler integration would additionally touch `src/data/sync/ledgerOperationalSync.ts`, `ledgerQueueActivity.ts` and their matching tests to extend the existing scheduling owner; that work is not authorized by this preflight. No migration, Backend, UI, Apple, historical preflight/review or current-state edit is required now.

### 14. Explicit answers

| Question                                            | Answer |
| --------------------------------------------------- | ------ |
| New queue operation required                        | YES    |
| Proposed name appropriate                           | YES    |
| SQLite51 required                                   | NO     |
| Server84 required                                   | NO     |
| Historical migration change required                | NO     |
| Second scheduler required                           | NO     |
| Existing sync_operations can own scheduling         | YES    |
| Wake creates model attempt automatically            | NO     |
| Wake completion means intelligence completion       | NO     |
| Queue retry authorizes provider retry               | NO     |
| Queue lease is execution truth                      | NO     |
| Five C operation denials remain unchanged           | YES    |
| C2 can resume after bounded contract implementation | YES    |

The final YES is conditional on owner approval, bounded implementation and its acceptance checks; it does not authorize resuming runtime now or declare C2 complete.

Preflight validation: exact HEAD unchanged; fresh in-memory SQLite0→50 and proposed literal storage compatibility PASS; inspected SQLite constraints/indexes, repository/engine/worker vocabulary, generation/apply gate, references/maintenance and existing denial tests. No runnable implementation acceptance, provider execution, full regression/build/lint or device assurance is claimed. Only this report is changed; no queue operation, migration, runtime, commit or push was authored.

**STOP — READY FOR QUEUE CONTRACT OWNER REVIEW.**

## IMPLEMENTATION — approved C2 continuation adaptation

Date: 2026-10-06 (Pacific/Auckland). Exact retained HEAD/base remains
`439168065df182975dda03a75e94908f8d9cc389`; branch and worktree are unchanged.
Owner approved the preflight and separately authorized integration with the existing
central scheduling/activity seam. Changes are unstaged/uncommitted.

### Delivered queue contract and scheduling integration

- The strict approved v1 payload and `INTELLIGENCE_CONTINUATION_WAKE` kind are defined
  beside the accepted persistence types. Deterministic SHA-256 queue ID/key covers
  kind/version/Account/task/fence/reason. Payload carries references, not copied task
  state or row_revision. Exact body/scope/key mismatches reject.
- `scheduleWake()` performs first enqueue/bind or exact retained-row re-arm under the
  existing Account gate/SQLite transaction. Repeated signals increment existing
  queue `base_version` as wake signal generation, not Event/task/model revision.
  Primary-key dedup plus the existing serialized transaction bounds row count.
- The queue repository owns scoped claim/finalization. Fresh per-claim labels retain
  the existing process-owner prefix, so interruption recovery distinguishes a live
  same-process wake from a lost process. Expired leases re-evaluate the same durable
  task; they never reclassify an attempt as undispatched. Scoped completion/error
  finalization checks Account/generation, claim owner, body and signal snapshot.
  A newer signal survives as PENDING. COMPLETED rows can be re-armed with the same ID.
- The shared engine supports optional operation-scoped claim/finalization hooks;
  intelligence wakes are excluded unless these hooks exist. The five C Import
  denials remain byte-identical and unconditional. Ordinary worker behavior stays
  on its existing path. A wake pass may complete after WAIT or an admitted local
  attempt reservation; it does not mean intelligence, publication, metering or
  canonical Import completion.
- `createIntelligenceContinuationScheduling()` supplies a closed injected adapter.
  The existing `ledgerOperationalSync` owner accepts it, schedules its cold-start
  and reconnect signals, includes its run in the existing cycle and combines typed
  intelligence due activity into the existing single queue timer. No new timer,
  poller, controller or provider worker exists. Ledger UI/activity counts and Ledger
  completion scopes exclude intelligence. The default adapter remains null: no
  credentials/provider factory or unconditional product startup activation is added.
- Native database/session imports in the Ledger activity getter are now lazy. Pure
  queue imports do not eagerly load native React Native modules. Ledger query and
  display semantics are preserved; the baseline native collection blockers also
  disappear in the local full-suite run.

### Continuation, execution, installation and facts

- Existing SQLite50 create/exact replay keeps immutable Account/Import/manifest,
  input/material, consumer/schema, policy/budget, Run/Candidate/Event and logical
  request pins. Creation/scheduling/waiting does not reserve an attempt.
- Re-evaluation reloads the exact claimed binding, task fence, current CAS revision,
  dependencies and owning local admission. Dependency on a wake row's COMPLETED
  status is rejected as intelligence-success evidence. It uses the existing TASK
  dependency instead. Dependency/network waits can coexist; the injected router may
  supply additional exact wait reasons. Repeated identical waiting evaluations are
  revision-neutral. All three required reasons persist independently of pass completion.
- Router input includes capabilities/modalities/schema, privacy/network/online,
  latency/risk/budget/shadow policy. Its only outcomes are WAIT/UNAVAILABLE/ELIGIBLE
  with exact immutable attempt pins. No duplicated routing algorithm or vendor
  selector is installed. ELIGIBLE admission rechecks current queue claim/signal,
  task CAS, policy, material and publication fence before reservation. Descriptor
  network requirements independently withhold offline reservation.
- The runtime never allocates a replacement for retained NOT_STARTED/RUNNING/UNKNOWN,
  retained results or unresolved metering. A separately admitted terminal failure
  may receive a new explicitly linked fallback attempt; request/key reuse rejects.
  Attempt sequence remains independent of queue attempt_count. Existing ordered
  predecessor/fallback/shadow histories and usage correlation stay in SQLite50.
- The executor is an explicit injected lifecycle method, never called by wake or
  central scheduling. It requires positive undispatched proof, prepares exact usage
  outside the gate, then persists RUNNING before possible execution. Lost dispatch
  ACK, may-have-started loss, timeout and uncertain metering preserve UNKNOWN/exact
  recovery responsibility. No blind redispatch or inferred zero usage is admitted.
  Strict result reports bind Account/task/attempt/request/body digest/call correlation.
  UNKNOWN terminal recovery still requires the accepted trusted exact verifier.
- Cancellation fences publication before any optional injected cancellation call.
  Missing/unsupported acknowledgement proves nothing. NOT_STARTED cancellation can
  remain cleanly undispatched; RUNNING/UNKNOWN retains late execution/result/usage
  responsibility. Old A callbacks fail after A→B→A; fresh A may attach exact retained
  recovery/usage under a new context. Explicit staleness/supersession uses existing
  fences and retained predecessor/domain lineage, never a queue lease or new key as
  no-execution proof.
- Installation remains the accepted repository transaction, separate from execution.
  It rechecks Account, manifest/Trip, material, Run generation/Candidate hash/Event
  revision and cancellation/publication fence. Failed revalidation or rollback does
  not manufacture provider failure, erase usage or call the executor again. Exact
  installed-publication replay does not repeat the installer. Shadow never installs.
  `publishLocal()` supports an admitted sufficient local result without an attempt
  or outstanding deferred work. Installer callbacks are local-only, as required by
  the existing repository contract; no external I/O occurs in tested gate/transaction
  callbacks.
- `fact()` obtains one admitted Account-gated snapshot of task and attempts. Its typed
  presentation-neutral fact exposes Account/task/Import/optional Trip, independent
  state/pass/outstanding/current-attempt execution/outcome/install/meter axes, finite
  attention reason, evidenced deadline input, safe attempt/unresolved counts and
  publication/result/revision/fence references. Nonurgent resolvable waits require
  no attention; unsupported/exhausted work and evidenced urgency can require it.
  Urgency horizon is an explicit policy input, with no architectural24h constant.
  Revoked Trip or stale Account contexts withhold protected facts. No notification
  copy, sending, UI, CXE or cost ledger is added.

### Exact implementation inventory

- `src/domain/intelligence/persistence.ts`: wake payload and neutral router/executor/report types.
- `src/data/repositories/intelligenceContinuationRepository.ts`: atomic scheduling,
  claimed wake inspection, safe CAS/admission, independent local publication and
  execution start, attempt reads and admitted atomic facts; existing result recovery remains authoritative.
- `src/data/sync/syncOperationRepository.ts`: deterministic wake identity, re-arm,
  per-claim process labels, Account-gated conditional wake lifecycle and injected clock.
- `src/data/sync/syncEngine.ts`: scoped hooks and guard; five existing denials unchanged.
- `src/data/sync/intelligenceContinuationWakeWorker.ts`: injected runtime and closed
  scheduling adapter; no native/provider implementation.
- `src/data/sync/ledgerOperationalSync.ts` / `ledgerQueueActivity.ts`: existing central
  owner integration and separately scoped intelligence activity; no Ledger UI counts mixed.
- Existing continuation, sync-engine, Ledger operational-sync/activity tests extend
  the existing fixtures. No new framework, dependency or durable table.
- `docs/adr/2026-10-06-cp14-continuation-wake-contract.md` records the approved queue semantics.
- This report, `docs/OFFLINE_SYNC.md`, `docs/API_CONTRACT.md` and current-state handoff
  record only the implemented closed capability. Approved persistence/preflight/
  independent review/authority ADR and original Apple/C reports are not rewritten.

### Acceptance and validation

| Final check                                 | Evidence                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| C2 SQLite/repository acceptance             | 79 tests PASS, including unchanged original persistence tests plus new lifecycle/queue checks             |
| Selected required regressions               | 18 exact files / 600 tests PASS in final run                                                              |
| Final full suite                            | 198 files / 2,236 tests: 2,235 passed, 1 failed; exactly one failed file                                  |
| Exact-base full suite, same dependency tree | 198 files / 2,055 tests: 2,054 passed, 1 failed; ten additional native collection blockers                |
| Typecheck                                   | PASS                                                                                                      |
| Lint/UI guard                               | PASS, no warnings; 473 existing legacy occurrences / 76 representative UI files                           |
| Backend build                               | PASS                                                                                                      |
| Historical preservation                     | All 86 accepted historical hashes, SQLite50, Server83 and accepted persistence review/preflight unchanged |
| Five C denials                              | Deny set byte-identical; all five existing permissive-filter tests PASS                                   |
| Changed-file formatting/whitespace          | PASS                                                                                                      |

Full-suite comparison used a disposable exact `git archive` of the requested base,
with the same installed node_modules and `--configLoader runner --maxWorkers=1`.
The only remaining assertion in both runs is the existing Ledger Expense Detail
UI→API architecture boundary violation in `src/domain/architectureBoundary.test.ts`.
No new failed file/assertion is introduced. Lazy native loading permits all ten
previously blocked suites to collect; no test was skipped or disabled. The final
selected18 paths match the persistence review's15-path matrix plus queue repository,
central operational-sync and activity suites.

Reproducible full check: `npm test -- --configLoader runner --maxWorkers=1`.
Compact run evidence is retained locally in `/private/tmp/c2-base-full.json` and
`/private/tmp/c2-final-full.json`; these are temporary validation artifacts, not
product data or repository deliverables.

Classification: **NEW REGRESSION: none**. **IMPLEMENTATION DEFECT: resolved** —
live wake claims initially had a different owner namespace from generic interruption
recovery; process-prefixed per-claim labels and one injected queue clock fix that
root cause, with a concurrent-runner test. **EXISTING BASELINE BLOCKER:** the one
unchanged Ledger UI architecture assertion. **ENVIRONMENTAL:** the first Backend
build could not create the managed worktree output directory under the filesystem
sandbox; the authorized rerun passed. No blanket full-suite PASS is claimed.
The focused C2 repository acceptance uses the existing real SQLite fixture with FK
ON/OFF and real file reopen. Coverage includes enqueue/concurrent dedup/key/body,
coalescing/re-arm/in-flight signal and claim-owner races, all waits/current-pass,
reconnect/duplicate wake, cold WAITING/RUNNING/RESULT_PENDING/UNKNOWN/canceled,
process/lease/dispatch/timeout/meter uncertainty, actual Account generations,
Trip admission/Run/Candidate/Event revision rejection, canceled late terminal/usage,
explicit fallback/shadow, result installation rollback/replay and configurable
attention. Central tests prove cold/reconnect uses its existing timer and Ledger
presentation queries stay scoped.

No Hosted Dev/Production access, SQL/server deployment, provider/network model call,
secret resolver, inbound client runtime, UI, notification, Apple activation or
commit/push occurred. Apple's inspected iOS27 direct-image SDK finding remains
separate from real-device readiness/quality/latency **NOT_VERIFIED**; OCR is not
claimed as visual understanding. No new Apple measurements were performed.

### Required final answers

| Question                                   | Answer                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| Agent C2 complete                          | YES                                                                                    |
| Uses Server83/SQLite50                     | YES — accepted identity/usage correlation and unchanged SQLite50; no server invocation |
| New migration required                     | NO                                                                                     |
| sync_operations sole scheduler             | YES                                                                                    |
| Second scheduler added                     | NO                                                                                     |
| All three WAITING reasons supported        | YES                                                                                    |
| Pass-complete independent of quiescence    | YES                                                                                    |
| Reconnect implemented                      | YES — injected adapter in existing central owner                                       |
| Cold restart implemented                   | YES — file-backed journals and central wake seam                                       |
| A→B→A fenced                               | YES                                                                                    |
| UNKNOWN blind redispatch possible          | NO                                                                                     |
| Queue lease treated as execution truth     | NO                                                                                     |
| Cancellation preserves late responsibility | YES                                                                                    |
| Stale Trip/Candidate/Event install fenced  | YES                                                                                    |
| Attempt↔usage identity preserved           | YES                                                                                    |
| Real provider invoked                      | NO                                                                                     |
| Provider/vendor hard-coded                 | NO                                                                                     |
| Notification-ready fact implemented        | YES                                                                                    |
| Notification sent                          | NO                                                                                     |
| Apple runtime activated                    | NO                                                                                     |
| UI added                                   | NO                                                                                     |
| Runtime/provider gates CLOSED              | YES                                                                                    |
| Hosted Dev/Production accessed             | NO                                                                                     |
| Commit                                     | NO                                                                                     |
| Push                                       | NO                                                                                     |

**STOP — AGENT C2 COMPLETE / READY FOR CONTINUATION REVIEW.**

## TARGETED F1–F4 CORRECTION

Date: 2026-10-06. Builder correction of the four IMPORTANT implementation defects
in the preserved independent review. These were **C2 defects**, not baseline
failures. This section supersedes the original readiness statement for these four
boundaries; the review itself is unchanged and independent recheck remains pending.
The approved v1 wake payload, single retained row/signal contract and closed gates
are unchanged. Exact HEAD/base remains `439168065df182975dda03a75e94908f8d9cc389`
on `intelligence/cp14-continuation-runtime` in the same fresh worktree.

### Corrections

- **F1:** Shared `markDependencyBlocked()` rejects wake dependencies, including
  an existing dependency when the caller omits its ID. Its conditional UPDATE
  also rejects a dependency changed between observation and admission.
  `wakeCompletedDependencies()` excludes wake kinds for both `listPending()` and
  generic completion. Ledger activity projects a wake dependency as WAITING;
  operational completion excludes it. The sibling Data Health scanner,
  automatic-convergence and repair-evidence projections also exclude wake success;
  its final repair UPDATE repeats the kind check. Ordinary queue dependencies
  still release; result-dependent continuation work uses PUBLISHED TASK disposition.
  The existing Ledger APPLIED-receipt release condition is unchanged.
- **F2:** `scheduleWake()` announces work through the existing queue-work listener
  only after the Account-gated SQLite transaction commits and a fresh Account
  context check succeeds. First enqueue, completed re-arm and PROCESSING signals
  notify the same central owner. Rollback and stale/changed Account contexts emit
  no hint. The owner's existing one timer and in-flight follow-up flag deliver
  the work; no scheduler/timer/poller/controller is introduced. Ledger UI counts
  remain Ledger-only and native activity imports remain lazy.
- **F3:** A pre-start meter failure can update only the exact initial NOT_STARTED
  attempt revision. The repository CAS repeats ownership checking atomically;
  loss of that observation preserves the winner. It records meter UNKNOWN while
  retaining NOT_STARTED execution certainty. Such an attempt cannot execute again
  without resolving its uncertainty. A post-start dispatch failure may record
  execution UNKNOWN but preserves a confirmed durable meter START. Both orderings
  of the independent R9 race retain RUNNING/START_DURABLE and permit normal winner
  terminal completion, with one injected executor call.
- **F4:** Deterministic JSON/schema/identity/binding failures have a typed local
  validation error. Pre-claim invalid rows become FAILED/VALIDATION, allowing later
  valid work to proceed. The runtime revalidates retained body/identity before
  routing. Post-claim invalid rows use the same fenced disposition; missing durable
  task bindings also fail locally. Authority comes from trusted queue row/context,
  never malformed Account/task payload fields. Quarantine matches the exact
  observed ID, Account, Trip, kind/entity, key/body, signal, status, claim owner,
  attempt count, due time and timestamps. A changed signal/claim/body cannot be
  overwritten. An invalid in-memory observation cannot quarantine a valid newer
  retained body. Scoped admission exceptions now reach existing retry handling;
  SQLite/environmental failures remain RETRYABLE, not invalid. Ordinary claim
  behavior remains unchanged. Scheduler activity includes invalid entity labels
  under the approved operation kind so those rows can be safely fenced.

### Exact correction files

Code: `src/data/sync/syncOperationRepository.ts`, `syncEngine.ts`,
`intelligenceContinuationWakeWorker.ts`, `ledgerQueueActivity.ts`,
`ledgerOperationalSync.ts`; `src/data/repositories/intelligenceContinuationRepository.ts`;
`src/data/health/dataHealthCoordinator.ts`.

Tests: `src/data/repositories/intelligenceContinuationRepository.test.ts`,
`src/data/sync/ledgerQueueActivity.test.ts`,
`src/data/health/dataHealthCoordinator.test.ts`. Documentation: this Builder report
and the short current-state handoff. No accepted Persistence/CP12/CP13 contract or
independent review is modified.

### Builder validation

29 new adversarial tests reproduce and close R6–R9 plus the requested sibling,
rollback, Account, signal/body/claim, transient and timing variations. All pass.
The lifecycle suite now has **107 tests PASS**, using real SQLite, FK ON/OFF,
file reopen and deterministic injected callbacks. The idle-owner tests use the
actual scheduling adapter, queue notification and existing central timer with
fake time; unrelated native/Ledger worker seams are mocked. These checks invoke
no real provider or remote service.

| Check                                                            | Result                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Final selected regression matrix                                 | 19 files / 666 tests PASS                                                   |
| C2 lifecycle + queue/engine/activity/central owner + Data Health | 6 files / 192 tests PASS                                                    |
| Typecheck                                                        | PASS                                                                        |
| Lint including UI guard                                          | PASS; 473 existing legacy occurrences / 76 representative UI files          |
| Backend build                                                    | PASS                                                                        |
| Changed-file formatting / whitespace                             | PASS                                                                        |
| Final full suite                                                 | 198 files / 2,265 tests: 2,264 PASS, 1 unchanged baseline assertion failure |
| Server83 / SQLite50 and five unconditional C denials             | Byte-identical to exact accepted HEAD                                       |
| Independent review preservation                                  | SHA-256 `7b6ba0d947aa9226566397546a2b3ccd753b5d78c7e8561a348db94eec47fb3d`  |

The final19-path matrix is the preceding18-path matrix plus
`src/data/health/dataHealthCoordinator.test.ts`. It includes Account fencing,
CP13A/CP13B, Capture, Day and Ledger maintenance. The sole full-suite failure remains
`src/domain/architectureBoundary.test.ts`'s existing Ledger UI→API import assertion,
previously reproduced at exact accepted base. No F1–F4 failure is classified as
baseline. No new failed file/assertion is introduced. A final Backend build hit the
managed-worktree output-write sandbox boundary; the authorized rerun passed. Full evidence is retained
locally in `/private/tmp/c2-fix-full-final.json` and selected output in
`/private/tmp/c2-fix-selected-final.log`.

Cross-checks retain duplicate-attempt protection, exact UNKNOWN recovery/no blind
redispatch, non-authoritative queue leases/counts, A→B→A, cancellation/stale late
install rejection, late usage responsibility, three pass-compatible WAIT reasons,
WAIT without attempt/usage and shadow noninstallation. `sync_operations` remains
the sole scheduler. There is no SQLite51/Server84, new durable authority, provider
activation, UI, Hosted Dev/Production access, deployment, commit or push.

### Required final answers

| Question                                       | Answer |
| ---------------------------------------------- | ------ |
| F1 generic wake-dependency leak fixed          | YES    |
| Wake COMPLETED can imply intelligence success  | NO     |
| F2 idle-owner delivery fixed                   | YES    |
| First enqueue wakes existing owner             | YES    |
| Completed-row re-arm wakes existing owner      | YES    |
| F3 competing meter regression fixed            | YES    |
| Losing caller can overwrite winner RUNNING     | NO     |
| F4 invalid wake quarantine fixed               | YES    |
| Invalid wake can indefinitely block later work | NO     |
| F1–F4 independent reproduction vectors added   | YES    |
| Duplicate attempt protection preserved         | YES    |
| UNKNOWN redispatch protection preserved        | YES    |
| A→B→A preserved                                | YES    |
| Five C denials unchanged                       | YES    |
| sync_operations sole scheduler                 | YES    |
| Lazy native import behavior changed            | NO     |
| Server83/SQLite50 changed                      | NO     |
| New migration                                  | NO     |
| Runtime/provider gates CLOSED                  | YES    |
| New regression                                 | NO     |
| Commit                                         | NO     |
| Push                                           | NO     |
| Ready for targeted independent recheck         | YES    |

**STOP — C2 TARGETED CORRECTION COMPLETE / READY FOR INDEPENDENT RECHECK.**
