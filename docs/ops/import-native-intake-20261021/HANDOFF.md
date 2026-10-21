# Import Native intake — 21 October 2026

Base: `9a3fe87942b94bd36c2dbd1f1a597092eefb869b`. Branch:
`codex/import-native-intake-20261021`. Source preparation only; independent
Review and Coordinator-controlled Host build/device acceptance remain pending.

## Consumer API

`src/native/imagePaste.tsx` exports `ImagePasteControl`,
`isImagePasteAvailable()` and `releaseImagePaste(tokens: readonly string[]): void`.
The release callback catches asynchronous native failures internally. An optional
`releaseImagePasteTokens` Promise API is also available for explicit cleanup checks.

Props: `requestId: string`, `enabled: boolean`,
`onImages({requestId, items})`, `onFailure({requestId, code})`, plus ordinary
React Native `ViewProps`. Give the system control an accessible touch area using
canonical composer layout (at least 44 points); it supplies its own system label,
appearance and clipboard consent gesture. Render it inside the existing composer.
The TextInput's native text editing menu remains unchanged. This does not implement
an image `onPaste` event on TextInput.

Each item is `{token, uri, byteSize, mimeType, source: "clipboard",
representation: "item-provider"}`. There is no original filename, Photos/Files
provenance, C3 acquisition kind or submission authority. Supported copied
representations: PNG/JPEG/HEIC/HEIF/WebP, at most 10 and 20 MiB per batch; delivered
items also have a process-wide 10-item/20-MiB retention cap. Header checks identify
the representation, not full image validity, profile, original-media identity or
canonical evidence. No bitmap decode, re-encoding or upload occurs.

Use a fresh printable ASCII request ID (1–80 characters) when the account/editor
generation changes. `enabled=false`, request change, detach and unmount cancel and
delete only pending work. Successfully delivered items survive panel closure;
staging must call `releaseImagePaste` on remove, clear and account purge. A stale or
malformed JS event automatically releases recognized opaque tokens; keep the
owning staging fence too. The release API can delete only files registered by this
module, never an arbitrary URI. No submitted-file lifecycle is introduced.

Provider URLs are copied during their callback into module-owned temporary
process/batch directories. Per-file stream accounting bounds a pending batch;
pending cancellation fences copying and delivery. One active batch reserves the
remaining delivered-item byte/count budget, keeping the combined draft within
20 MiB/10 items. Delivered registration is atomic. Files use 0600 permissions and
iOS first-unlock protection. Explicit release
removes them; next process initialization cleans only this module's previous UUID
process directories. Cold-start draft restoration is not promised. No other cache
or user folder is swept. Staging independently enforces its combined draft cap.

## Voice diagnostics

`readLocalDictation({ onDiagnostic })` preserves the existing `DictationNative`
interface. Safe diagnostic fields are `phase`, allowlisted NSError `domain`,
signed-32-bit `code`, and optional `sampleRateValid`/`channelCountValid` booleans.
They are emitted on failure, fenced to sessions started by that adapter instance,
and stripped of extra fields. Unknown domains become `OTHER`. No localized error,
userInfo, transcript, audio, raw sample rate, business identifier or session ID is
included in the diagnostic callback; no logs or persistence are added. Root may
show these transiently in DEV for the current subscription. A `failed` state or
NSError alone does not establish a Simulator cause.

The existing on-device-only requirement, permissions, session/owner/epoch fences,
transcript bound, timers and functional state codes remain. The engine adds phases
around permission, audio setup, recognition and lifecycle/deadline failures.

## Validation and boundary

- Vitest: native diagnostic, image delivery contract and existing dictation
  controller: 3 suites / 14 tests PASS.
- Foundation executable: metadata sanitization; pending cancellation/late callback;
  delivered lifetime/explicit release; byte/count limits and foreign-token safety
  PASS. Existing session-fence executable PASS.
- Typecheck, targeted ESLint and `npm run ui:guard` PASS.
- Installed iOS SDK typecheck of engine/storage/diagnostic and a UIKit paste-target
  API probe PASS; Expo module Swift syntax parse PASS. This is not a full Expo
  bridge build or a device test.

`expo-module.config.json` registers `ImagePasteModule` in the existing local module;
the existing podspec includes Swift sources and UIKit. No package, framework, Pods,
build settings, permission text or C3/Core/Admission/schema change is made.

Coordinator owns composer/staging, diagnostics presentation and serial Host
registration/build/install. Clipboard staging must remain a distinct draft source;
prepareSubmit/send stays disabled for it. Native paste, actual provider behavior,
audio diagnosis, cancellation while navigating, and delivered-draft preservation
need independent Review followed by device acceptance. No Native acceptance is
claimed here. Central current-state/Tracker updates belong to Root; this is the
isolated slice's current-state handoff.
