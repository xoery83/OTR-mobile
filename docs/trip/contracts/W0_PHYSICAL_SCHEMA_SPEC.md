**Status:** W0 CONTRACT FROZEN / OWNER CONTRACT REVIEW; implementation and activation not authorized.  
**Date:** 2026-10-11. **Verified canonical source:** `741579c8bac3f898669ca331875a28efc645cfa2` at `/Users/xoery/Project/otr-mobile`.  
**Namespace:** `otr-trip-core/2` (business/read/command v2); existing temporal contract remains v1.

# W0 Physical Schema Specification

This is a schema specification, not SQL and not authorization to apply it. Tables below describe FINAL v2 business columns; do not re-add columns that already exist. Existing names/types remain unless an explicit v2 column is listed. Exact temporal/spatial bindings follow canonical read contract. v1 rows remain immutable/readable through their original version.

## 1. Migration lineage and allocation

Canonical source has SQLite1–53 and84 historical server migrations, last `20261007000100_flight_dev_dispatch_foundation.sql`. Reserve one coherent SQLite **54 `tripCoreV2Foundation`** and one historical server **85 `20261011000100_trip_core_v2_foundation.sql`** for the foundation (data, invariants, CLOSED guarded commands/readers). This is a reservation against verified HEAD, not an installed version or file created in W0. Recheck HEAD and both ledgers immediately before W1; if taken, allocate next free ID without changing contract versions. W1–W3 contribute to the same planned foundation before it is released; do not land placeholder installed schema then edit migration85/54 after application. Use small reviewable source commits with one migration integrator.

DEV lineage is separate frozen `otr-r3-dev-v1`, history68 and approved forwards under `supabase/dev-forward/r3-v1/`; ledger-init and Catalog forwards are not historical85. Future v2 forward must be derived from the exact installed manifest/hash, record dependency digests and equivalence checks, and keep gate CLOSED. Historical baseline files, versions1–53 and server1–84 are never edited. Existing checked-in SQL does not prove installed DEV schema. No Production plan/apply in W0.

## 2. SQL and SQLite type bindings

| Logical type                                      | PostgreSQL                                                                                             | SQLite accepted mirror / checks                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| UUID                                              | uuid                                                                                                   | TEXT canonical lower UUID                                      |
| Revision / SafeInt                                | bigint with JS-safe check                                                                              | INTEGER with identical range                                   |
| PositiveInt / NonnegativeInt / Int32              | integer with bounds                                                                                    | INTEGER with same bounds                                       |
| Text(N), Clock, Date, SHA256, enum                | text with enum/length/format + real-date validator                                                     | TEXT, same repository validator + scalar CHECK where supported |
| Instant                                           | existing timestamptz(6); new instant columns timestamptz(6)                                            | TEXT exact normalized microsecond wire string                  |
| Bool                                              | boolean                                                                                                | INTEGER CHECK IN(0,1)                                          |
| Latitude/Longitude                                | double precision finite/range/pair check                                                               | REAL identical check                                           |
| FieldStateMap / ProofMap / Region / typed receipt | jsonb after strict duplicate-free decoder; immutable canonical text hash stored separately for receipt | TEXT exact canonical JSON, finite grammar validation           |
| Currency / Scale                                  | text / smallint, existing currency registry validator                                                  | TEXT / INTEGER same validator                                  |
| UUIDSet / RevisionVector                          | bounded typed JSON for receipts only; normalized child tables for mutable relationships                | TEXT receipt JSON, normalized relations for accepted mirrors   |

Clock command may accept HH:mm but stored/read boundary is HH:mm:00 with clock_precision−1; seconds are representation padding, not new evidence. Canonical Instant output preserves microseconds; existing offset-bearing inputs normalize UTC through existing validators, with original literal retained in immutable evidence. Flight command uses its existing stricter UTC grammar. Do not normalize dates through device timezone.

## 3. Keys, constraints and aggregates

Every root has PK(id), UNIQUE(trip_id,id), existing Trip FK RESTRICT for new tables, owner_account_id FK existing Account/profile identity RESTRICT, required revision/visibility and active read indexes. For existing Event/Reservation add v2 fields nullable physically, enforce non-null conditionally when business_contract_version=2; preserve existing legacy created_by/updated timestamps and populate owner once from authenticated command, never a new competing creator writer. created_at and updated_at reuse existing columns. Business-v2 validator replaces only v2 aggregate dispatch; existing temporal-v1 row/UNASSIGNED triggers stay effective on business-v1. The v2 guard must be installed before accepting v2 row writes; no transient unguarded window.

Item children FK(trip_id,event_id) → Event(trip_id,id) ON DELETE RESTRICT. Endpoint `(event_id,role)` PK and UNIQUE(trip_id,event_id,role); endpoint details composite FK(trip_id,event_id,role) RESTRICT. Existing endpoint table receives trip_id filled from parent once with consistency checks; existing service receives same-Trip identity if absent. Both remain owned by Event revision; no per-child mutable revision. P3/P4/P6 single details PK(event_id); rooms PK(event_id,room_id), quantity/capacity optional but positive. Rental places PK(event_id,role) with PICKUP/RETURN; activity entry PK(event_id,role=ENTRY); transport operational facts PK(event_id,role) with only MEETING/CHECKIN/BOARDING_CUTOFF. Sparse intent PK(event_id); no departure-date copy. Service PK(event_id,service_key); codeshare_operating_key references same Event service_key, deferrable aggregate validation; P2 max4 strict proof grammar, P5 singleton non-Flight service. Extend subtype check by business-version guard; never widen Flight admission schema.

Matrix N:M tables use PK(two endpoint IDs), UNIQUE(trip_id,IDs), both composite same-Trip FKs RESTRICT; active=false retires link, never rewrites endpoint identity. Linked_by and linked_at immutable. Their designated parent revision owns link changes, so relationships require parent CAS and other endpoint revision/permission read check under lock; read_state always changes. Item/Entitlement Person tables PK(object_id,person_id), same-Trip journey_member FK RESTRICT; inactive link retained. Visibility Person tables PK(object_id,person_id), same-Trip object and Person RESTRICT; selected visibility set nonempty. Removing grant physically from ACL table is allowed within versioned ACL command; receipt preserves prior ACL, not a tombstone that accidentally retains access.

Booking replaced self-FK(trip_id,replaces_booking_id) RESTRICT, no cycles, at most one accepted replacing successor per old Booking (partial unique on non-null replaces_booking_id). Booking observations PK(booking_id,observation_id), same-Trip FK, append-only; field-state correction represented by new observation. Price/due tuple completeness and existing money bounds enforced. v2 reservation_id on Event NULL, legacy Reservation schedule columns NULL for v2. Compatibility response must not refill these fields from N:M.

Entitlement DATE validity: date endpoints only, inclusive until-date; INSTANT validity: instant endpoints only, half-open; NULL precision implies all boundaries NULL. Optional issuer/reference/holder never synthesize identity. Entitlement Item edge seats/coach/section require entitlement authority, not group Event privilege. Operational Document custody requires exactly one source_representation_id or storage_object_key. PRIVATE_SOURCE_REFERENCE points to current existing representation identity with owning Source FK/validator RESTRICT; AUTHORIZED_COPY uses a new private operational object key owned by backend custody registry, NEVER source bucket policy bypass. Copy requires source owner's explicit permission plus existing representation hash/bytes verification; read filtering validates custody rights before returning availability. Original identity/hash/media/size/custody cannot update; corrected file is new Document. External URL is on Entitlement, not fake Document bytes.

Instruction FK(trip_id,event_id) and supersedes same-Item/Trip RESTRICT; correction chains acyclic, single visible successor for a prior entry (unique supersedes_id); append/correct revision1 entry, future hide changes only visibility/lifecycle metadata. Body/section/sensitivity/Source are immutable. Sensitive PRIVATE default and owner-only share check. Missing Source FK after retention means evidence unavailable; original cannot be claimed accessible. New tables do not inherit legacy permissive group policies.

Expense_links remain Ledger-owned, existing expense deletion cascade unchanged. Add typed target validation to guarded association path (Item/Reservation/operational Document sameTrip); no target deletion cascade, no generic unvalidated UUID endpoint. Existing type RECEIPT remains Ledger behavior. Existing links are not retroactively reinterpreted as operational Document IDs without kind proof.

Read-state PK(trip_id); epoch created once/reset only by explicit rebuild; revision/access_revision increment on canonical mutation and ACL/membership/Person-binding changes. Read version=2 new certificate namespace, never reuse Person/Ledger/source collection fingerprints. Receipt PK(id), UNIQUE(actor_account_id,operation_id) across Core-v2, request canonical text/hash immutable; lookup includes Trip. Cross-check existing v1 operation journals on same key before fresh v2 use; collision/replay mismatch rejects. Receipt has NO cascade FK to target objects; actor identity retention uses existing audit policy. Store rejection/conflict receipts too: outcome column `APPLIED|NO_CHANGE|CONFLICT|REJECTED`; Appendix uses this exact enum. Result contains typed per-target revision or redacted status, not raw Source bytes. Persist terminal receipt atomically with accepted mutation; capability-disabled/invalid wire requests are not admitted operations and need no receipt.

