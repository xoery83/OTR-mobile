# CP14 Persistence & External Integration Control Plane — Exact Schema Preflight

Date: 2026-10-06 (Pacific/Auckland). **PROPOSED — OWNER REVIEW REQUIRED.**
Documentation only. Nothing below is installed schema, implementation evidence,
a runtime grant, or permission to activate providers.

## 1. Verified baseline, inputs and execution plan

Fresh worktree `/private/tmp/otr-cp14-persistence-preflight`, branch
`architecture/cp14-persistence-preflight`, exact HEAD
`c4571746b0c300fa3b46842cd37745963567338c`. Entry status was clean.
Server chain: 82 files, tail
`20261005001100_trip_import_undispatched_revocation.sql`. SQLite registration is
1–46 inline plus imported 47 Day, 48 Capture, 49 Import admission, contiguous 1–49.
The Event/Source gate tables retain false-only checks; Import Flight/Capture gates
retain false-only checks. `syncEngine.ts` still denies all five C Import operation
names even under a permissive filter. No runtime gate or connector is changed.

Execution: establish exact clean base; read foundations and checkpoint contracts;
inspect frozen A/B/C inputs and schema chains; reconcile identity/authority;
specify exact additive storage and principals; specify races/recovery/acceptance;
write this proposal and ADR; verify documentation-only diff and frozen builders.
No hosted project, provider, database service, deployment or external network is
needed for this static preflight. No migration SQL, registration, code or route is
written. Current-state handoff remains unchanged.

Input provenance:

- Instruction: `/Users/xoery/Downloads/CP14_PERSISTENCE_CONTROL_PLANE_PREFLIGHT_INSTRUCTION.md`.
- Mandatory `AGENTS.md`, PRODUCT, ARCHITECTURE, DATA_MODEL, API_CONTRACT,
  OFFLINE_SYNC, ENVIRONMENT_AUDIT, saved legacy audit and current handoff.
  Legacy Web checkout was not accessed.
- CP12 Import architecture/contract, Intelligence Plugin Contract and Red Team
  I1–I3/C1–C3 corrections; CP13A exact preflight, implementation/review including
  targeted R1–R3 recheck; CP13B final integration and actual
  `src/domain/intelligence/interpretation.ts` (`otr-intelligence-v1`).
- A: frozen `/private/tmp/otr-cp14-agent-a-outbound-runtime`, its report/platform/
  control-plane documents, domain/data runtime, reference wrapper, control-plane
  module and tracked diff. Canonical checkout holds matching A inputs.
- B: frozen `/private/tmp/otr-cp14-b`, report, inbound package contract, strict
  package/review schemas, inbound factory and tracked diff.
- C: canonical checkout's deferred report and Apple capability spike. C has no
  durable continuation implementation; SDK compile evidence is not provider admission.
- Account request context/generation/apply gate, queue/recovery/maintenance,
  SQLite49 Source/Candidate/Confirmation/slot/recovery, server private roles/guards.
  Historical server 1–82 and SQLite1–49 were inventoried from local source;
  migrations were not replayed. Full source hashes were captured for preservation.
- Owner plan was absent at exact base. The supplied
  `/Users/xoery/Downloads/OTR_INTELLIGENCE_NEXT_STAGE_PLAN.md` is copied byte-for-byte
  to [OTR_INTELLIGENCE_NEXT_STAGE_PLAN.md](OTR_INTELLIGENCE_NEXT_STAGE_PLAN.md).
  SHA-256 `6bf2c8f56ddbb52ee54faa491f2333a7925ebb40e60b3331e6c7b2f82851536d`.
  It is architecture/planning only. A cited a plan at local commit `81db767`;
  this proposal uses the now-supplied owner file, without treating that historical
  reference as implemented capability. B/C's missing-plan condition is resolved
  for this preflight; their implementation gaps remain.

## 2. Normative authority split and reconciled scope

| Plane                     | Owns                                                                                                                                                                                   | Cannot prove                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Server control plane      | Generic integration identity/environment/config, model qualification, credentials by reference, quotas, kill/health/audit, prices, usage/COGS, inbound auth/grants/reservations/status | Candidate truth, Event acceptance, device execution completion      |
| Device execution plane    | Logical continuation, exact attempt history, independent wait/pass/cancel/installation facts, fresh Account fences                                                                     | Global config, billing truth, provider terminality from lease/abort |
| Existing Import/canonical | Source/material, Run/Input/Candidate, CP13B closure/review, CP13A Confirmation/slot and domain receipt                                                                                 | Model billing or client auth from a package assertion               |

Existing `sync_operations` remains the **sole device scheduler and claim owner**.
New journals contain no due-time poller, timer, work claim lease or server job queue.
Server reservation CAS serializes exact commands; it does not schedule device work.
Admin config is eligibility truth, never execution/recovery truth. Local state is
not global provider config. Source C-I3H attempts remain Source resource-responsibility
records; intelligence attempts do not replace them or certify staged-byte release.

A provides strict qualified routing and content-free nullable observations, but
memory maps/quotas/upserts are test-only. B provides package/review identity and
convergence, but its retained envelope/selection/status are process-local. C correctly
requires new local journals instead of hiding tasks in Run/draft/queue JSON.
CP13B's descriptor is still TEXT/LOCAL_ONLY, cancellation UNSUPPORTED, three extraction
capabilities. This proposal does not widen it to accept remote/image execution.
A's generic categories must map explicitly: INTELLIGENCE→INTELLIGENCE_OUTBOUND,
FLIGHT_STATUS→FLIGHT_DATA, NOTIFICATIONS→NOTIFICATION, PAYMENTS_BILLING→PAYMENTS.
AI_CLIENT_INBOUND is separate; no payment feature is activated by category metadata.

## 3. Server83 proposal: common exact rules

Recommend **one bounded additive server migration at ordinal 83**, containing all
control-plane and inbound tables/functions below. No filename/timestamp or SQL is
assigned. If implementation review proves a size split necessary, reserve 83 then
84 only under one owner; both retain closed defaults. No table-per-migration chain.

Physical namespace: `public`, matching existing protected C catalogs; names do not
make tables public APIs. Owner for every table/index/constraint/guard is trusted
migration owner `postgres`. Runtime function owners are isolated roles in section 8.
All tables ENABLE and FORCE RLS. No default PUBLIC/API/service-role grants.
Every FK below is ON DELETE RESTRICT, including auth/trip references. No cascaded
privacy deletion or new account organization model is implied.

Exact type shorthand (notation only, not new database domains):

- U: uuid; H: text CHECK 64 lowercase hex; K: text CHECK ASCII
  `[A-Za-z0-9._:-]{1,128}`; V(n): nonblank text ≤n scalars, no NUL.
- R: bigint CHECK 1..9007199254740991; N: bigint CHECK 0..9007199254740991.
- T: finite timestamptz(6). Operational clocks only; never travel temporal facts.
- D: numeric(60,0), integer nanos, nonnegative; currency text CHECK `[A-Z]{3}`.
  Transport nanos as decimal strings. Precise fractional schedule rate P is
  numeric(60,18), nonnegative and finite; never JavaScript floating-point pricing.
- J(n): jsonb with strict named v1 grammar, canonical UTF-8 bytes ≤n, no unknown
  properties. Digests use domain-separated OTR canonical JSON, not PG jsonb text.
- A: distinct nonnull K[] ≤32 entries; command validates enum-specific values.

All columns are NOT NULL unless `?` is shown. No unspecified defaults. Slash lists
expand to distinct columns of the stated type. Required IDs are caller/trusted-host
allocated before side effects. All enums/ranges/pair invariants become CHECKs;
cross-row scope/immutability/transition rules require protected functions plus
constraint triggers, never cross-table CHECKs. Immutable records reject UPDATE,
DELETE and TRUNCATE for runtime callers. Mutable records use R revision CAS and
increment once per accepted transaction; exact replay is neutral. No dynamic SQL,
caller schema/function names, arbitrary diff text or GUC-as-identity authorization.

### 3.1 external_integration_environment_state

Columns: `environment K` (TEST|DEV|PRODUCTION), `config_version R DEFAULT 1`,
`kill_switch boolean DEFAULT true`, `runtime_enabled boolean DEFAULT false`,
`updated_at T`, `updated_by U?` FK auth.users(id).
PK(environment), no other index/FK. Seed all three environments closed. Foundation
CHECK runtime_enabled=false; opening needs separate reviewed activation DDL and
connector provisioning, not an admin toggle. kill_switch can always close.
Admin expected-version change atomically appends config audit. Missing state denies.
This preserves A's global kill without a process-local singleton.

### 3.2 external_integrations

