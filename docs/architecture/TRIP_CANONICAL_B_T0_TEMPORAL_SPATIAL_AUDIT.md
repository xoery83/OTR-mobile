# Trip Canonical Track B — B-T0 Temporal / Spatial Audit

- Date: 2026-10-03 (Pacific/Auckland)
- Status: **B-T0 AUDIT COMPLETE — REVIEW PENDING**
- Working directory: `/Users/xoery/Project/otr-mobile-temporal`
- Branch: `trip/temporal`
- Audited HEAD: `c2f1ea38c11deaf5f59a3300e6a163985cc510d8`
- Initial `git status --short`: empty (clean).
- Scope: repository-source audit; only this report changes. No remote access,
  database connection, migration execution, deployment, device work, or sibling
  worktree modification. Legacy Web was not opened; its checked-in audit is reference.

## Evidence method and index

CURRENT means checked-in source/schema behavior at the above HEAD, not deployed
state. CAPACITY means declared storage can hold values, not that application
semantics or sync exist. RECOMMENDATION is a review input, not a final schema.
UNKNOWN means no sufficient source proof. Absence claims cover tracked repository
application/native code, contracts, migrations and schema inventories, not external
legacy services, live data or arbitrary JSON contents.

Baseline: `AGENTS.md`, `docs/CURRENT_IMPLEMENTATION_STATE.md`, `docs/PRODUCT.md`,
`docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/API_CONTRACT.md`,
`docs/OFFLINE_SYNC.md`, `docs/ENVIRONMENT_AUDIT.md`,
`docs/legacy/OTR_LEGACY_AUDIT.md`,
`docs/architecture/TRIP_CANONICAL_A0_AUDIT.md`,
`docs/architecture/TRIP_CANONICAL_A1_IDENTITY_MEMBERSHIP_CONTRACT.md`,
`docs/architecture/TRIP_CANONICAL_A1_I1_REPORT.md`, and
`docs/architecture/OTR_TERMINOLOGY_GLOSSARY.md`. Draft proposals and historical
validation claims do not override current source.

Complete-repository text searches covered the requested temporal/spatial symbols,
including date/time/zone, duration/all-day/recurrence, endpoints, coordinates,
provider and geocoding names. Source searches used `rg` and tracked `git grep`;
all migration files were searched for subsequent changes. Baseline table bodies
were additionally enumerated for spatial/time columns, including `lat/lng/GPS`.
No ignored credentials, private data bundles or generated build output were read.

SQL line anchors below are in
`supabase/migrations/20260910000100_canonical_production_baseline.sql` (B0) unless
another path is given. Symbols/table names are the stable evidence references.

| ID | Exact source / symbols |
| --- | --- |
| E01 | B0: `trips` (1098), `trip_days` (1078), day uniqueness (1285), date/day FKs (1326, 1335, 1437). |
| E02 | `src/domain/itinerary/types.ts`; `src/data/db/migrations.ts`: migrations 3/4 `itinerary_items`, migration 19 `local_owner_user_id`; `src/data/repositories/itineraryRepository.ts`: `validateInput`, `cleanOptional`, `selectItinerarySql`, create/status methods. |
| E03 | `app/(tabs)/trip.tsx`; `src/components/ItinerarySliceScreen.tsx`: `todayIsoDate`, `save`, item rendering; `src/hooks/useItinerarySlice.ts`; `src/data/repositories/defaultItineraryRepository.ts`. |
| E04 | `src/data/api/devSyncContracts.ts`: `createItineraryItemRequestSchema`, `createSyncResponseSchema`; `src/data/sync/devCreateTransports.ts`: `createDevItineraryTransport`; `backend/src/app.ts`: `routePattern`, `createEntity`, `createResponse`, `assertOriginalCreate`; `backend/src/serverId.ts`: deterministic ID. |
| E05 | `backend/src/supabaseGateway.ts`: `createSupabaseDevGateway.createItineraryItem` (1662), `findItineraryItem`, `canReadTrip`, `canWriteTrip`; inserted event fields and selected response fields. |
| E06 | B0: `itinerary_events` (287), `itinerary_reservations` (346), enum checks (1151–1163), indexes (1476–1489), reservation/day/place FKs (1323–1336). |
| E07 | B0: participant tables (277, 337), status/uniqueness checks (1148–1160), Member/User FKs (1320–1332), `can_manage_itinerary_event_participants`, `can_manage_itinerary_reservation_participants` (1790 onward). |
| E08 | B0: `places` (1022), spatial indexes (1576–1579); `location_resolution_status` (8); location field families on E06/E09/E10/E11 tables. |
| E09 | B0: `journey_live_locations` (472), `journey_map_objects` (483), type/visibility checks (1181), FKs (1352–1356), source indexes (1500–1502); `supabase/migrations/20260910000200_canonical_security_hardening.sql`: `can_share_journey_live_location`, live-location RLS. |
| E10 | B0: `journey_capture_events` (379), `capture2_media_uploads` (161; `captured_at`, `duration_seconds`), `media_assets` (665; `taken_at`, EXIF/GPS), `memory_entries` (731). |
| E11 | B0: `ledger_entries` (570; expense/start/end dates, two coordinate families, address/enrichment); `supabase/migrations/20260911000100_ledger_2_domain.sql`: `expenses.occurred_at/location_snapshot`; `src/domain/ledger/types.ts`, `src/data/api/ledgerMutationContracts.ts`, `src/data/api/ledgerReadContracts.ts`, `src/data/db/migrations.ts`: current narrower Ledger mirror. |
| E12 | `supabase/migrations/20260917000200_ledger_economic_date.sql`; `20260925000100_ledger_economic_date_completion.sql`: `ledger_complete_expense_economic_date_v1`; `src/domain/ledger/economicDateEvidence.ts`: date-only provenance; `src/features/ledger/LedgerExpenseEntryScreen.tsx`: date key/command; `src/domain/ledger/expenseIntent.ts`: `utcInstant`; `src/data/repositories/ledgerExpenseRepository.ts` and Backend normalization/comparison paths; `backend/src/stage9Import.ts`: imported occurrence midnight (1011). |
| E13 | `supabase/migrations/20260924000200_personal_payment_fx_projections.sql`, `20260924000300_personal_payment_fx_bounded_backfill.sql`; `src/features/ledger/PersonalPaymentSection.tsx`; `src/features/ledger/personalPaymentFx.ts`; SQLite migrations 33/34. |
| E14 | `src/features/ledger/LedgerStage6Screen.tsx`: `localToday`; `dashboardPresentation.ts`: `journeyLifecycleLabel/journeyPickerSections`; `src/domain/ledger/journeyContext.ts`: `isJourneyCandidate/chooseJourneyEntry/myLedgerPeriodBounds`; `src/features/ledger/format.ts`: date/range helpers; `searchFilters.ts`: `ledgerDateFilter`; `src/domain/ledger/reporting.ts`: `reportingDateBoundary`; `spendingAnalysis.ts`: calendar bounds; `src/features/ledger/loadMyLedger.ts`. |
| E15 | `src/domain/ledger/settlement.ts`: `buildSettlementPreview`; `src/data/api/ledgerSettlementContracts.ts`: `throughTimestamp/sourceAsOf`; `supabase/migrations/20260912000700_ledger_2_stage_7_1_settlements.sql`: source/finalization cutoff; `backend/src/supabaseGateway.ts`: current source and normalization. |
| E16 | `src/data/sync/itinerarySyncWorker.ts`, `itineraryDemoCoordinator.ts`, `transportSelection.ts`, `fakeItineraryTransport.ts`, `syncEngine.ts`, `syncOperationRepository.ts`; `ledgerOperationalSync.ts`: operational worker list; `src/data/auth/accountSwitchCoordinator.ts`, `accountLocalState.ts`. |
| E17 | `src/domain/trip/person.ts`; `src/data/repositories/tripPersonRepository.ts`; A1-I1 report D/E: canonical Member UUID, account-scoped context/generation and unavailable Account-link projection. |
| E18 | `backend/src/supabaseGateway.ts`: `readLedgerBootstrap` Trip name/date selection (6215) and DTO mapping (6320); `src/data/db/migrations.ts`: migration 11 Journey date/title projection; `src/domain/trip/types.ts`; `src/data/repositories/tripRepository.ts`: empty stub. |

