# Capture C3 independent review

Date: 2026-10-08 (Pacific/Auckland). Independent reviewer: separate `c3_review`
agent. Only this report is edited by the reviewer.

Worktree: `/private/tmp/otr-capture-c3-builder`; branch
`codex/capture-c3-builder`; starting and retained HEAD:
`914e854cba7c2c97cfec7243047a06cadcc82c05` (accepted C2).
The builder verified the clean exact base before implementation; this reviewer
entered while the authorized C3 changes were unstaged. Current C3 authorization
comes from the Owner's request to execute
`/Users/xoery/Downloads/OTR_CAPTURE_C3_AUTONOMOUS_CODEX_INSTRUCTIONS.md`.
Historical C2 handoff statements closing C3 do not override that request.

## Initial findings — retained

**0 CRITICAL / 0 IMPORTANT / 1 MINOR.**

- **MINOR F1 — Invocation Trip label on historical intake.** The reusable
  `CaptureContent` passed its current invocation's `tripName` into the tray when
  opening a historical Job or showing a continuation. That name need not describe
  the retained Job's historical context. The currently installed route supplies
  no Trip name, so this is a reusable mounting-seam presentation issue rather
  than an active route disclosure or authorization defect. Suppress the current
  invocation prior when reading/displaying durable intake; restore it for a fresh
  staging tray. Do not infer a historical Trip name from the current selection.

No in-scope security, identity, durability, action authorization, runtime-gate or
migration defect was identified. The original finding above remains recorded;
the final recheck below determines its closure.

## Reviewed files and boundaries

Reviewed all changed source/test files and both new Activity files:

- `app/(tabs)/capture.tsx`.
- `src/data/operations/defaultCaptureSubmission.ts` and its new test.
- `src/data/repositories/captureSubmissionRepository.ts` and its test.
- `src/features/capture/CaptureContent.tsx`, `CaptureContent.test.ts` and
  `captureLifecycle.test.ts`.
- `src/features/capture/CaptureActivity.tsx` and
  `captureActivityLifecycle.test.ts`.
- `src/ui/catalogs.ts`.

Mandatory guide/current handoff, owning Product/Architecture/Data/API/Offline
contracts, environment/legacy audit documents, UI Foundation/glossary, five
Capture direction documents/readiness audit, C1/C2 implementation/review/device
evidence and the accepted P1/C2 handshake/Revision 1 were inspected. No legacy
Web checkout was inspected or edited.

The interim entry is a canonical button inside existing Capture content, not an
Experience Bottom Shell or Trip Home change. `CaptureActivity` exposes
`isCurrent`, exact `onOpenJob(jobId)`, return and hide callbacks. An Experience
host must admit/fence the original Account/context/focus and remount on a new
invocation; mounting does not confer Trip authority.

List queries preserve C2 Account scope and stable descending created-at/Batch-ID
cursor order. Exact reopen uses the retained Job UUID and C2 verified read model;
it creates no replacement Job and performs no business write. Account context is
captured before database initialization and passed through to list/reopen. C2's
repository rechecks authorization under the existing Account apply gate. UI epochs
reject stale list/read/error completion after unmount, Hide, effect replay or newer
reopen; original Account generation cannot regain authority after A→B→A.

Counts/settling/acceptance come from persisted facts. Processing stays
`NOT_INSTALLED`; no plan-added, Review, percentage, ETA or generated attention
claim is introduced. Reacquisition consumes `availableActions.reacquireInputIds`;
the existing action reopens and rechecks Input revision/Account before and after
picker acquisition and before repository execution. Forward/reverse navigation
uses explicit verified continuation links, not filenames, time or hashes.

Hide invalidates publication and discards transient staging, without cancelling
durable intake. Route blur removes historical deep-link parameters; ordinary
Capture entry opens a fresh staging tray. Cold repository reopen tests preserve
accepted/partial/pending state and explicit links with zero `runAsync` calls and
unchanged row projections. They simulate process restart/offline without a live
network; they do not establish physical-device behavior.

Canonical controls supply localized labels and 44pt targets; semantic themes,
wrapping and font scaling are preserved. SSR checks cover English/Chinese and
both palettes. No dependency, migration, byte-store, scheduler, timer, polling,
Backend/Hosted/provider or final Experience shell change is present in the
reviewed product diff.

