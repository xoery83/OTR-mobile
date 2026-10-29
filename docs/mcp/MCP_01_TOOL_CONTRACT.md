# MCP-01 Tool Contract

Version `otr.mcp.read/1`; protocol SDK2.4.0; generated JSON schemas are authoritative
in `mcp/contract.ts` and exposed through standard discovery. Four tools only;
all advertise readOnly=true, destructive=false, idempotent=true, openWorld=false.

| Tool            | Strict input                                                              | Result                                    |
| --------------- | ------------------------------------------------------------------------- | ----------------------------------------- |
| list_trips      | optional UUID cursor, integer limit1–25/default20                         | trips[], next_cursor/null                 |
| get_trip        | trip_id UUID                                                              | trip basic summary                        |
| list_trip_items | trip_id, optional date_from/date_to, optional cursor, limit1–25/default20 | typed items[], snapshot, next_cursor/null |
| get_trip_item   | trip_id + item_id UUID                                                    | typed Item                                |

Every successful result includes version and `state=SERVER_CONFIRMED`. Summary
fields are id/name/destination/startDate/endDate/createdAt; nullable means unknown.
Item allowlist is itemId/tripId/itemRevision/family/title/description/status/hidden/
visibility/localState/schedule/place/details. P1 category; P2 qualification/literal/
services; P3 property/check-in limits/rooms/nights; P4 supplier/vehicle/pickup/return;
P5 service/operational boundaries; P6 session/admission/entry. Unsupported internal
fields are stripped, not passed through. Each family keeps distinct schema.

Preserve known local dates, wall clocks, precision, quality, time basis, zone ID,
UTC instant and civil resolution; absence never invents a zone or instant.
Sparse Flight is distinct from Qualified Flight. Exact service/operator literals
remain unchanged. No timezone conversion or assumed departure/arrival ordering.

Date filters are calendar-valid YYYY-MM-DD. date_to requires date_from and cannot
precede it; a single date means that date. Inclusive overlap compares min/max
known local root/transport-boundary dates. Undated Items appear only without a
date filter. This is Item overlap, not Day Feed/TNS/Base/occurrence pagination.
UUID ascending order is independent of device timezone. Returned records may
include hidden/cancelled accepted facts according to the current owning reader.
No local pending values or Flexible Choice are admitted. Relations, document
originals, booking codes, passenger/participant identities and private instruction
content are not requested or returned by these tools. Text is untrusted data,
never an instruction to the MCP host.

Trip pagination uses Backend discovery cursor and limit. get_trip scans at most
200 pages ×25 summaries, within a30s request budget; returns READ_LIMIT if no
conclusive result before that bound. A future owning single-Trip summary query
can remove this documented shortcut without altering tool semantics.

Item cursor is bounded base64url JSON {snapshot,after}. snapshot hashes verified
Account/Trip/epoch/read revision/access revision/date filters. Account/filter/
snapshot mismatch returns STALE_CURSOR. It is a continuation, never an access
credential. Changing limit is permitted; changing dates requires restarting.
The complete read2 manifest/rosters/page hashes/graph are validated before IDs
are selected. Detail requests re-run owning Backend ACL; changed Item revisions
abort the page. Independent detail snapshots are not claimed atomic across an
entire response. No total count or stable historical export is promised.

Input excludes arbitrary Account/client IDs, URLs, SQL, mutation/operation payloads.
Unknown fields, bad dates/UUIDs, reversed dates and over-limit inputs fail SDK
validation. Tool failures return isError=true with fixed codes: NOT_VISIBLE
(covers absent and forbidden), AUTH_REQUIRED, BACKEND_UNAVAILABLE,
BACKEND_TIMEOUT, INVALID_INPUT, STALE_CURSOR, READ_LIMIT. No upstream error body
or Zod diagnostic is returned. JSON is structuredContent plus text compatibility;
SDK handles negotiated modern/legacy wire envelopes.

HTTP: stateless POST /mcp, JSON responses, no-store, no cross-origin CORS grant.
Unsupported GET/DELETE returns405 with Allow:POST; Origin must equal resource
origin if present. Unconfigured/invalid/expired/wrong-resource identity401,
missing read scope403, oversized body413, timeout504. 16KiB MCP body,30s request,
10s each Backend call,64MiB maximum validated Core collection,25 detail reads per
page; bounded get_trip scan. No retries, background workers or response cache.
This is a golden-slice bound, not a load qualification or public rate limiter.
