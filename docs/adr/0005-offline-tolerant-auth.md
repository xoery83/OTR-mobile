# ADR 0005: Offline-Tolerant Authentication

## Status

Accepted

## Context

OTR Mobile is used during travel, including flights, mountains, train stations, roaming dead zones, and weak hotel networks. Local-first data is not enough if opening the app itself requires a fresh online auth check.

Supabase Auth uses access and refresh token session semantics. Mobile can preserve a local login state and refresh cloud credentials silently when the network is available.

## Decision

Authentication must be offline-tolerant. App launch must never require network re-authentication when a valid local session exists. Cached trip data remains accessible offline even if the access token has expired. Token refresh and session validation happen silently in the background.

Supabase Auth remains the Phase 1 identity provider, wrapped behind a Mobile auth adapter/repository. The OTR API validates Supabase-issued identity tokens. Feature and UI code must not call Supabase Auth directly.

Internal auth states:

- `AUTHENTICATED_ONLINE`
- `AUTHENTICATED_OFFLINE`
- `REFRESHING`
- `REAUTH_REQUIRED`
- `SIGNED_OUT`

`AUTHENTICATED_OFFLINE` allows local reads, local writes, expense creation, itinerary edits, cached ticket/document access, capture input, and enqueueing sync/upload work. It does not allow server mutation, cloud upload, fetching new team data, or pulling remote changes.

Only explicit server rejection, revoked or invalid refresh session, disabled account, user logout, maximum trust expiry confirmed by the server, or a clear security event may transition the app to `REAUTH_REQUIRED`.

## Alternatives

- Online auth check before app entry: simpler but fails the travel use case.
- Treat expired access token as logout: secure-looking but incorrect for offline session semantics and hostile to travellers.
- Backend-issued custom sessions in Phase 1: flexible but adds unnecessary authentication scope before the product foundation is proven.

## Consequences

The app can open and operate locally in offline conditions. Sync and upload workers must distinguish local auth state from cloud session validity. Security-sensitive transitions must be explicit and auditable rather than accidental side effects of network failure.
