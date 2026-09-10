# OTR Dev Backend

## Scope

Phase 3B provides only:

- `POST /v1/trips/:tripId/expenses`
- `POST /v1/trips/:tripId/itinerary-items`
- `GET /health`

The backend targets Hosted Supabase Dev project `tuqigdxrvrerfewsxqgm`. It is
not a general Ledger, planner, upload, Capture, or production backend.

## Runtime Boundary

```text
OTR Mobile Development Build
  -> SQLite local write
  -> durable sync operation
  -> typed Dev transport with Supabase access token
  -> OTR Dev Backend
  -> Hosted Supabase Dev
```

Only the backend imports the Supabase database client. Mobile's Supabase usage is
limited to the Auth adapter required to obtain and refresh a user session.

## Environment

Create an ignored `.env.backend` for the backend. Do not use a `.local` suffix:
Metro interprets that suffix as a platform source extension and may try to parse
the file during a Mobile bundle.

```text
OTR_DEV_SUPABASE_URL=https://tuqigdxrvrerfewsxqgm.supabase.co
OTR_DEV_SUPABASE_PUBLISHABLE_KEY=<Dev publishable key>
OTR_DEV_SUPABASE_SECRET_KEY=<Dev server-only secret key>
OTR_DEV_BACKEND_PORT=8787
```

Create an ignored `.env.local` for the Development Build:

```text
EXPO_PUBLIC_OTR_SYNC_TRANSPORT=dev
EXPO_PUBLIC_OTR_API_BASE_URL=http://<Mac-LAN-IP>:8787
EXPO_PUBLIC_OTR_DEV_SUPABASE_URL=https://tuqigdxrvrerfewsxqgm.supabase.co
EXPO_PUBLIC_OTR_DEV_SUPABASE_PUBLISHABLE_KEY=<Dev publishable key>
EXPO_PUBLIC_OTR_DEV_TRIP_ID=10000000-0000-4000-8000-000000000001
```

The publishable key is designed for client distribution but still remains out
of Git so environments cannot be confused. Never put the secret key, database
password, or an access token in an `EXPO_PUBLIC_*` variable.

## Local Run

```bash
npm run backend:dev
npm start
```

The phone and Mac must be able to reach each other. Use the Mac's active LAN IP,
not `localhost`, in `EXPO_PUBLIC_OTR_API_BASE_URL`. The backend validates that
the configured Supabase URL is the approved Dev project before listening.

## Authentication

The development-only diagnostics route supplies a small Auth harness for email
and password sign-in. Tokens are persisted through the existing SecureStore
repository. App launch remains offline-tolerant: a cached session opens local
data immediately, while refresh and remote sync wait for network availability.

Use only a dedicated Dev Auth identity that is a creator or linked member of the
synthetic Dev trip. Do not use a production identity or credential.

## Idempotency

Both endpoints require `Idempotency-Key`. The backend derives a stable UUID from
the authenticated user, entity type, and key. A repeated request returns the
same row with `idempotentReplay: true`. Reusing the key with a changed body still
returns the original accepted entity.

For response-loss testing, set this Development Build variable before launching
Metro:

```text
EXPO_PUBLIC_OTR_DEV_SIMULATE_RESPONSE_LOSS_ONCE=expense
```

Use `itinerary` for the itinerary path. The adapter discards one successful
response locally, leaving the queue retryable; the next run proves that the
backend returns the original row.

## Safety

- Logs never include bearer tokens, keys, expense titles, itinerary notes, or
  request bodies.
- Request and response payloads are runtime validated.
- Trip access is checked server-side for every request.
- Server credentials are never imported by Mobile modules.
- Fake transports remain the default when transport configuration is absent.
