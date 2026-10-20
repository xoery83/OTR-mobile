# Checkpoint 11 — Day Read Model + Local Capture Inbox integration

Date: 2026-10-05 (Pacific/Auckland).
Status: **INTEGRATION PASS / READY FOR OWNER REVIEW**.

## Baseline and composition

Canonical worktree `/Users/xoery/Project/otr-mobile-canonical`, branch
`integration/ledger-polish-canonical`, starting/retained HEAD
`d295b5e232bbe1e2b2d8ca96a2ff61e57eb3ba34`. Canonical started clean.
Temporal `trip/temporal` and import `trip/import` retained the same HEAD and their
exact reported boundaries: A two tracked modifications/eight untracked files;
B ten untracked files/no tracked modifications. No unexpected or staged changes.
All six relevant local/remote-tracking branch refs matched the common base.
No fetch, Hosted Dev or Production access was performed.

Baseline gate: registered SQLite 1–46; selected database, connection, Account and
canonical certificate/mirror tests **6 files / 162 tests PASS** before copying.
Imported A first, validated it, imported B second, validated it, then registered
the real 47 and 48. Builder worktrees were not modified. Their retained reports
describe standalone Builder evidence, not the final registration state here.

## Exact imported and modified files

Builder A input (10 files):

- `src/data/db/migrations/tripDayReadModel.ts`
- `src/domain/trip/dayReadModel.ts`
- `src/domain/trip/dayReadModel.test.ts`
- `src/data/repositories/tripDayReadRepository.ts`
- `src/data/repositories/tripDayReadRepository.test.ts`
- `src/data/repositories/defaultTripDayReadRepository.ts`
- `src/data/repositories/tripCanonicalEventRepository.ts`
- `src/data/repositories/tripCanonicalEventRepository.test.ts`
- `docs/adr/2026-10-05-trip-day-read-model.md`
- `docs/architecture/TRIP_CHECKPOINT_11_DAY_READ_MODEL_REPORT.md`

Builder B input (10 files):

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

Integration-owned files (7 additional):

- `src/data/db/migrations.ts`
- `src/data/db/database.test.ts`
- `src/data/db/checkpoint11Integration.test.ts`
- `docs/CURRENT_IMPLEMENTATION_STATE.md`
- `docs/DATA_MODEL.md`
- `docs/API_CONTRACT.md`
- `docs/architecture/TRIP_CHECKPOINT_11_FINAL_INTEGRATION_REPORT.md`

Integration amendments within A's inputs: explicit scoped child deletion and its
FK-disabled regression; self-contained domain projection types; migration name
`trip_day_read_model`; migration-aware test fixtures/tail expectations; ADR records
the corrections. B's implementation is preserved; its ADR records registration.
No root startup, Account coordinator, API transport, UI, Ledger or server file changed.

## Review and concrete corrections

**A review PASS after corrections.** `withCertifiedCollection` observes captured
Account/Trip/generation, validated complete certificate/watermark, exact root/ID
membership, endpoint ownership and unchanged full fingerprint in one transaction.
Installation repeats that observation, compares exact association/membership and
CAS-checks the independent projection generation. Partial/withheld/mismatching
sources cannot create a complete projection; historical accepted rows remain offline
readable. Individual mirror updates cannot mutate projection rows. Existing B-T3I
apply, certificate and anti-resurrection behavior is unchanged.

Explicit date/now/IANA-zone queries retain original strings, BigInt microseconds,
DST/skipped-date behavior, half-open occupancy, endpoint context and unresolved
candidates. Unknown clocks are not midnight; next comparable Event is not a claim
that unresolved candidates cannot occur earlier. No participant membership is inferred.

The default app opener does not enable FK cascades; installed Expo build defaults
also do not enable them. Original A replacement deleted only the header. A targeted
FK-disabled test reproduced a UNIQUE constraint failure on the second rebuild.
Replacement now explicitly deletes only that Account/Trip's boundary/Event children
before the header, within the existing transaction. The regression verifies repeat
replacement and complete empty-set removal. Global SQLite settings remain unchanged.

