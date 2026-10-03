# Trip Canonical Track B — B-T2 Persistence & Compatibility Preflight

- Status: **B-T2 PREFLIGHT COMPLETE — REVIEW PENDING**.
- Date: 2026-10-03 (Pacific/Auckland).
- Working directory: `/Users/xoery/Project/otr-mobile-temporal`.
- Branch: `trip/temporal`.
- Baseline HEAD: `1b05a7b44d2d96ca390d4908a0a9b02f2aa20b2d`,
  `docs(trip): define canonical temporal spatial semantics`.
- Startup workspace: clean. Only this report is added; no commit requested.
- Design/preflight only. No migration SQL, application implementation, database
  execution, network access, deployment or sibling worktree changes.

## Evidence and decision boundaries

CURRENT means checked-in source at the baseline, not deployed database behavior.
RECOMMENDED means persistence direction awaiting review. B-T1 governs semantics;
this report does not amend it. PASS means preflight coverage, not implementation
acceptance. Physical names, migration numbers and API versions remain unassigned.

Required baseline read: `AGENTS.md`, `docs/CURRENT_IMPLEMENTATION_STATE.md`,
`docs/architecture/TRIP_CANONICAL_B_T0_TEMPORAL_SPATIAL_AUDIT.md` (B-T0),
`docs/architecture/TRIP_CANONICAL_B_T1_TEMPORAL_SPATIAL_CONTRACT.md` (B-T1),
`docs/architecture/TRIP_CANONICAL_A0_AUDIT.md` (A0),
`docs/architecture/TRIP_CANONICAL_A1_IDENTITY_MEMBERSHIP_CONTRACT.md` (A1-D),
`docs/architecture/TRIP_CANONICAL_A1_I1_REPORT.md` (A1-I1),
`docs/architecture/TRIP_CANONICAL_A1_I2_PERSISTENCE_PREFLIGHT.md` (A1-I2-P),
`docs/architecture/TRIP_CANONICAL_A1_I2A_SCHEMA_CONTRACT.md` (A1-I2A),
`docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/API_CONTRACT.md`,
`docs/OFFLINE_SYNC.md`, `docs/architecture/OTR_TERMINOLOGY_GLOSSARY.md`.
Product/environment/legacy-audit documentation remains contextual evidence;
the legacy Web checkout was not reopened. Cross-module drafts do not overrule B-T1.

Startup log, newest first: `1b05a7b`, `41e5213`, `92862af`, `bd777c5`, `c2f1ea3`.
Local Git comparison found one newer relevant integration commit: **`0285ace`
`chore(db): reconcile canonical schema manifest`**. Reported before proceeding.
It changes the manifest from 105 tables/1,470 columns to 107/1,488, verifier/tests,
and reconciliation documentation; it adds no Trip migration or semantic change.
It addresses the earlier Track A baseline gate in that branch, but is not merged
here. Any implementation must re-establish its clean migration baseline after
explicit integration authorization. No new replay was performed here.

No C-I1 contract exists among the current branch's Trip architecture documents.
Track C is consumed only as a boundary, U. No sibling checkout inspection needed.

| Evidence | Current source / anchors |
| --- | --- |
| E1 | `supabase/migrations/20260910000100_canonical_production_baseline.sql`: event/participant/reservation definitions 277–377; live/map 472–510; places 1022–1042; trip_days 1078–1087; checks 1148–1162; FKs 1320–1336; indexes 1472–1489, 1577; B-T0 E01/E06–E09. |
| E2 | `src/domain/itinerary/types.ts`; `src/data/repositories/itineraryRepository.ts`: required date, nullable clock/location, local transaction+queue, ID/version-only reconciliation, scheduled_date/created_at sorting. |
| E3 | `src/data/api/devSyncContracts.ts`; `src/data/sync/devCreateTransports.ts`; `backend/src/app.ts:createEntity`; `backend/src/supabaseGateway.ts:createItineraryItem` 1662–1690: v1 create, UTC concatenation, null clock→midnight/estimated. |
| E4 | `src/data/db/migrations.ts`: migrations 3/4 itinerary_items, 19 owner column; `src/data/db/migrationRunner.ts`: ordered ID tracking, transaction per migration. |
| E5 | `src/data/sync/itinerarySyncWorker.ts`; B-T0 M/E16: create-only worker, no rich pull/update/tombstone contract; synced-cache admission/generation gaps. |
| E6 | A1-I1 D/E and A1-I2A H–K: stable Person ID, nullable observed lifecycle pair, preserve omitted/older observations, complete Person lookup versus future candidates. |
| E7 | B-T1 B–P/Q–U: temporal modes, civil/instant/DST, span/night/endpoints, text/enrichment, Day context, provenance, financial boundary, synthetic cases. |
| E8 | Git `HEAD..integration/ledger-polish-canonical`, commit `0285ace` diff: manifest reconciliation only. Scoped migration search found no later alteration supplying missing itinerary temporal semantics. |

## A. Executive recommendation

Recommend a **narrow hybrid of additive event fields and event-owned transport
endpoint child rows**. Keep existing event IDs, tables and single-location field
capacity. Ordinary activities and Stays gain explicit temporal shape/basis, civil
components, quality and minimal interpretation evidence. Transport gains exactly
two role-tagged endpoint rows, with independent temporal and place components.
Do not introduce a shared temporal registry, generic plan table or giant JSON spec.

For **new canonical schedules**, use `itinerary_events` as the plan root, including
one hotel/Stay span. Reserve existing `itinerary_reservations` for retained
reservation/commercial facts; do not make it the universal Stay/Booking root now.
Its timestamps remain legacy schedule evidence until an explicit association or
refinement establishes a single schedule owner. This chooses new schedule authority
without deciding Booking lifecycle or replacing reservation IDs (D/W).

Ten principal conclusions:

1. Existing timestamp columns are normalized instant slots with a declared basis,
   not enough civil truth; historical values remain compatibility evidence.
2. Authored local date, clock precision, accepted IANA zone and uncertainty survive
   independently of timestamps; unresolved schedules remain valid records.
3. One explicit semantic-contract marker plus shape/basis/quality suffices; absence
   means unobserved legacy semantics, not exact UTC or all-day.
4. Independent endpoint rows are justified only for transport; no generic child
   registry, stop ordering, route geometry or shared ownership.
5. One event span preserves a Stay's calendar intent and measured interval; nights
   and elapsed hours are derived separately.
6. Current spatial families are extensible with authored text/address protection,
   accepted-target provenance and enrichment input binding.
7. `places` remains optional provider-aware enrichment/cache; map/live/media rows
   keep their existing distinct purposes.
8. Old reads are deliberately limited; legacy creates remain legacy. Unsafe rich
   edits are rejected, with harmless field-specific edits allowed only under guard.
9. SQLite must carry canonical components/endpoints/participants and revisions,
   not just a compatibility date/time/location DTO.
10. Writer protection precedes canonical activation; local/API round-trip gates
    precede enabling new rich offline writes. History is never guessed or backfilled.

Reservations and bounded-window editing can be deferred without blocking this
foundation. If later Booking requires different schedule ownership, stop for that
decision rather than duplicate temporal truth.

## B. Existing persistence authority map

