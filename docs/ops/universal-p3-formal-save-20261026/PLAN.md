# P3 formal Import slice — proposed, default closed

Baseline main1d7d2b9e; Native14332987/28f3ff82 readiness confirmed. Extend the existing Universal Item Source publication/Plan/Admission path, not a Manual Form or parallel authority.

1. First failing fixture: P3 ACCOMMODATION with exact property.name/check_in.date/check_out.date UTF8 evidence; current P1-only projection rejects it.
2. Minimum command: existing CREATE_ITEM, target ITEM/stable UUID, family P3; title and date-only start/end. PRIVATE/SELF defaults. Existing optional stay details/rooms remain absent. SET_STAY_DETAILS is reused only when evidenced optional fields are later selected; no required Contact/Instructions.
3. Keep original Candidate/Source fields, optional address/contact/instructions/guest and commercial observations. Do not infer accepted Place, Trip Person, Booking, Ticket or entitlement. NEW remains owning lifecycle qualification / explicit original+Trip confirmation.
4. Extend the existing purpose verifier with P3_ITEM and three required field proofs. Preserve P1 binding/hashes/replays; reject family/purpose mismatch and incomplete end date.
5. Extend existing publication/transport and current Actor/Trip/source read checks; default P3 runtime closed. No new Source, Task, Core, Auth or Reader.
6. Test projection, evidence tampering, unknown times, date reversal, replay, Core receipt and independent readback; coordinate accepted DTO with Native before GUI.
7. Prepare a separate precise default-closed DEV SQL/authority Gate with exact Candidate/target/operation/window/closure and rollback. Consumed P1 Gate never reused. Do not apply protected changes without Owner approval.
8. After P3 verified business Save/Native recovery, continue P2 via existing Sparse/Qualified Flight proof; Journey/PNR/Ticket are independent qualifications.