A's type-only import from the data API violated the existing architecture guard.
Projection facts now have structurally equivalent domain-owned types; repository
validation maps the unchanged canonical DTO. No schema, temporal or query behavior
was redesigned. The guard now reports only its unchanged baseline Ledger offender.

**B review PASS.** Payload authority is SQLite BLOB. Composite Account identity,
schema guards and repository verification prevent ordinary missing/foreign payload
association. Dedup checks Account, size, SHA-256 and exact bytes. Quotas/writes share
one transaction; shared bytes count once and each Capture consumes a reference row.
Limits remain binary 10 MiB, TEXT 1 MiB, Account 100 MiB/1,000 rows, device 500 MiB.
Revision CAS fences assignment/deletion; cached actor admission checks existing and
target Trips. Deletion retains referenced payloads; affected corruption fails closed.
INBOX/ASSIGNED are the only lifecycle states. `getForSourceHandoff` is read-only,
returns independently verified bytes and creates no Source or processing state.

## A ↔ B contract and migration gate

**Cross-contract PASS.** Both reuse the existing Account generation, apply gate and
shared serialized SQLite connection. B's empty, non-persisted Trip scope marker is
used only for Account-only context; real assignment checks cached actor admission.
A always captures a real UUID Trip. Neither redirects work through selected-Trip
state or introduces another global generation, transaction scheduler or cache.

Day uses exact canonical temporal strings/microseconds and independent projection
generation; Capture uses local UTC creation timestamps and independent association
revision. These clocks/revisions do not order each other's facts. Content-free
Capture errors and propagated Account/SQLite failures remain separate from Day
integrity/superseded outcomes. No Capture-to-Day coupling exists.

Factories share `openDatabase` and offline `requireActiveUserId`; neither requires
token refresh or network. No additional startup/default-factory wiring is required
for this foundation and none was installed. SQLite defaults are disk-backed journal
and FULL synchronous writes in the inspected bundled implementation; the combined
file-backed test confirms FULL synchronous behavior. No native power-loss/device
acceptance is claimed.

Registered topology: **1–46 → 47 `trip_day_read_model` → 48 `local_capture_inbox`**.
Historical migration objects 1–46 equal the base exactly; no placeholder, gap or
rewrite. Updated global and canonical mirror count/tail expectations preserve their
historical assertions. A fixtures no longer execute registered 47 twice; its isolated
migration test still proves preservation of the pre-47 tables.

Combined file-backed tests cover fresh DB and exact v46 upgrade through the normal
migration runner, retained legacy Expense/migration records, one-time registration,
concurrent Day/Capture operations with FK disabled, A→B→A, and cold reopen. Expired
local session remains AUTHENTICATED_OFFLINE. Original microseconds, certified Day
facts and immutable Capture bytes/state/revision survive. Capture deletion leaves
Day generation intact. SQLite integrity/FK checks pass. No transport refresh occurs
on reopen.

## Validation and failure classification

| Gate                                                       | Result                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Baseline startup selection                                 | 6 files / 162 tests PASS                                                        |
| A Day domain/repository                                    | 2 files / 102 tests PASS, including integration correction                      |
| B Capture domain/reader/repository                         | 3 files / 123 tests PASS                                                        |
| Combined fresh/v46/offline/reopen tests                    | 1 file / 2 tests PASS                                                           |
| Combined A/B + database/composition selection              | 7 files / 243 tests PASS                                                        |
| Selected auth/DB/API/sync/Trip/receipt/Backend regressions | 49 files / 664 tests PASS; 2 existing native collection blockers                |
| Normal full Mobile + Backend suite, candidate alone        | 179 passed / 11 failed files; 1,748 passed / 1 failed tests                     |
| Normal full suite, pristine d295b5e alone                  | 173 passed / 11 failed files; 1,521 passed / 1 failed tests; identical failures |
| Typecheck                                                  | PASS                                                                            |
| Full lint and UI guard                                     | PASS; unchanged 473 legacy occurrences / 76 representative UI files             |
| Backend build                                              | PASS                                                                            |
| Changed-file Prettier and whitespace                       | PASS                                                                            |
| Full format                                                | 17 unchanged baseline failures; not green                                       |
| Static server baseline verifier                            | PASS                                                                            |
| Historical SQLite/server/manifest byte preservation        | PASS                                                                            |

