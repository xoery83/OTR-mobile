# Nelson field coverage — Phase 2

31 October 2026. Owner's25-row evidence/preview remain private local artifacts,
not repository fixtures or DEV writes. Family totals: P1=9,P2=3,P3=8,P4=2,P5=3.
This matrix describes formal owning contracts, not an executed import.

| Field / family                | Existing owning contract                                                     | MCP Phase1 gap / minimal Phase2 adapter                                                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dates/local clock P1/P3/P4/P6 | Core schedule + Native manual authoredBoundary                               | Add explicit civil minute/zone inputs; retain core ESTIMATED/PENDING until owning temporal qualification. Never infer UTC/zone from device or put clocks in Notes.                                  |
| Location                      | corePlaceSchema / TEXT_ONLY authored label/address                           | Preserve authored place/address, no fabricated qualified place IDs or geocoding.                                                                                                                    |
| P1 hikes                      | CREATE_ITEM/P1 schedule/place                                                | Explicit planned clocks and route description; no claim of checked current conditions.                                                                                                              |
| P3 stay                       | CREATE_ITEM/P3 details/rooms                                                 | Permitted check-in/out distinct from actual/estimated arrival; preserve no-booking semantics.                                                                                                       |
| P4 rental                     | CREATE_ITEM/P4 schedule/details/places                                       | Supplier/reserved category/or-similar plus pickup and return; never imply actual vehicle/plate or payment.                                                                                          |
| P5 water taxi                 | CREATE_ITEM/P5 endpoints/service/operationalFacts                            | Existing WATER_TAXI is supported. Match Native's unspecified service defaults instead of inventing operator IDs; retain endpoint clocks/places and check-in separately.                             |
| P2 sparse flight              | CREATE_SPARSE_FLIGHT then SET_AUTHORED_FLIGHT_DETAILS                        | Create and detail are separate existing Core operations. Do not silently save a dated title while dropping source clock/airports. Missing flight literal remains blocked; no guessed return number. |
| P2 qualified flight           | QUALIFY_FLIGHT + proven identity/temporal fields                             | No evidence qualification bypass. Original evidence links require Import owning Source/Admission; manual prose is not Track-C proof.                                                                |
| Date/time edit                | SET_ITEM_SCHEDULE; SET_TRANSPORT_DETAILS; flight authored/qualified commands | Explicit current revision and complete replacement of supported authored fields. Existing qualified/exact tuples must never be erased by a date-only edit.                                          |
| Booking/payment/People        | Separate owning contracts                                                    | Outside this adapter: provider/Owner confirmation can inform preview, not synthesize Booking/Ticket/Expense/Participant writes.                                                                     |

Initial adapter work should reuse core schemas for final validation. No Native
repository import into the Node server (would pull SQLite/Auth/UI lifecycles).
Keep only small field conversion at MCP boundary; Core remains validator/writer.

Remaining real-plan questions: missing flight identifiers/evidence, one motel
occupancy mismatch and unbooked city stays. They remain per-row private warnings.
No real targetTrip/account or snapshot has been selected yet, so the local25 rows
are not a current-cloud structured diff or approval-ready Apply batch.

Current local adapter result:22 non-Flight rows validate Manual create input;
1 outbound Flight can use sparse Create then a separate complete authored-details
operation (Core also changes title to literal);2 Flight rows have no literal and
remain blocked. Date/time fields are formally retained as civil/PENDING, not
exact instants. This is schema coverage only, no target Snapshot diff or cloud
save. The per-row source-linked artifact remains private outside Git.


Actual DEV qualification exposed a protected operational-fact gap: the current
scoped MANUAL `trip_core_guard_write()` table allowlist excludes
trip_transport_operational_facts. The single synthetic check-in command returned
503, not APPLIED. Core unique Writer must qualify/fix that exact port; the two
real-plan water-taxi check-in fields remain pending. Do not move those clocks to
Notes or silently omit them. Base subtype/endpoint schema coverage is not proof
that this protected supplemental field is writable. Evidence:
acceptance/P5_FIELDS_OWNING_GAP.json; no third POST is allowed by the QA runner.
