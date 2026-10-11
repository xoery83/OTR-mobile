# Core v2 executable Capture handoff — 2026-10-12

Base741579c; isolated branch codex/trip-core-v2-w1-w5 at
/private/tmp/otr-trip-core-v2-20261012. W1/W2/W3/W5 continue; W4 remains Capture-owned.
No hosted/native/provider/business activation is authorized or performed here.

| Interface                                               | Implementation                                                                           | Readiness                                                                                                                                                                                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finite command2/candidate2/receipt2 versions            | src/domain/trip/tripCoreV2Commands.ts, tripCoreV2Receipt.ts; W0_CAPTURE_HANDOFF_CONTRACT | IMPLEMENTED_AND_TESTED — synthetic; runtime CLOSED                                                                                                                                                                           |
| Source prepare/status/finalize2                         | backend/src/tripCoreV2Source.ts                                                          | IMPLEMENTED_AND_TESTED — owning transaction port;28 synthetic SQLite/command-service tests PASS; Source PG binding retains REVIEW without sealed qualified authority                                                         |
| Source sibling purpose/continuity                       | flightOutputPurposeV2.ts                                                                 | IMPLEMENTED_AND_TESTED — immutable actual identities, ancestry and all legacy claims; whole-Source retiming denial tested; extraction flags never authorize                                                                  |
| Guarded Core commands and exact recovery                | backend/src/tripCoreV2Commands.ts                                                        | IMPLEMENTED_AND_TESTED — atomic transaction port; prior exact receipt before fresh gate, terminal rejection and status-only redaction tested; actual isolated PostgreSQL P1–P6/CAS/replay PASS; production activation CLOSED |
| HTTP core capabilities/commands/operations/source-plans | backend/src/tripCoreV2Http.ts + app.ts                                                   | IMPLEMENTED_AND_TESTED — authenticated routes; no default connection; CLOSED/503; no v1 fallback                                                                                                                             |
| SQLite account mirrors and pending/receipt state        | migration54 + tripCoreV2Repository                                                       | IMPLEMENTED_AND_TESTED —actual SQLite upgrade/recovery/account-fence tests PASS; stable UUID/offline restart; pending prediction is outside accepted certificate                                                             |
| Existing sync executor + authenticated client           | tripCoreV2SyncWorker.ts, tripCoreV2Transport.ts                                          | IMPLEMENTED_AND_TESTED — CLOSED negotiation/recovery/account fences; delivery stays blocked; five legacy C operations unchanged                                                                                              |
| Schema / privacy guard                                  | additive Core85–89                                                                       | IMPLEMENTED_AND_TESTED — fresh isolated Server84 clone+RLS PASS;329 historical functions unchanged; NOT installed on Hosted DEV                                                                                              |
| Booking/Entitlement/P3–P6 domain/read                   | finite reducer, Day and supplemental view                                                | IMPLEMENTED_AND_TESTED — synthetic finite domain; custody/Ledger owning capability pending; non-Flight Source slots retain REVIEW                                                                                            |

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

Owning PostgreSQL writer/reader, complete collection/Item HTTP transport and atomic
SQLite read2 install: IMPLEMENTED_AND_TESTED in isolated synthetic SQL/SQLite only.
Owning Source catalog adapter: IMPLEMENTED_AND_TESTED with sealed legacy pins; missing
qualified identity remains REVIEW. Actual Source SQL validation PASS: sealed legacy publication, exact pins, cold REVIEW replay, cross-actor/Trip/request-reuse/stale negatives, no canonical mutation.
Qualified v2 publisher/Source READY dispatch/finalization: BLOCKED by the demonstrated
W4 authority gap in W1_W5_SOURCE_AUTHORITY_GATE.md; Owner assignment is pending.
Verified Document/Ledger owning capability and open-original custody: BLOCKED pending
implementation; no bytes/access capability is fabricated. W4 extractor UI and W6 typed
renderers: NOT_APPLICABLE to Core ownership.

Experience may use projectCoreDay/projectCoreItem from src/domain/trip/tripCoreV2Day.ts
and tripCoreV2Views.ts. tripCoreV2Repository.day/item require a validated complete
account/Trip read2 snapshot or protected pending local intent; pending metadata is outside
accepted DTO hashes. createCorePgReader is the dormant single-snapshot owning backend
reader; originalDocumentIds/ledgerExpenseIds/sourceEvidenceRefs require owning independent
authorization. No startup or feature-owned refresh scheduler is introduced.
