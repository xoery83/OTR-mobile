# MCP-01 Architecture & Interface Inventory

2026-10-29; inspected current main `ee246658`, not the older original checkout.
Owner authorization: MCP-01 Read-only Foundation, 29 October 2026.

## Discovery answers and status

| Capability                       | Actual owning code / route                                                                                          | Classification                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Trip list                        | `backend/src/tripDiscovery.ts`, `supabaseGateway.ts:discoverTrips`; GET `/v2/trips?cursor=&limit=`                  | Already Implemented; MCP DEV E2E pending                                                         |
| Trip basic information           | Discovery summary: id/name/destination/startDate/endDate/createdAt                                                  | Already Implemented; get_trip can scan bounded discovery pages; no invented single-Trip endpoint |
| Rich Trip metadata               | `tripMetadataV2.ts` GET metadata requires operation ID + version2/3; V1 is mutation/receipt only                    | Implemented but not suitable as general get_trip; deferred richer metadata                       |
| Accepted P1–P6 collection        | `tripCoreV2Http.ts` GET `/v2/trips/:tripId/core/collection`; `tripCoreV2PgRead.ts`, `tripCoreV2Collection.ts`       | Already Implemented; runtime gate/finite scope enforced; MCP DEV E2E pending                     |
| Individual Item                  | GET `/v2/trips/:tripId/core/objects/ITEM/:itemId`; `tripCoreV2Views.ts:projectCoreItem`                             | Already Implemented; actor-filtered typed projection                                             |
| Native read/cache                | `src/domain/trip/tripCoreV2Read.ts` validates read2 manifest/pages/rosters/graph; existing repository/SQLite mirror | Reuse validator only; no Native cache/queue changes                                              |
| Authentication                   | `app.ts:authenticate`, `supabaseGateway.ts:validateAccessToken` delegates Auth getUser                              | Already Implemented for ordinary OTR session; not MCP OAuth                                      |
| MCP OAuth/resource token         | No MCP issuer/grant/resource/scope verification discovered in actual startup                                        | Blocked by Auth/Permission Contract                                                              |
| Earlier inbound AI               | `backend/src/inboundAiClient.ts`, API_CONTRACT CP14 B2                                                              | TEST_ONLY import proposal/decision seam; not Remote MCP/read API; deferred                       |
| Public ChatGPT/Claude connection | No provisioned MCP endpoint or OAuth client grant                                                                   | Missing; dependent on Auth, TLS deployment and client account eligibility                        |

## Actual authorization responsibility

`supabaseGateway.canReadTrip` admits Trip creator, legacy trip_members user,
or linked journey_members user. Discovery uses the same three sources, sorts
UUIDs ascending, returns at most25, rechecks admission and returns a cursor.
This outer Trip admission alone does not authorize every Item.

Core reader uses a dedicated `otr_trip_core_v2_gateway` connection, finite scope,
runtime gate, current locked actor and repeatable-read snapshot. `coreCanRead`
requires active same-Trip actor, then own/private, GROUP or explicit selected
Person visibility. Organizer manage rights do not bypass PRIVATE read ACL.
Instructions require parent visibility; Booking/Entitlement/Document have their
own ACL. Participation is distinct from visibility. Never implement these rules
again in MCP. Database RLS/GRANT and owning gateway functions constrain Backend;
Backend additionally resolves actor and projects authorized objects. MCP receives
no database credentials and never calls Supabase business REST/PostgreSQL.

## Deployment choice

Recommend A: modular `/mcp` adapter mounted in the existing Backend **after Auth
provides a resource-bound principal**. Same trusted principal/ports, one deployment,
no bearer forwarding or duplicate ACL. Independent module remains testable and
can later be hosted separately. B (standalone service calling Backend) is useful
for an isolated internal protocol harness now, but public use needs Auth-owned
on-behalf-of/token exchange; forwarding MCP bearer to Backend is prohibited.
Do not deploy or modify the shared DEV host in MCP-01 preparation.

Backend is Node24/TypeScript/Zod with esbuild; ordinary `server.ts` and opt-in
`serverCapture.ts` compose `createDevBackendHandler`. Documented public route is
https://api-dev.xoery.art via Caddy→loopback8787→Docker→DEV tuqigdxrvrerfewsxqgm.
Latest current-state handoff records curated Native/Import image, not the old
September deployment recipe. Public health independently rechecked200 development;
container/image/schema/permissions were not re-inspected or changed here.
Request logs use route templates/id/status/duration. MCP adds content-free events.

## Read semantics / exact deltas

Core read2 collection is a complete, bounded manifest+pages, not an HTTP paginated
Day endpoint. IDs/revisions/hash/rosters are validated; only ITEM records are used
to choose detail requests. Details use the owning projection, not reconstructed
ACL or raw database rows. MCP date range means inclusive overlap of known local
boundary dates, preserving authored dates/time/zone/instant strings. It is not a
Day Feed occurrence/ordering promise. UUID ordering is deterministic; continuation
is snapshot-bound and rejects changes rather than skipping/repeating silently.
Sparse Flight remains SPARSE; flexible candidates/local pending data are absent.
Hidden/cancelled accepted records retain the owning read visibility/status.
Source/document/Booking/Ticket associations are not inferred or fetched.

No DB, SQLite, Principal, RLS, GRANT, mutation or sync changes are needed for the
protocol slice. New code is confined to `mcp/`; exact size recorded after tests.
Public OAuth is an owning dependency, not something this lane can implement by
changing Auth. Auth and Native owners were sent precise read-only contract/QA
runner requests; no token/Keychain copying or deployment lease requested.
