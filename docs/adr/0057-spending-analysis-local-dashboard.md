# ADR 0057: One local projection for Spending Analysis 2.0

Date: 2026-09-29. Status: owner-approved implementation.

## Decision

Keep SQLite reporting truth and existing Ledger eligibility. Add one read-only
Journey/account/range-scoped statement supplying the dataset needed by all Dashboard
sections. Pure domain calculations derive totals, completeness, category summaries,
zero-filled timelines, Top Expenses, traveller/payer totals and deterministic insights.
Ephemeral controls reuse the loaded dataset; range and focus return refresh once.

Use the existing native Stack material header on iOS and elevated near-opaque surface
on Android. Analysis alone hides parent tabs while focused and pins its scope control.
Retain common Search/Detail routes and lower-level Currency grouping.

## Consequences

No new dependency, schema, Backend/API, network lifecycle or financial rule. CPU and
memory grow with one scoped Journey dataset; query count does not grow with sections,
categories or members. Large-fixture timing and query-count acceptance are mandatory.
