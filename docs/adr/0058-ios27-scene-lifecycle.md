# 0058 — iOS 27 scene lifecycle

Date: 2026-10-01
Status: Accepted — required device compatibility fix

The owner's iPhone 16 Pro on iOS 27.0.1 rejects the previous generated
AppDelegate/window lifecycle at launch. The physical crash report traps in
`UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`; rebuilding
unchanged source with Xcode 27 does not fix it.

Use Expo SDK 57's official patch (>=57.0.23) and
`expo-build-properties` (>=57.0.20) with `ios.enableSceneSupport: true`.
Regenerate iOS through prebuild and rebuild the signed Release. The small official
configuration dependency avoids maintaining a custom SceneDelegate and preserves
the generated-native-folder policy. Do not change business logic, cached auth,
SQLite, sync, Backend, or schema. Install over the same bundle identifier without
uninstalling the app.

Pin the already-used `expo-modules-core` as a direct dependency at the SDK's
matching patch version so SecureStore and other Expo modules retain top-level
resolution. The existing optional Worklets peer-range mismatch is unchanged;
no Worklets upgrade or custom runtime is introduced.

Validation: verify the generated scene manifest and lifecycle entry point,
typecheck, existing tests, signed Release build/signature, and physical startup.

Sources: [Expo SDK 57 Xcode 27 support](https://github.com/expo/expo/issues/46664)
and [Apple TN3187](https://developer.apple.com/documentation/technotes/tn3187-migrating-to-the-uikit-scene-based-life-cycle).
