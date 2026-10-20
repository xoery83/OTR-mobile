# Trip Canonical Track B — B-T1 Temporal / Spatial Semantic Contract

- Status: **B-T1 CONTRACT COMPLETE — REVIEW PENDING**.
- Date: 2026-10-03 (Pacific/Auckland).
- Working directory: `/Users/xoery/Project/otr-mobile-temporal`.
- Branch: `trip/temporal`.
- Baseline HEAD: `41e5213a2081b5b3b2c70db37e597f9e7b25545b`,
  `docs(trip): audit temporal and spatial architecture`.
- Initial workspace: clean. Only this contract document changes.
- Design only: no implementation, SQL, migration, remote access or deployment.

## Basis, evidence and decision status

The supplied established constraints are fixed. **DECIDED** identifies those
constraints; **PROVISIONAL** identifies the concrete semantic choice recommended
by this contract, awaiting review. **DEFERRED** excludes a later implementation/
product choice; **UNKNOWN** means insufficient evidence. Acceptance PASS means
this design answers the question, not adoption, feature readiness or deployment.
Normative “must” rules describe the proposed future contract after approval, never
claims that current code already implements it.

Required baseline sources: `AGENTS.md`,
`docs/architecture/TRIP_CANONICAL_B_T0_TEMPORAL_SPATIAL_AUDIT.md` (B-T0),
`docs/architecture/TRIP_CANONICAL_A0_AUDIT.md` (A0),
`docs/architecture/TRIP_CANONICAL_A1_IDENTITY_MEMBERSHIP_CONTRACT.md` (A1-D),
`docs/architecture/TRIP_CANONICAL_A1_I1_REPORT.md` (A1-I1),
`docs/architecture/TRIP_CANONICAL_A1_I2_PERSISTENCE_PREFLIGHT.md` (A1-I2-P),
`docs/architecture/TRIP_CANONICAL_A1_I2A_SCHEMA_CONTRACT.md` (A1-I2A-SPEC),
`docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/API_CONTRACT.md`,
`docs/OFFLINE_SYNC.md`, `docs/CURRENT_IMPLEMENTATION_STATE.md`, and
`docs/architecture/OTR_TERMINOLOGY_GLOSSARY.md`. Existing product/environment/
legacy-audit context remains applicable; no legacy checkout was reopened.

Newer committed `docs/architecture/TRIP_CANONICAL_A1_I2A_REPORT.md` states the
participation implementation attempt stopped on a baseline manifest gate and
retained no application/schema changes. A1-I2A-SPEC remains a specification, not
runtime participation fields. Git comparison from B-T0's source baseline `c2f1ea3`
to current HEAD contains documentation only. The old handoff's “no commit yet”
phrasing is historical; Git and the newer reports establish the current baseline.
This does not authorize repairing the separate Track A gate.

Compatibility evidence is B-T0 E01–E18, with narrow rechecks of
`src/domain/trip/person.ts`, `backend/src/supabaseGateway.ts:createItineraryItem`,
and `supabase/migrations/20260910000100_canonical_production_baseline.sql`.
No new whole-repository or legacy audit was needed.

## A. Executive decisions

1. **DECIDED:** existing `trips.id` is the root; `journey_members.id` is
   TripPersonId. Account, Person, access and object participation remain distinct.
2. **PROVISIONAL:** Trip start/end are inclusive, authored calendar overview
   labels: first/last intended Trip dates, not UTC endpoints or a physical time
   interval enclosing every event in every zone. Missing bounds stay missing;
   a supplied pair must be calendar-valid and start ≤ end. Activity endpoints may
   use other local date labels outside this overview; no automatic clipping.
3. **DECIDED:** calendar dates, wall clocks and instants preserve different intent.
   Zoned civil schedules retain original local date/time and IANA zone; known
   instants without a local zone are valid with explicitly limited projection.
4. **DECIDED:** no universal Trip timezone. **PROVISIONAL:** Day queries carry
   an explicit date and IANA zone, with object endpoint contexts preserved.
5. **PROVISIONAL:** unknown time, estimated clock time and all-day are distinct.
   None uses midnight as a substitute for missing intent.
6. **PROVISIONAL:** measured spans use inclusive start/exclusive end; calendar
   occupancy also uses exclusive end. Points and endpoint milestones have separate
   day membership. Missing boundaries do not silently become infinite occupancy.
7. **PROVISIONAL:** one Stay span with check-in/out milestones; calendar nights
   differ from elapsed hours. Unknown check-in/out clocks retain dates/zone.
8. **DECIDED:** transport has two independently described places and local temporal
   endpoints. **DEFERRED:** route geometry, stop infrastructure and recurrence.
9. **DECIDED:** user-entered location is valid; optional provider enrichment does
   not replace business identity or erase authored text. Manual correction carries
   its own intent/provenance.
10. **DECIDED:** planned/expected location and observed device location are distinct
    questions. **PROVISIONAL:** separate future query contracts, no universal winner.
11. **PROVISIONAL:** explicit Person set or explicitly unassigned participation;
    whole-group intent records the selected Person set and never means empty list.
    Inactivation cannot erase existing event relationships.
12. **DECIDED:** legacy UTC concatenation and all financial semantics stay untouched.
    Source/provenance is required before any later reinterpretation.

### Major options and reversibility

All chosen design alternatives below are PROVISIONAL unless the constraint itself
is explicitly DECIDED. Reversibility concerns future adoption, not a migration plan.

| Area / options | Benefit | Cost | Chosen direction / status | Reversibility |
| --- | --- | --- | --- | --- |
| Instant only / preserve civil intent plus zone | Instant-only orders easily; civil intent preserves local booking schedule and DST interpretation. | Civil intent needs zone/ambiguity/provenance; instant-only cannot reconstruct it. | Preserve supplied local date/time+zone; instant-only allowed when that is all the source proves. DECIDED information preservation; PROVISIONAL modes C/D. | Add missing context through explicit refinement; lost source intent cannot be recreated automatically. |
| One Trip zone / event and endpoint zones | One zone simplifies grouping; per-end zones support real travel. | Explicit Day context and endpoint labels required. | Event/endpoint zones; no root default as schedule authority. DECIDED. | A later explicit display preference may exist without rewriting intent; a root-only model loses information. |
| Unknown clock → midnight / explicit missing clock | Midnight gives a sortable number; absence preserves uncertainty. | Absence needs an untimed category. | Explicit unspecified clock. PROVISIONAL. | Can refine same identity later; fabricated midnight requires provenance to recover. |
| Repeated hotel events / one Stay | Repeated rows make daily lists easy; span preserves one stay and nights. | Projection must overlap a span with Days. | One Stay; optional endpoint milestones, no cloned daily business objects. PROVISIONAL. | Daily projections are regenerable; reconstructing one stay from unrelated rows is ambiguous. |
| Transport one place / origin+destination | One place reuses current schema; endpoints preserve direction and transitions. | Two independently incomplete place/time descriptions. | Role-tagged endpoints, geometry optional/deferred. DECIDED direction. | Single-place activities stay simple; endpoints cannot be recovered from text automatically. |
| Required provider Place / optional enrichment | Matching aids navigation; optionality permits offline/private/free text. | Unresolved navigation and stale-provider states remain visible. | Optional enrichment with authored intent preserved. DECIDED. | Providers can change independently; object/Person IDs remain stable. |
| trip_days authority / grouping aid | Authority simplifies one-day objects; grouping supports existing titles/notes without clipping spans. | Derived cross-day projection must be separate. | Authored date grouping/projection annotation, never sole schedule authority. PROVISIONAL. | Grouping can evolve; it cannot discard or reassign endpoint/span facts. |

## B. Canonical temporal vocabulary

No SQL types or TypeScript names are chosen. REQUIRED means the information must be
expressible; it does not make every component mandatory for every object.

