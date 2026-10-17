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

Metadata-only behavior and durable operation payloads are unchanged. A stale metadata baseline still conflicts. Cover uses compare-and-set against the original or already-achieved cover value; unrelated newer cover changes conflict instead of being overwritten. Cover-only creates no `UPDATE_TRIP_METADATA` intent, and repeating the unchanged cover-only save is harmless. A replay of an already-recorded metadata operation is a no-op, including cover: it never reapplies an old cover over a newer edit. The optional local cover tuple is not part of the server operation identity; retry a known operation with its original tuple, never use that ID for a new edit.

## Validation

- `tripRepository.test.ts`: 34 PASS (4 additional tests): combined save and real-file cold recovery; unchanged immutable create and metadata payload; replay preserving a newer cover; cover-only without Hosted intent; queue failure rollback; stale/invalid cover; ABA account switch rollback; foreign account rejection. Existing metadata/proof/queue tests remain green.
- TypeScript, narrow ESLint and `git diff --check`: PASS.
- Shared UI files, current-state/catalog, Source, Hosted and Simulator untouched. UI wiring / Cancel behavior / integrated Native verification remain for the serial UI owner; this candidate alone does not close the full Editor acceptance.
