# 0042: Revision-aware Expense economic-date evidence completion

Date: 2026-09-25. Status: approved for the narrow Settlement Changes recovery slice.

## Decision

An Expense's `economic_date` is date-only evidence, not a conversion of
`occurred_at`. Data Health classifies a missing date on a current cross-currency
`RATE_REQUIRED` Expense. A source with an explicitly documented date-only mapping
may be completed automatically; timestamp-only or conflicting evidence requires
one user confirmation. The confirmation is a dedicated, idempotent Expense command
that adds only a previously null date, records source/version in the immutable
Expense audit, and emits the normal change feed. It cannot edit Money, splits,
participants, participation, or a valuation.

The command may advance a current Expense revision beyond an earlier frozen
Settlement input. The finalized guard remains absolute for that exact input
revision and its valuation snapshot. A later current revision may receive only
the existing guarded automatic `REFERENCE_RATE` valuation; a Journey's legacy
`valuation_policy` is not an eligibility gate (ADR 0025). The reference rate is
not user-approved. Settlement Review invokes the shared Data Health/date action,
then refreshes its canonical projection, rather than deriving dates itself.

## Safety

The Backend validates account/Journey authority, expected revision, null prior
date, source proof, and `current revision > every finalized input revision`.
The database trigger permits only the date-completion column set, or a later
automatic reference valuation's exact state transition. Ordinary UPDATE/DELETE,
manual valuation, historical input, and completed Settlement/payment rows stay
protected. Idempotent replays return the original result.

No historical `DATE(occurred_at)` backfill is authorized. Bakery's fixture UTC
timestamp is not approved date-only proof, so its Dev acceptance uses one
explicit confirmation of 2026-07-25. Settlement #1 revision-1 DKK/CNY input
and its partially paid history remain unchanged.

Implementation note: migration `20260925000100` initially used a bare
`expense_revision` PL/pgSQL variable in the revised valuation wrapper. A real
later-revision automatic attempt exposed PostgreSQL ambiguity with the input
column. Forward migration `20260925000200` uses the already-validated
`valuation_value.baseRevision` instead; the normal retry then accepted Bakery.
