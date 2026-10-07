# OTR Mobile 2.0 Data Model Draft

## Checkpoint 11 local foundations — integrated, owner review pending

SQLite 47 (`trip_day_read_model`) adds Account/Trip-scoped `trip_day_projections`,
`trip_day_events` and role-keyed `trip_day_boundaries`. A header binds format version,
independent projection generation and exact B-T3I epoch/revision/fingerprint/applied
generation. Only a coherent, fingerprint-matching complete source can install it;
installation repeats source validation and generation CAS. Projection children have
no dependency on mutable canonical mirrors, so historical accepted observations
remain readable offline. Replacement explicitly deletes scoped children, including
when foreign-key cascades are disabled. Event revisions and collection semantics
are unchanged. Temporal facts retain exact strings, precision and endpoint context.

SQLite 48 (`local_capture_inbox`) adds immutable Account-scoped
`local_capture_payloads` BLOBs and `local_capture_inbox` references. Payload identity,
byte count, SHA-256, bytes, Capture kind/original metadata/creation time are immutable;
Trip association and INBOX/ASSIGNED state use independent revision CAS. Binary/TEXT
limits are 10/1 MiB; quotas are 100 MiB unique bytes and 1,000 references per Account,
500 MiB unique bytes per device. Exact-byte dedup is Account-local. Payload/reference
creation, quota decisions and reference-safe deletion are transactional. Assignment
requires cached Account/Trip actor admission; lost admission retains content but
blocks assigned mutation. Capture is not Source or Representation admission and has
no processing/imported state, queue, provider or execution journal.

The CP11 baseline was SQLite 1–48 and 74 server migrations; CP13A.2 adds the
authorized closed foundation below.
Module ADRs and `architecture/TRIP_CHECKPOINT_11_FINAL_INTEGRATION_REPORT.md` contain
the complete local contracts and validation. No UI or runtime activation is implied.

Current cross-currency `RATE_REQUIRED` Expenses with null `economic_date` use
`RESTORE_MISSING_ECONOMIC_DATE_V1`: proven Stage 9 date-only import metadata is
`AUTO_SAFE`; timestamp-only or conflicting evidence requires explicit user
confirmation. Completion advances only the current Expense revision and records
source, rule version, expected revision, date, and digest in its immutable audit.
The earlier `(expense_id, expense_revision, valuation_snapshot_id)` Settlement
input remains frozen. Later automatic `REFERENCE_RATE` valuation is guarded by
the new current revision, not Journey `valuation_policy` metadata.

The cross-module sections remain a working draft. Ledger 2.0 Stage 1 Dev schema
and Stage 2 local SQLite lineage are now implemented; see ADRs 0008 and 0009.

## Common Sync Fields

Every syncable object should consider:

- `id`: local UUID.
- `server_id`: backend id after sync.
- `created_at`.
- `updated_at`.
- `deleted_at`.
- `sync_status`: `SYNCED`, `PENDING_CREATE`, `PENDING_UPDATE`, `PENDING_DELETE`, `CONFLICT`, `FAILED`.
- `sync_version`: backend version or monotonically increasing revision.
- `last_synced_at`.

## Data Health Phase B

SQLite migration 36 adds account-scoped operational metadata only:

- `data_health_state` stores the last cheap/deep/manual scan timestamps, monotonically
  increasing run generation, run state, aggregate outcome, deterministic report digest,
  and aggregate finding/attention counts.
- `data_health_repair_events` reserves the approved append-only repair-evidence shape for
  Phase C. Phase B inserts no repair events because it performs no repair.

Health diagnostics contain safe IDs, categories, counts, and digests only. They do not
persist operation payloads, Money, notes, receipt/OCR content, tokens, provider responses,
or raw server messages. Operational history is not immutable financial evidence; future
retention may remove old `VERIFIED` diagnostics while unresolved/`NEEDS_ATTENTION`
evidence remains available.

Phase C1 activates that existing event shape only for approved queue-metadata repairs.
The operation update and `APPLIED` event share one SQLite transaction; a rescan promotes
the event to `VERIFIED`. Verified history is count-bounded per account while unresolved
events remain retained. No domain payload or user-owned financial fact is copied into a
health event.

## Trip

Purpose: top-level journey container.

Legacy mapping:

- `trips.id` -> `server_id`.
- `name`, `destination`, `start_date`, `end_date`, `cover_image_url`, `created_by`, `created_at`.
- Web also stores photo storage provider/status/root folder.

New fields needed:

- `base_currency`.
- `active_date_override` or local today context may be needed for travel across time zones.
- `last_opened_at` for mobile UX.

