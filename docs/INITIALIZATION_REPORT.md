# OTR Mobile 2.0 Initialization Report

## Deliverables

1. Legacy Audit: `docs/legacy/OTR_LEGACY_AUDIT.md`
2. Architecture Proposal: `docs/ARCHITECTURE.md`
3. Product Scope: `docs/PRODUCT.md`
4. Data Model Draft: `docs/DATA_MODEL.md`
5. API Contract Draft: `docs/API_CONTRACT.md`
6. Offline Sync Design: `docs/OFFLINE_SYNC.md`
7. Agent guide: `AGENTS.md`
8. ADRs: `docs/adr/`

## Repo Directory Proposal

```text
OTR-mobile/
  AGENTS.md
  docs/
    PRODUCT.md
    ARCHITECTURE.md
    DATA_MODEL.md
    API_CONTRACT.md
    OFFLINE_SYNC.md
    INITIALIZATION_REPORT.md
    legacy/
      OTR_LEGACY_AUDIT.md
    adr/
      0001-react-native-expo.md
      0002-offline-first.md
      0003-api-boundary.md
      0004-ios-first-android-compatible.md
  src/
    app/
    features/
    domain/
    data/
      api/
      db/
      repositories/
      sync/
    native/
    components/
    hooks/
    utils/
    types/
```

Do not create feature UI until the Phase 0 architecture decisions below are confirmed.

## Dependency Proposal

Core:

- Expo SDK: supported React Native foundation and native module ecosystem.
- TypeScript: shared domain contracts and safer sync/API DTOs.
- Expo Router: mobile navigation with Expo conventions.
- `expo-sqlite`: official SQLite storage path for offline-first data.
- `expo-file-system`: cached tickets, PDFs, previews, and local asset references.
- `expo-secure-store`: secure token/session material.
- TanStack Query: repository-backed async state orchestration, not source of truth.
- Zod: runtime validation for API responses, sync payloads, and parser output.

Tooling:

- ESLint.
- Prettier.
- Vitest or Jest.
- React Native Testing Library once UI begins.

Avoid for now:

- Large ORM.
- Redux/MobX/XState.
- P2P libraries.
- Face recognition libraries.
- Heavy UI kits.

## Legacy Findings

Reusable:

- Trip/Journey, member, role, itinerary, reservation, ledger, media asset, currency, capture, parser, storage provider, background job concepts.

Needs redesign:

- Direct Supabase data access.
- Mobile API contract.
- Offline mutation queue.
- TravelDocument as a first-class model.
- Persistent mobile upload/download queues.
- Ledger edit history and conflict handling.

Discard:

- Web pages, CSS, sidebar, desktop IA, Chat, Story, Poster, Highlights, and independent map homepage.

## Risk List

- Backend API may not yet expose trip/member/itinerary/ledger operations needed by Mobile.
- Legacy Web direct Supabase usage may hide business rules that need to be moved server-side.
- Offline conflict behavior for ledger splits and itinerary edits needs product decisions before migration.
- Ticket/QR local storage may need encryption or redaction policy.
- Auth architecture is unclear if Supabase remains the identity provider.
- SQLite schema choices could become expensive if finalized before sync semantics are confirmed.
- Photo/media concepts are entangled in Web with memory/chat flows; Mobile needs a cleaner document/asset boundary.
- Current local checkout did not have a configured remote at audit time; intended remote is `https://github.com/xoery83/OTR-mobile`.

## Phase 0 Decisions Approved

1. Mobile domain terminology uses `Trip` exclusively. Legacy `Journey` is mapped only at compatibility boundaries.
2. OTR Mobile uses a dedicated OTR Backend API for business data. No direct Supabase table access from feature/UI code.
3. Supabase Auth remains the identity provider for Phase 1, wrapped behind a Mobile auth adapter/repository. OTR API validates Supabase-issued identity tokens.
4. Authentication is offline-tolerant. App launch must never require network re-authentication when a valid local session exists. Cached trip data remains accessible offline even if the access token has expired. Token refresh and session validation happen silently in the background. Network/auth failures pause synchronization rather than blocking app access.
5. Use official `expo-sqlite` with explicit migrations and repository abstractions. Do not introduce a large ORM yet.
6. Ledger uses field-sensitive conflict handling. Financial fields such as amount, payer, currency, participants, and splits must not silently use last-writer-wins. Preserve edit history.
7. Keep `TripEvent`, `Booking/Reservation`, and `TravelDocument` as separate but linkable domain models.
8. Phase 1 tickets/QR use secure app-local storage and OS protections. Do not build custom document encryption yet. Never expose sensitive ticket payloads in logs or shared/public storage.
9. Phase 1 IA is `Today`, `Expenses`, central/global `Capture`, and `Trip`.
10. Establish automated testing for domain, repository, and sync logic from the start; add React Native Testing Library when UI development begins.
11. Flatten the repository now so `/Users/xoery/Project/otr-mobile` becomes the canonical project root.

## Foundation Validation

- The physical-device development build launches and renders the React Native shell.
- Metro reaches the paired physical iPhone over the current wired/tethered development setup.
- SQLite migration initialization, offline-auth bootstrap policy, and durable sync queue rehydration have automated coverage.
- The typed API client injects auth and normalizes HTTP, network, timeout, and runtime-validation failures; it has no Supabase business-table path.
- The sync engine owns worker execution, processing/completed/retry lifecycle, exponential retry metadata, and SQLite rehydration. A local file-cache adapter is ready for future ticket/PDF/media references.
- Development builds expose `otrmobile://foundation` for DB initialization, schema version, auth state, network reachability, and pending-sync diagnostics.
- API, repository, and sync boundaries remain separated. An automated architecture guard confirms no feature/UI module calls Supabase, the API client, or SQLite directly.
- `ENABLE_USER_SCRIPT_SANDBOXING=NO` is enforced by an Expo config plugin so native regeneration preserves it.
- Typecheck, lint, formatting, 30 unit tests across 16 test files, Expo Doctor, Xcode destination discovery, Debug and Release physical-device builds, and Metro connectivity have been verified.
- The legacy OTR Web repository remains unchanged.

## Validated Vertical Slices

- Phase 2A Expense Create: local-first create, durable queue, offline restart, fake success/failure/retry reconciliation, and read-only SQLite verification passed on a physical iPhone.
- Phase 2B Itinerary Create: Journey-scoped create/query behavior, durable queue, offline Release cold start, fake success/failure/retry, worker isolation, and read-only SQLite verification passed on a physical iPhone.
- The current schema version is 4. Migration 4 idempotently repairs development databases that recorded migration 3 before the `itinerary_items` table existed.

## Status

FOUNDATION READY

Phase 1 foundation and the approved Phase 2A/2B validation slices are complete. Do not begin additional product scope until the next scoped feature decision is approved. See `docs/IOS_DEVICE_RUNBOOK.md` for the physical-device workflow.
