# Supabase Development Environment Audit

Date: 2026-09-10

## Scope And Method

This is a read-only static audit of the legacy OTR Web/backend repository at `/Users/xoery/Project/otr`. No production API, database, Supabase dashboard, migration history table, Auth user, Storage object, environment variable, or legacy source file was changed. Environment files were inspected only for variable names, whether required Supabase values are configured, and the configured Supabase hostname; secret values were not copied into this document.

The audit covers checked-in SQL, TypeScript access paths, checked-in example configuration, and local Git history. Because production was not queried, the live effective schema, policy set, Auth settings, Storage contents, extensions, webhooks, and Dashboard-only configuration remain unverified.

## Executive Finding

The legacy repository contains broad schema coverage, but it is not currently a reliable clean-room bootstrap source.

- The configured Web environment points to one hosted Supabase project: `bobwhxjxqpehzecwmwqe.supabase.co`.
- Browser code uses an anon-key Supabase singleton directly. Next.js API routes also access Supabase directly, usually with an anon key plus the caller's Bearer token; selected server-only jobs use the service-role key.
- The repository contains 76 SQL migration files defining 64 public application tables, extensive indexes/checks/FKs, RLS, 29 named database functions, 32 named triggers, two private Storage buckets, and several reference-data inserts.
- A fresh migration replay is expected to fail: lexicographic migration `002_media_assets.sql` references core tables created only in `20260624000000_otr_phase_2_schema.sql`.
- Six migration versions are duplicated: `036`, `037`, `043`, `048`, `049`, and `061`.
- There is no checked-in `supabase/config.toml`, `supabase/seed.sql`, Edge Functions directory, generated database types, or reproducible record of Dashboard Auth settings.
- Production's actual migration ledger and schema drift cannot be determined from the repository alone.

Creating a Dev project before resolving these issues would likely produce an incomplete or divergent database.

## Current Supabase Usage

### Browser Client

