# CP14 A2 — Independent Outbound Runtime Review

Date: 2026-10-06 (Pacific/Auckland). Review only.

**Verdict: PASS WITH REQUIRED CORRECTIONS**

**New findings: 0 CRITICAL, 1 IMPORTANT. Ready for Owner Review: NO.**

The synthetic harness is not reachable from ordinary product startup, creates no
production dispatch authority, and leaves real Server83 dispatch CLOSED. Exact
reservation/START, UNKNOWN recovery, fallback concurrency, shadow isolation,
nullable metering and installation replay pass the executed checks. One final
pre-execution race violates the requested zero-fake prerequisite guarantee:
changes arriving during synthetic-start admission are not revalidated before the
fake executes. Correct F1 and independently recheck before owner acceptance.

## Reviewed state and authority

Reviewed worktree:
`/Users/xoery/.codex/worktrees/cp14-a2-outbound-runtime/otr-mobile-canonical`.
Branch: `intelligence/cp14-outbound-runtime`. HEAD and accepted base:
`2b88464f259b3daa69fe6621b988838d5de2806f`. Review includes the uncommitted tracked
and untracked implementation, not just HEAD. The calling canonical checkout has
separate work and was not used as the implementation snapshot.

The human **OWNER CLARIFICATION — CP14 A2 CLOSED EXECUTION HARNESS** was retrieved
from “Execute CP14 Agent A2 adaptation”, chat
`01a10feb-a6c0-7452-967a-27df2a8c10e5`, and its referenced attachment read directly.
The same chat retains the complete initial hard-stop report; that report and the
completed A2 report were examined separately. No message was sent to another chat.
The clarification authorizes injected synthetic acceptance after real call/START
responsibility and CLOSED-dispatch proof; it does not authorize real dispatch,
network execution, a second ledger, or activation.

Authority inputs include the repository guide/current state and foundation docs;
accepted CP14 persistence preflight, implementation/corrections, VerifiedCallContextV1
and final independent recheck; accepted C2 implementation/corrections and independent
review/recheck; frozen original Agent A report; CP12 Import/Intelligence contracts,
CP13A protected admission/recovery and CP13B integrated contracts; current
API/DATA_MODEL/OFFLINE_SYNC. Historical FAIL and correction-pending sections are
historical records; the accepted final persistence/C2 rechecks govern the base.
Builder YES answers were not used as acceptance evidence.

Actual A2 inventory is seven modified and seven added files:

```text
Modified:
docs/API_CONTRACT.md
docs/CURRENT_IMPLEMENTATION_STATE.md
docs/DATA_MODEL.md
docs/OFFLINE_SYNC.md
src/data/repositories/intelligenceContinuationRepository.test.ts
src/data/repositories/intelligenceContinuationRepository.ts
src/data/sync/intelligenceContinuationWakeWorker.ts

Added:
backend/src/outboundReservation.ts
docs/adr/2026-10-06-cp14-a2-closed-outbound-seam.md
docs/architecture/TRIP_CHECKPOINT_14_AGENT_A2_OUTBOUND_RUNTIME_REPORT.md
scripts/cp14/outbound-acceptance.ts
src/data/intelligence/closedOutboundHarness.ts
src/domain/intelligence/outboundRouting.test.ts
src/domain/intelligence/outboundRouting.ts
```

This review adds only this report. No implementation, Builder report, current-state
handoff or accepted review was edited; no commit/push, Hosted Dev/Production,
legacy Web, credentials, provider activation or real provider call occurred.

## F1 — IMPORTANT: changes during synthetic-start admission still permit fake execution

Location: `src/data/intelligence/closedOutboundHarness.ts:187–202`, especially
lines195–202. Affected claim: A2 report's zero-fake pre-dispatch guarantees.

The last local pin/cancellation/Trip check is at line195. The last server eligibility
check is at line196. Execution then awaits `synthetic.begin(e)` at line197 and an
Account-context read at line199. Only Account identity/generation is checked after
synthetic admission; local task/Trip/cancellation and server kill/disable/config
eligibility are not checked again before `adapter.execute(e)` at line202.

**Independently reproduced, five parameterized vectors:** admit one exact V7
attempt and call; wrap the injected synthetic-start seam with an asynchronous yield;
commit the change before invoking its original durable synthetic-start operation;
then let execution continue. The fake count is **1**, where the requested acceptance
contract requires **0**:

