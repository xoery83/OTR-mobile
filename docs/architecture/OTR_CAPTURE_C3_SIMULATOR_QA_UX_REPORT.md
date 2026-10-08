# Capture C3 — Autonomous Simulator QA and UX Refinement

Date: 2026-10-08 (Pacific/Auckland). Worktree-only evidence; Owner accepted
Functional Simulator PASS / Physical Device Deferred.

**C3 FUNCTIONAL SIMULATOR PASS — UX REFINED / PHYSICAL DEVICE DEFERRED**

## Scope and retained starting state

The Owner explicitly authorized synthetic autonomous testing, C3 UI refinement,
screenshot iteration, scoped repairs and independent review. The supplied QA
plan guided execution; the latest request imposed an absolute physical-device
hold. All repository work stayed in `/private/tmp/otr-capture-c3-builder`, branch
`codex/capture-c3-builder`, retained HEAD
`914e854cba7c2c97cfec7243047a06cadcc82c05`. Starting dirty C3 work was preserved.
No canonical merge/rebase/cherry-pick, stage, commit or push occurred.

`ios/c3-simulator-qa/starting-source.json` records SHA-256 of all 15 starting
C3 deliverables and tracked diff hash
`5a45f0b59f4c7e6591bc053bd1d5faf4d04adf2d9cd398523d8ba1b662010820`.
This cycle changed only CaptureActivity, CaptureContent, its UI tests and Capture
catalog entries in product/test source, plus two synthetic test files and reports.
The existing route, operations, repository, generation/lifecycle implementation,
Core/Auth, shared shell, schema, dependencies and provider configuration were
retained. SQLite migrations 1–51 and Server migrations 1–84 were not changed.

No owner phone installation/container/Keychain/database/Documents/outbox,
previous owner snapshots, real credentials, Hosted DEV, new DEV enrollment,
Production or R3 was accessed in this cycle. DeviceHub inventory names were used
only to select dedicated simulators; the physical-device row was never selected
or operated. C4/C5, runtime/provider gates and canonical admission remain closed.

## Simulator and build

| Configuration     | Verified value                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Xcode / SDK       | Xcode 27.0 (27A266a), iOS Simulator SDK 27.0                                                            |
| Existing runtime  | `com.apple.CoreSimulator.SimRuntime.iOS-27-0`                                                           |
| Primary simulator | OTR Capture C3 Synthetic QA, iPhone 16 Pro, `3AD65569-288B-4B4C-BC57-68CE38E83C87`, 402×874 pt          |
| Small simulator   | OTR Capture C3 Small QA, iPhone SE (3rd generation), `E139C98D-A898-4F1C-8AAF-5DACBB478283`, 375×667 pt |
| App               | `com.xoery.otrmobile`, 0.1.0 (1), arm64 Release                                                         |
| Signing           | Xcode Simulator ad-hoc `CODE_SIGN_IDENTITY=-`; no owner development certificate change                  |
| API / transport   | `http://127.0.0.1:9` / existing `dev` selector; no reachable backend or hosted credentials              |
| Tools             | Explicit-UDID simctl plus DeviceHub native UI through CUA                                               |

No runtime download or shared Xcode configuration change. The existing workspace
and OTRMobile scheme built with `-configuration Release -sdk iphonesimulator
-destination generic/platform=iOS Simulator -derivedDataPath ios/build-c3-simulator
CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-`. Build and final offline JS export
succeeded. An initial unsigned QA app produced SecureStore `-34018`; normal Xcode
Simulator signing resolved it. This was a generated-artifact setup correction,
not a product/Core/Auth fix.

Ignored local `ios/c3-simulator-qa/entry.ts` registers a QA bootstrap, seeds via
actual repositories/SecureStore, then renders the real Expo Router app. Product
entry, routes and dependencies contain no test bootstrap or success shortcut.
Exports used `CI=1 EXPO_NO_DOTENV=1 EXPO_OFFLINE=1` and the loopback environment.
The final QA JS bundle was copied into the generated Release app and ad-hoc
signed with Xcode's generated Simulator entitlement file. It was installed only
using the two explicit simulator IDs above. This is a synthetic QA artifact,
not a phone release or canonical production readiness claim.

## Synthetic fixtures and data preservation