| Concept | Meaning and preserved intent | Does not mean | Need | Instant mapping / timezone / unresolved place |
| --- | --- | --- | --- | --- |
| Calendar date | Valid Gregorian year-month-day label; literal authored/source day. | Midnight UTC, duration or a measured instant. | REQUIRED | No intrinsic instant; no zone required to retain label; place may be unresolved. Context required for physical-day projection. |
| Local wall time | Clock reading with source precision, e.g. 19:30; meaningful with date and civil context. | UTC or the phone clock by default. | REQUIRED | Date+accepted IANA zone+unambiguous interpretation needed to derive instant; incomplete time-only intent remains valid; place resolution unnecessary. |
| Timezone | Accepted IANA civil-rule identifier for the event/end, e.g. Pacific/Auckland. | Country/currency, current device zone, permanent numeric offset. | REQUIRED where civil-time conversion/physical Day is claimed | Can be supplied independently of provider Place; must not be inferred as truth without accepted evidence. |
| Instant | One position on the global timeline; source-confirmed or derived, with distinction preserved. | Original local date/time, time precision, event duration or proof of occurrence. | REQUIRED | Already a timeline position; UTC is exchange notation, not event-local context; local zone/place may be unknown. |
| Span | Start/end relationship in one temporal basis; complete measured occupancy is [start,end). | Two repeated daily objects, or equal wall-clock arithmetic across zones. | REQUIRED | Instant overlap only if both boundaries resolvable; calendar/partial spans remain honest about uncertainty. Place may be text-only. |
| All-day | Authored calendar-day occupancy without an intended clock appointment. | 24 elapsed hours, unknown appointment time or midnight event. | REQUIRED | Does not itself assert an event instant. Named-zone day boundaries may be derived for projection only; unresolved place valid. |
| Unspecified time | Clock time not known/supplied, possibly with a known date. | Approximate midnight or all-day occupancy. | REQUIRED | No clock-derived instant; zone optional until projection needs it; unresolved place valid. |
| Estimated time | Approximate intended clock/time endpoint, with estimate explicitly retained. | Unknown time, confirmed scheduled exact time or an invented tolerance. | REQUIRED | May derive an estimated anchor if date/zone interpretation resolves; anchor is not exact/observed time. Place resolution unnecessary. |
| Time window | Permitted/planned interval of possible timing, or an unresolved qualitative phase such as afternoon. | Occupancy for the full window or automatic midpoint appointment. | OPTIONAL, justified by requested flexible/check-in cases | Numeric bounds can map with context; qualitative label alone cannot. No place/provider required. |

No recurrence engine, universal temporal framework, hotel rate period, credential
validity lifecycle or imported-booking workflow is introduced. A known time-only
fragment is preserved incomplete intent, not a new recurring appointment type.

## C. Timezone contract

### Authority and resolution

**PROVISIONAL rules consistent with the fixed preservation constraints:**

- A fixed **civil schedule** claiming a global instant needs full calendar date,
  local clock and accepted IANA zone. The location can remain free text; zone
  evidence need not be a provider match. A place-to-zone suggestion is enrichment
  until accepted/confirmed by a trusted source or explicit user decision.
- Preserve original source date/time, precision and its supplied offset/zone when
  available, even if a source instant also exists. Canonical normalized components
  do not replace the source evidence. Do not invent a local schedule from a display.
- A numeric offset plus local date/time determines an instant for that occurrence.
  It is sufficient for an offset-specified **instant**, but not an IANA civil-time
  rule or future DST behavior. Keep offset/source; do not choose a zone from offset.
- A trustworthy explicit UTC/offset instant remains valid without local zone/place.
  It orders on the timeline, but cannot claim endpoint-local date, hotel nights or
  local-day meaning. An explicit query Day context can display its instant there;
  that display is not recovered original local intent.
- Departure and arrival independently carry local context; equal zones are allowed
  (Nelson/Auckland), different zones are normal (Auckland/Sydney, LA/Auckland).
- Device zone may prefill a **visible draft suggestion**. Persisted truth comes
  from an explicit user/source acceptance, with that provenance; it must never be
  implicitly supplied at Save, changed during travel, or used to backfill history.
  Current financial device-date behavior is outside this rule's change scope.
- DST gaps yield no instant; DST folds yield more than one. Retain intent and require
  source/user disambiguation (e.g. explicit applicable offset/occurrence choice).
  Do not roll forward a nonexistent time or select the first fold automatically.
- Source instant versus supplied civil time/offset/zone disagreement is unresolved
  evidence, not permission to overwrite one. A source-confirmed instant retains
  its authority; inconsistent local claims are flagged pending explicit resolution.
  A civil schedule's calculated instant is derived, not a second independent truth.
- A derived binding needs interpretation/zone-rule provenance sufficient to explain
  conversion and later rule changes. Exact metadata representation and rule-update
  acceptance policy are DEFERRED to compatibility design; no silent rewrite of a
  source-confirmed instant, observed time or history is permitted.

| Required case | Deterministic interpretation |
| --- | --- |
| Activity 15:00 Auckland | Civil local date+15:00+Pacific/Auckland, if those facts are accepted. No conversion until date known; no Google/Apple match required. |
| Hotel check-in 15:00 Nelson | Same IANA zone Pacific/Auckland for the supplied Nelson/NZ scenario, not a new Nelson zone or offset guessed from device. Check-in role separate from stay occupancy/window. |
| Auckland → Sydney | Each end has its own date/time and Pacific/Auckland / Australia/Sydney context. Derive elapsed duration from resulting instants. |
| LA → Auckland/date line | America/Los_Angeles / Pacific/Auckland endpoints; arrival local date may be two dates later while elapsed time is 13 hours in U7. No date-line shortcut or added 24-hour correction. |
| Device zone changes | Saved calendar labels, endpoint zones, source instants and Person set stay identical. An explicitly selected display zone may change only projection/display. |
| Only “7:30 PM”, no place/zone | Normalize clock to 19:30, retain original text/precision; date and zone unknown unless separately supplied. No instant, no automatic Today assignment. Refine same object later. |
| Explicit UTC instant, no local zone | Confirmed-instant interpretation; zone/local date unknown. Preserve source instant and any original offset; local projection requires explicit Day context. |

## D. Temporal modes

These are semantic cases, not eight independent database types. Estimated quality
is a qualifier; same/cross-zone spans share one span concept. Incomplete local
clock intent is supported within local-time intent until date/zone resolves.

### Common sorting and Day rules (PROVISIONAL)

Day output is partitioned by meaning: calendar annotations; all-day occupancy;
timed milestones/spans; flexible candidates; date-known untimed items. Within
timed output, resolved fixed and estimated anchors sort by instant, retaining
estimated status. Windows sort by earliest known bound, without claiming it is
a booked start. Incomplete local clocks have a separate unresolved-context group,
ordered by supplied wall clock only within the same known calendar/context; never
compare that clock as if it were UTC. Qualitative windows/untimed groups preserve
explicit authored order, then stable object ID as tie-breaker. All-day/calendar
entries use authored order/ID, not an invented 00:00 anchor. This deterministic
order is a projection contract, not UI layout or a global priority algorithm.

