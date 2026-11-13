# C02-S3 — structured manual Place local mapping contract

Package MCP-C02, IN_PROGRESS. Code: mcp/structuredPlace.ts. This is a **local
contract/mapping candidate, not a discovered Tool or live handler**. Existing
simple-manual handler acceptance remains separate. Hosted/Consumer/Native NOT_RUN.
No Provider call, Apple matcher implementation, new scope or Core command.

## Input and preservation

The mapper receives the complete lawful get_trip_item_edit_base result and an
explicit authored-field patch. It checks Item/Trip/family/revision correspondence
between the full record and DTO. P1/P3/P6 only; family endpoint/rental/Activity
entry places have separate owning paths. The input schema's SERVER_CONFIRMED
literal is not authentication: a future handler MUST obtain this Base through
its bound authoritative read port, verify current state before Preview/Apply,
and retain trusted Confirmation, Core Authority/CAS and original Receipt recovery.
Do not accept a model-authored snapshot as authority.

The DTO omits address line1/line2/postal code. Mapping therefore uses the complete
record's formal corePlaceSchema, never reconstructs missing leaves from the DTO.
Omission (including undefined in a local call) retains the exact old value;
explicit null clears only the selected authored leaf. No automatic concatenation,
postal parsing, country inference, address normalization or geocoding. Full free
text and component values are independent authored facts; conflicting materials
require an explicit user-visible comparison, not silent reconciliation.

| Authored field | Meaning | Local mapping |
| --- | --- | --- |
| authored_label | User's place label | Explicit patch / omission retain |
| authored_text | User's place narrative | Explicit patch / omission retain |
| authored_address | Original full address string | Explicit patch / omission retain |
| authored_address_line1 | Address line 1 | Explicit patch / omission retain |
| authored_address_line2 | Address line 2 | Explicit patch / omission retain |
| authored_address_locality | Locality | Explicit patch / omission retain |
| authored_address_region | Region | Explicit patch / omission retain |
| authored_address_postal_code | Postal code, including leading zeros | Explicit patch / omission retain |
| authored_address_country | Literal country | Explicit patch / omission retain |

All 12 remaining formal fields are outside this patch: accepted_address,
accepted_latitude/longitude/place_id, spatial_provenance_refs,
location_input_revision, and the six accepted_address_* components. Non-null
existing values reject the mapping, and new values cannot be supplied in the
strict patch. Apple Place Matching owns match candidates, accepted identities,
coordinates and spatial evidence. MCP does not invent or translate a Provider ID
into OTR's accepted_place_id. Source/provider-origin state or evidence on any
place field rejects; an existing non-null fact without field_state rejects.
An empty null leaf without state may receive a new manual value.

## Core semantics and exact limits

Output is before + existing SET_ITEM_PLACE payload + explicit tracking disclosure.
Core reasserts the WHOLE place group's MANUAL/protected state at the next revision;
this is not sparse provenance preservation. Unrelated Item fields, rooms and Stay
facts remain unchanged in the local Core test. Existing matched/source-backed
places remain BLOCKED until the owning preservation contract can satisfy them.
A future handler must render all before/after values and tracking effects before
trusted confirmation. Current public PLACE guard deliberately remains unchanged
and rejects this structured path. S1's frozen P3 profile is unchanged.

Evidence: structuredPlace.test.ts, 8 PASS; real local Core applies the mapped
payload at revision2→3, preserves room/Stay/other root facts, rejects stale repeat;
negative cases cover provider fields, source/evidence/missing existing provenance,
empty/unknown/invalid inputs and mismatched IDs/revisions. No SDK save, formal
Receipt recovery, independent Supabase or Native claim for this new candidate.

Next independent slice: wire this verified full-record mapper into the existing
field handler with a mandatory live full-Base/intent comparison on Preview/Apply,
then receipt recovery/readback tests. Keep it disabled in the S1 consumer profile;
no Provider or sparse Core extension is necessary for purely manual components.
This is MCP-owned local work and does not wait for Root or S2.