## A. Executive summary

1. Trip bounds and `trip_days.day_date` are calendar dates, with no declared zone
   or agreed day-boundary model. Ledger has a working date projection; generic
   Trip repository is a stub. [E01, E18]
2. Mobile itinerary is a single required day plus optional text time/location.
   Backend labels the pair UTC without a conversion. Missing time is estimated
   UTC midnight, not an all-day event. Local display retains the original text,
   masking the difference from the stored instant. [E02–E06]
3. Events/reservations already declare nullable start/end instants and day links.
   They have useful span capacity, but no explicit endpoint zones, all-day,
   flexible-window, stay-night or cross-zone transport semantics. No working
   Mobile reservation/day mirror exists. [E06]
4. The only explicit stored timezone column is nullable
   `journey_capture_events.timezone` text. Its format is not constrained to IANA
   or offset, and it is not propagated to events. Device-local, UTC and server
   session dates coexist. [E10, E12–E15]
5. Server spatial enrichment is richer than Mobile: internal Places, free text,
   coordinates, provider metadata and resolution states. No provider match gates
   the implemented itinerary create; Trip destination is free text. [E05, E08]
6. Transport has one location, no first-class origin/destination pair or ordered
   route contract. Live GPS is a separate Account-keyed observation, not a planned
   Person location. No effective-location authority order is implemented. [E06, E09]
7. Track A's stable `journey_members.id` can already be referenced by retained
   itinerary participant tables. Their optional User references and CASCADE
   deletion remain compatibility/history hazards, not permission to change A. [E07, E17]
8. The visible Trip flow runs a fake-only validation coordinator. A Dev create
   adapter exists but has no production caller in this HEAD. There is no itinerary
   pull/edit/delete/tombstone/correction convergence. [E03–E05, E16]

**Largest time flaw:** unzoned wall-clock intent is assigned `Z` and persisted as
an instant, with no evidence of the intended zone. **Largest spatial flaw:** the
one-location itinerary projection cannot preserve transport endpoints or rich
server location/provenance, so neither round-trip editing nor expected location
at T is supported.

## B. Current temporal model map

| Representation / physical type | Meaning / category | Zone, inference, device effects | Round trip and local/server difference |
| --- | --- | --- | --- |
| `trips.start_date/end_date`: nullable PostgreSQL `date`; `Trip.startDate/endDate`: nullable string; `ledger_journeys.start_date/end_date`: SQLite `TEXT` | Root calendar bounds; presentation treats enclosing bounds inclusively, not a persisted lifecycle. | No zone, no UTC conversion required for date itself. `localToday` makes lifecycle device-dependent. | Backend date strings → Ledger SQLite preserve date labels; root destination and other fields absent. No general Trip create/edit round trip. [E01,E14,E18] |
| `itinerary_items.scheduled_date`: required `TEXT`; `scheduledDate`: string | Intended calendar grouping label; regex checks shape only. | No explicit/inferred place zone. UI defaults to UTC date (`toISOString().slice(0,10)`), not localToday. | Retained locally; Dev write replaces date+time with `planned_start`; no pull can recover the original date intent. [E02–E05] |
| `itinerary_items.start_time`: nullable `TEXT`; `startTime`: string/null | Unzoned HH:mm-like wall-clock intent, or unspecified. | Local repository accepts any nonempty trimmed string; Backend schema restricts 00:00–23:59. Backend assumes UTC. | Pair is not lossless as business semantics. Literal local time stays after response, but server gets instant; no zone/original wall clock retained separately. [E02,E04,E05] |
| `itinerary_events.planned_start/planned_end`: nullable `timestamptz` | Point or potential span endpoints; estimated flag on entire event. | Instants can have input offsets; no field preserves original offset/IANA zone/local date. Current Mobile writer always appends `Z`. | Database instant capacity, not exact input-string/zone retention; Mobile has no end, estimated flag, confidence or day projection. [E06] |
| `itinerary_reservations.starts_at/ends_at`: nullable `timestamptz` | Potential booked span; type includes hotel/flight/train/car/ferry/tour/restaurant/other. | No reservation or endpoint zones; `provider` is booking provider, not timezone or location provider. | No Mobile reservation contract/repository. Original local schedule cannot be recovered from instants alone. [E06] |
| `trip_days.day_date`: required `date`; unique `(trip_id,day_date)` | One date-only group, optional title/notes/order. | No day timezone; not proof of duration, all-day or overlap rules. | Events/reservations link to one day; no local table/pull. [E01,E06] |
| Local compatibility Expense `occurred_at`: nullable `TEXT` → legacy `ledger_entries.expense_date`: required `date` | Compatibility timestamp → UTC calendar slice; separate from Trip scheduling. | Gateway converts supplied timestamp to ISO UTC date, or uses current instant. | Loses time/offset; legacy row also declares nullable `start_date/end_date`, absent from Mobile compatibility create. [E11,E05] |
| Canonical `expenses.occurred_at`: required `timestamptz`; local `ledger_expenses.occurred_at`: `TEXT` | Compatibility occurrence/order/cutoff timestamp; selected calendar date can be encoded at UTC midnight. Not necessarily a measured occurrence. | New form selects device-local date; repo normalizes timestamp. Stage 9 date-only import encodes `T00:00Z`. | Instant survives normalized transport; precision/date intent is not recoverable without provenance. No Trip event time semantics follow from this. [E11,E12] |
| `expenses.economic_date`: nullable `date`; local nullable `TEXT`; DTO `economicDate` | Explicit attributed calendar day for financial valuation/reporting, independent of occurredAt. | No timezone calculation. Historical null remains unknown unless source-proven or confirmed. | End-to-end literal date; date correction advances current financial evidence, never frozen Settlement input. Not a stay/service date range. [E12] |
| Personal Payment `occurred_at`: `timestamptz`, `economic_date`: `date`, source text enum; local `TEXT` fields | Payment occurrence compatibility plus financial calendar attribution/provenance. | New UI currently uses UTC today and noon UTC plus explicit date. Old-client fallback derives UTC date and labels `LEGACY_DERIVED_UTC`. | Date and provenance travel separately; historical source may be null. No location/travel-zone authority. [E13] |
| `journey_capture_events.captured_at`: required `timestamptz`, nullable timezone `text`; `capture2_media_uploads.captured_at`: nullable `timestamptz` | Capture observation instant, separate from interpreted planned event time. | Capture timezone is unvalidated metadata; no Mobile pipeline propagation. | Retained schema only, not local capture-time round trip. [E10] |
| `media_assets.taken_at`: nullable `timestamptz`, `exif_json`: JSONB; `memory_entries.captured_at`: nullable `timestamptz` with now default | Historical media/capture observation; EXIF may retain opaque source metadata. | No typed photo zone/offset contract; conversion policy unknown. | No Mobile typed mirror; JSON capacity does not prove EXIF timezone interpretation. [E10] |
| Settlement `through_timestamp`, Preview `sourceAsOf`: `timestamptz`/validated ISO string; local `through_timestamp`: `TEXT` | Financial as-of instant and immutable source cutoff, not travel-day boundary. | Offset-aware request schema; normalized source; SQL compares `occurred_at <= cutoff`. | Current source/head/digest and frozen inputs bind cutoff; domain preview uses string comparison on normalized input. Preserve this domain boundary. [E15] |
| `created_at/updated_at`, geocode/verification/recording times; queue due times | Operational/audit/observation instants. SQLite uses ISO `TEXT`, server typically `timestamptz`; retry uses elapsed milliseconds. | ISO writes use UTC; server now uses database clock; device clock can affect local metadata. | Neither event schedule nor business day. Normalized instant identity differs from preserving submitted zone/format. [E02,E08–E16] |
| `capture2_media_uploads.duration_seconds`: double precision; chat voice milliseconds; OCR/runtime durationMs | Media/runtime elapsed durations. | No travel-calendar zone dependency. | Not itinerary duration. No explicit itinerary duration field/contract found. [E10; `src/native/receiptOcr.ts`] |

