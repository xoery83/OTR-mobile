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

MCP request budget is60s; each Backend call is bounded50s, and writes also
share the remaining50s work budget from request start. The former separate15s
POST ceiling canceled a real synthetic attempt at15.002s and has been removed.
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

Structured Trip receipt GETs carry OTR-Trip-Create-Version:2, matching the
format2 create; they never silently downgrade to legacy metadata. Write work is
bounded to approximately50s from request start inside the60s HTTP response budget,
so a slow accepted prefix can return PARTIAL/UNKNOWN and unsubmitted suffix.
Real auth expiry and caller cancellation remain separate hard fences.

## Phase2 additive field adapters — locally verified, not consumer E2E

Server0.3 preserves existing date-only command/preview digests. `dates` also accepts
start_time/end_time (HH:MM) and explicit start_zone/end_zone IANA labels. No device
zone/UTC is inferred. Native-equivalent civil tuples remain ESTIMATED/PENDING
until owning qualification, distinct from booking confirmation status.

P3 `stay` holds permitted_checkin_from/until and permitted_checkout_by, separately
from planned schedule. P4 `rental` holds supplier/reserved_category/or_similar and
explicit actual_vehicle_model/verified_plate only when supplied; return_place and
return_address complement pickup place/address. P5 `transport` holds one existing
supported subtype, explicit origin/destination, optional authored operator/service
number and independent checkin date/time/place. Unknown arrival stays unknown;
none of these creates a Booking/Ticket or paid status.

P2 create requires a known flight_number and departure date; route/time/enddate
fields on sparse Create are refused rather than discarded. After receipt/readback,
a separate stable update with `change.kind=FLIGHT_DETAILS` supplies complete,
explicit nullable origin/destination date/time/zone/airport_code/name/terminal.
It invokes SET_AUTHORED_FLIGHT_DETAILS at the supplied current revision, requires
a current same-object SPARSE/no-exact-time read and stays SPARSE. Its preview
explicitly warns that Core changes Item title to the flight number literal. There
is no automatic two-command transaction. A batch cannot preview an edit to an
Item that does not yet exist; finish/verify the sparse create then preview the
exact subsequent detail operation. Missing flight literals stay blocked.

`change.kind=SCHEDULE` replaces a supported complete authored civil range. Current
clock/zone/end values must not disappear, and exact/qualified/transport tuples
require their owning adapters. Qualified Flight/transport edit is not implemented
by this generic schedule tool. All modes retain Core CAS/receipt/confirmation.
The independent live-QA verifier now checks P5 typed endpoint/service/check-in
fields and civil tuples; unsupported P2 commands fail closed. Local new-field
tests are not a new Supabase or iPad acceptance receipt.


Batch outputs add `review_basis=CURRENT_VISIBLE_COLLECTION_AND_UPDATE_DETAILS`
and `review[]` with operation_id, typed proposed_change, nullable update_base and
possible_duplicate_item_ids. UPDATE bases come from current authorized detail
reads; CREATE has no update base, which is not an absence claim. The visible
collection provides duplicate candidates. These sequential observations are not
an atomic snapshot. Current Revision drift stays visible without rewriting the
submitted expected_revision or canonical operation digest; changed duplicate
observations continue to invalidate the existing batch digest. Apply/partial/
confirmation-required responses retain the same review structure.
