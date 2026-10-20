# Capture C3 implementation report

Date: 2026-10-08 (Pacific/Auckland). **IMPLEMENTED / OWNER ACCEPTED: FUNCTIONAL SIMULATOR PASS / PHYSICAL DEVICE DEFERRED.**

## Exact source and authority

Owner requested execution of
`/Users/xoery/Downloads/OTR_CAPTURE_C3_AUTONOMOUS_CODEX_INSTRUCTIONS.md`.
Only C3 is implemented. Exact accepted C2 starting/retained HEAD:
`914e854cba7c2c97cfec7243047a06cadcc82c05`; new independent worktree
`/private/tmp/otr-capture-c3-builder`, branch `codex/capture-c3-builder`.
Git verified the commit, exact C2 branch tip, clean C2 checkout and parent
`b6daffecedab1616b173fde3f5e2de5d54770eff` ancestry before implementation.
The accepted C2 implementation, independent review and Owner device reports
were inspected. Current authorization supersedes their historical C3-closed
wording; it grants no C4/C5 or runtime permission.

Existing worktrees remain preserved. No staging, commit, push, merge, rebase,
cherry-pick, deployment or provider activation. Legacy Web was not inspected.

## Delivered behavior and Experience handoff

- **Discoverability:** canonical Activity / Recent submissions button inside the
  existing Capture surface. No new tab, global menu destination, Bottom Shell,
  Trip Home widget or Activity notification framework.
- **Real history:** C2 Account-scoped list, descending createdAt/Batch-ID order,
  20 Jobs per read and explicit older-page loading. UUID identity remains visible
  for every child Job. This is ordered local submission history, not a newly
  defined time-window aggregate or newness policy.
- **Exact reopening:** existing C2 repository verifies the retained Job, roster,
  originals and lineage. Opening a list entry or verified continuation link reads
  that same Job UUID; it never allocates or submits. Read failures show an error,
  not an empty/success result; retry is available through Activity refresh/reopen.
- **Truthful presentation:** selected, saved, failed and pending intake counts;
  allInputsAccepted and intakeSettled are distinct messages. Processing remains
  NOT_INSTALLED and Review has no live control. Saved intake never claims plans
  added, processing completion, waiting for internet/service, canonical admission,
  fake percentage, ETA or generated attention.
- **Actions:** canReopen, canAddMore and reacquireInputIds are consumed from C2's
  derived availableActions. Hide remains enabled in empty/loading/error/partial/
  complete states and does not cancel durable responsibility. Existing C2 recovery
  reauthorizes Account/generation and Input revisions before/after the picker and
  at execution. A failed item alone does not grant retry authority.
- **Lineage:** earlier/continuation buttons use only verified
  continuesFromJobId / continuedIn projections of explicit continuesFromInputId.
  Linked Jobs keep separate UUIDs, facts and acceptance. Copy explicitly denies
  byte equality/inherited acceptance. No filename/time/hash-based inference.
- **Fresh capture:** ordinary route focus opens new staging; route blur clears a
  one-invocation historical jobId parameter. Activity is how historical submissions
  are found. Returning from Activity alone preserves current volatile staging;
  explicitly opening a historical Job discards that staging, as ordinary
  navigation already does. Add more starts a fresh tray with no Job until Add.

Reusable mounting seam:
`CaptureActivity({ isCurrent, onOpenJob(jobId), onReturn, onHide })`.
Experience must supply admitted Account/context/focus currentness and remount on
invocation change; opening must use the existing fenced C2 reopen seam. The
existing `/capture?jobId=<UUID>` deep link remains supported. Final shell position,
Trip Home widget, aggregate window, newness markers/clearing and future semantic
attention belong to Experience and later owning contracts, not this interim mount.

## Account, offline and read safeguards

The installed route reuses local session admission, focus cleanup and Account
subscription. Generation changes hide prior content and invalidate the original
predicate, including A→B→A. No network reauthentication or online prerequisite is
added. List/reopen wrappers capture context before database initialization and
pass it into C2; list gains an optional expected-context argument without changing
existing callers. Repository authorization is repeated through its existing gate.

UI setup/request epochs fence late list/read/error callbacks after effect replay,
blur/Hide, a newer reopen or host invalidation. No timer, polling, startup worker,
queue or scheduler is added. Entering Activity remounts its read lifecycle; existing
route refocus remounts admitted content. Refresh is explicit local reading.