| Current field / primitive | Useful role / recommended future disposition | Missing information / restriction |
| --- | --- | --- |
| events.id/trip_id/title/event_type | Stable business identity, Trip and plan classification; retain | event_type alone cannot prove temporal shape or quality. |
| events.planned_start/planned_end | Normalized instant slots for canonical rows; literal legacy compatibility for unclassified rows | Civil intent, zone, derivation/confirmation and uncertainty absent. |
| events.is_estimated_time | Retain old compatibility flag; project from explicit quality for new rows | True historically includes missing-clock fabricated midnight. |
| events.date_confidence/time_confidence | Optional source confidence evidence; preserve | Numeric scale unknown; not exact/estimated/unknown/all-day discriminator. |
| events.trip_day_id/order_index | Authored grouping/order, retain | Neither determines global time, multi-day membership or endpoint dates. |
| events.status | Existing planned/cancelled/completed/skipped meaning, retain | Not temporal completeness, semantic version, tombstone or proof of occurrence. |
| events.reservation_id | Existing optional same-fact association capacity | No current same-Trip or one-schedule-owner guarantee; no ownership semantics inferred. |
| reservations.starts_at/ends_at | Retained instant evidence with unknown civil basis; compatibility unless explicitly trusted | Check-in/out civil dates, zones, precision/quality and measured-vs-intended meaning missing. |
| reservations.provider/confirmation_code/url/source_text/status | Reservation metadata/evidence capacity, retain | Booking provider differs from location_provider; no complete Booking lifecycle implied. |
| event/reservation single-location family | Text and optional resolution capacity, extend narrowly | Authored-versus-provider precedence and accepted-target/input binding not enforced today. |
| trip_days.day_date/title/notes/order_index | Date-label grouping and annotation, retain | Not zoned Day identity; initial schema can stay unchanged. |
| participant journey_member_id rows | Stable Person association capacity, preserve proven same-Trip IDs | Scope intent, null/User-only mapping and same-Trip validation require a dedicated slice. |
| places | Optional internal cache/enrichment reference | Provider-aware uniqueness is not physical equivalence. |
| journey_map_objects | Optional display projection/source reference | No canonical schedule/transport endpoint authority. |
| itinerary_items | Retain narrow legacy projection during expansion | No end, zone, uncertainty, endpoints, reservation, participants or full server revision. |

CURRENT schema capacity is not claimed active functionality. No remote rows or
external writer population were inspected. E1–E5 establish these dispositions.

## C. Event temporal persistence

**Choose D, mixed depending on explicit provenance**, with a strict interpretation
rule rather than an untagged mix. For canonical civil rows, planned_start/end are
**derived normalized instants**. For a trusted instant-only row, they hold the
**source-confirmed instant**. For legacy/unobserved rows, preserve their literal
stored values as **compatibility fields**, without certifying physical truth.
No reader may choose interpretation solely from non-nullness or `Z`.

Minimum additive concepts, preferably explicit queryable columns:

- A semantic-contract marker, temporal shape (calendar/point/all-day/span/window),
  and boundary basis (civil/source-instant/unresolved) when known.
- Local start/end calendar labels and clocks, independently nullable; supplied
  clock precision; explicit clock quality (unknown/exact/estimated).
- Accepted IANA context per known boundary, optional source-supplied offset and
  confirmed instant where source provides both civil and instant evidence.
- Interpretation state/evidence for derived instants, including explicit fold
  resolution, input/rule binding and source-confirmation attribution where needed.
- Optional qualitative timing label; optional authored grouping/order/status
  remain current fields. No invented midnight or confidence threshold.

Shape and quality are orthogonal: ALL_DAY is a shape, UNKNOWN/ESTIMATED/EXACT are
clock qualities. A transport can have exact departure and unknown arrival. Span
endpoints have independently incomplete facts. A time-only fragment retains its
clock with missing date/zone and no derived instant. PostgreSQL date/time/instant
types can hold validated components; local TEXT can hold their canonical literals.
Exact SQL and names remain a later contract.

For transport, civil endpoint facts live in E's child rows; root instant slots
are derived summaries, never duplicate editable endpoint civil truth. For activity
and Stay, root start/end component families suffice. Validation separates these
shapes to avoid two sources for the same endpoint.

is_estimated_time on new compatibility projections can reflect an estimated known
anchor; unknown/all-day cannot become estimated midnight. Do not recompute the
flag on old rows. Confidence fields remain optional confidence, not acceptance.
Status/order/group links retain their existing meaning. No application change here.

## D. Reservation / Stay persistence

`itinerary_reservations` is **technically extensible**: stable ID, hotel type, one
place, two nullable instants, participants and optional day link fit a single
Stay. It lacks precisely the civil components and independent check-in/out quality
described in C. Unknown clocks could survive as null clocks plus explicit unknown
quality while dates remain known. Calendar nights derive from checkout minus
check-in dates; they are not a persisted independently editable count.

**Recommendation: defer elevating reservations into the canonical Stay/Booking
root.** Existing rows mix booked/commercial facts with schedule capacity; B-T2
cannot prove unbooked Stays belong in that reservation domain or decide how later
Booking amendment/cancellation changes a plan. New Stays use one event with Stay
span meaning and existing hotel classification. This needs no booking confirmation.
The schema-contract phase may define additive reservation interpretation later;
do not require that expansion in the first new-plan foundation.

Check-in and checkout are distinct temporal milestones, with independently known
dates/clocks/qualities; the property normally supplies each accepted zone. Unknown
clocks retain the calendar stay and nights, but do not prove exact boundary-day
occupancy. Exact clocks can provide [start,end) elapsed occupancy **alongside**
calendar-night intent. They are linked components, not independently editable
durations. Supplied conflicting measured/source evidence is retained and unresolved.
A check-in service window is not guaranteed room access or full-window occupancy.

Legacy reservation-only Stays remain readable as legacy candidates with the same
reservation ID. Do not create a hotel event automatically, infer night dates from
UTC, or rewrite timestamps. A later explicit association can designate an event
as schedule owner while preserving the reservation ID/evidence; that adoption must
be atomic and needs its own acceptance gate. B-T2 authorizes none of it.

## E. Transport endpoint persistence

| Option | Queryability / partial facts / edits | Local projection / size / reversibility | Decision |
| --- | --- | --- | --- |
| A. Direct origin/destination field families | Simple joins; exactly two independent nullable families support all modes, text/providers; every new component duplicated in wide sparse parent | Straight SQLite columns, few tables; grows activity rows and risks mixing generic start/end/location with endpoint families; reversible additively | Viable runner-up for permanently fixed two-end representation. |
| B. Typed endpoint child rows | Unique parent+role, independently incomplete dates/clocks/zones/text/targets; targeted edits and indexes; each endpoint quality independent | Two small typed rows per transport, atomic parent/child projection; role retention easy; one table adds moderate join/aggregate discipline | **Preferred**, event-owned only initially, roles ORIGIN/DESTINATION. |
| C. Reuse places/map objects | Place stores enrichment, not endpoint time/role; map source UUID/type lacks authoritative ownership; missing free-text endpoint still needs own facts | Coupled cache/display lifecycles and weak references; cannot replace endpoint storage losslessly | Reject as endpoint authority; optional place reference only. |
| D. Endpoint JSON | Retains partial shapes if rigorously validated; queries/constraints/indexes harder, edits risk whole-blob overwrite | Easy opaque SQLite blob, but lossless handling/querying must be rebuilt; reversible extraction needs versioned parser | Reject for core endpoint facts; external raw payload only if genuinely opaque. |

Preferred endpoint record has a real event FK, unique role, local components,
quality/basis/resolution, confirmed/derived instant evidence, and the spatial family
from I. No arbitrary `(object_type,object_id)` universal table. No shared endpoints
between events. Shape requires exactly one origin and one destination row even
when their facts are unknown; a missing location is represented as unknown, not a
fabricated place. Aggregate validation enforces the pair atomically.

This supports flight/train/ferry/car/walk transport without route geometry or
intermediate stops. Same-zone endpoints explicitly repeat accepted zone when known;
no inheritance from device, parent or Trip. Root location remains a legacy summary,
not an alternative endpoint target. Parent+children+participant set+revision change
as one aggregate. Extending endpoints to reservations is deferred with Booking;
existing reservation transport remains legacy until explicitly associated/refined.

## F. Temporal-mode persistence matrix

“Current” refers to lossless source facts, not whether a timestamp can encode a
synthetic answer. Old-client safety is a future compatibility recommendation (P),
not an existing itinerary read endpoint.

