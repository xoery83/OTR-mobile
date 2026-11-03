# Import architecture and ownership — V4 handoff

Evidence baseline: main `b16c2d932ce602e86db83796eefe20d94b215aed`, 3 November 2026.
Freeze: 2026-11-03 09:23:05 UTC / 22:23:05 NZDT. Responsibility transfer is PREPARED, pending receiving agent ACCEPTED and Root acknowledgment. Current Image42k is local draft only, not submitted; no new Batch/Task/paid call/Source scope.

This inventory prepares transfer of the existing Import lane; it adds no product scope, permission or runtime activation. Paths below are repository-relative. Dated receipts establish their own observations, not fresh deployment qualification.

## Existing flow

1. Import Entry/Capture UI (`src/features/capture/CaptureComposer.tsx`, `CaptureContent.tsx`, `CaptureProgress.tsx`, `UniversalCaptureResults.tsx`, `useUniversalCapture.ts`) collects/reopens material and displays existing job state. UI uses repositories/operations/transports; it does not own SQL, sync or paid retries.
2. `src/data/operations/captureSubmission.ts` / `defaultCaptureSubmission.ts` and `src/data/repositories/captureSubmissionRepository.ts` own the existing durable intake composition. A Batch groups accepted inputs; independent Source/input identities and durable jobs survive partial success. A new interpretation is not permission to replace the original submission identity.
3. `universalCaptureConsumer.ts` calls the existing Backend transport for context, Task activity and Results. `start` is the explicit execution action; passive `recover` reads the same retained IDs. Missing/unavailable503 is not proof that a Source or Task should be recreated. UNCERTAIN/UNKNOWN must not cause another Provider send.
4. Backend `universalBatchSource.ts`, `universalOriginalSource.ts`, `universalContinuousHost.ts` / `universalContinuousRuntime.ts` and owning Source readers enforce normal Account/Actor/Trip, current Source revision, representation hashes, Task pins, sealed marker and retained response/receipt bindings. OCR/Vision/Interpret consume qualified representations; a successful model response alone is not a canonical Item or completed Save.
5. Existing Core Source review/Admission and operation receipt paths accept explicit reviewed intent. Source/Task/Provider output cannot write directly to canonical business rows. An APPLIED/NO_CHANGE receipt is the owning outcome; UNKNOWN and stale/conflicting observations retain identity for recovery.
6. Documents/Personal Inbox and Updates are projections/readers of existing material/job/receipt identities, not another upload/store/event/Save subsystem. Updates deduplicates by Batch and keeps Task/receipt event time separate from submitted time.
7. Form Source Scan is advisory. Import produces bound interpretation DTOs; Native-owned Form review selects candidates/fields and explicit Keep/Replace. Existing Manual Save remains the only manual repository save. Form suggestions never gain Universal Admission authority by being displayed.

## Unique Writer boundaries

| Surface | Owning Writer | Required collaboration boundary |
| --- | --- | --- |
| Import Entry/Progress/Results, Import Documents panels, Capture consumer/transports/DTOs, Import Updates projection | Import lane | Do not replace shared navigation/session/catalog files wholesale. Coordinate exact callback/DTO changes with their owner. |
| Source intake, material/proof/task/marker/interpretation and Import recovery checks | Import/Source owning lane | Protected SQL/runtime/worker qualification is a separate exact execution gate, operated by Root. Source guards must continue to reject unauthorized reads. |
| Canonical Item/Booking/Document, Admission, receipt/revision/epoch, Core-held Source audit | Core lane | Reuse Core owning transactions and receipt identity. No Import-owned second Save, fabricated receipt/byteCount, or Auth revision mapping. |
| Normal Auth/session/Account generation/Claim/revocation/OAuth | Auth lane | Use normal authenticated identity and generation fences; no Session copying, JWT decoding as proof, or Import-owned auth refresh system. |
| Native navigation, Form draft/edit state, platform attachment/QuickLook, device builds, Day/Trip downstream consumers | Native/Vision lane | Import supplies existing callbacks/data; Native alone owns shared mounts/navigation/session/device handoff. No competing device operator. |
| Provider config/price/scope/grant/custody/runtime/timers and shared Backend installation | Root sole shared-resource Writer, with owning approvals | A local software PASS is not live call authority. Rebind exact current baseline, controls and finite deadlines before authorized execution. |
| Ledger/private domain data | Ledger owning lane | Import evidence may be a suggestion; it does not create financial rows or rewrite private ownership. |