### Operational custody registry

`trip_operational_document_custody`: PK(id UUID), UNIQUE(trip_id,id), immutable document_id UUID allocated before staging, trip_id UUID FK existing Trip RESTRICT, actor_account_id UUID FK profiles RESTRICT, source_representation_id UUID FK trip_source_representations(id) RESTRICT, custody enum PRIVATE_SOURCE_REFERENCE|AUTHORIZED_COPY, sha256 SHA256, byte_size bounded bigint, media_type allowlisted text, storage_object_key text(1024) nullable, state STAGED|VERIFIED|BOUND|REVOKED, explicit_copy_grant_receipt_id UUID nullable, created_at/verified_at/bound_at timestamptz(6) nullable except created_at. Required all except noted. Copy needs immutable owner grant receipt bound exact actor/Trip/source/hash and intended Document ACL; new Core receipt command `AUTHORIZE_DOCUMENT_COPY` payload `{sourceRepresentationId,documentId,sha256,acl}` owned by source account, creates no bytes and no Item. Its terminal result includes custodyGrantId UUID; custody host validates it, performs exact bytes verification, stores private object key and creates VERIFIED custodyProofId. Reference custody verifies current Source rights and original retention, no copy grant. UNIQUE(document_id) active VERIFIED/BOUND custody; replay returns same result. CREATE_DOCUMENT requires matching VERIFIED custodyProofId/document_id/hash/type/size/ACL and atomically marks BOUND. Registry no public/mobile mirror; Document includes custody_receipt_id UUID same-Trip FK RESTRICT. There is no generic bucket upload permission. Source representation FK trip equality is enforced through source_id→trip_sources.trip_id under lock, not a fictional representation trip_id column. Expiring unbound staged objects can be reclaimed by custody host only; BOUND original retained independently.

Account→Person uses existing journey_members.user_id/status and UNIQUE(trip_id,user_id), checked linked/current membership; new UNIQUE(trip_id,id) supports child composite FK. No second mapping root; core read2 includes only actor's binding plus authorized participant identities. Local TripPerson lacks user_id and cannot infer this binding; authoritative binding comes in actor-filtered certificate.

## 4. Security and server entry points

Fixed backend authenticated routes and dedicated `trip_core_v2_execute`, `trip_core_v2_read_collection`, `trip_core_v2_read_object`, `trip_core_v2_read_receipt` gateway functions. Functions use explicit authenticated actor+Trip derived from gateway admission, immutable request hash and least privilege gateway role, fixed search_path, no caller-set flags. Direct authenticated writes revoked/denied; source/custody functions separate capabilities. Restrictive RLS for business-v2 on existing Event/Reservation must AND with actor ACL even if legacy permissive SELECT/UPDATE exists; existing broad policies cannot leak v2. Protected guard rejects legacy/v1 writes to v2 rows. New private tables deny direct authenticated SELECT except approved function scope. Service-role bypass means RLS alone is insufficient: backend current raw service-role `readCanonicalEvent` must dispatch v2 to actor-qualified reader; v1 cannot return v2 aggregate. Fail startup/read capability if security guards missing. Normal gateway cannot SELECT private operational bytes keys or raw source/custody registry except approved open-original path.

All object reads and association lookups filter both endpoint ACLs before count/page/hash. Collection runs one fixed READ COMMITTED statement or equivalent single-statement materialized snapshot; no multi-query certificate spanning different revisions. Membership/grant changes update access_revision inside same transaction; validator rechecks actor binding before response/install. Unauthorized ID and nonexistent ID share NOT_VISIBLE. Document open yields expiring capability, never persistent public URL. Credentials and PNR absent from telemetry, provider cache and public Day certificate text.

## 5. SQLite54 contract

SQLite is accepted mirror plus durable local intents, not a second business authority. New mirror table names are exactly `trip_core_` + server table name listed in the matrix; PK(account_id,server-key), UNIQUE(account_id,trip_id,server-key), account_id on EVERY row, composite scoped FKs. New v2 mirrors hold only authorized version2 snapshots; old v1 mirror/read47 remains in its original namespace. A v2 Item is never also installed as writable v1 Event. This is versioned mirror segregation of one server identity, not a parallel Item business root.

New local-only tables:

| Table                           | PK / fields                                                                                                                                            | Constraint                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| trip_core_pending_intents       | (account_id,operation_id); trip_id,intent_version=2,canonical_intent_text,intent_sha256,base_vector,created_at,state,queue_operation_id                | PENDING/IN_FLIGHT/APPLIED/CONFLICT/REVIEW/BLOCKED; exact intent bytes frozen; existing durable queue controls delivery |
| trip_core_read_certificates     | (account_id,trip_id); read_version2,epoch,revision,access_revision,actor_person_binding_hash,roster_hash,manifest_sha256,applied_generation            | Install only COMPLETE actor-filtered bundle; no partial absence deletion                                               |
| trip_core_day_rows              | (account_id,trip_id,item_id,projection_role,local_date); family,source_item_revision,projection_version2,certificate_generation,presentation_json      | Finite read DTO, no mutations or independent Event IDs                                                                 |
| trip_core_device_document_state | (account_id,document_id,content_version,sha256); state,verified_at,private_local_locator                                                               | Not server facts; never propagate one device's cached state                                                            |
| trip_core_capture_v2_slots      | (account_id,output_slot_id); proposal/intent2,adapter_key,target_kind,target_vector,operation_id,dependency_ids,domain_receipt,state,source_lineage_id | Additive satellite keyed to existing private source lineage; v1 slots/constraints untouched                            |

Mirror schema enforces structural types/FKs; command layer validates complete tuples. Install headers, all authorized root/child/edge rows and Day rows atomically after content hash and generation/account check. Replace only certified v2 actor partition; preserve pending intents, v1 receipts/history and private Capture originals. Interrupted install leaves old accepted generation intact. Store conflict intent separate from accepted snapshot; never mark local prediction server revision. Pending sparse Flight is immediately visible in local read overlay with stable UUID and `PENDING`, survives restart/offline/account fencing. After receipt, only collection-confirmed rows become accepted; overlay remains until exact operation/UUID/revision confirmation. Eviction does not delete immutable domain history or compensated accepted outputs.

## 6. Capture storage evolution and append-only column appendix

Do not widen immutable v1 Source slot/candidate constraints silently. Add v2 candidate/intent/slot satellite records with PK referring to existing lineage/candidate/output identity; the existing v1 rows remain proposal_version1 and original adapter keys. Server `trip_source_core_v2_candidates`, `trip_source_core_v2_intents`, `trip_source_core_v2_slots` mirror the finite Capture2 grammars in handoff; column bindings are snake_case with exact wire mapping specified below, same-Trip lineage FK RESTRICT, UNIQUE(candidate_id,slot_key,target_kind), UNIQUE(account_id,operation_id) on slots. Output slot state updates use existing execution journal discipline; cannot rewrite frozen candidate facts or successful target. Relation targets require both typed endpoint IDs in target_vector (no raw unvalidated polymorphic reference). Input evidence remains in existing Source/representation/run tables; no second payload store.

The following appendix enumerates exact business fields. Matrix Capture/Admission paths refer only to the three v2 satellites, not constrained v1 business columns. LocalTicketReadiness uses trip_core_device_document_state only, never a server table. New table trip_core_command_receipts and trip_core_read_state are actual server names (SQLite prefix consequently trip_core_trip_core_*). Revision inheritance for every child is the designated parent; no child independent revision column unless root common block explicitly contains revision.

### itinerary_events