| Mode | Source facts to STORE / minimum addition | DERIVE / must NOT derive | Current lossless? / old read |
| --- | --- | --- | --- |
| Calendar-only | Date, role/shape, optional context/provenance | Date grouping; no clock, occupancy or instant | trip_days/Trip labels partly; generic event needs explicit date/shape. Date-label summary only. |
| All-day | Explicit shape, date, accepted zone or unresolved context | Contextual day interval only; no appointment or universal 24h | No; add shape/date/zone. Date summary hides appointment time; full detail read-only/withheld if unavailable. |
| Date known / clock unknown | Date, UNKNOWN quality, nullable clock, optional zone | Untimed date candidate; no midnight or full-day occupancy | No; day link partly preserves label, fake timestamp not truth. Nullable-time summary safe. |
| Fixed local civil time | Date, clock/precision, accepted zone when known, exact quality, basis/resolution | Instant only after valid disambiguation; no device zone | No; add civil facts. Authored date/time label safe when original context clear; otherwise withhold timed detail. |
| Same-zone span | Two roles/boundaries, dates/clocks/qualities, each known zone; Stay intent if applicable | Resolved elapsed interval, nights for Stay; no endless occupancy from absent end | Instants only; add civil boundaries/shape. Stay date summary only, never one appointment as complete Stay. |
| Cross-zone span | Two endpoint role/time/place families, independent dates/clocks/zones, quality/basis | Duration/explicit-context overlap; no wall-clock subtraction/date-line correction | No; typed endpoints. Old full object withheld or read-only contextual summary. |
| Estimated time | Known approximate clock/anchor and ESTIMATED quality, actual supplied precision/tolerance if any | Estimated anchor if resolved; no invented tolerance/exact occupancy | Flag insufficient; add explicit quality/basis. Old client cannot label uncertainty, so no naked timed projection. |
| Time window | Date/context, qualitative source label and/or explicit bounds with per-bound quality/basis | Candidate bounds if numeric and resolvable; no midpoint/afternoon heuristic/full-window occupancy | No; minimal label now, numeric authored-window support deferred; unsupported bounds preserved or canonical adoption blocked. Old date-only summary. |
| Confirmed instant only | Trusted instant, basis/source confirmation, supplied original offset and any civil fragments | Display in explicitly selected query zone; no recovered original zone/date/night count | Timestamp capacity yes, trust basis absent. Timed old read only in explicitly defined context; otherwise withhold. |

No semantic completeness prerequisite for storing an incomplete event. Canonical
adoption is blocked only when the chosen wire/local representation cannot preserve
actual supplied facts, not because an instant or provider result is unavailable.

## G. Timezone / DST persistence

Store accepted **IANA zone per temporal boundary**. Ordinary event/stay boundaries
use explicit root components; transport uses endpoints. Duplicate a known same-zone
span's zone deliberately. A convenience shared input can author both, but persisted
endpoint values remain independent. No Trip zone or zone inherited from trip_days.

Store a supplied numeric offset separately from IANA evidence: an offset plus date
and clock can specify that occurrence's confirmed instant without claiming a civil
rule. Preserve source precision/literal evidence where normalization loses it.
Do not cache a derived offset separately by default; it is recomputable given the
accepted civil input and interpretation. A provider suggestion is not accepted zone.

For derived instants, retain a binding to the exact civil input, resolution choice
and identifiable converter/rule-data version or equivalent rule fingerprint.
Keep the last accepted derived instant/rule binding as a reproducible snapshot.
A rule update may produce a candidate conversion; it cannot silently replace an
accepted schedule or source-confirmed instant. The precise future-update acceptance
workflow is deferred. If runtime rule identity cannot be established, retain that
limitation and disable silent recomputation/publishing rather than invent a version.

| DST evidence | Minimum persistent state | Conversion rule |
| --- | --- | --- |
| Valid unambiguous civil time | Civil facts + valid resolution + rule/input binding when deriving | Derive one instant. |
| Nonexistent civil time (gap) | Civil facts + persistent GAP/unresolved disposition | No derived instant; no roll-forward. |
| Ambiguous civil time (fold) | Civil facts + persistent FOLD_UNRESOLVED disposition | No single derived instant. |
| Explicitly resolved fold | Accepted occurrence choice, applicable offset/instant, accepting source/user, binding | Derive/retain chosen occurrence, never library default fold. |
| Supplied numeric offset | Original offset and basis; any zone evidence remains separate | Offset occurrence can be confirmed even without IANA; validate consistency if a zone is also claimed. |
| Missing zone or incomplete civil facts | Explicit unresolved disposition/unknown component | No instant inferred; retain supplied facts. |

Ambiguity is **persistent unresolved state**, resolved evidence is **minimal
provenance**, and validation-time checks establish their consistency. A small
bounded resolution vocabulary is warranted; caching the entire timezone transition
table is not. Use a validated platform/library later, no timezone engine here.
Source-instant/civil disagreement preserves both and blocks claiming consistency.

## H. Unknown / Estimated / All-day

| Representation | Assessment |
| --- | --- |
| One temporal-kind discriminator | Necessary for shape but insufficient for partially known spans or exact departure/estimated arrival. |
| Nullable fields + unrelated flags | Nulls preserve absence but cannot distinguish all-day/unknown or legacy/unobserved; conflicting flags proliferate. |
| Shape + boundary quality/basis | **Preferred**: all-day shape, known exact/estimated clock, unknown clock, and evidence basis independently. Same rules on root boundaries and transport endpoints. |
| Confidence threshold | Reject: unproven numeric scale/meaning, not a semantic decision. |

New UNKNOWN has absent clock and no clock-derived instant. EXACT midnight is
explicit 00:00 with exact quality. ESTIMATED requires a known approximate anchor.
ALL_DAY keeps calendar occupancy intent with no appointment clock. Legacy quality
is **unobserved**, not default EXACT/UNKNOWN. Existing is_estimated_time=true stays
raw legacy evidence until writer/input evidence or confirmation establishes meaning.
No all-day or UNKNOWN backfill from null timestamps/estimated flag.

## I. Spatial persistence

**Extend current field families; no generic SpatialSpec.** They already permit
text, nullable coordinates, optional Place/provider and resolution metadata.
Apply the same conceptual family to transport endpoints. Existing location_name
and location_text cannot automatically be relabeled “authored” for all history;
the narrow Mobile writer proves its own copied text, not every external writer.

| Layer | Existing capacity / minimum future evidence | Write rule |
| --- | --- | --- |
| Authored/user intent | Name/raw text, independently supplied structured address; source/acceptance provenance | Keep independently of provider label/address; explicit edits retain prior evidence through existing/future approved history, no silent erase. |
| Accepted target | Nullable coordinate pair/address/Place reference, component-level manual/source acceptance | Preserve whether coordinates are manual accepted target or provider accepted target; confidence/manual Boolean alone insufficient. |
| Provider suggestion/enrichment | Provider+opaque ID, candidate label/address/coordinates, resolution state/confidence | Candidate cannot overwrite accepted target or authored text; store separately when both coexist. |
| Input binding | Location-input revision or deterministic input fingerprint to which enrichment applies | Text/target correction invalidates old candidate binding; stale result cannot attach to new intent. |
| Cache/refresh | geocoded_at/error/attempts/status, optional verification evidence | Operational metadata, not semantic authority; failed refresh leaves user intent intact. |

If current coordinates are used as the **accepted** target, a simultaneous
unaccepted candidate requires separate nullable candidate fields or optional cache
reference plus immutable input binding. Do not multiplex one pair without a
discriminator and lose the other. Store only candidate facts actually needed;
opaque provider response belongs to cache/evidence, not core navigation truth.
Accepted/manual provenance is component-specific so accepting address need not
accept coordinates or zone. Conflicting accepted facts require explicit refinement.

Provider disappearance or Place deletion preserves authored facts and object IDs.
Do not use a mutable Place row as the only copy of an accepted target. Retain
accepted components/binding on the object or endpoint. JSON is appropriate for
opaque external payloads already retained in places.raw_response, not core facts.

## J. Place/enrichment boundary

Choose **A, retain optional enrichment/cache reference**, and **C, defer a stronger
physical Place role**. `places.id` is useful optional OTR reference, not event or
endpoint identity. Its uniqueness includes normalized name, country, provider and
provider_place_id (E1); verified provider-independent equivalence is not established.
No canonical reusable physical-place registry, deduplication overhaul or required
provider lookup. Place FK SET NULL behavior already keeps parent records alive.
Object accepted target/text must survive that loss and mutable cache refresh.

## K. Planned vs observed persistence

Event/reservation planned targets, `journey_live_locations` and capture/media GPS
remain **separate domains**. Live rows describe Journey+Account/device observations;
media/capture describes historical asset observations; neither edits planned places.
Map objects may reference a typed source for display, never become the source.