| Change committed before synthetic start/fake | Observed fake count | Required |
| -------------------------------------------- | ------------------- | -------- |
| Integration kill                             | 1                   | 0        |
| Integration disable                          | 1                   | 0        |
| New DISABLED provider config V8              | 1                   | 0        |
| Task cancellation/publication fence advance  | 1                   | 0        |
| Owning Trip admission revoked                | 1                   | 0        |

The final reproductions apply changes **before** the original `synthetic.begin`
marks responsibility, not inside fake I/O or after a claimed synthetic start.
No sleep, lease expiry, queue inference, production wiring or Server83 mutation is
needed. Tests use the real migrated SQLite repository/runtime and existing trusted
fixture seams. The harness remains injected and TEST-only.

C2 still rejects canceled/stale installation and retains historical responsibility.
No duplicate fake, cross-Account install, real dispatch, real gate bypass or new
production authority was demonstrated. Therefore this is one IMPORTANT orchestration
ordering defect with five manifestations, not five findings or a CRITICAL activation
finding. It is introduced by A2's final execution sequence; the accepted C2 guards
are not weakened by this reproduction.

**Required correction:** make the final synthetic admission/execution boundary
revalidate the current local and server prerequisites after intervening admission
awaits, including changes arriving before the synthetic marker is committed. Keep
external I/O outside Account gates/SQLite transactions. Failed admission must stop
the fake, conservatively retain any existing START/uncertainty, and never infer safe
retry from missing execution. Add these five runnable barrier regressions. Reconcile
the Builder/docs zero-fake claims with the corrected, tested boundary. No Server83,
SQLite50, runtime constraint, scheduler or production authority change is required.

## Independent acceptance by requested target

