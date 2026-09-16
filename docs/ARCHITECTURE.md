# OTR Mobile 2.0 Architecture Proposal

## Summary

Use React Native with Expo, TypeScript, Expo Router, Expo Development Builds, SQLite, a repository layer, and a dedicated sync engine. The local database is the primary data source for the mobile app. App launch is offline-tolerant: a valid local session opens the app immediately, while cloud session refresh runs silently in the background. The OTR Backend API is the synchronization and authorization boundary. Supabase remains behind the backend and must not appear in feature or UI code.

## Proposed Directory Structure

```text
src/
  app/                 Expo Router routes and navigation shells
  features/            Today, itinerary, ledger, tickets, capture, trips, settings
  domain/              Pure domain types, validation, calculations, policies
  data/
    api/               OTR Backend API client and endpoint modules
    db/                SQLite schema, migrations, query helpers
    repositories/      Feature-facing read/write interfaces
    sync/              Mutation queue, pull sync, conflict handling
  native/              Native capability adapters
  components/          Shared UI primitives
  hooks/               Shared hooks
  utils/               Small platform-neutral utilities
  types/               Cross-cutting TypeScript types
```

Feature modules may compose UI, hooks, and repositories. Domain modules must not import UI, SQLite, Expo APIs, or API clients. Repositories coordinate local reads/writes and enqueue sync operations.

## React Native / Expo Setup

Use Expo with Development Builds and prebuild support from day one. Expo Go is useful for simple iteration but must not define the architecture because future work may need Swift, Kotlin, Background URLSession, WorkManager, PhotoKit, MediaStore, nearby transfer, and custom file handling.

Recommended baseline:

- React Native through Expo SDK.
- TypeScript strict mode.
- Expo Router.
- `expo-sqlite` for local database.
- `expo-file-system` for cached documents and asset references.
- `expo-network` for development diagnostics and future sync reachability checks.
- `expo-secure-store` for refresh/session tokens or encrypted token material.
- Native folders generated via prebuild when needed.

## Navigation

Do not copy OTR Web information architecture. The currently implemented Phase
1 tabs remain:

- Today.
- Expenses.
- Capture as a central/global action.
- Trip.

Tickets may surface inside Today and Trip before becoming a top-level destination.

The approved long-term bottom-navigation target is Today / Ledger / Trip /
Album. Capture becomes a global creation action when the current Capture route
and state dependencies are deliberately migrated. The bottom-tab migration is
not part of the current Global Menu and Account Switching work.

The global menu is contextual:

- fixed account/global actions: current user, Settings, Language, Log out;
- current-module secondary actions, such as My Ledger, Review, and Ledger
  Settings while Ledger is active;
- Development-only diagnostics and remembered Dev-account switching.

It does not repeat the primary bottom destinations. Missing My Trips, My
Albums, Trip Settings, or Album Settings routes are omitted rather than
represented by placeholder screens.

## State Strategy

Use local SQLite as durable state and repositories as the authoritative app-facing API.

Use lightweight component state for ephemeral UI state. Use TanStack Query only for repository-backed async views, cache invalidation, and stale state orchestration. It should not become the source of truth and should not talk directly to the network from UI.

Avoid Redux, MobX, XState, or a large client state framework during initialization unless a specific workflow proves it is needed.

## Local Database

SQLite is the preferred storage foundation. Keep schema explicit and migration-controlled.

Separate:

- Domain data.
- Sync metadata.
- Data sync queue.
- File upload queue.
- Photo upload queue.
- Local asset references.
- Cache.

Every syncable record should reserve space for:

- `id` as local stable UUID.
- `server_id` when known.
- `created_at`.
- `updated_at`.
- `sync_status`.
- `sync_version`.
- `deleted_at`.

Do not freeze full migration details until the data model is confirmed.

## API Layer

Mobile talks to the OTR Backend API, not directly to Supabase. The API client handles auth headers, request ids, retries for safe operations, response validation, and error normalization.

Endpoint modules live under `src/data/api/`. They should return parsed DTOs, not raw `Response` objects.

## Repository Layer

Repositories are the only feature-facing data interface. They:

- Read from SQLite.
- Write user mutations locally first.
- Enqueue sync operations.
- Expose sync status.
- Reconcile backend responses into local records.

UI must not import database helpers, API clients, or sync internals directly.

## Sync Engine

