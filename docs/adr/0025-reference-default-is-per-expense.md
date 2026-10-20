# ADR 0025: Unresolved Expense reference default is independent of Journey legacy policy

Status: Accepted (2026-09-18)

`ledger_settings.valuation_policy` is retained as legacy/imported Journey metadata
and for compatible reads/revision checks. Its `MANUAL_AGREED`,
`ACTUAL_PAYER_COST`, or `SAME_CURRENCY` value is not a default for newly created
cross-currency Expenses. The local and canonical create path already records
such Expenses as `RATE_REQUIRED` without an accepted valuation.

An unresolved cross-currency Expense with an explicit economic date is eligible
for the B2/Phase C ECB reference path regardless of that Journey metadata.
The active per-Expense Stage 5 snapshot alone defines an accepted manual,
actual-payer-cost, or reference method. Rate Details shows Reference rate for
unvalued Expenses; manual entry requires explicit user selection and confirmation.

Keep the settings revision/direction/date/provider guards, existing accepted
snapshots, Phase D's revision-scoped semantic block for incompatible prior
manual/actual evidence, finalized-input protection, and Stage 7 digest unchanged.
Do not rewrite historical settings or financial QA evidence. This is a Dev-only
forward contract change; Production requires a separate rollout decision.
