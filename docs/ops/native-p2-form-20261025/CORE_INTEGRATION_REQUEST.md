# P2 Manual Form: minimum owning-interface request

Owner explicitly directs P2 Create/Edit before producing real Trip test data for the Day Feed port; booking-document upload/autofill is excluded. Reuse ManualFlightForm/localManualFlightRepository; do not create a second Form, Item, queue, Admission or Journey store.

## Fixed evidence

- Supplied Part1 zip SHA256 `f3ea62ddb6affb97ab5f4ce80a7bf13a2a4f7fe3d79291606965b4f84ccd6ba8` matches the already frozen P2 package's Part1 source. Product Delta and UI Blueprint require manual endpoint correction, all segment editors expanded, P1 Participants, and explicit durable Journey membership/order.
- Existing approved dependency supplement GAP02/03 forbids manufactured proof or UI-owned grouping persistence.
- This lane base cdd9d271; current Universal fixed2085d9b8 retains the same local manual command restriction. Do not merge its active branch to obtain unrelated code.
- `localManualFlightRepository.save` accepts only flightNumberLiteral/departureDate and calls `prepareLocalManualSparse`.
- `localCoreAuthority.localPayloadSchemas` has CREATE_SPARSE_FLIGHT, QUALIFY_FLIGHT, CREATE_BOOKING and CREATE_BOOKING_EVIDENCED_FLIGHT_LOCAL. LOCAL_MANUAL output is restricted to CREATE_SPARSE_FLIGHT.
- Protected QUALIFY/UPDATE_FLIGHT_FACTS proof kinds remain TRACK_C/RETAINED; manual typing cannot supply those proofs.
- Current Core flight view exposes per-Item facts, but no confirmed flight-Journey membership/order read. Shared Booking IDs or airport/time adjacency are not a substitute.
- Current local collision assessment proves only the first manual flight in an empty relevant scope. Additional manual flights need its existing owning assessment, not an artificial empty scope.

## Minimum serial integration needed

1. Identify/reuse a lawful manual-origin endpoint create/update executor with actor, revision, provenance, local commit/queue, idempotent recovery and conflict protection. No fabricated provider/OCR proof; no changes to protected admission gates.
2. Expose its typed Form repository adapter for reading an editable draft and saving precisely the fields shown. An unsupported filled field must block the affected save, never be silently omitted.
3. Identify durable explicit Journey identity/membership/order plus read/mutation ports for multi-segment Create/Edit. The owning Core writer decides the smallest representation; this lane creates no parallel grouping table or local JSON authority.
4. Reuse existing collision/claim assessment for additional segments and specify atomic/recoverable multi-segment results. Preserve actual Booking identities.

This packet requests only a bounded shared-interface decision/unique-writer serial integration. It does not request deployment, SQL/RLS, Auth changes, DEV activation or Universal's ordinary coding/review time. Native fields, validation, Cancel/recovery tests and existing lawful sparse-create verification continue independently. Full P2 Form remains blocked until the relevant owning ports exist; no Cloud E2E claim.
