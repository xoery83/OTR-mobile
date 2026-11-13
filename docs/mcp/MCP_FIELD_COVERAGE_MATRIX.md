# P1–P6 field maintenance — Phase4 local candidate

| Family | Existing MCP                            | New isolated adapter                                                        | Remaining formal limit                                                                                                            |
| ------ | --------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| P1     | Create schedule/place; text/date edits  | Explicit participation; place intent validation                             | Place replacement blocked pending field/provenance preservation                                                                   |
| P2     | Sparse create + authored flight details | Explicit participation via existing Core command                            | No guessed literal or qualified-flight bypass; full qualification stays Core                                                      |
| P3     | Property/policy Create; dates/text Edit | Partial property/policy Edit when no rooms; participation                   | Existing rooms block detail Edit: retransmission overwrites provenance despite equal values; place replacement blocked            |
| P4     | Details/pickup/return Create            | Partial rental details and participation                                    | Pickup/return replacement blocked pending field/provenance preservation                                                           |
| P5     | Service/endpoints Create                | Participation Edit; service/endpoint intent validation and safe blocking    | Service/endpoint replacement rewrites provenance; requires owning preservation port. Operational-fact write remains protected gap |
| P6     | Basic Create/text/schedule              | Activity details/entry Create; participation Edit; detail intent validation | Activity detail/entry Edit blocked: Core requires entry rewrite; projected absence does not prove raw fields absent               |

Code: `fieldAdapter.ts`; tests execute all six representative edits through real
Core HTTP + in-memory transaction/receipts, not a mocked APPLIED string. This is
LOCAL_ONLY, not DEV or iOS qualification. New field tools and FIELD_CREATE/
FIELD_UPDATE in the existing Batch require host `taskAssistant:true`.

Every field edit carries unchanged `base_item` and expected Revision. PREVIEW and
first POST compare with fresh legal read. Recovery queries original receipt first;
an accepted edit can recover after its own revision advances. Core CAS/ACL remain.
Missing fields never clear unrelated details. Place/endpoint replacement intents
are visible but blocked, including text-only places with hidden identity, address
components or provenance. Unsafe aggregate rewrites fail closed. Value equality
alone does not establish preserved Source evidence or field protection.

Phase4B: get_trip_item_edit_base exposes the full already-authorized Core record,
children and field_state; redacted evidence remains redacted. The unchanged normal
Item DTO remains the write base. Review separately enriches real description/category
without fabricating DTO write identity. P1/P6 Create supports explicit category.
Notes-only TEXT omits untouched title; retaining a Source title by retransmission
is rejected. Source schedule/flight aggregate setters fail closed where they would
rewrite unspecified provenance. The guard applies to opt-in taskAssistant paths;
it is not installed in the unchanged historical bundled Host runtime.
