# ADR 0060: Account-scoped canonical Event read-only mirror

Date: 2026-10-04. Status: implementation authorized for B-T3F; review pending.

The owner-authorized B-T3F instruction selects dedicated canonical tables instead
of B-T3A M's proposed itinerary_items rebuild. The legacy table requires a date,
lacks rich facts and serves the legacy create queue. Preserving it byte-for-byte
keeps this read-only checkpoint separate from future canonical editing/adoption.

SQLite migration 44 adds trip_canonical_events and
trip_canonical_transport_endpoints, scoped by Account/Trip/Event and endpoint role.
All B-T3E root/endpoint facts have explicit columns; temporal/spatial text remains
literal, safe revisions/precision are INTEGER, coordinates REAL, booleans validated
INTEGER and opaque provenance maps JSON TEXT. No aggregate JSON snapshot is stored.
Read-only/version markers and a per-Event persisted observation_sequence accompany
the mirror; observed_generation records the applying request, not ordering/freshness.

The repository validates the existing DTO and applies newer revisions atomically
under the existing Account apply gate through commit/rollback. Equal revisions need
identical deterministic semantic bytes except B-T3A’s optional accepted Place
UUID→null cache loss, with every other fact identical. Only the scoped pointer(s)
are nulled atomically; revision and observation metadata remain unchanged.
Null→UUID, UUID replacement and any accompanying field change fail closed. Older observations/withholding cannot erase cache.
Observation_sequence advances only on accepted newer mirror state. No wall-clock
or request generation orders Event truth. Unknown stored read/temporal versions are
withheld; known-version corruption raises an integrity error rather than legacy fallback.

Only individually fetched Events may refresh. The central owner has no reviewed
canonical collection/snapshot seam. This checkpoint adds no global refresh owner,
timer, completeness claim, tombstone inference, semantic queue or edit UI. Collection
admission/completeness/cursors/deletion need later approved contracts before
broad refresh/activation. No further revision-neutral exceptions are introduced.