Later consumers need only an explicitly typed source object/reference, observation
instant/accuracy/age when available, and independently evidenced Account/device→
Person subject mapping for the requested time. Do not infer that mapping from a
current link, shared Trip, owner_user_id or photo participant name. No unified
location table, live history store or tracking policy is introduced.

## L. trip_days compatibility

Keep `day_date` and event/reservation `trip_day_id` unchanged initially. Links
remain optional authored grouping, including for multi-day spans. Old clients may
display that group but cannot move/clip a canonical schedule by changing its link.
Guard grouping-only edits separately; changing a group never changes civil facts.

Canonical physical Day queries derive overlap from accepted time facts plus the
explicit `{date,IANA zone}` query context, ignoring trip_day_id as time authority.
Same ID can appear on several Days. `(trip_id,day_date)` uniqueness remains useful
for annotations, not zoned Day identity. An explicitly authored annotation/display
timezone could be appropriate later, but is unnecessary for initial persistence
and cannot inherit into schedules. No zoned Day table or mandatory day expansion.

## M. Participant persistence boundary

Track A is unchanged: TripPersonId is `journey_members.id`, same exact Trip required.
No access/link/status/role substitutions. Known INACTIVE affects new selection only;
existing references resolve through complete Person reads. A1-I2A observation is a
paired value/revision or unobserved, not a local default-active claim.

Existing event/reservation participant rows are **not sufficient alone** for
canonical initial writes. They can retain proven Person sets, but nullable/User-only
identities and absent scope cannot distinguish unassigned from whole-group intent.
Recommend a **dedicated participation compatibility slice before scoped canonical
write activation**: explicit parent scope (unassigned / assigned / whole-group),
resolved Person set using existing participant rows, same-Trip validation and
Track A selection-observation evidence where available/required. No new Person table.

Assigned/whole-group means a nonempty recorded set; individual is a set of one.
Unassigned has no canonical assigned rows. Whole-group retains authoring intent
and resolved set, never a live query of all Members. Empty legacy tables remain
unobserved scope. Do not infer Person IDs from Account/name or change CASCADE here.
Known participant statuses remain separate from assignment intent; not_going must
not silently mean physical attendance. Later projection policy needs its explicit
status rules. Known FK deletion/history risk remains an implementation acceptance
dependency coordinated with Track A, not permission to solve lifecycle in Track B.

## N. Legacy data classification

Classification is a reader/evidence disposition **without mutation**. A row may
have several overlapping observations (writer, flag, local cache); do not force
these into mutually exclusive destructive buckets. Missing evidence stays unknown.

| Class | Known / unknown | Safe display / Day behavior | Later refinement |
| --- | --- | --- | --- |
| A. Proven narrow Mobile Z writer | Mapping appended Z; no accepted zone; input clock may or may not survive | Attributable compatibility timestamp; matching local input can show its literal labels, unresolved zone. No certified instant overlap | Explicit confirmation can establish civil facts; preserve old value. Writer identity must be proven, not inferred from event shape. |
| B. Trusted explicit UTC/offset source | Confirmed occurrence instant; original zone may be absent | Explicit query-zone instant display/Day overlap; original local Day unknown | Supply/confirm zone/civil evidence without manufacturing it. |
| C. Unknown writer | Literal timestamps, metadata and links only; basis unknown | Legacy label/raw timestamp attributable, physical Day uncertain | Confirm or obtain trusted evidence; no bulk shift. |
| D. is_estimated_time row | Boolean known; approximate clock versus omitted-clock midnight unknown | Compatibility uncertainty; neither automatic ESTIMATED nor ALL_DAY | Original input or confirmation distinguishes UNKNOWN from approximate anchor. |
| E. trip_day_id only | Authored grouping date if linked Day valid; clock/occupancy/zone unknown | Date-grouped legacy candidate, no full-day occupancy | Confirm schedule shape/context separately. |
| F. Local date/time survives SQLite | Literal local intent available for that local item; matching server ID alone needs scoped reconciliation/evidence | Retain local labels as local intent, not server-confirmed schedule; no zone implied | Evidence-bounded same-object refinement, preserving shared revision and pending intent; cannot overwrite shared row from one stale cache. |
| G. Reservation outside Mobile path | starts_at/ends_at and type may exist; writer/local zone/calendar nights unknown | Legacy reservation span evidence, not certified Stay nights or endpoint-local Days | Explicit source/user confirmation; no inferred hotel zone/city or automatic event clone. |

`Z` syntax and timestamptz storage prove neither B nor original timezone. PostgreSQL
does not retain the submitted offset literal. Historical writer evidence may be
irrecoverable. Safe display must not assert local truth; if an old client cannot
label context/uncertainty, restrict its projected fields or withhold richer objects.
No backfill, remote evidence gathering or timestamp correction performed.

## O. Legacy/new coexistence

Recommend **one explicit semantic-contract marker** on canonical schedule roots,
plus actual shape/basis/quality data, not independent flags for each capability.
Absent marker means **legacy/unobserved semantics**. It does not imply the row
contains no useful facts. Marker present requires its validated component set;
partial malformed canonical payload is rejected, not downgraded to legacy.

Different rows in one Trip may use different semantic bases. Each reader selects
the row's contract, preserving original IDs and evidence. Unknown future versions
are unsupported/read-only, never parsed as today's narrow shape.

An existing event can be refined atomically at the **same ID**: evidence/confirmation
adds canonical facts, guarded against current revision, retaining legacy timestamp
and writer evidence before normalization would replace it. Refinement can later
change UNKNOWN→EXACT without changing semantic-contract version. Do not mark a
legacy reservation canonical under an event contract; reservation interpretation/
association is its own later adoption decision, retains reservation ID and evidence.
Old create stays legacy; old updates cannot clear the marker or erase rich facts.

## P. Old-client compatibility

CURRENT Mobile has create only and no itinerary pull/edit implementation (E2–E5).
The following is a required future adapter, not a claim of current overwrite bugs.
Existing v1 creates/retries continue their compatibility behavior; do not silently
reinterpret them or promote them to the new contract.

| Canonical mode | Harmless old-client read | Old edit policy |
| --- | --- | --- |
| Calendar-only | Literal authored date/title with startTime null when representable | Guarded title/notes only; date/group editing requires explicit canonical intent. |
| All-day | Date-only summary when full all-day meaning is not falsely claimed | No temporal edit via nullable clock; read-only/withhold full object. |
| Date/unknown clock | Authored date, null time, valid text location | No reinterpretation of null as midnight or all-day. |
| Fixed civil exact | Authored date/clock/context summary; old UI may lack zone, so withhold timed field/full row when misleading | Cannot rewrite date/time without accepted zone/basis; optional title patch only. |
| Same-zone span/Stay | Explicitly limited date summary if adapter supports it | Narrow scheduledDate/startTime cannot round-trip endpoints; full edit rejected. |
| Cross-zone transport | Contextual title/summary; old location cannot stand for both ends | Read-only/withheld; no flattened save. |
| Estimated | Untimed date summary if uncertainty cannot be shown | Naked clock would falsely look exact; no temporal edit. |
| Window | Date summary only, retain full source label in canonical store | No midpoint/clock replacement; no legacy full edit. |
| Confirmed instant-only | Explicitly defined display context, otherwise limited/withheld | No old civil date/time edit implying original zone. |

Current schema's mandatory scheduledDate can make an undated canonical object
unrepresentable to an old reader. **Withhold it**, never insert Today or another
fake date. Rich transport/Stay may likewise be withheld if the old UI cannot make
the limited summary/read-only state clear. Server compatibility projection is
recommended where useful; it is not canonical input on Save.

Future legacy mutation adapters permit only explicit whitelisted field operations
with revision guards. Unqualified full-object replacement, canonical clock/zone
changes, location writes on transports, clearing endpoints/participants or changing
shape/basis are rejected. Omission preserves; explicit null is not universally a
clear command. A compatibility title-only operation can be safe; a whole-object
payload with title/date/time/location is not treated as that operation.

This is the explicit proposed compatibility decision: **read limitations plus
guarded/rejected writes**. Review must accept it before rollout. Coexistence is
feasible if every writer is mediated; inability to enforce the gate triggers STOP,
not an assumption that old direct writers will behave.

## Q. Mobile SQLite lossless projection

