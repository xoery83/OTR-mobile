# Certified Trip Day Read Model (SQLite 47)

Status: Checkpoint 11 integrated candidate; owner review pending.

A projection may be built only from an exact accepted B-T3I certificate, normalized
membership and fingerprint-matching canonical roots/endpoints read in one SQLite
transaction. The existing Account apply gate fences capture and installation.
Installation repeats that coherent read and compares the exact source association
and the captured projection generation before replacing the scoped projection.
No new Account generation system, transport, startup worker or UI is introduced.

SQLite 47 is registered as `trip_day_read_model`, followed by SQLite 48. Three normalized
Account/Trip tables retain a projection header, immutable Event membership/selected
facts and role-keyed temporal/spatial boundaries. They have no foreign keys to the
mutable mirror/certificate: mirror removal cannot delete accepted offline data.
The retained projection is the latest accepted observation; replacement is atomic.
Its safe integer generation advances independently from Event semantic revision and
collection applied generation; projection format version is separately fixed at 1.
Integration verified that the app opener does not enable foreign-key cascades.
Replacement therefore explicitly deletes only the captured Account/Trip's boundary
and Event children before its header, within the same transaction. FK-disabled
replacement/removal and combined cold-reopen tests enforce this connection contract;
global SQLite settings and Ledger behavior remain unchanged.
Projection types are defined in the pure domain module; the repository maps the
unchanged canonical DTO schema to that contract. The domain imports no data-layer
API type or infrastructure. This corrects the Builder's architecture-guard violation
without changing any accepted fact or query behavior.

Queries require explicit IANA zone context. Exact normalized instants alone provide
comparable anchors, with BigInt microsecond comparisons. Authored dates, unresolved
civil clocks, basis/quality/resolution, original instant text, zones, endpoint roles,
spatial evidence and qualitative labels remain facts rather than fabricated instants.
No civil resolver is added. Day boundaries are derived in the query's zone through
Intl calendar formatting; tomorrow advances the Gregorian calendar label.

SPAN/STAY/TRANSPORT with two exact known instants use half-open occupancy; missing ends
produce milestones only. STAY with known ordered dates and unknown clocks preserves
half-open calendar-night occupancy without measured duration. ALL_DAY with an accepted zone projects its named Day occupancy into the query
zone; unzoned dates group by authored label without physical conversion or invented
midnight. Estimated anchors do not establish exact interval occupancy. Query items
identify instant-interval, named-Day or authored-calendar-night occupancy separately.
Conflicting retained civil/source evidence remains non-comparable.
Endpoint milestones are separate roles of one Event. Query results group comparable
anchors separately from authored non-comparable items, and return unresolved
candidates alongside the next comparable Event. No participant membership is inferred.

Offline reads use only immutable projection rows. A coherent revalidation may mark
CURRENTLY_MATCHES_SOURCE; absence, corruption, changes or unavailable source reads
mark HISTORICAL_ACCEPTED_PROJECTION, preserving the last accepted observation.
This freshness statement is scoped to the completed read transaction, never a claim
that mutable facts cannot change afterwards.
