# Checkpoint 13A.1 — Exact Schema / Command Admission Preflight

Date: 2026-10-05 (Pacific/Auckland). Status: **PROPOSED — OWNER REVIEW REQUIRED**.
This is a reviewable data/command design, not a migration or implementation.
Owner approved this preflight after the [CP13A migration stop](TRIP_CHECKPOINT_13A_CANONICAL_IMPORT_ADMISSION_REPORT.md).
Implementation, migrations, runtime activation, commit and push remain unauthorized.

## 1. Baseline, authority and decisions

Worktree: `/Users/xoery/.codex/worktrees/cp13a-flight-admission/otr-mobile-canonical`.
Branch: `codex/cp13a-flight-admission`. HEAD:
`1b2bf98c24f0fb000e438e5cbfbccbc537346577` (accepted CP12).
At entry the only change was the untracked blocked CP13A report; index empty.
SQLite remains 1–48, server migration files remain 74. No live database inspected.

Normative authorities are [C-I3A](TRIP_CANONICAL_C_I3A_SCHEMA_ACCESS_CONTRACT.md)
B/J/K/N/O; [B-T3A](TRIP_CANONICAL_B_T3A_SCHEMA_WRITER_CONTRACT.md);
[B-T3C](TRIP_CANONICAL_B_T3C_COMMAND_RECEIPT_CONTRACT.md);
[CP12 registry](TRIP_RESERVATION_SCHEMA_REGISTRY.md), [Import contract](TRIP_IMPORT_CONTRACT.md)
and [independent review](TRIP_CHECKPOINT_12_CONTRACT_REVIEW.md).
Existing Source lifecycle/journal, Account fencing, B-T3I and CP11 are retained.
This proposal narrows executable adapters, not the accepted logical contracts.

Decisions proposed for approval:

- Install the six missing physical C-I3A catalogs verbatim; bounded proposal/support JSON
  stays C-owned, while relational IDs, scope and result claims remain queryable.
- Add immutable Run/Candidate lineage edges, reviewed slot lineage dispositions,
  receipt-dependent successor edges and explicit authoritative no-commit evidence.
- Add one Event-owned transport service relation, using operator/service columns
  and attributed marketing/operating values; no global operator catalog.
- Admit exactly CREATE_TRANSPORT and UPDATE_TRANSPORT through Track C/B receipts.
- Recommend **temporal option A**. No new civil resolver in this slice.
- New server migration required: **YES**. New local persistence required: **YES**;
  section 8 specifies the proposed next SQLite schema without reserving/registering
  migration 49 or authoring executable DDL.
- Keep every deployed gate CLOSED. Approval of this document authorizes no activation.

## 2. Exact protected server C catalogs

### Types, constraints, ownership and mutation common to all catalogs

The catalog rows below reproduce C-I3A's exact columns, null/default rules and
mutation classifications. Slash-separated names expand to separate columns.
Physical PostgreSQL types: U = uuid; R = bigint with 1..9007199254740991;
T = finite timestamptz(6); H = text matching 64 lowercase hexadecimal characters;
K = text matching `[A-Za-z0-9._:-]{1,128}`; S(n) = text of at most n Unicode
scalars, excluding NUL; J(n) = jsonb plus canonical UTF-8 encoded byte limit n and
strict versioned object validator. Arrays are uuid[], nonnull elements, ascending
UUID order, distinct, with stated cardinality. Smallint means smallint; booleans
mean boolean; byte_count is bigint 0..9007199254740991. No unspecified default. S(n) keys/identifiers/required labels must be nonblank;
nullable descriptive values may preserve explicitly supplied empty text where
the accepted catalog permits it.
Payload digests use the accepted encoding/version, not PostgreSQL textual JSON
formatting. Server publication validates bytes before storage.

Every listed enum/range/null/byte bound is a CHECK. Cross-row assertions below
are deferred constraint triggers plus protected-function validation, not illegal
cross-table CHECK expressions. All referenced IDs use ON DELETE RESTRICT unless
explicitly stated otherwise. No private evidence row cascades on Source/Event
logical deletion. Same-scope constraints traverse exact parents, never trust
UUID existence alone. All C tables: private Actor/acquiring Account + Trip;
RLS ENABLE and FORCE, no API-role policies/grants. Section 10 names principals.

Immutable columns reject UPDATE and DELETE outside C-I3A N's explicit redaction
path. Mutable fields use the named parent CAS; successful mutation increments
that parent once, not every child. Replay is neutral. Redaction cannot erase a
pending/replayable operation, claim, correlation or lineage identity. Exact
N-authorized nullable hash/payload exceptions retain IDENTITY_ONLY markers and
reject future dispatch; ordinary retained rows must satisfy the stronger catalog.
Physical erasure beyond those accepted exceptions remains CLOSED.

### trip_source_runs

| Exact field                       | Type; null/default                                                  | Authority / mutation; ACL/local                                                                                       |
| --------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| id                                | U required                                                          | I Run identity; P/L.                                                                                                  |
| row_revision                      | R required; starts 1                                                | M own CAS for operational state, child redaction and publication; +1 per transaction, replay neutral; P/L.            |
| trip_id / actor_account_id        | U required each                                                     | I exact admitted scope; Actor owns every V1 Source input; P/L.                                                        |
| operation_key                     | K required                                                          | I extraction request replay; P/L.                                                                                     |
| scope_source_ids                  | U array required, 1–64 sorted distinct Sources                      | I stable input set, all same Trip/owner; P/L.                                                                         |
| scope_sha256                      | H required                                                          | I SHA of encoding/version/Trip/Actor/Source-ID set; no material version in scope; P/L.                                |
| generation                        | R required                                                          | I monotonic serialized allocation per scope; first 1, +1; P/L.                                                        |
| input_sha256                      | H required                                                          | I exact sorted input descriptors/version/hash/transform binding; P/L.                                                 |
| extractor_key / extractor_version | S(128) required each                                                | I actual engine/config identifiers, no provider selected; P/L.                                                        |
| extractor_options_sha256          | H required                                                          | I exact approved configuration binding, not raw model response; P/L.                                                  |
| state                             | S(16) required: PENDING / RUNNING / READY / FAILED; default PENDING | O execution; READY includes zero Candidates; P/L.                                                                     |
| superseded_by                     | U nullable, default null                                            | M newer same-scope Run only, not state overwrite of accepted history; P/L.                                            |
| created_at                        | T required                                                          | I registered clock; P/L.                                                                                              |
| completed_at                      | T nullable, default null                                            | O required READY/FAILED; P/L.                                                                                         |
| error_code                        | S(32) nullable, default null                                        | O required FAILED; bounded SOURCE_FAILURE / UNSUPPORTED_INPUT / EXTRACTOR_FAILURE / CANCELED; null other states; P/L. |
| retention_state                   | S(24) required RETAINED / IDENTITY_ONLY; default RETAINED           | M authorized payload redaction only; P/L.                                                                             |

### trip_source_inputs

| Exact field                  | Type; null/default              | Authority / mutation; ACL/local                                                                                |
| ---------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| id                           | U required                      | I stable material pin; P/C/L.                                                                                  |
| run_id                       | U nullable, default null        | I exactly one of run_id/confirmation_id nonnull; P/L.                                                          |
| confirmation_id              | U nullable, default null        | I alternate bounded owner; C/L.                                                                                |
| source_id                    | U required                      | I exact Source, owner Trip/Actor matches; P/C/L.                                                               |
| material_revision            | R required                      | I same-Source capture manifest; P/C/L.                                                                         |
| representation_id            | U required                      | I captured member or authorized derivative of manifest members; P/C/L.                                         |
| payload_sha256               | H required                      | I captured exact integrity binding; P/C/L, retained privately after byte loss.                                 |
| byte_count                   | safe bigint 0..MAX required     | I exact input integrity length; P/C/L.                                                                         |
| observed_source_row_revision | R required                      | I Source lifecycle/current-pointer observation at request or renewed review; checked before dispatch; P/C/L.   |
| historical_selection         | boolean required, default false | I true only explicit reviewed older-capture selection; current Source row observation must still match; P/C/L. |

### trip_source_candidates

| Exact field      | Type; null/default                                                               | Authority / mutation; ACL/local                                            |
| ---------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| id               | U required                                                                       | I durable proposal identity; P/L.                                          |
| run_id           | U required                                                                       | I owning Run; P/L.                                                         |
| candidate_key    | K required                                                                       | I extractor output identity within Run, not array index; P/L.              |
| candidate_kind   | S(24) required: TRANSPORT / STAY / ACTIVITY / NOTE / OPTIONAL_POI / UNCLASSIFIED | I proposed meaning, not canonical target/permission; P/L.                  |
| proposal_version | smallint required, exactly 1                                                     | I payload validator version; unsupported rejects; P/L.                     |
| proposal_sha256  | H required                                                                       | I published payload digest; P/L.                                           |
| proposal         | J(262144) required while RETAINED                                                | I compact proposed fields/support, null only IDENTITY_ONLY redaction; P/L. |
| created_at       | T required                                                                       | I run publication clock; P/L.                                              |
| retention_state  | S(24) required RETAINED / IDENTITY_ONLY; default RETAINED                        | M parent Run row_revision CAS; explicit redaction; P/L.                    |

### trip_source_confirmations

| Exact field                | Type; null/default                                                                     | Authority / mutation; ACL/local                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| id                         | U required                                                                             | I Confirmation identity; C/L.                                                                                            |
| trip_id / actor_account_id | U required each                                                                        | I admitted review scope, Actor owns selected V1 Sources; C/L.                                                            |
| confirmation_key           | K required                                                                             | I Actor/Trip replay key; C/L.                                                                                            |
| intent_version             | smallint required exactly 1                                                            | I strict contract; C/L.                                                                                                  |
| intent_sha256              | H required                                                                             | I header+ordered slots+pins/review intent; no status/retry included; C/L.                                                |
| created_at                 | T required                                                                             | I server acceptance of reviewed intent; C/L.                                                                             |
| state                      | S(24) required: PREPARED / PROCESSING / PARTIAL / COMPLETE / STOPPED; default PREPARED | O derived from actual slots, not business truth; C/L.                                                                    |
| row_revision               | R required, starts1                                                                    | M own aggregate CAS for header and all slot M/O/redaction; +1 per transaction, replay neutral; intent never edited; C/L. |
| retention_state            | S(24) required RETAINED / IDENTITY_ONLY; default RETAINED                              | M redaction gate; no ordinary replay erasure; C/L.                                                                       |

### trip_source_output_slots

