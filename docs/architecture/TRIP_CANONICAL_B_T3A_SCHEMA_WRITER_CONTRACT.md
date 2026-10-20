# Trip Canonical Track B — B-T3A Exact Schema & Writer Compatibility Contract

- Status: **B-T3A CONTRACT COMPLETE — REVIEW PENDING**.
- Date: 2026-10-03 (Pacific/Auckland).
- Working directory: `/Users/xoery/Project/otr-mobile-temporal`.
- Branch: `trip/temporal`.
- Baseline: `0191f1e70b5df658d035cc127751656dd043740a`; startup clean.
- Only this document changes. No SQL, migration, code, remote access or deployment.

CURRENT describes repository source, not live databases. PROPOSED below is an
exact logical persistence/guard contract for review, not implementation approval.
B-T1 semantics and B-T2's selected direction govern it. PASS means design coverage.
Names and physical types are specified in prose/tables; none is executable DDL.

Baseline instructions/current handoff and required architecture/data/API/offline,
product/environment/legacy-audit documents remain applicable. No legacy checkout
was opened. B-T0/B-T1/B-T2, A1-I2A schema/report and C-I1 were consulted. New baseline
includes `fb8a58a` participation persistence and integrated C-I1; B-T2's old blocked
manifest and absent-C statements are historical. No merge/rebase performed.

| Evidence | Source / exact scope |
| --- | --- |
| E1 | `supabase/migrations/20260910000100_canonical_production_baseline.sql`: four itinerary tables 278–377; checks/FKs 1148–1163/1320–1336; indexes 1472–1489; participant permission helpers 1791/1808; removal RPC 2335–2410; RLS 2876–2998; broad table grants 3922–3924. |
| E2 | `supabase/migrations/20260910000200_canonical_security_hardening.sql`: definer EXECUTE revocation/allowlist, including participant helpers and remove_journey_member; no canonical itinerary guard. |
| E3 | `backend/src/supabaseGateway.ts`: createSupabaseDevGateway constructs secret-key service client; findOne/createItineraryItem 616/1659–1690; only located runtime itinerary table insert. `backend/src/app.ts:createEntity`: authorization, deterministic ID, existing-row replay. |
| E4 | `src/data/api/devSyncContracts.ts`; `src/data/sync/devCreateTransports.ts`; `src/domain/itinerary/types.ts`; `src/data/repositories/itineraryRepository.ts`; `src/data/sync/itinerarySyncWorker.ts`: narrow legacy create/local queue only. |
| E5 | `backend/src/app.test.ts`: in-memory itinerary create double; `src/data/sync/devCreateTransports.test.ts`, repository/worker tests: local/mock creates, no rich writer. `supabase/seed.sql` and `supabase/tests/rls_matrix.test.sql`: ratings fixture, not schedule/participant writes. |
| E6 | `supabase/migrations/20261003000100_trip_person_participation.sql`; `docs/architecture/TRIP_CANONICAL_A1_I2A_REPORT.md`: protected lifecycle pair and reserved NOLOGIN role, no enabled lifecycle command. `src/data/db/migrations.ts`: local 42 pair; A1-I2A unchanged. |
| E7 | `docs/architecture/TRIP_CANONICAL_B_T1_TEMPORAL_SPATIAL_CONTRACT.md`; `docs/architecture/TRIP_CANONICAL_B_T2_PERSISTENCE_PREFLIGHT.md`: source facts, uncertainty, Day, Stay, endpoint and financial boundaries. |
| E8 | `docs/architecture/TRIP_CANONICAL_C_I1_SOURCE_PROVENANCE_CONTRACT.md`: H/I field evidence, M confirmation/replay, AB opaque Track B ownership. C's historical unavailable-B statement does not define a competing schema. |

## A. Executive contract

1. Extend `itinerary_events` at its existing ID. New schedules, including one
   Stay span, live here. Reservations remain unchanged commercial/legacy evidence.
2. Add explicit nullable-on-legacy version, shape, boundary component families,
   provenance bindings and real event aggregate revision. No semantic defaults.
3. Add only `itinerary_transport_endpoints`, keyed by event+ORIGIN/DESTINATION.
   Each unknown end still has its own row. No generic parent or route/stop system.
4. Keep planned_start/end as exactly defined normalized slots, D. Source-confirmed
   instant differs from a civil-derived instant; unresolved civil input yields null.
5. Use root/endpoint queryable spatial components; candidates never replace
   accepted coordinates/address/text. Provider and Place are optional references.
6. Choose **hybrid database guards + private narrow writer capability**. Ordinary
   legacy/service-role DML cannot mutate/adopt canonical rows. No caller-set flag
   authorizes rich writes. Reserve the identity with commands disabled initially.
7. Parent revision owns all semantic concurrency. Cache refresh alone is not a
   semantic edit. No coupling to journey_members.participation_revision.
8. First implementation is one protected additive server foundation, not canonical
   commands, local migration or activation. Later adapters/participant compatibility
   and lossless SQLite must pass before canonical writing is enabled.

## B. Exact field model

### Catalog conventions

All **new parent fields are nullable, default absent**, on legacy rows. They are
not populated by migration. Canonical rows are those with temporal_contract_version
=1. Unknown is an explicit canonical quality, not a null marker. Proposed enums
are text with bounded value validation; no PostgreSQL enum type required. Legacy
root timestamp/location/status fields retain existing physical definitions/defaults.

Every catalog row specifies its complete concrete field(s), PostgreSQL type,
meaning/authority and canonical combination. **W** means ordinary old writers must
leave it absent on a legacy insert, preserve absence on legacy updates and cannot
write it or a canonical aggregate. **L** means SQLite mirrors the exact same value
under the identical snake_case name: date/time/UUID/timestamp as canonical TEXT,
safe integers as INTEGER, coordinates as REAL, JSON provenance as validated TEXT.
Optional numeric candidate_confidence mirrors as canonical decimal TEXT, avoiding
rounding a PostgreSQL numeric through JavaScript/SQLite floating-point conversion.
No lossy DTO renaming changes meaning. Catalog W/L applies to every field below
unless a row explicitly says existing compatibility, cache or identity.

No giant temporal/spatial JSON. Bounded provenance maps contain opaque evidence
references only, never core date/time/zone/coordinate values. C defines their
admission/immutable binding; rich evidence bodies/history stay Track C/domain-owned.

### Parent additions and retained slots

| Exact field(s) | Type / purpose / authority | Canonical requirements; legacy / writer / local |
| --- | --- | --- |
| temporal_contract_version | smallint; interpreted contract version, authoritative discriminator | Exactly 1 for adopted/new canonical; null legacy. W/L. Other versions unsupported, never fallback to legacy. |
| temporal_shape | text; calendar/point/occupancy/transport/window intent | C vocabulary; required with version. W/L. |
| semantic_revision | bigint, safe integer 1–9,007,199,254,740,991; aggregate CAS | New/adopted canonical starts 1, semantic edit +1; null legacy. No default/reuse of updated_at. W/L. |
| timing_label | text, max 500 Unicode characters; supplied qualitative timing | Nullable even on WINDOW; mandatory nonblank on qualitative-only WINDOW. Other shapes null for V1; no numeric bounds. W/L. |
| timing_provenance_ref | text, max 512; opaque typed accepted-label evidence | Present iff timing_label present. W/L. |
| participant_scope | text; UNASSIGNED / ASSIGNED / WHOLE_GROUP | Null legacy; canonical UNASSIGNED initially, no participant rows; other values reserved until participant compatibility enabled (N). W/L. |
| legacy_planned_start / legacy_planned_end | timestamptz(6); pre-adoption stored timestamp evidence, not local schedule | Null new canonical; on explicit legacy adoption copy old planned slots even if either null. Immutable thereafter. No population in migration. W/L. |
| legacy_is_estimated_time | boolean; pre-adoption literal old flag | Nonnull only when adopted from legacy; null new canonical/legacy. W/L. |
| legacy_snapshot_at | timestamptz(6); explicit capture time, distinguishes all-null original timestamps from no snapshot | All four snapshot fields absent on new canonical/legacy; adoption requires capture time+old flag, retains old timestamp nulls. W/L. |
| planned_start / planned_end (existing) | timestamptz; normalized start/end instant slots, authority decided by boundary basis | D required equality/null rules; legacy values unchanged. Old legacy writer as-is; canonical guarded. L exact normalized microseconds, no Date rounding. |
| is_estimated_time (existing) | boolean; compatibility summary only | Canonical true iff any authoritative boundary quality ESTIMATED; otherwise false. Unknown/all-day do not mean estimated. Legacy literal untouched. L if retaining compatibility flags. |
| id / trip_id (existing) | UUID stable root/Trip | Immutable on canonical rows. Local existing id+server_id mapping remains; no replacement identity. |
| title / description / status / order_index / trip_day_id (existing) | Authored display/plan state/order/group | E/K semantic revision; day same Trip if present; status retains existing four values. Ordinary canonical mutation rejected, future guarded edits preserve all omitted fields. L. |
| reservation_id (existing) | Nullable UUID association, not schedule authority | L policy; no inferred temporal link, no adoption through FK. Preserve in first foundation. L. |

