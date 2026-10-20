# Create Trip v2 — minimum structured Destinations approval packet

**PROPOSED / NOT IMPLEMENTED.** Base `4eb27ecd584f17dc602b1fd558ede0bf9c05b4fe`; current registered SQLite max70. No DDL executed, registered, or applied to any device.

Current Writer/Reader/CREATE API have only `destination: string|null` (256 characters). CoreGraph `metadata` is a strict empty object. There is no legal ordered destinations/provider extension field. Flattening labels or hiding JSON in settings would not preserve the approved contract.

## Approval recorded

Owner approved the exact revised DDL SHA256 `fd503ea7e3d83cd28d2bbffc5e14a62025719a1ca41ebab3b0a42e0899bc18df` for local isolated implementation/validation. Registry was rechecked: prior maximum70, ID71 is unique. Device migration remains a separate Root serial Gate after independent Review. The proposal SQL bytes remain unchanged for audit.

## Exact minimum approval

Approve one local-only additive table in [proposed DDL](PROPOSED_DESTINATIONS_DDL.sql), the limited Create transaction and Reader below, migration tests and independent Review. ID71 remains proposed until the registry is rechecked. No Hosted SQL/API/permissions, account changes, provider activation, server proof, or Production operation. Device application requires the fixed candidate and serial Root preview handoff after independent Review.

- `destination_id`: independent stable local UUID; never a provider ID, MapKit handle, Trip ID or Account identity.
- Ordered maximum20 selected rows per Account/Trip (proposed bounded storage limit, Owner to confirm); label/typed metadata byte and character limits, source CHECK, scoped FK and unique ordered/provider/manual-claim indexes are explicit in DDL. No Provider response title/address/secondary/coordinate snapshots or raw JSON/tokens/payload, and no arbitrary expansion store.
- Source is explicitly MANUAL or APPLE_PLACE_ID. Manual gets no manufactured Provider identity or coordinates. Apple stable identity must be `MKMapItem.identifier?.rawValue` (SDK declares iOS18+), exposed separately as nullable `providerPlaceId` by the shared adapter. Current bridge does not expose it yet. Its current handle is request/session scoped and **must never be persisted** as a provider ID.
- Conservative first version: Apple results lacking a real identifier stay transient; explicit manual conversion is offered. No synthetic hash/coordinate/name becomes a Provider ID. iOS16.4–17 manual fallback remains usable. Only the actual Apple Place ID is retained with the user-confirmed business display label. Provider response details and coordinates stay transient; no indefinite Map Data cache is approved. [Apple WWDC24 Place ID guidance](https://developer.apple.com/videos/play/wwdc2024/10097/) describes durable Place ID references; the [current Program agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/) still governs use of other Map Data.

## Writer and Reader

`CreateTripInput.destinations?: readonly LocalTripDestinationInput[]` is a local extension, separate from strict Hosted `TripCreateRequest`. Validate exact discriminated source, UUIDs, actual Apple ID, fields and maximum20; selection is explicit and input facts are not Canonical place proof. Durable inputs are limited to destinationId, displayLabel, source, and real Apple Place ID; no response snapshot fields are accepted. Manual claim is NFKC + trim/collapse whitespace + lowercase authored label, strictly recomputed by the Parser, with a same Account/Trip unique index. Apple dedup uses its actual Place ID. Manual and Apple same-name entries are separate sources and never automatically identity-merged.

Within the existing account lease + SQLite transaction: establish the ordinary Trip/CREATE operation/creator, verify account/Trip/operation binding, insert the ordered destination rows, then existing additional named Persons. Any row/permission/error rolls back all objects. The existing CREATE_TRIP queue payload remains unchanged and cannot falsely claim the list was Server Accepted. Exact replay compares stored ordered identities and facts; changed replay rejects, never silently overwrites. No extra destination Sync operation until an owning server contract is approved.

Normal Trip Reader exposes `destinations` from these scoped rows, ordered by ordinal, retaining stable destination UUID and source/Provider ID across cold start. Legacy scalar `destination` remains readable as legacy authored text, without inventing provider identity or automatically backfilling. No flattening list into the scalar Writer. Existing Edit metadata must not erase destination rows. Destination editing/synchronization is a later owning slice; initial scope is Create/read/cold replay only.

Local Committed/Server Accepted remain separate: server rejection/bootstrap cannot silently delete these local rows. This approval does not certify shared/server destination sync. On explicit deletion use existing lawful Trip lifecycle; no orphaning or new account-sharing right.

## Tests, compatibility, rollback

Before device migration: frozen DDL/hash/registry review; migration68+69+70→proposed71 and repeated startup; old scalar Trip retained byte-for-byte; account/Trip cross-scope FK/permission rejection; stable IDs/order/source/real provider ID and same-source Manual claims; malformed/oversize/duplicate/null-vs-source checks; atomic Trip+creator+list rollback; cold read; exact and conflicting replay. P1/P2/Core and personal-photo rows must remain unchanged.

Feature rollback disables the new Writer/Reader presentation and keeps all committed rows/table/data; no DROP, reset, hidden scalar serialization, fake server success or forced account login. Old clients keep ordinary scalar behavior; their metadata saves do not delete the new table. Native VQA must cover multi-region explicit selection, custom fallback, cancel/draft restoration, offline create/cold read, order/dedup and same-Account identity protection. Existing mainHost Keychain compatibility remains an independent BLOCKED Native gate; no install is included merely by drafting this packet.

## Separate existing-field nickname extension

An optional local-only `creatorDisplayName` can target the existing creator `ledger_members.display_name` in initial Trip transaction, preserving independent personId/User mapping and Account profile. This needs independent Core Review but no DDL. Existing server bootstrap can later supply formal member names; no silent authority override is proposed. It must not be implemented by adding the creator as an additional traveler slot.
