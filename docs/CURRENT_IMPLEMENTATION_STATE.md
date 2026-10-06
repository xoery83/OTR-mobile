# Current Implementation State

Date: 2026-10-06 (Pacific/Auckland).

## CP14 Agent B2 — F1 corrected / ready for targeted independent recheck

- Fresh worktree `/Users/xoery/.codex/worktrees/cp14-inbound-ai-client/otr-mobile-canonical`,
  branch `intelligence/cp14-inbound-ai-client`; exact base/HEAD
  `508d79efb865ac8d7fc21ff949b6e6a12746f39a`. No commit/push.
- Owner clarification resolves the historical ordering stop: package NEEDS_REVIEW,
  review_version and digest-bound proposal content/references precede consent.
  Only verifier-derived explicit OTR_USER ACCEPT/REJECT/DEFER reserves a decision.
  ACCEPT IDs persist before CP13A prepare; nonaccept IDs are null.
- Targeted F1 correction gates all NEW dispositions on CP13B owning evidence
  freshness before custody/reservation. Nonaccept does not require READY; exact
  sealed historical recovery remains reauthorized and unchanged.
- Unwired TEST_ONLY vendor-neutral adapter uses Server83 protected roots, admitted
  material custody/read projections, CP13B Flight interpretation/closure and CP13A
  preparation/exact recovery. No production read/custody implementation is installed.
- Server83 548 checks +7 preflight probes PASS;57 B2 lifecycle tests PASS against
  real Server83 and native SQLite50. Full suite:2407 PASS,1 unchanged baseline
  Ledger architecture-boundary failure. Typecheck/lint/UI guard/backend build PASS.
- Server83/SQLite50 and every existing implementation source remain unchanged.
  No new migration, scheduler, authority, A2 execution, model cost or remote access.
  Runtime/provider/public-client gates remain CLOSED.
- Next step: targeted independent F1 recheck of
  `architecture/TRIP_CHECKPOINT_14_AGENT_B2_INBOUND_AI_REPORT.md`. The independent
  `architecture/TRIP_CHECKPOINT_14_AGENT_B2_INBOUND_AI_REVIEW.md` remains unchanged;
  its correction requirement is not self-certified as an independent PASS. Public ChatGPT/Claude/MCP activation remains separately gated.

## CP14 Agent A2 — F1 correction / ready for targeted independent recheck

- Worktree `/Users/xoery/.codex/worktrees/cp14-a2-outbound-runtime/otr-mobile-canonical`,
  branch `intelligence/cp14-outbound-runtime`, exact retained HEAD/base
  `2b88464f259b3daa69fe6621b988838d5de2806f`. All changes remain uncommitted; no push.
- Owner accepted the initial dispatch hard stop and authorized a TEST-only injected
  synthetic harness after real call/START responsibility, fresh eligibility and
  verification that Server83 dispatch remains CLOSED. No real MAY_HAVE_STARTED,
  live provider, credentials, Apple activation or kill-during-live-I/O claim.
- Decision-only provider-neutral routing pins immutable bounded control-plane,
  schema/privacy/network/risk/budget/health/price facts in existing request-material
  identity. C2 owns attempts, UNKNOWN, fallback, shadow and installation fences.
  Completion-meter failure retains success/result; exact recovery never reexecutes.
- Server83/SQLite50, accepted reviews/preflight and all historical migrations are
  unchanged. sync_operations remains sole scheduler; five C denials are unchanged.
  No endpoint, default factory, production read/custody gateway, second usage ledger,
  UI, notifications, billing, Hosted Dev/Production access or deployment is added.
- Targeted F1 correction adds final fresh Server83/retained identity checks after
  synthetic begin, then a local attempt/task/fence/Trip CAS and synchronous post-COMMIT
  gate-release handoff. Failed admission executes no fake and preserves exact START/
  recovery responsibility. Independent A2 review is unchanged; only F1 is corrected.