| Exact field               | Type; null/default                                                                                                                                  | Authority / mutation; ACL/local                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| confirmation_id / slot_id | U required each                                                                                                                                     | I parent+global slot identity; C/L.                                                                                                                                          |
| slot_key                  | K required                                                                                                                                          | I stable selected output-purpose identity; C/L.                                                                                                                              |
| disposition               | S(16) required: CREATE / UPDATE / LINK_ONLY / REJECT / DEFER                                                                                        | I reviewed decision; C/L.                                                                                                                                                    |
| reviewed_run_id           | U nullable                                                                                                                                          | I required with candidate_id, null standalone link; scope/input generation rechecked; C/L.                                                                                   |
| candidate_id              | U nullable                                                                                                                                          | I required extracted create/update/reject/defer; null manual link; C/L.                                                                                                      |
| intended_target_kind      | S(32) nullable: ITINERARY_EVENT / ITINERARY_RESERVATION                                                                                             | I CREATE/UPDATE/LINK_ONLY required; REJECT/DEFER null; C/L.                                                                                                                  |
| intended_target_id        | U nullable                                                                                                                                          | I UPDATE/LINK_ONLY exact existing ID; CREATE locally allocated intended canonical ID if domain supports it; null permitted only receipt-assigned CREATE; C/L.                |
| base_revision             | R nullable                                                                                                                                          | I required UPDATE; null CREATE/REJECT/DEFER; LINK_ONLY requires exact owning-domain evidence-action observation if that domain is versioned, never fake version 1; C/L.      |
| adapter_key               | S(64) nullable                                                                                                                                      | I allowed itinerary-event-v1 / itinerary-reservation-evidence-v1 for executable intent; null REJECT/DEFER; disabled until adapter gates pass; C/L.                           |
| adapter_version           | smallint nullable, exactly 1 when adapter_key present                                                                                               | I executable contract binding; C/L.                                                                                                                                          |
| domain_operation_key      | K nullable                                                                                                                                          | I required executable intent and persisted before dispatch; null REJECT/DEFER; C/L.                                                                                          |
| domain_intent_sha256      | H nullable                                                                                                                                          | I required executable intent, exact typed owning-domain request; C/L.                                                                                                        |
| reviewed_payload          | J(262144) nullable                                                                                                                                  | I reviewed selected fields/edits/explicit Person-ID choices and association intents; required executable intent, optional rejected/deferred proposal reference context; C/L. |
| support_version           | smallint required exactly 1                                                                                                                         | I support bundle validator; C/L.                                                                                                                                             |
| support_payload           | J(262144) required while RETAINED                                                                                                                   | I J FieldEvidence bundle; empty object link/reject/defer; C/L.                                                                                                               |
| state                     | S(32) required: PREPARED / OUTCOME_UNKNOWN / DOMAIN_SUCCEEDED / EVIDENCE_PENDING / FINALIZED / REJECTED / DEFERRED / CONFLICTED / FAILED / CANCELED | O exact transition proof below, initial PREPARED except REJECTED/DEFERRED; C/L.                                                                                              |
| dispatched_at             | T nullable, default null                                                                                                                            | O set before first handoff; never proves domain committed; C/L.                                                                                                              |
| receipt_ref               | S(512) nullable, default null                                                                                                                       | O immutable once verified, opaque domain-owned reference; required successful domain result, absent unproved success; C/L.                                                   |
| result_target_kind        | S(32) nullable, bounded same target kinds                                                                                                           | O immutable verified outcome; matches intended kind, required success; C/L.                                                                                                  |
| result_target_id          | U nullable, default null                                                                                                                            | O immutable exact receipt output; required success, matches intended ID if supplied; C/L.                                                                                    |
| result_revision           | R nullable, default null                                                                                                                            | O required CREATE/UPDATE success; link-only preserves domain-proven target observation if available, never invented business revision; C/L.                                  |
| receipt_sha256            | H nullable, default null                                                                                                                            | O required verified success, binding to receipt/operation/Actor/Trip/target/revision and exact admitted intent; C/L.                                                         |
| finalization_state        | S(16) required: NONE / PENDING / COMPLETE / BLOCKED; default NONE                                                                                   | O Source association/support finalize, not new domain write; C/L.                                                                                                            |
| failure_code              | S(32) nullable, default null                                                                                                                        | O allowlist INPUT_STALE / FORBIDDEN / DOMAIN_CONFLICT / DOMAIN_REJECTED / RECEIPT_UNAVAILABLE / EVIDENCE_FINALIZE_FAILED / OUTCOME_UNKNOWN; no raw errors; C/L.              |
| retention_state           | S(24) required RETAINED / IDENTITY_ONLY; default RETAINED                                                                                           | M explicit redaction, cannot erase correlation of pending/replayable outcome; C/L.                                                                                           |

### trip_source_associations

| Exact field               | Type; null/default                                                   | Authority / mutation; ACL/local                                                                                     |
| ------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| id                        | U required                                                           | I relationship identity; P/L, never V.                                                                              |
| source_id                 | U required                                                           | I logical Source, inherits Trip/owner; P/L.                                                                         |
| target_kind               | S(32) required: ITINERARY_EVENT / ITINERARY_RESERVATION              | I typed resolver namespace; no arbitrary table/string; P/L.                                                         |
| target_id                 | U required                                                           | I canonical existing target ID in same Trip; P/L.                                                                   |
| purpose                   | S(32) required: ATTACHED_EVIDENCE / CONFIRMED_SUPPORT                | I explicit semantics, not financial liability; P/L.                                                                 |
| state                     | S(16) required: ACTIVE / INACTIVE; default ACTIVE                    | M action authority; P/L.                                                                                            |
| row_revision              | R required; starts 1                                                 | M +1 per admitted lifecycle change, identical replay neutral; P/L.                                                  |
| created_by                | U required                                                           | I original link Actor; Source owner V1; P/L.                                                                        |
| created_at                | T required                                                           | I admitted clock; P/L.                                                                                              |
| confirmation_id           | U nullable, default null                                             | I required CONFIRMED_SUPPORT; optional for standalone attach Action; same Actor/Trip; P/L.                          |
| preview_input_id          | U nullable, default null                                             | I exact Confirmation Input for link-only preview when provided; P/L.                                                |
| preview_source_revision   | R nullable, default null                                             | I exact selected same-Source revision for standalone/link-only preview; paired with preview_representation_id; P/L. |
| preview_representation_id | U nullable, default null                                             | I member of selected capture or authorized derivative; P/L.                                                         |
| inactive_reason           | S(24) nullable, default null: UNLINK / SOURCE_DELETE / TARGET_DELETE | M present iff INACTIVE; P/L.                                                                                        |
| inactive_at               | T nullable, default null                                             | M present iff INACTIVE; P/L.                                                                                        |
| inactive_by               | U nullable, default null                                             | M explicit action Actor; target-delete cleanup records initiating domain Actor; P/L.                                |

There are **six physical catalogs** above: Candidate field/value/support is the
seventh logical concept, not a seventh physical table. Per C-I3A J, Candidate
`proposal.fields` and slot `support_payload` are the bounded immutable field
containers; introducing per-field UUID tables would duplicate accepted authority.

### Keys, FKs, unique constraints and indexes (complete for these new catalogs)

| Table         | PK / FKs / unique constraints                                                                                                                                                                                                                                                                                                                                                                               | Additional indexes / deferred assertions                                                                                                                                                                                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| runs          | PK id; FK trip_id→trips.id, actor_account_id→auth.users.id, superseded_by→runs.id; UNIQUE(trip_id,actor_account_id,operation_key), UNIQUE(trip_id,actor_account_id,scope_sha256,generation)                                                                                                                                                                                                                 | (trip_id,actor_account_id,scope_sha256,generation DESC); superseded_by index. Superseder same exact scope and strictly newer generation. Source array entries all same admitted Actor/Trip. Hash collision never equates unequal descriptor bytes.                                                                                                             |
| inputs        | PK id; FK run_id→runs.id, confirmation_id→confirmations.id, source_id→trip_sources.id; composite FK(source_id,material_revision)→trip_source_revisions(source_id,material_revision); composite FK(source_id,representation_id)→trip_source_representations(source_id,id)                                                                                                                                    | (run_id,id), (confirmation_id,id), (source_id,material_revision,representation_id). Exactly one parent; parent Actor/Trip matches Source acquired_by/trip_id. Representation must be manifest member or admitted derivative of members. No uniqueness by hash.                                                                                                 |
| candidates    | PK id; FK run_id→runs.id; UNIQUE(run_id,candidate_key); UNIQUE(run_id,id) for slot composite FK                                                                                                                                                                                                                                                                                                             | (run_id,id). READY publishes all children atomically; no append/rewrite after publication.                                                                                                                                                                                                                                                                     |
| confirmations | PK id; FK trip_id→trips.id, actor_account_id→auth.users.id; UNIQUE(trip_id,actor_account_id,confirmation_key)                                                                                                                                                                                                                                                                                               | (trip_id,actor_account_id,state,id). Require 1–64 slots before publishing; extracted review requires typed inputs.                                                                                                                                                                                                                                             |
| output_slots  | PK slot_id; FK confirmation_id→confirmations.id; composite FK(reviewed_run_id,candidate_id)→candidates(run_id,id), MATCH FULL; FK result_target_id→itinerary_events.id, deferrable; intended_target_id has semantic existence/scope validation only, with pending CREATE exception described below. UNIQUE(confirmation_id,slot_key); executable operation unique by parent Trip/Actor/domain_operation_key | (candidate_id,slot_key,intended_target_kind), (confirmation_id,slot_id), intended_target_id, result_target_id. Parent scope joins apply to target and candidate. No independent slot row revision.                                                                                                                                                             |
| associations  | PK id; FK source_id→trip_sources.id, target_id→itinerary_events.id, confirmation_id→confirmations.id, preview_input_id→inputs.id, created_by/inactive_by→auth.users.id; composite FKs(source_id,preview_source_revision)→revisions and (source_id,preview_representation_id)→representations                                                                                                                | (source_id,state), (target_kind,target_id,state), confirmation_id. Partial UNIQUE(source_id,target_kind,target_id,purpose) where state ACTIVE. Preview pair either both null or both present; preview_input must agree exactly with same-Source pins; CONFIRMED_SUPPORT requires same-scope Confirmation. Inactive reason/time/Actor all present iff INACTIVE. |

**Pending intended target correction:** CREATE must preallocate an Event UUID yet
commit intent before the Event exists. Therefore `intended_target_id` has **no
physical FK**; a deferred semantic guard requires existence/same Trip for UPDATE,
LINK_ONLY and known-success CREATE, allows not-yet-existing CREATE only, and checks
all exact outcome matches. `result_target_id` has an ordinary deferrable Event FK.
This is the exact physical rule; no intended-target FK is installed. No FK to a speculative Event row is installed.

For CP13A executable kinds are exclusively ITINERARY_EVENT; intended target ID is
required for CREATE, UPDATE and LINK_ONLY. Keep the C-I3A target-kind enum, but all
ITINERARY_RESERVATION operations/associations are rejected by this slice's validator.
No reservation table or passenger field is introduced. LINK_ONLY adapter remains
CLOSED; it is retained only as a catalog value. REJECT/DEFER have null intended
kind/ID/base/adapter/operation/digest/results and empty support. Extracted slots
require candidate/run pairs. CREATE has null base; UPDATE base R; no fake version 1.

A slot's CREATE claim is the accepted tuple
`(candidate_id,slot_key,intended_target_kind)`, not a Flight identifier. Enforce it
with the additional `create_claim_active` column in section 3 and a partial UNIQUE
index over that tuple WHERE disposition=CREATE AND create_claim_active. Executable
operation uniqueness uses a protected trigger checking joined parent Actor/Trip
under the scope lock; no duplicated scope columns that could drift. A separate
UNIQUE(adapter_key,domain_operation_key) WHERE domain_operation_key IS NOT NULL is
also proposed: generated B operation UUIDs cannot name two slots, even across Trip.
Equal key/digest replay returns original bindings; unequal bytes reject.

Run failure state iff error_code present; completed_at iff READY/FAILED. Generation
allocation locks the scope before querying maximum; overflow fails. Maximum 64
inputs per Run/Confirmation, 64 Candidates per Run, 64 slots per Confirmation,
64 selected fields and inputs per slot; Run published Candidate payload total ≤4 MiB.
Candidate key length ≤128 ASCII, proposal_version/intent_version/support_version 1;
proposal/support/reviewed payload ≤262144 UTF-8 bytes apiece. C-I3A locator,
confidence, ambiguity and retention rules apply without relaxed versions.

### Exact slot/result invariants and transitions