Cold file-database tests retain complete/partial/pending intake and forward/reverse
lineage. All-table row snapshots and runAsync spies prove zero business writes on
list/reopen, including Account A→B→A. Accepted originals need no expired picker
URI. Trip prior stays historical/passive; originals remain Account-only INBOX.
No Trip metadata/grant is inferred. Current invocation Trip names are suppressed
while reading/displaying historical or continuation intake.

English/Simplified Chinese copy uses central catalogs; semantic palettes, typography,
UiButton/UiSection, wrapping, default font scaling and accessible 44pt targets are
preserved. Loading/error states are localized, without spinner-as-progress.
Automated SSR/hook tests do not certify native layout or VoiceOver behavior.

## Validation actually executed

| Check                                              | Result                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| Initial Capture/submission checks                  | 4 files /57 PASS                                                   |
| Expanded C3 checks                                 | 5 files /67 PASS                                                   |
| Default operation Account-binding tests            | 1 file /2 PASS                                                     |
| Final affected regressions after review correction | 26 files /453 PASS                                                 |
| Independent final review                           | 5 files /62 PASS; initial MINOR F1 CLOSED; zero remaining findings |
| Exact C2 archive architectureBoundary check        | 3 PASS /1 same existing FAIL                                       |
| Typecheck; lint including UI guard                 | PASS                                                               |
| Changed-file Prettier; git diff --check            | PASS                                                               |
| Backend bundle build                               | PASS                                                               |
| Final offline iOS Hermes export                    | PASS; bundle validation only                                       |
| Migration/registry preservation                    | 89 migration source files byte-identical; registry unchanged       |

Final serial full suite: **214 files /2,749 tests: 2,733 PASS, 1 existing FAIL,
15 SKIP**. The earlier snapshot before the wrapper test and MINOR correction
was 213 files /2,747 tests: 2,731 PASS, 1 same FAIL, 15 SKIP. Tests use
`vitest run --configLoader runner`; full runs add
`--maxWorkers=1 --no-file-parallelism`. Network-capable tests use the unchanged
`scripts/cp15/live-w-network-deny.cjs` TCP/fetch-denial preloader. Runs overlap;
the counts above must not be added.

The known failing assertion is
`src/domain/architectureBoundary.test.ts > foundation architecture boundaries > keeps UI and domain modules away from direct data infrastructure`.
Its textual scanner matches the existing forbidden-module literal in
`captureStaging.test.ts`'s exclusion regex. That file/test and architecture guard
remain unchanged. An exact archive of the starting C2 SHA independently reproduces
the same assertion. No unrelated test fix or global full-suite PASS is claimed.

Initial lint rejected synchronous effect state updates and the guard interpreted
Intl date/time formatting options as visible copy. Both were corrected: epoch-
fenced microtask startup, and exact-line programmer-option exceptions. Historical
Trip-name presentation was then flagged MINOR by the independent reviewer, fixed,
and rechecked. Initial findings are retained in the independent review report.

## Build truth, limitations and gates

Final iOS export uses `CI=1 EXPO_OFFLINE=1 EXPO_NO_DOTENV=1`, existing Dev transport
and local-only API `http://127.0.0.1:9`; no Hosted credential file is loaded.
The Hermes bundle contains C3 Activity keys/component and exact reopen wrapper.
Final bundle: `/private/tmp/otr-c3-final-ios-bundle/_expo/static/js/ios/entry-3e50cddaa6c7b0c1f9cdbf58acc4b200.hbc`,
7,740,074 bytes; SHA-256
`3f0886738efa90b5c213fba0fb6e3f5e2956ae8966b4aad717cd84feeb440e68`.
This is an embedded JavaScript bundle export, **not** a signed native Release or
an installed C3 app. The isolated worktree has no prepared native project; no
C3 native build/install, app reset or Owner device PASS is claimed. The installed
accepted C2 app/container is untouched. Real C3 visual, VoiceOver, large-text,
Hide/restart/offline and Files/Photos recovery checks remain Owner device work.

All SQLite1–51 and Server1–84 migration bytes and local registry are unchanged.
No HTTP endpoint, migration, dependency, raw-byte duplicate, domain Job engine,
Source/Representation/Run, whole-batch assessment, C4a/C5, canonical writer, Guest,
new auth flow, Hosted DEV/Server69/R3 change, remote AI/provider, Review requirement,
Banner/OS push, Wallet, Photo cloud or Ledger attachment change is introduced.
No new runtime gate is installed or activated.

