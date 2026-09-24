# OTR Mobile 2.0 Offline Sync Design

Offline-first is a product requirement, not an implementation detail. The local database is the mobile source of truth. Cloud is a sync target. Opening the app must also be offline-tolerant: a valid local session and cached SQLite data are enough to enter the app.

## Core Flow

```text
User action
  -> repository validates command
  -> repository writes local data
  -> repository enqueues SyncOperation
  -> UI updates immediately from local database
  -> sync engine pushes when possible
  -> backend response reconciles local/server ids and versions
```

## Local Source Of Truth

The UI reads from local repositories backed by SQLite. Network state affects sync status, not whether the user can view cached trip data.

Offline users must be able to:

- View Today.
- View cached tickets, PDFs, QR codes, and confirmations.
- Add and edit expenses.
- Modify itinerary.
- Capture text/voice/document intent.
- Mark photos for future sharing.

## Offline-Tolerant Auth

App launch must not be gated on an online auth check. The app reads local session state from SecureStore/Keychain and enters the local app immediately when a local session exists. Background refresh/revalidation then decides whether sync can resume.

```text
App Launch
  -> read SecureStore session
  -> no local session: Login
  -> local session exists: open local app
  -> render SQLite data
  -> silently refresh token
  -> success: resume sync
  -> offline/failure: Offline Mode, sync paused
```

`AUTHENTICATED_OFFLINE` allows:

- Read local data.
- Write local data.
- Create expenses.
- Edit itinerary.
- Open cached tickets and documents.
- Capture input.
- Enqueue data/file/photo operations.

`AUTHENTICATED_OFFLINE` does not allow:

- Server mutation.
- Cloud upload.
- Fetching new team data.
- Pulling remote changes.

Network/auth refresh failures should not show blocking launch errors and should not send the user back to Login.

## Initial Sync

After login and trip selection, bootstrap sync should download:

- Trip.
- Members and permissions.
- Today and nearby itinerary window.
- Ledger summary and recent/all expenses depending on trip size.
- Travel documents metadata.
- Required document cache manifest.
- Sync cursors.
- Server clock.

Tickets needed for today and next travel day should be prioritized for local file caching.

## Incremental Pull

Use a backend cursor or server revision per trip. Pull changes by entity type with tombstones for deletes.

The pull response should include:

- Changed records.
- Deleted records.
- Current server cursor.
- Server time.
- Capability changes.

## Mutation Queue

Mutations are durable SQLite records. Each operation has:

- Local operation id.
- Entity type and local id.
- Operation type.
- Idempotency key.
- Base version.
- Payload.
- Attempt count.
- Next attempt time.
- Status and last error.

Operations should be ordered per entity but may be batched per trip when safe.

## Retry

Retry with exponential backoff and jitter. Auth, validation, permission, conflict, and network errors should be classified differently.

Network/server, response-validation, missing-code, plain, and unknown failures remain
retryable. After normal exponential backoff, unresolved work moves to sparse long-lived
retry and may be reactivated by recovery/upgrade/manual health events. Only allow-listed,
structured validation and permission codes become terminal/actionable `FAILED`;
conflicts become `CONFLICT`.

Dependent operations persist `dependency_operation_id` and remain
`DEPENDENCY_BLOCKED` until the causal parent completes. They make no network request and
consume no error attempt. Completion wakes them durably, including after process death.

## Read-only Data Health Scan

Phase B adds one account-scoped `DataHealthCoordinator`. A manual Settings check builds a
transactionally consistent in-memory manifest of protected local intent and runs a small
static set of indexed SQLite detectors. It may update only `data_health_state`; it does
not change domain rows, operation status/metadata, cursors, caches, files, or canonical
Settlement, and it never invokes sync, bootstrap, pull, repair, or Backend recovery.

The scanner captures both active account identity and in-process account generation.
Results are discarded if either changes. Future automatic scheduling may reuse the
stored throttle state and scope plan, prioritizing the active/recent Journeys and those
with suspicious protected work; Phase B adds no lifecycle timer or periodic scan.

## Data Health Phase C1 queue repair

The manual health workflow may make only three existing-operation metadata transitions:
recover an expired processing lease, wake a dependency whose completed parent and server
identity are proven, or clear a future sparse due time from an already retryable
operation. Each transition revalidates the deterministic plan inside its SQLite
transaction and records `APPLIED`; a rescan records `VERIFIED`. It does not run the
operation, call the Backend, change domain facts, or bypass normal auth/backoff handling.

## Data Health Phase C2 convergence

The manual health workflow now continues from C1 repair through the existing operational
sync and scoped Ledger refresh. It rebuilds the protected-intent manifest and revalidates
account generation before every network phase. Known auth pause or isolation stops the
affected network work; queue due time, sparse retry, conflicts, idempotency, and mutation
execution remain owned by the normal sync engine.

Incremental pull runs for affected Journeys and at most the highest-priority active/recent
Journey. Missing or explicitly invalid scoped cursors may use the existing scoped
bootstrap; a health run never resets all cursors or wipes SQLite. Ledger and Personal
Payment bootstrap/pull application retain pending, failed, dependency-blocked, conflict,
Review, and attachment intent through their existing repository protections. Recovery is
reported only after a final rescan verifies convergence.

## Idempotency

Every create/update/delete sent to the backend must include an idempotency key. Offline creates must include local ids so backend responses can map local records to server ids.