## Checks actually run

All commands used this worktree and `--configLoader runner` for Vitest.

1. `npx vitest run --configLoader runner src/features/capture/CaptureContent.test.ts src/features/capture/captureLifecycle.test.ts src/features/capture/captureActivityLifecycle.test.ts src/data/repositories/captureSubmissionRepository.test.ts`
   — **4 files / 60 PASS** at the initial snapshot.
2. Account request/coordinator and CP11 integration selection — **3 files /
   15 PASS**. Two additional nonexistent filter paths selected no tests and are
   not counted as executed checks.
3. Architecture boundary, staging and database selection — **3 files / 26 PASS /
   1 FAIL**. The exact known failure is
   `src/domain/architectureBoundary.test.ts > foundation architecture boundaries > keeps UI and domain modules away from direct data infrastructure`:
   it matches the literal forbidden-module token inside the unchanged
   `captureStaging.test.ts` guard regex. This reproduces the accepted C2 baseline;
   the reviewer did not alter or weaken it. Script/nonexistent filters in that
   invocation selected no additional tests. No global suite PASS is claimed.
4. `npx vitest run --configLoader runner src/data/operations/defaultCaptureSubmission.test.ts src/data/auth/accountRequestContext.test.ts src/data/auth/accountSwitchCoordinator.test.ts src/data/db/checkpoint11Integration.test.ts src/features/capture/captureStaging.test.ts src/data/repositories/localCaptureInboxRepository.test.ts src/data/files/capturePayloadReader.test.ts src/native/captureUriReader.test.ts src/domain/capture/localCapture.test.ts`
   — **9 files / 149 PASS**. This includes the new database-initialization
   A→B→A wrapper tests, frozen context rejection and fresh-generation success.
5. `npm run ui:guard` — PASS, 79 strict representative UI files checked.
   `npm run typecheck` and `git diff --check` — PASS.

No reviewer full-suite run, native build/install, VoiceOver, Dynamic Type device
inspection, provider fidelity or Owner device PASS is claimed. Builder validation
and optional build evidence belong to the implementation report.

## Initial Git snapshot

`git diff --stat` before report creation: **8 tracked files changed, 517
insertions /25 deletions**. This excludes untracked new source/tests and reports.

```text
 M app/(tabs)/capture.tsx
 M src/data/operations/defaultCaptureSubmission.ts
 M src/data/repositories/captureSubmissionRepository.test.ts
 M src/data/repositories/captureSubmissionRepository.ts
 M src/features/capture/CaptureContent.test.ts
 M src/features/capture/CaptureContent.tsx
 M src/features/capture/captureLifecycle.test.ts
 M src/ui/catalogs.ts
?? node_modules
?? src/data/operations/defaultCaptureSubmission.test.ts
?? src/features/capture/CaptureActivity.tsx
?? src/features/capture/captureActivityLifecycle.test.ts
```

`node_modules` is the builder's local dependency symlink, not a dependency change
or deliverable. The reviewer has not staged, committed, pushed, merged, rebased,
deployed, activated a runtime gate or edited any other worktree.

## Final recheck

- **F1 CLOSED:** `CaptureContent` now supplies the invocation prior only for new
  staging (`model || reopening ? undefined : invocationTripName`). The reopened
  Job lifecycle test asserts no current Trip-name prior on historical intake and
  restoration after explicit Add more creates a fresh volatile tray.
- Inspected the final microtask-based effect startup in both content and Activity:
  setup epochs reject earlier effect instances before reads start; cleanup and
  completion guards reject late callbacks without timers or a new lifecycle owner.
- Final reviewer rerun of the exact five C3 files from checks 1 and 4 (adding
  `src/data/operations/defaultCaptureSubmission.test.ts` to check 1): **5 files /
  62 PASS**. `git diff --check` also PASS.
- Final tracked `git diff --stat`: **8 files changed, 524 insertions /26
  deletions**. New Activity source, its test, wrapper test and this review report
  remain untracked/unstaged. The implementation/current-state reports may be
  appended later by the builder; this snapshot does not claim their completion.

