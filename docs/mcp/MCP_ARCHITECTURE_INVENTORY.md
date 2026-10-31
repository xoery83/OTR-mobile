# MCP / AI Integration inventory — 31 October 2026

Fresh origin/main42652324 at task start; existing independent MCP branch rebased
onto that accepted source. Earlier MCP-01 documents describe 29 October only.

| Capability     | Reuse / minimal MCP adapter                                                                                                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account        | Existing Supabase Auth→Backend authenticate/getUser→canonical Account; fresh normal login, no Session/Keychain copying                                                                                                                                |
| Trip Read      | GET /v2/trips discovery, bounded UUID cursor; get_trip basic summary adapter; structured metadata V3 snapshot for rich destinations                                                                                                                   |
| Trip Create    | POST /v2/trips, format2 structured destinations, stable Trip/Operation IDs, Idempotency-Key; GET /v2/trip-create-operations/:operationId                                                                                                              |
| Trip Update    | POST /v2/trips/:tripId/metadata, format3 before/after+expectedMetadataRevision; same receipt recovery path; optional after Item slice                                                                                                                 |
| Item Read      | Core read2 certified collection for bounded summaries + actor-filtered ITEM detail; existing MCP field allowlist                                                                                                                                      |
| P1–P6 Create   | Core command2 CREATE_ITEM (P1/P3/P4/P5/P6) or CREATE_SPARSE_FLIGHT(P2), Manual admission; Backend capability still controls enabled families/subtypes                                                                                                 |
| Item Edit      | Existing SET_ITEM_TEXT / SET_ITEM_SCHEDULE etc.; each formal command has its own operation and explicit base revision; no hidden combined transaction                                                                                                 |
| Receipt/status | GET /v2/trips/:tripId/core/operations/:operationId; validate receipt hash/intent/account/trip/target; status-only must not invent revision                                                                                                            |
| ACL            | Existing canReadTrip plus Core actor/object ACL and formal mutation guard. Owner/Organizer is not a private-object read bypass. No MCP SQL or service role                                                                                            |
| Downstream     | Native04 normal discovery→certified Core refresh→existing repository install; external P3 create/edit actual iPad evidence already exists. Current coordinated iPad uses Account1f3d and Trip eb3a3e70; Native owns device verification and readiness |
| Service        | Node24/Zod/esbuild, existing modular Backend Request→Response boundary; optional MCP handler can mount /mcp after Auth approval. Independent module/test harness now; no separate business API                                                        |
| MCP            | Existing four-tool official SDK2.4.0 stateless Streamable HTTP. No public mount or delivered OAuth issuer/grant verifier found in current startup                                                                                                     |

## Current evidence changes since MCP-01

Golden Read now uses registered synthetic Account1f3d, private Trip
eb3a3e70-fe4d-4cff-81f8-9945bc804f28 and existing P3
612d7e55-cfa8-4ba7-a625-5e0d622679da, read-only in this line. The existing
registered-QA helper establishes an independent normal OTP session and proves
its own logout/refresh rejection; no Native token is borrowed. Actual attempts,
including partial successes/timeouts, are retained in MCP_E2E_ACCEPTANCE.md.
Old f4b fixture is not a positive for unrelated Accounts.

## OAuth gap and protected delta

Prefer existing Backend /mcp mount: verified principal is bound directly to its
existing read/mutation ports; no duplicate ACL and no forwarding an MCP resource
token to a different audience. A standalone service needs Auth-owned on-behalf-of
exchange, so is not the minimal public path.

Supabase offers OAuth2.1/PKCE/registration but its documented default audience is
still authenticated; OIDC scopes do not authorize business APIs. Real resource
binding, otr.trips.read/write, active client consent/revocation and backend binding
must be Auth-owned. MCP can prepare strict JWT verification, PRM/challenges and
tools now; issuer/grant/key configuration remains closed. Do not open dashboard
OAuth/DCR or change token hooks/RLS/GRANT on assumption. Protected activation
requires exact Auth contract, approved audience+client setup, then serial Backend
mount/TLS deployment. No business database/schema delta is needed for the adapter.

Execution: fresh Read → receipt-backed P3 create/edit → three-day synthetic Nelson
preview/confirmation/partial apply/recovery → actual clients/independent review →
serial main. Existing Native/business evidence is reference, not a new MCP PASS.
