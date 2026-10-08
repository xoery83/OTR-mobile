# Capture C3 signed Release and Owner device gate

Date: 2026-10-08 (Pacific/Auckland).

## Result and exact source

Engineering review remains PASS. Signed C3 Release was built, installed by
non-destructive overwrite, and launched on the Owner's physical iPhone 16 Pro.
Device Hub confirmed startup, Capture and Activity entry reachability.
**Owner visual/device acceptance remains pending.**

All work ran in `/private/tmp/otr-capture-c3-builder`, branch
`codex/capture-c3-builder`. Starting and retained HEAD:
`914e854cba7c2c97cfec7243047a06cadcc82c05`.
Before preparation and after build/navigation, all 14 reviewed deliverable file
hashes and the tracked binary diff matched the reviewed source. Reviewed diff
SHA-256: `051b00dad3521a6f9bb4dfefcf86258ec3c0970b37f53983390e1694c3ca6471`.
The source proof includes the five untracked reviewed files. After this check,
only this report and the current-state handoff were added/updated for this gate.
No C3 product code correction was needed.

## Exact build and device configuration

| Item                   | Value                                                               |
| ---------------------- | ------------------------------------------------------------------- |
| Device                 | Leon's iPhone16pro; iPhone 16 Pro / iPhone17,1                      |
| UDID                   | `00008140-001C2980269B001C`                                         |
| OS                     | iOS27.0.1 / 24A446                                                  |
| Xcode / SDK            | Xcode27.0 / 27A266a; iPhoneOS27.0                                   |
| Target                 | `OTRMobile.xcworkspace`, scheme `OTRMobile`, Release, arm64         |
| Bundle / version       | `com.xoery.otrmobile`; 0.1.0 (1)                                    |
| Team                   | `U9D5C58Z94`                                                        |
| Signing                | Automatic; Apple Development; same identity as accepted C2          |
| Certificate identifier | `9WQ4KNW3JN`                                                        |
| Profile                | iOS Team Provisioning Profile: com.xoery.otrmobile                  |
| Profile UUID           | `49ad3325-5b8a-4902-9373-79373727a4d2`                              |
| API configuration      | Existing Dev transport; `http://127.0.0.1:9`; no Hosted credentials |

The existing [iOS device runbook](../IOS_DEVICE_RUNBOOK.md) was followed:
embedded-bundle Release, preserved Expo Scene/native configuration, same bundle
identity, paired physical device and no uninstall. Preparation used unchanged
Expo configuration, APFS copies of existing installed dependencies/Pods into this
worktree, then `pod install --project-directory=ios --no-repo-update`.
The initial sandboxed pod install could not fetch its official dependency;
retry with approved native/network access succeeded. No package/lockfile change.

Build command:

```sh
CI=1 EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 EXPO_PUBLIC_OTR_SYNC_TRANSPORT=dev EXPO_PUBLIC_OTR_API_BASE_URL=http://127.0.0.1:9 xcodebuild -workspace ios/OTRMobile.xcworkspace -scheme OTRMobile   -configuration Release -destination id=00008140-001C2980269B001C   -derivedDataPath ios/build-c3 -allowProvisioningUpdates   DEVELOPMENT_TEAM=U9D5C58Z94 CODE_SIGN_STYLE=Automatic   CODE_SIGN_IDENTITY='Apple Development' PROVISIONING_PROFILE_SPECIFIER='' build
```

`BUILD SUCCEEDED`; `codesign --verify --deep --strict` passed with access to
macOS trust services. C3 and C2 application/team/get-task-allow entitlements
match exactly, and the provisioning profile includes this UDID.
App artifact: `ios/build-c3/Build/Products/Release-iphoneos/OTRMobile.app`.
Embedded Hermes bundle SHA-256:
`52b2ce98c6a2a6d585d4ea880f51bac325f92a05b9a14e0e6831cea545f1f31d`.
C3 Activity key/component and exact reopen wrapper are present in the bundle.

## Read-only snapshot and preservation

Before installation, the C2 process received orderly SIGTERM; CoreDevice copied
Documents and Library read-only to ignored local `ios/device-gate/before/`.
The snapshot contains 292 files. The stopped database has no WAL/journal;
SQLite schema version51, integrity `ok`, zero foreign-key violations.
The snapshot and proof files remain local and contain private Owner data.

