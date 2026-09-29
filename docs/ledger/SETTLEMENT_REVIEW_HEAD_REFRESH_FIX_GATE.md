# Settlement review after confirmation

Date: 2026-09-29. Local, Hosted Dev and original-iPhone save/re-entry gates PASS.

## Observed cause

The owner confirmed Europe 2026 UI Polish, creating Settlement version #3
(`77ceecce-845e-4a74-aade-089f9bc411a0`). The subsequent Looks good operation
`2bc15c44-c706-47c6-a3b9-cd1ef90893aa` submitted the prior version's statement
fingerprint `21f61fcaefd30636564ba4d2cc8b27074b42c7f00cb9048cd9feb28b83edfa91`.
The server correctly rejected it with `STALE_REVIEW_CHECKPOINT`.

Two read-only Hosted Dev reads return the same current statement fingerprint:
`a9a99f0d2294607fcfbe22b8a828ec723233de9cd4bf2fe854ab89fb16f0f1cc`.
Replacing only its settlement ID/revision/input digest with the prior head
`5260457f-8550-449c-8d7b-7e80fcc5447a` exactly reproduces the submitted fingerprint.
The contributions, amounts and financial intent are identical. This is a client
review freshness defect, not server fingerprint instability or decimal proof loss.

The Summary reads the new confirmed lineage independently of the personal review
hook. That hook previously refreshed only on Journey/focus changes and allowed
selection while the cached statement's network refresh was still in progress.

## Minimal fix

- Confirmed head changes now refresh the existing personal-review hook.
- Both formal review controls wait for statement loading; Summary additionally
  requires the review's settlement ID to match its current confirmed version.
  Routine refresh stays silent and is distinct from Saving review.
- A choice passes its displayed fingerprint to the repository. The repository
  checks it against the current row inside the queue-write transaction. It rejects
  an intervening statement replacement without a queued operation or blind rebase.
- Existing request generations suppress late old reads; cached matching-head review
  remains available offline. Server stale/head/source/permission checks unchanged.
- No Backend, migration, API contract, financial-record or confirmation mutation.

## Validation

7 related suites / 26 tests, TypeScript, scoped ESLint/format, diff checks and signed
normal Release build PASS. New event tests cover a new head while an older read is
pending, disabled old selection, late old response suppression, current fingerprint
submission and offline matching/mismatching heads. SQLite regression verifies no
operation is queued for a replaced displayed statement. Existing account isolation,
newer-choice preservation, domain coverage and feedback tests remain passing.

Original iPhone installation retains the data container. Formal UI and read-only
server checkpoint acceptance is recorded below. No automated Settlement Confirm.
Production untouched; only Hosted Dev was read.

## Original iPhone / Hosted Dev evidence

Owner tapped Looks good after installation. Agent observed the formal Summary:
green Looks good, 1 looks good / 0 still checking / 0 not reviewed, Review saved,
and no stale-review error. Independent Needs attention / 28 Review items remain.

Two subsequent read-only server responses retain fingerprint
`a9a99f0d2294607fcfbe22b8a828ec723233de9cd4bf2fe854ab89fb16f0f1cc`, coverage
LOOKS_GOOD and delta null. New checkpoint `c94e76cf-8c79-4e8b-aaf3-7e16d5163a36`
was saved at `2026-09-29T09:35:58.588322+00:00` with that exact fingerprint.
Confirmed Settlement remains `77ceecce-845e-4a74-aade-089f9bc411a0`.

Final normal Release JS bundle SHA-256:
`e3aded041f6a30a047f22f85b0d755c44d5a049116cea6a74c4cc0a63de3c691`.
Data container UUID is retained. Owner opened the formal Settlement Summary after
final reinstall / cold re-entry without submitting another choice. Owner reported
green; agent observed green Looks good, coverage 1/0/0 and no review-error messages.
Version #3 and CNY855346476 net remain unchanged. This persistence check is read-only.

## Separate earlier refresh issue

The earlier Review Settlement Changes screen's endless Checking the latest values
cleared after app restart. Both Preview APIs were ready with matching local/server
source, 84 effective inputs and four Added entries. Its exact hung await has not been
proven; this review-head fix is not presented as a permanent fix for that issue.