| Mode / deterministic example | Required information / forbidden assumption | Derived instant? | Day membership and ordering |
| --- | --- | --- | --- |
| Calendar-only: Trip start date 2026-12-16 or day note dated Dec 17 | Valid date label and its role; optional authored context. No occupancy/clock inferred. | No. | Overview/group annotation by label; zone-unresolved annotation cannot claim physical-day interval. Calendar category, authored order/ID. |
| All-day: Routeburn hike Dec 17 in Pacific/Auckland | Date, explicit all-day meaning, accepted Day zone for physical projection. May retain authored day with unresolved zone. | No event appointment; day boundaries derive only when zone known. | Full calendar occupancy on named date; relevant overlap in explicitly chosen other-zone Days labelled as projection. All-day category. |
| Date known/time unknown: Museum Dec 17, time unspecified | Date and explicit unspecified-clock meaning; optional accepted zone/location. Not midnight or full-day occupancy. | No. | Candidate on authored date/context; not occupancy at T. Untimed category, authored order/ID. Unknown zone means grouping-only candidate. |
| Local fixed: Museum Dec 17 10:00 Pacific/Auckland | Local date, clock/precision and accepted zone for resolved form. Time-only or zone-missing intent may be retained incomplete. | Yes if unambiguous; otherwise unavailable. | Point on endpoint-local Day; timed order by instant. Incomplete form remains unresolved-clock candidate; missing date has no Day assignment. |
| Same-zone span: Stay Dec 16 15:00 → Dec 19 10:00 Pacific/Auckland | Role-tagged endpoints; each local context; end convention F. Missing clock is explicit, never midnight. | Both if resolved; partial otherwise. | All named-zone Days intersecting [start,end), plus endpoint milestones; sort by clipped interval start in query Day. |
| Cross-zone span: LA Dec 16 22:00 → Auckland Dec 18 08:00 | Separate endpoint dates/clocks/zones and roles/places. No equal-zone or wall-clock-duration assumption. | Both if resolved. | Departure/arrival endpoint Days plus overlap in explicitly requested transit Day contexts; one object ID in all projections. |
| Estimated: approximately Dec 17 10:00 Auckland | Approximate clock anchor/endpoint with quality marker, date and zone if known; tolerance only if actually supplied. | Estimated anchor when resolvable, not exact fact. | Timed candidate labelled estimated; does not establish exact occupancy at T without justified bounds. |
| Flexible/windowed: Dec 17 afternoon; or explicit 13:00–16:00 Auckland | Date and source phase label, or explicit earliest/latest allowed times with context. No universal afternoon hours, midpoint or full-window occupancy. | Label alone no; bounded window may derive possible interval. | Flexible candidate on matching Day; known bounds sort by earliest allowed time, otherwise authored order/ID. |
| Source-confirmed instant only: 2026-12-17T06:00Z | Trusted instant with provenance; original local zone/date may be unknown. Do not infer zone from device. | Already known. | Membership in explicitly supplied Day context; endpoint-local Day unknown. Timed by instant, labelled source context unresolved where relevant. |

An entirely undated item or time-only fragment remains unscheduled/unassigned to a
calendar Day. It may exist and be refined without provider/network availability;
creation is not gated by completeness of derived scheduling answers.

## E. Unknown / Estimated / All-day

| Meaning | Display semantics, independent of UI wording | Timeline / sorting / later refinement |
| --- | --- | --- |
| UNKNOWN TIME | Show date and clock unspecified; do not show 00:00 or “approximately midnight”. | No anchor/occupancy. Untimed group; same object may acquire explicit clock/zone later. |
| ESTIMATED TIME | Show approximate supplied clock/window and unresolved zone if applicable; preserve estimate/source confidence. | Derivable approximate anchor may sort with timed items but is not a proven exact meeting time. No default tolerance or exact occupancy. |
| ALL-DAY | Show calendar-day meaning, no appointment clock. | Calendar occupancy, not automatically 24 elapsed hours. Day boundaries for projection only; all-day group. |

Midnight is a valid **explicit clock fact**. `00:00` fixed and unknown are different
inputs even if old storage maps both to the same planned_start. All-day can later
be deliberately changed to a timed event with the same identity, but that is an
explicit semantic edit, not enrichment. Unknown → estimated → fixed is refinement
only when supplied evidence/intent supports the transition; no automatic promotion.
Current `is_estimated_time=true` cannot be assumed to prove an approximate known
clock, because the compatibility create sets it on clock absence. [B-T0 C/E]

## F. Span semantics

**PROVISIONAL canonical convention:** resolved occupancy spans are **[start,end)**.
Start is included, end excluded; consecutive spans touching at one instant do not
overlap. Calendar occupancy ranges similarly include start date and exclude end
date. Trip overview end date is inclusive because it is a last-day label, not a
span endpoint; names/roles must make that distinction explicit.

- A complete span requires comparable endpoint instants or a declared calendar
  basis; never compare two local clock strings from different zones.
- End-before-start in instant order is invalid as a resolved span. Retain conflicting
  source evidence as unresolved; no swapping dates, adding a day, or date-line fix.
- Equal start/end has zero occupancy. A deliberately authored point belongs to its
  Day by instant membership; do not silently give a zero span duration. Transport
  with two different endpoints and zero known duration is unresolved/invalid travel
  span evidence, not a believable instantaneous journey. Day-use stay product rules
  are not inferred; a positive same-day interval is temporally representable.
- A missing end is an incomplete span/start milestone, not occupancy until infinity,
  next event, end of Trip or midnight. A missing start/end clock with known date
  is date-bounded uncertainty (G), not an open-ended measured interval.
- Crossing midnight/zone/date line uses the same instant rule. Elapsed duration is
  endInstant−startInstant, independent of endpoint date-label subtraction.
- Approximate endpoints keep their quality; calculated duration is approximate.
  Unknown endpoints yield unknown duration. Tolerance is used only when supplied.
- A time window [earliest,latest) describes possible scheduling, not actual occupancy
  throughout it. Inclusive source deadlines must be retained as that source's
  bound semantics; do not silently recast “arrive by 16:00 inclusive” as an exclusive
  attendance end. Source closure/precision is preserved until explicitly normalized.

For named-zone Day interval **D=[dayStart,nextDayStart)** and complete interval
**S=[s,e)**, positive occupancy overlap means `s < nextDayStart AND e > dayStart`.
Day boundaries are actual civil-date boundaries, not `start+24h`; they can have DST
variation. Zero spans contribute no occupancy. A point/milestone belongs when
`dayStart ≤ instant < nextDayStart`. Arrival/check-out at midnight can therefore
appear as an endpoint milestone on the next Day even when preceding occupancy ends
before that Day. Deduplicate by business object+role, never duplicate persistence.

If a zone/date cannot define a physical Day (historically skipped date or unresolved
boundary), preserve the label and mark physical projection unavailable. Do not
fabricate a 24-hour interval. Exact timezone-library binding is deferred.

## G. Stay semantics

A Stay is one intended accommodation interval at one place with local check-in and
check-out dates/clock knowledge. It is not a full Booking lifecycle and not one
business event per night. Endpoint milestones can be projected from that same Stay;
no separate persisted daily events are required.

For illustrative **2026-12-16 15:00 → 2026-12-19 10:00 Pacific/Auckland**:

- Active measured stay: [Dec 16 15:00, Dec 19 10:00), at the supplied accommodation.
- Check-in/check-out are role-tagged endpoints, not assertions of the Person's
  physical arrival/departure or provider-wide service opening hours.
- Intended nights: calendar nights labelled Dec 16, 17, 18, i.e. 3. These are derived
  from local dates, not floor(elapsedHours/24) or a room-price calculation.
- Measured elapsed span is 67 hours in this example; a DST crossing could differ.
- Day Dec 17/18: active stay/base context throughout each Day; a Museum event may
  coexist. The hotel is a base, not a claim that the Person never left it.
- Day Dec 16: check-in plus post-check-in active span; Dec 19: pre-check-out active
  span plus check-out milestone. End exclusivity does not hide the milestone.

When clocks are unknown, preserve check-in date Dec 16, check-out date Dec 19 and
zone when known. Intended nights remain 16–18. Whole interior dates 17/18 have
planned stay/base coverage; boundary dates have check-in/check-out context with
uncertain exact occupancy. No measured start/end instants or elapsed hours can be
claimed. “Before 10:00” checkout or “from 15:00” check-in is a bound/window only when
source actually says it; never apply hotel-industry defaults to a named property.
A date/zone missing makes that part unresolved, without invalidating the object.

Changing device zone does not change Stay dates or nights. A location correction
needs explicit accepted zone evidence if the prior civil context is no longer
applicable; updating provider enrichment alone cannot rewrite the stay's schedule.

## H. Transport semantics

Activity: **occurs at one place**. Transport: **goes from origin to destination**;
those roles remain distinct even if both use the same provider or timezone.
Transport carries each endpoint's independent place description and temporal
knowledge (date/clock/zone or source instant), plus a span when resolvable.
Unknown destination/place/clock is valid incomplete input and yields explicitly
incomplete transitions, not an invented second endpoint.

