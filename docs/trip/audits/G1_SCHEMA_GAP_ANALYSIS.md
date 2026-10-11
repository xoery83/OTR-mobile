# G1 — Schema gaps and authority

Date: 2026-10-11 (Pacific/Auckland). Status: **G0/G1 audit complete; proposed changes require Owner Review.**

Implementation baseline: canonical main `5076174`, `/Users/xoery/Project/otr-mobile`. Paths below are relative to that checkout unless marked **chat-only**. Source inspected directly; no live database accessed. IMPLEMENTED describes the named capability, not blanket product readiness. Tests, runtime wiring, historical DEV evidence and real-file E2E are separate dimensions. This audit authorizes no implementation or activation.

## Authority rule

The CSV is the field-level deliverable. Fields explicitly share one owner; a derived display/read cache is not a second writer. Status covers target Beta semantics, even if a matching SQL column already exists.

**Recommended existing authority retained:** canonical Event root owns plan identity/title/notes/lifecycle/revision and root schedule; TRANSPORT endpoints own origin/destination schedule/place. `planned_start/end` are normalized slots of those boundaries, not independently editable fields. Event-owned services own carrier/service identifiers. Booking owns contract/reference/order status/commercial evidence. Existing server `expense_links` is a reusable association scaffold, not a completed Mobile linkage workflow. Ticket owns validity/holder/capacity/access; bytes remain with their custody owner. Ledger owns accepted money/payment. Day owns no accepted business facts.

For Stay/Rental, select **existing canonical root boundaries as schedule authority**, with typed extensions owning service-specific attributes; Booking dates remain immutable source/commercial observations. Do not create new writable schedule columns in both Booking and extensions. Check-in permitted hours, pickup opening hours and planned arrival are distinct facts with separate roles. This is proposed Core physical mapping (D1), preserving B-T3A rather than replacing it.

## Blocking gaps

| Gap                             | Current concrete evidence                                                                                                                     | Minimal additive proposal                                                                                                                                         | Owner/workstream                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Sparse canonical save           | legacy title/date repository exists; protected canonical commands CLOSED; Flight `validateFlightCommand` requires EXACT origin/source instant | admit CALENDAR P1/manual sparse Flight plan at stable Event identity with separately bounded unqualified intent; never call strict Flight command until qualified | D2 / Core                       |
| Participant/default/privacy     | DTO scopes reserved; server validator, collection and SQLite47 UNASSIGNED-only                                                                | versioned scope+Person association and explicit visibility/access contract across row guard/RLS/read/write/certification/mirror/projection                        | D3 / Core/Security              |
| Booking↔Item N:M                | Event single reservation_id; Reservation identity exists but no canonical aggregate/revision or writer                                        | reuse reservation identity; explicit join with same-Trip constraints and per-service applicability; additive Booking revision/provenance/lifecycle                | Core                            |
| Tickets independent of schedule | no entitlement table/API/reader                                                                                                               | one entitlement family + Item/Segment links + holders/capacity/access descriptor + original reference; no second Wallet store                                     | Core/Documents                  |
| Documents shared access         | local Capture and private Source custody exist; no admitted group operational attachment layer                                                | caller-authorized catalog/association over original owning objects; new protected operational representation only if differing access demands it                  | D3 / Documents/Core             |
| Typed service facts             | Flight executable; STAY shape generic; rental/activity absent; SQL P5 enums wider than writer                                                 | small Stay/Rental/Activity extensions; extend transport adapter for train/bus/ferry, separate role-qualified meeting/cutoff/entry facts                           | Core                            |
| Instructions                    | notes single field; no append source-linked entries                                                                                           | bounded typed append-only entries with relevance role and amendment/user-edit provenance; one shared pattern, sensitive entries with narrower rights              | Core/Documents                  |
| Plan/service replacement        | Event-owned Flight service; no shared occurrence identity/history                                                                             | stable Item revisioned service association + history; assess qualified same-operating-instance reuse before adding a shared occurrence root                       | Core; no number/date-only merge |
| Lifecycle transactions          | Event cancelled enum/update exists; no recoverable delete/restore/shared Booking scope command                                                | explicit cancel Item vs entire Booking, hide/restore tombstone, replace Booking identity; CAS receipts and link-aware transaction                                 | Core                            |
| Import N:M commit               | Flight outputs/claims/lineage exist; non-Flight/Booking/Ticket deferred                                                                       | typed object outputs and dependency receipts; atomic per supported aggregate, explicit partial multi-object progress                                              | D4 / Capture/Core               |
| Runtime convergence             | closed mutation gates; Day explicit read/build; Catalog explicit install                                                                      | one existing app sync owner integrates approved workers/pull, repository-only projection; no feature timers                                                       | Core/Platform                   |