Uncertain:

- Whether `Journey` should replace `Trip` in mobile naming internally.

## Member

Purpose: a trip participant, linked or unlinked to a user account.

Legacy mapping:

- `journey_members.id`, `trip_id`, `user_id`, `display_name`, `avatar_url`, `role`, `status`, `notes`, `invite_email`, `linked_at`, `created_at`.
- Roles: `owner`, `group_member`, `guest`.
- Status: `linked`, `unlinked`, `invite_pending`.

New fields needed:

- `household_id` or group split membership.
- Local display ordering.
- Permission capabilities from backend.

Uncertain:

- Whether `guest` maps to traveller mode or is only an identity state.

## ItineraryEvent

Purpose: ordered travel plan item, optimized for Today and next-stop use.

Legacy mapping:

- `itinerary_events.id`, `trip_id`, `trip_day_id`, `reservation_id`, `title`, `description`, `event_type`, `location_name`, `planned_start`, `planned_end`, `booking_reference`, `url`, `order_index`, `source_text`, confidence fields, `needs_review`, `status`, `created_by`, timestamps.

New fields needed:

- Stable local ordering for offline edits.
- Navigation target metadata.
- Attached document ids.
- Visibility/participant rules.
- Time zone and floating-time semantics.

Uncertain:

- Whether reservations remain separate from events or become TravelDocument/Booking records linked to events.

### Phase 2B Implemented Minimum

The second vertical slice stores a Journey-scoped `itinerary_items` record with a local `id`, nullable `server_id`, `trip_id`, required `title` and `scheduled_date`, optional `start_time`, `location`, and `notes`, plus timestamps, `sync_status`, and `sync_version`.

Migration 4 is an idempotent schema repair for development databases that had already recorded the Phase 2B migration id before `itinerary_items` existed. It creates only the missing Phase 2B table and index and preserves all existing data and migration history.

The current local schema intentionally has no ordering, edit history, reservation, map, or transport fields. Queries require a `trip_id`; UI does not receive a cross-Journey list to filter itself.

## Location

Purpose: structured location usable for navigation and route context.

Legacy mapping:

- Itinerary and ledger rows store text location, latitude, longitude, location source.
- Map objects support type/source/visibility metadata.

New fields needed:

- `name`, `address`, `latitude`, `longitude`, `place_id`, `provider`, `navigation_url`.
- Offline geocoding status or unresolved state.

Uncertain:

- Whether Location should be embedded for most objects or normalized into its own table.

## TravelDocument

Purpose: tickets, QR codes, PDFs, booking confirmations, images, and boarding passes.

Legacy mapping:

- Existing Web has media assets and itinerary reservation fields, but no clean mobile ticket/document domain.

New fields needed:

- `trip_id`.
- `itinerary_event_id`.
- `document_type`: ticket, qr, boarding_pass, train_ticket, hotel_confirmation, pdf, image, other.
- `title`, `provider`, `booking_reference`.
- `local_asset_id`.
- `remote_file_id`.
- `offline_available`.
- `valid_from`, `valid_until`.
- `extracted_qr_payload` redacted or encrypted if stored.
- OCR metadata.

Uncertain:

- Security policy for storing QR payloads and full OCR text locally.

## Expense

Purpose: Ledger 2.0 aggregate root for a Journey-scoped financial event.

Legacy mapping:

- `ledger_entries`: title, description, category, accounting mode, date range, original/base amount, currency, exchange rate metadata, payer, location, status, created_by.
- Category list: flight, hotel, car, fuel, food, ticket, shopping, transport, insurance, other.
- Legacy accounting mode: `stats_only`, `shared`; retained only as import
  provenance.

Canonical Ledger 2.0 model:

- `expenses` stores the immutable merchant money identity, Journey, creator,
  payer, revision, lifecycle status, `settlement_participation` (`INCLUDED` or
  `EXCLUDED`), location snapshot, and tombstone. The default is `INCLUDED`.
- `expense_participants` records included Journey members. Exclusion is absence
  from this set.
- `expense_splits` resolves every convenience choice to exact original and
  settlement minor-unit allocations per member.
- `payment_records` stores optional authorization/posted payer cost and fee
  evidence without sensitive card data.
- `exchange_rate_snapshots` and `settlement_valuation_snapshots` preserve rate
  evidence and the independent group valuation accepted for an Expense.
- `expense_links`, `expense_audit_events`, and
  `expense_correction_requests` preserve attachments, history, and
  collaborative correction without silent mutation.