- Validation: A2+C2 focused 193 tests plus5 Account gate tests;13 new barrier/CAS
  tests and selected4 files/35 tests pass. Full199 files/2,351 tests has2,350
  passed and the same one Ledger architecture assertion reproduced at exact base.
  Accepted offline Server83 harness548 checks and actual new bridge acceptance
  pass. Typecheck, lint/UI guard, Backend build, formatting and preservation pass.
- Authority and limitations: `architecture/TRIP_CHECKPOINT_14_AGENT_A2_OUTBOUND_RUNTIME_REPORT.md`
  and `adr/2026-10-06-cp14-a2-closed-outbound-seam.md`. Next approved step:
  **Targeted independent F1 recheck only**. Real activation remains separately gated.

## CP14 Agent C2 — targeted F1–F4 correction / ready for independent recheck

- Existing fresh worktree `/Users/xoery/.codex/worktrees/cp14-c2-continuation/otr-mobile-canonical`,
  branch `intelligence/cp14-continuation-runtime`, exact retained HEAD/base
  `439168065df182975dda03a75e94908f8d9cc389`. Changes are uncommitted; no push.
- Owner-approved `INTELLIGENCE_CONTINUATION_WAKE` contract uses existing queue fields
  and SQLite50: one deterministic retained row, exact body/key/scope validation,
  coalescing/re-arm and Account/claim/signal conditional completion. Completed means
  wake-pass completion only. Five C Import denials remain unconditional.
- Closed injected runtime supports three waits, independent pass/outstanding work,
  eligible reservation, exact execution/recovery, cancellation/late usage and
  Account/Trip/Run/Candidate/Event installation fences. File-backed cold resume and
  typed attention facts use durable journals, never queue count/lease as execution truth.
- Existing central operational-sync timer/activity accepts the injected adapter for
  cold/reconnect scheduling. Ledger UI counts/completion scopes exclude intelligence;
  no provider executor is called by wake/scheduling. Default adapter remains null.
- No Server84/SQLite51, second scheduler, new authority, provider/Apple activation,
  UI, notification, Hosted Dev/Production access or deployment. Server83/SQLite50,
  historical source hashes and accepted persistence review/preflight remain unchanged.
- Independent review's four C2 defects corrected: shared wake dependency admission/
  release/projections, post-COMMIT idle-owner delivery, exact pre-start meter CAS,
  and Account/observed-row conditional invalid quarantine. Original review is preserved.
- Validation: C2 lifecycle107 tests, selected19 files/666 tests and29 new adversarial
  tests PASS; typecheck, lint/UI guard and Backend build PASS. Full198 files/2,265
  tests has2,264 passed and the same existing Ledger architecture assertion.
  No F1–F4 failure is classified as baseline; no new regression.

- Authoritative C2 implementation/validation and required answers:
  `architecture/TRIP_CHECKPOINT_14_AGENT_C2_CONTINUATION_RUNTIME_REPORT.md`.
  Next step: **Targeted independent F1–F4 recheck only**. Real provider/Agent A/inbound/device
  integration remains separately gated; valid cached offline access is unchanged.

## Accepted CP14 persistence foundation / historical recheck record

- Worktree `/private/tmp/otr-cp14-persistence`, branch
  `intelligence/cp14-persistence`, exact retained HEAD/base
  `c4571746b0c300fa3b46842cd37745963567338c`. Changes are unstaged and
  uncommitted. Canonical and A/B/C input checkouts are preserved. No commit/push.
- One additive Server83 and SQLite50 implement the approved persistence blueprint:
  isolated integration/provider/price registry, call responsibility, append-only
  nullable usage/cost, admin audit/health, external identity/grants, package/
  invocation/review recovery, and local continuation/attempt journals.
- Owner's VerifiedCallContextV1 clarification is authoritative: an injectable
  trusted gateway proves authentication; fixed SQL roots check actual dedicated
  session, request digest and current durable authorization. This is a closed
  test boundary, not a credential verifier or provisioned connector.