Executable `itinerary-event-v1` domain_operation_key must be a canonical UUIDv4,
even though catalog K permits other domains' opaque keys. Adapter/version,
operation/digest and reviewed payload are jointly nonnull iff executable;
CREATE/UPDATE in CP13A require retained support. B success result columns
receipt_ref/result_target_kind/result_target_id/result_revision/receipt_sha256 are
all null before verified success and all nonnull together afterward; result kind
and preallocated intended ID must match exactly. DOMAIN_SUCCEEDED/EVIDENCE_PENDING/
FINALIZED executable slots require that tuple; a non-success terminal slot cannot
carry it. finalization_state is NONE before verified success, PENDING for
DOMAIN_SUCCEEDED, PENDING or BLOCKED for EVIDENCE_PENDING, COMPLETE for FINALIZED.
DEFERRED/REJECTED proposal disposition has no receipt, no claim, empty support and
NONE finalization state. All operational changes use Confirmation CAS.

| From                                                             | To / authoritative condition                                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Initial extracted executable review                              | PREPARED; exact intent/pins/create claim commit together                                                              |
| PREPARED                                                         | OUTCOME_UNKNOWN before handoff; dispatched_at write once, same operation thereafter                                   |
| PREPARED                                                         | CANCELED only undispatched permanent revocation; no-commit tuple + claim release atomic                               |
| OUTCOME_UNKNOWN                                                  | OUTCOME_UNKNOWN for transport failure, restart, cancellation or missing receipt; no claim release                     |
| PREPARED / OUTCOME_UNKNOWN                                       | DOMAIN_SUCCEEDED only verified B APPLIED/NO_CHANGE receipt for exact operation/digest; tuple write once               |
| OUTCOME_UNKNOWN                                                  | CONFLICTED for exact B CONFLICT, FAILED for exact B REJECTED; verified terminal no-commit tuple releases CREATE claim |
| DOMAIN_SUCCEEDED                                                 | FINALIZED with all required support/association finalization; or EVIDENCE_PENDING on known finalization failure       |
| EVIDENCE_PENDING                                                 | FINALIZED after exact receipt-bound retry only; cannot execute domain command again                                   |
| REJECTED / DEFERRED / FINALIZED / CANCELED / CONFLICTED / FAILED | No ordinary transition back to execution; new review/new immutable intent required                                    |

Header state derives from slots, not optimistic progress: all initial PREPARED
→PREPARED; no final slots and any dispatched/nonfinal work→PROCESSING; some final
and some nonfinal→PARTIAL; all final→COMPLETE, except all terminal failed/canceled
without successful/rejected/deferred disposition→STOPPED. COMPLETE is disposition
completion, never a claim all CREATEs succeeded or all deferred work disappeared.
B executable proof admission requires OUTCOME_UNKNOWN with dispatched_at present
for the exact operation; direct dispatch of PREPARED is rejected in this slice.
Under scope and B operation locks, undispatched revocation also checks there is
no B success receipt; any existing exact receipt is recovered first. This blocks
a gateway shortcut from making an unmarked committed operation appear revocable.

Slot failure_code follows exact C-I3A allowlist; no provider text. Replaying known
success after later Source deletion is filtered under current read rights and
never reruns failed execution-right checks as a new mutation; new dispatch still
requires current pins/admission. No compensation or silent reset.

### Exact field containers and adapter allowlist

`proposal.fields[field_key]` has required `proposed_value`, sorted `input_ids`
(1–64 Run-owned Input IDs) and optional `locators`, `confidence`, `ambiguity` with
C-I3A J's exact shapes. `support_payload[field_key]` has exactly origin,
candidate_id, candidate_field_key, input_ids, accepted_value_ref, edited_value and
locators under that section's conditional requirements. No separate canonical
accepted schedule is stored in C. Confirmation Inputs copy selected Run pins with
new lifecycle observations; mapping compares Source/revision/Representation/hash/
count, not Input UUID equality across parents. Before receipt, accepted_value_ref
is prepared but inactive. After receipt it identifies the exact B field/result.

Flight proposal adapter version 1 recognizes only these occurrence families:
`transport_subtype`, `title`, `origin`, `destination`, `services`. Endpoint values
expand to the exact temporal/spatial members in section 6; service values expand
to section 4 columns. Leaf evidence addresses are deterministic dotted ASCII
paths such as `ORIGIN.source_instant`, `DESTINATION.local_date`,
`SERVICE.primary.service_number`, `ROOT.title`. Maximum path length 128;
service_key K additionally limited to 32 to fit these paths. Admitted keys are
generated from this finite grammar, never arbitrary patch keys. The operation
normalizer generates the leaf-key correspondence and verifies all selected values.
One support entry may address a bounded composite (`origin` etc.) only when its
candidate_field_key is that exact proposed composite, all accepted leaves equal
its immutable or explicitly edited selected value, and receipt leaf references
are individually bound. No implicit extracted origin for a USER_ENTERED value.

`reviewed_payload` exact version-1 envelope: `{schema_key, schema_version,
normalization_version, match_policy, selected_fields, edits,
association_intents, deferred_dimensions}`. Required metadata constants are
flight-v1 / 1 / 1 / import-flight-match-v1 respectively. selected_fields is sorted unique
array ≤64 of allowed keys; edits is a strict map over selected keys to reviewed
values; association_intents ≤64 `{input_id,purpose}` with purpose CONFIRMED_SUPPORT;
deferred_dimensions ≤64 entries with exact keys
`{dimension,candidate_field_key,input_id,locator,reason}`; either existing candidate_field_key
nonnull with input_id/locator null, or candidate_field_key null with exact typed
input_id/locator naming the original source fragment. dimension is an approved occurrence-family key or the finite unsupported marker
allowlist above; locator obeys C-I3A and excerpt omitted for unsupported dimensions.
No passenger/booking value is copied; reason is
UNSUPPORTED_DIMENSION / UNRESOLVED_TEMPORAL / UNRESOLVED_IDENTITY.
Future passenger/booking proposal support stays future-facing: CP13A does not
publish or persist new participant/booking values. Its typed boundary may report
unsupported dimension markers (`passengers`, `bookings`, `tickets`, `seats`,
`baggage`, `fare`, `cabin`) as reviewable deferred references, with exact source
input/locator or existing Candidate field address, never extracted person values
in a new table/JSON domain. Original Source/Capture evidence remains immutable.
A future already-admitted Candidate retains its own proposal under its authority,
but those dimensions cannot be selected into an executable Flight operation. DEFER slots
reference their exact original keys or input/locator dimension markers; no value is dropped or encoded in Event text.
Fixture publication is internal-only; no parser/extractor runtime is admitted.

## 3. Exact lineage, claims, dependencies and recovery

Additional protected tables implement CP12 I1/I2 relations rather than a global
real-world occurrence index. All U FK references use RESTRICT; T/R/K/H/S types
and private scope/CAS rules are as above. No defaults unless shown.

### trip_source_run_predecessors (C-I3A reprocessing / CP12 consolidation)

Columns: `child_run_id U NOT NULL`, `parent_run_id U NOT NULL`,
`relation S(16) NOT NULL REPROCESS|CONSOLIDATE`.
PK(child_run_id,parent_run_id); both FK→runs.id; index(parent_run_id,child_run_id).
All fields immutable. CHECK child≠parent. Protected publication verifies same
Actor/Trip, existing earlier parent publication, no directed cycle, and exact
REPROCESS source scope equality; CONSOLIDATE permits explicitly selected overlapping
scopes but never infers ownership from overlap. Edges are sealed before READY,
inserted only under child Run CAS before publication; once inserted, cannot be
updated/deleted to hide a predecessor. Abandoned draft publication requires a new Run. Superseded_by is a same-scope
navigation pointer, not a substitute for all predecessor edges.

### trip_source_candidate_lineage (CP12 I1 selected proposal ancestry)

Columns: `child_candidate_id U NOT NULL`, `parent_candidate_id U NOT NULL`,
`relation S(16) NOT NULL REPROCESS|CONSOLIDATE`.
PK(child_candidate_id,parent_candidate_id); both FK→candidates.id;
index(parent_candidate_id,child_candidate_id). All fields immutable; CHECK child≠parent.
Same Actor/Trip; respective Runs must have the corresponding transitive Run relation;
acyclic and sealed in READY publication. New Run includes an explicit predecessor
Candidate set or explicit reviewed distinct-output disposition; absence of an edge
cannot serve as proof that older selected outputs are irrelevant. Relevant search
includes all ancestor Runs' possible claims until disposition narrows purposes.

### trip_source_slot_lineage_dispositions (reviewed split/merge/output purpose)

Columns: `slot_id U NOT NULL` FK→output_slots.slot_id,
`ancestor_candidate_id U NOT NULL` FK→candidates.id,
`ancestor_slot_key K NOT NULL`, `relation S(24) NOT NULL CONTINUE|MERGE_CONTINUE|DISTINCT_OUTPUT`,
`review_reason S(500) NOT NULL`, `reviewed_by U NOT NULL` FK→auth.users.id,
`reviewed_at T NOT NULL`.
PK(slot_id,ancestor_candidate_id,ancestor_slot_key); index(ancestor_candidate_id,ancestor_slot_key,slot_id).
All immutable, owned by child Confirmation CAS; Actor must equal its Actor.
Ancestor must be in complete selected lineage. CONTINUE maps same proposed output
purpose; MERGE_CONTINUE joins evidenced same-output parents; all known-success
parents must resolve to the same Event or produce CONFLICT. DISTINCT_OUTPUT
records explicit reviewed split/different-leg intent and a distinct child slot_key;
no rewriting/releasing the predecessor claim. Unexplained parent purpose remains
UNRESOLVED_MATCH; changed slot_key alone does not bypass lineage.

### trip_source_slot_dependencies (C-I3A exact operation / CP12 I2 successors)

Columns: `slot_id U NOT NULL`, `predecessor_slot_id U NOT NULL` (both FK→slots),
`dependency_kind S(24) NOT NULL RECEIPT_SUCCESS`,
`expected_receipt_sha256 H NOT NULL`, `expected_target_id U NOT NULL` FK→Events,
`expected_result_revision R NOT NULL`.
PK(slot_id,predecessor_slot_id); index(predecessor_slot_id,slot_id); CHECK slot≠predecessor.
All immutable under child Confirmation CAS; same Actor/Trip, acyclic. A successor
slot is publishable only after exact predecessor success is verified and fresh
review chooses that target/revision. Waiting planned actions stay in local review
draft, not a prepared mutation with a guessed revision. No dynamic dependency
rewrites on retry. Atomic UPDATE_TRANSPORT normally avoids occurrence successors.

### Added output-slot columns (operational correlation, not another receipt namespace)

| Column                   | Type / null / default / checks                                                | Authority                                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| create_claim_active      | boolean NOT NULL default false                                                | Set true atomically for CREATE preparation; non-CREATE must false. Remains true through UNKNOWN/success/finalization; set false only terminal authoritative no-commit. Parent Confirmation CAS. |
| no_commit_basis          | S(32) nullable default null; UNDISPATCHED_REVOKED / VERIFIED_TERMINAL_RECEIPT | Write once, with tuple below.                                                                                                                                                                   |
| no_commit_receipt_ref    | S(512) nullable default null                                                  | Required VERIFIED_TERMINAL_RECEIPT; null UNDISPATCHED_REVOKED. Exact existing B receipt address.                                                                                                |
| no_commit_receipt_sha256 | H nullable default null                                                       | Paired with receipt_ref; never absence-derived.                                                                                                                                                 |
| no_commit_at             | T nullable default null                                                       | Present iff no_commit_basis present; admitted clock.                                                                                                                                            |