| Column                            | Type                                                          | Null    | Additional constraint                                                                          |
| --------------------------------- | ------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| id                                | UUID                                                          | NO (v2) | Immutable client UUID; non-content identity                                                    |
| trip_id                           | UUID                                                          | NO (v2) | Existing Trip FK; same-Trip composite references                                               |
| semantic_revision                 | Revision                                                      | NO (v2) | 1..9007199254740991; increment once per accepted aggregate mutation                            |
| owner_account_id                  | UUID                                                          | NO (v2) | Authenticated creator; immutable; never inferred from passenger/Person name                    |
| visibility                        | PRIVATE / GROUP / SELECTED_PERSONS                            | NO (v2) | Independent from participation; changes require owner or existing shared-item manage authority |
| hidden_at                         | Instant                                                       | YES     | Recoverable hide; never physical user deletion                                                 |
| created_at                        | Instant                                                       | NO (v2) | Immutable accepted addition ordering; pending intent created_at retained separately            |
| updated_at                        | Instant                                                       | NO (v2) | Common typed rules                                                                             |
| field_state                       | FieldStateMap                                                 | NO (v2) | Metadata only; finite registered fields; no business values or credentials                     |
| business_contract_version         | 2                                                             | NO (v2) | v1 rows retain null; v2 rows exactly 2                                                         |
| experience_family                 | P1 / P2 / P3 / P4 / P5 / P6                                   | NO (v2) | Family-to-shape constraints in unified contract                                                |
| temporal_contract_version         | 1                                                             | NO (v2) | Existing boundary wire vocabulary retained; validator dispatched by business version           |
| temporal_shape                    | POINT / CALENDAR / ALL_DAY / SPAN / STAY / TRANSPORT / WINDOW | NO (v2) | No WINDOW creates an undated L1; dated minimum required                                        |
| title                             | Text(200)                                                     | NO (v2) | Trim nonempty; sparse title defaults to flight literal                                         |
| description                       | Text(5000)                                                    | YES     | Common typed rules                                                                             |
| event_type                        | ExistingEventType                                             | NO (v2) | Compatibility mapping only; no Other renderer                                                  |
| status                            | planned / skipped / completed / cancelled                     | NO (v2) | Cancellation is OTR recording, not supplier action                                             |
| order_index                       | Int32                                                         | YES     | Common typed rules                                                                             |
| trip_day_id                       | UUID                                                          | YES     | Optional same-Trip existing grouping; no required TripDay creation                             |
| participation_mode                | WHOLE_GROUP / SELECTED_MEMBERS / SELF                         | NO (v2) | WHOLE_GROUP dynamic roster; selected nonempty Person set; SELF immutable owner                 |
| participant_scope                 | UNASSIGNED / ASSIGNED / WHOLE_GROUP                           | NO (v2) | v2 derived compatibility value; not independently writable                                     |
| self_person_id                    | UUID                                                          | YES     | Server-authenticated owner binding only; unknown mapping does not block SELF                   |
| activity_category                 | POI / DINING / SHOPPING / HIKE / APPOINTMENT / GENERAL        | YES     | P1/P6 optional; renderer family independent                                                    |
| reservation_id                    | UUID                                                          | YES     | v1 read-only legacy association; v2 NULL; N:M link is authority                                |
| timing_label                      | Text(500)                                                     | YES     | Display annotation, never a date/time authority                                                |
| start_local_date                  | Date                                                          | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| start_local_time                  | Clock                                                         | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| start_clock_precision             | Precision                                                     | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| start_quality                     | UNKNOWN / EXACT / ESTIMATED                                   | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| start_basis                       | DERIVED_CIVIL / SOURCE_INSTANT                                | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| start_zone_id                     | Text(128)                                                     | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| start_supplied_offset_seconds     | Offset                                                        | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| start_source_instant              | Instant                                                       | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| start_source_instant_precision    | Precision                                                     | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| start_civil_resolution            | PENDING / UNIQUE / GAP / FOLD / FOLD_RESOLVED                 | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| start_resolution_offset_seconds   | Offset                                                        | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| start_interpretation_key          | Text(256)                                                     | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| start_interpretation_input_sha256 | SHA256                                                        | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| start_provenance_refs             | ProofMap                                                      | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| planned_start                     | Instant                                                       | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| end_local_date                    | Date                                                          | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| end_local_time                    | Clock                                                         | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| end_clock_precision               | Precision                                                     | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| end_quality                       | UNKNOWN / EXACT / ESTIMATED                                   | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| end_basis                         | DERIVED_CIVIL / SOURCE_INSTANT                                | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| end_zone_id                       | Text(128)                                                     | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| end_supplied_offset_seconds       | Offset                                                        | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| end_source_instant                | Instant                                                       | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| end_source_instant_precision      | Precision                                                     | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| end_civil_resolution              | PENDING / UNIQUE / GAP / FOLD / FOLD_RESOLVED                 | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| end_resolution_offset_seconds     | Offset                                                        | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| end_interpretation_key            | Text(256)                                                     | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| end_interpretation_input_sha256   | SHA256                                                        | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| end_provenance_refs               | ProofMap                                                      | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| planned_end                       | Instant                                                       | YES     | Boundary tuple rules §3; TRANSPORT root boundaries NULL                                        |
| authored_label                    | Text(500)                                                     | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| authored_text                     | Text(5000)                                                    | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| authored_address                  | Text(2000)                                                    | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| accepted_address                  | Text(2000)                                                    | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| accepted_latitude                 | Latitude                                                      | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| accepted_longitude                | Longitude                                                     | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| accepted_place_id                 | UUID                                                          | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| spatial_provenance_refs           | ProofMap                                                      | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| location_input_revision           | Revision                                                      | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| authored_address_line1            | Text(500)                                                     | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| authored_address_line2            | Text(500)                                                     | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| authored_address_locality         | Text(200)                                                     | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| authored_address_region           | Text(200)                                                     | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| authored_address_postal_code      | Text(64)                                                      | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| authored_address_country          | Text(128)                                                     | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| accepted_address_line1            | Text(500)                                                     | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| accepted_address_line2            | Text(500)                                                     | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| accepted_address_locality         | Text(200)                                                     | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| accepted_address_region           | Text(200)                                                     | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| accepted_address_postal_code      | Text(64)                                                      | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |
| accepted_address_country          | Text(128)                                                     | YES     | Authored input vs accepted qualification; coordinate pair; optional Place FK SET NULL          |

### itinerary_transport_endpoints

| Column                       | Type                                          | Null    | Additional constraint                                             |
| ---------------------------- | --------------------------------------------- | ------- | ----------------------------------------------------------------- |
| event_id                     | UUID                                          | NO (v2) | Composite FK (trip_id,event_id) Item RESTRICT                     |
| trip_id                      | UUID                                          | NO (v2) | Common typed rules                                                |
| role                         | ORIGIN / DESTINATION                          | NO (v2) | PK(event_id,role); exactly 2 per TRANSPORT; none otherwise        |
| local_date                   | Date                                          | YES     | Strict Flight proof tuple for P2; P5 general boundary rules       |
| local_time                   | Clock                                         | YES     | Strict Flight proof tuple for P2; P5 general boundary rules       |
| clock_precision              | Precision                                     | YES     | Strict Flight proof tuple for P2; P5 general boundary rules       |
| quality                      | UNKNOWN / EXACT / ESTIMATED                   | YES     | Strict Flight proof tuple for P2; P5 general boundary rules       |
| basis                        | DERIVED_CIVIL / SOURCE_INSTANT                | YES     | Strict Flight proof tuple for P2; P5 general boundary rules       |
| zone_id                      | Text(128)                                     | YES     | Strict Flight proof tuple for P2; P5 general boundary rules       |
| supplied_offset_seconds      | Offset                                        | YES     | Strict Flight proof tuple for P2; P5 general boundary rules       |
| source_instant               | Instant                                       | YES     | Strict Flight proof tuple for P2; P5 general boundary rules       |
| source_instant_precision     | Precision                                     | YES     | Strict Flight proof tuple for P2; P5 general boundary rules       |
| civil_resolution             | PENDING / UNIQUE / GAP / FOLD / FOLD_RESOLVED | YES     | Strict Flight proof tuple for P2; P5 general boundary rules       |
| resolution_offset_seconds    | Offset                                        | YES     | Strict Flight proof tuple for P2; P5 general boundary rules       |
| interpretation_key           | Text(256)                                     | YES     | Strict Flight proof tuple for P2; P5 general boundary rules       |
| interpretation_input_sha256  | SHA256                                        | YES     | Strict Flight proof tuple for P2; P5 general boundary rules       |
| provenance_refs              | ProofMap                                      | YES     | Strict Flight proof tuple for P2; P5 general boundary rules       |
| instant                      | Instant                                       | YES     | Strict Flight proof tuple for P2; P5 general boundary rules       |
| authored_label               | Text(500)                                     | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| authored_text                | Text(5000)                                    | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| authored_address             | Text(2000)                                    | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| accepted_address             | Text(2000)                                    | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| accepted_latitude            | Latitude                                      | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| accepted_longitude           | Longitude                                     | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| accepted_place_id            | UUID                                          | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| spatial_provenance_refs      | ProofMap                                      | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| location_input_revision      | Revision                                      | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| authored_address_line1       | Text(500)                                     | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| authored_address_line2       | Text(500)                                     | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| authored_address_locality    | Text(200)                                     | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| authored_address_region      | Text(200)                                     | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| authored_address_postal_code | Text(64)                                      | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| authored_address_country     | Text(128)                                     | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| accepted_address_line1       | Text(500)                                     | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| accepted_address_line2       | Text(500)                                     | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| accepted_address_locality    | Text(200)                                     | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| accepted_address_region      | Text(200)                                     | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| accepted_address_postal_code | Text(64)                                      | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |
| accepted_address_country     | Text(128)                                     | YES     | Endpoint spatial authority; no duplicate root place for TRANSPORT |