- `sync_operations` remains the sole scheduler. Local repository callbacks must
  validate owning Import/Trip/manifest and policy/budget admission locally, and
  verify exact recovery evidence. No callback may perform external I/O while the
  Account gate/transaction is held. No startup adapter or scheduler is added.
- Unknown execution, result installation and metering remain independent. Retained
  queue/Capture/Source/revision/Input/Run/Candidate references prevent cleanup,
  including FK OFF. No TTL deletion or metadata pruning horizon is invented.
- Server defaults remain killed and `runtime_enabled=false` with a closed CHECK;
  ordinary configuration cannot activate execution. Event/Source/Import gates and
  the five C scheduler denials are unchanged. CP13B deterministic interpretation,
  closure/preparation remain integrated and unwired; CP13A security limitations
  and Apple spike status remain unchanged.
- Builder targeted F1–F6 corrections bind retained inbound/call scope, preserve
  SECURITY_ADMIN kill ownership, enforce one explicit DELTA correction lineage,
  correlate typed safe results and durably bind mutation requests in the existing
  audit journal. SQLite50, CP12/13 and A/B/C remain unchanged. The original
  independent FAIL review is preserved; targeted independent recheck is pending.
- Validation and exact file/role/function inventories are in
  `architecture/CP14_PERSISTENCE_CONTROL_PLANE_IMPLEMENTATION_REPORT.md`.
  Fresh server1→83 and seeded82→83, SQLite0→50/49→50 and FK ON/OFF pass.
  Full-suite baseline native collection and Ledger architecture blockers remain;
  no global full-suite PASS is claimed.
- Next authorized step: **CP14 Persistence Targeted Independent Recheck only**. Provider
  adapters, issuer/OAuth verifier, secret resolver, dedicated login provisioning,
  live private custody/device bridge, Admin Portal, customer billing and runtime
  activation remain deferred. No Hosted Dev/Production access or deployment.

## Active schema and accepted foundation

- SQLite migrations are contiguous **1–50**. CP11 adds Day47/Capture48; CP13A adds
  Import admission49; CP14 adds continuation/attempt50. Historical1–49 bodies
  are unchanged. Server chain has **83** migrations, ending at
  `20261006000100_external_integration_persistence.sql`; historical1–82 are
  byte-identical to the exact CP14 base.
- CP13A.1 received owner review PASS. CP13A.2 implements protected C6/lineage4/output
  claims, Event-owned Flight services, fixed TRACK_C proof/receipt bridge,
  CREATE/UPDATE under parent CAS, Temporal **Option A**, exact private catalog/draft/
  queue/recovery and explicit Capture NEW/REUSE/REPLACEMENT. No UI/startup wiring.
- CP13A R1/R2/R3 targeted correctness fixes are independently verified: complete
  reviewed-action/proof coverage, atomic certified service absence in FK ON/OFF,
  and bounded transitive Run ancestry. Its independent security limitations remain
  recorded in the review; CP13B does not upgrade those assurances.
- Narrow terminal CREATE recovery may omit target read only for exact verified
  terminal no-commit proof, retaining Actor/Trip and all durable bindings. Successful
  results and UPDATE retain target read; missing receipt remains UNKNOWN.
- CP11 Capture owns immutable original BLOBs, bounded intake/dedup/quotas and
  Account/Trip/revision fencing. INBOX/ASSIGNED only; no automatic Source creation.
  Day uses existing certified complete/historical Event observations. Import does
  not certify membership, infer deletion or write Day projections.
- A1-I2C5, B-T3I and C-I3H accepted foundations remain CLOSED. Their accepted reports,
  runtime provisioning and provider-terminal/retry blockers remain authoritative.
  Five C import queue operation names remain scheduler-denied even with permissive
  filters. Existing factories/ports stay unwired.

## Authoritative documents for owner review

Read this handoff first; expand only into directly relevant files. Do not reaudit
legacy Web or redesign accepted CP12/CP13A semantics.