No agreed Trip start/end inclusivity constraint, date ordering constraint, or
nullable-bound lifecycle is established merely by the schema. Current presentation
is evidence of one consumer's policy, not canonical future stay/day semantics.

## C. Current itinerary temporal flow

Actual entry: Trip route → `ItinerarySliceScreen.save` →
`useItinerarySlice.createItineraryItem` → default repository → SQLite transaction
(item + `CREATE_ITINERARY`, operation payload contains local item ID) → manual
`runItineraryDemoSync` → worker → **fake transport** → local ID/status reconciliation.
The screen does not run Dev adapter just because the environment says `dev`.

Available Dev path, when explicitly composed with `getItineraryCreateTransport`:
worker → `createDevItineraryTransport` → authenticated POST
`/v1/trips/:tripId/itinerary-items` with idempotency key → request validation and
Trip-write authorization → deterministic actor/entity/key server UUID →
`findItineraryItem`/create → Supabase insertion → response ID/version/time only →
`markItineraryItemSynced`. No actual server connection was used here. [E03–E05,E16]

Exact gateway behavior:

```ts
const time = input.startTime ?? "00:00";
planned_start: `${input.scheduledDate}T${time}:00.000Z`,
is_estimated_time: input.startTime === null,
```

| Case | Proven outcome |
| --- | --- |
| Present `15:00` on `2026-10-03` | `2026-10-03T15:00:00.000Z`, estimated false. No place-zone conversion. |
| Missing in UI/domain | Empty/whitespace/undefined optional input becomes null through `cleanOptional`; Dev sends null. HTTP schema requires the nullable key; omitted JSON `startTime` is invalid. |
| Null time | `2026-10-03T00:00:00.000Z`, estimated true. Unknown time is fabricated midnight on server. |
| Explicit `00:00` | Same instant but estimated false. True midnight distinguished by flag; local model does not expose that flag. |
| Sorting | SQLite `ORDER BY scheduled_date ASC, created_at ASC`. A later-created 08:00 can follow an earlier-created 20:00; start time is not a sort key. Server has planned-start and order-index indexes, not an implemented Mobile sort policy. |
| End / duration | Gateway omits `planned_end`; schema defaults null. No local or request end/duration. |
| All-day | Explicit semantic flag/type absent. Null time does not mean all-day; `trip_day_id` is not set by this create. |
| Multi-day | No local end date/span. Server can hold an end on another date through other writers; this API cannot create it. |
| Validation | Local/date API regex accepts shape, not real calendar validity; local time not validated. HTTP time regex validates HH:mm; invalid calendar timestamp may fail persistence. No test here certifies PostgreSQL acceptance. |
| Reconciliation | Marks ID/version/SYNCED; does not apply server schedule or returned updatedAt. Local updatedAt becomes reconciliation time. Local date/time remains visually unchanged. |

### Local executable evidence

A dependency-free Node probe executed the **extracted current gateway method body**
with an in-memory service stub (no HTTP). It asserted the three mapping cases,
free-text location, omitted planned_end, and the repository's exact sorting SQL.
Node v24.18.0; result PASS. This proves inserted payload behavior, not PostgreSQL
execution, route validation, or full app operation. Reproducible mapping check:

```sh
node <<'NODE'
const fs = require('node:fs'), assert = require('node:assert/strict');
const source = fs.readFileSync('backend/src/supabaseGateway.ts', 'utf8');
const start = source.indexOf('    async createItineraryItem(id, tripId, userId, input) {');
const end = source.indexOf('\n    },', start);
assert(start >= 0 && end > start);
const body = source.slice(source.indexOf('{', start) + 1, end);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
let inserted;
const service = { from(table) {
  assert.equal(table, 'itinerary_events');
  return { insert(row) { inserted = row; return { select() {
    return { async single() { return { data: row, error: null }; } };
  } }; } };
} };
const run = new AsyncFunction('id','tripId','userId','input','service',
  'requireData','rowToStoredCreate','findOne', body);
(async () => {
  for (const [time, expected, estimated] of
    [['15:00','15:00',false],[null,'00:00',true],['00:00','00:00',false]]) {
    await run('event','trip','actor', { scheduledDate:'2026-10-03',
      startTime:time,title:'Audit',location:'Free text',notes:null }, service,
      async r => r.data, r => r, () => { throw Error('unexpected replay'); });
    assert.equal(inserted.planned_start, `2026-10-03T${expected}:00.000Z`);
    assert.equal(inserted.is_estimated_time, estimated);
    assert.equal(inserted.location_text, 'Free text');
    assert(!('planned_end' in inserted));
  }
  assert(fs.readFileSync('src/data/repositories/itineraryRepository.ts','utf8')
    .includes('ORDER BY scheduled_date ASC, created_at ASC'));
  console.log('PASS');
})().catch(e => { console.error(e); process.exitCode = 1; });
NODE
```