Retain `itinerary_items` as a legacy cache while adding the canonical components
under stable local/server identity mapping; do not squeeze them into date/time/
location strings. Prefer additive root columns and a typed local transport endpoint
table mirroring server roles, plus existing-compatible participant association
projection. No SQLite migration code, number or exact table name selected here.

Minimum future local data:

| Family | Facts that must survive restart/pull/edit/push |
| --- | --- |
| Identity/shape | Trip, local ID, server ID, root kind, semantic-contract marker, shape and schedule-owner association when applicable. |
| Temporal | Original normalized calendar labels/clocks/precision, endpoint zones, supplied offsets, quality/basis, confirmed instant and accepted derived binding, unresolved/gap/fold/resolution evidence, qualitative label and any supported source bounds. |
| Transport | Two typed roles, independently partial temporal/place components; same aggregate ID; no flattened location/date replacement. |
| Spatial | Authored text/address, accepted target/components, optional internal/provider reference, candidate/input binding, minimum cache/acceptance state. |
| Participation | Explicit scope and resolved TripPerson set; Track A observation retained where required, distinct from Account owner/access. |
| Synchronization | Server semantic revision, last accepted snapshot/basis, pending local intent/base revision, owner Account, operation identity, deletion/state evidence when protocol supports it. |

Normalize fields used in Day/date/role/Person queries. Keep opaque source references
or provider payloads outside those core query facts; bounded JSON evidence is
acceptable only if opaque and round-tripped, not a substitute for typed core fields.
An unknown future semantic version must be retained safely/read-only or rejected
before cache/cursor mutation. A lossy parser stripping unknown facts cannot save it.

Use existing ordered transactional migration conventions (E4): new canonical facts
start nullable/unobserved for old rows. Do not rewrite migration 3/4 or fabricate
server observations. Apply parent/endpoints/participants/revision and pull checkpoint
atomically. Preserve pending intent when remote snapshot arrives; no INSERT OR
REPLACE deletion of child evidence. Local write and durable operation share a
transaction, account/generation admission follows the established Person boundary.
E5's synced-cache admission gap must be gated in the later projection slice.

## R. Server/local authority

Server semantic aggregate is **canonical shared accepted state**. SQLite is the
**mobile source of truth for reads and durable offline intent**, with a lossless
projection of the accepted aggregate plus pending edits. These statements do not
make network access a prerequisite to saving offline or erase an unsynced draft.
Backend remains the authorization/validation/shared-commit boundary; features use
repositories, not direct database/Supabase writes.

Local display, calendar-night difference, elapsed duration and Day overlap may be
derived deterministically from accepted facts. Local civil→instant computation is
a draft/cache result until the same interpretation/rule binding is accepted; it
must not replace a server-accepted conversion under different timezone rules.
No provider/cache refresh changes authored intent, no local device-zone rewrite.
Revision/omission rules protect newer accepted state and pending Account-owned work.
No itinerary convergence protocol is claimed implemented by existing create queue.

## S. DTO/wire requirements

Future DTOs need an explicit supported semantic-contract marker and validated
shape, root ID/Trip/revision, full temporal/endpoint/place/participation facts, and
mutation interpretation. Do not choose an endpoint/version here.

| Wire situation | Required meaning |
| --- | --- |
| Marker/new components absent in legacy read | Semantic observation absent; preserve already observed rich cache rather than clear. |
| Marker present, required discriminator missing | Invalid/incomplete canonical response; reject atomically, no legacy fallback. |
| Explicit UNKNOWN component | Knowledge is unknown in the supported semantic shape, independently of absent legacy fields. |
| Known none/not-applicable | E.g. point has no end, unassigned has no Persons; distinguish from unavailable/unobserved. |
| Known clock/zone/offset/instant | Preserve value, precision, source/basis and consistency; instant normalization must not erase original civil/offset intent. |
| Endpoint array | Explicit roles and unique role membership; unknown facts may be null with declared meaning, missing role is malformed. |
| Location data | Authored text and accepted target separate from provider suggestion/cache; include input binding. |
| Mutation omission / explicit clear | Omitted field is untouched. Clear is an explicit allowed operation with shape/quality consequences, not null-everything. |

Use discriminated presence/knowledge rules, not one optional property meaning
legacy, unknown, clear, not-applicable and unsupported. A bounded shape+nullable
components can implement this without a wrapper object for every scalar. Parse
known versions strictly enough to avoid erasure; retain/reject unsupported evidence
before processing a revision or cursor. New DTOs must never serialize only the old
compatibility projection for offline edits.

## T. Write-safety rules

1. Canonical shared writes require actual aggregate **revision/CAS**, not current
   create response version=1 or updated_at treated as revision. No command bus added.
2. Accept field-specific intent with explicit schema/basis capability. Omitted
   facts remain; unsupported shape edits fail, never downgrade semantic version.
3. Old creates remain legacy; deterministic create replay must not alter an existing
   canonical object. Later canonical idempotency acceptance must compare the same
   normalized intent/binding rather than accept changed-body replay as new intent.
4. Whitelisted title/notes edits preserve all time/place/endpoint/Person evidence;
   whole compatibility saves are not automatically classified title-only.
5. Old `location` edits on rich transport fail. Ordinary authored location edits
   require explicit intent and invalidation of old enrichment binding; zone stays
   independent unless explicitly changed.
6. Multi-component semantic changes (unknown→fixed, shape/span/endpoints, scope)
   validate and commit atomically, retaining original evidence at same business ID.
7. Every accepted derived instant binds to its source civil inputs and rule/choice;
   a cache is not a second editable truth. Clearing clock invalidates derived anchor.
8. Reads stripped by an old DTO cannot be submitted as replacement. Reader support
   does not imply writer support; server classifies/rejects unsupported mutations.
9. Guard **all** writer paths, including retained direct table/RPC access where
   applicable. Backend-only checks cannot protect canonical rows from other writers.
   Exact privileges/protection design is the next schema/compatibility contract.
10. No provider update, old omission, stale pull or account-switch result can erase
    newer accepted semantic facts or pending local intent.

These requirements define safety acceptance, not conflict-resolution machinery.
If old direct writers cannot be restricted while preserving authorized legacy
behavior, activation is blocked pending a separate compatibility decision.

## U. Provenance minimum / Track C boundary

Store only provenance that changes interpretation or protects intent:

| Direct semantic evidence | Why needed / bounds |
| --- | --- |
| Basis and source attribution | User-entered civil, import-confirmed instant/civil, derived-from-civil, legacy-unknown/proven assumed-UTC are different claims. Labels alone require real admission evidence. |
| Precision/original supplied offset or fragment | Normalization must not turn missing time/zone or supplied minute precision into exact recovered context. Raw wording retained when normalized facts cannot carry it. |
| Zone/target acceptance | Identify actual source or user acceptance and the component accepted; provider confidence does not suffice. |
| Derived interpretation binding | Exact civil input/accepted offset/fold choice plus identifiable converter/rule evidence; source-confirmed instant not silently rewritten. |
| Location input binding | Revision/fingerprint for enrichment and accepted target; rejects stale match after text correction. |
| Legacy evidence reference | Retained original timestamp/input if available before refinement replaces normalized slots; unobserved if no evidence. |

The concepts are not one mutually exclusive provenance enum for the whole object:
each boundary/location can have distinct source evidence, with derived binding
when applicable. Reuse object revision and existing attribution where sufficient;
do not add per-field histories by default. Later refinement needs retained prior
source evidence, exact storage coordinated with existing/future approved audit or
Track C reference. Never duplicate an Artifact schema or store document bodies here.

Track C owns extraction/source/artifact lineage. A future typed opaque evidence
reference can bind interpreted facts to source/extraction, using its eventual
contract. Track B owns accepted calendar/clock/zone/instant/place interpretation.
An import may supply confirmed UTC, civil fragments, free text, provider suggestion
and uncertainty independently. Parser output is candidate evidence until validation
and the explicit acceptance path establish the claim; a database insert is not
temporal confirmation. C-I1 absent here; identifier/schema/link lifecycle deferred.

## V. Persistence strategy comparison

