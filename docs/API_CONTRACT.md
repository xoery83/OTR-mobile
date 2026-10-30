<!-- Import capability context repair, 28 October 2026 -->
Reviewed Source dispatch may read existing `GET /v2/trips/:tripId/core/capabilities?operationId=<uuid>`
for its exact durable operation. The normal authenticated Actor and Trip remain authoritative;
unknown/duplicate query keys and invalid UUIDs are rejected. The existing SQL resolves family
only from that Actor/Trip/operation slot. This read grants no Admission, READY status or Mutation;
all existing Source/Core guards still run. Manual requests omit operationId and are unchanged.

# OTR Mobile 2.0 API Contract Draft

## Universal existing Task context and Native consumer candidate — 24 October 2026

`GET /v2/import-batches/:batchId/interpretations?tripId=:tripId` is a read-only
discovery of an already-bootstrapped owning Task. It returns
`otr.backend.universal-context/1` with exact Actor/Account/Trip/Batch/Task IDs;
it never creates a Task, Source, Run or Provider call. Normal Auth/Trip read,
finite current capability, retained Source/request hash and current Task
publication/cancellation fences must pass. Missing reader/capability is503,
unavailable/mismatched identity404; response is `Cache-Control: no-store`.

Native uses this returned Task ID for the existing strict POST/idempotency key
or GET `/:taskId?tripId=...`. The existing authenticated Backend API transport
provides bounded JSON, normal token refresh and Account-generation fencing;
there is no Native Provider credential or new configuration source.
`universalImportContracts.ts` validates the frozen enriched candidate wire,
retaining temporary IDs, per-field Source evidence, readiness, optional Source
observations, Booking observations and Ticket `authority: NONE`.

`universalCaptureConsumer` requires all accepted C3 Batch inputs to be represented
with their exact original hashes before exposing results. Reopen recovery is
read-only; only an exact absent result allows initial explicit dispatch, and an
uncertain send cannot be blindly repeated. This is a transient projection of the
existing Backend Task, not a new queue, admission or local result authority.
Current candidate requires a legal Trip-bound owning context; an unassigned
Capture is retained but cannot invent a Trip/Task binding. UI installation,
real DEV/Provider and formal Review/Admission are not proven by consumer tests.

Settled-result recovery candidate (25 October): the same GET routes may be
mounted with a finite settled-only Host. Its POST is always closed. Recovery
requires the original retained raw response, exact Task/Attempt/Call/request
hashes, an immutable successful owning COMPLETION receipt, current normal
Auth/Trip access and current owning V2 Source qualification. It reuses existing
Task CAS/result installation, including legitimately completed work after its
original dispatch deadline; it never extends that deadline or calls Provider.
The explicit trusted Host selection is mutually exclusive with paid transport,
uses the fixed protected recovery config mount and expires within600seconds.
This candidate does not imply deployment, Native Results or Admission PASS.

## Trip metadata update — local implementation, Hosted port CLOSED

Authenticated `POST /v2/trips/:tripId/metadata` accepts strict
`{operationId,tripId,before,after}` and an identical Idempotency-Key. Both metadata
values contain existing `{name,destination,startDate,endDate}` only, retaining
Create validation/null calendar semantics. The owning updater must recheck current
creator/linked-owner authority, atomically compare the prior tuple, write the
existing fields and save an immutable operation receipt. A mismatch is409; client
values never confer membership or update authority.

`GET /v2/trip-metadata-operations/:operationId` returns only the current actor's
exact receipt, including actorAccountId and original before/after values; missing
receipt is404. Default startup returns503 `TRIP_METADATA_CLOSED`. The HTTP boundary,
transport and finite PG adapter exist, but its new owning SQL functions/receipt
store are not installed or Runtime-verified. Production/Hosted activation is not
implied. No cover sync or destination inference is provided.

## WP-TRIPS-DISCOVERY/INDEX — local Backend code integrated, runtime unchanged

Authenticated `GET /v2/trips?cursor=<uuid>&limit=<1..25>` lists only Trip IDs
found through the actor's creator, legacy Trip member or **linked** Journey member
relation. The Backend deduplicates stable UUIDs, rechecks each candidate with
the existing `canReadTrip` rule, then returns only
`{id,name,destination,startDate,endDate,createdAt}` and a continuation cursor.
The default page size is 20; errors fail closed. The response is private/no-store.
The existing `POST /v2/trips` create and per-Trip admission remain separate.
The Backend route is local main code only, without installed DEV endpoint evidence.
An isolated Mobile SQLite61 read projection/transport candidate now caches complete
bounded pages under Account fencing and merges summaries by stable UUID, but the
current My Trips UI does not consume it; all-accessible inventory remains partial.
Local pending Trip
rows retain their stable UUID and cannot be fabricated from this read. Any
protected Backend installation still requires its separate approved gate.

## WP05-D Trip creation port — implemented locally, runtime closed

`POST /v2/trips` accepts a validated bearer identity, `Idempotency-Key` equal to
the request's stable `operationId`, and exact Trip metadata
`{operationId,tripId,name,destination,startDate,endDate}`. Destination and calendar
dates may be null. The actor, owner membership and linked Person are never
client-provided. An exact retry returns the persisted result; changed operation
payload, actor or Trip UUID is rejected. `GET /v2/trip-create-operations/:id`
looks up that actor's durable receipt before an uncertain create retry and
returns404 only when no receipt exists. Both responses are private/no-store and
return persisted `actorAccountId`, `tripId`, `ownerPersonId`, `coreEpoch`, Core
revision/access revision and Trip metadata. They do not carry a Core collection
certificate or financial setup. The route remains503 CLOSED at normal startup
until its separate owning port is provisioned; no Hosted/runtime activation is
implied by this local contract.

## P2c dormant local Composer — Independent Review required

Owner approved the four minimal deltas in
[the accepted preflight](architecture/OTR_PLATFORM_P2C_INTEGRATED_C4_COMPOSER_PREFLIGHT.md).
`createCaptureBatchAssessmentComposer(database, importStore, getAccountId, dependencies)`
requires initialized SQLite52/53 and the owning Import store's identical connection.
It is explicitly injected, with no default runtime factory or application caller.

`assess(context,jobId,signal?)` accepts the original Account/generation and empty Trip
scope. Results discriminate APPENDED, EXACT_REPLAY, UNCHANGED, REASSESS_REQUIRED
(finite stale/CAS code), REJECTED (finite validation/resource/admission code),
INTEGRITY_BLOCKED, UNAVAILABLE, CANCELED and OUTCOME_UNKNOWN. Successful observations
return a five-field receipt `{accountId,batchId,jobId,revision,bodySha256}` and bounded
summary with `historicalOnly:true,currentAuthority:"NOT_ASSERTED"`. Unknown outcome
returns only its exact receipt; cancellation after possible COMMIT remains unknown.

`recover(context,receipt)` is read-only and returns exact FOUND with historical
summary, ABSENT, REVISION_CONFLICT, INTEGRITY_BLOCKED or UNAVAILABLE. Fresh original
Account generation can read history; stale callbacks cannot. No new revision is
allocated to replace an unresolved attempted append. Cold reassessment without a
receipt makes no recovery claim.

`readAssessment(context,jobId)` returns the separate AssessmentProjection:
UNASSESSED, OBSERVED with receipt/summary, INTEGRITY_BLOCKED or UNAVAILABLE. It
exposes only barrier, counts and closed authority flags, never source text, Candidate
payloads or locators. It does not alter C3 Job facts or subscribe to notifications.

Internal Adapter seams `observeForComposer(context,jobId)` and
`assertCurrentForAppend(context,seal,body)` retain private original-context admission
and whole-read-set validation in the existing SQLite52 transaction. The accepted
`assess(jobId)` still returns invocation revision1. SQLite52 adds only synchronous
`assertAppendActive` checks before NEW INSERT/pre-COMMIT; replay bypasses new admission.
C2/Import/Membership/Continuation ownership and all HTTP contracts are unchanged.

## Checkpoint 11 local repository contracts — owner review pending

No HTTP endpoint, server schema, role, credential or enabled capability changes.
The canonical Event repository adds only `withCertifiedCollection(context, task)`:
certificate, exact membership, roots, endpoints and fingerprint are validated in one
Account-gated SQLite transaction. The callback performs local work without nested
transactions or network I/O. Existing B-T3I apply/certificate semantics are unchanged.

The explicit Trip Day repository exposes prepare/install/rebuild, projection reads,
local-date/Today/Tomorrow queries, next comparable Event and unresolved candidates.
Date/now and IANA zone are explicit query inputs. Results distinguish
`CURRENTLY_MATCHES_SOURCE` from `HISTORICAL_ACCEPTED_PROJECTION`; neither is a server
freshness promise. Queries and rebuilds perform no network call or polling.

The local Capture repository exposes intake, bounded Account-scoped listing,
revision-fenced assignment/deletion and read-only `getForSourceHandoff`. Handoff
returns verified independent payload bytes and Capture metadata, without creating
Source, invoking a command/parser/provider or changing lifecycle. Module factories
use the existing local session/database and remain unwired to UI/startup. Participation,
Event and Source commands stay disabled; no activation gate is opened.

## Adjustment confirmation source transport

Confirmation preserves PostgreSQL JSON numeric precision in the source proof.
Service-only `ledger_adjustment_source_text_7_2c` returns the existing root/current
source as JSON text. Backend calculations retain the current preview representation;
the transaction receives lossless numeric JSON tokens. Source equality, cutoff,
head, digest and permission guards remain unchanged.

## My Ledger Reporting 2.0 lightweight read (local implementation)

`GET /v2/me/ledger` retains its existing `period`, `from`, `to`, `journeys`,
and `serverTime` contract and every existing per-Journey summary field. A new
optional `spendingFacts` array contains only authenticated personal Expense ID,
revision, Journey ID, category, economic/occurred dates, business/conflict state,
original currency/scale, and original-currency personal split minor units.
Clients that do not recognize the field can ignore it. The summary uses
occurredAt and Journey settlement currency; Spending facts use economic date
and original currency. No Settlement balance is inferred from `positionMinor`.

The read requires the read-only `my_ledger_lightweight_snapshot_2_0` database
function. It must be deployed before the Backend bundle using this route.

## Expense economic-date evidence completion (Dev, V1)

`GET /v2/trips/:tripId/expenses/:expenseId/economic-date` returns
`AUTO_SAFE` with a date/source/current revision only for approved retained
date-only evidence; otherwise it returns `USER_ACTION_REQUIRED` with no date.
`POST` at the same path requires a durable idempotency key and either
`{source:"USER_CONFIRMED_V1",baseRevision,economicDate}` or
`{source:"STAGE9_DATE_ONLY_V1",baseRevision}`. The latter derives its date
server-side. The command fills only a null economic date on an eligible current
Expense revision, emits an Expense audit/change-feed event, and returns the
canonical Expense mutation receipt. A frozen exact revision is rejected; a
later revision may proceed without editing its historical Settlement input.

