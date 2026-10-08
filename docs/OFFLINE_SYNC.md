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

## Data Health Phase D lifecycle scheduling

App lifecycle, connectivity, auth recovery, and normal sync completion feed one
process-local Data Health coalescer. Cold start schedules an indexed local check after
database bootstrap without blocking launch. Foreground/active-use checks respect the
persisted 15-minute cheap-scan and 24-hour deep-scan windows, except that indexed work
already due for convergence may trigger a scoped cheap run. Protected and future-sparse
work does not bypass the window. Reconnect-driven network convergence also has an
in-memory cooldown so flapping cannot reset sparse retry policy.

Automatic scans select only hinted or suspicious Journeys, plus at most the active/recent
fallback scopes for a deep or auth-recovery check. A healthy account stops after the
indexed detector and empty scoped scan. Normal-sync completion supplies its eligible
Journey scopes and health-origin sync suppresses another completion signal, preventing a
health/sync recursion. Every scheduled plan is invalidated by an account or generation
change. Manual Settings health uses the same coordinator and policy but may bypass the
ordinary scan cadence.

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

## Expense consistency closure — approved contract

ADR 0056 supersedes local-only server-conflict closure in ADR 0040. New UPDATEs
express user patches; no-op and attachment-only Save create no Expense command.
Only a matching receipt plus atomic reconciliation confirms a command. Both pull
and mutation responses preserve newer unresolved intent/tombstones and monotonic
canonical baselines. Dependencies use terminal disposition, not COMPLETED alone.
Deterministic Health evidence may propose equivalent closure through the ordinary
server-backed resolution path; it cannot declare a server OPEN conflict terminal.
These changes follow checkpoint Phase gates; Phase 1 does not enable recovery.

Formal v2 resolution reuses the existing worker/queue. The explicit decision has an
independent immutable request/key, so blocked original commands cannot prevent it.
Response loss keeps that request for idempotent replay; original-command receipt,
covered closure, canonical reconciliation and queue completion commit atomically.
The decision's queue record drives its own UI feedback; ordinary Expense sync status
is not repurposed for resolution progress. Drift remains CONFLICT and requires a
fresh read plus a new choice. UI keeps routine reconciliation/FX refresh/retry and
normal server confirmation silent.

Phase 5 acceptance persists the original displayed-rate binding in the existing typed
valuation command. Offline explicit choices remain durable; reconnect and response
loss use the same operation/body/key. Server-verified compatible reference advancement
does not require a new choice. Financial/rate/Journey drift requires reconfirmation,
never a replaced revision plus blind retry. Explicit pending/retryable/failure feedback
is rehydrated from account-scoped commands; routine reference refresh stays silent.

Phase 6 closure reads and receipts use the same repository reconciliation boundary.
At equal Expense revision, local canonical evidence accumulates audit IDs and retains
later server aggregate/audit timestamps; an older feed snapshot cannot remove closure
proof or regress those times. Business fields and pending intent overlays remain
protected. Closed chains, including legacy equivalent UPDATE, converge through the
formal API without local-only repair or a second mutation.

## Trip Person completeness certificate — A1-I2B2

SQLite migration 43 extends the existing Account/Trip Ledger cursor row with the
seven I2B1 certificate fields. All-null metadata means unverified; non-null metadata
requires repository validation of versions, canonical exact ID set, timestamps,
token bindings and recomputed cached participation hash. Historical cached Persons
outside that set remain available. Cursor upsert preserves metadata; validity also
requires active cursor to equal bound cursor. Legacy responses cannot renew it.
Certified bootstrap/page application is one SQLite transaction, including cursor
and verification time. Immutable Account/Trip/generation context is captured before
credentials and checked through response/application; Account switching shares a
narrow apply gate through commit/rollback. Shared refresh cycles are serialized per
scope, with one recovery bootstrap and no recursive retry or new timer. Offline
known observation remains separate from current verification; observation time is
not revision ordering or a guarantee against a later server commit. Device restart,
empty-queue reconnect and two-device acceptance remain I2B3. See the
[I2B2 report](architecture/TRIP_CANONICAL_A1_I2B2_IMPLEMENTATION_REPORT.md).

## Canonical Event individual read mirroring — B-T3F

Individual B-T3E reads capture Account/Trip/generation before credentials/network.
The canonical Event repository rechecks that context under the existing apply gate
through root+endpoint transaction commit/rollback; the gate is never held across I/O.
Newer semantic revisions replace the mirror; identical equal revisions are neutral;
equal-revision B-T3A optional accepted Place UUID→null loss updates only pointers
when every other root/endpoint fact is identical. Other equal-revision differences
fail closed; older/withheld observations preserve cache. Neutral loss does not
advance semantic revision or observation metadata.
Offline reads use the same Account/Trip scope and return full READ_ONLY representations.
There is no canonical Event collection/snapshot seam in the central refresh owner:
no polling, completeness certification, cursor advancement or absence-as-deletion
is introduced. Existing legacy itinerary and financial/private sync paths are unchanged.