### trip_endpoint_details

| Column       | Type                 | Null    | Additional constraint                                    |
| ------------ | -------------------- | ------- | -------------------------------------------------------- |
| airport_code | Text(8)              | YES     | PK(event_id,role); annotations only; no schedule columns |
| terminal     | Text(128)            | YES     | PK(event_id,role); annotations only; no schedule columns |
| platform     | Text(128)            | YES     | PK(event_id,role); annotations only; no schedule columns |
| pier         | Text(128)            | YES     | PK(event_id,role); annotations only; no schedule columns |
| event_id     | UUID                 | NO (v2) | Common typed rules                                       |
| trip_id      | UUID                 | NO (v2) | Common typed rules                                       |
| role         | ORIGIN / DESTINATION | NO (v2) | Common typed rules                                       |

### trip_flight_intents

| Column                | Type               | Null    | Additional constraint                                                                                              |
| --------------------- | ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------ |
| event_id              | UUID               | NO (v2) | Item-owned; literal is authored input, not accepted qualified identity; departure date comes only from Item/ORIGIN |
| trip_id               | UUID               | NO (v2) | Item-owned; literal is authored input, not accepted qualified identity; departure date comes only from Item/ORIGIN |
| flight_number_literal | Text(255)          | NO (v2) | Item-owned; literal is authored input, not accepted qualified identity; departure date comes only from Item/ORIGIN |
| qualification         | SPARSE / QUALIFIED | NO (v2) | Item-owned; literal is authored input, not accepted qualified identity; departure date comes only from Item/ORIGIN |

### itinerary_transport_services

| Column                  | Type                                                           | Null    | Additional constraint                                                                                        |
| ----------------------- | -------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| event_id                | UUID                                                           | NO (v2) | P2 exact flightServiceSchema and aggregate proof grammar unchanged; P5 AUTHORITY/NAME, singleton per segment |
| trip_id                 | UUID                                                           | NO (v2) | P2 exact flightServiceSchema and aggregate proof grammar unchanged; P5 AUTHORITY/NAME, singleton per segment |
| service_key             | ServiceKey                                                     | NO (v2) | P2 exact flightServiceSchema and aggregate proof grammar unchanged; P5 AUTHORITY/NAME, singleton per segment |
| transport_subtype       | FLIGHT / TRAIN / BUS / FERRY / WATER_TAXI / SHUTTLE / TRANSFER | NO (v2) | P2 exact flightServiceSchema and aggregate proof grammar unchanged; P5 AUTHORITY/NAME, singleton per segment |
| attribution             | MARKETING / OPERATING / UNSPECIFIED                            | NO (v2) | P2 exact flightServiceSchema and aggregate proof grammar unchanged; P5 AUTHORITY/NAME, singleton per segment |
| operator_namespace      | IATA_AIRLINE / ICAO_AIRLINE / AUTHORITY / NAME                 | NO (v2) | P2 exact flightServiceSchema and aggregate proof grammar unchanged; P5 AUTHORITY/NAME, singleton per segment |
| operator_issuer         | Text(128)                                                      | NO (v2) | P2 exact flightServiceSchema and aggregate proof grammar unchanged; P5 AUTHORITY/NAME, singleton per segment |
| operator_value          | Text(128)                                                      | NO (v2) | P2 exact flightServiceSchema and aggregate proof grammar unchanged; P5 AUTHORITY/NAME, singleton per segment |
| operator_literal        | Text(255)                                                      | NO (v2) | P2 exact flightServiceSchema and aggregate proof grammar unchanged; P5 AUTHORITY/NAME, singleton per segment |
| service_number          | Text(64)                                                       | NO (v2) | P2 exact flightServiceSchema and aggregate proof grammar unchanged; P5 AUTHORITY/NAME, singleton per segment |
| service_literal         | Text(255)                                                      | NO (v2) | P2 exact flightServiceSchema and aggregate proof grammar unchanged; P5 AUTHORITY/NAME, singleton per segment |
| codeshare_operating_key | ServiceKey                                                     | YES     | P2 exact flightServiceSchema and aggregate proof grammar unchanged; P5 AUTHORITY/NAME, singleton per segment |

### trip_stay_details

| Column                  | Type      | Null    | Additional constraint                                                                                        |
| ----------------------- | --------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| event_id                | UUID      | NO (v2) | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| trip_id                 | UUID      | NO (v2) | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| property_name           | Text(500) | YES     | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| permitted_checkin_from  | Clock     | YES     | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| permitted_checkin_until | Clock     | YES     | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| permitted_checkout_by   | Clock     | YES     | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |

### trip_stay_rooms

| Column   | Type        | Null    | Additional constraint                                                                                        |
| -------- | ----------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| event_id | UUID        | NO (v2) | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| trip_id  | UUID        | NO (v2) | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| room_id  | UUID        | NO (v2) | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| category | Text(500)   | YES     | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| quantity | PositiveInt | YES     | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| capacity | PositiveInt | YES     | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |

### trip_rental_details

| Column               | Type      | Null    | Additional constraint                                                                                        |
| -------------------- | --------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| event_id             | UUID      | NO (v2) | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| trip_id              | UUID      | NO (v2) | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| supplier             | Text(500) | YES     | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| reserved_category    | Text(500) | YES     | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| or_similar           | Bool      | YES     | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| actual_vehicle_model | Text(500) | YES     | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| verified_plate       | Text(64)  | YES     | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |

### trip_activity_details

| Column         | Type       | Null    | Additional constraint                                                                                        |
| -------------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| event_id       | UUID       | NO (v2) | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| trip_id        | UUID       | NO (v2) | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| session_label  | Text(500)  | YES     | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |
| admission_note | Text(2000) | YES     | Item revision owns detail; no independent schedule; known plate requires vehicle evidence/manual attestation |

### trip_rental_places

| Column                       | Type            | Null    | Additional constraint                                        |
| ---------------------------- | --------------- | ------- | ------------------------------------------------------------ |
| event_id                     | UUID            | NO (v2) | Common typed rules                                           |
| trip_id                      | UUID            | NO (v2) | Common typed rules                                           |
| role                         | PICKUP / RETURN | NO (v2) | Common typed rules                                           |
| authored_label               | Text(500)       | YES     | Place authority for this role; no second root/endpoint value |
| authored_text                | Text(5000)      | YES     | Place authority for this role; no second root/endpoint value |
| authored_address             | Text(2000)      | YES     | Place authority for this role; no second root/endpoint value |
| accepted_address             | Text(2000)      | YES     | Place authority for this role; no second root/endpoint value |
| accepted_latitude            | Latitude        | YES     | Place authority for this role; no second root/endpoint value |
| accepted_longitude           | Longitude       | YES     | Place authority for this role; no second root/endpoint value |
| accepted_place_id            | UUID            | YES     | Place authority for this role; no second root/endpoint value |
| spatial_provenance_refs      | ProofMap        | YES     | Place authority for this role; no second root/endpoint value |
| location_input_revision      | Revision        | YES     | Place authority for this role; no second root/endpoint value |
| authored_address_line1       | Text(500)       | YES     | Place authority for this role; no second root/endpoint value |
| authored_address_line2       | Text(500)       | YES     | Place authority for this role; no second root/endpoint value |
| authored_address_locality    | Text(200)       | YES     | Place authority for this role; no second root/endpoint value |
| authored_address_region      | Text(200)       | YES     | Place authority for this role; no second root/endpoint value |
| authored_address_postal_code | Text(64)        | YES     | Place authority for this role; no second root/endpoint value |
| authored_address_country     | Text(128)       | YES     | Place authority for this role; no second root/endpoint value |
| accepted_address_line1       | Text(500)       | YES     | Place authority for this role; no second root/endpoint value |
| accepted_address_line2       | Text(500)       | YES     | Place authority for this role; no second root/endpoint value |
| accepted_address_locality    | Text(200)       | YES     | Place authority for this role; no second root/endpoint value |
| accepted_address_region      | Text(200)       | YES     | Place authority for this role; no second root/endpoint value |
| accepted_address_postal_code | Text(64)        | YES     | Place authority for this role; no second root/endpoint value |
| accepted_address_country     | Text(128)       | YES     | Place authority for this role; no second root/endpoint value |

### trip_activity_entry_places

