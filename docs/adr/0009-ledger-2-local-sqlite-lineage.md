# ADR 0009: Ledger 2.0 Local SQLite Lineage

Date: 2026-09-11
Status: Accepted for Stage 2 implementation

## Context

The Phase 2A compatibility slice already owns the local SQLite table named
`expenses`. It stores only a title, amount, currency, sync state, and one
create operation. Ledger 2.0 needs an aggregate root plus participant, split,
valuation, payment evidence, audit, correction, household, and settlement
records. It cannot safely reuse or mutate the Phase 2A table in place while the
existing Expense slice remains a regression target and the approved prototype
is still visible.

## Decision

1. Add a forward-only local SQLite migration with the `ledger_*` table family.
   Its entity semantics mirror the Stage 1 Dev schema even where SQLite names
   include the prefix to avoid the existing `expenses` collision.
2. Keep Phase 2A `expenses`, its worker, and its Dev endpoint as a temporary
   compatibility slice. Stage 2 code must not read or write it.
3. Ledger repositories own all `ledger_*` reads, writes, aggregate transactions,
   revisions, tombstones, audit events, and generic `sync_operations` enqueue.
   UI and prototype code do not import SQLite helpers.
4. Persist operation payload snapshots with a local operation id and base
   revision. No Stage 2 worker pushes them yet; Stage 3 will consume the same
   operations through the authenticated Ledger API contract.
5. Use local ids before server ids. Reconciliation fields are reserved now so a
   future remote response updates the existing aggregate rather than creating a
   second local record.
6. Keep all Prototype data in its existing in-memory provider. It remains a
   visual reference and cannot appear in a Ledger repository query.

## Consequences

- The device temporarily contains two independent Expense storage families.
- Existing Phase 2A regression behavior remains stable while real Ledger
  screens are implemented incrementally.
- Stage 3 backend pull can hydrate `ledger_*` directly without changing its
  server entity vocabulary.
- A later, separately approved cleanup may remove the compatibility table after
  the real Ledger create/read flow has parity and a migration plan exists.
