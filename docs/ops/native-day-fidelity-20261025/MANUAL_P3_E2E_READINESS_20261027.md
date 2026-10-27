# Manual P3 E2E readiness — bounded independent audit

Read-only subAgent audit at Native `6d9d8fb7cbd395a160c39fb57c34233ca386ff98`; locally available main `93882127dca86dcea78a507d74a0d07a748c6584`. Three directed suites /24 assertions PASS. No deployment, GUI, Core/SQL change or remote-main assumption.

**Manual P3 is LOCAL_PASS / CLOUD_PENDING.** Universal's separate P3 Import receipt does not authorize Manual Create/Edit.

| Owning interface | Reuse | Minimal work before Manual L3 |
| --- | --- | --- |
| Native Repository | `manualStayRepository.ts` reuses `manualPlanRepository.ts`; existing CAS, frozen retry, Core Item ID and durable queue | `manualPlanRepository.ts` currently permits only predicted P3 Edit. Add an owning, source-qualified Manual accepted-item Edit port; do not open every accepted P3. |
| Native normal sync | Existing `tripCoreV2SyncWorker.ts`, receipt-first restore and queue | `tripNormalSync.ts` and `tripNormalCoordinator.ts` still select P1. Extend the approved family/command selection, participant prerequisites and recovery binding in that runner. |
| Unique Core/Backend Writer | Existing CREATE_ITEM, generic SET, SET_STAY_DETAILS and atomic Repository queue | Extend Manual P3 policy/capabilities in `backend/src/tripNormalP1Policy.ts`, `tripCoreV2PgRead.ts`, `tripCoreV2PgStorage.ts` and sustained permissions. A finite P3 CREATE fallback is not standing Manual authority. |
| Native field mapping | Dates, civil clocks, Notes, participation and property/windows persist locally | Map the real street address to its owning address field, with compatibility for old `authored_label`; an Apple selection is not Core qualification. |
| Universal Source/Evidence Adapter | Existing formal Import pathway | No new Source Adapter is required for hand entry. Do not fabricate REVIEWED_SOURCE. Later AI→Form expansion is a distinct Source/Evidence/Review change. |

Universal accepted scope, from `docs/ops/universal-p3-formal-save-20261026/P3_FORMAL_SAVE_E2E_RESULT.md`: CREATE_ITEM(P3), REVIEWED_SOURCE, title/check-in/out dates, PRIVATE SELF, SERVER_ACCEPTED + independent SERVER_VERIFIED + duplicate/cold restart. Evidence `c7d129c773c3253255a5701cc46ac5f3648db586`; Native entry `3f067720016f74f1d2977d910fb3a00b9d883c44`. This receipt does not cover Manual GROUP/selected participants/address/clocks/Notes/Edit.

Contact and Instructions remain separate owning gaps: current ManualStay schema has no formal Contact/Instruction port. Contact belongs to Booking; Instructions have APPEND/CORRECT commands. Neither may be hidden in Notes or attached to a fabricated Booking. Current unsaved Draft is transient; saved-item cold recovery does not prove unsaved Draft durability.

## First Manual cloud slice after Enrichment

Use one newly accepted Forms QA Synthetic Trip, then Manual P3 Create→server acceptance→independent readback→same-ID Edit→offline/repeated replay→cold restart. Reuse the existing Repository/queue/worker. Prove Edit still works after acceptance before expanding to more shared fields.

P2 LOCAL_MANUAL journal and P4 SET_RENTAL_DETAILS require their own family authorization and L3 receipts. They do not inherit Manual P3 or Import permission. Deliver serially, with fixed candidates and reviewed protected differences; no simultaneous P2–P4 writers.

## Additional Forms QA deployment preflight

Primary ignored `.env.local` currently has no `EXPO_PUBLIC_OTR_API_BASE_URL`; its retained finite Native QA scope expired25Oct. Current tool environment also has no API base URL. Enrichment capability reads use `createApiClient`, which requires that URL. The new device deployment must explicitly pin `https://api-dev.xoery.art` and a legitimate Forms QA normal-sync scope/new-trip cutoff. Do not reinterpret the expired finite scope, flush historical queues, copy AD5 sessions or relabel old QA data. Old local trips/rows remain retained; fresh Backend acceptance uses a separate Synthetic Trip. A linked Backend URL alone does not establish P2–P4 mutation permission.