A separate Node diagnostic at `2026-10-02T12:30Z` produced UTC date October 2
but device date October 3 in Pacific/Auckland. The stored `2026-10-03T15:00Z`
displayed as October 4 04:00 Auckland, October 4 01:00 Sydney, and October 3
08:00 Los Angeles with the host timezone database. These are illustrative
conversions, not approved flight/check-in interpretations.

Attempted existing regression command:

```sh
npm test -- src/data/repositories/itineraryRepository.test.ts src/data/sync/itinerarySyncWorker.test.ts src/data/sync/devCreateTransports.test.ts backend/src/app.test.ts src/domain/ledger/journeyContext.test.ts src/features/ledger/dashboardPresentation.test.ts src/features/ledger/searchFilters.test.ts src/domain/ledger/economicDateEvidence.test.ts
```

Result: **NOT RUN**, exit 127, `vitest: command not found`. Dependencies are absent
in this worktree. No install, sibling dependency reuse, test/config changes or
remote access was attempted. Existing tests are source evidence only, not newly
passing validation. Audit coverage does not require implementation to remedy this.

## D. Timezone model

| Concept | Repository inventory / result |
| --- | --- |
| Trip timezone | Absent from trips, Trip DTO and Ledger Journey projection. |
| Event / reservation timezone | Absent. timestamptz is an instant representation, not retained endpoint-zone identity. |
| Origin / destination timezone | Absent along with typed origin/destination fields. |
| IANA timezone ID | No dedicated constrained field or runtime resolver. Capture text could contain one, but format/values are unknown. |
| Offset-only timezone | ISO timestamp input supports offsets in financial contracts; no separately preserved Trip/event offset field. Current itinerary input has neither offset nor zone. |
| Capture timezone | `journey_capture_events.timezone text NULL`; no format check/propagation consumer found. |
| EXIF timezone | Possible opaque exif_json contents; no typed source/interpretation contract. UNKNOWN, not another proven zone field. |
| Device zone | Implicit local Date getters/pickers/Intl formatting; no general Trip-aware zone selection. |
| Explicit display UTC | `ExpenseFxDetails.tsx:47`, `ExchangeRateLookup.tsx:291`, `SpendingAnalysisSections.tsx:647–648` use `timeZone: "UTC"`. These formatting options are not business zone fields. |

Date helpers are inconsistent by context, not one universal time model:

- `ItinerarySliceScreen.todayIsoDate` uses UTC today; `LedgerStage6Screen.localToday`
  uses device year/month/day. Lifecycle compares date labels inclusively; a partial
  bound can be a Journey candidate yet have no picker lifecycle label. [E03,E14]
- `formatLedgerDate` parses the leading calendar label into device-local midnight;
  it does not display a true timestamp converted to a selected Trip zone. Today/
  Yesterday labels depend on the phone. Range helpers use inclusive labels;
  search bounds encode an exclusive next-day boundary with `Z`. [E14]
- `searchFilters.localDay` and `localDateKey` use device date; calendar arithmetic
  uses UTC to preserve labels. `reportingDateBoundary` strips the midnight-Z suffix
  for date-string comparisons; it is not a zone resolver. [E14]
- `myLedgerPeriodBounds` mixes rolling 30×24-hour instants with device-local
  January 1 for YEAR, then serializes UTC; `loadMyLedger` uses device year. Spending
  analysis uses validated calendar labels/UTC arithmetic, not travel spans. [E14]
- Explicit financial `economic_date` stays literal, while other legacy/date-display
  fallbacks slice occurredAt. No Trip timezone can be inferred from currency,
  destination, GPS or Actor location. [E12,E13]

All `CURRENT_DATE` references in migrations were inventoried: baseline
`journey_exchange_rates.rate_date`, `journey_ledgers.exchange_rates_snapshot_date`,
`ledger_entries.expense_date` defaults; economic-date validation/eligibility in
`20260917000500_ledger_reference_valuation_guard.sql`,
`20260917000600_ledger_journey_currency.sql`,
`20260917000700_ledger_currency_preview_claim_fix.sql`,
`20260918000300_ledger_settlement_fx_preflight.sql`,
`20260918000600_ledger_settlement_publication_retry.sql`,
`20260924000200_personal_payment_fx_projections.sql`, and
`20260925000100_ledger_economic_date_completion.sql` (13 references total).
They use the database session calendar; no Trip-zone operand is supplied.
Remote session timezone and its deployment configuration are UNKNOWN.

| Future case | Current correctness / limit |
| --- | --- |
| A. Auckland hotel check-in at 15:00 local | **Not correctly expressed by Mobile create.** It writes 15:00Z (04:00 next day in the diagnostic). Server could store a manually converted instant, but not retain local check-in+zone intent or a service window. |
| B. Auckland → Sydney flight | **Not semantically complete.** Reservation can hold two instants, but endpoint places/zones and their local dates/times are absent; Mobile lacks end entirely. |
| C. Los Angeles → Auckland overnight/date-line flight | **Not semantically complete.** Two UTC instants can order elapsed travel correctly if supplied correctly; departure/arrival local dates, zones and day transitions cannot be proven/reproduced. |
| D. All-day activity | **Absent.** Day link/date grouping exists; unknown time maps to estimated midnight, not all-day semantics. |
| E. Unknown/flexible time | **Partial/unsafe.** Optional local time and estimated flag preserve some uncertainty, but backend invents an instant. No flexible window or distinction between unknown and approximate known time. |
| F. Multi-day accommodation | **Schema capacity only.** hotel reservation start/end can span days at one place; no night count, check-in/out rules, span projection or Mobile stay representation. |
| G. Device timezone changes while travelling | Stored date labels and UTC instants stay the same; default dates, lifecycle, Today labels and local-year filters may change. No canonical policy shields travel-day grouping or true local event display. |

## E. Server temporal capacity

| Primitive | Capacity | Implemented business semantics / bound |
| --- | --- | --- |
| Events | Nullable planned start/end: point, open endpoint, or arbitrary multi-date span; `is_estimated_time`, date/time confidence; status/order; one reservation/day link. | Narrow create writes start only; end ordering, endpoint completeness, all-day, flexible span and overlap behavior not established. An index does not enforce chronology. |
| Reservations | Nullable start/end: multi-day hotel stay or transport span numerically possible; type/status/provider/confirmation; one day link. | No local repository/API create/read/edit implementation; no check-in/out, departure/arrival, per-end uncertainty or per-end zone semantics. No reservation estimated-time flag; generic confidence is not equivalent. |
| Trip days | Unique required date per Trip and optional order. | Date grouping only. A span can link to one day, not all its active dates. No defined projection of crossed days or repeated daily event requirement. |

