# Trip Reservation Schema Registry — CP12

Date: 2026-10-05 (Pacific/Auckland). Registry: `otr-reservation-registry-v1`.
Status: **DESIGN ONLY — REVIEW PENDING**. No canonical Reservation schema change.
[Import contract](TRIP_IMPORT_CONTRACT.md) owns evidence, closure and matching.

## Versioned registry architecture

Registry entries identify immutable schema ID/version, subtype, family, common/family
versions, field descriptors, normalizer version, structural validator version,
closure predicate/policy version, evidence requirements and allowed future output
adapter/version/capability. Interpretation receives the exact referenced schemas.
Unknown schema/major version yields UNSUPPORTED; no GENERIC fallback that loses facts.
A changed required predicate/meaning increments its contract version. Reprocessing
creates a new Run; historical confirmed versions remain readable and immutable.

Descriptors specify value shape, cardinality, scope, provenance, normalization,
requirement class, conditional predicate, provider-resolvable capability and user
confirmation needs. UNKNOWN, AMBIGUOUS, PRESENT and NOT_APPLICABLE are explicit field
knowledge states. Absence differs from confirmed empty; no nullable-only specification.
Unsupported raw values remain evidence with validation findings.

Requirement classes:

- **closure-critical:** must resolve for the specified proposed action to be READY;
- **expected:** omission is reported but does not alone block closure;
- **optional:** absence carries no incompleteness penalty;
- **conditionally required:** critical only when its named predicate is true;
- **provider-resolvable:** additional capability/eligibility metadata, not a promise
  that a provider exists or that its observation is automatically accepted;
- **evidence-derived / user-confirmed:** independent origin/acceptance dimensions,
  never inferred from nullability or equal strings.

Only FLIGHT v1 has complete reference closure predicates here. Other types prove
extension structure; their closure policy is PENDING and cannot claim READY from
Flight rules or dispatch through a generic fallback. “Executable reference schema”
means rules specified precisely enough for later validators and test vectors; CP12
adds no executable code, runtime schema module or migration.

## Three levels

| Level                   | Fields and semantics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| COMMON v1               | Candidate ID/Run/input pins and schema reference (critical contract identity); subtype/family (critical classification); display label (expected, evidence/user origin); source-reported lifecycle (optional observation, not canonical status); temporal/location evidence (typed per family); explicit UNASSIGNED or reviewed Person selection (conditional target requirement); field provenance (critical for every proposed material field); Financial Evidence (optional, no Ledger authority). |
| TRANSPORT v1            | Independent ORIGIN/DESTINATION location and temporal boundaries, service/carrier identifiers, occurrence identity evidence; route/stops optional. Flights/trains/buses/ferries transport people; rental car uses a distinct pickup/return variant, not a flight-leg clone.                                                                                                                                                                                                                            |
| STAY v1                 | Property/name/address, independent check-in/out date/time/zone evidence, room/occupancy observations, nights derived only from known ordered calendar dates. No daily business clones.                                                                                                                                                                                                                                                                                                                |
| RESERVATION_ACTIVITY v1 | Service/venue/operator, booked date/time/window and party/ticket evidence; Activity, Restaurant and Ticket add typed admission/party fields.                                                                                                                                                                                                                                                                                                                                                          |
| PLAN v1                 | Block/POI/Generic authored intent, calendar/point/window/location evidence; no assumed paid reservation, exact clock or canonical status.                                                                                                                                                                                                                                                                                                                                                             |

Temporal components reuse B-T3A semantic names and precision: local_date/local_time,
clock_precision, quality, basis, zone_id, supplied_offset_seconds, source_instant,
source_instant_precision and unresolved civil interpretation. Proposed derivation
is not accepted B provenance. Place labels/free text remain valid without providers.
No canonical schedule is copied into independently editable booking dimensions.

## Initial taxonomy

