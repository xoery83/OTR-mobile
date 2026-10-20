# ADR 0041: Settlement Preview owns the coherent canonical projection

Status: Accepted for implementation (2026-09-25)

The existing Settlement Preview endpoint is the single authority for a current
server-backed Settlement projection. It always calculates from one
`ledger_settlement_source_7_1` result and returns the resulting balances, inputs,
source fingerprint, canonical source cutoff, confirmed Settlement reference, and
confirmation diff together.

`SETTLEMENT_SOURCE_V1` fingerprints the normalized eligible source records rather
than the displayed balance. Confirmation changes are `ADDED`, `CHANGED`, or
`REMOVED`; removal means absence from the current eligible Settlement source and
does not assert that the Expense entity was deleted.

Mobile publishes those financial values as one `SettlementSummaryProjection`.
A coherent local snapshot may be shown as `SAVED` or `LOCAL_PENDING`, then replaced
atomically by the complete `CURRENT` server projection. Confirmed balance is never
used as a current-balance fallback. Independently refreshed Review/attention state
does not participate in the financial projection generation.

Before publishing `CURRENT`, Mobile normalizes its synchronized server mirrors with
the same policy and requires its fingerprint to equal the Preview fingerprint. A
mismatch triggers the existing scoped bootstrap even when the change-feed cursor says
the Journey is current; a second mismatch keeps the coherent saved projection visible.
Fresh bootstrap/pull may re-materialize a historical failed Expense mirror only when
the submitted and current user-owned fields both equal canonical state. Any difference
remains protected, and protected terminal rows never enter the authoritative source.

No endpoint, worker, queue, migration, or second Settlement calculation is added.
Protected terminal local history remains retained and visible to Data Health but is
not part of the authoritative current Settlement source.