Installation used `devicectl device install app` over the existing bundle ID.
No uninstall, reset, data clearing, migration or Keychain operation occurred.
The installed app path is
`/private/var/containers/Bundle/Application/393816C9-3F73-46DE-94D9-7C9188B65421/OTRMobile.app/`.

Before first launch, a second stopped-container copy proved all 87 table schemas,
row counts and typed-row SHA-256 hashes exact, and the database file unchanged.
288 prior files were byte-identical. iOS replaced four SplashBoard snapshot
cache files; no prior Documents/user-data file was missing or changed.

After startup/Capture/Activity navigation, orderly SIGTERM and a third read-only
copy proved 86/87 tables exact. Only `data_health_state` changed, restricted to
`last_cheap_scan_at`, `run_generation`, `updated_at` in the existing row.
All table schemas remained exact; SQLite51, integrity `ok`, zero FK violations.
Outside SQLite, only iOS dyld cache and KnownSceneSessions state changed.
The same four replacement SplashBoard files were the only new files.
All prior Documents user-file bytes remained exact.

| Preserved capture data       | Before / installed / launched          |
| ---------------------------- | -------------------------------------- |
| `capture_submission_batches` | 7 / 7 / 7; exact rows                  |
| `capture_submission_inputs`  | 11 / 11 / 11; exact rows, all ACCEPTED |
| `local_capture_inbox`        | 11 / 11 / 11; exact rows               |
| `local_capture_payloads`     | 7 / 7 / 7; exact rows                  |

Keychain continuity is supported by the identical application/team/signing
identity and successful Account-scoped Activity loading without login. Keychain
contents were not exported or independently compared byte-for-byte.

## Installed navigation and checks

Using Device Hub's physical iPhone window (not a Simulator):

1. Launched the installed OTR Mobile icon; Today/local shell rendered.
2. Selected the Capture tab (Chinese `记录`); fresh staging showed zero selections
   and the `活动 · 最近提交` button.
3. Opened Activity; retained C2 submissions rendered with real saved counts and
   processing/uninstalled wording.
4. Stopped for preservation verification, then relaunched and left Activity
   reachable for the Owner.

No file/photo selection, test submission, Job open/recovery/continuation or
existing Job mutation was performed. These are navigation observations, not
Owner visual, accessibility or behavioral acceptance.

Gate tests: 7 affected files /80 PASS, including database, Capture repository,
operations, lifecycle, Activity lifecycle and native URI reader.
Existing reviewed typecheck/lint/UI guard/format/backend/export checks remain
recorded in the implementation report. The prior full-suite baseline scanner
failure is unchanged; no global full-suite PASS is claimed.

Local ignored evidence: `ios/device-gate/release-build.log`, `build-identity.json`,
`reviewed-source.json`, CoreDevice JSON/log receipts, `preservation-before.json`,
`preservation-installed.json`, `preservation-launched.json`, `affected-tests.log`,
and the read-only snapshot directories. Generated native files/dependencies
remain ignored. No runtime/provider gate, Platform R3, C4/C5 or migration changed.

## Remaining Owner items

Owner must accept the Activity layout/copy, VoiceOver and large text; retained
Job reopening, hide/navigation/restart and offline discovery; Account fencing;
and any failed/pending native Files/Photos recovery using Owner-selected inputs.
No processing/Review/canonical-admission scope is enabled. Owner should confirm
existing C2 data and local session remain available in their normal use.

## Final Git state

Retained branch/HEAD as above. Nine tracked files modified and six untracked
files (the reviewed C3 additions plus this gate report); index empty. No commit,
push, merge or rebase. Only device-gate documentation differs from the exact
reviewed C3 deliverable; product source hashes remain unchanged.

STOP — WAIT FOR C3 OWNER DEVICE ACCEPTANCE.

## Subsequent simulator-only UX recheck — physical hold

On 2026-10-08 the Owner authorized a separate autonomous synthetic Simulator/UX
cycle and imposed an absolute phone hold for R3-D1b. That cycle refined C3 UI and
added synthetic tests without any phone operation or previous device-snapshot
access. The earlier signed install/data preservation/navigation receipts above
remain historical evidence; the refined UI is **not installed on the owner
phone**, and neither Owner visual nor device acceptance is claimed. Current
worktree status and limits are in `OTR_CAPTURE_C3_SIMULATOR_QA_UX_REPORT.md`.
Next: **STOP — C3 SIMULATOR + UX OWNER REVIEW REQUIRED.**
