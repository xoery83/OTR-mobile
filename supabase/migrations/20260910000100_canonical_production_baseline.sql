-- OTR canonical production-shape baseline.
-- Generated from the read-only production metadata audit dated 2026-09-10.
-- Contains schema and synthetic-free bucket declarations only; no production rows.
-- Do not apply this baseline to the legacy production project.

create extension if not exists pgcrypto with schema extensions;

create type "public"."location_resolution_status" as enum ('none', 'pending', 'resolving', 'resolved', 'ambiguous', 'failed', 'manual');

create table public."ai_cost_events" (
  "id" uuid default gen_random_uuid() not null,
  "ai_job_id" uuid,
  "ai_job_attempt_id" uuid,
  "journey_id" uuid,
  "user_id" uuid,
  "worker" text not null,
  "task" text not null,
  "provider" text not null,
  "model" text not null,
  "input_tokens" integer default 0 not null,
  "output_tokens" integer default 0 not null,
  "cost_estimate" numeric(12,6) default 0 not null,
  "currency" text default 'USD'::text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."ai_job_attempts" (
  "id" uuid default gen_random_uuid() not null,
  "ai_job_id" uuid,
  "attempt_number" integer default 1 not null,
  "provider" text,
  "model" text,
  "status" text default 'processing'::text not null,
  "input_tokens" integer default 0 not null,
  "output_tokens" integer default 0 not null,
  "cost_estimate" numeric(12,6) default 0 not null,
  "currency" text default 'USD'::text not null,
  "error_message" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "started_at" timestamp with time zone default now() not null,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);

create table public."ai_jobs" (
  "id" uuid default gen_random_uuid() not null,
  "background_job_id" uuid,
  "journey_id" uuid,
  "user_id" uuid,
  "worker" text not null,
  "task" text not null,
  "status" text default 'queued'::text not null,
  "priority" integer default 100 not null,
  "prompt_key" text,
  "prompt_version" text,
  "provider" text,
  "model" text,
  "input_tokens" integer default 0 not null,
  "output_tokens" integer default 0 not null,
  "cost_estimate" numeric(12,6) default 0 not null,
  "currency" text default 'USD'::text not null,
  "payload" jsonb default '{}'::jsonb not null,
  "result" jsonb default '{}'::jsonb not null,
  "error_message" text,
  "retry_count" integer default 0 not null,
  "max_retries" integer default 2 not null,
  "available_at" timestamp with time zone default now() not null,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."background_activity_dismissals" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "activity_key" text not null,
  "job_id" uuid,
  "batch_id" uuid,
  "status" text not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."background_job_batches" (
  "id" uuid default gen_random_uuid() not null,
  "journey_id" uuid,
  "user_id" uuid,
  "batch_type" text not null,
  "title" text not null,
  "total_items" integer default 0 not null,
  "completed_items" integer default 0 not null,
  "failed_items" integer default 0 not null,
  "status" text default 'queued'::text not null,
  "current_step" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."background_jobs" (
  "id" uuid default gen_random_uuid() not null,
  "batch_id" uuid,
  "journey_id" uuid,
  "user_id" uuid,
  "job_type" text not null,
  "title" text not null,
  "status" text default 'queued'::text not null,
  "progress" integer default 0 not null,
  "current_step" text,
  "payload" jsonb default '{}'::jsonb not null,
  "result" jsonb default '{}'::jsonb not null,
  "error_message" text,
  "attempts" integer default 0 not null,
  "available_at" timestamp with time zone default now() not null,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."capture_intent_rules" (
  "id" uuid default gen_random_uuid() not null,
  "intent_key" text not null,
  "display_name" text not null,
  "description" text,
  "enabled" boolean default true not null,
  "confidence_threshold" numeric(5,2) default 0.80 not null,
  "auto_execute" boolean default false not null,
  "requires_confirmation" boolean default true not null,
  "sort_order" integer default 0 not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."capture_prompt_templates" (
  "id" uuid default gen_random_uuid() not null,
  "template_key" text not null,
  "display_name" text not null,
  "prompt" text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."capture_routing_config" (
  "id" text default 'default'::text not null,
  "enable_local_parser" boolean default true not null,
  "enable_local_intent_engine" boolean default true not null,
  "enable_llm_router" boolean default true not null,
  "local_confidence_threshold" numeric(5,2) default 0.82 not null,
  "complexity_threshold" numeric(5,2) default 0.55 not null,
  "force_all_requests_to_llm" boolean default false not null,
  "force_local_only" boolean default false not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."capture2_media_uploads" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "trip_id" uuid not null,
  "source" text default 'capture2'::text not null,
  "media_kind" text not null,
  "original_filename" text not null,
  "mime_type" text not null,
  "size_bytes" bigint not null,
  "duration_seconds" double precision,
  "processing_status" text default 'upload_token_created'::text not null,
  "processing_error" text,
  "retry_count" integer default 0 not null,
  "last_attempt_at" timestamp with time zone,
  "staging_provider" text default 'vercel_blob'::text not null,
  "staging_object_key" text not null,
  "staging_url" text,
  "staging_uploaded_at" timestamp with time zone,
  "staging_expires_at" timestamp with time zone not null,
  "staging_deleted_at" timestamp with time zone,
  "final_media_asset_id" uuid,
  "final_memory_id" uuid,
  "final_provider" text,
  "final_url" text,
  "final_size_bytes" bigint,
  "google_drive_file_id" text,
  "google_drive_web_url" text,
  "thumbnail_url" text,
  "preview_url" text,
  "metadata_json" jsonb default '{}'::jsonb not null,
  "captured_at" timestamp with time zone,
  "trip_day_id" uuid,
  "parent_memory_id" uuid,
  "itinerary_event_id" uuid,
  "itinerary_reservation_id" uuid,
  "background_job_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."content_translations" (
  "id" uuid default gen_random_uuid() not null,
  "source_type" text not null,
  "source_id" text not null,
  "source_field" text not null,
  "source_lang" text not null,
  "target_lang" text not null,
  "source_hash" text not null,
  "translated_text" text not null,
  "engine" text default 'libretranslate'::text not null,
  "status" text default 'machine'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."daily_reports" (
  "id" uuid default gen_random_uuid() not null,
  "trip_id" uuid,
  "report_date" date not null,
  "title" text,
  "summary" text,
  "highlights" jsonb default '[]'::jsonb,
  "created_at" timestamp with time zone default now()
);

create table public."i18n_locale_bundles" (
  "id" uuid default gen_random_uuid() not null,
  "language_code" text not null,
  "namespace" text default 'common'::text not null,
  "base_version" text not null,
  "translations_json" jsonb default '{}'::jsonb not null,
  "status" text default 'machine'::text not null,
  "engine" text default 'libretranslate'::text not null,
  "created_by" text default 'auto'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "source_locale" text default 'en'::text not null,
  "generated_by" text default 'llm'::text not null,
  "provider" text,
  "model" text,
  "prompt_version" text,
  "missing_keys_count" integer default 0 not null,
  "token_estimate" integer,
  "cost_estimate_usd" numeric,
  "error_message" text,
  "published_at" timestamp with time zone
);

create table public."image_index_records" (
  "id" uuid default gen_random_uuid() not null,
  "media_asset_id" uuid not null,
  "journey_id" uuid not null,
  "day_id" uuid,
  "status" text default 'pending'::text not null,
  "caption" text,
  "scene" text,
  "objects" jsonb default '[]'::jsonb not null,
  "people" jsonb default '[]'::jsonb not null,
  "ocr_text" text,
  "embedding" real[],
  "quality_score" numeric,
  "duplicate_hash" text,
  "image_hash" text,
  "blur_score" numeric,
  "brightness_score" numeric,
  "dominant_colors" jsonb default '[]'::jsonb not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "needs_llm_review" boolean default false not null,
  "llm_review_reason" text,
  "model_used" text,
  "model_version" text,
  "cost_estimate" numeric,
  "error_message" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."itinerary_event_participants" (
  "id" uuid default gen_random_uuid() not null,
  "event_id" uuid,
  "user_id" uuid,
  "participation_status" text default 'planned'::text,
  "created_at" timestamp with time zone default now(),
  "journey_member_id" uuid
);

create table public."itinerary_events" (
  "id" uuid default gen_random_uuid() not null,
  "trip_id" uuid not null,
  "title" text not null,
  "description" text,
  "event_type" text default 'activity'::text not null,
  "location_name" text,
  "planned_start" timestamp with time zone,
  "planned_end" timestamp with time zone,
  "booking_reference" text,
  "url" text,
  "order_index" integer default 0,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "source_text" text,
  "confidence" numeric,
  "needs_review" boolean default false not null,
  "trip_day_id" uuid,
  "reservation_id" uuid,
  "is_estimated_time" boolean default false not null,
  "date_confidence" numeric,
  "time_confidence" numeric,
  "participants_confidence" numeric,
  "location_confidence" numeric,
  "status" text default 'planned'::text not null,
  "location_text" text,
  "location_lat" double precision,
  "location_lng" double precision,
  "location_status" location_resolution_status default 'none'::location_resolution_status not null,
  "place_id" uuid,
  "location_provider" text,
  "location_provider_place_id" text,
  "geocoded_at" timestamp with time zone,
  "geocode_error" text,
  "geocode_attempts" integer default 0 not null,
  "manual_location" boolean default false not null
);

create table public."itinerary_item_ratings" (
  "id" uuid default gen_random_uuid() not null,
  "trip_id" uuid not null,
  "item_type" text not null,
  "item_id" uuid not null,
  "user_id" uuid not null,
  "rating" numeric(2,1) not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."itinerary_reservation_participants" (
  "id" uuid default gen_random_uuid() not null,
  "reservation_id" uuid not null,
  "user_id" uuid,
  "participation_status" text default 'planned'::text,
  "created_at" timestamp with time zone default now(),
  "journey_member_id" uuid
);

create table public."itinerary_reservations" (
  "id" uuid default gen_random_uuid() not null,
  "trip_id" uuid not null,
  "trip_day_id" uuid,
  "reservation_type" text default 'other'::text not null,
  "title" text not null,
  "provider" text,
  "location_name" text,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "confirmation_code" text,
  "url" text,
  "source_text" text,
  "confidence" numeric,
  "needs_review" boolean default false not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "status" text default 'planned'::text not null,
  "location_text" text,
  "location_lat" double precision,
  "location_lng" double precision,
  "location_status" location_resolution_status default 'none'::location_resolution_status not null,
  "location_confidence" numeric,
  "place_id" uuid,
  "location_provider" text,
  "location_provider_place_id" text,
  "geocoded_at" timestamp with time zone,
  "geocode_error" text,
  "geocode_attempts" integer default 0 not null,
  "manual_location" boolean default false not null
);

create table public."journey_capture_events" (
  "id" uuid default gen_random_uuid() not null,
  "journey_id" uuid not null,
  "user_id" uuid,
  "input_type" text not null,
  "original_input" text,
  "transcription_text" text,
  "captured_at" timestamp with time zone default now() not null,
  "timezone" text,
  "gps" jsonb,
  "metadata" jsonb default '{}'::jsonb not null,
  "intent" text,
  "confidence" numeric,
  "generated_actions" jsonb default '[]'::jsonb not null,
  "referenced_photo_ids" jsonb default '[]'::jsonb not null,
  "referenced_video_ids" jsonb default '[]'::jsonb not null,
  "referenced_expense_ids" jsonb default '[]'::jsonb not null,
  "referenced_planner_item_ids" jsonb default '[]'::jsonb not null,
  "status" text default 'raw'::text not null,
  "error_message" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."journey_chat_messages" (
  "id" uuid default gen_random_uuid() not null,
  "trip_id" uuid not null,
  "user_id" uuid,
  "journey_member_id" uuid,
  "message_type" text not null,
  "text_content" text,
  "media_asset_id" uuid,
  "memory_entry_id" uuid,
  "media_url" text,
  "voice_duration_ms" integer,
  "transcript_text" text,
  "transcript_status" text,
  "source_type" text default 'chat'::text not null,
  "source_id" uuid,
  "deleted_at" timestamp with time zone,
  "deleted_by" uuid,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."journey_chat_read_states" (
  "trip_id" uuid not null,
  "user_id" uuid not null,
  "last_read_at" timestamp with time zone default to_timestamp((0)::double precision) not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."journey_exchange_rates" (
  "id" uuid default gen_random_uuid() not null,
  "journey_id" uuid not null,
  "base_currency" text not null,
  "quote_currency" text not null,
  "rate_to_base" numeric(18,8) not null,
  "rate_date" date default CURRENT_DATE not null,
  "source" text default 'snapshot'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."journey_invites" (
  "id" uuid default gen_random_uuid() not null,
  "trip_id" uuid not null,
  "token" text not null,
  "invited_email" text,
  "role" text default 'member'::text not null,
  "created_by" uuid,
  "expires_at" timestamp with time zone,
  "max_uses" integer default 20,
  "used_count" integer default 0,
  "is_active" boolean default true,
  "created_at" timestamp with time zone default now()
);

create table public."journey_ledgers" (
  "id" uuid default gen_random_uuid() not null,
  "journey_id" uuid not null,
  "base_currency" text default 'NZD'::text not null,
  "display_currency" text default 'NZD'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "exchange_rates_snapshot_date" date default CURRENT_DATE not null,
  "exchange_rates_snapshot_source" text default 'default_at_creation'::text not null,
  "exchange_rates_refreshed_at" timestamp with time zone,
  "exchange_rates_refreshed_by" uuid,
  "exchange_rates_refresh_count" integer default 0 not null
);

create table public."journey_live_locations" (
  "journey_id" uuid not null,
  "user_id" uuid not null,
  "latitude" double precision,
  "longitude" double precision,
  "accuracy" double precision,
  "recorded_at" timestamp with time zone,
  "is_live_enabled" boolean default false not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."journey_map_objects" (
  "id" uuid default gen_random_uuid() not null,
  "journey_id" uuid not null,
  "type" text not null,
  "source_type" text,
  "source_id" uuid,
  "title" text not null,
  "description" text,
  "latitude" double precision,
  "longitude" double precision,
  "accuracy" double precision,
  "timestamp" timestamp with time zone,
  "owner_user_id" uuid,
  "visibility" text default 'journey'::text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "location_text" text,
  "location_status" location_resolution_status default 'none'::location_resolution_status not null,
  "location_confidence" numeric,
  "place_id" uuid,
  "location_provider" text,
  "location_provider_place_id" text,
  "geocoded_at" timestamp with time zone,
  "geocode_error" text,
  "geocode_attempts" integer default 0 not null,
  "manual_location" boolean default false not null
);

create table public."journey_member_face_embeddings" (
  "id" uuid default gen_random_uuid() not null,
  "trip_id" uuid not null,
  "journey_member_id" uuid not null,
  "media_asset_id" uuid,
  "face_id" uuid,
  "embedding" real[] not null,
  "quality_score" numeric,
  "source" text default 'photo'::text not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "model_name" text,
  "embedding_version" text
);

create table public."journey_members" (
  "id" uuid default gen_random_uuid() not null,
  "trip_id" uuid not null,
  "user_id" uuid,
  "display_name" text not null,
  "avatar_url" text,
  "role" text default 'group_member'::text not null,
  "status" text default 'unlinked'::text not null,
  "notes" text,
  "invite_email" text,
  "invite_code" text,
  "invited_by_user_id" uuid,
  "linked_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."journey_removed_users" (
  "id" uuid default gen_random_uuid() not null,
  "trip_id" uuid not null,
  "user_id" uuid not null,
  "removed_by_user_id" uuid,
  "reason" text,
  "removed_at" timestamp with time zone default now() not null
);

create table public."journey_storage_connections" (
  "id" uuid default gen_random_uuid() not null,
  "trip_id" uuid not null,
  "provider" text not null,
  "account_label" text,
  "provider_account_id" text,
  "provider_root_folder_id" text,
  "journey_folder_id" text,
  "status" text default 'connected'::text not null,
  "token_reference" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "connected_by" uuid,
  "connected_at" timestamp with time zone default now() not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."ledger_entries" (
  "id" uuid default gen_random_uuid() not null,
  "journey_id" uuid not null,
  "itinerary_event_id" uuid,
  "itinerary_reservation_id" uuid,
  "memory_entry_id" uuid,
  "title" text not null,
  "description" text,
  "category" text default 'other'::text not null,
  "accounting_mode" text default 'shared'::text not null,
  "expense_date" date default CURRENT_DATE not null,
  "start_date" date,
  "end_date" date,
  "original_amount" numeric(12,2) not null,
  "original_currency" text not null,
  "base_amount" numeric(12,2) not null,
  "base_currency" text not null,
  "exchange_rate" numeric(18,8) default 1 not null,
  "exchange_rate_date" date,
  "exchange_rate_source" text,
  "payer_member_id" uuid,
  "address_text" text,
  "latitude" numeric(10,7),
  "longitude" numeric(10,7),
  "location_source" text,
  "status" text default 'complete'::text not null,
  "created_by_member_id" uuid,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "location_text" text,
  "location_lat" double precision,
  "location_lng" double precision,
  "location_status" location_resolution_status default 'none'::location_resolution_status not null,
  "location_confidence" numeric,
  "place_id" uuid,
  "location_provider" text,
  "location_provider_place_id" text,
  "geocoded_at" timestamp with time zone,
  "geocode_error" text,
  "geocode_attempts" integer default 0 not null,
  "manual_location" boolean default false not null
);

create table public."ledger_entry_participants" (
  "id" uuid default gen_random_uuid() not null,
  "ledger_entry_id" uuid not null,
  "member_id" uuid not null,
  "split_method" text default 'equal'::text not null,
  "share_amount" numeric(12,2),
  "share_percentage" numeric(7,4),
  "computed_share_base_amount" numeric(12,2),
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."ledger_exchange_rates" (
  "id" uuid default gen_random_uuid() not null,
  "from_currency" text not null,
  "to_currency" text not null,
  "rate" numeric(18,8) not null,
  "rate_date" date not null,
  "source" text default 'manual'::text not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."ledger_settlements" (
  "id" uuid default gen_random_uuid() not null,
  "journey_id" uuid not null,
  "from_member_id" uuid not null,
  "to_member_id" uuid not null,
  "amount" numeric(12,2) not null,
  "currency" text not null,
  "status" text default 'suggested'::text not null,
  "notes" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."media_asset_variants" (
  "id" uuid default gen_random_uuid() not null,
  "media_asset_id" uuid not null,
  "variant_type" text not null,
  "storage_provider" text default 'hetzner_disk'::text not null,
  "relative_path" text not null,
  "mime_type" text default 'image/webp'::text not null,
  "width" integer,
  "height" integer,
  "file_size" bigint default 0 not null,
  "generated_at" timestamp with time zone default now() not null,
  "last_accessed_at" timestamp with time zone default now() not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."media_assets" (
  "id" uuid default gen_random_uuid() not null,
  "trip_id" uuid,
  "user_id" uuid,
  "memory_entry_id" uuid,
  "asset_type" text not null,
  "storage_bucket" text default 'trip-media'::text not null,
  "original_file_path" text,
  "compressed_file_path" text,
  "thumbnail_file_path" text,
  "original_file_size" bigint,
  "compressed_file_size" bigint,
  "mime_type" text,
  "width" integer,
  "height" integer,
  "storage_tier" text default 'standard'::text not null,
  "is_original_preserved" boolean default false not null,
  "retention_until" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "storage_provider" text default 'supabase_legacy'::text not null,
  "provider_file_id" text,
  "provider_drive_id" text,
  "provider_web_url" text,
  "provider_thumbnail_url" text,
  "provider_original_reference" text,
  "taken_at" timestamp with time zone,
  "gps_latitude" double precision,
  "gps_longitude" double precision,
  "camera_model" text,
  "orientation" text,
  "exif_json" jsonb default '{}'::jsonb not null,
  "ai_status" text default 'pending'::text not null,
  "ai_metadata" jsonb default '{}'::jsonb not null,
  "ocr_text" text,
  "duplicate_score" numeric,
  "blur_score" numeric,
  "scene_tags" text[] default '{}'::text[] not null,
  "indexed_at" timestamp with time zone,
  "location_text" text,
  "location_lat" double precision,
  "location_lng" double precision,
  "location_status" location_resolution_status default 'none'::location_resolution_status not null,
  "location_confidence" numeric,
  "place_id" uuid,
  "location_provider" text,
  "location_provider_place_id" text,
  "geocoded_at" timestamp with time zone,
  "geocode_error" text,
  "geocode_attempts" integer default 0 not null,
  "manual_location" boolean default false not null,
  "original_drive_file_id" text,
  "original_drive_web_url" text,
  "thumbnail_drive_file_id" text,
  "thumbnail_drive_web_url" text,
  "thumbnail_width" integer,
  "thumbnail_height" integer,
  "thumbnail_size" bigint,
  "processing_status" text default 'pending'::text not null,
  "legacy_supabase_path" text,
  "legacy_thumbnail_path" text,
  "thumbnail_url" text,
  "preview_url" text,
  "thumbnail_generated_at" timestamp with time zone,
  "preview_generated_at" timestamp with time zone
);

create table public."memory_entries" (
  "id" uuid default gen_random_uuid() not null,
  "trip_id" uuid,
  "user_id" uuid default auth.uid(),
  "type" text not null,
  "content" text,
  "media_url" text,
  "captured_at" timestamp with time zone default now(),
  "created_at" timestamp with time zone default now(),
  "location_name" text,
  "itinerary_event_id" uuid,
  "trip_day_id" uuid,
  "itinerary_reservation_id" uuid,
  "location_text" text,
  "location_lat" double precision,
  "location_lng" double precision,
  "location_status" location_resolution_status default 'none'::location_resolution_status not null,
  "location_confidence" numeric,
  "place_id" uuid,
  "location_provider" text,
  "location_provider_place_id" text,
  "geocoded_at" timestamp with time zone,
  "geocode_error" text,
  "geocode_attempts" integer default 0 not null,
  "manual_location" boolean default false not null
);

create table public."memory_favorites" (
  "id" uuid default gen_random_uuid() not null,
  "memory_entry_id" uuid not null,
  "user_id" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."memory_likes" (
  "id" uuid default gen_random_uuid() not null,
  "memory_entry_id" uuid not null,
  "user_id" uuid not null,
  "like_count" integer default 1 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."memory_shot_artifact_assets" (
  "id" uuid default gen_random_uuid() not null,
  "artifact_id" uuid not null,
  "asset_type" text not null,
  "asset_id" text not null,
  "role" text,
  "sort_order" integer default 0 not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."memory_shot_artifacts" (
  "id" uuid default gen_random_uuid() not null,
  "memory_shot_id" uuid not null,
  "artifact_type" text not null,
  "variant" text not null,
  "status" text default 'pending'::text not null,
  "title" text,
  "preview_url" text,
  "thumbnail_url" text,
  "public_url" text,
  "storage" jsonb default '{}'::jsonb not null,
  "manifest" jsonb default '{}'::jsonb not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "render_error" text,
  "render_warning" text,
  "rendered_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."memory_shot_assets" (
  "id" uuid default gen_random_uuid() not null,
  "memory_shot_id" uuid not null,
  "journey_id" uuid not null,
  "asset_type" text not null,
  "source_id" text not null,
  "role" text,
  "sort_order" integer default 0 not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."memory_shot_favorites" (
  "id" uuid default gen_random_uuid() not null,
  "memory_shot_id" uuid not null,
  "user_id" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."memory_shot_likes" (
  "id" uuid default gen_random_uuid() not null,
  "memory_shot_id" uuid not null,
  "user_id" uuid not null,
  "like_count" integer default 1 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."memory_shot_reads" (
  "id" uuid default gen_random_uuid() not null,
  "memory_shot_id" uuid not null,
  "journey_id" uuid not null,
  "user_id" uuid not null,
  "read_at" timestamp with time zone default now() not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."memory_shot_recommendations" (
  "id" uuid default gen_random_uuid() not null,
  "journey_id" uuid not null,
  "user_id" uuid,
  "template_id" uuid,
  "recommendation_key" text not null,
  "title" text not null,
  "reason" text,
  "score" numeric(6,4) default 0 not null,
  "status" text default 'active'::text not null,
  "payload" jsonb default '{}'::jsonb not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."memory_shot_snapshots" (
  "id" uuid default gen_random_uuid() not null,
  "memory_shot_id" uuid not null,
  "journey_id" uuid not null,
  "snapshot" jsonb not null,
  "source_summary" jsonb default '{}'::jsonb not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."memory_shot_templates" (
  "id" uuid default gen_random_uuid() not null,
  "key" text not null,
  "title" text not null,
  "description" text,
  "worker" text default 'memory_shot_worker'::text not null,
  "task" text not null,
  "status" text default 'active'::text not null,
  "default_visibility" text default 'journey_members'::text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."memory_shots" (
  "id" uuid default gen_random_uuid() not null,
  "journey_id" uuid not null,
  "template_id" uuid,
  "author_user_id" uuid,
  "title" text,
  "subtitle" text,
  "language" text default 'en'::text not null,
  "status" text default 'draft'::text not null,
  "visibility" text default 'journey_members'::text not null,
  "cover_url" text,
  "preview_url" text,
  "drive_file_id" text,
  "error_message" text,
  "content" jsonb default '{}'::jsonb not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "generated_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "render_status" text default 'not_started'::text not null,
  "render_error" text,
  "rendered_at" timestamp with time zone,
  "original_drive_file_id" text,
  "original_drive_url" text,
  "thumbnail_url" text,
  "original_storage_provider" text,
  "original_storage_path" text,
  "preview_storage_provider" text,
  "preview_storage_path" text,
  "thumbnail_storage_provider" text,
  "thumbnail_storage_path" text,
  "render_warning" text
);

create table public."motion_story_shares" (
  "id" uuid default gen_random_uuid() not null,
  "token" text not null,
  "artifact_id" uuid not null,
  "memory_shot_id" uuid not null,
  "journey_id" uuid not null,
  "created_by" uuid,
  "title" text,
  "description" text,
  "thumbnail_url" text,
  "expires_at" timestamp with time zone not null,
  "revoked_at" timestamp with time zone,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."parser_aliases" (
  "id" uuid default gen_random_uuid() not null,
  "journey_id" uuid,
  "alias_text" text not null,
  "canonical_type" text not null,
  "canonical_id" text,
  "canonical_value" text not null,
  "scope" text default 'journey'::text not null,
  "status" text default 'enabled'::text not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null
);

create table public."parser_corrections" (
  "id" uuid default gen_random_uuid() not null,
  "journey_id" uuid,
  "source" text not null,
  "original_text" text not null,
  "wrong_parse_result" jsonb,
  "corrected_parse_result" jsonb,
  "error_types" text[] default '{}'::text[] not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null
);

create table public."parser_examples" (
  "id" uuid default gen_random_uuid() not null,
  "journey_id" uuid,
  "source" text not null,
  "original_text" text not null,
  "normalized_text" text not null,
  "corrected_parse_result" jsonb not null,
  "language" text,
  "embedding" jsonb,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "usage_count" integer default 0 not null
);

create table public."parser_parse_logs" (
  "id" uuid default gen_random_uuid() not null,
  "journey_id" uuid,
  "source" text not null,
  "original_text" text not null,
  "parse_result" jsonb,
  "parse_method" text not null,
  "matched_rule_id" uuid,
  "confidence" numeric(5,2),
  "user_accepted" boolean,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null
);

create table public."parser_rules" (
  "id" uuid default gen_random_uuid() not null,
  "journey_id" uuid,
  "scope" text default 'journey'::text not null,
  "source" text not null,
  "intent" text,
  "pattern_type" text default 'keyword'::text not null,
  "pattern" text not null,
  "slot_mapping" jsonb default '{}'::jsonb not null,
  "priority" integer default 100 not null,
  "confidence" numeric(5,2) default 0.80 not null,
  "status" text default 'pending'::text not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "last_used_at" timestamp with time zone,
  "success_count" integer default 0 not null,
  "failure_count" integer default 0 not null
);

create table public."photo_faces" (
  "id" uuid default gen_random_uuid() not null,
  "media_asset_id" uuid not null,
  "trip_id" uuid not null,
  "journey_member_id" uuid,
  "bounding_box" jsonb default '{}'::jsonb not null,
  "embedding" real[],
  "confidence" numeric,
  "quality_score" numeric,
  "recognition_status" text default 'unknown'::text not null,
  "recognized_name" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "model_name" text,
  "embedding_version" text
);

create table public."places" (
  "id" uuid default gen_random_uuid() not null,
  "normalized_name" text not null,
  "display_name" text,
  "formatted_address" text,
  "city" text,
  "region" text,
  "country" text,
  "lat" double precision,
  "lng" double precision,
  "provider" text,
  "provider_place_id" text,
  "confidence" numeric,
  "source" text,
  "raw_query" text,
  "raw_response" jsonb,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "last_verified_at" timestamp with time zone
);

create table public."profiles" (
  "id" uuid not null,
  "display_name" text not null,
  "avatar_url" text,
  "created_at" timestamp with time zone default now(),
  "global_aka" text,
  "global_base_currency" text default 'NZD'::text not null,
  "account_role" text default 'free_user'::text not null,
  "preferred_language" text default 'auto'::text not null
);

create table public."prompt_template_versions" (
  "id" uuid default gen_random_uuid() not null,
  "template_id" uuid not null,
  "language" text default 'en'::text not null,
  "environment" text default 'production'::text not null,
  "version" text not null,
  "status" text default 'draft'::text not null,
  "prompt_body" text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."prompt_templates" (
  "id" uuid default gen_random_uuid() not null,
  "key" text not null,
  "worker" text not null,
  "task" text not null,
  "description" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."trip_days" (
  "id" uuid default gen_random_uuid() not null,
  "trip_id" uuid not null,
  "day_date" date not null,
  "title" text,
  "notes" text,
  "order_index" integer default 0,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."trip_members" (
  "id" uuid default gen_random_uuid() not null,
  "trip_id" uuid,
  "user_id" uuid,
  "role" text default 'member'::text,
  "created_at" timestamp with time zone default now()
);

create table public."trips" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "destination" text,
  "start_date" date,
  "end_date" date,
  "cover_image_url" text,
  "created_by" uuid default auth.uid(),
  "created_at" timestamp with time zone default now(),
  "photo_storage_provider" text,
  "photo_storage_status" text default 'not_connected'::text not null,
  "photo_storage_root_folder_id" text
);

alter table public."ai_cost_events" add constraint "ai_cost_events_pkey" PRIMARY KEY (id);
alter table public."ai_job_attempts" add constraint "ai_job_attempts_status_check" CHECK (status = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text]));
alter table public."ai_job_attempts" add constraint "ai_job_attempts_pkey" PRIMARY KEY (id);
alter table public."ai_jobs" add constraint "ai_jobs_status_check" CHECK (status = ANY (ARRAY['queued'::text, 'processing'::text, 'waiting_for_user'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]));
alter table public."ai_jobs" add constraint "ai_jobs_pkey" PRIMARY KEY (id);
alter table public."background_activity_dismissals" add constraint "background_activity_dismissals_check" CHECK (job_id IS NOT NULL AND batch_id IS NULL OR job_id IS NULL AND batch_id IS NOT NULL);
alter table public."background_activity_dismissals" add constraint "background_activity_dismissals_status_check" CHECK (status = ANY (ARRAY['queued'::text, 'uploading'::text, 'processing'::text, 'waiting_for_user'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]));
alter table public."background_activity_dismissals" add constraint "background_activity_dismissals_pkey" PRIMARY KEY (id);
alter table public."background_job_batches" add constraint "background_job_batches_status_check" CHECK (status = ANY (ARRAY['queued'::text, 'uploading'::text, 'processing'::text, 'waiting_for_user'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]));
alter table public."background_job_batches" add constraint "background_job_batches_pkey" PRIMARY KEY (id);
alter table public."background_jobs" add constraint "background_jobs_progress_check" CHECK (progress >= 0 AND progress <= 100);
alter table public."background_jobs" add constraint "background_jobs_status_check" CHECK (status = ANY (ARRAY['queued'::text, 'uploading'::text, 'processing'::text, 'waiting_for_user'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]));
alter table public."background_jobs" add constraint "background_jobs_pkey" PRIMARY KEY (id);
alter table public."capture2_media_uploads" add constraint "capture2_media_uploads_media_kind_check" CHECK (media_kind = ANY (ARRAY['image'::text, 'video'::text, 'audio'::text, 'document'::text]));
alter table public."capture2_media_uploads" add constraint "capture2_media_uploads_processing_status_check" CHECK (processing_status = ANY (ARRAY['upload_token_created'::text, 'uploaded_to_staging'::text, 'processing'::text, 'final_storage_done'::text, 'cleanup_pending'::text, 'ready'::text, 'failed'::text, 'cancelled'::text]));
alter table public."capture2_media_uploads" add constraint "capture2_media_uploads_retry_count_check" CHECK (retry_count >= 0);
alter table public."capture2_media_uploads" add constraint "capture2_media_uploads_size_bytes_check" CHECK (size_bytes >= 0);
alter table public."capture2_media_uploads" add constraint "capture2_media_uploads_source_check" CHECK (source = ANY (ARRAY['capture2'::text, 'journey_album'::text, 'memory'::text, 'planner'::text]));
alter table public."capture2_media_uploads" add constraint "capture2_media_uploads_pkey" PRIMARY KEY (id);
alter table public."capture_intent_rules" add constraint "capture_intent_rules_pkey" PRIMARY KEY (id);
alter table public."capture_intent_rules" add constraint "capture_intent_rules_intent_key_key" UNIQUE (intent_key);
alter table public."capture_prompt_templates" add constraint "capture_prompt_templates_pkey" PRIMARY KEY (id);
alter table public."capture_prompt_templates" add constraint "capture_prompt_templates_template_key_key" UNIQUE (template_key);
alter table public."capture_routing_config" add constraint "capture_routing_config_pkey" PRIMARY KEY (id);
alter table public."content_translations" add constraint "content_translations_status_check" CHECK (status = ANY (ARRAY['machine'::text, 'reviewed'::text]));
alter table public."content_translations" add constraint "content_translations_pkey" PRIMARY KEY (id);
alter table public."content_translations" add constraint "content_translations_source_type_source_id_source_field_tar_key" UNIQUE (source_type, source_id, source_field, target_lang, source_hash);
alter table public."daily_reports" add constraint "daily_reports_pkey" PRIMARY KEY (id);
alter table public."daily_reports" add constraint "daily_reports_trip_id_report_date_key" UNIQUE (trip_id, report_date);
alter table public."i18n_locale_bundles" add constraint "i18n_locale_bundles_created_by_check" CHECK (created_by = ANY (ARRAY['auto'::text, 'admin'::text]));
alter table public."i18n_locale_bundles" add constraint "i18n_locale_bundles_status_check" CHECK (status = ANY (ARRAY['machine'::text, 'reviewed'::text]));
alter table public."i18n_locale_bundles" add constraint "i18n_locale_bundles_pkey" PRIMARY KEY (id);
alter table public."i18n_locale_bundles" add constraint "i18n_locale_bundles_language_code_namespace_base_version_key" UNIQUE (language_code, namespace, base_version);
alter table public."image_index_records" add constraint "image_index_records_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'indexed_local'::text, 'needs_llm'::text, 'indexed_llm'::text, 'failed'::text]));
alter table public."image_index_records" add constraint "image_index_records_pkey" PRIMARY KEY (id);
alter table public."image_index_records" add constraint "image_index_records_media_asset_id_key" UNIQUE (media_asset_id);
alter table public."itinerary_event_participants" add constraint "itinerary_event_participants_participation_status_check" CHECK (participation_status = ANY (ARRAY['planned'::text, 'confirmed'::text, 'optional'::text, 'not_going'::text]));
alter table public."itinerary_event_participants" add constraint "itinerary_event_participants_pkey" PRIMARY KEY (id);
alter table public."itinerary_event_participants" add constraint "itinerary_event_participants_event_id_user_id_key" UNIQUE (event_id, user_id);
alter table public."itinerary_events" add constraint "itinerary_events_event_type_check" CHECK (event_type = ANY (ARRAY['flight'::text, 'hotel'::text, 'car'::text, 'activity'::text, 'shopping'::text, 'meal'::text, 'transport'::text, 'note'::text, 'other'::text]));
alter table public."itinerary_events" add constraint "itinerary_events_status_check" CHECK (status = ANY (ARRAY['planned'::text, 'cancelled'::text, 'completed'::text, 'skipped'::text]));
alter table public."itinerary_events" add constraint "itinerary_events_pkey" PRIMARY KEY (id);
alter table public."itinerary_item_ratings" add constraint "itinerary_item_ratings_item_type_check" CHECK (item_type = ANY (ARRAY['event'::text, 'reservation'::text]));
alter table public."itinerary_item_ratings" add constraint "itinerary_item_ratings_rating_check" CHECK (rating >= 0::numeric AND rating <= 5::numeric);
alter table public."itinerary_item_ratings" add constraint "itinerary_item_ratings_pkey" PRIMARY KEY (id);
alter table public."itinerary_item_ratings" add constraint "itinerary_item_ratings_item_type_item_id_user_id_key" UNIQUE (item_type, item_id, user_id);
alter table public."itinerary_reservation_participants" add constraint "itinerary_reservation_participants_participation_status_check" CHECK (participation_status = ANY (ARRAY['planned'::text, 'confirmed'::text, 'optional'::text, 'not_going'::text]));
alter table public."itinerary_reservation_participants" add constraint "itinerary_reservation_participants_pkey" PRIMARY KEY (id);
alter table public."itinerary_reservation_participants" add constraint "itinerary_reservation_participants_reservation_id_user_id_key" UNIQUE (reservation_id, user_id);
alter table public."itinerary_reservations" add constraint "itinerary_reservations_reservation_type_check" CHECK (reservation_type = ANY (ARRAY['flight'::text, 'train'::text, 'hotel'::text, 'car'::text, 'ferry'::text, 'tour'::text, 'restaurant'::text, 'other'::text]));
alter table public."itinerary_reservations" add constraint "itinerary_reservations_status_check" CHECK (status = ANY (ARRAY['planned'::text, 'cancelled'::text, 'completed'::text, 'skipped'::text]));
alter table public."itinerary_reservations" add constraint "itinerary_reservations_pkey" PRIMARY KEY (id);
alter table public."journey_capture_events" add constraint "journey_capture_events_input_type_check" CHECK (input_type = ANY (ARRAY['text'::text, 'voice'::text, 'photo'::text, 'video'::text, 'attachment'::text]));
alter table public."journey_capture_events" add constraint "journey_capture_events_status_check" CHECK (status = ANY (ARRAY['raw'::text, 'processed'::text, 'needs_review'::text, 'failed'::text]));
alter table public."journey_capture_events" add constraint "journey_capture_events_pkey" PRIMARY KEY (id);
alter table public."journey_chat_messages" add constraint "journey_chat_messages_message_type_check" CHECK (message_type = ANY (ARRAY['text'::text, 'image'::text, 'voice'::text, 'system'::text, 'file'::text]));
alter table public."journey_chat_messages" add constraint "journey_chat_messages_source_type_check" CHECK (source_type = ANY (ARRAY['chat'::text, 'timeline_memory'::text, 'system'::text]));
alter table public."journey_chat_messages" add constraint "journey_chat_messages_transcript_status_check" CHECK (transcript_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]));
alter table public."journey_chat_messages" add constraint "journey_chat_messages_pkey" PRIMARY KEY (id);
alter table public."journey_chat_read_states" add constraint "journey_chat_read_states_pkey" PRIMARY KEY (trip_id, user_id);
alter table public."journey_exchange_rates" add constraint "journey_exchange_rates_rate_to_base_check" CHECK (rate_to_base > 0::numeric);
alter table public."journey_exchange_rates" add constraint "journey_exchange_rates_pkey" PRIMARY KEY (id);
alter table public."journey_exchange_rates" add constraint "journey_exchange_rates_journey_id_base_currency_quote_curre_key" UNIQUE (journey_id, base_currency, quote_currency);
alter table public."journey_invites" add constraint "journey_invites_role_check" CHECK (role = ANY (ARRAY['member'::text, 'admin'::text]));
alter table public."journey_invites" add constraint "journey_invites_pkey" PRIMARY KEY (id);
alter table public."journey_invites" add constraint "journey_invites_token_key" UNIQUE (token);
alter table public."journey_ledgers" add constraint "journey_ledgers_pkey" PRIMARY KEY (id);
alter table public."journey_ledgers" add constraint "journey_ledgers_journey_id_key" UNIQUE (journey_id);
alter table public."journey_live_locations" add constraint "journey_live_locations_pkey" PRIMARY KEY (journey_id, user_id);
alter table public."journey_map_objects" add constraint "journey_map_objects_type_check" CHECK (type = ANY (ARRAY['live_location'::text, 'memory'::text, 'booking'::text, 'plan_item'::text, 'hotel'::text, 'restaurant'::text, 'parking'::text, 'fuel'::text, 'toilet'::text, 'airport'::text, 'trailhead'::text, 'poi'::text, 'route_point'::text, 'emergency'::text]));
alter table public."journey_map_objects" add constraint "journey_map_objects_visibility_check" CHECK (visibility = ANY (ARRAY['private'::text, 'journey'::text, 'public'::text]));
alter table public."journey_map_objects" add constraint "journey_map_objects_pkey" PRIMARY KEY (id);
alter table public."journey_member_face_embeddings" add constraint "journey_member_face_embeddings_512" CHECK (array_length(embedding, 1) = 512);
alter table public."journey_member_face_embeddings" add constraint "journey_member_face_embeddings_source_check" CHECK (source = ANY (ARRAY['manual_seed'::text, 'photo'::text, 'confirmed_match'::text]));
alter table public."journey_member_face_embeddings" add constraint "journey_member_face_embeddings_pkey" PRIMARY KEY (id);
alter table public."journey_members" add constraint "journey_members_role_check" CHECK (role = ANY (ARRAY['owner'::text, 'group_member'::text, 'guest'::text]));
alter table public."journey_members" add constraint "journey_members_status_check" CHECK (status = ANY (ARRAY['linked'::text, 'unlinked'::text, 'invite_pending'::text]));
alter table public."journey_members" add constraint "journey_members_pkey" PRIMARY KEY (id);
alter table public."journey_members" add constraint "journey_members_invite_code_key" UNIQUE (invite_code);
alter table public."journey_members" add constraint "journey_members_trip_id_user_id_key" UNIQUE (trip_id, user_id);
alter table public."journey_removed_users" add constraint "journey_removed_users_pkey" PRIMARY KEY (id);
alter table public."journey_removed_users" add constraint "journey_removed_users_trip_id_user_id_key" UNIQUE (trip_id, user_id);
alter table public."journey_storage_connections" add constraint "journey_storage_connections_provider_check" CHECK (provider = ANY (ARRAY['google_drive'::text, 'onedrive'::text]));
alter table public."journey_storage_connections" add constraint "journey_storage_connections_status_check" CHECK (status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'error'::text]));
alter table public."journey_storage_connections" add constraint "journey_storage_connections_pkey" PRIMARY KEY (id);
alter table public."journey_storage_connections" add constraint "journey_storage_connections_trip_id_provider_key" UNIQUE (trip_id, provider);
alter table public."ledger_entries" add constraint "ledger_entries_accounting_mode_check" CHECK (accounting_mode = ANY (ARRAY['stats_only'::text, 'shared'::text]));
alter table public."ledger_entries" add constraint "ledger_entries_base_amount_check" CHECK (base_amount >= 0::numeric);
alter table public."ledger_entries" add constraint "ledger_entries_category_check" CHECK (category = ANY (ARRAY['flight'::text, 'hotel'::text, 'car'::text, 'fuel'::text, 'food'::text, 'ticket'::text, 'shopping'::text, 'transport'::text, 'insurance'::text, 'other'::text]));
alter table public."ledger_entries" add constraint "ledger_entries_exchange_rate_check" CHECK (exchange_rate > 0::numeric);
alter table public."ledger_entries" add constraint "ledger_entries_original_amount_check" CHECK (original_amount >= 0::numeric);
alter table public."ledger_entries" add constraint "ledger_entries_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'complete'::text, 'needs_review'::text]));
alter table public."ledger_entries" add constraint "ledger_entries_pkey" PRIMARY KEY (id);
alter table public."ledger_entry_participants" add constraint "ledger_entry_participants_split_method_check" CHECK (split_method = ANY (ARRAY['equal'::text, 'custom_amount'::text, 'custom_percentage'::text]));
alter table public."ledger_entry_participants" add constraint "ledger_entry_participants_pkey" PRIMARY KEY (id);
alter table public."ledger_entry_participants" add constraint "ledger_entry_participants_ledger_entry_id_member_id_key" UNIQUE (ledger_entry_id, member_id);
alter table public."ledger_exchange_rates" add constraint "ledger_exchange_rates_rate_check" CHECK (rate > 0::numeric);
alter table public."ledger_exchange_rates" add constraint "ledger_exchange_rates_pkey" PRIMARY KEY (id);
alter table public."ledger_exchange_rates" add constraint "ledger_exchange_rates_from_currency_to_currency_rate_date_s_key" UNIQUE (from_currency, to_currency, rate_date, source);
alter table public."ledger_settlements" add constraint "ledger_settlements_amount_check" CHECK (amount >= 0::numeric);
alter table public."ledger_settlements" add constraint "ledger_settlements_status_check" CHECK (status = ANY (ARRAY['suggested'::text, 'confirmed'::text, 'paid'::text]));
alter table public."ledger_settlements" add constraint "ledger_settlements_pkey" PRIMARY KEY (id);
alter table public."media_asset_variants" add constraint "media_asset_variants_storage_provider_check" CHECK (storage_provider = 'hetzner_disk'::text);
alter table public."media_asset_variants" add constraint "media_asset_variants_variant_type_check" CHECK (variant_type = ANY (ARRAY['thumbnail'::text, 'preview'::text]));
alter table public."media_asset_variants" add constraint "media_asset_variants_pkey" PRIMARY KEY (id);
alter table public."media_asset_variants" add constraint "media_asset_variants_media_asset_id_variant_type_key" UNIQUE (media_asset_id, variant_type);
alter table public."media_assets" add constraint "media_assets_ai_status_check" CHECK (ai_status = ANY (ARRAY['pending'::text, 'processing'::text, 'indexed'::text, 'failed'::text, 'skipped'::text]));
alter table public."media_assets" add constraint "media_assets_asset_type_check" CHECK (asset_type = ANY (ARRAY['image'::text, 'video'::text, 'audio'::text, 'document'::text]));
alter table public."media_assets" add constraint "media_assets_processing_status_check" CHECK (processing_status = ANY (ARRAY['pending'::text, 'processing'::text, 'ready'::text, 'failed'::text, 'legacy'::text]));
alter table public."media_assets" add constraint "media_assets_storage_provider_check" CHECK (storage_provider = ANY (ARRAY['supabase_legacy'::text, 'google_drive'::text, 'onedrive'::text]));
alter table public."media_assets" add constraint "media_assets_storage_tier_check" CHECK (storage_tier = ANY (ARRAY['standard'::text, 'pro_original'::text]));
alter table public."media_assets" add constraint "media_assets_pkey" PRIMARY KEY (id);
alter table public."memory_entries" add constraint "memory_entries_type_check" CHECK (type = ANY (ARRAY['text'::text, 'photo'::text, 'voice'::text, 'location'::text, 'attachment'::text]));
alter table public."memory_entries" add constraint "memory_entries_pkey" PRIMARY KEY (id);
alter table public."memory_favorites" add constraint "memory_favorites_pkey" PRIMARY KEY (id);
alter table public."memory_favorites" add constraint "memory_favorites_memory_entry_id_user_id_key" UNIQUE (memory_entry_id, user_id);
alter table public."memory_likes" add constraint "memory_likes_like_count_check" CHECK (like_count >= 1 AND like_count <= 5);
alter table public."memory_likes" add constraint "memory_likes_pkey" PRIMARY KEY (id);
alter table public."memory_likes" add constraint "memory_likes_memory_entry_id_user_id_key" UNIQUE (memory_entry_id, user_id);
alter table public."memory_shot_artifact_assets" add constraint "memory_shot_artifact_assets_asset_type_check" CHECK (asset_type = ANY (ARRAY['photo'::text, 'message'::text, 'expense'::text, 'location'::text, 'route'::text, 'person'::text, 'planner_item'::text, 'memory'::text]));
alter table public."memory_shot_artifact_assets" add constraint "memory_shot_artifact_assets_pkey" PRIMARY KEY (id);
alter table public."memory_shot_artifacts" add constraint "memory_shot_artifacts_artifact_type_check" CHECK (artifact_type = ANY (ARRAY['poster'::text, 'motion_story'::text]));
alter table public."memory_shot_artifacts" add constraint "memory_shot_artifacts_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'rendering'::text, 'ready'::text, 'failed'::text, 'archived'::text]));
alter table public."memory_shot_artifacts" add constraint "memory_shot_artifacts_variant_check" CHECK (variant = ANY (ARRAY['single_poster'::text, 'long_poster'::text, 'grid_9'::text, 'scroll_story'::text, 'immersive_scroll_story'::text]));
alter table public."memory_shot_artifacts" add constraint "memory_shot_artifacts_variant_type_check" CHECK (artifact_type = 'poster'::text AND (variant = ANY (ARRAY['single_poster'::text, 'long_poster'::text, 'grid_9'::text])) OR artifact_type = 'motion_story'::text AND (variant = ANY (ARRAY['scroll_story'::text, 'immersive_scroll_story'::text])));
alter table public."memory_shot_artifacts" add constraint "memory_shot_artifacts_pkey" PRIMARY KEY (id);
alter table public."memory_shot_assets" add constraint "memory_shot_assets_asset_type_check" CHECK (asset_type = ANY (ARRAY['photo'::text, 'message'::text, 'expense'::text, 'location'::text, 'route'::text, 'person'::text, 'planner_item'::text, 'memory'::text]));
alter table public."memory_shot_assets" add constraint "memory_shot_assets_pkey" PRIMARY KEY (id);
alter table public."memory_shot_favorites" add constraint "memory_shot_favorites_pkey" PRIMARY KEY (id);
alter table public."memory_shot_favorites" add constraint "memory_shot_favorites_memory_shot_id_user_id_key" UNIQUE (memory_shot_id, user_id);
alter table public."memory_shot_likes" add constraint "memory_shot_likes_like_count_check" CHECK (like_count >= 1 AND like_count <= 5);
alter table public."memory_shot_likes" add constraint "memory_shot_likes_pkey" PRIMARY KEY (id);
alter table public."memory_shot_likes" add constraint "memory_shot_likes_memory_shot_id_user_id_key" UNIQUE (memory_shot_id, user_id);
alter table public."memory_shot_reads" add constraint "memory_shot_reads_pkey" PRIMARY KEY (id);
alter table public."memory_shot_reads" add constraint "memory_shot_reads_memory_shot_id_user_id_key" UNIQUE (memory_shot_id, user_id);
alter table public."memory_shot_recommendations" add constraint "memory_shot_recommendations_status_check" CHECK (status = ANY (ARRAY['active'::text, 'dismissed'::text, 'accepted'::text, 'expired'::text]));
alter table public."memory_shot_recommendations" add constraint "memory_shot_recommendations_pkey" PRIMARY KEY (id);
alter table public."memory_shot_snapshots" add constraint "memory_shot_snapshots_pkey" PRIMARY KEY (id);
alter table public."memory_shot_snapshots" add constraint "memory_shot_snapshots_memory_shot_id_key" UNIQUE (memory_shot_id);
alter table public."memory_shot_templates" add constraint "memory_shot_templates_default_visibility_check" CHECK (default_visibility = ANY (ARRAY['private'::text, 'journey_members'::text, 'public_unlisted'::text, 'public_discover'::text]));
alter table public."memory_shot_templates" add constraint "memory_shot_templates_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]));
alter table public."memory_shot_templates" add constraint "memory_shot_templates_pkey" PRIMARY KEY (id);
alter table public."memory_shot_templates" add constraint "memory_shot_templates_key_key" UNIQUE (key);
alter table public."memory_shots" add constraint "memory_shots_render_status_check" CHECK (render_status = ANY (ARRAY['not_started'::text, 'rendering'::text, 'ready'::text, 'failed'::text]));
alter table public."memory_shots" add constraint "memory_shots_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'generating'::text, 'ready'::text, 'failed'::text, 'archived'::text]));
alter table public."memory_shots" add constraint "memory_shots_visibility_check" CHECK (visibility = ANY (ARRAY['private'::text, 'journey_members'::text, 'public_unlisted'::text, 'public_discover'::text]));
alter table public."memory_shots" add constraint "memory_shots_pkey" PRIMARY KEY (id);
alter table public."motion_story_shares" add constraint "motion_story_shares_pkey" PRIMARY KEY (id);
alter table public."motion_story_shares" add constraint "motion_story_shares_token_key" UNIQUE (token);
alter table public."parser_aliases" add constraint "parser_aliases_canonical_type_check" CHECK (canonical_type = ANY (ARRAY['person'::text, 'place'::text, 'currency'::text, 'payment_method'::text, 'split_method'::text, 'plan_type'::text]));
alter table public."parser_aliases" add constraint "parser_aliases_scope_check" CHECK (scope = ANY (ARRAY['journey'::text, 'global'::text]));
alter table public."parser_aliases" add constraint "parser_aliases_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'enabled'::text, 'disabled'::text]));
alter table public."parser_aliases" add constraint "parser_aliases_pkey" PRIMARY KEY (id);
alter table public."parser_corrections" add constraint "parser_corrections_pkey" PRIMARY KEY (id);
alter table public."parser_examples" add constraint "parser_examples_pkey" PRIMARY KEY (id);
alter table public."parser_parse_logs" add constraint "parser_parse_logs_parse_method_check" CHECK (parse_method = ANY (ARRAY['rule'::text, 'example'::text, 'alias'::text, 'llm'::text, 'correction'::text, 'local'::text]));
alter table public."parser_parse_logs" add constraint "parser_parse_logs_pkey" PRIMARY KEY (id);
alter table public."parser_rules" add constraint "parser_rules_pattern_type_check" CHECK (pattern_type = ANY (ARRAY['keyword'::text, 'regex'::text, 'semantic_template'::text, 'llm_generated'::text]));
alter table public."parser_rules" add constraint "parser_rules_scope_check" CHECK (scope = ANY (ARRAY['journey'::text, 'global'::text]));
alter table public."parser_rules" add constraint "parser_rules_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'enabled'::text, 'disabled'::text]));
alter table public."parser_rules" add constraint "parser_rules_pkey" PRIMARY KEY (id);
alter table public."photo_faces" add constraint "photo_faces_embedding_512" CHECK (embedding IS NULL OR array_length(embedding, 1) = 512);
alter table public."photo_faces" add constraint "photo_faces_recognition_status_check" CHECK (recognition_status = ANY (ARRAY['unknown'::text, 'recognized'::text, 'confirmed'::text, 'rejected'::text]));
alter table public."photo_faces" add constraint "photo_faces_pkey" PRIMARY KEY (id);
alter table public."places" add constraint "places_pkey" PRIMARY KEY (id);
alter table public."profiles" add constraint "profiles_account_role_check" CHECK (account_role = ANY (ARRAY['admin'::text, 'free_user'::text, 'plus'::text, 'pro'::text]));
alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);
alter table public."prompt_template_versions" add constraint "prompt_template_versions_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]));
alter table public."prompt_template_versions" add constraint "prompt_template_versions_pkey" PRIMARY KEY (id);
alter table public."prompt_template_versions" add constraint "prompt_template_versions_template_id_language_environment_v_key" UNIQUE (template_id, language, environment, version);
alter table public."prompt_templates" add constraint "prompt_templates_pkey" PRIMARY KEY (id);
alter table public."prompt_templates" add constraint "prompt_templates_key_key" UNIQUE (key);
alter table public."trip_days" add constraint "trip_days_pkey" PRIMARY KEY (id);
alter table public."trip_days" add constraint "trip_days_trip_id_day_date_key" UNIQUE (trip_id, day_date);
alter table public."trip_members" add constraint "trip_members_role_check" CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]));
alter table public."trip_members" add constraint "trip_members_pkey" PRIMARY KEY (id);
alter table public."trip_members" add constraint "trip_members_trip_id_user_id_key" UNIQUE (trip_id, user_id);
alter table public."trips" add constraint "trips_photo_storage_provider_check" CHECK (photo_storage_provider = ANY (ARRAY['google_drive'::text, 'onedrive'::text, 'supabase_legacy'::text]));
alter table public."trips" add constraint "trips_photo_storage_status_check" CHECK (photo_storage_status = ANY (ARRAY['not_connected'::text, 'connected'::text, 'disconnected'::text, 'error'::text]));
alter table public."trips" add constraint "trips_pkey" PRIMARY KEY (id);
alter table public."ai_cost_events" add constraint "ai_cost_events_ai_job_attempt_id_fkey" FOREIGN KEY (ai_job_attempt_id) REFERENCES ai_job_attempts(id) ON DELETE SET NULL;
alter table public."ai_cost_events" add constraint "ai_cost_events_ai_job_id_fkey" FOREIGN KEY (ai_job_id) REFERENCES ai_jobs(id) ON DELETE SET NULL;
alter table public."ai_cost_events" add constraint "ai_cost_events_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."ai_cost_events" add constraint "ai_cost_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."ai_job_attempts" add constraint "ai_job_attempts_ai_job_id_fkey" FOREIGN KEY (ai_job_id) REFERENCES ai_jobs(id) ON DELETE CASCADE;
alter table public."ai_jobs" add constraint "ai_jobs_background_job_id_fkey" FOREIGN KEY (background_job_id) REFERENCES background_jobs(id) ON DELETE SET NULL;
alter table public."ai_jobs" add constraint "ai_jobs_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."ai_jobs" add constraint "ai_jobs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."background_activity_dismissals" add constraint "background_activity_dismissals_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES background_job_batches(id) ON DELETE CASCADE;
alter table public."background_activity_dismissals" add constraint "background_activity_dismissals_job_id_fkey" FOREIGN KEY (job_id) REFERENCES background_jobs(id) ON DELETE CASCADE;
alter table public."background_activity_dismissals" add constraint "background_activity_dismissals_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."background_job_batches" add constraint "background_job_batches_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."background_job_batches" add constraint "background_job_batches_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."background_jobs" add constraint "background_jobs_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES background_job_batches(id) ON DELETE SET NULL;
alter table public."background_jobs" add constraint "background_jobs_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."background_jobs" add constraint "background_jobs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."capture2_media_uploads" add constraint "capture2_media_uploads_background_job_id_fkey" FOREIGN KEY (background_job_id) REFERENCES background_jobs(id) ON DELETE SET NULL;
alter table public."capture2_media_uploads" add constraint "capture2_media_uploads_final_media_asset_id_fkey" FOREIGN KEY (final_media_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL;
alter table public."capture2_media_uploads" add constraint "capture2_media_uploads_final_memory_id_fkey" FOREIGN KEY (final_memory_id) REFERENCES memory_entries(id) ON DELETE SET NULL;
alter table public."capture2_media_uploads" add constraint "capture2_media_uploads_itinerary_event_id_fkey" FOREIGN KEY (itinerary_event_id) REFERENCES itinerary_events(id) ON DELETE SET NULL;
alter table public."capture2_media_uploads" add constraint "capture2_media_uploads_itinerary_reservation_id_fkey" FOREIGN KEY (itinerary_reservation_id) REFERENCES itinerary_reservations(id) ON DELETE SET NULL;
alter table public."capture2_media_uploads" add constraint "capture2_media_uploads_parent_memory_id_fkey" FOREIGN KEY (parent_memory_id) REFERENCES memory_entries(id) ON DELETE SET NULL;
alter table public."capture2_media_uploads" add constraint "capture2_media_uploads_trip_day_id_fkey" FOREIGN KEY (trip_day_id) REFERENCES trip_days(id) ON DELETE SET NULL;
alter table public."capture2_media_uploads" add constraint "capture2_media_uploads_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."capture2_media_uploads" add constraint "capture2_media_uploads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."daily_reports" add constraint "daily_reports_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."image_index_records" add constraint "image_index_records_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."image_index_records" add constraint "image_index_records_media_asset_id_fkey" FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE CASCADE;
alter table public."itinerary_event_participants" add constraint "itinerary_event_participants_event_id_fkey" FOREIGN KEY (event_id) REFERENCES itinerary_events(id) ON DELETE CASCADE;
alter table public."itinerary_event_participants" add constraint "itinerary_event_participants_journey_member_id_fkey" FOREIGN KEY (journey_member_id) REFERENCES journey_members(id) ON DELETE CASCADE;
alter table public."itinerary_event_participants" add constraint "itinerary_event_participants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."itinerary_events" add constraint "itinerary_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."itinerary_events" add constraint "itinerary_events_place_id_fkey" FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE SET NULL;
alter table public."itinerary_events" add constraint "itinerary_events_reservation_id_fkey" FOREIGN KEY (reservation_id) REFERENCES itinerary_reservations(id) ON DELETE SET NULL;
alter table public."itinerary_events" add constraint "itinerary_events_trip_day_id_fkey" FOREIGN KEY (trip_day_id) REFERENCES trip_days(id) ON DELETE SET NULL;
alter table public."itinerary_events" add constraint "itinerary_events_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."itinerary_item_ratings" add constraint "itinerary_item_ratings_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."itinerary_item_ratings" add constraint "itinerary_item_ratings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."itinerary_reservation_participants" add constraint "itinerary_reservation_participants_journey_member_id_fkey" FOREIGN KEY (journey_member_id) REFERENCES journey_members(id) ON DELETE CASCADE;
alter table public."itinerary_reservation_participants" add constraint "itinerary_reservation_participants_reservation_id_fkey" FOREIGN KEY (reservation_id) REFERENCES itinerary_reservations(id) ON DELETE CASCADE;
alter table public."itinerary_reservation_participants" add constraint "itinerary_reservation_participants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."itinerary_reservations" add constraint "itinerary_reservations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."itinerary_reservations" add constraint "itinerary_reservations_place_id_fkey" FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE SET NULL;
alter table public."itinerary_reservations" add constraint "itinerary_reservations_trip_day_id_fkey" FOREIGN KEY (trip_day_id) REFERENCES trip_days(id) ON DELETE SET NULL;
alter table public."itinerary_reservations" add constraint "itinerary_reservations_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."journey_capture_events" add constraint "journey_capture_events_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."journey_capture_events" add constraint "journey_capture_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."journey_chat_messages" add constraint "journey_chat_messages_deleted_by_fkey" FOREIGN KEY (deleted_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."journey_chat_messages" add constraint "journey_chat_messages_journey_member_id_fkey" FOREIGN KEY (journey_member_id) REFERENCES journey_members(id) ON DELETE SET NULL;
alter table public."journey_chat_messages" add constraint "journey_chat_messages_media_asset_id_fkey" FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL;
alter table public."journey_chat_messages" add constraint "journey_chat_messages_memory_entry_id_fkey" FOREIGN KEY (memory_entry_id) REFERENCES memory_entries(id) ON DELETE SET NULL;
alter table public."journey_chat_messages" add constraint "journey_chat_messages_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."journey_chat_messages" add constraint "journey_chat_messages_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."journey_chat_read_states" add constraint "journey_chat_read_states_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."journey_chat_read_states" add constraint "journey_chat_read_states_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."journey_exchange_rates" add constraint "journey_exchange_rates_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."journey_invites" add constraint "journey_invites_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."journey_invites" add constraint "journey_invites_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."journey_ledgers" add constraint "journey_ledgers_exchange_rates_refreshed_by_fkey" FOREIGN KEY (exchange_rates_refreshed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."journey_ledgers" add constraint "journey_ledgers_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."journey_live_locations" add constraint "journey_live_locations_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."journey_live_locations" add constraint "journey_live_locations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."journey_map_objects" add constraint "journey_map_objects_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."journey_map_objects" add constraint "journey_map_objects_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."journey_map_objects" add constraint "journey_map_objects_place_id_fkey" FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE SET NULL;
alter table public."journey_member_face_embeddings" add constraint "journey_member_face_embeddings_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."journey_member_face_embeddings" add constraint "journey_member_face_embeddings_face_id_fkey" FOREIGN KEY (face_id) REFERENCES photo_faces(id) ON DELETE SET NULL;
alter table public."journey_member_face_embeddings" add constraint "journey_member_face_embeddings_journey_member_id_fkey" FOREIGN KEY (journey_member_id) REFERENCES journey_members(id) ON DELETE CASCADE;
alter table public."journey_member_face_embeddings" add constraint "journey_member_face_embeddings_media_asset_id_fkey" FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL;
alter table public."journey_member_face_embeddings" add constraint "journey_member_face_embeddings_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."journey_members" add constraint "journey_members_invited_by_user_id_fkey" FOREIGN KEY (invited_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."journey_members" add constraint "journey_members_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."journey_members" add constraint "journey_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."journey_removed_users" add constraint "journey_removed_users_removed_by_user_id_fkey" FOREIGN KEY (removed_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."journey_removed_users" add constraint "journey_removed_users_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."journey_removed_users" add constraint "journey_removed_users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."journey_storage_connections" add constraint "journey_storage_connections_connected_by_fkey" FOREIGN KEY (connected_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."journey_storage_connections" add constraint "journey_storage_connections_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."ledger_entries" add constraint "ledger_entries_created_by_member_id_fkey" FOREIGN KEY (created_by_member_id) REFERENCES journey_members(id) ON DELETE SET NULL;
alter table public."ledger_entries" add constraint "ledger_entries_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."ledger_entries" add constraint "ledger_entries_itinerary_event_id_fkey" FOREIGN KEY (itinerary_event_id) REFERENCES itinerary_events(id) ON DELETE SET NULL;
alter table public."ledger_entries" add constraint "ledger_entries_itinerary_reservation_id_fkey" FOREIGN KEY (itinerary_reservation_id) REFERENCES itinerary_reservations(id) ON DELETE SET NULL;
alter table public."ledger_entries" add constraint "ledger_entries_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."ledger_entries" add constraint "ledger_entries_memory_entry_id_fkey" FOREIGN KEY (memory_entry_id) REFERENCES memory_entries(id) ON DELETE SET NULL;
alter table public."ledger_entries" add constraint "ledger_entries_payer_member_id_fkey" FOREIGN KEY (payer_member_id) REFERENCES journey_members(id) ON DELETE SET NULL;
alter table public."ledger_entries" add constraint "ledger_entries_place_id_fkey" FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE SET NULL;
alter table public."ledger_entry_participants" add constraint "ledger_entry_participants_ledger_entry_id_fkey" FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id) ON DELETE CASCADE;
alter table public."ledger_entry_participants" add constraint "ledger_entry_participants_member_id_fkey" FOREIGN KEY (member_id) REFERENCES journey_members(id) ON DELETE CASCADE;
alter table public."ledger_settlements" add constraint "ledger_settlements_from_member_id_fkey" FOREIGN KEY (from_member_id) REFERENCES journey_members(id) ON DELETE CASCADE;
alter table public."ledger_settlements" add constraint "ledger_settlements_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."ledger_settlements" add constraint "ledger_settlements_to_member_id_fkey" FOREIGN KEY (to_member_id) REFERENCES journey_members(id) ON DELETE CASCADE;
alter table public."media_asset_variants" add constraint "media_asset_variants_media_asset_id_fkey" FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE CASCADE;
alter table public."media_assets" add constraint "media_assets_memory_entry_id_fkey" FOREIGN KEY (memory_entry_id) REFERENCES memory_entries(id) ON DELETE CASCADE;
alter table public."media_assets" add constraint "media_assets_place_id_fkey" FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE SET NULL;
alter table public."media_assets" add constraint "media_assets_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."media_assets" add constraint "media_assets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."memory_entries" add constraint "memory_entries_itinerary_event_id_fkey" FOREIGN KEY (itinerary_event_id) REFERENCES itinerary_events(id) ON DELETE SET NULL;
alter table public."memory_entries" add constraint "memory_entries_itinerary_reservation_id_fkey" FOREIGN KEY (itinerary_reservation_id) REFERENCES itinerary_reservations(id) ON DELETE SET NULL;
alter table public."memory_entries" add constraint "memory_entries_place_id_fkey" FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE SET NULL;
alter table public."memory_entries" add constraint "memory_entries_trip_day_id_fkey" FOREIGN KEY (trip_day_id) REFERENCES trip_days(id) ON DELETE SET NULL;
alter table public."memory_entries" add constraint "memory_entries_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."memory_entries" add constraint "memory_entries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."memory_favorites" add constraint "memory_favorites_memory_entry_id_fkey" FOREIGN KEY (memory_entry_id) REFERENCES memory_entries(id) ON DELETE CASCADE;
alter table public."memory_favorites" add constraint "memory_favorites_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."memory_likes" add constraint "memory_likes_memory_entry_id_fkey" FOREIGN KEY (memory_entry_id) REFERENCES memory_entries(id) ON DELETE CASCADE;
alter table public."memory_likes" add constraint "memory_likes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."memory_shot_artifact_assets" add constraint "memory_shot_artifact_assets_artifact_id_fkey" FOREIGN KEY (artifact_id) REFERENCES memory_shot_artifacts(id) ON DELETE CASCADE;
alter table public."memory_shot_artifacts" add constraint "memory_shot_artifacts_memory_shot_id_fkey" FOREIGN KEY (memory_shot_id) REFERENCES memory_shots(id) ON DELETE CASCADE;
alter table public."memory_shot_assets" add constraint "memory_shot_assets_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."memory_shot_assets" add constraint "memory_shot_assets_memory_shot_id_fkey" FOREIGN KEY (memory_shot_id) REFERENCES memory_shots(id) ON DELETE CASCADE;
alter table public."memory_shot_favorites" add constraint "memory_shot_favorites_memory_shot_id_fkey" FOREIGN KEY (memory_shot_id) REFERENCES memory_shots(id) ON DELETE CASCADE;
alter table public."memory_shot_favorites" add constraint "memory_shot_favorites_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."memory_shot_likes" add constraint "memory_shot_likes_memory_shot_id_fkey" FOREIGN KEY (memory_shot_id) REFERENCES memory_shots(id) ON DELETE CASCADE;
alter table public."memory_shot_likes" add constraint "memory_shot_likes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."memory_shot_reads" add constraint "memory_shot_reads_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."memory_shot_reads" add constraint "memory_shot_reads_memory_shot_id_fkey" FOREIGN KEY (memory_shot_id) REFERENCES memory_shots(id) ON DELETE CASCADE;
alter table public."memory_shot_reads" add constraint "memory_shot_reads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."memory_shot_recommendations" add constraint "memory_shot_recommendations_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."memory_shot_recommendations" add constraint "memory_shot_recommendations_template_id_fkey" FOREIGN KEY (template_id) REFERENCES memory_shot_templates(id) ON DELETE SET NULL;
alter table public."memory_shot_recommendations" add constraint "memory_shot_recommendations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."memory_shot_snapshots" add constraint "memory_shot_snapshots_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."memory_shot_snapshots" add constraint "memory_shot_snapshots_memory_shot_id_fkey" FOREIGN KEY (memory_shot_id) REFERENCES memory_shots(id) ON DELETE CASCADE;
alter table public."memory_shots" add constraint "memory_shots_author_user_id_fkey" FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."memory_shots" add constraint "memory_shots_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."memory_shots" add constraint "memory_shots_template_id_fkey" FOREIGN KEY (template_id) REFERENCES memory_shot_templates(id) ON DELETE SET NULL;
alter table public."motion_story_shares" add constraint "motion_story_shares_artifact_id_fkey" FOREIGN KEY (artifact_id) REFERENCES memory_shot_artifacts(id) ON DELETE CASCADE;
alter table public."motion_story_shares" add constraint "motion_story_shares_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."motion_story_shares" add constraint "motion_story_shares_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."motion_story_shares" add constraint "motion_story_shares_memory_shot_id_fkey" FOREIGN KEY (memory_shot_id) REFERENCES memory_shots(id) ON DELETE CASCADE;
alter table public."parser_aliases" add constraint "parser_aliases_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."parser_aliases" add constraint "parser_aliases_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."parser_corrections" add constraint "parser_corrections_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."parser_corrections" add constraint "parser_corrections_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."parser_examples" add constraint "parser_examples_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."parser_examples" add constraint "parser_examples_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."parser_parse_logs" add constraint "parser_parse_logs_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."parser_parse_logs" add constraint "parser_parse_logs_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."parser_rules" add constraint "parser_rules_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."parser_rules" add constraint "parser_rules_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."photo_faces" add constraint "photo_faces_journey_member_id_fkey" FOREIGN KEY (journey_member_id) REFERENCES journey_members(id) ON DELETE SET NULL;
alter table public."photo_faces" add constraint "photo_faces_media_asset_id_fkey" FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE CASCADE;
alter table public."photo_faces" add constraint "photo_faces_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."prompt_template_versions" add constraint "prompt_template_versions_template_id_fkey" FOREIGN KEY (template_id) REFERENCES prompt_templates(id) ON DELETE CASCADE;
alter table public."trip_days" add constraint "trip_days_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."trip_days" add constraint "trip_days_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."trip_members" add constraint "trip_members_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public."trip_members" add constraint "trip_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."trips" add constraint "trips_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);

CREATE INDEX ai_cost_events_journey_created_idx ON public.ai_cost_events USING btree (journey_id, created_at DESC);
CREATE INDEX ai_cost_events_provider_model_idx ON public.ai_cost_events USING btree (provider, model, created_at DESC);
CREATE INDEX ai_job_attempts_job_idx ON public.ai_job_attempts USING btree (ai_job_id, attempt_number);
CREATE INDEX ai_jobs_background_job_idx ON public.ai_jobs USING btree (background_job_id);
CREATE INDEX ai_jobs_journey_status_idx ON public.ai_jobs USING btree (journey_id, status, created_at DESC);
CREATE INDEX ai_jobs_user_status_idx ON public.ai_jobs USING btree (user_id, status, available_at, created_at);
CREATE INDEX ai_jobs_worker_task_idx ON public.ai_jobs USING btree (worker, task, status, available_at);
CREATE INDEX background_activity_dismissals_user_idx ON public.background_activity_dismissals USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX background_activity_dismissals_user_key_unique ON public.background_activity_dismissals USING btree (user_id, activity_key);
CREATE INDEX background_job_batches_journey_idx ON public.background_job_batches USING btree (journey_id, created_at DESC);
CREATE INDEX background_job_batches_user_status_idx ON public.background_job_batches USING btree (user_id, status, created_at DESC);
CREATE UNIQUE INDEX background_jobs_active_content_translation_idx ON public.background_jobs USING btree (job_type, ((payload ->> 'source_type'::text)), ((payload ->> 'source_id'::text)), ((payload ->> 'source_field'::text)), lower((payload ->> 'target_lang'::text)), ((payload ->> 'source_hash'::text))) WHERE ((job_type = 'translate_user_content'::text) AND (status = ANY (ARRAY['queued'::text, 'uploading'::text, 'processing'::text, 'waiting_for_user'::text])));
CREATE UNIQUE INDEX background_jobs_active_locale_bundle_idx ON public.background_jobs USING btree (job_type, lower((payload ->> 'language_code'::text)), COALESCE((payload ->> 'namespace'::text), 'common'::text), COALESCE((payload ->> 'base_version'::text), ''::text)) WHERE ((job_type = 'generate_locale_bundle'::text) AND (status = ANY (ARRAY['queued'::text, 'uploading'::text, 'processing'::text, 'waiting_for_user'::text])));
CREATE UNIQUE INDEX background_jobs_active_media_ingest_idx ON public.background_jobs USING btree (job_type, ((payload ->> 'mediaId'::text))) WHERE ((job_type = 'media_ingest'::text) AND (status = ANY (ARRAY['queued'::text, 'uploading'::text, 'processing'::text, 'waiting_for_user'::text])) AND (payload ? 'mediaId'::text));
CREATE UNIQUE INDEX background_jobs_active_media_job_idx ON public.background_jobs USING btree (job_type, ((payload ->> 'mediaAssetId'::text))) WHERE ((status = ANY (ARRAY['queued'::text, 'uploading'::text, 'processing'::text, 'waiting_for_user'::text])) AND (payload ? 'mediaAssetId'::text));
CREATE INDEX background_jobs_batch_idx ON public.background_jobs USING btree (batch_id);
CREATE INDEX background_jobs_journey_status_idx ON public.background_jobs USING btree (journey_id, status, created_at DESC);
CREATE INDEX background_jobs_user_status_idx ON public.background_jobs USING btree (user_id, status, available_at, created_at);
CREATE INDEX capture2_media_uploads_cleanup_idx ON public.capture2_media_uploads USING btree (processing_status, updated_at) WHERE ((staging_object_key IS NOT NULL) AND (staging_deleted_at IS NULL));
CREATE UNIQUE INDEX capture2_media_uploads_staging_object_key_idx ON public.capture2_media_uploads USING btree (staging_object_key);
CREATE INDEX capture2_media_uploads_trip_status_idx ON public.capture2_media_uploads USING btree (trip_id, processing_status, created_at DESC);
CREATE INDEX capture2_media_uploads_user_status_idx ON public.capture2_media_uploads USING btree (user_id, processing_status, created_at DESC);
CREATE INDEX content_translations_source_idx ON public.content_translations USING btree (source_type, source_id, source_field);
CREATE INDEX content_translations_target_idx ON public.content_translations USING btree (target_lang, status, updated_at DESC);
CREATE INDEX daily_reports_trip_id_report_date_idx ON public.daily_reports USING btree (trip_id, report_date);
CREATE INDEX i18n_locale_bundles_lookup_idx ON public.i18n_locale_bundles USING btree (language_code, namespace, base_version);
CREATE INDEX i18n_locale_bundles_published_lookup_idx ON public.i18n_locale_bundles USING btree (language_code, namespace, base_version, status) WHERE (status = 'reviewed'::text);
CREATE INDEX image_index_records_duplicate_hash_idx ON public.image_index_records USING btree (duplicate_hash);
CREATE INDEX image_index_records_journey_id_idx ON public.image_index_records USING btree (journey_id);
CREATE INDEX image_index_records_status_idx ON public.image_index_records USING btree (journey_id, status);
CREATE INDEX itinerary_event_participants_event_id_idx ON public.itinerary_event_participants USING btree (event_id);
CREATE UNIQUE INDEX itinerary_event_participants_event_member_uidx ON public.itinerary_event_participants USING btree (event_id, journey_member_id) WHERE (journey_member_id IS NOT NULL);
CREATE INDEX itinerary_event_participants_journey_member_id_idx ON public.itinerary_event_participants USING btree (journey_member_id);
CREATE INDEX itinerary_event_participants_user_id_idx ON public.itinerary_event_participants USING btree (user_id);
CREATE INDEX itinerary_events_location_repair_idx ON public.itinerary_events USING btree (trip_id, location_status, geocoded_at) WHERE (location_text IS NOT NULL);
CREATE INDEX itinerary_events_reservation_id_idx ON public.itinerary_events USING btree (reservation_id);
CREATE INDEX itinerary_events_trip_day_id_idx ON public.itinerary_events USING btree (trip_day_id);
CREATE INDEX itinerary_events_trip_id_order_index_idx ON public.itinerary_events USING btree (trip_id, order_index);
CREATE INDEX itinerary_events_trip_id_planned_start_idx ON public.itinerary_events USING btree (trip_id, planned_start);
CREATE INDEX itinerary_item_ratings_item_idx ON public.itinerary_item_ratings USING btree (item_type, item_id);
CREATE INDEX itinerary_item_ratings_trip_id_idx ON public.itinerary_item_ratings USING btree (trip_id);
CREATE INDEX itinerary_reservation_participants_journey_member_id_idx ON public.itinerary_reservation_participants USING btree (journey_member_id);
CREATE INDEX itinerary_reservation_participants_reservation_id_idx ON public.itinerary_reservation_participants USING btree (reservation_id);
CREATE UNIQUE INDEX itinerary_reservation_participants_reservation_member_uidx ON public.itinerary_reservation_participants USING btree (reservation_id, journey_member_id) WHERE (journey_member_id IS NOT NULL);
CREATE INDEX itinerary_reservation_participants_user_id_idx ON public.itinerary_reservation_participants USING btree (user_id);
CREATE INDEX itinerary_reservations_location_repair_idx ON public.itinerary_reservations USING btree (trip_id, location_status, geocoded_at) WHERE (location_text IS NOT NULL);
CREATE INDEX itinerary_reservations_trip_day_id_idx ON public.itinerary_reservations USING btree (trip_day_id);
CREATE INDEX itinerary_reservations_trip_id_starts_at_idx ON public.itinerary_reservations USING btree (trip_id, starts_at);
CREATE INDEX journey_capture_events_journey_captured_idx ON public.journey_capture_events USING btree (journey_id, captured_at DESC);
CREATE INDEX journey_capture_events_status_idx ON public.journey_capture_events USING btree (journey_id, status);
CREATE INDEX journey_chat_messages_memory_entry_idx ON public.journey_chat_messages USING btree (memory_entry_id);
CREATE UNIQUE INDEX journey_chat_messages_source_unique_idx ON public.journey_chat_messages USING btree (trip_id, source_type, source_id);
CREATE INDEX journey_chat_messages_trip_created_idx ON public.journey_chat_messages USING btree (trip_id, created_at DESC);
CREATE INDEX journey_exchange_rates_journey_idx ON public.journey_exchange_rates USING btree (journey_id);
CREATE INDEX journey_invites_token_idx ON public.journey_invites USING btree (token);
CREATE INDEX journey_invites_trip_id_idx ON public.journey_invites USING btree (trip_id);
CREATE INDEX journey_ledgers_journey_id_idx ON public.journey_ledgers USING btree (journey_id);
CREATE INDEX journey_live_locations_journey_updated_idx ON public.journey_live_locations USING btree (journey_id, updated_at DESC);
CREATE INDEX journey_map_objects_journey_type_idx ON public.journey_map_objects USING btree (journey_id, type);
CREATE INDEX journey_map_objects_source_idx ON public.journey_map_objects USING btree (source_type, source_id);
CREATE INDEX journey_map_objects_source_unique_idx ON public.journey_map_objects USING btree (journey_id, source_type, source_id) WHERE ((source_type IS NOT NULL) AND (source_id IS NOT NULL));
CREATE INDEX journey_member_face_embeddings_face_id_idx ON public.journey_member_face_embeddings USING btree (face_id);
CREATE INDEX journey_member_face_embeddings_member_id_idx ON public.journey_member_face_embeddings USING btree (journey_member_id);
CREATE INDEX journey_member_face_embeddings_model_version_idx ON public.journey_member_face_embeddings USING btree (trip_id, embedding_version);
CREATE INDEX journey_member_face_embeddings_trip_id_idx ON public.journey_member_face_embeddings USING btree (trip_id);
CREATE INDEX journey_members_invite_code_idx ON public.journey_members USING btree (invite_code);
CREATE INDEX journey_members_invite_email_idx ON public.journey_members USING btree (lower(invite_email)) WHERE (invite_email IS NOT NULL);
CREATE INDEX journey_members_trip_id_idx ON public.journey_members USING btree (trip_id);
CREATE INDEX journey_members_user_id_idx ON public.journey_members USING btree (user_id);
CREATE INDEX journey_removed_users_trip_id_idx ON public.journey_removed_users USING btree (trip_id);
CREATE INDEX journey_removed_users_user_id_idx ON public.journey_removed_users USING btree (user_id);
CREATE INDEX journey_storage_connections_trip_id_idx ON public.journey_storage_connections USING btree (trip_id);
CREATE INDEX ledger_entries_itinerary_event_id_idx ON public.ledger_entries USING btree (itinerary_event_id);
CREATE INDEX ledger_entries_itinerary_reservation_id_idx ON public.ledger_entries USING btree (itinerary_reservation_id);
CREATE INDEX ledger_entries_journey_expense_date_idx ON public.ledger_entries USING btree (journey_id, expense_date DESC);
CREATE INDEX ledger_entries_location_repair_idx ON public.ledger_entries USING btree (journey_id, location_status, geocoded_at) WHERE (location_text IS NOT NULL);
CREATE INDEX ledger_entries_memory_entry_id_idx ON public.ledger_entries USING btree (memory_entry_id);
CREATE INDEX ledger_entries_payer_member_id_idx ON public.ledger_entries USING btree (payer_member_id);
CREATE INDEX ledger_entry_participants_entry_id_idx ON public.ledger_entry_participants USING btree (ledger_entry_id);
CREATE INDEX ledger_entry_participants_member_id_idx ON public.ledger_entry_participants USING btree (member_id);
CREATE INDEX ledger_settlements_journey_id_idx ON public.ledger_settlements USING btree (journey_id);
CREATE INDEX media_asset_variants_asset_idx ON public.media_asset_variants USING btree (media_asset_id);
CREATE INDEX media_asset_variants_cleanup_idx ON public.media_asset_variants USING btree (variant_type, last_accessed_at);
CREATE INDEX media_assets_ai_status_idx ON public.media_assets USING btree (trip_id, ai_status);
CREATE INDEX media_assets_drive_original_idx ON public.media_assets USING btree (original_drive_file_id) WHERE (original_drive_file_id IS NOT NULL);
CREATE INDEX media_assets_drive_thumbnail_idx ON public.media_assets USING btree (thumbnail_drive_file_id) WHERE (thumbnail_drive_file_id IS NOT NULL);
CREATE INDEX media_assets_memory_entry_id_idx ON public.media_assets USING btree (memory_entry_id);
CREATE INDEX media_assets_preview_url_idx ON public.media_assets USING btree (preview_url) WHERE (preview_url IS NOT NULL);
CREATE INDEX media_assets_processing_status_idx ON public.media_assets USING btree (trip_id, processing_status);
CREATE INDEX media_assets_storage_provider_file_idx ON public.media_assets USING btree (storage_provider, provider_file_id);
CREATE INDEX media_assets_taken_at_idx ON public.media_assets USING btree (trip_id, taken_at);
CREATE INDEX media_assets_thumbnail_url_idx ON public.media_assets USING btree (thumbnail_url) WHERE (thumbnail_url IS NOT NULL);
CREATE INDEX media_assets_trip_id_idx ON public.media_assets USING btree (trip_id);
CREATE INDEX media_assets_user_id_idx ON public.media_assets USING btree (user_id);
CREATE INDEX memory_entries_itinerary_event_id_idx ON public.memory_entries USING btree (itinerary_event_id);
CREATE INDEX memory_entries_itinerary_reservation_id_idx ON public.memory_entries USING btree (itinerary_reservation_id);
CREATE INDEX memory_entries_location_repair_idx ON public.memory_entries USING btree (trip_id, location_status, geocoded_at) WHERE (location_text IS NOT NULL);
CREATE INDEX memory_entries_trip_day_id_idx ON public.memory_entries USING btree (trip_day_id);
CREATE INDEX memory_entries_trip_id_captured_at_asc_idx ON public.memory_entries USING btree (trip_id, captured_at);
CREATE INDEX memory_entries_trip_id_captured_at_idx ON public.memory_entries USING btree (trip_id, captured_at DESC);
CREATE INDEX memory_favorites_memory_entry_id_idx ON public.memory_favorites USING btree (memory_entry_id);
CREATE INDEX memory_favorites_user_id_idx ON public.memory_favorites USING btree (user_id);
CREATE INDEX memory_likes_memory_entry_id_idx ON public.memory_likes USING btree (memory_entry_id);
CREATE INDEX memory_likes_user_id_idx ON public.memory_likes USING btree (user_id);
CREATE INDEX memory_shot_artifact_assets_artifact_idx ON public.memory_shot_artifact_assets USING btree (artifact_id, sort_order);
CREATE INDEX memory_shot_artifact_assets_source_idx ON public.memory_shot_artifact_assets USING btree (asset_type, asset_id);
CREATE INDEX memory_shot_artifacts_shot_idx ON public.memory_shot_artifacts USING btree (memory_shot_id, status, created_at DESC);
CREATE INDEX memory_shot_artifacts_type_variant_idx ON public.memory_shot_artifacts USING btree (artifact_type, variant, status, created_at DESC);
CREATE INDEX memory_shot_assets_shot_idx ON public.memory_shot_assets USING btree (memory_shot_id, sort_order);
CREATE INDEX memory_shot_assets_source_idx ON public.memory_shot_assets USING btree (asset_type, source_id);
CREATE INDEX memory_shot_favorites_memory_shot_id_idx ON public.memory_shot_favorites USING btree (memory_shot_id);
CREATE INDEX memory_shot_favorites_user_id_idx ON public.memory_shot_favorites USING btree (user_id);
CREATE INDEX memory_shot_likes_memory_shot_id_idx ON public.memory_shot_likes USING btree (memory_shot_id);
CREATE INDEX memory_shot_likes_user_id_idx ON public.memory_shot_likes USING btree (user_id);
CREATE INDEX memory_shot_reads_user_idx ON public.memory_shot_reads USING btree (user_id, journey_id, read_at DESC);
CREATE INDEX memory_shot_recommendations_journey_status_idx ON public.memory_shot_recommendations USING btree (journey_id, status, score DESC, created_at DESC);
CREATE INDEX memory_shot_snapshots_journey_idx ON public.memory_shot_snapshots USING btree (journey_id, created_at DESC);
CREATE INDEX memory_shot_templates_task_idx ON public.memory_shot_templates USING btree (worker, task, status);
CREATE INDEX memory_shots_author_idx ON public.memory_shots USING btree (author_user_id, created_at DESC);
CREATE INDEX memory_shots_journey_status_idx ON public.memory_shots USING btree (journey_id, status, created_at DESC);
CREATE INDEX memory_shots_journey_visibility_idx ON public.memory_shots USING btree (journey_id, visibility, created_at DESC);
CREATE INDEX memory_shots_preview_storage_provider_idx ON public.memory_shots USING btree (preview_storage_provider, updated_at DESC);
CREATE INDEX memory_shots_render_status_idx ON public.memory_shots USING btree (journey_id, render_status, updated_at DESC);
CREATE INDEX motion_story_shares_artifact_active_idx ON public.motion_story_shares USING btree (artifact_id, expires_at DESC) WHERE (revoked_at IS NULL);
CREATE INDEX motion_story_shares_journey_idx ON public.motion_story_shares USING btree (journey_id, created_at DESC);
CREATE INDEX motion_story_shares_token_idx ON public.motion_story_shares USING btree (token);
CREATE INDEX parser_aliases_lookup_idx ON public.parser_aliases USING btree (canonical_type, journey_id, status, alias_text);
CREATE INDEX parser_examples_lookup_idx ON public.parser_examples USING btree (source, journey_id, normalized_text);
CREATE INDEX parser_parse_logs_journey_idx ON public.parser_parse_logs USING btree (journey_id, source, created_at DESC);
CREATE INDEX parser_rules_lookup_idx ON public.parser_rules USING btree (source, journey_id, status, priority);
CREATE INDEX photo_faces_journey_member_id_idx ON public.photo_faces USING btree (journey_member_id);
CREATE INDEX photo_faces_media_asset_id_idx ON public.photo_faces USING btree (media_asset_id);
CREATE INDEX photo_faces_model_version_idx ON public.photo_faces USING btree (trip_id, embedding_version);
CREATE INDEX photo_faces_trip_id_idx ON public.photo_faces USING btree (trip_id);
CREATE INDEX places_lat_lng_idx ON public.places USING btree (lat, lng);
CREATE UNIQUE INDEX places_normalized_country_provider_idx ON public.places USING btree (normalized_name, COALESCE(country, ''::text), COALESCE(provider, ''::text), COALESCE(provider_place_id, ''::text));
CREATE INDEX places_normalized_name_idx ON public.places USING btree (normalized_name);
CREATE INDEX places_provider_place_id_idx ON public.places USING btree (provider, provider_place_id);
CREATE INDEX profiles_account_role_idx ON public.profiles USING btree (account_role);
CREATE UNIQUE INDEX prompt_template_versions_one_active_idx ON public.prompt_template_versions USING btree (template_id, language, environment) WHERE (status = 'active'::text);
CREATE INDEX prompt_template_versions_template_status_idx ON public.prompt_template_versions USING btree (template_id, status, language, environment);
CREATE INDEX prompt_templates_worker_task_idx ON public.prompt_templates USING btree (worker, task);
CREATE INDEX trip_days_trip_id_day_date_idx ON public.trip_days USING btree (trip_id, day_date);
CREATE INDEX trip_members_trip_id_idx ON public.trip_members USING btree (trip_id);
CREATE INDEX trip_members_user_id_idx ON public.trip_members USING btree (user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.touch_journey_chat_message_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_trip_member(target_trip_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = target_trip_id
      and tm.user_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_trip_creator(target_trip_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.trips t
    where t.id = target_trip_id
      and t.created_by = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_trip_member_or_creator(target_trip_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = target_trip_id
      and tm.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.trips t
    where t.id = target_trip_id
      and t.created_by = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_trip_owner_or_admin(target_trip_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = target_trip_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin')
  )
  or exists (
    select 1
    from public.trips t
    where t.id = target_trip_id
      and t.created_by = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_system_admin(target_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.account_role = 'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_trip_media(object_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
declare
  path_parts text[] := storage.foldername(object_name);
  target_trip_id uuid;
begin
  if array_length(path_parts, 1) < 3 then
    return false;
  end if;

  if path_parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;

  target_trip_id := path_parts[1]::uuid;

  return public.is_trip_member(target_trip_id)
    or public.is_trip_creator(target_trip_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.can_upload_trip_media(object_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
declare
  path_parts text[] := storage.foldername(object_name);
begin
  if array_length(path_parts, 1) < 3 then
    return false;
  end if;

  return path_parts[2] = auth.uid()::text
    and path_parts[3] = 'compressed'
    and public.can_access_trip_media(object_name);
end;
$function$;

CREATE OR REPLACE FUNCTION public.can_access_memory_shot_preview(object_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
declare
  path_parts text[] := storage.foldername(object_name);
  target_journey_id uuid;
begin
  if array_length(path_parts, 1) < 2 then
    return false;
  end if;

  if path_parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;

  target_journey_id := path_parts[1]::uuid;

  return public.is_trip_member_or_creator(target_journey_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_background_jobs(target_journey_id uuid, target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select target_user_id is not null
    and (
      target_journey_id is null
      or exists (
        select 1
        from public.trips t
        where t.id = target_journey_id
          and t.created_by = target_user_id
      )
      or exists (
        select 1
        from public.trip_members tm
        where tm.trip_id = target_journey_id
          and tm.user_id = target_user_id
      )
      or exists (
        select 1
        from public.journey_members jm
        where jm.trip_id = target_journey_id
          and jm.user_id = target_user_id
          and jm.status = 'linked'
          and jm.role in ('owner', 'group_member')
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_itinerary_event_participants(target_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.itinerary_events ie
    where ie.id = target_event_id
      and (
        ie.created_by = auth.uid()
        or public.is_trip_owner_or_admin(ie.trip_id)
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_itinerary_reservation_participants(target_reservation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.itinerary_reservations ir
    where ir.id = target_reservation_id
      and (
        ir.created_by = auth.uid()
        or public.is_trip_owner_or_admin(ir.trip_id)
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.add_trip_creator_as_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.created_by is not null then
    insert into public.trip_members (trip_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict (trip_id, user_id) do nothing;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_trip_creator_as_journey_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  creator_name text;
  creator_avatar text;
begin
  select display_name, avatar_url
    into creator_name, creator_avatar
  from public.profiles
  where id = new.created_by;

  insert into public.journey_members (
    trip_id,
    user_id,
    display_name,
    avatar_url,
    role,
    status,
    linked_at
  )
  values (
    new.id,
    new.created_by,
    coalesce(creator_name, 'Owner'),
    creator_avatar,
    'owner',
    'linked',
    now()
  )
  on conflict (trip_id, user_id) do nothing;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_journey_invite(invite_token text)
 RETURNS TABLE(accepted_trip_id uuid, invite_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  invite_row public.journey_invites%rowtype;
  current_user_id uuid := auth.uid();
  current_user_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  removed_row public.journey_removed_users%rowtype;
  claim_row public.journey_members%rowtype;
  inserted_count int := 0;
  profile_name text;
  profile_avatar text;
begin
  if current_user_id is null then
    return query select null::uuid, 'invalid'::text;
    return;
  end if;

  select *
  into invite_row
  from public.journey_invites ji
  where ji.token = invite_token
    and ji.is_active = true
  limit 1;

  if not found then
    return query select null::uuid, 'invalid'::text;
    return;
  end if;

  select *
    into removed_row
  from public.journey_removed_users jru
  where jru.trip_id = invite_row.trip_id
    and jru.user_id = current_user_id
  limit 1;

  if found then
    if invite_row.invited_email is null
      or current_user_email = ''
      or lower(invite_row.invited_email) <> current_user_email
      or invite_row.created_at <= removed_row.removed_at
    then
      return query select invite_row.trip_id, 'removed'::text;
      return;
    end if;

    delete from public.journey_removed_users jru
    where jru.id = removed_row.id;
  end if;

  if invite_row.expires_at is not null and invite_row.expires_at < now() then
    return query select invite_row.trip_id, 'expired'::text;
    return;
  end if;

  if coalesce(invite_row.used_count, 0) >= coalesce(invite_row.max_uses, 20) then
    return query select invite_row.trip_id, 'full'::text;
    return;
  end if;

  if exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = invite_row.trip_id
      and tm.user_id = current_user_id
  ) then
    return query select invite_row.trip_id, 'already_member'::text;
    return;
  end if;

  select display_name, avatar_url
    into profile_name, profile_avatar
  from public.profiles
  where id = current_user_id;

  if invite_row.invited_email is not null and current_user_email <> '' then
    select *
      into claim_row
    from public.journey_members jm
    where jm.trip_id = invite_row.trip_id
      and jm.user_id is null
      and jm.status in ('unlinked', 'invite_pending')
      and lower(coalesce(jm.invite_email, '')) = current_user_email
    order by
      case jm.status when 'invite_pending' then 0 else 1 end,
      jm.created_at
    limit 1
    for update;

    if not found then
      select *
        into claim_row
      from public.journey_members jm
      where jm.trip_id = invite_row.trip_id
        and jm.user_id is null
        and jm.status in ('unlinked', 'invite_pending')
        and lower(jm.display_name) = current_user_email
      order by jm.created_at
      limit 1
      for update;
    end if;
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (invite_row.trip_id, current_user_id, invite_row.role)
  on conflict (trip_id, user_id) do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count > 0 then
    if claim_row.id is not null then
      update public.journey_members
      set user_id = current_user_id,
          avatar_url = coalesce(avatar_url, profile_avatar),
          status = 'linked',
          invite_email = coalesce(invite_email, invite_row.invited_email),
          invited_by_user_id = coalesce(invited_by_user_id, invite_row.created_by),
          linked_at = now()
      where id = claim_row.id;
    else
      insert into public.journey_members (
        trip_id,
        user_id,
        display_name,
        avatar_url,
        role,
        status,
        invite_email,
        invited_by_user_id,
        linked_at
      )
      values (
        invite_row.trip_id,
        current_user_id,
        coalesce(profile_name, 'Traveler'),
        profile_avatar,
        'group_member',
        'linked',
        invite_row.invited_email,
        invite_row.created_by,
        now()
      )
      on conflict (trip_id, user_id) do nothing;
    end if;

    update public.journey_invites
    set used_count = coalesce(used_count, 0) + 1
    where id = invite_row.id;

    return query select invite_row.trip_id, 'joined'::text;
    return;
  end if;

  return query select invite_row.trip_id, 'already_member'::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_email_invited_journeys()
 RETURNS TABLE(claimed_trip_id uuid, claimed_member_id uuid, claim_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_user_id uuid := auth.uid();
  current_user_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  profile_name text;
  profile_avatar text;
  candidate public.journey_members%rowtype;
  trip_member_role text;
  inserted_count int := 0;
begin
  if current_user_id is null or current_user_email = '' then
    return query select null::uuid, null::uuid, 'invalid'::text;
    return;
  end if;

  insert into public.profiles (id, display_name, avatar_url)
  values (
    current_user_id,
    coalesce(
      nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
      nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
      current_user_email,
      'Traveler'
    ),
    nullif(
      coalesce(
        auth.jwt() -> 'user_metadata' ->> 'avatar_url',
        auth.jwt() -> 'user_metadata' ->> 'picture'
      ),
      ''
    )
  )
  on conflict (id) do nothing;

  select display_name, avatar_url
    into profile_name, profile_avatar
  from public.profiles
  where id = current_user_id;

  for candidate in
    select jm.*
    from public.journey_members jm
    where lower(coalesce(jm.invite_email, '')) = current_user_email
      and jm.status in ('unlinked', 'invite_pending')
      and (jm.user_id is null or jm.user_id = current_user_id)
      and not exists (
        select 1
        from public.journey_members linked
        where linked.trip_id = jm.trip_id
          and linked.user_id = current_user_id
          and linked.id <> jm.id
      )
      and not exists (
        select 1
        from public.journey_removed_users removed
        where removed.trip_id = jm.trip_id
          and removed.user_id = current_user_id
          and removed.removed_at >= jm.created_at
      )
    order by jm.created_at asc
  loop
    update public.journey_members
    set user_id = current_user_id,
        display_name = coalesce(nullif(display_name, ''), profile_name, 'Traveler'),
        avatar_url = coalesce(avatar_url, profile_avatar),
        status = 'linked',
        linked_at = coalesce(linked_at, now())
    where id = candidate.id;

    trip_member_role := case
      when candidate.role = 'owner' then 'owner'
      else 'member'
    end;

    insert into public.trip_members (trip_id, user_id, role)
    values (candidate.trip_id, current_user_id, trip_member_role)
    on conflict (trip_id, user_id) do nothing;

    get diagnostics inserted_count = row_count;

    return query select
      candidate.trip_id,
      candidate.id,
      case when inserted_count > 0 then 'claimed' else 'already_member' end;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_journey_member(target_member_id uuid)
 RETURNS TABLE(claimed_member_id uuid, claimed_trip_id uuid, claim_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  member_row public.journey_members%rowtype;
  current_user_id uuid := auth.uid();
  trip_member_role text;
begin
  if current_user_id is null then
    return query select null::uuid, null::uuid, 'invalid'::text;
    return;
  end if;

  select *
    into member_row
  from public.journey_members jm
  where jm.id = target_member_id
  for update;

  if not found then
    return query select null::uuid, null::uuid, 'invalid'::text;
    return;
  end if;

  if not public.is_trip_member_or_creator(member_row.trip_id) then
    return query select member_row.id, member_row.trip_id, 'forbidden'::text;
    return;
  end if;

  if exists (
    select 1
    from public.journey_members jm
    where jm.trip_id = member_row.trip_id
      and jm.user_id = current_user_id
      and jm.id <> member_row.id
  ) then
    return query select member_row.id, member_row.trip_id, 'already_has_identity'::text;
    return;
  end if;

  if member_row.user_id is not null and member_row.user_id <> current_user_id then
    return query select member_row.id, member_row.trip_id, 'already_claimed'::text;
    return;
  end if;

  update public.journey_members
  set user_id = current_user_id,
      status = 'linked',
      linked_at = coalesce(linked_at, now())
  where id = member_row.id;

  trip_member_role := case
    when member_row.role = 'owner' then 'owner'
    else 'member'
  end;

  insert into public.trip_members (trip_id, user_id, role)
  values (member_row.trip_id, current_user_id, trip_member_role)
  on conflict (trip_id, user_id) do nothing;

  return query select member_row.id, member_row.trip_id, 'claimed'::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_memory_entry_for_current_user(target_memory_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  memory_row public.memory_entries%rowtype;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'You must be logged in to delete a memory.'
      using errcode = '28000';
  end if;

  select *
    into memory_row
  from public.memory_entries
  where id = target_memory_id;

  if not found then
    raise exception 'Memory not found.'
      using errcode = 'P0002';
  end if;

  if memory_row.user_id is distinct from current_user_id then
    raise exception 'Only the creator can delete this memory.'
      using errcode = '42501';
  end if;

  delete from public.memory_entries
  where id = target_memory_id;

  return target_memory_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_journey_members_for_current_user(target_trip_id uuid)
 RETURNS TABLE(member_id uuid, member_trip_id uuid, member_user_id uuid, member_display_name text, member_avatar_url text, member_role text, member_status text, member_notes text, member_invite_email text, member_linked_at timestamp with time zone, member_created_at timestamp with time zone, profile_display_name text, profile_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    jm.id,
    jm.trip_id,
    jm.user_id,
    jm.display_name,
    jm.avatar_url,
    jm.role,
    jm.status,
    jm.notes,
    jm.invite_email,
    jm.linked_at,
    jm.created_at,
    p.display_name,
    p.avatar_url
  from public.journey_members jm
  left join public.profiles p on p.id = jm.user_id
  where jm.trip_id = target_trip_id
    and public.is_trip_member_or_creator(target_trip_id)
  order by
    case jm.role
      when 'owner' then 0
      when 'group_member' then 1
      else 2
    end,
    jm.created_at;
$function$;

CREATE OR REPLACE FUNCTION public.get_trip_members_for_current_user(target_trip_id uuid)
 RETURNS TABLE(member_id uuid, member_trip_id uuid, member_user_id uuid, member_role text, member_created_at timestamp with time zone, display_name text, avatar_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    return;
  end if;

  if not public.is_trip_member(target_trip_id) then
    return;
  end if;

  return query
    select
      tm.id,
      tm.trip_id,
      tm.user_id,
      coalesce(tm.role, 'member'),
      tm.created_at,
      p.display_name,
      p.avatar_url
    from public.trip_members tm
    left join public.profiles p on p.id = tm.user_id
    where tm.trip_id = target_trip_id
    order by tm.created_at asc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_account_roles()
 RETURNS TABLE(id uuid, email text, display_name text, avatar_url text, account_role text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if not public.is_system_admin(auth.uid()) then
    raise exception 'Only system admins can list account roles.';
  end if;

  return query
  select
    p.id,
    u.email::text,
    p.display_name,
    p.avatar_url,
    p.account_role,
    p.created_at
  from public.profiles p
  left join auth.users u on u.id = p.id
  order by
    case p.account_role
      when 'admin' then 0
      when 'pro' then 1
      when 'plus' then 2
      else 3
    end,
    p.created_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_journey_member(target_member_id uuid, revoke_matching_invites boolean DEFAULT true)
 RETURNS TABLE(removed_trip_id uuid, remove_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  member_row public.journey_members%rowtype;
  remaining_owner_count int;
begin
  select *
    into member_row
  from public.journey_members jm
  where jm.id = target_member_id
  for update;

  if not found then
    return query select null::uuid, 'invalid'::text;
    return;
  end if;

  if not public.is_trip_owner_or_admin(member_row.trip_id) then
    return query select member_row.trip_id, 'forbidden'::text;
    return;
  end if;

  if member_row.role = 'owner' then
    select count(*)
      into remaining_owner_count
    from public.journey_members jm
    where jm.trip_id = member_row.trip_id
      and jm.role = 'owner'
      and jm.id <> member_row.id;

    if remaining_owner_count = 0 then
      return query select member_row.trip_id, 'last_owner'::text;
      return;
    end if;
  end if;

  if member_row.user_id is not null then
    delete from public.trip_members tm
    where tm.trip_id = member_row.trip_id
      and tm.user_id = member_row.user_id;

    insert into public.journey_removed_users (
      trip_id,
      user_id,
      removed_by_user_id,
      reason
    )
    values (
      member_row.trip_id,
      member_row.user_id,
      auth.uid(),
      'removed_from_people'
    )
    on conflict (trip_id, user_id) do update
      set removed_by_user_id = excluded.removed_by_user_id,
          removed_at = now(),
          reason = excluded.reason;
  end if;

  if revoke_matching_invites and member_row.invite_email is not null then
    update public.journey_invites ji
    set is_active = false
    where ji.trip_id = member_row.trip_id
      and lower(ji.invited_email) = lower(member_row.invite_email);
  end if;

  delete from public.journey_members jm
  where jm.id = member_row.id;

  return query select member_row.trip_id, 'removed'::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_journey_chat_message_for_current_user(target_message_id uuid)
 RETURNS journey_chat_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  message_row public.journey_chat_messages%rowtype;
  updated_row public.journey_chat_messages%rowtype;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'You must be logged in to revoke messages.'
      using errcode = '28000';
  end if;

  select *
    into message_row
  from public.journey_chat_messages
  where id = target_message_id
  for update;

  if not found then
    raise exception 'Message not found.'
      using errcode = 'P0002';
  end if;

  if not public.is_trip_member(message_row.trip_id) then
    raise exception 'You do not have access to this Journey.'
      using errcode = '42501';
  end if;

  if message_row.user_id is distinct from current_user_id then
    raise exception 'Only the sender can revoke this message.'
      using errcode = '42501';
  end if;

  if message_row.source_type <> 'chat' then
    raise exception 'Only messages sent from group chat can be revoked here.'
      using errcode = '42501';
  end if;

  if message_row.deleted_at is not null then
    raise exception 'Message has already been revoked.'
      using errcode = 'P0001';
  end if;

  if message_row.created_at < now() - interval '30 minutes' then
    raise exception 'Messages can only be revoked within 30 minutes.'
      using errcode = '22023';
  end if;

  if message_row.memory_entry_id is not null then
    delete from public.memory_entries
    where id = message_row.memory_entry_id
      and trip_id = message_row.trip_id
      and user_id = current_user_id;
  end if;

  update public.journey_chat_messages
    set
      deleted_at = now(),
      deleted_by = current_user_id,
      text_content = null,
      transcript_text = null
    where id = target_message_id
    returning * into updated_row;

  return updated_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.search_account_roles(search_query text)
 RETURNS TABLE(id uuid, email text, display_name text, avatar_url text, account_role text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  normalized_query text := lower(trim(coalesce(search_query, '')));
begin
  if not public.is_system_admin(auth.uid()) then
    raise exception 'Only system admins can search account roles.';
  end if;

  if length(normalized_query) < 2 then
    return;
  end if;

  return query
  select
    p.id,
    u.email::text,
    p.display_name,
    p.avatar_url,
    p.account_role,
    p.created_at
  from public.profiles p
  left join auth.users u on u.id = p.id
  where lower(coalesce(u.email::text, '')) like '%' || normalized_query || '%'
     or lower(coalesce(p.display_name, '')) like '%' || normalized_query || '%'
  order by
    case
      when lower(coalesce(u.email::text, '')) = normalized_query then 0
      when lower(coalesce(u.email::text, '')) like normalized_query || '%' then 1
      when lower(coalesce(p.display_name, '')) like normalized_query || '%' then 2
      else 3
    end,
    p.created_at desc
  limit 20;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_own_journey_member_notes(target_member_id uuid, next_notes text)
 RETURNS journey_members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  updated_member public.journey_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update public.journey_members jm
    set notes = nullif(btrim(coalesce(next_notes, '')), '')
  where jm.id = target_member_id
    and jm.user_id = auth.uid()
  returning * into updated_member;

  if not found then
    raise exception 'forbidden_or_missing_member' using errcode = '42501';
  end if;

  return updated_member;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_profile_account_role(target_profile_id uuid, next_account_role text)
 RETURNS TABLE(id uuid, email text, display_name text, avatar_url text, account_role text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if not public.is_system_admin(auth.uid()) then
    raise exception 'Only system admins can update account roles.';
  end if;

  if next_account_role not in ('admin', 'free_user', 'plus', 'pro') then
    raise exception 'Invalid account role.';
  end if;

  update public.profiles
  set account_role = next_account_role
  where profiles.id = target_profile_id;

  return query
  select
    p.id,
    u.email::text,
    p.display_name,
    p.avatar_url,
    p.account_role,
    p.created_at
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = target_profile_id;
end;
$function$;

CREATE TRIGGER ai_jobs_touch_updated_at BEFORE UPDATE ON ai_jobs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER background_job_batches_touch_updated_at BEFORE UPDATE ON background_job_batches FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER background_jobs_touch_updated_at BEFORE UPDATE ON background_jobs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER capture2_media_uploads_touch_updated_at BEFORE UPDATE ON capture2_media_uploads FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER content_translations_touch_updated_at BEFORE UPDATE ON content_translations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER i18n_locale_bundles_touch_updated_at BEFORE UPDATE ON i18n_locale_bundles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER image_index_records_touch_updated_at BEFORE UPDATE ON image_index_records FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER journey_capture_events_touch_updated_at BEFORE UPDATE ON journey_capture_events FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_journey_chat_message_updated_at BEFORE UPDATE ON journey_chat_messages FOR EACH ROW EXECUTE FUNCTION touch_journey_chat_message_updated_at();
CREATE TRIGGER journey_exchange_rates_touch_updated_at BEFORE UPDATE ON journey_exchange_rates FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER journey_ledgers_touch_updated_at BEFORE UPDATE ON journey_ledgers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER journey_live_locations_touch_updated_at BEFORE UPDATE ON journey_live_locations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER journey_map_objects_touch_updated_at BEFORE UPDATE ON journey_map_objects FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER journey_members_touch_updated_at BEFORE UPDATE ON journey_members FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER journey_storage_connections_touch_updated_at BEFORE UPDATE ON journey_storage_connections FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER ledger_entries_touch_updated_at BEFORE UPDATE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER ledger_entry_participants_touch_updated_at BEFORE UPDATE ON ledger_entry_participants FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER ledger_settlements_touch_updated_at BEFORE UPDATE ON ledger_settlements FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER media_asset_variants_touch_updated_at BEFORE UPDATE ON media_asset_variants FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER memory_shot_artifacts_touch_updated_at BEFORE UPDATE ON memory_shot_artifacts FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER memory_shot_likes_touch_updated_at BEFORE UPDATE ON memory_shot_likes FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER memory_shot_recommendations_touch_updated_at BEFORE UPDATE ON memory_shot_recommendations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER memory_shot_templates_touch_updated_at BEFORE UPDATE ON memory_shot_templates FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER memory_shots_touch_updated_at BEFORE UPDATE ON memory_shots FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER motion_story_shares_touch_updated_at BEFORE UPDATE ON motion_story_shares FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER photo_faces_touch_updated_at BEFORE UPDATE ON photo_faces FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER places_touch_updated_at BEFORE UPDATE ON places FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER prompt_template_versions_touch_updated_at BEFORE UPDATE ON prompt_template_versions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER prompt_templates_touch_updated_at BEFORE UPDATE ON prompt_templates FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER on_trip_created_add_creator AFTER INSERT ON trips FOR EACH ROW EXECUTE FUNCTION add_trip_creator_as_member();
CREATE TRIGGER on_trip_created_add_journey_creator AFTER INSERT ON trips FOR EACH ROW EXECUTE FUNCTION add_trip_creator_as_journey_member();

alter table public."ai_cost_events" enable row level security;
alter table public."ai_job_attempts" enable row level security;
alter table public."ai_jobs" enable row level security;
alter table public."background_activity_dismissals" enable row level security;
alter table public."background_job_batches" enable row level security;
alter table public."background_jobs" enable row level security;
alter table public."capture2_media_uploads" enable row level security;
alter table public."capture_intent_rules" enable row level security;
alter table public."capture_prompt_templates" enable row level security;
alter table public."capture_routing_config" enable row level security;
alter table public."content_translations" enable row level security;
alter table public."daily_reports" enable row level security;
alter table public."i18n_locale_bundles" enable row level security;
alter table public."image_index_records" enable row level security;
alter table public."itinerary_event_participants" enable row level security;
alter table public."itinerary_events" enable row level security;
alter table public."itinerary_item_ratings" enable row level security;
alter table public."itinerary_reservation_participants" enable row level security;
alter table public."itinerary_reservations" enable row level security;
alter table public."journey_capture_events" enable row level security;
alter table public."journey_chat_messages" enable row level security;
alter table public."journey_chat_read_states" enable row level security;
alter table public."journey_exchange_rates" enable row level security;
alter table public."journey_invites" enable row level security;
alter table public."journey_ledgers" enable row level security;
alter table public."journey_live_locations" enable row level security;
alter table public."journey_map_objects" enable row level security;
alter table public."journey_member_face_embeddings" enable row level security;
alter table public."journey_members" enable row level security;
alter table public."journey_removed_users" enable row level security;
alter table public."journey_storage_connections" enable row level security;
alter table public."ledger_entries" enable row level security;
alter table public."ledger_entry_participants" enable row level security;
alter table public."ledger_exchange_rates" enable row level security;
alter table public."ledger_settlements" enable row level security;
alter table public."media_asset_variants" enable row level security;
alter table public."media_assets" enable row level security;
alter table public."memory_entries" enable row level security;
alter table public."memory_favorites" enable row level security;
alter table public."memory_likes" enable row level security;
alter table public."memory_shot_artifact_assets" enable row level security;
alter table public."memory_shot_artifacts" enable row level security;
alter table public."memory_shot_assets" enable row level security;
alter table public."memory_shot_favorites" enable row level security;
alter table public."memory_shot_likes" enable row level security;
alter table public."memory_shot_reads" enable row level security;
alter table public."memory_shot_recommendations" enable row level security;
alter table public."memory_shot_snapshots" enable row level security;
alter table public."memory_shot_templates" enable row level security;
alter table public."memory_shots" enable row level security;
alter table public."motion_story_shares" enable row level security;
alter table public."parser_aliases" enable row level security;
alter table public."parser_corrections" enable row level security;
alter table public."parser_examples" enable row level security;
alter table public."parser_parse_logs" enable row level security;
alter table public."parser_rules" enable row level security;
alter table public."photo_faces" enable row level security;
alter table public."places" enable row level security;
alter table public."profiles" enable row level security;
alter table public."prompt_template_versions" enable row level security;
alter table public."prompt_templates" enable row level security;
alter table public."trip_days" enable row level security;
alter table public."trip_members" enable row level security;
alter table public."trips" enable row level security;

create policy "Trip members can read ai cost events"
  on "public"."ai_cost_events"
  for select
  to "authenticated"
  using (((user_id = auth.uid()) OR is_trip_member_or_creator(journey_id)));

create policy "Trip members can read ai job attempts"
  on "public"."ai_job_attempts"
  for select
  to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM ai_jobs
  WHERE ((ai_jobs.id = ai_job_attempts.ai_job_id) AND ((ai_jobs.user_id = auth.uid()) OR is_trip_member_or_creator(ai_jobs.journey_id))))));

create policy "Job owners can update ai jobs"
  on "public"."ai_jobs"
  for update
  to "authenticated"
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

create policy "Trip members can create ai jobs"
  on "public"."ai_jobs"
  for insert
  to "authenticated"
  with check (((user_id = auth.uid()) AND ((journey_id IS NULL) OR is_trip_member_or_creator(journey_id))));

create policy "Trip members can read ai jobs"
  on "public"."ai_jobs"
  for select
  to "authenticated"
  using (((user_id = auth.uid()) OR is_trip_member_or_creator(journey_id)));

create policy "Users can create their background activity dismissals"
  on "public"."background_activity_dismissals"
  for insert
  to "public"
  with check ((user_id = auth.uid()));

create policy "Users can delete their background activity dismissals"
  on "public"."background_activity_dismissals"
  for delete
  to "public"
  using ((user_id = auth.uid()));

create policy "Users can read their background activity dismissals"
  on "public"."background_activity_dismissals"
  for select
  to "public"
  using ((user_id = auth.uid()));

create policy "Job owners can update background job batches"
  on "public"."background_job_batches"
  for update
  to "authenticated"
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

create policy "Journey members can create background job batches"
  on "public"."background_job_batches"
  for insert
  to "authenticated"
  with check (((user_id = auth.uid()) AND can_manage_background_jobs(journey_id, auth.uid())));

create policy "Journey members can read background job batches"
  on "public"."background_job_batches"
  for select
  to "authenticated"
  using (((user_id = auth.uid()) OR can_manage_background_jobs(journey_id, auth.uid())));

create policy "Job owners can update background jobs"
  on "public"."background_jobs"
  for update
  to "authenticated"
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

create policy "Journey members can create background jobs"
  on "public"."background_jobs"
  for insert
  to "authenticated"
  with check (((user_id = auth.uid()) AND can_manage_background_jobs(journey_id, auth.uid())));

create policy "Journey members can read background jobs"
  on "public"."background_jobs"
  for select
  to "authenticated"
  using (((user_id = auth.uid()) OR can_manage_background_jobs(journey_id, auth.uid())));

create policy "Journey members can create capture2 media uploads"
  on "public"."capture2_media_uploads"
  for insert
  to "authenticated"
  with check (((user_id = auth.uid()) AND ((EXISTS ( SELECT 1
   FROM journey_members
  WHERE ((journey_members.trip_id = capture2_media_uploads.trip_id) AND (journey_members.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM trip_members
  WHERE ((trip_members.trip_id = capture2_media_uploads.trip_id) AND (trip_members.user_id = auth.uid())))))));

create policy "Journey members can read capture2 media uploads"
  on "public"."capture2_media_uploads"
  for select
  to "authenticated"
  using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM journey_members
  WHERE ((journey_members.trip_id = capture2_media_uploads.trip_id) AND (journey_members.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM trip_members
  WHERE ((trip_members.trip_id = capture2_media_uploads.trip_id) AND (trip_members.user_id = auth.uid()))))));

create policy "Upload owners can update capture2 media uploads"
  on "public"."capture2_media_uploads"
  for update
  to "authenticated"
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

create policy "Authenticated users can manage capture intent rules"
  on "public"."capture_intent_rules"
  for all
  to "authenticated"
  using (true)
  with check (true);

create policy "Authenticated users can read capture intent rules"
  on "public"."capture_intent_rules"
  for select
  to "authenticated"
  using (true);

create policy "Authenticated users can manage capture prompt templates"
  on "public"."capture_prompt_templates"
  for all
  to "authenticated"
  using (true)
  with check (true);

create policy "Authenticated users can read capture prompt templates"
  on "public"."capture_prompt_templates"
  for select
  to "authenticated"
  using (true);

create policy "Authenticated users can manage capture routing config"
  on "public"."capture_routing_config"
  for all
  to "authenticated"
  using (true)
  with check (true);

create policy "Authenticated users can read capture routing config"
  on "public"."capture_routing_config"
  for select
  to "authenticated"
  using (true);

create policy "Admins can manage content translations"
  on "public"."content_translations"
  for all
  to "authenticated"
  using (is_system_admin())
  with check (is_system_admin());

create policy "Admins can manage locale bundles"
  on "public"."i18n_locale_bundles"
  for all
  to "authenticated"
  using (is_system_admin())
  with check (is_system_admin());

create policy "Authenticated users can read locale bundles"
  on "public"."i18n_locale_bundles"
  for select
  to "authenticated"
  using (true);

create policy "Trip members can insert image index records"
  on "public"."image_index_records"
  for insert
  to "authenticated"
  with check (is_trip_member_or_creator(journey_id));

create policy "Trip members can read image index records"
  on "public"."image_index_records"
  for select
  to "authenticated"
  using (is_trip_member_or_creator(journey_id));

create policy "Trip members can update image index records"
  on "public"."image_index_records"
  for update
  to "authenticated"
  using (is_trip_member_or_creator(journey_id))
  with check (is_trip_member_or_creator(journey_id));

create policy "Itinerary managers can delete participants"
  on "public"."itinerary_event_participants"
  for delete
  to "authenticated"
  using (can_manage_itinerary_event_participants(event_id));

create policy "Itinerary managers can insert participants"
  on "public"."itinerary_event_participants"
  for insert
  to "authenticated"
  with check (can_manage_itinerary_event_participants(event_id));

create policy "Itinerary managers can update participants"
  on "public"."itinerary_event_participants"
  for update
  to "authenticated"
  using (can_manage_itinerary_event_participants(event_id))
  with check (can_manage_itinerary_event_participants(event_id));

create policy "Trip members can read itinerary event participants"
  on "public"."itinerary_event_participants"
  for select
  to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM itinerary_events ie
  WHERE ((ie.id = itinerary_event_participants.event_id) AND is_trip_member(ie.trip_id)))));

create policy "Trip members can delete itinerary events"
  on "public"."itinerary_events"
  for delete
  to "authenticated"
  using ((is_trip_member(trip_id) OR is_trip_creator(trip_id)));

create policy "Trip members can insert itinerary events"
  on "public"."itinerary_events"
  for insert
  to "authenticated"
  with check (((created_by = auth.uid()) AND (is_trip_member(trip_id) OR is_trip_creator(trip_id))));

create policy "Trip members can read itinerary events"
  on "public"."itinerary_events"
  for select
  to "authenticated"
  using ((is_trip_member(trip_id) OR is_trip_creator(trip_id)));

create policy "Trip members can update itinerary events"
  on "public"."itinerary_events"
  for update
  to "authenticated"
  using ((is_trip_member(trip_id) OR is_trip_creator(trip_id)))
  with check ((is_trip_member(trip_id) OR is_trip_creator(trip_id)));

create policy "Trip members can insert their itinerary item ratings"
  on "public"."itinerary_item_ratings"
  for insert
  to "authenticated"
  with check (((user_id = auth.uid()) AND (is_trip_member(trip_id) OR is_trip_creator(trip_id))));

create policy "Trip members can read itinerary item ratings"
  on "public"."itinerary_item_ratings"
  for select
  to "authenticated"
  using ((is_trip_member(trip_id) OR is_trip_creator(trip_id)));

create policy "Trip members can update their itinerary item ratings"
  on "public"."itinerary_item_ratings"
  for update
  to "authenticated"
  using (((user_id = auth.uid()) AND (is_trip_member(trip_id) OR is_trip_creator(trip_id))))
  with check (((user_id = auth.uid()) AND (is_trip_member(trip_id) OR is_trip_creator(trip_id))));

create policy "Reservation managers can delete participants"
  on "public"."itinerary_reservation_participants"
  for delete
  to "authenticated"
  using (can_manage_itinerary_reservation_participants(reservation_id));

create policy "Reservation managers can insert participants"
  on "public"."itinerary_reservation_participants"
  for insert
  to "authenticated"
  with check (can_manage_itinerary_reservation_participants(reservation_id));

create policy "Reservation managers can update participants"
  on "public"."itinerary_reservation_participants"
  for update
  to "authenticated"
  using (can_manage_itinerary_reservation_participants(reservation_id))
  with check (can_manage_itinerary_reservation_participants(reservation_id));

create policy "Trip members can read itinerary reservation participants"
  on "public"."itinerary_reservation_participants"
  for select
  to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM itinerary_reservations ir
  WHERE ((ir.id = itinerary_reservation_participants.reservation_id) AND is_trip_member(ir.trip_id)))));

create policy "Trip managers can insert itinerary reservations"
  on "public"."itinerary_reservations"
  for insert
  to "authenticated"
  with check (((created_by = auth.uid()) AND is_trip_owner_or_admin(trip_id)));

create policy "Trip members can delete itinerary reservations"
  on "public"."itinerary_reservations"
  for delete
  to "authenticated"
  using (is_trip_member_or_creator(trip_id));

create policy "Trip members can read itinerary reservations"
  on "public"."itinerary_reservations"
  for select
  to "authenticated"
  using (is_trip_member(trip_id));

create policy "Trip members can update itinerary reservations"
  on "public"."itinerary_reservations"
  for update
  to "authenticated"
  using (is_trip_member_or_creator(trip_id))
  with check (is_trip_member_or_creator(trip_id));

create policy "Capture creators can update capture events"
  on "public"."journey_capture_events"
  for update
  to "authenticated"
  using (((user_id = auth.uid()) OR is_trip_owner_or_admin(journey_id)))
  with check (is_trip_member_or_creator(journey_id));

create policy "Trip members can insert capture events"
  on "public"."journey_capture_events"
  for insert
  to "authenticated"
  with check ((is_trip_member_or_creator(journey_id) AND (user_id = auth.uid())));

create policy "Trip members can read capture events"
  on "public"."journey_capture_events"
  for select
  to "authenticated"
  using (is_trip_member_or_creator(journey_id));

create policy "Trip members can insert chat messages"
  on "public"."journey_chat_messages"
  for insert
  to "authenticated"
  with check ((is_trip_member(trip_id) AND ((user_id IS NULL) OR (user_id = auth.uid()) OR ((source_type = 'timeline_memory'::text) AND (EXISTS ( SELECT 1
   FROM memory_entries memory
  WHERE ((memory.id = journey_chat_messages.source_id) AND (memory.trip_id = memory.trip_id) AND (memory.user_id = journey_chat_messages.user_id))))))));

create policy "Trip members can read chat messages"
  on "public"."journey_chat_messages"
  for select
  to "authenticated"
  using (is_trip_member(trip_id));

create policy "Users can revoke their chat messages"
  on "public"."journey_chat_messages"
  for update
  to "authenticated"
  using ((is_trip_member(trip_id) AND (user_id = auth.uid())))
  with check ((is_trip_member(trip_id) AND (user_id = auth.uid())));

create policy "Users can read their chat read state"
  on "public"."journey_chat_read_states"
  for select
  to "authenticated"
  using ((is_trip_member(trip_id) AND (user_id = auth.uid())));

create policy "Users can write their chat read state"
  on "public"."journey_chat_read_states"
  for all
  to "authenticated"
  using ((is_trip_member(trip_id) AND (user_id = auth.uid())))
  with check ((is_trip_member(trip_id) AND (user_id = auth.uid())));

create policy "Trip members can create journey exchange rates"
  on "public"."journey_exchange_rates"
  for insert
  to "authenticated"
  with check (is_trip_member_or_creator(journey_id));

create policy "Trip members can read journey exchange rates"
  on "public"."journey_exchange_rates"
  for select
  to "authenticated"
  using (is_trip_member_or_creator(journey_id));

create policy "Trip owners can update journey exchange rates"
  on "public"."journey_exchange_rates"
  for update
  to "authenticated"
  using (is_trip_owner_or_admin(journey_id))
  with check (is_trip_owner_or_admin(journey_id));

create policy "Trip owner admins can create journey invites"
  on "public"."journey_invites"
  for insert
  to "authenticated"
  with check (((created_by = auth.uid()) AND is_trip_owner_or_admin(trip_id)));

create policy "Trip owner admins can update journey invites"
  on "public"."journey_invites"
  for update
  to "authenticated"
  using (is_trip_owner_or_admin(trip_id))
  with check (is_trip_owner_or_admin(trip_id));

create policy "Trip owner admins can view journey invites"
  on "public"."journey_invites"
  for select
  to "authenticated"
  using (is_trip_owner_or_admin(trip_id));

create policy "Trip members can create journey ledger"
  on "public"."journey_ledgers"
  for insert
  to "authenticated"
  with check (is_trip_member_or_creator(journey_id));

create policy "Trip members can read journey ledger"
  on "public"."journey_ledgers"
  for select
  to "authenticated"
  using (is_trip_member_or_creator(journey_id));

create policy "Trip owners can update journey ledger"
  on "public"."journey_ledgers"
  for update
  to "authenticated"
  using (is_trip_owner_or_admin(journey_id))
  with check (is_trip_owner_or_admin(journey_id));

create policy "Journey members can read active live locations"
  on "public"."journey_live_locations"
  for select
  to "authenticated"
  using ((is_trip_member_or_creator(journey_id) AND ((is_live_enabled = true) OR (user_id = auth.uid()))));

create policy "Users can create own live location"
  on "public"."journey_live_locations"
  for insert
  to "authenticated"
  with check ((is_trip_member_or_creator(journey_id) AND (user_id = auth.uid())));

create policy "Users can delete own live location"
  on "public"."journey_live_locations"
  for delete
  to "authenticated"
  using ((is_trip_member_or_creator(journey_id) AND (user_id = auth.uid())));

create policy "Users can update own live location"
  on "public"."journey_live_locations"
  for update
  to "authenticated"
  using ((is_trip_member_or_creator(journey_id) AND (user_id = auth.uid())))
  with check ((is_trip_member_or_creator(journey_id) AND (user_id = auth.uid())));

create policy "Journey members can create map objects"
  on "public"."journey_map_objects"
  for insert
  to "authenticated"
  with check ((is_trip_member_or_creator(journey_id) AND (owner_user_id = auth.uid())));

create policy "Journey members can read map objects"
  on "public"."journey_map_objects"
  for select
  to "authenticated"
  using (((visibility = 'public'::text) OR is_trip_member_or_creator(journey_id)));

create policy "Owners can delete own map objects"
  on "public"."journey_map_objects"
  for delete
  to "authenticated"
  using ((is_trip_member_or_creator(journey_id) AND (owner_user_id = auth.uid())));

create policy "Owners can update own map objects"
  on "public"."journey_map_objects"
  for update
  to "authenticated"
  using ((is_trip_member_or_creator(journey_id) AND (owner_user_id = auth.uid())))
  with check ((is_trip_member_or_creator(journey_id) AND (owner_user_id = auth.uid())));

create policy "Trip managers can manage member face embeddings"
  on "public"."journey_member_face_embeddings"
  for all
  to "authenticated"
  using (is_trip_owner_or_admin(trip_id))
  with check (is_trip_owner_or_admin(trip_id));

create policy "Trip members can add member face embeddings"
  on "public"."journey_member_face_embeddings"
  for insert
  to "authenticated"
  with check (is_trip_member_or_creator(trip_id));

create policy "Trip members can read member face embeddings"
  on "public"."journey_member_face_embeddings"
  for select
  to "authenticated"
  using (is_trip_member_or_creator(trip_id));

create policy "Owners can create journey members"
  on "public"."journey_members"
  for insert
  to "authenticated"
  with check (is_trip_owner_or_admin(trip_id));

create policy "Owners can delete journey members"
  on "public"."journey_members"
  for delete
  to "authenticated"
  using (is_trip_owner_or_admin(trip_id));

create policy "Owners can update journey members"
  on "public"."journey_members"
  for update
  to "authenticated"
  using (is_trip_owner_or_admin(trip_id))
  with check (is_trip_owner_or_admin(trip_id));

create policy "Trip members can read journey members"
  on "public"."journey_members"
  for select
  to "authenticated"
  using (is_trip_member_or_creator(trip_id));

create policy "Owners can manage removed journey users"
  on "public"."journey_removed_users"
  for all
  to "authenticated"
  using (is_trip_owner_or_admin(trip_id))
  with check (is_trip_owner_or_admin(trip_id));

create policy "Owners can read removed journey users"
  on "public"."journey_removed_users"
  for select
  to "authenticated"
  using (is_trip_owner_or_admin(trip_id));

create policy "Trip managers can manage storage connections"
  on "public"."journey_storage_connections"
  for all
  to "authenticated"
  using (is_trip_owner_or_admin(trip_id))
  with check (is_trip_owner_or_admin(trip_id));

create policy "Trip managers can read storage connections"
  on "public"."journey_storage_connections"
  for select
  to "authenticated"
  using (is_trip_owner_or_admin(trip_id));

create policy "Trip members can read storage connections"
  on "public"."journey_storage_connections"
  for select
  to "authenticated"
  using (is_trip_member_or_creator(trip_id));

create policy "Entry creators can delete ledger entries"
  on "public"."ledger_entries"
  for delete
  to "authenticated"
  using (((created_by_user_id = auth.uid()) OR is_trip_owner_or_admin(journey_id)));

create policy "Entry creators can update ledger entries"
  on "public"."ledger_entries"
  for update
  to "authenticated"
  using (((created_by_user_id = auth.uid()) OR is_trip_owner_or_admin(journey_id)))
  with check (is_trip_member_or_creator(journey_id));

create policy "Trip members can create ledger entries"
  on "public"."ledger_entries"
  for insert
  to "authenticated"
  with check ((is_trip_member_or_creator(journey_id) AND (created_by_user_id = auth.uid())));

create policy "Trip members can read ledger entries"
  on "public"."ledger_entries"
  for select
  to "authenticated"
  using (is_trip_member_or_creator(journey_id));

create policy "Trip members can create ledger participants"
  on "public"."ledger_entry_participants"
  for insert
  to "authenticated"
  with check ((EXISTS ( SELECT 1
   FROM ledger_entries le
  WHERE ((le.id = ledger_entry_participants.ledger_entry_id) AND is_trip_member_or_creator(le.journey_id)))));

create policy "Trip members can delete ledger participants"
  on "public"."ledger_entry_participants"
  for delete
  to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM ledger_entries le
  WHERE ((le.id = ledger_entry_participants.ledger_entry_id) AND is_trip_member_or_creator(le.journey_id)))));

create policy "Trip members can read ledger participants"
  on "public"."ledger_entry_participants"
  for select
  to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM ledger_entries le
  WHERE ((le.id = ledger_entry_participants.ledger_entry_id) AND is_trip_member_or_creator(le.journey_id)))));

create policy "Trip members can update ledger participants"
  on "public"."ledger_entry_participants"
  for update
  to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM ledger_entries le
  WHERE ((le.id = ledger_entry_participants.ledger_entry_id) AND is_trip_member_or_creator(le.journey_id)))))
  with check ((EXISTS ( SELECT 1
   FROM ledger_entries le
  WHERE ((le.id = ledger_entry_participants.ledger_entry_id) AND is_trip_member_or_creator(le.journey_id)))));

create policy "Authenticated users can create exchange rates"
  on "public"."ledger_exchange_rates"
  for insert
  to "authenticated"
  with check (true);

create policy "Authenticated users can read exchange rates"
  on "public"."ledger_exchange_rates"
  for select
  to "authenticated"
  using (true);

create policy "Trip members can create ledger settlements"
  on "public"."ledger_settlements"
  for insert
  to "authenticated"
  with check (is_trip_member_or_creator(journey_id));

create policy "Trip members can read ledger settlements"
  on "public"."ledger_settlements"
  for select
  to "authenticated"
  using (is_trip_member_or_creator(journey_id));

create policy "Trip members can update ledger settlements"
  on "public"."ledger_settlements"
  for update
  to "authenticated"
  using (is_trip_member_or_creator(journey_id))
  with check (is_trip_member_or_creator(journey_id));

create policy "Trip members can insert media assets"
  on "public"."media_assets"
  for insert
  to "authenticated"
  with check (((user_id = auth.uid()) AND (is_trip_member(trip_id) OR is_trip_creator(trip_id))));

create policy "Trip members can read media assets"
  on "public"."media_assets"
  for select
  to "authenticated"
  using ((is_trip_member(trip_id) OR is_trip_creator(trip_id)));

create policy "Users can delete their own media assets"
  on "public"."media_assets"
  for delete
  to "authenticated"
  using ((user_id = auth.uid()));

create policy "Users can update their own media assets"
  on "public"."media_assets"
  for update
  to "authenticated"
  using ((user_id = auth.uid()))
  with check (((user_id = auth.uid()) AND (is_trip_member(trip_id) OR is_trip_creator(trip_id))));

create policy "Trip members can insert memory entries"
  on "public"."memory_entries"
  for insert
  to "authenticated"
  with check (((auth.uid() IS NOT NULL) AND (user_id = auth.uid()) AND (is_trip_member(trip_id) OR is_trip_creator(trip_id))));

create policy "Trip members can read memory entries"
  on "public"."memory_entries"
  for select
  to "authenticated"
  using ((is_trip_member(trip_id) OR is_trip_creator(trip_id)));

create policy "Users can update their own memory entries"
  on "public"."memory_entries"
  for update
  to "authenticated"
  using ((user_id = auth.uid()))
  with check (((user_id = auth.uid()) AND (is_trip_member(trip_id) OR is_trip_creator(trip_id))));

create policy "Trip members can read memory favorites"
  on "public"."memory_favorites"
  for select
  to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM memory_entries me
  WHERE ((me.id = memory_favorites.memory_entry_id) AND is_trip_member(me.trip_id)))));

create policy "Users can delete own memory favorites"
  on "public"."memory_favorites"
  for delete
  to "authenticated"
  using ((user_id = auth.uid()));

create policy "Users can insert own memory favorites"
  on "public"."memory_favorites"
  for insert
  to "authenticated"
  with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM memory_entries me
  WHERE ((me.id = memory_favorites.memory_entry_id) AND is_trip_member(me.trip_id))))));

create policy "Trip members can read memory likes"
  on "public"."memory_likes"
  for select
  to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM memory_entries me
  WHERE ((me.id = memory_likes.memory_entry_id) AND is_trip_member(me.trip_id)))));

create policy "Users can delete own memory likes"
  on "public"."memory_likes"
  for delete
  to "authenticated"
  using ((user_id = auth.uid()));

create policy "Users can insert own memory likes"
  on "public"."memory_likes"
  for insert
  to "authenticated"
  with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM memory_entries me
  WHERE ((me.id = memory_likes.memory_entry_id) AND is_trip_member(me.trip_id))))));

create policy "Users can update own memory likes"
  on "public"."memory_likes"
  for update
  to "authenticated"
  using ((user_id = auth.uid()))
  with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM memory_entries me
  WHERE ((me.id = memory_likes.memory_entry_id) AND is_trip_member(me.trip_id))))));

create policy "Authors and owners can manage memory shot artifact assets"
  on "public"."memory_shot_artifact_assets"
  for all
  to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM (memory_shot_artifacts artifact
     JOIN memory_shots shot ON ((shot.id = artifact.memory_shot_id)))
  WHERE ((artifact.id = memory_shot_artifact_assets.artifact_id) AND ((shot.author_user_id = auth.uid()) OR is_trip_owner_or_admin(shot.journey_id))))))
  with check ((EXISTS ( SELECT 1
   FROM (memory_shot_artifacts artifact
     JOIN memory_shots shot ON ((shot.id = artifact.memory_shot_id)))
  WHERE ((artifact.id = memory_shot_artifact_assets.artifact_id) AND ((shot.author_user_id = auth.uid()) OR is_trip_owner_or_admin(shot.journey_id))))));

create policy "Journey members can read memory shot artifact assets"
  on "public"."memory_shot_artifact_assets"
  for select
  to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM (memory_shot_artifacts artifact
     JOIN memory_shots shot ON ((shot.id = artifact.memory_shot_id)))
  WHERE ((artifact.id = memory_shot_artifact_assets.artifact_id) AND (((shot.visibility = 'private'::text) AND (shot.author_user_id = auth.uid())) OR ((shot.visibility <> 'private'::text) AND is_trip_member_or_creator(shot.journey_id)) OR is_trip_owner_or_admin(shot.journey_id))))));

create policy "Authors and owners can create memory shot artifacts"
  on "public"."memory_shot_artifacts"
  for insert
  to "authenticated"
  with check ((EXISTS ( SELECT 1
   FROM memory_shots shot
  WHERE ((shot.id = memory_shot_artifacts.memory_shot_id) AND ((shot.author_user_id = auth.uid()) OR is_trip_owner_or_admin(shot.journey_id))))));

create policy "Authors and owners can delete memory shot artifacts"
  on "public"."memory_shot_artifacts"
  for delete
  to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM memory_shots shot
  WHERE ((shot.id = memory_shot_artifacts.memory_shot_id) AND ((shot.author_user_id = auth.uid()) OR is_trip_owner_or_admin(shot.journey_id))))));

create policy "Authors and owners can update memory shot artifacts"
  on "public"."memory_shot_artifacts"
  for update
  to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM memory_shots shot
  WHERE ((shot.id = memory_shot_artifacts.memory_shot_id) AND ((shot.author_user_id = auth.uid()) OR is_trip_owner_or_admin(shot.journey_id))))))
  with check ((EXISTS ( SELECT 1
   FROM memory_shots shot
  WHERE ((shot.id = memory_shot_artifacts.memory_shot_id) AND ((shot.author_user_id = auth.uid()) OR is_trip_owner_or_admin(shot.journey_id))))));

create policy "Journey members can read memory shot artifacts"
  on "public"."memory_shot_artifacts"
  for select
  to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM memory_shots shot
  WHERE ((shot.id = memory_shot_artifacts.memory_shot_id) AND (((shot.visibility = 'private'::text) AND (shot.author_user_id = auth.uid())) OR ((shot.visibility <> 'private'::text) AND is_trip_member_or_creator(shot.journey_id)) OR is_trip_owner_or_admin(shot.journey_id))))));