| Strategy | Fidelity / query / Day | Migration / old clients / offline | Transport / Stay / enrichment / Booking | Size / reversibility |
| --- | --- | --- | --- | --- |
| A. Extend both parents directly | Explicit fields can preserve modes and query dates/instants | Additive but wide; needs same writer guards and lossless SQLite; not safe automatically | Direct two endpoint families work; extending reservation schedule root risks Booking coupling; existing enrichment reusable | Few tables, many sparse duplicate families; additive reversible if retained, no rollback to lossy saves. |
| B. Shared temporal/spatial child records referenced by both parents | High fidelity if ownership/versioning defined; joins for every simple event | More FKs/ownership/atomic update cases; dual references can share mutable truth; full local child graph and guards | Flexible transport/Stay, but shared location/temporal lifecycle exceeds needed use; commercial ownership still unresolved | Larger foundational change; rollback harder once shared records become authority. |
| C. New canonical Trip plan-object layer, demote old parents | High potential fidelity, generalized queries | Biggest migration and mapping risk; two identity surfaces/cache projections/old adapters; no current necessity | Flexible but invents universal root and effectively reopens Booking model | Largest implementation, least reversible; reject now. |
| D. Narrow event extension + event-owned transport endpoints | High fidelity for new plans; explicit root/endpoint queries and same-ID Day projections | Additive, old rows untouched; guard/read-only policy; SQLite mirrors small typed aggregate | One event Stay, two transport ends; current spatial family extended; reservation authority/Booking deferred and legacy preserved | **Preferred**, minimal justified child table; activation reversible by disabling writers while retaining facts. |

Select **D**, a scoped hybrid of A/B. This preserves supplied semantics without
an abstract registry or replacing either parent identity. Reservation-rich adoption
is deliberately outside the first foundation, not a lossy promise that event fields
already preserve every future Booking fact.

## W. Event vs Reservation authority

Recommended responsibilities for this rollout: **event = canonical new plan
occurrence/span**, **reservation = retained commercial/reservation evidence**, with
legacy reservation schedules still attributed to their original root until
explicit association/adoption. This is a persistence rollout policy, not a complete
Booking lifecycle definition or claim that today's data follows it.

| Business fact | Authority / projection identity |
| --- | --- |
| New activity/unbooked transport/Stay | Event owns schedule/place/Person scope; Day uses event ID. |
| New booked flight/Stay when future Booking slice is authorized | Event may own one planned schedule and reference reservation evidence; both rows not required merely to schedule travel. Booking evidence policy deferred. |
| Existing reservation-only schedule | Reservation ID remains legacy source; projection labels legacy uncertainty, no automatically synthesized event. |
| Existing event linked to reservation | Both sets of timestamps remain untouched. Link alone proves neither equal schedule nor owner; resolve ownership/evidence before canonical Day claims one unified fact. Avoid presenting as two confirmed occurrences. |
| Explicit later same-fact association | Designate one event schedule owner; reservation timestamp values retained as evidence/compatibility, not another editable calendar schedule. Adoption atomic; IDs preserved; multiple linked event schedules for the same fact forbidden by domain validation. |

No mandatory flight pair or duplicated hotel event/reservation schedule. Commercial
service dates may later be distinct evidence, but B-T2 does not claim how Booking
amendments, multiple stays, cancellation or rescheduling resolve them. If that
decision becomes necessary for a slice, STOP for Booking/authority review. Legacy
same-fact association ambiguity is unresolved data, not a required guessed rewrite.

## X. Derived-vs-stored matrix

| Value | Classification | Reason / invalidation |
| --- | --- | --- |
| Authored dates/clocks/zones/quality/roles/shape | STORE | Irrecoverable source intent; independent boundaries. |
| Source-confirmed instant / supplied offset | STORE | Evidence of occurrence/timeline, not calculated replacement. |
| Civil→UTC instant | DERIVE + STORE accepted binding/snapshot | Root normalized slot supports query/reproducibility; recompute only with known rule/input, explicit acceptance for changed interpretation. |
| Offset calculated from IANA rules | DERIVE; CACHE OPTIONAL | Not independently editable; source-supplied offset stays stored. |
| Stay nights | DERIVE | Checkout minus check-in calendar labels, not elapsed hours/24; unknown if dates missing/invalid. |
| Elapsed duration | DERIVE | Difference of valid resolved instants; estimated label retained; unknown if either boundary unresolved. |
| Day overlap / in-transit interval | DERIVE | [start,end) plus explicit query context; no geometry/location interpolation. |
| Another-zone display date/time | DERIVE | Projection does not recover or overwrite original local intent. |
| Day index/overview sequence | CACHE OPTIONAL | Invalidation on schedule/context revision; no authored second truth. |
| Qualitative timing / accepted target | STORE | User/source fact, cannot derive afternoon bounds or manual coordinates. |
| Provider response/freshness data | CACHE OPTIONAL | Optional enrichment bound to input; preserve accepted object target independently. |
| Physical Person location, unknown-zone local day, legacy nights | UNKNOWN | Cannot derive from absent/ambiguous evidence or Trip membership. |

## Y. Validation requirements

| Invariant | Database-enforceable minimum | Domain/application validation | Derived consistency |
| --- | --- | --- | --- |
| Shape/version/quality | Bounded values, nullable component combinations for canonical rows only | Complete supported shape; legacy absent marker not manufactured | No shape-dependent invented clocks/instants. |
| Calendar/clock | PostgreSQL date/time validity; SQLite literal/type/shape safeguards | Real Gregorian date, clock precision/range, source normalization without overflow | Date calculations preserve labels. |
| Zone/offset | Nullable explicit zone text/offset range representation | Accepted IANA identifier against supported rules; offset applicability; no device default | Civil/offset/instant agree or explicit unresolved evidence. |
| Span ordering | Comparable accepted end instant ≥ start where both known | Same-zone calendar stay date order; partial/cross-zone unresolved checks; zero-length gives no occupancy | [s,e), end milestone independent, no infinity from missing end. |
| Transport roles | Real parent FK, unique parent+role | Exactly two typed roles atomically, partial facts allowed; reject duplicate authority families | Root normalized instants agree with accepted endpoint basis. |
| Trip/person/group | Existing FKs/uniqueness useful; scope discriminator | Same-Trip Person, assigned/whole-group nonempty, unassigned no assigned set, Track A selection evidence | No roster-change expansion of authored set. |
| Location | Paired coordinates/ranges, supported provenance values | -90≤latitude≤90, -180≤longitude≤180, component acceptance and input binding | Stale candidate cannot become current accepted target. |
| Revision/association | Bounded monotonic revision and owner/link constraints when designed | CAS, exact same Trip, one schedule owner per same fact | No double Day occurrence or independently editable duplicate schedule. |

Some cross-table/whole-aggregate invariants need transaction-level validation or
guarded database procedures; a simple CHECK cannot validate an IANA rule, same-Trip
foreign row or exact two-child count alone. SQLite affinity is not type enforcement.
Legacy invalid/incomplete facts remain attributable evidence; do not impose new
semantic constraints on old rows by silently defaulting/adopting them.

## Z. Migration risks

| Risk | Required later mitigation / initial absence |
| --- | --- |
| Historical semantics falsely inferred | All new semantic marker/shape/basis/quality, civil dates/clocks/zones, supplied offset, resolution/accepted evidence, canonical participant scope and target acceptance begin **nullable/unobserved** on legacy rows. Existing timestamps/flags/text unchanged. |
| NOT NULL/default knowledge | No default EXACT, UNKNOWN, ALL_DAY, UTC, midnight, active Persons or whole-group. Required facts may be required only on validated newly canonical aggregates. UNKNOWN must be explicitly authored/confirmed, not historical default. |
| Revision baseline | Canonical aggregate revision must be explicitly established by guarded adoption; no fabricated observed server revision in SQLite. Existing create version=1 is insufficient. |
| Dual-write drift | Derived/compatibility slots written only from canonical source in same transaction; no second editable schedule. Legacy rows keep old mapping. |
| Old/direct writers | Inventory mediated and direct paths/grants/RPCs; protect canonical rows before activation. If protection incompatible with required writers, STOP for compatibility decision. |
| Backfill temptation | No bulk zone inference/strip-Z/night reconstruction; retain unknown evidence and same-ID explicit refinement only later. |
| Index costs | Add only query-proven Trip/date/instant/endpoint-role indexes; existing planned_start index may index compatibility values, not certify them. Evaluate locks/replay locally. |
| Server/local rollout order | Schema support and guards first, then DTO/pull/local projection and read compatibility, then canonical writes; separate feature activation. Unmigrated backend failure is not legacy absence. |
| SQLite projection rollout | New local fields unobserved; preserve IDs, pending queue and owner; no cursor advancement after malformed/partial aggregate; upgrade fixtures through runner. |
| Participant CASCADE/scope | Track A retention dependency; B does not alter FK/lifecycle. Do not claim historical retention acceptance while deletion remains destructive. |
| Place/provider ambiguity | Optional cache, input-bound enrichment, accepted target retained; never global equivalence from provider-aware uniqueness. |
| Rule updates / baseline drift | Accepted derivation snapshot, explicit changed interpretation; integrate/revalidate manifest `0285ace` only when authorized. |