| Target                   | Result and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Synthetic authority   | Constructor/import/export/call-site search across app/src/backend/scripts finds harness/router construction only in acceptance tests. Reservation adapter construction occurs only in tests and the offline acceptance script. Backend's harness dependency is type-only; built server bundle contains no harness constructor. No singleton, startup registration, environment toggle, provider/network implementation or fake fallback exists. TEST_ONLY mode, fake-kind and TEST admission checks are explicit. Injected callbacks are trusted test seams, not a security sandbox for arbitrary future adapters. |
| 2. Server83 boundary     | Adapter invokes fixed reserve-call and mark-dispatch roots through the accepted gateway. Exact reserved-header/START checks bind Account/task/attempt/call/request/provider/config/input/schema/price/fence/lineage and admission digest. Changed-header matrix rejects. Only exact CP14_RUNTIME_CLOSED rejection admits synthetic continuation; auth/transport/START failure or unexpected root success refuses it. No new SQL/session/role or service_role privilege is added. Actual protected-root bridge independently passes.                                                                                |
| 3. Pre-dispatch ordering | Ordinary reserve, START, ACK-loss, authorization, Account/fence, kill/disable/config, unexpected dispatch and synthetic-start failures block the fake in existing and independent checks. F1 exposes the unprotected final await window; a blanket zero-fake ordering PASS is withheld.                                                                                                                                                                                                                                                                                                                            |
| 4. Router                | Bounded, strict, recursively frozen projections; latest-version elimination precedes qualification. Capability/modality/schema/size/privacy/region, environment/kill/enable, ACTIVE versus SHADOW_ONLY, online/network, quota/rate, risk/complexity/latency, budget/currency and current-config health checks precede priority/ID selection. No FX or vendor selector. Quality references are admitted pins, not a new evaluator. Router stores no authority/counter and does not execute. Independent cheap-denied/latest-disabled matrix passes.                                                                 |
| 5. Immutable pins        | Admission digest includes retained full snapshot, body and Account/task/request/call/fence/lineage. Verification clones before asynchronous hashing and compares immutable attempt fields. V8 affects fresh admission, never rewrites V7 or its price envelope. Old health observations do not rewrite pins. Changed envelope/body/price rejects. F1 concerns stale admission before execution, not mutation of retained pins.                                                                                                                                                                                     |
| 6. Execution/UNKNOWN     | Possible start plus throw, timeout, response/callback/custody loss, file reopen and queue/lease retry preserve exact responsibility. C2 NOT_STARTED/revision CAS and durable synthetic started proof prevent duplicate fake execution. UNKNOWN cannot execute or auto-fallback; exact trusted terminal evidence is separately required. Completion-meter/install failure never repairs itself by execution.                                                                                                                                                                                                        |
| 7. START ACK loss        | Exact retained call+START and positive synthetic-undispatched proof restore START_DURABLE only through C2's NOT_STARTED revision CAS. Independent changed body and 21 retained-header substitutions reject. Exact recovery/execution retains one reservation and one fake call. Possible-execution recovery reset rejects. No second quota admission/call is invented.                                                                                                                                                                                                                                             |
| 8. Usage/metering        | Tokens/call/compute remain independently nullable; deterministic/on-device classes invent no commercial tokens and missing self-hosted compute remains UNKNOWN. Synthetic custody/meter labels acceptance evidence and never appends synthetic completion to Server83. Meter failure retains terminal result with COMPLETION_PENDING; exact recovery and install rollback preserve usage without fake replay. Unchanged Server83 cumulative/delta/explicit correction/estimate-to-actual/late-usage/currency/precise-cost vectors independently pass.                                                              |
| 9. Fallback              | A2 predecessor admission requires terminal FAILED, COMPLETE metering, no response and exact current active predecessor. UNKNOWN/RUNNING/queue retry/meter-pending cannot authorize fallback. Fresh identity/config/call and retained predecessor/chain are required; prior observations remain. Independent concurrent callers admit exactly one fallback through repository CAS/sequence/current-attempt guards. Owning policy/budget admission remains injected, not a new local quota authority.                                                                                                                |
| 10. Shadow               | Separate attempt/call/START/custody/meter and exact active-parent lineage; parent call reservation is required. Never current or installable; late/failing shadow cannot replace/fail active publication. Privacy/network/budget admission can suppress it. A2 excludes shadows only from active retry counting and active attention, retains global ordered sequence and 64-attempt ceiling, and bypasses current-attempt equality only for shadow begin. Other active CAS/fence/cancellation/pin guards remain. No training/Product Intelligence persistence.                                                    |
| 11. Kill/disable         | Route exclusions and fresh checks hold for changes observed before those checks. F1 fails changes during final synthetic admission. Kill during synthetic I/O is not terminal/cancellation proof; historical call/START/usage remain. Documentation explicitly withholds real kill-during-I/O and production cancellation acceptance.                                                                                                                                                                                                                                                                              |
| 12. Quota/rate           | Server83 atomic reservation remains authority; exact replay consumes once, concurrent reservation is bounded, no timeout refund. Fallback/shadow reserve separate calls. A2 has no local quota/rate counter or override. Independently rerun SQL vectors pass.                                                                                                                                                                                                                                                                                                                                                     |
| 13. Account A→B→A        | Old generation cannot attach/recover/install as current A; B cannot read A rows. Independent callback-switch vector requires fresh A context and exact retained recovery. Historical responsibility is retained, not disclosed to B. Final generation check also prevents fake execution after Account transition in the pre-execution window; F1 concerns other prerequisite changes.                                                                                                                                                                                                                             |
| 14. Installation         | Retained admission/result and exact Server83 START precede C2 atomic install. Account/task/attempt/request/call and immutable provider/config/price correlate through the envelope; result digest is checked against custody. Account/Trip/material/Run/Candidate/Event/cancellation/current-attempt and publication pins remain checked. Shadow and changed result/publication reject. Rollback and exact publication replay never execute again. Owning admission/custody validators are injected; no live device/canonical command acceptance is claimed.                                                       |
| 15. C2 non-regression    | Executed existing wake signal/claim races, idle-owner first/re-arm delivery, generic dependency protection, invalid quarantine, duplicate-attempt/pre-start meter races, UNKNOWN, A→B→A, late canceled responsibility and three WAIT/pass axes. Health/queue/central-owner regressions pass. Scheduler/denial/default-adapter source is byte-identical to base. Shadow changes do not weaken ordinary active CAS/attention in the tested vectors.                                                                                                                                                                  |
| 16. Fixture leakage      | a2_test_journal/a2_test_server occur only in the continuation test file. No production migration, repository fallback, fixture adapter export, package/startup or database-owner runtime path exists. Offline PostgreSQL script uses test-owner access for fixture setup/read and actual dedicated-session protected roots; that script is not runtime provisioning.                                                                                                                                                                                                                                               |
| 17. Documentation        | A2 report, ADR, API/DATA_MODEL/OFFLINE_SYNC explicitly separate CLOSED SYNTHETIC EXECUTION ACCEPTANCE from REAL SERVER83-AUTHORIZED PROVIDER DISPATCH. No live provider/real dispatch/production cancellation/billable synthetic claim found. Zero-fake admission guarantees need F1 correction; count that overclaim with the same defect.                                                                                                                                                                                                                                                                        |
| 18. Preservation         | Independently compared all 88 migration/registry source paths to exact accepted Git base. Server83 and SQLite50 hashes match accepted bytes; 83 server files and SQLite tail50, no Server84/SQLite51. Packages, queue repository, engine, operational owner/activity and five C denials are unchanged. No second scheduler, SDK/model-network code, UI/Admin Portal/billing/CXE/training or activation.                                                                                                                                                                                                            |