create policy "Authors and owners can manage memory shot assets"
  on "public"."memory_shot_assets"
  for all
  to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM memory_shots shot
  WHERE ((shot.id = memory_shot_assets.memory_shot_id) AND ((shot.author_user_id = auth.uid()) OR is_trip_owner_or_admin(shot.journey_id))))))
  with check ((is_trip_member_or_creator(journey_id) AND (EXISTS ( SELECT 1
   FROM memory_shots shot
  WHERE ((shot.id = memory_shot_assets.memory_shot_id) AND (shot.journey_id = memory_shot_assets.journey_id) AND ((shot.author_user_id = auth.uid()) OR is_trip_owner_or_admin(shot.journey_id)))))));

create policy "Journey members can read memory shot assets"
  on "public"."memory_shot_assets"
  for select
  to "authenticated"
  using (is_trip_member_or_creator(journey_id));

create policy "Journey members can read memory shot favorites"
  on "public"."memory_shot_favorites"
  for select
  to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM memory_shots shot
  WHERE ((shot.id = memory_shot_favorites.memory_shot_id) AND is_trip_member_or_creator(shot.journey_id)))));

create policy "Users can delete own memory shot favorites"
  on "public"."memory_shot_favorites"
  for delete
  to "authenticated"
  using ((user_id = auth.uid()));

