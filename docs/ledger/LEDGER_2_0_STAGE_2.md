# Ledger 2.0 Stage 2 Checkpoint

Date: 2026-09-11
Status: Implementation complete; physical migration confirmation pending

## Delivered

Migration 5 adds an isolated local Ledger 2.0 SQLite family:

- Journey configuration, members, households, and household member weights;
- Expense aggregate root with local/server identity, local/server revision,
  tombstone, sync state, and timestamps;
- participants, exact original/settlement splits, active valuation snapshots,
  and payer PaymentRecord evidence;
- append-only local audit events, correction request storage, and pull cursors.

`LedgerExpenseRepository` owns local aggregate creation, replacement update,
tombstone, restore, hydration, sync-state changes, and reconciliation fields.
Each mutation is one SQLite transaction and appends one durable generic command
to `sync_operations`:

- `LEDGER_CREATE_EXPENSE`;
- `LEDGER_UPDATE_EXPENSE`;
- `LEDGER_DELETE_EXPENSE`;
- `LEDGER_RESTORE_EXPENSE`.

The queue is durable but deliberately has no Ledger worker in this stage. That
worker needs the Stage 3 authenticated bootstrap, pull, and command API. The
existing Phase 2A worker is not reused because it only understands the legacy
minimal Expense record.

## Compatibility And Isolation

The existing Phase 2A local `expenses` table and Dev transport remain unchanged.
Ledger 2.0 uses `ledger_*` tables under ADR 0009, so:

- existing Expense and Itinerary slices retain regression coverage;
- prototype fixtures remain in-memory only;
- no Ledger 2.0 repository query reads prototype or Phase 2A data;
- a future real Ledger screen can be replaced incrementally without a big-bang
  local data migration.

## Verification

- Ledger aggregate repository tests cover one-transaction create, local restart
  hydration, Journey A/B isolation, revisioned update, tombstone, restore,
  audit history, and four pending operation types.
- Full app suite: 23 files and 63 tests passed.
- Typecheck, ESLint, Prettier, and Git whitespace validation passed.
- The Stage 2 physical Development Build compiled and installed with the
  existing signing configuration. Launch confirmation is pending because the
  iPhone was locked at the final launch command.

## Next Checkpoint

After the device shows `Schema version: 5` in Foundation Diagnostics, Stage 2 is
ready to close. The next approved work is Stage 3: authenticated Ledger
bootstrap, pull, capability, read, and command API. Do not replace a prototype
screen before that backend read path exists.