CHECK no_commit_basis only for CANCELED/FAILED/CONFLICTED slots with no success
result; terminal receipt proof requires B REJECTED/CONFLICT for exact digest/key/
target/base and no committed revision. UNDISPATCHED_REVOKED requires dispatched_at
null and permanent slot revocation under the same admission lock; all future B
calls for that slot reject. No basis is accepted from client. A dispatched slot
with a missing receipt remains UNKNOWN: timeout, cancellation, disconnect or a
search miss is not no-commit. No new server no-commit API that treats absence as
terminality is proposed. Parent CAS controls this tuple; IDENTITY_ONLY cannot
redact it while replayable. Success receipt tuple remains write-once as C-I3A K.

### Transaction/locking order and competing CREATE proof

READ COMMITTED only for execution/preparation; immutable authenticated receipt
replay may follow existing B snapshot exception. The new protected C functions
serialize all lineage publication, Confirmation preparation, dispatch marking,
revocation, recovery and finalization for one `(Trip,Actor)` using one transaction
advisory lock keyed `otr-c-admission/<trip-uuid>/<actor-uuid>`. Hash collision merely
serializes unrelated scopes. This is a lock, not a stored universal identity.
It avoids new scope/claim/queue tables and ancestor-phantom races.

Fixed order for this path:

1. Shared existing gate locks; C scope advisory lock; existing B operation lock
   `otr-event-operation/<Trip>/<Actor>/<Operation>` when a B operation is involved.
2. Trip and membership admission rows in existing B order; Sources ascending UUID,
   then material revisions/Representations; Run parents/children ascending UUID;
   Confirmations ascending UUID and slots/lineage/dependencies ascending key.
3. Existing B reference locks in table/UUID order (including both endpoint Places),
   Event-ID advisory lock for CREATE or parent Event FOR UPDATE for UPDATE;
   endpoints and service rows ordered by role/service_key, then immutable receipt.
4. Validate complete claims and exact proofs; write B aggregate+receipt atomically;
   update C slot/result and Source associations under parent CAS; commit.

C acquisition/material replacement/lifecycle invalidation that touches these
relations must enter the same C scope lock **before** Source row locks. Existing
Source SQL wrappers require that explicit integration when relevant, with their
existing source-key/id/target locks preserved in consistent order. Generic MANUAL
B calls do not acquire C locks or later call C. Every TRACK_C B call, including
exact replay/recovery, acquires C before B operation locks; never invert them.
Recovery/finalization uses an authenticated receipt read inside this order,
not a nested B dispatch while holding Event then C. No external IO inside SQL.
Lock/permission adversarial tests must prove the order before activation.

The entire bounded transitive Run/Candidate graph, slot purpose mappings and all
nonreleased ancestor CREATE claims are read after the scope lock. Maximum 64
nodes per graph and 64 relevant claims per preparation; beyond that fails
UNRESOLVED_MATCH with LIMIT, never truncates or assumes irrelevant ancestors.
A new lineage edge cannot publish concurrently past that inspection. Compare all
nonreleased claims of selected ancestors and their related reprocessed/consolidated
descendants already published under this scope, excluding only explicitly reviewed
DISTINCT_OUTPUT purposes. Do not inspect only direct ancestors and miss a competing
sibling C3 whose same predecessor C1 has proven no-commit.

Example: C1 purpose `leg-akl-chc` is OUTCOME_UNKNOWN. C2 reprocessing has its sealed
Run/Candidate edge and CONTINUE purpose disposition. C2 preparation acquires the
scope lock and sees C1's retained claim. It may retain a DEFER review, but cannot
publish an executable CREATE or dispatch. Recovery must obtain the exact C1 B
receipt. APPLIED supplies C1 result Event E/revision r even when search omitted E;
C2 uses E for reviewed COMPLETE/UPDATE assessment (fresh current E CAS required).
A terminal B rejection/no-commit permits C2 fresh CREATE preparation after claim
release. Missing receipt keeps C1 UNKNOWN. Concurrent C2/C3 attempts serialize and
inspect each other's related claims too. Known predecessor success outranks
incomplete search; it never authorizes overwrite. A split to an evidenced return
leg requires DISTINCT_OUTPUT review and a new output purpose, keeping C1 claim.

## 4. Canonical transport service identity

Add **itinerary_transport_services**, owned by existing Event semantic CAS, not C.
No new Event, Person, operator-provider root or global transport catalog.

| Exact column            | PostgreSQL type / null/default / meaning                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| event_id                | U NOT NULL FK→itinerary_events.id ON DELETE CASCADE (physical aggregate only; canonical delete remains rejected)                           |
| service_key             | K NOT NULL, additionally length≤32; stable within this Event, not real-world identity                                                      |
| transport_subtype       | S(16) NOT NULL FLIGHT / TRAIN / BUS / FERRY; only FLIGHT writable in CP13A                                                                 |
| attribution             | S(16) NOT NULL MARKETING / OPERATING / UNSPECIFIED                                                                                         |
| operator_namespace      | S(16) NOT NULL IATA_AIRLINE / ICAO_AIRLINE / AUTHORITY / NAME                                                                              |
| operator_issuer         | S(128) NOT NULL; IATA or ICAO for those namespaces, otherwise explicit evidence-qualified issuer/context                                   |
| operator_value          | S(128) NOT NULL; normalized bounded identifier, not a Person/provider Place ID                                                             |
| operator_literal        | S(255) NOT NULL; source-preserved reviewed operator value                                                                                  |
| service_number          | S(64) NOT NULL; namespace-qualified lossless service identifier including significant zeros/suffix                                         |
| service_literal         | S(255) NOT NULL; preserved printed service/designator (e.g. NZ289)                                                                         |
| codeshare_operating_key | K nullable default null; self-FK(event_id,codeshare_operating_key)→(event_id,service_key), deferrable RESTRICT                             |
| provenance_refs         | jsonb NOT NULL; strict B opaque reference map ≤16 KiB; keys exactly operator, service, attribution, codeshare (as applicable), each S(512) |

PK(event_id,service_key). UNIQUE(event_id,attribution,operator_namespace,
operator_issuer,operator_value,service_number); index(event_id,attribution).
No global uniqueness over service/date/route. Deferred guard: canonical TRANSPORT
parent, 1–4 service rows for newly admitted/adopted transports, all same subtype; no services for legacy/non-TRANSPORT; existing unadopted canonical TRANSPORT may
remain without services and is not executable through this adapter;
self codeshare key must identify OPERATING row, parent attribution MARKETING,
no self-reference/cycle, evidenced same operating occurrence. At most one OPERATING
row, up to three MARKETING rows, or one UNSPECIFIED row only. Multiple marketing
values do not imply a codeshare without this exact evidenced relationship.
All fields controlled by parent Event revision; no service-row CAS. service_key/
event_id immutable; service facts change only in typed aggregate update. No direct
client/service-role DML. Existing opaque provenance refs remain C-filtered.

Normalization is reviewed and versioned `transport-service-normalization-v1`:
IATA identifiers exactly two uppercase ASCII alphanumeric characters; ICAO exactly
three uppercase ASCII letters. Preserve literal separately; normalization may
uppercase ASCII code and remove only explicitly parsed display separation between
operator and number. service_number retains significant leading zeros and suffix,
never numeric conversion or assumed alias. Unknown parsing is UNRESOLVED_IDENTITY.
AUTHORITY/NAME use NFC text with only surrounding whitespace removed; issuer is
required, aliases never inferred. NAME equality is not a qualified supplier anchor.
TRAIN/BUS/FERRY may later use AUTHORITY or NAME without structural redesign but
require separately admitted adapters/namespace validators, not automatic activation.

CP13A admits one qualified marketing or operating Flight service, or an explicitly
confirmed UNSPECIFIED Flight service; qualified evidence-backed codeshare rows up
to the bounds may be retained, but an unresolved operating mapping never authorizes
SAME_ITEM. An operating identity is not guessed from a marketing code. `NZ289`
becomes service_key=`primary`, subtype=FLIGHT, attribution=MARKETING only if evidence
says marketing (otherwise UNSPECIFIED), namespace=IATA_AIRLINE, issuer=IATA,
operator_value=NZ, operator_literal=NZ, service_number=289, service_literal=NZ289,
codeshare_operating_key=null, with exact operator/service/attribution proof refs.
It does not prove date/leg or an operating carrier. Human-readable title may also
say NZ289; matching reads the typed service columns and evidenced route/date.

No new airport identity catalog is proposed. Existing B accepted_place_id and
qualified Place evidence resolve airports; unresolved codes/names stay proposed
or authored text. Same-item automatic matching requires evidenced, uniquely
resolved airport identities and namespace, not raw label equality.

### Certificate / read compatibility of new service facts

Existing B canonical-read v1 and B-T3I collection bytes/hash and completeness
meaning remain byte-compatible: do **not** add keys to their strict DTO or infer
service-content completeness from its certificate. Service facts are an explicitly
separate, bounded revision-bound B extension read (`transport-services-v1`): exact
shape `{version:1,event_id,semantic_revision,services}`; services has the columns
above excluding event_id, sorted service_key, max4; current target admission is
required, opaque refs only. A caller must match Event ID/revision from the normal
canonical read before using it; mismatch withholds it. Parent revision advances
for every service/proof change, so an old certificate becomes historic exactly as
it does after any existing Event update. This adds no participant-aware authority.

This read is a protected internal fixture/admission seam in CP13A, not a new UI
route or an expanded certificate. The minimum local service mirror in section 8
stores it separately; Day uses the unchanged certified root/endpoints and does
not read it. No claim that existing certificate hashes include new service bytes.
Tuple-only match-v1 requires a separately validated bounded relevant service view
at the same Event baselines plus CP12 complete competing-proposal/lineage scope;
partial or historic service reads cannot certify automatic SAME_ITEM. If this view
cannot be proved complete, matching remains UNRESOLVED_MATCH or explicit continuity
review. No service read silently expands accepted B-T3I guarantees.

## 5. Exact protected TRACK_C → B interface

Proposed private signatures (design notation, not executable SQL):

| Function                           | Inputs / result / allowed caller                                                                                                                                                                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| trip_source_prepare_confirmation   | actor U, trip U, raw_intent canonical text ≤4 MiB / immutable Confirmation+slots; C command gateway only, delegates to Source writer                                                                                                                                                            |
| trip_source_mark_slot_dispatch     | actor U, trip U, confirmation U, expected_confirmation_revision R, slot U, domain_digest H / same immutable operation binding, parent CAS; C command gateway only                                                                                                                               |
| trip_source_admit_event_proof      | actor U, trip U, event U, operation UUIDv4, command CREATE_TRANSPORT or UPDATE_TRANSPORT, base R nullable, digest H, confirmation U, slot U, field_key S(128), accepted_value strict typed JSON / opaque prepared field ref; Event semantic writer only inside protected B transaction          |
| trip_event_receipt_for_source_slot | actor U, trip U, operation UUIDv4, event U, expected_digest H / existing immutable B receipt or null; only Source writer EXECUTE, receipt-reader-owned fixed bridge; session_user Source or Event command gateway, current target admission, exact tuple validation, no client supplied outcome |
| trip_source_finalize_event_slot    | actor U, trip U, confirmation U, expected_revision R, slot U, operation UUIDv4 / verified exact B receipt result or pending; C command gateway through Source writer; never client-supplied success                                                                                             |
| trip_source_read_event_services    | actor U, trip U, event U, expected_semantic_revision R / transport-services-v1 or withheld; existing protected B reader path, current Event admission, no private support body                                                                                                                  |

