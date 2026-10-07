# OTR Capture C1 Implementation Report

Date: 2026-10-07; owner acceptance: 2026-10-08 (Pacific/Auckland).
Status: **C1 ACCEPTED — OWNER IPHONE DEVICE ACCEPTANCE PASS**.
Worktree: `/Users/xoery/Project/otr-mobile-capture`; branch: `trip/capture`.
Pre-commit base HEAD: `92b87bd20f0d4baf23d3b4da8934d3142133e765`.
Starting `git status --short`: empty / clean. The readiness audit was already committed at HEAD; no uncommitted owner-reviewed baseline bytes needed adoption. C0 runs separately and no C0 output was present here. Canonical/Import/Experience/Temporal worktrees were not edited.

## Implemented scope

C1 only: authenticated temporary route mount, identity-neutral reusable Capture content, installed Files and Photos acquisition, ordered session-local staging, repeated source composition, remove-one/all, cancel and unmount discard. Native picker cancellation preserves prior choices. Nothing is automatically submitted.

The disabled final Add action has explicit truthful unavailable copy: selected material has not been saved or added to OTR. No Added/Saved/Processing success, Job, percentage, parser, Source, Representation, durable intake, queue or domain mutation is created. There is no production fixture-success path. The existing navigation shell/Bottom Bar/Trip Home is unchanged; Cancel returns to the existing Today route through Expo Router.

## Exact file scope

Production (six files):

- `app/(tabs)/capture.tsx`: replaces placeholder with local authenticated admission and reusable content; focus cleanup discards; Account generation remounts; existing apply gate waits for local session installation, with no network re-authentication or picker I/O under a gate.
- `src/features/capture/CaptureContent.tsx`: reusable content and tray presentation with pinned invocation Trip-name prior, source actions, ordered compact list, remove, disabled Add and host-owned Cancel.
- `src/features/capture/captureStaging.ts`: transient metadata store, incremental per-session IDs, availability/error, rapid-tap lock, cancellation/unmount epoch and reversible attach for effect replay. No persisted DTO/schema or Account/Guest/domain ID.
- `src/native/capturePicker.ts`: installed native API adapter; Files multi-select with cache-copy/base64 disabled; system Photos image multi-select in native returned order with no EXIF/base64 request. No broad Photos permission architecture, full-byte read/hash or upload. OS/plugin temporary export/caching is not durable OTR custody.
- `src/data/auth/accountGeneration.ts`: subscription notification added to existing generation; no new Account lifecycle framework.
- `src/ui/catalogs.ts`: 22 English/Simplified Chinese Capture message keys with matching parameters, whole-message interpolation and unmodified filenames.

Validation (four files): `scripts/ui/guard.ts` adds the Capture route strict representative root; `captureStaging.test.ts`, `CaptureContent.test.ts`, `captureLifecycle.test.ts` reuse Vitest, native adapter mocks, SSR presentation and the existing production hook/event-harness pattern. No new framework/dependency.

Documentation (four files): this report; [independent review](OTR_CAPTURE_C1_IMPLEMENTATION_REVIEW.md); [C2 preflight](OTR_CAPTURE_C2_DURABLE_INTAKE_PREFLIGHT.md); short incremental `docs/CURRENT_IMPLEMENTATION_STATE.md` update. Total final diff scope: **14 files**. Five accepted Capture direction documents and readiness audit are unchanged. No unrelated source, package/lock/config, schema, Backend, Supabase, startup/runtime or historical migration changes.

## Staging, context and accessibility

Only native temporary selection reference, acquisition source, safe native name/type hints, available size/dimensions, session ID/order and unverified/unavailable status are retained. Paths are not displayed/logged; native failures become a localized generic picker error. Present URI means unverified, not accepted or proven readable. A missing reference is visible and removable. Files/Photos do not establish evidence/Media/Documents role.