Columns: `integration_id K`, `category K`, `vendor_namespace K`, `environment K`
FK environment_state, `admin_label V(200)`, `enabled boolean DEFAULT false`,
`kill_switch boolean DEFAULT true`, `config_version R DEFAULT 1`,
`config_sha256 H`, `credential_reference V(160)?`, `auth_config_reference V(160)?`,
`capabilities A`, `quota_limit N?`, `quota_window_seconds N?`,
`rate_per_minute N?`, `health_state K DEFAULT UNKNOWN`, `health_observed_at T?`,
`health_observation_id U?`, `created_at/updated_at T`,
`created_by/updated_by U` FK auth.users(id).
PK(integration_id); UNIQUE(environment,vendor_namespace,integration_id);
UNIQUE(integration_id,environment); indexes(environment,category,enabled),
(environment,kill_switch). IDs are globally unique across environments; host chooses
an explicit environment-specific integration ID. Category is bounded extensible K,
with initial allowlist INTELLIGENCE_OUTBOUND, AI_CLIENT_INBOUND, FLIGHT_DATA, PLACES,
WEATHER, EMAIL, STORAGE_MEDIA, NOTIFICATION, PAYMENTS, FUTURE_API. Future categories
require a protected-command validator version, not arbitrary request strings.
Quota limit/window jointly null or both present, window 1..31536000 seconds;
rate_per_minute null is explicitly unconfigured, zero blocks new calls.
Only `vault:` approved opaque reference grammar is permitted for credentials;
`authcfg:` versioned opaque references identify approved issuer/audience/auth policy.
Neither is a signed URL, bearer token, secret value or provider request.
Health tuple jointly null/UNKNOWN before any observation. Later observation FK is
(integration_id,health_observation_id)→health_observations. Projection uses trusted
server observation order, not a supplied provider clock. Environment/category/vendor
identity immutable; config controls change only via CAS/audit.

### 3.3 intelligence_provider_configs

Columns: `provider_config_id U`, `integration_id K` FK integrations,
`provider_id/model_id/model_version/adapter_version K`, `config_version R`,
`configuration_sha256 H`, `provider_class K`, `capabilities/modalities A`,
`schema_contracts J(16384)`, `schema_output boolean`, `privacy_policy K`,
`network_required boolean`, `data_region K`, `routing_class K`, `routing_priority N`,
`routing_eligibility K DEFAULT DISABLED`, `input_byte_limit/output_byte_limit N`,
`input_count_limit N`, `max_complexity/max_risk N`, `replay_support K`,
`quality_policy_reference K?`, `quality_policy_sha256 H?`,
`quality_observation_reference U?`, `latency_estimate_ms N?`,
`expected_completion_cost_nanos D?`, `expected_cost_currency text?`,
`created_at T`, `created_by U` FK auth.users(id).
PK(provider_config_id); UNIQUE(integration_id,provider_id,model_id,config_version);
UNIQUE(integration_id,provider_config_id);
index(integration_id,provider_id,model_id,config_version DESC).
Immutable version rows, including eligibility. Current config is max config_version
per integration/provider/model under the integration lock; replacement appends exactly
previous+1 and audit. Admission must pin the currently selected revision, not find an
older ELIGIBLE row after a new DISABLED version. Category must be INTELLIGENCE_OUTBOUND.
Class DETERMINISTIC|ON_DEVICE|OTR_SELF_HOSTED|COMMERCIAL_REMOTE;
privacy LOCAL_ONLY|OTR_ONLY|REMOTE_ALLOWED; eligibility SHADOW_ONLY|ELIGIBLE|DISABLED;
replay SUPPORTED|UNSUPPORTED|UNKNOWN. LOCAL_ONLY disallows network.
Schema array ≤32 strict {id K, version N, dialect K}; pair all quality-policy fields;
expected cost/currency paired. Descriptor metadata never proves runtime capability.
Weather/Payments have no provider-config row requirement.

### 3.4 external_integration_price_schedules and price_schedule_units

Schedule columns: `price_schedule_id U`, `integration_id K` FK integrations,
`provider_id/model_id K?` (jointly null for generic integration pricing),
`schedule_version K`, `currency text`, `effective_from T`, `effective_until T?`,
`source_reference K`, `source_version K`, `schedule_sha256 H`,
`supersedes_schedule_id U?` FK price_schedules,
`rounding_policy K` (=SUM_THEN_CEIL_NANOS_V1), `created_at T`,
`created_by U` FK auth.users(id).
PK(price_schedule_id); UNIQUE(integration_id,schedule_version);
UNIQUE(integration_id,price_schedule_id); index(integration_id,provider_id,model_id,
effective_from). Immutable half-open [from,until); until>from. A supersession must name the current
schedule in the identical null-safe provider/model/currency scope, with later from
inside its interval, and no cycle/branch. Derived applicability permanently clips
its predecessor at the successor from; expiry of a successor never revives the old
price. Under integration lock reject all overlapping derived intervals and unqualified
branches. Append a new immutable version plus audit; never edit historical price bytes.
A call pins one exact ID, not a query that can change after dispatch.

Unit columns: `price_schedule_id U` FK schedules, `unit_key K`,
`measurement_unit K`, `unit_quantity N` (>0), `price_per_quantity P`,
`unit_definition J(4096)`.
PK(price_schedule_id,unit_key), no additional index. Initial keys input_tokens,
output_tokens,cached_input_tokens,reasoning_tokens,image_units,audio_units,call_count,
bytes,wall_ms,cpu_ms,gpu_ms,accelerator_ms; ≤16 additional numeric unit definitions.
Definition declares disjoint/additive or included-in-counter relationships (e.g.
reasoning included in output), applicable tier and exact measured quantity. Ambiguous
inclusion or unpriced measured billable units leaves cost UNKNOWN. Each call cost is
sum(exact quantity × price / unit_quantity), then ceil once to integer nanos;
retain raw measured quantities and calculation version. Actual provider cost is
independent invoice/report evidence. No FX or customer Money/Settlement semantics.

### 3.5 external_integration_calls — identity and responsibility, not a scheduler

Columns: `call_id U`, `integration_id K`, `environment K`,
`provider_config_id U?`, `provider_id/model_id/model_version/adapter_version K?`,
`config_version R`, `configuration_sha256 H`, `account_id/user_id U?`,
`billing_subject_id U?`, `trip_id U?` FK trips(id),
`import_id/task_id/attempt_id/fallback_chain_id/shadow_of_call_id U?`,
`evaluation_reference U?`,
`attempt_sequence N?` (>0 when present), `invocation_id U?`,
`request_id/idempotency_key U`, `request_sha256/input_sha256/schema_sha256 H?`,
`capability/task_class K`, `call_kind K`, `shadow boolean DEFAULT false`,
`price_schedule_id U?`, `admitted_at T`, `admission_sha256 H`,
`publication_fence R`, `row_revision R DEFAULT 1`,
`dispatch_state K DEFAULT RESERVED`, `execution_certainty K DEFAULT NOT_STARTED`,
`dispatch_marked_at/terminal_observed_at T?`, `safe_reason K?`.
PK(call_id); composite FK(integration_id,environment)→integrations;
FK(integration_id,provider_config_id)→provider_configs;
FK(integration_id,price_schedule_id)→price_schedules;
FK(shadow_of_call_id)→calls; account/user/billing subject FK auth.users(id) when present.
UNIQUE(integration_id,account_id,attempt_id) WHERE attempt_id nonnull;
UNIQUE(integration_id,invocation_id) WHERE invocation_id nonnull;
index(integration_id,admitted_at), (account_id,task_id,attempt_sequence),
(fallback_chain_id,admitted_at), (dispatch_state,admitted_at).
Inbound invocation FK is described below; circular links are deferred.
Account/user paired and equal in current OTR individual-account model. Billing subject
is optional separately authorized COGS attribution, never inferred from a Trip Person.
Local task/import/attempt IDs are opaque correlations: no FK to nonexistent server
execution tables. For outbound model calls, Account/task/attempt/sequence/request/body/input/schema
pins and model fields/config FK are all present; generic
inbound calls have null model fields, never NOT_INVOKED as an actual model.
Call_kind OUTBOUND_MODEL|INBOUND_TOOL|GENERIC_API|SELF_HOSTED_COMPUTE.
Dispatch RESERVED→MAY_HAVE_STARTED→TERMINAL or UNKNOWN; UNKNOWN→TERMINAL only exact
trusted recovery. RESERVED can close NOT_STARTED under a permanently revoked dispatch
fence. Mark MAY_HAVE_STARTED durably before I/O; crash before actual send is still
conservative UNKNOWN. Immutable identity fields never update. Mutable observations
are CAS guarded; a known terminal execution never regresses due to meter loss.

Request key is NOT globally unique: A permits declared safe replay with the same
request/key and another actual attempt. Same attempt/call reservation replays exactly;
changed request bytes under an existing request identity reject. Different retry,
fallback, shadow or admitted multipart call gets a new call ID with explicit lineage.
A's `usage_event_id` maps to call_id (stable usage stream); observation_id below is
separate. Distinct attempts are not confused by reused safe provider replay keys.

### 3.6 external_integration_usage_events — append-only observations

