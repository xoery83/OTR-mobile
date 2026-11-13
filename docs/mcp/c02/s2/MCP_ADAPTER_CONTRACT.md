# C02-S2 — unmounted sparse Stay Adapter

Root1 main `4c8d0fd9` / owning candidate `5393cbaf` supplies the existing
SET_STAY_DETAILS sparse payload. CORE_DEPENDENCY.json records exact consumed
source/test bytes; MCP does not change that authority. Its earlier main
coreCanManage restriction is consumed unchanged too.

`prepareSparseStayUpdate({request_id, base, change})` is local source only.
`base` is the complete unchanged get_trip_item_edit_base result, including its
ITEM record and current revision. `change` reuses coreSparseStayPayloadSchema:

```json
{"details":{"property_name":"Confirmed lodge"},"roomChanges":[{"operation":"PATCH","room_id":"<stable room UUID>","changes":{"capacity":4}}]}
```

Details and roomChanges are independently optional, but not both empty. Omitted
fields/rooms retain values and provenance. Null explicitly clears. ADD uses a full
typed room with stable new room_id; REMOVE is explicit. Neither room operation is
a Booking, Traveler, Expense or Document operation. No whole rooms array is sent.
Only the existing MANUAL Core envelope, Item revision, Operation and receipt are used.

The mapper rejects mismatched Item/Trip/revision/family/child parents, duplicate
current room IDs, wrong-room PATCH/REMOVE, existing ADD and a resulting over64
rooms. Preview includes actual targeted Before values and exact explicit changes.
The executor verifies the original full-record digest, DTO/revision and remapped
payload against a fresh legal read. It never rebases. Trusted confirmation is
still mandatory. Exact original-ID receipt recovery precedes live-state guards,
including recovery after the capability is disabled; response loss does not create
a new operation or room. Core Authority/CAS remains the final concurrent boundary.

## Default closed and future integration boundary

No new tool name or public input variant is registered. The existing STAY tool
route and its room-preservation rejection remain unchanged. Current Guide marks
existing-room editing unavailable on this connection. The internal executor's
`sparseStaySupported` defaults false; only isolated tests opt in. No existing Host
or server passes it. Model input, natural-language approval and source attachments
cannot turn it on. Do not send this payload to the old Hosted Backend.

Future delivery requires reviewed source integration and Root2 software deployment,
actual Backend compatibility qualification, then a separately approved minimal
public Adapter activation and Consumer Preview/confirmation/Apply. Existing S1
and public P3 QA profile are not expanded by this local work. No SQL, role, scope,
Grant or protected window is installed here; historical UNKNOWNs are untouched.

## Evidence interpretation

Local tests run the real existing Core HTTP boundary, Core mutation and receipt
repository in isolation, then independently read the resulting lawful full record.
They compare untouched room/detail rows, root fields and original source/protected/
evidence/changed_revision facts. Requested-value golden readback also checks exact
receipt identity/intent, the complete expected room-ID set derived from the frozen
Base plus ADD/REMOVE, unique rows, all child parents and supplied values. It does not alone
prove all unmodified provenance; the separate full before/after tests do that.
NO_CHANGE has no mutation audit: its distinct verifier result checks the unchanged
base revision and requested current values, never reports an APPLIED save. No
local proof is Supabase, Hosted, Consumer or Native acceptance.
