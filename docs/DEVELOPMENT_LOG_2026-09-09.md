# Development Log - 2026-09-09

## Outcome

OTR Mobile progressed from its approved architecture into a verified local-first native foundation and two narrow vertical slices. Both Debug and embedded-bundle Release builds ran on Leon's physical iPhone 16 Pro. No Phase 2C work or legacy Web UI migration began.

## Foundation

- Established the Expo SDK 57, React Native 0.86, React 19, and strict TypeScript project.
- Added the Today, Expenses, Capture, and Trip Expo Router shell.
- Implemented explicit SQLite migrations, repository-only local access, a durable shared sync queue, API boundaries, SecureStore-backed offline auth bootstrap, and a local file-cache abstraction.
- Added development-only Foundation Diagnostics for database initialization, schema version, auth state, network state, and pending queue counts.
- Persisted `ENABLE_USER_SCRIPT_SANDBOXING=NO` and the existing Apple team through Expo configuration so prebuild regeneration retains the working native settings.

## Physical Device Workflow

- Confirmed automatic signing for `com.xoery.otrmobile` with the existing personal team.
- Confirmed the paired iPhone, Developer Mode, iOS platform support, CocoaPods, physical install, and Metro connectivity.
- Verified that Debug builds require Metro for a cold launch because they do not embed the application JavaScript bundle.
- Verified true offline cold start with `npx expo run:ios --configuration Release --device`; SQLite data and pending operations survived replacement of Debug with Release and back again.
- Cellular tethering supports deployment and Metro but can prevent Xcode, npm, and Expo metadata downloads when macOS treats the connection as constrained.

## Phase 2A - Expense Create

- Added an atomic local Expense create plus one `CREATE_EXPENSE` queue operation.
- Verified immediate local display, online fake sync, offline create, restart persistence, controlled failure, retry reconciliation, generated server id, and no duplicate local row.
- Read-only device SQLite verification confirmed synced rows, version 1, completed operations, and persisted retry metadata.

## Phase 2B - Itinerary Create

- Added Journey-scoped Itinerary create and repository queries with required title/date and optional start time, location, and notes.
- Added an isolated `CREATE_ITINERARY` worker and fake transport using the shared durable queue.
- Verified online and offline create, Release offline cold start, controlled failure/retry, Journey A/B isolation, no duplicates, and bidirectional Expense/Itinerary worker isolation.
- Final read-only SQLite verification found two rows in each test Journey. All four were `SYNCED`, used matching `fake_server_*` ids, had version 1, and had distinct completed queue operations.

## Migration Incident

The physical database reported schema version 3 while `itinerary_items` was absent. Read-only inspection confirmed that migration 3 was present in `schema_migrations`, the table was missing, and database integrity was `ok`.

Migration 4 now repairs this historical development state with idempotent `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` statements. No database reset or data deletion was used. A regression test covers a database where migrations 1-3 are recorded before the repair runs.

## Final Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run format`: passed.
- `npm run test`: 30 tests across 16 files passed.
- Physical Debug build: passed.
- Physical Release embedded-bundle build: passed.
- SQLite integrity: `ok`; schema version 4.
- Expo Doctor: the same dependency set passed 21/21 earlier today. The final rerun passed 19 local checks; two online metadata checks could not resolve `exp.host` over the cellular hotspot.
- Legacy repository `/Users/xoery/Project/otr`: unchanged.

## Remaining Boundaries

- Expense and Itinerary transports are development fakes; production backend endpoints and authenticated scheduling are not implemented.
- Full Ledger behavior, itinerary editing/planning, Capture expansion, tickets/media, OCR, currency conversion, settlement, P2P, and Memory remain outside the completed scope.
- The native `ios/` and `android/` folders remain generated and ignored. Regeneration-safe native requirements live in `app.json` and `plugins/`.
