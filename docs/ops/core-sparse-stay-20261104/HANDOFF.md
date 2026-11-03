# Core sparse Stay payload — local owning candidate

Request `MCP-C02-S2-CORE-SPARSE-20261104-001`, base mainc91a27ca.
Root1/Core owns the shared command/Mutation contract. MCP owns its Adapter and
Consumer E2E; Native owns any Form consumption. Root2 alone owns future deployment.

Existing `SET_STAY_DETAILS` now accepts the exported `coreSparseStayPayloadSchema`
/`CoreSparseStayPayload` from `src/domain/trip/tripCoreV2Commands.ts` when `rooms`
is omitted. Optional `details` and explicit `roomChanges` PATCH/ADD/REMOVE carry
only actual intent. PATCH contains stable room_id and nonempty changes. ADD uses
one full typed room with new room_id; REMOVE targets an existing room. Same ID
cannot appear twice. The legacy whole-room payload is unchanged.

Example property-only: `{details:{property_name:"Updated hotel"}}`.
Example capacity-only: `{roomChanges:[{operation:"PATCH",room_id:"<existing UUID>",changes:{capacity:4}}]}`.
Use the unchanged Core v2 envelope, ITEM/baseVector/current semantic revision,
MANUAL admission and exact operation ID. No alternate Repository, mutation,
receipt, Role, Source proof or direct table writer is introduced. Sparse Source
admission is explicitly rejected. Mixed whole-room+sparse payloads are rejected.

Omitted leaves/rooms and unchanged non-null values preserve values and provenance.
Explicit null creates a CLEARED fact even when prior null was unknown. Already
cleared null is no-op. No-op does not advance Item revision. Explicit add/remove
and resulting64-room bound reuse normal Item authority and CAS. Existing exact
receipt recovery returns the first APPLIED/NO_CHANGE/CONFLICT/REJECTED, without
another mutation; reuse of operation with changed intent rejects.

Local131 checks, scoped strict TypeScript, lint and diff check PASS.21 tests are
new. Independent review pending. No SQL/Schema/permission change; no Hosted,
Consumer or Native acceptance. Do not send this shape to the old deployed Backend.
After review and source integration, Root2 receives a software-only release
request; actual Consumer Apply still needs MCP's separate valid execution scope.
No historical operation/UNKNOWN was queried or resent by these synthetic tests.
