# MCP Roadmap V1

2026-10-29. Later stages are proposals, not execution authorization.

| Stage                       | Smallest capability                                                                                     | Entry / acceptance gate                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP-01 Read-only            | list_trips/get_trip/list_trip_items/get_trip_item; standard Streamable HTTP                             | Owning Account authentication, typed accepted reads, real DEV A/B negatives, independent readback/no writes, review and serial main integration |
| MCP-02 Controlled Write     | create_trip/create_trip_item/update_trip_item/get_operation_status                                      | Stable owning mutation contract, explicit user-confirmation boundary, exact replay/receipt, DEV mutation authority and L1/L2/L3                 |
| MCP-03 AI-assisted Planning | Natural-language query/plan, then preview and confirmed legal save                                      | Suggestions/candidates/drafts remain separate from accepted Items; evaluate a bounded batch Draft/Preview port before repeated formal commands  |
| MCP-04 Extended Domains     | People/Invite, Ledger, Documents/Source, Flexible, sharing, Media/Memory                                | Each owner supplies stable semantics, privacy, ACL and E2E evidence; no generic bypass interface                                                |
| MCP-05 Product/Operations   | Connect/disconnect, audit, entitlement, cost attribution, abuse/limits, multi-client grants, monitoring | Auth grants/revocation and privacy policy; measured demand and operating cost; no invented pricing or quotas                                    |

MCP-02 should map create_trip to existing Trip creation port, typed Item create/
update to Core command2, and operation status to the owning exact receipt lookup.
Allocate and retain a stable Operation ID before submission; pin normalized body,
expected revision/base vector, actor/Trip and confirmed user action. Reuse owning
CAS, idempotency and immutable receipt semantics. A timeout means unknown outcome;
recover that same operation, never mint another ID or silently overwrite a stale
revision. Backend decides ACL and current contract capability. P2 qualification,
Source admission, Booking/Ticket links and Creator ownership constraints remain
formal Core responsibilities. No write tool is exposed in MCP-01.

Planning preview should state destinations/dates/timezones and all unresolved
facts, identify actual vs suggested Item identity and present the exact changes
the person will confirm. Batch drafts may reduce repeated single writes, but an
unapproved bulk mutation or inferred relationship is not a shortcut. Separate
commercial provider/model calls from free read tool invocation: protocol calls do
not themselves imply OTR paid for an LLM completion. No Stripe, subscriptions,
payment processing, entitlement amounts or pricing implementation in this lane.