### Boundary template: exact expansion

For root **start** and **end**, instantiate every suffix below as
`start_<suffix>` and `end_<suffix>` on itinerary_events. Example: start_local_date,
end_local_date. For a transport row instantiate the suffix directly, e.g.
local_date, not origin_local_date. This is an exact field expansion rule, not an
unspecified blob or a proposed shared temporal table. Root boundary families are
all null for TRANSPORT; endpoint rows carry facts instead. A POINT's unused end
family is all null. Unknown active boundary uses explicit quality/basis/PENDING.

| Exact suffix | PostgreSQL type / purpose / authority | Required combinations; legacy / old writer / SQLite |
| --- | --- | --- |
| local_date | date; accepted literal calendar label | Nullable incomplete boundary; required ALL_DAY/CALENDAR and fully fixed civil forms. No UTC/device-derived original date. W/L. |
| local_time | time(6) without time zone; accepted local clock | Present for civil EXACT/ESTIMATED anchor, can survive without date/zone; absent UNKNOWN/all-day/calendar. W/L. |
| clock_precision | smallint -1…6; -1 minute precision, 0 second, 1…6 supplied fractional-second digits | Present iff local_time present; lower unsupplied digits zero. Never promote HH:mm to exact subsecond evidence. W/L. |
| quality | text UNKNOWN / EXACT / ESTIMATED; boundary knowledge/anchor quality | Required active timed/span boundaries; UNKNOWN has no local_time or source_instant. Null for calendar/all-day/window non-clock boundary. W/L. |
| basis | text DERIVED_CIVIL / SOURCE_INSTANT; source of normalized instant | Required active boundary, including incomplete civil intent. SOURCE_INSTANT requires source_instant and EXACT/ESTIMATED; DERIVED_CIVIL never treats source_instant as derived output. W/L. |
| zone_id | text max 128; accepted IANA civil context | Nullable; no Trip/device inheritance. Complete civil conversion needs known accepted zone. Supplied zone needs evidence reference. W/L. |
| supplied_offset_seconds | integer -64,800…64,800; source's explicit UTC offset | Nullable independently; never manufactured from current rules. Validates supplied occurrence; cannot infer IANA zone. W/L. |
| source_instant | timestamptz(6); independently confirmed timeline evidence | Required SOURCE_INSTANT; may coexist with civil-derived basis as retained conflicting/supporting evidence, but does not change chosen basis. W/L. |
| source_instant_precision | smallint -1…6; supplied timeline precision | Present iff source_instant present; no rounding higher precision silently. W/L. |
| civil_resolution | text PENDING / UNIQUE / GAP / FOLD / FOLD_RESOLVED | Required DERIVED_CIVIL; SOURCE_INSTANT null without complete date+clock+IANA, otherwise validated state. Calendar/all-day/window date-only uses PENDING, never a clock conversion. W/L. |
| resolution_offset_seconds | integer -64,800…64,800; accepted occurrence's applicable offset, binding not a second source fact | Required iff resolution UNIQUE/FOLD_RESOLVED; null PENDING/GAP/FOLD. Not an offset cache detached from input. W/L. |
| interpretation_key | text max 256; immutable resolver identity+rule-data version/fingerprint | Required UNIQUE/GAP/FOLD/FOLD_RESOLVED; null PENDING. Exact runtime format selected by adapter, must identify rules, no guessed version. W/L. |
| interpretation_input_sha256 | text, 64 lowercase hex; deterministic binding to civil components/quality/supplied offset and resolution choice | Required with interpretation_key; null otherwise. Recipe below. W/L. |
| provenance_refs | jsonb, at most 16 exact allowed keys, at most 512 chars per opaque typed reference, at most 16 KiB encoded | Required nonempty map when any accepted civil/source fact exists; empty map allowed entirely unknown boundary. No evidence values/payload/coordinates here. W/L as validated canonical JSON TEXT. |

The map's allowed keys are `local_date`, `local_time`, `zone_id`,
`supplied_offset_seconds`, `source_instant`, `quality`, `fold_choice`.
Precision follows its corresponding value reference; unused keys prohibited.
Every supplied/accepted date/time/zone/offset/source instant and estimated quality
has a reference; unknown-quality declaration may have one. Fold resolution needs
fold_choice reference. Several fields may refer to the same immutable confirmation.
Every active boundary has a provenance map object, including an empty map for an
entirely unknown end; null map means unused family or legacy, never active unknown.
Reference validation is N; strings
cannot self-certify a source or grant permissions.

**Binding recipe `otr-civil-binding-v1`:** SHA-256 of UTF-8 canonical JSON array
`["otr-civil-binding-v1", date-or-null, clock-or-null, precision-or-null,
zone-or-null, supplied-offset-or-null, quality-or-null, resolution,
resolution-offset-or-null, interpretation-key]`. Use literal ISO date; time has
two-digit HH:mm:ss and exactly clock_precision fractional digits if positive;
minute precision serializes HH:mm; JSON numbers are integers, no whitespace,
stable array order. Provenance is retained separately. Hash equality never proves
source truth; domain validation verifies values/resolution under the stated rules.

**Microsecond bound:** server core supports precision through 6 digits. A source
with greater precision must remain evidence/unadopted until a separately approved
lossless representation exists. Never round away facts under this contract. Mobile
must use exact strings, not JavaScript Date to serialize submillisecond instants.

## C. Temporal vocabulary

| Concept | Exact bounded values | Distinction / cardinality |
| --- | --- | --- |
| semantic version | null (legacy/unobserved), 1 (this contract) | Not an enum of historical guesses. Unknown future version unsupported. |
| shape | CALENDAR, POINT, ALL_DAY, SPAN, STAY, TRANSPORT, WINDOW | SPAN generic occupancy; STAY calendar-night intent; TRANSPORT two places; WINDOW qualitative only in V1. |
| quality | UNKNOWN, EXACT, ESTIMATED | Null only unused/non-clock boundaries or legacy. UNKNOWN is explicit lack of clock/instant knowledge, not approximate midnight. |
| basis | DERIVED_CIVIL, SOURCE_INSTANT | Civil conversion (possibly incomplete) versus independently confirmed timeline evidence. No device/Trip default basis. |
| civil/DST resolution | PENDING, UNIQUE, GAP, FOLD, FOLD_RESOLVED | PENDING incomplete/unvalidated; GAP no occurrence; FOLD unresolved two occurrences; resolved fold explicit offset choice. |
| endpoint role | ORIGIN, DESTINATION | Exactly two rows on canonical TRANSPORT, including unknown ends. |
| participant scope | UNASSIGNED, ASSIGNED, WHOLE_GROUP | Actual assigned/whole-group write activation is separate; no dynamic roster/empty=everyone. |

UNKNOWN != absent version/legacy. ESTIMATED != old is_estimated_time=true.
ALL_DAY != clock null. SOURCE_INSTANT != DERIVED_CIVIL even if normalized values
coincide. Exact midnight is explicit 00:00 EXACT, not unknown. Clock-less source
instant is valid EXACT/ESTIMATED timeline evidence without claiming local clock.

