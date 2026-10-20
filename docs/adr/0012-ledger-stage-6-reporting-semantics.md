# ADR 0012: Ledger Stage 6 Reporting Semantics

Date: 2026-09-12
Status: Accepted for Stage 6 implementation

## Decision

1. Spending, search, analysis, My Ledger, and drill-down use one reporting
   contract. Backend and SQLite must return identical totals, counts, and
   included Expense identities for identical fixtures.
2. Authoritative settlement-currency totals include `ACCEPTED` Expenses only
   when they have an active settlement valuation and no open conflict. Local
   accepted pending mutations are included immediately.
3. `RATE_REQUIRED` Expenses and Expenses with an open conflict remain visible
   but are excluded from authoritative settlement-currency totals and counted
   separately. No reporting path selects a conflict branch or invents a rate.
4. `Mine` sums the current member's exact settlement split. `Group` sums each
   included Expense's active settlement valuation exactly once. Original
   currency analysis remains separated by currency.
5. Every aggregate or bucket exposes the exact Expense identities and component
   amounts used by its drill-down. Tests compare both identity sets and sums.
6. Journey selection uses inclusive local-calendar candidate rules: both dates,
   `start <= today <= end`; start only, `today >= start`; end only,
   `today <= end`; neither, manual only. A valid persisted candidate wins;
   otherwise multiple candidates require selection and zero candidates open My
   Ledger without choosing an arbitrary Journey.
7. My Ledger periods are rolling 30 days, the user's local calendar year, and
   all available history. Mobile converts periods to explicit UTC `[from,to)`
   bounds. Rows remain Journey-separated and describe pre-settlement position,
   never actual Stage 7 debt.
8. Stage 6 performs no cross-Journey reporting-currency conversion. Search has
   no location field. Receipt filtering is `has`/`has-not`. Business, sync,
   conflict, and valuation statuses remain separate dimensions.
9. The Stage 6 Settlement mode is structural/readiness UI only. It contains no
   transfers, obligations, Paid/Received actions, or fixture financial data.
10. Mobile UI reads SQLite projections. Start with ordinary indexes, SQL
    aggregation, and pagination; 10,000 Expenses and about 250 ms for a
    representative first/filter query is the engineering target.

## Consequences

SQLite schema v11 adds only Journey context, persisted selection, period-aware
My Ledger cache, and measured query indexes. Existing Stage 1-5 mutation,
conflict, valuation, receipt, bootstrap, and pull infrastructure remains the
source data. FTS, materialized analytics, reporting-rate conversion, and Stage 7
settlement behavior remain out of scope.