The sync engine owns initial sync, incremental pull, mutation push, idempotency, conflicts, retries, deletes, auth expiration recovery, and app restart recovery.

Sync must be durable. A page unmount must not cancel the logical operation.

## File Storage

Use local file references for downloaded tickets, PDFs, thumbnails, previews, and future photo assets. Domain records should reference local asset ids, not raw file paths where possible.

The upload lifecycle belongs to queues and workers, not screens.

## Auth

Supabase Auth remains the Phase 1 identity provider, wrapped behind a Mobile auth adapter or repository. Mobile feature code must not call Supabase Auth directly. The OTR API validates Supabase-issued identity tokens.

Authentication must be offline-tolerant. App launch must never require network re-authentication when a valid local session exists. Cached trip data remains accessible offline even if the access token has expired. Token refresh and session validation happen silently in the background. Network/auth failures pause synchronization rather than blocking app access.

Launch flow:

```text
Launch app
  -> read local session from SecureStore/Keychain
  -> if no local session, show Login
  -> if local session exists, open local app immediately
  -> show SQLite-backed cached data
  -> refresh/revalidate cloud session in background
  -> if refresh succeeds, resume sync
  -> if offline, stay in Offline Mode and keep sync paused
```

Token expiry is not the same as logout. If the access token has expired but the device has no network, the user can still read local trip data, create expenses, edit itinerary, open cached tickets, capture input, and enqueue uploads. Server mutation, cloud upload, and fetching new team data wait until auth refresh succeeds.

Only explicit server rejection, revoked or invalid refresh session, disabled account, user logout, maximum trust expiry confirmed by the server, or a clear security event may transition the app to `REAUTH_REQUIRED`.

Use secure storage for token material. Face ID or Touch ID may later be used as local device unlock, but it is separate from server authentication.

The local session model includes an explicit stable user identity. Remembered
accounts store independent secure sessions, and one account is active at a
time. A switch boundary pauses new synchronization, lets the old account's
in-flight authenticated work settle, changes the active secure session,
invalidates in-memory projections, restores only the target account's scoped
cache, and then resumes synchronization for operations owned by that account.

Device-local `user_id`, `owner_user_id`, and `local_owner_user_id` fields are
isolation metadata. They do not redefine server ownership, Journey membership,
financial ownership, or authorization. Server-confirmed Journey records remain
shared locally for every active account that has a valid cached/Backend actor
context for that Journey. Local unconfirmed records remain visible only to the
account that created them.

Internal auth states:

- `AUTHENTICATED_ONLINE`
- `AUTHENTICATED_OFFLINE`
- `REFRESHING`
- `REAUTH_REQUIRED`
- `SIGNED_OUT`

## Native Modules

Native integrations should be isolated behind `src/native/*` adapters so domain and feature code remain Android-compatible even during iOS-first validation.

Likely future adapters:

- Photos.
- Background workers.
- Maps/navigation launcher.
- File/document access.
- Nearby transfer.

## Error Handling

Normalize errors into user-safe categories:

- Offline.
- Auth expired.
- Permission denied.
- Conflict.
- Validation.
- Server unavailable.
- File unavailable.
- Unknown.

Domain validation should produce actionable field errors. Sync errors should preserve enough metadata for retry and diagnostics.

## Logging

Use a small logging abstraction with levels and redaction. It should support local development output and future remote diagnostics. Never log tokens, booking QR payloads, full document text, or private expense notes by default.

## Analytics Placeholder

Create an analytics adapter later, but do not wire a vendor during initialization. Track only product-critical events once privacy policy and consent are clear.

## Environment Management

Use checked-in examples for environment variables, platform-specific app config, and API base URLs. Secrets must stay out of Git.

Proposed environments:

- Local development.
- Preview/staging backend.
- Production backend.

## Dependency Proposal

Core dependencies to evaluate during initialization:

- Expo SDK: stable React Native distribution and native config.
- Expo Router: file-based native navigation aligned with Expo.
- TypeScript: domain safety and DTO contracts.
- ESLint and Prettier: consistent multi-agent edits.
- `expo-sqlite`: official Expo SQLite path.
- TanStack Query: async view orchestration above repositories.
- Zod: runtime validation for API DTOs and parser outputs.
- Vitest or Jest: unit tests for domain/repository logic.
- React Native Testing Library: UI behavior tests once screens begin.

Keep package count small. Prefer official Expo modules and widely adopted libraries.