create policy "Users can insert own memory shot favorites"
  on "public"."memory_shot_favorites"
  for insert
  to "authenticated"
  with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM memory_shots shot
  WHERE ((shot.id = memory_shot_favorites.memory_shot_id) AND is_trip_member_or_creator(shot.journey_id))))));

create policy "Journey members can read memory shot likes"
  on "public"."memory_shot_likes"
  for select
  to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM memory_shots shot
  WHERE ((shot.id = memory_shot_likes.memory_shot_id) AND is_trip_member_or_creator(shot.journey_id)))));

create policy "Users can delete own memory shot likes"
  on "public"."memory_shot_likes"
  for delete
  to "authenticated"
  using ((user_id = auth.uid()));

create policy "Users can insert own memory shot likes"
  on "public"."memory_shot_likes"
  for insert
  to "authenticated"
  with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM memory_shots shot
  WHERE ((shot.id = memory_shot_likes.memory_shot_id) AND is_trip_member_or_creator(shot.journey_id))))));

create policy "Users can update own memory shot likes"
  on "public"."memory_shot_likes"
  for update
  to "authenticated"
  using ((user_id = auth.uid()))
  with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM memory_shots shot
  WHERE ((shot.id = memory_shot_likes.memory_shot_id) AND is_trip_member_or_creator(shot.journey_id))))));