- `households` and `household_members` are Journey-scoped split conveniences;
  persisted Expense splits always resolve to individual Journey members.
- `ledger_changes` is the backend pull cursor source, while
  `ledger_idempotency_keys` records command replay results.

The legacy `ledger_entries` family remains untouched for compatibility. It is
not the Ledger 2.0 write model and will be retired only through a separately
approved migration plan.

### Phase 2A Implemented Minimum

The first vertical slice persists a deliberately small local `expenses` record:

- `id`: stable local id.
- `server_id`: nullable remote id, distinct from `id`.
- `trip_id`, `title`, `amount_minor`, and explicit `currency_code`.
- `paid_by_member_id` and `occurred_at`, both nullable until member/trip selection is implemented.
- `created_at`, `updated_at`, `sync_status`, and `sync_version`.

Money is always stored as an integer in minor units. The Phase 2A table remains
the current Mobile compatibility slice until Stage 2 replaces it with the local
Ledger 2.0 aggregate schema. See `docs/ledger/LEDGER_2_0_DOMAIN_MODEL.md` and
ADR 0008 for the frozen canonical model.

## ExpenseSplit

Purpose: who participates and how much they owe.

Legacy mapping:

- `ledger_entry_participants`: member id, split method, share amount, share percentage, computed base amount.
- Split methods: `equal`, `custom_amount`, `custom_percentage`.

Ledger 2.0 stores both original-currency and settlement-currency minor-unit
shares, the selected method, optional weight or percentage units, and an
explicit rounding adjustment. Deterministic largest-remainder allocation uses
stable member-id ordering for ties.

## Currency

Purpose: normalize original and settlement amounts.

Legacy mapping:

- Currency utilities and fallback rates exist.
- `journey_ledgers` stores base/display currencies and exchange rate snapshot metadata.
- `journey_exchange_rates` stores base, quote, rate, date, source.

Ledger 2.0 separates the mutable provider/cache layer from immutable
per-Expense evidence. Merchant value, payer posted cost, group settlement
valuation, and final repayment conversion are distinct financial truths.

## Settlement

Purpose: immutable, explainable Journey balance snapshot and bilateral payment
workflow.

- `settlements` identifies the through-time, input digest, algorithm version,
  currency, revision, and lifecycle.
- `settlement_inputs` freezes the exact Expense revisions and valuation
  snapshots included, including the `INCLUDED` participation fact.
- `settlement_member_balances` stores each member's paid, owed, transferred,
  and net values.
- `settlement_transfers` stores the deterministic minimized transfer plan.
- `settlement_payments` supports partial repayment in another currency and
  separate payer-reported versus recipient-confirmed states.
- Finalized balances must net exactly to zero, transfer members must belong to
  the Journey, transfer currency must match the Settlement, and confirmed
  payments cannot exceed their obligation.
- `EXCLUDED` Expenses remain authoritative Spending/consumption records but do
  not enter Settlement or Adjustment financial vectors. Preview explains them
  with `EXCLUDED_FROM_SETTLEMENT` rather than treating them as blockers.

### Stage 2 Local SQLite Foundation

Migration 5 adds a separate `ledger_*` local table family rather than changing
the existing Phase 2A `expenses` compatibility table. The local family includes
Journey and member metadata, Households, Expense aggregate/root, participants,
exact splits, active valuation snapshots, payment evidence, audit events,
correction requests, and pull cursors. Every local Ledger aggregate reserves
the local id, nullable server id, local revision, server revision, tombstone,
sync state, and timestamps required by later synchronization.

`LedgerExpenseRepository` is the only Stage 2 writer. It atomically persists an
Expense aggregate, one append-only local audit event, and one generic durable
`sync_operations` command. Stage 2 does not run a real Ledger sync worker yet:
the operations remain pending until Stage 3 introduces authenticated Ledger API
transport and pull/reconciliation.

## Capture

Purpose: unified local-first input intent and parser result.

Legacy mapping:

- Capture intent types include memory, planner update, expense, navigation, assistant.
- Capture2 safe classifier can route questions, navigation, expense, planner, or deferred.
- Prompt/router/action graph concepts are reusable as domain ideas.

New fields needed:

- `input_type`: text, voice, camera, photo, document.
- `raw_text` or redacted source reference.
- `parser_result`.
- `target_type`.
- `target_local_id`.
- `confirmation_status`.
- `sync_operation_id`.

Uncertain:

- Retention policy for raw voice transcript, images, and parser evidence.

## LocalAsset

Purpose: local file/document/photo references independent of upload state.

Legacy mapping:

