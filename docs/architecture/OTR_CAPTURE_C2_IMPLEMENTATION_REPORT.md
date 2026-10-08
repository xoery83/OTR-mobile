# Capture C2 implementation report

Date: 2026-10-08 (Pacific/Auckland). **C2 FINAL OWNER REVIEW PASS — LOCAL COMMIT AUTHORIZED.**

## Final Owner acceptance

On 2026-10-08 (Pacific/Auckland), the Owner explicitly issued **C2 FINAL OWNER
REVIEW PASS** and authorized one local checkpoint commit on
`codex/capture-c2-builder`. Acceptance covers C2 durable local intake, SQLite51,
native Files/Photos submission, atomic CP11 binding, idempotent recovery, offline
local acceptance and scoped Job read/reopen. Owner device testing and the final
read-only persistence audit are accepted: mixed4/4 and Owner-confirmed offline2/2
saved; 7 retained Jobs /11 ACCEPTED Inputs with verified CP11 bytes and scope.

Earlier waiting statements, no-device-PASS statements and uncommitted Git snapshots
below are historical stage evidence; this explicit Owner decision supersedes their
pending acceptance status. It does not upgrade unperformed checks or network
telemetry into measured results. The full suite retains its reproduced existing
architecture-boundary failure; **no global full-suite PASS is claimed**. C3 Activity,
AI processing, canonical admission and runtime/provider gates remain unauthorized.
Only the complete accepted C2 checkpoint may be locally committed; no push, merge,
rebase or cherry-pick. The resulting commit SHA is recorded by Git and the final
handoff rather than a self-referential hash inside the commit.

## Exact source and authorization

Worktree: `/private/tmp/otr-capture-c2-builder`; branch
`codex/capture-c2-builder`. Starting HEAD and pre-commit engineering evidence base:
`b6daffecedab1616b173fde3f5e2de5d54770eff` (canonical C1 integration).
Entry worktree was newly created and clean. Existing worktrees were preserved;
old Capture `79237cbd` was not the execution base. This report implements only the
explicit task `/Users/xoery/Downloads/OTR_CAPTURE_C2_BUILDER.md`.

Accepted P1/C2 Revision 1 and final `continuesFromInputId` naming are recorded in
`../adr/2026-10-08-c1-integration-owner-decision.md`. Original handshake/amendment
were read at their retained external paths; historical PROPOSED wording is not
manufactured into historical acceptance. Their source SHA-256 values remain
`53f4be37231957fceb4e366b24780c373a77b06645587403bef5e3899aa644af` and
`8f794199088863b7fe280de818e7ac068076984a3476e21a2b26770d67f293b3`.

## Delivered behavior

1. **SQLite51 / exactly two tables.** Immutable Batch/Job header contains distinct
   1:1 UUIDs, stable submission key, context snapshot and declaration digests.
   Ordered Inputs contain their own UUID/replay key, creation-time metadata,
   revisioned PENDING/ACCEPTED/FAILED facts, safe reason, immutable first content
   pin and exact acceptance-time Capture/payload binding. JSON is bounded at
   64 KiB per contract, with no truncation. No backfill guesses Jobs from old data.
2. **Frozen Add request.** The data operation copies the ordered roster before its
   first await, allocates identities once and retains the same request/promise
   through double taps and uncertain failure. New explicit Add more creates a
   new session/Batch/Job. Pickers alone still cause zero repository writes.
3. **Whole roster before bytes.** Registration writes all declarations atomically;
   a partial registration rolls back. Registered intent is not saved evidence.
   Exact Account-scoped submission-key recovery locates the same verified Job
   after acknowledgement loss or cold restart.
4. **Atomic original custody.** CP11 quota, exact-byte dedup and original insertion
   logic is factored into a narrow data-repository transaction seam. After bounded
   reading outside the Account gate, the first verified pin persists. One gated
   transaction commits original plus Input binding. No nested transaction, feature
   SQL, separate bytes store or orphan window. Accepted replay verifies retained
   originals without reacquisition. Unknown outcomes require exact readback and
   never allocate another reference blindly.
