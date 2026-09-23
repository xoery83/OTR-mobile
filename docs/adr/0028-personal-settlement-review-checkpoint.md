# ADR 0028: Personal Settlement review checkpoint

Date: 2026-09-23  
Status: Accepted for Settlement 2.0 Phase 3B

## Decision

`Looks good` records an append-only, per-user checkpoint of the exact
server-authoritative personal Settlement statement. The statement stores Journey
minor-unit paid, share and balance totals plus the member's per-Expense contribution
vector, settings revision, Settlement lineage and algorithm version. It is identified
by a deterministic fingerprint, never by a boolean approval flag.

Current state is derived again from the existing canonical Settlement preview. Delta
comparison is personal and per Expense: payer credit, share, inclusion and valuation
content are compared while descriptions, categories, notes and regenerated-but-equal
valuation UUIDs are ignored. A material vector change is retained even when the net
balance delta is zero. Personal Payment records are not inputs.

Checkpoint creation passes the exact financial source snapshot back to one locked
database RPC. A changed source rejects the write as stale. Mobile stores the statement
locally, queues the original fingerprint, and never advances a stale offline checkpoint
to unseen data.

## Consequences

The model adds one append-only server table, one SQLite projection and one operation
type. It does not add mandatory approval, Journey-wide invalidation, a second Settlement
calculation, or any dependency on Personal Payment.