`src/lib/supabase/client.ts` creates one browser client from `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with session persistence, automatic token refresh, and URL session detection enabled. `src/lib/supabase/session-fallback.ts` adds browser-storage fallback and manually restores access/refresh tokens.

The browser-facing data modules under `src/lib/supabase/`, pages, providers, and components directly query business tables. Static literal analysis found direct browser-side access to 28 tables, including trips/members, itinerary, ledger, media, memories, chat, location, capture, and profile data. This is a legacy Web pattern and must not be copied into OTR Mobile, whose approved boundary requires an OTR Backend API.

### Server Access

Next.js route handlers and server libraries contain at least 74 files that create or use Supabase clients.

- Request-scoped access generally uses the anon key and forwards the incoming `Authorization` header. This preserves user identity and RLS.
- Eleven files reference `SUPABASE_SERVICE_ROLE_KEY` for privileged media maintenance, place resolution, i18n jobs, prompt-center work, story refresh, render storage, and share access.
- Service-role clients disable session persistence/refresh and bypass RLS. They must remain server-only and use a Dev-only key in a Dev deployment.
- Some helpers fall back from service role to anon behavior. Dev validation must exercise both configured and missing-service-key paths.

### No Mobile Direct Access

The current OTR Mobile repository does not access Supabase business tables directly. Its approved architecture keeps Supabase behind a typed OTR Backend API and uses Supabase only as the identity-provider direction.

## Application Table Inventory

The migration directory declares 64 unique public application tables. The following is the complete grouped inventory.

### Identity, Trips, And Membership

- `profiles`
- `trips`
- `trip_members`
- `journey_members`
- `journey_removed_users`
- `journey_invites`

`profiles.id` references `auth.users.id`. `trips.created_by` references `profiles`. Both `trip_members` and the newer `journey_members` model coexist and reference `trips` and `profiles`; many policies deliberately check one or both models.

### Planner, Itinerary, And Location

- `trip_days`
- `itinerary_events`
- `itinerary_reservations`
- `itinerary_event_participants`
- `itinerary_reservation_participants`
- `itinerary_item_ratings`
- `places`
- `journey_map_objects`
- `journey_live_locations`

Planner rows are rooted in `trips`. Events/reservations link to trip days, profiles, places, and each other where later migrations add associations. Participant tables were migrated from profile references toward `journey_members` references.

### Ledger

- `journey_ledgers`
- `ledger_entries`
- `ledger_entry_participants`
- `ledger_exchange_rates`
- `journey_exchange_rates`
- `ledger_settlements`

Ledger entries depend on trips, profiles, journey members, and optionally itinerary events/reservations, memories, and places. Participants and settlements depend on journey-member identities. Both global ledger exchange rates and journey snapshots exist.

### Capture, Media, And Photo Indexing

- `memory_entries`
- `daily_reports`
- `media_assets`
- `media_asset_variants`
- `image_index_records`
- `photo_faces`
- `journey_member_face_embeddings`
- `journey_storage_connections`
- `journey_capture_events`
- `capture2_media_uploads`

These tables contain the highest-volume and most sensitive content: file references, Storage paths, provider identifiers, EXIF/GPS, OCR, scene/AI metadata, face embeddings, external-drive token references, staging URLs, and processing state.

### Chat, Engagement, And Generated Memory Content

- `journey_chat_messages`
- `journey_chat_read_states`
- `memory_likes`
- `memory_favorites`
- `memory_shots`
- `memory_shot_assets`
- `memory_shot_snapshots`
- `memory_shot_templates`
- `memory_shot_recommendations`
- `memory_shot_likes`
- `memory_shot_favorites`
- `memory_shot_reads`
- `memory_shot_artifacts`
- `memory_shot_artifact_assets`
- `motion_story_shares`

Generated content is rooted in trips and Auth users and links to media/memory assets. Public share records and engagement rows carry user or share-access information.

### Jobs, AI, Capture Configuration, Parser, And Localization

- `background_jobs`
- `background_job_batches`
- `background_activity_dismissals`
- `ai_jobs`
- `ai_job_attempts`
- `ai_cost_events`
- `capture_intent_rules`
- `capture_prompt_templates`
- `capture_routing_config`
- `parser_rules`
- `parser_examples`
- `parser_aliases`
- `parser_corrections`
- `parser_parse_logs`
- `prompt_templates`
- `prompt_template_versions`
- `i18n_locale_bundles`
- `content_translations`

These tables contain operational payloads, errors, model/provider information, prompt text, parser corrections/logs, token/cost metadata, and generated translations. They should be seeded selectively, not copied wholesale from production.

## Schema Dependency Summary

The main dependency spine is:

```text
auth.users
  -> profiles
      -> trips
          -> trip_members / journey_members / journey_invites
          -> trip_days -> itinerary_events / itinerary_reservations
          -> journey_ledgers -> ledger_entries -> participants
          -> memory_entries -> media_assets -> variants / faces / indexing
          -> chat / map / live location / capture
          -> background_jobs -> ai_jobs -> attempts / cost events
          -> memory_shots -> assets / snapshots / artifacts / engagement / shares