5. **Real C1 submission.** Files/Photos forward native URI capabilities at submit
   through `FileMode.ReadOnly`, with at most 64 KiB requested per read and CP11 size,
   hash, UTF-8, quota and close rules. No normalization, compression, upload or
   unconditional whole-file read. UI displays selected/saved/failed/pending truth,
   safe failure explanations and local custody. Hide is always enabled, is not
   Cancel after submission, and never cancels durable work or triggers auto-close.
6. **Explicit recovery lineage.** An unpinned missing selection continues only via
   an explicit new Batch/Job/Input. Immutable same-Account lineage must point to
   an older registered Input; forged/cross-Account/self/cycle links reject.
   Reverse lookup is derived and verifies retained manifests. Pinned original
   recovery stays in the same Job and rejects mismatched bytes. Continuation
   actions retain their new request across uncertain registration/readback.
7. **Scoped C3-facing seams.** Register/submit/read/list/reopen/exact-key recovery/
   resume derive truthful counts, `allInputsAccepted`, intake settling and action
   availability. List uses stable createdAt/Batch cursor order. Processing remains
   NOT_INSTALLED; semantic result counts remain zero/null. UI projection grants no
   execution permission: Account generation, Input revision and lineage revision
   are rechecked at actual execution. Reopen reads the same Job.
8. **Identity and ownership.** Authenticated local sessions work offline; one
   generation fences picker/read/commit/recovery, including A→B→A. Fresh A can
   reopen A's retained Job; old actions cannot regain authority. Feature staging
   remains identity-neutral. Context Trip prior is nullable/passive, never CP11
   assignment: all C2 originals start INBOX. No private Trip label is persisted;
   current global host supplies no selected Trip.

Bound originals, headers and Inputs are retained under additive deletion guards,
including FK OFF. There is no destructive cleanup or automatic retry policy.

## Tests actually run

| Check                                                               | Measured final result                                      |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| Affected Capture/SQLite/auth/Import/UI/terminology/sync regressions | 17 files /336 PASS                                         |
| Continuation/CP15 preservation regression                           | 1 file /174 PASS                                           |
| Independent final engineering review                                | 10 files /200 PASS; 0 remaining CRITICAL/IMPORTANT/MINOR   |
| Final serial whole suite                                            | 212 files /2,737 tests: 2,721 PASS, 1 FAIL, 15 SKIP        |
| Verified exact-base serial whole suite                              | 210 files /2,691 tests: 2,675 PASS, 1 FAIL, 15 SKIP        |
| Typecheck; lint including UI guard; terminology tests               | PASS                                                       |
| Backend bundle build; offline iOS Hermes bundle export              | PASS                                                       |
| Changed-file Prettier; git whitespace check                         | PASS                                                       |
| Historical migration preservation                                   | 88 files byte-identical; registry only adds import/entry51 |

Commands used `vitest run --configLoader runner`; full runs additionally used
`--maxWorkers=1 --no-file-parallelism`. The 18 affected files total **510 PASS**;
independent and full counts overlap and are not added to that total.

Both final whole suites fail the **same** test:
`src/domain/architectureBoundary.test.ts` →
`keeps UI and domain modules away from direct data infrastructure`.
The textual scanner sees the forbidden-module literal in the existing
`captureStaging.test.ts` exclusion regex. The exact-base archive was verified
against all **1,186 tracked Git files** before interpreting the final baseline.
There is **no new final failing file/test**, but this is not a global full-suite
PASS. Repository-wide format checking also reports 25 pre-existing files;
all changed files pass. Those historical files remain unchanged; the exact-base
format check reproduces the same list. Do not misattribute this measured failure to an older Ledger report.

Intermediate runs exposed BLOB-affinity integer casts/trigger alias issues,
version50 assertions and a deliberate corruption test's still-installed binding
trigger. They were corrected and rerun. Initial broad current run had 13 failures
(12 stale schema assertions and the same baseline guard failure); final current
run retains only the reproduced baseline failure. An initial baseline preparation
mistake changed its version assertion during one run; that intermediate run is
not evidence. Source was restored and all tracked archive files verified before
using the final exact-base run. No tests were weakened to conceal those failures.

