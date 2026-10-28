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

Native Forms QA bounded local slice observed on form source3dbdce11: normal Add itinerary → Flight, explicit Oct25 context, ZZ2501 + Everyone saved through the existing lawful sparse port. One LOCAL_MANUAL commit7e57f799 / Item a8d21da2 / one additional queue operation, attempts0. Process cold launch retained the independent Account/Trip and identical commit/slot/queue; same Form real Edit read restored literal/date/Everyone. Edit draft mutation → Discard → reopen restored ZZ2501, with no new write. Existing five P3 manual-intent hashes and prior queue entries retained. See receipts/*.json.

Native manual endpoint input blocks Save rather than dropping AKL; Stay retained entered fields; unconfirmed date picker disabled Save; multi draft expanded and scoped Remove confirmation observed; draft-only operations produced no commit/queue. Shared P1 Participants picker, long-form scrolling, keyboard, English Light and Chinese Dark were observed. Full Edit mutation, multi/endpoint writes, durable pre-submit Draft and native injected-error recovery are NOT PASS (the latter covered by focused repository/component tests only). Cloud E2E NOT_RUN / existing gate closed. Screenshots are pinned in NATIVE_CAPTURES.json. P1/P3 fixed candidates and data remain retained.

Follow-on real Reader correction: only explicit existing Core SPARSE flight facts may use FlightFidelityGrid. It displays actual literal/date, no invented airport/service/clock/instant, and uses existing localTargetIds for waiting-to-sync status. B/F/I and calendar/viewport sorting retain the existing Day Feed authority. Qualified-flight/Journey fidelity remains a separate pending slice.


Final sparse display candidate3090cc8e: real Item a8d21da2 observed Browse → Focus → Immersive → Close on Forms QA, with actual literal/date and waiting-sync label only. Captures are evidence of the bounded real Reader slice, NOT the final P2 nine-state or Journey fidelity acceptance. Existing Focus-collapse/default detail chrome remains for the later P2 fidelity stage. Final readonly receipt still1commit/1slot/8queue/attempts0. Independent review PASS;37 presentation/Grid/navigation tests +35 Form/repository tests PASS, TypeScript/UIguard/scoped lint PASS. New Grid native mock dependency fixed in existing navigation suite; existing unrelated legacy render-suite gaps remain unclaimed. Immersive HeaderSlot follows the existing renderer Slot pattern, avoiding render-time callback/ref lint without changing the optional API or close semantics.


## Airport single input and automatic IANA zones — 397c5dd3

Owner's Part1 visual reference12 is used for one From/To airport input rather than separate code/name fields. Frozen text still controls flat Edit segments and P1 Participants; no upload/autofill, accordion or invented booking facts added. Each airport searches the existing full Workbench AIRPORT-REF-01 descriptive source offline. Explicit selection atomically populates code/name and a coordinate-derived IANA zone; new text clears stale counterpart/zone. Non-match manual entry stays available. Known automatic zone is a quiet summary; unknown/conflicting/runtime-unsupported zone keeps manual input.

9298 coded, non-CLOSED source records;9241 automatic zones,57 unresolved including25 retained-airport-zone conflicts. No country/phone-zone guess. Build-only geo-tz8.1.10 comprehensive boundaries are NOT Native runtime dependencies. Only compact945KB result bundled. Source hashes, source/code/boundary pins, licenses and reproducible build script are retained under src/features/day-feed/data and scripts/native-forms. This is a descriptive Form prefill, no Core identity or Source proof.

DST uses IANA identifiers rather than a fixed current UTC offset. Tests cover Auckland summer13/winter12, spring01:30→03:30 gap and repeated autumn02:30 fold by forward formatting, plus existing Core refusal to treat PENDING/GAP/FOLD as comparable. No reverse civil resolver exists in this lane: formal local date+minute+zone → unique instant remains a specific owning-interface requirement before full manual endpoint writes, notifications or exact duration. DST Native reverse-resolution acceptance is NOT PASS.

127 focused airport/Form/repository/Core time tests PASS, TypeScript/UIguard143files/scopedlint PASS; independent Review PASS after adding strict build input/code/boundary hashes and distinguishing expected npm archive integrity. Native Forms QA observed AKL code→Auckland/Pacific-Auckland; Narita name→NRT/Asia-Tokyo; NRT→DOV clears Tokyo and shows empty manualzone; Dark hot-switch retains drafts. Cancel→Discard left all prior commit/slot/queue/P3 hashes identical, attempts0. Screenshot pins in AIRPORT_NATIVE_CAPTURES.json; read-only receipt retained. Full endpoint/Edit/Journey Save/Cloud gates unchanged.
