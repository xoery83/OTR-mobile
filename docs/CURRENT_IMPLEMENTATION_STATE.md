# Current Implementation State

Date: 2026-09-12

## Current Milestone

OTR Mobile 2.0 Ledger 2.0 Stage 7.1, **Preview & Finalization**, is implemented
and has passed automated, Hosted Dev, and two-client Simulator acceptance.
Stages 1 through 6 remain the physically validated stable baseline.

Stage 7.2 has not started. Paid/Received, partial or cross-currency repayment,
payment disputes/corrections, adjustment settlement lifecycle, and export remain
absent.

Current local SQLite schema version: 12.

## Stage 7.1 Delivered

- non-persistent canonical-server preview with `PREVIEW_READY` and
  `PREVIEW_BLOCKED` response states;
- explicit `RATE_REQUIRED` and open-conflict blockers, with Draft and Deleted
  Expenses classified as exclusions rather than silently included;
- deterministic integer-minor-unit paid/owed/net balances with an exact
  zero-sum invariant;
- deterministic greedy transfer planning and canonical SHA-256 input digest;
- organizer-only authoritative finalization that rereads, locks, recomputes,
  rejects stale input with `SETTLEMENT_INPUT_STALE`, and commits atomically;
- one canonical active Stage 7.1 Settlement per Journey, idempotent replay, and
  convergent concurrent identical finalization;
- immutable normalized input snapshots containing payer/member identity,
  participant splits, original and settlement values, valuation evidence, and
  algorithm/settings facts required for exact explanation;
- immutable finalized member balances, transfer obligations, and one canonical
  successful `FINALIZED` audit event;
- finalized-input Expense mutation protection without rewriting the historical
  Expense or valuation;
- bootstrap, incremental pull, repository read model, and offline cached
  finalized history;
- organizer confirmation UI. No payment action is exposed before Stage 7.2.

SQLite v12 adds only the Stage 7.1 Settlement header, normalized input, member
balance, transfer, and Settlement audit tables/indexes. Preview is never stored,
and no payment or export table was added for this gate.

## Validation Status

- `npm test`: 36 files / 121 tests pass. `npm run typecheck` and
  `npm run lint` pass. All Stage 7.1 changed files pass targeted Prettier.
- Domain/property coverage verifies blocker classification, exact zero-sum,
  deterministic digest/balances/transfers under input reordering, frozen input
  copies, and integer rounding including the odd-minor-unit case.
- Backend coverage verifies authentication/capability, non-persistent preview,
  request validation, ISO UTC offset round-trip, finalization, and forbidden
  ordinary-member preview/finalize access.
- Local Supabase validation passes two clean resets, 7 SQL files / 142 pgTAP
  assertions per run, deterministic manifest comparison, and zero shadow-schema
  diff. Manifest: 88 tables, 1,223 columns, 610 constraints, 296 indexes,
  55 functions, 75 triggers, 88 RLS tables, 178 policies, and 3 private buckets;
  checksum `dcbc78a84ac4ac2a307784ee73a5390ba30a8a1e4168a4e480b65e3496a6bb82`.
- Hosted Dev migration lineage matches all 12 repository migrations through
  `20260912000800_ledger_2_stage_7_1_active_settlement_guard.sql`.
- Hosted Dev integration verified stale preview rejection after a concurrent
  canonical Expense change; two concurrent finalizations with distinct
  idempotency keys returned one Settlement id; repeated finalization did not
  duplicate Settlement, transfer, input, or audit facts.
- Hosted Dev integration verified finalized Expense mutation protection and
  that changing the current member display name leaves the frozen finalized
  identity/input exactly explainable.
- Backend-versus-Mobile parity passed on the actual two-client acceptance
  Settlement: identical Settlement id, digest
  `f91776eff1e8f3b8e215b860224cb979a2432d7af50fc55e3e971f769b47c1d9`,
  balances `+5000/-5000`, one NZD 5000 transfer, and one normalized input on
  Backend and both SQLite databases.
- Organizer Simulator acceptance passed READY preview, odd-cent deterministic
  allocation, explicit confirmation, canonical finalization, and finalized UI.
  A second authenticated member Simulator cold-started, bootstrapped, and read
  the same obligation. Ordinary-member prepare/finalize was rejected with 403.
- Simulator blocker acceptance passed nine open-conflict blockers and a separate
  `RATE_REQUIRED` blocker. Force-quit/restart removed a computed preview, proving
  it was not persisted.
- With the business Backend stopped, the member Simulator force-quit/restarted
  and reconstructed the complete finalized Settlement from SQLite, while clearly
  reporting cached/offline state.
- The affected Stage 4B two-identity Simulator suite passed, including creator
  edit/delete/restore, idempotent response-loss recovery, conflict, canonical
  audit pull, organizer reason enforcement, and finalized-settlement guard.
  Full automated Stage 4–6 suites also remain green.

During Simulator acceptance, two 7.1-scoped integration defects were found and
fixed: PostgreSQL numeric valuation rates are normalized to canonical strings at
the Backend boundary, and Settlement timestamp validation accepts canonical UTC
offsets returned by PostgreSQL. Stale preview UI is cleared on Journey change or
request failure.

`npm run format` remains blocked only by the pre-existing baseline differences
in `AGENTS.md` and `src/hooks/useStage4BPhysicalSmoke.ts`; Stage 7.1 files pass
targeted formatting.

## Authoritative Sources For The Next Checkpoint

- `docs/ledger/LEDGER_2_0_IMPLEMENTATION_PLAN.md`
- `docs/ledger/LEDGER_2_0_API_CONTRACT.md`
- `docs/adr/0013-ledger-stage-7-1-settlement-finalization.md`
- `docs/ledger/LEDGER_2_0_SYNC_CONFLICT_MODEL.md`
- `docs/ledger/LEDGER_2_0_UX_FLOW.md`

## Next Checkpoint

Stage 7.1 is complete. Stop and await explicit approval before Stage 7.2 Payment
Lifecycle & Adjustment. Stage 7.3 owns export and integrated physical-device
acceptance; no Stage 7.2, Stage 7.3, Stage 8, or Production work is authorized.

## Safety Notes

Production and legacy OTR Web remain read-only and were not inspected or
modified. Mobile UI does not access Supabase business tables directly. SQLite
remains the Mobile source of truth. Stage 6 pre-settlement position remains a
reporting projection, not debt; only finalized Stage 7.1 transfers are canonical
obligations. Finalization does not mutate historical Expense or valuation facts.