| Subtype       | Family                            | Extension fields / deferred closure work                                                                                                          |
| ------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| FLIGHT        | TRANSPORT                         | Fully specified below; one occurrence is one leg.                                                                                                 |
| TRAIN         | TRANSPORT                         | Service/operator, train number, stations, coach/seat/ticket by passenger; critical station/time/segment rules deferred.                           |
| BUS           | TRANSPORT                         | Service/operator, stops, route/boarding instructions, passenger ticket; flexible/unreserved policy deferred.                                      |
| FERRY         | TRANSPORT                         | Ports/docks, operator, sailing, vehicle/passenger dimensions; dock/tide/open-return closure deferred.                                             |
| RENTAL_CAR    | TRANSPORT (pickup/return variant) | Agency, pickup/return branches and boundaries, vehicle class, drivers/booking party; duration/deposit/driver rules deferred.                      |
| ACCOMMODATION | STAY                              | Property, check-in/out, room bookings, guests, access instructions; day-use/unknown-clock/guest closure deferred.                                 |
| RESTAURANT    | RESERVATION_ACTIVITY              | Venue, reservation time, party size and named diners; walk-in/party mapping closure deferred.                                                     |
| ACTIVITY      | RESERVATION_ACTIVITY              | Operator, meeting place, session/window, party, entitlement; timed/open-date closure deferred.                                                    |
| TICKET        | RESERVATION_ACTIVITY              | Entitlement/issuer, validity scope, credential evidence and holders; not automatically a separate scheduled Event; credential lifecycle deferred. |
| BLOCK         | PLAN                              | Label, calendar/point/qualitative window, planned place/Person scope; flexible-plan closure deferred.                                             |
| POI           | PLAN                              | Name/free-text place, optional accepted navigation suggestion, optional future visit intent; no mandatory appointment; closure deferred.          |
| GENERIC       | PLAN                              | Preserved label/text and unclassified dimensions; explicit review/classification, no catch-all READY.                                             |

Taxonomy selects Import schema only. C-I3A candidate_kind remains TRANSPORT/STAY/
ACTIVITY/NOTE/OPTIONAL_POI/UNCLASSIFIED; future proposal adapters map registry subtypes
inside validated payloads. TICKET/RENTAL_CAR/BLOCK mappings require review; no enum,
canonical Event shape or persisted proposal_version is changed by this document.

## FLIGHT v1: scoped fact model

Schema ID: `otr.import.flight`, version 1. One leg/occurrence per Candidate; outbound,
return and connecting legs are separate Candidates with optional itinerary grouping.
A group/PNR can support several legs without becoming an occurrence identity.
Each dimension has an opaque proposal-local key; no key derives from a passenger
name, PNR, seat, date/time or flight number. Keys identify evidence groups, not
canonical domain entities. No new canonical Booking/Participant tables are implied.

