# P2 Manual Cloud — minimum owning difference

Status: DORMANT CORE CANDIDATE ONLY; deployed runtime, Native Form/Queue, capability and SQL unchanged. Owner's P5/P6 packet explicitly excludes P2 proof/qualification rights. This is the next precise interface to review, not a request to reuse Source authority.

## Verified current boundary

- `localManualFlightRepository.ts` retains airport/name/terminal and both local date/time/zone boundaries through `SAVE_AUTHORED_FLIGHT_LOCAL`. It is local-only, with qualification SPARSE.
- Formal `CREATE_SPARSE_FLIGHT` accepts flight-number literal, departure date, participation and ACL; it has no endpoint payload. Silently converting a filled Form into this payload would lose user fields.
- `tripCoreV2Commands.ts` rejects MANUAL `QUALIFY_FLIGHT`, `UPDATE_FLIGHT_FACTS` and `REPLACE_FLIGHT_SERVICE`, even if another lane supplied a valid Source proof. New regression in `tripCoreV2FlightAcceptance.test.ts` proves this without changing the graph; three affected suites/28 tests PASS.
- Existing Day Reader already projects SPARSE flight endpoints from `itinerary_transport_endpoints` and `trip_endpoint_details`; no new Reader, Item identity, Queue, API or commercial service is needed.

## Smallest formal port (Core candidate local; never deployed or enabled)

1. Keep formal `CREATE_SPARSE_FLIGHT` for the number/date anchor. Add one Core command candidate `SET_AUTHORED_FLIGHT_DETAILS` for the same existing Item, under MANUAL only, exact base revision and same Creator with receipted MANUAL Create provenance. Only SPARSE items qualify; reject QUALIFIED and Booking-evidenced Items rather than downgrade them.
2. Payload is the authored flight-number literal plus ORIGIN/DESTINATION airport code/name/terminal and existing authored civil boundaries. Nullable fields mean an explicit user clear; preserve all entered date/time/IANA-zone values. Keep instant, source_instant, proof/interpretation/provenance fields NULL and civil resolution PENDING. Airport code is an authored IATA value, not an accepted Airport/Place identity. No automatic UTC or physical-service qualification.
3. Reuse existing endpoint/detail rows and flight-intent literal; qualification remains SPARSE. No service, Segment, Journey, Booking, Ticket or Source/Evidence record is fabricated. Participation and visibility continue through their existing commands.
4. Native fresh Create atomically retains the anchor/details intents in the existing Repository/Queue. Use the existing Worker/receipts/Accepted snapshots; same-ID Edit uses the details command. Full fields remain pending until accepted; uncertain retries reuse immutable operations. Do not rewrite historical local journals automatically.
5. Core unique Writer owns finite command schema/mutation/validation and same-Item edit semantics. Native owns Form repository/normal runner classification/Accepted edit/readback. Backend unique Writer owns exact normal capability profile, family/command/child row fences and current four-or-more function CAS. Preserve all Source proof branches and existing P1/P3/P4/P5/P6 profiles. No public flight-result cache is involved.

## Required execution before any DEV authority change

Implement dormant command and targeted positive/negative tests, inspect live constraints read-only, prove actual isolated PostgreSQL Create/details/Edit/receipt/readback/replay plus foreign Creator/Trip/qualified rejection, independently review exact SQL/CAS/rollback, then present the precise P2 authority difference. No Schema/RLS/GRANT or protected role changes are assumed; any actual constraint incompatibility must be separately identified. Existing P5/P6 approval does not authorize installing this port.

Native P2 Cloud E2E remains BLOCKED until that owning port is fixed and approved. Local full-field UI and formal Import Sparse acceptance are separate evidence.

## Local Core candidate checkpoint

The finite schema/mutator now have a dormant candidate, reusing the exact authored endpoint validator extracted from local authority. Existing local commands retain their original capabilities/participation/ACL. Four suites/56 tests PASS after RED, full TypeScript and scoped ESLint PASS. This proves same-ID SPARSE authored fields, protected manual details, no service/UTC fabrication, stale/Source/foreign-Creator/Qualified rejection. Backend provenance qualification, exact SQL policy/CAS/rollback, Form-to-Queue conversion and live E2E are still absent. No new capability is installed; the current simulator/phone continue their previously fixed JS. Independent review NO_BLOCKER within the dormant Core boundary; independent four suites/42 tests PASS.

## Integrated dormant Native/Backend checkpoint

Native60471a40 and Backend79c998b5 are fixed on this lane only. Native private persistence stays behind the existing Flight repository, preserves historical LOCAL journals and complete endpoints, uses the existing Core transaction/Queue, and requires explicit `EXPO_PUBLIC_OTR_MANUAL_P2_FORMAL_ENABLED=true` plus Account/normal V2 Trip and max(config cutoff, 2026-10-28T02:16:48Z). Flag is not set on any device. It does not fabricate LocalCoreReceipt/Cloud success. 291 child tests, independent119 and parent210 targeted checks PASS. Backend old profiles remain accepted; exact P2 profile and Creator/SPARSE/zero-service/no-activeBooking/retained MANUAL SparseCreate proof candidate are fixed, parent74 tests PASS.

Latest Auth/Import main7ea was merged on own branch32177d3f; P1 keeps Owner's canonical Save label plus Auth handoffFrozen safeguards. Lookup-only test alignment: final four suites68PASS/types/UIguard. Capabilities parser negotiation adds `X-OTR-Core-Authored-Flight: 1` only on new-client capability GETs; absent/unknown support receives no new command enum. This prevents older v2 clients from closing existing P1/P3-P6 sync; it does not change SQL or submit authority. Two RED→three suites36PASS and independent50PASS, scoped lint0errors/four existing test import warnings, Backend bundle PASS.

The five-function persistent candidate is NOT approved or installed. Independent SQL review found raw CREATE_SPARSE_FLIGHT could UPDATE an existing unproved root/intent; INSERT-only and old-Source child/receipt cases are being tightened before any readiness claim. Actual DEV aggregate preimage was read only; no function/Schema/role/RLS/GRANT changed. Source-owner compatibility for its one changed read-state CAS will join the same precise Owner packet, preserving its already approved actor/Trip/expiry and keeping Source CLOSED.