**0 remaining CRITICAL / IMPORTANT / MINOR.** C3 is ready for Owner review within
the documented local-only scope. This engineering review does not replace Owner
C3/device acceptance; real visual/VoiceOver/large-text/offline restart checks remain
the device gate. No new migration or runtime gate is authorized by this verdict.

## Final handoff snapshot

The builder subsequently completed the implementation/current-state reports and
removed the temporary dependency symlink. The final 14 deliverables are:

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

The following final validation is **builder evidence**, recorded in the
[implementation report](OTR_CAPTURE_C3_IMPLEMENTATION_REPORT.md), not additional
reviewer test execution. Counts overlap with the reviewer checks above:

- Final affected regressions: **26 files /453 PASS**.
- Final serial full suite: **214 files /2,749 tests: 2,733 PASS /1 unchanged
  architectureBoundary FAIL /15 SKIP**. No global suite PASS.
- Exact accepted C2 archive guard reproduction: **3 PASS /1 same FAIL**.
- Final typecheck, lint including UI guard, changed-file formatting, whitespace,
  Backend bundle and offline iOS Hermes export: PASS.
- Export is JavaScript bundle verification only; no signed C3 native build,
  installation or Owner device PASS. No migration/runtime gate expansion.

The reviewer read the completed implementation report and obtained the following
final Git snapshot directly. HEAD/branch remain as stated above; all 14 files are
unstaged/uncommitted. Stat counts tracked changes only; five additions are
untracked. The dependency symlink is absent.

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

STOP — C3 OWNER REVIEW REQUIRED. C4/C5 AND RUNTIME GATES NOT AUTHORIZED.

## Autonomous simulator QA/UX targeted independent recheck

Date: 2026-10-08 (Pacific/Auckland). Separate reviewer:
`qa_independent_review`. This section supersedes the earlier UI presentation
snapshot only; historical C2/C3 engineering and owner-device evidence is retained.
The current cycle prohibits physical-device/R3/Hosted access. The reviewer used
only this C3 worktree, synthetic tests and builder-created Simulator images.

### Findings and closure

- **MINOR UX1 — Misleading Activity return label, CLOSED.** The footer initially
  said “Add files or photos” although its existing handler returns to the retained
  Capture view, which may be Job detail. It now says “Back to Capture” / “返回记录”,
  matching that handler without resetting or writing durable Jobs.
- **MINOR UX2 — Unconditional continuation assertion, CLOSED.** Expanded technical
  details initially asserted an explicit continuation link for every Job. The
  explanation now renders only when projected prior/forward links actually exist.
  Identity remains hidden unless the owner explicitly expands technical details.
- **MINOR EXTERNAL UX3 — Shared header at maximum Dynamic Type, OPEN.**
  `final-job-dark-maxtext-zh.png` and
  `final-recovery-dark-maxtext-zh.png` show the shared “记录” header vertically
  clipped at maximum text size. It is owned by the unchanged Tabs/navigation shell
  (`app/(tabs)/_layout.tsx`), not Capture content. Capture filenames, descriptions
  and recovery labels wrap; the scrolled recovery image shows the full two-line
  action with an expanded target. Experience/UI Foundation should address header
  sizing in its separately authorized scope. No global Dynamic Type PASS claimed.

**Final recheck: 0 remaining in-scope CRITICAL / IMPORTANT / MINOR;
1 external MINOR visual handoff.**

- **IMPORTANT QA4 — New synthetic test violates feature-layer boundary and its
  failure was misattributed, CLOSED.** The initial full-suite log identifies
  `src/features/capture/captureAutonomousQa.test.ts` importing `@/data/db`, not the
  old `captureStaging.test.ts` regex. Its repository/migration fixture belongs under
  data-layer tests. The single failing test name alone cannot establish unchanged
  failure cause. Relocate the test without weakening the guard, rerun, and correct
  the suite attribution before declaring final engineering readiness. Final recheck
  confirmed relocation,
  unchanged guard, focused matrix/lifecycle success and corrected full-suite
  attribution in both the QA report and Current Implementation State. The
  reviewer's earlier summary also repeated the incorrect attribution; the exact
  error audit and records above correct it.