Columns: `observation_id U`, `call_id U` FK calls, `observation_key K`,
`observation_version smallint DEFAULT 1` (=1), `observation_kind K`,
`measurement_mode K`, `observed_at/received_at T`, `started_at/ended_at T?`,
`latency_ms N?`, `status K`, `outcome K?`, `response_sha256/publication_sha256 H?`,
`input_tokens/output_tokens/total_tokens/cached_input_tokens/reasoning_tokens N?`,
`image_units/audio_units/call_count/bytes/wall_ms/cpu_ms/gpu_ms/accelerator_ms N?`,
`other_units/provider_extension J(4096)`, `usage_quality K DEFAULT UNKNOWN`,
`unit_quality J(4096)`, `price_schedule_id U?` FK schedules,
`cost_nanos D?`, `currency text?`, `cost_quality K DEFAULT UNKNOWN`,
`cost_calculation_version K?`, `supersedes_observation_id U?` FK usage_events,
`observation_sha256 H`.
PK(observation_id); UNIQUE(call_id,observation_key);
UNIQUE(call_id,observation_id); unique partial(call_id) WHERE kind=START;
indexes(call_id,received_at,observation_id), (price_schedule_id,received_at).
Exact call header join supplies integration/provider/config/task/attempt/request/
Account/shadow/fallback scope; duplication is not needed in every observation.
Superseded observation must be same call, earlier, acyclic; protected validation.
Kinds START|PROGRESS|COMPLETION|RECOVERY|COST_RECONCILIATION;
mode NONE|CUMULATIVE|DELTA; status STARTED|SUCCEEDED|PARTIAL|FAILED|CANCELED|UNKNOWN.
Quality ACTUAL_REPORTED|ESTIMATED|UNKNOWN for usage and cost independently.
unit_quality is a strict map over measured keys only, each with that enum; missing
unit remains NULL and UNKNOWN regardless of other reported counters. Extension maps
≤16 numeric nonnegative safe-integer entries each, no free text or raw provider JSON.
Cost UNKNOWN iff cost_nanos null; known cost requires currency. Currency may remain
known while cost unknown. START has no end/latency and all measurements NULL, including call_count.
Count reservations from call rows; only actual executed transport measurements may
report call_count in completion/recovery. Reservation is never a billed-call counter.
COMPLETION end≥start and latency optional when actually observed. Missing measurements
are NULL, **never zero**; no identity such as total=input+output is invented across
provider counter conventions. Safe status/UUIDs/digests only; no prompts, text, URLs,
attachments, passenger names, booking IDs or raw errors.

A START/final upsert becomes START then COMPLETION append with distinct keys. Exact
observation-key/digest replay is neutral; changed bytes reject. Late usage/cost appends
RECOVERY/RECONCILIATION, even after installation failed, cancel or UNKNOWN. Reporting
uses latest authoritative cumulative snapshot per unit, or deduplicated disjoint delta
observations, never sum START+final or all cumulative stream chunks. A correction
supersedes explicitly. Mixing modes for one unit without a declared conversion rejects.
Estimates are replaced in derived reports by actuals, not added to them. Unknown counts
and costs are reported alongside measured totals; missing calls are never represented
as zero COGS. Generic inbound tools do not manufacture external client reasoning tokens.

### 3.7 external_integration_config_audit

Columns: `audit_id U`, `integration_id K?` FK integrations,
`environment K` FK environment_state, `entity_kind/entity_key K`,
`previous_version R?`, `new_version R`, `admin_actor_id U` FK auth.users(id),
`command_id U`, `change_type K`, `before_sha256 H?`, `after_sha256 H`,
`safe_diff J(16384)`, `reason_code K`, `occurred_at T`.
PK(audit_id); UNIQUE(environment,command_id); index(integration_id,occurred_at),
(environment,entity_kind,entity_key,new_version).
Append-only; same command/digest replays, changed command rejects. Null integration
only environment-global change. Type ENABLE|DISABLE|KILL|CONFIG|QUOTA|PRICE|
CREDENTIAL_REFERENCE_ROTATION|AUTH_CONFIG|GRANT_REVOKE. Diff contains approved
nonsecret field names and safe values/digests; even secret values cannot enter a hash
via a purported safe diff. Version/reference change is evidence, not copied secret.

### 3.8 external_integration_health_observations

Columns: `health_observation_id U`, `integration_id K` FK integrations,
`config_version R`, `health_state K`, `safe_reason K?`,
`provider_observed_at T?`, `received_at T`, `observation_sequence R`,
`latency_ms N?`, `observer_principal_id U`, `observation_sha256 H`.
PK(health_observation_id); UNIQUE(integration_id,health_observation_id);
UNIQUE(integration_id,observation_sequence); index(integration_id,observation_sequence DESC).
States HEALTHY|UNAVAILABLE|UNKNOWN. Choose append-only history plus mutable current
projection on integration. Under integration lock, allocate sequence and update
projection only for current config_version. Old-config/late observations remain
history and cannot overwrite current health. No automatic health network probe is
installed. observer principal is authenticated workload identity, not an end-user FK.

## 4. Durable inbound authority and recovery

### 4.1 external_client_identities

Columns: `client_identity_id U`, `integration_id K` FK integrations,
`issuer_namespace K`, `subject_digest H`, `auth_config_reference V(160)`,
`auth_config_version R`, `enabled boolean DEFAULT false`, `revoked_at T?`,
`row_revision R DEFAULT 1`, `created_at/updated_at T`.
PK(client_identity_id); UNIQUE(integration_id,issuer_namespace,subject_digest);
UNIQUE(integration_id,client_identity_id); index(integration_id,enabled).
AI_CLIENT_INBOUND only. Subject digest is keyed/opaque identity derived by the trusted
auth verifier; never accept a package sender claim as identity. Credential/auth-config
references resolve outside these tables; expiry/audience/signature checks are live.
CAS can disable/revoke, but retained reservations remain owned responsibility.

### 4.2 external_client_grants

Columns: `grant_id U`, `integration_id K`, `client_identity_id U`,
`account_id/user_id U` FK auth.users(id), `scope_kind K`, `trip_id U?` FK trips(id),
`package_id U?`, `actions A`, `quota_limit N?`, `quota_window_seconds N?`,
`auth_session_reference V(160)`, `auth_session_version R`,
`expires_at T`, `revoked_at T?`, `grant_revision R DEFAULT 1`,
`authorization_sha256 H`, `created_at/updated_at T`, `authorized_by U` FK auth.users(id).
PK(grant_id); UNIQUE(grant_id,integration_id,client_identity_id,account_id,user_id);
composite FK(integration_id,client_identity_id)→client_identities;
index(account_id,client_identity_id,expires_at), (trip_id,revoked_at).
Current Account=user; authorized_by must be that verified user for delegation.
Scopes ACCOUNT_STAGING (trip null) or SINGLE_TRIP (trip nonnull); actions subset
SUBMIT,STATUS,REVIEW. Optional package_id restricts an existing grant to that exact
package; it is an opaque scope, no forward FK to a not-yet-reserved package.
Quota pairing same as registry. Auth session reference is an approved vault-backed
opaque session handle, no token/token hash value with bearer authority. Grant records
are immutable authorization bindings; mutable expiry/revocation/actions use CAS
and audit, and cannot extend an expired grant without a fresh verified authorization.
Single-trip grant never replaces current OTR Trip permission. Multiple Trips require
separate exact grant admissions, not a package-provided array. STATUS may omit new-call
quota consumption but must always reauthorize identity/scope/expiry/revocation.

### 4.3 inbound_ai_import_reservations

Columns: `reservation_id U`, `integration_id K`, `client_identity_id U`,
`account_id/user_id U` FK auth.users(id), `grant_id U`, `admitted_grant_revision R`,
`package_id U`, `package_version smallint` (=1), `contract_version K`
(otr-inbound-import-v1), `idempotency_key U`, `package_sha256 H`, `package_bytes N`
(≤4194304), `trip_intent_kind K`, `trip_id U?` FK trips(id),
`package_material_reference U?`, `package_material_sha256 H?`,
`material_admission_sha256 H?`, `import_id/task_id U?`,
`publication_refs J(65536)`, `review_version R DEFAULT 1`,
`state K DEFAULT RESERVED`, `recovery_disposition K DEFAULT EXACT_RECOVERY_REQUIRED`,
`row_revision/publication_fence R DEFAULT 1`, `result_version R?`,
`result_sha256 H?`, `safe_result J(65536)?`, `safe_reason K?`,
`created_at/updated_at T`, `completed_at T?`.
PK(reservation_id); UNIQUE(integration_id,account_id,idempotency_key);
UNIQUE(integration_id,account_id,package_id);
UNIQUE(reservation_id,integration_id,account_id);
composite FK(grant_id,integration_id,client_identity_id,account_id,user_id)→grants;
index(account_id,state,updated_at), (integration_id,package_id).
Kinds KNOWN|SELECT|PROPOSE; trip iff KNOWN. Proposed Trip title/context lives only in
private staging; no Trip is created. publication_refs contains ≤64 exact Run IDs/
generations/input hashes/Candidate IDs/hashes and ≤64 Confirmation/slot/operation
locators, not raw proposal or receipt payload. These are validated references,
not manufactured server FK authority to device-local unregistered records.
Material reference/hash paired; object integrity is verified by private store, not
inferred from an opaque UUID. State RESERVED|MATERIAL_PENDING|PROCESSING|NEEDS_REVIEW|
DEFERRED|UNKNOWN|REJECTED|COMPLETE. COMPLETE means package/review disposition finished,
never canonical Event applied. Result tuple is atomically sealed by result_version;
subsequent review/status version creates a new exact result digest under CAS, never
changes a previously returned version's bytes. For exact old-version replay retain
its immutable snapshot in invocation/review result below. No raw private evidence in
safe_result. UNKNOWN is a responsibility disposition, not a timeout retry trigger.

Same integration/Account/key + same digest joins reservation, after authenticating the
same retained client/user. Changed digest rejects; another client cannot claim the key.
A same key rotated auth session can access only through current verified grant with
same owner/client scope. Duplicate package ID with new key rejects, never republishes.
SUBMIT replay returns its original sealed invocation response; new STATUS invocation
returns current reservation/review state. Review status updates never rewrite an
old response version. The original grant is history; new authorized same-scope grant may resume via explicit
recovery admission without rewriting original grant pins.

