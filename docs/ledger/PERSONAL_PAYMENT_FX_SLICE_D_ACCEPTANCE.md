# Personal Payment FX Slice D — Hosted Dev acceptance

Date: 2026-09-24

Environment: Hosted Dev `tuqigdxrvrerfewsxqgm` only. Production was not accessed.

## Implementation

- Migration `20260924000300` adds nullable reviewed `economic_date_source` and a
  service-role-only bounded backfill RPC.
- New Mobile writes persist `EXPLICIT`; old-client omission persists
  `LEGACY_DERIVED_UTC`. No historical source is inferred from date equality.
- Every manifest entry is guarded by Payment id, revision, Slice C input digest,
  current target currency, classification and provenance.
- The RPC reuses the existing projection, quote, attempt, lease, scanner and ECB
  provider paths. It does not change Payment revision or canonical Settlement.

## Hosted Dev execution

- Batch 1: 28 `IDENTITY_SAFE` entries created exactly 28 confirmed identity
  projections, 28 projection audit events and 28 change-feed rows; zero rate
  demand groups. Immediate replay created zero mutations.
- Batch 2: 11 `NEEDS_RESOLUTION` entries created exactly 11 pending projections,
  11 initial projection audit events and 11 initial change-feed rows; six
  deduplicated rate-demand groups. Immediate replay created zero mutations.
- The existing scanner confirmed the three historical projections (two JPY/NZD
  groups for 2026-09-22 and one CNY/NZD group for 2026-09-23). The eight
  2026-09-24 projections correctly remain `PENDING` with
  `NOT_YET_AVAILABLE` before ECB publication.
- Final projection audit/change counts are 50: 39 creates plus 11 resolver state
  transitions. Six matching attempt rows exist.
- A complete 39-entry replay created zero projections, demands, audit events or
  change-feed rows and did not change any Payment revision.
- All 25 owner/Journey Personal Payment bootstrap and change-feed scopes exposed
  the matching provenance and projection. Eighteen scopes also passed full Ledger
  bootstrap; seven historical scopes correctly relied on frozen Personal Payment
  read grants after current Journey membership ended.
- The seven deleted records and eleven records that already had valid current
  projections were untouched. Their provenance remains unknown until a separately
  reviewed cohort is approved.
- Canonical Settlement snapshots were byte-identical before and after each batch
  and the complete replay.

## Automated validation

- 97 Vitest files / 440 tests.
- 23 pgTAP files / 501 tests.
- TypeScript, ESLint, Backend bundle and migration reset passed.
