# Currency / FX Phase B1 — economic date foundation

Date: 2026-09-17. Scope: explicit Expense date only; no market provider, automatic valuation, Journey Currency mutation, or Production change.

`economic_date` is the local calendar day to which the traveller attributes an Expense, represented exactly as a valid `YYYY-MM-DD` date. It has no time, UTC offset, or conversion semantics. Historical FX lookup must use it, never a slice or timezone conversion of `occurred_at`. The latter remains for ordering and existing timestamp compatibility.

## Ownership and migration

- Canonical Dev `public.expenses.economic_date date NULL`; Mobile Ledger 2.0 mirror `ledger_expenses.economic_date TEXT NULL` with a date-format constraint for non-null writes. The older Phase 2A `expenses` table is a distinct compatibility model.
- Forward migrations add the columns without changing existing rows, Money, valuation/rate snapshots, audits, revisions, or finalized settlement evidence. No historical timestamp is a sufficiently general proof of the traveller's intended local day, so **zero existing rows are backfilled**. A date-only value surviving a private offline queue is entered as a new explicit command, not guessed from an existing synchronized timestamp.
- `NULL` means unknown. Cross-currency `RATE_REQUIRED` plus `economic_date = NULL` means `ECONOMIC_DATE_REQUIRED`; with a known date it means a rate is required. No parallel state machine is needed. Same-currency identity remains valid without market FX.

## Contract and compatibility

- New form Save sends the date-picker label directly through SQLite, the durable operation, `/v2`, the canonical Dev column, and bootstrap/pull. Strict calendar-date validation occurs at API and repository boundaries. The server never derives it from `occurred_at`.
- Older installed clients omit this field. Create stores `NULL`; edit lacking an explicit date also stores `NULL`, conservatively discarding any previous date certainty. Old clients continue to read the rest of the Expense because the additional response member is ignored. Neither old-client operation creates a guessed economic date. A cross-currency edit that loses certainty must not retain an incompatible active valuation.
- Editing a legacy Expense displays the old date label for orientation, not as proven economic date. Keeping that label without a deliberate date confirmation leaves `NULL`; choosing/confirming a date explicitly establishes the field and audits the financial-core revision. No migration wizard or timezone control is introduced. The user-facing label remains “Date”.
- A date change supersedes active valuation through the existing revision/audit lifecycle. Historical rate evidence and finalized settlement snapshots are retained; settlement guards remain. Future B2/C market lookup must refuse `NULL` with `ECONOMIC_DATE_REQUIRED`, use only explicit dates, and never infer from timestamp, phone timezone, or a UTC midnight. No automatic lookup is implemented in B1.