Rollback of feature activation disables unsupported canonical writers/readers while
retaining rich columns and facts. Dropping fields or exporting rich rows through
old full-save forms is not a safe rollback. No migration created/applied here.

## AA. Implementation slicing

Names below are recommendations, not authorized phase starts or fixed migration
names. Each future slice requires explicit approval and deterministic gates.

| Slice / dependency | Smallest scope | Acceptance gate |
| --- | --- | --- |
| 1. Schema and writer-compatibility contract | Exact event component/endpoint/authority/protection names and nullable combinations; verify local baseline/writer inventory; no Booking lifecycle | Every B-T1 mode/scenario preserved; all writer paths classified; old forbidden edits rejected in proposed contract; baseline manifest agreed. |
| 2. Protected additive server foundation | Fields/revision support and typed endpoint capacity, canonical activation off; old rows preserved | Isolated replay, IDs/old values/status/FKs/financial equality, canonical shape constraints and direct-writer guard fixtures. No defaults pretending history. |
| 3. Lossless DTO + SQLite read projection | Full parent/endpoints/basis/evidence, account-scoped atomic hydrate, legacy read adapters, no rich editing yet | Round-trip/restart equality for supported modes; omissions/older snapshots preserve rich facts; unknown version safe; Account/generation isolation; old read omissions truthful. |
| 4. Participant compatibility | Scope+resolved Person sets over existing IDs; Track A observation boundary and retention dependency | Same-Trip, unassigned/whole-group/subset, inactive historic set unchanged, legacy User/null ambiguity preserved; no new lifecycle or CASCADE change. |
| 5. Canonical activity/Stay writes | Guarded create/refine/edit, durable offline intent, accepted conversions; dependency 2–4 | UNKNOWN/ALL_DAY/EXACT/ESTIMATED, complete/partial Stay, CAS/replay preservation, legacy same-ID refinement evidence, financial non-interference. |
| 6. Transport write activation | Two endpoint aggregates, independent zones/places/qualities and normalized summaries | Nelson/Sydney/date-line and partial arrival; atomic edits/replay, old flattened saves rejected; one Day identity. |
| 7. Optional later adoption | Reservation association/refinement and numeric windows only after separate authority/evidence decision | No duplicate schedule truth, IDs/evidence retained, complete lossless source-bound/local round trip; stop if Booking decisions required. |

Slice 3 includes read safety before rich write activation; don't wait until the end
to discover old clients cannot carry the data. Typed endpoints can exist in slice
2 without transport writes until slice 6. Legacy evidence confirmation is optional,
not a prerequisite to all new planning. No giant migration or sync worker design.

## AB. Golden persistence scenarios

Synthetic dates are **2026**, zones are supplied facts, not live/provider schedules.
“Local same facts” means typed SQLite components and evidence, not JSON compatibility
flattening. P1/P2 are existing same-Trip Person IDs. Old behavior is the proposed
read/write gate from P/T. Each row states source facts, server/local need, derived
answers and prohibited assumptions.

| # / scenario | Canonical facts / server persistence need | Local persistence need / derived values | Legacy compatibility / prohibited assumptions |
| --- | --- | --- | --- |
| 1. Museum 10:00 Auckland | Event point, Dec17 10:00 EXACT, Pacific/Auckland accepted; text Museum; assigned {P1,P2}; civil basis | Same root components/set, derived binding; Dec16 21:00Z | Authored context summary only; no appended-Z as truth, provider requirement, end/duration inference. |
| 2. All-day Routeburn | Event all-day Dec17, accepted Pacific/Auckland, valid text, whole-group recorded {P1,P2} | Shape/date/zone/scope; contextual Day interval only | Untimed date summary/read-only; no 00:00 appointment, 24h duration or dynamic roster. |
| 3. Dec17 clock unknown | Event point-intent date Dec17, UNKNOWN clock/null, zone known or explicitly unresolved | Date/quality/nullable clock; date candidate, no instant | Null-time summary; no estimated midnight or all-day conversion. |
| 4. Estimated 10:00 | Event Dec17 approximate10:00 Auckland, ESTIMATED anchor; no tolerance supplied | Preserve quality/binding; estimated Dec16 21Z | Untimed summary if old UI cannot label estimate; no guessed bounds or EXACT. |
| 5. Flexible afternoon | Event window-intent Dec17, source label afternoon, bounds/zone unknown | Label/date/shape, unassigned if not supplied; no numeric instant | Date summary; no universal afternoon hours/midpoint/full-window occupancy. |
| 6. Hotel exact clocks | One Stay event Dec16 15→Dec19 10, Pacific/Auckland both ends, EXACT, property text, {P1,P2} | Both civil boundaries/zone/quality, same ID; 3 nights; Dec16 02Z→Dec18 21Z, 67h | Limited Stay summary/read-only; no daily clones, duplicate reservation authority or hours/24 nights. |
| 7. Hotel clocks unknown | One Stay event Dec16→Dec19 calendar intent, UNKNOWN clocks; known property zone if supplied | Both dates, independent null clocks/quality, zone; 3 nights, uncertain boundary occupancy | Date summary; no fabricated check-in/out midnight, exact elapsed duration or boundary-day occupancy at T. |
| 8. Nelson→Auckland | Transport event; ORIGIN Dec16 09 Nelson, DESTINATION10:25 Auckland; Pacific/Auckland each; {P1} | Two endpoint rows+root snapshot; Dec15 20→21:25Z,85min | Context summary/read-only; no one-place location or clock-only sorting across context. |
| 9. Auckland→Sydney | ORIGIN Dec16 09 Pacific/Auckland; DESTINATION Dec16 10:30 Australia/Sydney; independent airport text | Same typed ends/binding; Dec15 20→23:30Z,3h30 | Read-only/withheld timed detail; no equal-zone assumption or 1h30 subtraction. |
| 10. LA→Auckland | ORIGIN Dec16 22 America/Los_Angeles; DESTINATION Dec18 08 Pacific/Auckland | Same endpoints; Dec17 06→19Z,13h; explicit-context LA16/17, Auckland17/18 overlaps | Read-only/summary; no added date-line24h, invented intermediate endpoint or aircraft zone. |
| 11. Confirmed UTC only | Event trusted Dec17 06Z, source-instant basis; local date/clock/zone unknown | Instant/source evidence and missing civil context; explicit query-zone Day only | No mandatory fake scheduledDate; withhold when old shape cannot represent it. No device zone as original context. |
| 12. Airbnb later enriched | John's Airbnb/12 Example Rd authored target, later attributed provider coordinate candidate bound to original input | Text/address remain, separate accepted/candidate/binding/provider state; no time change | Single text summary if harmless; old location correction cannot leave stale candidate active. No provider text/zone overwrite. |
| 13. Legacy Mobile ...Z | Literal stored instant+flag retained, proven writer evidence if available; no canonical marker | Preserve existing local date/time/server mapping and evidence; no certified converted schedule | Current legacy create/display stays attributable; no silent remove-Z/zone shift or promotion from suffix alone. |
| 14. Legacy reservation times | Same reservation ID/starts_at/ends_at, unknown original zone/intent | Future legacy reservation projection retains instants/evidence, no invented civil/night count | Legacy candidate; trusted evidence may refine later. No automatic event clone/calendar nights from UTC. |
| 15. Rich transport old client | Canonical event+two endpoints+guarded revision authoritative | Canonical local projection unchanged by old representation | Read-only/withheld or limited summary; full save/location overwrite rejected, never endpoint flattening then save. |
| 16. Offline round-trip edit | Supported canonical object, explicit field intent at base revision, all other facts/evidence retained | Atomic local edit+durable op; restart; full DTO/aggregate apply; exact component equality except intended change/accepted revision | Unsupported old snapshot omission cannot clear rich data; no lossy full PUT, Account leakage or device-zone mutation. |
| 17. Unknown→fixed same object | Same event ID, date retained, confirmed10:00+accepted Auckland zone, explicit refinement evidence/CAS | Quality UNKNOWN→EXACT, derive/bind Dec16 21Z for Dec17; old evidence retained | New context summary rules; no ID replacement, hidden change to old timestamp without retained evidence or lost Person set. |
| 18. DST fold | LA Nov1 01:30 civil, FOLD_UNRESOLVED; then explicit -07 occurrence accepted (alternative -08 valid) | Persist ambiguity then choice/offset/binding; -07→08:30Z, -08→09:30Z, one-hour difference | Unresolved timed projection withheld; no default-first fold, local zone guess or discarded supplied offset. |