## Independently executed validation and limits

Execution used `/private/tmp/cp14-a2-independent-review`, a disposable exact-base
archive overlaid with hash-verified actual A2 working-tree files, linked to the
existing dependency installation. Temporary reviewer tests copy existing SQLite
fixtures/helpers and add review-owned assertions; implementation is unchanged.

| Check                                                                | Observed result                                                                           |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Selected A2/C2/queue/Account/Backend regressions                     | 8 files / 255 tests PASS                                                                  |
| Additional SQLite/CP13A/B/Capture/Day/Health/maintenance regressions | 12 files / 484 tests PASS                                                                 |
| Total distinct selected files/tests                                  | 20 files / 739 tests PASS; no overlap between the two runs                                |
| Review-owned adversarial tests                                       | 14 tests: 9 PASS, 5 required-behavior failures reproducing F1                             |
| Reachability/fixture/scheduler/package assertions                    | PASS                                                                                      |
| Review-owned network-none PostgreSQL fresh1→83 and seeded82→83       | PASS; historical table columns/functions and synthetic auth row preserved                 |
| Unchanged Server83 security/quota/usage/cost harness                 | 548 checks PASS, including 75 residual checks                                             |
| New A2 bridge against actual Server83 protected roots                | PASS; exact call+START/replay/CLOSED dispatch/fresh kill rejection/historical retention   |
| Typecheck                                                            | PASS                                                                                      |
| Lint including UI guard                                              | PASS, no implementation warnings; UI guard473 legacy occurrences /76 representative files |
| Backend build                                                        | PASS in disposable output directory                                                       |
| Exact source preservation                                            | PASS; implementation/Builder inputs match entry hashes                                    |

Server testing used only review-owned `otr-cp14-a2-independent-review`, PostgreSQL17.6,
`--network none`, no published ports, synthetic identities and disposable local
trust authentication. Existing Builder/Dev containers were not mutated. Replay
uses the existing schema-only platform fixture and hash-pinned nonpublic platform
helpers read from the existing local CP13A acceptance fixture. These are not Hosted
Dev/Production data or live connector credentials. Temporary helper copies change
only container/root locations; tracked scripts are unchanged. The bridge copy
changes only the container name.

Reviewer tests were removed from snapshot discovery before final lint/typecheck;
their copied-helper unused-import warnings were fixture-only, not implementation
warnings. No implementation correction was made to obtain a pass.

Evidence retained outside the repository:

```text
/private/tmp/a2IndependentReview.test.ts
/private/tmp/a2-review-adversarial.log
/private/tmp/a2-review-reachability.json
/private/tmp/a2-review-selected.log
/private/tmp/a2-review-additional.log
/private/tmp/a2-review-server-replay.log
/private/tmp/a2-review-server-acceptance.log
/private/tmp/a2-review-bridge.log
/private/tmp/a2-review-typecheck.log
/private/tmp/a2-review-lint.log
/private/tmp/a2-review-build.log
/private/tmp/a2-review-entry-hashes.json
```

Reproduce reviewer vectors by copying `/private/tmp/a2IndependentReview.test.ts` to
the disposable snapshot's `src/data/repositories/a2IndependentReview.test.ts`, then
running `npm test -- --configLoader runner --maxWorkers=1` with that test path.
Selected paths are retained in the two regression logs. No full repository suite
was independently run; Builder full-suite/base counts remain Builder evidence.
No native/device/live-provider, real terminality/cancellation, OAuth/issuer/secret
resolver, real read/custody connector or actual canonical command acceptance was
performed. Accepted CP13 security limitations remain unchanged. This is closed
synthetic orchestration review, not activation or release approval.

