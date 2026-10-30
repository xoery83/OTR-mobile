Candidate only; no Hosted installation or runtime wiring is authorized by this directory.

The next slice is original Owner → adopted Trip → Add Traveler → existing Person queue and receipt → cold recovery.
Normal target-Account OTP and the existing operation-addressed TripCreate receipt GET passed; see `../ADOPTED_PARENT_INTAKE.json`.
Discovery has no creation-operation locator and publication does not persist an Account-scoped mapping. Guest repositories remain Guest-only.

This candidate locates one already-owned format2 receipt by Actor/Trip, then delegates to the unchanged owning `trip_create_result` routine and DTO.
It creates no table, role, identity authority, queue, local Trip or cache. Ambiguous receipt lineage fails closed.
Any new function EXECUTE needs unique Core review and an exact Owner DEV Gate. Backend/Native wiring remains pending; other remote or legacy Trip authoring is not claimed.

The optional `TripCreatePort.parentReceipt` handles GET `/v2/trips/:tripId/create-receipt` with version2, private/no-store response and exact Actor/Trip checks.
`createTripParentReceiptPgReader` is a separate adapter: default `createTripPgStorage` does not expose it. No Bootstrap or app-route mounting changed.
The existing transport supplies the frozen Account/Trip context. The existing Person repository reads a validated Core collection, checks the current receiving context in its transaction and queues only the new Person with the real server parent operation; it never inserts a Trip/CREATE_TRIP row.
Local checks: original+new repository36 plus cache-race1 PASS; HTTP/PG/transport3 suites48 PASS; typecheck and scoped lint PASS. These are local fixture proofs, not adopted-Trip Native E2E.