Illustrative schedules below are synthetic design examples, **not actual carrier
or Water Taxi timetables**. IANA contexts are stipulated in the examples, not
obtained by geocoding or remote lookup.

| Case | Temporal / spatial meaning |
| --- | --- |
| Air New Zealand Nelson → Auckland | Dec 16 09:00 → 10:25, both Pacific/Auckland; origin Nelson airport text, destination Auckland airport text. 85 elapsed minutes when resolved. Carrier name is metadata, not Place identity. |
| Auckland → Sydney | Dec 16 09:00 Pacific/Auckland → Dec 16 10:30 Australia/Sydney; separate airports. 3h30 elapsed, not 1h30 clock subtraction. |
| Los Angeles → Auckland | Dec 16 22:00 America/Los_Angeles → Dec 18 08:00 Pacific/Auckland; separate airports and local dates. 13 elapsed hours; U7/N explain Day projections. |
| Lake Rotoroa Water Taxi A → B | Origin A jetty and destination B jetty free text; stipulated Pacific/Auckland. Each outbound/return occurrence has its own ID, reversed roles and independent schedule. No recurring-service engine implied. |

Between known departure/arrival instants, expected state is **in transit between
A and B**. It is not a coordinate linearly interpolated between endpoints, an
assertion of presence at origin until arrival, or a map point from live GPS.
Arrival milestone identifies destination context but does not imply remaining
there indefinitely; later occupancy/plan evidence is independent.

Minimum generic transport requires endpoint roles/places and temporal knowledge.
**Route geometry and intermediate-stop infrastructure are DEFERRED**: neither is
needed for these four cases. Supplied intermediate facts may be retained as source
information, but no ordered route or stop engine is designed here. Multiple
explicit legs may be independent occurrences; no automatic splitting required.

## I. Canonical spatial vocabulary

| Concept | Category / meaning | Boundary and optionality |
| --- | --- | --- |
| User-supplied location text | Business intent, e.g. “John's Airbnb”, “A jetty” | Valid independently; keep original source and accepted edits. Need not be globally unique/geocodable. |
| Structured address | Authored business fact if supplied/accepted; optional enrichment if provider-suggested | Preserve which source/acceptance produced it. Parsing a raw address never erases the original. |
| Coordinates | Accepted manual business target, provider enrichment, or observation depending on provenance | Same numeric pair can mean different things. Validate latitude/longitude/range/reference meaning when used; do not merge roles. Accuracy/time belongs to observations. |
| Internal OTR Place reference | Optional internal reusable reference, existing places.id direction | Not required for object creation or proof that two providers/labels identify one physical place. Business object retains its own identity. |
| External provider reference/data | Optional enrichment/cache/display aid | Provider+opaque provider ID names an external record; never OTR object/Person identity or a mandatory creation key. |
| Origin / destination | Business roles on transport endpoint descriptions | Preserve direction and separate source/coordinates/zone evidence; cannot substitute one location text field. |
| Planned location | Intended place/base/transit state for scoped Persons and relevant time | Does not assert actual presence or grant collaboration access. Can remain unresolved free text. |
| Observed/live location | Observation of stated Account/device/subject at an instant with source/accuracy/freshness evidence | Does not edit schedule, address, endpoint or Person identity. “Latest” without age is not “at T”. |

No new global Place registry, required normalized entity or provider equivalence
algorithm. An internal Place may enrich an object, but its mutable shared record
must not silently redefine that object's authored location intent. Historical
observations and source snapshots are not provider-cache replacements.

## J. Free-text / resolved-place boundary

Example: create accommodation “John's Airbnb”, address text “12 Example Rd”, with
no provider match. Save is valid offline. Place, coordinates and zone can be
independently unresolved. Later candidate resolution supplements those facts.

**DECIDED preservation; PROVISIONAL precedence contract:**

1. Retain raw authored/source text and the current accepted location description.
   Provider name/address is attributed enrichment, not an overwrite of “John's Airbnb”.
2. Record conceptual provenance for any usable enrichment: source/provider, input
   it resolves, observation/resolution time, quality/verification and whether accepted.
   Confidence alone is not acceptance; exact stored fields/lifecycle are deferred.
3. Explicit accepted/manual coordinates/address take precedence over conflicting
   provider suggestions **for that same location component**. Original text remains
   available as evidence. This is location-component precedence, not an expected-
   versus-observed location priority algorithm.
4. A user correction changes the current intended target at the existing business
   object/endpoint identity, retaining earlier source/accepted values in history or
   provenance. Old enrichment binds to the old input and must be stale/not silently
   applied to the corrected description. Provider lookup may refresh later.
5. Failure, provider ID removal, stale data or provider change leaves the user fact
   and Trip object valid. Enrichment is marked unavailable/stale, never deletion of
   business intent. No invented coordinates/navigation target from unresolved text.
6. An unaccepted conflicting resolution remains a candidate; ambiguity is explicit.
   No automatic provider switch merges Places or replaces an internal OTR reference.
   A place-resolution result does not implicitly change an accepted event timezone.

Minimum precedence: accepted authored/manual intent > unaccepted provider suggestion;
source/acceptance are explicit when provider data becomes accepted. Two conflicting
accepted facts need explicit resolution, not a fabricated generic ranking. No geocoder,
edit protocol, audit table or conflict framework is specified.

## K. Planned vs observed location

| Situation | Semantics |
| --- | --- |
| Museum on itinerary, Cafe in current phone GPS | Museum remains intended event place; Cafe is an observation with subject/time/accuracy. Disagreement may be shown by a future consumer, never silently edits the event. |
| Hotel as overnight base | Active/base context, compatible with a daytime Museum. Base is not current physical position. |
| Person currently in transport | Resolved plan says in transit between endpoints; GPS may supply an observation. Without GPS/route no intermediate coordinate can be asserted. |
| Yesterday's photo GPS | Historical asset/device observation at takenAt, with unknown Person subject unless evidenced. Not current live position or proof the whole group was there. |
| Manual “I am here” versus “plan to be here” | First is an explicit reported observation, second expected-plan evidence/override. Preserve declared meaning, subject and time scope. Text alone cannot decide which. |

No source overwrites another automatically. Observation freshness and accuracy are
required when claiming relevance to T, but numerical expiry thresholds are DEFERRED.
An Account link to a Person now is not proof of historical observation subject.

## L. Effective-location future contract

**PROVISIONAL decision: separate questions, separate future contracts.**

- **Expected location at T** takes exact `(tripId,TripPersonId)` and an instant,
  authorized plan inputs and their provenance/participation, not an Account UUID
  substituted for a Person. It can return a place candidate, base, in-transit state,
  ambiguity or unknown; free text is a valid result, coordinates optional.
- **Observed device/subject location at T** takes a declared observation subject
  (Account/device or explicitly evidenced Person mapping), instant and authorized
  observation evidence. It answers what was observed, with recorded time, accuracy,
  age and source; no observation gives unknown, not itinerary fallback.
- A combined future view may show both with disagreement. One unqualified
  `resolveEffectiveLocation` must not quietly switch from expectation to GPS. If
  that name is retained, its question must be explicitly fixed to expected location.

Bounded expected-query inputs:

| Input | Permitted contribution | Missing-evidence boundary |
| --- | --- | --- |
| Transport span/endpoints | In-transit state and departure/arrival transitions | Unknown temporal end/zone prevents exact interval; no interpolated coordinates. |
| Fixed event | Intended place and known point/occupancy span for its Person set | A point does not establish indefinite presence. Estimated time produces uncertain relevance. |
| Stay | Active accommodation/base, including date-bounded uncertainty | Base does not defeat a contemporaneous activity; unknown clocks do not prove boundary-time occupancy. |
| Flexible block/window | Possible place/time candidate | Not a chosen appointment or continuous occupancy. |
| Trip destination | Explicitly coarse fallback candidate | Does not resolve city/address/zone/current position automatically. |
| Manual expected-location override | Declared Person/time-scoped planning input | Needs explicit meaning/scope; no implicit GPS/plan mutation. Exact priority policy deferred. |
| Live observation | Separate corroborating/disagreeing evidence | Does not replace expected-plan candidate. Subject, time and freshness must be known. |

