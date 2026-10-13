# Local Trip Photos UI candidate

This isolated packet mounts a Photos section only inside a selected account-local Trip workspace. The system image picker supplies one explicit temporary `file://` URI to `readLocalTripPhotoRepository().addTripPhoto`; the UI does not read the photo library directly, copy bytes, write SQLite, upload, or associate an accepted Day. The repository owns account/Trip fencing, retained-byte integrity and failure cleanup. The section lists only that Trip's integrity-checked local photo metadata and shows an unavailable state when a retained image is missing or the repository cannot open.

The packet depends on Source's reviewed SQLite62 repository candidate `84211133d64d506fae659d5b0ec6a5c4eec8f7d3` and Core's retained-file helper `e563fdfdb2a023c11ac3bae959dc98f9039f8c40`; both remain off main while the helper's A1A Native storage proof is **NOT VERIFIED**. This UI therefore has no real picker/store/display Native acceptance or runtime activation claim. It must be rebased on the eventual integrated data baseline, independently reviewed, and observed on the approved A1A app before UI intake.

The Photos mount is keyed by the current Account generation and Trip ID. A scope transition starts with empty loading state before repository completion; old read and picker closures cannot update or save through the unmounted scope. This retains the existing workspace, controls, translations and actual picker URI provenance.

Author checks: focused component 4/4 PASS (explicit picker selection, cancellation/non-file rejection, immediate Trip/Account image suppression and late Trip/Account picker suppression), typecheck, UI guard, scoped ESLint and Prettier PASS. No private photo or new device/install was used.