Both timestamps null can encode an unscheduled record at schema level; a day link
could give it a date label. This is not a implemented all-day/flexible contract.
No constraints establishing `end >= start`, positive duration, or closed/open
boundary conventions were found for these retained tables. There is no basis to
claim cross-timezone flights are solved by timestamptz alone. [E01,E06]

## F. Temporal semantic gaps

Classifications describe information needs, not new types/tables or final design.

| Concept | Classification | Evidence and minimum distinction |
| --- | --- | --- |
| Calendar date | REQUIRED | Root/day/financial dates already exist and must retain labels independent of conversion. |
| Local wall-clock + context | REQUIRED | User-entered event/check-in times cannot be silently assigned UTC; cross-zone endpoint examples require preserving context. |
| Instant | REQUIRED | Live/capture observations, server/audit metadata and financial cutoff already use actual instants. |
| Start/end span | REQUIRED | Server reservation/event endpoints and multi-day stay/transport scenarios require overlap, not point duplication. |
| All-day | REQUIRED | Requested activity case cannot be distinguished from unknown time; date membership must be explicit before Day projection. |
| Floating/unspecified time | REQUIRED | Optional start already accepted; must distinguish no known instant from estimated midnight. Whether truly zone-independent floating appointments are needed is UNKNOWN. |
| Estimated time | REQUIRED | Existing persisted flag and confidence must not be lost or confused with all-day. Exact granularity remains a design decision. |
| Service/check-in window | LIKELY | Hotel/restaurant/tour reservation capacity and 15:00 check-in scenario suggest earliest/latest/service timing; source does not establish policy. |
| Elapsed duration | LIKELY | Transport/stay spans require difference between elapsed hours and calendar nights; a separate persisted duration field is not yet justified. |
| Recurrence/occurrence system | NOT YET JUSTIFIED | No recurring Trip event contract found. Repeated hotel daily events are not a reason to build recurrence infrastructure. |
| Per-Person day/zone context | REQUIRED | Given Trip+Person+Local Date cannot select endpoints/day boundaries without a defined zone/context; no resolver implementation authorized. |

## G. Current spatial model map

| Representation / type | Classification | Scope, retention and gaps |
| --- | --- | --- |
| `trips.destination text NULL`; `Trip.destination string/null` | User-supplied business fact; display text | No Place/provider requirement; Ledger bootstrap does not select destination. Generic Trip repository returns no data. [E01,E18] |
| Local itinerary `location TEXT NULL` → event `location_name/location_text text NULL` | User-supplied text / display | Trimmed optional free text duplicated by gateway. No address, coordinates, place or resolution metadata locally. [E02,E05] |
| Event/reservation `location_name/location_text`, lat/lng doubles, location_status enum, confidence numeric, manual boolean | User input + resolved/manual enrichment | One location per object. Metadata allows unresolved/manual and resolved observations to differ conceptually, but no active Mobile enrichment lifecycle/overwrite rules. [E06,E08] |
| `places.id uuid`, normalized/display name, formatted address, city/region/country text, lat/lng doubles | Internal place reference + cached external/enrichment data | Nullable provider/place ID, confidence/source/raw_query text, raw_response JSONB, last_verified_at timestamptz. No immutable place-fact snapshot, cache TTL, freshness policy or provider-change reconciliation implementation proven. [E08] |
| `journey_map_objects` | Mixed display/planning/observation representation | Type includes hotel/booking/plan_item/route_point/live_location; nullable source_type/source_id, coordinates/accuracy, timestamp, metadata, owner Account, visibility plus enrichment. Type does not establish canonical event/location authority or an ordered route. [E09] |
| `journey_live_locations` | Live device position | PK Journey+User, nullable coordinates/accuracy/recorded_at, live flag/updated_at. Current observation slot rather than location history; no Mobile acquisition/push path found. [E09] |
| `journey_capture_events.gps JSONB`, timezone/captured_at | Historical capture observation | Opaque shape; no required GPS/zone validation or planned-location authority. [E10] |
| `media_assets.gps_latitude/gps_longitude`, taken_at, exif_json; enrichment family | Historical asset position + cached enrichment | Original GPS and resolved location columns coexist; no consumer proves precedence/correction semantics. Photo position does not locate all Trip Persons. [E10] |
| `memory_entries.location_name`, captured_at + enrichment family | Historical user text/observation/display | Linked day/event/reservation are optional. Retained legacy schema, not Mobile planning authority. [E10] |
| Canonical `expenses.location_snapshot JSONB NULL` | Historical financial-event snapshot capacity | No typed location schema or propagation through current editable/read DTO or SQLite mirror found. Data may exist server-side, but shape/content/usage UNKNOWN. [E11] |
| Legacy `ledger_entries.address_text`, latitude/longitude numeric(10,7), location_source; separate location_lat/lng doubles, text/provider/Place metadata | Historical financial location + enrichment | Two coordinate families risk divergence; no current authoritative precedence. Stage 9 allowlist recognizes these source fields, but transformed canonical Expense carries no new location snapshot. [E11; `backend/src/stage9Import.ts`] |

Shared enrichment fields on events, reservations, map objects, ledger entries,
media and memory: nullable `place_id uuid`, `location_provider text`,
`location_provider_place_id text`, `geocoded_at timestamptz`, `geocode_error text`,
`location_confidence numeric`; nonnull attempts integer default 0, manual boolean
false, resolution status default none. Allowed states:
`none/pending/resolving/resolved/ambiguous/failed/manual`. These describe resolution,
not permission or verified business truth. There is no proven confidence scale or
quality/freshness transition contract. [E06,E08–E11]

## H. Provider/enrichment boundary

| Creation target | Actual creation gate |
| --- | --- |
| Trip | Schema requires name, not destination/Place/provider. No implemented Mobile Trip create to certify UI behavior. Schema supports free text; not proof of external Web creation UX. |
| Itinerary event via v1 | Title/date/time validation + auth/Trip-write permission; location nullable free text, no external lookup. Gateway inserts no coordinates/Place/provider. **Confirmed free-text create.** |
| Other event / reservation | Retained schema requires Trip/title/type, not location/Place. No current Mobile reservation create route. Absence of schema gate proven; external legacy app workflow UNKNOWN. |
| Expense | Current create accepts financial/business facts without any location. Canonical location_snapshot nullable, no provider matcher in create. Legacy address/location nullable. An Expense is possible without selecting a Place; current UI has no typed location entry to claim. |

