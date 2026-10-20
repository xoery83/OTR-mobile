# ADR 0031: Personal Payment FX projections

Status: Accepted — Slice C

Personal Payment keeps the user-owned original Money and a first-class
`economic_date`. Existing rows deterministically use the UTC calendar date of
`occurred_at`; new writes must send the date explicitly.

Backend-derived comparable values live in
`personal_settlement_payment_fx_projections`, uniquely keyed by payment, target
currency, and policy. The row is both the durable request and current result.
Its revision and immutable audit stream are independent from the payment
revision. Editing payment inputs invalidates bound projections; changing the
Journey currency does not invalidate old-target evidence.

The existing ECB provider, `ledger_rate_quotes`, attempt/negative cache,
45-second lease, and 30-second scanner are reused. No second demand table,
provider, worker, or timer is introduced. Mobile mirrors authorized projections
in account-scoped SQLite and selects original same-currency Money, then a
matching confirmed projection, then the Slice B local estimate.

Client `recordedEquivalent*` fields remain accepted for old request and
idempotency compatibility but are ignored by Backend and are not authoritative.
Personal Payment FX never enters canonical Settlement calculations.