```

Important cross-domain dependencies:

- `itinerary_events` and `itinerary_reservations` link to trip days, profiles, places, participant rows, and later each other.
- `ledger_entries` optionally link to itinerary events, reservations, memories, places, and journey members.
- `memory_entries` can link to itinerary data, trip days, places, and a parent memory.
- `media_assets` link to memories, profiles, places, faces, variants, image indexes, and generated artifacts.
- `capture2_media_uploads` can link to trips, users, days, itinerary rows, memory rows, media assets, and background jobs.
- RLS helper functions depend on both membership models; migration order must preserve those functions before dependent policies are created.
- Storage policies parse object paths and depend on trip membership functions.

FK deletion behavior is mostly `cascade` for trip-owned data and `set null` for optional creator/source references. A canonical schema should preserve each existing FK action exactly and test cascade behavior before any Dev data is loaded.

## Migration Audit

### What Exists

- 76 checked-in SQL files under `supabase/migrations/`.
- The migrations use `pgcrypto`, public tables, constraints, indexes, RLS, policies, functions, triggers, grants, Storage bucket inserts, and reference-data upserts.
- Most migrations use idempotent `IF NOT EXISTS` or policy drop/create patterns, but idempotency does not fix dependency ordering or duplicate versions.

### Reproducibility Problems

1. There is no `001` baseline migration.
2. `002_media_assets.sql` depends on `trips`, `profiles`, `memory_entries`, `is_trip_member`, and `auth.uid()`. Those core public objects are created only in `20260624000000_otr_phase_2_schema.sql`, which sorts after all `002-067` files in a clean replay.
3. Migration versions `036`, `037`, `043`, `048`, `049`, and `061` each have two different SQL files. Supabase migration versions must be unique for deterministic ledger tracking.
4. The timestamped baseline was introduced before many numbered files in Git history, but its filename does not preserve that historical application order.
5. No checked-in `supabase/config.toml` captures local project/Auth/Storage behavior, and no `supabase/seed.sql` defines a supported Dev dataset.
6. The checked-in chain has not been demonstrated with a clean local `supabase db reset` in this audit.
7. Production's `supabase_migrations.schema_migrations` ledger was not queried, so manually applied SQL, skipped files, Dashboard-created objects, or drift may exist.
8. `040_system_account_roles.sql` contains a hard-coded production administrator email. That identity bootstrap must not be carried into Dev as an implicit production dependency.

Conclusion: the current files are useful source material but are not complete enough to recreate the database safely without first producing and testing a canonical baseline.

## RLS Audit

All 64 migration-created application tables have at least one checked-in `ENABLE ROW LEVEL SECURITY` statement. The migration history contains 234 `CREATE POLICY` statements, including replacements over time; this is a historical count, not the final effective production policy count.

Policy families include:

- authenticated profile visibility and self-update;
- trip creator/member/admin access;
- dual `trip_members` and `journey_members` compatibility;
- creator/owner mutation rules for itinerary, ledger, media, memory, chat, maps, and generated artifacts;
- self-only live location, likes/favorites/reads, dismissals, and uploads;
- system-admin access to prompts, account roles, and localization;
- Storage object path checks for private buckets.

Security-sensitive observations:

- Parser and capture configuration migrations grant broad management access to any authenticated user. Confirm whether this is still intended before reproducing it.
- `places` is readable/insertable/updatable by any authenticated user as a shared cache.
- `profiles` is readable by any authenticated user.
- Service-role paths bypass every RLS policy and require separate endpoint authorization tests.
- Many `SECURITY DEFINER` functions set an explicit search path, which is good, but final grants and effective definitions must be compared against a production schema-only export.
- Historical policy replacement makes static review insufficient to certify the live final state.

## Auth Configuration

The code uses:

- Google OAuth for normal sign-in;
- email OTP/magic-link sign-in;
- PKCE/code exchange and legacy hash-token callback handling;
- Google OAuth again with `openid`, `email`, `profile`, and `drive.file` scopes plus offline consent for Google Drive storage;
- browser session persistence, auto refresh, URL detection, and a localStorage fallback.

Auth-related database behavior includes profile creation/upsert from Auth user metadata, trip creator membership triggers, invite acceptance/claim RPCs, email-based invite claiming, and RPCs that read `auth.users` under controlled `SECURITY DEFINER` access.

Not present in version control:

- Google provider enabled/disabled state and client credentials;
- Site URL and allowed redirect URLs;
- email provider, SMTP, templates, rate limits, and confirmation settings;
- JWT/session lifetimes and refresh-token policy;
- CAPTCHA, MFA, password, anonymous-sign-in, or hook settings;
- production Auth users.

These settings must be captured manually from the production Dashboard as configuration facts, without copying production secrets or users.

## Storage

Checked-in SQL creates two private Supabase Storage buckets:

- `trip-media`
- `memory-shot-renders`

`trip-media` policies use path structure and membership helpers to authorize upload/read. Browser and server code creates signed URLs and uploads/downloads legacy media from this bucket. `memory-shot-renders` has helper/policies for generated previews and renders.

The application also supports non-Supabase providers recorded in database rows:

- Google Drive for originals and some derived assets;
- `hetzner_disk` for media variants;
- Vercel Blob for temporary direct-upload staging;
- OneDrive appears in enums/product UI but no complete provider integration was found.

No production Storage object should be copied to Dev. Dev should use empty buckets plus tiny synthetic fixtures with non-sensitive filenames and content.

## Functions, Triggers, Edge Functions, And Realtime

The SQL defines 29 named database functions. Major families include:

- membership/access helpers: `is_trip_member`, `is_trip_creator`, `is_trip_member_or_creator`, `is_trip_owner_or_admin`;
- Storage helpers: `can_access_trip_media`, `can_upload_trip_media`, `can_access_memory_shot_preview`;
- membership/invite actions: `accept_journey_invite`, `claim_journey_member`, `claim_email_invited_journeys`, `remove_journey_member`, `get_trip_members_for_current_user`, `get_journey_members_for_current_user`;
- admin/account role RPCs: `is_system_admin`, `list_account_roles`, `search_account_roles`, `update_profile_account_role`;
- itinerary participant management, live-location access, chat revoke, memory delete, and timestamp/creator bootstrap helpers.

The SQL defines 32 named triggers, primarily `updated_at` maintenance plus trip-creator membership bootstrap and profile role protection.

No `supabase/functions/` directory or Edge Function source exists. No checked-in Realtime publication or replica-identity configuration was found. Dashboard-created functions, hooks, cron jobs, webhooks, Realtime tables, or Vault secrets cannot be ruled out without a production metadata export.

## Required Environment Variables

### Supabase Core

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)

Some service example files use the equivalent names `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Standardize names per deployment rather than sharing the production values.