### 4.4 inbound_ai_invocations

Columns: `invocation_id U`, `reservation_id U?` FK reservations,
`integration_id K`, `client_identity_id U`, `account_id/user_id U`, `grant_id U`,
`admitted_grant_revision R`, `action K`, `request_id U`, `request_sha256 H`,
`call_id U`, `publication_fence R`, `row_revision R DEFAULT 1`,
`state K DEFAULT RESERVED`, `response_version R?`, `response_sha256 H?`,
`safe_response J(65536)?`, `created_at/updated_at T`, `completed_at T?`.
PK(invocation_id); UNIQUE(integration_id,account_id,request_id);
UNIQUE(call_id); FK(call_id)→calls (deferred), calls.invocation_id→invocations
(deferred); composite grant FK as above; composite identity FK as above;
account/user FK auth.users(id); index(reservation_id,created_at).
Actions SUBMIT|STATUS|REVIEW; state RESERVED|PROCESSING|COMPLETE|UNKNOWN|REJECTED.
Reservation required after package resolution; initial denied/unresolved auth produces
no owner-attributed row and only separate safe aggregate operational diagnostics.
Same request identity binds exact action/body/owner/client; changed bytes reject.
Each authenticated transport invocation has one generic call identity; a duplicate
HTTP response does not rerun package publication. Retained response version/hash/body
are immutable once sealed; no raw travel content. Status reads can return a new
reservation version under a new invocation request ID. This journal has no worker
lease/due time and cannot create Event authority.

### 4.5 inbound_ai_review_decisions

Columns: `review_decision_id U`, `reservation_id U` FK reservations,
`review_key U`, `decision_sha256 H`, `package_version smallint` (=1),
`package_sha256 H`, `review_version R`, `candidate_id U`, `candidate_sha256 H`,
`base_revision R?`, `disposition K`, `review_material_reference U`,
`review_material_sha256 H`, `confirmed_user_id U` FK auth.users(id),
`confirmed_at T`, `confirmation_source K` (=EXPLICIT_USER),
`confirmation_scope K` (=EXACT_REVIEW_DECISION),
`confirmation_id/slot_id/operation_key/intended_event_id U?`,
`input_identity_map J(16384)`, `preparation_sha256 H?`,
`state K DEFAULT RESERVED`, `row_revision/publication_fence R DEFAULT 1`,
`safe_result J(16384)?`, `result_sha256 H?`, `created_at/updated_at T`.
PK(review_decision_id); UNIQUE(reservation_id,review_key);
unique partial(reservation_id,candidate_id) WHERE state IN (RESERVED,UNKNOWN,PREPARED);
index(reservation_id,review_version,candidate_id).
Dispositions ACCEPT|REJECT|DEFER; state RESERVED|UNKNOWN|PREPARED|REJECTED|DEFERRED.
Before CP13A prepare allocate and persist all selection IDs/input map atomically;
ACCEPT requires operation/intended Event IDs, nonaccept has neither. Exact C review
is privately stored with a digest; user claim is independently authenticated and
must equal reservation.user_id. Current package/review/Candidate/hash/base pins are
revalidated; stale review rejects before side effect. No public FK to locally
unregistered Candidate/slot IDs; once registered, exact catalog scope is checked by
existing protected C admission. Lost prepare response recovers identical selection/
Confirmation/key, never newId() again. Repeated key+digest returns sealed result;
changed bytes reject. Competing UNKNOWN preparation blocks another review/Candidate
attempt per reservation, matching B's conservative guard.

### 4.6 Private content custody and host bridge dependency

Default: registry/usage/audit/invocation/status contain bounded refs/digests, no package
body. Exact restart/review recovery still requires submitted content somewhere.
Future trusted private material store must retain **only the bounded explicit tool
package/review envelope**, encrypted and Account-isolated, under opaque UUID handles.
No whole conversation history, URLs granting fetch, or arbitrary mailbox context.
Stage-before-admission custody is distinct from Source identity. Use a future private
`inbound-import-staging` object namespace with 4 MiB package and reviewed-decision
bounds; do not claim current Source store accepts unassigned envelope blobs.
No bucket, upload route, key resolver or retention worker is created in preflight.

Ordering: reserve exact digest first; material put is idempotent by reservation/digest;
verify object bytes; attach reference under CAS; admit only verified supplied material
through existing Source rules. Crash during put leaves MATERIAL_PENDING; exact resupply
may finish storage, but does not prove earlier publication absent. Delete stage bytes
only after durable admitted originals/derivatives and exact result/review responsibility
are safely retained, or positively terminal unadmitted rejection with approved deletion.
Digests alone cannot reconstruct review intent. Missing stage bytes with uncertain
processing remains UNKNOWN, not a safe reprocess/new-key decision.

B executes real device SQLite repositories. A server reservation does not supply a
server CP13B repository host or access to a device's local DB. Future authenticated
Account-scoped transfer/ack bridge must hand retained packages to that device's
existing queue and return exact registered publication/preparation locators with
current authorization. It needs a separately approved contract and durable material
custody before live ChatGPT/Claude/MCP publication. No new server scheduler or
unreviewed server-side canonical executor is substituted. Until bridge/material/auth
acceptance is approved, live inbound activation remains blocked despite installed
metadata. CP14 persistence can be tested unwired with synthetic admitted handoffs.

## 5. Exact SQLite50 proposal

Exactly one additive SQLite50, not authored or registered. No historical SQL, Run
states, C proposal/draft v1, original Capture, Day or Ledger table is rewritten.
No old draft is adopted as executable continuation. All writes through repositories.

Local types: U/H/K/T are TEXT with validation; Account U, task/request/attempt U;
Capture IDs remain TEXT1–128 (not UUID). T is validated UTC operational timestamp,
clock origin separate. R/N use **BLOB affinity with typeof='integer' CHECK and safe
bounds**, matching accepted certificate storage-class protection; booleans INTEGER
CHECK typeof integer and 0/1. J(n) canonical TEXT with UTF-8 byte bound, strict versioned
parse at write/read; no raw provider output or duplicate original bytes. No implicit
numeric TEXT→INTEGER coercion. Every nullable column defaults null; only named
nonnull defaults below. Local private IDs use no invented server_id alias.

### 5.1 intelligence_continuations

Immutable columns:
`account_id U`, `task_id U`, `format_version R` (=1), `import_id U`,
`manifest_version R`, `manifest_sha256 H`, `trip_id U?`, `stage K`
(EXTRACTION|INTERPRETATION|ENRICHMENT|CLOSURE), `logical_request_id U`,
`logical_idempotency_key U`, `input_pins J(65536)`, `input_sha256 H`,
`consumer_id/schema_id/schema_dialect K`, `consumer_version/schema_version R`,
`schema_sha256 H`, `capability_requirements J(16384)`,
`policy_snapshot J(65536)`, `policy_sha256 H`, `run_id U?`,
`expected_run_generation R?`, `candidate_id U?`, `expected_candidate_sha256 H?`,
`event_id U?`, `expected_event_revision R?`, `created_at T`, `creation_clock K`.

Mutable CAS columns:
`row_revision/publication_fence R DEFAULT 1`,
`current_pass_complete boolean DEFAULT false`, `work_disposition K DEFAULT PENDING`,
`wait_reason K?`, `wait_reasons J(16384)` (initial empty array),
`sync_operation_id TEXT?`, `dependencies J(16384)` (initial empty array),
`current_attempt_id U?`, `cancellation_disposition K DEFAULT NONE`,
`safe_reason K?`, `publication_id U?`, `publication_sha256/result_sha256 H?`,
`updated_at T`, `update_clock K`, `completed_at T?`.
PK(account_id,task_id); UNIQUE(account_id,logical_request_id);
UNIQUE(account_id,logical_idempotency_key);
unique partial(account_id,publication_id) WHERE publication_id nonnull;
indexes(account_id,import_id,manifest_version), (account_id,trip_id),
(account_id,sync_operation_id), (account_id,current_attempt_id).
Optional Run FK(account_id,run_id)→trip_source_runs(cache_account_id,id);
Candidate FK→trip_source_candidates same Account; candidate belongs to pinned Run;
run/generation and candidate/hash paired; Event/revision paired but **no FK to mutable
canonical Event mirror**, which certified absence may remove. Trip is admission scope,
not a FK to a possibly absent local Journey mirror. Pending task can be Account-only;
Source publication still requires actual Trip admission.

Work PENDING|WAITING|RUNNING|RESULT_PENDING|PUBLISHED|FAILED|CANCELED|STALE|UNKNOWN;
wait reasons WAITING_FOR_NETWORK|WAITING_FOR_REMOTE_INTELLIGENCE|
WAITING_FOR_ENRICHMENT|WAITING_FOR_AUTH|POLICY_BLOCKED. All independent reasons remain
in wait_reasons with exact dependency/capability/policy pins; primary wait_reason is
only a presentation summary. WAITING requires at least one eligible bounded reason;
unsupported/exhausted becomes FAILED/review disposition, never indefinite wait.
Cancellation NONE|REQUESTED|FENCED; no claim of provider cancellation.
Clocks CALLER_OBSERVED|DEVICE_WALL|SERVER_OBSERVED; wall clock is not CAS ordering.
Policy snapshot contains exact privacy/network/region/budget currency+nanos/route/
max-attempt/deadline/version pins, no credential. Capabilities match descriptor/schema.
Dependencies ≤64 strict {kind:QUEUE_OPERATION|TASK, id}, same Account, acyclic.
input_pins ≤64 strict exact Capture revision/payload/hash/count and/or Source/material/
Representation/Input/transform pins with original ancestry. No excerpts/filenames/raw
material. Content bounds and identity pins follow CP11/CP13A, not a new Source ID.