## Required explicit answers

| Question                                               | Answer                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Synthetic harness production reachable                 | NO                                                                                                |
| Second dispatch authority created                      | NO                                                                                                |
| Server83 real dispatch remains CLOSED                  | YES                                                                                               |
| Server83/SQLite50 unchanged                            | YES                                                                                               |
| Pre-dispatch failure can call fake                     | YES — F1 final admission window                                                                   |
| Router provider-neutral                                | YES                                                                                               |
| Stale eligible config can bypass newer disabled config | YES — F1 if newer DISABLED arrives during final admission; router itself rejects it when observed |
| Attempt/config/price pins immutable                    | YES                                                                                               |
| START ACK loss can duplicate reservation/call          | NO                                                                                                |
| UNKNOWN can redispatch/fallback                        | NO                                                                                                |
| Completion meter failure can re-execute                | NO                                                                                                |
| Missing usage becomes zero                             | NO                                                                                                |
| Fallback uses new admitted attempt/call                | YES                                                                                               |
| Shadow can install                                     | NO                                                                                                |
| Shadow corrupts active retry/attention semantics       | NO                                                                                                |
| Server83 remains quota/cost authority                  | YES                                                                                               |
| Synthetic usage can appear real billable               | NO                                                                                                |
| A→B→A fenced                                           | YES                                                                                               |
| Install replay can execute fake again                  | NO                                                                                                |
| C2 lifecycle protections preserved                     | YES — A2 F1 does not remove C2 installation/UNKNOWN/CAS guards                                    |
| sync_operations sole scheduler                         | YES                                                                                               |
| Five C denials unchanged                               | YES                                                                                               |
| Runtime/provider gates CLOSED                          | YES                                                                                               |
| New CRITICAL findings                                  | 0                                                                                                 |
| New IMPORTANT findings                                 | 1                                                                                                 |
| Ready for Owner Review                                 | NO                                                                                                |

**STOP — A2 INDEPENDENT OUTBOUND RUNTIME REVIEW COMPLETE.**

## TARGETED F1 RECHECK

Date: 2026-10-06 (Pacific/Auckland). Independent A2 outbound-runtime recheck of
`intelligence/cp14-outbound-runtime`, base/HEAD
`2b88464f259b3daa69fe6621b988838d5de2806f`, with the actual uncommitted correction.

**TARGETED RECHECK PASS**

F1 is verified fixed. Original IMPORTANT findings remaining: **0**. New CRITICAL
findings: **0**. New IMPORTANT findings: **0**. New regressions: **NO**.
Ready for Final Owner Review: **YES**. The original verdict and F1 evidence above
remain historical text; this appended section records their targeted resolution.

### Review basis and exact correction

Read the original independent report, the Builder report's “Targeted F1
final-admission correction,” the exact before/after implementation diff, and the
owner's CLOSED EXECUTION HARNESS clarification. Builder YES answers were not used
as evidence. Compared actual files with the independently retained original A2
snapshot, rather than confusing the entire A2/base diff with this correction.

Only three implementation files changed since the original review:
`src/data/intelligence/closedOutboundHarness.ts`,
`src/data/repositories/intelligenceContinuationRepository.ts`, and
`src/data/auth/accountRequestContext.ts`. The continuation test file gains thirteen
F1 regressions; Builder/current-state/offline-sync documentation records the fix.
The original independent report matched its retained bytes before this recheck.
Exact correction evidence: `/private/tmp/a2-recheck-exact-correction.diff`.

### Independently executed admission races

Reviewer-owned tests reused the existing migrated SQLite fixture and deterministic
fake, adding independent assertions and explicit rendezvous barriers. The original
five review tests were rerun unchanged. Additional barriers paused **after durable
synthetic begin** but before its promise completed, and separately immediately
before final local admission after server checks had succeeded. Mutations completed
before releasing each barrier; no sleep, lease expiry or Builder verdict was used.