Ledger 2.0 uses the frozen aggregate contract in
`docs/ledger/LEDGER_2_0_API_CONTRACT.md`. Existing Expense routes in this file
remain Phase 3B compatibility routes until each `/v2` vertical slice is ready.

Post-Phase-E Hosted Dev addition: organizer-authenticated
`POST /v2/trips/:id/settlements/fx-preflight` accepts optional
`{ forceRetry: boolean }` and returns
`{ claimed: number, accepted: number, unavailableExpenseIds: string[], pendingPublicationExpenseIds: string[] }`. It claims at most four Journey-scoped
historical-rate pairs through the existing shared B2 lease, then invokes the
unchanged guarded Phase C acceptance for up to four eligible Expenses. Mobile
may repeat bounded batches before requesting a fresh canonical Settlement
preview. `unavailableExpenseIds` identifies included Expenses whose trusted
historical provider result is terminally unavailable, for actionable rate review.
`pendingPublicationExpenseIds` distinguishes an unpublished same-day ECB rate from
terminal provider unavailability. Explicit `forceRetry` can advance one bounded
foreground batch of unpublished same-day attempts without changing the periodic
one-hour retry or canonical acceptance rule. This endpoint creates no Settlement and accepts no display estimate;
it is unavailable for non-organizers and Production is not deployed.

Settlement 2.0 Phase 3A extends the existing Review protocol with
`POST /v2/trips/:id/review-findings`. It requires `X-Review-Protocol: 2` and a
UUID `Idempotency-Key` equal to both `id` and `operationId`. The request names
one typed target (`EXPENSE`, exact `EXPENSE_SHARE`, `PERSONAL_PAYMENT`, or
`SETTLEMENT`), its current positive `sourceRevision`, and an optional note. The
server derives the reporter, validates current Journey membership and target
involvement, and returns HTTP `201` for the first durable raise or `200` for an
identical replay. Human Findings use the existing Review read/action routes;
personal ACK/DISMISS does not edit or resolve the source. A later source revision
resolves the human Finding explicitly while retaining it in Review history.

Settlement 2.0 Phase 3B adds `GET /v2/trips/:id/settlement-review` and
`POST /v2/trips/:id/settlement-review`. GET returns the current server-authoritative
personal statement, its deterministic fingerprint, the user's latest append-only
checkpoint, a nullable per-Expense canonical delta, and organizer-only informational
review coverage (`[]` for ordinary members). POST requires a UUID
`Idempotency-Key` equal to `id` and `operationId` plus the exact fingerprint the user
reviewed. A first checkpoint returns `201`, replay returns `200`, and changed financial
source returns `409 STALE_REVIEW_CHECKPOINT`; the server never substitutes a newer
unseen statement. Personal Payment is excluded from statement and delta inputs.
The internal checkpoint source RPC represents valuation decimal rates as exact
strings, so JSON/JavaScript transport does not round the financial compare-and-save
guard. Public statement DTOs and financial change checks are unchanged.

Settlement review status extends that route without another review system. POST
includes `reviewState = LOOKS_GOOD | STILL_CHECKING`; old checkpoints default to
`LOOKS_GOOD`. GET returns coverage to every current Journey member with
`NOT_REVIEWED | STILL_CHECKING | LOOKS_GOOD`. `NOT_REVIEWED` is derived when no
checkpoint exists. A `LOOKS_GOOD` checkpoint whose personal statement fingerprint no
longer matches the current material statement is projected as `STILL_CHECKING`.

Settlement 2.0 Phase 4 adds Organizer-only
`POST /v2/trips/:id/settlements/:rootId/corrections` for a stateless corrected
source preview and `POST .../corrections/confirm` for authoritative confirmation.
Both carry the frozen source Expense ID, a new UUID-backed successor aggregate and
an organizer reason. Preview returns the expected lineage head, new digest, member
deltas, transfers and blockers. Confirm additionally requires that exact head/digest
and an idempotency key; one database transaction creates the successor, explicit
old→new lineage and immutable Adjustment version. Ordinary mutation routes still
reject finalized inputs with `FINALIZED_SETTLEMENT_PROTECTED`; `/reopen` remains
rejected.

Ordinary Settlement Adjustment preview accepts an explicit optional
`throughTimestamp`; the current Mobile Review supplies the canonical Preview's
`sourceAsOf`. The response returns that same cutoff, and confirmation includes it
with the head and digest. Backend recomputes the exact generation under the
lineage lock, rejects newly changed current input, and stores the cutoff only on
the new immutable version. Omitted cutoff retains the legacy root-cutoff behavior
for older clients and the separate correction path.

Mobile must communicate through an OTR Backend API. Do not assume endpoints exist until backend is audited or implemented.

Status labels:

- `EXISTING`: legacy Web has a comparable Next API route.
- `NEEDS_CHANGE`: legacy behavior exists but is not mobile/offline/backend-contract ready.
- `NEW`: needed for mobile and not present as a clean legacy route.
- `UNKNOWN`: requires backend confirmation.

## Auth

`POST /auth/session` - `UNKNOWN`

- Exchange provider credentials or auth code for a mobile session.
- Needs refresh semantics and secure mobile token handling.

`POST /auth/refresh` - `UNKNOWN`

- Refresh mobile session without feature code knowing the identity provider.

## Trips

`GET /trips` - `NEEDS_CHANGE`

- Legacy Web reads Supabase directly.
- Mobile needs backend-owned list with membership and offline bootstrap metadata.

`POST /trips` - `NEEDS_CHANGE`

- Legacy Web creates trip and default ledger through Supabase.
- Mobile should send a backend command with idempotency key.

`GET /trips/:id` - `NEEDS_CHANGE`

- Backend should include member permissions, base currency, storage flags, and sync cursors.

`PATCH /trips/:id` - `NEEDS_CHANGE`

- Must enforce organizer permissions server-side.

## Today / Itinerary

`GET /trips/:id/today?date=YYYY-MM-DD` - `NEW`

- Returns ordered itinerary events, linked reservations/documents, navigation metadata, and cache hints.

`GET /trips/:id/itinerary?since=:cursor` - `NEW`

- Incremental itinerary sync.

`POST /v1/trips/:id/itinerary-items` - `EXISTING` (Dev only)

- Requires a Supabase Dev bearer token and `Idempotency-Key` header.
- Accepts only the Phase 2B title, date, optional start time, location, notes,
  and local id.
- Authorizes trip write access server-side and maps the command to
  `itinerary_events` in Supabase Dev.
- Returns `{ serverId, version, updatedAt, idempotentReplay }`.
- A first create returns HTTP `201`. An idempotent retry returns HTTP `200` with
  the original server entity and does not insert a duplicate row.

`PATCH /trips/:id/itinerary-events/:eventId` - `NEEDS_CHANGE`

- Must support conflict/version handling.

`DELETE /trips/:id/itinerary-events/:eventId` - `NEEDS_CHANGE`

- Prefer soft delete for sync.

## Members

`GET /trips/:id/members` - `NEEDS_CHANGE`

- Legacy uses RPC `get_journey_members_for_current_user`.
- Mobile needs capability/role information and incremental sync support.

`POST /trips/:id/members` - `NEEDS_CHANGE`

- Must support linked users, unlinked travellers, invite email, and permissions.

`PATCH /trips/:id/members/:memberId` - `NEEDS_CHANGE`

`DELETE /trips/:id/members/:memberId` - `NEEDS_CHANGE`

## Expenses

`GET /trips/:id/ledger` - `NEEDS_CHANGE`

- Legacy computes via Supabase reads and client-side summary.
- Backend should return entries, participants, rates, balances, settlements, and sync cursor.

`GET /v2/trips/:id/ledger/bootstrap` and `/ledger/changes` — A1-I2B2 implemented,
review pending. Bootstrap adds the strict six-key `participationSnapshot` envelope
and a non-null shared v2 cursor, including sequence zero. Existing Member wire
order is preserved; fingerprint construction alone normalizes and sorts Person IDs.
Every shared pull compares the complete current vector with the token hash before
reading its financial page and returns the strict four-key
`participationVerification`. Drift or legacy shared v1 requires controlled bootstrap
via `INVALID_CURSOR`; malformed snapshot is `PARTICIPATION_SNAPSHOT_INVALID` (500),
and three unstable bootstrap attempts end with `PARTICIPATION_SNAPSHOT_UNSTABLE`
(503). Private-payment v1 is unchanged. Exact fields/serialization and compatibility:
[A1-I2B1 contract](architecture/TRIP_CANONICAL_A1_I2B1_SNAPSHOT_CURSOR_CONTRACT.md).

`POST /v1/trips/:id/expenses` - `EXISTING` (Dev only)

- Requires a Supabase Dev bearer token and `Idempotency-Key` header.
- Accepts only the Phase 2A local id, title, integer minor-unit amount,
  three-letter currency, optional payer member id, and occurrence timestamp.
- Authorizes trip write access server-side and maps the command to
  `ledger_entries` in Supabase Dev.
- Returns `{ serverId, version, updatedAt, idempotentReplay }`.
- A first create returns HTTP `201`. An idempotent retry returns HTTP `200` with
  the original server entity and does not insert a duplicate row.

### Phase 3B Transport Status

The Expense and Itinerary workers support two environment-selected adapters.
`fake` remains the default for local and automated tests. `dev` sends typed,
authenticated requests to the OTR Dev Backend; it never calls Supabase business
tables. Both preserve the same SQLite-first queue and reconciliation lifecycle.

Create idempotency is defined by the authenticated user, entity type, and Mobile
operation id/idempotency key. If a successful response is lost, retry returns the
original row rather than creating another. Create responses currently use
version `1`; update/conflict versions are outside Phase 3B.

These endpoints are Dev-only and are not approval for production deployment or
for the broader Ledger/Itinerary contracts below.

`PATCH /trips/:id/expenses/:expenseId` - `NEEDS_CHANGE`

- Must create edit history and handle version conflicts.

`DELETE /trips/:id/expenses/:expenseId` - `NEEDS_CHANGE`

- Soft delete required for offline convergence.

`POST /trips/:id/ledger/settlements` - `NEW`

- Records settlement payments or settlement acknowledgement.

Ledger PDF/CSV export is device-generated from synchronized SQLite facts. There
is no server binary-export endpoint; see ADR 0015.

### Reference FX snapshot bundle

