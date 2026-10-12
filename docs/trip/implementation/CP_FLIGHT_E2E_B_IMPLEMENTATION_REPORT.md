# CP-FLIGHT-E2E-B Implementation Report

Date: 2026-10-12 (Pacific/Auckland). Status: **SCOPED SYNTHETIC ACCEPTANCE PASS**.
Baseline: `b5caa1f61cad1d8c612ee40142f3289f69715b5a`.
Branch: `codex/cp-flight-e2e-b`.
Implementation commit: `8e3916f4ae7848f83d442a891216e35b0f8eba3e`.
Worktree: `/private/tmp/otr-flight-e2e-b-20261012`.
Local commits only; no merge or push. Canonical remains at the accepted baseline.

## Narrow preflight

W0 `otr-trip-core-read/2` actor-filtered collection and Item views remain authoritative.
Core85–92, owning Core HTTP/read interfaces, SQLite54 complete-partition installer,
repository `refresh`, durable sync coordinator and `projectCoreDay` were integrated.
The Day Feed reader still read only the v1 SQLite47 projection. No additional
unintegrated Core read capability was needed for this bounded downstream slice.

## Implemented downstream seam

- `tripCoreV2Repository.acceptedSnapshot(ctx)` reads the complete installed v2
  certificate, accepted graph and Person bindings together under the existing
  Account apply gate and serialized SQLite transaction. It excludes pending
  predictions, validates the actor-projected graph and denies stale access/revocation.
- `createCoreFlightDayFeedReader(repository)` returns a version2 Flight projection
  with exact certificate epoch/revision/access generation, actor binding/roster
  hashes, Item views, accepted facts and typed Day row keys. Qualification and
  participation remain separate from visibility and temporal/spatial readiness.
- `readTripDayFeed()` uses the accepted v2 partition when present. Absent v2 data
  retains the v1 path; revoked/stale v2 authority fails closed without borrowing v1.
  Empty complete v2 partitions remain accepted empty, not missing data.
- The v2 query uses existing `projectCoreDay` local-date/role ordering, preserving
  Item UUID/revision and `(itemId,projectionRole,localDate)` occurrence identity.
  Query zone is validated but never rewrites accepted endpoint dates. Temporal
  tuples and accepted place pairs stay on ORIGIN/DESTINATION, never root coordinates.
- Existing Day Feed/P1/FlightRows components render the accepted data. Sparse
  Flights use the existing dated title row without fabricated routes or clocks;
  qualified Flights retain service attribution and accepted endpoint details.
  For v2 only, absent clock/name/terminal/duration rows are omitted, including large
  Focus and Immersive. Existing v1 geometry and G2/TTR query behavior are unchanged.

No migration, Canonical mutation, Capture/Source publisher, new sync engine,
TTR/MapKit, provider, localization or Composer ownership change was made.
This read presentation slice covers P2 Flights, not all v2 family renderers.

## Canonical → SQLite → Day evidence

Seven new downstream tests plus one v2 unknown-field rendering test pass:

1. Two distinct UUIDs are accepted through the existing Core command executor,
   sparse creation and same-ID qualification, with four immutable receipts in a
   synthetic owning admission/storage fixture. It is not a Source publisher or
   deployed PostgreSQL admission certification.
2. The actual authenticated Core HTTP handler and `createCoreV2Transport.collection`
   deliver the complete actor-scoped collection to repository `refresh/install`.
   Full registered SQLite1–54 runs against actual Node SQLite.
3. Repeated collection leaves exactly two Core Item mirror rows and zero SQLite47
   Day rows. After closing and reopening the file database, the actual production
   `readTripDayFeed()` factory returns both accepted UUIDs/revisions. No network
   call is required to reopen; a failed offline pull preserves those accepted rows.
4. Flights appear separately on 2026-12-17 and 2026-12-24. The origin Source instant
   is on the preceding UTC date; Core's accepted departure date remains authoritative.
   Both UTC and Pacific/Auckland view contexts retain the same occurrence keys.
5. Unknown destination dates, clocks, zones and coordinates remain unknown. Sparse
   rows invent no arrival/route/midnight. Qualified missing details create no empty
   third Flight row; large Focus omits unknown clock rows.
6. Independent accepted read fixtures preserve two distinct endpoint place IDs,
   coordinate pairs, zones, airport/terminal details and a next-day DESTINATION
   occurrence key. This fixture makes no geocoder or spatial writer claim.
7. Pending local intents/raw Candidate bodies never become accepted Items. Damaged
   collections do not replace the accepted partition. Wrong Trip, Account change,
   ABA callback, revoked access and newer access-generation fences pass.
8. A linked nonparticipating Person remains authorized. SELECTED_MEMBERS applicability
   retains the exact person IDs independently from GROUP visibility; another Actor's
   collection excludes the private sibling. No assumed participant or scope is added.

## Verification

- Focused11 suites: **180 PASS** (Core/Day repositories, collection transport,
  sync worker, Core views, v1 Day/G2/NOW/Faroe presentation regressions).
- `npm run typecheck`: PASS.
- `npm run lint` including `ui:guard`: PASS; no guard baseline changes.
- Touched Prettier and `git diff --check`: PASS.
- SQLite cold reopen, offline failed-pull retention and duplicate replay: PASS.
- Exact changed-file manifest: `CP_FLIGHT_E2E_B_CHANGED_FILES.txt`.
- Existing Canonical and concurrent Platform file hashes remain unchanged.
- Simulator/native/device/Hosted PostgreSQL execution: **NOT RUN / NOT CERTIFIED**.
  React static rendering uses native-component mocks; actual persistence is Node
  SQLite. No app-native cold-launch or unrestricted sync acceptance is claimed.

## Agent 3 interface and remaining F5/F6 gates

Agent 3 must finish publication/preparation/commands through Core authority and
return stable accepted Item UUIDs with their committed semantic revisions (the
same UUID after qualification). READY plans and raw Candidates are not Items.
The downstream interface is the existing authenticated
`GET /v2/trips/:tripId/core/collection`, returning `{manifest,pages}` with read2/
projection2, complete actor partition, exact hashes and PERSON_BINDING roster.
ITEM bodies contain registered root fields plus `trip_flight_intents`, typed
`itinerary_transport_endpoints`, `trip_endpoint_details` and services. Source
publication DTOs/private locators are not downstream read authority.

No missing W0 collection or participant-data contract was found. The existing
G2 UI has no new Mine/Group participant selector; this branch retains visible
Items and exact applicability metadata without inventing one. Broader family
renderers and separate participant-scope UX remain outside this slice.

F5/F6 are **not declared complete** by this bounded proof. Remaining handoff gates:

- Separate Owner integration decision for this branch; no automatic merge/push.
- Joined Agent 3 accepted-output → actual owning SQL read2 → local Day evidence,
  including exact accepted UUID/revision alignment. This slice did not wait for
  Capture and proves its synthetic downstream seam independently.
- Simulator/native app cold restart/offline/render validation; real original/supplier
  and device acceptance remain separate from static render/Node SQLite proof.
- Approved owning read principal, deployed-driver/Hosted/runtime provisioning and
  activation gates; Hosted Import, Provider, Mobile Runtime and Production remain CLOSED.

The repository does not define F5/F6 as named standalone contracts; these are the
remaining concrete handoff blockers, not an invented relabeling of Owner gates.
