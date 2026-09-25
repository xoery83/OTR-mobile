# ADR 0040: Data Health reconciles only canonically equal stale Expense conflicts

Status: Implemented for final Data Health cleanup acceptance (2026-09-25)

Data Health adds one versioned `RECONCILE_STALE_CONFLICT_V1` action. It is eligible
only for an active-account Expense operation whose Journey authorization, server
identity, complete user-owned local aggregate, authoritative canonical snapshot,
revision evidence, conflict history, and absence of newer runnable/protected mutation
are freshly proven in the repair transaction.

Resolved or superseded conflict history additionally requires a later completed
conflict-resolution operation bound to the converged canonical revision. An open
historical conflict additionally requires a matching deferred canonical change at that
revision. Any user-owned difference or missing evidence preserves the existing conflict
and user-resolution requirement.

The transaction may mark only the stale operation complete, close an equal open conflict,
align the already-proven server revision and sync label, remove the exactly matched
deferred change, and record the normal repair event. It never chooses or rewrites
user-owned Expense values and adds no migration, worker, queue, UI, or Backend endpoint.

Ledger's pending-financial-operation predicate now represents an active synchronization
path: `PENDING`, `PROCESSING`, `RETRYABLE`, or `DEPENDENCY_BLOCKED`. Historical terminal,
unknown `FAILED`, and conflict history remain preserved but no longer masquerade as work
currently waiting to sync. Settlement confirmation-change reporting remains independent.
