# Expense consistency closure — Phase 1 / Phase 2 gates

2026-09-28. Phase 1 PASS; Phase 2 local gate PASS. Overall closure is not delivered:
Backend chain resolution, normal product UI, latest-state rates and recovery are
Phases 3–6. Neither incident has been repaired.

## Starting state / compatibility

- Branch `integration/ledger-polish-canonical`, HEAD `d7e3ffff4ee260512bf96f5948371ad7262318ed`.
- Current checkout retained. Existing uncommitted Settlement changes, precision
  migration, Journey routing and attachment fixes preserved. No commit/push.
- Hosted migration tail remains `20260928000100`; local tail was v39, now v40.
- Both incident audits and Owner-approved implementation checkpoint read before
  implementation. No core contract conflict or redesign; no contract deviations.

## Phase 1

- `src/domain/ledger/expenseIntent.ts`: typed intents/user patches, deterministic
  comparisons, verified three-way eligibility and conservative legacy candidates.
  UTC encodings compare by instant; historical date-only occurredAt remains UTC
  midnight. economicDate is independent. User splits exclude settlementMinor and
  derived rounding adjustment. Explicit valuation/lifecycle cannot hide in UPDATE.
- `ledgerMutationContracts.ts`: v2 intent envelope, operation result/receipt and
  conflict-chain request/read/response schemas. Existing v1 routes remain intact.
- Expense repository: no-op and attachment-only Save produce zero Expense UPDATEs,
  no revision/audit change, while preserving authorization, frozen-input protection,
  expected revision/attachment-set validation and atomic receipt work.
- ADR 0056 and incremental Product/API/Data Model/Offline Sync updates precede
  implementation. ADRs 0033/0040/0054 record the tightened contracts.
- Gate: initial six suites / 63 tests, typecheck, scoped ESLint and diff check PASS.
  Phase 1 introduced no migration, dependency or deployment.

## Phase 2

SQLite v40 adds account-scoped canonical baselines, version-2 command sequences,
predecessors/observed bases, immutable execution binding and immutable operation
receipts. Existing queue bodies/keys are not migrated or rewritten. Canonical
baselines missing from historical cache are explicitly unverified; no baseline is
invented from pending projections, and no automatic merge is authorized.

Expense CREATE/UPDATE/valuation/DELETE/RESTORE results bind the exact command ID
saved in their transaction. No-op has operationId=null/changed=false. Current
states are queryable by operation ID; receipt-less COMPLETED never confirms.
Existing validated HTTP canonical responses correlate to their bound request/key
through the worker and are recorded as compatibility receipts. Server v2 receipt
and conflict outcome delivery remain Phase 3. This bridge does not close conflicts.

- Common repository reconciliation monotonically stores canonical and replays
  unresolved typed intent, protecting later DELETE/RESTORE and local audit history.
  Pull uses that boundary for causal commands; legacy pending/failed/conflict data
  remains protected and deferred. Equal FAILED commands no longer become locally
  complete based on a matching canonical alone.
- Receipt/evidence mapping, projection, command completion and dependency wake are
  one SQLite transaction. Dependencies require APPLIED disposition; KEPT_SERVER /
  SUPERSEDED or failed/conflicted predecessors remain actionable. A network attempt
  (including zero-attempt-count auth pause) freezes coalescing/body/key behavior.
- Older accepted responses can confirm themselves without regressing the baseline.
  A pull before CREATE acknowledgement retains the newer canonical and consolidates
  only an unprotected confirmed duplicate mirror, preserving newer local intent.
- aggregate.revision is independent of feed revision/tombstone flags. Canonical-less
  Expense events remain durable until full canonical evidence is available.
- Generation checks protect network continuation, reconciliation and pull cursor
  commits across account interruption. Restart retains bindings and original keys.
- Completed causal operations/receipts are excluded from ordinary maintenance deletion.
- Recording another conflict never locally supersedes server OPEN history. Health
  equality remains evidence only: local OPEN closure is removed; Phase 3 supplies
  the ordinary server-backed closure mechanism.

## Validation / readiness

- Focused affected-domain gate: 16 suites / 195 tests PASS (contracts, SQLite,
  repositories, queue/worker, Health, attachments and existing Backend gateway).
- TypeScript, scoped ESLint, affected Prettier, diff check and Backend build PASS.
- Full run: 138 suites / 959 tests PASS; two known unrelated suites fail:
  Account Switching's React Native Flow loading, and LedgerStage6Screen's existing
  direct API import detected by the architecture guard. Full-suite/release gate
  is therefore not green; these were recorded before this task.
- No native build/install, Hosted Dev migration/deployment, Production access,
  business recovery, financial confirmation, Git commit or push.

Next approved scope: Phase 3 typed patch Backend/SQL, verifiable historical bases,
real DELETE/RESTORE, atomic multi-conflict chain lifecycle/digest/CAS, immutable
resolution audit and idempotent replay, permissions/frozen protection. Recheck the
Hosted migration tail before assigning the next forward migration; Dev deployment
still follows the existing separate authorization/rollback process. Phase 4 normal
UI and Phase 6 incident recovery remain mandatory before recoverability acceptance.
