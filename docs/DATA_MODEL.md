# OTR Mobile 2.0 Data Model Draft

This is a draft. Do not create migrations until the uncertain fields are confirmed.

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

Purpose: travel ledger entry.

Legacy mapping:

- `ledger_entries`: title, description, category, accounting mode, date range, original/base amount, currency, exchange rate metadata, payer, location, status, created_by.
- Category list: flight, hotel, car, fuel, food, ticket, shopping, transport, insurance, other.
- Accounting mode: `stats_only`, `shared`.

New fields needed:

- Edit history id/version.
- Exclusion reason.
- Settlement inclusion flag.
- Attachment/document ids.
- Local pending mutation state.

Uncertain:

- Household/group split representation.
- Whether exchange rates are trip-wide snapshots, per-expense snapshots, or both.

### Phase 2A Implemented Minimum

The first vertical slice persists a deliberately small local `expenses` record:

- `id`: stable local id.
- `server_id`: nullable remote id, distinct from `id`.
- `trip_id`, `title`, `amount_minor`, and explicit `currency_code`.
- `paid_by_member_id` and `occurred_at`, both nullable until member/trip selection is implemented.
- `created_at`, `updated_at`, `sync_status`, and `sync_version`.

Money is always stored as an integer in minor units. The only Phase 2A entity states are `PENDING_CREATE`, `SYNCING`, `SYNCED`, and `FAILED`. Splits, settlements, rates, and edit history remain outside this migration.

## ExpenseSplit

Purpose: who participates and how much they owe.

Legacy mapping:

- `ledger_entry_participants`: member id, split method, share amount, share percentage, computed base amount.
- Split methods: `equal`, `custom_amount`, `custom_percentage`.

New fields needed:

- Household/group split source.
- Rounding adjustment marker.
- Excluded participants.

Uncertain:

- Whether split records should preserve original currency shares as well as settlement shares.

## Currency

Purpose: normalize original and settlement amounts.

Legacy mapping:

- Currency utilities and fallback rates exist.
- `journey_ledgers` stores base/display currencies and exchange rate snapshot metadata.
- `journey_exchange_rates` stores base, quote, rate, date, source.

New fields needed:

- Offline exchange rate cache.
- Source confidence.
- Manual override flag.

Uncertain:

- Backend authority for rate refresh and historical rate choice.

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
- `created_at`, `updated_at`.

Uncertain:

- Exact conflict policy per entity.
