# MCP Tool Contract V1 — execution draft, 31 October 2026

Keep four read tools. Add create_trip/create_trip_item/update_trip_item and
get_operation_status through existing typed Backend ports only. First Item create
adapter supports date-only Manual P1/P3/P4/P6; SparseP2, P5 and clock/zone facts
must use their distinct owning payloads rather than invented generic times.
Initial edit changes either text or schedule in one command with expected revision;
a name+date request is an explicit two-command plan, not one atomic update.

All writes need stable allocated operation/target IDs and an exact reviewed change
set. Tool parameter confirmed=true or model text is not approval. A trusted host
confirmation port must bind Account/client/resource/digest/expiry and the exact
operation set; absent port denies submission. Preview allocates no business rows.
Apply reuses each command and receipt, reports partial outcomes, preserves UNKNOWN
and original IDs, and never resubmits a successful prefix under new operations.
Backend always rechecks ACL/CAS; no silent revision replacement or force write.

Operation result includes trip_id/item_id/operation_id/outcome/current_revision and
query identity. APPLIED requires a validated formal receipt; transport ambiguity is
UNKNOWN, exact lookup absence is not proof of noncommit. No server batch atomicity.
Details and executable schemas will be frozen with the code and directed tests.

Executable schemas: mcp/mutationContract.ts. request_id is the immutable owning
Operation ID; Item/Trip target IDs are deterministic per verified Account/request.
Create defaults PRIVATE/SELF; authored Place is TEXT_ONLY with no provider facts.
P3 requires checkout date; property_name is P3-only. Existing timed/transport
schedule date edits are refused pending owning temporal preservation adapter.

Individual modes PREVIEW/APPLY share identical fields; Apply must supply the exact
preview_digest. Full notes/place/property/date values are visible to the trusted
confirmation host. Writes require otr.trips.write and real client identity;
get_operation_status is read-only. Backend/confirmation ports absent means closed.
The internal normal-session bridge is explicit QA-only, not public OAuth.

Batch IDs/digests retain the same command set across failures. Possible-duplicate
observations contribute to the batch hash; its own stable accepted targets do not
become new duplicates on replay. A stale UPDATE warning does not hide a successful
original receipt. Backend formal CAS still decides an unaccepted stale mutation.
Unsubmitted suffix is PREVIEW with NOT_SUBMITTED_AFTER_STOP, not false APPLIED or
invented server-atomic rollback. UNKNOWN keeps exact query identity.

MCP request budget is60s; each Backend read is bounded50s and mutation request15s.
These are MCP-local limits: no Native/Backend timeout or Core lease setting changes.
A real authorized P3 returned200 after13.554s, exceeding the former10s MCP read
limit. Timeout remains explicit; no automatic request retry is introduced. A batch
may stop partially and resume the same operations through receipt recovery.

list_trip_items returns summaries from one validated actor-scoped Core collection:
SUMMARY, itemId, tripId, itemRevision, family, title, localDates, status, hidden,
temporalShape, P2 qualification/flight literal and P5 service identity. A detail
query explicitly names get_trip_item and its exact IDs. Pagination/overlap use
that same snapshot. It does not perform N additional full-snapshot object reads.
Use get_trip_item for typed schedule/time/place/details; no synthetic CoreActor
or local ACL/privilege inference is used.