ZONE/offset suggestions are evidence, not automatically accepted. Offset-only
confirmed occurrence uses SOURCE_INSTANT, preserves supplied civil fragments and
offset, and leaves zone unknown. A civil fragment with no accepted IANA remains
DERIVED_CIVIL/PENDING and no normalized instant. These are different meanings.

## D. planned_start/end authority

For each active boundary, call its existing root planned slot **N** and its
retained source instant **S**. For transport, endpoint instant is **N**, and root
planned_start/end must equal origin/destination N respectively. No second editable
root civil truth.

| Basis / condition | Required N | Evidence / consistency |
| --- | --- | --- |
| Legacy version absent | Literal current planned values preserved | No certification from Z/column type/flag; new fields stay absent. |
| DERIVED_CIVIL with full date+clock+accepted zone, UNIQUE or FOLD_RESOLVED | Populated exact civil date/clock minus accepted resolution offset | Key/input digest and zone-rule validation required; precision/quality retained. |
| DERIVED_CIVIL incomplete, PENDING, GAP or FOLD | Null | Clock/date/zone fragments preserved; no fallback to S, device zone or first fold. |
| SOURCE_INSTANT | Populated, equals S | S plus accepted confirmation/reference required; local facts optional. |
| Calendar/ALL_DAY/qualitative WINDOW, unused boundary | Null | Calendar Day interval is a query derivation, not an appointment N. |

Confirmed S may coexist with civil facts/basis. If a resolved civil conversion
disagrees with S, retain both and their independent evidence; **do not silently
switch basis**. Comparison can be reproduced from civil facts, accepted offset
and interpretation binding without storing another independently editable instant.
When basis DERIVED_CIVIL, N remains the declared civil interpretation and the
source disagreement is exposed; when SOURCE_INSTANT, N remains S. Disagreement
blocks claiming a consistent combined schedule and any automatic canonical Day
answer based on that combined claim. A source-only Day query may explicitly use S.
No third conflict-status flag needed: comparison is deterministic once validated.

For STAY, both dates/civil roles remain authoritative night intent even if clocks
unknown; no fabricated N. SPAN/TRANSPORT permit one resolved end. Both resolved N
require end≥start. Equal N gives zero occupancy, endpoint milestones still exist;
invalid reversed instants cannot be activated as a valid span. Conflict/incomplete
source evidence remains outside the accepted ordered pair until refined.

Database invariants validate local combinations, source=N and offset arithmetic
when inputs are supplied. Domain resolver validates IANA/DST/rule binding. The
private writer must provide validated facts; a hash alone is not validation.
Changing any bound civil fact invalidates resolution evidence until revalidated.
Zone-rule changes propose a new interpretation; accepted N/key remain unchanged
until explicit guarded revision. Source-confirmed S never changes by rule refresh.

## E. Revision/CAS

Add **semantic_revision**, separate from updated_at and old create response
version (currently 1). Canonical insert or explicit legacy adoption starts **1**.
Each admitted semantic mutation uses exact base revision and advances exactly once
to base+1, in the same transaction as root/endpoints/participants/normalized slots.
Maximum safe integer rejects further writes rather than wrapping/resetting.

Revision-advancing fields: title, description/notes, event_type, status, order_index,
trip_day_id, admitted reservation association, shape, timing label, accepted
temporal components/basis/quality/resolution/evidence, accepted spatial intent/target,
participant scope/set/status when the separate participant adapter is enabled.
Same accepted value with changed provenance/acceptance is a semantic mutation.
IDs/Trip/version cannot be casually changed. Version downgrade/clear is forbidden.

Revision-neutral: exact idempotent replay, semantic no-op with identical evidence,
provider candidate/status/error/attempt/timestamp refresh without acceptance,
loss of optional cache Place reference, and operational updated_at change alone.
Cache-only writes still use private admitted path/input binding and serialize with
semantic edits on the parent lock, but do not masquerade as newer semantic truth.
Provider counters/timestamps do not decide which accepted value wins.

Later domain write path: lock parent, check actor admission/current version/base,
validate intended changed fields, preserve omitted facts, write complete aggregate,
advance once, return exact committed revision. Changed same-key replay rejects;
identical intent returns stored original result without increment even after later
edits. It must not reset current aggregate to an earlier replay receipt. Durable
event-specific receipt support is a later command slice, not a generic command bus
or a table in this first disabled foundation. Without receipt/revision proof, keep
canonical commands disabled. CAS errors have stable future domain meaning, not LWW.

No endpoint-owned revision. Trigger guards reject direct attempts to set/decrease
revision; admitted root semantic update requires +1. Trusted narrow command must
prove endpoint/participant semantic changes also advance parent once. Whole-aggregate
validation occurs at transaction completion, not halfway through child inserts.

## F. Transport endpoint contract

Exact table name: **itinerary_transport_endpoints**. Composite primary identity
`(event_id, role)`; no generated endpoint UUID or endpoint semantic revision.

| Field(s) | Type / authority | Requirements / writer / SQLite |
| --- | --- | --- |
| event_id | UUID FK to itinerary_events.id | Nonnull; immutable owner; no reservation/generic FK. No endpoint legacy rows. Only private writer. Local event_id refers to stable local aggregate mapping. |
| role | text ORIGIN/DESTINATION | Nonnull, unique per event via composite key; immutable identity. Exact local mirror. |
| Every B boundary suffix | Types/meaning exactly as B | Active timed endpoint, quality+basis always present; UNKNOWN end retains its row with missing components. Same local mirror. |
| instant | timestamptz(6); endpoint normalized N | D same authority/null/equality rules. Root planned slots equal it. Same local exact TEXT. |
| Every G spatial field | Types/meaning exactly as G | Independent authored/accepted/enrichment components; no requirement Place/provider/location known. Same local mirror. |

Exactly one ORIGIN and DESTINATION on version1 TRANSPORT, even if entirely unknown.
No endpoint rows for non-TRANSPORT or legacy parents. Do not silently fabricate
second end from root location. Both roles have independent accepted zones, including
explicit repeated Pacific/Auckland for same-zone travel. Parent trip_id scopes all
rows; no duplicate endpoint trip_id to drift. FK existence plus parent scope govern
Trip; optional Place reference is global cache, not a cross-Trip business owner.
Provider evidence/Track C refs must be admitted for parent's Trip.

Parent physical deletion behavior: endpoint FK **ON DELETE CASCADE** solely for
atomic aggregate ownership. Canonical parent deletion is **disabled/rejected** by
guards in this rollout, including cascaded Trip deletion. Therefore the FK is not
a legacy deletion bypass. A separately approved later aggregate teardown can remove
both ends; no independent endpoint deletion allowed. Local owner/aggregate removal
similarly cannot destroy pending protected work.

Private writer locks parent before child edits, uses root revision/CAS and final
shape/pair checks. Root temporal start/end families must be all null for TRANSPORT;
root normalized instants are generated summaries. Existing root location family
is frozen legacy compatibility evidence on adoption and absent/defaults on new
transport. It is **not** origin, destination, nav target or another editable place.
Readers use endpoints; unsupported old reads are read-only/withheld (K).

## G. Spatial field contract

Use this exact new family on itinerary_events **and** itinerary_transport_endpoints.
New root family is all null for TRANSPORT; endpoints own its places. On legacy
root all fields null. Existing root location_name/text/lat/lng/Place/provider/
resolution fields remain untouched legacy compatibility; do not map them to new
authored/accepted fields merely because they are nonnull. Non-transport new rows
may have legacy text summaries computed only by admitted compatibility adapter;
ordinary legacy writers cannot update them on canonical rows.

All fields W/L as defined B. Accepted/candidate latitude and longitude pairs are
both present or both absent, finite and within geographical bounds. Independent
location components may remain unknown; Place/provider never required.

