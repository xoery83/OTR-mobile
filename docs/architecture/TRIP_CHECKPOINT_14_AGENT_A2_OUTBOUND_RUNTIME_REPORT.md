# CP14 Agent A2 — durable outbound adaptation

Date: 2026-10-06 (Pacific/Auckland).
**A2 F1 CORRECTION COMPLETE / READY FOR TARGETED INDEPENDENT RECHECK.**

## Baseline and resolved hard stop

Fresh worktree `/Users/xoery/.codex/worktrees/cp14-a2-outbound-runtime/otr-mobile-canonical`,
branch `intelligence/cp14-outbound-runtime`, exact starting and retained HEAD
`2b88464f259b3daa69fe6621b988838d5de2806f`. Entry was clean. No commit/push.
Persistence ancestor `439168065df182975dda03a75e94908f8d9cc389` and accepted C2
corrections are present. Server83 is the83-file tail
`20261006000100_external_integration_persistence.sql`; SQLite is contiguous1–50.

The initial preflight stopped because Server83's false-only runtime constraint
prevents `external_integration_mark_dispatch`. The owner accepted that stop and
explicitly authorized an injected deterministic acceptance harness outside real
dispatch authority. This report supersedes the initial blocker status under that
clarification; the constraint, protected root and production authority are unchanged.

**CLOSED SYNTHETIC EXECUTION ACCEPTANCE** means test-only orchestration following
real reservation/START responsibility and verified CLOSED dispatch. It is separate
from **REAL SERVER83-AUTHORIZED PROVIDER DISPATCH**, which is unavailable. No real
MAY_HAVE_STARTED/RUNNING write, live execution, real cancellation or kill-during-live-
I/O acceptance is claimed. C2 local execution observations in these tests are synthetic.

Server83 SHA256: `c759a41981f631271df7b960a7ce50dbc32e2317163ca84a7021d1cbf5e46f93`.
SQLite50 SHA256: `63d11a4486660d1b609395234eb3d1309960be1a2766f59f8185477f2880d2b0`.
Accepted persistence/C2 reports, independent reviews and preflight are preserved.
Frozen original Agent A remains reference-only; its memory registry/meter/quotas
are not copied into production authority. No legacy Web access or modification.

## Delivered seams and authority

- `src/domain/intelligence/outboundRouting.ts`: strict bounded nonsecret projections
  (64 candidates, bounded capabilities/modalities/schema/units), recursively immutable
  snapshot and pins, deterministic provider-neutral decision-only routing. Latest
  config selection precedes eligibility so an old eligible version cannot bypass a
  new disabled one. Capability/schema/input bounds and privacy/region precede
  environment/kill, eligibility, network, quota/rate, risk/complexity/latency,
  budget, admitted health, priority and exact-ID tie-break. Cost never overrides
  hard qualification; currencies are never converted. Quality references stay
  admitted/config-pinned; no polling or invented benchmark is added.
- WAIT/UNAVAILABLE/ELIGIBLE are the only outcomes. Finite content-free reasons map
  to accepted C2 network/remote waits or unsupported attention. Temporary quota/rate
  denial waits under v1 policy; C2 deadline/active-attempt bounds terminate exhausted
  work. No mutable best-provider pointer or in-memory control-plane authority.
- Admission retains exact body, full snapshot (including provider and integration
  config versions/digests), price schedule/currency, routing/policy digests, execution/
  replay policy, role, Account/Trip/Import/task/attempt/request/key/call, publication
  fence and fallback/shadow lineage through existing request-material reference/SHA.
  Verification snapshots caller data before asynchronous hashing. Old pins stay
  immutable; fallback allocates a new attempt/call under current control-plane facts.
- `backend/src/outboundReservation.ts`: typed adapter around the accepted closed
  gateway. It builds the exact reserve-call+START command, verifies returned call,
  full provider/request/price/lineage/fence/admission digest and START identity,
  requires trusted fresh authorization plus current control-plane eligibility,
  and accepts only exact `CP14_RUNTIME_CLOSED` as the rejected real dispatch proof.
  Auth/CAS/read/transport failure or unexpected dispatch success cannot admit a fake.
  Reservation consumes Server83 quota/rate; rechecks do not refund or re-reserve
  locally. Server83 remains the price/usage/cost/security authority.