PUBLISHED requires verified publication tuple and exact consumer installation in same
transaction. Terminal pass and work/cancellation/UNKNOWN are independent; current-pass
complete may coexist with waiting/resumable/uncertain work. Cancel/supersession increments
fence, never deletes pending responsibility. Unique publication does not imply canonical
success. Future completion/notification fact is derived from exact publication/fence,
not a notification queue or delivered push.

### 5.2 intelligence_continuation_attempts

Immutable columns:
`account_id/attempt_id/task_id U`, `attempt_sequence R`, `format_version R` (=1),
`request_id/idempotency_key U`, `request_sha256 H`,
`request_material_reference U?`, `request_material_sha256 H?`,
`predecessor_attempt_id/predecessor_request_id U?`,
`integration_id/provider_id/model_id/model_version/adapter_version K?`,
`provider_config_id U?`, `config_version K?`, `configuration_sha256 H?`,
`descriptor_snapshot J(16384)`, `policy_admission J(16384)`,
`policy_admission_sha256 H`, `task_publication_fence R`, `sync_operation_id TEXT`,
`usage_correlation_id U?`, `fallback_chain_id U`, `shadow boolean DEFAULT false`,
`shadow_of_attempt_id U?`, `created_at T`, `creation_clock K`.

Monotonic/CAS columns:
`row_revision R DEFAULT 1`, `execution_observation K DEFAULT NOT_STARTED`,
`execution_outcome K?`, `result_install_disposition K DEFAULT NONE`,
`metering_disposition K DEFAULT NOT_REQUIRED`, `safe_failure_code K?`,
`response_material_reference U?`, `response_material_sha256 H?`,
`response_sha256/publication_sha256 H?`, `started_at/ended_at T?`,
`latency_ms N?`, `reported_usage_summary J(4096)?`, `updated_at T`, `update_clock K`.
PK(account_id,attempt_id); UNIQUE(account_id,task_id,attempt_sequence);
UNIQUE(account_id,task_id,attempt_id); UNIQUE(account_id,usage_correlation_id)
WHERE nonnull; indexes(account_id,task_id,attempt_sequence),
(account_id,sync_operation_id), (account_id,execution_observation).
FK(account_id,task_id)→continuations;
FK(account_id,predecessor_attempt_id)→attempts;
FK(account_id,shadow_of_attempt_id)→attempts, both same task/chain and earlier sequence;
CHECK attempt differs from predecessor/shadow parent, acyclic traversal≤64.
Continuation's FK(account_id,task_id,current_attempt_id)→attempts composite is deferred.
A shadow never becomes active current_attempt or receives an installer.

Execution NOT_STARTED→RUNNING→TERMINAL or UNKNOWN; UNKNOWN→TERMINAL only trusted exact
recovery. RUNNING is persisted before possible side effect. NOT_STARTED can remain
with positive permanent dispatch revocation. TERMINAL outcome SUCCEEDED|PARTIAL|FAILED|
CANCELED is explicit; UNKNOWN has no invented terminal outcome. Known terminal success
cannot regress when usage sink fails. Installation NONE|PENDING|INSTALLED|REJECTED_STALE|
REJECTED_CANCELED|FAILED|SHADOW_ONLY. Metering NOT_REQUIRED|START_PENDING|START_DURABLE|
COMPLETION_PENDING|COMPLETE|UNKNOWN. Provider outcome, consumer installation and meter
completeness are separate. Published digests/material bindings write once; latency/null
measurements only from actual observations. Optional reported_usage_summary caches
nullable counters and quality only, never duplicates authoritative server cost ledger.
No local billing balances/prices/training/CXE tables.

Concrete provider config_version remains K for A's descriptor labels; server physical
R version must be projected canonically as decimal K, with exact config digest. A
model/version absent from API is explicit descriptor unknown, never invented version.
Deterministic/on-device descriptor may omit server config/call FK and usage correlation
if no server dispatch exists. Actual remote/server compute requires usage correlation.
Request/reference pair is needed when exact request cannot be rebuilt from retained
pins+versioned deterministic serializer; after dispatch never rerender with changed
adapter/prompt. Keep bounded private exact bytes in existing admitted material custody;
response ref similarly permits retrying installation after crash without a model call.
No raw response in queue or usage. New custody paths require explicit approval before
live use; unavailable exact bytes require recovery, never regeneration-as-replay.

### 5.3 Queue ownership, FK OFF and retention protection

SQLite50 additionally creates UNIQUE(owner_user_id,id) on existing sync_operations
(no historical definition edit); both journals' composite queue FKs target that key.
Queue owner must equal account_id, entity/task binding exact, Trip matches when set.
Task binding may be null before enqueue; execution attempt requires a claimed retained
queue row. Repository transaction and guards enforce it even with foreign_keys OFF.
Current-attempt tuple must name that exact task; at most one active nonshadow attempt.
Journal CAS/immutable checks, same-account pins, dependency cycles and explicit child
checks are duplicated at repository trust boundaries; never rely on cascades.
Future deletion guards and maintenance anti-joins retain every referenced queue row,
Capture original, Source/material pin and attempt needed for uncertain work or replay.
`ledgerMaintenance.ts` currently protects only Ledger references: extend its deletion
predicate narrowly for these journals during implementation. FK OFF acceptance must
show that deletion of a referenced row fails or is withheld transactionally.

Wake/restart obtains a new AccountRequestContext. Existing queue may recover PROCESSING
as RETRYABLE; intelligence adapter must inspect retained attempt and choose exact
recovery, not blind redispatch. Queue lease expiry proves only lease expiry.
Wait/wake creates **no attempt**. Queue attempt_count is scheduler bookkeeping, distinct
from concrete attempt_sequence. Fresh CAS reservation validates task fence; queue claim
then attempt binding rechecks that fence in one local transaction. No independent task
claim/lease/scheduler is introduced.

## 6. Attempt → call → usage → publication identity

One logical task owns ordered concrete attempts. For CP14 each attempt permits at
most **one independently dispatched provider/integration call**. It is not exactly
one billable call: qualification/START/kill may stop it before dispatch; a provider
may report no billed usage, or billing may remain UNKNOWN. Tools/multipart/composite
adapters that require another independent external call must expose a linked attempt
before that call; no hidden SDK retries. One call has zero or many append-only usage
observations, and at most one accepted active result publication per consumer binding.
The initial durable START is mandatory before server-side side effects.

| Case                               | Exact identity/metering rule                                                                                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Streaming                          | One attempt/call; keyed progress/final observations. Cumulative snapshots replace in projection, disjoint deltas dedup. Partial stream is not accepted Candidate.                                                                                        |
| Multipart                          | One transport request is one call. Independently dispatched part/tool is another linked attempt/call. Do not enable such adapters until descriptor declares correlation/side effects.                                                                    |
| Safe replay                        | Same provider request/key/body only with declared support and owner admission; new actual dispatch gets new attempt/call. Exact START/completion recovery of the original call adds no attempt. Vendor replay support is not free-billing proof.         |
| Retry                              | Prior terminal/not-started evidence + explicit policy permit a new sequence/call. UNKNOWN stops retry until exact recovery or independently reviewed safe replay evidence.                                                                               |
| Fallback                           | New provider/config/request/key, predecessor attempt/request, same chain/task. Requires known outcome and remaining qualified same-currency budget; unknown cost blocks budgeted escalation.                                                             |
| Shadow                             | Separate shadow attempt/call/usage, shadow_of link and privacy admission; never active current attempt, no installer, no effect on primary success.                                                                                                      |
| Late usage after UNKNOWN           | Same call, new RECOVERY observation. Execution may resolve terminal while cancellation/stale installation remains fenced.                                                                                                                                |
| Usage recorded; installation fails | Preserve usage/COGS and result reference. Retry installation under exact fence without another provider dispatch.                                                                                                                                        |
| Local deterministic/on-device      | No external call required; usage ledger optional. No fake tokens or zero COGS. Explicit measured local counters may be cached; known zero external invoice cost requires explicit policy evidence, and does not imply zero compute.                      |
| Self-hosted                        | Same call/attempt responsibility; actually measured CPU/GPU/wall/accelerator counters nullable; compute cost only with exact schedule. Host crash after compute stays UNKNOWN until exact recovery.                                                      |
| Inbound tool                       | Authenticated invocation is generic integration call with count/bytes/latency only when measured. External AI-client reasoning is not an OTR outbound model call. If OTR later invokes a model, create separately admitted linked outbound attempt/call. |
| Wake/wait/pass complete            | No call, no model token usage, no attempt.                                                                                                                                                                                                               |

A adaptation required: replace memory START/final upserts with append-only keyed
observations; introduce explicit attempt/call identity; retain exact response material
and separately report execution, metering and installation certainty. **Pre-dispatch
meter failure still blocks execution** with positive NOT_STARTED only when dispatch
has not occurred. A lost START acknowledgement first recovers exact persisted START;
never mint a new call just because persistence response was lost.