- Web `MediaAsset` has provider file ids, thumbnail/preview/original paths, mime, dimensions, EXIF, AI/OCR status, duplicate/blur/scene metadata.

New fields needed:

- `local_uri`.
- `asset_kind`.
- `mime_type`.
- `size_bytes`.
- `thumbnail_uri`.
- `preview_uri`.
- `remote_status`.
- `upload_queue_id`.
- `offline_available`.
- `content_hash`.

Uncertain:

- Encryption needs for tickets and QR payloads.

## SyncOperation

Purpose: durable mutation queue item.

New fields needed:

- `id`.
- `operation_type`: create, update, delete, upload, link, unlink.
- `entity_type`.
- `entity_id`.
- `idempotency_key`.
- `base_version`.
- `payload_json`.
- `status`.
- `attempt_count`.
- `next_attempt_at`.
- `last_error_code`.
- `last_error_message`.
- `failure_category` and optional safe request correlation id.
- `last_attempt_at`, `first_failed_at`, and `next_attempt_at`.
- nullable `dependency_operation_id` for causal blocking and wake-up.
- `created_at`, `updated_at`.

Phase A adds `DEPENDENCY_BLOCKED` as a durable non-error operation state. Unknown
failures remain `RETRYABLE`; only allow-listed structured business codes may become
terminal `FAILED`. Long-lived retry uses sparse due times without deleting the entity or
operation.

Uncertain:

- Exact conflict policy per entity.

## Ledger FX reference snapshot cache

Personal Payment FX is stored separately from the user-owned payment. Each
payment has an economic date plus nullable reviewed provenance: `EXPLICIT`,
`LEGACY_DERIVED_UTC`, or unknown. New Mobile writes are explicit. Historical
provenance is assigned only by a reviewed environment manifest and is never
inferred later from date equality. A projection is unique by payment, target currency, and policy,
binds to the source payment revision/input digest, and owns an independent
revision/audit trail. Projection rows are never Settlement inputs.

Migration 32 adds `ledger_fx_reference_snapshots`, a Mobile-only, account-scoped
cache of validated ECB daily EUR anchors. Its composite key is account,
provider, policy version, and reference date. `rates_json` retains exact-decimal
strings; provenance and observation/expiry timestamps travel with every row.
The repository retains the newest 32 working-day rows and returns no data after
an account switch. These rows are informational inputs and are not Ledger
entities, sync operations, user payment claims, or Settlement valuation facts.

## Expense causal metadata (SQLite v40 implemented locally)

ADR 0056 extends existing sync operations with account/Expense intent sequence,
predecessor, observed canonical baseline, typed intent, immutable execution binding
and operation receipt. Canonical baseline revision is aggregate.revision, independent
of feed event revision and local revision. Attempted historical payloads/keys are
preserved. SQLite v40 adds `ledger_expense_commands`,
`ledger_expense_canonical_baselines` and immutable `ledger_expense_operation_receipts`.
Command and receipt rows are retained by maintenance. Historical missing canonical
bases remain unverified. Hosted Phase 3 migration `20260929000100` is deployed to Dev.

Phase 4 SQLite v41 adds `ledger_expense_conflict_chains` keyed by account/Expense,
with authoritative metadata and nullable complete chain cache. Digest changes
invalidate the complete cache; metadata alone cannot close a conflict. Immutable
`ledger_expense_resolution_receipts` binds each account/resolution operation to the
validated server response; maintenance retains those referenced queue operations.
Covered outcomes, original-command receipts, projection and resolution completion
commit together. Uncovered OPEN conflicts and later user intent remain protected.

Phase 5 adds no SQLite tables/version. Optional displayed-rate binding lives in
`ledger_expense_commands.intent_json` and immutable bound request/audit JSON. Existing
operation receipts still own confirmation, and pending acceptance feedback can be
rehydrated without a new UI state table. Hosted forward migration
`20260929000200_latest_state_rate_acceptance.sql` adds a service-only compatibility
helper and narrowly extends the existing transaction admission guard.

Phase 6 adds no SQLite version/table. Hosted migration `20260929000300` adds the
service-only legacy-no-op evidence predicate and narrowly extends guarded equivalent
resolution admission; no incident data backfill. Equal-revision local canonical
metadata accumulates immutable audit IDs and monotonic server timestamps because
an equivalent closure intentionally does not create a new Expense revision.

## Canonical Event local mirror — B-T3F