- `src/data/intelligence/closedOutboundHarness.ts`: explicit TEST_ONLY constructor,
  injected deterministic fake and distinctly labeled synthetic observations.
  `createOutboundContinuationRouter` adapts the decision to C2's existing router
  contract and retained admission custody. No startup or default installation.
  Production construction, read/gateway provisioning and private custody remain
  uninstalled; injected trusted read projections are not a newly granted SQL API.
- Execution order: C2 admission → exact Server83 reservation+START → C2 synthetic
  start CAS → fresh local/server checks → observe real dispatch CLOSED → fresh
  recheck → test-only durable synthetic responsibility → final fresh server/identity checks →
  local fenced CAS/COMMIT and synchronous gate-release handoff → fake outside every Account
  gate/transaction → retained observation/result → synthetic completion meter →
  C2 attach/revalidation/install. Real calls remain RESERVED / NOT_STARTED.
- Reservation/START/fence/kill/disable/config/auth/closed-gate/synthetic-start failure
  yields zero fake calls. Possible execution/throw/timeout/response loss preserves
  UNKNOWN. Exceptions expose a bounded recovery reason, never raw provider errors.
  A lost START ACK can recover only exact retained Server83 START plus positive
  synthetic undispatched proof and C2 NOT_STARTED CAS. No lease/queue inference.
- Completion-meter failure retains terminal success/result and nullable usage with
  COMPLETION_PENDING. Exact metering recovery and installation never call the fake.
  Synthetic usage supports nullable token/image/audio/compute observations, bounded
  generic units and cumulative/delta labels; no missing measurement becomes zero.
  Synthetic cost is labeled acceptance data, not real billable usage or customer cost.
  Real cumulative/delta/correction/estimate→actual pricing is tested separately through
  unchanged Server83 roots. No second production usage/cost ledger.
- Fallback requires admitted terminal FAILED, complete metering, no pending result,
  exact predecessor and new request/key/attempt/call. UNKNOWN cannot auto-fallback.
  Shadows have independent call/START/usage/cost identity, require the active parent
  call reservation, never become current/install/publish, and cannot block active
  facts or consume the active attempt limit. Global sequence and64-attempt ceiling
  remain; new fallback after a shadow uses the next global sequence.
- Narrow C2 corrections permit admitted shadow start without requiring it to be
  current, exclude shadows from active attention, and count active attempts for
  active retry bounds. Existing CAS, immutable rows, queue ownership, wake races,
  dependency semantics and quarantine remain. No SQLite51 or Server84.
- Results correlate Account/task/attempt/call/request and retained provider/price
  envelope before installation. C2 still owns Account generation, Trip/material/
  Run/Candidate/Event/fence validation and atomic local installation. Rollback,
  cancellation, stale Trip and A→B→A preserve historical usage/responsibility;
  fresh A can recover exact retained synthetic evidence. No canonical Event command
  is executed and no consumer schema or CP13B capability is widened.

## Acceptance and reproducibility

| Check                                                     | Final result                                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A2 router + A2/C2 real SQLite lifecycle                   | **2 files /193 tests PASS** (86 additional A2 tests;107 existing C2 tests preserved)                      |
| Full suite                                                | **199 files /2,351 tests:2,350 PASS,1 existing failure**                                                  |
| Exact requested base, same dependencies                   | **198 files /2,265 tests:2,264 PASS, same1 failure**                                                      |
| Accepted Server83 security/reservation/usage/cost harness | **548 checks PASS**,75 residual checks included                                                           |
| Offline exact server1→83 and seeded82→83                  | **PASS**, old columns/functions and synthetic auth row preserved                                          |
| New bridge against actual Server83 protected roots        | **PASS**: call+START, exact replay, real dispatch CLOSED, fresh kill exclusion, retained historical START |
| Typecheck, lint/UI guard, Backend build                   | **PASS**, lint without warnings                                                                           |
| Changed-file formatting, whitespace and preservation      | **PASS**                                                                                                  |

The sole failure in both exact-base and final full runs is
`src/domain/architectureBoundary.test.ts`'s existing Ledger UI→API architecture
assertion. No new failed file/assertion; no blanket full-suite PASS claim.
Full regression covers Server83 host boundary, SQLite50, C2/wake/engine, CP13A/B,
Capture, Day, Ledger maintenance and Account gates. None are replaced by test counts.

