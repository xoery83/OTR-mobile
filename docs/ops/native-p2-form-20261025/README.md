# P2 Manual Form candidate — 25 October2026

Owner directs Create/Edit before real Trip flight-data acceptance for the fidelity port. Booking-document upload/autofill excluded. Supplied Part1 zipSHA f3ea62ddb6affb97ab5f4ce80a7bf13a2a4f7fe3d79291606965b4f84ccd6ba8 matches the frozen P2 design source.

## Implemented candidate

Reuses ManualFlightForm/ManualFlightEditor, canonical header Save/Cancel, input captions, native calendar/time controls and P1 PlanParticipantsField. Full manual airport names/codes, independent local endpoint dates/times/zones, all segment drafts expanded, explicit draft add/remove confirmation. Unknown fields stay empty; no provider, booking reference or protected proof is invented. A selected but unconfirmed date/time picker prevents submission of old values. Discard synchronously invalidates retained Save callbacks before React cleanup.

The existing lawful sparse writer now accepts its already-supported participation payload, strictly rejects unknown extra fields, verifies participation on recovery and preserves original draft/operation identity. Form reading reuses the existing actor-filtered combined Core Day Reader and pins requested revision. Sparse CALENDAR start/end maps back into Form fields. No new Reader, Core Item, queue, authority, migration or Auth path.

## Deliberate gates

Only a single flight-number/departure-date/participation create can commit through the current approved sparse port. Filled airport/time/arrival fields, multi-flight Journey or Edit changes block submission with a truthful hint; fields are never truncated. All such changes remain an in-memory draft until Cancel; no durable pre-submit Draft store is added. Full endpoint Edit and confirmed Journey persistence remain BLOCKED_BY_OWNING_INTERFACE; see CORE_INTEGRATION_REQUEST.md, sent as a fixed minimal packet to the coordinator. No Backend/DEV write scope was expanded.

DEV-only `day-feed-lab?fidelity=p2-form&tripId=...&item=...&revision=...` inspects the same authenticated real-item Edit draft. Invalid IDs/revision redirect; release guard prevents loading it. It supplies no fixture IDs or permission. Production Create still uses the existing Add itinerary entry.

## Validation

35 focused Form/strict draft/real disposable SQLite tests PASS; TypeScript/UIguard/scoped lint PASS. Independent review PASS after fixing sparse date readback and same-turn Save-after-Discard. Negative roster, Account change, idempotent receipt/reopen, input preservation and unconfirmed-picker submission are covered. The legacy migration-gap test fixture was corrected for dependent73/74 and current independent Trip tables; the public migration registry is unchanged.

Native Forms QA: IN_PROGRESS, not PASS. Cloud E2E: NOT_RUN / existing gate closed. Native receipt and screenshot pins will be added after normal UI acceptance. P1/P3 fixed candidates and data remain retained.
