# ADR 0036: Data Health Phase C1 repairs only runnable queue metadata

Status: Accepted (2026-09-24)

Phase C1 executes only the three C0-approved versioned actions: expired operation lease
recovery, completed-dependency wake-up, and manual reactivation of a sparse long-lived retryable
operation. Repairs update synchronization-machine metadata in the existing
`sync_operations` or `ledger_asset_operations` row; they never execute the queued domain
mutation or change user-owned domain facts.

Execution is fail-closed: scan and plan, validate active account and generation, rebuild
the finding and evidence inside one SQLite transaction, compare the complete current plan,
conditionally update the existing operation, and record `APPLIED` atomically. A subsequent
scan verifies the action before the same event becomes `VERIFIED`. Restart resumes
verification from durable `APPLIED` events. Old `VERIFIED` diagnostics are bounded per
account; unresolved `APPLIED` and `NEEDS_ATTENTION` events are retained.

`PROTECTED_LOCAL`, historical unknown `FAILED`, conflict, isolation, missing evidence,
authorization pause, user-action-required state, and incomplete parent/server identity
remain repair vetoes. C1 adds no migration, worker, queue, Backend endpoint, pull,
bootstrap, scheduler, or direct API mutation path.