Business identity is object UUID, not Google/Apple ID. `places.id` is an internal
UUID; `provider/provider_place_id` are nullable text. No dedicated Google Place ID
or Apple Maps key/SDK location pipeline found. Booking `itinerary_reservations.provider`
and media storage provider fields are different concepts. [E06,E08,E10]

`places_normalized_country_provider_idx` uniquely keys normalized name plus
coalesced country/provider/provider-place ID: provider participates in deduplication,
so this is **provider coupling in cache identity**, not proof that one physical
place has one provider-independent OTR identity. Different names/providers may
produce separate rows; cross-provider equivalence and repair rules are UNKNOWN.

Object Place FKs use `ON DELETE SET NULL`, so deleting a Place does not delete an
event/reservation/map/media/memory/legacy Expense. Nullable provider text can become
stale without breaking the object UUID. Raw response is mutable cache evidence;
no expiry/refresh/verification service exists in this Mobile Backend. Free text and
resolved fields are separate in storage, but no supported lifecycle guarantees
that enrichment never overwrites user text. The observed narrow gateway preserves
input by copying it, not by an established global overwrite policy. [E05,E08]

Creation without provider matching is already compatible with schema and the
implemented narrow write. Future provider/entity matching as enrichment has no
need to become a creation gate; no implementation is proposed here.

## I. Origin/destination capacity

| Situation | Current capacity / missing information |
| --- | --- |
| Activity at one place | Event single-location fields fit; Mobile only retains text. |
| Transport A → B | Flight/transport classification and start/end instants exist, but one location and no role-tagged endpoints. A/B can be written in description/source text only; not queryable endpoints. |
| Accommodation at one place | Hotel reservation span + one location fits structurally; no Mobile stay/active-night/check-in/out semantics. |
| Route with multiple points | Many map rows may have type route_point and arbitrary metadata/source refs. No route ID/ordered-point/segment contract, route geometry or endpoints established. Polymorphic source UUID has no typed route authority. |
| Person physically elsewhere | Account live row can differ from itinerary place; that observation is not a correction to the plan. No arbitration/resolver. |

Flights, trains, ferries, rental cars and walks/drives cannot currently expose
separate first-class start/end places/zones through the itinerary API. Generic
JSON/source text can carry arbitrary content but is not a canonical model. [E06,E09]

## J. Effective-location inputs

No `resolveEffectiveLocation`, temporal spatial arbitration or priority/authority
algorithm was found in the current tracked runtime. No such function was built.

| Signal | Available | Missing / conflict |
| --- | --- | --- |
| Live GPS | Server Journey+Account coordinates, accuracy, recorded_at/live flag | No Mobile tracking, expiry/freshness threshold, Person association, or history; stale/off may conflict with plan. |
| Current event | Server endpoints/status/participants/single place | Mobile no spans/participants/pull; local UTC mapping wrong for local intent; overlapping events and cancelled/skipped status require policy. |
| Transport | Category and possible two instants | No origin/destination/zones, current segment or expected in-transit meaning. |
| Hotel stay | Hotel reservation span/single place/participants | No active-stay semantics; daytime event and overnight base may both be valid. |
| Trip destination | Free text | Coarse, may list several cities; absent local operational projection; no automatic navigation or physical-position authority. |
| Planned route | route_point map capacity | No route continuity/order/time/Person association. |
| Manual text/pin | Free text/manual flag/coordinates | Unresolved text need not geocode; conflicts with old resolved coordinates/provider response need explicit provenance rules. |
| Photo/capture/Expense snapshot | Historical observations/capacity | Observation subject/time/accuracy can differ from queried Person/T; not current planned position. |

Current live-sharing RLS is an access rule, not a spatial priority rule. Group
ownership/visibility does not mean all Persons are at a map object's coordinate.
Manual location, planned location, observed location and provider enrichment must
remain distinguishable inputs during later review. [E01,E06–E11]

## K. Trip Person interaction

Track A direction is unchanged: `TripPersonId = journey_members.id`, scoped by
`trips.id`; `AccountUserId` is distinct. A1-I1 currently exposes only Trip ID,
Person ID and display name through an account-context/generation-checked local
read. Local projection cannot infer whether a Person links to an Account. [E17]

Retained event/reservation participants have their own row UUID, parent ID,
optional `user_id` and optional `journey_member_id`, participation status and
created_at. Member FK points directly to canonical Person direction; User FK
points to profiles. Status allows planned/confirmed/optional/not_going. Event
parent itself is nullable; reservation parent required. Uniqueness includes parent+
User constraints and partial unique parent+Person indexes when journey_member_id
is nonnull (`itinerary_event_participants_event_member_uidx`,
`itinerary_reservation_participants_reservation_member_uidx`, B0:1473/1485).
These prevent duplicate Member references per parent, but both identity columns
may still be null. No declared consistency, exactly-one-identity or same-Trip
constraint on participant Member references proves safe canonical participation. [E07]

These tables can list a subset or individual Person when Member ID is supplied;
there is no explicit whole-group selector or defined empty-list = everyone rule.
No local itinerary participant mirror or Mobile CRUD consumes them. Their current
management helper uses creator/owner/admin access; that does not redefine Person
participation as collaboration access. [E02,E07]

Live locations use `(journey_id,user_id)` and profiles FK; unlinked Persons cannot
produce an Account-owned live row. Joining observations to Persons requires an
explicit validated Account link from richer server context, not substituting
Actor UUID or matching name. Map owner_user_id is attribution/visibility, not a
Person participation list. [E09,E17]

Participant User and Member FKs use CASCADE, unlike financial-history retention
requirements. This is an existing compatibility risk for later lifecycle work.
No membership/access schema or identity policy was changed to resolve it.

## L. Day projection readiness

Query: **Trip + Person + Local Date → stay, transport, fixed/flexible events,
location transitions** is **NOT READY** as a lossless offline product query.

| Output | Useful server inputs | Blocking gaps |
| --- | --- | --- |
| Active stay | hotel reservation start/end, place, optional Person participant | Stay/night boundary and date/zone semantics, complete local mirror, participant scope/empty rules. |
| Transport | event/reservation categories and endpoints in time | No spatial endpoints/endpoint zones; no local end, date-line or segment policy. |
| Fixed events | planned_start/end, day FK, confidence/status | UTC-concatenation ambiguity, no explicit event zone/day policy, local start-time sorting and span semantics. |
| Flexible time | optional/null start, estimated/confidence, possible day FK | Unknown versus estimated versus all-day/window conflated; no local representation. |
| Location transitions | single event/stay place and route-point capacity | Endpoint continuity, overlap resolution, observation versus expectation, Person association. |

Persistence/semantic blockers precede UI. `trip_days` is useful grouping evidence
but cannot answer spans overlapping multiple local days. A multi-day hotel must
not be assumed to require repeated daily events; current data does not mandate
that representation. Exact overlap inclusivity/exclusivity is a future decision.
No Day View, projection engine or new identity is authorized by this audit.