### Auth And Google Drive

- `NEXT_PUBLIC_APP_URL`, `OTR_BASE_URL`, or deployment-derived `VERCEL_URL`
- `GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_STATE_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`

### Storage, Media, And Workers

- `BLOB_READ_WRITE_TOKEN`
- `MEDIA_WORKER_URL`, `MEDIA_WORKER_FALLBACK_URL`, `MEDIA_WORKER_SECRET`
- `MEDIA_INGEST_SECRET`, `MEDIA_CACHE_CRON_SECRET`
- `MEDIA_CACHE_DIR`, `MEDIA_ROOT`, `MEDIA_PUBLIC_BASE_URL`
- `IMAGE_INDEX_SERVICE_URL`, `AI_SERVER_URL`, `AI_SERVER_SECRET`
- `FACE_SERVICE_URL`, `FACE_SERVICE_SECRET`
- `STT_SERVICE_URL`

### AI, Translation, Maps, And Routing

- OpenAI-compatible: `OPENAI_API_KEY`, model/base URL variables
- DeepSeek: `DEEPSEEK_API_KEY`, model/base URL variables
- Alibaba/DashScope/Bailian: API key, model, and base URL variables
- translation provider/base URL/API key variables
- `GOOGLE_MAPS_API_KEY`, `MAPBOX_ACCESS_TOKEN`
- geocoding and OSRM base URL/user-agent variables
- `I18N_JOB_SECRET`

Dev must use separate credentials or disabled integrations. Production values must never be copied into a Dev `.env` or Supabase secret store.

## Seed And Reference Data

Checked-in migrations already seed or upsert:

- capture intent rules;
- capture prompt templates;
- capture routing configuration;
- prompt-center templates and active prompt versions;
- default memory-shot templates;
- the two Storage bucket records.

A minimally usable Dev environment additionally needs synthetic data:

1. Two or more Dev Auth users with non-production email addresses.
2. Matching `profiles` rows, with one explicitly designated Dev admin through a safe seed mechanism rather than the hard-coded production email.
3. One synthetic trip and both membership representations where compatibility must be tested.
4. Trip days, one itinerary event, one reservation, participants, one ledger, one expense, and exchange-rate fixtures.
5. One memory/media metadata row and tiny non-sensitive Storage objects for signed URL/policy tests.
6. Optional synthetic chat, live-location, background-job, AI-job, and capture rows for policy coverage.
7. At least one active locale bundle or a documented process for generating it from checked-in locale sources.

Seed IDs and timestamps should be deterministic where practical. Seeds must be idempotent and tagged as synthetic.

## Production Data That Must Not Be Copied

- `auth.users`, identities, sessions, refresh tokens, MFA data, or real email addresses.
- Production service-role/anon keys, OAuth secrets, encryption keys, worker secrets, API keys, SMTP credentials, and webhook secrets.
- Real profiles, trip memberships, invite tokens/emails, removed-user records, or administrator identity mappings.
- Itineraries, booking references, URLs, documents, tickets, QR payloads, ledger entries, splits, settlements, or exchange-rate history tied to real travellers.
- Chat, capture, memory, generated stories, parser logs/corrections, translations of private content, job payloads/results/errors, and AI cost records.
- Live locations, GPS/EXIF, OCR text, face detections/embeddings, or account aliases.
- Supabase Storage objects, Vercel staging blobs, Hetzner files, Google Drive files/IDs/links, or encrypted Google refresh-token references.
- Motion-story share tokens and any public/private generated artifact URLs.
- Production-edited prompt/config rows unless they are reviewed, scrubbed, and deliberately promoted as code-owned reference data.

## Third-Party Coupling