## A1-I2C3 participation exact recovery preflight (CLOSED)

A normalized participation intent can be explicitly retained in existing
`sync_operations` with stable Account/Trip/Person/key/body/digest. It is held as
DEPENDENCY_BLOCKED with null dependency/due time and a closed-capability reason;
existing pending/claim/dependency wake logic cannot dispatch this held intent.
No queue announcement, timer, worker, optimistic participation update or certificate
is created. The helper is not wired to UI or normal authoring/dispatch.

Exact authenticated GET recovery loads the stored body under a fresh Account/Trip/
generation context, releases the Account gate before network, validates exact
receipt identity and independently recomputes its result digest, then invokes the
existing I2C2 result/reporting barrier. Response loss, restart and unavailable GET
leave the operation unresolved; they never create a new key, POST fallback or
assumption of failure. Exact own-scoped `OPERATION_NOT_FOUND` / 404 is not proof
that a concurrent/uncommitted request failed. `REPLAY_UNAVAILABLE` / 503 likewise
preserves the same key/intent. Current Organizer loss returns
`PARTICIPATION_FORBIDDEN` / 403 with no disclosure and leaves pending intent intact. A→B→A is fenced. Atomic receipt/queue/row/all-seven certificate
application and bounded refresh remain owned by I2C2; financial/private cursors
and offline cached launch are unchanged. No SQLite or server migration is added.

## CP13A.2 import drafts and exact recovery (runtime CLOSED)

The explicit import repositories save reviewed pins, immutable command identity,
lineage decisions and queue records atomically before handoff. They use the existing
Account request generation/apply gate and current local Trip read observation;
retained reads/drafts need no token refresh or network bootstrap. Fresh dispatch
revalidates material/claim/dependency observations and persists UNKNOWN first.
Process loss and lease expiry cannot imply no-commit or allocate another Source/Event.
Exact receipt caching queues support finalization and never adds certified membership
or writes Day projections. Service mirrors require the current Event baseline.

Capture creates no Source automatically. Explicit NEW/REUSE/REPLACEMENT binds the
exact CP11 Capture revision, verified original bytes and reviewed Source identities.
REUSE needs selected material equality and admitted ancestry, with no fabricated
acquisition receipt. REPLACEMENT preserves prior material and checks Source CAS;
pending replacement does not advance the current manifest. Binary admission requires
the installed actual format/profile verifier. Unsupported material is withheld.
After restart an uncertain binding recovers its same Source operation and original
BLOB; Account A→B→A invalidates every old callback.

The scheduler always excludes `C_PREPARE_CONFIRMATION`, `C_EXECUTE_EVENT_SLOT`,
`C_FINALIZE_EVENT_SLOT`, `C_ADMIT_CAPTURE_SOURCE` and `C_REVOKE_EVENT_SLOT`, even
with a permissive caller filter. There is no worker/runtime adapter, IO retry,
upload/provider activation or global gate change. Revocation requests retain the
local CREATE claim until exact authoritative permanent-revocation observation.
The [implementation report](architecture/TRIP_CHECKPOINT_13A2_CANONICAL_FLIGHT_IMPORT_IMPLEMENTATION_REPORT.md)
contains acceptance evidence and the terminal CREATE receipt clarification.

## CP14 durable continuations, runtime closed

SQLite50 journals logical continuations and concrete attempts; `sync_operations`
remains the only scheduler/claim owner. Attempt reservation requires its retained
claimed queue row. Wait/wake and queue attempt_count create no model attempt.
Lease expiry never proves provider terminality or permits blind redispatch.

Account-gated local transactions revalidate manifest/Trip/material/Run/Candidate/
Event pins and publication fences. Owning admission/policy/budget/wait/recovery
callbacks perform local checks only, never external I/O under a transaction.
Exact task→attempt→call→usage→publication correlation is typed and tested with
synthetic closed seams. UNKNOWN requires trusted exact terminal recovery; retained
results survive meter loss and installation rollback, without model replay.

Maintenance anti-joins and FK-OFF guards retain referenced queue/evidence/Source
revision/Input/attempt responsibility. UNKNOWN is never age-deleted. Pruning and
material release need positive closure and separately approved custody/privacy
policy. No new worker, provider adapter, startup hook or device bridge is wired;
existing Event/Source/Import gates and five C scheduler denials stay CLOSED.

## CP14 C2 continuation wake adaptation (providers closed)