## M. Offline/sync reality

| Concern | Current evidence / readiness |
| --- | --- |
| Local write | Item and CREATE queue entry commit together; owner Account persisted. Device restart preserves rows in SQLite. Real local-first foundation, narrow payload only. [E02] |
| Queue / worker | Global account-owned pending/due queue, claims/recovery and engine generation checks; worker supports CREATE_ITINERARY only, reads item, marks syncing, pushes, marks synced/failed. Itinerary item states omit conflict/delete. [E16] |
| Visible coordinator | Manual fake-only run, hardcoded online state for validation, attemptCount×30s retry. No proof of production auth/lifecycle/background scheduling. [E03,E16] |
| Dev adapter | Typed bearer POST, existing authenticated client, response validation/idempotent replay adapter. `getItineraryCreateTransport` has no non-test caller connecting it to normal Trip UI; operational Ledger worker list omits itinerary. [E04,E16] |
| Server write | Authorized v1 event insert; deterministic actor/entity/key UUID and existing-row replay; response version always 1, not event revision/CAS. Response-loss adapter/tests exist. No body-hash equivalence for changed same-key create beyond scope/creator check. [E04,E05] |
| Reconciliation | ID/version/status only; no schedule/location/participants/end hydration. Two local status/queue-completion operations are not one aggregate reconciliation transaction. [E02,E16] |
| Pull / bootstrap | No itinerary read transport, cursor/feed or local event/reservation/day/place hydrate. Ledger bootstrap has Journey bounds and Persons, not rich itinerary. [E18] |
| Edit / delete / tombstones | No local mutation methods, request schemas or worker operations. Retained event/reservation tables have status but no deleted_at/sync revision; cancelled/skipped are not proven deletion tombstones. [E02,E04,E06] |
| Corrections / collaboration | No itinerary revision/conflict/audit/correction contract; generic queue engine capability is not a full itinerary implementation. |
| Account isolation | Unconfirmed local items visible only to local_owner_user_id; queue filters owner_user_id. Synced item reads permit any active Account by ID/Trip condition, without ledger_actor_context admission check; owner cleared on success. Therefore complete per-Trip account admission is **not** proven for shared itinerary cache. [E02,E16,E17] |
| Account transitions | General switch increments generation, pauses/invalidate/bootstrap/restarts supported sync. Itinerary repository does not itself recheck generation across awaited operations like Person reader; fake coordinator is not registered as a drained production lifecycle. Pending ownership is useful, not proof of all transition races. [E16,E17] |
| Spatial sync | Only location text travels on CREATE. Places/maps/GPS/capture/media/reservations and Expense location_snapshot have no complete Mobile typed temporal/spatial sync here. |

**DEMO / VALIDATION SLICE**, with a reusable Dev create adapter; **not
production-complete itinerary synchronization**. Ledger's stronger convergence
is not evidence for itinerary and does not justify copying its financial complexity.

## N. Primitive classifications

Recommendations pending review; no retirement/migration is executed.

| Primitive | Classification | Rationale / boundary |
| --- | --- | --- |
| trips.start_date/end_date | KEEP | Useful calendar bounds. Preserve literal dates; define edge/day policy later without turning them into instants. |
| Local scheduledDate/startTime | REPLACE as future canonical contract | Keep existing slice as compatibility until approved replacement; narrow unzoned one-day pair cannot losslessly mirror server or scenarios. No destructive migration inferred. |
| UTC concatenation | DEPRECATE | Accepted temporary ADR 0007 behavior, proven unsafe for local intent. Replacement needs explicit semantics/provenance first, not a guessed conversion/backfill. |
| itinerary_events | EXTEND | Useful event identity, endpoints, status/confidence and links; future contract must preserve missing semantics and rich server fields. |
| itinerary_reservations | EXTEND | Useful separate booking/span capacity; absent endpoint/day/local mirror and interpretation. No Booking redesign here. |
| trip_days | EXTEND | Keep date-only grouping; clarify whose/local-zone day and cross-day projection. It is not the span authority. |
| places | UNKNOWN | Internal UUID/enrichment capacity useful; provider identity/deduplication/freshness and actual consumers unverified. No automatic canonicalization/removal. |
| journey_map_objects | UNKNOWN | Useful typed spatial/display capacity; source linkage and route authority insufficiently defined. Do not make it canonical plan data automatically. |
| journey_live_locations | KEEP observation boundary | Separate Account-owned live observation; freshness/Person linkage/local implementation require later work. It does not replace planned places. |
| Destination free text | KEEP | Root user fact; optional provider enrichment must not gate or rewrite creation. |
| Geocoding metadata | EXTEND | Preserve raw intent/enrichment/state/provenance distinction; define freshness/overwrite semantics only in later reviewed design. |
| Capture/media observation time/GPS | KEEP evidence boundary | Historical observation separate from schedule and current Person location; actual source zone interpretation remains unknown. |
| Financial economic_date / cutoff | KEEP | Distinct literal financial day and as-of instant already implemented; no Trip redesign recalculation. |
| Participant journey_member_id | KEEP canonical ID direction | Stable Trip Person reference; nullable User compatibility/scope/history need future explicit design, no remapping. |
| Fake Trip validation coordinator | DEPRECATE as product entry | Useful tests/harness, not planner/production sync; retire only after an approved replacement exists. |

## O. Collision risks

| Concrete risk | Evidence / consequence |
| --- | --- |
| Wall-clock intent assigned UTC | E05 / C probe: Auckland 15:00 becomes next-day 04:00 when treated as a local check-in. |
| Unknown time versus midnight/all-day | E02/E05/E06: null becomes real-looking midnight + estimate; neither unknown nor all-day contract can round trip. |
| Device day changes grouping/presentation | E03/E14: UTC itinerary default versus device lifecycle/today/year; raw storage does not change but derived selection does. |
| Assuming one Trip timezone | D: no such field/resolver; origin/destination cases need distinct contexts. Risk is a future shortcut, not an existing single-zone implementation. |
| Point/span conflation and repeated stays | E02/E06: local point lacks end; treating hotel as daily events loses one authoritative stay and check-in/out semantics. Repeated-stay implementation was not found. |
| Provider ID promoted to business identity | E08: provider enters Places uniqueness despite separate internal UUID. No current mandatory provider gate; a future requirement would break existing free-text creation. |
| Supplied text overwritten or stale enrichment trusted | E08–E11: separate columns/raw cache exist, but no lifecycle/precedence/freshness guarantee. No active overwrite defect is claimed without a consumer. |
| Lossy full-object Mobile write | E02/E05/E06: local omits end/status/day/reservation/participants/place/confidence. Current CREATE does not overwrite existing rich rows, but using it as future full PUT would discard information. |
| Missing transport endpoints | E06/E09: one location/no ordered route prevents transitions or endpoint navigation. |
| Live GPS mistaken for plan/all Persons | E09/E17: User observation slot differs from expected Person location and subset participation; stale/disabled observations have no arbitration. |
| Participant scope/history loss | E07: nullable dual IDs despite per-parent User/Member uniqueness, no same-Trip Member check and CASCADE references. Stable Person direction alone does not solve retention. |
| Shared itinerary cache admission gap | E02/E17: SYNCED bypasses local owner with no actor-context check. Future private Trip planner cannot inherit this as complete Account isolation. |
| Server dates mistaken for Trip day | D CURRENT_DATE inventory: DB session calendar used by financial eligibility/defaults; device UTC/local day can differ. |
| Financial date reused as location/stay authority | E12/E15: explicit economic day and immutable cutoff have different meanings; changing Trip calendar must not rewrite frozen evidence. |

