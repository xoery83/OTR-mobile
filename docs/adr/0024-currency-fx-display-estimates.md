# ADR 0024: Separate FX display estimates from accepted valuation

Status: Accepted (2026-09-18)

Travellers need useful approximate spending and settlement positions while
canonical FX is pending. Compute estimates only from Journey/account-scoped
trusted cached quotes, within a 30-day display window, using exact decimal
conversion. Keep them ephemeral and marked `≈`; never insert them into Stage 5,
reporting truth, Review, Stage 7 inputs/digests or finalized obligations.

Foreground Settlement preflight reuses the existing B2 leases and Phase C
acceptance rather than introducing another provider or financial writer.
Finalization remains an independent authoritative server preview plus digest.
