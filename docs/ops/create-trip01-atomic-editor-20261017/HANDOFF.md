# Trip Editor atomic local Save

Base: `725d143671d977849da709e46307573f28db1350`. Candidate covers repository logic only; no Native or UI PASS claim.

## Existing storage and scope

Both metadata and built-in cover are columns of the same account-scoped `local_trip_containers` SQLite row. No migration, second model, Hosted change, or new authority is needed. `tripRepository.ts:183` already spreads the metadata repository API, so the new optional argument is automatically exposed without changing that shared file.

## Serial UI integration contract

`repo.updateMetadata(request, { before: originalCoverId, after: draftCoverId })` performs one account-gated SQLite transaction for metadata, local Ledger projection, metadata queue intent, and built-in cover preference. `request` keeps its existing strict operationId/tripId/before/after schema; cover never enters the Hosted metadata proof or payload.

Experience owns these exact caller changes (not applied by this candidate):

1. `TripBasicEditor.tsx`: keep `beforeCover` and `draftCover` state initialized from `trip.selectedCoverAssetId`; `TripCoverPicker` changes only draft state, never calls the old persistence callback. Preview the draft with the existing cover resolver. Include cover dirty state in the existing unsaved-change check.
2. Extend its Save callback with the cover change tuple. The Save button must also permit a cover-only edit when metadata is otherwise unchanged. On resolved Save, advance both baselines; on error retain both drafts. Avoid a second `selectBuiltInCover` call.
3. `LocalTripWorkspace.tsx:629`: pass the tuple as the second argument of its existing `repo.updateMetadata(...)` call. Keep the existing account-generation fences and reload after the promise resolves.
4. Cancel/back discards draft state, with no repository call. Remount Editor on reopening or reset drafts from the reloaded Trip; do not leak canceled cover state between modal openings.
5. The atomic API retains the existing local Creator provenance requirement. Do not enable metadata editing for other cached Trips. The older independent `selectBuiltInCover` API is unchanged for its existing callers; it does not grant metadata authority. If a non-Creator cover-only Editor is retained, its separate existing local-cover scope must remain explicit and must not call metadata under false Creator authority.

## Concurrency and retries

Metadata-only behavior and durable operation payloads are unchanged. A stale metadata baseline still conflicts. Cover uses compare-and-set against the original or already-achieved cover value; unrelated newer cover changes conflict instead of being overwritten. Cover-only creates no `UPDATE_TRIP_METADATA` intent. It records a consumed device-local action in the existing `sync_operations` journal: entity `TRIP_LOCAL_PREFERENCE`, kind `TRIP_COVER_LOCAL_SAVE`, status `COMPLETED` means local application only, not a Hosted receipt or Cloud Synced claim. The full request plus cover tuple is bound to that operation ID. Exact replay is a no-op even across cover ABA and cold restart; changing the tuple under an already-consumed ID is rejected. Such rows must be retained by normal maintenance and hard-excluded by queue list/claim and the engine closed set, regardless of status or a permissive scheduler. A replay of an already-recorded metadata operation is a no-op, including cover: it never reapplies an old cover over a newer edit. The optional cover tuple is never part of the Hosted metadata payload. Retry a known operation with its original tuple; never reuse its ID for a new edit. Metadata-changing saves retain their original durable metadata operation identity and replay behavior.

## Validation

- `tripRepository.test.ts`, `syncEngine.test.ts`, `ledgerMaintenance.test.ts`, `syncOperationRepository.test.ts`: 77 PASS. Original 34 repository tests plus cover-only ABA/cold-reopen, identity-reuse rejection, local receipt-write/account-fence rollback, forced PENDING queue/claim exclusion, permissive network scheduler rejection, and real SQLite maintenance retention. Original coverage: combined save and real-file cold recovery; unchanged immutable create and metadata payload; replay preserving a newer cover; cover-only without Hosted intent; queue failure rollback; stale/invalid cover; ABA account switch rollback; foreign account rejection. Existing metadata/proof/queue tests remain green.
- TypeScript, narrow ESLint and `git diff --check`: PASS.
- Shared UI files, current-state/catalog, Source, Hosted and Simulator untouched. UI wiring / Cancel behavior / integrated Native verification remain for the serial UI owner; this candidate alone does not close the full Editor acceptance.


## Independent Review correction

The first candidate `b05c59e` had a reproduced P2 defect: cover-only lacked a consumed operation identity, so null → city → null followed by replay of the first action restored city. The independent regression failed; do not integrate the original candidate alone. This corrected candidate includes both the local receipt and the following required closed-set/retention changes; they are one logical fix and must be integrated together:

- `syncOperationRepository.ts`: `listPending` and `claim` always exclude `TRIP_COVER_LOCAL_SAVE`.
- `syncEngine.ts`: add that kind to the hard closed operation set, before caller-supplied `shouldProcess`.
- `ledgerMaintenance.ts`: never prune this consumed local action as reconstructible completed sync history.

No new schema or generic journal infrastructure. The correction has not yet undergone its second independent review or integrated Native validation.