## P. Unknowns

- Remote schema drift, live row population, timezone session settings and legacy
  writer/provider behavior: deliberately unverified; no remote access required.
- Historical event timestamp intent: UTC instant alone cannot recover local wall
  time/zone/all-day/unknown intent. Review may require separately authorized evidence;
  do not infer or silently repair existing rows.
- Capture timezone actual format/quality, EXIF offset extraction, provider payload
  contents, confidence scale, geocoding transitions/freshness/overwrite policy.
- Reservation/day/spatial pipelines outside this Mobile repository; retained
  schema and historical docs are not proof of active business implementation.
- Exact day/span boundary conventions, stay nights/windows, endpoint date rules,
  overlapping plan priorities, cancellation and flexible/all-day semantics.
- Participant empty-list/whole-group meaning and how old User-only/null/duplicate
  rows map safely to existing Trip Persons without guessing.
- Account/live Person linkage availability offline; observation expiry/consent/
  history rules; multi-provider Place equivalence/staleness repair.
- Existing Vitest regressions were not executable in this dependency-free worktree;
  full-route/native/SQLite integration and remote PostgreSQL behavior are not new
  validation claims. Source mapping and local Node probe did execute.

Material local/server semantic mismatch is proven. Per the stop condition, no fix,
final schema, identity alteration or implementation follows. These unknowns bound
the audit; they are not invitations to access Production or expand this phase.

## Q. Recommended next design boundary

**Recommendation only: B-T1 — Temporal / Spatial semantic contract, design-only,
after B-T0 review and explicit authorization.** First decide meaning and preservation
for literal calendar dates, wall-clock context versus instants, unknown/estimated/
all-day and spans, and two transport endpoints. Include Auckland/Sydney/date-line
cases, span/day overlap and stable device-zone behavior as review examples.

Then bound the minimum free-text location + optional enrichment/provenance contract,
planned versus observed location and Trip Person participation. Classify legacy
ambiguous values and lossless local/server projection before proposing persistence.
Keep `trips.id` and `journey_members.id`, Account/access distinction and financial
history intact. If solving B requires changing Track A, stop for that decision.

This is not permission for B-T1, Booking/Itinerary redesign, Day View, an effective
location resolver, a geocoder, migrations, dependency additions or sync rollout.
No current-state/historical design document was updated because this request permits
only the audit report.

## R. Acceptance matrix

PASS means the audit answered with source evidence, including explicit absence or
bounded unknown; it does not certify feature completeness, deployment, or review.

| Criterion | Evidence | Result |
| --- | --- | --- |
| Trip date semantics mapped | B/E01/E14/E18; literal date bounds and device lifecycle | PASS |
| Local itinerary date/time semantics mapped | B/C/E02–E05; TEXT/nullable time/validation/sort | PASS |
| Server event span semantics mapped | B/E/E06; nullable endpoints and missing policies | PASS |
| Reservation time semantics mapped | B/E/E06; span capacity versus no Mobile implementation | PASS |
| Trip-day semantics mapped | B/E/E01; unique date and single-day links | PASS |
| UTC concatenation behavior proven | C/E05; executable extracted-method three-case assertions | PASS |
| All-day behavior proven or explicitly absent | C/D/E/F; no flag/contract, estimate not all-day | PASS |
| Multi-day support proven or bounded | C/D/E/L; server capacity, local absent | PASS |
| Timezone fields fully inventoried | D/E10; tracked runtime/schema search, capture-only text, opaque JSON unknown | PASS |
| Device timezone assumptions identified | D/E03/E14; UTC versus local defaults/labels/year and Node diagnostic | PASS |
| Cross-timezone transport limitations identified | D cases B/C; E/I no endpoint zones/local schedule | PASS |
| Location free-text behavior identified | G/H/E01/E02/E05; nullable text, no provider gate | PASS |
| Place/enrichment schema mapped | G/H/E08; raw response/state/provider/verification fields | PASS |
| Provider coupling identified | H/E08; internal UUID versus provider-aware uniqueness | PASS |
| Origin/destination capacity mapped | I/E06/E09; one place, no first-class endpoints/route | PASS |
| Live location separated from planned location | G/J/E09/E10; Account observation and plan distinct | PASS |
| Participant/member spatial references mapped | K/E07/E17; canonical Person, optional User, owner/live Account | PASS |
| Day projection blockers identified | L; semantic/persistence/Person/spatial blockers | PASS |
| Current itinerary sync completeness documented | M/E02–E05/E16; fake entry, unused Dev selector, no pull/edit/delete | PASS |
| Existing primitives classified | N; KEEP/EXTEND/REPLACE/DEPRECATE/UNKNOWN with bounds | PASS |
| Collision risks listed | O; exact source-supported risks and conditional future hazards | PASS |
| Unknowns explicit | P; no guesses about remote state/history/provider | PASS |
| No identity/access architecture modified | Only this report changed; E17 retained | PASS |
| No application/schema/test/config code changed | Final Git scope: report only | PASS |
| No migration created/applied | No migration edits or database commands | PASS |
| No remote mutation/access | Local source/files and in-memory Node only; no network/database tool calls | PASS |

Report verification: all A–R sections present; 26 required matrix rows; 55 full
source-file references resolve; the embedded reproducible mapping probe passes;
new-file whitespace check has no diagnostics. Final Git status contains only
this untracked report, and branch/HEAD remain unchanged.

Required audit criteria: **26 PASS / 0 PENDING / 0 BLOCKED**.
Separate gates: **human review PENDING**; optional existing regression execution
**PENDING (dependencies absent)**. No implementation readiness is implied.

Files changed: `docs/architecture/TRIP_CANONICAL_B_T0_TEMPORAL_SPATIAL_AUDIT.md`
only. No commit requested or created.

Production accessed: **NO**. Hosted Dev mutated: **NO**. Remote accessed: **NO**.
Migration created/applied: **NO**. Application code changed: **NO**.
Sibling worktree modified: **NO**.

**B-T0 AUDIT COMPLETE — REVIEW PENDING. STOP.**
