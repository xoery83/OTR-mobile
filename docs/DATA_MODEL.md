# OTR Mobile 2.0 Data Model Draft

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