create policy "Journey members can read memory shot reads"
  on "public"."memory_shot_reads"
  for select
  to "authenticated"
  using (is_trip_member_or_creator(journey_id));

create policy "Users can mark own memory shot reads"
  on "public"."memory_shot_reads"
  for insert
  to "authenticated"
  with check (((user_id = auth.uid()) AND is_trip_member_or_creator(journey_id)));

create policy "Users can update own memory shot reads"
  on "public"."memory_shot_reads"
  for update
  to "authenticated"
  using ((user_id = auth.uid()))
  with check (((user_id = auth.uid()) AND is_trip_member_or_creator(journey_id)));

create policy "Journey members can create memory shot recommendations"
  on "public"."memory_shot_recommendations"
  for insert
  to "authenticated"
  with check ((is_trip_member_or_creator(journey_id) AND ((user_id IS NULL) OR (user_id = auth.uid()))));

create policy "Journey members can read memory shot recommendations"
  on "public"."memory_shot_recommendations"
  for select
  to "authenticated"
  using (is_trip_member_or_creator(journey_id));

create policy "Recommendation owners can update memory shot recommendations"
  on "public"."memory_shot_recommendations"
  for update
  to "authenticated"
  using ((is_trip_owner_or_admin(journey_id) OR (user_id = auth.uid())))
  with check ((is_trip_owner_or_admin(journey_id) OR (user_id = auth.uid())));