`GET /v2/ledger/reference-rate-snapshots?provider=ECB`

- Requires a valid account session; it is not Journey-scoped.
- Returns at most 32 newest-first ECB working-day snapshots anchored to EUR.
- Rates are positive exact-decimal strings. The response includes policy version,
  observation/expiry timestamps, and source/provider references.
- `provider` may be omitted or must equal `ECB`; other values return
  `INVALID_PROVIDER`.
- The bundle is informational cache input only. It cannot mutate an Expense,
  Personal Payment, valuation, or canonical Settlement.

Response shape:

```json
{
  "provider": "ECB",
  "policyVersion": "ECB_LOCAL_SNAPSHOT_V1",
  "baseCurrency": "EUR",
  "snapshots": [
    {
      "referenceDate": "2026-09-23",
      "rates": { "EUR": "1", "ISK": "143.8", "NZD": "1.9821" },
      "observedAt": "2026-09-24T00:00:00.000Z",
      "expiresAt": "2026-10-24T00:00:00.000Z"
    }
  ],
  "sourceReference": "https://www.ecb.europa.eu/",
  "providerReference": "https://api.frankfurter.dev/v2/providers/ecb/rates"
}
```

`POST /v2/trips/:id/ledger/rate-lookup`

- Requires current Journey read access.
- Accepts `{ quoteCurrency, baseCurrency, requestedDate }` for two distinct supported
  ISO currencies.
- Adapts the existing `ECB_DAILY_V1` resolver only. It reuses the existing provider,
  seven-day historical policy, quote cache, negative cache and provenance validation.
- Returns the requested date, nullable actual reference date/rate, explicit resolution
  status, policy, observation time and safe provider/source references.
- It may populate the existing mutable quote cache. It never creates an Expense
  valuation snapshot or changes Expense, Personal Payment, Settlement or Adjustment
  state.

## Documents / Tickets

A normal authorized Universal context GET for a Batch not yet prepared returns
404 `TASK_NOT_FOUND` with `Cache-Control: no-store`; it does not prepare work.
Missing existing Task mirrors, Auth failures and busy/unavailable services retain
503. Explicit Start remains the only Native action that may prepare/dispatch.

Import Documents reads existing `GET /v2/trips/:tripId/core/source-plans/:planId`
through the authenticated Core transport. The strict read DTO binds plan/status,
Actor Account/Trip, Source/revision, slot/operation/target and completed receipt.
Only a COMPLETE owning slot links a saved Item to the exact retained input; a
preview, READY slot or another Source in the same Batch does not. The current
surface follows the repository-selected Batch and reports unavailable metadata
separately from original access. Personal Inbox does not infer Trip associations.
This adds no document mutation, cloud-custody claim or business authority.


`GET /trips/:id/documents?since=:cursor` - `NEW`

`POST /trips/:id/documents` - `NEW`

- Create document metadata before or after file upload.

`PATCH /trips/:id/documents/:documentId` - `NEW`

`DELETE /trips/:id/documents/:documentId` - `NEW`

`GET /trips/:id/documents/:documentId/download` - `NEW`

- Returns signed URL or stream metadata for offline cache.

`GET /v2/trips/:id/documents/:documentId/original` - `DORMANT_BACKEND_BOUNDARY`

- Requires normal Backend authentication, `X-OTR-Content-Version` (positive integer)
  and `If-Match` (quoted lowercase SHA-256); rejects query, body and Range.
- Returns only bounded private bytes after the injected current Core Document ACL
  **and** current Source/copy retention right pass, with matching version/hash and
  post-read rechecks. Missing owning ports and unreadable originals return the same
  unavailable result; no storage locator or signed URL is exposed.
- The route has no default Core/custody provider and is unavailable in the normal
  Backend composition. It does not activate `canReadOriginal`, a viewer or Mobile
  original cache. Real retained bytes and Native opening remain separately gated.

`POST /trips/:id/documents/:documentId/ocr` - `NEW`

- Future endpoint. Not Phase 1 required.

## Capture

`POST /trips/:id/capture` - `NEEDS_CHANGE`

- Legacy routes exist for capture AI config/detect/events/media upload.
- Mobile needs a single contract that accepts local capture input or references and returns proposed actions.

`POST /trips/:id/capture/:captureId/confirm` - `NEW`

- Converts proposed action to domain mutation.

## Sync

Mobile preserves Backend failure category, stable safe code/message, and request id
separately. Network, timeout, response-validation, rate-limit, 5xx, missing-code 4xx,
plain, and unknown failures remain retryable. Only current allow-listed validation or
permission codes are terminal/actionable; 401 pauses auth and 409 enters conflict.
Retrying an attempted CREATE reuses its original body and idempotency key.

Personal Payment create/update requests carry `economicDate`; Backend responses
also expose nullable `economicDateSource = EXPLICIT | LEGACY_DERIVED_UTC`.
Deprecated
`recordedEquivalent*` and reference fields may still parse for compatibility,
but Backend ignores them. Personal Payment reads and mutation responses include
authorized Backend-owned FX projections. Incremental Ledger changes include
`PERSONAL_SETTLEMENT_PAYMENT_FX_PROJECTION` independently from payment changes.

`GET /trips/:id/sync/bootstrap` - `NEW`

- Initial sync bundle: trip, members, today window, itinerary, ledger, documents, cursors, server clock, capabilities.

`GET /trips/:id/sync/pull?cursor=:cursor` - `NEW`

- Incremental changes across domains.

`POST /trips/:id/sync/push` - `NEW`

- Batch mutations with idempotency keys, local ids, base versions, and operation ordering.

`POST /trips/:id/sync/ack` - `NEW`

- Optional acknowledgement if backend uses durable server-side change logs.

## Files / Uploads

### Receipt eviction verification (Phase 3B, Dev)

`HEAD /v2/trips/:journeyId/receipts/:receiptId/content` uses the same bearer authentication and receipt read authorization as GET. For an active UPLOADED receipt, Backend resolves the canonical `storage_provider` and `object_path`, calls provider `stat()`, and checks the actual object's byte count, SHA-256, and MIME against the canonical row. A successful response has no body and supplies `Content-Length`, `Content-Type`, `X-OTR-SHA-256`, and `X-OTR-Object-Key`. Missing, mismatched, tombstoned, unauthorized, or unsupported-provider objects never produce a successful verification. Mobile still follows HEAD with authenticated GET and independently hashes the downloaded bytes immediately before local eviction. This is a fresh per-eviction proof, not a stored confirmation or a public object URL.

`POST /trips/:id/uploads/create` - `NEEDS_CHANGE`

- Legacy has direct upload creation routes for media.
- Mobile needs a generalized upload contract for documents, tickets, previews, and future photos.

`POST /trips/:id/uploads/:uploadId/complete` - `NEEDS_CHANGE`

`GET /trips/:id/uploads/:uploadId` - `NEEDS_CHANGE`

## Legacy API Notes

Existing Web routes are mostly AI, media, background jobs, i18n, maps/routes, Google Drive, and memory-shot/story/poster flows. They are useful reference for backend capabilities but are not a clean mobile API surface.

# Settlement Preview coherent source projection

`POST /v2/trips/:tripId/settlements/preview` calculates the complete response from
one `ledger_settlement_source_7_1` generation. In addition to the existing preview
fields it returns:

- `sourceAsOf`: the canonical source cutoff used by the calculation;
- `sourceFingerprintPolicy: "SETTLEMENT_SOURCE_V1"` and a SHA-256
  `sourceFingerprint` over the normalized eligible source records;
- `confirmedSettlement`: the latest finalized Settlement reference, or `null`;
- `confirmationDiff`: changes from that confirmed input set to the current source,
  classified as `ADDED`, `CHANGED`, or `REMOVED`.

`REMOVED` means the Expense no longer participates in the current Settlement source;
it does not imply deletion. Balances, inputs, fingerprint, and diff are one atomic
financial projection. Review and needs-attention coverage remain separate responses.
The read-only Preview requires Journey read access; FX preflight and finalization retain
their existing organizer capability checks.

## Settlement review refinement — 2026-09-28

`settlement-review` statements may include optional `unresolvedSource` (a stable
personal-source snapshot). Member acknowledgements are allowed before FX readiness;
finalization requirements are unchanged. This additive field participates in the
review fingerprint and is preserved by the Mobile contract.

## Approved Expense consistency v2 (implementation in progress)

ADR 0056 and `EXPENSE_CONSISTENCY_IMPLEMENTATION_CHECKPOINT.md` define additive
version-2 typed patch/intent, operation receipt and conflict-chain resolution
contracts. Legacy full-aggregate writes retain strict CAS; missing verified history
never permits automatic merge. Receipts distinguish APPLIED/KEPT_SERVER/SUPERSEDED.
Chain requests bind current revision, covered IDs and expected digest; responses
return canonical, remaining OPEN IDs and every covered conflict outcome. Phase 1
adds validated DTOs; routes/SQL remain gated by Phase 3, not deployed capability.

## Expense Consistency v2 — Backend/SQL Phase 3

Existing Expense endpoints accept `{ envelope: ExpenseIntentEnvelope, auditReason }`
as an additive branch (`envelope.intentVersion = 2`). Header Idempotency-Key must
match the envelope. Route and typed intent must match:

| Endpoint                                                | Typed intent      | Legacy request                       |
| ------------------------------------------------------- | ----------------- | ------------------------------------ |
| POST `/v2/trips/:tripId/expenses`                       | CREATE            | Existing full create preserved       |
| PUT `/v2/trips/:tripId/expenses/:expenseId`             | UPDATE user patch | Full aggregate, strict CAS           |
| DELETE `/v2/trips/:tripId/expenses/:expenseId`          | DELETE            | Lifecycle, strict CAS                |
| POST `/v2/trips/:tripId/expenses/:expenseId/restore`    | RESTORE           | Lifecycle, strict CAS                |
| POST `/v2/trips/:tripId/expenses/:expenseId/valuations` | APPLY_VALUATION   | Existing financial evidence contract |

Typed success preserves the canonical mutation DTO and adds a mandatory correlated
`receipt`. `observedBase` is a client observation, never merge authority. Backend
loads historical evidence from immutable SQL success receipts; SQL rechecks that
record and its normalized digest under the Expense lock. Missing history cannot
permit a stale automatic merge. Causal execution bases require a verified APPLIED
receipt for this actor/Expense, or an actual successful legacy CRUD/valuation receipt;
legacy resolution/KEEP_JOURNEY is never inferred to mean APPLIED.