## Schema proposal, no DDL authorized

Names are provisional and internal. Reuse `itinerary_events`, `itinerary_reservations`, `itinerary_transport_endpoints`, `itinerary_transport_services`, `journey_members`, existing Source identities and queue/receipt infrastructure.

1. Add Item access/participation/lifecycle metadata and link-aware commands. Keep old four statuses readable; deletion is a tombstone, not another cancellation value. Add a bounded partial-intent representation for sparse Flight at the same Item identity if accepted; a draft alone does not satisfy the immediate saved Item requirement.
2. Add explicit `reservation↔event` links; add Booking revision/source/commercial observations. Migrate legacy reservation_id conservatively; it remains a compatibility read slot with one designated writer or is deprecated. Do not expose two editable association sources. FK SET NULL on old association is not semantic cancel/delete/replace.
3. Add entitlement and entitlement↔segment/item/holder links. Pass without Item is valid. Validity is not a plan date; capacity is not Person count; no inferred per-person QR or expense allocation.
4. Add small typed extensions and common source-linked Instructions. Existing temporal/spatial columns remain the accepted schedule/place writer. P5 meeting/boarding facts and P6 session/entry facts are distinct role-qualified facts, not copied display time.
5. Add typed operational attachment and explicit Item/Booking↔Expense references through existing server `expense_links` where its typed target/authorization contract can be extended, with two-sided current authorization. Reuse Source/receipt byte custody where rights permit; do not repurpose private evidence rights or cascade financial rows.
6. Extend exact local mirrors and pending intents; keep Day projections rebuildable. Device asset receipt/hash/version/readability and revocation fence belong to local operational access, not document metadata boolean.

At contract freeze define concrete fields, null/unknown meaning, bounds, invariants, safe IDs/revisions, allowed actions, proof requirements, RLS/grants, receipts, FK behavior and version compatibility for all six families. No giant unvalidated JSON blob replaces queryable business facts. Bounded evidence bundles may continue in their existing role.

## Duplication and correctness risks

- Reservation starts_at/ends_at vs Event boundaries: legacy evidence is not accepted schedule authority. Do not auto-backfill without temporal provenance/zone/precision qualification.
- Root planned_start/end vs TRANSPORT endpoint instants: continue exact normalization invariants; Experience cannot patch root time separately.
- Shared Flight instance is absent: Event-local services currently prevent a global single-writer claim. Beta may first reuse lookup observations while every accepted plan stays revisioned, but if the same real instance must be canonical shared truth, decide its identity/authority during D1 before migration.
- Ticket validity vs scheduled activity date: open-date tickets and passes remain independent; Wallet must not generate Events.
- Rental pickup/return vs Day rows: two operation projections from one rental identity; same place/time is visual grouping only.
- Capture payload SHA vs Booking dedup: bytes identify equal material, not equal bookings; PNR without namespace is not universal ID.
- Document available metadata vs usable ticket: require authorized readable verified original at expected version on this device; availability does not certify issuer acceptance.
- Event participation vs authorization vs Booking/Ticket holder: distinct; Organizer defaults do not authorize disclosure of SELF credentials/Instructions.

Existing SQL permissions are examined as source, not live principal certification. Every future change needs adversarial SQL compatibility tests, including legacy policies, guarded roles and certificate evolution. Production remains outside all implementation gates.
