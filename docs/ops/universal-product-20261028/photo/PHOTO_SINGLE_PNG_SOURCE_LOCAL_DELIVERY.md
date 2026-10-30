# Single PNG Capture Source adapter — 31 October 2026

Status: IMPLEMENTED / LOCAL_PASS only. Based on accepted public3345f8f3, in the
isolated Photo branch. No DEV/SQL/Host/Provider/device execution or main update.

- Explicit `OTR_PNG_CAPTURE_ORIGINAL_V1` enables only one accepted IMAGE/image/png
  original. Omission remains closed; shared IMAGE support predicates are unchanged.
- The marker checks retained PNG signature/size/hash only. It never claims
  `PNG_STATIC_RGB8_RGBA8_V1`, decoded safety, cloud verification or interpretation.
  The real existing Host sandbox and owning Source qualification remain required.
- Existing recover/admit key, Source/representation/operation IDs and queue are
  reused across reopen/retry. Original bytes and C3 photos/camera acquisition
  identity survive; owning Source command uses its existing IMAGE/FILES intake.
- Source Start retains its existing explicit Trip assignment. Local OCR/choice
  does not assign from Trip prior. rev1 consent becomes stale after assignment;
  fresh local screen and explicit choice can bind rev2 without copying Continue.
- Read-only consent guards run before PNG preparation/Task Prepare and existing
  Task Resume. Current original pins, Account/generation, Trip, cancellation and
  newer choices are checked. They write no decision or queue and call no OCR.
- `preparePngOriginal(context, {acquisition, acquisitionReceipt, binding, bytes})`
  is an optional typed continuation seam. The acquisition receipt is read through
  existing owning Source lookup; custody v2 preserves source metadata and checks
  actual bytes. Missing continuation throws before Task preparation. A resolved
  callback is not itself a cloud receipt; Backend must qualify the real material.

Remaining integration: Root supplies the actual existing PNG upload/verify/seal
port and explicitly enables its default-closed Native profile. This change does
not add a runtime env flag/caller or invent upload receipts. Root also owns the
user-facing PHOTO_REVIEW_REQUIRED presentation; the current generic unavailable
view and explicit Row recheck remain safe but are not final Photo product UX.

Validation: real SQLite Source tests first failed PROFILE_UNAVAILABLE before
wiring, then preserved one Source queue entry/IDs after reopen and retained PENDING
representation state. Directed tests cover stale Continue, re-confirmation,
prepared identity reuse, missing/uncertain/skip choices, late changed choice,
Account/Trip/cancel fences and same-Task resume. Test fixtures with only a PNG
signature deliberately prove pending intake, never strict PNG qualification.

No Photo Vision, paid usage, original-review Admission, Core Save or Native cold
restart E2E is claimed. Existing PDF/text/consumer regressions remain in the local
focused command; no broad historical contract audit was repeated.

Final local checks: seven suites87 tests, full typecheck, changed-code ESLint and
UI guard PASS. This is a software result, not a real Photo E2E or paid receipt.