GET `/v2/trips/:tripId/expenses/:expenseId/conflicts` returns version 2 canonical
(including tombstone), complete chain digest and all conflict lifecycles. Historical
unverifiable UPDATE/valuation rows have `submittedIntent: null` and action-required
reason. DELETE is reconstructed only from the original command type/key. Closed
rows include their immutable `operationReceipt`; OPEN rows have none.

POST `/v2/trips/:tripId/expenses/:expenseId/conflict-resolution` accepts the approved
`contractVersion: 2` chain request. The single SQL transaction checks permission,
frozen inputs, current revision, full chain digest, covered scope/ownership and
original typed intent, then commits mutation, audit, immutable outcomes and receipt.
The result has `resolutionReceipt`, `canonical`, `openConflictIds`, `conflictOutcomes`.
Each covered outcome includes an `operationReceipt` correlated to the **original**
command/key; the resolution receipt uses the resolution request key. Only APPLIED
can advance a successor's causal base. Covered earlier intents may be SUPERSEDED;
uncovered rows remain OPEN. KEEP_SERVER and verified ACCEPT_EQUIVALENT close through
an audit without advancing Expense revision. Same-key replay returns the stored
response before head/chain/quote preparation, with no repeated effects.

Legacy resolution remains a single-ID full aggregate contract. It cannot resolve
DELETE/typed conflicts or reconstruct a tombstone as UPDATE; it returns
`TYPED_RESOLUTION_REQUIRED`. A full UPDATE cannot revive a tombstone even with a fresh
CAS. For an unverifiable legacy UPDATE, v2 KEEP_SERVER accepts only an explicit empty
UPDATE intent as discard evidence and never applies a guessed patch.

Bootstrap and pull include additive `expenseConflictChains` metadata (`expenseId`,
`chainDigest`, complete `conflictIds`, `openConflictIds`) on every response, including
empty change pages. Pull now includes the complete canonical Expense for tombstones;
event revision remains separate from canonical revision. Formal client integration
and resolution UI use the same Hosted v2 contract in Phase 4. SQLite v41 caches
account-scoped complete chains and immutable resolution responses. New unattempted
commands use typed intent; an already-bound or attempted legacy request keeps its
original body/key and strict CAS behavior. Resolution receipt, covered outcomes,
projection and queue completion commit in one local transaction. Only APPLIED proof
wakes successors; response loss retains the same resolution body/key for replay.

### Phase 5 displayed-rate acceptance

Typed APPLY_VALUATION optionally carries `valuation.rateAcceptance` with the displayed
local/server revisions, original Money, economicDate, Journey settlement Money, exact
decimalRate and referenceDate. It is retained in the immutable command/audit. Online
acceptance refreshes Journey reconciliation and the authenticated FX snapshot before
checking business inputs. A newer automatic REFERENCE_RATE is compatible only with
verified server history, unchanged financial/split inputs and matching rate/value.
The existing locked RPC admits `VALUATION_REBASE` for that case; the explicit outcome
is MANUAL_AGREED. Material drift remains conflict; legacy requests remain strict CAS.
Batch client operations return one operation result per Expense (including partial
success); sync-cycle completion is never confirmation. Already-current agreed values
are reported separately as unchanged, without inventing a new command receipt.

### Phase 6 historical equivalent admission

Migration `20260929000300_legacy_expense_equivalent_resolution.sql` admits a legacy
UPDATE as an empty typed equivalent only when immutable server successful history
and the original stored 409 submission prove identical business input. UTC encoding
is normalized; historical RATE_REQUIRED/null valuation is not an instruction to
remove a newer server REFERENCE_RATE. The chain exposes reason
`VERIFIED_LEGACY_EQUIVALENT`; formal UI offers `Use latest value` mapped to
ACCEPT_EQUIVALENT. SQL repeats the evidence check inside the existing guarded
transaction. Legacy mutation writes remain strict CAS; missing evidence and real
financial/descriptive/valuation changes are not inferred away.

## Settlement current source after confirmed corrections — approved fix

For a Journey with a confirmed Settlement root, ordinary Preview uses the same
root-scoped `ledger_adjustment_source_current_7_2c` current source as Adjustment.
Confirmed correction predecessors remain historical records and never contribute
to current inputs, sourceFingerprint, balances or confirmationDiff. The latest
confirmed lineage head remains the comparison baseline. Journeys without a
confirmed root retain the initial `ledger_settlement_source_7_1` path.
Source/head/digest/cutoff equality and all finalization guards remain mandatory.
No schema, stored financial evidence or confirmation policy changes. Internal
refresh diagnostics require explicit Debug Mode; generic verification failure
does not imply an Expense conflict.

## B-T3E disabled canonical Event read boundary

Authenticated `/v2/trips/:tripId/canonical-events/capabilities`,
`/v2/trips/:tripId/canonical-events/:eventId` and
`/v2/trips/:tripId/canonical-event-operations/:operationKey` are read-only. The receipt
path matches B-T3C; the unshipped `event-operations` path is removed with no alias. Event reads
require `X-OTR-Canonical-Event-Read-Version: 1`; missing/unknown versions receive
an explicit WITHHELD response without an Event body. The wire schema retains
B-T3A snake_case facts and exact temporal strings, including rich shapes and
embedded transport endpoints, and always declares read-only/legacy incompatibility.
No `scheduledDate` conversion exists. Candidate bodies and Source material are
excluded; only accepted opaque provenance references follow the Trip read policy.

Capability discovery probes installed columns/endpoint relation. Missing DB state
is unknown/disabled. The separate reserved gateway connection must attest the
actual database session identity and offer only installed-state and exact receipt
reads. No driver, credential provisioning or service-role fallback is installed.
Without that connection, exact receipt recovery returns REPLAY_UNAVAILABLE, never
NOT_FOUND. Receipt output is status-only correlation with the stored full hash;
intended proofs, confirmations and result fields are withheld pending their own
read-admission policy. The fixed SQL lookup verifies immutable historic bytes.
All canonical mutation methods return CANONICAL_WRITES_DISABLED; discovery cannot
activate them. Mobile transport captures Account/Trip/generation before credentials
and rejects stale responses. It performs no SQLite apply, queueing or product edit.
Lossless SQLite mirroring and a reviewed dedicated runtime connection remain
separate activation prerequisites.

## B-T3H protected canonical Event collection foundation

`GET /v2/trips/:tripId/canonical-events/snapshot` implements B-T3G V1 with no aliases.
Require both canonical Event collection/read version headers equal to `1`.
Query is absent or exactly one `cursor`; page size is fixed at 100 aggregates.
Authenticated Actor and current Trip admission are checked on every request.
A dedicated collection gateway calls only `trip_event_collection_observe(actor,trip)`
on the primary in READ COMMITTED. Its single uncapped statement includes admission,
root/endpoint facts, participant-row absence and independent collection counter.
Backend validates the entire observation and B-T3G fingerprint before slicing.

The exact B-T3G SNAPSHOT_PAGE envelope binds Account/Trip, epoch/revision, full
fingerprint/count, ordinal interval and canonical continuation. Only a final page
has complete=true; callers still need all prior pages and full-set hash validation.
Empty complete differs from unavailable. ASSIGNED/WHOLE_GROUP, unexpected participant
rows or unsupported canonical contracts WITHHOLD the entire set, never skip an Event.
Malformed/stale/scope-invalid tokens return INVALID_EVENT_COLLECTION_CURSOR; equal
snapshot identity with contradictory bytes returns CANONICAL_EVENT_SNAPSHOT_INVALID.
Limits are 10,000 Events, 64 MiB canonical read bytes and 4 MiB actual page body.
No private Source/participant/candidate/financial content is exposed.

No collection runtime connection or credential is provisioned. Missing/wrong gateway
returns COLLECTION_CERTIFICATION_UNAVAILABLE; there is no service-role list fallback.
Accepted B-T3I implements explicit Mobile collection application/certificates/removal;
automatic central refresh/wake integration remains deferred. Individual reads/receipts/capabilities and all mutation gates stay
unchanged; snapshot completeness enables no deletion command.

## A1-I2C3 participation runtime preflight (CLOSED)

Canonical authenticated routes: GET `/v2/trips/:tripId/person-participation-capabilities`,
POST `/v2/trips/:tripId/persons/:personId/participation-commands`, and exact GET
`/v2/trips/:tripId/person-participation-operations/:operationId`. No aliases,
enumeration or recovery mutation fallback. POST binds verified Actor and exact
route/body/header identity and independently recomputes the intent digest; it
returns `PARTICIPATION_COMMANDS_DISABLED` while activation remains CLOSED, even
with an open test gateway gate. Capability always projects DISABLED and empty
commands/scopes. GET requires a verified dedicated A gateway session and current
Organizer authority inside the fixed lookup. Admission order is verified Actor →
current Trip/Organizer → exact Actor/Trip/operation lookup → receipt scope/hash.
Unauthenticated lookup returns `UNAUTHENTICATED` / 401. Absent current Organizer
authority, including a former Organizer who retains Trip read access, returns
`PARTICIPATION_FORBIDDEN` / 403 without receipt disclosure. An admitted exact
own-scoped absent operation returns `OPERATION_NOT_FOUND` / 404; foreign Actor/key
existence is not disclosed. Missing/unknown dedicated gateway or unavailable lookup
returns `REPLAY_UNAVAILABLE` / 503. Corrupt/malformed or scope/hash-invalid returned
receipts fail closed as `REPLAY_UNAVAILABLE`, never `OPERATION_NOT_FOUND`.
Neither 404 nor unavailable recovery proves a concurrent/uncommitted request failed.
Mobile preserves these HTTP codes and the same pending key/intent; no new key or
POST is manufactured automatically.
No dedicated connector or credentials are installed. This preflight does not alter
server 00600 or activate normal Mobile dispatch.

## A1-I2C5 installed activation security foundation (HTTP disabled)

No new HTTP route or enabled capability. Fixed DB
`trip_person_runtime_state()` is available only through the exact dedicated session;
it returns commandVersion=1, receiptVersion=1, gateClosed, safe-integer gateGeneration
and schemaVersion=20261005000200 after exact protected-definition/role/ACL inventory
checks. Missing/corrupt state or privileges fail closed. The future connector must
validate these facts and map them to the existing installed-state interface; none
is installed by this slice. Ordinary API/service/JWT/GUC identity cannot substitute.

`trip_person_set_command_gate(bigint,boolean)` is a separate administrator-only
DB boundary: expected generation CAS under the existing exclusive activation fence,
not a product/gateway operation. DB OPEN alone does not enable HTTP; Backend and
Mobile mutation remain disabled. Exact historic GET retains UNAUTHENTICATED/401,
PARTICIPATION_FORBIDDEN/403, OPERATION_NOT_FOUND/404 and REPLAY_UNAVAILABLE/503;
unavailable/missing recovery retains the same durable key/intent.