| Vector                                                                   | Independently observed fake calls |
| ------------------------------------------------------------------------ | --------------------------------- |
| Integration kill committed during synthetic-start admission              | 0                                 |
| Integration disable during synthetic-start admission                     | 0                                 |
| Newer V8 DISABLED provider configuration during admission                | 0                                 |
| Task cancellation/publication-fence advance during admission             | 0                                 |
| Owning Trip admission revoke during admission                            | 0                                 |
| Account A→B during final window                                          | 0                                 |
| Account A→B→A with original stale generation                             | 0                                 |
| Attempt becomes UNKNOWN/stale before final admission                     | 0                                 |
| Retained admission body/identity changes before final admission          | 0                                 |
| Local cancel after final server success, before final local admission    | 0                                 |
| Task fence/cancellation mutation at final conditional UPDATE             | 0                                 |
| Attempt revision mutation at final conditional UPDATE                    | 0                                 |
| Account transition queued after final transaction COMMIT, before handoff | 0                                 |
| Final transaction failure                                                | 0                                 |
| Valid unchanged prerequisites                                            | Exactly 1                         |
| Concurrent execute callers for the same attempt                          | Exactly 1                         |

The conditional-UPDATE attacks reached the actual new CAS, then mutated the task
or attempt through the fixture connection inside that transaction. CAS rejected;
no fake was called. These are adversarial predicate checks, not claims that another
SQLite writer can commit inside an already-owned transaction. Attempt UNKNOWN and
exact revision/current-attempt checks reject superseded ownership; no replacement
attempt or safe-retry proof was manufactured to test it.

### Final-boundary ordering

Inspected and executed the corrected path:

1. Synthetic begin completes; exact Server83 reservation/START, fresh control-plane
   eligibility/authorization and retained admission identity are revalidated
   asynchronously before the final local admission.
2. `admitSyntheticExecution` (`intelligenceContinuationRepository.ts:549`) holds
   the existing Account apply gate and SQLite transaction. It checks the exact
   serialized expected attempt, RUNNING observation, START_DURABLE responsibility,
   current active attempt (shadow exception retains its existing isolation), task
   RUNNING/cancellation/fence, Account identity/generation, Trip scope, material
   digests and owning admission policy. It reruns `validateAttemptAdmission` and
   the final Account check.
3. Its conditional UPDATE (`:581`) binds Account/attempt/revision and RUNNING/START,
   plus an EXISTS predicate binding the exact task revision/publication fence,
   cancellation/work state and active ownership. Exactly one changed row is
   required. Failure rolls back and cannot invoke the handoff.
4. Successful transaction COMMIT precedes gate release. The optional callback in
   `withAccountApplyGate` (`accountRequestContext.ts:27`) runs synchronously after
   release, before queued gate mutations resume. It asserts Account generation,
   active transition and pending transition state, then invokes the injected fake.
   An independently queued transition at that boundary produced zero fake calls.
5. No asynchronous prerequisite/admission await follows final local COMMIT before
   fake invocation. The harness awaits the repository promise only after the
   callback has already invoked the adapter; its next await is fake completion.
   Reviewer gate-order assertions observed COMMIT → fake entry → queued mutation.
   Failed apply never called the callback and released the gate.

The fake reacquired the same Account gate and opened/rolled back a new SQLite
transaction successfully. Thus its I/O executes outside both admission protections.
This verifies the closed deterministic harness, not live provider cancellation or
atomic admission against future remote control-plane changes after its completed
server check. The owner clarification continues to reserve real dispatch authority
for the CLOSED Server83 root.

### Failed final admission and retained responsibility

Across the nine durable-begin barrier mutations, the exact retained reservation
command (including START) remained byte-equivalent, synthetic started remained 1,
and no synthetic observation or completion meter was inserted. Local responsibility
remained UNKNOWN or RUNNING when a stale Account context could no longer write;
START_DURABLE remained, outcome/usage/safe-failure evidence remained null.

After restoring eligibility/custody solely for inspection, missing terminal evidence
returned RECOVERY_REQUIRED; reexecution and fallback admission still rejected.
No provider failure, zero usage, refund, safe retry or fallback authority was inferred
from the zero fake count. The unchanged Server83 reservation/quota acceptance and
actual bridge independently confirmed retained historical responsibility and replay.
A separate explicit trusted exact CANCELED_TERMINAL observation recovered through
the existing digest-bound recovery path and appended its synthetic meter without
any fake execution. Absent such evidence, recovery remained required.

### Preservation and validation

- Reviewer-owned adversarial suite: **33/33 PASS**, including all fourteen original
  independent tests and nineteen additional boundary/responsibility assertions.
