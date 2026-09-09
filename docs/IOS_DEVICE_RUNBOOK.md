# iOS Physical Device Runbook

## Purpose

Run the OTR Mobile Expo development build on a paired physical iPhone. A Simulator runtime is useful for simulator testing, but it is not required for physical-device development.

## Verified Setup

- Full Xcode is selected at `/Applications/Xcode.app/Contents/Developer`.
- Xcode first-launch tasks have completed.
- The target uses automatic signing with the `com.xoery.otrmobile` bundle identifier and Apple team `U9D5C58Z94`.
- The physical iPhone is paired, unlocked, connected, and has Developer Mode enabled.
- CocoaPods is available.
- Xcode's required iOS Platform Support component is installed. If Xcode marks a physical device ineligible with `iOS <version> is not installed`, install the Platform Support entry from Xcode > Settings > Components before troubleshooting Expo.

## Run On A Physical iPhone

From the canonical project root:

```text
npx expo run:ios --device
```

For multiple connected devices, select the intended device when Expo prompts. The command performs the native dependency install when needed, builds the development client, installs it, and starts or connects to Metro.

The Debug build expects Metro after a cold start. For a physical offline cold-start validation, install a Release build with an embedded JavaScript bundle:

```text
npx expo run:ios --configuration Release --device
```

Installing Debug or Release over the same bundle identifier preserves the app container and SQLite database. Do not uninstall the app between persistence checks.

## Metro And Network Notes

- Keep the iPhone connected by USB for the most reliable first deployment and Metro connection.
- The current iPhone tethering setup supports the local development connection, including the OTR React Native shell.
- macOS classifies tethering as expensive and constrained. Do not rely on it for large Xcode Component downloads.
- If Metro cannot connect after a network change, restart Metro once and reconnect the device; do not delete Xcode, Expo, or CoreSimulator caches as a first response.
- A Debug build that is force-closed and reopened without Metro can report `No script URL provided`. This is expected for the development client and does not prove that offline data failed. Use the embedded-bundle Release workflow above for that scenario.

## Regeneration-Safe Native Setting

`ENABLE_USER_SCRIPT_SANDBOXING=NO` is required by the current iOS build. It is declared through `plugins/withUserScriptSandboxing.js` in `app.json`, so `npx expo prebuild` reapplies it to every Xcode build configuration. Do not rely only on a manual edit to `ios/OTRMobile.xcodeproj/project.pbxproj`.

The Apple team id is also declared in `app.json` so regenerating the ignored native project does not depend on reselecting the signing team by hand.

## Expected Foundation Behavior

- App launch renders the local shell without requiring an online auth check.
- SQLite migration initialization runs on launch.
- SecureStore supplies any local auth session; an existing session maps to `AUTHENTICATED_OFFLINE` until background refresh succeeds.
- Pending sync operations remain durable across app restart and are rehydrated by the sync repository.

## Foundation Diagnostics

Development builds expose `otrmobile://foundation`. Open that URL from Safari on the device. The diagnostics screen reports SQLite initialization, schema version, local auth state, network reachability, total pending sync count, and pending Itinerary create count. It is not included as a product feature or production workflow.

## Repeatable Checks

```text
npm run typecheck
npm run lint
npm run format
npm run test
npx expo-doctor
xcodebuild -showdestinations -project ios/OTRMobile.xcodeproj -scheme OTRMobile
xcrun devicectl list devices
```

The last two commands should list the physical iPhone as an available and connected destination.