The feature accepts an opaque host `isCurrent` predicate, an optional real Trip name prior and Cancel handler. It contains no Account identity model, fake Guest or fabricated Trip. Initial prior/predicate are fixed for the invocation; a new invocation requires host remount/fresh fencing. The verification route supplies no Trip because no authoritative selected-Trip contract is installed. Account transition begins by notifying existing generation subscribers; old content/picker callbacks become inadmissible. A→B→A cannot revive the earlier generation. Route blur, cancellation and effect cleanup invalidate late callbacks. `attach()` permits React effect replay while preserving callback epochs.

Canonical `UiButton`/`UiSection`, semantic palettes, typography/spacing, locale subscription and native route chrome are reused. Buttons have accessible labels/roles/disabled states and ≥44pt minimum targets. Source actions disable during selection, errors have alert semantics, long names wrap without fixed-height/single-line truncation, font scaling stays enabled and the route reserves bottom/side safe area. English/Chinese and light/dark presentation are exercised by SSR tests; real VoiceOver, large-text layout and picker/permission visuals remain unverified beyond the owner interactions recorded below. No keyboard input is introduced.

## Verification evidence

Builder commands/results after production fixes:

```sh
npm run typecheck
npm run ui:guard
node_modules/.bin/eslint 'app/(tabs)/capture.tsx' src/features/capture src/native/capturePicker.ts src/data/auth/accountGeneration.ts src/ui/catalogs.ts scripts/ui/guard.ts
npm run test -- --configLoader runner src/features/capture src/data/auth/accountRequestContext.test.ts src/data/auth/accountSwitchCoordinator.test.ts src/data/auth/accountSwitchFoundation.test.ts src/data/repositories/localCaptureInboxRepository.test.ts src/data/files/capturePayloadReader.test.ts src/domain/capture/localCapture.test.ts src/data/db/checkpoint11Integration.test.ts src/domain/auth/authState.test.ts src/domain/auth/authRefresh.test.ts src/data/bootstrap/bootstrapApplication.test.ts src/ui/foundation.test.ts src/ui/controls.test.ts src/ui/coverage.test.ts
node_modules/.bin/prettier --check 'app/(tabs)/capture.tsx' src/features/capture src/native/capturePicker.ts src/data/auth/accountGeneration.ts src/ui/catalogs.ts scripts/ui/guard.ts docs/CURRENT_IMPLEMENTATION_STATE.md docs/architecture/OTR_CAPTURE_C1_IMPLEMENTATION_REPORT.md docs/architecture/OTR_CAPTURE_C1_IMPLEMENTATION_REVIEW.md docs/architecture/OTR_CAPTURE_C2_DURABLE_INTAKE_PREFLIGHT.md
git diff --check
```

- **Typecheck / scoped lint / changed-file formatting / whitespace PASS.**
- **UI guard PASS:** 473 unchanged legacy occurrences; 78 representative UI files checked without baseline forgiveness. Existing foundation tests verify catalog parity/parameters, both palettes and terminology; no baseline regeneration.
- **Final scoped regression: 16 files /175 tests PASS**, including **3 C1 files /13 tests**. Coverage: empty/one/multiple, Files→Photos→Files order, remove-one/all, both native cancellations, repeat invocation, error/retry, missing URI, stale Account/context callback, unmount/cancel, effect replay, Trip-prior rerender, held Account gate release, blurred session read, localized counts/long names/error, accessible disabled final action and negative repository/byte-reader/scheduler dependency checks. No global full-suite PASS claim; the prior handoff's full-suite baseline remains historical.
- Initial default Vitest config loader hit sandbox EPERM writing `.vite-temp` through the dependency symlink. Builder then ran default loader with approved cache access (11 files /160 tests PASS); final and independent runs used `--configLoader runner`, avoiding that initial config-bundle cache write. This was an environment startup error, not a collected failing test.
- Manual diff review and explicit unchanged schema/package/accepted-document checks PASS. HEAD and index remain unchanged.

## Initial optional build/device checks (historical)

`expo export --platform ios --output-dir /private/tmp/otr-c1-ios-export` **PASS**: Metro bundled 1,663 modules and emitted one iOS Hermes bundle. The bundle was checked for the new truthful C1 staging/error copy. Export is JavaScript/asset bundling, **not native Xcode build or device QA**.

