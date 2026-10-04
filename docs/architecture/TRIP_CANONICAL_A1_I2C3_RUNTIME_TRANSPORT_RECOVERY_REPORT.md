# A1-I2C3 — Runtime transport, capability and exact receipt recovery

Status: **A1-I2C3 RECEIPT ERROR-SEMANTICS CORRECTION COMPLETE — REVIEW PENDING**.
Date: 2026-10-05. Mutation activation remains CLOSED.

## Baseline and scope

Started in clean `/Users/xoery/Project/otr-mobile-canonical`, branch
`integration/ledger-polish-canonical`, exact HEAD
`4dc70958b9347d45c4decaa85150c85efe8f6b57`. Both sibling worktrees were clean.
A1-I2C1 routes and accepted I2C2 command/receipt/certificate/reporting semantics
remain authoritative. This is a disabled transport/recovery preflight, with no UI,
normal dispatch, credentials, live connector, timer, new worker or migration.

## Fixed authenticated runtime boundaries

- GET `/v2/trips/:tripId/person-participation-capabilities`.
- POST `/v2/trips/:tripId/persons/:personId/participation-commands`.
- GET `/v2/trips/:tripId/person-participation-operations/:operationId`.

No aliases, enumeration, actor query parameter or recovery mutation fallback.
Existing Backend authentication verifies Account and read admission. POST validates
strict raw intent, independently recomputes SHA-256, and binds verified Actor,
route Trip/Person and Idempotency-Key/body operation. Caller Actor/JWT/GUC/header
claims cannot confer authority. The fixed SET executor is reachable only after
a separately reviewed activation; the immutable disabled capability keeps every
POST closed even when an injected/mock DB gate reports open.

The dedicated A gateway interface exposes only actual session_user, fixed installed
state discovery, fixed SET_PARTICIPATION and exact receipt lookup. The required
session is `otr_trip_person_command_gateway`. Missing/wrong/unknown identity or
unavailable state does not acquire capability; there is no service_role fallback,
generic SQL, arbitrary function, gate setter, credential loader or production
connection. The default server installs no connection. Future provisioning must
implement fixed discovery and fixed SQL under this actual session; it is pending.
Current Organizer authorization remains inside the reviewed DB exact lookup.

Capabilities always parse as DISABLED, with empty enabled commands/scopes. Open
DB discovery is projected UNKNOWN, never HTTP activation. GET requires known
command/receipt contract version and exact scope-correlated, hash-verified receipt.
Exact lookup authenticates Actor (`UNAUTHENTICATED` / 401), checks Trip admission
and current Organizer authority (`PARTICIPATION_FORBIDDEN` / 403), then looks up
only Actor/Trip/key and verifies receipt scope/hash. The unchanged fixed SQL admits
current Organizer before looking at receipts. Its exact SQLSTATE 42501 /
PARTICIPATION_FORBIDDEN denial is preserved by the gateway and mapped to 403;
unrelated permission/runtime errors stay unavailable. A former Organizer with
Trip read access receives 403 without receipt disclosure.
Admitted own-scoped absence returns `OPERATION_NOT_FOUND` / 404; foreign Actor/key
existence is not disclosed. Missing gateway or unavailable/corrupt/malformed lookup
returns `REPLAY_UNAVAILABLE` / 503, never NOT_FOUND. Neither 404 nor 503 proves a
concurrent/uncommitted request failed. Private raw storage fields are never forwarded.
Mobile already preserves status/code and pending intent; no transport/recovery
implementation change is needed, and neither error manufactures a new key/POST.

Backend tuple encoding is now independent of Mobile encoding, sharing only strict
schemas and the existing duplicate-/numeric-safe raw parser. Intent/result tuple
ordering, decimal-string revisions, UTF-8, Unicode/control escaping and UTC
microseconds match the accepted I2C2 protocol. Mobile independently verifies both
intent and result digest and exact Actor/Trip/Person/key/base/desired bindings.

## Durable Mobile seam and convergence

Mobile captures Account/Trip/generation before credentials/network; the existing
authenticated client fences credential resolution, refresh/retry and fetch. Scope
is checked again after response, including error paths. A→B→A cannot return or
apply an old-generation result. Mobile submit rejects locally while disabled,
before token acquisition or network dispatch. No runtime caller is installed.

The explicit pending repository uses existing sync_operations only. Stable
normalized body/key/digest/expected pair are durable. Owner/Trip/Person/entity/type/
key/base metadata is checked on load. A duplicate identical key is neutral;
changed intent rejects. An unresolved same-Person operation blocks a new key,
including an opposite choice. No optimistic canonical participation write occurs.

New intents are held as DEPENDENCY_BLOCKED with null dependency/due time and a
closed-capability reason. Existing dependency wake/listPending/claim logic cannot
promote or dispatch these held rows. No queue work announcement/timer is emitted.
The seam is not wired to feature authoring or normal dispatch. Existing interrupted
operations can be loaded for exact recovery without rewriting their body/key.

Exact recovery loads the durable intent with a fresh scoped context, releases the
Account gate before GET, validates the correlated result, and calls the existing
I2C2 reporting barrier. That barrier drains earlier reads and owns atomic result/
row/queue/all-seven certificate invalidation plus bounded fresh convergence.
No result mints a roster/cursor/fingerprint certificate, no financial/private
checkpoint is cleared, and no second refresh owner is created. Offline failure
leaves cached access and the operation unresolved. Duplicate receipt consumption
remains neutral; no new POST/key is inferred from a missing response.

