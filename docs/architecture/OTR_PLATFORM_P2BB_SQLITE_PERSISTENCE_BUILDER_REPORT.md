# P2b-B dormant SQLite persistence Builder report

Date: 2026-10-08 (Pacific/Auckland).
Status: **IMPLEMENTED / INDEPENDENT REVIEW REQUIRED**. Uncommitted and unstaged.

## Source and migration gate

Owner accepted the corrected Contract, ADR and minimum Builder plan and authorized
this dormant local implementation, conditionally permitting SQLite52 only after
current-source/numbering checks. Actual Builder HEAD and local canonical main:
`f7115dc288aff7f0a252bf80f53b0f2b626a7534`, not the older design base
`06adea85fc5d5d7b24f7e15a598e28cb86ae4671`. The design base is an ancestor; the C3
integration adds only optional expected Account context to C2 list in the relevant
dependencies. Existing C2 identity/hash/read validation and migration registry
remain compatible. No conflict or SQLite52 implementation/reservation appeared in
local branch migration definitions or active-worktree DB/current-state checks.
Negative handoff statements such as “No SQLite52” were not treated as reservations.
No fetch/remote freshness claim. Gate evidence:
`/private/tmp/otr-p2bb-builder-source-gate.json`.

Fresh managed isolated worktree:
`/Users/xoery/.codex/worktrees/p2bb-sqlite-builder/otr-mobile-canonical`.
No existing worktree was reset, archived, rebased or edited by this Builder. Source
writes are confined to this worktree; probes/evidence live in private temporary
files. Installed dependencies were temporarily referenced by symlink, then removed
from delivery; no dependency/configuration changes.

## Exact implementation and SQLite52 delta

