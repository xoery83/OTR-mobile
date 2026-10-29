# P2 Formal Manual Native dormant candidate

Base `7b701e495c5ca13af51f1f1fe04db4c42c21d348`. Patch SHA256 `0e69bb50371f73fb6c1affe6c50d1771cd77023719fc09fbae0a42ca421a0bf1`. Prepared only in /private/tmp; no shared worktree, device, DEV, Host, Schema/RLS/GRANT or Backend edits. Depends on existing Core b3685197 authoredFlightDetails schema and SET_AUTHORED_FLIGHT_DETAILS; does not mint qualification, Booking or evidence. Parent Backend candidate79c998b5 and separately approved/current SQL are independent prerequisites, not supplied by this patch.

## Existing caller, default CLOSED

The existing readLocalManualFlightRepository factory wires one private persistence adapter into the same repository. Existing ManualFlightForm/P2Detail consumers are unchanged. New explicit EXPO_PUBLIC_OTR_MANUAL_P2_FORMAL_ENABLED must equal literal true, existing QA configuration must be sustained version2/matching Account/DEV API+transport. The P2-only cutoff is max(existing normal cutoff,2026-10-28T02:16:48Z); P1 configuration and its cutoff are never changed. A retained, identity-matching V2 Trip Create operation and account-scoped created_at must qualify. Between-cutoff V2 Trips remain LOCAL with no formal intents.

Future embedded-build allowlist must explicitly carry EXPO_PUBLIC_OTR_MANUAL_P2_FORMAL_ENABLED, default false/absent. This patch does not alter any device/build private environment or set this flag. Do not enable until the unique Writer confirms the formal Backend/SQL capability and serial QA window.

## Minimal flow

- Existing localManualFlightRepository delegates only explicitly marked new FORMAL_MANUAL drafts. Historical local journals/drafts, including journals on the same eligible V2 Trip, keep LOCAL_MANUAL authority and LOCAL_CORE_COMMIT. No scanning, conversion or replay upgrade.
- New formal Create uses existing tripCoreV2Repository.commitManualBatch/normal queue: CREATE_SPARSE_FLIGHT then SET_AUTHORED_FLIGHT_DETAILS, one Item ID, revisions null then1, two stable operation IDs, one SQLite transaction.
- Formal Edit uses SET_AUTHORED_FLIGHT_DETAILS then SET_ITEM_PARTICIPATION, same Item and actual read revision. No root SET_ITEM_SCHEDULE/PLACE or qualification/commercial mutation for P2.
- Airport code/name/terminal, independent local dates/clocks/IANA zones roundtrip through existing Core endpoints and endpoint-details. Storage minute→:00 expansion uses existing normalizeCoreClock while retaining precision. Unknown arrival date stays null, no fake timezone or source/instant proof. Formal P2 stays SPARSE.
- Only own visible/manageable SPARSE P2 with zero transport services and no active Booking link may edit. Pending Manual SparseCreate or full accepted immutable MANUAL SparseCreate+intent hash+completed queue+Actor/Trip/receipt hash proof is required. Source, Qualified, foreign Creator, stale draft and changed Account remain closed.
- Existing acceptedManualCreate verifier adds exact P2 SparseCreate recognition, retaining all other family checks. Normal dispatcher additionally checks Manual provenance/Creator/SPARSE/zero-service/no-activeBooking; Worker mirrors the P2 domain fence. Activity selection only schedules possible existing queue work; it grants no admission permission.
- Save acknowledgements preserve existing caller status LOCAL_COMMITTED, with formal authority MANUAL_QUEUE/localStatus PENDING/operationIds. They deliberately have no LocalCoreReceipt or ServerAccepted receipt. Existing local journal outcomes retain their genuine receipt. Actual receipt recovery remains with the existing worker and repository.
- ReadForForm prefers readable formal pending projection over stale accepted fields after Edit. Accepted Source/legacy read remains possible without granting Edit. No UI consumer, API, timer, second queue or migration changes.

## Recovery and test boundaries

The adapter verifies both retained operation/intent/queue pins and any APPLIED receipts before acknowledging a retry. Same saved draft survives actual SQLite close/reopen; partial/corrupt groups fail closed. Incomplete uncommitted drafts cannot be reconstructed as proofs. Transaction rollback retains original IDs and freezes an attempted input set. No local or fixture result is Cloud L3.

Final results/digests are in MANIFEST.json after all checks complete. The selected suites cover normal local P1/P5 behavior, formal P2 field roundtrip, exact retry and late failure, accepted Edit proof/Source/Qualified/Creator/service/activeBooking negatives, cohort default/floor/later-cutoff, queue family/backoff, Worker negotiation, existing Form consumer and migration-safe Core behavior. No Supabase/DEV queries are used.

## Remaining owning work

1. Parent independent review and serial application to a compatible descendant; do not overwrite later Auth/Guest/Source work.
2. Existing Backend and exact P2 SQL rights must independently pass their owning readback/negative/replay matrix. No global gate, Source Admission or qualified Flight permission is implied.
3. Root controls an explicit future embedded-build allowlist/flag and device window. Current simulator/phone builds are unchanged.
4. Real Native Manual Create/Edit→normal Queue→SERVER_ACCEPTED→independent Supabase readback→cold/offline/replay/permission checks remain pending. Accepted local fixtures and synthetic command storage cannot substitute for those receipts.
