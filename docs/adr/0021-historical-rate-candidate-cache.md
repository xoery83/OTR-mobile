# ADR 0021 — Historical rate candidates are not accepted valuations

Status: Accepted for Phase B2 Dev. Date: 2026-09-17.

Use explicit Expense `economic_date`, original currency and Journey settlement currency as a durable rate demand only for cross-currency `RATE_REQUIRED` Expenses. The Backend owns provider access, pins Frankfurter v2 to ECB, validates the actual reference date within seven calendar days on/before the economic date, and stores a Journey-authorized mutable candidate in `ledger_rate_quotes`. The Expense row itself is the durable demand; a Backend scan can rebuild it after restart without a second Expense queue. A unique request key and retry state coordinate duplicate demand and failures. Bootstrap/change feed replicate candidates into account/Journey-scoped SQLite; no UI or Mobile provider call creates them. Existing immutable accepted valuation snapshots are untouched. Phase C requires separate approval before applying any candidate.

`effective_date` remains a legacy candidate field for older Stage 5 consumers. New `economic_date` and `reference_date` columns remove its ambiguity for B2. Existing rows are not backfilled or reinterpreted. Underlying ECB license/transaction-use caveat is recorded in the provider review.