Proof in B's `proofs` map retains the accepted exact shape `{kind:"TRACK_C",ref}`.
The fixed ref parser accepts only `track-c/field-evidence/<slot-uuid>/<field-key>`
and resolves Confirmation from the durable slot parent; clients cannot override
that parent. No freeform Evidence URL, principal, source list or operation override.
Reference returned is that exact C-I3A field address.
Envelope operation digest binds all command values and these proof addresses;
slot domain_intent_sha256 must equal recomputed B `otr-event-intent-v1` digest.
Adapter remains `itinerary-event-v1`, adapter_version=1; proposal_version,
intent_version, support_version=1; subtype-specific proposal schema is `flight-v1`.
Exact extra schema binding goes in immutable reviewed_payload's versioned metadata
`schema_key:"flight-v1", schema_version:1, normalization_version:1,
match_policy:"import-flight-match-v1"`; these four keys are required in addition
to its selected_fields/edits/association_intents/deferred_dimensions. Not a new
adapter name with unrestricted routes. Command payload byte ceiling remains 32768.

B resolves/locks and verifies, in section 3 order:

- Authenticated Backend Actor from existing request context; exact Trip writable
  admission through existing B and Source predicates; it cannot trust body Actor.
- Each Source owned by that Actor/Trip, ACTIVE/RETAINED, exact observed revision;
  each Representation/manifest ancestry, retained state, actual integrity and
  material availability/verification required by C lifecycle. This first slice
  supports registered inline TEXT or already verified binary inputs in fixtures;
  PENDING binary preparation remains deferred unless its accepted C-owned proof
  path is available. It does not impose a new universal upload requirement. Local Capture
  verification is not a server material proof. Historical selection explicit.
- Run immutable READY publication, exact Input descriptors/hash/generation and
  selected Candidate digest/version; superseded history never implicitly becomes
  latest review. Candidate and Confirmation same scope, exact copied Input mapping.
- Confirmation intent digest and parent revision, exact slot/purpose/lineage/dependencies,
  executable disposition, active CREATE claim where required, immutable intended
  Event/operation/base/adapter/version; slot not canceled/deferred/failed/redacted.
- Every selected candidate field/value/edit equals the admitted B value;
  USER_ENTERED requires exact immutable reviewed interaction, never synthesized
  extracted support; locators reference selected typed Inputs with strict ranges.
- Origin SOURCE_INSTANT evidence/confirmation is independent of offset arithmetic;
  service/spatial selected values and references are accepted, not provider proposals.
- Current exact parent Event revision for UPDATE; two endpoint roles and service
  aggregate validation; operation bytes/digest and existing receipt replay identity.

An unchanged field is carried from the locked canonical aggregate, not overwritten
by omission. RETAINED can reference an existing accepted TRACK_C value only through
its exact prior receipt/value under protected C validation; do not change TRACK_C
into MANUAL or accept an arbitrary old ref. New MANUAL proof is not the Import path.

**Transactions:** reviewed intent/pins/claims commit in C first. Dispatch marking
commits before external handoff. B admission/domain mutation/receipt is one SQL
transaction; the C proof helper only verifies/locks, without writing a C result.
mark_slot_dispatch sets dispatched_at once and conservatively OUTCOME_UNKNOWN
before handoff. After B receipt verification, C first commits its write-once
receipt/result tuple and DOMAIN_SUCCEEDED under parent CAS. A separate idempotent
C transaction finalizes all required associations/support and FINALIZED together;
failure records EVIDENCE_PENDING/BLOCKED under CAS while retaining verified success.
It never repeats CREATE. This definite split avoids cross-principal mutation or
a circular requirement for C success before the B receipt exists. Receipt loss means recover exact key/digest.
Prepared references activate only after receipt success; association failure cannot
compensate by deleting Event or changing receipt. Receipts retain existing B/C
namespaces; no private C content is exposed through normal target results.

## 6. Exact typed occurrence command shapes

Reuse the exact B envelope: contractVersion=1, intentVersion=1,
commandVersion=1, command, operationKey UUIDv4, actorAccountId U, tripId U,
eventId U, baseSemanticRevision null for CREATE / R for UPDATE, payload.
Digest/canonical JSON/duplicate-member rejection remain existing B's recipe.
The two names extend the strict command enum, receipt command CHECK, CREATE/null
base condition, result serializer and command-specific field whitelist. Existing
CREATE_EVENT and other commands receive no new generic patch privileges.

### CREATE_TRANSPORT payload

Exact required keys:
`shape:"TRANSPORT"`, `eventType:"TRANSPORT"`, `subtype:"FLIGHT"`,
`participantScope:"UNASSIGNED"`, `core:{title}`, `origin`, `destination`,
`services`, `proofs`. No optional top-level keys. Physical root event_type remains
existing lowercase `transport`; temporal_shape=TRANSPORT; subtype lives in the
service aggregate. Title S(200), nonblank, presentation only, with explicit review
proof. description null; reservation_id/trip_day_id null; no grouping/status edits
in this command. Default status/order only existing B admitted creation defaults.
No participants; UNASSIGNED never means current roster or everyone.

`origin` and `destination` each have exactly `{time,location}`. They generate
ORIGIN and DESTINATION rows, not client-controlled role IDs.

Time object uses the accepted B-T3C boundary **input** shape with exactly these
required keys (unknown as explicit null): `local_date`, `local_time`,
`clock_precision`, `quality`, `basis`, `zone_id`, `supplied_offset_seconds`,
`source_instant`, `source_instant_precision`, `fold_choice`. Types/ranges/null
combinations follow B-T3A/B-T3C: Gregorian dates 0001–9999, HH:mm at precision -1,
HH:mm:ss at0 and exactly 1–6 fractional digits otherwise; UTC source instant with
zero seconds at minute precision; offsets ±64800; fold_choice null for option A.
Origin local_date and EXACT independent source_instant required; destination time
may be entirely unknown. Provenance refs and precision-paired proof values are
generated from proofs, not supplied as raw refs. `instant`, `civil_resolution`,
`resolution_offset_seconds`, `interpretation_key`, `interpretation_input_sha256`
are **computed/validated by B**, never command input or a forged resolver tuple.
For incomplete SOURCE_INSTANT civil context resolution/binding are null; for
UNKNOWN DERIVED_CIVIL destination resolution=PENDING, instant null. Complete
civil context requiring a resolver is deferred under option A. planned_start/end
equal endpoint instants; root start/end families null. Finite timestamps retain
microseconds/precision, no JS Date rounding.

Location object exact required `authored_label` (S500 nullable),
`authored_text` (S5000 nullable), `accepted_place_id` (U nullable).
At least an evidenced resolved endpoint identity or reviewed authored endpoint
label is required for each Flight endpoint; automatic tuple matching requires
resolved airport identities separately. These three use existing B spatial
semantics; all other accepted address/coordinate/enrichment fields are null,
location_input_revision starts1. No provider namespace/code as canonical identity,
no raw coordinate/map enrichment in this slice. Existing independently accepted
Place links must pass locked B reference validation; labels never become Place IDs.

`services`: array 1–4 of the exact section 4 fields except event_id/provenance_refs;
service_key unique sorted; generated opaque refs bind each supplied value.
Subtypes all FLIGHT and agree with payload subtype. Each changed/evidenced leaf
requires a matching entry in proofs; no unused proof or unsupported field permitted.
Computed fields have no invented source proof. Missing arrival retains destination
row: quality UNKNOWN, basis DERIVED_CIVIL, civil_resolution PENDING, time/precision/
source instant/derived instant null; known arrival date/zone may remain where
B permits. Known destination location and unknown destination time are independent.

### UPDATE_TRANSPORT payload

Exact required keys `{changes,proofs}`. `changes` is a nonempty strict object over
**only** `title`, `origin`, `destination`, `services`. It is not an arbitrary patch:
origin/destination, when present, require exactly the complete `{time,location}`
component shapes above; services, when present, is the complete reviewed set.
No eventType/subtype/scope/status/grouping/reservation mutation, passenger fields
or arbitrary path. Target must be canonical TRANSPORT, physical transport Event,
FLIGHT service subtype and UNASSIGNED. Legacy or other-family targets reject.

Unchanged component values inside a selected endpoint/set must equal locked
canonical values and reuse exact retained proof; they are not new confirmations.
Changes to timing/location/provenance advance parent revision once and each changed
location_input_revision once with existing provider candidate invalidation; no
endpoint/service revision. Omitted components retain exact canonical values.
Explicit clear only for nullable allowed facts with reviewed proof; no departure
clear or required service/route removal that breaks Flight CREATE closure. Known
arrival→UNKNOWN requires explicit reviewed removal, never implicit incomplete source.
Arrival completion, reviewed departure retiming, endpoint correction, service
correction and title may be one atomic occurrence operation against one parent CAS.
Schedule/route/service continuity ambiguity requires fresh explicit review first;
latest source/provider data never itself grants overwrite. No shape/subtype switch.

**I2 example:** Event revision7 has unknown arrival. Review selects independent
exact arrival plus exact retimed departure and a passenger field. One
UPDATE_TRANSPORT at base7 carries both occurrence endpoint changes and proofs;
passenger is represented in an explicit DEFER disposition, outside changes.
One APPLIED receipt commits revision8. Response loss recovers that same receipt.
If another edit reached revision8 first, base7 produces exact conflict/no-commit;
no retry changes base to8. Successor needs current revision and fresh review under
section 3 dependency records. Passenger is never written to title, description
or generic fields. Other unrelated B mutations remain separate reviewed actions.

## 7. Temporal decision — recommend option A

A admits executable Flight departure only with independently evidenced or
explicitly, independently confirmed **EXACT** instant and evidenced origin-local
occurrence date. Source precision -1..6 is retained; value has only supplied digits.
Timestamp derived by subtracting a supplied offset is not independent evidence.
C review explicitly records the authority of a user confirmation, not an unchecked
UI checkbox saying the arithmetic is independent. Actual departure vs scheduled
instant requires reviewed applicability to selected schedule fact.

Known executable arrival can use A with its own evidence. Unknown arrival remains
UNKNOWN; civil-only/estimated arrival observations stay in C as expected/deferred
facts and do not make the whole Flight duplicate or block departure-only CREATE.
Unknown original clocks never become 00:00. Explicit exact midnight remains exact.

Preserve original civil date/clock, supplied offset, actual IANA zone and precision
in immutable Candidate/support. Accepted B SOURCE_INSTANT boundary retains those
components when B admits the combination. No new resolver means a complete
civil date+clock+IANA combination requiring B interpretation proof is **not**
accepted as fully interpreted without such proof. Review may select the independent
instant and evidenced date, retaining civil clock/known zone as explicitly deferred
C facts (no known zone is erased from evidence or falsely claimed unknown there).
If review requires accepting all complete civil components canonically, defer that
operation until bounded resolver admission. Source-instant choice does not bypass
B's complete-civil interpretation checks. Offset-only partial civil fragments can
be retained canonically with zone null and independent source instant proof.
A's narrower executable coverage is visible in support/deferred dimensions.

B would add deterministic rule-data/fold-choice proof admission, versioned rule
fingerprint, complete input digest validation, GAP/FOLD handling and additional
security/local replay acceptance. It increases the reviewed boundary before a
first Flight can be proven. Recommend A now; B later requires separate approval.
No resolver flag is enabled. In either option original evidence, derived versus
source instant and unresolved contradictions remain separate. No inferred IANA zone.

Concrete vector: 2026-12-18 09:00, offset +46800, no IANA, no independently confirmed
instant → proposal DERIVED_CIVIL/PENDING, arithmetic 2026-12-17T20:00Z remains only
proposed derivation; executable CREATE blocked. Add independently confirmed exact
2026-12-17T20:00Z (minute precision) → SOURCE_INSTANT EXACT, preserve local clock/
date/offset, zone null; other service/route/claim/proof gates still apply.

## 8. Exact minimum device persistence proposal

