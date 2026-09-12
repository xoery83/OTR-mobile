# Current Implementation State

Date: 2026-09-13

## Current Milestone

Ledger 2.0 Stage 7.2B, **Settlement Adjustment**, is implemented and gated.
Stage 7.2A and all earlier Ledger behavior remain the stable baseline.

Current local SQLite schema version: 14.

## Stage 7.2B Delivered

- immutable, non-forking root Settlement/Adjustment lineage;
- frozen root scope semantics and sealed balance reconstruction from only the
  root balance vector plus prior immutable Adjustment delta vectors;
- current canonical financial-input digest and deterministic
  `delta = current - sealed` transfer plan, with positive meaning receivable;
- zero-sum enforcement for root, each Adjustment delta, sealed, current, and
  delta vectors;
- post-finalization Expense create/change/delete/restore and cutoff-crossing
  behavior without reopening or rewriting historical facts;
- derived `CURRENT`, `ADJUSTMENT_REQUIRED`, and `ADJUSTMENT_BLOCKED` read state,
  with no persisted draft Settlement;
- Journey-reader preview, organizer-only finalize, mandatory reason, canonical
  actor/authority audit, stale-head/input rejection, and idempotent replay;
- explicit zero-transfer Adjustment acknowledgement only for a changed financial
  digest; identical input creates no history;
- root and Adjustment Transfers retained independently, including opposing
  directions, with their own Payment and Discharge lineage;
- outstanding projection across the sealed lineage minus confirmed Discharges;
  Payment assertions and Discharges never enter Adjustment delta;
- bootstrap and incremental-pull lineage projection, SQLite v14 persistence,
  durable Adjustment queue replay, cold restart, and existing Settlement UI
  extensions.

`POST /v2/trips/:tripId/settlements/:id/reopen` remains a stable HTTP 409
`SETTLEMENT_REOPEN_NOT_ALLOWED`.

## Validation Status

- `npm test`: 39 files / 136 tests pass; typecheck and lint pass. Targeted
  formatting for all changed source/docs passes. The repository-wide formatter
  still reports only the pre-existing unrelated `AGENTS.md` and
  `src/hooks/useStage4BPhysicalSmoke.ts` formatting debt.
- Domain tests cover sign semantics, deterministic vector/transfer calculation,
  new/change/delete/restore/member-union/cutoff cases, descriptive-only digest
  stability, changed zero-delta input, and Payment/Discharge isolation.
- Local Supabase passed two clean resets and 9 SQL files / 189 pgTAP assertions
  per reset. Both clean manifests matched and both local and Hosted Dev public
  schema diffs are empty.
- Canonical manifest: 91 tables, 1,279 columns, 670 constraints, 305 indexes,
  65 functions, 83 triggers, 91 RLS tables, 178 policies, and 3 private buckets;
  checksum `fa48bf7673064210e198d918a6ee3bf7a6b15ff4891b966ca841dc44ccbd9824`.
  Migration-lineage checksum:
  `abd63e375f3901319ca38dfb8b6fb4162902cbd73bd9ffddc83b6f50aa6691bf`.
- Hosted Dev project `tuqigdxrvrerfewsxqgm` contains the two Stage 7.2B
  forward migrations. The second records two previously approved Hosted
  hardening changes in the rebuildable lineage; no Production target changed.
- Hosted two-identity acceptance passed reader preview, organizer-only finalize,
  Payment isolation, opposing immutable obligations, concurrent same-head
  finalize (one success/one stable stale), response-loss replay, zero-transfer
  changed input, canonical outstanding, and byte-identical bootstrap results.
- Two authenticated Simulators independently migrated v13→v14 and converged on
  1 root + 3 Adjustments, 6 delta rows, 2 opposing Transfers, 1 Payment,
  1 Discharge, and 6 audit facts. Their canonical SQLite projection SHA-256 was
  identical: `8039bfdf5599c6a6573efdffe5edd339efa2c09b5f94060d30fe2b7299b644eb`.
- With Backend stopped, both Simulators force-quit/restarted and rendered the
  same lineage and outstanding state from SQLite with explicit offline status.

## Authoritative Sources For The Next Checkpoint

- `docs/ledger/LEDGER_2_0_IMPLEMENTATION_PLAN.md`
- `docs/ledger/LEDGER_2_0_API_CONTRACT.md`
- `docs/adr/0014-ledger-stage-7-2-payment-and-adjustment.md`
- `docs/ledger/LEDGER_2_0_SYNC_CONFLICT_MODEL.md`
- `docs/ledger/LEDGER_2_0_UX_FLOW.md`

## Next Checkpoint

Stage 7.2B is complete. Stop and await explicit approval before Stage 7.3.
Stage 7.3 export/reporting, Stage 8, Production work, and legacy Web changes are
not authorized.

## Safety Notes

Production and legacy OTR Web were not inspected or modified. Mobile UI still
uses repositories and the Backend contract; SQLite remains the local source of
truth. Historical Settlement, Adjustment, Transfer, Payment, Discharge, and
audit facts are immutable. Cached capability is UX-only; Backend authorization
is authoritative. There are no open Stage 7.2B blockers.