| Exact field | PostgreSQL type / purpose / authority | Canonical combination / retention |
| --- | --- | --- |
| authored_label | text max 500; accepted user/source place name | Nullable; does not require geocoder; original label survives enrichment. |
| authored_text | text max 5,000; raw accepted location wording | Nullable independently of label; no provider replacement. |
| authored_address | text max 2,000; accepted supplied address literal | Optional authored fact, not parsed provider address. |
| authored_address_line1 / authored_address_line2 / authored_address_locality / authored_address_region / authored_address_postal_code / authored_address_country | text; supplied postal components, respectively max500/500/200/200/64/128 | Each independently nullable; retained exactly as supplied/accepted, no parsing from raw text or inferred country. Each has its own corresponding provenance key when present. |
| accepted_address | text max 2,000; explicitly accepted formatted address | Optional, may differ from raw authored address; own evidence, no automatic refresh. |
| accepted_address_line1 / accepted_address_line2 / accepted_address_locality / accepted_address_region / accepted_address_postal_code / accepted_address_country | text; accepted postal components, same respective limits as authored components | Each independently nullable and independently accepted; provider candidate never fills them without confirmation. No mandatory international address completeness rule. |
| accepted_latitude / accepted_longitude | double precision; accepted manual/source/provider navigation target | Optional validated pair, own component acceptance; not observed GPS. |
| accepted_place_id | UUID nullable FK places.id, SET NULL; optional accepted-target cache reference | Cache reference only; accepted snapshots/address/coordinates remain when null. No equivalence/identity inference. |
| spatial_provenance_refs | jsonb max 16 KiB, ≤24 keys, opaque typed refs ≤512 chars | Nonempty iff accepted/authored fact exists; allowed keys authored_label, authored_text, authored_address, accepted_address, accepted_coordinates, and the twelve explicit authored/accepted address-component field names above. Every present fact has a corresponding reference. No place/date/coordinate payload. |
| location_input_revision | bigint safe integer 1…MAX; authored/accepted component generation | Required on all active spatial families, starts1 even unknown; +1 iff intent/accepted components or their provenance change, not provider refresh. Null unused transport root/legacy. Not independent CAS; parent semantic revision controls edits. |
| candidate_input_revision | bigint safe integer | Present iff candidate/lookup state present, equals captured input generation; mismatch result rejected, not installed. Old accepted snapshots unaffected. |
| candidate_provider | text max128; optional external provider namespace | Required with candidate reference/data; booking provider unrelated. |
| candidate_provider_place_id | text max1,000; opaque provider record | Optional with namespace; never internal object ID. |
| candidate_place_id | UUID FK places.id, SET NULL | Optional cache reference; candidate inline snapshot persists on cache loss. |
| candidate_label | text max500; provider suggested name | Optional, no authored overwrite. |
| candidate_address | text max2,000; provider suggested address | Optional; accepting it requires explicit semantic mutation. |
| candidate_latitude / candidate_longitude | double precision; provider suggested pair | Optional validated pair; not accepted by confidence or refresh. |
| candidate_confidence | numeric nullable | Optional finite 0…1 normalized confidence only when adapter has justified scale; unknown scale omitted, raw response remains provider cache. Not acceptance. |
| candidate_state | text PENDING / RESOLVED / AMBIGUOUS / FAILED | Nullable means no lookup observed. RESOLVED means provider produced a candidate, never user accepted it. |
| candidate_observed_at | timestamptz(6) | Required for completed state RESOLVED/AMBIGUOUS/FAILED; null allowed PENDING. Cache time not schedule. |
| candidate_error_code | text max128, redacted machine code | Required FAILED, null otherwise. No arbitrary provider body/error message. |

An active root spatial family exists on every non-transport canonical root,
including entirely unknown place (input revision1, remaining fields null).
Every transport endpoint has its own generation. Intent corrections advance input
and parent semantic revisions, clear current candidate fields atomically, and
retain earlier accepted/evidence history via the admitted domain/C boundary.
Late result for old generation is discarded; it cannot replace current candidate
or accepted target. Candidate-only updates lock/check generation but leave parent
semantic revision unchanged. Candidate data is a cache, not a second location truth.

Optional Place-reference nulling alone is permitted maintenance with unchanged
semantic revision (J), preserving snapshots. These references are excluded from
location input revision meaning. No network lookup/navigation/route engine here.
Opaque raw provider responses can remain in existing places.raw_response; this
contract adds no provider JSON blob. Address components retain supplied structure
without a postal normalization framework. Provider-supplied components not yet
accepted stay in its attributed cache/Track C evidence; an adapter cannot discard
them and claim a fully lossless provider record was adopted as plain text.

## H. Canonical validity matrix

Notation: **civil known** = date+clock+precision+zone, evidence for supplied facts,
validated resolution; **civil N** = date/clock minus accepted offset with binding.
An active timed boundary always has quality+basis; unused families all null.
Every canonical row has version1/revision≥1 and participant_scope UNASSIGNED in
initial activation, no participant rows. Future other scopes need N's adapter.

| Case | Required fields/combinations | Forbidden / normalized slot |
| --- | --- | --- |
| POINT exact civil | shape POINT; start quality EXACT,basis DERIVED_CIVIL,local_time+precision; complete known context for resolved form | All end fields null, no endpoints; start N=civil N if UNIQUE/FOLD_RESOLVED, else null. Missing date/zone remains valid incomplete point. |
| POINT unknown | POINT; start quality UNKNOWN,basis DERIVED_CIVIL,resolution PENDING; date/zone optional | local_time/precision/source_instant/N absent; not all-day. |
| POINT estimated | POINT; start quality ESTIMATED; civil clock+precision or confirmed approximate S depending basis | No invented tolerance; derived anchor not exact occupancy; end unused. |
| ALL_DAY | ALL_DAY; start date required,basis DERIVED_CIVIL,resolution PENDING; zone optional | Clock/precision/quality/source instant/interpretation/N null; end unused. Named Day interval only derived for query. |
| CALENDAR | CALENDAR; start date required, date evidence,basis DERIVED_CIVIL,PENDING | No clock/quality/source/N/end; date annotation, not occupancy. |
| STAY exact | STAY; both civil date/clock/precision, quality EXACT, basis DERIVED_CIVIL; accepted independently known zones/resolution for resolved measured form | No endpoints; checkout date≥check-in date; resolved N end≥start; nights derived from dates. Incomplete context preserves clocks without N. |
| STAY unknown clocks | STAY; two active civil boundaries, quality UNKNOWN,PENDING; dates known in given scenario, independently nullable on incomplete Stay | Clocks/precision/source/N absent; no midnight/elapsed duration. Calendar nights only if both dates valid/ordered. |
| SPAN | SPAN; two active boundaries, independent basis/quality | Missing end facts not infinite span; equal instants zero occupancy; both resolved end≥start. |
| TRANSPORT exact | TRANSPORT; root families null; two endpoint roles with independent EXACT boundary+spatial generations | Root N equals endpoint instant pair; no root place family except frozen legacy/defaults; no shared zone assumption. |
| TRANSPORT partial destination | TRANSPORT; ORIGIN resolved as supplied; DESTINATION row with UNKNOWN/DERIVED_CIVIL/PENDING and any known date/zone/place | Destination instant/root planned_end null; departure can resolve; no fake destination/time. |
| SOURCE_INSTANT only | POINT in example; start basis SOURCE_INSTANT,quality EXACT,S+precision+confirmation; no local date/clock/zone | N=S; civil resolution/binding null; no fake local scheduledDate. Explicit-context Day may use S. |
| DST fold unresolved | Civil clock/date/zone, EXACT or ESTIMATED, DERIVED_CIVIL/FOLD,key+input digest | No resolution_offset,N; no default-first fold; user/source can refine. |
| DST fold resolved | Same civil facts, FOLD_RESOLVED+explicit applicable offset/fold evidence,key+digest | N fixed to chosen occurrence; no implicit choice, revision advances on resolution. |
| DST gap | Complete civil input,GAP,key+digest | No resolution_offset/N; no roll-forward. Source-confirmed S under SOURCE_INSTANT remains separate conflicting evidence, not generated gap occurrence. |
| WINDOW qualitative | WINDOW; timing_label/ref; optional start date/zone, basis DERIVED_CIVIL,PENDING | No clock/quality/source/N/end; no earliest/latest invented. Numeric bounds remain Track C evidence until later typed support. |
| Legacy row | version null and all new parent fields null; zero endpoint rows | Existing planned values/flag/location/status/participants untouched; no canonical validation/backfill. |