Multiple contradictory candidates remain ambiguous unless a future approved priority
rule resolves them. This contract defines inputs and meanings only: no priority
algorithm, resolver, thresholds or tracking implementation.

## M. Trip Person participation semantics

**DECIDED identity:** exact `(tripId,personId)`; personId is `journey_members.id`.
Unlinked Persons are valid. `user_id` remains Actor/link/observation evidence, not
participation identity. All referenced Persons must belong to the exact Trip.
No name/email match, Person-ID replacement or Track A permission change.

**PROVISIONAL object-scope choices:**

| Intent | Canonical meaning |
| --- | --- |
| Whole Trip group | Explicit whole-group intent **plus the resolved Person set at authoring/confirmation**, using Track A's applicable selection observation. No ongoing “all Accounts” rule. |
| Explicit subset | Nonempty exact Person set, e.g. P1/P2; neither all Persons nor access holders inferred. |
| Individual | Explicit subset of one Person; no extra identity model. |
| Unassigned | Explicit not-yet-assigned participation. Empty set does not mean everyone, and unassigned does not mean nobody can ever attend. |

Whole-group intent records which Persons it meant; future Person addition,
inactivation, claim or link cannot silently rewrite already assigned event/stay/
transport scope. Extending that set requires explicit scheduling intent. Later
persistence must distinguish unassigned from an intentionally changed assigned set;
exact transport/versioning and edits are outside B-T1. This simple recorded set avoids
an implicit dynamic-membership schedule engine.

Track A ACTIVE/INACTIVE only controls ordinary **new** participation selection,
not whether past/current object assignments, financial participation or access are
valid. Null/unobserved lifecycle projection is not an invented ACTIVE state.
Selection/read compatibility follows A1-I2A-SPEC I/J; B does not define a new
participation Boolean, roster revision, access grant or command.

Legacy retained rows have nullable user_id and journey_member_id (including both
null), User uniqueness and partial Member uniqueness. A proven same-Trip Member
reference can support canonical participation; User-only or conflicting/empty rows
need explicit evidence. Both-null row is unassigned/ambiguous legacy evidence,
not a new Person and not everyone. Current empty participant table cannot be
backfilled as whole-group. Historical User/Member CASCADE FKs are a compatibility
risk; preserving historical Person relationships is required for later design,
not permission to change FKs or Track A removal policy here. [B-T0 K/E07]

## N. Day semantics

**PROVISIONAL canonical query meaning:** `Trip + Person + Local Date` is shorthand
for exact Trip/Person plus **explicit Day context {calendarDate,IANA zone}** when
asking about physical time overlap. A date string alone cannot distinguish Dec 17
in LA from Dec 17 in Auckland. Required context may be selected from accepted event/
endpoint/stay facts or explicitly provided by the caller; it is never device-derived
at projection time. Where unavailable, return authored grouping with unresolved
physical context, not a falsely complete Day.

This is query context, not a persisted global Trip timezone or a new Day entity.
The same calendar label may have several named-zone contexts in one Trip. Day
overlap uses F. Object-local date labels stay alongside the query Day context;
conversion never rewrites endpoint dates.

| Object / period | Local Day context and membership |
| --- | --- |
| Stationary fixed activity | Accepted event zone/date for native Day; explicit other-zone query may include by instant membership with original local label retained. Unknown zone means grouping only. |
| Stay | Accepted accommodation zone; full interior nights/dates and uncertain boundary roles per G. Other-zone physical overlap only when measured span resolves. |
| Departure | Origin endpoint's accepted zone/date; departure milestone. |
| Arrival | Destination endpoint's accepted zone/date; arrival milestone, even at exclusive span end. |
| In transit | Any explicitly requested Day context intersects the measured transport span; label transit and retain both endpoint contexts. Do not invent aircraft/ocean timezone, route position or Person's current zone. |
| All-day | Authored date/context occupancy. Without context only calendar grouping; with context physical Day interval is derivable for overlap, without creating a clock appointment. |
| Unknown clock / qualitative window | Candidate on authored date/context, not exact T occupancy. If date missing, no Day association; if zone missing, physical conversion unavailable. |

For U7, LA Dec 16 22:00 → Auckland Dec 18 08:00 spans
`2026-12-17T06:00Z` to `2026-12-17T19:00Z`:

- **LA Dec 16:** departure + transit occupancy before LA midnight.
- **Auckland Dec 18:** transit occupancy until 08:00 + arrival milestone.
- **LA Dec 17:** transit overlap until 11:00, if that Day context is requested.
- **Auckland Dec 17:** transit overlap from 19:00, if that Day context is requested.

No local Dec 17 endpoint is invented. A derived travel overview may show endpoint
Days and explicitly selected transit Days; choosing that overview's contextual
sequence/UI is DEFERRED. There is no universally correct one-zone flattened trip
calendar implied here. All projections carry the same object identity/role and
must not be counted as duplicate bookings, occurrences or financial inputs.

DST Day can be 23/25 hours; missing/skipped/ambiguous civil boundaries require
explicit timezone interpretation. Date-line travel duration is calculated from
instants, never by counting displayed Days.

## O. trip_days role

**PROVISIONAL:** retain `trip_days` as user-authored calendar grouping/annotation:
existing day_date, title, notes and authored order are useful. A day link can be an
explicit organizational anchor. A grouping/projection aid may annotate the results
of a separately correct Day query.

It must **not** be the only scheduling authority, force every object onto exactly
one date, determine timezone from the device, manufacture all-day meaning, clip a
Stay or replace transport endpoint dates. A span may project onto many Days without
new business rows. Existing unique `(trip_id,day_date)` cannot distinguish two zoned
Day contexts with the same date label; keep its authored annotation separate from
physical Day identity. Whether future annotations need explicit context extension
is a B-T2 compatibility question, not SQL decided here. [B-T0 E/E01]

## P. Legacy ambiguous-time policy

Minimum conceptual evidence dispositions; these are not mandatory enums/tables.
Estimate/unspecified/all-day is a separate intent quality, not inferred from these.

| Disposition | Admission evidence | Safe interpretation |
| --- | --- | --- |
| Legacy-assumed-UTC | Proven writer/source mapping appended Z to unzoned input | Preserve stored instant and original input if recoverable, but do not certify it as correct travel instant or local schedule. Compatibility display stays attributable. |
| Confirmed instant | Trusted explicit source/user confirmation of timeline value, not just column type or suffix Z | Timeline use valid; local date/zone may remain unknown. |
| Known local time+zone | Proven/accepted date, clock and IANA context, including ambiguity evidence where needed | Civil schedule interpretation valid; derive only with its declared quality/rule evidence. |
| Unknown provenance | Neither of the above is proven, or evidence conflicts | Preserve literal/raw storage; no automatic semantic upgrade, shift or canonical Day assertion. |

A row may retain both confirmed instant and supplied civil evidence; consistency
must be checked rather than forcing mutually exclusive labels. Trusted civil
confirmation can refine legacy intent without replacing object ID, but changes to
stored schedules need a separately approved correction/migration process.

**DECIDED:** `planned_start ...Z`, `is_estimated_time`, event_type or nullable day link
alone cannot prove historical intent. An estimated midnight produced from null time
is not evidence of an approximate midnight appointment. No bulk “remove Z”, apply
current device offset, infer from Trip destination, or convert all old data using a
single Trip zone. Missing source clock/place/zone may be irrecoverable.

Provenance is necessary for safe future compatibility: known writer/version,
original input/precision, declared basis, supplied versus derived instant, accepted
zone/offset and source/confirmation evidence. Require only information that actually
exists; record unknown otherwise. B-T2 must map availability, preservation and
ambiguity before any executable migration/backfill. Financial rows are excluded.

## Q. Canonical domain shapes

Language-neutral semantic sketches, **not wire, database or implementation types**.
No names imply new persistence/registry. Existing business object IDs remain stable.

