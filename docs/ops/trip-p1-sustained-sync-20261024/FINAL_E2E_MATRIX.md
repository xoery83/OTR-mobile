# Sustained Trip/P1 — actual AD5 + DEV acceptance

Code `7253c12` (owning candidates `9aab884`, `e9e4fae`, `6e01a46`, `bfbc117`; Core postcommit wake `298b1e4`). Normal Synthetic A, SQLite74, current Backend6b11. No fixed QA Trip/Operation or expiring business-dispatch whitelist was installed; the approved service uses Account A and the immutable new-Trip adoption cutoff. Original account/data remain retained.

| Flow | Native | Queue | SERVER_ACCEPTED | Independent readback | Recovery |
|---|---|---|---|---|---|
| Create Trip | Two normal Form creates | Original Create COMPLETED | Two real receipts | Two exact Trip rows | Native cold name/date/full destinations |
| Edit Trip | Name/date/full-list Add/Remove/Reorder/Edit | Four Metadata COMPLETED | Exact Metadata receipts | Structured list identities/order retained | Native cold full list |
| Pending Create → Edit | Trip2 edited before acceptance | Deferred Edit materialized under original identity | Create original name, Edit final name | Current server edited value | Native cold final value; no overwrite |
| Add Traveler | Trip2 normal Add Traveler, Members and P1 picker | Person bee6… COMPLETED | Real Person receipt | journey_members / Core roster and immutable receipt | Unlinked Person retained; no Account claim |
| Create P1 | Two normal P1 Form creates | Same two original operations COMPLETED | Two APPLIED receipts | Two exact canonical Items | Real GET receipt/collection recovery, then cold UI |
| Edit P1 | Text, Nov2–3 range, manual place, selected Traveler; normal Save without restart | Five Edit commands COMPLETED, attempts0 | Five APPLIED receipts | Item revision6, exact fields and direct participant relation | Native cold Form restores all fields and selected Person |
| Offline / Retry / Idempotency | Actual retained pending + Native timeout/interruption recovery; physical airplane mode NOT_TESTED | Original identities retained; no replacement Item/operation | Original immutable results reconciled | Seven unique Core receipts / two Item identities | Offline/duplicate/CAS negatives are L2 fixtures; actual interruption/cold recovery is L3 |

Primary normal Trip2 scenario: `9a5b7ef6-db4c-4b33-be42-406cdfd292ab`, P1 `491fb764-892e-4c09-9f0d-fe181631a1be`, unlinked Person `0954dff9-a064-4763-8f7b-ec59fce9f521`. Final P1 `AD5 Sustained Auto P1 Verified`, revision6; Nov2–3, manual Queenstown Gardens QA meeting point, SELECTED_MEMBERS containing exactly that Person. Seven actual immutable Core receipts independently pass the existing hash validator. Native canonical collection revision9 matches the real server fields. Latest normal Save3334… automatically completed; Home remained on-screen and its next direct tap opened the new accepted source, without restart/navigation workaround.

Trip2 Ledger initialized under the same Account/Trip and normal zero-expense Currency Preview/Commit NZD→USD, revision2; independent readback and Native cold USD retained. Trip1 date/full two-destination list and Trip2 Add/Remove list remain correct; no scalar substitution.

## Evidence / review

- `receipts/P1_FINAL_INDEPENDENT_SERVER_READBACK.json`: final direct trips/items/participants/ledger rows and seven Core receipts, normal approved DEV only.
- `receipts/FINAL_P1_IMMUTABLE_RECEIPT_VALIDATION.json`: all seven stored receipt/intent hashes validated with the owning validator; no additional remote reads.
- `receipts/FINAL_NATIVE_COLD_HOME_P1_ACTUAL.json`, `P1_EDIT_NATIVE_QUEUE_COLLECTION_ACTUAL.json`: actual Native Form/queue/readback/cold recovery.
- `receipts/SYNTHETIC_B_CORE_DENIED_ACTUAL.json`: normal Auth B cannot read A Trip;404 NOT_VISIBLE. Earlier normal Native account switch/empty My Trips evidence retained.
- Scoped independent reviews: timeout27, accepted-P1 entry111, Person options28, postcommit wake37, Home completion83. No open P0/P1/P2 in those fixed reviews; [Final evidence Review PASS](reviews/final-evidence/INDEPENDENT_REVIEW.md), limited to the recorded actual scenarios. Root TypeScript/scoped lint/UI guard passed; no unrelated full-system retest.

## Final operating boundary and limits

Approved sustained DEV service remains operational, not a finite QA window. Final SQL scope read confirms four limited roles, one enabled Synthetic A policy, and all six old finite gates CLOSED. Backend health development/ok; exact approved image/Bundle/environment/user/mount/runtime/full raw HostConfig hashes match. Initial differently normalized HostConfig comparison and its exact reconciliation are both retained; no deployment/configuration was changed. Universal Source/Provider activation was not performed. Private service credentials remain in their existing protected location; no Session/Keychain copy.

Additional96-read ledger at this checkpoint: Native42/72 + Operator6/24 =48/96 consumed, including failures/replays. Original192 allowance is not reset. No additional Trip/Person/P1 allocation or 48-mutation allowance was granted; current object counts2 Trips/2 extra Persons/2 P1 Items. No more business mutations are planned for this closure.

Known retained QA exception: first controlled-outage Person operation4d0b… remains in its approved retry backoff (next10:18 UTC); its recovery is NOT claimed. The normal Trip2 Person is fully accepted. No all-history/all-queue-clean, bulk replay, old V1 migration or physical-airplane-mode PASS is claimed. Original history and its preservation receipts remain intact. Cloud sync acceptance is specific to the approved DEV shared fields/commands, not a Production or P2–P6 claim.

Data Path Checklist: Cloud-shared Trip metadata/structured destinations, Person and P1; SQLite74 repositories; existing Queue/Operation/Backend V3+CoreV2/owning SQL and immutable receipts; original offline/CAS/idempotency/account fences; actual L1/L2/L3 positive paths with negative evidence scoped above; remaining deltas are the retained outage Person retry and the separately gated Universal Source/Provider/Review/Admission line.