No implementation blocker remains for this C3 local discovery slice. Readiness:
independently reviewed and ready for C3 Owner review, with the baseline failure and
native/device limitations above. C4/C5 and all runtime gates remain closed.

## Exact changed-file inventory

```text
app/(tabs)/capture.tsx
docs/CURRENT_IMPLEMENTATION_STATE.md
docs/architecture/OTR_CAPTURE_C3_IMPLEMENTATION_REPORT.md
docs/architecture/OTR_CAPTURE_C3_INDEPENDENT_REVIEW.md
src/data/operations/defaultCaptureSubmission.ts
src/data/operations/defaultCaptureSubmission.test.ts
src/data/repositories/captureSubmissionRepository.ts
src/data/repositories/captureSubmissionRepository.test.ts
src/features/capture/CaptureActivity.tsx
src/features/capture/captureActivityLifecycle.test.ts
src/features/capture/CaptureContent.tsx
src/features/capture/CaptureContent.test.ts
src/features/capture/captureLifecycle.test.ts
src/ui/catalogs.ts
```

The temporary dependency symlink is removed before handoff; no package/lockfile
change. Generated bundle/build output stays outside tracked source. Final unstaged
Git status/stat and retained evidence follow below.

## Final Git evidence and retained logs

Retained HEAD is the starting C2 SHA; staged diff is empty. `git diff --stat`
reports tracked modifications only; the full inventory above includes five
untracked additions. All 14 deliverable files remain unstaged/uncommitted.

```text
$ git diff --stat
 app/(tabs)/capture.tsx                             |   7 +-
 docs/CURRENT_IMPLEMENTATION_STATE.md               |  35 ++++-
 src/data/operations/defaultCaptureSubmission.ts    |  14 ++
 .../captureSubmissionRepository.test.ts            |  88 +++++++++++
 .../repositories/captureSubmissionRepository.ts    |   4 +-
 src/features/capture/CaptureContent.test.ts        | 136 +++++++++++++++++
 src/features/capture/CaptureContent.tsx            | 168 ++++++++++++++++++---
 src/features/capture/captureLifecycle.test.ts      |  89 ++++++++++-
 src/ui/catalogs.ts                                 |  44 ++++++
 9 files changed, 558 insertions(+), 27 deletions(-)

$ git status --short
 M app/(tabs)/capture.tsx
 M docs/CURRENT_IMPLEMENTATION_STATE.md
 M src/data/operations/defaultCaptureSubmission.ts
 M src/data/repositories/captureSubmissionRepository.test.ts
 M src/data/repositories/captureSubmissionRepository.ts
 M src/features/capture/CaptureContent.test.ts
 M src/features/capture/CaptureContent.tsx
 M src/features/capture/captureLifecycle.test.ts
 M src/ui/catalogs.ts
?? docs/architecture/OTR_CAPTURE_C3_IMPLEMENTATION_REPORT.md
?? docs/architecture/OTR_CAPTURE_C3_INDEPENDENT_REVIEW.md
?? src/data/operations/defaultCaptureSubmission.test.ts
?? src/features/capture/CaptureActivity.tsx
?? src/features/capture/captureActivityLifecycle.test.ts
```

Retained logs under `/private/tmp/`: `otr-c3-final-regressions.log`,
`otr-c3-final-full-tests.log`, `otr-c3-exact-base-guard.log`,
`otr-c3-final-typecheck.log`, `otr-c3-final-lint.log`,
`otr-c3-final-format.log`, `otr-c3-backend-build.log`,
`otr-c3-final-ios-bundle.log`. Earlier intermediate logs are retained separately.
Final C2 checkout is still clean at its accepted SHA; canonical retains its
original pre-existing changes and HEAD. No other worktree was edited.

STOP — C3 OWNER REVIEW REQUIRED. C4/C5 AND RUNTIME GATES NOT AUTHORIZED.

## Subsequent Owner acceptance

The Owner accepted C3 functional Simulator QA and scoped UX refinement and
authorized one local checkpoint on the existing C3 branch. The acceptance scope,
two measured full-suite failures and deferred physical/Experience/Core items are
recorded in `OTR_CAPTURE_C3_SIMULATOR_QA_UX_REPORT.md`. Earlier results and stop
wording above are historical. **Stop after commit; no push or integration.
C4/runtime gates remain unauthorized.**