A currently returns FAILED/METER_UNAVAILABLE with execution_certainty UNKNOWN when
completion metering fails. Keep its conservative no-fallback behavior, but store any
already observed terminal result in attempt/result custody and separately mark meter
pending/UNKNOWN. Do not turn known provider success into certified failure or discard
its bytes. If neither completion nor result is durably retained, overall responsibility
is UNKNOWN. Meter retry appends exact original completion; no model replay. This is
a required future adapter correction, not implemented in this preflight.

## 7. Authentication, credentials, retention and data walls

Identities remain distinct: OTR end user (auth.users), active device Account (current
individual user identity, independently generation-fenced), admin principal, external
client identity, provider service credential, user-delegated external session, and Trip
access/Person. No sender/name/uploader/package confirmation becomes a grant. Auth
expiry/network failure pauses remote work; valid local sessions keep cached app access.

Local Supabase Auth/SecureStore and Backend verified user identity exist.
`backend/src/server.ts` reads Dev Supabase credential values from environment and
`supabaseGateway.ts` uses the existing Supabase client boundary. That pattern is
not a provider vault or a dedicated control-plane principal; do not reuse its
broad Dev secret client as a privileged integration connector. Dedicated
C/B gateways are reserved and unprovisioned; A's `vault:` string is a grammar, not a
resolver. Local migration/backend inspection found no admitted general intelligence
secret-vault resolver or live external-client delegation verifier. **Future dependency:**
approved secret-manager/vault namespace and scoped resolver (provider-service access,
rotation/version pin, audit and no payload logging); approved external issuer/audience/
key verification and user-delegated session verifier; dedicated gateway sessions with
fixed identity attestation. Do not assert Supabase Vault is installed/configured from
an extension name or load secret values to investigate. No credentials are read here.

Disable/revoke blocks new dispatch/delegated access, preserves audit/pricing/usage/
reservations, and never converts UNKNOWN to FAILED or drops retained responsibility.
Read/recovery under revoked end-user grant is withheld from that client; an independently
authorized internal recovery principal may reconcile responsibility with minimized
output, without impersonating the former client or writing canonical data.

Retention is **class-specific proposed policy**, with durations unresolved for owner/
privacy review; no invented legal retention period:

| Class                                  | Retention/release rule                                                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry/config/audit                  | Retain version/audit chain and references required to explain retained calls; disable instead of delete. No secrets in history.                                             |
| Price schedules/units                  | Retain immutable schedules referenced by calls/COGS; no repricing historic calls.                                                                                           |
| Usage/cost/call responsibility         | Retain content-free measurement and invoice reconciliation evidence; exact user-identifiable attribution subject to separately approved privacy deletion.                   |
| Inbound package/review material        | Minimum private staging while processing/exact replay requires it; delete only after verified custody/result and positive responsibility closure. Never whole conversation. |
| Reservation/invocation/review recovery | Retain exact key/digest/version/generated selection/result correlations while replay/UNKNOWN/claims remain possible. No age-only eviction.                                  |
| Local continuation/attempt history     | Pending/waiting/running/uncertain and canceled-but-UNKNOWN retained. Terminal history pruning only after exact publication/dedup and referenced queue/material protections. |
| UNKNOWN responsibility                 | Survives queue cleanup, Account switch/logout and timeout. Release requires positive exact terminal/no-side-effect proof, not TTL or missing receipt.                       |
| Shadow/evaluation refs                 | Minimal versioned result/active-shadow relation, governance-controlled lifetime; raw evidence stays in owning material system.                                              |

All auth/user/Trip FKs RESTRICT intentionally expose deletion obligations. Account
closure first disables/revokes, fences new work, and coordinates material deletion
through owning pipelines. Superuser cascading deletion is not a policy. A later approved
pseudonymization/redaction command must preserve required responsibility/idempotency
without retaining unauthorized raw data. Owner must decide terminal metadata horizons,
user deletion versus audit attribution, staged content maximum residence, cross-device
custody, access-removal behavior and cryptographic deletion. Unresolved policy blocks
automatic purge/live rollout, not documentation or offline cached use.

CP14 is **COGS/usage, not charging**. Future reports can group authorized Account/user,
feature/task, provider/model/config, active/shadow, retry/fallback waste, completed
trustworthy Import count and provider reconciliation. Failed installation still costs;
count trustworthy Import from verified owning result, never model SUCCEEDED. No
subscription/entitlement/invoice/balance/Stripe/customer token-wallet tables.

Import Intelligence is task/evidence oriented. Personal CXE is individual context/
attention/presentation and baseline works with CXE OFF. Product Intelligence is a
separately governed minimized population analytics/training product. Shared metadata
implies no CXE-memory→Product training, raw Import→training, population optimizer→personal
UI policy overwrite, or conversion override of task correctness/recovery. No CXE/Product
model tables here. Future evaluation may reference Source/material/result versions,
provider/config/model, Candidate/closure versions, exact user-correction and canonical
outcome, active/shadow and evaluation UUID. Store no duplicated private evidence in
usage. An evaluation ref is not a training grant; datasets require separate governance,
lineage/policy/retention/deletion and user/legal basis. No training storage is built.

## 8. RLS/ACL, protected commands and future Admin boundary

Additional exact authorization table: `external_integration_admin_grants`:
`admin_grant_id U` PK; `actor_id U` FK auth.users(id); `environment K` FK
environment_state; `permission K` (CONFIG_ADMIN|SECURITY_ADMIN|COST_READER|
SUPPORT_RECOVERY); `grant_revision R DEFAULT 1`; `expires_at T`; `revoked_at T?`;
`created_at T`; `created_by U` FK auth.users(id).
UNIQUE(actor_id,environment,permission); index(actor_id,environment,expires_at).
RLS ENABLE/FORCE, owner postgres; SELECT only fixed private readers/writers as needed;
INSERT/UPDATE only trusted separately audited admin provisioning by migration owner.
No CP14 product setter can create its own admin grant. expired/revoked denies. Runtime
uses externally verified OTR admin actor + this current allowlist; a client-supplied
UUID/role label is never sufficient. NOLOGIN roles below confer no membership to the
actor or API login. No unrestricted universal admin service.

All proposed isolated roles NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
NOBYPASSRLS; no CREATE schema/database, ownership outside fixed functions, outgoing
membership, SET/INHERIT/admin options, DDL, TRIGGER, REFERENCES, TRUNCATE or DELETE.
Gateways remain NOLOGIN/unprovisioned until separate review. Dedicated future connector
must attest actual session_user and verified actor/client binding. Root functions
SECURITY DEFINER, fixed `search_path=pg_catalog`, fully qualified names, fixed closed
call graph. Guards/helper validators are trusted migration-owned or invoker-only with
no direct gateway/API EXECUTE; no generic SQL/JSON mutation executor.

| Table(s)                                                | Private SELECT                                                               | Private INSERT                                               | Private UPDATE                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| environment_state, integrations                         | config_writer, meter_writer, inbound_writer, reader (filtered function only) | config_writer (integrations only; environment seed postgres) | config_writer: named config/health projection columns via command/CAS |
| provider_configs, price_schedules, price_schedule_units | config_writer, meter_writer, reader                                          | config_writer                                                | none                                                                  |
| config_audit                                            | config_writer, inbound_writer, reader                                        | config_writer and inbound_writer for own protected changes   | none                                                                  |
| health_observations                                     | config_writer, meter_writer, reader                                          | config_writer through fixed health command                   | none                                                                  |
| calls                                                   | meter_writer, inbound_writer exact call read, reader filtered                | meter_writer                                                 | meter_writer: responsibility/CAS columns only                         |
| usage_events                                            | meter_writer, reader filtered                                                | meter_writer                                                 | none                                                                  |
| client_identities, grants                               | inbound_writer, reader filtered                                              | inbound_writer                                               | inbound_writer: allowed revoke/expiry/scope revisions only            |
| reservations, invocations, review_decisions             | inbound_writer, reader filtered                                              | inbound_writer                                               | inbound_writer: named state/fence/result/reference/CAS columns only   |
| admin_grants                                            | config_writer, inbound_writer, reader                                        | postgres only                                                | postgres only                                                         |

Names are prefixed `otr_external_integration_`: config_writer, meter_writer,
inbound_writer, reader, admin_gateway, call_gateway, inbound_gateway, reporting_gateway,
recovery_gateway. Gateway roles have **zero table DML/SELECT**. RLS policies allow only
these private roles' exact listed operations; protected fixed roots additionally assert
actual current_user/session_user and explicit owner/environment/scope. Reporting role
cannot obtain an unfiltered reader function. Private role policies do not grant mobile
or service access. PUBLIC, anon, authenticated, service_role and authenticator receive
no new EXECUTE/table/column privileges. BYPASSRLS service_role is not protection if
SQL ACL is broad: direct ACLs are revoked as well. Trusted DB owner/superuser remains
administrative trust, not an application bypass guarantee. A/B/C existing roles receive
no access to control-plane tables and no new membership. Any fixed bridge gets only
its specific reviewed function edge, no canonical mutation rights.

Proposed function signatures use jsonb **strict named command v1** for bounded exact
arguments, not arbitrary DML. Every command has `command_id U`, verified actor/workload
binding, environment, exact entity/pins and expected revision where mutable; key/hash
replay is required. UUID Actor is checked against trusted auth before invoking SQL and
current grant inside SQL. No credential/plaintext/private material in command args.