create policy "Authors and owners can manage memory shot snapshots"
  on "public"."memory_shot_snapshots"
  for all
  to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM memory_shots shot
  WHERE ((shot.id = memory_shot_snapshots.memory_shot_id) AND ((shot.author_user_id = auth.uid()) OR is_trip_owner_or_admin(shot.journey_id))))))
  with check ((is_trip_member_or_creator(journey_id) AND (EXISTS ( SELECT 1
   FROM memory_shots shot
  WHERE ((shot.id = memory_shot_snapshots.memory_shot_id) AND (shot.journey_id = memory_shot_snapshots.journey_id) AND ((shot.author_user_id = auth.uid()) OR is_trip_owner_or_admin(shot.journey_id)))))));

create policy "Journey members can read memory shot snapshots"
  on "public"."memory_shot_snapshots"
  for select
  to "authenticated"
  using (is_trip_member_or_creator(journey_id));

create policy "Authenticated users can read active memory shot templates"
  on "public"."memory_shot_templates"
  for select
  to "authenticated"
  using (((status = 'active'::text) OR is_system_admin(auth.uid())));

create policy "System admins can manage memory shot templates"
  on "public"."memory_shot_templates"
  for all
  to "authenticated"
  using (is_system_admin(auth.uid()))
  with check (is_system_admin(auth.uid()));