SQLite migration 44 adds dedicated Account/Trip/Event-scoped
`trip_canonical_events` and `trip_canonical_transport_endpoints`. Every B-T3E
exposed fact has a typed column; endpoints use Account/Trip/Event/role identity.
B semantic revision is independent of A participation revision.
Exact temporal/spatial text and opaque provenance maps round-trip without a Date
conversion or legacy DTO. READ_ONLY/legacy-incompatible markers, read/temporal
versions, semantic_revision and monotonic observation_sequence are separate from
existing itinerary sync_version and all financial/private cursors. No legacy data
is adopted or rewritten. See ADR 0060 and the B-T3F report for the field catalog
and atomic Account-generation reconciliation. Collection completeness remains deferred.

## Trip A1-I2C2 protected participation foundation (CLOSED)

Server migration `20261004000600` adds `trip_person_command_gate` (enforced false)
and immutable `trip_person_participation_receipts`. Actor/key is unique across Trips;
receipts bind exact intent, expected Boolean/revision, observed/result pairs and UTC
commit time. A semantic flip requires matching same-transaction evidence. Receipt
retention has no cascading Person/Trip foreign key. The migration grants no Member
mutation capability and installs no runtime credentials.

SQLite migration 44 is the accepted B-T3F mirror; migration 45 adds
`trip_person_participation_results`, keyed by Account/operation,
with immutable receipt JSON/digest and unique server receipt ID. The existing
`sync_operations` intent/key/status remains the queue boundary; no authoring or
dispatch is enabled. Under the existing Account apply gate, result retention,
monotonic target observation, queue reconciliation and clearing all seven Trip
participation certificate fields share one transaction. Financial and private
payment cursors remain unchanged. A participation result is not a complete roster
snapshot. Full roster certification still requires the
existing central reporting refresh and complete v2 vector.

Evidence: `docs/architecture/TRIP_CANONICAL_A1_I2C2_PROTECTED_PARTICIPATION_COMMAND_REPORT.md`.

## B-T3H server collection observation state

`trip_event_collection_state` has exactly `trip_id` UUID primary/FK, immutable random
`epoch_id` UUID and `collection_revision` bigint 1..9007199254740991. The protected
server-only counter is independent of Event semantic revision and A/finance/Source
cursors. Atomic maintenance covers canonical root membership/read facts, endpoint
facts, accepted Place-cache loss and participant eligibility/row changes; exact
no-ops, legacy-only writes and candidate/timestamp-only changes need no increment.
Overflow rejects the affecting write. Snapshot revision crosses the wire as an
exact positive decimal string. No Event backfill or SQLite migration is added.
See the B-T3G contract and B-T3H report for certification/privacy; accepted B-T3I
Mobile collection application is described below. No delete command or participant adapter is enabled.

## A1-I2C5 participation activation foundation (runtime CLOSED)

Server `20261005000200` retains the singleton participation gate and adds safe-
integer `generation` (initial 0). Gate transitions require the directly authenticated
administrator, READ COMMITTED, the exact exclusive advisory activation fence and
expected-generation CAS; each accepted transition, including same-state, advances
once. OPEN reserves a final generation for CLOSE; exhaustion leaves CLOSED. The
row guard verifies the actual exclusive lock. Missing/invalid state fails closed;
no deployment/restart inserts or opens it.
The unchanged command retains the corresponding shared fence and current owner,
receipt, CAS/ABA and transition-evidence semantics.

The gateway remains NOLOGIN until external reviewed provisioning. It executes only
fixed SET, exact recovery and state discovery; owns no object and has no Member/gate
DML. Private writer gains Member SELECT and UPDATE only participation_active/revision,
with dedicated-session/gate RLS and unchanged evidence guards. Participation=false
never changes TripPerson identity, Account identity, role/status or access.
Generation is an administrative activation fence, independent of participation and
Event revisions. SQLite44/45 and all-seven invalidation/convergence remain unchanged.

A1-I2C5 P2 integrity: activation-critical function properties/owners/normalized
bodies and exact/effective ACLs are fixed reviewed inventory, including indirect
trip_event_keys/canonical JSON/timestamp dependencies. Gate, Member and receipt
owner/RLS/policy/trigger/constraint/column catalogs are pinned; broader policies,
disabled guards or weakened singleton/generation/close-capacity constraints reject
OPEN transactionally. The independent checker root/code pin prevents a replaced
checker or altered inventory payload from silently permitting OPEN. CLOSE retains
its existing fenced CAS path without invoking OPEN-only inventory.