| Fixed function / owner                                     | Exact request/result and permitted caller                                                                                                                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| external_integration_configure(jsonb) / config_writer      | Admin CONFIG_ADMIN; integration metadata, expected config_version, new digest/reference/quota, safe reason; returns new version/audit_id. admin_gateway only.                                              |
| external_integration_set_kill(jsonb) / config_writer       | SECURITY_ADMIN; environment or integration, expected version, kill=true/false; closing always possible; runtime_enabled cannot be opened. admin_gateway only.                                              |
| intelligence_provider_config_append(jsonb) / config_writer | CONFIG_ADMIN; exact descriptor and previous version, immutable next; returns config_id/version/audit. admin_gateway only.                                                                                  |
| external_integration_price_append(jsonb) / config_writer   | CONFIG_ADMIN; schedule and complete ≤32 unit definitions/previous scope; immutable schedule+units+audit transaction. admin_gateway only.                                                                   |
| external_integration_health_observe(jsonb) / config_writer | Verified observation workload, exact integration/config/hash/health/time; appends and projects under config lock. call_gateway only, never user/admin arbitrary health text.                               |
| external_integration_reserve_call(jsonb) / meter_writer    | call_gateway only; verified Account/policy/attempt/request/config/pricing/fence; locks current registry/admission/quota, inserts call+START atomically; returns call and admitted digest. No provider I/O. |
| external_integration_mark_dispatch(jsonb) / meter_writer   | call_gateway; same call/fence/expected revision; rechecks live admission before MAY_HAVE_STARTED; returns exact dispatch fence.                                                                            |
| external_integration_usage_append(jsonb) / meter_writer    | call_gateway or recovery_gateway; exact call/key/digest/typed units/safe outcome; returns observation_id. Accept late historical usage even when integration disabled.                                     |
| external_integration_observe_call(jsonb) / meter_writer    | call_gateway or recovery_gateway; exact trusted terminal/UNKNOWN evidence under CAS; cannot infer terminal from absent meter or timeout.                                                                   |
| external_client_authorize_grant(jsonb) / inbound_writer    | inbound_gateway only after verified user-delegation/auth-config checks; exact client/user/Trip/actions/expiry/session ref; returns grant revision/audit. No self-grant from package.                       |
| external_client_revoke_grant(jsonb) / inbound_writer       | inbound_gateway verified owning user or admin SECURITY_ADMIN; exact grant CAS/revocation; append audit.                                                                                                    |
| inbound_ai_reserve_package(jsonb) / inbound_writer         | inbound_gateway; current verified client/Account/grant, exact package ID/key/digest/version/Trip intent; serializes uniqueness; returns retained reservation, never starts publication.                    |
| inbound_ai_attach_material(jsonb) / inbound_writer         | inbound_gateway; verified private-store ref/digest and reservation CAS; returns retained state.                                                                                                            |
| inbound_ai_reserve_invocation(jsonb) / inbound_writer      | inbound_gateway; exact action/request/client/owner/reservation; fixed internal meter bridge reserves generic call/START in same transaction; returns IDs.                                                  |
| inbound_ai_complete_invocation(jsonb) / inbound_writer     | inbound_gateway or recovery_gateway; exact fence/CAS/sealed safe response/digest, validated package result; returns exact retained result.                                                                 |
| inbound_ai_reserve_review(jsonb) / inbound_writer          | inbound_gateway; current user/grant, exact package/review/Candidate/base/body digest and generated selection refs; returns same retained selection on replay.                                              |
| inbound_ai_observe_review(jsonb) / inbound_writer          | inbound_gateway or recovery_gateway; exact existing CP13A preparation correlation; seals safe result; no Event command edge.                                                                               |
| inbound_ai_status(jsonb) / reader                          | inbound_gateway; revalidate client/user/grant/Trip/package scope, returns safe status only. Disable/revocation withholds ordinary caller.                                                                  |
| external_integration_admin_report(jsonb) / reader          | reporting_gateway; current COST_READER or CONFIG_ADMIN as applicable; filtered metadata/currency-separated aggregates, no secrets/travel material.                                                         |
| external_integration_recover_exact(jsonb) / reader         | recovery_gateway; SUPPORT_RECOVERY, exact reservation/call binding and minimized evidence; read only. State changes use named observe commands, no automatic canonical execution.                          |

Fixed internal `external_integration_reserve_inbound_call(jsonb)` is meter_writer-owned,
EXECUTE only inbound_writer, and asserts inbound_gateway original session; only
INBOUND_TOOL with exact invocation/client/grant/reservation correlation permitted.
It cannot become a generic model-call or SQL executor. Matching completion usage bridge
has the same fixed scope. No cross-role SET or broad meter-write table grant is needed.
Command roots validate request bytes/version first, then live scope and exact result
replay; status/replay never bypass authorization. Admin/principal provisioning and
security inventory acceptance remain explicit dependencies, not installed assurances.

Future Admin Portal may read config/health/price/audit/quota/activation/shadow metadata,
usage quality and per-currency COGS aggregates through filtered reporting. Writes are
only the protected config/kill/quota/model/price/credential-reference/environment
commands above with actor, reason, expected version, old/new safe audit digest. Support
gets exact minimized recovery only; cost reader cannot enable a provider. No raw travel
evidence by default, unrestricted service-role DML, Admin UI or new route here.

## 9. Transaction ordering and in-flight races

No Account apply gate or SQL transaction is held across provider, storage or auth I/O.
Commands use READ COMMITTED and fixed locks. Global environment row → integration IDs
sorted → client/grant (inbound) → exact reservation/call key → price/config rows →
invocation/review/result rows. Metering append locks call; it **never later acquires
integration/grant locks**, avoiding reverse order. Admin config/kill locks environment
then integration, appends audit, commits. Reporting snapshots do not mutate. Inbound
reservation key uses transaction advisory serialization or unique insert+locked retry;
no absence-query race. Exact existing CP13A scope/admission locks are retained.
Do not enter CP13A canonical locks and then acquire control-plane locks; use separate
stages and fresh admission rather than one cross-system SQL transaction.

Outbound ordering:

1. Read/control admission selects current provider config, quota and price/policy pins.
2. Under local Account gate/task CAS, reserve exact attempt and queue binding, then
   release gate. Under server admission locks reserve call + durable START atomically;
   verify response or exact replay before proceeding.
3. Recheck kill/enabled/config and task authorization/fence immediately before marking
   dispatch MAY_HAVE_STARTED, commit, then perform external I/O outside every gate.
4. Append completion usage/observe actual execution, independently preserve exact
   bounded result material. Meter failure cannot authorize model retry.
5. Fresh Account generation/Trip/material/Run/Candidate/Event/fence validation under
   local apply gate; atomically install owning consumer result and publication tuple
   plus attempt/task/queue disposition. CP13B/CP13A only prepare, never autoexecute.

There is no distributed transaction between PG and device SQLite. Crash at any boundary
leaves an exact attempt/call/material correlation for recovery, not inferred success.

Inbound ordering: live integration/client/auth/user/grant/Trip admission → unique exact
package reservation → exact private material put/admission → persisted invocation and
review selection IDs → authenticated device handoff → existing CP13B/CP13A → exact
result/status seal. Reauthorize after each I/O before disclosure/installation. Review
preparation is recovered using existing exact Confirmation/slot/operation identities.
Device reconnect: task CAS eligibility reservation → existing queue claim → exact attempt
binding with fence recheck → external I/O outside Account gate → fresh context and pins
→ metering/result publication in their respective durable transactions. Duplicate wakes
join the same claim/attempt; UNKNOWN routes to recovery, never fresh provider call.

Disable before dispatch wins admission and prevents call. A kill after dispatch marker
can race with actual send: classify as **in flight**, preserve responsibility, request
cancel where supported and fence local install according to task policy. Kill does not
prove external cessation. Config rotation after admitted dispatch leaves historical pins
intact; subsequent starts must use current config. Already running result can be consumed
only under current task/privacy/Trip admission; emergency security invalidation may fence
publication explicitly. Reusing stale ELIGIBLE config to bypass newer DISABLED rejects.
If Account/Trip fence changes while I/O runs, safe usage observation remains retainable
by trusted workload, but user result install/disclosure rejects. User deletion/privacy
policy must govern retention; usage persistence is not permission to retain raw response.

## 10. Failure / UNKNOWN matrix