These are persistence design examples, not executed server/local implementation
tests. Local standard-library arithmetic checks support their conversions and
gap/fold distinction; actual future aggregate round-trip is an implementation gate.

## AC. Financial non-interference

No changes to **expenses, economic_date, financial occurred_at meaning, FX dates,
Settlement cutoffs, frozen inputs, Review financial fingerprints or Personal
Payment financial semantics**. Trip local dates, zones, nights, endpoint fields,
provider evidence and Person scope do not enter financial equality/digest inputs
through broad object spreads. No recalculation, new default date, migration,
financial participant filtering or reinterpretation. Financial date columns may
never be reused as travel-schedule fields. Existing IDs/history/financial boundaries
remain intact. This report changes no source/schema or financial document.

## AD. Risks / unknowns

**Biggest risk:** canonical writer protection across external legacy/direct
writers is not proven. B-T2 proposes a feasible explicit guard policy; activation
cannot proceed until the next slice inventories/enforces every path. Backend-only
protection would be insufficient. Remote evidence is not required to choose the
direction; if required for implementation acceptance, stop for authorization.

Other bounded unknowns: historical writer evidence may be unrecoverable; linked
event/reservation schedule ownership is not established by existing FK; exact
runtime timezone rule identity/update acceptance needs contract; provider scale/
freshness/equivalence is unknown; participant deletion can erase references; current
itinerary cache/sync lacks rich convergence and complete admission. None is solved
by changing B-T1, Person identity or financial semantics.

Window V1: **store the qualitative label now** when supplied; defer numeric-window
editing and its exact bound representation. B-T1 allows optional numeric windows,
not a currently implemented Mobile requirement. If an import/user supplies real
bounds before typed support exists, retain them as attributed source evidence and
do not mark a lossy canonical object adopted, or defer that object's canonical
adoption. Do not discard them/pretend only the label existed. Event span start/end
must not double as possible window bounds. No Flexible Block lifecycle here.

Stop conditions reviewed: no Person replacement, guessed history, new Artifact
model, irreconcilable B-T1 contradiction, implementation or remote evidence needed
to answer this preflight. Booking ownership is deliberately deferred. Coexistence
depends on the explicit reviewed guard decision P/T; if impossible to implement
for all writers, STOP before activation. Unrelated workspace changes did not appear.

## AE. Recommended next phase

Review this direction, especially new-event schedule authority, old-client
withholding/read-only rules, all-writer protection and reservation deferral. Then
explicitly authorize **a schema and compatibility contract** (AA slice 1), not
migration execution. That contract should choose exact component/resolution/revision
representation, confirm field/endpoint ownership and writer protection, reconcile
the local manifest baseline and specify deterministic lossless tests.

No automatic B-T3 or code work. Non-goals: Booking lifecycle, Import parser,
Source/Artifact schema, UI, Day Feed, map rendering, live tracking/routing/recurrence,
permissions/Track A lifecycle, universal command bus, migrations, sync worker or
conflict-resolution implementation. No handoff/ADR rewrite under this single-report
delivery; this document is the next review entry point.

## AF. Acceptance matrix

| Criterion | Evidence | Result |
| --- | --- | --- |
| Current server temporal fields classified | B/C/D; E1/E3 | PASS |
| planned_start/planned_end future role decided | C: D, explicit basis-dependent normalized/legacy role | PASS |
| Reservation/Stay persistence direction decided | D/W: new Stay event, defer Booking root; legacy reservation preserved | PASS |
| Transport endpoint options compared | E: direct/typed/place-map/JSON | PASS |
| Preferred endpoint strategy selected | E: event-owned typed ORIGIN/DESTINATION rows | PASS |
| All B-T1 temporal modes mapped | F: nine rows, partial source facts included | PASS |
| IANA/offset/instant requirements defined | C/G/Q | PASS |
| DST gap/fold requirements defined | G/AB18: persistent unresolved and accepted choice | PASS |
| Unknown/estimated/all-day distinguished | H/F; no legacy flag conversion | PASS |
| Window V1 persistence bounded | F/AD: qualitative label, numeric adoption gate | PASS |
| Spatial authored/enrichment separated | I/Q/U; input-bound accepted/candidate facts | PASS |
| Places role bounded | J: optional cache, physical registry deferred | PASS |
| Planned vs observed storage distinct | K; source/subject/time evidence only | PASS |
| trip_days compatibility defined | L: unchanged authored grouping, optional span link | PASS |
| Participant boundary without changing Track A | M/E6: dedicated compatibility slice, same Person IDs | PASS |
| Legacy classified without rewrite | N: seven overlapping evidence classes | PASS |
| Legacy/new coexistence defined | O: marker and same-ID refinement | PASS |
| Old-client destructive-write risk addressed | P/T/Z: limited reads, guarded/rejected edits, all writers | PASS |
| Mobile lossless projection defined | Q/AB16, explicit typed components and atomicity | PASS |
| Server/local authority defined | R: shared accepted state/local reads+durable intent | PASS |
| DTO ambiguity rules defined | S: absent/unknown/none/clear/version | PASS |
| Write-safety requirements defined | T: field intent/CAS/preservation/rejection | PASS |
| Minimum provenance without Track C duplication | U: semantic binding, opaque later evidence boundary | PASS |
| At least three strategies compared | V: four coherent strategies | PASS |
| Preferred persistence selected | A/V: narrow event+endpoint hybrid | PASS |
| Event vs Reservation authority addressed | D/W: single new plan schedule, legacy association unknown | PASS |
| Derived vs stored classified | X: stored intent, accepted derived snapshot, optional cache, unknowns | PASS |
| Validation classified | Y: database/domain/consistency columns | PASS |
| Migration risks identified | Z: nullable/unobserved, guards, ordering, history/financial bounds | PASS |
| Later slices proposed | AA: seven bounded slices and deterministic gates | PASS |
| 18 golden scenarios resolved | AB1–18: server/local/derived/legacy/forbidden assumptions | PASS |
| Financial domain untouched | AC; single documentation file | PASS |
| No schema/source/test/config modified | Final Git scope only this report | PASS |
| No migration created/applied | Documentation-only tooling; no SQL/database execution | PASS |
| No remote access/mutation | Local files/Git/standard-library checks only | PASS |

Required coverage: **35 PASS / 0 PENDING / 0 BLOCKED**. Separate adoption gate:
**human review PENDING**. Future writer protection, round-trip and migration replay
gates are not implementation PASS claims.

Validation: report sections A–AF, acceptance rows and all 18 scenarios checked;
source/path references and new-file whitespace checked; local synthetic conversion,
duration/night and DST checks performed. No application tests or database replay
run for this design-only document. Branch/HEAD unchanged; final status contains
only this report. No dependencies installed.

Only file changed: `docs/architecture/TRIP_CANONICAL_B_T2_PERSISTENCE_PREFLIGHT.md`.

Production accessed: **NO**. Hosted Dev accessed/mutated: **NO**.
Migration created/applied: **NO**. Application code changed: **NO**.
Remote accessed: **NO**. Sibling worktree modified: **NO**.

**B-T2 PREFLIGHT COMPLETE — REVIEW PENDING. STOP.**