The fixed reviewed activation root is held by immutable parameterless SQL function
trip_person_activation_reviewed_root(), owned by postgres, executable only by trusted
admin/private receipt reader. Its definition hash includes the returned root literal
without normalization exclusions. It sits outside the 24-function/3-table cycle;
OPEN/discovery compare the complete live inventory root directly to it. No mutable
registry or user/runtime root setter exists. Separately reviewed migration/DBA DDL
is the anchor change boundary and must pass the independent external audit/verifier.
Malicious superuser confinement is not claimed; emergency CLOSE skips these checks.

Principal-scope reviewed root now includes conservative application principal
profiles/options and global shared PUBLIC object/ACL inventory. Isolated internal
NOLOGIN roles are omitted only after proving no LOGIN/dangerous flags, recursive
application/SECURITY DEFINER owner path, outgoing membership, A direct grants/table
or column rights/ownership or non-system schema/database CREATE. PUBLIC is a global
ACL union, not an authenticatable role; per-role REVOKE is not a DENY. No role-prefix
or C-name exemption exists. The independent reviewed-root anchor remains outside
normalization. Checkpoint #10 integrates unchanged C00300 with the same reviewed
root; the canonical manifest is generated from two independent clean 74-migration
replays. SQLite remains contiguous 1–46, with 44 B-T3F, 45 A1-I2C2 and 46 B-T3I.

## B-T3I Mobile complete collection persistence (accepted)

SQLite **46** adds three Account/Trip-scoped normalized tables without changing
SQLite 1–45: `trip_canonical_event_collection_generations` stores the latest exact
local refresh generation; `trip_canonical_event_collections` stores the complete
applied certificate (epoch, decimal TEXT revision, collection/read/temporal/hash
versions, count, fingerprint and applied generation); `trip_canonical_event_collection_ids`
stores its durable certified Event-ID membership. Certificate rows always represent
complete applied sets; pagination has no durable partial certificate or cursor.

Both generation columns use BLOB affinity to prevent coercing numeric TEXT/REAL
inputs, with `CHECK(typeof(column)='integer' AND column BETWEEN 1 AND
9007199254740991)` enforcing positive safe INTEGER storage. Normal repository
writes cast only an already validated JS safe-integer owner to SQL INTEGER.
SQLite 46 certificate INSERT/UPDATE triggers require a matching scoped integer
refresh watermark at least as large as the applied generation. Repository reads
also validate both storage classes, safe positive values, exact scope and
`refresh_generation >= applied_generation` before certificate/membership trust,
individual apply or refresh advancement/network. Missing/corrupt watermark fails
with `CANONICAL_EVENT_MIRROR_INTEGRITY`; it is never repaired or treated as bootstrap.

One existing Account-gated repository transaction reconciles all B-T3F aggregates,
replaces certificate/membership, removes only proven scoped canonical mirrors and
checks the resulting full fingerprint. The historical membership fence survives
individual fact updates/restart; `mirrorMatches` is derived, not a freshness promise.
The authorized B-T3I task replaces B-T3G's proposed seven-column/JSON-ID layout with
this normalized membership and durable generation design, and admits a different
incomparable epoch only through a full validated set and current local generation.
No semantic revision orders membership. Server schema/commands remain unchanged.

## C-I3H execution responsibility journal (runtime disabled)

Migration `20261005000300` adds protected staged-resource references and execution
attempt responsibility, independently of C-I3D canonical operation/receipt state.
The exact existing operation/attempt and session principal bind immutable node/key,
run token and optional runtime identity. Claim/takeover uses monotonic CAS fences;
UNKNOWN retains responsibility and blocks release. Terminal observations require
exact trusted evidence. A resource can be released only after all references are
positively terminal with no outstanding responsibility and all associated canonical
operations IO_QUIESCENT/FINAL under locked exact references. Cleanup authorization
is separate from positive node/key cleanup acknowledgement; inventory retains the
resource until the latter. Terminal cleanup takeover advances the owner fence without
changing terminal evidence or reopening execution. No parser/container evidence
authorizes provider retry or canonical finalization. See the C-I3H report for the
protocol, validation status and remaining runtime/host-loss/provider blockers.

## CP13A.2 protected import and transport persistence

SQLite49 `trip_import_flight_admission` is authorized and registered after unchanged
1–48. Eight additive server migrations (`20261005000400`–`20261005001100`) extend
74 to82; no migration is deployed. Exact schema/constraints/ACLs/RLS and function
hashes are recorded in the [security manifest](architecture/TRIP_CHECKPOINT_13A2_SECURITY_MANIFEST.json).