create policy "Authors and owners can delete memory shots"
  on "public"."memory_shots"
  for delete
  to "authenticated"
  using (((author_user_id = auth.uid()) OR is_trip_owner_or_admin(journey_id)));

create policy "Authors and owners can update memory shots"
  on "public"."memory_shots"
  for update
  to "authenticated"
  using (((author_user_id = auth.uid()) OR is_trip_owner_or_admin(journey_id)))
  with check (((author_user_id = auth.uid()) OR is_trip_owner_or_admin(journey_id)));

create policy "Journey members can create memory shots"
  on "public"."memory_shots"
  for insert
  to "authenticated"
  with check (((author_user_id = auth.uid()) AND is_trip_member_or_creator(journey_id)));

create policy "Journey members can read memory shots"
  on "public"."memory_shots"
  for select
  to "authenticated"
  using ((((visibility = 'private'::text) AND (author_user_id = auth.uid())) OR ((visibility <> 'private'::text) AND is_trip_member_or_creator(journey_id)) OR is_trip_owner_or_admin(journey_id)));

create policy "Creators and owners can update motion story shares"
  on "public"."motion_story_shares"
  for update
  to "authenticated"
  using (((created_by = auth.uid()) OR is_trip_owner_or_admin(journey_id)))
  with check (((created_by = auth.uid()) OR is_trip_owner_or_admin(journey_id)));