Initial sandboxed `simctl` could not contact CoreSimulator/logs. Approved read-only retry succeeded: installed iOS26.5/27.0 runtimes, booted iPhone18 Pro simulator. No `ios/` native project exists in this worktree. Native generation/build/install and actual Files/Photos picker round trips were not performed; no simulator/device PASS is claimed. No unrelated Xcode infrastructure was changed. A temporary symlink to existing installed project dependencies supported checks and was removed before handoff; package/lock/dependency contents are unchanged.

## Owner iPhone device acceptance — PASS

The signed Release (`OTRMobile` scheme, `Release-iphoneos`, arm64, development
signing with existing Team `U9D5C58Z94`) was overwrite-installed on the owner
iPhone 16 Pro / iOS 27.0.1 without uninstalling. Existing application data was
preserved; startup and Capture reachability succeeded after the owner trusted the
developer. No reviewed code or tracked configuration changed during build/install.
Automatic signing required command-line provisioning overrides only.

On 2026-10-08 the owner explicitly reported **C1 FINAL OWNER REVIEW PASS**:

- Files can be added to the staging tray and removed.
- Photos can be added to the same staging tray and removed.
- Cancel works correctly.
- The flow cannot proceed to durable submission, as required by C1.

These are owner-reported interactions, not agent-performed native acceptance.
No broader VoiceOver, large-text, permission, offline, lifecycle or visual acceptance
is inferred. C1 is accepted; the complete checkpoint is authorized for local commit
only. C2 remains unstarted and push is not authorized.

## Independent review and boundaries

A separate reviewer found 0 CRITICAL, 3 IMPORTANT and 0 MINOR initially: permanent store disposal on StrictMode replay, Account-transition read timing, mutable Trip prior. All three were fixed with focused regressions. The same reviewer performed targeted final code/tests recheck and independently ran **13 tests PASS** plus whitespace. Final verdict: **0 remaining CRITICAL / IMPORTANT / MINOR**. This is independent engineering review, not owner approval or actual React renderer/native verification.

Camera is deliberately deferred: existing native permission descriptions describe receipt-only use; broad Capture camera needs a separately accepted permission/copy checkpoint. Photos system selection avoids requesting that broad receipt-specific library permission. Magic Input/voice/clipboard and Email/ChatGPT connection setup are outside C1 and not advertised.

C2 preflight identifies missing stable submission/item replay identity, historical context and atomic CP11 Capture→manifest linkage, plus URI lifetime/readability probes. SQLite48 original storage and SQLite50 continuation pins do not supply the required user-batch manifest. C0 decisions remain external dependencies for C2. No migration number or production persistence DTO is proposed here.

**C2 NOT IMPLEMENTED.** No schema/migration, durable submit call, runtime/provider gate activation, Guest, Job/progress, CP11 Inbox row, Source/Representation, Import continuation/queue, canonical Trip/Event/Expense, final Experience shell or Photo/Documents storage was added. No Hosted Dev/Production, credentials, model/provider service or legacy Web checkout was accessed. Before owner acceptance, no Git staging, commit or push. Owner acceptance now authorizes staging and one local C1 commit only; no push.

## Reviewed pre-commit Git status

The reviewed pre-commit `git status --short` follows (all changes unstaged). HEAD remained at the base until the authorized checkpoint commit.

```text
 M app/(tabs)/capture.tsx
 M docs/CURRENT_IMPLEMENTATION_STATE.md
 M scripts/ui/guard.ts
 M src/data/auth/accountGeneration.ts
 M src/ui/catalogs.ts
?? docs/architecture/OTR_CAPTURE_C1_IMPLEMENTATION_REPORT.md
?? docs/architecture/OTR_CAPTURE_C1_IMPLEMENTATION_REVIEW.md
?? docs/architecture/OTR_CAPTURE_C2_DURABLE_INTAKE_PREFLIGHT.md
?? src/features/capture/
?? src/native/capturePicker.ts
```

STOP AFTER THE AUTHORIZED C1 COMMIT. C2 NOT STARTED.
