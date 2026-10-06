# Current Implementation State

Date: 2026-10-06 (Pacific/Auckland).

## Current checkpoint — CP14 persistence / F1–F6 targeted recheck

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