| Scope / field                                  | Value and cardinality                                                                                          | Requirement / normalization / provenance                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Occurrence: service                            | Marketing carrier namespace/code + flight number; optional operating carrier/number and codeshare relation     | Closure-critical for CREATE; normalize code/number losslessly with carrier namespace, retain literal. At least one evidenced service or explicit user-confirmed service identifier. Codeshare relation must be supported, never number-only equality. Local metadata may suggest resolution.                                                                                                                   |
| Occurrence: origin/destination                 | Two distinct role-tagged airport/place descriptions; each code/name/text, optional terminal/location candidate | Closure-critical for CREATE: each unambiguous airport identity supported by code or resolved evidenced/user-confirmed name. Geocoding/coordinates/provider Place optional. Terminal expected when supplied, otherwise optional. Same-airport travel requires explicit review of unusual evidence.                                                                                                              |
| Occurrence: departure                          | Typed independent boundary                                                                                     | Closure-critical for CREATE: departure predicate below requires EXACT quality and an evidenced occurrence date plus supported civil resolution or independent instant evidence/confirmation. Preserve clock, offset, IANA zone, derived instant and source instant separately. Offset-only arithmetic is not SOURCE_INSTANT; no fabricated IANA zone. Unknown/estimated departure fails this CREATE predicate. |
| Occurrence: arrival                            | Typed independent boundary                                                                                     | EXPECTED, not universally closure-critical; conditionally validate selected known arrival or an affected ordering/conflict invariant. Unknown end remains explicit and need not block an otherwise identified departure-based leg. If known, exact/estimated distinction retained; exact end cannot precede exact start. Optional provider-resolvable schedule.                                                |
| Occurrence: service status                     | Source statement and observation time                                                                          | Optional; cancellation/delay/provider status is attributed evidence, never automatic canonical lifecycle or overwrite.                                                                                                                                                                                                                                                                                         |
| Booking collection                             | Zero-to-many opaque booking groups, scoped to this occurrence or explicit several-leg group reference          | Not critical for CREATE when no commercial evidence supplied. Same occurrence can have several PNRs/providers/parties. No schedule authority inside booking.                                                                                                                                                                                                                                                   |
| Booking: PNR/reference/provider                | Literal reference + issuer/booking-provider namespace, optional issued time                                    | Expected when booking evidence exists; namespace critical if reference used for matching. Never universal occurrence identity. Unknown provider retained unresolved.                                                                                                                                                                                                                                           |
| Booking: booking party                         | Source-reported names/count plus reviewed Person associations if available                                     | Expected when supplied; does not grant access or replace object participation. Ambiguous printed names remain unresolved.                                                                                                                                                                                                                                                                                      |
| Booking: Financial Evidence                    | Typed total/deposit/paid/balance/currency/payment date and explicit booking scope                              | Optional; exact normalized Money only with supported currency/scale. Never distributed by passenger count or copied into Ledger.                                                                                                                                                                                                                                                                               |
| Participant collection                         | Zero-to-many opaque passenger observations with optional booking-group links                                   | Absence means unknown, never everyone. Explicit UNASSIGNED is allowed pending domain participation activation. Distinct printed passengers may remain distinct unresolved observations without Person IDs.                                                                                                                                                                                                     |
| Participant: printed name / Person association | Exact name evidence; optional explicit same-Trip TripPersonId and reviewed association evidence                | Printed name expected when supplied. Exact Person mapping conditionally required before proposing a canonical participation change. Ambiguity requires review; account/uploader/name similarity never silently maps.                                                                                                                                                                                           |
| Participant: ticket number                     | Literal issuer-scoped ticket/segment identifier                                                                | Optional/expected when supplied; strong matching support within verified scope, not occurrence identity. Reissue relations require evidence, not newest-value wins.                                                                                                                                                                                                                                            |
| Participant: seat                              | Literal seat + leg/booking applicability and assignment observation time                                       | Optional; several passengers may have different seats. Unassigned seat is unknown, not conflict; competing seats for the same person/leg require changed-assignment evidence or review.                                                                                                                                                                                                                        |
| Participant: cabin/fare/baggage/boarding group | Per-passenger literal or typed allowance (count/unit/limits) with scope                                        | Optional, preserve person-specific terms; never flatten onto occurrence. Units and included/purchased allowance remain distinct; ambiguous applicability stays reviewable.                                                                                                                                                                                                                                     |
| All scopes: support/conflicts                  | Field path including proposal-local scope key → observation/fragment IDs                                       | Closure-critical for every proposed material field. Multiple supports, contradictory observations and user edits remain separately attributable.                                                                                                                                                                                                                                                               |

### Departure timeline predicate and temporal vectors — C1

FLIGHT CREATE departure requires temporal quality **EXACT**, preserving source
precision; a resolved ESTIMATED anchor does not satisfy this stricter v1 predicate.
Estimated/unknown departure remains a valid partial proposal/canonical B possibility,
with INCOMPLETE or eligible deferred resolution/review. Exact means evidenced schedule
quality, not proof that the flight occurred or subsecond precision beyond the source.

The occurrence date must be evidenced/explicitly confirmed. For civil evidence this
is the authored departure date. With instant-only evidence, retain the evidenced
instant's own date basis without claiming a recovered endpoint-local calendar date;
if matching needs local occurrence date, that independent matching fact stays unresolved.
The supported exact timeline paths are:

- Civil date/clock with evidenced/confirmed IANA zone and an admitted deterministic
  resolver yields DERIVED_CIVIL with UNIQUE or explicitly FOLD_RESOLVED binding,
  precision, applicable offset and rule/input provenance. The resulting instant is
  derived, not an independently evidenced source_instant. GAP/FOLD/PENDING does not
  satisfy the timeline predicate; supplied UTC offset alone cannot manufacture IANA.
- An independently evidenced or explicitly independently user-confirmed departure
  instant with precision may use SOURCE_INSTANT under B. Original civil clock/date
  and supplied offset remain separately attributed; disagreement requires review.
  An actual source timestamp with explicit offset expresses an instant; a separate
  local clock plus offset observation does not become source_instant just because
  arithmetic gives a UTC value. Record the source form and acceptance provenance.

