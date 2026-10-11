# Core v2 executable Capture handoff — 2026-10-12

Base741579c; isolated branch codex/trip-core-v2-w1-w5 at
/private/tmp/otr-trip-core-v2-20261012. W1/W2/W3/W5 continue; W4 remains Capture-owned.
No hosted/native/provider/business activation is authorized or performed here.

| Interface                                               | Implementation                                                                           | Readiness                                                                                                                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finite command2/candidate2/receipt2 versions            | src/domain/trip/tripCoreV2Commands.ts, tripCoreV2Receipt.ts; W0_CAPTURE_HANDOFF_CONTRACT | IMPLEMENTED_AND_TESTED — synthetic; runtime CLOSED                                                                                                                            |
| Source prepare/status/finalize2                         | backend/src/tripCoreV2Source.ts                                                          | IMPLEMENTED_AND_TESTED — owning transaction port;27 actual SQLite/command-service tests PASS; PostgreSQL Source binding unfinished                                            |
| Source sibling purpose/continuity                       | flightOutputPurposeV2.ts                                                                 | IMPLEMENTED_AND_TESTED — immutable actual identities, ancestry and all legacy claims; whole-Source retiming denial tested; extraction flags never authorize                   |
| Guarded Core commands and exact recovery                | backend/src/tripCoreV2Commands.ts                                                        | IMPLEMENTED_AND_TESTED — atomic transaction port; prior exact receipt before fresh gate, terminal rejection and status-only redaction tested; production PG writer unfinished |
| HTTP core capabilities/commands/operations/source-plans | backend/src/tripCoreV2Http.ts + app.ts                                                   | IMPLEMENTED_AND_TESTED — authenticated routes; no default connection; CLOSED/503; no v1 fallback                                                                              |
| SQLite account mirrors and pending/receipt state        | migration54 + tripCoreV2Repository                                                       | IMPLEMENTED_AND_TESTED —9 actual SQLite tests PASS; stable UUID/offline restart; pending prediction is outside accepted certificate                                           |
| Existing sync executor + authenticated client           | tripCoreV2SyncWorker.ts, tripCoreV2Transport.ts                                          | IMPLEMENTED_AND_TESTED — CLOSED negotiation/recovery/account fences; delivery stays blocked; five legacy C operations unchanged                                               |
| Schema / privacy guard                                  | additive Core85/86                                                                       | IMPLEMENTED_AND_TESTED — fresh isolated Server84 clone+RLS PASS;329 historical functions unchanged; NOT installed on Hosted DEV                                               |
| Booking/Entitlement/P3–P6 domain/read                   | finite reducer, Day and supplemental view                                                | IMPLEMENTED_AND_TESTED — synthetic finite domain; custody/Ledger owning capability pending; non-Flight Source slots retain REVIEW                                             |

Capture may build bounded v2 adapters against these interfaces and retain candidates,
originals and immutable proposal IDs. Do not enable a queue, host, extraction/provider
call or old Source workflow from these synthetic results. Candidate2 input and whole
sealed Source/input/candidate hashes must be verified by the actual owning transaction.
A leaf/date/airport tuple does not prove a retimed flight is an independent physical
leg. Legacy UNKNOWN/SUCCEEDED stays a purpose gate unless the owning legacy recovery
proves exact retained target identity or trusted NO_COMMIT; never drop claims or mint
v2 proof for an old receipt. Pending non-Flight purpose support is explicit REVIEW.

Finite source preparation errors isolate the affected slot; unexpected storage faults
abort the transaction. Uncertifiable proposal metadata is private reviewSlots, not a
sealed nullable-purpose slot. Retries retain exact plan/slot/operation/target identities
and hashes. Domain success remains accepted if evidence finalization is pending; do
not compensate/delete admitted siblings. A failed fresh command with a known revision
has a rejected/conflict receipt retaining requested bases and no committed revision.

Hash input uses the separate bounded Core JSON codec: finite fractional coordinates
and document regions are supported; unsafe/lossy numbers, duplicate keys and invalid
Unicode are rejected. Integer-only v1 codec is unchanged. New public code cannot pass
sourceAuthorized, actor, policy proof, storage keys or local readiness as authority.

No native-device, real populated DEV, custody-byte, provider or complete twenty-target
end-to-end result is claimed. Capture may test its port synthetically; actual positive
runtime waits for the remaining owning bindings and reviewed activation gates.

Owning PostgreSQL command/Source adapters and verified Document/Ledger capabilities:
BLOCKED pending implementation and their security/recovery tests, not an Owner stop.
Complete collection/open-original HTTP transport: CONTRACT_ONLY pending those adapters.
W4 extractor UI and W6 typed renderers: NOT_APPLICABLE to Core ownership.