| Trigger                                                | Required durable state and action                                                                                                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider succeeds, response lost                       | Call/attempt UNKNOWN; recover exact request/provider result and units. No new key/fallback/no-cost claim.                                                                        |
| Usage reported, result lost                            | Keep usage; result installation pending/UNKNOWN, recover exact result. Meter cannot reconstruct Candidate.                                                                       |
| Result received, usage missing                         | Retain exact validated result bytes/digest and observed terminal execution; metering completion pending. Block unsafe fallback; retry exact meter and revalidate before install. |
| Meter unavailable before dispatch                      | NOT_STARTED only if no dispatch marker/side effect; queue waits/retries metering. Lost START ack first exact lookup.                                                             |
| Meter unavailable after side effect                    | Meter UNKNOWN/pending and exact retained call/result; neither failure nor no-cost certified. Never resend model to fix meter.                                                    |
| Config disabled before call                            | Admission denied, positively undispatched attempt can close NOT_STARTED under fence. START reservation may exist, no fabricated executed count.                                  |
| Config disabled during call                            | Retain in-flight/UNKNOWN until actual terminal evidence. Blocks next start; cancellation/install fence separate.                                                                 |
| Account switch / A→B→A                                 | Old callback cannot install or disclose. Retain A intent/usage responsibility; fresh A context can recover exact work.                                                           |
| Trip access revoked                                    | No new dispatch or result/review disclosure/install under revoked rights. Preserve minimized exact responsibility for authorized internal recovery.                              |
| Late result after cancel/supersession                  | Retain safe terminal/usage facts; installation REJECTED_CANCELED/STALE. No original release while Source responsibility remains unresolved.                                      |
| Inbound package committed, response lost               | Same key/digest returns exact retained reservation/result after current auth. No second publication.                                                                             |
| Reservation exists, processing unknown                 | UNKNOWN; inspect exact material/publication/Confirmation/slot/receipt correlations. Lease/TTL/absent response never proves no commit.                                            |
| Missing price schedule                                 | Cost NULL/UNKNOWN. Unknown expected budget blocks budget-required dispatch; explicitly admitted no-cost-ceiling policy may record unpriced usage. Never silent zero/FX.          |
| Unknown token units                                    | Each missing counter NULL/UNKNOWN; other known units retained with own quality. No total inferred and no pricing of missing units as zero.                                       |
| Late shadow                                            | Same shadow call/usage; no active publication or primary failure. Evaluation only under governed refs.                                                                           |
| Self-hosted crash after compute                        | UNKNOWN compute/result responsibility; retain measured units if available. No assumed zero or safe restart; exact host recovery needed.                                          |
| Material put succeeds, reservation attachment ack lost | Same reference/digest CAS replay after verifying retained object; never create another package or Source identity.                                                               |
| CP13A prepare succeeds, bridge ack lost                | Review UNKNOWN until exact retained selection/Confirmation recovery; original generated IDs/operation retained. Never allocate replacement IDs.                                  |
| Installation transaction fails                         | Atomic rollback leaves exact result available and usage retained; queue not successful. Retry installation with fresh admission, not external call.                              |
| Queue lease expires                                    | Queue may become RETRYABLE; attempt certainty unchanged. Recovery adapter withholds redispatch of RUNNING/UNKNOWN.                                                               |

## 11. Acceptance plan and implementation sequencing

This preflight validates static source/proposal preservation only. Future implementation
must leave runnable checks using existing native SQLite/PostgreSQL/queue test harnesses;
no new testing framework. Synthetic disposable local data, no Hosted Dev/Production.

| Layer                | Required acceptance before integration                                                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server fresh         | Replay exact1→83, constraints, trusted owners, forced RLS, role graph/ACL/fixed roots, disabled defaults, no API/service direct access.                                                                                       |
| Server upgrade       | Seed exact82→83; byte-identical old tables/definitions/roles/gates and migration1–82 files. No old business data adoption.                                                                                                    |
| Config/pricing       | Concurrent version CAS; immutable config/price/audit; schedule scope/overlap/supersession and precise multiunit rounding; no FX; unknown/unpriced counters.                                                                   |
| Usage                | Durable START, append-only finals/recovery, exact duplicate vs changed-digest rejection, cumulative/delta streaming, quality/correction projection, failed install/late usage, actual/estimate currency-separated totals.     |
| Quota/kill           | Two concurrent processes cannot exceed configured reservation quota/rate; kill/config change before/during dispatch; no false terminal evidence; closed runtime gate.                                                         |
| Inbound              | Same digest joins across restart/processes; changed digest/client/Account/key rejected; persisted generated review IDs; missing material; response loss/status/version replay; auth expiry/revoke/Trip/package scope recheck. |
| SQLite fresh/upgrade | Fresh1→50, seeded49→50, prior schemas/rows/queue/originals untouched, FK ON/OFF; safe numeric storage types and exact hashes.                                                                                                 |
| Local recovery       | Real file cold reopen; task/attempt CAS, duplicate wake, pass complete with wait, RUNNING→UNKNOWN, queue retention, rollback, exact request/result refs, cancel/late result, dependencies and evidence protection.            |
| Account/Trip         | Actual A→B→A generations, no stale callback apply, fresh A exact resume, Trip/Capture revision/Run generation/Candidate hash/Event base drift rejects.                                                                        |
| Cross-layer          | Task→attempt→call→observations→publication, retries/fallback/shadow, lost START/final ACK, metering failure without unsafe redispatch, inbound review/CP13A UNKNOWN, provider outcome≠canonical success.                      |
| Non-interference     | Ledger/Day/certificate/Event INSERT/UPDATE/DELETE guards, baseline fingerprint goldens, unchanged five C scheduler denials; no second scheduler or runtime wiring.                                                            |

Concurrent server quota enforcement: count reserved calls within explicit UTC fixed
window and minute under integration lock, including reservations not yet dispatched.
Grant quota counts exact reserved submit/review invocations under grant lock; duplicate
same reservation consumes once. STATUS reads do not require free quota for returning
already-owned recovery; rate abuse may return a retryable admission response. No automatic
quota refund from timeout. Conservative reserved-call ceiling is deliberate; actual
billable totals come only from observations. No quota poller/counter scheduler needed.

Recommend **one persistence builder** owning server83 and SQLite50 plus narrow
repository/maintenance/auth inventory changes after Owner Review. A and B supply exact
control-plane/inbound contract adaptation tests, C supplies continuation acceptance;
none independently authors the same migration chain. This avoids duplicated quota,
review identity, role and correlation decisions. Review may split implementation into
bounded internal commits later, but this preflight grants no commit authority.

Recommended sequence after explicit owner approval:

1. Single persistence builder implements the approved server83/SQLite50 closed schema,
   protected functions, repositories, custody interfaces and local acceptance matrix.
2. C completes durable continuation/attempt/recovery integration with existing queue;
   no lifecycle/provider activation. Preserve spike limitations.
3. A adapts typed identity and append-only meter/control-plane; B adapts durable
   reservation/generated selection/result and live-auth interfaces. Keep unwired.
4. Integration consolidates shared types and proves all three paths reach the same
   CP13B closure and CP13A prepare with exact recovery/non-interference.
5. Independent ordinary correctness and scoped ACL/principal review; retain existing
   restricted CP13A security evidence limits, do not claim they were removed.
6. Owner acceptance; only separately authorized commit/push. No commit in preflight.
7. Later separate approval for real adapters, secret resolution, inbound custody/host
   bridge, provider/schema/privacy conformance, device/live tests and activation.

Owner decisions still needed: approve exact schema/migration ownership; retention and
privacy deletion; secret/auth/session resolver and administrator provisioning; inbound
private material custody/device bridge; exact request/result material responsibility;
price supersession and quota counting policy. No implicit authorization for real
providers, self-hosted model inference, customer charging, training or Admin UI.

## 12. Preflight validation performed

- Exact-base worktree began clean; final HEAD remains the requested SHA. Only this
  report, proposed authority-split ADR and byte-identical supplied plan are untracked.
  Tracked diff and staged diff are empty. CURRENT_IMPLEMENTATION_STATE unchanged.
- Server file count/tail and SQLite1–49 registration/source declarations inspected;
  every server migration and local migration source hash matches entry. No 83/50 file
  or registration exists. Runtime gate constraints and five scheduler denials unchanged.
- Frozen canonical/C, A and B status plus all modified/untracked input file hashes
  match entry snapshots. No builder implementation was merged or changed.
- Changed report/ADR Prettier check, relative-link existence and untracked-file
  whitespace checks PASS. Supplied plan is copied byte-for-byte (not reformatted).
- Static internal consistency review covered field types/keys/ownership, append-only
  usage projection, exact inbound replay/generated selection retention, price
  supersession, quota serialization, lock order and no second scheduler.
- No SQL/database replay, application suite, device/live test, Hosted Dev/Production
  access, provider call, commit or push. Future acceptance matrix is not a PASS claim.

## 13. Required answers

YES means specified/reconciled in this design, not implemented or activated.

| Required answer                                      | Result |
| ---------------------------------------------------- | ------ |
| Next-stage plan reconciled                           | YES    |
| Agent A/B/C persistence needs reconciled             | YES    |
| Server persistence required                          | YES    |
| Proposed server migration start                      | 83     |
| SQLite50 required                                    | YES    |
| External integration registry specified              | YES    |
| Intelligence provider config specified               | YES    |
| Price schedules specified                            | YES    |
| Usage/token/cost ledger specified                    | YES    |
| Missing token counts remain UNKNOWN                  | YES    |
| Inbound package idempotency/recovery specified       | YES    |
| Auth/grant boundary specified                        | YES    |
| Continuation schema specified                        | YES    |
| Attempt schema specified                             | YES    |
| Attempt↔usage identity specified                     | YES    |
| Existing sync_operations sole scheduler              | YES    |
| Second scheduler proposed                            | NO     |
| Admin Portal UI included                             | NO     |
| Future Admin Portal data boundary specified          | YES    |
| User billing/charging implemented                    | NO     |
| Raw private evidence stored in usage telemetry       | NO     |
| Personal CXE data automatically becomes Product data | NO     |
| Runtime/provider activation authorized               | NO     |
| Production code changed                              | NO     |
| Migration authored                                   | NO     |
| Hosted Dev/Production accessed                       | NO     |
| Commit                                               | NO     |
| Push                                                 | NO     |

**STOP — READY FOR PERSISTENCE / CONTROL PLANE OWNER REVIEW.**