Offset-only civil input retains DERIVED_CIVIL/PENDING, null zone_id and null
source_instant unless independent instant evidence/confirmation exists. Its arithmetic
conversion can be retained as a derived observation, but cannot be silently copied
into B source_instant or evade the civil resolver gate. An explicit independent
instant confirmation is a separately recorded user decision, never inferred from
arithmetic, schema normalization, model output or acceptance of the civil fields.
Missing eligible resolution can defer; otherwise show required review/incompleteness.

Arrival stays EXPECTED. A supported departure and unknown arrival can be CREATE READY
when other predicates and B invariants allow it; destination role still exists with
explicit unknown time. If arrival is selected as known, validate its independent
boundary evidence, quality/precision, date/zone/instant basis and affected ordering.
Compare supported instants for overnight/date-line travel, never civil clocks across
zones. Exact arrival cannot precede exact departure. Estimated arrival remains
explicitly estimated; any represented normalized anchors must satisfy B ordering,
without claiming exact interval occupancy. Unresolved/invalid selected arrival blocks
that action. Explicit exclusion retains its evidence/rejection finding and may permit
a departure-only action; it does not fabricate a complete arrival.

| Contract vector (synthetic)                                                                              | Required result                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Civil 2026-12-18 09:00, minute precision, supplied +13:00, quality EXACT; no IANA or independent instant | Preserve date/clock, supplied_offset_seconds=46800; zone_id=null, source_instant=null, DERIVED_CIVIL/PENDING. Arithmetic yields 2026-12-17T20:00Z as derived observation only. Offset-only input alone fails v1 CREATE departure predicate; resolve/review without fabricated zone/instant. |
| Same input plus explicit independently confirmed departure instant 2026-12-17T20:00Z, minute precision   | Separate confirmation/proof permits SOURCE_INSTANT EXACT, retained civil/offset evidence, zone still null; timeline predicate passes, without claiming resolved IANA civil context. Other closure/match/capability gates remain independent.                                                |
| Civil exact departure with admitted UNIQUE IANA resolution; arrival unknown                              | Departure predicate passes; arrival absence alone does not block CREATE READY; no invented arrival/interval.                                                                                                                                                                                |
| Resolved ESTIMATED departure or unresolved fold/gap                                                      | Departure predicate fails; retain quality/civil uncertainty and deferred/review reasons.                                                                                                                                                                                                    |
| Independently evidenced arrival instant precedes exact departure                                         | Selected arrival fails ordering; review/conflict or explicitly exclude with retained finding, no silent date shift.                                                                                                                                                                         |

CREATE READY predicates, evaluated deterministically:

1. Supported schema/field shapes and actual evidence validation succeed.
2. Service, distinct role-tagged endpoints and exact resolved departure meet the
   critical predicates above; no sole flight-number inference of date/route/time.
3. Selected known arrival and other selected material proposed values pass typed checks; missing
   expected/optional fields do not invent defaults or block by themselves.
4. No unresolved material evidence/Trip-context conflict or unsafe match remains.
5. Target Trip and explicitly UNASSIGNED or fully reviewed proposed participation
   intent are selected. Known ambiguous passenger association cannot dispatch as
   an exact Person change; it can remain evidence outside the selected action.
6. Action-specific assessment records admitted facts only. Canonical TRANSPORT,
   participant and TRACK_C command activation is a separate gate; currently disabled.

COMPLETE/AUGMENT READY uses an exact existing target/revision as a read observation,
validates every selected addition plus affected cross-field invariants, and never
requires unrelated missing canonical fields to be filled. It cannot downgrade
existing accepted values or claim the entire Flight is complete. UPDATE additionally
requires evidence of change and explicit review of affected accepted fields/base.
CONFLICT cannot become READY until an explicit supported reconciliation decision.
All changes require later admitted deterministic/user-approved commands; automatic
matching/consolidation of proposals is not automatic canonical augmentation.

A Flight with flight number only classifies FLIGHT but remains INCOMPLETE or deferred.
A known leg with absent expected arrival can be READY for CREATE under this policy;
it remains explicit partial arrival, not a fully known transit interval/Day occupancy.
The stricter Import departure policy does not redefine B's valid partial TRANSPORT.

## Flight matching anchor policy — I3

