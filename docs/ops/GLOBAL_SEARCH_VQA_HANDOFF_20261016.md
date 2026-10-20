# Global Search VQA — next Experience on-demand packet

Owner approved Modification Delta V1 / UI Blueprint V1 / Visual Reference V1.
Registered 2026-10-16; implementation belongs to independent Experience Session.
No new Session/worktree or duplicate Search UI task started by Coordinator.
Approved materials remain authoritative; this note does not redesign them.

## Baseline / ownership

Writable code baseline: main `6ab1a73` (includes TCL02 source40c0da6; default CLOSED).
Use latest integrated main at actual packet start; Coordinator supplies any newer
integration SHA. Preserve Experience-owned uncommitted preview/clock overlays.

Experience owns this packet's changes to:

- `src/features/trip-search/TripSearchScreen.tsx` and matching tests.
- `src/features/trip-search/TripSearchEntry.tsx` and matching tests.
- `app/search.tsx`.

Shared files: `src/ui/catalogs.ts`, shared native navigation/Shell/TripView callers,
`src/domain/trip/tripSearch.ts`, `src/data/repositories/tripSearchRepository.ts`.
Agree exact hunks/interface changes with Coordinator before shared edits. Do not
replace whole catalogs, Router, Foundation or consumer repositories.
Coordinator has no active Search UI writer. C4 uses Capture/local interpretation;
TCL02 uses Trip repository/creation, local Ledger identity and operational Sync.
Neither currently modifies the three Search presentation paths above. Candidate
interfaces are not integrated main. Shared Search consumer changes stay owning-side.

## Existing interfaces / precise gaps

- Entry contract: `MY_TRIPS | HOME | DAY`, optional current Trip. Existing presets
  and account-generation fences must remain. `/search` normal route already exists.
- Provider is account-scoped local `createTripSearchRepository`, accepted Core
  reader/proof validation, paginated `page` and `resolve`; preserve permissions,
  revocation/staleness checks and current Trip view restoration.
- Current categories are only `ALL | TRIPS | ITINERARY`. Ledger, Documents and
  independent Booking indexes/providers are not exposed by this Search contract.
  Do not invent their rows/counts or treat missing index coverage as zero matches.
- Current category counts are counts in loaded `SearchPage.results`; a non-null
  cursor means incomplete coverage. No independent complete cross-category count
  interface is provided. Reuse pagination truthfully or request a precise owning
  interface change; do not label loaded counts as full totals.
- Current Search screen has local in-memory query/filter/result state and opens
  existing Item detail after `resolve`; Recent Searches persistence is not in the
  provider contract. Experience may use existing approved account-local preference
  patterns; no business database migration or parallel Search storage platform.
- Item navigation must reuse existing authorized Item Immersive, preserving query,
  entry scope, filters, loaded rows/scroll and Back/Close state. No Booking Immersive.

No Backend Search, migration, Capture Import change or synthetic Runtime PASS.
Experience delivers code/review/directed Native VQA/commit; Coordinator integrates.

Resource note: AD5 currently contains Owner's saved Nelson Expense. Preserve its
App/DB/Session and existing8082 Metro. Do not switch its JS host while Owner is
operating it; agree a short resource window before a Search8083 preview. No A1A
or C4 model-probe target may be borrowed for Search. Search-only account-partitioned
recent preferences must not become Auth storage, result snapshots or cloud sync.
