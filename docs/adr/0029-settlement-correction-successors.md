# ADR 0029: Settlement correction successors

Date: 2026-09-23  
Status: Accepted for Settlement 2.0 Phase 4

## Decision

A correction never updates a finalized Expense. It creates a new Expense with a
new identity and records an immutable `source_expense_id -> successor_expense_id`
link in the root Settlement lineage. The adjustment source projection excludes
every source that has a successor and includes only the current leaf, preventing
double counting across repeated corrections. An `EXCLUDED` successor represents
removal/reversal without deleting the frozen source.

Correction preview is stateless and server-authoritative. The Backend overlays the
proposed successor on the current source projection and returns the resulting
digest, member deltas and transfers. Confirmation revalidates that exact source,
then one database transaction creates the successor, lineage link and immutable
Adjustment version. Failure rolls everything back; replay returns the same version.

The existing root/Adjustment `settlement_inputs`, balances, transfers, audit and
delta rows remain the version history. Personal Payment, legacy Payment and review
checkpoints are neither moved nor rewritten. Ordinary Expense mutation continues
to be rejected by the Phase 0.5 trigger.

## Consequences

No persistent correction-session state machine is added. Mobile may retain an
unconfirmed local draft, but only online server confirmation creates a new final
version. Existing Adjustment math and deterministic transfer planning are reused;
the only new calculation rule is deterministic current-leaf source selection.