Server C catalogs are Runs, Inputs, Candidates, Confirmations, OutputSlots and
Associations, plus Run predecessors, Candidate lineage, reviewed slot dispositions
and receipt dependencies. They reuse existing Source/manifest/Representation
identity. READY publication is atomic and immutable. Parent Confirmation revisions
own slot CAS; immutable B operation/digest/target bindings survive UNKNOWN and
restart. Successful CREATE claims remain active; only exact verified terminal
no-commit or permanent undispatched revocation releases them. All catalogs are
private with RLS enabled/forced and protected mutation guards.

Event-owned `itinerary_transport_services` stores finite Flight identity with
qualified namespace/issuer, preserved number/literal, attribution and operating
relationship. Root, two endpoints, services and receipt commit atomically under
one Event semantic revision. Existing transports receive no identity backfill;
missing-service adoption remains withheld. Existing collection/certificate fields
and hashes are unchanged; service reads/mirrors are a separate baseline-bound
extension.

SQLite49 mirrors Source3 and C6/lineage4 with registration observations, private
review drafts, immutable receipt cache, explicit Capture→Source durable bindings
and baseline-bound transport service mirrors. Pending timestamps are not server
observations. Original Capture BLOBs and selected local material remain protected
while referenced. FK-OFF repository checks enforce the same Actor/Trip/material
bindings. No passenger, booking, Ledger, participant certificate or Day schema is
added. See the [implementation report](architecture/TRIP_CHECKPOINT_13A2_CANONICAL_FLIGHT_IMPORT_IMPLEMENTATION_REPORT.md).

## CP14 closed persistence

Server83 adds fifteen protected control-plane/recovery tables defined in the
[approved preflight](architecture/CP14_PERSISTENCE_CONTROL_PLANE_PREFLIGHT.md).
All are migration-owner owned with ENABLE/FORCE RLS and no API/service-role
access. Immutable config/prices/audit/usage coexist with CAS/fenced call and
inbound responsibility. Numeric counters remain independently nullable; currency
aggregates never convert FX or represent unknown cost as zero.

SQLite50 adds `intelligence_continuations` and
`intelligence_continuation_attempts`, plus narrow queue uniqueness/retention and
pin guards. Immutable logical/input/policy pins are distinct from concrete
ordered attempts and independent execution/install/meter observations. Event
revision pins have no FK to the mutable Event mirror. No server cost ledger is
copied locally. Historical server1–82/SQLite1–49 bodies remain unchanged.

Server83's existing audit journal also retains content-free REQUEST_BINDING entries
for all non-admin protected commands, including reads. Its safe_diff stores command/root
and request/verifier-scope digests; no new replay table is introduced. Usage corrections lock
one retained call and admit one same-coverage successor, preserving history.
Estimate-to-actual DELTA replacement requires explicit supersession; conflicting
quality without coverage rejects. Distinct admitted disjoint DELTAs still add.
Safe result identifiers have typed grammar and exact retained-parent correlation.
SQLite50 semantics are unchanged by the F1–F6 corrections.

## CP14 A2 immutable outbound pins (closed)

No schema or migration is added. SQLite50 attempt request-material reference and
SHA-256 bind a bounded nonsecret admission envelope: original body digest, exact
provider/config/price snapshot, routing and policy digests, Account/Trip/Import/task,
request/key/call and predecessor/shadow-call lineage. Mutable execution, metering
and installation observations never rewrite those pins. Server83 call+START owns
reservation responsibility and pins the exact price schedule; no local cost/quota
ledger or historical repricing is introduced.

Explicit test-only synthetic observation custody is injected, not installed as a
production table/store. It retains nullable usage/compute and bounded generic units
with unmistakable synthetic evidence labels. Synthetic local C2 RUNNING/TERMINAL/
UNKNOWN observations do not assert real Server83 dispatch: calls remain RESERVED /
NOT_STARTED. Server83 synthetic acceptance is isolated from real billable usage.
Shadow attempts retain globally ordered sequence and independent call identity;
the active attempt budget and active attention exclude shadows. The global 64
attempt ceiling and existing SQLite50 sequence/FK/immutability guards remain.

## CP14 B2 proposal and authenticated decision lifecycle

No schema change: Server83/SQLite50 remain exact. Existing package review_version,
result digest and RUN publication references select a stable minimized proposal.
Its immutable interpretation/closure content is private digest-bound material,
through injected accepted custody/read seams; no new proposal table/journal/store
implementation is installed. That content has no consent or canonical authority.

