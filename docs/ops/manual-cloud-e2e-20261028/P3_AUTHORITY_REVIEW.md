# P3 Manual DEV authority candidate — approval required before install

Owner task permits implementation/deployment but explicitly retains approval for business Authority expansion. Normal existing sustained capabilities expose onlyP1. This candidate remains NOT_INSTALLED, no Cloud PASS.

- Replace four existing functions atomically: `trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text)`, `trip_sustained_core_capabilities(uuid,uuid)`, `trip_core_guard_write()`, `trip_core_finite_read_state_guard()`.
- Reuse existing scope helper with narrow `CORE_P3` selector, not another API/Queue/authority table. Existing gateway/writer principal, role membership, enabled policy, creator and linked-owner checks remain.
- Only Forms QA Synthetic account `3f7e964e-79d3-4028-a585-470e798e41ec`, its normal V2 CreateTrip receipt created on/after `2026-10-28T02:16:48Z`, and existing policy adoption cutoff. Older Trips cannot gain P3. Native QA normal cutoff will match this new boundary; old QA queues stay retained.
- Allow that scope to use normal MANUAL P1+P3 profile: CREATE_ITEM, SET_ITEM_TEXT, SET_ITEM_SCHEDULE, SET_ITEM_PLACE, SET_ITEM_PARTICIPATION, SET_STAY_DETAILS. P3 writes only its Item/details/rooms/participants/visibility and immutable receipts/read-state. Same-Creator Edit required. P1 cannot use Stay command/table. Contact/Instructions remain separate.
- No new table, function, role, GRANT, RLS, Schema version or LOGIN; no policy row or adoption cutoff changed. Source/REVIEWED_SOURCE branches and original P1/Person scope retained. No temporary admin credentials, no borrowed Import rights, no provider/Enrichment activation. Existing authorized management CLI applies approved exact SQL; existing normal runtime roles remain in use.
- Install/rollback compare exact prior/post function MD5; CREATE OR REPLACE retains OID/owner/ACL. Any drift means stop/rebase with current unique Writer. Rollback closes new P3 writes and retains accepted rows/receipts.

Validation:8suites103PASS/typesPASS/default-CLOSED Backend buildPASS. Independent Review resolved Queue retry omission and SQLNULL failure mode; no remaining blocker. Network-none owned PostgreSQL tests use existing sustained P1 fixture with only disposable identities and CLOSED Import dependency. Actual P3 Create+five Edit commands, exact replay, validated collection+revision6/details, cross-Account denial, missing family/admission receipt/read-state denial, exact rollback/data preservation, original function OID/owner/ACL PASS. This is L2 only, not DEV or Native L3.

SQL SHA256:
- 20261028000100_manual_p3_dev.sql: `68dd976c0c72e6f07212c619abfe0bbbad87940fb0151e51bc362bb09c653d61`
- 20261028000100_manual_p3_dev.rollback.sql: `dc4fcbcbc2cf7a7e39192d6e4ebd0e40ee8db4f64bdad2e01e05448164f28b2f`

Approved next execution would: coordinate DEV Writer; reseal fresh live image/config/function preimages; build exact candidate; normal Login/session retained; create independent Synthetic Trip; deploy ordinary Backend code preserving existing flags/config; install approved SQL only after exact drift checks; run Create/Edit/independent readback/Native cold recovery and negative tests. No paid model call. This is sustained QA capability, not a temporary global Gate window.