Final Owner visual acceptance and physical-device behavior remain unverified by
this review.

### Connected source and automated evidence

Compared current file bytes with `ios/c3-simulator-qa/starting-source.json`.
The route, repository, default operations, repository/wrapper tests and Capture
lifecycle files remain identical to the authorized starting C3 snapshot. The new
cycle changes Capture presentation/catalog/content tests and adds synthetic QA
and Account-switch regressions. No migration, production bootstrap test gate,
Core/Auth source, scheduler or provider change was identified.

Reviewed list/reopen callers, request-generation gates, projected actions,
submission/recovery flow, locale controls, canonical buttons/palette/typography
and the real SQLite synthetic fixture. Saved/not-saved titles derive only from
persisted counts. UUID is retained for exact reopen/keying and optional technical
disclosure, never a primary label. Partial counts remain visible. The processing
copy states saved materials are not yet added to a Trip; it introduces no semantic
Review or invented processing status. Recovery permission still comes from
`availableActions.reacquireInputIds` and repository revision/Account rechecks.
Photos and Files now have distinct plain re-selection labels. Forward/reverse
navigation uses projected exact Job links; each list card retains its own identity.

The synthetic matrix builds a fresh temporary SQLite51 database through existing
migrations and repository methods. It checks 45 A Jobs paginated 20/20/5, equal-time
ordering, distinct B visibility, exact reopen, failed/pending/accepted counts,
restart, explicit lineage, zero read writes, no outbox/Source/processing admission,
and 50-file accepted replay without touching expired picker sources or duplicating
originals. The Account-switch regression uses ephemeral remembered-session storage
and the real unchanged coordinator, with explicit local bootstrap/sync adapters.
Its successful synthetic A→B→A and injected failure behavior cannot diagnose the
owner's physical-device error. That limitation is correctly retained in the
Account-switch recheck report.

QA4 code correction recheck: the synthetic disk fixture was moved unchanged to
`src/data/repositories/captureAutonomousQa.test.ts`. Reviewer execution of the
moved matrix and architecture test yielded **5 PASS /1 baseline FAIL**: the exact
remaining guard error now identifies unchanged `captureStaging.test.ts`'s literal
`expo-sqlite` regex. The architecture guard itself remains unchanged. A final
seven-file focused rerun using the moved path again yielded **67 PASS**.

The first corrected builder full run yielded **2,737 PASS /2 FAIL /15 SKIP**.
The additional unchanged `client.test.ts` assertion rejects the substring “42” in
its entire diagnostic JSON; at minute42 the existing `at` timestamp contains it.
This transient wall-clock failure is distinct from Capture and the architecture
guard. Reviewer narrow rerun at 20:44:24 (Pacific/Auckland) yielded **7 PASS**;
`client.ts` and its test are unchanged. It is not a full-suite replacement result.
Evidence: `independent-layer-recheck.log`, `independent-client-recheck.log` and
`full-tests-corrected.log` under the ignored QA directory.

Reviewer commands used the network-deny preload and existing Vitest runner:

- Seven focused files, final rerun after UI fixes: **67 PASS** —
  `CaptureContent.test.ts`, `captureLifecycle.test.ts`,
  `captureActivityLifecycle.test.ts`, data-layer `captureAutonomousQa.test.ts`,
  `captureAccountSwitchRecheck.test.ts`,
  `captureSubmissionRepository.test.ts`, `defaultCaptureSubmission.test.ts`.
  Evidence: `ios/c3-simulator-qa/independent-final-tests.log`.
- `npm run typecheck`: PASS. `npm run ui:guard`: PASS, 79 strict representative
  UI files; `git diff --check`: PASS. Logs are ignored local evidence.
- Initial builder full-suite result: **216 files /2,754 tests: 2,738 PASS,
  1 architectureBoundary FAIL, 15 SKIP**. Final evidence audit read the exact error
  and found a new `@/data/db` import in the synthetic feature test; this initial
  run must not be described as the unchanged baseline cause. The reviewer raised
  QA4 for correction. No global suite PASS is claimed.

### Screenshots inspected independently

All image paths below are relative to ignored
`ios/c3-simulator-qa/screenshots/`; they contain synthetic data only.

