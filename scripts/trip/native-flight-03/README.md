# CLOSED installed Native Flight check

This headless assertion entry uses the actual Expo PDFKit bridge, C2 streaming custody and private preparation repositories. It is not a Day Feed Lab or product boot entry. Use only a fresh task-owned simulator and the established isolated DEV Test bundle ID. It writes only synthetic local data.

1. Use installed pinned dependencies; Expo prebuild iOS with `--no-install`. Select the approved isolated bundle ID only in temporary local config.
2. Run normal `pod install --no-repo-update`. If reusing the existing Hermes archive, use `RCT_HERMES_V1_ENABLED=1` and `HERMES_ENGINE_TARBALL_PATH` for the pinned 250829098.0.17 debug archive. Verify pod versions against accepted G2; stop on version drift.
3. Build the generated OTRMobile workspace for arm64 iOS Simulator with signing disabled. For this offline test only, generated DEBUG AppDelegate can load the embedded `main.jsbundle` like its existing Release path. Do not commit that generated change.
4. Export an embedded iOS bundle with `expo export:embed --platform ios --dev false --minify false --entry-file scripts/trip/native-flight-03/entry.ts --bundle-output <owned-output>/main.jsbundle`; copy into the owned built app. Install and launch the DEV Test ID on the fresh simulator.
5. Read `Documents/native-flight-03-result.json` and `native-flight-03-state.json` from that owned app container. FIRST_PASS must show one real native call, exact synthetic original hash, two Candidates and zero authoritative Sources/Items/commands/network attempts.
6. Terminate and relaunch without reinstall. COLD_RESTART_PASS must preserve all identities/original bytes with zero repeated native calls. Stop only the owned app/device; retain its data for review.
7. Extract the exact stored publication/plan/batch packet into a synthetic JSON file. Run `OTR_NATIVE03_PACKET=<file> python3 scripts/trip/core-v2-sql-acceptance.py --native-installed`. It must report two REVIEW / CONTRACT_UNSUPPORTED and zero ready commands. This disposable owning SQL seam is not Core DEV.

The closed network check rejects fetch in the embedded entry; it is not OS network isolation. Account/Trip assertions use synthetic request contexts, not Auth UI. System picker UI and physical-device calibration require their separate checks. PDF Source authority remains pending; never inject prospective Items as accepted read data.