Fault coverage includes whole-roster rollback, read-before-save truth, registration/
pin/acceptance ACK loss, committed registration plus unavailable readback, concurrent
same-item replay, double submit, distinct references for duplicate bytes, pin/quota
failures, safe reader/empty/oversize errors and close, missing/expired references,
crashes at payload/reference/binding writes, cold pinned resume/accepted replay,
lineage reverse lookup/forgery/self/cross-Account/cycle rejection, stale actions,
Account switch during picker/read/commit and post-commit ACK, passive revoked Trip
prior, signed-out rejection, offline cold restart, corrupt metadata/storage/payload/
reverse-lineage fail-closed reads, and zero Source-binding/continuation/queue writes.
UI checks exercise both locales/palettes, all acceptance counts, enabled Hide,
double taps, reopened Add more, pinned mismatch retry and existing C1 lifecycle.

## Preservation, build truth and closed gates

SQLite1–50 migration sources and all Server1–84 files match exact-base bytes.
Registry source differs only by the new import/entry. SQLite51 has two CREATE TABLE
statements. Source/Run/queue/runtime/financial owners and their production code
remain unchanged; schema-version assertions in affected tests acknowledge51.
No Server85, Hosted DEV/Server69/R3 access, DeepSeek/provider call, credentials,
remote AI, Guest, Source/Representation/Run, canonical write, Import execution,
Review, Banner/OS notification, Wallet, Photo cloud, Ledger side effect, scheduler,
startup/polling worker or provider gate was added/activated. Five generic C dispatch
denials remain CLOSED and their regressions passed.

`EXPO_OFFLINE=1 ... expo export --platform ios` produced an iOS Hermes bundle in
`/private/tmp/otr-c2-ios-bundle`. This is **bundle validation only**: no signed native
build, simulator/device install or owner device PASS is claimed. Native provider
URI readability/lifetime/fidelity, permission combinations, visual/VoiceOver/large
text and kill/restart on a device remain owner acceptance work. An inaccessible
provider handle fails intake safely; the app does not claim recovery of vanished
bytes or substitute a silent cache copy.

C3 Activity/Recent Imports is not installed. The repository list/reopen seam and
existing Capture route `/capture?jobId=<UUID>` support exact reopening, but no
user-visible Activity discovery entry is supplied. Without C3 a hidden Job is not
claimed to be discoverable from an installed Recent Imports surface. No final
Bottom Shell redesign or processing integration was introduced.

No external implementation blocker remains for this authorized local slice.
Readiness is **Owner accepted for the C2 local checkpoint**, with the measured
baseline failure and unperformed native/C3 checks above explicitly retained. Independent corrections F1–F5 and their
final recheck are in [the independent review](OTR_CAPTURE_C2_INDEPENDENT_REVIEW.md).

## Final changed files and Git evidence

The accepted checkpoint inventory below includes the subsequent device report.
The Git status/stat evidence further below is the historical engineering snapshot
before device testing and commit authorization, not the post-commit clean status.

```text
app/(tabs)/capture.tsx
docs/CURRENT_IMPLEMENTATION_STATE.md
docs/DATA_MODEL.md
docs/OFFLINE_SYNC.md
src/data/db/checkpoint11Integration.test.ts
src/data/db/database.test.ts
src/data/db/migrations.ts
src/data/repositories/defaultLocalCaptureInboxRepository.ts
src/data/repositories/intelligenceContinuationRepository.test.ts
src/data/repositories/localCaptureInboxRepository.ts
src/data/repositories/tripCanonicalEventRepository.test.ts
src/features/capture/CaptureContent.test.ts
src/features/capture/CaptureContent.tsx
src/features/capture/captureLifecycle.test.ts
src/features/capture/captureStaging.test.ts
src/ui/catalogs.ts
docs/adr/2026-10-08-capture-c2-local-intake.md
docs/architecture/OTR_CAPTURE_C2_IMPLEMENTATION_REPORT.md
docs/architecture/OTR_CAPTURE_C2_INDEPENDENT_REVIEW.md
docs/architecture/OTR_CAPTURE_C2_OWNER_DEVICE_GATE_REPORT.md
src/data/db/migrations/captureSubmissions.ts
src/data/operations/captureSubmission.ts
src/data/operations/defaultCaptureSubmission.ts
src/data/repositories/captureSubmissionRepository.test.ts
src/data/repositories/captureSubmissionRepository.ts
src/domain/capture/captureSubmission.ts
src/native/captureUriReader.test.ts
src/native/captureUriReader.ts
```