**New SQLite persistence is required.** Existing sync_operations preserves dispatch
but cannot replace C-I3A O's private mirrors/draft CAS or B's prepared proof records.
This is the proposed schema for the next local migration (the owner's “SQLite49”
review candidate), **not assigned, authored, registered or applied**. Existing
1–48 rows, migration SQL and tables remain unchanged. No second queue/generation.

Exact expansion rules define columns and keys without an opaque local catchall:

1. New local tables `trip_sources`, `trip_source_revisions`,
   `trip_source_representations` mirror **every** column of existing installed C
   server tables with identical snake_case names/null/enum meanings. They are not
   new domain roots or server_id mappings. New local tables `trip_source_runs`,
   `trip_source_inputs`, `trip_source_candidates`, `trip_source_confirmations`,
   `trip_source_output_slots`, `trip_source_associations` mirror every column in
   section 2, including section 3 slot extensions. Their exact column expansion
   is the catalog tables above plus installed Source catalog appendix below.
2. Every one adds `cache_account_id TEXT NOT NULL` and
   `registration_state TEXT NOT NULL DEFAULT PENDING` CHECK PENDING/REGISTERED/
   CONFLICT/BLOCKED. PK is `(cache_account_id, server_PK_columns)`; every local FK
   is prefixed by cache_account_id and all unique keys likewise. Server arrays
   serialize as canonical JSON TEXT only, preserving typed reference validation.
   U/K/H/S/J/T become TEXT; R/smallint/counts/boolean become INTEGER with typeof
   checks, safe integer ranges, boolean 0/1. T uses exact six-digit UTC operational
   time; B time uses accepted exact timestamp serialization, no millisecond coercion.
   Local immutable/parent-CAS/enum/byte constraints match server except the explicit
   pending-envelope nullable server-created_at/result observation exemption in O;
   REGISTERED rows require all normal server constraints. No manufactured revision
   or commit timestamp. Registration CAS is existing Account-gated transaction,
   never a server grant; server row_revision is only verified observation.
   Server FKs to auth.users/trips/Places have no fabricated local counterpart: use
   existing Account/Trip admission and accepted Place cache validation; local C-to-C
   FKs preserve exact prefixed keys. Required indexes are server indexes with scope
   prefix; Source local UNIQUE(cache_account_id,trip_id,acquired_by,acquisition_key),
   revisions UNIQUE(cache_account_id,source_id,operation_key), Representations
   UNIQUE(cache_account_id,source_id,id) and nonnull storage bucket/object uniqueness.
   Current Source material-revision FK and manifest/derivative relations use the
   same-account composite keys and repository validation, never a server_id mapping.
3. Local versions of the four section 3 relation tables have exactly the same
   columns/types and additional cache_account_id/registration_state; PK/FKs/indexes
   prefix cache_account_id. They are immutable review/history relations, not jobs.
   Source owner/Run or Confirmation Actor must equal cache_account_id. Same-scope,
   cycle, bounds and lineage claim checks are repository transaction guards also
   exercised with foreign_keys OFF; do not depend on SQLite FK cascade enablement.
4. New `trip_source_review_drafts` exact columns:
   `account_id TEXT NOT NULL`, `draft_key K NOT NULL`, `trip_id U NOT NULL`,
   `run_id U NOT NULL`, `row_revision INTEGER NOT NULL DEFAULT 1` (R/typeof),
   `review_version INTEGER NOT NULL DEFAULT 1` CHECK=1,
   `review_payload J(262144) NOT NULL`, `observed_input_sha256 H NOT NULL`,
   `updated_at T NOT NULL`; PK(account_id,draft_key), FK(account_id,run_id)→local
   runs(cache_account_id,id), index(account_id,trip_id,updated_at). Exact C-I3A O
   draft grammar; selected edits/input observation change by draft CAS. Draft
   payload contains explicit selected occurrence keys, deferred dimensions and
   planned actions; cannot rewrite a submitted Confirmation or operation.
5. New `trip_transport_service_mirrors`: section 4 columns exactly, plus
   `cache_account_id U TEXT NOT NULL`, `trip_id U TEXT NOT NULL`,
   `semantic_revision R INTEGER NOT NULL`;
   PK(cache_account_id,trip_id,event_id,service_key);
   FK(cache_account_id,trip_id,event_id)→trip_canonical_events(account_id,trip_id,event_id),
   RESTRICT; index(cache_account_id,trip_id,event_id,semantic_revision). Same-account
   canonical Event mirror association is checked transactionally against the
   existing mirror composite key, including when SQLite FKs are OFF. No FK to legacy
   itinerary_items that would invent a second mapping. Copy only verified revision-
   bound B extension, never from Candidate; replace complete set atomically;
   retain historic values labeled revision, withhold when canonical baseline differs.
   This is not a collection certificate/membership table and is not used by Day.
6. New `trip_event_receipt_cache`: `cache_account_id U TEXT NOT NULL`,
   `trip_id U TEXT NOT NULL`, `actor_account_id U TEXT NOT NULL`,
   `operation_key UUIDv4 TEXT NOT NULL`, `intent_sha256 H TEXT NOT NULL`,
   `receipt_sha256 H TEXT NOT NULL`, `receipt_version INTEGER NOT NULL CHECK=1`,
   `receipt_json TEXT NOT NULL` (strict canonical existing B receipt, ≤262144 UTF-8
   bytes); PK(cache_account_id,trip_id,actor_account_id,operation_key),
   CHECK cache_account_id=actor_account_id; index(cache_account_id,trip_id).
   All columns immutable; equal replay neutral, unequal bytes reject. Parse every
   canonical receipt field and recompute exact existing digest; no new receipt
   identity/schema. Same target/key/digest/revision as slot required. Private
   Account-gated apply only. No Event FK needed for pending/uncertified success,
   and no certified membership is installed by receipt caching. This permits
   restart/offline finalized-history reads without mutating intent JSON.
7. New `local_capture_source_bindings` exact columns in section 9; no Capture state
   added and no implicit Source admission triggered on Capture insert.

No Source Action mirror, provider execution attempt mirror, Person table, upload
scheduler, transfer retry table or second B projection is required for this slice.
Source material metadata mirror uses accepted local Representation extensions:
local_uri TEXT nullable≤4096, local_state TEXT default ABSENT CHECK ABSENT/
PRESENT_UNVERIFIED/VERIFIED/LOST/PURGED, local_verified_at T nullable, required when
VERIFIED (last verified observation may remain in other states), transfer_state TEXT CHECK NOT_REQUIRED/PENDING/IN_PROGRESS/RETRYABLE/
COMPLETE/BLOCKED with C-I3A default PENDING for new binary / NOT_REQUIRED nonbinary.
Exact captured bytes stay CP11-owned until an explicitly admitted original-copy
transfer takes durable responsibility; URI is private device data and no server proof.
Text original-copy commit follows accepted Source text semantics, not BLOB-to-URI
pretending remote verification. Material evictions require reference checks.

### Exact Source mirror column inventory (existing server, no new Source schema)

#### trip_sources

| Exact field               | Type; null/default                                                                 | Authority / mutation; ACL/local                                                       |
| ------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| id                        | U required; locally allocated, no server-generated substitute                      | I acquisition; P/L.                                                                   |
| trip_id                   | U required; no default                                                             | I existing Trip; no moves; P/L.                                                       |
| acquired_by               | U required; no default                                                             | I authenticated acquiring Account, not Person; P/L.                                   |
| acquisition_key           | K required; no default                                                             | I acquisition replay; P/L.                                                            |
| acquisition_sha256        | H required; no default                                                             | I exact initial acquisition envelope; P/L.                                            |
| source_kind               | S(16) required: FILE / IMAGE / TEXT / URL / EMAIL                                  | I actual supplied input kind, not classification of business output; P/L.             |
| acquisition_channel       | S(16) required: FILES / CAMERA / PHOTOS / PASTE / URL_CAPTURE / EMAIL_INPUT / COPY | I known acquisition action; future acquisition adapters disabled until approved; P/L. |
| captured_at               | T nullable; default null                                                           | I supplied/observed capture instant only; no invented original document time; P/L.    |
| capture_time_basis        | S(16) required: OBSERVED / SUPPLIED / UNKNOWN                                      | I; UNKNOWN iff captured_at null; other values require it; P/L.                        |
| created_at                | T required; admitted server clock                                                  | I registration time, separate from capture; P/L.                                      |
| access_mode               | S(16) required; only OWNER_PRIVATE, default OWNER_PRIVATE                          | I V1 policy, not caller-granted role; P/L.                                            |
| lifecycle                 | S(16) required: ACTIVE / DELETED; default ACTIVE                                   | M lifecycle authority, no ordinary undelete; P/L.                                     |
| current_material_revision | R required; admitted initial value 1                                               | M exact capture pointer, only append+CAS replacement; P/L.                            |
| row_revision              | R required; starts 1                                                               | M +1 on lifecycle/current-pointer change, no automatic timestamp version; P/L.        |
| retention_state           | S(24) required: RETAINED / IDENTITY_ONLY; default RETAINED                         | M only admitted explicit metadata redaction, increments row_revision; P/L.            |
| deleted_at                | T nullable, default null                                                           | M present iff DELETED; server clock; P/L.                                             |
| deleted_by                | U nullable, default null                                                           | M present iff DELETED, actor Account; P/L.                                            |

#### trip_source_revisions

| Exact field                 | Type; null/default                                                                                 | Authority / mutation; ACL/local                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| source_id                   | U required; Source reference                                                                       | I inherits Trip/owner; P/L.                                                                         |
| material_revision           | R required; first 1, later previous+1                                                              | I capture identity; P/L.                                                                            |
| previous_revision           | R nullable; null for 1, otherwise material_revision−1                                              | I same-Source prior capture; P/L.                                                                   |
| created_at                  | T required; admitted server clock                                                                  | I revision registration; P/L.                                                                       |
| created_by                  | U required; equals Source.acquired_by V1                                                           | I actor; P/L.                                                                                       |
| operation_key               | K required; no default                                                                             | I acquisition or replacement key; unique per Source, replay exact capture_sha256; P/L.              |
| capture_sha256              | H required                                                                                         | I digest of version/source/revision/typed original IDs/completeness/replacement/origin fields; P/L. |
| original_representation_ids | U array required; 1–64 distinct sorted IDs                                                         | I capture manifest, all same Source and captured originals, no JSON/derived entries; P/L.           |
| completeness                | S(24) required: AS_SUPPLIED / PARTIAL_CAPTURE                                                      | I no promise that entire website/email was acquired; P/L.                                           |
| reason                      | S(24) required: ACQUISITION / REPLACEMENT / REFRESH / ADD_PART / SAVED_TEXT_EDIT / AUTHORIZED_COPY | I user/admitted capture action; first ACQUISITION or AUTHORIZED_COPY, later other four; P/L.        |
| origin_source_id            | U nullable, default null                                                                           | I optional explicit copy origin, never dedup inferred; P/L.                                         |
| origin_material_revision    | R nullable, default null                                                                           | I paired with origin_source_id, requires actual authorized retained origin; P/L.                    |
| retention_state             | S(24) required: RETAINED / IDENTITY_ONLY; default RETAINED                                         | M parent Source row_revision CAS; explicit reviewed redaction only, IDs/replay facts retained; P/L. |

#### trip_source_representations