Normative policy: `import-flight-match-v1`. This governs automatic SAME_ITEM assessment,
not canonical identity, acceptance, overwrite or participant mapping. All anchor
components must be independently evidence-validated/explicitly confirmed, namespace-
qualified and applicable to the same leg. A model-generated segment key is not an anchor.

A **qualified occurrence tuple** is carrier namespace + service identifier (marketing
or evidenced operating service) + evidenced **origin-local occurrence date** + uniquely
resolved ORIGIN and DESTINATION airport identities. Preserve supplier definition of
service number/suffix and airport-code namespace; date must not be obtained from
viewed Day, device zone or arrival date. Clock/terminal/seat/PNR are not tuple keys.

For tuple-only automatic matching, the bounded relevant Account/Trip occurrence scope
must be explicitly complete for the assessed origin-date/service/route, contain exactly
one matching occurrence, and include selected competing proposals plus relevant
lineage claim results. Inspect any supplied origin clock for evidence of separate
same-day service occurrences. A partial/historical list alone cannot certify current
search completeness; unknown scope, multiple matching targets or unexplained distinct
departure clocks prevent tuple-only automatic SAME_ITEM. Complete scope is a read
observation at a stated baseline, not a guarantee of server uniqueness or a replacement
for CREATE-claim checks/CAS. No server certificate is invented by Import.

| Anchor / supporting or negative evidence                                      | Automatic matching rule / continuity review                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supplier-issued occurrence/segment identifier                                 | Strong anchor only when issuer namespace and documented uniqueness scope identify one occurrence/leg (including date applicability where IDs repeat), with exact admitted target/proposal binding and no unresolved material contradiction. PNR, ticket number or passenger-specific coupon alone is not a supplier occurrence ID. |
| Qualified carrier/service + origin-local occurrence date + origin/destination | Admitted anchor only under tuple completeness/uniqueness conditions above, no negative evidence. Different passengers/PNRs do not prevent SAME_ITEM; per-dimension assessment may yield AUGMENT_EXISTING.                                                                                                                          |
| Same flight number on different dates                                         | Negative for tuple SAME_ITEM; distinct occurrences support NEW_ITEM under scoped assessment. Explicit qualified rescheduling/supersession can instead require reviewed continuity, never number-only merge.                                                                                                                        |
| Different marketing numbers / codeshare                                       | SAME_ITEM only with independently evidenced codeshare mapping to the same qualified operating occurrence or supplier occurrence ID, consistent leg/date and uniqueness. Inferred/unknown mapping → POSSIBLE_DUPLICATE/UNRESOLVED_MATCH and continuity review.                                                                      |
| Retimed departure; same date/route/service                                    | Qualified issuer change notice/reissue ties exact old/new occurrence evidence. Assess supported continuity then UPDATE_EXISTING with explicit change review; otherwise conflicting known times prevent automatic SAME_ITEM/overwrite and require continuity review. No time tolerance or newest-source winner.                     |
| Rescheduled to another origin date or changed flight number                   | Tuple anchor breaks. Exact supplier supersession/change relation ties old/new leg and scope; explicit continuity review required even if a stable supplier ID remains. Preserve old/new facts; do not auto-merge or CREATE from a new key alone.                                                                                   |
| Contradictory origin dates                                                    | Negative unless independently explained as departure/arrival/date-basis difference or qualified change. Unexplained contradiction prevents automatic SAME_ITEM; known same-item conflicting evidence → CONFLICT, otherwise UNRESOLVED_MATCH/review.                                                                                |
| Contradictory airports/endpoints or direction                                 | Negative unless supported scoped change/alias correction is explicitly reviewed. City similarity, common PNR or acquisition cannot erase AKL→CHC versus CHC→AKL distinction.                                                                                                                                                       |
| Outbound/return or connections inside one acquisition                         | Source relationship is supporting provenance only. Resolve each leg's admitted anchor independently; one acquisition/PNR cannot merge the legs.                                                                                                                                                                                    |
| Multiple passengers/PNRs on one occurrence                                    | Compatible with an admitted occurrence anchor. Resolve booking namespace/leg applicability and passenger mapping separately; different seats/tickets do not become different Flights or automatic Person associations.                                                                                                             |
| Same Source, equal bytes, filename, time or model confidence                  | Supporting evidence only; no automatic occurrence anchor, even with a freshly generated key.                                                                                                                                                                                                                                       |