Canonical SAME-Trip requirements: trip_day_id belongs to event Trip; event
reservation association same Trip when admitted; participants resolve only known
journey_members IDs of that Trip; Track C references admitted under that Trip.
Database whole-aggregate/deferred constraints enforce endpoint role count/no
wrong-shape rows, root-child instant equality and local field combinations. Domain
validation enforces IANA/DST/meaning and confirmation provenance. Reader exposes
partial/unresolved facts honestly, not a complete physical Day claim.

All inactive root component families including provenance map fields are null,
not empty maps that could masquerade as active unknown boundaries. Exact/estimated
clocks can exist with missing date/zone; quality UNKNOWN does not mean entire
boundary identity/date/place unknown. Date-known unknown-clock remains valid.

## I. Writer inventory

Search scope: repository `backend`, `src`, `scripts`, `supabase` for the four
itinerary table names, insert/update/upsert/delete paths, functions, grants,
fixtures and indirect CASCADE/SET NULL effects. No remote/legacy Web source read.
No located runtime reservation or participant writer beyond retained direct DML
capability/functions; absence does not certify external applications. E1–E6.

| Writer/path | CURRENT evidence / reach | Classification / required behavior |
| --- | --- | --- |
| Backend v1 create gateway | E3 secret/service client INSERT event, concatenates Z, null→estimated midnight; no endpoint/member writes | **SAFE AS-IS** for legacy-only create after absent-field guard; **MUST REJECT CANONICAL ROW** if reused for rich overwrite/adoption. No fix in this phase. |
| Backend find/replay path | Deterministic actor/entity/key ID, findOne reads metadata and returns stored create receipt; no replacement write | **SAFE AS-IS** to preserve existing row on legacy retry, never same-ID semantic conversion; canonical replay requires later exact-intent receipts. |
| Mobile Dev create adapter / old request schema | E4 scheduledDate,startTime,location,notes; only POST v1 | **SAFE AS-IS** as legacy writer; **MUST BE UPGRADED BEFORE ACTIVATION** as canonical writer. Cannot send rich replacement. |
| Local itinerary repository/worker/fake adapter | E4 local INSERT+queue, status/ID reconciliation; no server rich update or pull | **SAFE AS-IS** legacy demo; **MUST PRESERVE NEW FIELDS** if extended; lossless local/DTO admission required before canonical editing. |
| Direct authenticated event INSERT/UPDATE/DELETE | E1 all table privileges; RLS admits members/creator, created_by gate on inserts | Legacy DML remains **SAFE AS-IS**; canonical/adoption/unsafe delete **MUST REJECT CANONICAL ROW**. RLS is access, not rich semantics. |
| Direct authenticated reservation DML | E1 owner/admin insert, member/creator update/delete policies | **SAFE AS-IS** unchanged legacy reservations; **UNKNOWN** external writer intent. Cannot mutate canonical schedule through association; linked FK effects guarded. |
| Event participant direct CRUD | E1 permission helper created_by or owner/admin, broad grants | Legacy **SAFE AS-IS**; canonical parent mutations **MUST REJECT CANONICAL ROW** until participant adapter. No User→Person inference. |
| Reservation participant CRUD | E1 similar helper/legacy checks | **SAFE AS-IS** for unchanged reservation evidence; canonical event participation not inferred/copied. |
| can_manage_* participant functions | E1/E2 read-only SQL helpers with authenticated/service EXECUTE | **SAFE AS-IS**, not mutations; must not become canonical write bypass. |
| remove_journey_member RPC | E1 deletes Member, cascades itinerary participant rows; E2 authenticated/service EXECUTE | **MUST REJECT CANONICAL ROW** through child guard if it would erase canonical event assignment. Existing Member RPC/lifecycle unchanged; activation must prove rollback of whole attempted delete. |
| Member/Profile/Trip physical delete and FK cascades | E1 Member/User participant CASCADE, Trip→event CASCADE, profile creator SET NULL | **MUST REJECT CANONICAL ROW** on semantic impact; ordinary legacy behavior unchanged. No CASCADE redesign. Explicit optional Place SET NULL maintenance exception J only. |
| Place deletion/refresh | Cache FKs SET NULL; existing provider-aware cache, no active itinerary geocoder located | **MUST PRESERVE NEW FIELDS**: accepted snapshot survives pointer loss; refresh cannot modify intent; external cache writer inventory **UNKNOWN**. |
| Backend secret-key/service-role direct DML | E3 constructs service client; RLS bypass possible, ordinary triggers still apply | **MUST REJECT CANONICAL ROW** absent dedicated private writer capability; secret key is not canonical authority. |
| Retained SECURITY DEFINER functions | E1/E2 allowlisted functions; located itinerary helpers read only; Member deletion indirect writer | **MUST REJECT CANONICAL ROW** through row guards under any other function owner; no wildcard postgres/admin exemption. |
| Backend/app/test doubles; repository/worker/transport tests | E5 in-memory local/mock writes, no service network in tests inspected | **SAFE AS-IS** legacy tests; **MUST BE UPGRADED BEFORE ACTIVATION** with canonical guard/round-trip fixtures. |
| Seed and SQL RLS fixtures | Located itinerary writes are ratings, distinct table; no event/reservation/participant schedule fixtures found | **SAFE AS-IS**; ratings do not alter schedule/scope. Need new isolated guard fixtures later. |
| Baseline generator / migration/reset tools | scripts/supabase/generate-canonical-baseline.mjs records schema/function allowlist; migrations grant capabilities | **SAFE AS-IS** read/source tooling; owner DDL outside ordinary DML guarantee. New verifier manifest delta/replay required later. |
| Generic table helpers and Dev/Stage9 fixture loaders | Located from(table) helpers in scripts/dev/create-ui-polish-journey.ts, enable-settlement-test-fixture.ts and scripts/stage9 loaders are SELECT/count/snapshot readers; settlement validation scripts insert/update Trip/Member financial fixtures | **SAFE AS-IS** for isolated legacy fixtures; no dynamic itinerary write found. Parent deletes/reassignment impacting canonical links must obey structural guards; no script receives semantic-writer membership. None executed here. |
| External legacy/internal workers not in repository | Direct grants make such clients possible; executable behavior not locally known | **UNKNOWN**; protection does not trust them. No remote inventory sought; activation blocked until deployed capability assumptions verified under authorization. |

Existing grants include TRUNCATE through ALL privileges. Row-level triggers alone
do not guard TRUNCATE. The first foundation must revoke/guard it explicitly (J),
including inherited/PUBLIC grants and parent cascade routes. No other located
checked-in itinerary DML function supplies hidden canonical bypass. Existing
updated_at metadata/operational conventions are not revision protection.

## J. Writer protection options/decision

| Strategy | Coverage / deficiency | Decision |
| --- | --- | --- |
| A. Backend-only validation | Cannot protect direct authenticated/service-role writes, RPC-owned deletes or cascade effects | Reject. |
| B. Canonical-row trigger guard | Protects DML independent of RLS; needs unforgeable privileged identity and final aggregate validation; alone misses TRUNCATE/DDL | Necessary but incomplete alone. |
| C. Revoke all direct mutation + narrow RPC | Strong capability boundary but breaks current legacy direct DML and needs commands before useful new writes | Reserve private capability; don't revoke legacy row DML wholesale. |
| D. Hybrid | Row guards distinguish legacy/canonical, role isolation, no destructive bulk capability, later narrow admitted RPC only | **Choose D**. |

Exact private identity: **otr_trip_event_semantic_writer**, NOLOGIN, NOSUPERUSER,
NOCREATEDB, NOCREATEROLE, NOINHERIT, NOBYPASSRLS. No membership/SET ROLE path for
PUBLIC, anon, authenticated, service_role, authenticator or other application
roles. Validate existing role attributes/membership on replay and fail on mismatch,
never silently sanitize a compromised role. Role outlives local resets, like A1-I2A.

Guards are **SECURITY INVOKER** with pinned pg_catalog search path and fully
qualified object access. Check effective current_user equals exact private role,
not JWT role, auth.uid=null, service key, session GUC, trigger depth, superuser
string, parser flag or caller-supplied function argument. Other definer owners do
not bypass. Existing authorization must still be checked by future narrow commands;
private role isn't permission to edit an arbitrary Trip.