The approved `INTELLIGENCE_CONTINUATION_WAKE` v1 operation re-evaluates the referenced
SQLite50 task; it never invokes a provider. Account/task/fence/version references
produce one deterministic retained queue ID/key. Repeated signals coalesce; a later
signal re-arms the same completed row, and conditional claim/signal finalization
preserves signals arriving during processing. Queue completion means completion of
that evaluation pass, independently of intelligence, publication and metering.

The existing central operational-sync owner accepts a closed injected continuation
adapter for cold-start/reconnect scheduling and its existing queue timer. Intelligence
activity is separately typed and excluded from Ledger UI counts. No second scheduler
or default provider/startup factory is installed. All three waits and pass completion
survive file restart; RUNNING/UNKNOWN and queue retries require exact recovery rather
than redispatch. Executor/usage/router seams run outside Account gates and transactions;
local installation revalidates retained pins, and canceled/stale tasks preserve late
responsibility. Runtime/provider gates remain CLOSED. See the
[C2 report](architecture/TRIP_CHECKPOINT_14_AGENT_C2_CONTINUATION_RUNTIME_REPORT.md).

## CP14 A2 synthetic orchestration (real dispatch closed)

The C2 wake adapter can admit a decision-only outbound route; wake never invokes
the executor. Explicit harness execution requires local attempt admission, exact
Server83 reservation+durable START, fresh local/server authorization and eligibility,
and verification that the real dispatch root remains CLOSED. After asynchronous
synthetic-start work, exact call/START, server eligibility and retained identity are
rechecked, followed by a final local attempt/task/fence/Trip admission CAS. Only
successful COMMIT and synchronous Account-gate release hand off to the fake, with
no further admission await. Failure retains START/synthetic responsibility and
admits no retry/fallback proof. Every injected I/O seam runs outside SQLite
transactions and the Account apply gate. No new scheduler,
queue kind, central timer, startup factory or retry worker is installed.

The test-only harness retains result/usage before completion metering. Meter failure
leaves success/result intact with COMPLETION_PENDING; recovery and installation never
call the fake again. Lost START acknowledgement can recover only the exact durable
call/START plus positive synthetic undispatched proof, with C2 NOT_STARTED CAS.
Possible execution, timeout, missing callbacks and queue/lease retry preserve exact
recovery responsibility. Only admitted terminal failure can create a new linked
attempt/call; UNKNOWN cannot auto-fallback. Shadows never become current, install,
or consume active attempt/attention bounds. Account generation and C2 installation
pins still fence A→B→A, revoked Trip and stale Run/Candidate/Event observations.

These are **CLOSED SYNTHETIC EXECUTION ACCEPTANCE** facts. Real dispatch remains
Server83-authorized only and structurally closed; synthetic observations never
write another real dispatch authority or production usage ledger. See the
[A2 report](architecture/TRIP_CHECKPOINT_14_AGENT_A2_OUTBOUND_RUNTIME_REPORT.md).

## CP14 B2 inbound replay and local preparation (activation closed)

B2 adds no scheduler or local authority. Server83 retains external package,
invocation and confirmed-decision responsibility; admitted private material and
CP13B publication refs support exact proposal replay without the external client
resending evidence. Missing exact material fails closed. Refresh uses a new admitted
review_version, while exact completed-invocation and sealed-decision recovery
preserves historical facts and current authorization fences ordinary disclosure.

For every NEW ACCEPT/REJECT/DEFER, custody preparation and protected authentication
complete before final current-package and CP13B owning admission. A read-only owning
pin/revision transaction releases the Account gate synchronously into the exact
Server83 reservation call; no local transaction spans remote I/O. Stale final pins
return the existing review-refresh error without a decision or CP13A preparation.
Sealed historical recovery bypasses this NEW-decision gate and remains reauthorized.

After a real OTR_USER ACCEPT, Server83 decision IDs precede existing CP13A local
preparation. Preparation response loss recovers the same persisted Confirmation,
slot, Input map and C_PREPARE_CONFIRMATION operation after SQLite reopen. If exact
preparation evidence is absent after an uncertain decision reservation, report
UNKNOWN; do not repeat preparation or allocate replacements. Canonical response
loss follows unchanged CP13A receipt/recovery, never B2 direct Event writes.

`sync_operations` remains the sole scheduler and all five C denials remain closed.
Server/package/prepare acceptance does not assert canonical Event acceptance.
No automatic A2 enrichment, OTR model cost or public/OAuth/provider activation.

## CP14 final cross-path closure

