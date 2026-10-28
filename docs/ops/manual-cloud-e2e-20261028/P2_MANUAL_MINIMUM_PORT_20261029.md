# P2 Manual Cloud — minimum owning difference

Status: CANDIDATE ONLY; runtime, capability and SQL unchanged. Owner's P5/P6 packet explicitly excludes P2 proof/qualification rights. This is the next precise interface to review, not a request to reuse Source authority.

## Verified current boundary

- `localManualFlightRepository.ts` retains airport/name/terminal and both local date/time/zone boundaries through `SAVE_AUTHORED_FLIGHT_LOCAL`. It is local-only, with qualification SPARSE.
- Formal `CREATE_SPARSE_FLIGHT` accepts flight-number literal, departure date, participation and ACL; it has no endpoint payload. Silently converting a filled Form into this payload would lose user fields.
- `tripCoreV2Commands.ts` rejects MANUAL `QUALIFY_FLIGHT`, `UPDATE_FLIGHT_FACTS` and `REPLACE_FLIGHT_SERVICE`, even if another lane supplied a valid Source proof. New regression in `tripCoreV2FlightAcceptance.test.ts` proves this without changing the graph; three affected suites/28 tests PASS.
- Existing Day Reader already projects SPARSE flight endpoints from `itinerary_transport_endpoints` and `trip_endpoint_details`; no new Reader, Item identity, Queue, API or commercial service is needed.

## Proposed smallest formal port (not implemented or enabled)

1. Keep formal `CREATE_SPARSE_FLIGHT` for the number/date anchor. Add one Core command candidate `SET_AUTHORED_FLIGHT_DETAILS` for the same existing Item, under MANUAL only, exact base revision and same Creator with receipted MANUAL Create provenance. Only SPARSE items qualify; reject QUALIFIED and Booking-evidenced Items rather than downgrade them.
2. Payload is the authored flight-number literal plus ORIGIN/DESTINATION airport code/name/terminal and existing authored civil boundaries. Nullable fields mean an explicit user clear; preserve all entered date/time/IANA-zone values. Keep instant, source_instant, proof/interpretation/provenance fields NULL and civil resolution PENDING. Airport code is an authored IATA value, not an accepted Airport/Place identity. No automatic UTC or physical-service qualification.
3. Reuse existing endpoint/detail rows and flight-intent literal; qualification remains SPARSE. No service, Segment, Journey, Booking, Ticket or Source/Evidence record is fabricated. Participation and visibility continue through their existing commands.
4. Native fresh Create atomically retains the anchor/details intents in the existing Repository/Queue. Use the existing Worker/receipts/Accepted snapshots; same-ID Edit uses the details command. Full fields remain pending until accepted; uncertain retries reuse immutable operations. Do not rewrite historical local journals automatically.
5. Core unique Writer owns finite command schema/mutation/validation and same-Item edit semantics. Native owns Form repository/normal runner classification/Accepted edit/readback. Backend unique Writer owns exact normal capability profile, family/command/child row fences and current four-or-more function CAS. Preserve all Source proof branches and existing P1/P3/P4/P5/P6 profiles. No public flight-result cache is involved.

## Required execution before any DEV authority change

Implement dormant command and targeted positive/negative tests, inspect live constraints read-only, prove actual isolated PostgreSQL Create/details/Edit/receipt/readback/replay plus foreign Creator/Trip/qualified rejection, independently review exact SQL/CAS/rollback, then present the precise P2 authority difference. No Schema/RLS/GRANT or protected role changes are assumed; any actual constraint incompatibility must be separately identified. Existing P5/P6 approval does not authorize installing this port.

Native P2 Cloud E2E remains BLOCKED until that owning port is fixed and approved. Local full-field UI and formal Import Sparse acceptance are separate evidence.