New adversarial checks cover kill/disable/config/latest-version/health/quota/budget/
privacy/schema/modality/region/tie-break; every pre-start failure including fresh
server authorization; START ACK loss, positive-proof recovery and possible-execution
refusal; callback/custody loss, timeout, cold restart and queue retry; meter pending/
late recovery, actual nullable compute/generic units for all four fake classes;
terminal-only fallback, competing callers, active/shadow call linkage and attention;
A→B→A, Trip/fence/cancel/rollback/install replay, result mismatch and admission mutation.
The adapter acquires the existing Account gate and opens a SQLite transaction inside
fake I/O: completion without deadlock proves the caller holds neither.

Lifecycle tests reuse the existing migrated SQLite fixture and real file reopen.
Explicit `a2_test_*` tables exist only inside acceptance fixtures as deterministic
server/custody/meter stand-ins; they are not application schema, production stores,
quotas, dispatch authority or a second scheduler. SQL authority is independently
checked in task-owned network-none `otr-cp14-a2-acceptance`, with no published ports.
`node --import tsx scripts/cp14/outbound-acceptance.ts` verifies the new bridge against
actual Server83. It requires the isolated replay and accepted harness's synthetic
admin fixtures and uses database-owner access solely for test reads/session setup,
not runtime privileges. The accepted Python helpers were invoked with only their
container/root names substituted in temporary copies; tracked helpers are unchanged.

Full command: `npm test -- --configLoader runner --maxWorkers=1`.
Evidence: `/private/tmp/a2-base-full.json`, `/private/tmp/a2-full-delivery.json`,
`/private/tmp/a2-server-replay.log`, `/private/tmp/a2-server-acceptance.log`,
`/private/tmp/a2-bridge-delivery.log`. Tooling ran in an exact-base writable validation
mirror; delivered source files are byte-verified against that mirror. No dependency
or package-lock change. Temporary node_modules links are not deliverables.

## Targeted F1 final-admission correction

Only F1 from the independent A2 review is corrected. That review remains byte-identical.
The earlier zero-fake claim did not cover prerequisite changes committed during
`synthetic.begin`; that defect is no longer classified as a baseline issue.

After synthetic begin completes, the harness revalidates exact Server83 call/START
and current server eligibility/authorization, then retained admission identity.
The repository revalidates the exact RUNNING attempt/revision/START responsibility,
current task/publication fence/cancellation, Trip/material pins, and owning admission
policy under the existing Account gate and SQLite transaction. The final conditional
UPDATE binds both attempt and task revisions/fence. It consumes one local revision
without changing execution, metering, usage, call or quota responsibility.

The Account gate has an optional synchronous post-release handoff. Existing callers
are unchanged. Only successful final admission/COMMIT can invoke it; it releases the
gate, asserts generation and invokes the fake synchronously with no intervening
await. Fake I/O and its promise completion run outside every gate/transaction.
This avoids reopening the local race by awaiting a repository result before starting
I/O. The server recheck is earlier than the final local CAS; there is no subsequent
asynchronous prerequisite work, only transaction COMMIT and gate release.

Failed final admission invokes no fake, leaves retained call/START and synthetic
start intact, fabricates neither provider failure nor zero usage, and lets the
existing C2 catch path preserve UNKNOWN/recovery (or retained RUNNING when the old
Account context cannot write). No undispatched/retry/fallback proof is invented.
Exact trusted terminal evidence may recover; absent evidence remains RECOVERY_REQUIRED.

Thirteen new barrier/CAS tests cover all five review vectors, Account A→B and
A→B→A, stale attempt, changed retained identity, unchanged concurrent execution,
local cancel after final server success, mutation at final conditional UPDATE,
and explicit exact recovery without reexecution. The same new begin-barrier tests
against the prior harness reproduced seven failures, including all five review
vectors; two Account vectors already rejected execution. Corrected focused results:
**193 A2/C2 tests +5 Account gate tests =198 PASS**. Selected Account/sync regressions:
**4 files /35 PASS**. Full **199 files /2,351 tests:2,350 PASS**, with only the
previously reproduced exact-base Ledger architecture assertion. Typecheck, lint/UI
guard, Backend build and changed-file formatting pass. The disposable network-none
Server83 fixture was recreated for the accepted clean-fixture replay/harness and
bridge; no hosted connection or migration modification occurred.