[Final integration acceptance](architecture/TRIP_CHECKPOINT_14_FINAL_INTEGRATION_REPORT.md)
installs the existing C2 scheduler alongside inbound B2, including after SQLite reopen:
proposal and authenticated ACCEPT create no outbound task, wake, reservation or model
usage. A same-UUID package/task Account A→B→A test preserves independent responsibility
and invalidates old Account generations. Existing C2/A2 restart, UNKNOWN and final
admission races remain passing. Queue COMPLETED means reevaluation-pass completion;
domain attention/debug facts retain execution, metering, installation and review state.
No generic pending-sync or Ledger success substitutes for those facts. No new scheduler,
startup wiring, recovery policy, UI or notification delivery is introduced.

## CP15B CLOSED Flight dispatch handoff

The remote executor is an injected implementation on the existing continuation
worker seam. `sync_operations` remains the sole scheduler. No live factory is
installed. The synthetic TEST harness remains separate and production-unreachable.

Async request custody/secret readiness precedes protected reserve+START+hold and
exact START recovery. The existing repository repeats Account generation, current
material/Trip/owning admission and task/attempt/publication CAS locally. COMMIT and
Account-gate release precede synchronous handoff to protected mark-dispatch. Only
a durable MAY_HAVE_STARTED/RUNNING ACK permits one fixture transport; no network
I/O occurs under SQLite/Account/SQL transactions. Independent server freshness
checks reject pre-mark kill, deselection, grant/scope/Trip changes or failed budget.

Lost ACK, response loss, timeout, cancel after possible dispatch and host recovery
never establish nonexecution. UNKNOWN keeps its hold; queue/lease retries cannot
redispatch the same attempt. Durable private result custody precedes metering and
local installation. Meter loss retains the result for exact recovery/installation,
not re-execution. Post-mark Account changes fence publication while responsibility
and usage remain associated with the original Account. Holds retain their UTC
admission day across midnight and never auto-refund on missing usage/failure.

Only an explicitly bounded new same-provider attempt with trusted terminal FAILED
predecessor, durable completion, C2 responsibility closure and fresh policy/budget/
privacy/config admission can qualify. Default selected retry bound is one; no
automatic repair prompt, shadow or commercial fallback is installed. Five C denials
and CP13A canonical authority remain unchanged.

CP15B F1–F4: private custody recovery completes before current owning disclosure
admission. Exact current task/attempt/result and Account/Trip/material authority
are rechecked after custody/hash awaits; a final generation fence precedes evidence
return without another await. Installation keeps its independent existing fence.
Denied disclosure never erases retained responsibility or creates execution work.
SQL mark serializes Trip/membership authorization using existing C/Trip lock order;
winning mark retains possible-execution responsibility after later revoke. Immutable
holds retain digest-bound executing pins and mark checks current Security selection.
Schedule-derived costs are estimates; missing/ambiguous billing remains UNKNOWN.

## CP15B-LIVE-W CLOSED host transport and retained recovery

The existing C2 executor seam can be composed explicitly in a private DEV host;
`sync_operations` remains the sole scheduler. Startup provisions no workload/session
and stays CLOSED; no background poll, second worker, queue draining or inbound→
outbound activation is added. Host transport/one-shot gates cannot override Server84.

One retained acceptance identity plus Server84 fresh mark CAS fences restart. Lost
mark ACK, MAY_HAVE_STARTED and UNKNOWN never resend. Durable raw response precedes
parsing/result retention/metering/installation. After host interruption, exact raw
recovery revalidates call/request/config and current Account/Trip/material authority
and reuses pure parsing, original-span rebinding and CP13B; it never invokes transport.
F1's post-custody disclosure and independent installation fences remain mandatory.
Missing usage remains UNKNOWN, calculated schedule cost remains ESTIMATED and model
witness rejection never deletes incurred usage. No monetary policy is activated.

## Capture C2 local intake and recovery

Authenticated offline intake uses the current local Account/generation and SQLite
only. One data operation freezes Add N, registers the entire roster before native
reader I/O, retains the first verified content pin, then commits each CP11 original
and Input binding in one transaction. Reader I/O occurs outside the apply gate.
Known acquisition/quota failures retain safe item facts; uncertain writes require
exact submission-key/Input readback before any retry. Failed readback never proves
absence. Retained recovery actions keep their original request through lost ACK.

Hide/unmount does not cancel local durable work or delete accepted evidence. Process
termination stops transient execution; the registered same Job is available through
scoped list/read/reopen, with explicit local resume rather than a new scheduler.
Accepted items need no temporary URI. Pinned resume requires verified original
bytes; unpinned reacquisition is a new explicit submission with immutable lineage.
All phases retain one Account-generation fence; fresh A may reopen A's Job after
A→B→A, while old callbacks/actions cannot regain authority. No Source/Run/queue,
provider, upload, automatic startup/reconnect task or canonical mutation is added.
C3 Activity discovery is still deferred.
