# B-T3F — Lossless canonical Event SQLite mirror

Date: 2026-10-04. Status: **B-T3F PLACE-CACHE CORRECTION COMPLETE — REVIEW PENDING**.

## Scope and authority

Implemented the owner-authorized B-T3F local mirror on `trip/temporal` in
`/Users/xoery/Project/otr-mobile-temporal`, starting from clean `edd41a4`.
B-T3E remains the wire projection authority; B-T3A–D contracts are unchanged.
ADR 0060 records the dedicated-table choice authorized by B-T3F rather than
B-T3A M's proposed legacy itinerary rebuild. No server change was required.

## Exact schema and mapping

SQLite migration **44**, `trip_canonical_event_read_only_mirror`, appends two tables.
Migrations 1–43 and existing table schemas are unchanged.

| Table                                | Columns | Primary key                             | Relationship                                         |
| ------------------------------------ | ------: | --------------------------------------- | ---------------------------------------------------- |
| `trip_canonical_events`              |      77 | `(account_id, trip_id, event_id)`       | Dedicated root mirror                                |
| `trip_canonical_transport_endpoints` |      40 | `(account_id, trip_id, event_id, role)` | Composite FK to scoped root; role ORIGIN/DESTINATION |

The root has eight identity/observation columns: `account_id`, `trip_id`, `event_id`,
`read_version`, `read_disposition`, `legacy_compatible`, `observation_sequence`,
`observed_generation`. `id` and `trip_id` map to the scoped keys; endpoints map to
child rows. The remaining **69** columns map one-to-one to exposed B-T3E facts:

- Core (20): `temporal_contract_version`, `temporal_shape`, `semantic_revision`,
  `title`, `description`, `event_type`, `status`, `order_index`, `trip_day_id`,
  `reservation_id`, `participant_scope`, `timing_label`, `timing_provenance_ref`,
  `planned_start`, `planned_end`, `is_estimated_time`, `legacy_planned_start`,
  `legacy_planned_end`, `legacy_is_estimated_time`, `legacy_snapshot_at`.
- Root temporal (28): both `start_` and `end_` prefixes for `local_date`, `local_time`,
  `clock_precision`, `quality`, `basis`, `zone_id`, `supplied_offset_seconds`,
  `source_instant`, `source_instant_precision`, `civil_resolution`,
  `resolution_offset_seconds`, `interpretation_key`, `interpretation_input_sha256`,
  `provenance_refs`.
- Spatial (21): `authored_label`, `authored_text`, `authored_address`,
  `accepted_address`, `accepted_latitude`, `accepted_longitude`, `accepted_place_id`,
  `spatial_provenance_refs`, `location_input_revision`; both `authored_address_` and
  `accepted_address_` prefixes for `line1`, `line2`, `locality`, `region`,
  `postal_code`, `country`.

Each endpoint has four scoped key columns plus **36** facts: `instant`, the 14
unprefixed temporal fields above, and the same 21 spatial fields. Every exposed
DTO fact is covered by a schema-catalog test; no aggregate Event JSON is stored.

Strings/nulls remain literal TEXT, including microseconds, offsets, dates, clocks,
zones, fold resolution, interpretation binding and legacy snapshots. No Date
conversion, timezone inference or synthetic `scheduledDate` occurs. Numeric
versions, revisions, precision, offsets and ordering use INTEGER; accepted
coordinates use REAL matching B-T3E numbers. Boolean fields use INTEGER 0/1.
Opaque provenance maps use validated object JSON TEXT, decoded to the original
map. Source private content, candidates and financial fields are not mirrored.
READ_ONLY and `legacyCompatible: false` are preserved explicitly.

`observation_sequence` is a persisted per-scoped-Event safe positive integer,
advancing only when a first/newer revision is accepted. `observed_generation`
records that request's generation; it does not order facts or certify freshness.

## Repository and reconciliation

`tripCanonicalEventRepository.ts` exposes only `applyRead`, `getEvent`,
`refreshEvent`. It validates existing B-T3E schemas, UUIDs and Event/Trip identity.
`defaultTripCanonicalEventRepository.ts` connects existing SQLite/auth/B-T3E
individual Event transport without adding a lifecycle owner.

