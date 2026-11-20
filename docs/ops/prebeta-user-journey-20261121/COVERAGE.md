# Pre-Beta Forms QA user journey — execution matrix

Base product b10178c1 / installed Build14; branch codex/native-unified-prebeta-20261121. Build15 Local-First repair candidate is being prepared; not installed/accepted yet. C0 C0C23E00-5016-4289-B806-92C5484BD5BA only, art.xoery.otr, Shared DEV independent Synthetic QA B data. Original history/Session retained. No physical phone, main merge/push, protected Backend change or paid Provider activation.

Golden Slice: existing legitimate QA Account → new independent Trip → Day Feed/manual P1–P6 → Import → Ledger/Settlement → Sync/offline/cold recovery. A local view is not independent Cloud verification. No data reset to manufacture Guest state.

QA Trip a0bcf637-4d71-4d8b-ba17-a998d8917fe0: Native Beta Journey 20261121, Nov21–24. Creator/self plus QA Companion1121, normal Add Traveler and normal CreateTrip.

| Area | Current result | Actual evidence / next action |
|---|---|---|
| Existing Auth | UI_PASS | C0 retained QA B, normal Account/Trip UI; cold restart pending |
| First Guest / Auth transition | MC_INTERFACE_PENDING | NATIVE-GUEST-ENTRY-20261121; no reset, copied Session or new simulator |
| New Trip | NATIVE_PASS / QUEUE_COMPLETED | CREATE_TRIP + Person create + formal readback completed; independent server verification pending |
| Day Feed | CREATE_READ_PASS | Six manual types displayed; P3 check-in/out and P4 pickup/return displayed on correct dates |
| Focus / Details / Edit / Cancel | PARTIAL | P1 inline Focus observed; complete same-Item Edit/Cancel/Reopen still pending |
| P1 | CREATE_APPLIED | e7086247…; original formal receipt in CORE_LOCAL_RECEIPTS.json; independent server readback pending |
| P2 | LOCAL_CREATE_PASS | NZ9001 Sparse,71970e79…; LOCAL_CORE_COMMIT, formal opt-in remains closed in this baseline; no Cloud claim |
| P3 | CREATE_APPLIED / REPAIR_PENDING | be50008a…; first stale draft rejected, reopened Create saved; independent readback pending |
| P4 | LOCAL_CREATE_PASS / CLOUD_NOT_PASS | 7ca29d3e…; normal dates/times/same-return saved; original Cloud operation dependency/receipt recovery pending |
| P5 | LOCAL_CREATE_PASS / CLOUD_NOT_PASS | bbcbdcdf…; legal TRAIN only, endpoint labels retained; original operation recovery pending |
| P6 | LOCAL_CREATE_PASS / CLOUD_NOT_PASS | 587d6365…; name/venue/session/admission/entry fields saved; CORE_RECEIPT_READ failure handed to MC |
| Import | LOCAL_CUSTODY_PASS | cda66d73… /174683ae…; one synthetic TEXT input accepted and UI1saved; Analyze not clicked |
| Import AI / Results admission | NOT_VERIFIED | No paid Provider or protected Source scope opened by this task |
| Ledger | LOCAL_UI_PASS / QUEUE_COMPLETED | QA Harbour lunch NZD2400 minor, split1200/1200; SYNCED/server revision1; independent readback pending |
| Settlement | SUMMARY_PASS / READINESS_UNRESOLVED | Paid24, share12, owed12; Check final readiness has no visible outcome; finalization not claimed |
| Sync / offline | NOT_YET_VERIFIED | Ordinary Worker original-operation recovery preserved; no physical/simulated outage PASS yet |
| Cold recovery | NOT_YET_VERIFIED | Next: same IDs/fields/Import after Build15 in-place update and process restart |

## Repairs and protected boundaries

- Native draft false conflicts reproduced in deterministic tests: P3 MANUAL_PLAN_CONFLICT, P5 MANUAL_TRANSPORT_CONFLICT, P2 formal MANUAL_FLIGHT_READ_CHANGED after unrelated Item change. Candidate narrows unsent-draft checks to unchanged actor, authorization/roster, target facts and target revision. Exact retries, real permission changes and same-Item conflicts remain fenced. Review/device retest pending.
- Owner clarified P4 Create does not need supplier/model/plate inputs. Create UI remains unchanged; earlier proposed expansion was withdrawn. Those fields remain in Edit.
- P3/P5 participant options omit the unlinked companion while P1 includes it; sent to MC for exact existing qualification contract. Do not silently widen ACL.
- Device Hub AX/text works, but coordinate actions repeatedly return noWindowsAvailable. Owner assisted Calendar Done and Expense Save. This is not an autonomous navigation PASS. MC resource request NATIVE-C0-CUA-COORD-20261121.
- MC request NATIVE-PREBETA-CLOUD-READBACK-20261121 carries original operation/request IDs. No replacement operation or manual UNKNOWN replay.