A1-I2C5 P2: OPEN and discovery require the fixed 24-function definition/owner/config/
ACL/effective-execution inventory and exact gate/Member/receipt structural RLS,
policy, trigger, constraint and column inventory. OPEN/discovery independently pin
the checker code and payload before invoking it; no drift is repaired. CLOSE does
not depend on OPEN-only inventory. Shared historical helper ACLs remain exact;
no new PUBLIC/API execution surface or runtime connector is introduced.

A1-I2C5 fixed-root correction: OPEN and discovery directly verify the immutable
migration-owned trip_person_activation_reviewed_root() anchor outside the normalized
activation-function cycle. The complete live inventory root must equal that anchor;
rewriting payload and all normalized root literals together cannot bless drift.
External fixed audit/source verifier pin the same reviewed root and full anchor
body. CLOSE remains independent of OPEN-only anchor/checker health. No runtime
connector/capability or new caller-supplied configuration surface is enabled.

Principal-scope amendment: critical execution inventory follows structural application
reachability (LOGIN/API/A-protected roots, recursive membership including ADMIN/SET/
INHERIT and SECURITY DEFINER EXECUTE→owner paths). Only proven isolated NOLOGIN roles
may omit duplicate PUBLIC-derived execution rows; PUBLIC/API/shared ACLs and object
properties remain globally pinned. Direct A grants, ownership, DDL capabilities or
application paths fail closed. Independent anchor/OPEN/discovery/CLOSE semantics and
the accepted dedicated-gateway provisioning phase remain intact; no runtime enabled.

## B-T3I explicit Mobile collection refresh (accepted)

`getDefaultTripCanonicalEventRepository().refreshCollection(tripId)` is the single
explicit Mobile entrypoint for the B-T3H snapshot route. It retains one captured
Account/Trip context throughout authentication and every page, checks actual wire
body/page/full-set bounds, canonical continuation and locally recomputed fingerprint,
then atomically installs SQLite 46 certificate/membership and complete mirror set.
Partial/WITHHELD/error output preserves accepted mirrors/certificate. No background
signal, screen, timer, financial cursor or automatic recovery loop invokes it.

All individual `applyRead`/`refreshEvent` calls consult the durable scoped membership
fence: certified-absent IDs return `CERTIFIED_ABSENT` without recreating mirrors,
even at a higher Event revision. Only a newer accepted complete certificate can
re-establish membership. Included individual reads retain B-T3F monotonic/Place-loss
rules; later facts may invalidate derived `mirrorMatches` while the historic
membership fence remains. Runtime server connector/credentials are still pending.

## Checkpoint #10 integrated capability boundary

A1-I2C5/principal-scope amendment, B-T3I and C-I3H are accepted foundations.
Participation, Event and Source commands remain disabled, with participation and
Source gates CLOSED. The explicit Mobile complete collection refresh above is
implemented; dedicated runtime connections and automatic wake policy remain pending.
C-I3H adds internal durable execution inventory/claim responsibility without a new
HTTP route, product parser/upload dispatch or automatic startup reconciler. Provider
terminality remains BLOCKED and safe IO_UNKNOWN retry remains disabled. No runtime
activation follows from the integrated 74-server/46-SQLite candidate.

## CP13A.2 canonical Flight admission (runtime CLOSED)

The [implementation report](architecture/TRIP_CHECKPOINT_13A2_CANONICAL_FLIGHT_IMPORT_IMPLEMENTATION_REPORT.md)
and [ADR](adr/2026-10-05-cp13a-flight-admission.md) record the authorized private
foundation. No HTTP route, connector, provider, scheduler or UI is activated.

Private Source-gateway entries publish immutable Flight Runs, prepare exact
Confirmations, mark dispatch UNKNOWN, finalize exact Event outcomes, permanently
revoke an undispatched slot, and read bounded Actor/Trip catalogs. The Event gateway
has only the two added `CREATE_TRANSPORT` / `UPDATE_TRANSPORT` wrappers and a
separate service read bound to the current Event semantic revision. Both command
names reuse `otr-event-intent-v1` and the existing immutable B receipt namespace.
The fixed Source-owned `trip_source_admit_event_proof` root admits exact TRACK_C
leaves; Event writers have no C catalog access. Retained leaves require their
exact existing canonical value and opaque provenance reference.

Flight commands are `TRANSPORT`, `FLIGHT`, `UNASSIGNED`; strict typed endpoints and
1–4 ordered services replace generic patches. Temporal Option A requires independent
source instant evidence, keeps unknown arrival null, and defers complete civil
resolution. Passenger/booking bodies and unknown keys are rejected before C/B
persistence. `import-flight-match-v1` withholds incomplete, ambiguous or contradictory
scope. Normal receipts never establish certified collection membership.

The private receipt bridge returns correlation only. Successful target-bearing
outcomes and UPDATE recovery require current target read authority. The owner’s
narrow clarification permits exact terminal CREATE no-commit proof without target
read authority, including an absent or foreign-Trip intended UUID. Actor/Trip,
command, operation, digest, intended target, Confirmation/slot and result identity
remain mandatory. Missing receipt is UNKNOWN. No private intent or target payload
is returned, and no generic receipt access is added.

## CP14 closed protected-command boundary

The [implementation report](architecture/CP14_PERSISTENCE_CONTROL_PLANE_IMPLEMENTATION_REPORT.md)
lists fixed Server83 roots. Their signature is `(context jsonb, command jsonb)`:
the first argument is internal VerifiedCallContextV1 from the injectable trusted
host verifier, never caller payload. SQL binds actual dedicated `session_user`,
exact request/environment/action/identity/digest and current durable permissions,
then applies strict named v1 schemas, CAS and exact replay. Generic service_role,
caller UUID/GUC/auth flags confer no authority. There are no public HTTP routes.

Inbound reserve/complete uses fixed internal generic-call START/completion bridges.
Safe package projections and sealed invocation/review results carry identifiers,
versions/digests and dispositions only. COMPLETE/PREPARED is not Event acceptance.
Private material custody is a bounded put/verify/read/release interface only;
issuer/OAuth verifier, secret resolver and real connector provisioning are deferred.

CP14 F1–F6 corrections authorize inbound child operations from retained reservation
Account/client/package/Trip facts; caller scope is a consistency claim. Call usage
and execution observations require the retained Account and user. Configure must
create killed and may only echo the retained kill value; SECURITY_ADMIN's dedicated
set-kill command owns changes. Safe responses/results use strict UUID/digest/enums
and exact retained IDs. PREPARED requires the allocated selection tuple; REJECT/
DEFER cannot carry Event/preparation IDs. All protected non-admin requests, including
reads, bind their command digest, finite root and hashed verifier scope in the existing
immutable audit journal; admin commands retain that binding in their ordinary audit entry.
Same request ID with different bytes, target, principal or root rejects.

## CP14 C2 closed local continuation contract

No new HTTP/Backend/provider endpoint. Local `scheduleWake` validates the approved
strict v1 `{version,account_id,task_id,expected_publication_fence,wake_reason}` payload,
where reason is REEVALUATE. Current task row revision is loaded for fresh CAS, not
stored in payload. The queue owns deterministic dedup, claim, signal generation and
conditional completion; a completed wake is not intelligence-success dependency proof.

Injected router returns WAIT/UNAVAILABLE/ELIGIBLE with exact attempt pins. Injected
executor requires positive undispatched proof and exact request/call/result correlation;
wake does not invoke it. Late terminal/usage recovery remains Account-gated and UNKNOWN
requires trusted exact recovery. Local installation and sufficient local publication
are distinct from execution/cost. An admitted atomic notification-ready fact has finite
attention reasons and explicit evidenced-deadline policy; no notification is sent.
See the [C2 report](architecture/TRIP_CHECKPOINT_14_AGENT_C2_CONTINUATION_RUNTIME_REPORT.md).

## CP14 A2 closed outbound adaptation

The unwired `createOutboundContinuationRouter` adapts bounded immutable Server83
read projections into C2 WAIT/UNAVAILABLE/ELIGIBLE admission. A retained request
material envelope binds body, Account/Trip/Import/task, attempt/request/key/call,
full provider/config/price pins, routing/policy digests and fallback/shadow lineage.
No endpoint, credentials, live read gateway or production factory is installed.

`createServer83OutboundReservation` invokes the existing protected reserve-call
root, verifies exact call/START pins, requires injected trusted fresh authorization
and current eligibility, and observes the real dispatch root's
`CP14_RUNTIME_CLOSED` rejection. It adds no SQL authority or activation exception.

**CLOSED SYNTHETIC EXECUTION ACCEPTANCE** follows those prerequisites through an
explicit TEST-only injected fake. Synthetic completion/recovery/result custody and
metering are separate from Server83 billable usage. **REAL SERVER83-AUTHORIZED
PROVIDER DISPATCH** remains unavailable: runtime_enabled stays false and no real
MAY_HAVE_STARTED/RUNNING transition is written. Existing Server83 usage/cost roots
remain authoritative, separately verified by their accepted database harness.
See [A2 report](architecture/TRIP_CHECKPOINT_14_AGENT_A2_OUTBOUND_RUNTIME_REPORT.md)
and [closed seam ADR](adr/2026-10-06-cp14-a2-closed-outbound-seam.md).

## CP14 B2 closed inbound application boundary

`createClosedInboundAiClient` is an explicitly injected TEST_ONLY adapter, unwired
from HTTP, startup and provider routing. Strict vendor-neutral Import Package v1
contains bounded MATERIAL refs/digests, item declarations and advisory SUMMARY /
INTERPRETATION refs; it accepts no raw evidence, credentials or caller auth fields.
The trusted host verifier binds the original request/action/digest and external
client or actual OTR_USER to the existing Server83 protected gateway roots.

Package and invocation reservations precede CP13B interpretation/publication.
Minimized proposal/status binds package, review_version and retained Run/Candidate /
Input/reference facts; digest-selected immutable proposal content uses an injected
accepted private-custody seam. STATUS checks current Server83 authority before
ordinary disclosure. No production read gateway or content store is provisioned.