- `architecture/CP14_PERSISTENCE_CONTROL_PLANE_PREFLIGHT.md` (approved blueprint)
- `architecture/CP14_PERSISTENCE_CONTROL_PLANE_IMPLEMENTATION_REPORT.md`
- `architecture/CP14_VERIFIED_CALL_CONTEXT_V1.txt` (owner clarification)
- `architecture/OTR_INTELLIGENCE_NEXT_STAGE_PLAN.md`
- `adr/2026-10-06-cp14-persistence-authority-split.md`
- `architecture/TRIP_IMPORT_ENGINE_ARCHITECTURE.md`
- `architecture/TRIP_IMPORT_CONTRACT.md`
- `architecture/TRIP_RESERVATION_SCHEMA_REGISTRY.md`
- `architecture/INTELLIGENCE_PLUGIN_CONTRACT.md`
- `architecture/TRIP_CHECKPOINT_12_CONTRACT_REVIEW.md`
- `architecture/TRIP_CHECKPOINT_12_CONTRACT_REPORT.md`
- `adr/2026-10-05-import-engine-boundaries.md`
- `architecture/TRIP_CHECKPOINT_13A1_EXACT_SCHEMA_COMMAND_PREFLIGHT.md`
- `architecture/TRIP_CHECKPOINT_13A2_CANONICAL_FLIGHT_IMPORT_IMPLEMENTATION_REPORT.md`
- `architecture/TRIP_CHECKPOINT_13A2_IMPLEMENTATION_REVIEW.md` (targeted recheck included)
- `architecture/TRIP_CHECKPOINT_13A2_SECURITY_MANIFEST.json`
- `adr/2026-10-05-cp13a-flight-admission.md`
- `architecture/TRIP_CHECKPOINT_11_FINAL_INTEGRATION_REPORT.md`
- `adr/2026-10-05-local-capture-inbox.md`
- `adr/2026-10-05-trip-day-read-model.md`
- `architecture/TRIP_CHECKPOINT_10_FINAL_INTEGRATION_REPORT.md`

Older checkpoint history lives in its architecture/ADR/Ledger reports. Condensing
this handoff changes no accepted decision, contract, historical report or gate.

## Remaining blockers and safety boundaries

- Interpretation, explicit closure review and CP13A Confirmation/output-slot
  preparation are integrated and unwired. READY is action-specific eligibility;
  it never implies acceptance or canonical execution. Runtime activation and any
  later schema change require separate owner authorization.
- Runtime identity/credentials/connectors, activation, rollout, native/device/live
  acceptance, background collection wake and automatic startup reconciliation
  remain separately PENDING. Structural Flight/Capture/Source/participation gates
  remain CLOSED; no provider SDK/model/network access is installed.
- Source IO_UNKNOWN/host-loss/provider terminality and safe IO retry remain BLOCKED.
  Only the accepted static-PNG parser profile has its recorded test/internal
  acceptance; other binary decoders/runtime admission remain outside this slice.
  Interpretation/cancellation/pass completion cannot release protected evidence.
- Temporal A does not admit civil resolver/fold/gap arithmetic as an independent
  instant. B-T3I certificate bytes/meaning and Day ownership remain unchanged.
  Ledger/financial/economic-date/receipt/Settlement semantics are unchanged.
- Production is not a development target. Earlier Stage9 Production extraction was
  read-only and disconnected; further access/load/rollback requires new explicit
  authorization. Exact private financial totals remain outside Git. No Hosted Dev
  creation, deployment or Simulator/physical-device Release installation is
  authorized by this checkpoint.
- Valid cached sessions keep offline access; background auth failure pauses sync.
  Preserve durable UNKNOWN operations, immutable originals, claim/result/receipt
  correlation and original reviewed intent. A new Candidate/key is never no-commit
  proof. Reprocessing/merge/split needs the existing complete lineage claim review.
- Use canonical UI primitives/glossary and the mandatory UI guard before any later
  UI/copy change. UI, canonical command adapters and feature lifecycle owners were
  not changed here.