First foundation reserves this role **with no DML grants, no owned executable
mutation function and no API EXECUTE path**. A private-role attempt also fails
CANONICAL_WRITES_DISABLED until a separately approved command installation.
Thus zero canonical inserts/adoptions are possible in that migration. Later
commands may use SECURITY DEFINER owned by the private role with least privileges,
explicit admitted Actor+Trip/base revision, fixed fields and no arbitrary SQL.
Never let an API role invoke a generic role-switch/write function.

Exact row guard decisions:

- Legacy INSERT: all proposed additions null, no endpoints; preserve old payload.
  Nonnull new fields from ordinary caller reject, not silently normalize/promote.
- Legacy UPDATE: retain null additions/zero endpoints and all existing legacy
  behavior; attempted semantic adoption/new-field injection rejects.
- Canonical INSERT/adoption/UPDATE/DELETE: ordinary callers reject. Direct title
  edits also reject; K's preservation allowance requires future admitted adapter.
- Existing canonical version/revision/ID/Trip/snapshot cannot be cleared/downgraded
  by any admitted command. Identity/legacy snapshot immutable; semantics E/D.
- Endpoint INSERT/UPDATE/DELETE: private admitted path only; parent exists and
  version/shape valid, lock parent and final aggregate checks. No self-authorized end.
- Event participant mutations: inspect **OLD and NEW parent** on insert/update/
  delete so moving legacy row into/out of canonical parent cannot bypass. Canonical
  parent rejects ordinary DML, including cascade deletes. Later adapter obeys N.
- Canonical root location/legacy participant/derived-slot changes from external
  writers fail before alteration; omission alone is not a privilege.

**Narrow maintenance exception:** an update that only nulls a nonnull optional
`accepted_place_id`, `candidate_place_id` or existing compatibility place_id
reference, with every other semantic/cache field unchanged, may preserve revision
and snapshots. Same exception on endpoints. It applies equally to FK SET NULL and
direct reference removal; it grants no target/address/coordinate overwrite. No
“any nested trigger is trusted” shortcut. created_by/reservation/day SET NULL are
not this exception; canonical impact rejects until an admitted command handles it.

**Bulk protection:** revoke TRUNCATE from all application identities (including
service_role), PUBLIC and inherited grants on event/endpoint/participant tables.
Add statement-level rejection of TRUNCATE on these protected tables so a
TRUNCATE CASCADE rooted elsewhere cannot erase canonical data. Initial contract
rejects bulk truncate entirely, even if only legacy rows exist; normal legacy
row DML remains. Revoke their TRIGGER privilege from application/PUBLIC/inherited
grants as well; API identities cannot install additional table triggers. Do not
add guard-disable/replication-role/DDL capability to any
API identity. Table owner/superuser migration/reset operations remain trusted
administration outside the runtime DML guarantee; no claim to defeat a DBA
disabling triggers or dropping tables. RLS bypass is not trigger bypass.

Final constraints validate canonical combinations and transport pair/equality
at transaction completion. Initial physical migration cannot grant partial-role
access before guards/constraints commit. Later private command acceptance must
prove once-per-semantic-edit revision and aggregate atomicity. No implementation
in this document, no command receipt framework added to initial migration.

Endpoint table RLS is enabled: authenticated SELECT requires the parent event's
existing same-Trip member-or-creator read predicate, never a new participation
permission. anon has no read/write policy; ordinary application identities have
no endpoint DML grant/policy. Future private-writer policies/grants must cover its
fixed parent/child statements without broadening authenticated access, and be
installed only with the admitted command slice. Reserved NOLOGIN role alone does
not grant RLS access. Constraints must inspect the full aggregate under a fixed
read-only validation context when caller RLS would hide rows; that helper cannot
mutate or confer the private writer identity. Invoker write guards remain distinct.

Same-Trip link integrity is checked on **both sides**: canonical event writes and
updates to referenced trip_days.trip_id or itinerary_reservations.trip_id. Fixed
read-only deferred validation rejects a referenced row's Trip move that would
leave any canonical link cross-Trip. This is a narrowly required validation trigger,
not a reservation field/lifecycle extension. Existing unreferenced/legacy behavior
is unchanged. Event Trip/ID itself is immutable once canonical. Concurrent link
admission and referenced-row Trip movement must take compatible locks on that
referenced row before validation, preventing two independently valid racing commits.

## K. Old-client policy

These are exact operation policies, not implemented endpoints. CURRENT old Mobile
has create only; “old edit” includes direct legacy clients permitted by grants.

| Operation | Legacy parent | Canonical rich parent |
| --- | --- | --- |
| Legacy create | **ALLOW** existing v1/direct payload; additions absent | Cannot create/promote canonical through legacy shape: **REJECT**. |
| Title edit | **ALLOW** existing admission | **ALLOW WITH PRESERVATION** only future admitted title-only adapter+CAS; direct DML/full object rejected. |
| Notes edit | **ALLOW** existing admission | **ALLOW WITH PRESERVATION** only future admitted description-only adapter+CAS. |
| Group/day edit | **ALLOW** legacy grouping | **ALLOW WITH PRESERVATION** only explicit grouping-only adapter+CAS+same Trip; schedule/endpoint facts untouched. No date move inferred. |
| Legacy date/time edit or full-save | **ALLOW** legacy basis only | **REJECT**, even same apparent clock, unless a new canonical explicit temporal mutation replaces the operation. |
| Legacy location edit | **ALLOW** legacy location family | **REJECT**; canonical authored/accepted correction requires explicit target component intent/input invalidation. Never flatten transport. |
| Unsupported rich detail read | Existing compatibility read if available | **READ-ONLY/WITHHOLD** when narrow date/time/location cannot honestly represent it. No fake scheduledDate for source-only/undated rows. |

ALLOW WITH PRESERVATION is unavailable until a future narrow writer is installed;
first foundation rejects every ordinary canonical edit. A full-save carrying title,
date/time/location is not relabeled title-only. Omission is preserve, explicit null
is an admitted shape-specific clear, never clear all omitted rich facts. Old reads
cannot be round-trip source. Transport/Stay/estimated/fold/time-only objects may
need withholding because old UI has no zone/quality/end/read-only affordance. New
canonical adapter can change title offline safely with full local projection.

## L. Reservation boundary

No additions to itinerary_reservations or its participant table. starts_at/ends_at,
provider, confirmation, status, location and IDs remain unchanged commercial/legacy
facts. New canonical event may retain an existing reservation_id as a same-Trip
association, but that FK alone does not adopt its timestamps, participants or place.

“No additions” here means no columns or canonical reservation representation;
J's narrowly required same-Trip link validation does reject a Trip-key move while
referenced by a canonical event. It never changes reservation timestamps/status.

On explicit future legacy event adoption, preserve reservation_id, validate same
Trip and declare event the accepted schedule owner; unresolved source disagreement
must remain evidence, not automatic merge. No automatic event creation for a
reservation-only Stay/flight. Future reservation adoption/linking requires exact
reviewed same-fact authority, confirmation, CAS and evidence preservation, and must
prevent two independently editable schedules. Booking lifecycle is deferred.
Current reservation deletion's SET NULL on canonical event is rejected unless
an admitted association edit happens first; this is declared guard impact, not
a silent rewrite of the reservation domain or a new Booking cancellation policy.

## M. SQLite mirror contract

Proposed local root remains **itinerary_items**, preserving local id/server_id and
legacy scheduled_date/start_time/location/notes. Add B's root names, root boundary
expansions, G's root family and local **planned_start/planned_end** normalized TEXT
slots. Existing notes maps server description without replacing rich facts. New
canonical rows may be undated, so future local migration must relax old required
scheduled_date with a preserving table rebuild or separate compatibility projection;
chosen direction is a preserving rebuild, **no migration number assigned**. Old
rows/queue IDs/owner remain byte-equivalent; old client rollback cannot safely edit
new undated rows, read-only/withhold.

