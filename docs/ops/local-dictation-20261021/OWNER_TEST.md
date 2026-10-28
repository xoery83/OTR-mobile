# Local dictation — Owner test handoff

Owner approved implementation on 21 October; actual microphone/recognition tests are reserved for Owner. Code, SDK compilation and lifecycle tests are not Native acceptance.

Entry: My Trips → + → Import Travel Plans, or Trip Home → Import more. Tap the microphone only when ready. First use may request microphone and Speech access. English UI requests en-US; Simplified Chinese UI requests zh-CN. This first slice does not auto-detect mixed languages. Apple local-recognizer support/assets vary by device; an unavailable Simulator is not proof of working real-device speech. No server fallback or automatic model download is implemented.

Check on a supported iPhone:

1. Keep existing typed text and an attachment; tap microphone and speak a short travel plan. Confirm live words appear after the existing text without duplicating partial phrases.
2. Stop: microphone stops and final words remain editable. Attachments remain selected. Nothing submits automatically.
3. Cancel during a second recording: exact text from before that recording returns; attachments remain.
4. Close while listening, switch App/background or interrupt audio: capture stops, no late words appear in another draft. Reopen and verify ordinary typing still works.
5. Deny permission and test unsupported/offline language: clear local error, usable manual input, no repeated automatic permission requests or remote fallback. With the device's supported local model available, test airplane mode separately.
6. Try both UI languages, one-minute limit and repeated start/stop. Report device/iOS/language and visible outcome; do not export private recordings or session logs.

Audio buffers stay in memory; the app creates no audio file or upload. Recognition only changes the existing transient draft. The existing text/mixed Import submission limitation remains: voice does not bypass Source Evidence/Review or create a Trip Item. Draft process-death persistence, full Import v2.1, SpeechAnalyzer migration and other form dictation are outside this slice.

Rollback: restore the previous fixed211610d JS preview and same106 Native package. Keep account, Trip data and photos. No schema or data rollback is needed.
