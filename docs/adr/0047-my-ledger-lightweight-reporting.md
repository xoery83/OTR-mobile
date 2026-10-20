# ADR 0047: My Ledger lightweight reporting

Date: 2026-09-26
Status: Implemented and SQL-validated locally; Dev deployment pending

`GET /v2/me/ledger` uses one account-authorized, read-only SQL snapshot
(`my_ledger_lightweight_snapshot_2_0`) for linked Journey metadata and minimal
Expense, personal split, active valuation and conflict facts. The statement's
single MVCC snapshot covers conflict insertion/resolution, which existing Ledger
sequence and settings revision signals do not fully cover. Backend rechecks
linked membership before returning, retries once for an added membership, and
rejects revoked access. No full Journey bootstrap, Review, receipt, audit,
Personal Payment or Settlement projection participates in this path.

Backend applies the existing pure reporting rules to the narrow facts. The
existing server summary fields and occurredAt filters remain unchanged. The
optional `spendingFacts` response supplies original-currency personal shares
for economic-date My Ledger Spending. SQLite v37 stores these facts by account,
period and Expense ID; a full local Expense or pending edit wins for the same
Expense. The cache never supplies Settlement balances. A saved local Settlement
projection remains the only aggregate balance shown; otherwise the UI states
that material is unavailable.

Normal My Ledger focus requests its selected period once. The parent Ledger
screen no longer requests ALL first, and a My Ledger response no longer starts
per-Journey bootstrap. Entering a Journey still uses its existing scoped path.

Identical concurrent requests share one Backend operation. The last departed
waiter aborts it; individual departed waiters cannot cancel the work of others.
The old reporting function remains behind a programmatic opt-in and retains
its tested process-global two-job safety gate for rollback. The new route does
not use that gate.

The snapshot returns one JSON payload. This avoids cross-request consistency
races and keeps the representative 50-Journey fixture at two Supabase operations
(snapshot and access recheck). All Time payload size and database execution time
must be measured during controlled Dev validation before Production sizing.
This local implementation makes no real latency claim and does not apply the
new SQL migration to Hosted Dev.

Local query-plan validation found that the open-conflict CTE's eligible-Journey
join still scanned global idempotency history without a journey-leading index.
The pending migration adds a partial index on `ledger_idempotency_keys(journey_id)`
for `response_status = 409`. The existing join then probes only conflicts in
eligible Journeys, including conflicts created by other users. A local
eligible-first LATERAL rewrite without an index still scanned every history row;
the partial composite and full composite alternatives added no useful filter
and occupied more space. No response or conflict semantics change.
