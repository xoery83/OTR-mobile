# OTRLocalDictation — bounded on-device iOS dictation

Local Expo module, iOS 16.4+. No audio file, transcript log, network client, backend,
account data, language asset installation API, or remote-recognition fallback.
The host must include `NSSpeechRecognitionUsageDescription` and
`NSMicrophoneUsageDescription`; this module does not edit host configuration.
A rebuilt host is required. An existing app without this native module remains
unavailable and must keep ordinary typed input working.

## Bridge

Subscribe before starting. Calls return `Promise<void>`:

- `start(sessionId: string, locale: string)` — fresh opaque printable-ASCII session token (1–80 bytes, no whitespace/control); bounded locale
  identifier, e.g. `en-NZ`/`zh-Hans-CN`. Checks recognizer availability and
  `supportsOnDeviceRecognition` before requesting permissions. Requests speech and
  microphone permission only here, then rechecks session ownership and active app.
- `stop(sessionId)` — stops microphone input immediately, ends the audio request,
  enters `finishing`, and allows up to 3 seconds for the recognizer's final result.
- `cancel(sessionId)` — immediate resource release and `stopped`.

Events:

```ts
transcript: { sessionId: string; text: string; isFinal: boolean }
state: {
  sessionId: string;
  status: "starting" | "listening" | "finishing" | "stopped" | "error";
  error?: "permission" | "unavailable" | "interrupted" | "failed" | "timeout";
}
```

A recognition result longer than 4096 characters fails explicitly with `failed`; it is never silently truncated. A stop without a final result
produces `timeout`, never a fabricated final transcript. `start` also rejects on
failure; a concurrent start or invalid session rejects `failed` without taking
ownership or emitting an event for the current session. Stale/foreign stop and
cancel are no-ops. The native singleton fences module owner, opaque session token and an
internal epoch, including reused tokens and late permission, task and timer callbacks.
JS must additionally fence editor/account lifecycle and cancel its own session on
unmount; no transcript is automatically saved by this module.

Recognition always sets `requiresOnDeviceRecognition = true`. A missing/unsupported
local recognizer fails closed. The module never requests an asset download; locale
and installed-model support remain platform-dependent. There is no fallback to
Apple server recognition or another provider.

The total session, including permission waiting, is capped at 60 seconds on a
common-mode run-loop timer. App backgrounding, active-recording inactivity, audio
interruption, media-services reset and module destruction clean up the matching
session. Permission dialogs may resign active while starting, before audio exists;
audio cannot start until the app is active again. Cleanup closes the append gate,
removes the tap, ends/cancels recognition, deactivates audio and restores the prior
audio category. Notifications never resume a recording automatically.

## Non-recording checks

```sh
mkdir -p /private/tmp/otr-dictation-swift-cache
swiftc -module-cache-path /private/tmp/otr-dictation-swift-cache \
  modules/local-dictation/ios/DictationSessionFence.swift \
  modules/local-dictation/tests/main.swift \
  -o /private/tmp/otr-dictation-session-checks
/private/tmp/otr-dictation-session-checks

xcrun --sdk iphonesimulator swiftc -typecheck -swift-version 5 \
  -module-cache-path /private/tmp/otr-dictation-swift-cache \
  -target arm64-apple-ios16.4-simulator \
  -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" \
  modules/local-dictation/ios/DictationSessionFence.swift \
  modules/local-dictation/ios/LocalDictationEngine.swift
```

Checked against the actual iPhoneSimulator27.1 SDK with a 16.4 deployment target;
all three Swift files also typecheck against the existing real ExpoModulesCore
framework and its React dependencies. The Foundation checks exercise ownership,
concurrent-start rejection, foreign cancellation and stale/reused-token epochs with
zero Speech/audio/permission calls. Podspec syntax and module config parse checked.
These are not microphone, recognition-quality, interruption, timed-resource, bridge
runtime, host-installation or Owner Native acceptance tests. Those remain pending.

Apple references:
[on-device support](https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition),
[required local recognition](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition),
[live audio requests](https://developer.apple.com/documentation/speech/sfspeechaudiobufferrecognitionrequest).