create policy "Journey members can create motion story shares"
  on "public"."motion_story_shares"
  for insert
  to "authenticated"
  with check (((created_by = auth.uid()) AND is_trip_member_or_creator(journey_id) AND (EXISTS ( SELECT 1
   FROM (memory_shot_artifacts artifact
     JOIN memory_shots shot ON ((shot.id = artifact.memory_shot_id)))
  WHERE ((artifact.id = motion_story_shares.artifact_id) AND (shot.id = motion_story_shares.memory_shot_id) AND (shot.journey_id = motion_story_shares.journey_id) AND (artifact.artifact_type = 'motion_story'::text) AND (artifact.variant = 'immersive_scroll_story'::text) AND (artifact.status = 'ready'::text))))));

create policy "Journey members can read motion story shares"
  on "public"."motion_story_shares"
  for select
  to "authenticated"
  using (((created_by = auth.uid()) OR is_trip_member_or_creator(journey_id) OR is_trip_owner_or_admin(journey_id)));

create policy "Parser aliases are manageable by authenticated users"
  on "public"."parser_aliases"
  for all
  to "authenticated"
  using (true)
  with check (true);

create policy "Parser aliases are readable by authenticated users"
  on "public"."parser_aliases"
  for select
  to "authenticated"
  using (true);