F1 evidence: `/private/tmp/a2-f1-before.log`, `/private/tmp/a2-f1-focused-final.log`,
`/private/tmp/a2-f1-selected.log`, `/private/tmp/a2-f1-full.json`,
`/private/tmp/a2-f1-server-replay.log`, `/private/tmp/a2-f1-server-acceptance.log`,
`/private/tmp/a2-f1-bridge.log`. Validation ran in the same exact-base writable mirror;
only the F1 files were transferred and byte-verified in the existing requested worktree.

| F1 final answer                                             | Answer |
| ----------------------------------------------------------- | ------ |
| F1 fixed                                                    | YES    |
| Kill during final admission can execute fake                | NO     |
| Disable during final admission can execute fake             | NO     |
| New DISABLED config during final admission can execute fake | NO     |
| Cancel/fence change during final admission can execute fake | NO     |
| Trip revoke during final admission can execute fake         | NO     |
| A→B→A final window fenced                                   | YES    |
| Final local admission occurs after async server admission   | YES    |
| Failed final admission preserves START responsibility       | YES    |
| Failed final admission creates retry/fallback authority     | NO     |
| Synthetic harness production reachable                      | NO     |
| Second dispatch authority created                           | NO     |
| Server83 real dispatch CLOSED                               | YES    |
| UNKNOWN protection preserved                                | YES    |
| Shadow install remains impossible                           | YES    |
| Server83/SQLite50 changed                                   | NO     |
| New migration                                               | NO     |
| Runtime/provider gates CLOSED                               | YES    |
| New regression                                              | NO     |
| Commit                                                      | NO     |
| Push                                                        | NO     |
| Ready for targeted independent recheck                      | YES    |

## Required answers

YES below refers to the implemented closed adaptation and accepted unchanged
production authority, not live dispatch. Synthetic metering is never reported as
real provider billable usage. Production activation acceptance remains separate.

| Question                                          | Answer                                         |
| ------------------------------------------------- | ---------------------------------------------- |
| A2 complete                                       | YES                                            |
| Uses Server83 control plane                       | YES                                            |
| Uses C2 continuation/attempt lifecycle            | YES                                            |
| New migration required                            | NO                                             |
| Process-local registry authoritative              | NO                                             |
| Router provider-neutral                           | YES                                            |
| Immutable routing pins                            | YES                                            |
| Pre-dispatch durable START required               | YES                                            |
| Provider can execute when START persistence fails | NO                                             |
| Completion meter failure can redispatch provider  | NO                                             |
| Missing tokens remain UNKNOWN                     | YES                                            |
| Retry uses new admitted attempt/call              | YES                                            |
| UNKNOWN auto-fallback possible                    | NO                                             |
| Shadow separate call/usage                        | YES                                            |
| Shadow can install                                | NO                                             |
| Kill/disable rechecked before dispatch            | YES — synthetic boundary; real dispatch CLOSED |
| Old config pins rewritten                         | NO                                             |
| Quota authority local                             | NO                                             |
| Server83 authoritative cost                       | YES                                            |
| A→B→A fenced                                      | YES                                            |
| Install failure erases usage                      | NO                                             |
| Real provider invoked                             | NO                                             |
| Vendor hard-coded                                 | NO                                             |
| Apple runtime activated                           | NO                                             |
| Admin Portal/billing/UI added                     | NO                                             |
| sync_operations sole scheduler                    | YES                                            |
| Five C denials unchanged                          | YES                                            |
| Server83/SQLite50 changed                         | NO                                             |
| Runtime/provider gates CLOSED                     | YES                                            |
| Hosted Dev/Production accessed                    | NO                                             |
| Commit                                            | NO                                             |
| Push                                              | NO                                             |

No migration/security/authority gate remains for this explicitly authorized closed
harness. Real provider execution, issuer/credential/secret resolution, real gateway/
custody provisioning, inbound B, Admin UI, billing, training/Product Intelligence/CXE,
notification sending/UI, device/live cancellation and deployment remain unimplemented.
The existing cached/offline auth-launch rule and accepted CP13 security limits are unchanged.

**STOP — A2 F1 CORRECTION COMPLETE / READY FOR TARGETED INDEPENDENT RECHECK.**