| Column                       | Type       | Null    | Additional constraint                                        |
| ---------------------------- | ---------- | ------- | ------------------------------------------------------------ |
| event_id                     | UUID       | NO (v2) | Common typed rules                                           |
| trip_id                      | UUID       | NO (v2) | Common typed rules                                           |
| role                         | ENTRY      | NO (v2) | Common typed rules                                           |
| authored_label               | Text(500)  | YES     | Place authority for this role; no second root/endpoint value |
| authored_text                | Text(5000) | YES     | Place authority for this role; no second root/endpoint value |
| authored_address             | Text(2000) | YES     | Place authority for this role; no second root/endpoint value |
| accepted_address             | Text(2000) | YES     | Place authority for this role; no second root/endpoint value |
| accepted_latitude            | Latitude   | YES     | Place authority for this role; no second root/endpoint value |
| accepted_longitude           | Longitude  | YES     | Place authority for this role; no second root/endpoint value |
| accepted_place_id            | UUID       | YES     | Place authority for this role; no second root/endpoint value |
| spatial_provenance_refs      | ProofMap   | YES     | Place authority for this role; no second root/endpoint value |
| location_input_revision      | Revision   | YES     | Place authority for this role; no second root/endpoint value |
| authored_address_line1       | Text(500)  | YES     | Place authority for this role; no second root/endpoint value |
| authored_address_line2       | Text(500)  | YES     | Place authority for this role; no second root/endpoint value |
| authored_address_locality    | Text(200)  | YES     | Place authority for this role; no second root/endpoint value |
| authored_address_region      | Text(200)  | YES     | Place authority for this role; no second root/endpoint value |
| authored_address_postal_code | Text(64)   | YES     | Place authority for this role; no second root/endpoint value |
| authored_address_country     | Text(128)  | YES     | Place authority for this role; no second root/endpoint value |
| accepted_address_line1       | Text(500)  | YES     | Place authority for this role; no second root/endpoint value |
| accepted_address_line2       | Text(500)  | YES     | Place authority for this role; no second root/endpoint value |
| accepted_address_locality    | Text(200)  | YES     | Place authority for this role; no second root/endpoint value |
| accepted_address_region      | Text(200)  | YES     | Place authority for this role; no second root/endpoint value |
| accepted_address_postal_code | Text(64)   | YES     | Place authority for this role; no second root/endpoint value |
| accepted_address_country     | Text(128)  | YES     | Place authority for this role; no second root/endpoint value |

### trip_transport_operational_facts

| Column                       | Type                                          | Null    | Additional constraint                                                                      |
| ---------------------------- | --------------------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| event_id                     | UUID                                          | NO (v2) | Common typed rules                                                                         |
| trip_id                      | UUID                                          | NO (v2) | Common typed rules                                                                         |
| role                         | MEETING / CHECKIN / BOARDING_CUTOFF           | NO (v2) | Common typed rules                                                                         |
| authored_label               | Text(500)                                     | YES     | Place authority for this role; no second root/endpoint value                               |
| authored_text                | Text(5000)                                    | YES     | Place authority for this role; no second root/endpoint value                               |
| authored_address             | Text(2000)                                    | YES     | Place authority for this role; no second root/endpoint value                               |
| accepted_address             | Text(2000)                                    | YES     | Place authority for this role; no second root/endpoint value                               |
| accepted_latitude            | Latitude                                      | YES     | Place authority for this role; no second root/endpoint value                               |
| accepted_longitude           | Longitude                                     | YES     | Place authority for this role; no second root/endpoint value                               |
| accepted_place_id            | UUID                                          | YES     | Place authority for this role; no second root/endpoint value                               |
| spatial_provenance_refs      | ProofMap                                      | YES     | Place authority for this role; no second root/endpoint value                               |
| location_input_revision      | Revision                                      | YES     | Place authority for this role; no second root/endpoint value                               |
| authored_address_line1       | Text(500)                                     | YES     | Place authority for this role; no second root/endpoint value                               |
| authored_address_line2       | Text(500)                                     | YES     | Place authority for this role; no second root/endpoint value                               |
| authored_address_locality    | Text(200)                                     | YES     | Place authority for this role; no second root/endpoint value                               |
| authored_address_region      | Text(200)                                     | YES     | Place authority for this role; no second root/endpoint value                               |
| authored_address_postal_code | Text(64)                                      | YES     | Place authority for this role; no second root/endpoint value                               |
| authored_address_country     | Text(128)                                     | YES     | Place authority for this role; no second root/endpoint value                               |
| accepted_address_line1       | Text(500)                                     | YES     | Place authority for this role; no second root/endpoint value                               |
| accepted_address_line2       | Text(500)                                     | YES     | Place authority for this role; no second root/endpoint value                               |
| accepted_address_locality    | Text(200)                                     | YES     | Place authority for this role; no second root/endpoint value                               |
| accepted_address_region      | Text(200)                                     | YES     | Place authority for this role; no second root/endpoint value                               |
| accepted_address_postal_code | Text(64)                                      | YES     | Place authority for this role; no second root/endpoint value                               |
| accepted_address_country     | Text(128)                                     | YES     | Place authority for this role; no second root/endpoint value                               |
| local_date                   | Date                                          | YES     | Operational prerequisite only, not departure/arrival schedule; date required if time known |
| local_time                   | Clock                                         | YES     | Operational prerequisite only, not departure/arrival schedule; date required if time known |
| clock_precision              | Precision                                     | YES     | Operational prerequisite only, not departure/arrival schedule; date required if time known |
| quality                      | UNKNOWN / EXACT / ESTIMATED                   | YES     | Operational prerequisite only, not departure/arrival schedule; date required if time known |
| basis                        | DERIVED_CIVIL / SOURCE_INSTANT                | YES     | Operational prerequisite only, not departure/arrival schedule; date required if time known |
| zone_id                      | Text(128)                                     | YES     | Operational prerequisite only, not departure/arrival schedule; date required if time known |
| supplied_offset_seconds      | Offset                                        | YES     | Operational prerequisite only, not departure/arrival schedule; date required if time known |
| source_instant               | Instant                                       | YES     | Operational prerequisite only, not departure/arrival schedule; date required if time known |
| source_instant_precision     | Precision                                     | YES     | Operational prerequisite only, not departure/arrival schedule; date required if time known |
| civil_resolution             | PENDING / UNIQUE / GAP / FOLD / FOLD_RESOLVED | YES     | Operational prerequisite only, not departure/arrival schedule; date required if time known |
| resolution_offset_seconds    | Offset                                        | YES     | Operational prerequisite only, not departure/arrival schedule; date required if time known |
| interpretation_key           | Text(256)                                     | YES     | Operational prerequisite only, not departure/arrival schedule; date required if time known |
| interpretation_input_sha256  | SHA256                                        | YES     | Operational prerequisite only, not departure/arrival schedule; date required if time known |
| provenance_refs              | ProofMap                                      | YES     | Operational prerequisite only, not departure/arrival schedule; date required if time known |
| instant                      | Instant                                       | YES     | Operational prerequisite only, not departure/arrival schedule; date required if time known |

### itinerary_reservations

| Column                    | Type                               | Null    | Additional constraint                                                                          |
| ------------------------- | ---------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| id                        | UUID                               | NO (v2) | Immutable client UUID; non-content identity                                                    |
| trip_id                   | UUID                               | NO (v2) | Existing Trip FK; same-Trip composite references                                               |
| revision                  | Revision                           | NO (v2) | 1..9007199254740991; increment once per accepted aggregate mutation                            |
| owner_account_id          | UUID                               | NO (v2) | Authenticated creator; immutable; never inferred from passenger/Person name                    |
| visibility                | PRIVATE / GROUP / SELECTED_PERSONS | NO (v2) | Independent from participation; changes require owner or existing shared-item manage authority |
| hidden_at                 | Instant                            | YES     | Recoverable hide; never physical user deletion                                                 |
| created_at                | Instant                            | NO (v2) | Immutable accepted addition ordering; pending intent created_at retained separately            |
| updated_at                | Instant                            | NO (v2) | Common typed rules                                                                             |
| field_state               | FieldStateMap                      | NO (v2) | Metadata only; finite registered fields; no business values or credentials                     |
| business_contract_version | 2                                  | NO (v2) | Common typed rules                                                                             |
| title                     | Text(200)                          | NO (v2) | Common typed rules                                                                             |
| provider                  | Text(500)                          | YES     | Common typed rules                                                                             |
| confirmation_code         | Text(255)                          | YES     | Nonunique, Trip/issuer-scoped evidence only; private by default                                |
| contact                   | Text(1000)                         | YES     | Common typed rules                                                                             |
| booking_url               | HTTPSURL(2048)                     | YES     | No credentials/query token storage                                                             |
| commercial_status         | ACTIVE / CANCELLED / REPLACED      | NO (v2) | Supplier cancellation not implied                                                              |
| replaces_booking_id       | UUID                               | YES     | Same-Trip self FK RESTRICT; acyclic; reciprocal replacement receipt                            |
| supplier_observation      | Text(2000)                         | YES     | Observed supplier state only                                                                   |
| price_minor               | SafeInt                            | YES     | Nullable Money tuple; no assumed allocations                                                   |
| price_currency            | Currency                           | YES     | Known ISO currency/scale registry                                                              |
| price_scale               | Scale                              | YES     | Common typed rules                                                                             |
| due_minor                 | SafeInt                            | YES     | Due != paid                                                                                    |
| due_currency              | Currency                           | YES     | Common typed rules                                                                             |
| due_scale                 | Scale                              | YES     | Common typed rules                                                                             |