A proposal allocates no Review Decision or canonical IDs. An explicit authenticated
OTR_USER decision pins proposal/version, current Run generation/Input/Candidate
hashes and Event revision. Before custody or reservation of any NEW decision,
CP13B's owning assessment must report current evidence: INPUT_STALE,
STALE_BASE_REVISION or CANONICAL_EVENT_MIRROR_INTEGRITY requires rejection/refresh
for ACCEPT, REJECT and DEFER alike. After asynchronous decision custody and protected
command authentication/custody verification, B2 rechecks the current authorized
package/version/proposal digest and repeats owning assessment. CP13B then reuses
its existing evidence/Input/material validation in a read-only local transaction,
fencing Candidate hash/Run identity-generation/Input digest and Event base revision.
Successful COMMIT and synchronous Account-gate release hand the exact authenticated,
digest-bound reservation directly to Server83, with no further admission await or
local transaction held across remote I/O. Server83 retains its package/version/fence
and current Trip/grant authorization checks. READY is additionally required only for ACCEPT;
current incomplete, ambiguous or unsupported proposals may still REJECT/DEFER.
Exact sealed historical recovery is reauthorized without this new-decision gate.
ACCEPT reserves retained authority IDs before CP13A prepare; REJECT/DEFER retain null IDs. Replay/recovery returns exact retained facts,
never replacement identities. Stale proposals require refresh. Transport uncertainty
with no exact preparation evidence remains UNKNOWN. Canonical execution/receipt
recovery stays with CP13A and its unchanged closed command gates.

**INBOUND APPLICATION BOUNDARY IMPLEMENTED ≠ PUBLIC CHATGPT/CLAUDE/MCP ACTIVATED.**
See the [B2 report](architecture/TRIP_CHECKPOINT_14_AGENT_B2_INBOUND_AI_REPORT.md)
for host-port obligations, tests and the accepted owner lifecycle clarification.

## CP14 final integration closure

The [final integration report](architecture/TRIP_CHECKPOINT_14_FINAL_INTEGRATION_REPORT.md)
reconciles accepted Persistence/C2/A2/B2 targeted independent rechecks. Cross-path
acceptance adds tests only: actual Server83 call/START with CLOSED dispatch, explicit
TEST synthetic execution, and inbound proposal/authenticated decision/CP13A recovery.
Inbound never schedules outbound enrichment or attributes model cost. Same identifier
bytes in separate namespaces confer no authority. No new endpoint or activation.

## CP15B CLOSED DEV Flight foundation (Server84)

The Backend-private gateway additionally recognizes `flight_activation_runtime`,
`flight_activation_select`, `flight_activation_account_grant` and
`flight_activation_reserve_call`. The first three require authenticated
SECURITY_ADMIN, exact request binding, replay audit and expected-version CAS.
No public route or client-supplied trusted context is added. Runtime change accepts
DEV only and does not clear kill. Config Admin cannot select scopes/grants or
activate runtime. Scope identity is stable per integration; versions bind exact
provider/model/family, adapter/template/envelope/schema/minimizer/privacy/policy/
price pins, expiry, resource bounds and monetary approval. Account grants have
independent expiry, revocation and revision.

The Flight reserve root atomically retains call, START and one resource hold under
existing scope locks. Missing monetary policy denies admission. Mark-dispatch
independently checks the current DEV runtime/kill, workload, scope/grant, Trip,
configuration/provider and immutable hold. Old generic/synthetic/inbound calls
lack a qualifying hold and remain unable to dispatch. Lost mark acknowledgement
is UNKNOWN; a returned durable MAY_HAVE_STARTED/RUNNING ACK precedes transport.

`FLIGHT_REMOTE_TEXT_V1` and `otr-intelligence-flight-remote-v2` carry truthful
REMOTE_MODEL/REMOTE_ALLOWED execution. Local `otr-intelligence-v1` stays LOCAL_ONLY.
Provider wire output contains only bounded opaque group/span tokens, allowed field
paths and OBSERVED hints. It supplies no trusted IDs, canonical values or authority.
Host rebinding verifies retained representation/material/input pins, restores each
original UTF-8 span and runs OTR normalization before the existing CP13B pipeline.
Unsupported private dimensions remain local deferred evidence; CP13A stays sole
canonical authority. The injected adapter has no installed live transport/resolver.

Usage append accepts a safe nullable `provider_request_id` only on a dispatched,
held DEV Flight call; it is separate from request/observation identities and has
no retry authority. Historical/inbound/synthetic rows remain NULL. Missing or
inconsistent usage stays nullable/UNKNOWN independently of the retained result.
See [CP15B ADR](adr/2026-10-07-cp15b-closed-dev-flight-dispatch.md).

### CP15B targeted F1–F4 boundaries

Retained-result recovery is a disclosure operation: after exact Account-scoped
attempt lookup and private reference/hash awaits, it reruns the existing owning
task/Trip/material admission and exact current attempt/result identity, then
performs a fresh Account generation fence immediately before returning evidence.
Retention does not grant disclosure or installation authority; denial leaves
private result/usage responsibility intact and never redispatches.

Reserve and mark join the existing C admission and Trip/membership row-lock
convention. The Trip authorization observation is serialized through durable mark.
Revoke winning denies mark; mark winning retains MAY_HAVE_STARTED responsibility.
Post-mark revoke fences disclosure/install rather than claiming provider stopped.

Signed reserve carries actual versioned execution pins and their digest. Immutable
holds retain them; reserve compares them to Security-selected pins and mark repeats
that comparison against the current selected scope/config. Backend compiled
prompt/envelope/minimizer/privacy bytes and owning policy are independently checked.
Opaque scope IDs alone provide no execution authority. Config Admin cannot select.

Valid reported token counters retain ACTUAL_REPORTED usage quality. Cost derived
from tokens and a pinned schedule is ESTIMATED; unresolved billing applicability
or required price components remains UNKNOWN. Only separately admitted billing
observations can establish actual cost through the existing append-only journal.

## CP15B-LIVE-W CLOSED private DEV host composition

`initializeDevFlightLiveHost` is a Backend-private startup seam. Absent either host
transport/one-shot gate or actual trusted provisioning it returns CLOSED without
reading the DeepSeek key, creating custody or contacting a provider. There is no
public HTTP AI endpoint, public B2 route, polling or new scheduler.

The explicit DEV factory composes the accepted executor, exact verifier-bound
Server84 gateway/session, environment resolver and fixed HTTPS transport. Dedicated
workload and SQL session references are host-private configuration; the provisioned
connector must attest exact call-gateway session_user, DEV and primary connection.
No synthetic verifier, caller context or service-role fallback is installed.
TEST/PRODUCTION factory and resolver construction reject even enabled host flags.

A retained acceptance session pins exactly one Account/task/attempt/call/request.
Server84 fresh mark CAS remains the durable transport authority. Lost ACK/UNKNOWN
and restart never reconstruct an ACK or replay the provider. Raw-response recovery
is pure parsing/rebinding/CP13B under current disclosure authority, with no transport.
The versioned model witness rejects absent/mismatched identifiers while retaining
incurred usage; mutable aliases do not prove immutable weights.

Private safe readback exposes finite execution/install/meter states, call/attempt,
provider request ID, custody hashes/byte counts, accepted model witness and nullable
usage. Rejected model identifiers stay private. Full hold/price/cost/control-plane
readback uses existing protected Admin/Recovery roots or the explicit operator-only
read-only SQL in the DEV runbook; no application grants are widened.

## Dormant authenticated Publication Catalog read — Owner-authorized Builder

GET `/v2/trips/:tripId/source-import-catalogs` requires bearer Auth and
`X-OTR-Publication-Catalog-Version: 1` or explicit `2`. V1 retains its READY/FAILED projection; V2 uses the existing Universal snapshot including PENDING/RUNNING, with identical verified Actor/Trip/owning Reader permission and bounds. No Task is required for this Source-only read. No body/query/pagination/actor parameter;
unsupported method/UUID/request/version returns405/400/400/426 before SQL. Server
actor comes only from verified Supabase Auth; definitive recognized invalid-session
codes return401, transient or unknown Auth failure returns503. Existing Trip read
admission is followed by independent current protected SQL admission.

An optional trusted connection leases one primary SQL session. The helper issues
fixed READ COMMITTED READ ONLY BEGIN, transaction-local5s statement/1s lock timeouts,
actual `SELECT session_user`, and parameterized
`trip_source_read_import_catalogs($1::uuid,$2::uuid)` before COMMIT. Actual principal
must be `otr_trip_publication_catalog_reader`; the Backend rejects the old command
gateway. The R3-A forward preserves that gateway's existing SQL read compatibility
and adds the Reader to only the protected root session allowlist. The delivered
Reader is NOLOGIN/PASSWORD NULL; Hosted provisioning and Backend injection require
separate acceptance. Missing/wrong connection fails503
`PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE`; no service-role/public RPC/SET ROLE
fallback. The injected driver must cancel/retire uncertain leases and finish
rollback before reuse. `backend/src/server.ts` provisions nothing.

Success is exactly the canonical version1 complete13-family existing Import catalog,
max64 rows per family and4,194,304 actual UTF-8 bytes, with private/no-store headers.
Overflow withholds the whole set (`IMPORT_READ_RESOURCE_LIMIT`), never pages or
filters. Empty-complete is valid; unavailable/FAILED-only is not publication success.
This observation conveys neither perpetual authorization nor C5/domain-write authority.

Mobile captures Account/Trip/generation once and reuses context-bound token refresh
coalescing with one401 replay. Explicit bounded/signal API mode covers token wait,
fetch, streaming body and schema under one deadline; Publication caps it at30s.
Error bodies cap at8KiB; no private error details or payload diagnostics are retained.
Bodies are accumulated with an actual byte cap before JSON parse. Publication has
**no default fetch adapter**. The dormant iOS R2 facade
`createPublicationCatalogNativeFetch()` requires the actual version1 local
`PublicationCatalogReceive` module before token work and accepts only
`https://api-dev.xoery.art` and this exact GET contract. Its private registration
alone bypasses the global RN Response streaming-shape guard; arbitrary callbacks
retain that guard. Missing native code, incompatible module or Android fails CLOSED.
URLSession counts decoded bytes before append, cancels overflow, rejects every
redirect and uses platform TLS validation with ephemeral/no-cache/no-cookie state.
Identity only: request `Accept-Encoding: identity`; reject nonidentity, empty or
combined Content-Encoding values and raw gzip magic even without that header.
Local URLSession header-preservation fixtures gate this policy; iOS runtime
verification remains required before activation. Native monotonic deadline, absolute
original expiry at dispatch and one held request/result slot fence stalled JS;
JS retains Account/generation, original signal and one401 refresh ownership.
Only complete bounded bytes reach the unchanged fatal UTF-8/original-text parser.
No runtime composition or app/device acceptance is enabled; OS decoder/bridge
scratch memory is not certified as a4MiB process-memory ceiling. See
[the R2 Builder report](architecture/OTR_PLATFORM_TRANSPORT_R2_NATIVE_RECEIVER_BUILDER_REPORT.md).