Synthetic Account IDs end in `0001` (A), `0002` (B), `0003` (Empty), under
`c3000000-0000-4000-8000-*`. Sessions have null access/refresh tokens and no email.
The native seed contains six A Jobs: all accepted, mixed, all failed, all pending,
12 accepted inputs, and a mixed Job with explicit prior lineage and a long
Chinese/English filename. B has one distinct Job; Empty has none. Initial native
DB contains seven Jobs /30 Inputs (20 ACCEPTED, five FAILED, five PENDING).
Bytes for seeded acceptance are deterministic synthetic arrays, not real papers.

The automated disk fixture separately contains **45 A Jobs +1 B Job**, stable
20/20/5 pagination with tied timestamps, and a **50-input long-filename Job**.
Existing C2 fixtures cover exact/mismatched pinned sources and recovery.

Read-only SQLite backups: `synthetic-before.sqlite`,
`synthetic-after-navigation.sqlite`, `synthetic-final.sqlite` in the ignored QA
directory. All 86 application tables were compared (SQLite's internal sequence
table excluded). Overwrite, list, reopen, locale/theme changes and native
A→B→Empty→A preserved 85 tables exactly; only existing `data_health_state` gained
synthetic per-account health observations. All seven Jobs /30 Inputs and originals
were exact. Container UUID changed during overwrite, but the data stayed intact.

A subsequent intentional **synthetic native photo recovery** accepted Simulator
stock `IMG_0111.heic`, 2,808,983 bytes, into new Job
`d7ee47a5-c76f-4389-8ade-c14826436a4f`, input
`e5548067-47aa-4f69-b0c9-4085cad8dc10`, explicit prior
`c3000000-0000-4000-8000-000000000084`. The old failed Input stayed failed and
unchanged; every previous Job/Input/payload/inbox row remained exact. Only this
new Job/Input/original and normal health observations were added. Final DB:
A seven Jobs, B one, 31 Inputs, integrity check `ok`. Kill/relaunch and both
lineage directions retained these facts without a duplicate. JSON receipts:
`navigation-preservation.json`, `native-photo-recovery.json`,
`final-preservation.json`.

QA bootstrap selects A on each launch. Native cold launch proves durable Jobs
and lineage, **not retention of the last active B/Empty account**. No network
availability toggle/reconnection claim is made; intake/read worked with an
unreachable loopback API and null-token synthetic sessions.

## Executed matrix

| Case                                                                      | Automated evidence                                               | Native Simulator evidence                                                                                                                                               |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepted/mixed/all-failed/pending, truthful counts                        | PASS repository/UI tests                                         | PASS six A seed Jobs, separate B/Empty                                                                                                                                  |
| Files-only, Photos-only, Files→Photos→Files; remove/cancel/Add/double tap | PASS existing staging/intake adapters and UI callbacks           | Photo picker open/cancel and real photo recovery PASS; Files picker open/cancel PASS; native Files acceptance NOT RUN, isolated provider has no documents/cloud account |
| Ordered list, pagination, many Jobs/files                                 | PASS 45 A +1 B, 20/20/5, 50-input replay                         | PASS list order and 12-input Job; 45-Job UI pagination covered by automated adapters                                                                                    |
| Exact reopen, Hide, fresh re-entry, tabs, cold process                    | PASS handlers/lifecycle/stale callback tests                     | PASS exact detail/links, Hide→Today→fresh Capture, kill/relaunch                                                                                                        |
| Unpinned continuation/new Job, reverse lineage                            | PASS repository restart/recovery tests                           | PASS stock-photo recovery; old failure retained, reverse link after relaunch                                                                                            |
| Pinned exact match/mismatch and retry/resume                              | PASS C2 regression fixtures                                      | Native pinned selection NOT RUN; synthetic seeded failure is unpinned                                                                                                   |
| A→B→A isolation, stale callbacks                                          | PASS real coordinator/session and generation fixtures            | PASS A→B→Empty→A: B only one Job, Empty zero, A all six original Jobs                                                                                                   |
| Zero writes on list/reopen, SQLite51 restart                              | PASS all-table disk snapshots                                    | PASS read-only backups, existing rows preserved                                                                                                                         |
| Offline local intake/replay/no duplicate                                  | PASS network-deny tests; accepted replay never reads expired URI | PASS real photo accepted with unreachable API; reconnect simulation NOT RUN                                                                                             |
| Passive Trip prior/Account-global Activity                                | PASS existing context/lifecycle tests                            | No Ledger Trip edited; no current Trip attributed to historical Jobs                                                                                                    |
| en/zh-Hans, dark, large text, long names, small screen                    | PASS localized render and canonical target tests                 | PASS screenshots/AX/touch-scroll, with shared max-font header exception below                                                                                           |
| Real VoiceOver audio, owner visuals/device                                | NOT RUN                                                          | NOT RUN — physical hold / Owner Review                                                                                                                                  |