## Conflict Resolution

Default strategy:

- Non-overlapping field updates can merge if backend supports per-field patches.
- Same-field conflicts become `CONFLICT`.
- Deletes win over stale updates unless the delete is local and the server has newer critical changes.
- Expense amount, payer, participants, and split changes are high-risk and should ask the organizer to resolve.
- Itinerary notes/status may use last-writer-wins only after product confirmation.

Conflict UI is not Phase 0, but sync metadata must preserve enough information to build it.

## Delete

Use soft deletes locally and backend tombstones. Do not hard-delete syncable records until the backend confirms deletion and retention rules allow cleanup.

## Offline Create

Create local record immediately with a local UUID and `PENDING_CREATE`. Linked child records reference local ids. Backend push returns `server_id` mappings for parent and child objects.

### Phase 2A Expense Create

`createExpense` runs as one local SQLite transaction: insert the expense with `PENDING_CREATE`, then enqueue one global `CREATE_EXPENSE` operation with the local expense id and an idempotency key. The UI receives the local entity only after that transaction commits.

The Phase 2A worker marks the expense `SYNCING`, calls its isolated create transport, then records the returned `server_id` and `SYNCED`. On transport failure it leaves the record in SQLite as `FAILED`; the global operation becomes `RETRYABLE` with incremented retry metadata. A later retry updates the same local row rather than creating another one.

### Phase 2B Itinerary Create

Itinerary creation follows the same transaction pattern, with `CREATE_ITINERARY` stored in the global queue. Demo workers filter the shared queue by entity and operation type before processing, so an Expense harness cannot consume an Itinerary operation and vice versa. The Itinerary repository always accepts a `tripId`/Journey id and only returns records for that scope.

### Ledger 2.0 Stage 2 Local Foundation

Ledger 2.0 writes use the separate `ledger_*` SQLite family described in ADR 0009. A repository transaction writes the parent Expense, participants, exact
splits, valuation snapshot, optional payer PaymentRecord evidence, immutable
local audit event, and one typed generic operation:

- `LEDGER_CREATE_EXPENSE`;
- `LEDGER_UPDATE_EXPENSE`;
- `LEDGER_DELETE_EXPENSE`;
- `LEDGER_RESTORE_EXPENSE`.

The operation payload contains the stable local Expense id and aggregate
revision. It is intentionally durable but inactive in Stage 2. Stage 3 will
add an authenticated Ledger worker and incremental pull path. This preserves
the local-first guarantee without pretending that the Phase 2A compatibility
worker can synchronize a Ledger 2.0 aggregate.

Phase A coalesces Expense edits into an unattempted CREATE. Once CREATE was attempted,
its payload and idempotency key are immutable: the original CREATE replays first, then
one compacted current UPDATE runs after the remote identity is known. UPDATE, DELETE,
RESTORE, and evidence that require that identity remain dependency-blocked meanwhile.

## Versioning

Use server versions or revisions for syncable objects. Each mutation includes the base version known at edit time. Backend returns accepted version or conflict payload.

## App Restart

On app launch:

- Open local database.
- Resume queued operations.
- Recompute derived sync status.
- Refresh auth if possible.
- Pull latest changes if online.
- Continue file downloads/uploads from durable queue state.

No successful user write should be lost due to app restart.

## Account-scoped FX reference cache

Personal Payment FX projections are read-only Mobile mirrors. Offline writes
persist only original Money and `economicDate`; local estimates remain derived
from the account-scoped ECB snapshot cache and never enter mutation payloads.
New local Personal Payments also persist `economicDateSource = EXPLICIT`.
Unreviewed historical rows keep a null source rather than locally inferring one.
After reconnect, a matching confirmed projection replaces the estimate without
changing the original payment or its revision.

Mobile may cache the authenticated ECB reference snapshot bundle in
`ledger_fx_reference_snapshots`. The cache keeps at most 32 working-day rows per
account/provider/policy, survives restart, and is never shared across signed-in
accounts. Mobile does not contact the public provider directly.

Refreshing this cache is a read-through convenience operation, not a queued
business mutation. A network/provider failure preserves the previous validated
bundle and never blocks an offline Personal Payment. Snapshot expiry determines
when to refresh; it does not rewrite historical rates or canonical Settlement
facts. Slice B owns selection and provisional display semantics.

## Auth Expiration

Expired auth must not block local reads. New local writes can continue if the user had prior access to the trip locally. Push sync pauses until auth is repaired. If backend later denies access, local data should be locked or removed according to product/security policy.

Token expiry is not logout. Only explicit server rejection, revoked or invalid refresh session, disabled account, user logout, maximum trust expiry confirmed by the server, or a clear security event may transition the app to `REAUTH_REQUIRED`.

## Large File Handling

Separate queues:

- Data sync queue.
- File upload queue.
- Photo upload queue.

Files should support staged upload, retry, checksum/content hash, progress state, and cancellation semantics. Screens may display progress but must not own the lifecycle.

Documents and tickets needed for travel should have download priority over future photo originals.

## Sync Status UX

Every critical item should be able to expose:

- Saved locally.
- Waiting to sync.
- Syncing.
- Synced.
- Needs attention.
- Conflict.
- File not cached.
- Available offline.

Use plain language in UI. Older travellers should not need to understand sync internals.