## Files

- `backend/src/app.ts`: fixed authenticated routes; optional dedicated A gateway.
- `backend/src/tripPersonParticipationRuntime.ts`: fixed gateway/discovery/capability/recovery boundary.
- `backend/src/tripPersonParticipationIntent.ts`: independent Backend intent/result codecs.
- `backend/src/tripPersonParticipationRuntime.test.ts`: Backend security, capability, scope, privacy and parity tests.
- `src/domain/trip/personParticipationRuntime.ts`: strict disabled capability contract.
- `src/data/api/tripPersonParticipationTransport.ts`: fenced typed capability/POST/GET transport.
- `src/data/repositories/tripPersonParticipationPendingRepository.ts`: existing-queue durable closed intent seam.
- `src/data/sync/tripPersonParticipationRecovery.ts`: explicit GET recovery into the existing reporting owner.
- `src/data/repositories/tripPersonParticipationResult.test.ts`: extended real SQLite/queue/transport/recovery tests.
- `docs/API_CONTRACT.md`, `docs/OFFLINE_SYNC.md`, `docs/CURRENT_IMPLEMENTATION_STATE.md`, this report.

No dependency, server migration, SQLite migration or B/C implementation changes.

## Validation and remaining gates

Focused suites cover disabled/no/unknown/wrong gateway; mocked-open DB still
closed; unavailable POST; caller/Actor/header/JWT/GUC spoof; independently encoded
intent/result parity and malformed raw payloads; authorized exact GET/privacy/
withholding; changed intent/new opposite key; no disabled queue dispatch; real
SQLite response-loss→close/reopen→GET→apply and duplicate recovery; unavailable
404/503 preserves unresolved intent; credential-/response-time A→B→A; altered
scope/result/queue metadata; all-seven invalidation and financial/private cursor
preservation; pending old-generation retention denial; enabled Mobile capability
projection rejection. Existing Account/offline cached-launch and B/auth/Backend
regressions remain part of the focused validation.

Initial preflight checks: **21 files / 345 tests PASS**, including Backend9 runtime cases
and 20 real SQLite/result/reporting/pending/transport cases. Typecheck, backend
build, full lint/UI guard and scoped formatting/whitespace PASS. Evidence logs:
`/private/tmp/otr-ai2c3/`. Server00600, manifest/verifier, SQLite migrations/runner,
existing command contract, I2C2 apply/certificate/reporting owner and B mirror
implementations are byte-identical to 4dc7095. Server00600 SHA-256:
`c347362be54875b951b2f1bdc51c2c1869cce4af644b2740b2d2c8584665752f`.
No server SQL/security replay or live gateway was run for this unchanged migration;
current DB authorization evidence remains the accepted I2C2 foundation.

Siblings were clean at startup. End inspection observed unrelated untracked B-T3G
and C-I3F work; neither sibling was written, staged or committed by this task.
Independent review, dedicated gateway provisioning/credentials, mutation activation,
normal authoring/dispatch and physical-device acceptance remain pending. No live
DB/network gateway or Hosted Dev/Production verification is claimed.

During execution unrelated canonical Ledger UI and existing auth/UI test edits
appeared from other work. They were not edited, staged, reverted or committed by
this task. Sibling worktrees remain outside the write scope.

- SET_PARTICIPATION runtime enabled: **NO**
- lifecycle gate open: **NO**
- normal dispatch enabled: **NO**
- self-service leave/rejoin: **NO**
- Event participant command: **NO**
- runtime credentials: **NO**
- server 00600 changed: **NO**
- Production/Hosted Dev: **NO**
- sibling modifications by this task: **NO**
- commit by this task: **NO**

## Focused receipt error correction — 2026-10-05

Correction baseline HEAD: `727be289adbf8f893d0b9f7e747827b7bf9c11e7` with the
existing uncommitted I2C3 preflight. Changes are limited to Backend lookup error
mapping/gateway denial contract, Backend/Mobile regressions and API/offline/report/
current-state wording. POST/capability behavior is unchanged. Regression cases cover
authorized success, own absence, former Organizer, foreign Actor/key, missing gateway,
corrupt receipt and preservation of identical durable intent/key on 404/503 (also 403).
Correction validation: **22 files / 358 tests PASS**, including **2 focused files /
43 cases** (22 Backend runtime and 21 SQLite/result/recovery cases). Typecheck,
backend build, full lint/UI guard and changed-file format/whitespace PASS.
Evidence: `/private/tmp/otr-ai2c3-correction/`. Eleven protected artifacts (server
00600, manifest/verifier, SQLite migrations/runner, command contract, I2C2 apply/
certificate/reporting owner and B mirror) are byte-identical to correction HEAD.
Mobile transport/recovery bytes also match the pre-correction snapshot. No server
SQL/security replay or live gateway access was performed for this unchanged SQL.

- owner-loss maps to PARTICIPATION_FORBIDDEN: **YES**
- exact own missing receipt maps to OPERATION_NOT_FOUND: **YES**
- gateway unavailable maps to REPLAY_UNAVAILABLE: **YES**
- server 00600 changed: **NO**
- SET_PARTICIPATION enabled: **NO**
- lifecycle gate open: **NO**
- Production/Hosted Dev: **NO**
- commit: **NO**