All automated execution used the existing network-deny preload; no remote call
was used to establish success. Platform tests remain unchanged. Native adapter
limitations are not represented as native end-to-end PASS.

## UI repairs and visual iteration

Human, localized fact-derived titles replace primary UUIDs. Cards show time and
one View action; partial counts remain truthful. Repeated raw engineering states
and per-file lineage essays were removed. The locally-saved/Trip distinction
remains in plain language. UUID is selectable only under Technical details, with
lineage explanation only when an actual relation exists. Filename/status/action
rows are separated with canonical tokens; long names and buttons wrap. Locked
historic detail no longer shows disabled Files/Photos controls or Add 0. Staging
retains its actual picker and Add behavior. Exact UUID navigation and repositories
were not changed.

Baseline inspection identified tall technical cards. Pass 1 reduced clutter and
exposed a photo recovery mislabeled as file selection; pass 2 corrected the label
by acquisition source and separated rows. Independent review also caught the
Activity footer overstating Add capability and an unconditional lineage hint;
both were repaired/retested. Final report audit found one IMPORTANT: the new
disk matrix test was initially placed under features while importing database
infrastructure. It was moved unchanged into `src/data/repositories/`; the guard
was not weakened. Its isolated and independent rechecks passed the matrix and
now expose only the original captureStaging scanner baseline. No unresolved C3
finding remains.

Screenshot root (all actual local PNGs):
`/private/tmp/otr-capture-c3-builder/ios/c3-simulator-qa/screenshots/`.

| Review                            | Files                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Before                            | `before-activity-en.png`, `before-job-recovery-en.png`, `before-job-zh.png`, `before-job-dark-large-zh.png`, `before-empty-en.png` |
| First refinement                  | `pass1-activity-zh.png`, `pass1-job-recovery-zh.png`                                                                               |
| Final list/detail                 | `final-activity-en.png`, `final-activity-zh.png`, `final-job-recovery-en.png`, `final-job-recovery-zh.png`                         |
| Empty / B                         | `final-empty-en.png`, `final-empty-zh.png`, `final-activity-account-b-zh.png`                                                      |
| Dark / maximum type               | `final-job-dark-zh.png`, `final-job-dark-maxtext-zh.png`, `final-recovery-dark-maxtext-zh.png`                                     |
| Small screen / touch-scroll       | `final-small-activity-en.png`, `final-small-job-en.png`, `final-small-actions-en.png`                                              |
| Real native recovery / limitation | `final-native-photo-recovery-en.png`, `native-files-picker-empty.png`                                                              |

The before-empty image was captured from the frozen pre-refinement bundle on
the SE simulator and the final QA build restored afterward. The final empty
images use the 16 Pro; this is a content/layout review, not a pixel-matched
viewport comparison.

At maximum accessibility text size, Capture rows/actions expand and scroll,
without horizontal/fixed-row text truncation. The **unchanged shared navigation
header clips its title**, independently classified external MINOR. Global Dynamic
Type PASS is not claimed; Experience/UI Foundation owns that correction. No shell
redesign or font scaling cap was added.

## Verification and independent review

- Final affected selection: **19 files /199 PASS**.
- Functional matrix agent: **12 files /103 PASS**; new disk matrix two tests.
- Account attribution: current six files /33 PASS, new three tests PASS; exact C2
  archive with the same synthetic recheck four files /21 PASS.
- Independent final recheck: **seven files /67 PASS**, typecheck/UI guard PASS;
  source and before/pass1/final/English/Chinese/dark/large/SE screenshots reviewed.
- Final typecheck and lint (including UI guard) PASS. Changed-file formatting and
  diff whitespace checks PASS.
- Initial full suite: 216 files /2,754 tests, 2,738 PASS /one FAIL /15 SKIP.
  That failure was the new disk fixture's incorrect feature-layer location, not
  the old baseline. Reporting it as the old failure was corrected after review.
