# OTR Mobile 2.0 API Contract Draft

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

## Documents / Tickets

`GET /trips/:id/documents?since=:cursor` - `NEW`

`POST /trips/:id/documents` - `NEW`

- Create document metadata before or after file upload.

`PATCH /trips/:id/documents/:documentId` - `NEW`

`DELETE /trips/:id/documents/:documentId` - `NEW`

`GET /trips/:id/documents/:documentId/download` - `NEW`

- Returns signed URL or stream metadata for offline cache.

`POST /trips/:id/documents/:documentId/ocr` - `NEW`

- Future endpoint. Not Phase 1 required.

## Capture

`POST /trips/:id/capture` - `NEEDS_CHANGE`

- Legacy routes exist for capture AI config/detect/events/media upload.
- Mobile needs a single contract that accepts local capture input or references and returns proposed actions.

`POST /trips/:id/capture/:captureId/confirm` - `NEW`

- Converts proposed action to domain mutation.

## Sync

`GET /trips/:id/sync/bootstrap` - `NEW`

- Initial sync bundle: trip, members, today window, itinerary, ledger, documents, cursors, server clock, capabilities.

`GET /trips/:id/sync/pull?cursor=:cursor` - `NEW`

- Incremental changes across domains.

`POST /trips/:id/sync/push` - `NEW`

- Batch mutations with idempotency keys, local ids, base versions, and operation ordering.

`POST /trips/:id/sync/ack` - `NEW`

- Optional acknowledgement if backend uses durable server-side change logs.

## Files / Uploads

`POST /trips/:id/uploads/create` - `NEEDS_CHANGE`

- Legacy has direct upload creation routes for media.
- Mobile needs a generalized upload contract for documents, tickets, previews, and future photos.

`POST /trips/:id/uploads/:uploadId/complete` - `NEEDS_CHANGE`

`GET /trips/:id/uploads/:uploadId` - `NEEDS_CHANGE`

## Legacy API Notes

Existing Web routes are mostly AI, media, background jobs, i18n, maps/routes, Google Drive, and memory-shot/story/poster flows. They are useful reference for backend capabilities but are not a clean mobile API surface.
