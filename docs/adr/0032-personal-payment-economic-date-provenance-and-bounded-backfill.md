# ADR 0032: Personal Payment economic-date provenance and bounded backfill

Status: Accepted — Slice D

Personal Payment stores `economic_date_source` separately from `economic_date`.
Allowed known values are `EXPLICIT` and `LEGACY_DERIVED_UTC`; `NULL` means that
the source has not been reviewed. New Mobile writes always send an explicit
economic date and persist `EXPLICIT`. Old-client omission remains compatible and
persists `LEGACY_DERIVED_UTC`.

Historical provenance is never inferred from equality with the UTC date of
`occurred_at`. It may be assigned only by a reviewed environment-specific cohort
manifest. Assigning provenance is metadata repair: it does not change the
user-owned Payment revision, timestamps, audit stream, or canonical Settlement.

Slice D uses one service-role-only, bounded and transactional backfill RPC. Every
manifest entry carries the Payment id, expected revision, expected Slice C input
digest, expected target currency, classification, and provenance. The RPC locks
and rechecks each active Payment, rejects a changed input/target/classification,
and then reuses `ledger_ensure_personal_payment_fx_projection_1c`. Same-currency
records become identity projections without provider demand; cross-currency
records become normal durable projection demands for the existing scanner.

The Hosted Dev manifest is intentionally environment-specific and split into two
reviewed batches. It is not a discovery query, scheduler, general migration, or
Production tool. Repeating a satisfied batch changes no projection, audit event,
change-feed row, Payment revision, or Settlement data.