- After relocating the test, final full suite: **216 files /2,754 tests:
  2,737 PASS, two FAIL, 15 SKIP**. One is the unchanged, exact-C2-reproduced
  architectureBoundary scanner matching `expo-sqlite` in captureStaging.test.ts.
  The other is unchanged API client test's whole-JSON `not.toContain("42")`
  assertion: the log timestamp was `2026-10-08T07:42:36.284Z`, whose minute is 42.
  Independent and builder narrow API rechecks **seven PASS each** outside that
  minute. The API
  source and test match C2; no Core change is made. Global full-suite PASS is
  not claimed. Core owns this clock-sensitive test assertion.
- Independent layer recheck: relocated matrix two PASS plus architecture guard
  three PASS /one known baseline FAIL. Final independent focused seven files /
  67 PASS uses the corrected repository test path.

Final logs: `ios/c3-simulator-qa/full-tests-corrected.log`,
`final-affected-tests-corrected.log`, `final-typecheck-corrected.log`,
`final-lint-corrected.log`, `corrected-architecture.log`. Original
`full-tests.log` preserves the initial new-test-location failure. Independent
`independent-layer-recheck.log` and `independent-client-recheck.log` record the
separate rechecks. Functional matrix `ios/device-gate/c3-functional-matrix.log`
(filename is historical; this cycle executed no device command there), synthetic
C2/Auth evidence `ios/simulator-qa/account-recheck/`.

The independent report records one fixed IMPORTANT, two fixed MINORs, zero
remaining in-scope issues,
and one external shared-header MINOR. Account attribution report traces the
existing generic error boundary: multiple C2/Core/Auth/session/restart failures
can yield the same sentence. Nine relevant Core/Auth files match C2 byte-for-byte.
No physical switch root cause or fix is established by simulator success.

## Changed files, remaining handoff and Git

Additional product changes this cycle:
`src/features/capture/CaptureActivity.tsx`, `CaptureContent.tsx`,
`CaptureContent.test.ts`, `src/ui/catalogs.ts`. Added tests:
`src/data/repositories/captureAutonomousQa.test.ts` and
`src/features/capture/captureAccountSwitchRecheck.test.ts`.
Reports: this report, Account switch recheck, targeted independent/device report
additions, and Current Implementation State. Existing C3 route/repository changes
remain part of the preserved uncommitted C3 diff.

Final Git: retained accepted C2 HEAD and branch; **nine tracked modified files,
ten untracked C3 deliverables**, empty index. All build/fixture/screenshot evidence
is ignored beneath `ios/`; no migrations/config/dependency/Core/Auth/R3 change.
Owner phone still has the earlier historical C3 build, **not these UI refinements**.

Remaining Owner Review: assess refined simulator visuals and simple actions;
confirm Experience's eventual Activity shell/Trip Home/recent-window semantics.
Physical acceptance, real cloud/file-provider acquisition, real VoiceOver speech,
owner account-switch diagnostics and R3-D1b remain deferred to their owners and a
separately authorized device cycle. No Owner visual/device PASS is claimed.

**STOP — C3 SIMULATOR + UX OWNER REVIEW REQUIRED.**

## Owner acceptance and local checkpoint — 2026-10-08

The Owner accepts **Functional Simulator PASS / Physical Device Deferred**:
Account-scoped C2 Job discovery/exact reopen, pagination and restart persistence,
explicit recovery lineage/truthful intake, scoped localized UI refinement,
autonomous 16 Pro/SE Simulator verification, and independent review with zero
remaining in-scope findings. One local checkpoint is authorized on
`codex/capture-c3-builder`, accepted C2 base
`914e854cba7c2c97cfec7243047a06cadcc82c05`.

Acceptance excludes latest-UI physical-device acceptance, final Experience
Activity/Trip Home integration, the historical physical Account Switch error,
shared maximum Dynamic Type header clipping, integrated C4, AI processing,
Review and runtime activation. The measured full suite remains **2,737 PASS /
two FAIL /15 SKIP**; no global PASS. All SQLite1–51/Server migrations remain
unchanged. Earlier pending-review and uncommitted-status entries above describe
the pre-acceptance handoffs; this section records the later Owner decision.

**STOP AFTER COMMIT. No push, merge, rebase or cherry-pick. C4/runtime gates
remain unauthorized.**
