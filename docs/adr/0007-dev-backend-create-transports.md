# ADR 0007: Dev Backend Create Transports

- Status: Accepted
- Date: 2026-09-10

## Context

The Expense and Itinerary create slices already write to SQLite first and use a
durable sync queue, but their transports are development fakes. Phase 3B needs a
real authenticated path to Hosted Supabase Dev without allowing Mobile feature
code or workers to access Supabase business tables.

The canonical production-shape tables do not contain a Mobile idempotency key.
Adding a public bookkeeping table would change the approved baseline manifest
for a concern owned by the backend.

## Decision

Add a small Node-based OTR Dev Backend workspace to this repository. It exposes
only authenticated create endpoints for the two approved slices. Supabase Auth
validates every bearer token against the Dev project, server logic verifies trip
write access, and a server-only Supabase client performs the business-table
write.

The backend derives each remote row UUID deterministically from the authenticated
user id, entity type, and Mobile idempotency key. A repeated request therefore
addresses the same row. If the first response is lost, the retry returns the
existing row and its original version metadata instead of inserting a duplicate.
This requires no new public table or canonical schema change.

Mobile selects `fake` or `dev` transport through environment configuration. Both
adapters implement the existing worker transport interfaces. UI, repositories,
queue ownership, and local-first writes remain unchanged.

## Security Boundaries

- The backend refuses to start unless its Supabase URL belongs to the approved
  Hosted Dev project reference.
- Publishable and server-only keys remain outside Git.
- Mobile may use Supabase Auth only; it does not receive the server-only key and
  does not access business tables.
- Request validation and trip authorization run before any write.
- Logs contain request ids, route names, status, and timing only.
- Production Supabase and the legacy Web repository are not deployment targets.

## Consequences

Create retries are durable and duplicate-safe without changing the database
manifest. The create response uses version `1`; richer update/conflict versions
remain future work. Date-only itinerary items map to an estimated UTC
`planned_start` until timezone semantics are approved.
