# Original a8c1 recovery — Core owning answer

Source: Root1 thread01a1753a-2837-7d20-89c8-d8c1476b0ed8 reply to MCP,
4 November2026. Read-only contract clarification, no new Port or execution authority.

GET core/operations/:operation can return FULL, STATUS_ONLY or null under current
Actor/Trip visibility. null/404 and target0/receipt0 do not prove NOT_SUBMITTED.
Reference backend/src/tripCoreV2PgStorage.ts:888–920.

executeCoreCommandV2 checks same Actor/Trip/operation/command/intent hash under lock
before returning an existing receipt. A differing payload/baseVector/admission/
target is OPERATION_REUSE_MISMATCH. With no receipt, replay may execute the FIRST
real mutation; same ID never makes POST read-only. Core graph mutation and receipt
are committed together; advisory transaction lock serializes Actor/operation.
References tripCoreV2Commands.ts:97–158 and PgStorage.ts:259–385,433–453.

MCP Apply's GET-first path may fall through to POST on404. A finite read-only
recovery must call get_operation_status/read directly, not Apply as a query.
Reference mcp/mutation.ts:458–568. Original UNKNOWN prohibitions still apply.

Any future controlled same-ID replay would require independently preserved exact
original canonical command/intent including baseVector/admission/payload, current
Actor/Trip/normal grant/Issuer/confirmation and an explicit execution approval
covering this historical UNKNOWN and possible first Create. No concurrent in-flight
request or replacement command, no automatic repeat after another UNKNOWN.

Owning hash-verified receipt is the recovery authority. APPLIED/NO_CHANGE/CONFLICT/
REJECTED must be interpreted as original receipt outcomes. New Preview rejection,
HTTP4xx or graph absence cannot retroactively reject olda8c1. NOT_SUBMITTED_AFTER_STOP
is only a batch step not dispatched, not this already-dispatched operation.

Next authorized preparation: fresh empty-config finite access candidate for original
receipt/target GET only, command=null, confirmations=[]; no business POST or new ID.
Actual access/window requires its own Owner approval after software close-qualified.