```text
Temporal intent:
  calendar(date, role)
  all-day(date, optional accepted day-zone)
  unspecified(optional date, optional accepted zone)
  local-time(optional date, clock, optional accepted zone, exact-or-estimated)
  instant(source-confirmed timeline value, optional supplied local context)
  span(start endpoint knowledge, end endpoint knowledge)
  window(optional date/context, supplied bounds OR qualitative source label)

Endpoint knowledge:
  supplied local date/clock/zone (each explicitly known or unknown)
  OR source-confirmed instant with any supplied local context retained
  exact-or-estimated quality and source/interpretation evidence
  derived instant only when resolvable; never another independently editable truth

Place description:
  authored label/address text, if supplied (original source preserved)
  optional accepted structured address/manual coordinates, with provenance
  optional internal OTR Place reference
  optional provider enrichment bound to the input it resolves, with provenance/status
  explicit unresolved components; no fabricated name/address/coordinates

Participation:
  explicit Persons (tripId + Person IDs), with whole-group intent if declared
  OR explicitly unassigned

Spatial intent on an object:
  single place OR origin/destination role-tagged endpoints OR unresolved
  Stay uses one place/base; transport endpoints each pair place + time knowledge
```

Every source fact retains its supplied precision and meaning; exact original
provider/import text may be preserved as source evidence without designing Import.
No combination requires provider lookup, exact timestamps or linked Account merely
to retain authored intent. Examples use synthetic P1/P2 Trip-scoped Person IDs:

| Requested shape | Minimal semantic expression |
| --- | --- |
| A. Museum 10:00 Auckland | Existing object M; local-time(2026-12-17,10:00,Pacific/Auckland,exact), single-place “Museum”, explicit {P1,P2}. |
| B. All-day hiking day | H; all-day(Dec 17,Pacific/Auckland), single-place “Routeburn hike” text, explicit whole-group {P1,P2}. No route geometry. |
| C. Flexible afternoon | F; window(Dec 17,qualitative “afternoon”, context unresolved), place “somewhere” unresolved, unassigned. No invented numeric hours. |
| D. Hotel Dec 16–19 | S; span(check-in Dec 16 15:00 Pacific/Auckland, check-out Dec 19 10:00 same zone), single-place hotel text, explicit {P1,P2}; nights/milestones derived. |
| E. Nelson → Auckland | T1; origin Nelson airport + Dec 16 09:00 Pacific/Auckland; destination Auckland airport + Dec 16 10:25 same zone; explicit {P1}. |
| F. LA → Auckland | T2; origin LAX text + Dec 16 22:00 America/Los_Angeles; destination Auckland airport text + Dec 18 08:00 Pacific/Auckland; explicit {P1}. |
| G. Water Taxi outbound/return | W1 A→B Dec 17 09:00–09:30; W2 B→A Dec 17 16:00–16:30; stipulated Pacific/Auckland; separate occurrence IDs, explicit {P1,P2}. No shared recurrence identity required. |

Source/provenance is conceptual evidence on these values, not a generic entity or
additional abstraction layer. A later implementation should reuse narrow existing
patterns; these sketches are insufficient to authorize persistence changes.

## R. Existing-schema compatibility map

CURRENT schema facts from B-T0; classifications apply to semantic use, not approval
to apply SQL. CAN EXTEND means a design candidate; exact persistence is B-T2 work.

| Existing primitive / field category | Classification | Reuse limit / required preservation |
| --- | --- | --- |
| trips.id; journey_members.id | CAN REUSE AS-IS | Fixed root/Person identities, no renaming/remapping. |
| trips.start_date/end_date | CAN REUSE AS-IS as calendar labels | Proposed overview inclusivity/validation needs later adoption; no UTC schedule or enclosing instant range inferred. |
| itinerary_events id/trip_id/title/description/event_type/status | CAN REUSE AS-IS within declared meanings | Identity/content/category useful; cancelled/completed/skipped remain existing statuses. No Booking lifecycle inferred. |
| Event planned_start/planned_end | CAN EXTEND for confirmed/derived instants; SEMANTICALLY UNSAFE as sole intent | Need basis/local context/quality/provenance; legacy classification before canonical use. An instant column cannot preserve original civil schedule. |
| Event is_estimated_time/date_confidence/time_confidence | LEGACY COMPATIBILITY ONLY for automatic mapping | Existing flag conflates null clock with estimate; confidence has unproven scale. CAN EXTEND after explicit semantic mapping, not evidence of all-day or uncertainty bounds. |
| Event trip_day_id/reservation_id/order_index | CAN REUSE AS-IS for links/authored order | Links do not replace time or declare one-day occupancy. Source IDs/projection identity unchanged. |
| Reservation id/trip_id/type/provider/title/confirmation | CAN REUSE AS-IS | Booking metadata/category, not provider Place or temporal policy. |
| Reservation starts_at/ends_at | CAN EXTEND | Useful instant span capacity; lacking endpoint local context, estimate/window semantics and transport places. Date-only Stay clocks cannot be invented. |
| Event/reservation single location fields | CAN EXTEND for activity/Stay; SEMANTICALLY UNSAFE as transport endpoints | Retain user text, accepted/manual target and enrichment separately; origin/destination absent. |
| trip_days day_date/title/notes/order_index and unique date | CAN REUSE AS-IS grouping; CAN EXTEND contextual annotations | Not zoned Day identity or span authority. Same label may correspond to two Day contexts. |
| places.id, address, coordinates | CAN REUSE AS-IS optional reference/data capacity | Provider-independent equivalence and whether facts are accepted not proven merely by columns. |
| places provider/provider_place_id, raw_query/raw_response, verification metadata | CAN EXTEND; UNKNOWN active quality/freshness semantics | Optional cache/enrichment/provenance, no required provider identity. Deduplication includes provider, not physical-place equivalence. |
| location_status/manual_location/confidence/geocode timestamps/errors | CAN EXTEND | Useful unresolved/manual/enrichment states; need input binding/accepted-intent preservation. No geocoder design. |
| Participant journey_member_id | CAN REUSE AS-IS for proven same-Trip Person references | Partial per-parent Member uniqueness useful; user/both-null/Trip scope consistency unresolved. |
| Participant user_id/nullable identities/empty table | LEGACY COMPATIBILITY ONLY; SEMANTICALLY UNSAFE to infer canonical scope | Preserve source; no Account-as-Person or empty=everyone. Explicit scope mapping needed. |
| Participant Member/User CASCADE FKs | SEMANTICALLY UNSAFE for historical retention | Flag compatibility risk; no B-track FK/lifecycle redesign or migration here. |
| journey_live_locations, capture/media time/GPS | CAN REUSE AS-IS observation meaning; CAN EXTEND evidence linkage | Account/asset observation distinct from expected Person location; no new tracking/sync. |
| journey_map_objects route_point/source metadata | UNKNOWN as route authority | Retain as existing spatial/display capacity; no canonical route inferred. |
| Local scheduledDate/startTime and v1 concatenation | LEGACY COMPATIBILITY ONLY | Preserve existing flow; future canonical projection needs richer semantics. No current fix. |
| Financial date/cutoff/Review source fields | CAN REUSE AS-IS only in financial domain | Not reused as Trip scheduling truth, no reinterpretation/cross-domain coupling. |

Useful storage capacity is established; irreconcilable schema contradiction was
not found. Additive semantic compatibility still requires separate design review.
No SQL, migration identifier, DTO version or server-field proposal is included.

## S. Day-projection readiness contract

A future Day engine may claim a correct result only when it can:

1. Identify exact authorized Trip/Person, independent of Account/access, with stable
   Person references and explicit assigned/unassigned/whole-group scope evidence.
2. Distinguish authored dates, all-day, unspecified clocks, fixed/estimated clocks,
   windows, confirmed instants and complete/incomplete spans without guessing.
3. Obtain explicit Day date/zone or declare only grouping/unresolved context; resolve
   endpoint zones/ambiguity with provenance, never device/default-Trip timezone.
