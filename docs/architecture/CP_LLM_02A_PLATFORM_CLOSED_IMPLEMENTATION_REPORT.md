# CP-LLM-02A — CLOSED implementation Owner Review

2026-10-12 (Pacific/Auckland). R2B bootstrap recovered; protected SQL and facade/
profile/witness implemented in isolated `codex/cp-llm-02a-closed`.
**LOCAL CLOSED IMPLEMENTATION — OWNER REVIEW ONLY. No integration or activation.**

## Source and migration

Canonical main remains `741579c8bac3f898669ca331875a28efc645cfa2` at
`/Users/xoery/Project/otr-mobile`. Original dirty checkouts and concurrent builders
are preserved. This worktree is `/private/tmp/otr-cp-llm-02a-closed-20261012`,
HEAD741579c, uncommitted. Concurrent Core advanced to `ee603f5dcb60b42d9b37e4fb9a20feebd8026f27` with eight Server
files through `20261011000800_trip_core_v2_retained_claim_fence.sql`, clean at
final inspection. No Core source/migration was copied or changed here.

One forward migration: `20261012000100_model_task_protected_admission.sql`, ordered
after Core85–92 at integration. Verified on the exact retained synthetic Server84
baseline plus this migration; the combined Core85–92 chain was not rehearsed.
Historical Server83/84, SQLite1–53 and frozen contracts remain unchanged.

## Protected admission

Immutable Account/integration/task→Call, unique logical request/key and Call,
registered request/profile/policy snapshots and hashes, currency/task ceiling/
deadline. FORCE RLS, restricted meter-writer permissions, immutable/association
triggers; no additional ledger or public dispatch root.

Existing reserve/mark roots now require the binding. Existing environment/integration
and Trip locks serialize independent callers. Exact identical authorized replay
returns the original Call and creates no Call/START/Hold/binding. New identities
remain denied after TERMINAL/UNKNOWN, restart, cancellation/fence and scope rotation.
Hold calculation and Account/day limits remain Server83/84 authority; task currency
and ceiling bound that conservative Hold. Mark checks deadline and original current
scope/grant/configuration/Trip/revision/fence authorization. Legacy unbound Calls
remain recoverable but cannot dispatch. No backfill, destructive rollback or key release.

## R2B bootstrap and corrected failures

Shared `scripts/cp15/security-acceptance.py` is unchanged. The task-owned harness
reads the actual disposable DEV revision (7 in this image), uses exact read-and-CAS
initialization, proves stale-CAS rejection and exact replay, and never relaxes CAS.
It adapts only its in-memory bootstrap copy and supplies a registered structural
schema capability in its synthetic provider configuration.

Resolved implementation defects within the approved design: SQLSTATE42501 at root
replacement/SET ROLE (adopted Server84 temporary role/CREATE grants and revoked them
in the same migration transaction); SQLSTATE42702 on a replay-grant alias (renamed
alias). Resolved fixture defects: RESERVED→TERMINAL correctly raised P0001 /
CP14_OBSERVATION_FENCE (retained responsibility, isolated subsequent cases by Account);
a sibling accidentally used another Account namespace; Trip owner change did not
remove linked membership; reusing a request across different command roots correctly
raised P0001 / CP14_CHANGED_REQUEST. No assertion or historical root was weakened.
The fixture's existing non-SET/non-INHERIT membership edge is preserved exactly;
temporary migration privilege edges are removed.

## Facade, profile and witness

- Shared strict `otr-model-task-v1` request/result and technical witness types under
  `src/domain/intelligence/modelTask.ts`: no Flight business fields, URLs, credentials,
  executable validators or caller provider selection.
- `modelTaskProfile.ts` binds the fixed immutable first Flight profile from compiled
  CP15 prompt/envelope/schema/minimizer/privacy pins. `projectModelTaskRequest` maps
  genuine existing Task identity/policy and separate prepared-package custody pins.
  Non-Flight durable admission, dynamic registration and cumulative budgets are deferred.
- CLOSED caller/fixture updates supply the required exact binding. Load checks task/
  private input reference/hash/bytes/policy/deadline against the existing Flight package.
