# Capture C2 independent review

Date: 2026-10-08 (Pacific/Auckland). Independent reviewer; no product code edits.
Reviewed worktree `/private/tmp/otr-capture-c2-builder`, retained HEAD
`b6daffecedab1616b173fde3f5e2de5d54770eff`.

Authority: explicit independent review in
`/Users/xoery/Downloads/OTR_CAPTURE_C2_BUILDER.md`; accepted P1/C2 original
handshake and Revision 1 referenced by
`../adr/2026-10-08-c1-integration-owner-decision.md`.
Historical PROPOSED wording does not override the current Owner authorization.

## Initial findings

No CRITICAL finding identified.

| ID  | Severity  | Finding                                                                                                                                                                                                                     | Required correction                                                                                                                                                                                                     |
| --- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | IMPORTANT | Recovery recaptured Account context between asynchronous steps. A→B→A could give an old action a fresh generation. Session exact recovery also asserted the frozen context before calling a lookup that recaptured context. | Retain one context before picker/repository construction and thread it through reopen, resume, continuation submit and exact-key recovery. Recheck revision at registration.                                            |
| F2  | IMPORTANT | Add more from a reopened Job cleared its model but `!!jobId` kept Files/Photos permanently disabled.                                                                                                                        | Track reopening separately and clear it when starting the new volatile roster.                                                                                                                                          |
| F3  | IMPORTANT | Native `File.open()` requested the SDK's default ReadWrite access for file URIs. Readable read-only documents could fail intake.                                                                                            | Explicit `FileMode.ReadOnly`; assert mode in adapter tests.                                                                                                                                                             |
| F4  | IMPORTANT | Unpinned recovery created a new submission session as a disposable local expression. Registration could commit, then readback fail; retrying recovery allocated another Batch/Job/key.                                      | Retain the explicit continuation session through uncertain failure and retry/recover its exact request. Inject committed registration followed by unavailable readback; retry must create exactly one continuation Job. |
| F5  | MINOR     | Cold reverse lineage projection trusted successor SQL rows without verifying their immutable declaration/header. Corrupt successor lineage could invent Continued in another submission on the older Job.                   | Validate reverse and forward lineage metadata against retained immutable roster before projection; fail closed on corrupted successor declaration.                                                                      |

F1–F3 corrections were inspected in progress: one-context recovery, invocation-time
revision checks, independent reopening state and read-only native mode. Final status
requires the targeted recheck below; this initial section remains historical.

## Reviewed boundaries

- SQLite51 adds exactly two local tables; registry delta is one import/entry.
  Registration uses one Account-gated transaction before any reader call.
- CP11 original insertion and Input binding share one transaction through the
  narrow repository-local store. Payload/reference dedup remains exact-byte and
  Account-scoped. Pinning is separate from claiming accepted custody.
- Same-key registration compares immutable full-request digest and exact Job ID.
  Uncertain pin/acceptance writes read exact Input facts before any retry. Missing,
  incomplete or corrupted readback fails closed; it is not absence permission.
- Current roster reads verify immutable JSON/digests, full stored declarations,
  numeric SQLite storage classes, exact roster count/order and accepted original
  metadata/hash/bytes. Accepted original reads require no picker reacquisition.
- Lineage uses explicit same-Account older-registration edges. Immutable edges
  and older-row admission prevent cycles; lineage grants no byte equality or
  domain/processing authority. Reverse integrity was separately flagged above.
- Unsupported/expired native readers normalize to safe failure; missing sources
  remain registered/pending. Known quota failures retain first content pins.
- Hide remains enabled at every intake state; its callback does not cancel the
  durable operation. Processing stays NOT_INSTALLED; no canonical success is
  fabricated. C3 Activity discovery remains deferred.

## Checks actually run by reviewer

1. Retained HEAD and scoped diff/registry inspection.
2. `npx vitest run --configLoader runner` over submission repository, original
   Capture repository, bounded reader, tray, lifecycle and staging: **6 files,
   148 PASS** at the intermediate implementation snapshot.
3. Latest submission/native/tray/lifecycle/staging run: **54 PASS, 1 failure**.
   Deliberate cold-metadata corruption was blocked by the still-installed
   acceptance trigger before exercising the reader. This is a test-injection
   failure, not an asserted baseline failure or a successful cold-read check.
   Builder was informed to drop that guard only in the corruption fixture.