4. Preserve input/source precision and use valid instant comparisons plus [s,e)
   overlap and separate point/milestone membership, including midnight and DST.
5. Derive Stay nights/interior-base/boundary roles, not duplicate daily business rows.
6. Keep transport origin/destination+endpoint time contexts, cross-date-line duration,
   in-transit semantics and shared object identity across multiple Days.
7. Return location text when valid, optional accepted coordinates/enrichment with
   provenance, and uncertainty/ambiguity when navigation/physical context is missing.
8. Keep flexible/estimated candidates distinct from certain occupancy; sort by D's
   deterministic rules without pretending unknown clock is 00:00.
9. Exclude lifecycle states explicitly known to remove a plan from active expectation
   according to their existing meaning; no new Booking cancellation/status policy.
   Preserve historical/cancelled evidence for its proper query purpose.
10. Preserve Account-scoped offline data and protected intent; no claim of complete
    Day from a lossy/incomplete itinerary cache. No sync protocol designed here.
11. Keep expected, base, transit and observed answers distinct, with no invented
    interpolation or automatic overwrite and no implicit Person-observation mapping.
12. Apply legacy evidence classification and financial non-interference; mark partial
    answer/unknown rather than silently filling missing context.

These are semantic acceptance requirements, not implemented engine tests. B-T0
shows current Mobile cannot meet them. A complete Day query can contain explicit
uncertainty; correct does not mean every place/time is known.

## T. Financial non-interference

**DECIDED and unchanged:**

- `economic_date` remains the explicitly attributed financial calendar day and its
  existing provenance/correction rules. Trip local dates/zones cannot derive it.
- Financial `occurred_at` retains occurrence/compatibility/order meaning, including
  current date-only encodings and proven import precision. No Trip migration shifts it.
- Settlement `throughTimestamp`, Preview `sourceAsOf`, frozen cutoffs, inputs and
  revision/valuation bindings retain their exact financial timeline meaning.
- FX effective/reference dates and accepted valuation snapshots remain existing
  financial facts. Stay nights, flight arrival date or device zone do not alter rates.
- Review financial fingerprints and Settlement source digests exclude new Trip
  temporal/spatial/participation data unless separately approved; no full-object
  schema spread that accidentally changes financial equality.
- Person participation changes do not rewrite financial counterparties, snapshots,
  balances, link/access or history, as Track A already requires.

A later calendar-validity or arithmetic helper may be shared only where date-label
semantics match. Sharing a utility does not share date authority, default zone,
cutoff policy or source provenance. No financial backfill, frozen-history rewrite,
recalculation or cross-domain correction is part of B-T1 or automatically B-T2.
Evidence: B-T0 B/D/E12–E15; A1-I2A-SPEC O; existing Ledger date/cutoff contracts.

## U. Golden scenarios

All examples use synthetic dates in **2026**, exact existing Trip scope and Person
identifiers P1/P2. Supplied labels/zone facts are scenario inputs, not provider facts
or live schedules. Unknowns are deliberate, not blockers to retaining the object.

| # | Scenario / canonical temporal interpretation | Spatial interpretation | Person scope | Day behavior | Information still unknown |
| --- | --- | --- | --- | --- | --- |
| 1 | Auckland Museum Dec 17 10:00 Pacific/Auckland, fixed point → Dec 16 21:00Z. | Single “Museum” free-text place. | Explicit {P1,P2}. | Dec 17 Auckland timed point; duration/continued occupancy not inferred. | Address, provider, coordinates, end/duration absent. |
| 2 | All-day Routeburn hike Dec 17, explicit Pacific/Auckland calendar occupancy. | “Routeburn hike” valid place text, no route required. | Explicit whole-group intent with recorded {P1,P2}. | Dec 17 Auckland all-day; no clock appointment or automatic 24h duration. | Actual start/end, route, observations and coordinates absent. |
| 3 | “Visit somewhere in the afternoon”, Dec 17; qualitative window only, no numeric hours/zone. | Location unresolved; source wording retained. | Unassigned. | Authored Dec 17 flexible candidate, physical context unresolved; no instant or occupancy-at-T. | Persons, place, zone, numeric bounds. |
| 4 | Hotel Dec 16 15:00 → Dec 19 10:00 Pacific/Auckland, one [s,e) Stay. 3 nights, 67 elapsed hours. | One hotel/base, not daily cloned locations. | Explicit {P1,P2}. | Dec 17/18 interior base; check-in Dec 16 and checkout Dec 19 milestones. Clock omission variant retains dates/nights with uncertain boundary occupancy. | Actual attendance, service-window policy, property resolution. |
| 5 | Nelson Dec 16 09:00 → Auckland 10:25, Pacific/Auckland both ends. Dec 15 20:00Z → 21:25Z, 85 min. | Origin Nelson airport, destination Auckland airport; carrier Air New Zealand metadata. | Explicit {P1}. | Departure/arrival Dec 16 Auckland-context Day; interval+endpoint roles, one object. | Carrier timetable, flight number, coordinates/provider identity. |
| 6 | Auckland Dec 16 09:00 Pacific/Auckland → Sydney Dec 16 10:30 Australia/Sydney. Dec 15 20:00Z → 23:30Z, 3h30. | Independent origin/destination airports. | Explicit {P1,P2}. | Each endpoint's Dec 16 Day; selected-zone transit overlap computed from instants. | Real flight details and route geometry. |
| 7 | LA Dec 16 22:00 America/Los_Angeles → Auckland Dec 18 08:00 Pacific/Auckland. Dec 17 06:00Z → 19:00Z, 13h. | Independent LAX/Auckland endpoints; in-transit state between them. | Explicit {P1}. | Departure LA Dec 16, arrival Auckland Dec 18; transit Days per N, no artificial added duration. | Actual route/current coordinates, carrier details. |
| 8 | Rotoroa Water Taxi W1 Dec 17 09:00→09:30, W2 16:00→16:30, stipulated Pacific/Auckland. | W1 A→B; W2 B→A; two occurrences and IDs. | Explicit {P1,P2} per occurrence. | Both on Dec 17 Auckland, each independent timed interval/roles. Return not recurrence or one all-day occupied taxi span. | Real timetable, dock coordinates, provider/service metadata. |
| 9 | “John's Airbnb”, “12 Example Rd”; intended check-in Dec 16/check-out Dec 19, clocks/zone unknown. | Valid authored name/address, no provider required. | Explicit {P1,P2}. | Date-grouped Stay/night intent; no physical Day occupancy conversion until context known. | Clock/zone, resolved address/coordinates. |
| 10 | Later provider resolution for scenario 9; temporal intent stays identical. | Supplement with attributed candidate provider record/coordinates bound to original input; text and object identity retained. | Same {P1,P2}. | No automatic date/zone/day rewrite. Accepted zone, if separately supplied, permits explicit refinement. | Candidate correctness, freshness, acceptance/zone unless separately evidenced. |
| 11 | Museum plan fixed at T; phone observation at Cafe at recorded T. | Two evidence sources, no plan overwrite. | Plan {P1}; GPS Account/device association to P1 only if proven. | Day retains planned event; observed query independently returns observation/age/accuracy. | True Person presence, observation link/accuracy/freshness as applicable. |
| 12 | Scenario 7 transport explicitly includes P1, excludes P2 by assigned subset. | Same endpoints, no whole-group assumption. | {P1} only; P2 remains valid Trip Person. | P1 Day includes flight; P2 Day does not acquire it from Account/Trip membership. | P2's actual/expected location unless other evidence exists. |
| 13 | Same scenario 7 object projected in multiple contexts. | No endpoint duplication or interpolated position. | Same {P1}. | LA Dec 16 departure; Auckland Dec 18 arrival; optional LA Dec 17/Auckland Dec 17 transit overlaps. Same identity, role-labelled projections. | Which additional transit context a future overview chooses; no guessed onboard zone. |
| 14 | Device changes Auckland → Sydney → LA while scenario 7 and Stay remain saved. | Places, endpoint roles and source/enrichment evidence unchanged. | Same recorded sets. | Explicit Day queries unchanged; only an explicitly changed display/query context changes projection. | Device observation relevance; no schedule re-interpretation. |