Negative evidence outranks an otherwise matching anchor for **automatic** assessment;
it does not prove a genuinely distinct item when supported change continuity may
exist. Until an anchor combination is admitted, use POSSIBLE_DUPLICATE (mapped to
UNRESOLVED_MATCH with that reason) or UNRESOLVED_MATCH. Explicit continuity review
records exact alternatives, leg/purpose relationship and actor decision; it cannot
bypass unresolved CREATE claims or domain conflict/CAS admission.

Matching vectors: unique complete tuple NZ289 / 2026-12-18 / AKL→CHC with two PNRs
admits SAME_ITEM, then passenger augmentation assessment; the same tuple in an
incomplete search stays UNRESOLVED_MATCH. NZ289 on 19 December is a distinct-date
negative unless reviewed rescheduling evidence ties it to the prior leg. Shared
PDF containing AKL→CHC and CHC→AKL remains two legs. Unknown codeshare mapping or
unexplained 09:00 versus 09:30 prevents automatic matching; evidenced retiming
retains UPDATE review. None of these facts authorizes canonical writes.

Mixed COMPLETE/AUGMENT/UPDATE labels follow the Import contract's I2 execution rule:
one atomic admitted typed operation or explicitly reviewed dependencies/successors,
never multiple same-base writes plus silent rebasing. Unsupported booking/passenger
fields stay deferred; a Flight schema field is not an admitted generic Event patch.
CREATE preparation must also inspect relevant predecessor/consolidation claims under
I1, even when this policy produces a unique occurrence tuple or incomplete search.

## Concrete synthetic Flight cases

| Case                                                                                          | Match / field behavior / closure                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Excel screenshot lists twelve legs                                                            | One Capture, at least twelve distinct Candidates if evidence supports twelve occurrences; common table headings are attributed support, not one booking.                                                                                                     |
| Boarding screenshot + itinerary PDF + booking email                                           | Many Captures support one leg. Consolidate service/endpoints, preserve booking and passenger field supports; unknown timezone defers or reviews, never fills device zone.                                                                                    |
| Existing E1 lacks evidenced terminal; new confirmation supplies it                            | COMPLETE_EXISTING proposes only terminal if previously missing; pins E1 revision and terminal evidence. It does not create a second Flight or replace another terminal.                                                                                      |
| E1 flight, PNR A for passenger X and PNR B for passenger Y                                    | AUGMENT_EXISTING adds distinct booking/passenger dimensions to the same occurrence. X/Y ticket/seat/baggage remain separately scoped; printed Y is unresolved until exact Trip Person association is reviewed. Canonical participant adapter stays disabled. |
| New file repeats all existing facts under another acquisition                                 | DUPLICATE_EVIDENCE; no business mutation, optional separately approved evidence link. Source acquisition identity remains distinct.                                                                                                                          |
| New confirmation says departure changed from 09:00 to 09:30, explicit reissue/change relation | UPDATE_EXISTING proposal with old/new support and base revision; explicit confirmation/CAS, no silent schedule rewrite.                                                                                                                                      |
| Two unrelated confirmations say 09:00 and 09:30, no change evidence                           | CONFLICT; neither source wins by age or confidence.                                                                                                                                                                                                          |
| Same flight number on another date, or same PNR outbound/return                               | NEW_ITEM only with sufficient occurrence distinction and scoped search coverage; otherwise UNRESOLVED_MATCH.                                                                                                                                                 |
| Same leg, two passengers have different seats                                                 | Compatible participant facts, not occurrence conflict. Same reviewed Person has incompatible simultaneous seat evidence → CONFLICT unless evidenced reassignment resolves it.                                                                                |
| Missing critical departure, offline with eligible schedule resolution                         | WAITING_FOR_NETWORK; within configured attention horizon (versioned baseline default 24 hours) also URGENT attention. Distant case remains DEFERRED.                                                                                                         |

## Extension and future proof gates

Adding a subtype requires all three-level versions, bounded field descriptors,
scoped evidence mapping, closure/attention predicates, normalization test vectors,
match rules and a reviewed target adapter. A schema-constrained model result does
not certify any of these. Canonical Booking structure, credentials, participation,
and schedule updates need their own admission/runtime review; CP12 reserves no
migration number and changes no server or local schema.
