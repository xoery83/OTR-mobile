# Itinerary Create Vertical Slice

## Scope

Phase 2B verifies a minimal Journey-scoped Itinerary create path only: title and date are required; start time, location, and notes are optional. It does not implement a planner, edits, deletes, ordering, maps, structured reservations, capture, AI, notifications, media, or Memory.

## Architecture And Schema

The `itinerary_items` migration adds local and server ids, `trip_id`, the five slice fields, sync status/version, and timestamps. `createItineraryItem(tripId, input)` inserts the item and exactly one `CREATE_ITINERARY` operation in the existing `sync_operations` table within one SQLite transaction.

Physical validation found one development database where migration 3 was recorded but the table was absent. Migration 4 repairs that historical state idempotently without resetting the database or modifying existing Expense data.

## Repository And Journey Scope

The repository exposes `createItineraryItem`, `listItineraryItems(tripId)`, `getItineraryItem`, and sync-status transitions. Every list query filters in SQLite by `trip_id`; the UI never filters a global itinerary list. The development Trip screen exposes isolated Journey A and Journey B contexts solely to prove this constraint.

## Sync And Retry

The shared queue is filtered by entity/operation type before a demo worker processes it. The fake transport returns `fake_server_*` on success and supports one controlled failure. A success reconciles the existing local row to `SYNCED`; a failure keeps it local, marks it `FAILED`, and leaves the queue retryable with metadata. Retrying reuses the same local id and operation.

## Manual Procedure

1. In the Stage 2 validation build, select Journey A, create an itinerary item, and run fake sync; confirm `SYNCED`.
2. In airplane mode, create a Journey A item; confirm it is `Pending` and Diagnostics pending sync increases.
3. Force-close, then use the embedded-bundle Release build to cold-launch offline; confirm the item remains in Journey A.
4. Trigger `Fail next sync`, run the item, confirm `FAILED`, then retry and confirm `SYNCED` with no duplicate.
5. Select Journey B; confirm Journey A rows are absent, create one B row, then switch back to confirm isolation.
6. Copy only the approved SQLite file for a read-only check of itinerary `server_id`, `trip_id`, state/version, and queue retry fields; delete the copy immediately after inspection.

## Completion Status

Implementation, automated tests, and physical-device validation pass.

Physical validation completed on Leon's iPhone 16 Pro on 2026-09-09:

- A Debug build created Journey A data locally, exposed it immediately as `Pending`, and reconciled it to `Synced` through the fake transport.
- Journey A rows were absent from Journey B and returned unchanged when switching back. Independent Journey B creates remained isolated.
- An offline Journey A create remained available with its pending operation after force-close and an embedded-bundle Release cold start. Launch did not require Metro, network authentication, or a login redirect.
- A controlled transport failure kept the original row, persisted retry metadata, and reconciled the same row on retry without a duplicate.
- The Itinerary worker left a pending Expense operation untouched, and the Expense worker left a pending Itinerary operation untouched.
- Read-only SQLite verification reported schema version 4 and integrity `ok`. Journey A and Journey B each contained two distinct rows; all four rows were `SYNCED`, had matching `fake_server_*` ids, and had sync version 1.
- All four `CREATE_ITINERARY` operations were `COMPLETED`. The controlled failure operation retained `attempt_count = 1` and failure metadata; the other three had zero attempts. No Itinerary operation remained pending or retryable.
- Expense operations remained intact and completed. The temporary database copy was deleted immediately after the approved read-only queries.
- Final typecheck, lint, formatting, and 30 automated tests passed. Expo Doctor's 19 local checks passed; its two online metadata checks could not reach `exp.host` over the cellular hotspot. The same dependency set passed all 21 checks earlier that day.

During validation, the device database was found with migration 3 recorded but without `itinerary_items`. Migration 4 repaired that historical development state without clearing data. A regression test now covers this exact condition.

Current build revalidation completed on Leon's iPhone 16 Pro on 2026-09-11 with the embedded-bundle Release build:

- Online Journey A itinerary create and `Run itinerary sync` reconciled the local row to `SYNCED`.
- Airplane-mode Journey A create persisted through force-close and offline cold launch without a login redirect.
- Controlled `Fail next itinerary sync` produced `FAILED`, then the next retry reconciled the same row to `SYNCED` without a duplicate.
- Journey B initially exposed an empty `EXPO_PUBLIC_OTR_DEV_TRIP_B_ID` environment edge case; the validation hook now falls back when either Journey env value is missing or blank.
- Journey A/B isolation passed after the fix: Journey B rows were absent from Journey A and Journey A rows were absent from Journey B in the UI.
- Expense/Itinerary entity isolation passed: SQLite verification found zero expense operations with non-expense operation types and zero itinerary operations with non-itinerary operation types.
- Read-only SQLite verification reported integrity `ok`, schema version `5`, seven itinerary rows across the current device's Journey ids, all with non-null generated `server_id`, sync version `1`, and `SYNCED` state.
- All seven `CREATE_ITINERARY` operations were `COMPLETED`; two retained failure-attempt metadata from controlled retry checks. No itinerary operation remained `PENDING`, `PROCESSING`, or `RETRYABLE`.
- The temporary copied database was deleted immediately after read-only verification.