- Newer semantic revision atomically upserts root and replaces scoped endpoints.
- Equal revision uses deterministic bytes over all exposed facts and markers,
  sorting map keys and keyed endpoint roles. Equal facts are neutral. B-T3A permits only optional `accepted_place_id`
  non-null UUID→null loss on the root, ORIGIN or DESTINATION when every other
  exposed fact/marker and endpoint role/cardinality is identical. These losses
  return APPLIED and update only the scoped nullable pointers, in the same
  Account/generation-fenced transaction; semantic revision, observation sequence,
  observed generation and every other stored fact remain unchanged. All other
  differences raise `CANONICAL_EVENT_MIRROR_INTEGRITY` without changing the mirror
  (invalid DTO/endpoint sets reject at validation). Null→UUID, UUID_A→UUID_B,
  address/coordinate/provenance/temporal changes are never normalized away.
- Older revision returns IGNORED_OLDER. WITHHELD does not erase cached state.
- Root/endpoints and observation metadata commit or roll back together.
- Unknown local read/temporal versions return WITHHELD/UNSUPPORTED_CONTRACT and
  cannot be overwritten by an older implementation. Known-version corruption
  raises an integrity error without falling back to legacy reads.

Existing Account context and apply gate fence the transaction through commit or
rollback. Network work occurs outside the gate; B-T3E captures request context
before I/O. Rechecks reject A→B→A responses. Offline reads capture a consistent
scoped root/endpoint snapshot and recheck Account context before returning.
Account switching retains other Accounts' rows; equal Event UUIDs in different
Accounts/Trips remain independent.

## Refresh deferral and remaining decisions

Only individually fetched Events can be persisted. The central refresh owner
has no reviewed canonical Event collection/snapshot seam, so no completeness,
absence-as-deletion, tombstones, polling, timer or new owner was invented. A future
collection contract must define scope/admission, supported versions, complete-list
certification, pagination/cursors, ordering, deletion/tombstones and Account/Trip/
generation application before central collection refresh can be integrated.

The focused correction implements B-T3A’s existing optional accepted Place-cache
loss exception; it grants no other cache or semantic change. Migration 44 schema
is unchanged. Canonical mutation, editing, semantic queue, resolver and
Track C activation remain outside this checkpoint. Device-level Expo restart
acceptance is not claimed; restart evidence below uses real on-disk SQLite.

## Validation

- Real SQLite focused suite: 2 files / **56 tests**, including 42 mirror cases.
- Scoped B/A/offline/auth/repository/sync regression: **61 files / 478 tests**.
  Includes B-T3E boundary/transport, receipt authentication/privacy/replay,
  disabled mutations and existing financial/private repository/cursor coverage.
- Typecheck, backend build, whole-repository lint (including UI guard) and
  changed-file formatting pass. Whole-repository `npm run format` reports 17
  existing violations; each flagged file is byte-identical to HEAD and untouched
  by this task. No unrelated formatting cleanup was applied.
- Upgrade preserves all prior table schemas/rows, including seeded legacy,
  durable queue, Expense, Person and financial/private cursor data. Migration
  runner applies 44 once; disk close/reopen preserves TRANSPORT/offline reads.
- All seven shapes, exact temporal/spatial/provenance round-trip, neutral/mismatched
  equal revision, older/newer observations, injected endpoint failure rollback,
  Account ABA/commit fencing, concurrency and scoped endpoint FK checks pass.
- The 11 focused correction cases cover root/ORIGIN/DESTINATION losses, reverse
  and replacement pointer rejection, simultaneous spatial/temporal/read changes,
  stale ABA contexts and a second-endpoint failure after root/first-endpoint
  writes. Full row snapshots prove only pointers change on success and all
  rows/metadata remain intact on rejection/rollback. Repeating a loss is neutral.
- Legacy repository cannot see/edit canonical rows; mirror writes preserve
  noncanonical tables. Offline read performs no token/network call; failed
  individual refresh leaves cache intact. No server migration/manifest changed.

## Changed files and safety

- `src/data/db/migrations.ts`, `src/data/db/database.test.ts`.
- `src/data/repositories/tripCanonicalEventRepository.ts`, its test, and
  `defaultTripCanonicalEventRepository.ts`.
- `docs/DATA_MODEL.md`, `docs/OFFLINE_SYNC.md`, `docs/CURRENT_IMPLEMENTATION_STATE.md`,
  `docs/adr/0060-canonical-event-read-only-local-mirror.md`, this report.

Canonical Event commands enabled: **NO**. Edit UI: **NO**. Semantic command queue:
**NO**. Polling/timer added: **NO**. Server migration added: **NO**.
Production/Hosted Dev: **NO**. Sibling modifications by this task: **NO**.
Commit: **NO**. Activation gates remain **CLOSED**.