| Exact field              | Type; null/default                                                        | Authority / mutation; ACL/local                                                                                     |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| id                       | U required, allocated before material commit                              | I Representation identity; P/L.                                                                                     |
| row_revision             | R required; starts 1                                                      | M own CAS, +1 per admitted availability/retention/redaction transaction; replay neutral; P/L.                       |
| source_id                | U required                                                                | I inherits Trip/acquiring Account; P/L.                                                                             |
| introduced_revision      | R required, references same Source capture                                | I first capture that introduced material; P/L.                                                                      |
| role                     | S(16) required: ORIGINAL / DERIVED                                        | I captured versus transformed; P/L.                                                                                 |
| material_kind            | S(16) required: BINARY / TEXT / LOCATOR                                   | I representation format, not Artifact root; P/L.                                                                    |
| original_filename        | S(255) nullable, default null                                             | I supplied filename only; P/L.                                                                                      |
| part_key                 | S(128) nullable, default null                                             | I supplied email attachment/body/page designation; no fabricated page identity; P/L.                                |
| mime_type                | S(128) nullable                                                           | I required BINARY, null TEXT/LOCATOR; binary allowlist below; P/L.                                                  |
| encoding                 | S(16) nullable                                                            | I UTF-8 for TEXT/LOCATOR, null BINARY; P/L.                                                                         |
| payload_sha256           | H required while material retained                                        | I exact payload integrity; null permitted only through explicit IDENTITY_ONLY redaction, never normal loss; P/L.    |
| byte_count               | safe bigint 0..MAX required while material retained                       | I exact digest-input bytes, BINARY >0; TEXT can be empty, locator nonblank; null only identity-only redaction; P/L. |
| text_content             | TEXT nullable; ≤262144 encoded bytes                                      | I TEXT payload; present iff retained TEXT, no trimming; P/L.                                                        |
| locator_uri              | S(4096) nullable; ≤16384 encoded bytes                                    | I retained LOCATOR payload, explicit supplied http/https URI; no fetched-content claim; P/L.                        |
| parent_ids               | U array required; default empty                                           | I ORIGINAL empty; DERIVED 1–16 distinct sorted same-Source IDs, acyclic and prior retained descriptors; P/L.        |
| transform_key            | S(128) nullable                                                           | I required DERIVED, null ORIGINAL; identifies actual transformation, no engine chosen; P/L.                         |
| transform_version        | S(128) nullable                                                           | I required DERIVED, null ORIGINAL; P/L.                                                                             |
| transform_options_sha256 | H nullable                                                                | I required DERIVED, null ORIGINAL; empty options have an explicit canonical digest; P/L.                            |
| regenerability           | S(16) required: NOT_APPLICABLE / POSSIBLE / IMPOSSIBLE                    | I ORIGINAL NOT_APPLICABLE; DERIVED explicit possible/unknown treated IMPOSSIBLE until justified; P/L.               |
| created_at               | T required, admitted clock                                                | I material descriptor registration; P/L.                                                                            |
| storage_provider         | S(32) nullable                                                            | I BINARY only, exactly supabase_storage when server registered; null nonbinary; P/L.                                |
| storage_bucket           | S(64) nullable                                                            | I BINARY only, exactly trip-source-material; null nonbinary; P/L.                                                   |
| object_key               | S(256) nullable                                                           | I BINARY server key recipe below, required registered descriptor even before upload; null nonbinary; P/L.           |
| remote_state             | S(24) required: PENDING / VERIFIED / LOST / PURGED / NOT_APPLICABLE       | O own row_revision CAS; BINARY starts PENDING, TEXT/LOCATOR NOT_APPLICABLE; P/L.                                    |
| verified_at              | T nullable, default null                                                  | O own row_revision CAS with remote_state; last actual proof persists when lost/purged, VERIFIED requires it; P/L.   |
| retention_state          | S(24) required: RETAINED / PURGE_PENDING / PAYLOAD_PURGED / IDENTITY_ONLY | M own row_revision CAS; explicit rules N, default RETAINED; P/L.                                                    |

Installed schema is authoritative for physical representations of those existing
columns (e.g. revision manifest arrays); accepted catalog names/types above specify
local serialization. No Source table is reauthored by this preflight.

### Queue binding and cold restart

Reuse existing sync_operations: id/owner_user_id/trip_id, entity_type/entity_id,
operation_type/idempotency_key/base_version/payload_json, status/attempts/due/error/
claim_owner/lease_expires_at and timestamps remain existing queue columns.
Proposed bounded operation types: C_PREPARE_CONFIRMATION, C_EXECUTE_EVENT_SLOT,
C_FINALIZE_EVENT_SLOT, C_ADMIT_CAPTURE_SOURCE. They stay disabled until reviewed
codec/repository/scheduler admission; no scheduler created. entity_id is exact
Confirmation/slot/binding UUID, owner_user_id Actor, idempotency_key immutable
existing C key or B operation UUID. payload_json stores exact strict versioned
request and parent binding, not mutable outcome authority. Dependencies resolve
from immutable relation rows, not a new queue.

One Account-gated SQLite transaction saves draft→immutable intent/pins/slots/
lineage/dependencies and exact queue operation before dispatch. Source acquisition
binding/pending metadata use the same pattern. Current request context/generation
is captured before local/network work and checked at every apply/commit. Generation
belongs to existing account_local_state; do not persist an old request generation
as permission to continue after restart. Restart recaptures current Account and
revalidates retained pending operation, pin/Trip admission and exact local baseline.
A→B→A callbacks from earlier generation fail; durable A work resumes only through
a newly captured valid A context. Offline review/preparation is allowed with
existing trusted Account/local admission observations; it does not promise future
server execution or demand token refresh for local reads. Missing local proof
withholds preparation, not fabricated authority.

Dispatched intent is conservatively UNKNOWN after process loss unless exact receipt
proves outcome; claim lease expiry is not no-commit. Receipt recovery uses existing
B/C endpoints/identity; it may finalize local mirrors only after validated response
and current Account gate. Ordinary command receipt apply does not certify collection
membership. Refresh certified collection through existing repository; no manual
Day write. B-T3I retained absence fences remain active after restart.

## 9. Capture → existing Source exact durable binding

Capture IDs are CP11 TEXT 1–128, **not assumed UUIDs**. Revision safe integer;
verified bytes count≤10 MiB (TEXT≤1 MiB) and hash come from CP11 immutable payload.
Local Account/Trip rights and exact revision checked before admitting intent.

`local_capture_source_bindings` columns (all device-private):

| Column                   | Exact type / null/default                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| account_id               | U TEXT NOT NULL                                                                              |
| id                       | U TEXT NOT NULL; binding identity only, not Source/queue identity                            |
| admission_key            | K TEXT NOT NULL; stable explicit reviewed replay key                                         |
| capture_id               | TEXT NOT NULL length1–128                                                                    |
| capture_revision         | INTEGER NOT NULL typeof integer, R                                                           |
| capture_payload_id       | TEXT NOT NULL length1–128                                                                    |
| material_sha256          | H TEXT NOT NULL                                                                              |
| byte_count               | INTEGER NOT NULL typeof integer, 1..10485760; TEXT kind bound separately                     |
| trip_id                  | U TEXT NOT NULL                                                                              |
| intent_kind              | TEXT NOT NULL NEW / REUSE / REPLACEMENT                                                      |
| source_id                | U TEXT NOT NULL; existing or locally allocated Source ID                                     |
| representation_id        | U TEXT NOT NULL; exact existing/allocated Representation                                     |
| material_revision        | INTEGER NOT NULL R                                                                           |
| expected_source_revision | INTEGER nullable default null; R iff REUSE/REPLACEMENT                                       |
| source_operation_id      | U TEXT nullable default null; NEW/REPLACEMENT required, REUSE null                           |
| source_operation_key     | K TEXT nullable default null; paired with operation ID                                       |
| source_operation_sha256  | H TEXT nullable default null; paired, binds exact existing Source command                    |
| source_receipt_sha256    | H TEXT nullable default null; write once exact result for NEW/REPLACEMENT; REUSE null        |
| state                    | TEXT NOT NULL DEFAULT PREPARED; PREPARED / OUTCOME_UNKNOWN / ADMITTED / CONFLICTED / BLOCKED |
| row_revision             | INTEGER NOT NULL DEFAULT 1; R/typeof integer, one local CAS                                  |
| created_at               | T TEXT NOT NULL                                                                              |

PK(account_id,id); UNIQUE(account_id,trip_id,admission_key);
UNIQUE(account_id,source_operation_id) WHERE nonnull; index(account_id,capture_id,
capture_revision), (account_id,state). FK(account_id,capture_id)→local_capture_inbox,
FK(account_id,capture_payload_id)→local_capture_payloads, both RESTRICT;
FK(account_id,source_id)→local trip_sources; exact Representation/material reference
and same-Trip checks in transaction. ADMITTED requires source_receipt_sha256 for
NEW/REPLACEMENT and exact verified registration/result observations; REUSE requires
its current admitted existing pin and has no fabricated receipt. OUTCOME_UNKNOWN
requires a Source operation, and REUSE never enters it. A referenced Capture cannot be removed while
binding needs verified original material/recovery. Byte-count/hash/payload reference
must match exact Capture rows and freshly verified handoff. Immutable columns
except state/row_revision and receipt hash; no admission identity changes on retry.
These are correlation records, not another Acquisition domain or queue.

- **NEW:** explicit reviewed intent allocates existing Source/Representation IDs,
  material_revision1 and existing ACQUIRE_SOURCE operation ID/key/digest. Local
  metadata/material/binding/queue commit together before Source handoff. Server
  processes only existing acquisition payload; device Capture identity is not
  server provenance authority. Exact acquisition receipt registers Source metadata;
  actual representation verification/availability uses C-I3C/C-I3H, independently.
- **REUSE:** user selects same-owner/same-Trip existing Source+manifest+Representation,
  exact observed revision and verified matching material ancestry. Hash/count are
  necessary integrity checks, not sufficient Source identity; verify exact material
  equality where locally available and existing authorized pins remotely. No
  ACQUIRE_SOURCE command or duplicate receipt fabricated; binding records selection
  and current observation, later Confirmation/Inputs own review proof.
- **REPLACEMENT:** explicit intent names existing Source/current row CAS and existing
  REPLACE_MATERIAL operation/new immutable manifest and Representation. No old bytes
  overwritten; repeated exact operation returns original new revision; concurrent
  newer Source revision conflicts and requires fresh review, never auto-rebases.

Capture TEXT handoff requires valid UTF-8 and existing C TEXT payload≤262144 bytes;
larger CP11 TEXT captures (up to1 MiB) remain unsupported/deferred without truncation.
Binary Source admission also uses existing actual format/profile verification, not
Capture filename/declared MIME, and runtime upload/prepare remains CLOSED.

Capture existence creates no binding/Source. Same replay key and changed bytes/
revision/Trip/intent reject; same bytes and different explicitly reviewed intent
is not automatic identity. Restart reloads binding and queue operation; lost
response invokes exact Source operation lookup, not a second acquisition key.
UNKNOWN Source IO remains UNKNOWN under C-I3H; no upload/provider execution/retry
activation is added. Reuse local material requires verified availability, not
Source.latest substitution. Trip assignment change after review invalidates current
Capture admission, preserves historical pending binding and recovers uncertain
operation before any new side effect. Account switch cannot apply another Account's
receipt. Server never accepts a Capture-only hash as remote verified material proof.

## 10. Permission, RLS and exact gate plan

Retain existing isolated principals: otr_trip_source_writer,
otr_trip_source_command_gateway, otr_trip_source_operation_reader;
otr_trip_event_semantic_writer, otr_trip_event_command_gateway,
otr_trip_event_receipt_reader. No new login/account identity or membership chain.
Backend's existing authenticated request context authorizes Actor before an eventual
dedicated connector; no connector/credentials are provisioned in CP13A.

