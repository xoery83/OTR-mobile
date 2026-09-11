# OTR Mobile 2.0 API Contract Draft

Ledger 2.0 uses the frozen aggregate contract in
`docs/ledger/LEDGER_2_0_API_CONTRACT.md`. Existing Expense routes in this file
remain Phase 3B compatibility routes until each `/v2` vertical slice is ready.

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

`GET /trips/:id/ledger/export` - `NEW`

- Export CSV/PDF once MVP needs it.

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