Only authenticated explicit OTR_USER ACCEPT/REJECT/DEFER creates a row in existing
`inbound_ai_review_decisions`. ACCEPT retains Confirmation/slot/operation/intended
Event IDs and Input identity map before CP13A preparation; nonaccept retains null
IDs and an empty map. Later proposal versions do not rewrite sealed decisions.
Historical exact recovery preserves original identities under current authority.
NEW decision admission repeats CP13B assessment after private custody/authentication,
then checks the same owning Candidate/Run/Input/material and Event revisions inside
its existing local transaction immediately before the protected reservation handoff.
The read-only fence creates no durable authority. Custody prepared for a rejected
stale decision remains non-authoritative content under the existing retention contract;
it implies no consent or persisted IDs and causes no CP13A preparation.
Raw evidence and private proposal bodies are excluded from Server83 telemetry.
Inbound INBOUND_TOOL call/START responsibility has no provider/model attribution,
model units or cost. There is no A2 continuation or booking/Person authority.

CP14 [final cross-path acceptance](architecture/TRIP_CHECKPOINT_14_FINAL_INTEGRATION_REPORT.md)
preserves Server83/SQLite50 and all accepted migration bytes. Separate package/task
namespaces remain independently Account-scoped even when UUIDs/request keys coincide;
proposal/decision, execution/install and synthetic/server usage remain distinct.
No new table, authority, cost ledger or migration is introduced.

## CP15B CLOSED Server84 / unchanged SQLite50

Server84 is `20261007000100_flight_dev_dispatch_foundation.sql`. Historical
Server1–83 sources and every SQLite migration remain unchanged. DEV runtime is
inactive/killed by default; TEST/PRODUCTION cannot store enabled real runtime.

Three protected FORCE-RLS tables extend the existing authority split:
`flight_activation_scopes` stores immutable SECURITY_ADMIN-selected versions;
`flight_activation_account_grants` stores scoped Account expiry/revocation/CAS;
`flight_call_resource_holds` stores one immutable resource reservation per existing
call. Holds pin scope revision/digest, grant revision, Account/provider, UTC
admission day, input/output ceilings, conservative worst-case nanos, currency and
price schedule, and immutable actual execution pins/digest (prompt, envelope/version,
minimizer/version, privacy/profile, policy, adapter, schema, provider config and price).
They are resource admission, not a second cost ledger or customer
billing. Caps are at most 8192 input, 2048 output, 1 concurrent/Account, 20 calls/
Account/day and 100 DEV/provider/day. No live monetary values or activation rows
are seeded. Missing approved monetary policy denies real admission.

The usage journal gains safe nullable `provider_request_id`; historical rows
remain NULL. Existing append-only observations and immutable rational schedules
retain server usage/cost authority, including nullable quantities and quality.
Input cache slices are disjoint for costing; reasoning is included in output;
ambiguous/unsupported/missing pricing remains UNKNOWN rather than double counted.
Immutable schedule intervals can represent provider currency and time-dependent
prices; no FX or repricing is introduced.

SQLite50's generic descriptor JSON admits a truthful remote v2 descriptor.
Immutable request custody and independent response custody/execution/usage axes,
together with the existing publication UUID/digest and Source Run extractor-options
digest, preserve the Run→attempt/config/evidence/call association on cold reopen.
Original evidence retains exact UTF-8 locators. No Run column, SQLite51, scheduler,
participant/booking table or canonical authority is added.

CP15B F1–F4 corrections stay within uncommitted Server84 and existing SQLite50.
No SQLite schema change is required for current disclosure authorization. Retained
historical response/usage bytes remain stored when current owning authorization
fails. Schedule-derived cost quality is ESTIMATED independently of actual token
quality; unresolved price/time applicability is UNKNOWN. Late admitted billing
observations supersede estimates under existing journal replay/projection semantics.

## CP15B-LIVE-W private content custody (no schema change)

All Server1–84 and SQLite1–50 bytes remain unchanged. The accepted private custody
interface now has an immutable Backend filesystem implementation: bounded bytes,
Account/reference SHA/size checks, private owner/mode, exclusive atomic installation,
file fsync and directory fsync before acknowledgement. Request/result associations
bind existing task/attempt/call/request/config identities. Raw provider bytes have
separate bounded private content/reference/hash and exact envelope/execution pins.
No raw evidence or credential enters control-plane telemetry.

An immutable private acceptance association binds one session to one Account/task/
attempt/call/request. It only narrows host admission; Server84 call/START/hold/mark
remains the dispatch authority. No counter, cost ledger, Event authority, schema or
scheduler is introduced. Release is CLOSED. Missing/corrupt custody fails closed;
UNKNOWN responsibility is never garbage-collected or used to reopen the session.
The persistent private host mount is an unprovisioned LIVE-1 requirement.