All new C tables owned by trusted migration owner, RLS ENABLE/FORCE. Source writer
receives only required SELECT/INSERT and guarded UPDATE columns; no DELETE/TRUNCATE/
DDL. Private reader policies permit only the matching accepted scoped read path;
helper checks validate Actor/Trip/Source before projection, not a client-chosen RLS
session variable. Event writer has **no direct C table DML/SELECT grant**; EXECUTE
only on fixed Source-owned proof admission function. The latter asserts current_user
Source writer and session_user Event command gateway and exact invocation context
inside B transaction. C public wrappers assert session_user Source command gateway;
no membership allows a C gateway to SET ROLE Event gateway or vice versa.
New service table uses existing B semantic writer/reader policies and parent Event
admission, no direct authenticated/service_role table access. Private support
selection still requires both Source and target rights and filtering before counts.

Functions SECURITY DEFINER only at reviewed fixed roots, search_path=pg_catalog,
qualified object names, no dynamic SQL/schema names. Revoke PUBLIC/anon/authenticated/
service_role EXECUTE/DML at creation; no outgoing membership, dangerous flags,
CREATE privileges or default grants on isolated roles. Security inventory/manifest/
RLS matrix updates and hostile reachability tests are implementation requirements;
no C-name exception to A1-I2C5 checker and no weakening reviewed root fingerprints.
C writer cannot call a generic B executor. Event gateway invokes exact new wrappers;
those call fixed C proof function then existing B domain writer/receipt path.
Source writer receives no direct B receipt-table grant: finalization calls only
trip_event_receipt_for_source_slot, owned by existing B receipt reader, with exact
Actor/Trip/Event/operation/digest. That bridge requires current target read admission
and returns the existing immutable receipt only; absence means unavailable, never
no-commit. No C gateway may EXECUTE B mutation. Receipt read exposes only normal
filtered immutable result; no Candidate payload.

Exact proposed EXECUTE edges (all others denied): Source gateway→C prepare,
mark-dispatch, finalize and scoped C reads; Source writer→B receipt-for-source bridge;
Event gateway→CREATE_TRANSPORT/UPDATE_TRANSPORT wrappers and existing exact receipt
lookup; Event semantic writer→fixed C proof helper only; B receipt reader→fixed B
admission predicates only. C proof helper owns Source writer definer context and
has SELECT/row-lock rights to needed C rows through that role; its invocation does
not grant Event writer table access. Table mutation stays Source writer for C,
Event semantic writer for B endpoints/services. No role gets TRIGGER/REFERENCES/
TRUNCATE/DDL at runtime. Source/Trip membership predicate inputs are authenticated
Actor, not service-role user impersonation. Private preflight gate SELECT is limited
to those two definer writers; existing gate setters/readers are not broadened.

**All current gates stay structurally CLOSED**, including Source acquisition IO,
Event mutation and participant operations. A later implementation must add a narrow
versioned private adapter capability for `itinerary-event-v1` + FLIGHT + these two
commands, and a separately gated explicit Capture acquisition allowlist
ACQUIRE_SOURCE/REPLACE_MATERIAL for approved material types. Proposed private table `trip_import_admission_gate` columns:
`singleton boolean NOT NULL DEFAULT true` PK CHECK singleton=true,
`adapter_version smallint NOT NULL DEFAULT 1` CHECK adapter_version=1,
`flight_admission_enabled boolean NOT NULL DEFAULT false` CHECK
flight_admission_enabled=false, `capture_admission_enabled boolean NOT NULL
DEFAULT false` CHECK capture_admission_enabled=false. Exactly one seeded row;
no other indexes/FKs. Trusted migration-owner table, no API read or setter. This is a
closed foundation catalog, not permission to drop existing closed constraints.
RLS FORCE, private writer SELECT only; no runtime gate setter/API.

A future activation review must reconcile existing global structural gates with
command-specific allowlists; it cannot set global flags true and accidentally
admit every existing command. Backend default capabilities remain DISABLED/empty.
Only a separately reviewed runtime profile could advertise CREATE_TRANSPORT /
UPDATE_TRANSPORT, FLIGHT, UNASSIGNED, Track C, option A and exact acquisition
commands; civil resolver, other transports, link/reservation, participants and
IO retry remain disabled. Activation security/inventory/provisioning is a distinct
owner decision, not folded into this migration proposal.

Local SQL acceptance may exercise positive grants/gates only within disposable
isolated databases and explicit rollback test transactions: temporarily replace
closed constraints and install narrow fixture admission, never ship those changes
in migration defaults. Fixtures use exact existing Source descriptors/verified
materials and typed candidate publication; mock TypeScript success is insufficient.
Test active-path permission failure and restoration; do not claim deployed admission.
No Hosted Dev, Production, deployment, runtime login/secret or UI is required.

## 11. Acceptance matrix before any implementation

Every row is a future acceptance requirement, **NOT RUN / NOT IMPLEMENTED** by
this documentation preflight. First prove fresh+upgrade catalogs and permission
inventory, then each exact seam and recovery interleaving; preserve all existing
baseline blockers and classify failures explicitly.

| Case                          | Exact acceptance evidence required                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh server                  | Replay accepted 74 then proposed additive migration(s) on disposable DB; expected tables/columns/constraints/indexes, grants/RLS/default ACLs, immutable publication and every negative CHECK; gates false; receipt namespace unchanged.                                                                                                           |
| Upgrade server                | Replay exactly current74, seed retained/identity-only Source and B receipts/legacy/canonical transports; apply proposal once; all old bytes/receipts/roots unchanged, no backfill pretending service identity; old transports without service rows stay existing read-only and cannot UPDATE through new adapter until explicit reviewed adoption. |
| SQLite fresh / upgrade        | Existing1–48 fresh and seeded upgrade, then proposed next schema; exact integer storage and scoped mirrors/drafts/bindings; no 49 registration before approval; old Capture blobs, Day, queues, Account, Ledger rows preserved; FK ON and OFF transaction guards.                                                                                  |
| Offline authenticated         | Expired token + valid trusted local Account permits retained reads/offline draft and pending intent, no network bootstrap; server admission not claimed until valid response.                                                                                                                                                                      |
| Cold restart                  | Save exact draft/intent/queue/pins/lineage/binding, close DB, reopen; replay keys and references byte-identical; no duplicate Source/Event after lease expiry; missing material/history fails closed.                                                                                                                                              |
| A→B / A→B→A                   | Pause before credential/IO/local commit; switch generation and resume stale success/recovery; no apply to B or later A; current A recovery only through new valid context.                                                                                                                                                                         |
| Capture NEW/REUSE/REPLACEMENT | Exact verified Capture revision/bytes bindings, explicit intent; same-key exact replay, altered-key collision/changed payload reject; replacement CAS; no creation on Capture insert; no cross-Account/Trip or hash-only reuse.                                                                                                                    |
| CREATE received/lost          | Real SQL writes both endpoints/services and B receipt atomically; successful receipt exact target/rev1; lost response leaves local UNKNOWN then exact lookup recovers once; no second logical CREATE.                                                                                                                                              |
| UPDATE received/lost          | Base7 arrival+departure atomically produce rev8 with receipt; response loss returns same result without rev9; unsupported passenger DEFER remains durable.                                                                                                                                                                                         |
| Predecessor UNKNOWN           | Barrier race C1 unknown/C2-C3 reprocess/consolidate; all lineage/purpose locks serialize; no executable competing CREATE until exact predecessor outcome; missing receipt remains UNKNOWN.                                                                                                                                                         |
| Known predecessor success     | Deliberately incomplete canonical search; C1 receipt supplies exact E, C2 completes/updates E under fresh CAS; no new UUID CREATE.                                                                                                                                                                                                                 |
| No-commit / split/merge       | Exact terminal receipt or permanently revoked undispatched intent releases claim; absence does not; reviewed DISTINCT_OUTPUT preserves parent claim; incompatible merge targets conflict; cycle/resource-limit fails without truncation.                                                                                                           |
| Stale revision / I2           | Concurrent Event edit after review yields exact conflict receipt/no mutation; no base substitution; successor requires verified prior receipt and new review; passenger never enters generic fields.                                                                                                                                               |
| Flight match-v1               | Qualified unique complete NZ289/date/route; different dates/routes; outbound/return; codeshare unknown/verified; retiming; number supersession; contradictory date/endpoint; PNR/passenger variation without occurrence identity; partial scope/multiple same-day clocks always unresolved.                                                        |
| Temporal A                    | Independently evidenced/confirmed instant pass; offset-only 09:00/+13 blocked; expected unknown arrival kept null; exact midnight explicit; no invented IANA; full civil tuple without required resolver proof deferred; original zone/civil/offset retained in C.                                                                                 |
| Permission / malicious input  | Every API/service-role/root/membership shortcut denied; altered Actor/Trip/source/representation/run/candidate/slot/field/digest/base rejected; redacted/deleted/stale supports fenced; canonical service/direct endpoints DML denied; duplicate JSON/unknown keys rejected; lock-order races exercise no inversion.                               |
| Receipt/support finalize      | Exact B receipt activates opaque prepared refs, associations share exact pins; failed finalize enters EVIDENCE_PENDING and retry never re-CREATEs; history survives Source logical unlink/delete subject to retained privacy.                                                                                                                      |
| Certificate                   | Existing B-T3I golden bytes/hash/page membership/absence fencing unchanged; service read baseline mismatch withheld; no certificate service/participant completeness claim; normal receipt never adds certified membership.                                                                                                                        |
| Day                           | Refresh full canonical collection through existing repository; admitted TRANSPORT endpoints project via CP11, retained offline/historic rows unchanged; Import never writes projection rows; null arrival preserved.                                                                                                                               |
| Ledger                        | Seed balances/expenses/evidence/queue/cursors; all byte-identical after both commands and failed/recovered operations; no Ledger request/operation emitted.                                                                                                                                                                                        |
| Regression/tooling            | Selected A/auth/C lifecycle/journal/B command/read/certificate/Capture/Day/DB suites; typecheck, lint/UI guard, Backend build, changed-doc format/links/whitespace; relevant SQL pgTAP/fresh+upgrade tests and security verifier. Broader suite results retain baseline classifications.                                                           |

## 12. Exact change scope, validation and required answers

This preflight adds only this document and one owner-status/link paragraph to the
blocked CP13A report. No API/DATA_MODEL/current-state capability update or ADR is
made: no boundary is implemented/admitted yet. Accepted contracts stay unchanged.
Validation of this design is document format/links/whitespace/Git scope and an
internal consistency pass. Prior CP13A 14 suites/465 baseline tests and typecheck/
lint/UI guard/build remain recorded in its report; no runtime/SQL acceptance
success is claimed here and no redundant full test run is needed for prose.

| Required answer                            | Answer                                                         |
| ------------------------------------------ | -------------------------------------------------------------- |
| Exact server C persistence proposed        | YES                                                            |
| Exact lineage/output claim schema proposed | YES                                                            |
| Transport service identity resolved        | YES — proposed typed Event-owned representation                |
| TRACK_C→B proof interface specified        | YES                                                            |
| CREATE_TRANSPORT specified                 | YES                                                            |
| UPDATE_TRANSPORT specified                 | YES                                                            |
| Temporal option recommended                | A                                                              |
| New server migration required              | YES                                                            |
| SQLite49 required                          | YES — new persistence proposed; number not assigned/registered |
| Passenger persistence included             | NO                                                             |
| Booking persistence included               | NO                                                             |
| Participant-aware certificate included     | NO                                                             |
| Existing canonical Source reused           | YES                                                            |
| Existing receipt namespaces reused         | YES                                                            |
| Existing Account generation reused         | YES                                                            |
| Production/runtime gates remain closed     | YES                                                            |
| Production code changed                    | NO                                                             |
| Migration authored                         | NO                                                             |
| Commit                                     | NO                                                             |
| Push                                       | NO                                                             |

**STOP — READY FOR EXACT SCHEMA OWNER REVIEW.**