Exact local transport table name: **itinerary_transport_endpoints** with
`event_id` = existing local itinerary_items.id, `role`, every B endpoint suffix,
`instant`, every G family, same pair/shape invariants. Server event UUID resolves
through parent server_id, not a second mutable endpoint server identity. Root
semantic_revision mirrors server accepted revision, not local sync_version.

| Local fields beyond mirrored aggregate | Purpose / exact null rules |
| --- | --- |
| sync_operations.base_version (existing) | INTEGER nullable; for canonical edits, exact accepted semantic_revision against which intent was authored; null new offline create/legacy. No duplicate pending_base_revision root column. |
| sync_operations.payload_json (existing) | Validated TEXT; durable field-specific canonical intent, evidence and original changed-field binding needed by that operation; no second giant schedule snapshot or pending_intent_json root column. |
| local_owner_user_id, server_id, sync_status, sync_version (existing) | Retain current operational ownership/mapping; accepted semantic revision independently known, never default observed server revision1 offline. |

Draft version1 may carry null server semantic_revision until accepted, explicitly
local pending-create state; it is not a canonical shared row yet. Root mirror
otherwise uses H. For an accepted object keep accepted core facts in the typed
root/child projection, and expose pending field intent through repository composition
from the durable operation. Newer remote state cannot rewrite that operation's
base revision or authored values; do not silently rebase an old pending patch.
No separate full JSON aggregate snapshot is required for this CAS contract.
SQL/date-time literals preserve microseconds; JSON maps parse
without unknown-key stripping. Pull applies parent/children/evidence/accepted
revision atomically, preserves pending intent and newer observations, and rejects
malformed/unsupported versions before cursor advancement. Parent/child ordering
cannot expose half a transport after restart. Entirely unknown ends still persist.

Mirrored participant_scope can exist now; actual local canonical assigned rows
are deferred to N's participant compatibility slice. No Account identity inferred
from Person. Current owner/generation/admission gaps in the itinerary demo must
be repaired before product canonical activation using established Trip context
checks, not a new permission system. No server-rich/local-narrow editing allowed.

## N. Track A/C boundaries

### Track A

Current A1-I2A migration/local42 and lifecycle revision remain unchanged.
TripPersonId is journey_members.id; activity scope never uses Account UUID instead.
Event semantic_revision is independent of participation_revision: stopping travel
does not rewrite event assignments/revision or any financial reference.

Exact scope contract: initial canonical commands accept only **UNASSIGNED** with
zero participant rows. ASSIGNED/WHOLE_GROUP are reserved schema values that must
be rejected while participant compatibility is disabled. Future adapter resolves
nonempty recorded same-Trip Person sets using existing event participant rows,
with journey_member_id required; user_id is non-authoritative compatibility, not
an alternate Person key. Existing participation_status retained as its own fact.
WHOLE_GROUP records the resolved set, not dynamic roster membership. A stale/absent
Track A observation is not silently ACTIVE. Historic inactive IDs remain resolvable.

Before enabling assigned sets, the separate participant compatibility adapter must
also prove same-Trip validity under referenced Member Trip-key changes/concurrency,
not just on participant insertion. The first disabled/UNASSIGNED foundation needs
no Member-schema/lifecycle change for that future gate. I2A pair/guard is untouched.

Actual participant compatibility, command/selection observations and local
association projection remain separate; this first migration only guards canonical
parents from old participant CRUD/cascades. No Participant CASCADE/FK rewrite,
Member deletion fix or access change. If owner review cannot accept rejecting
destructive legacy deletion impacting canonical scope, activation stays blocked
for the separate compatibility decision. Do not weaken the guard to finish a slice.

### Track C

Use **typed opaque references**, not new Source tables. Reference strings in
provenance maps/label refs are max512 and use a namespace plus stable opaque ID:
`track-c/field-evidence/<id>` or `otr-event/confirmation/<id>`. Source/Representation/
Confirmation relationships and their revision/Actor/input binding resolve via the
appropriate owning adapter; a field reference can point to C-I1 H's FieldEvidence
binding exact supports and reviewed output, without duplicating them in Track B.
No external URL/table name/arbitrary user string counts as evidence. The exact
identifier allocation/wire escaping is the owning adapter's persistence contract;
no FK to nonexistent Track C tables in this migration. B stores opaque TEXT refs
and field keys only. refs must be admitted and output-value/revision-bound when
canonical commands later activate.

Manual event confirmation does not fabricate Source/Representation/Candidate IDs.
Its future immutable domain receipt records actor+intent; pointer is not a new
generic evidence graph. C import requires reviewed acceptance; parser proposals
cannot use private writer role merely by inserting references. User edit of an
extracted value retains extracted lineage in C and the user-replacement decision,
not “source-confirmed” provenance by string equality. Canonical values survive
Source loss; opaque refs retain unavailable/history semantics. C-I1 AB's conceptual
TemporalSpec wording is an ownership boundary, not permission for giant JSON core.

## O. Golden cases

All dates synthetic 2026. Outputs describe later admitted writers, not functions
implemented here; first foundation keeps all canonical commands disabled.

| # / case | Exact intended outcome / acceptance assertion |
| --- | --- |
| 1. Legacy create | Existing v1 payload inserts existing planned_start mapping/flag; all new root fields null; no endpoints. Legacy stays legacy. |
| 2. Canonical fixed event | POINT v1/rev1, start Dec17 10:00 precision-1 EXACT/DERIVED_CIVIL, accepted Auckland zone UNIQUE/+46,800 seconds+binding; planned_start Dec16 21Z; end unused, scope UNASSIGNED. |
| 3. Canonical all-day | ALL_DAY date Dec17, accepted Auckland if supplied, PENDING, clock/quality/instants null; no fake midnight; rev1. |
| 4. Unknown→exact | Same ID, UNKNOWN date Dec17→explicit accepted10:00/zone/EXACT/resolution/binding; rev n→n+1; original snapshot preserved if legacy adoption; no device inference. |
| 5. Stay exact | STAY Dec16 15→Dec19 10 Auckland at both ends, rev1; planned Dec16 02Z→Dec18 21Z; 3 nights/67h derived; one ID. |
| 6. Stay unknown clocks | STAY both dates/zone known, UNKNOWN/DERIVED_CIVIL/PENDING; clocks/precision/planned null; 3 nights, measured hours unknown. |
| 7. Transport | TRANSPORT root components/place null; two ends ORIGIN Auckland Dec16 09(+46,800)→DESTINATION Sydney10:30(+39,600); each EXACT/UNIQUE/own place; root Dec15 20Z→23:30Z; parent rev1. |
| 8. Unknown destination time | Same two rows; known origin resolved; destination UNKNOWN/PENDING with any supplied date/place; destination.instant/root planned_end null. No infinite occupancy. |
| 9. Old title edit transport | Direct DML rejected. Future admitted title-only compatibility adapter uses base n, changes title/rev n+1 only, preserves every endpoint/zone/target/scope/binding. |
| 10. Old full date/time save transport | Rejected atomically even if title allowed separately; root marker/revision/ends unchanged. No flattened DTO acceptance. |
| 11. Late provider result | User correction location_input_revision k→k+1, parent n→n+1, clears current candidate; result bound k discarded. Accepted text/coordinates unchanged by refresh. |
| 12. DST fold unresolved | LA Nov1 01:30 EXACT/DERIVED_CIVIL/FOLD, rule+input binding; no resolution_offset or N; source evidence retained. |
| 13. Fold explicitly resolved | Explicit -25,200 seconds choice→FOLD_RESOLVED, N Nov1 08:30Z; alternative -28,800→09:30Z requires distinct accepted intent; rev +1, fold_choice evidence. |
| 14. Confirmed UTC only | POINT SOURCE_INSTANT EXACT,S Dec17 06Z+precision+confirmation; no civil date/clock/zone/resolution/binding; planned_start=S. Old mandatory-date read withheld. |
| 15. Service direct overwrite | service_role attempts marker=null, planned_start replacement, endpoint delete or participant change: reject by invoker guard, no revision/data delta. RLS bypass irrelevant. |
| 16. Same-intent replay | Future domain receipt returns original ID/revision/result; no new row/increment/reset of current later state. Changed same key fails. No generic idempotency implementation in foundation. |
| 17. Stale base revision | Writer base n while current n+1: reject before semantic mutation; no partial child changes/provenance loss or automatic rebase. |
| 18. Legacy migration untouched | Before/after ID+all old values/participants/financial manifests identical; every added parent field null, endpoints empty; old dates/flags not classified. |
| 19. Gap | Auckland Sep27 02:30 GAP with rule/input binding; N null; no roll-forward. |
| 20. Delete/cascade/truncate | Canonical parent/participant semantic deletion rejected, Member removal transaction rolls back; truncate paths blocked; optional Place nulling alone preserves snapshots. |