Selected regressions include Account request/switch/local-session, database/migration,
canonical collection/mirror/transport, Trip Person where runnable, receipt, Day and
Capture suites. Counts overlap focused tests; they are not additive coverage totals.

- **INTEGRATION DEFECT, corrected:** A FK-cascade assumption; stale registered-tail
  assertions and standalone fixture double-application; new test adapter's SQLite
  result typing. Reproduced failures were fixed and affected/full validation rerun.
- **NEW REGRESSION, corrected:** A domain's data-API type import. No new failure remains.
- **EXISTING BASELINE BLOCKER:** ten suites cannot collect because Node parses existing
  React Native Flow. They are dataHealthCoordinator, ledgerExpenseBatchRead,
  ledgerExpenseRepository, ledgerExpenseRetry, ledgerRateQuoteCache,
  ledgerReadRepository.convergence, ledgerReadRepository, myLedgerNarrowCache,
  tripPersonCertificate and tripPersonRepository.
- **EXISTING BASELINE BLOCKER:** architectureBoundary's LedgerExpenseDetailScreen
  data-API import assertion. No Ledger source or guard was modified to mask it.
- **EXISTING BASELINE BLOCKER:** all 17 full-format offenders are byte-identical to
  d295b5e. Unrelated files were not reformatted.
- **ENVIRONMENTAL, resolved:** simultaneous candidate/baseline/regression runs caused
  existing B-T3H 1,203-Event and MoneyText tests to exceed 5 seconds in both full
  trees. Running the candidate alone and then the selected regressions removed those
  timeouts, without modifying tests, timeouts or runner configuration.

The base was independently archived under `/private/tmp` with shared installed
dependencies and tested without source changes. It reproduced the same native,
Ledger and concurrent-load timeout failures. No native isolation mock or guard
relaxation was introduced. Normal full tests and full formatting are not reported
green; the Checkpoint 11 gate passes with documented, independently reproduced
baseline blockers and no unresolved new regression/integration defect.

Validation logs: `/private/tmp/otr-checkpoint11-validation/`. No local SQL server
replay, Hosted Dev, Production or device validation was needed or performed.

## Server, runtime and Git preservation

All 74 server migrations are byte-identical to d295b5e. Unchanged SHA-256:

- Manifest: `20a52f881a5b5e421e32af277658ed5f1d6851468185fcadd374001f6a3afa96`.
- Verifier: `84100bc21d761e2d0a7a6ea2724848fdf12bcd2d397db61713400d94413d4496`.
- RLS matrix: `b006442a70b9e91777cb5d2ffae239e21a5fe5232897fd6314a9852d42ef7aa6`.

A1-I2C5 reviewed root/principal semantics and C-I3H journal remain unchanged.
Participation/Event/Source commands remain disabled, gates CLOSED. No UI, Share
Extension, worker, timer, provider/parser, Source recovery, runtime credential or
automatic refresh is added. Existing provisioning/device/provider terminality and
safe IO_UNKNOWN retry blockers remain outside this checkpoint.

Final canonical status: **7 tracked files modified, 20 new files untracked, no staged
changes**, exactly the 27 paths above. HEAD/branch unchanged. No commit, push or deploy.

| Required answer                      | Result  |
| ------------------------------------ | ------- |
| Builder A integrated                 | YES     |
| Builder B integrated                 | YES     |
| SQLite47 globally registered         | YES     |
| SQLite48 globally registered         | YES     |
| 47→48 ordering verified              | YES     |
| A↔B contract verified                | YES     |
| Account isolation preserved          | YES     |
| A→B→A fencing preserved              | YES     |
| Offline/cold-start preserved         | YES     |
| B-T3I semantics changed              | NO      |
| Capture automatically creates Source | NO      |
| UI added                             | NO      |
| Server schema changed                | NO      |
| Production accessed                  | NO      |
| Hosted Dev accessed                  | NO      |
| Checkpoint 11 integration PASS       | YES     |
| Commit / push                        | NO / NO |

**STOP — READY FOR OWNER REVIEW.**