- Structural JSON is retained separately in existing private custody before semantic
  rebinding. The witness survives semantic rejection and raw-response recovery.
  `ExecutionReport.response_sha256` remains the interpretation digest. Historical
  results without a witness acquire no retroactive technical-success claim.
- `createClosedModelTaskFacade` reads through existing repository/executor owners,
  rechecks cancellation/fence/generation after I/O, and projects finite safe errors,
  current continuation/attempt certainty and independent metering. Private output reads
  revalidate exact attempt/request/schema/bytes/hash and current disclosure authority.
  No startup, route, scheduler, retry, shadow, canonical admission or provider wiring.

## Verification

Actual PostgreSQL roots in UUID-named network-none disposable clones:
**20 check groups PASS**. Evidence: `CP_LLM_02A_R2B_POSTGRESQL_EVIDENCE.json`.
Observed lock barriers prove winner commit and rollback, simultaneous independent
sequence1 callers, exact replay, changed bindings and zero extra durable rows on
rejection. Also TERMINAL/UNKNOWN lifetime uniqueness, real container restart,
deadline reserve→mark expiration, exact10240-nano Hold boundary/currency mismatch,
Account/day boundary, grant/Trip/verifier revocation, scope rotation, historical
recovery, cancellation/stale fence, RLS/guards/role denial and privilege preservation.
Python/PostgreSQL frozen request/policy/profile JSON/SHA256 vectors match; TypeScript
checks the same vectors. Lifecycle invariance across day rollover follows the
lifetime PK/immutable record (no day/deadline cleanup); no real clock rollover was simulated.

Focused local regressions: 10 files / **395 PASS, 15 SKIP**. Final network-none Linux
fixture: 10 files / **407 PASS, 3 SKIP** including anchored custody/cold recovery.
The Linux skips are two optional cases requiring F1_CUSTODY_MODULE / LIVE_W_SERVER84
plus the non-Linux denial test already covered on macOS. Optional cases were not
relabeled PASS; the actual SQL roots were verified independently by the task harness. New facade/profile/witness suite:16 PASS.
Linux evidence: `CP_LLM_02A_R2B_LINUX_EVIDENCE.json`. Typecheck and Backend build **PASS inside network-none Linux and locally**;
changed-file lint/formatting PASS locally. The final Linux evidence records each
phase exit0 and container cleanup.

The cached Node image is amd64. Initial parallel Linux suite timed out at90s;
serial worker completed97.26s. A75s emulated typecheck limit was retried separately
with a200s process allowance and passed, without changing test assertions. Docker's legacy builder
could not resolve a cached content digest and Colima did not expose the private/tmp
bind mount; direct Docker copy and a disposable dependency installer solved those
fixture issues. Existing lockfile/dependencies were unchanged; install scripts were
disabled and package preparation performed no tests. All final SQL/test execution
used network-none containers; no Hosted/provider credentials or calls.

## Manifest, limits and stop

Exact authored-file list and SHA256 values: `CP_LLM_02A_CHANGED_FILE_MANIFEST.json`.
Important files: the forward migration; task-owned SQL harness and two vector files;
shared modelTask types; modelTaskProfile/Facade/test; Flight executor and raw-response
recovery; two builder fixtures and host test; ADR `2026-10-12-model-task-protected-admission.md`;
current-state handoff, report and evidence. Earlier proposal/failure/provenance artifacts
remain attributed as historical evidence, not current failures.

Disposable database/test containers were removed. The Linux test image is retained
for reproducible review; it contains source and synthetic fixtures, no credentials.
Temporary preparation files are under `/private/tmp/otr-cp-llm-linux-test-runtime`.
No Git commit/merge/push, Hosted deployment/mutation, real LLM/Flight Data Provider,
production/device operation or Core writer change. No generic multi-attempt/lineage
budget guarantee, real billing/provider-policy/latency calibration or full-suite/full
combined migration-chain acceptance. Current Hosted enforcement is not upgraded by
this local proof. Actual integration and runtime/custody provisioning remain separate.

**All actual runtime/Hosted/provider/C5/C9/Core admission gates remain CLOSED.**
**STOP — CP-LLM-02A CLOSED IMPLEMENTATION OWNER REVIEW.**