Later runnable acceptance must exercise real roles/constraints, not only mocked
backend payloads. Direct service-role mutation, participant parent reassignment,
Member/Trip/profile cascades and TRUNCATE CASCADE are mandatory adversarial cases.

## P. Migration-order proposal

One bounded **server-only additive protected foundation**, after review and explicit
implementation approval. No migration timestamp or SQL chosen here.

1. Confirm clean accepted baseline (65 retained migrations/manifest with I2A),
   locally snapshot old event/reservation/participant/financial and privilege facts.
2. In one DDL transaction add B/G nullable fields without semantic defaults and
   the typed endpoint table; reserve/validate isolated writer role; no business UPDATE.
3. Install invoker guards, bulk protection, exact combination/whole-aggregate
   checks and least privileges **before commit**; canonical commands disabled.
   Keep existing read/legacy row-DML authorization; no default EXECUTE leak.
4. Validate isolated local pre/post identity/value manifests, role membership and
   all legacy compatibility cases; attempt forbidden rich DML via real application
   identities and other definer-owned/cascade paths. No remote approval inferred.
   Canonical fixtures for disabled-writer tests may be installed only by trusted
   test-owner DDL in an isolated transaction, with guards restored and verified
   before any API-role probe. No test-only bypass function/grant ships in migration.
5. Update expected manifest only for explained new fields/table/constraints/guards;
   independently replay full chain twice, prove drift rejection and unchanged
   financial/Track A state. Do not fold unrelated baseline repairs into this slice.

Later separately approved work: canonical receipt/narrow writer with exact rule/
evidence admission, DTO+SQLite projection, participant compatibility, old read
adapters, then bounded activity/Stay/transport activation. Role grants/functions
must be installed atomically with admitted paths/guards and their acceptance, not
temporarily open a service-role DML bypass. Numeric windows and Booking deferred.
Rollback means disable canonical commands and retain facts; no drop-to-lossy schema.

## Q. Risks/unknowns

- **Biggest risk:** deployed external writers and role privileges remain unknown.
  Contract rejects their rich mutation by default; activation needs authorized
  verification that application identities cannot bypass guards/bulk protection.
- Resolver/rule-data identity must be verifiable; local platform opaque timezone
  version cannot justify claiming a reproducible accepted interpretation. Keep
  command activation off until a tested rule identity/binding is available.
- FieldEvidence/manual receipt persistence is not implemented. Opaque references
  without admitted durable binding do not make canonical provenance ready.
- Row guards may reject legacy Member/profile/Trip/reservation/day deletion that
  impacts a canonical aggregate. This behavior is explicit; no lifecycle redesign
  or relaxed cascade exception hidden in migration. Owner review required.
- Canonical writes initially UNASSIGNED; actual participant compatibility remains
  separate. Assigned golden scenarios from B-T1/B-T2 need that gate before product
  activation. Version1 storage can represent them, disabled adapter cannot write them.
- Local scheduled_date NOT NULL requires a later preserving rebuild for undated
  canonical objects; older binaries cannot safely edit the richer local schema.
- Numeric windows, unsupported provider details and >microsecond precision require
  evidence retention and later typed support, never silent reduction of source facts.
- Trusted DBA/DDL can bypass runtime protection; that capability is outside API
  identity guarantee and must remain unavailable to service/application roles.

No design requires replacing Person IDs, changing B-T1 intent, implementing SQL,
remote evidence, final Booking lifecycle or a generic Artifact model. No stop
condition arose in this design. Human acceptance of the guard impacts remains
pending; impossible all-writer isolation would block activation, not invite a bypass.

Financial non-interference: no Expense/economic_date/financial occurred_at/FX,
Settlement cutoff/frozen input, Review fingerprint or Personal Payment semantics
changed or reused as schedule truth. No financial document/source mutation. No
observed/live GPS unification, UI, routing, recurrence or command framework.

## R. Recommended implementation slice

After owner review, explicitly authorize only **protected server persistence
foundation** from P: one migration with exact nullable additions/transport table,
guards/constraints/role isolation, no executable canonical command or application
writer. Its completion must include real-role adversarial local acceptance, full
replay/manifests, byte-equivalent old-row/identity/financial evidence and a separate
review gate. Do not begin SQLite/API/command activation automatically.

This contract is the review handoff; only this file is created. No current-state,
ADR, approved B-T1/B-T2 or C/A contract rewritten under the one-file request.

## S. Acceptance matrix

| Criterion | Evidence | Result |
| --- | --- | --- |
| Correct clean worktree/branch/baseline | Startup pwd/branch/HEAD/status and log | PASS |
| Exact version/shape/quality/basis/DST vocabulary | B/C, nullable legacy versus explicit UNKNOWN | PASS |
| Exact independent start/end fields | B expansion/types/combinations/W/L | PASS |
| All-day/unknown/exact/estimated distinguished | C/H/O2–6 | PASS |
| Qualitative label bounded, no numeric guesses | B/H/Q | PASS |
| Provenance/binding minimum exact | B recipe/ref limits,N Track C admission | PASS |
| planned_start/end population/null/source rules | D,H; source conflict and transport equality | PASS |
| Real revision/CAS and mutation set | E; no updated_at/create-version substitute | PASS |
| Exact endpoint table/roles/partial end/deletion | F; parent concurrency, final pair validation | PASS |
| Exact authored/accepted/candidate spatial separation | G; fields/types/input generation | PASS |
| Every new field's legacy/canonical/authority/writer/local rule | B/G catalogs and W/L conventions | PASS |
| Aggregate validity combinations explicit | H; 16 cases and same-Trip rules | PASS |
| Reachable writer inventory including service/RPC/grants | I/E1–E6; external unknowns explicit | PASS |
| Four protection options/decision | J; hybrid, reserved private writer disabled | PASS |
| Narrow/service writer downgrade/flatten/scope risk covered | J/O9–10/15/20; cascade/truncate paths | PASS |
| Exact legacy create/title/notes/day/time/location policy | K; direct DML versus admitted adapter distinction | PASS |
| Reservations unchanged and no automatic authority | L; association/refinement gate | PASS |
| Exact SQLite mirror, incomplete/dst/Stay/transport | M/H; preserving local rebuild, no number | PASS |
| Track A unchanged, revisions independent | N/E6; participant compatibility deferred | PASS |
| C-I1 consumed with opaque typed refs only | N/E8; no Source schema/Artifact duplication | PASS |
| At least 18 golden writer cases | O: 20 outcomes and later executable gates | PASS |
| One bounded migration order, activation disabled | P/R; exact contract, no implementation | PASS |
| Risks/unknowns and financial non-interference | Q; all-writer/rule/evidence gates | PASS |
| Only requested document changed | Final Git scope | PASS |
| No SQL/migration/code/test/config changes | Documentation-only tools/scope | PASS |
| No Production/Hosted Dev/remote/sibling changes | Local file/Git evidence only | PASS |

Coverage: **26 PASS / 0 PENDING / 0 BLOCKED**. Separate human review **PENDING**;
future guard execution, resolver/evidence admission, replay and activation are not
claimed passing runtime gates. No application tests/database replay performed.
Document checks cover sections A–S, all required catalog expansions, 20 golden
rows, references, binding/DST arithmetic and whitespace; final Git scope contains
only this report and HEAD/branch unchanged. No commit requested.

Production accessed: **NO**. Hosted Dev accessed/mutated: **NO**.
Migration created/applied: **NO**. Application code changed: **NO**.
Sibling worktree modified: **NO**. Remote accessed: **NO**.

**B-T3A CONTRACT COMPLETE — REVIEW PENDING. STOP.**
