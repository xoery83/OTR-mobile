# P5 Manual Cloud Native candidate — Native candidate integrated; not deployed

Base: `6c60d5c803095b868fab3c4627b7a6eac777dff0`. Patch SHA256: `22ae4b254320cc737b539a8a4a496308a70fe1d561af139889c08f45ad84fd1c`.

Parent reviewed the patch and integrated only Native source/tests into the integration branch after P4 e4f6327e. Main, Backend, SQL, Source/Admission, Flight, Auth and device data were not changed. P5 DEV Manual authority remains CLOSED. LOCAL_PASS is not CLOUD_L3_PASS.

## Native diff

- Extract the existing full P1/P3/P4 accepted MANUAL Create verifier verbatim into `acceptedManualCreate.ts`; reuse it from both existing `manualPlanRepository` and P5. No new authority store.
- P5 Accepted Edit requires the existing certified snapshot, same Creator/manageability, exact retained completed queue operation plus immutable MANUAL CREATE command/intent hash/APPLIED receipt identity and hash. A reviewed-source Import or accepted graph alone never grants Manual Edit.
- P5 Detail passes displayed Item revision into Repository.read; stale expected revisions fail. Actor/fingerprint/revision/transaction/unchanged endpoint precision/place/service facts/frozen IDs and retry protections remain.
- Reuse existing normal Queue wake/activity selection: add P5 CREATE_ITEM; edits only SET_ITEM_TEXT, SET_ITEM_PARTICIPATION, SET_TRANSPORT_DETAILS. Root SET_ITEM_SCHEDULE/SET_ITEM_PLACE remain ineligible for P5; endpoints are owned by SET_TRANSPORT_DETAILS.
- No new API, timer, queue, database migration, form controls or DayFeed framework changes.

## Existing interfaces and next owning changes

| Layer | Reuse / necessary delta |
| --- | --- |
| Form | P5TransportEditor and manualTransportFieldsSchema already support TRAIN/BUS/FERRY/WATER_TAXI/SHUTTLE/TRANSFER; departure required, arrival date/time/place independently nullable, no inferred Booking/Ticket/operator. |
| Local mutation | manualTransportRepository → tripCoreV2Repository.commitManualBatch → existing CORE_V2_COMMAND, same Item ID and ordered revisions. This patch adds accepted-edit qualification only. |
| Queue / Sync | tripNormalSync + tripNormalQueueActivity + existing tripNormalCoordinator.runP1/Core worker; account/cohort/owning Trip create/participant/dependency/backoff/receipt gates retained. |
| Capability | Backend unique Writer must extend exact normalManualCapabilities profile against the latest exact approved profile; P2 remains a separate Owning blocker; include P5 and SET_TRANSPORT_DETAILS without dropping P1/P3/P4/P2 current profile or broadening Import. |
| Backend command fence | tripCoreV2PgStorage must require SET_TRANSPORT_DETAILS target P5 and keep same-Creator MANUAL Edit; root schedule/place for P5 remain invalid through Core. No new command/schema. |
| Reader | Existing createCoreP5DayFeedReader/projectCoreP5Feed + coreScheduledTransportRenderer/transportFactsFromItem + loadP5Detail already read accepted P5 endpoints/service/notes/participants. No fabricated local-to-cloud certificate. |
| Four-function boundary | Owning Writer prepares a NEW exact preimage candidate for trip_sustained_dev_scope_allowed, trip_sustained_core_capabilities, trip_core_guard_write, trip_core_finite_read_state_guard. Preserve latest Import exact-operation branch and current P2 postimages; do not reuse old P4 SQL. Account/Trip cohort/principal/creator/command/family/child event_id+role/service identity/receipt-read-state guards plus exact rollback/OID/owner/ACL must hold. New Owner approval and serial DEV window required before any installation. |

No SQL payload, backend activation or deployment is supplied here. Unsupported transport modes, Journey/Booking/Ticket/document/passenger authority remain excluded.

## Verification

Actual candidate run: 6 suites / 101 tests PASS (manualPlan, manualRental, manualTransport, tripNormalSync, tripNormalQueueActivity, p5DetailRead). Added accepted same-ID Create receipt → read/edit; wrong Creator, receipt/hash, queue payload/state, admission mode, stale revision and wrong Account negatives; all six supported subtype Create dispatch; exact target-family edit whitelist; Queue retry due/backoff and root schedule/place exclusion. Existing P1/P3/P4 suites cover verifier extraction regression.

TypeScript and scoped ESLint ran against the candidate only. Full detailed results are in VALIDATION.json. Nearest command:

```
./node_modules/.bin/vitest run --configLoader runner --no-cache src/data/repositories/manualTransportRepository.test.ts src/data/repositories/manualPlanRepository.test.ts src/data/repositories/manualRentalRepository.test.ts src/data/sync/tripNormalSync.test.ts src/data/sync/tripNormalQueueActivity.test.ts src/features/day-feed/p5DetailRead.test.ts
```

Pending: parent independent review/serial patch integration after fresh shared-file review; Backend exact profile/owning four-function candidate + isolated Pg raw-writer negatives/rollback; Owner authority; approved DEV deployment; real Manual Create/Edit server-accepted + independent readback + Native cold/offline/replay/permissions. Existing P5 Import PASS supplies none of those Manual permissions.

Parent independently reran all six suites:101PASS, full TypeScript, UIguard and scoped ESLint PASS. This is Native/L2 readiness only. Do not install this candidate as P5 Cloud-enabled: Backend capability and protected SQL remain closed/unimplemented.