| Path                                                                                                                                                                                                                                                                                    | Change                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/data/db/migrations/captureBatchAssessmentObservations.ts`                                                                                                                                                                                                                          | Owner-conditionally authorized migration52 `capture_batch_assessment_observations`; exactly one table, composite PK autoindex, four guards.                                                            |
| `src/data/db/migrations.ts`                                                                                                                                                                                                                                                             | Exactly two added lines: one import and one trailing registry entry.                                                                                                                                   |
| `src/domain/capture/batchAssessmentObservation.ts`                                                                                                                                                                                                                                      | Strict primitive JSON body validator, complete manifest/snapshot/envelope, canonical bytes, independent digests, C4a recomputation, deep freeze, 2 MiB UTF-8 admission.                                |
| `src/data/repositories/captureBatchAssessmentObservationRepository.ts`                                                                                                                                                                                                                  | Dormant factory: Account-scoped readHead/readExact/append, validated contiguous prefix, revision+digest CAS, exact immutable replay, current C2 pins and mandatory owning validator, UNKNOWN outcomes. |
| `src/data/repositories/captureSubmissionRepository.ts`                                                                                                                                                                                                                                  | Moves existing header/full Job read verification into a transaction-local seam; original public behavior, JSON/hash rules, list context extension and write/acceptance lifecycle retained.             |
| New body/repository `.test.ts` files                                                                                                                                                                                                                                                    | 43 new tests, including real C4a-valid oversized record and separate-connection WAL conflict. All owning validators are explicitly TEST-ONLY.                                                          |
| `src/data/db/database.test.ts`                                                                                                                                                                                                                                                          | Existing full-chain expectations updated to52; historical migration-specific assertions retained.                                                                                                      |
| `src/data/db/checkpoint11Integration.test.ts`, `src/data/foundation/diagnosticsReadOnly.test.ts`, `src/data/repositories/intelligenceContinuationRepository.test.ts`, `src/data/repositories/tripCanonicalEventRepository.test.ts`, `src/data/repositories/captureAutonomousQa.test.ts` | Only affected whole-registry/schema-version fixture expectations updated to52. These additions to the plan are necessary callers of the changed registry; no product/authority changes.                |
| Contract, ADR, Builder plan, this report and current handoff                                                                                                                                                                                                                            | Accepted documents retained with Builder status addendum; new implementation evidence and next independent-review gate.                                                                                |

Migration objects: `capture_batch_assessment_observations`, implicit
`sqlite_autoindex_capture_batch_assessment_observations_1`, and
`capture_assessment_no_update`, `capture_assessment_no_delete`,
`capture_assessment_parent`, `capture_assessment_contiguous`. No other new table,
explicit index, row UUID, head/mapping/Job/scheduler, queue kind, worker or backfill.
Registry is contiguous1–52. All51 prior migration objects (IDs, names and complete
SQL strings) match the exact Builder base. Aggregate SHA-256 of their JSON encoding:
`b48136d3c787308f8588e392f047265e08b572e9469fbabef9a3a44075d8e982`.
Evidence: `/private/tmp/otr-p2bb-builder-preservation.json`; probe source:
`/private/tmp/otr-p2bb-preservation.cjs`. Historical migration files and embedded
registry SQL are unchanged; schema_migrations preservation/atomicity is tested.

## Behavior and ownership

`createCaptureBatchAssessmentObservationRepository` requires existing DB/Account
identity/SHA seams and a trusted local `assertCurrentOwningData(context,body)`.
No default composition exists. Its reusable C2 read seam uses the legacy Capture
dependency shape (including existing newId/clock fields), but observation methods
never call either allocator or clock. No new persisted identity is introduced.

- `readHead` reports EMPTY/HEALTHY/INTEGRITY_BLOCKED plus the highest verified
  contiguous historical head. `historicalOnly:true` explicitly prevents even a
  healthy history chain from being read as current owning-data freshness.
- `readExact` returns verified immutable FOUND with historical/chain labels,
  successful ABSENT only in a readable coherent chain, blocked or UNAVAILABLE.
  Invalid exact lookup/missing C2/read failure never becomes absence. Reads write
  no repair, timestamps, history, C2 or original data.
- `append` accepts exact canonical body text and expected revision+digest. It seals
  no new identity. Existing exact revision/body returns EXACT_REPLAY before NEW
  freshness, even after later head/Input revisions. Different content conflicts.
  Corrupt/noncontiguous history blocks NEW. Safe-integer overflow cannot allocate.
- NEW verifies C2 identity/context/roster and current Input revision/original binding
  under the existing Account apply gate and serialized SQLite transaction. A trusted
  owning validator is mandatory; missing/error/unavailable validation returns
  STALE_OBSERVATION. Final C2 facts are checked after that validator. Successful
  INSERT, readback and Account fences precede disclosure. No remote/native/provider
  work is installed under the gate. Separate-connection SQLite snapshot/BUSY errors
  return OUTCOME_UNKNOWN; exact readback precedes any same-body recovery.
- Body carries `contextSha256` using approved
  `importDigest('otr-capture-context-v1', validatedContext, sha256)`. C2 original
  context JSON and request/manifest hashes remain unchanged. C4 manifest, snapshot
  and domain-separated complete-body digests are independently verified; complete
  envelope is recomputed with historical pins and must match exact canonical bytes.
- 2,097,152 UTF-8 bytes is an inclusive complete-body bound. Some C4a-valid requests
  exceed it: RECORD_TOO_LARGE happens before SQL, with no partial writes,
  truncation, compression or fabricated Batch splitting. C4a retains its separate
  1 MiB raw/canonical request bound and all existing read-only denials.
- Lost COMMIT ACK/post-COMMIT Account switch/storage/rollback uncertainty retains
  the same body/revision as OUTCOME_UNKNOWN. Fresh Account A can recover after
  A→B→A/file reopen; old-generation callbacks cannot regain access. No failed read
  implies no commit. No retry loop, rebasing, pruning, eviction or deletion exists.

## Actual validation

| Check                                                                                                       | Result                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Final combined targeted matrix                                                                              | **15 files /508 PASS**, including43 new body/repository tests.                                                                          |
| Earlier core targeted matrix: new body/repository, original C4a/C2/CP11, DB/serialization and Account tests | 10 files /279 PASS before the final two added cases.                                                                                    |
| Whole-registry/C3/P4a/continuation/Event compatibility                                                      | 5 files /227 PASS.                                                                                                                      |
| Final new body/repository rerun                                                                             | 2 files /43 PASS (34 repository,9 body), including the two final additions. These overlap the core matrix and are not added wholesale.  |
| Typecheck                                                                                                   | PASS.                                                                                                                                   |
| Full lint/UI guard                                                                                          | PASS, no warnings;80 representative UI files,473 retained legacy occurrences.                                                           |
| Historical1–51 migration object/SQL preservation and two-line registry delta                                | PASS.                                                                                                                                   |
| Changed-file formatting/whitespace, exact scope/dormancy and final diff                                     | PASS; all changed/new deliverables formatted, whitespace clean, protected runtime paths unchanged, no other active SQLite52 definition. |

Core cases: fresh52 and populated51→52 FK ON/OFF; registered C2 identity/original
binding preservation; exact replay/CAS/conflicting body/current owning deny;
concurrent serialized callers and independent WAL connection winner;
A→B→A/cold/during-hash/post-COMMIT fences; first/middle/latest corruption, gaps,
format/storage/JSON/C2 corruption with no repair; lost ACK/read unavailability,
positive absence and file rollback; real disposable SQLite FULL with prior accepted
original and head retained, injected IOERR and failed commit/rollback; inclusive
SQL2 MiB/+1 UTF-8 boundary, canonical C4a-valid oversized body rejection;
valid1 MiB raw C4a request/+1 rejection; no Beta deletion; migration failure after
CREATE and each of four trigger chunks plus history-insertion failure, with no
partial objects/history and safe retry. Existing diagnostics remain SELECT-only.

Commands use `npm run test -- --configLoader runner --cache=false` with the named
files above, plus `npm run typecheck`, `npm run lint`, Prettier and `git diff --check`.
Initial development runs exposed old full-registry51 expectations and Node SQLite
binding typings; those are corrected. No failed selected tests remain. No full-suite
or new global release-readiness claim is made.

## Integration limitations and next review

No real current-owning-data adapter, default repository factory, Integrated C4
composition, Source/Run/Candidate/decision publication authority or processing
installation is delivered. Mocks prove enforcement only; they do not certify real
owning freshness. A missing validator denies NEW. Exact real owning read-set
composition remains a separate accepted dependency; do not substitute synthetic
C4a pins, add a permissive default, or nest the existing CP13B scoped transaction.

Node SQLite WAL/FULL/fault tests are local evidence. Expo/native contention,
hardware-full/OOM behavior, native installation rollback, hardware corruption,
privileged tamper resistance and tail-only deletion/backup rollback detection are
not certified. History validation is linear in retained revisions and hashes the
complete retained bodies; Beta intentionally has no pruning or aggregate quota.
Read errors may be unavailable; existing unreadable hardware is not repaired.

No C3 UI/source changes, C5/C9/Provider authority, API/backend/server migration,
Hosted DEV/Production access, device operation, provider/remote AI call, activation,
commit or push. The only startup effect is the authorized forward SQLite migration;
no assessment rows or worker are created automatically. Independent review must
verify the exact uncommitted diff and matrix before any Owner closure approval.

Exact delivered diff artifact: `/private/tmp/otr-p2bb-builder-implementation.patch`.
It includes tracked and new implementation/document files, excluding ignored
installed dependencies; no staging or commit is needed to review/apply it.

**STOP — P2b-B SQLITE PERSISTENCE BUILDER / INDEPENDENT REVIEW REQUIRED.**

## Owner-authorized R1/R2 targeted corrections — 2026-10-08

Accepted independent review findings were reproduced before production edits.
Its original document remains byte-for-byte unchanged (SHA256
`0d48881cd24b83924e4ed328c952e78f52cc4c6e9a2bbbeeccc0fa074808142f`).
The original Builder delivery and validation above remain historical evidence.

- R1: historical chain loading now uses the existing transaction-local C2 full
  reader, including complete immutable declarations and ordered Input roster.
  No C2 business logic is duplicated. Corrupt `original_filename` or a deleted
  Input yields UNAVAILABLE on readHead/readExact and INTEGRITY_BLOCKED on append,
  including attempted EXACT_REPLAY; no observation or C2 write occurs. The known
  C2 INTEGRITY exception maps to INTEGRITY_BLOCKED rather than an uncertain commit.
- Legitimate mutable Input/Capture advances remain compatible. A new regression
  observes pending then accepted Input states, advances Capture assignment twice,
  cold-reopens and successfully reads/replays both immutable revisions with zero
  writes and zero current-owning validator calls. Current owning freshness remains
  mandatory for NEW; historical replay does not acquire publication authority.
- R2: expected revision safe-integer/nonnegative/overflow checks now run immediately
  after the initial Account fence and before body parsing or SHA. Revision/parent
  body checks and subsequent Account fences remain. MAX_SAFE_INTEGER, overflow,
  negative, fractional, NaN and Infinity expectations return HEAD_CONFLICT for
  valid and malformed bodies, with zero SHA calls and zero writes.
- Production scope is only
  `src/data/repositories/captureBatchAssessmentObservationRepository.ts`;
  regression additions are in its existing `.test.ts`. No schema, migration,
  repository, runtime composition, dependency or authority is added.

| Correction validation                                                               | Actual result                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original independent assertions before correction                                   | 21 cases: 18 PASS / 3 expected FAIL; both C2 corruptions incorrectly returned HEALTHY/FOUND/EXACT_REPLAY; overflow invoked SHA four times.                                                                |
| New Builder regressions before correction                                           | 8 expected FAIL / 34 skipped; both R1 reproductions and all six R2 expected revisions fail.                                                                                                               |
| Corrected repository matrix                                                         | 43 PASS, including nine added R1/R2 cases.                                                                                                                                                                |
| Unchanged independent assertions in fresh copied snapshot with corrected repository | 21 PASS. This is Builder reproduction evidence, not a new independent review verdict.                                                                                                                     |
| Affected C2/C4a/SQLite52/Account/compatibility regressions                          | 14 files / 524 PASS: combined 13 files / 508, plus localCapture 1 file / 16.                                                                                                                              |
| Typecheck; full lint/UI guard                                                       | PASS; no lint warnings; 80 representative UI files, 473 retained legacy occurrences.                                                                                                                      |
| Formatting/whitespace and preservation                                              | PASS; all SQLite1–52 migration definitions, registry and original review unchanged against the pre-correction file snapshot. Only repository, its tests, this appended report and current handoff change. |

Regression commands use `npm run test -- --configLoader runner --cache=false`.
The combined matrix contains batchAssessmentObservation, batchAssessment,
captureBatchAssessmentObservationRepository, captureSubmissionRepository,
localCaptureInboxRepository, database, databaseConnection, accountRequestContext,
checkpoint11Integration, diagnosticsReadOnly, intelligenceContinuationRepository,
tripCanonicalEventRepository and captureAutonomousQa tests. localCapture domain
runs separately. The command also included a non-existent captureSubmission domain
filter; Vitest selected no cases for that filter, and no coverage is claimed for it.

Local evidence logs:
`/private/tmp/otr-p2bb-r1-r2-independent-before.log`,
`/private/tmp/otr-p2bb-r1-r2-builder-before.log`,
`/private/tmp/otr-p2bb-r1-r2-independent-after.log`,
`/private/tmp/otr-p2bb-r1-r2-builder-after.log`,
`/private/tmp/otr-p2bb-r1-r2-matrix.log`,
`/private/tmp/otr-p2bb-r1-r2-local-capture.log`,
`/private/tmp/otr-p2bb-r1-r2-typecheck.log`,
`/private/tmp/otr-p2bb-r1-r2-lint.log` and
`/private/tmp/otr-p2bb-r1-r2-preservation.json`.
Correction-only diff: `/private/tmp/otr-p2bb-r1-r2-corrections.patch`.
The earlier implementation patch remains the pre-correction delivery.

Full-suite/native/device behavior and real current-owning integration remain
unverified as described above. No Hosted/device/provider operations, runtime
activation, commit, push or merge. Targeted independent recheck is still required.

**STOP — P2b-B R1/R2 CORRECTION COMPLETE / TARGETED INDEPENDENT RECHECK REQUIRED.**