### trip_booking_observations

| Column         | Type       | Null    | Additional constraint                                                        |
| -------------- | ---------- | ------- | ---------------------------------------------------------------------------- |
| holder_label   | Text(500)  | YES     | PK(booking_id,observation_id); immutable observation, not schedule authority |
| observed_start | Text(500)  | YES     | PK(booking_id,observation_id); immutable observation, not schedule authority |
| observed_end   | Text(500)  | YES     | PK(booking_id,observation_id); immutable observation, not schedule authority |
| source_summary | Text(5000) | YES     | PK(booking_id,observation_id); immutable observation, not schedule authority |
| trip_id        | UUID       | NO (v2) | Common typed rules                                                           |
| booking_id     | UUID       | NO (v2) | Common typed rules                                                           |
| observation_id | UUID       | NO (v2) | Common typed rules                                                           |

### trip_entitlements

| Column              | Type                                                                            | Null    | Additional constraint                                                                          |
| ------------------- | ------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| id                  | UUID                                                                            | NO (v2) | Immutable client UUID; non-content identity                                                    |
| trip_id             | UUID                                                                            | NO (v2) | Existing Trip FK; same-Trip composite references                                               |
| revision            | Revision                                                                        | NO (v2) | 1..9007199254740991; increment once per accepted aggregate mutation                            |
| owner_account_id    | UUID                                                                            | NO (v2) | Authenticated creator; immutable; never inferred from passenger/Person name                    |
| visibility          | PRIVATE / GROUP / SELECTED_PERSONS                                              | NO (v2) | Independent from participation; changes require owner or existing shared-item manage authority |
| hidden_at           | Instant                                                                         | YES     | Recoverable hide; never physical user deletion                                                 |
| created_at          | Instant                                                                         | NO (v2) | Immutable accepted addition ordering; pending intent created_at retained separately            |
| updated_at          | Instant                                                                         | NO (v2) | Common typed rules                                                                             |
| field_state         | FieldStateMap                                                                   | NO (v2) | Metadata only; finite registered fields; no business values or credentials                     |
| kind                | TICKET / PASS / BOARDING_PASS / RESERVATION_RIGHT                               | NO (v2) | Common typed rules                                                                             |
| title               | Text(200)                                                                       | NO (v2) | Common typed rules                                                                             |
| issuer              | Text(500)                                                                       | YES     | Common typed rules                                                                             |
| reference           | Text(255)                                                                       | YES     | Not unique; private by default                                                                 |
| quantity            | PositiveInt                                                                     | YES     | Unknown capacity not forced to 1; group ticket does not require Persons                        |
| holder_label        | Text(500)                                                                       | YES     | No inferred Person assignment                                                                  |
| status              | ACTIVE / CANCELLED / EXPIRED                                                    | NO (v2) | Validity-derived expiration presentation cannot rewrite status                                 |
| access_class        | STATIC_ORIGINAL / CONFIRMATION_ONLY / APPLE_WALLET / EXTERNAL_DYNAMIC / UNKNOWN | NO (v2) | No synthesized QR or issuer-acceptance claim                                                   |
| provider_url        | HTTPSURL(2048)                                                                  | YES     | Public provider entry; no bearer credentials                                                   |
| valid_from_date     | Date                                                                            | YES     | Common typed rules                                                                             |
| valid_until_date    | Date                                                                            | YES     | Inclusive when only date; no fabricated instant                                                |
| valid_from_instant  | Instant                                                                         | YES     | Common typed rules                                                                             |
| valid_until_instant | Instant                                                                         | YES     | Exclusive when instants; must have proof timezone/precision                                    |
| validity_zone_id    | Text(128)                                                                       | YES     | Retain supplied zone; do not infer from phone                                                  |
| validity_precision  | DATE / INSTANT                                                                  | YES     | One validity mode; at least one boundary if mode present                                       |

### trip_operational_documents

| Column                   | Type                                       | Null    | Additional constraint                                                                          |
| ------------------------ | ------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------- |
| id                       | UUID                                       | NO (v2) | Immutable client UUID; non-content identity                                                    |
| trip_id                  | UUID                                       | NO (v2) | Existing Trip FK; same-Trip composite references                                               |
| revision                 | Revision                                   | NO (v2) | 1..9007199254740991; increment once per accepted aggregate mutation                            |
| owner_account_id         | UUID                                       | NO (v2) | Authenticated creator; immutable; never inferred from passenger/Person name                    |
| visibility               | PRIVATE / GROUP / SELECTED_PERSONS         | NO (v2) | Independent from participation; changes require owner or existing shared-item manage authority |
| hidden_at                | Instant                                    | YES     | Recoverable hide; never physical user deletion                                                 |
| created_at               | Instant                                    | NO (v2) | Immutable accepted addition ordering; pending intent created_at retained separately            |
| updated_at               | Instant                                    | NO (v2) | Common typed rules                                                                             |
| field_state              | FieldStateMap                              | NO (v2) | Metadata only; finite registered fields; no business values or credentials                     |
| title                    | Text(200)                                  | NO (v2) | Common typed rules                                                                             |
| media_type               | MediaType                                  | NO (v2) | Verified bytes, not filename                                                                   |
| byte_size                | NonnegativeInt                             | NO (v2) | 0..10MiB binary /1MiB text; existing Capture quotas also apply                                 |
| sha256                   | SHA256                                     | NO (v2) | Immutable verified exact bytes                                                                 |
| custody                  | PRIVATE_SOURCE_REFERENCE / AUTHORIZED_COPY | NO (v2) | Reference requires Source rights at each open; sharing requires explicit owner-authorized copy |
| source_representation_id | UUID                                       | YES     | Only PRIVATE_SOURCE_REFERENCE; typed Source FK RESTRICT                                        |
| storage_object_key       | Text(1024)                                 | YES     | Only AUTHORIZED_COPY; backend-controlled private operational bucket; no URL/token              |
| content_version          | PositiveInt                                | NO (v2) | Immutable bytes per Document UUID; corrected original creates new Document                     |
| ticket_face_index        | NonnegativeInt                             | YES     | Only if observed distinct face; no inferred faces from quantity                                |
| qr_region                | Region                                     | YES     | Bounded page/normalized bounding box in immutable original, no decoded/redrawn QR              |

### trip_instruction_entries

| Column                   | Type                                                               | Null    | Additional constraint                                                                          |
| ------------------------ | ------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------- |
| id                       | UUID                                                               | NO (v2) | Immutable client UUID; non-content identity                                                    |
| trip_id                  | UUID                                                               | NO (v2) | Existing Trip FK; same-Trip composite references                                               |
| revision                 | Revision                                                           | NO (v2) | 1..9007199254740991; increment once per accepted aggregate mutation                            |
| owner_account_id         | UUID                                                               | NO (v2) | Authenticated creator; immutable; never inferred from passenger/Person name                    |
| visibility               | PRIVATE / GROUP / SELECTED_PERSONS                                 | NO (v2) | Independent from participation; changes require owner or existing shared-item manage authority |
| hidden_at                | Instant                                                            | YES     | Recoverable hide; never physical user deletion                                                 |
| created_at               | Instant                                                            | NO (v2) | Immutable accepted addition ordering; pending intent created_at retained separately            |
| updated_at               | Instant                                                            | NO (v2) | Common typed rules                                                                             |
| field_state              | FieldStateMap                                                      | NO (v2) | Metadata only; finite registered fields; no business values or credentials                     |
| event_id                 | UUID                                                               | NO (v2) | Same-Trip Item; read requires Item AND Instruction ACL                                         |
| section                  | ARRIVAL / DURING / DEPARTURE / PICKUP / RETURN / TRANSPORT / ENTRY | NO (v2) | Family-appropriate finite section                                                              |
| body                     | Text(5000)                                                         | NO (v2) | No ad-hoc structured password columns                                                          |
| sensitivity              | NORMAL / SENSITIVE                                                 | NO (v2) | SENSITIVE default PRIVATE, owner explicit share only                                           |
| supersedes_id            | UUID                                                               | YES     | Same-Item same-Trip prior entry; immutable acyclic correction chain                            |
| source_representation_id | UUID                                                               | YES     | Source remains private; display entry does not expose source original                          |

