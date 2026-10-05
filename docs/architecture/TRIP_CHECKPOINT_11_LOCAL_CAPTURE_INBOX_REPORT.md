# Checkpoint 11 — Builder B Local Capture / Import Inbox

Date: 2026-10-05. Status: **BUILDER COMPLETE / WAIT FOR INTEGRATION**.
Worktree: `/Users/xoery/Project/otr-mobile-import`; branch: `trip/import`.
Starting/current HEAD: `d295b5e232bbe1e2b2d8ca96a2ff61e57eb3ba34`.
Startup status/log/branch checks passed; the worktree was clean. No commit.

## Files

Exactly ten new, untracked Builder B files; no existing tracked file modified:

- `src/data/db/migrations/localCaptureInbox.ts`
- `src/domain/capture/localCapture.ts`
- `src/domain/capture/localCapture.test.ts`
- `src/data/files/capturePayloadReader.ts`
- `src/data/files/capturePayloadReader.test.ts`
- `src/data/repositories/localCaptureInboxRepository.ts`
- `src/data/repositories/localCaptureInboxRepository.test.ts`
- `src/data/repositories/defaultLocalCaptureInboxRepository.ts`
- `docs/adr/2026-10-05-local-capture-inbox.md`
- `docs/architecture/TRIP_CHECKPOINT_11_LOCAL_CAPTURE_INBOX_REPORT.md`

## Storage and migration

SQLite48 exports `localCaptureInboxMigration` (`id=48`, `local_capture_inbox`)
without registering it. Integration must apply real SQLite47 then 48. No fake 47,
server migration, global count assertion or historical migration change.
The focused fixture applies all actual registered prerequisites below 48, followed
by the exported SQL body. Today those prerequisites are 1–46; actual 47 composition
remains Integration's validation, and the fixture will include it when registered.
No schema_migrations version is fabricated by this seam.

`local_capture_payloads`: composite Account/payload PK, positive safe INTEGER
byte count (BLOB affinity prevents coercion), lowercase SHA-256, exact-length BLOB.
`local_capture_inbox`: composite Account/Capture PK, composite Account/payload FK,
FILE/IMAGE/TEXT, nullable original filename/content type, creation timestamp,
nullable Trip, truthful INBOX/ASSIGNED state and positive safe INTEGER revision.
There is deliberately no Trip FK/cascade. Metadata limits are 1024 filename
characters and 255 declared content-type characters; identity strings max 128.
Indexes cover Account/date/ID listing, Account/hash/count candidates and references.
Guard triggers prohibit payload UPDATE/referenced DELETE, missing/foreign/oversized
TEXT associations and Capture immutable-fact changes. Association UPDATE requires
exactly one revision increment and a changed association. Reference guards also work
with PRAGMA foreign_keys off. Hash correctness is independently checked in repository.

## Intake and limits

External input is bytes, string or a max-chunk reader with optional size hint and
mandatory close. No authoritative URL/file is retained. Reader requests at most
64 KiB, uses one hard-bounded intake buffer, copies borrowed chunks immediately,
checks actual size and closes on all read outcomes. Oversize, reader failure, UTF-8
failure and hash failure have distinct content-free codes. Empty input is rejected.
Binary bytes are exact, without image decode/normalization. TEXT strings use standard
UTF-8 encoding, with U+FFFD for unpaired UTF-16 surrogates. Supplied TEXT bytes must be
valid UTF-8 and remain byte-for-byte unchanged (BOM, CRLF and Unicode composition
included). No silent truncation or rewriting.

Limits: binary 10 MiB, TEXT 1 MiB; Account 100 MiB unique stored payload bytes and
1000 Capture rows; device 500 MiB unique stored payload bytes. The reader computes
actual byte count and SHA-256 before persistence. Caller memory is copied.

