# IMP-C01 Updates main-context candidate

Source2c720197 was based on `8c992a79`; the separate candidate ordinary-merged
latest mainde3a368b (including requested9eef Native) as c1dc9b7e. Its exact six
Import files remain unchanged and both handoff blocks are preserved. This is
LOCAL_PASS / independent NO_BLOCKER; not installed, merged or deployed.

The phase reader preserves normal main Actor/Account/Trip/Batch/generation
qualification and sequential Context GETs. It emits all legal lightweight Task
observations before reading ready Results/receipt details in the same order.
Queued details recheck current Account and generation. A detail failure retains
its legal Task state and does not block another Batch's status. No dispatch,
paid request, new cache/queue or concurrency change is introduced.

Updates project three optional display fields from the existing current-Account
Batch: a known single Source filename, a TEXT fallback marker, and valid stored
submission time. Existing stable event identity, dedup, sort and original event
updatedAt are untouched. The UI distinguishes registered/submitted time from the
existing event time, supports filename/TEXT-label search, and still renders older
cards without metadata. Multiple or missing inputs do not invent a filename.
No original text, file contents or extra repository read is needed.

The source lane9beb passed actual126.14 Updates→sameBatch→serverAccepted/original
recovery; metadata5ee had only local/review acceptance. This candidate keeps main's
existing tripPrior contract and does not pull in Root's unmerged assignedTrip DTO.
Therefore it does not claim native parity for retained account Batches that only
have server-assigned attribution. That remains a separate owning integration.

26 focused checks/3 files, six-root strict types, UI guard and scoped lint pass.
Fixed source bytes are in SOURCE.patch.json and per-file hashes in MANIFEST.json.
Root must freshly serialize final main integration, retain later peer commits and
arrange Native UX acceptance separately. No Host/SQL/device/Provider/main/remote
action was performed by this candidate.