Reports/current handoff explain all measured limits. No HTTP endpoint is added.

The temporary shared dependency symlink was removed; no dependency install or
lockfile change remains. The final Git evidence below records tracked diff and all
untracked additions (the tracked diff stat excludes new files).

```text
HEAD: b6daffecedab1616b173fde3f5e2de5d54770eff
Branch: codex/capture-c2-builder
Staged changes: NONE

$ git diff --stat
 app/(tabs)/capture.tsx                             |   6 +-
 docs/CURRENT_IMPLEMENTATION_STATE.md               | 322 +++++++--------------
 docs/DATA_MODEL.md                                 |  22 ++
 docs/OFFLINE_SYNC.md                               |  20 ++
 src/data/db/checkpoint11Integration.test.ts        |   3 +-
 src/data/db/database.test.ts                       |  19 +-
 src/data/db/migrations.ts                          |   2 +
 .../defaultLocalCaptureInboxRepository.ts          |  26 +-
 .../intelligenceContinuationRepository.test.ts     |   6 +-
 .../repositories/localCaptureInboxRepository.ts    | 308 ++++++++++----------
 .../tripCanonicalEventRepository.test.ts           |   2 +-
 src/features/capture/CaptureContent.test.ts        |  46 +++
 src/features/capture/CaptureContent.tsx            | 302 ++++++++++++++++---
 src/features/capture/captureLifecycle.test.ts      | 101 ++++++-
 src/features/capture/captureStaging.test.ts        |   3 +-
 src/ui/catalogs.ts                                 |  58 ++++
 16 files changed, 809 insertions(+), 437 deletions(-)

$ git status --short
 M app/(tabs)/capture.tsx
 M docs/CURRENT_IMPLEMENTATION_STATE.md
 M docs/DATA_MODEL.md
 M docs/OFFLINE_SYNC.md
 M src/data/db/checkpoint11Integration.test.ts
 M src/data/db/database.test.ts
 M src/data/db/migrations.ts
 M src/data/repositories/defaultLocalCaptureInboxRepository.ts
 M src/data/repositories/intelligenceContinuationRepository.test.ts
 M src/data/repositories/localCaptureInboxRepository.ts
 M src/data/repositories/tripCanonicalEventRepository.test.ts
 M src/features/capture/CaptureContent.test.ts
 M src/features/capture/CaptureContent.tsx
 M src/features/capture/captureLifecycle.test.ts
 M src/features/capture/captureStaging.test.ts
 M src/ui/catalogs.ts
?? docs/adr/2026-10-08-capture-c2-local-intake.md
?? docs/architecture/OTR_CAPTURE_C2_IMPLEMENTATION_REPORT.md
?? docs/architecture/OTR_CAPTURE_C2_INDEPENDENT_REVIEW.md
?? src/data/db/migrations/captureSubmissions.ts
?? src/data/operations/captureSubmission.ts
?? src/data/operations/defaultCaptureSubmission.ts
?? src/data/repositories/captureSubmissionRepository.test.ts
?? src/data/repositories/captureSubmissionRepository.ts
?? src/domain/capture/captureSubmission.ts
?? src/native/captureUriReader.test.ts
?? src/native/captureUriReader.ts
```

Retained local evidence: `/private/tmp/otr-c2-final-full-tests.log`,
`/private/tmp/otr-c2-final-base-tests.log`, `/private/tmp/otr-c2-focused-tests.log`,
`/private/tmp/otr-c2-continuation-tests.log`, `/private/tmp/otr-c2-preservation.json`,
`/private/tmp/otr-c2-final-lint.log`, `/private/tmp/otr-c2-ios-bundle.log`,
`/private/tmp/otr-c2-full-format.log`, and `/private/tmp/otr-c2-base-format.log`.

STOP AFTER THE AUTHORIZED C2 COMMIT. C3 AND RUNTIME GATES REMAIN UNAUTHORIZED.