The CLOSED reader accepts an optional original cancellation signal, retains it on
its admitted handle, and bounds signal-scoped read/provenance validation at30s.
Canceled/superseded handles cannot install; final repository admission rechecks
cancellation before SQLite COMMIT. Account generation fences remain mandatory with
or without a signal. Network precedes the existing Account-gated owning transaction;
no scheduler, worker, GET outbox, startup caller or live installation is enabled.

## R3-B explicit native Catalog membership installation

`createNativePublicationMembershipIntegration` composes the accepted iOS fixed-DEV
receiver, authenticated Catalog transport, CLOSED membership reader and owning
SQLite53 repository. `captureContext(tripId)` retains original Account/generation;
`install(context,signal?)` fetches and validates outside the Account/SQLite gate,
then commits the admitted Catalog and sealed memberships together. It returns the
installed membership count; zero is a valid empty roster, not deletion or a
publication certificate. `read(context,runId)` uses local retained membership only.
The reader forwards the original context and cancellation signal to transport.
No startup/scheduler, Composer, provider or business-command activation is added.

## CP-FLIGHT-DEV-02 CLOSED ORIGINAL TEXT transport

Explicit `createFlightTextDevBackend(dependencies,{source,core})` composes the
existing authenticated DEV handler and separate fixed Source/Core Node pg
principals. It is not called at normal startup; no environment activation flag,
credential loader or new business authority is introduced.

- `POST /v2/trips/:tripId/sources/acquire`: existing Source command1 envelope,
  ACQUIRE_SOURCE only, TEXT/PASTE/UTF-8, UNKNOWN capture time, nullable MIME,
  exact original text/hash/byte count (≤262,144 bytes), stable IDs/key/digests.
  Actor is derived from validated bearer auth; envelope Account/Trip are only
  consistency claims. Existing owning SQL validates all manifest/operation hashes
  and current write admission, atomically retains Source/revision/original/receipt.
  Lost response replays the identical envelope; 503 or absence is not no-commit.
- `POST /v2/trips/:tripId/sources/runs/publish`: existing complete
  `trip_source_publish_flight_run` Run/Input/Candidate/predecessor/lineage envelope.
  Owning SQL seals and validates actual pins; replay retains the original Run ID.
- Existing Core publication2/plan2/command2/operation receipt/finalization/read2
  endpoints and DTOs are unchanged. Source responses are private/no-store.

Source HTTP JSON is strictly parsed and bounded to2MiB; normal Node server caps
TEXT ingress before concatenation. Invalid auth401; denied Trip/actor403;
invalid schema/material422 (malformed JSON400); identity reuse/stale pins409;
oversize413; unavailable/uncertain storage503. SQL details/material/credentials
are not returned. Binary/LOCATOR acquisition and Document access stay CLOSED.

Local HTTP/Node pg/verified TLS acceptance uses only a disposable synthetic SQL
clone and fixture bearer identities; it does not certify Supabase Auth or Hosted
provisioning. Dedicated Hosted principals/grants/activation and actual DEV Auth
acceptance require separate Owner authorization. See
`trip/implementation/CP_FLIGHT_DEV_02_REPORT.md`.

### Local Updates first Capture failure contract (reserved, not installed)

The repository/default adapter uses the existing captured Account request generation/apply gate. Only new committed safe Capture failures with an actual authorized reacquisition path may create an Account-personal Batch aggregate; infrastructure/unknown/routine progress is not a notification. List/open/current category-query-unread Mark All Read recheck owning source/account/material version, exclude other Accounts/Trips, preserve original notification time and independent read state. Explicit open marks only the captured observed notification version; later material updates remain unread. Opening/read never performs recovery or business resolution. Partial source coverage is explicit. Existing C3 list/reopen/continuation/verified-byte contracts remain authoritative; NOT_INSTALLED is not processing, acceptedAt not notification time, canonical/cloud/true Trip attribution remain unavailable. No new HTTP/Hosted/provider/Push endpoint or privilege is introduced.

## CP-UX-01 Camera declaration and recovery (2026-10-15)

Camera acquisition is declared explicitly through the existing native Capture selection, staging and C3 repository contract. Existing IMAGE validation, byte identity, current Account/generation fences and normal recovery/retry remain owning checks. A prior schema must reject a Camera submission atomically rather than relabel it. No new endpoint, provider authority, Trip attribution or Core admission is introduced.

## Account-owned Capture original custody (isolated candidate; default CLOSED)

Explicit authenticated PUT/GET `/v2/capture-inputs/:inputId/material` carries
`X-OTR-Capture-Binding`: strict version1 canonical JSON containing accountId,
batchId, jobId, inputId, inputRevision, captureId, payloadId, captureRevision,
sha256, byteCount and mediaType. IDs are UUIDs; revisions positive safe integers;
bytes are 1..4MiB; media is PDF/JPEG/PNG. Backend derives actor from bearer Auth;
actor/account and path/Input must match. Reject query, Range and Content-Encoding.
PUT requires exact media Content-Type/Content-Length and original body bytes;
GET has no body. Actual signature, hash and count are verified both ways.

One immutable Capture association is retained in existing anchored custody after
original bytes are put/verified in existing `trip-source-material` DEV Storage
under deterministic `capture/<Account>/<Input>` keys. No-upsert POST follows an
exact GET; only verified GET bytes establish success after ACK loss/conflict.
Capture original bytes are not copied into Linux custody. GET withholds unregistered material even if an
unrelated private object has the same reference. Identity/pin changes reject.
Lost PUT ACK recovers exact GET/PUT using the original Input, never a new identity.
Success200 returns exact bytes, matching binding/ETag/length/type, private/no-store
and Vary Authorization. No filename, text, URI or credential enters metadata/logs.

Normal authentication401 is unchanged; invalid request422, actor mismatch403,
immutable binding conflict409, oversized stream413, missing association404 and
unavailable port/store503 expose finite codes only. Optional composition remains
absent at default startup. This is Account staging, not Trip Source/Representation
admission, processing or canonical acceptance. No table/role/migration is added.


## Capture remote Processing seam (local candidate; default CLOSED)

Authenticated POST/GET `/v2/capture-jobs/:jobId/inputs/:inputId/processing/:taskId`
uses the existing exact `X-OTR-Capture-Binding`. Path/account/input/job/task pins
must match; actor comes from normal Backend authentication. POST carries a strict
version1 existing ModelTask request and exact persisted extraction text/text SHA.
The canonical binding/text material digest and byte count must equal task input.
JSON is bounded to512KiB, text to256KiB, response to1MiB, execution to35 seconds.
GET reads only; it must not initiate a Provider request. No query/range/encoding.

The normal authenticated Native transport and existing C3 Repository recheck actual
completed local operation, original pins and account generation before/after I/O.
Remote errors preserve the existing local interpretation. No Provider key enters
Mobile. No second local journal or Source authority is created by this interface.

Startup accepts an optional owning port. The default is503 CLOSED: real protected
issuer, profile/cost policy, persisted task/call/raw/metering and material authority
must be installed separately before Runtime verification. The port interface and
fixture tests do not establish that deployment or grant dispatch permission.


## Universal PDF original and material provenance (unbound candidate)

An owning Source manifest/result may carry optional `pdfSource` alongside the
existing text material binding: exact PDF original representation/hash/byte count,
V2 seal/page-map hashes and transform-options hash. The text binding remains the
sealed DERIVED representation and byte hash; Native compares the retained PDF
against the separate original identity/size. Metadata alone never qualifies a
Source. Task transform pins use the owning derivative's transform-options hash.
Unqualified or mismatched parent/profile remains closed; normal TEXT JSON stays
unchanged. The shared owning lifecycle snapshot can read this DERIVED text only
with one exact published provenance binding and the existing V2 PDF proof reader:
original/derived hashes and identities, seal/page map, current rows, custody and
current gate must all match. It never relabels a PDF as ORIGINAL TEXT. No SQL,
authority, parser or Runtime activation is included.

## Universal Source pending PDF metadata (default-closed candidate)

The existing Original Source acquisition/lookup adapter may explicitly opt into
PDF FILE/BINARY metadata, within the existing Capture4MiB bound and strict null
encoding/text/locator fields. Default composition remains text-only. This forwards
only the existing ACQUIRE_SOURCE command to its owning RPC; it does not register
upload work, start a parser, verify bytes, create a Task or grant Admission. Its
receipt must remain PENDING with no verified timestamp; VERIFIED or text-only
NOT_APPLICABLE cannot masquerade as a PDF acquisition receipt. Normal Actor/Trip
checks and existing SQL eligibility still apply. Configuring this software option
cannot activate the protected PDF scope; no current Runtime enables it.

## Source PDF V4 preparation HTTP (unbound implementation candidate)

Candidate POST routes use
`/v2/trips/:tripId/sources/:sourceId/representations/:representationId/pdf-v4/:operationId/{prepare,reserve,finish,stage,dispatch,observe-retained}`.
The enclosing Backend must authenticate bearer identity; the adapter checks current
Trip access and uses the existing causal owner's account-generation reader, never
an Actor/generation supplied by request JSON. Stage delegates raw PDF bytes to the
existing bounded private Stage; dispatch and observe-retained accept no body and
reuse the existing durable dispatch/causal observation ports. Responses expose only
operation/Source identities and the completed transport step, never Stage paths,
resource/run tokens, provider configuration, internal bindings or custody evidence.
Transport acknowledgement is not Source verification, Admission or Save. Missing
ports fail closed before body consumption. The parent handler authenticates and
delegates only through this optional port; normal startup does not supply it. No
worker service, SQL activation, budget or permission change is part of this
candidate; those require separately qualified composition and authority.
`prepare` accepts the frozen six-pin `PREPARE_REPRESENTATION` command and returns
its strict owning parent receipt. It requires the explicit V4 continuous-context
option and runs the existing prepare RPC on the same Source transaction; it never
manufactures a parent or allocates upload resources. For this action `operationId`
is that durable PREPARE identity. For all other actions it is the existing durable
`UPLOAD_ORIGINAL` command identity, never the Source acquisition ID or a
transport-generated replacement. `reserve` admits
that identity; stage/dispatch/observe-retained/finish use its reservation.
Optional reserve/finish accept only the frozen bounded16KiB `UPLOAD_ORIGINAL`
Source command, not caller resource/attempt/run capabilities. The existing V4
causal authority owns admission, idempotent journal lookup and final receipt;
Backend creates internal resource identities. Route/Actor/Trip/representation,
4MiB scope and current generation are checked, including after awaited writes.
UNKNOWN never triggers an automatic retry/new operation. A completed result may
include only the existing strict Source upload receipt; other transport steps
remain observations. Missing reservation composition remains closed. These routes
do not install SQL, activate the historical PDF scope or invoke a worker.