Local standard-library verification used Python `datetime`/`zoneinfo`, no network:
all listed UTC conversions, Stay 67h and 3 date nights, Nelson 85min, Auckland/Sydney
3h30 and LA/Auckland 13h were checked. Additional diagnostic confirmed Auckland
2026-09-27 02:30 has no valid instant and LA 2026-11-01 01:30 has two. They support
C's gap/fold rule, not a chosen automatic resolution. Exact timezone-rule data
version and future application library are not selected by this check.

## V. Risks / unknowns

| Risk / unknown | Boundary / status |
| --- | --- |
| Biggest risk: historical planned_start intent cannot be recovered from Z alone | UNKNOWN source availability; DECIDED no silent reinterpretation. B-T2 must preserve evidence and unresolved cases, not pretend all rows can be upgraded. |
| Future timezone-rule changes and source-instant/civil disagreement | DEFERRED exact provenance binding/update workflow; accepted source facts retained, no automatic rewrite. |
| Day context with skipped date or ambiguous boundary | PROVISIONAL unavailable physical interval until valid interpretation; library mechanics deferred. |
| Qualitative “afternoon” has no universal numeric bounds | DECIDED retain label; bounds unknown until supplied, no locale heuristic becomes truth. |
| Whole-group authored roster and lifecycle observation freshness | PROVISIONAL explicit recorded Person set; projection/convergence from Track A remains its authority, not B's new identity/access policy. |
| Provider equivalence, geocode freshness and ambiguous addresses | UNKNOWN current runtime behavior; optional enrichment preserved; implementation deferred. |
| Expected candidates conflict or live evidence is stale | DEFERRED priority/freshness algorithm; separate questions and uncertainty already defined. |
| Current participant nulls/dual IDs and CASCADE history loss | Existing compatibility risk; no Person inference/migration or access change in B-T1. |
| Lossy local itinerary / fake-only entry / no pull | B-T0 current fact; complete semantic design is not implementation readiness. |
| Track A baseline manifest gate | Separate committed blocker; no retained lifecycle implementation. B semantic design does not require changing Person identity or resolving that gate. |
| Booking service/business policy | Deliberately not inferred: cancellation, guaranteed room access, day-use rules, pricing and lifecycle are out of scope. Temporal input and uncertainty remain expressible without deciding them. |
| Live/deployed drift and external legacy writer behavior | UNKNOWN; no remote or Production evidence sought. Repository storage capacity is not deployed semantic compliance. |

No stop condition requires a guessed decision, implementation, remote data or Track A
change to complete this bounded contract. Uncertainty is represented explicitly.
If future persistence cannot preserve the fixed constraints or requires undecided
Booking lifecycle policy, stop for the affected decision; do not guess migrations.

Non-goals: Booking lifecycle, Credential, Import workflow, Pool, Flexible Block
product UX, Day Feed/map UI, routing/geocoder/tracking/navigation, sync protocol,
conflict-resolution framework, recurrence, Trip-zone settings UI and Track A member/
access lifecycle. No ADR/handoff or other document is edited under this one-file task.

## W. Recommended B-T2 boundary

**Recommendation only, after B-T1 review and explicit authorization:** B-T2
**persistence and compatibility preflight** for the accepted semantic contract.
Map information requirements against event/reservation/day/place/participant and
Mobile representations; specify minimal lossless preservation, provenance and legacy
classification, source authority and exact date/span/endpoint checks. Define what
remains unavailable for old clients and incomplete historical rows.

Keep stable root/Person IDs and financial facts. Coordinate existing Track A
participation projection rather than redefining it; treat its baseline manifest
blocker separately. Choose the smallest representation that preserves approved
semantics; no global temporal engine, provider registry or new sync infrastructure
by default. Any eventual executable migration/code work requires its own authorized
slice and validation. **B-T2 is not begun by this contract.**

## X. Acceptance matrix

PASS means the design answers with explicit rules/examples and bounded unknowns.
All new semantic choices remain subject to human review, separate from coverage.

| Criterion | Evidence | Result |
| --- | --- | --- |
| Calendar date semantics defined | A2/B/D; overview inclusive labels, no instant | PASS |
| Wall-clock semantics defined | B/C/D; civil intent and incomplete time-only source | PASS |
| Instant semantics defined | B/C/D/P; confirmed versus derived distinction | PASS |
| Timezone requirements defined | C; IANA/offset/device/gap/fold/source cases A–G | PASS |
| Cross-zone endpoint semantics defined | C/H/N/U6–7; independent zones/date labels | PASS |
| All-day defined | B/D/E/N/U2; calendar occupancy, no fabricated appointment | PASS |
| Unknown time defined | B/D/E/G; no midnight, same-ID refinement | PASS |
| Estimated time defined | B/D/E/F; approximate anchor, no invented tolerance | PASS |
| Span boundary semantics defined | F; [s,e), point membership, incomplete/invalid spans | PASS |
| Multi-day stay semantics defined | G/U4; one Stay, nights, interior/boundary knowledge | PASS |
| Transport origin/destination defined | H/I/Q/U5–8; two independent endpoint roles | PASS |
| Free-text location remains valid | I/J/U9; no matching gate | PASS |
| Provider enrichment remains optional | I/J/U10; failure/disappearance preserves object | PASS |
| User-entered location provenance preserved | J/P/Q; raw intent, accepted edits and input-bound enrichment | PASS |
| Planned location separated from observed location | K/L/U11; no automatic overwrite | PASS |
| Effective-location inputs bounded | L; separate expected/observed questions, no priority engine | PASS |
| Trip Person reference semantics defined | M; exact existing Trip/Member identity, no Account substitution | PASS |
| Whole-group/subset/individual semantics addressed | M/Q/U12; explicit recorded set, explicit unassigned | PASS |
| Local Day meaning defined | N; date+zone query context, authored grouping if unresolved | PASS |
| Cross-date-line Day behavior defined | N/U7/U13; endpoint/transit projections, same ID | PASS |
| trip_days future role defined | O/R; annotation/grouping, not sole time authority | PASS |
| Legacy Z-concatenated rows handled without silent reinterpretation | P/V; minimal evidence dispositions, no backfill | PASS |
| Minimal domain shapes proposed | Q; language-neutral values, no wire/SQL types | PASS |
| Existing server primitives mapped | R; reuse/extend/unsafe/legacy/unknown with bounds | PASS |
| Financial semantics preserved | T; dates/cutoffs/FX/fingerprints/history unchanged | PASS |
| 14 golden scenarios resolved | U1–14; temporal/spatial/Person/Day/unknowns | PASS |
| No Track A model changed | M/T; existing identity/lifecycle authority retained; Git scope | PASS |
| No source/schema/test/config modified | Git: only this contract document | PASS |
| No migration created/applied | No SQL/migration/database command executed | PASS |
| No remote access/mutation | Local source/files and standard-library date checks only | PASS |

Document verification PASS: all 24 A–X sections, 30 required criteria, 14 golden
scenario rows and 16 full file references checked. Local standard-library assertions
passed for 8 UTC conversions, 4 elapsed durations, 3 Stay nights, 2 DST gap/fold
cases and 4 date-line Day overlaps. New-file whitespace check has no diagnostics;
final Git status contains only this document, with branch/HEAD unchanged. No
application tests, database replay or remote validation were run for this design.

Required coverage: **30 PASS / 0 PENDING / 0 BLOCKED**. Separate gate:
**human review PENDING**. No implementation acceptance or deployment claimed.

Only file changed:
`docs/architecture/TRIP_CANONICAL_B_T1_TEMPORAL_SPATIAL_CONTRACT.md`.
No commit requested or created for B-T1.

Production accessed: **NO**. Hosted Dev accessed/mutated: **NO**.
Remote accessed: **NO**. Migration created/applied: **NO**.
Application code changed: **NO**. Sibling worktree modified: **NO**.

**B-T1 CONTRACT COMPLETE — REVIEW PENDING. STOP.**
