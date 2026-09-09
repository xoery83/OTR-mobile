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

Network/server failures remain retryable. Validation and permission errors become `FAILED` and require user-visible repair. Conflicts become `CONFLICT`.

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
