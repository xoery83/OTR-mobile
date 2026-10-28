# Capture local dictation — Owner approved 21 October 2026

Use a small local Expo iOS module for short draft dictation with Apple Speech. Require both supportsOnDeviceRecognition and requiresOnDeviceRecognition; never fall back to server recognition. The mature SFSpeechRecognizer streaming API fits this bounded short-input slice without downloading model assets or adding a package dependency. Language/device availability is checked at runtime.

Only an explicit microphone tap requests microphone and Speech permissions. Audio buffers stay in memory, with no recording file, upload, transcript logs or background recording. Each session owns its callbacks; cancellation, interruption, inactive App, destruction and a 60-second limit release microphone/audio resources. Stop finalizes recognized text; Cancel restores the pre-session draft; closing preserves current draft text and stops the session.

The UI appends recognized text to the existing draft and prevents concurrent editing or submission while listening. It does not create a new Capture Source or bypass the currently unsupported text submission contract. No schema, Backend, sync or permission role change. Native usage descriptions are regenerated through app config. Automated and compile checks do not establish real speech quality: Owner performs microphone/permission/language/offline testing later.