Ordering: capture existing Account request context → validate metadata → bounded
read/UTF-8 validation/hash → existing Account apply gate → serialized SQLite
transaction → context revalidation → cached optional Trip admission → row/byte totals
→ Account/hash/size candidate lookup and verified exact bytes → effective unique-byte
quota check → insert/reuse payload → insert Capture → final context check → commit
→ context check before returning success. Unique-byte quota evaluation uses zero
additional bytes only after exact candidate verification; all quota decisions and
writes share the same transaction. Failure rolls back payload and Capture together.
No success is returned before commit; a stale post-commit context returns no scoped
success. Proper Account transitions cannot change the active identity inside the gate;
pending transitions invalidate pre-commit work and cause rollback.

Dedup requires same Account, count, SHA-256 and every byte. Matching hash/count but
unequal bytes fails INTEGRITY, even under the controlled collision test seam.
Shared payload bytes are charged once; every new Capture is charged a row. There is
no global payload cache, alternate Account generation or new transaction scheduler.

## Repository and lifecycle

Public methods: `intake`, `listInbox`, `getForSourceHandoff`, `assign`, `deleteCapture`.
List returns Account-only metadata, with bounded 1–100 row pages and stable
creation-time/ID ordering. Every returned Capture verifies its payload, including
hash, exact size, Account scope, lifecycle/revision, timestamp and UTF-8 for TEXT.
Durable BLOB reads withhold oversized/non-BLOB content before the driver copies it.
Every operation uses existing Account context/generation/apply gate. A→B→A is stale.
Logout/switch retains old data but does not expose it in the new Account's methods.

INBOX means null Trip; ASSIGNED means non-null Trip. Intake starts at revision 1.
Assignment/reassignment/unassignment preserve identity, bytes and original metadata;
only association/state/revision change. Assignment and deletion require the caller's
observed revision; stale revisions reject. No-op assignment is revision neutral.
Revision exhaustion rejects changes. Existing cached `ledger_actor_context` existence
for Account/Trip is the same admission model as the existing Trip Person/read path;
no Person participation or Ledger financial edit capability is inferred. Assigned
mutations require admission to the existing Trip and assignment also checks target
Trip admission. Missing Trip admission preserves content/readability and blocks
mutation. Unassigned operations do not fabricate a Trip identity. The existing
context API uses an empty, non-persisted scope marker for Account-only requests.

Deletion removes the scoped Capture then conditionally deletes its payload only
when no reference remains, atomically. It never deletes external caller files.
Concurrent intake/delete cannot leave a dangling reference or prematurely remove
shared content. No retention policy silently removes rows on Trip disappearance.

`getForSourceHandoff` is read-only, returning exact Capture identity/metadata,
association/count/hash and a verified independent byte copy. There is no Source
creation/admission/slot/journal/parser/provider import or call. PROCESSING,
NEEDS_ATTENTION and IMPORTED do not exist in the public lifecycle or SQL allowed
states. Source will own any later explicit transition; this checkpoint enables none.
Default factory uses existing offline local auth, database and expo-crypto; it is
not wired into startup/UI and never self-registers/migrates SQLite48.

Corrupt affected state fails closed without read-time repair. Error codes and
boundary semantics are documented in the ADR. Existing Account rejection and SQLite
failures propagate; no bytes/filenames/URLs/text are logged. Cold file-backed SQLite
reopen tests preserve bytes, assignment, revision, lifecycle, dedup and deletion
references without a network/auth refresh. No real Share adapter or device UI was
installed/tested in this slice.

## Validation

Focused command:

```sh
npx vitest run src/domain/capture/localCapture.test.ts src/data/files/capturePayloadReader.test.ts src/data/repositories/localCaptureInboxRepository.test.ts
```

**3 files / 123 tests PASS**: domain 16, bounded reader 31, repository/migration 76.
Coverage includes FILE/IMAGE/TEXT, zero/exact/over limits, UTF-8 boundaries/BOM/CRLF,
reader/hash failures, close ownership and borrowed-buffer reuse; collision seam,
Account-local/cross-kind sharing and cross-Account separation; real 999→1000 row
race; real SQLite 100 MiB Account-byte race and exact 500 MiB device boundary;
shared bytes at full quota; deletion/reference race in both orders; insertion and
commit rollback; delayed success; revision/Account staleness and exhaustion;
A→B→A during read/hash and before apply; pending switch during assignment/deletion
and before intake commit; stale scoped reads; file-backed cold reopen; deliberate
missing/count/hash/Account/lifecycle/revision/association/timestamp/UTF-8/oversized
BLOB corruption; SQL guard tests and unchanged unrelated-table snapshots.
Large byte-quota fixtures use temporary file-backed SQLite and exact BLOB lengths/
hashes; temporary files are removed. Small branch tests additionally inject quota
totals through the database test adapter, not through public production options.