- Before: `before-activity-en.png` — UUID dominates title/action; verbose status
  cards occupy most of the viewport.
- First pass: `pass1-activity-zh.png`, `pass1-job-recovery-zh.png` — condensed list,
  truthful mixed counts, long-name wrapping and explicit recovery/lineage actions.
- Final: `final-activity-zh.png`, `final-activity-account-b-zh.png`,
  `final-job-recovery-zh.png`,
  `final-job-dark-zh.png`, `final-job-dark-maxtext-zh.png`,
  `final-recovery-dark-maxtext-zh.png` — human summaries, hidden primary UUID,
  improved row grouping and readable dark theme. The maximum-size limitation is
  recorded above rather than concealed by restricting font scaling.

The reviewer inspected supplied images and source/tests; the builder owns native
Simulator control and per-case execution receipts. No reviewer native picker,
physical device, actual VoiceOver speech or Owner visual PASS is claimed.
The ignored Simulator bootstrap rewrites synthetic sessions and selects Account A
at startup. Its kill/relaunch evidence can establish durable Job retention, but
cannot establish preservation of the last active Account B/Empty across restart.
This is a fixture limitation, not a product-session fix. A subsequent independent image recheck inspected `final-empty-zh.png`,
`final-empty-en.png`, `final-activity-en.png`, `final-job-recovery-en.png` and
`final-recovery-dark-maxtext-zh.png`. Both empty states have readable localized
messages and return/hide actions; English list/detail preserve truthful counts
and distinct Files/Photos recovery. Chinese original filenames remain original
user data when the UI is English. No additional visual finding was identified.
The maximum-size scrolled action is fully visible and wraps; the external header
limitation remains. Reviewer automated render checks also cover both locales and
empty/error states.

Builder separately reports actual Simulator A→B→Empty→A coordinator switching
with B's one Job, Empty's zero Jobs and A's six Jobs, plus explicit technical
UUID reveal/hide. These execution observations belong to the builder's Simulator
report; this reviewer checked source/tests and the corresponding supplied images,
not live Simulator control. The reviewer subsequently inspected `final-small-activity-en.png`,
`final-small-job-en.png` and `final-small-actions-en.png` from the dedicated
SE3 Simulator (375×667pt, iOS27,
`E139C98D-A898-4F1C-8AAF-5DACBB478283`). Activity cards, counts and View actions
fit; the long mixed-language filename and explanatory text wrap in Job detail.
The initial actions image duplicated the top/middle; the builder recaptured it
using touch-drag scrolling. The reviewer inspected the corrected
`final-small-actions-en.png`: prior navigation, both photo/file re-selection,
technical disclosure, Add more and Hide are all readable and fully reachable in
the scrolled viewport. No horizontal content overflow is visible in these images.

`final-native-photo-recovery-en.png` was also inspected independently: one saved
`IMG_0111.heic` input, explicit prior-submission navigation and Add more/Hide actions
are clear. The builder reports a real stock-Simulator photo acquired by the native
picker and accepted in a new explicit continuation Job, with all seven old Jobs
and 30 Inputs unchanged. This screenshot supports the resulting presentation;
byte count and preservation claims require the builder's SQLite receipts. Native
Files opening/cancellation with an empty provider is distinct from file-byte
acceptance, which remains covered by explicit automated adapters.
The final evidence audit also inspected `before-empty-en.png` from the frozen
before bundle on SE3. It has the expected original verbose Activity text. Its
viewport differs from the Pro final-empty screenshot: it is qualitative evidence,
not a pixel-matched before/after geometry comparison. Final status review verified
retained HEAD/branch, nine tracked modified and ten untracked files, empty index.
Final QA report/current-state audit confirms no full-suite PASS claim, explicit
initial misplaced-test failure and corrected 2,737/2/15 full result, independent
API narrow rerun and physical-device hold. The reviewer independently compared
API source/test bytes to `git show HEAD:<path>` and confirmed both unchanged.
Before-empty viewport mismatch and the not-installed-on-owner-phone limitation
are explicitly reported. No additional reporting overclaim remains.
No stage/commit/push/merge/rebase occurred in this reviewer task.

STOP — C3 SIMULATOR + UX OWNER REVIEW REQUIRED.