The corresponding Native transport is explicit-only: existing Account context and
Session token, same durable Source operation identity, raw owned bytes within the
existing Capture4MiB limit, bounded response and no automatic write retry. The
causal observation POST consumes any existing explicit QA read allocation rather
than bypassing it; no allocation or limit increases. A transport observation does
not replace the owning Source operation receipt, custody verification or seal.

A matching GET `.../pdf-v4/:operationId/status` reads the existing inventory under
normal Auth/Trip access. It returns only `STATUS_OBSERVED` plus a strict status
enum, never the journal or resource/run capabilities. `NO_ACTIVE_ATTEMPT` also
covers cleaned terminal attempts and does not prove no historical receipt.
`DISPATCH_RECORDED` proves a durable journal grant, not that a remote POST ran.
ACK/GET observations do not grant custody verification, Source or Admission.
Old owner/provider state returns `RECOVERY_REQUIRED`; UNKNOWN never dispatches.
The Native GET consumes the existing explicit QA read budget. Startup stays closed.

The optional per-request composition is created only after normal bearer Auth and
Trip checks and is closed in the boundary's `finally`. The explicit
`SOURCE_REQUEST_LIFETIME_V1` marker is an internal async request fence, not a
persistent Account/Session epoch or authorization claim. It never enters SQL,
receipts or Native JSON and cannot establish cross-request/restart continuity.
Legacy V3/non-continuous V4 reject it. Normal Auth/Trip is independently rechecked
around SQL and Storage IO; synchronous lifetime checks also guard queued leases,
scope entry and owning queries. Request abort/close stops deferred work. A closed
per-request composition never falls back to an older global port.

An in-flight COMMIT or Storage POST can still complete before closure is observed;
withholding its late result does not undo it. Existing durable operation/resource
identity and UNKNOWN/readback rules remain mandatory; no automatic replacement
or write retry. This composition is not supplied by normal startup yet.

## Universal Import — unstarted deadline recovery (implementation candidate)

A status GET remains read-only and projects the persisted owning Task/revision.
An actual targeted wake may close an expired, zero-Attempt PENDING/WAITING Task
through the existing continuation Repository `wait` deadline branch after normal
Actor/Trip/Source and current queue-claim checks. It records FAILED with
DEADLINE_EXHAUSTED; it does not reset the ID/deadline or initiate a Provider call.
Existing Attempt/UNKNOWN/running/result-pending responsibility is not terminated
by this path. Completed/failed/canceled/stale observations do not authorize a new
Source preparation; Native retains read-only Results/original recovery. No wire
state enum, Schema, GRANT or Admission authority is added. Runtime acceptance
must be recorded separately from local tests.

An explicit existing-Task resume uses the existing authenticated POST prepare
endpoint with strict `{version:"otr.backend.universal-resume/1",tripId,batchId,taskId}`
and Task ID idempotency header. It accepts no Source/input/provider facts. The
Backend reads and compares the owning context, returns EXISTING/202, and wakes
only that existing queue. Native explicit Start uses it when a Task is already
known; reopen/status GET never wakes. Mismatched Task/context or QUEUED resume
responses are rejected. Existing Attempts cannot get another Provider send; the
normal expired-unstarted branch records its owning deadline failure.

## Universal Import — bounded Source P1 integration (2026-10-26)

Universal intake/results use authenticated `/v2/import-batches/{batchId}/interpretations` Context/Result/prepare routes and existing owning Source/Task repositories. Candidates and observations do not grant admission. Original text material is acquired/read only through the account/Trip-scoped original-source interface.

Formal P1 uses `/v2/trips/{tripId}/core/universal-p1-candidates`, existing Source Plan prepare and Core commands with `REVIEWED_SOURCE`, followed by `/core/universal-p1-source/finalize`. The normal user explicitly reviews retained original/current Trip, selects NEW and confirms evidenced title/civil date. No clock/place/Booking/entitlement is inferred. Immutable candidate, exact Source pins, current owning Actor/Trip/Graph, plan-slot-purpose/intent and receipt checks remain mandatory. Same-operation replay retains one item/receipt; UNKNOWN is reconciled before retry. APPLIED recovery finalizes Source only.

P3 uses those same legacy-named publication/finalization routes with explicit `family: "P3"`; omitted family remains P1. A response must match the request family. P3 review version `otr.universal.p3-source-review/1` requires explicit retained-original/current-Trip/NEW confirmation and evidenced property name, check-in and check-out civil dates, with checkout after check-in. Existing `CREATE_ITEM(P3)` and `P3_ITEM` proof select only ROOT.title/START.local_date/END.local_date in the minimum slice. Unknown clocks/zones remain null; missing optional Contact/Instructions do not create required-field review. Address/Guest/Booking observations grant no Place, Person or commercial rights. P3 reviewed capability never grants Manual P3. Durable APPLIED recovery finalizes Source without resending Create. Runtime/SQL scope remain default closed; isolated tests and a sealed candidate are not hosted P3 Save PASS.

Frontend P1 opt-in and backend P1 runtime are default-off. Protected DEV rollout/Admission remains separately scoped; code integration grants none. Local schemas69–74 are existing qualified prerequisites; the schema73 mixed-input rebuild preserves old records/FKs and rolls back atomically. No hosted DDL/RLS/GRANT is installed by this integration. Native manual-editor/asset additions remain excluded.

Actual source-branch DEV evidence: [P1 formal receipt](ops/universal-stage2-20261025/actual-execution/resume-20261026/P1_FORMAL_SAVE_SERVER_RECEIPT.json). Scoped one-item E2E/Day/full-restart/duplicate/closure passed; this is not generic P2–P6 Save or main deployment qualification.


## Universal P2 Flight publication binding — implementation candidate, runtime closed

The existing Universal candidate route and existing Flight publication/Source Plan
remain the owning path. Explicit family P2 requires the dedicated P2 Source Review:
original and Trip reviewed, NEW, exact original flight-number literal and departure
civil date. HIGH and the generic `service` field alone do not authorize creation.
The first slice proposes only `CREATE_SPARSE_FLIGHT`, PRIVATE/SELF, with literal and
date; no automatic QUALIFY, endpoint Place, clock, zone, Journey, Booking or Ticket.

An optional `universalP2` reference on the existing Flight publication request binds
Batch/Task/Run/token, the Backend-owned published result hash and exact Source Review.
It is part of the existing immutable publication request hash, not a second store or
authority. The Backend must reconstruct it from its owning Published reader and
locked current Source inputs before sealing, and repeat the same owning checks on
Source Plan/Admission/proof reads. Matching client hashes never substitute for that
reader. Legacy Flight publications without this reference retain their contract;
the later Universal P2 Save scope must reject publications lacking its exact binding.

The existing date-bound airport identity and FLIGHT_OCCURRENCE proof remain required,
even for this Sparse creation. Dormant QA registry rows confer no authority. All live
P2 publication/Admission/Core write activation remains subject to its separate exact
Owner Gate. Existing P1/P3 paths and their consumed windows are unchanged.

Universal P2 publication metadata also pins `proposedPlanSha256` using the existing `otr-trip-core-source-plan-v2` digest. It binds the complete deterministic Sparse-only Source Plan before publication; the owning reader rebuilds both request and Plan. It is not an Admission grant.
# Candidate: explicit authored Trip Person creation (24 October 2026)

DEV candidate, default CLOSED and pending the precise Person SQL/ACL authorization. Normal authenticated `POST /v2/trips/:tripId/people` consumes `personCloudCreateSchema`, with an exact `Idempotency-Key` equal to `operationId`; `GET /v2/trips/:tripId/person-create-operations/:operationId` returns the immutable typed receipt or exact `PERSON_CREATE_NOT_FOUND`. Both require current Trip read authorization plus owning SQL creation/result qualification, have private/no-store responses, and bind Actor/Trip/Operation/Person without name-based identity inference. The 8 KiB request limit applies before Node buffers the body.

Only a new explicit `CLOUD_SHARED_AUTHORED` intent can use this contract. Existing private name intents are not upgraded. The created Person is unlinked, has no Account, invitation or access grant, and retains its stable Person ID. This is an owning Person creation extension, not an extension of SET_PARTICIPATION, Invite or Claim. Receipt/readback validation and local SQLite74 qualification precede P1 dependency resolution. No endpoint or local receipt implies a DEV deployment or Cloud acceptance.

## Import Updates — existing Task read projection (2026-10-28 candidate)

The Import-owned Updates section reads the latest20 Account Capture jobs through the existing repository, then existing normal Auth/Trip context GETs. Only validated current RESULTS_READY/FAILED/UNKNOWN/STALE observations become one stable `universal-import:<Batch>` row. Routine progress/canceled/unobserved work is not a notification. Newer states replace or remove that Batch row rather than append retries. Current Trip/query filters apply; other Accounts never contribute.

These are partial recent processing records with no invented unread state, Save outcome or formal Review authority. They appear in All/Activity, outside unread/Needs Attention filters until an owning read-marker/action-resolution contract exists. Existing Capture-intake notification markers and badge/read actions remain separate and unchanged. Open rechecks the original Account generation and repository Job/Batch/Trip identity, then uses the existing Capture/Results route; it cannot dispatch/prepare/charge/resolve a Review or create an Item. No new database/schema/platform or remote endpoint. Formal Save/Review events and full unread integration remain pending owning-state qualification.

### Dormant P2 authored endpoint candidate — 29 October 2026

`SET_AUTHORED_FLIGHT_DETAILS` is a local candidate in the existing Core finite command union, not enabled in any deployed capability or Native normal runner. It writes only the same Creator's existing SPARSE P2 Item with an exact base revision; the Backend must additionally require receipted MANUAL Create provenance before enabling it. Literal/airport/name/terminal/civil boundaries remain authored and unresolved; no Source proof, qualified Flight service, Booking/Ticket/Segment/Journey or UTC authority is created. Existing `SAVE_AUTHORED_FLIGHT_LOCAL` stays local-only. See ops/manual-cloud-e2e-20261028/P2_MANUAL_MINIMUM_PORT_20261029.md; exact Backend/SQL/Native Queue work and protected approval remain pending.

The dormant authored Flight capability extension uses `X-OTR-Core-Authored-Flight: 1` only to advertise that a client can parse `SET_AUTHORED_FLIGHT_DETAILS`. GET capabilities omits that new enum for absent/unknown header values so older v2 clients keep parsing their existing P1/P3-P6 capabilities. New Native sends the header only on capabilities requests. SQL permission, command submission, Creator/provenance, Source exact-operation and receipt rules do not depend on this header. Responses retain private/no-store and vary by Authorization plus this parser-support header.