Regression selection:

```sh
npx vitest run src/data/auth/accountRequestContext.test.ts src/data/auth/accountSwitchCoordinator.test.ts src/data/auth/accountSwitchFoundation.test.ts src/data/auth/accountLocalState.test.ts src/data/auth/authRepository.test.ts src/data/auth/sessionAccessToken.test.ts src/data/db/databaseConnection.test.ts src/data/db/database.test.ts src/data/repositories/tripPersonRepository.test.ts src/data/repositories/tripCanonicalEventRepository.test.ts src/data/files/receiptFileStore.test.ts
```

**10 files / 104 tests PASS; 1 suite blocked before test collection**:
`tripPersonRepository.test.ts` imports existing React Native Flow syntax into Node
(`Flow is not supported`, react-native/index.js). This is the known baseline native
import blocker. No fixture/production file was altered to hide it. The standard
full Mobile suite is not claimed green and was not run. All new Capture suites run
without native mocking/isolation.

`npm run typecheck`, `npm run lint` (including `npm run ui:guard`), changed-file
Prettier and whitespace checks PASS. UI guard: 76 representative files, 473 existing
legacy occurrences, no baseline forgiveness. Local installed Expo TextDecoder
source supports fatal UTF-8 validation and ignoreBOM. No native runtime/device
acceptance is claimed. Final lint/format and tracked-file-boundary checks cover the
final files. No server/manifest suite was necessary or run.

## Required status

| Check                                                  | Result                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| Builder B implementation complete                      | YES                                                                        |
| SQLite48 authored                                      | YES                                                                        |
| SQLite48 globally registered                           | NO                                                                         |
| SQLite47 placeholder added                             | NO                                                                         |
| global migration registry changed                      | NO                                                                         |
| payload authoritative storage is SQLite BLOB           | YES                                                                        |
| Capture can exist with missing payload                 | NO (enforced ordinary schema/repository path; injected corruption rejects) |
| hash equality alone permits dedup reuse                | NO                                                                         |
| duplicate shared bytes charged more than once          | NO                                                                         |
| Account row quota enforced transactionally             | YES                                                                        |
| Account byte quota enforced transactionally            | YES                                                                        |
| device byte quota enforced transactionally             | YES                                                                        |
| A→B→A stale intake fenced                              | YES                                                                        |
| cross-Account payload visibility possible              | NO                                                                         |
| unassigned Capture supported                           | YES                                                                        |
| Trip assignment cross-Account possible                 | NO                                                                         |
| deleting one shared Capture deletes referenced payload | NO                                                                         |
| cold restart/offline Inbox supported                   | YES                                                                        |
| canonical Source created                               | NO                                                                         |
| Source command invoked                                 | NO                                                                         |
| C-I3H journal used                                     | NO                                                                         |
| parser/provider invoked                                | NO                                                                         |
| PROCESSING/IMPORTED manufactured                       | NO                                                                         |
| Share Extension UI added                               | NO                                                                         |
| Inbox UI added                                         | NO                                                                         |
| server schema changed                                  | NO                                                                         |
| global integration-owned files changed                 | NO                                                                         |
| Production/Hosted Dev accessed                         | NO                                                                         |
| commit                                                 | NO                                                                         |
| push                                                   | NO                                                                         |

No deploy or integration of Builder A. Git status: only the ten new untracked files
listed above, no staged changes, HEAD unchanged. Integration must compose real 47
and 48 and perform its checkpoint review before runtime wiring.

**STOP — BUILDER COMPLETE / WAIT FOR INTEGRATION.**
