# Current Implementation State

Date: 2026-09-13

## Current Milestone

OTR Mobile 2.0 Ledger 2.0 Stage 7.2A, **Payment Lifecycle**, is implemented and
its engineering gate is approved after automated, Hosted Dev, and two-client
Simulator acceptance. Stages 1 through 7.1 remain the stable baseline.

Stage 7.2B Adjustment has not started. Stage 7.3 export also remains absent.

Current local SQLite schema version: 13.

## Stage 7.2A Delivered

- immutable Paid assertions scoped to a finalized Settlement/Transfer lineage;
- Received confirmation of the complete repayment proposition, producing a
  separate immutable discharge fact; Paid alone never reduces debt;
- partial and cross-currency repayment with immutable valuation snapshot and fee
  treatment;
- terminal `CONFIRMED`, `REJECTED`, `DISPUTED`, and `CORRECTED` Payment states;
- organizer correction through an explicit replacement Payment linked by
  `supersedesPaymentId`; organizer authority is never recorded as recipient
  confirmation;
- distinct confirmed remaining, awaiting reservation, and available-to-report
  amounts, with transactional overbooking/overpayment protection;
- operation-id idempotency, response-loss retry, transfer-revision concurrency,
  durable offline queue replay, and canonical typed audit lineage;
- stable `SETTLEMENT_REOPEN_NOT_ALLOWED` for every finalized Settlement;
- Backend endpoints and repository-only Mobile flows for Paid, Received,
  reject, dispute, and correction;
- SQLite v13 cached Payment, valuation, discharge, actor-authority, and audit
  lineage state with restart recovery.

Adjustment Settlement tables, delta calculation, and post-finalization Expense
correction behavior are deliberately deferred to Stage 7.2B.

## Validation Status

- `npm test`: 38 files / 129 tests pass. Typecheck, lint, diff check, and targeted
  Prettier pass.
- Local Supabase passes two clean resets and 8 SQL files / 170 pgTAP assertions
  per run; the
  shadow-schema diff is empty. Manifest: 90 tables, 1,264 columns, 655
  constraints, 301 indexes, 59 functions, 77 triggers, 90 RLS tables, 178
  policies, and 3 private buckets; checksum
  `4c25c760441441cc19113704d361ac2ee3c2f8f86e2c3984413771be841d28d0`.
- Hosted Dev contains all three Stage 7.2A forward migrations and passed the complete
  lifecycle: Paid without discharge, Received, partial payment, reject release,
  cross-currency valuation/fee, recipient dispute, terminal-state rejection,
  organizer replacement correction, replacement Received, and reopen rejection.
- Identical operation replay converged. Two simultaneous Paid assertions against
  one transfer revision produced one success and one stable conflict, preventing
  reservation overbooking.
- Canonical audit authority remained server-derived, including a recipient
  dispute submitted with a false payer-authority field.
- Two authenticated Simulators (ordinary member and owner) converged byte-for-
  byte on schema v13, Settlement digest, 4 Payment facts, 2 discharge facts
  totaling NZD 3,500 minor units, one valuation snapshot, and the audit sequence.
- With the Backend stopped, both Simulators force-quit/restarted and rendered the
  same finalized/payment history from SQLite with explicit cached/offline state.
- Affected Stage 7.1 and earlier regression suites remain green.

## Authoritative Sources For The Next Checkpoint

- `docs/ledger/LEDGER_2_0_IMPLEMENTATION_PLAN.md`
- `docs/ledger/LEDGER_2_0_API_CONTRACT.md`
- `docs/adr/0014-ledger-stage-7-2-payment-and-adjustment.md`
- `docs/ledger/LEDGER_2_0_SYNC_CONFLICT_MODEL.md`
- `docs/ledger/LEDGER_2_0_UX_FLOW.md`

## Next Checkpoint

Stage 7.2A is complete. Stop and await explicit approval before Stage 7.2B
Adjustment. Stage 7.3 owns export and integrated physical-device acceptance; no
Stage 7.2B, Stage 7.3, Stage 8, or Production work is authorized.

## Safety Notes

Production and legacy OTR Web remain read-only and were not inspected or
modified. Mobile UI does not access Supabase business tables directly. SQLite
remains the Mobile source of truth. Paid is evidence, not debt reduction; only
immutable confirmed discharge changes outstanding debt. Finalized Settlements
never reopen, and later financial corrections require Stage 7.2B Adjustment.
