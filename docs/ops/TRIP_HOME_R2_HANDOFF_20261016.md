# Trip Home VQA R2 — bounded delivery

Baseline: `8ff13647aea2239571800e187de82dc9ac7129c0`.
Owner V1.2 text and R2 Delta are copied byte-for-byte under `docs/trip/`;
`TRIP_HOME_R2_MATERIALS_20261016.json` pins original attachments. The four existing
Widget business Deltas remain effective. Earlier explicit Owner confirmation
permits Undated Preparation reuse without inference or completion scoring.

## File ownership and order

| Track              | Owner                       | Scope                                                                                                                                                             |
| ------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A / P0             | Navigation Builder          | Root/tab/native Trip route, Bottom Shell, height context/helper and navigation tests. Frame only for needed inset work.                                           |
| B / P1             | Core/Day Builder            | Existing Core local read projection, Day/Today repositories/selectors and tests. No navigation or admission writes.                                               |
| Shared integration | Coordinator                 | TripScreen, LocalTripWorkspace final wiring, catalogs, registers, main integration and integrated Native QA. Other agents supply bounded patches for these files. |
| C / P2             | Existing Experience Session | Adaptive Host and Widget presentation after one principal Builder finishes. No Root/Shell/Core changes; shared-file changes handed to Coordinator.                |
| D / P1             | Coordinator owning module   | Trip basic write capability and Editor interface; do not substitute cover-only editing for a complete metadata editor.                                            |
| E                  | Coordinator read-only       | Existing cover asset/provenance inventory; no generation, download, provider or schema changes.                                                                   |

At most two principal Coding Builders. No parallel shared-file writes. No new
approval framework. P0 regression runs against the integrated App, including
cold/warm/offline root, empty Trip Day availability, bottom CTA and native edge
return. Static fixture screenshots cannot establish these results.

## Confirmed preflight facts

- Authenticated index currently renders standalone Today. My Trips opens Home
  with `setParams`, without a native stack entry; this explains the missing
  native edge-back capability but still requires integrated runtime verification.
- Day/Today use accepted reads; the real Sky City manual save is in Auckland
  weekend, not Nelson. The Core owner is retaining exact sanitized identities
  and testing a distinct local-manual committed read, never a forged certificate.
- Trip metadata has existing name/destination/start/end columns, a creation
  contract and cover selection. No installed Trip metadata update command,
  versioned update receipt or complete Editor exists. `PATCH /trips/:id` remains
  NEEDS_CHANGE in the API contract. Mutating an immutable CREATE payload is not
  a metadata update implementation.
- Real QA identity/data and existing AD5 installation remain reusable. Workbench
  loopback49184 and isolated418/8084 are outside this packet's Native operations.

## Editor interface gap

Name/date/destination editing requires an owning account/Trip-authorized offline
update command, durable pending update representation, version/idempotency and
reconciliation semantics, plus accepted creation mapping that preserves later
edits. Current creation/ledger initialization validates the original CREATE
payload against the local row. Directly changing those fields would break that
invariant. No migration or fabricated success is authorized by a UI handoff.
Existing local cover selection is valid but does not fill this complete Editor
gap. Report field-level capability honestly while the other Tracks continue.

## Cover discovery — nonblocking, read-only

Six bundled JPEGs total 2,977,071 bytes. Four are registered/selectable: city,
coast, mountain, cultural-oldtown. Fjord and roadtrip-desert are bundled but not
part of `BuiltInTripCoverId`/picker. Current fallback hashes Trip ID into three
generic assets, so unrelated destinations can share a cover. Manual selection
is stored locally and wins. There is no destination matching or tagging index.

Provenance is recorded in `docs/trip/implementation/TRIPS_COVER_A_PROVENANCE.md`
and `docs/trip/assets/cover-b-generation-manifest.json`; the existing asset review
does not establish exclusive rights or verified geographic depiction. These are
generated generic scenes, not authenticated destination photographs.

Minimum proposal: reuse the four registered assets first (zero new generation,
zero network/model calls and zero added asset bytes). A later bounded catalog
could register the two retained assets after type/selection compatibility review
and add a small explicit descriptor/tag table with deterministic stable matching.
Do not label a generic scene as a verified city landmark. New destination-specific
images need a separately chosen asset count, rights source and actual cost quote;
no price or generation spend is assumed here. This does not block P0/P1.

## Runtime status

All R2 checks initially NOT VERIFIED. Record IMPLEMENTED, WIRED, RENDERED and
NATIVE VERIFIED separately after integration. Owner visual review remains needed
before UX Accepted; no full appearance/font screenshot matrix at this stage.

## Integrated source checkpoint

P0 Root/native Home edge-return, authorized Home/Day/Ledger, live Shell inset
and local committed Day/Today wiring are implemented in the isolated R2 branch.
Review closed stale Ledger scope, pending Today certificate generation, completed
manual-item receipt readback and creator-before-first-certificate windows. Day
accepted/local scrolls now receive the same measured Shell inset. Tests71, types,
UI guard and scoped lint pass; these are code evidence, not Native acceptance.

More removes disabled Documents/Members/Settings placeholders. Existing local
Photos and cover selection remain functional. Standalone cover footer removal
and enabled Hero/metadata editor are still blocked by the owning metadata update
interface above; do not call cover-only tools a complete Trip Editor. Hero uses
the existing Ledger square-and-pencil icon. Existing pending-item diagnostics
remain a known presentation gap, not a second accepted Day Feed. Native testing
uses the integrated candidate and preserves A1A/418, Workbench and DEV data.

## Integrated Native checkpoint — 2026-10-16

Experience reports ce811ee on AD5: ordinary Debug cold Root/My Trips, Nelson
Home/Day/Ledger and real NZ$25 Finance scope, named-tab tap/natural height,
Auckland date-only committed SkyCity pending item/detail/Close, Reference
Preparation and Past Snapshot/item return observed. Past footer CTA scrolls
above Shell and opens first itinerary day. These are bounded reported Native
checks, not full UX acceptance or device-wide offline verification.

A real Reference Today failure exposed a cross-domain generation comparison in
Today Reader. Remove comparison of Core certificate generation to Auth session
generation; keep owning accepted/current-source checks, account/Trip scope and
Auth transition/tap guards. Different-counter/stale-tap regressions pass. Native
Today remains pending this fix. Known remaining visual defect: overlay toolbar
buttons overlap deeply scrolled body text. Experience retains Native evidence
under /private/tmp/otr-r2-native-evidence-20261016. No product data changed.