- Corrected focused A2/C2, routing, Server83 gateway, queue/engine/operational-owner,
  Account gate and health checks: **9 files /306 PASS**. Account switching/session,
  database, Import admission/interpretation, Trip installation/Capture and related
  selected regressions: **15 files /468 PASS**. Total: **25 files /807 PASS**.
- Accepted clean local 1→83 replay and seeded exact 82→83 preservation: PASS.
  Accepted Server83 checks: **548 PASS**, including 75 residual checks, gates CLOSED.
  Actual A2 adapter → Server83 bridge: PASS for exact call+START/replay, CLOSED real
  dispatch, fresh kill exclusion and retained historical responsibility. Synthetic
  completion was not inserted into Server83.
- Typecheck, lint/UI guard and Backend build: PASS. Built Backend bundle contains
  no harness constructor, synthetic journal or synthetic execution entry point.
  Construction search finds only acceptance tests; there is no production default
  or startup registration. Reservation adapter and protected-root gateway are
  byte-identical to the original independent review.
- UNKNOWN/no-redispatch/no-fallback, exact START ACK replay/header substitution,
  completion-meter recovery without execution, fallback identity/lineage/concurrency,
  shadow isolation/no-install and A→B→A recovery all pass again. Synthetic usage
  stays explicitly acceptance-only and outside Server83 billable completion roots;
  Server83 remains quota/cost authority.
- C2 lifecycle checks and sole `sync_operations` ownership pass. Queue repository,
  engine, operational owner/activity and continuation worker are byte-identical to
  the original review. The five C denials (`C_PREPARE_CONFIRMATION`,
  `C_EXECUTE_EVENT_SLOT`, `C_FINALIZE_EVENT_SLOT`, `C_ADMIT_CAPTURE_SOURCE`,
  `C_REVOKE_EVENT_SLOT`) remain closed, including permissive-filter tests.
- All **88 migration/registry source files** are byte-identical to the accepted
  base. Server83 SHA-256 remains
  `c759a41981f631271df7b960a7ce50dbc32e2317163ca84a7021d1cbf5e46f93`;
  SQLite50 remains
  `63d11a4486660d1b609395234eb3d1309960be1a2766f59f8185477f2880d2b0`.
  No migration, second dispatch authority or gate activation was introduced.

Validation used the exact-base writable overlay
`/private/tmp/cp14-a2-independent-recheck`. Reviewer-only test injections were
removed before typecheck/lint; the reviewed implementation was not modified.
The review-owned PostgreSQL container used `--network none`, no published ports,
and was removed after acceptance. No Hosted Dev/Production, provider endpoint,
credentials, commit or push. No full repository rerun was necessary.

Evidence logs: `/private/tmp/a2-recheck-independent.log`,
`/private/tmp/a2-recheck-selected.log`, `/private/tmp/a2-recheck-regressions.log`,
`/private/tmp/a2-recheck-server-replay.log`,
`/private/tmp/a2-recheck-server-acceptance.log`, `/private/tmp/a2-recheck-bridge.log`,
`/private/tmp/a2-recheck-typecheck.log`, `/private/tmp/a2-recheck-lint.log`,
`/private/tmp/a2-recheck-build.log`.

Original report prefix preserved: **28,352 bytes**, SHA-256
`ca5670cfdc4a360b98770673d2195160bfb6b83c40669bb966caf71294970d5e`.
Entry implementation hashes were checked again before append and remained unchanged.

| Required answer                                         | Answer |
| ------------------------------------------------------- | ------ |
| F1 FIX VERIFIED                                         | YES    |
| Original IMPORTANT findings remaining                   | 0      |
| New CRITICAL findings                                   | 0      |
| New IMPORTANT findings                                  | 0      |
| New regressions                                         | NO     |
| Five original prerequisite races blocked                | YES    |
| Final local admission after async server admission      | YES    |
| Async admission gap remains before fake execution       | NO     |
| Failed final admission preserves START responsibility   | YES    |
| Failed final admission creates retry/fallback authority | NO     |
| Synthetic harness production reachable                  | NO     |
| Second dispatch authority created                       | NO     |
| Server83 real dispatch CLOSED                           | YES    |
| UNKNOWN protection preserved                            | YES    |
| Shadow install impossible                               | YES    |
| Server83/SQLite50 unchanged                             | YES    |
| Runtime/provider gates CLOSED                           | YES    |
| Ready for Final Owner Review                            | YES    |

STOP — A2 TARGETED INDEPENDENT RECHECK COMPLETE.
