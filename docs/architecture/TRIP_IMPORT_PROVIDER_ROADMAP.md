# Trip Import Data Provider Boundary and Roadmap — CP12

Date: 2026-10-05 (Pacific/Auckland). Contract: `otr-import-data-provider-v1`.
Status: **DESIGN ONLY — REVIEW PENDING**.
[Intelligence Plugins](INTELLIGENCE_PLUGIN_CONTRACT.md) and Data Providers are separate
contracts. No common universal provider superclass, SDK, credential or runtime is added.

## Data/enrichment provider contract

Intelligence interprets supplied material. Data Providers return attributed records
or external observations for bounded lookup/verification questions. A model's
recollection is not a flight schedule/status lookup. Flight/place/weather providers
never return canonical commands, READY, accepted identity or verified Person mapping.

Descriptor: provider ID/adapter version, data capabilities, record namespaces,
coverage, query/result schema versions, privacy/network requirements, supported
local/cached modes, freshness semantics, limits, timeout/retry/cancellation semantics
and optional cost/latency metadata. Capability availability is explicit, never assumed.

Request: owner/request identity, exact Candidate/input/schema/question binding,
requested data capability, minimal normalized lookup keys and supplied scope,
observation/as-of needs, permitted freshness policy, deadline/budget/privacy plan.
Do not send passenger/booking secrets for a public schedule lookup unless the exact
capability/admission policy needs and permits them. Results never grant Source access.

Response: exact binding, provider/record namespace/ID and adapter/data version,
observation/effective time, validity/freshness/completeness limits, status
FOUND/NOT_FOUND/AMBIGUOUS/UNAVAILABLE/UNSUPPORTED, candidate records/field observations,
source attribution and uncertainty, safe failure/retry facts. NOT_FOUND means absence
within declared provider coverage, not proof a booking is invalid. UNKNOWN coverage
cannot imply comprehensive search or deletion. Cache facts stay separately attributed.

Normalize and validate before closure consumes a result. Keep conflicting provider
and source values together. Distinguish static schedule, estimated/live status and
booking-confirmed schedule. Provider record identity is not OTR occurrence identity.
Places supplement free text; weather is optional context, never itinerary authority.
Input/generation/Account fences apply before installing data; late results cannot
modify changed Candidates/locations or overwrite accepted fields. Domain acceptance
uses explicit reviewed intent and existing CAS/receipt contracts.

Failure preserves captured material, valid booking fields and prior accepted facts.
Optional enrichment cannot block READY or invalidate an otherwise usable booking.
Missing critical facts still block readiness until supplied/resolved; an eligible
bounded resolver may defer prompts after reconnect. Urgent travel attention follows
Import policy even while waiting. Provider failure is not an automatic Ledger or
Trip mutation. Existing FX providers and financial freshness/valuation are untouched.

## Roadmap

| Priority | Capability                                          | Intended scope / admission gates                                                                                                                                                                                           |
| -------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Static/local metadata, timezone/system capabilities | Versioned airport/carrier metadata, explicit civil rule context and native extraction capabilities; offline first. Metadata suggestions remain evidence; no device zone as itinerary truth or unreviewed B civil resolver. |
| P1       | Flight schedule/status                              | Occurrence-scoped lookup by qualified service/date/endpoints; schedule versus live status distinction, coverage/freshness/conflicts. No passenger or PNR-based canonical identity.                                         |
| P2       | Places/geocoding                                    | Optional disambiguation/navigation candidates bound to authored location revision; no mandatory provider Place or silent address acceptance.                                                                               |
| P3       | Weather                                             | Optional location/time-bound observation with forecast freshness; never changes booking or closure-critical schedule facts.                                                                                                |
| P4       | Rail/bus/ferry/activity providers                   | Only according to demonstrated demand and reviewed subtype closure/coverage; no speculative integration framework.                                                                                                         |

Roadmap expresses order, not purchased services or approved implementation. Vendor,
licensing, coverage, freshness bounds, costs and privacy/data residency are unresolved
until a specific provider slice. No external access, provider API call or live-data
validation occurs in CP12.
