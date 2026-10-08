# OTR Mobile Local Environment Audit

Date: 2026-09-09

## Accepted R3 Hosted DEV state — 2026-10-08

Owner accepted DEV `tuqigdxrvrerfewsxqgm` with `otr-r3-dev-v1` plus installed
forward `otr-r3-dev-v1-ledger-init-1`. Existing Backend
`https://api-dev.xoery.art` last verified healthy (development/ok).
36 bounded Hosted checks and final lineage/catalog/function, historical68,
Auth/Storage, Account isolation and CLOSED verification PASS. This section records
accepted execution evidence; documentation closure made no new Hosted request.

Last verified fixtures: two synthetic Accounts/Profiles/Trips, four members, two
Ledger settings/Expenses, one uploaded Receipt and one finalized settlement.
Auth users12/sessions595; original591 sessions preserved. Storage43 comprises
original42 unchanged objects plus one synthetic Receipt; bucket hashes preserved.
Provider calls0; OCR PENDING; Person/Event/Source/Import and provider gates CLOSED.
Historical Server1–84 source bytes remain; Hosted migration history honestly
retains68 records. No Server73 OPEN equivalence is claimed.

Device first-sync/re-enable remains gated. Old outboxes must remain quarantined;
no replay, wipe, reset, logout or Account rebinding is authorized. Production and
provider activation remain outside this acceptance. See
[execution report](architecture/OTR_R3_SAME_PROJECT_DEV_REBUILD_REPORT.md),
[forward provenance](../supabase/dev-forward/r3-v1/README.md) and
[DEV runbook](ops/DEV_BACKEND_RUNBOOK.md).

## Machine

- macOS: 26.6.2
- Kernel: Darwin 25.6.0
- Architecture: arm64 / Apple Silicon

## Project Root

- Canonical root: `/Users/xoery/Project/otr-mobile`
- Remote: `https://github.com/xoery83/OTR-mobile.git`
- The legacy OTR Web repository at `/Users/xoery/Project/otr` remains unchanged.

## Installed And Verified

- Node.js: v24.18.0 via nvm
- npm: 11.16.0
- Expo local CLI: 57.0.23 through `npx expo`
- EAS CLI: 23.2.0 through `npx eas-cli`
- Xcode: 26.6 (17F113), selected at `/Applications/Xcode.app/Contents/Developer`
- CocoaPods: 1.17.0 at `/opt/homebrew/bin/pod`
- iOS SDK: iPhoneOS 26.5
- iOS Simulator runtime: iOS 26.5 is installed
- Signing: one valid Apple Development identity; Xcode-managed profile for `com.xoery.otrmobile`

## Physical Device Validation

- Device: Leon's iPhone16pro, iPhone 16 Pro (iPhone17,1), iOS 26.6
- Connection: paired, wired, connected
- Developer Mode: enabled
- Developer Disk Image services: available
- `xcodebuild -showdestinations` lists the physical iPhone as an available iOS destination.
- The OTR Mobile development build launched on the physical device and rendered the React Native shell.
- Metro reached the device over the current wired/tethered development setup.

Cellular tethering is usable for local Metro traffic but is reported by macOS as expensive and constrained. Xcode component downloads may pause or fail on that network. Use an unrestricted connection for future Xcode platform or simulator downloads.

## Foundation Runtime Validation

- Root startup calls the SQLite bootstrap before any cloud work.
- SQLite opens `otr-mobile.db` and applies explicit migrations through `schema_migrations`.
- Local sessions are read from SecureStore and enter `AUTHENTICATED_OFFLINE` without network re-authentication.
- Sync operations are stored in SQLite and rehydrated through `src/data/sync/syncOperationRepository.ts`.
- The API client validates typed responses, injects auth, and normalizes HTTP, network, timeout, and validation failures.
- Development-only diagnostics report DB state, schema version, auth state, network reachability, and pending sync count.
- UI has no direct SQLite, API, or Supabase access. Repositories and the sync layer own those boundaries.
- `ENABLE_USER_SCRIPT_SANDBOXING=NO` is present in the current generated Xcode project and is enforced for future prebuilds by `plugins/withUserScriptSandboxing.js`.

## Validation Commands

All passed on 2026-09-09:

```text
npm run typecheck
npm run lint
npm run format
npm run test
npx expo-doctor
npx expo config --type prebuild --json
```

See `docs/IOS_DEVICE_RUNBOOK.md` for the repeatable physical-device workflow.

## Native Folder Policy

The generated `ios/` and `android/` directories remain ignored. Native settings required by this project must be represented in Expo config or config plugins so prebuild regeneration is safe. Do not commit generated native output until the project deliberately adopts a committed-native-folder policy.