Core Revoke `67e374fb` is an isolated unmounted contract candidate, outside this Import transfer; its development is paused. It does not supply a new Import entitlement.

## Acceptance truth

- Nov1 first Photo503 remains OPEN_UNPROVEN. `docs/ops/photo-first-cold-503-20261103/FIRST_FAILURE_RECONCILIATION.json` preserves BINDING/FAILED and adjacent503, but requestId/method/full path and exact Batch correlation are absent. Duration8383ms is not a cause.
- Nov3 retained Results expiry was separately proven at FIRST/BINARY_READ/SOURCE_CAPABILITY_CLOSED. Current retained PNG PUBLISHED/INSTALLED path reuses authorized metadata plus sealed request/response pins, including exact cross-pin checks; Core-held historical audit retains its owning lease. Full material/execution/Admission guards were not relaxed.
- `docs/ops/import-beta-20261103/evidence/native-readonly-12615/READBACK.json`: same Batch794b/Task96ce, accepted Itemc59d, original PNG and Updates reopened read-only. Submitted19:26:26 differs from result event19:38:42. This is retained UX acceptance, not a new paid interpretation or current newest-main device PASS.
- Main's Documents pagination fence and P3 retained UNKNOWN projection are LOCAL_PASS with integration receipts. Fresh Native/model acceptance remains outstanding.
- Backend temporary custody is not a permanent cloud backup. Preserving Results metadata does not authorize old raw custody, Provider reexecution or expiry bypass. Local durable material and current owning read contracts remain distinct.

## Exact implementation entry points

| Area | Current repository paths |
|---|---|
| Source and Task authority | `backend/src/universalBatchSource.ts`, `backend/src/universalOriginalSource.ts`, `backend/src/universalSourceRead.ts`, `backend/src/universalSourceConnection.ts`, `backend/src/universalTaskActivity.ts`, `backend/src/universalTaskReceipt.ts` |
| Interpreter, Provider, runtime | `backend/src/universalDeepSeekProvider.ts`, `backend/src/universalContinuousHost.ts`, `backend/src/universalContinuousRuntime.ts`, `backend/src/universalContinuousConfig.ts`; existing Provider/Usage ports retain the ledger and UNKNOWN |
| Local OCR/relevance and decision | `src/native/capturePhotoRelevance.ts`, `src/data/operations/universalPhotoRelevance.ts`, `src/data/operations/universalPhotoRelevanceActions.ts`, `src/features/capture/UniversalPhotoRelevanceRow.tsx`; OCR is relevance only, accepted image retains visual structure |
| Reviewed Core consumer | `src/data/operations/universalP1AdmissionConsumer.ts`, `backend/src/universalCoreSourceRead.ts`, `backend/src/universalVisualReview.ts`, `backend/src/universalP2SourceReview.ts`; family contracts and Core transaction own final Save, not the model |
| Documents | `src/features/documents/ImportDocuments.tsx`, `ImportDocumentsPanel.tsx` in that directory; `src/data/operations/defaultImportDocuments.ts`, `src/data/repositories/importDocumentsRepository.ts` |
| Updates | `src/features/updates/ImportUpdatesSection.tsx`, `UpdatesInboxScreen.tsx` in that directory; `src/data/operations/universalImportUpdates.ts`, `src/data/repositories/updatesInboxRepository.ts` |
| P3 suggestions | `src/data/operations/universalP3SourceInterpreter.ts`, `universalP3FormInterpretation.ts` in that directory; `src/native/p3FormScan.ts`; Native consumer `src/features/day-feed/formScanResponse.ts` |

Original/derived are provenance roles, not a blanket P-family whitelist. A verified Source/representation/evidence still must satisfy the particular owning business contract. Native normal downstream and shared navigation remain Native-owned; Domain/Provider/Auth contracts are consumed through their existing adapters.