4. Default Vitest config loader could not write through the shared node_modules
   symlink under sandbox (`.vite-temp`, EPERM). Runner loader successfully ran
   checks without escalation or dependency changes.

No native device acceptance, actual provider URI/fidelity matrix, full suite,
Hosted/server/environment access, commit or push is claimed by this review.

## Targeted final recheck — PASS

The following final checks supersede the historical pending statements above.

- **F1 CLOSED:** recovery retains one Account generation before picker and all
  repository/continuation awaits. Exact-key session recovery passes that same
  context into the repository. Tests reject A→B→A during picker, after picker,
  and immediately before exact-key recovery. Registration rechecks the old
  Input revision inside the transaction.
- **F2 CLOSED:** independent reopening state is cleared by Add more; hook test
  verifies a reopened Job can select a fresh volatile roster without allocating
  another Job until explicit Add.
- **F3 CLOSED:** native adapter explicitly requests `FileMode.ReadOnly`; native
  mock verifies mode, bounded reads/EOF, one close and safe expired-URI failure.
- **F4 CLOSED:** explicit recovery action retains its continuation session and
  frozen request through uncertain failure. UI keeps the action on unverifiable
  outcomes and releases it after acknowledged/recovered facts. Fault test commits
  registration, loses ACK and blocks readback, then retries the same action:
  exact original continuation Job/key, one picker call, one accepted reference.
  A separate hook test verifies acknowledged pinned mismatch releases the old
  revision-bound action so a subsequent exact-original selection can proceed.
- **F5 CLOSED:** forward/reverse lineage checks verify referenced immutable
  headers and matching manifest edges. Cold corrupted successor edge cannot
  fabricate Continued status for a different Job. Current declaration, storage
  class and payload corruption checks also fail closed without recovery writes.

Final reviewer command:
`npx vitest run --configLoader runner` over
`captureSubmissionRepository.test.ts`, `captureUriReader.test.ts`,
`CaptureContent.test.ts`, `captureLifecycle.test.ts`, `captureStaging.test.ts`,
`localCaptureInboxRepository.test.ts`, `capturePayloadReader.test.ts`,
`localCapture.test.ts`, `checkpoint11Integration.test.ts`, and `database.test.ts`.
**10 files / 200 tests PASS**, measured on the final corrected snapshot.
`git diff --check` **PASS**. Prior test-injection failure was corrected and its
targeted cases passed; it is not omitted or mislabeled as a baseline failure.

**Final verdict: independent C2 engineering review PASS; zero remaining
CRITICAL / IMPORTANT / MINOR findings identified in the reviewed scope.**
This does not constitute Owner/device acceptance, native provider URI/fidelity
certification, C3 discoverability or authorization to activate runtime gates.
Reviewer changed only this report; no code edits, staging, commit or push.

## Final handoff recheck

Final source inspection confirms the recovery-action map is cleared only after a
verified `run()` or exact `recover()` model. Failed/unverifiable readback retains
the frozen recovery request. Reviewer reran submission repository and UI lifecycle
checks after that final catch cleanup: **2 files / 47 PASS**; whitespace **PASS**.
The final existing continuation/Event test edits change schema-version assertions
to 51 without changing production authority.

The Builder's final measured validation, recorded in
`OTR_CAPTURE_C2_IMPLEMENTATION_REPORT.md`, reports current whole suite **2,721 PASS,
1 FAIL, 15 SKIP** (212 files / 2,737 tests), compared with verified exact-base
**2,675 PASS, 1 same FAIL, 15 SKIP** (210 files / 2,691 tests). The shared failure is
`src/domain/architectureBoundary.test.ts`: its textual scanner sees an existing
`expo-sqlite` literal in `captureStaging.test.ts`'s exclusion regex. It is not the
historical Ledger failure. No global full-suite PASS is claimed. Builder reports
all 1,186 exact-base tracked files verified, 46 additional passing current tests,
and passing typecheck/lint/UI guard, Backend build and offline iOS bundle export.
Those broad runs are Builder evidence, separately identified from the reviewer's
targeted execution above. No new finding changes the independent PASS verdict.

STOP — C2 OWNER REVIEW REQUIRED. C3 AND RUNTIME GATES NOT AUTHORIZED.
