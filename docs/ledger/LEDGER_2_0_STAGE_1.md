# Ledger 2.0 Stage 1 Checkpoint

Date: 2026-09-11
Status: Complete; awaiting UX checkpoint approval before Stage 2

## Delivered

Stage 0 freezes the aggregate names, exact money representation, revision and
conflict envelopes, backend-only access boundary, and forward migration
lineage. ADR 0008 and `LEDGER_2_0_API_CONTRACT.md` are authoritative.

The shared TypeScript domain now provides:

- integer minor-unit Money validation and decimal rate conversion;
- deterministic largest-remainder allocation with stable member-id tie breaks;
- equal-person, equal-household, household/member weight, exact, and percentage
  allocation primitives;
- Expense aggregate validation across payer, participants, splits, currencies,
  and immutable settlement valuation;
- zero-net balance calculation and deterministic transfer planning.

## Dev Schema

Two forward-only migrations add 20 Ledger 2.0 tables without changing legacy
`ledger_entries` or either canonical baseline migration:

- Expense: `expenses`, `expense_participants`, `expense_splits`,
  `exchange_rate_snapshots`, `payment_records`,
  `settlement_valuation_snapshots`, `expense_links`, `expense_audit_events`, and
  `expense_correction_requests`;
- grouping: `ledger_settings`, `households`, and `household_members`;
- settlement: `settlements`, `settlement_inputs`,
  `settlement_member_balances`, `settlement_transfers`, and
  `settlement_payments`;
- operations: `ledger_review_findings`, `ledger_idempotency_keys`, and
  `ledger_changes`.

Deferred database constraints allow an aggregate to be assembled within one
transaction and enforce its invariants before commit. Immutable evidence and
audit tables reject update/delete. Revision and change-feed triggers provide
the server lineage needed by later pull and conflict endpoints.

## Security Boundary

All 20 Ledger tables have RLS enabled and forced. They intentionally have no
user-facing policies. `PUBLIC`, `anon`, and `authenticated` receive no table
access; `service_role` is the only database API role granted CRUD access.
Trigger functions are not `SECURITY DEFINER`, and their execution grants are
restricted to the service role.

This means an authenticated Mobile user still cannot read or mutate a Ledger
business table through PostgREST. Stage 3 backend endpoints must validate the
Supabase access token and Journey capability before operating with the
server-only role.

## Validation Evidence

- Two clean local resets completed from the four migrations and synthetic seed.
- Both resets produced the same schema checksum.
- Schema diff after reset was empty.
- Full manifest: 84 tables, 1,148 columns, 541 constraints, 285 indexes, 38
  functions, 61 triggers, 84 RLS tables, 178 policies, and 2 private buckets.
- Database suite: 54 assertions passed across canonical RLS and Ledger 2.0.
- TypeScript Ledger domain suite: 8 tests passed.
- Hosted OTR Development `tuqigdxrvrerfewsxqgm` contains both forward
  migrations and matches the approved 84-table/1,148-column shape.
- Hosted Ledger verification found 20 tables, forced RLS on all 20, zero Ledger
  policies, and zero direct user grants on the checked financial tables.
- The current Development Build compiled with the existing Team and Bundle ID,
  installed on Leon's iPhone 16 Pro, and launched successfully.
- No production project, user/content data, Storage object, credential, or
  secret was used or copied.

## Deliberately Deferred

- SQLite Ledger 2.0 migration and repositories;
- real read/bootstrap/pull endpoints;
- repository-backed replacement of prototype screens;
- real create/edit/delete/correction/receipt/settlement vertical slices;
- selected Europe data import tooling;
- production schema deployment or legacy data cutover.

The isolated prototype remains available only as a visual reference. Stage 2
may begin after this checkpoint is reviewed; it must not replace a prototype
screen until the corresponding repository-backed behavior reaches parity.