### trip_booking_item_links

| Column     | Type    | Null    | Additional constraint                                                                                              |
| ---------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| trip_id    | UUID    | NO (v2) | PK(booking_id,item_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Booking |
| booking_id | UUID    | NO (v2) | PK(booking_id,item_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Booking |
| item_id    | UUID    | NO (v2) | PK(booking_id,item_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Booking |
| active     | Bool    | NO (v2) | PK(booking_id,item_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Booking |
| linked_by  | UUID    | NO (v2) | Authenticated linking actor; requires both object relationship-manage capability                                   |
| linked_at  | Instant | NO (v2) | Common typed rules                                                                                                 |

### trip_entitlement_item_links

| Column            | Type      | Null    | Additional constraint                                                                                                      |
| ----------------- | --------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| trip_id           | UUID      | NO (v2) | PK(entitlement_id,item_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Entitlement |
| entitlement_id    | UUID      | NO (v2) | PK(entitlement_id,item_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Entitlement |
| item_id           | UUID      | NO (v2) | PK(entitlement_id,item_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Entitlement |
| active            | Bool      | NO (v2) | PK(entitlement_id,item_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Entitlement |
| linked_by         | UUID      | NO (v2) | Authenticated linking actor; requires both object relationship-manage capability                                           |
| linked_at         | Instant   | NO (v2) | Common typed rules                                                                                                         |
| coach             | Text(128) | YES     | Entitlement-to-segment facts; no Item schedule                                                                             |
| seat              | Text(128) | YES     | Entitlement-to-segment facts; no Item schedule                                                                             |
| section           | Text(128) | YES     | Entitlement-to-segment facts; no Item schedule                                                                             |
| cabin             | Text(128) | YES     | Entitlement-to-segment facts; no Item schedule                                                                             |
| fare_class        | Text(128) | YES     | Entitlement-to-segment facts; no Item schedule                                                                             |
| baggage_allowance | Text(500) | YES     | Entitlement-to-segment facts; no Item schedule                                                                             |

### trip_booking_entitlement_links

| Column         | Type    | Null    | Additional constraint                                                                                                     |
| -------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| trip_id        | UUID    | NO (v2) | PK(booking_id,entitlement_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Booking |
| booking_id     | UUID    | NO (v2) | PK(booking_id,entitlement_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Booking |
| entitlement_id | UUID    | NO (v2) | PK(booking_id,entitlement_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Booking |
| active         | Bool    | NO (v2) | PK(booking_id,entitlement_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Booking |
| linked_by      | UUID    | NO (v2) | Authenticated linking actor; requires both object relationship-manage capability                                          |
| linked_at      | Instant | NO (v2) | Common typed rules                                                                                                        |

### trip_booking_document_links

| Column      | Type    | Null    | Additional constraint                                                                                                  |
| ----------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| trip_id     | UUID    | NO (v2) | PK(booking_id,document_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Booking |
| booking_id  | UUID    | NO (v2) | PK(booking_id,document_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Booking |
| document_id | UUID    | NO (v2) | PK(booking_id,document_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Booking |
| active      | Bool    | NO (v2) | PK(booking_id,document_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Booking |
| linked_by   | UUID    | NO (v2) | Authenticated linking actor; requires both object relationship-manage capability                                       |
| linked_at   | Instant | NO (v2) | Common typed rules                                                                                                     |

### trip_entitlement_document_links

| Column         | Type    | Null    | Additional constraint                                                                                                          |
| -------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| trip_id        | UUID    | NO (v2) | PK(entitlement_id,document_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Entitlement |
| entitlement_id | UUID    | NO (v2) | PK(entitlement_id,document_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Entitlement |
| document_id    | UUID    | NO (v2) | PK(entitlement_id,document_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Entitlement |
| active         | Bool    | NO (v2) | PK(entitlement_id,document_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Entitlement |
| linked_by      | UUID    | NO (v2) | Authenticated linking actor; requires both object relationship-manage capability                                               |
| linked_at      | Instant | NO (v2) | Common typed rules                                                                                                             |

### trip_item_document_links

| Column      | Type    | Null    | Additional constraint                                                                                            |
| ----------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| trip_id     | UUID    | NO (v2) | PK(item_id,document_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Item |
| item_id     | UUID    | NO (v2) | PK(item_id,document_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Item |
| document_id | UUID    | NO (v2) | PK(item_id,document_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Item |
| active      | Bool    | NO (v2) | PK(item_id,document_id); composite same-Trip FKs RESTRICT; unlink active=false; unique edge; revision owner Item |
| linked_by   | UUID    | NO (v2) | Authenticated linking actor; requires both object relationship-manage capability                                 |
| linked_at   | Instant | NO (v2) | Common typed rules                                                                                               |

### trip_item_participants

| Column    | Type | Null    | Additional constraint                                                             |
| --------- | ---- | ------- | --------------------------------------------------------------------------------- |
| trip_id   | UUID | NO (v2) | Composite same-Trip Person FK RESTRICT; unique object/person; optional holder set |
| item_id   | UUID | NO (v2) | Composite same-Trip Person FK RESTRICT; unique object/person; optional holder set |
| person_id | UUID | NO (v2) | Composite same-Trip Person FK RESTRICT; unique object/person; optional holder set |
| active    | Bool | NO (v2) | Composite same-Trip Person FK RESTRICT; unique object/person; optional holder set |

### trip_entitlement_holders

| Column         | Type | Null    | Additional constraint                                                             |
| -------------- | ---- | ------- | --------------------------------------------------------------------------------- |
| trip_id        | UUID | NO (v2) | Composite same-Trip Person FK RESTRICT; unique object/person; optional holder set |
| entitlement_id | UUID | NO (v2) | Composite same-Trip Person FK RESTRICT; unique object/person; optional holder set |
| person_id      | UUID | NO (v2) | Composite same-Trip Person FK RESTRICT; unique object/person; optional holder set |
| active         | Bool | NO (v2) | Composite same-Trip Person FK RESTRICT; unique object/person; optional holder set |

### trip_item_visibility_people

| Column    | Type | Null    | Additional constraint                                                                                |
| --------- | ---- | ------- | ---------------------------------------------------------------------------------------------------- |
| trip_id   | UUID | NO (v2) | PK(object_id,person_id); same-Trip Person; owner object revision owns set; no implicit Source grants |
| item_id   | UUID | NO (v2) | PK(object_id,person_id); same-Trip Person; owner object revision owns set; no implicit Source grants |
| person_id | UUID | NO (v2) | PK(object_id,person_id); same-Trip Person; owner object revision owns set; no implicit Source grants |

### trip_booking_visibility_people

| Column     | Type | Null    | Additional constraint                                                                                |
| ---------- | ---- | ------- | ---------------------------------------------------------------------------------------------------- |
| trip_id    | UUID | NO (v2) | PK(object_id,person_id); same-Trip Person; owner object revision owns set; no implicit Source grants |
| booking_id | UUID | NO (v2) | PK(object_id,person_id); same-Trip Person; owner object revision owns set; no implicit Source grants |
| person_id  | UUID | NO (v2) | PK(object_id,person_id); same-Trip Person; owner object revision owns set; no implicit Source grants |

### trip_entitlement_visibility_people

| Column         | Type | Null    | Additional constraint                                                                                |
| -------------- | ---- | ------- | ---------------------------------------------------------------------------------------------------- |
| trip_id        | UUID | NO (v2) | PK(object_id,person_id); same-Trip Person; owner object revision owns set; no implicit Source grants |
| entitlement_id | UUID | NO (v2) | PK(object_id,person_id); same-Trip Person; owner object revision owns set; no implicit Source grants |
| person_id      | UUID | NO (v2) | PK(object_id,person_id); same-Trip Person; owner object revision owns set; no implicit Source grants |

### trip_document_visibility_people

| Column      | Type | Null    | Additional constraint                                                                                |
| ----------- | ---- | ------- | ---------------------------------------------------------------------------------------------------- |
| trip_id     | UUID | NO (v2) | PK(object_id,person_id); same-Trip Person; owner object revision owns set; no implicit Source grants |
| document_id | UUID | NO (v2) | PK(object_id,person_id); same-Trip Person; owner object revision owns set; no implicit Source grants |
| person_id   | UUID | NO (v2) | PK(object_id,person_id); same-Trip Person; owner object revision owns set; no implicit Source grants |

### trip_instruction_visibility_people

| Column         | Type | Null    | Additional constraint                                                                                |
| -------------- | ---- | ------- | ---------------------------------------------------------------------------------------------------- |
| trip_id        | UUID | NO (v2) | PK(object_id,person_id); same-Trip Person; owner object revision owns set; no implicit Source grants |
| instruction_id | UUID | NO (v2) | PK(object_id,person_id); same-Trip Person; owner object revision owns set; no implicit Source grants |
| person_id      | UUID | NO (v2) | PK(object_id,person_id); same-Trip Person; owner object revision owns set; no implicit Source grants |

### expense_links

| Column     | Type                                                         | Null    | Additional constraint                                                  |
| ---------- | ------------------------------------------------------------ | ------- | ---------------------------------------------------------------------- |
| id         | UUID                                                         | NO (v2) | Common typed rules                                                     |
| expense_id | UUID                                                         | NO (v2) | Existing Ledger FK cascade only when Ledger deletes expense            |
| journey_id | UUID                                                         | NO (v2) | Same Trip as target and expense                                        |
| type       | ITINERARY_EVENT / ITINERARY_RESERVATION / DOCUMENT / RECEIPT | NO (v2) | Existing enum retained                                                 |
| target_id  | UUID                                                         | NO (v2) | Typed target validator; Item/Booking/operationalDocument only under v2 |
| metadata   | EmptyObject                                                  | NO (v2) | No payment or sensitive data copied here                               |
| created_by | UUID                                                         | NO (v2) | Common typed rules                                                     |
| created_at | Instant                                                      | NO (v2) | Common typed rules                                                     |

### trip_core_command_receipts

| Column           | Type                                      | Null    | Additional constraint                               |
| ---------------- | ----------------------------------------- | ------- | --------------------------------------------------- |
| id               | UUID                                      | NO (v2) | Versioned contract; see Capture/Read specifications |
| actor_account_id | UUID                                      | NO (v2) | Versioned contract; see Capture/Read specifications |
| trip_id          | UUID                                      | NO (v2) | Versioned contract; see Capture/Read specifications |
| operation_id     | UUID                                      | NO (v2) | Versioned contract; see Capture/Read specifications |
| intent_sha256    | SHA256                                    | NO (v2) | Versioned contract; see Capture/Read specifications |
| command          | CommandEnum                               | NO (v2) | Versioned contract; see Capture/Read specifications |
| outcome          | APPLIED / NO_CHANGE / CONFLICT / REJECTED | NO (v2) | Versioned contract; see Capture/Read specifications |
| target_vector    | RevisionVector                            | NO (v2) | Versioned contract; see Capture/Read specifications |
| result           | TypedResult                               | NO (v2) | Versioned contract; see Capture/Read specifications |
| committed_at     | Instant                                   | NO (v2) | Versioned contract; see Capture/Read specifications |

### trip_core_read_state

| Column          | Type     | Null    | Additional constraint                               |
| --------------- | -------- | ------- | --------------------------------------------------- |
| trip_id         | UUID     | NO (v2) | Versioned contract; see Capture/Read specifications |
| epoch           | UUID     | NO (v2) | Versioned contract; see Capture/Read specifications |
| revision        | Revision | NO (v2) | Versioned contract; see Capture/Read specifications |
| access_revision | Revision | NO (v2) | Versioned contract; see Capture/Read specifications |

### Document custody and existing compatibility bindings

Document.custody_receipt_id UUID NOT NULL (business2) → trip_operational_document_custody(trip_id,id) RESTRICT. Existing Event planned_start/planned_end are normalized start/end instants; no start_instant/end_instant columns are added. Existing timing_provenance_ref, legacy_planned_start/end/is_estimated_time/snapshot_at and is_estimated_time remain compatibility history/derived only, never a second v2 schedule writer.

### Exact Source-v2 satellite columns

All candidates/plans are immutable after sealing. Snake_case keys map directly to same camelCase wire property; candidate schemaId→schema_id, kind→kind, fieldEvidence→field_evidence. Existing source representation/run tables are reused, not invented active output slots for v2.

- `trip_source_core_v2_candidates`: PK(candidate_id UUID), account_id UUID, trip_id UUID, source_id UUID, source_revision bigint, run_id UUID, schema_id text fixed candidate2, kind enum CandidateKind, facts jsonb CandidateFacts, field_knowledge jsonb KnowledgeMap, field_evidence jsonb EvidenceMap, input_representation_ids uuid[] (1..64), existing_target_hint jsonb nullable, unmapped_observations jsonb [] default, canonical_candidate_text text and candidate_sha256 SHA256. All other fields non-null. Source/run trip/actor/material revision checked under existing lineage verifier; FK source_id→trip_sources(id), run_id→trip_source_runs(id) RESTRICT, UNIQUE(account_id,trip_id,candidate_id). v2 candidate identity does not require creating a fake v1 candidate; preserve source/input lineage and add version-qualified association lookup. Candidate canonical hash domain `otr-trip-core-candidate-v2`+newline+exact canonical wire text.
- `trip_source_core_v2_intents`: PK(plan_id UUID), account_id,trip_id,source_id UUID, source_revision bigint, proposal_version=2,intent_version=2, mode REVIEWED_SOURCE|AUTO_SOURCE, policy_version nullable (required exact policy1 for auto), candidate_ids uuid[] and output_slot_ids uuid[], canonical_plan_text text, plan_sha256 SHA256, sealed_at timestamptz(6). All except policy non-null; sameTrip Source/candidate refs validated, arrays bounded unique and dependency DAG acyclic. Immutable selected/evidence/identity; output state not folded into mutable plan hash. Canonical hash domain `otr-trip-core-plan-v2`+newline+sealed fields excluding per-slot mutable state/receipt; deferred intent hashes are deliberately NULL placeholders, frozen individually after dependency resolution.
- `trip_source_core_v2_slots`: PK(output_slot_id UUID), plan_id/candidate_id/account_id/trip_id UUID, slot_key ServiceKey, adapter_key fixed core2, target_kind enum handoff, target_ref jsonb nullable, target_id UUID nullable until resolved, operation_id UUID, intent_sha256 SHA256 nullable only before dependency resolution, dependency_slot_ids uuid[] max64, selected_fields jsonb finite addresses, evidence_refs jsonb EvidenceMap, base_vector jsonb nullable before freeze, canonical_intent_text text nullable before freeze, target_vector jsonb nullable until receipt, domain_receipt_id UUID nullable, state exact handoff enum, finalized_at timestamptz(6) nullable. All other fields non-null. Slot PK refers to v2 slot, not fake v1 slot; FK plan/candidate/receipt RESTRICT. Domain receipt vector matches exact resolved target/command/hash; trigger verifies typed target sameTrip and existence for success. Canonical wire slotId→output_slot_id, dependsOn→dependency_slot_ids, evidenceRefs→evidence_refs. Unique active claim(candidate_id,slot_key,target_kind); immutable identity/selected evidence/operation, state monotonic except explicit REVIEW resolution via successor slot. No v2 arbitrary raw target UUID bypass.

SQLite54 includes account-partitioned `trip_core_trip_source_core_v2_candidates` and `trip_core_trip_source_core_v2_intents` with the same grammar encoded canonical JSON/text; mutable local slot workflow `trip_core_capture_v2_slots` is exact satellite field set plus queue_operation_id nullable. PK(account_id,server UUID), scoped FK/evidence validators; accepted Source owner records kept separate from Day certificate. These records never silently overwrite Capture49 v1 slots. New pending/accepted observations keep explicit version2 namespace.

### Receipt persistence bindings

In addition to matrix columns: command_version,intent_version,receipt_version smallint=2; canonical_intent_text text non-null≤32KiB; receipt_sha256 SHA256 non-null; canonical_full_receipt_text text non-null (exact hashed typed receipt); error_code text nullable; audit jsonb non-null typed immutable selected before/after/proof/capability references. Result/final target_vector are immutable. Result public and audit private cannot be updated after commit. Terminal conflict/rejection preserves submitted base vector, observed revisions only if visible, and empty mutation results. Grant receipt from AUTHORIZE_DOCUMENT_COPY shares receipt2 and is referenced by custody FK, with Source revision authorization; no naked external consent string. Invoice/payment changes remain Ledger command contract, not this receipt authority.

For immutable Document custody metadata, field_state records admission source/owner protection but cannot be used to mutate original hash/media/bytes/custody. Original correction is a new UUID. Field-state map is returned only with public protection flags and opaque authorized evidence pointers; underlying private Source addresses are NULL/redacted before actor-specific hashing. Receipt audit and custody registry are never part of the Experience collection.

Final-HEAD purpose dependency: source-v2 slots additionally require output_purpose jsonb/purpose_sha256 SHA256/identity_sha256 SHA256, immutable under the exact handoff §5 grammar. Index(account_id,trip_id,source_id,identity_sha256) for active identity claims with locked dedup; use source_id via owning plan or explicit same-Trip validated slot column. Pending equivalent identity must replay/match, never evade index with a different slot hash. Legacy unidentified pending claims remain fail-closed; source claiming guard is v2-specific, does not loosen v1 Run-wide UNKNOWN fence.
