# ADR 0039: Data Health Phase E recovers only proven historical Expense chains

Status: Implemented for Phase E acceptance (2026-09-25)

Phase E adds one generic versioned action,
`RECOVER_HISTORICAL_STRANDED_CREATE_V1`. It is eligible only for an authorized,
active-account local-only Expense with one attempted historical unknown `FAILED` CREATE,
one or more unambiguous historical unknown `FAILED` UPDATEs, valid preserved request
snapshots, valid current aggregate, intact operation/idempotency identities, and no
conflict, mapped server identity (including audit/deferred evidence), active competing
operation, or isolation ambiguity.
Missing evidence remains protected.

The repair transaction changes only the proven CREATE to runnable queue state and records
`APPLIED`. The existing Expense worker replays its original bound payload and original
idempotency key. After identity mapping, one transaction revalidates the protected digest
and durably creates one dependency-linked current UPDATE with a new key. The existing sync
engine remains the only network mutation executor.

Historical UPDATEs remain unchanged until normal push and a scoped canonical
revalidation prove the compacted user-owned intent. Server-derived status, valuation and
settlement amounts may converge normally without invalidating that proof. Only then are
the old operations marked completed with their error diagnostics intact and the repair
event retained. Structured rejection or identity conflict stops automatic recovery;
network/auth failure remains durable under existing policy.
No migration, Backend endpoint, second queue, destructive cleanup, generic `FAILED`
replay, or Production access is introduced.
