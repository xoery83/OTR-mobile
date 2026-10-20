# ADR 0008: Ledger 2.0 Aggregate And Forward Lineage

Date: 2026-09-11
Status: Accepted for Stage 0 and Stage 1 implementation

## Context

Hosted Supabase Dev currently contains the verified 64-table production-shape
baseline and a security-hardening migration. Its legacy `ledger_entries` model
cannot represent Ledger 2.0 aggregate revisions, exact dual-currency splits,
payment evidence, immutable valuation, correction requests, durable settlement
inputs, or bilateral partial repayment.

The current Mobile Expense vertical slice writes a deliberately minimal local
row and synchronizes to legacy `ledger_entries`. The approved native prototype
is fixture-only and must be replaced incrementally by repository-backed screens.

## Decision

1. Add Ledger 2.0 as forward-only Dev/Staging migrations after the canonical
   baseline. Never edit, replay, or renumber the two baseline migrations.
2. Use `expenses` as the Ledger 2.0 aggregate root. Keep legacy
   `ledger_entries` untouched until a separately approved cutover/removal plan.
3. Persist exact integer minor units and captured ISO currency scale. Rates use
   exact decimal/rational evidence and never binary floating-point authority.
4. Treat Expense, Settlement, and SettlementPayment as independently versioned
   aggregates. Append-only snapshots and audit events are immutable.
5. Mobile UI reads/writes only through Ledger repositories. Repositories own
   SQLite transactions and durable operations; workers own remote lifecycle.
6. Mobile never accesses Ledger business tables in Supabase. New Ledger tables
   revoke `PUBLIC`, `anon`, and `authenticated`; only `service_role` receives
   table access. The authenticated OTR Backend validates identity and Journey
   capabilities before using that service role.
7. Keep formal production login UX out of this stage, but retain real Supabase
   Dev authentication. At least two Dev identities are required for permission,
   correction, conflict, and Paid/Received tests.
8. Keep the fixture prototype available only as visual reference. Replace a
   screen only after its real repository/backend slice reaches parity.

## Consequences

- Dev temporarily contains legacy and Ledger 2.0 tables side by side.
- The existing Phase 3B endpoint remains a compatibility slice until the real
  Expense aggregate endpoint replaces it.
- The two baseline migration files and their historical checksum remain
  immutable. The repository schema manifest advances across the complete
  canonical plus Ledger 2.0 forward lineage.
- Production data cannot be copied directly. A later one-way, idempotent,
  privacy-filtered importer maps selected legacy rows into Ledger 2.0.
- Direct PostgREST access with a user token intentionally fails even when the
  user is a Journey member.

## Rejected Alternatives

- Expanding legacy `ledger_entries` in place: it preserves incorrect ownership
  and makes rollback/migration auditing ambiguous.
- Letting Mobile use RLS business-table access: it violates the approved API
  boundary and duplicates authorization logic.
- Disabling Auth during development: it prevents meaningful multi-member and
  bilateral payment validation.
- Replacing all prototype screens at once: it creates fixture-looking UI before
  real loading, offline, retry, and conflict behavior exists.