create policy "Parser corrections are manageable by authenticated users"
  on "public"."parser_corrections"
  for all
  to "authenticated"
  using (true)
  with check (true);

create policy "Parser examples are manageable by authenticated users"
  on "public"."parser_examples"
  for all
  to "authenticated"
  using (true)
  with check (true);

create policy "Parser examples are readable by authenticated users"
  on "public"."parser_examples"
  for select
  to "authenticated"
  using (true);

create policy "Parser logs are manageable by authenticated users"
  on "public"."parser_parse_logs"
  for all
  to "authenticated"
  using (true)
  with check (true);

create policy "Parser rules are manageable by authenticated users"
  on "public"."parser_rules"
  for all
  to "authenticated"
  using (true)
  with check (true);

create policy "Parser rules are readable by authenticated users"
  on "public"."parser_rules"
  for select
  to "authenticated"
  using (true);

create policy "Trip managers can delete photo faces"
  on "public"."photo_faces"
  for delete
  to "authenticated"
  using (is_trip_owner_or_admin(trip_id));

create policy "Trip managers can update photo faces"
  on "public"."photo_faces"
  for update
  to "authenticated"
  using (is_trip_owner_or_admin(trip_id))
  with check (is_trip_owner_or_admin(trip_id));

create policy "Trip members can confirm photo faces"
  on "public"."photo_faces"
  for update
  to "authenticated"
  using (is_trip_member_or_creator(trip_id))
  with check (is_trip_member_or_creator(trip_id));

create policy "Trip members can insert photo faces"
  on "public"."photo_faces"
  for insert
  to "authenticated"
  with check (is_trip_member_or_creator(trip_id));

create policy "Trip members can read photo faces"
  on "public"."photo_faces"
  for select
  to "authenticated"
  using (is_trip_member_or_creator(trip_id));

create policy "Authenticated users can insert places cache"
  on "public"."places"
  for insert
  to "authenticated"
  with check (true);

create policy "Authenticated users can read places cache"
  on "public"."places"
  for select
  to "authenticated"
  using (true);

create policy "Authenticated users can update places cache"
  on "public"."places"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "Profiles are readable by authenticated users"
  on "public"."profiles"
  for select
  to "authenticated"
  using (true);

create policy "Users can insert their own profile"
  on "public"."profiles"
  for insert
  to "authenticated"
  with check ((id = auth.uid()));

create policy "Users can update own profile"
  on "public"."profiles"
  for update
  to "authenticated"
  using ((id = auth.uid()))
  with check ((id = auth.uid()));

create policy "Users can update their own profile"
  on "public"."profiles"
  for update
  to "authenticated"
  using ((id = auth.uid()))
  with check ((id = auth.uid()));

create policy "Authenticated users can read prompt template versions"
  on "public"."prompt_template_versions"
  for select
  to "authenticated"
  using (true);

create policy "System admins can manage prompt template versions"
  on "public"."prompt_template_versions"
  for all
  to "authenticated"
  using (is_system_admin(auth.uid()))
  with check (is_system_admin(auth.uid()));

create policy "Authenticated users can read prompt templates"
  on "public"."prompt_templates"
  for select
  to "authenticated"
  using (true);

create policy "System admins can manage prompt templates"
  on "public"."prompt_templates"
  for all
  to "authenticated"
  using (is_system_admin(auth.uid()))
  with check (is_system_admin(auth.uid()));

create policy "Trip managers can delete trip days"
  on "public"."trip_days"
  for delete
  to "authenticated"
  using (((created_by = auth.uid()) OR is_trip_owner_or_admin(trip_id)));

create policy "Trip managers can insert trip days"
  on "public"."trip_days"
  for insert
  to "authenticated"
  with check (((created_by = auth.uid()) AND is_trip_owner_or_admin(trip_id)));

create policy "Trip managers can update trip days"
  on "public"."trip_days"
  for update
  to "authenticated"
  using (((created_by = auth.uid()) OR is_trip_owner_or_admin(trip_id)))
  with check (is_trip_owner_or_admin(trip_id));

create policy "Trip members can read trip days"
  on "public"."trip_days"
  for select
  to "authenticated"
  using (is_trip_member(trip_id));

create policy "Trip creators can add trip members"
  on "public"."trip_members"
  for insert
  to "authenticated"
  with check (is_trip_creator(trip_id));

create policy "Users can add themselves to trips they created"
  on "public"."trip_members"
  for insert
  to "authenticated"
  with check (((user_id = auth.uid()) AND (role = 'owner'::text) AND is_trip_creator(trip_id)));

create policy "Authenticated users can create trips"
  on "public"."trips"
  for insert
  to "authenticated"
  with check (((auth.uid() IS NOT NULL) AND (created_by = auth.uid())));

create policy "Trip creators can delete trips"
  on "public"."trips"
  for delete
  to "authenticated"
  using ((created_by = auth.uid()));

create policy "Trip members can read trips"
  on "public"."trips"
  for select
  to "authenticated"
  using ((is_trip_member(id) OR (created_by = auth.uid())));

create policy "Trip owners and admins can update trip settings"
  on "public"."trips"
  for update
  to "authenticated"
  using (is_trip_owner_or_admin(id))
  with check (is_trip_owner_or_admin(id));

create policy "Journey members can read memory shot previews"
  on "storage"."objects"
  for select
  to "authenticated"
  using (((bucket_id = 'memory-shot-renders'::text) AND can_access_memory_shot_preview(name)));

create policy "Journey members can update memory shot previews"
  on "storage"."objects"
  for update
  to "authenticated"
  using (((bucket_id = 'memory-shot-renders'::text) AND can_access_memory_shot_preview(name)))
  with check (((bucket_id = 'memory-shot-renders'::text) AND can_access_memory_shot_preview(name)));

create policy "Journey members can upload memory shot previews"
  on "storage"."objects"
  for insert
  to "authenticated"
  with check (((bucket_id = 'memory-shot-renders'::text) AND can_access_memory_shot_preview(name)));

create policy "Trip members can read trip media"
  on "storage"."objects"
  for select
  to "authenticated"
  using (((bucket_id = 'trip-media'::text) AND can_access_trip_media(name)));

create policy "Trip members can upload trip media"
  on "storage"."objects"
  for insert
  to "authenticated"
  with check (((bucket_id = 'trip-media'::text) AND can_upload_trip_media(name)));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memory-shot-renders', 'memory-shot-renders', false, null, null)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-media', 'trip-media', false, null, null)
on conflict (id) do nothing;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