- Google OAuth and Google Drive API.
- Vercel deployment URLs and Vercel Blob staging.
- Hetzner-hosted media worker/storage.
- OpenAI and OpenAI-compatible APIs.
- DeepSeek.
- Alibaba DashScope/Qwen/Bailian.
- External translation service.
- STT and face/indexing services.
- Google Maps, Mapbox, Nominatim/Photon geocoding, and OSRM routing.

Each integration needs a Dev credential, sandbox endpoint, local stub, or explicit disabled mode. Database seed rows must not point to production services.

## Dev Supabase Bootstrap Plan

### 1. Recreate Automatically

After the migration chain is repaired and validated, automation should create:

- `pgcrypto`;
- all 64 public application tables;
- FKs, checks, unique constraints, and indexes;
- RLS enablement and the reviewed final policy set;
- database functions, grants, and triggers;
- private `trip-media` and `memory-shot-renders` buckets plus object policies;
- reviewed code-owned capture, prompt, routing, and memory-template reference rows;
- deterministic synthetic seed data.

Recommended preparation before creating the hosted project:

1. Obtain an authorized read-only production schema-only dump and migration-ledger export.
2. Compare it with the repository and inventory all drift.
3. Build one canonical baseline migration in correct dependency order.
4. Rename or consolidate duplicate migration versions without changing production until a migration-history strategy is approved.
5. Add `supabase/config.toml` and `supabase/seed.sql` (or an equivalent checked-in seed command).
6. Prove the result repeatedly with a clean local Supabase reset and schema diff.

### 2. Configure Manually In Supabase Dashboard

- Create the Dev organization/project, region, database password, and project access policy.
- Enable Google and email magic-link providers as required.
- Configure Dev-only Google OAuth credentials.
- Set local, preview, and Dev Site/redirect URLs, including `/auth/callback`.
- Configure Dev SMTP/email templates/rate limits, or document use of Supabase's development email behavior.
- Review JWT/session durations and refresh settings.
- Add Dev deployment secrets outside Git.
- Confirm whether Realtime, Auth hooks, webhooks, cron, Vault, or network restrictions are required; none are reproducible from this repository.
- Verify bucket privacy after migrations rather than manually creating duplicate policies.

### 3. Seed Required Data

- Dev-only Auth users and matching profiles.
- Explicit Dev admin assignment.
- One synthetic trip with owner, member, and invited/unlinked-member cases.
- Small planner, ledger, capture, media, and sync-relevant fixtures.
- Checked-in capture/prompt/template defaults.
- Tiny synthetic files in each bucket.
- Optional worker/config fixtures only when their Dev services are configured.

### 4. Keep Production-Only

- All real users and travel/business content.
- All production Storage/external-provider objects and token references.
- All production credentials and secrets.
- Production job/log/cost history and private generated content.
- Production account-role assignments and the hard-coded production administrator bootstrap.

### 5. Validate After Setup

1. Clean migration replay succeeds twice and produces no schema diff.
2. Every expected table, FK, index, check, function, trigger, and bucket exists.
3. RLS is enabled on every public application table.
4. Anonymous, ordinary member, owner/admin, removed member, and service-role policy matrices behave as expected.
5. Trip creation bootstraps membership correctly in the required membership model(s).
6. Google OAuth and email magic links return only to approved Dev URLs.
7. Invite claim/accept/revoke RPCs work with synthetic users.
8. Storage upload/read/delete and signed URLs respect trip membership and path conventions.
9. Browser user-token routes preserve RLS; privileged job routes reject missing worker secrets and keep service keys server-only.
10. Google Drive, Vercel Blob, media/AI/translation/map services use Dev credentials/endpoints or fail closed when disabled.
11. No production hostname, key, token, object URL, user identifier, email, or content is present.
12. OTR Mobile talks only to the approved Dev backend API and never directly to business tables.

## Blockers

1. The migration chain cannot currently recreate a clean project because the core baseline sorts after dependent migrations.
2. Six duplicate migration versions prevent deterministic Supabase migration tracking.
3. The live production schema and migration ledger have not been compared with the repository, so drift is unknown.
4. Dashboard-only Auth/provider/redirect/email/session configuration has not been captured.
5. No reproducible local Supabase config or seed workflow exists.
6. The production-specific hard-coded admin email must be replaced with a Dev-safe, explicit bootstrap mechanism.
7. Broad authenticated-user policies for parser/capture configuration and places require a security decision before cloning.

DEV SUPABASE BLOCKED
