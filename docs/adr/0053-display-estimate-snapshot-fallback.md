# ADR 0053: Cached ECB snapshot fallback for saved Expense display estimates

Status: Accepted (2026-09-28, owner requested approximate values while daily FX is pending)

Extend ADR 0024's ephemeral display estimates to reuse the account-scoped ECB
snapshot cache already used by local draft previews. Prefer eligible Journey
quotes; otherwise use the newest trusted, unexpired snapshot no later than the
Expense economic date and within the existing 30-day display window. Validate
the pinned ECB source/provider and convert through the existing exact decimal
cross-rate helper.

Ledger and Expense detail render cached content immediately and refresh the
existing cache in the background. Show `≈`, Estimated and the reference date.
Never persist these values as accepted valuations or use them as finalized
financial evidence. The backend's daily publication/acceptance policy stays
unchanged. No new provider, queue, schema or dependency is introduced.