## Internal executor qualification follow-up

The local candidate now has prepareStructuredPlaceUpdate in fieldAdapter.ts and
is connected to the existing createMutationTools executor, without a new public
schema/tool. Preparation stores the original full-record digest and exact explicit
patch alongside the canonical existing SET_ITEM_PLACE command. On BOTH Preview
and Apply, the mandatory guard reads the current authorized full Base, compares
DTO and full-record digests, re-maps the original patch, and compares the complete
command payload. A caller-forged omitted component or altered payload cannot pass.
The guard remains mandatory without an optional host preservation callback.
Original formal Receipt recovery runs first, so an already accepted operation can
recover after its original Base has advanced without rebasing or a new POST.

Evidence: mutation.test.ts "S3 internal structured pipeline" verifies local
Create→Preview→lost response→same-operation APPLIED recovery→formal golden readback,
then a second patch retaining address line1/narrative and preserving a leading-zero
postal code while explicitly clearing line2. Room/Stay children remain identical;
forged full Base and tampered omitted payload are rejected with zero extra POST.
S3 focused selection5 PASS (four existing simple-path cases plus the new internal
pipeline); MCP Typecheck and scoped lint PASS. The earlier8 pure-contract cases
remain separate evidence. No old S1 suite/model rerun and no frozen software
artifact rebuild: Owner-approved17d/6c9b package stays exactly unchanged.

Acceptance level is now LOCAL_FULL_RECORD_EXECUTOR_RECEIPT_READBACK_PASS.
Public Tool/SDK Discovery for this structured path, Hosted, Consumer and Native
remain NOT_RUN/UNAVAILABLE. The next independent step is a narrow public tool
input/Guide path carrying the original complete Base, covering both single-item
and batch/recovery callers; no dynamic refetch/rebase of the canonical intent.
All earlier cautions about source/Provider ownership and tracking remain in force.

## Local standard MCP SDK qualification

The opt-in taskAssistant field tool now accepts an additional STRUCTURED_PLACE
intent in the EXISTING update_trip_item_fields Tool. Supply change.base as the
entire unchanged get_trip_item_edit_base result, base_item as that same result's
item and the matching expected_revision. Supply only explicit authored leaves in
change.patch. Outer/inner DTO mismatch rejects. This does not trust a caller's
SERVER_CONFIRMED label: the mandatory executor still compares the live authorized
full Record and re-derives the exact payload as described above.

Single-item, FIELD_UPDATE in preview/apply_trip_changes and safe failure/recovery
reconstruction all share the same preparation function. Original snapshot/patch/
request_id produce stable canonical intents, including after the operation itself
has advanced the Item revision. No second edit pipeline or new named Tool.
FIELDS describes exact paths, null/omission and contradictory evidence; CAPABILITIES
only makes Place available in the opted-in non-Notes/non-P3 field profile. The
frozen S1 profile and deployment bytes remain unchanged and do not expose it.

New in-process standard SDK test (Client + StreamableHTTPClientTransport calling
real createMcpHandler via custom fetch; external network zero) proves discovery,
Guide, full Base, single Preview, NEEDS_CONFIRMATION without host approval,
simulated response loss→same-ID APPLIED, then batch Preview, missing approval,
PARTIAL/UNKNOWN→same-batch original-ID recovery. Exactly3 POST including setup
Create, same Item revisions1→2→3, explicit line2 clear, retained line1/address and
leading-zero postal code. This is LOCAL_SDK_TOOL_PREVIEW_APPLY_RECEIPT_RECOVERY_PASS,
not fresh-context model, Hosted consumer or independent Supabase/Native acceptance.
Earlier paragraphs saying no public schema/Tool describe the preceding internal
checkpoint and are superseded only for this local opt-in candidate.

Next independent coverage: P4 Rental details/field-state behavior and structured
pickup/return preservation, reusing current Core/reader and no Provider. Existing
source/matched Place gates remain closed; no S1 or S2 dependency blocks that audit.
