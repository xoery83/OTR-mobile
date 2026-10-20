# Production Schema Drift Audit

Date: 2026-09-10

## Scope And Safety

This audit compared the checked-in legacy OTR Supabase migrations at
`/Users/xoery/Project/otr/supabase/migrations` with the live production project
`bobwhxjxqpehzecwmwqe`.

Production access was read-only and limited to PostgreSQL and Storage metadata.
The audit did not select from application data tables, inspect Auth users, copy
Storage objects, expose credentials, or execute any database, Auth, Storage, or
policy mutation. The legacy Web repository was not modified.

Metadata was read from:

- `information_schema.tables` and `information_schema.columns`;
- `pg_class`, `pg_namespace`, `pg_constraint`, `pg_indexes`, `pg_proc`,
  `pg_trigger`, `pg_extension`, and `pg_type`;
- `pg_policies` and PostgreSQL RLS flags;
- bucket metadata from `storage.buckets`;
- the requested `supabase_migrations.schema_migrations` relation check.

No production content rows were included in this document or retained in the
repository.

## Classification

- `MATCHES`: production and the repository represent the same object or state.
- `PRODUCTION_ONLY`: present in production but not represented by application
  migrations. Supabase-managed platform objects are called out separately.
- `REPO_ONLY`: declared by the repository but absent from production.
- `VERSION_ORDER_PROBLEM`: production matches an older repository state or the
  repository cannot define one deterministic application order.
- `DUPLICATE_VERSION`: two migration files share one migration version.
- `SECURITY_REVIEW_REQUIRED`: effective production behavior requires an explicit
  security decision before it is copied into a clean baseline.

## Executive Result

| Area                           | Production | Comparison                                                            |
| ------------------------------ | ---------: | --------------------------------------------------------------------- |
| Public application tables      |         64 | `MATCHES`                                                             |
| Public application columns     |        910 | 910 represented; 2 additional repo columns are absent                 |
| Constraints                    |        329 | Production definitions represented in repo                            |
| Indexes                        |        240 | 239 expected objects match; 1 repo index is absent                    |
| Public functions               |         27 | All 27 bodies match a repo version; 2 repo functions are absent       |
| Public non-internal triggers   |         31 | 31 match; 1 repo trigger is absent                                    |
| Public tables with RLS enabled |   64 of 64 | `MATCHES`                                                             |
| Effective policies             |        183 | 178 public, 5 Storage; effective set differs from intended repo state |
| Storage buckets                |  2 private | `MATCHES`                                                             |
| Public enum types              |          1 | `MATCHES`                                                             |
| Application migration ledger   |       none | `VERSION_ORDER_PROBLEM`                                               |

Production contains no extra OTR business table, column, view, materialized
view, sequence, function, trigger, or enum that lacks representation somewhere
in the repository. The drift is primarily the reverse: selected repository
migrations or parts of migrations are not reflected in production.

## Migration Ledger

### Requested Ledger

`supabase_migrations.schema_migrations` does not exist in production. The
`supabase_migrations` schema itself also does not exist.

The only similarly named relations are Supabase platform-owned ledgers:

- `auth.schema_migrations`
- `realtime.schema_migrations`
- `storage.migrations`

These are not an application migration ledger and cannot establish which of the
76 OTR SQL files were run.

Classification: `VERSION_ORDER_PROBLEM`.

Consequences:

- repository filenames cannot be reconciled to production by migration version;
- partially applied files and manually run statements cannot be distinguished
  from later manual removals using a ledger;
- production object state, not filename history, must be the starting evidence
  for a canonical baseline;
- a new Dev/Staging project must begin with a fresh, deterministic migration
  ledger rather than attempting to imitate a nonexistent production ledger.

## Repository Migration Order

There are 76 checked-in SQL files. The chain has no `001` baseline and the
timestamped core schema sorts after migrations that depend on it.

Six versions are duplicated:

| Version | Files                                                                               | Classification      |
| ------- | ----------------------------------------------------------------------------------- | ------------------- |
| `036`   | `036_email_invited_journey_claim.sql`, `036_memory_replies.sql`                     | `DUPLICATE_VERSION` |
| `037`   | `037_itinerary_item_ratings.sql`, `037_parser_upgrade_framework.sql`                | `DUPLICATE_VERSION` |
| `043`   | `043_background_activity_dismissals.sql`, `043_place_resolution.sql`                | `DUPLICATE_VERSION` |
| `048`   | `048_content_translation_source_id_text.sql`, `048_drive_first_media_storage.sql`   | `DUPLICATE_VERSION` |
| `049`   | `049_media_asset_variants_retention.sql`, `049_menu_language_pack_llm_metadata.sql` | `DUPLICATE_VERSION` |
| `061`   | `061_document_media_support.sql`, `061_story_output_quality_prompt_v2.sql`          | `DUPLICATE_VERSION` |

Both files in most duplicate pairs have evidence in production. Version `036`
is the clearest collision: the email-claim function exists, while the memory
reply column and index from the other `036` file do not.

## Tables And Columns

### Tables

The same 64 public application tables documented in
`SUPABASE_DEV_ENV_AUDIT.md` exist in production. No production-only business
table was found.

Classification: `MATCHES`.

### Columns

Every one of the 910 production public columns is represented by the migration
source. Two repository columns are absent from production:

| Table            | Repository column       | Source migration               | Classification                   |
| ---------------- | ----------------------- | ------------------------------ | -------------------------------- |
| `memory_entries` | `parent_memory_id uuid` | `036_memory_replies.sql`       | `REPO_ONLY`, `DUPLICATE_VERSION` |
| `ai_jobs`        | `current_step text`     | `055_ai_jobs_current_step.sql` | `REPO_ONLY`                      |

The missing `parent_memory_id` also means production lacks the self-referencing
`ON DELETE CASCADE` foreign key declared inline by migration `036`.

## Constraints

Production has:

- 64 primary-key constraints;
- 149 foreign-key constraints;
- 31 unique constraints;
- 85 check constraints.

All 329 production constraint definitions are represented by checked-in SQL.
All nine explicitly named repository constraints exist in production.

The only identified repository-side constraint omission is the inline
`memory_entries.parent_memory_id -> memory_entries.id ON DELETE CASCADE` foreign
key associated with the missing repo-only column.

Classification: `MATCHES` for production constraints, with one `REPO_ONLY`
foreign key.

## Indexes

Production has 240 public indexes:

- 95 back primary-key or unique constraints;
- 145 named application indexes match checked-in migration declarations.

One repository index is absent:

| Repository index                      | Table/columns                      | Classification                   |
| ------------------------------------- | ---------------------------------- | -------------------------------- |
| `memory_entries_parent_memory_id_idx` | `memory_entries(parent_memory_id)` | `REPO_ONLY`, `DUPLICATE_VERSION` |

No production-only application index was detected.

## Database Functions

Production has 27 public functions. Every production function body matches at
least one checked-in repository definition. Where a function has several
historical definitions, production matches the expected later variant,
including:

- `accept_journey_invite` from `019_invite_claim_existing_member.sql`;
- `add_trip_creator_as_member` from the timestamped bootstrap fix;
- `can_access_trip_media` from `005_memory_read_creator_fallback.sql`;
- the account-role RPC definitions shared by migrations `040` and `047`.

Two repository functions are absent:

| Function                                      | Source                                 | Effect                                                  | Classification                          |
| --------------------------------------------- | -------------------------------------- | ------------------------------------------------------- | --------------------------------------- |
| `can_share_journey_live_location(uuid, uuid)` | `034_live_location_active_members.sql` | Intended to limit sharing to linked owner/group members | `REPO_ONLY`, `SECURITY_REVIEW_REQUIRED` |
| `protect_profile_account_role()`              | `040_system_account_roles.sql`         | Intended to prevent unauthorized account-role changes   | `REPO_ONLY`, `SECURITY_REVIEW_REQUIRED` |

### Function Execution Security

Of the 27 production functions, 25 are `SECURITY DEFINER`. All 25 set an
explicit `search_path`, which is positive. However:

- all 25 are executable by the `anon` role;
- 24 retain default `PUBLIC` execute permission;
- application migrations commonly grant `authenticated` execution without
  first revoking default `PUBLIC`/`anon` execution.

Many functions perform their own `auth.uid()` checks, but this is not a
least-privilege grant model. The canonical baseline must explicitly define and
test execute grants for each function.

Classification: `SECURITY_REVIEW_REQUIRED`.

## Triggers

Production has 31 non-internal public triggers. Their names and definitions are
represented by repository migrations, and all are enabled.

One repository trigger is absent:

| Trigger                                | Table      | Classification                          |
| -------------------------------------- | ---------- | --------------------------------------- |
| `protect_profile_account_role_trigger` | `profiles` | `REPO_ONLY`, `SECURITY_REVIEW_REQUIRED` |

The trigger's supporting function is also absent. This is not a cosmetic drift:
`profiles.account_role` exists and production has two authenticated self-update
policies on `profiles`. Without the protection trigger, a normal authenticated
user may be able to update their own `account_role`, including setting it to
`admin`. This must be validated and resolved before cloning production policy
behavior. No mutation test was performed against production.

## RLS State

All 64 public application tables have RLS enabled. None use forced RLS.

Classification: `MATCHES` for enabled state.

Two RLS-enabled tables have no effective policy:

- `media_asset_variants`: this matches the repository and appears intended for
  service-side access only.
- `daily_reports`: the repository declares member read/insert/update policies,
  but production has none.

## Effective Policy Drift

Production has 178 effective public policies and 5 Storage policies. Every
production policy name is represented somewhere in migration history, but the
effective production set does not match the repository's intended later state.

### Missing Repository Policies

| Area                             | Missing effective production policy/state                  | Classification                          |
| -------------------------------- | ---------------------------------------------------------- | --------------------------------------- |
| `daily_reports`                  | member `SELECT`, `INSERT`, and `UPDATE` policies           | `REPO_ONLY`, `SECURITY_REVIEW_REQUIRED` |
| `itinerary_item_ratings`         | user's own `DELETE` policy                                 | `REPO_ONLY`                             |
| `journey_member_face_embeddings` | member `UPDATE` and `DELETE` policies from migration `046` | `REPO_ONLY`, `SECURITY_REVIEW_REQUIRED` |
| `memory_entries`                 | user's own direct `DELETE` policy                          | `REPO_ONLY`, `SECURITY_REVIEW_REQUIRED` |
| `trip_members`                   | member `SELECT` policy                                     | `REPO_ONLY`, `SECURITY_REVIEW_REQUIRED` |

The missing direct delete/read policies may be deliberate replacements by
`SECURITY DEFINER` RPCs, but no checked-in migration removes them. The intent
must therefore be recorded rather than inferred.

### Live Location Policy Version

Production retains the four older migration `029` policies:

- `Journey members can read active live locations`
- `Users can create own live location`
- `Users can update own live location`
- `Users can delete own live location`

Migration `034` should replace the first three with policies based on
`can_share_journey_live_location`, limiting create/update/read to linked owners
and group members. The function and all three replacement policies are absent.

Classification: `VERSION_ORDER_PROBLEM`, `SECURITY_REVIEW_REQUIRED`.

### Memory Artifact Policy Version

Production uses the stricter author/owner mutation policies:

- `Authors and owners can create memory shot artifacts`
- `Authors and owners can update memory shot artifacts`
- `Authors and owners can manage memory shot artifact assets`

Migration `060_memory_shot_artifacts_v1.sql` declares broader journey-member
create/update/manage replacements. Production therefore matches an older
repository policy variant rather than the final text of migration `060`.

Classification: `VERSION_ORDER_PROBLEM`, `SECURITY_REVIEW_REQUIRED`.

### Broad Configuration Policies

Production currently permits any authenticated user to manage all rows in:

- `parser_rules`
- `parser_examples`
- `parser_aliases`
- `capture_intent_rules`
- `capture_prompt_templates`
- `capture_routing_config`

The parser policies use `USING (true)` and `WITH CHECK (true)`. Migration `040`
contains tighter system-admin conditions for global parser configuration, but
those definitions are not effective in production. Capture configuration
remains broadly writable in both production and the repository.

Classification: `SECURITY_REVIEW_REQUIRED`.

### Other Policy Observations

- `profiles` has two equivalent authenticated self-update policies with
  different names.
- `profiles` remains readable by every authenticated user.
- `places` remains readable, insertable, and updatable by every authenticated
  user as a shared cache.
- `trip_members` has insert policies but no direct select policy; member reads
  are available through `get_trip_members_for_current_user`.
- `memory_entries` has no direct delete policy; deletion is available through
  `delete_memory_entry_for_current_user`.

These may be intentional, but the canonical baseline must encode the chosen
behavior explicitly and test it.

## Extensions And Other Objects

Production extensions are:

| Extension            | Version | Schema       | Classification                       |
| -------------------- | ------- | ------------ | ------------------------------------ |
| `pgcrypto`           | 1.3     | `extensions` | `MATCHES` application migration      |
| `pg_stat_statements` | 1.11    | `extensions` | `PRODUCTION_ONLY` platform-managed   |
| `supabase_vault`     | 0.3.1   | `vault`      | `PRODUCTION_ONLY` platform-managed   |
| `uuid-ossp`          | 1.1     | `extensions` | `PRODUCTION_ONLY` platform-managed   |
| `plpgsql`            | 1.0     | `pg_catalog` | `PRODUCTION_ONLY` PostgreSQL default |

The production `public` schema has no view, materialized view, standalone
sequence, foreign table, or partitioned table. Its one enum,
`location_resolution_status`, is represented by migration
`043_place_resolution.sql`.

Supabase-managed schemas (`auth`, `extensions`, `graphql`, `graphql_public`,
`pgbouncer`, `realtime`, `storage`, and `vault`) are platform infrastructure and
must not be copied into an application baseline dump.

## Storage

Production has exactly two buckets:

| Bucket                | Public | Type       | Classification |
| --------------------- | ------ | ---------- | -------------- |
| `trip-media`          | no     | `STANDARD` | `MATCHES`      |
| `memory-shot-renders` | no     | `STANDARD` | `MATCHES`      |

Neither bucket defines a file-size limit or MIME allowlist. The five effective
`storage.objects` policies match repository definitions:

- trip media: authenticated member read and upload;
- memory-shot renders: authenticated member read, upload, and update.

No Storage object data was inspected.

## Migration Reflection Summary

Because no application ledger exists, this table uses object evidence rather
than claiming whether a file was executed as a unit.

| Migration evidence                          | Production result                                                     | Classification                                  |
| ------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| `034_live_location_active_members.sql`      | function and replacement policies absent; older `029` policies remain | `REPO_ONLY`, `VERSION_ORDER_PROBLEM`            |
| `036_email_invited_journey_claim.sql`       | function exists                                                       | `MATCHES`, `DUPLICATE_VERSION`                  |
| `036_memory_replies.sql`                    | column, FK, and index absent                                          | `REPO_ONLY`, `DUPLICATE_VERSION`                |
| `037_itinerary_item_ratings.sql`            | table and most policies exist; delete policy absent                   | partial `REPO_ONLY`, `DUPLICATE_VERSION`        |
| `040_system_account_roles.sql`              | protection function/trigger and tighter parser policies absent        | partial `REPO_ONLY`, `SECURITY_REVIEW_REQUIRED` |
| `046_face_embedding_member_maintenance.sql` | update/delete policies absent                                         | `REPO_ONLY`                                     |
| `047_account_role_rpc_functions.sql`        | role column/index and account-role RPCs exist                         | `MATCHES`                                       |
| `055_ai_jobs_current_step.sql`              | column absent                                                         | `REPO_ONLY`                                     |
| `056`/`060` memory artifact policies        | production retains author/owner mutation variant                      | `VERSION_ORDER_PROBLEM`                         |

The remaining table, column, constraint, index, function, trigger, type, bucket,
and policy evidence is consistent with at least one checked-in migration
definition. This does not prove statement-by-statement execution because no
ledger exists.

## Canonical Clean-Room Baseline Strategy

Do not replay the 76 files against a new project. Build a new lineage for
Dev/Staging while leaving production untouched.

### 1. Freeze Evidence

1. Record this audit and the production project reference.
2. Generate a fresh schema-only production export using a read-only connection.
3. Exclude Supabase-managed schemas, owners, grants, platform migrations, and all
   production rows.
4. Retain only application-owned `public` objects, required extension requests,
   Storage bucket declarations, and Storage policies.
5. Store a normalized metadata manifest for tables, columns, constraints,
   indexes, functions, triggers, RLS, policies, and buckets.

### 2. Resolve Security Intent Before Writing SQL

Record explicit decisions for:

1. account-role protection and removal of ordinary self-service role changes;
2. `PUBLIC`/`anon` execution on each `SECURITY DEFINER` function;
3. active-member versus all-member live-location access;
4. author/owner versus journey-member memory-artifact mutation;
5. direct policies versus RPC-only access for `trip_members` and
   `memory_entries` deletion;
6. whether `daily_reports`, rating delete, and face-embedding maintenance should
   be user-accessible;
7. admin-only management for parser and capture configuration.

Security corrections should be part of the new baseline design. They must not
be applied to production as part of baseline creation.

### 3. Create A New Deterministic Migration Lineage

After those decisions:

1. create one timestamped application baseline migration in dependency order;
2. add a separate reference-data seed migration or `seed.sql`;
3. add one explicit security-hardening migration if separation improves review;
4. use unique timestamp versions only;
5. add `supabase/config.toml` with non-secret local/Auth settings;
6. never include the production admin email, user IDs, content, tokens, bucket
   objects, or service credentials;
7. archive the 76 legacy files as historical reference rather than placing them
   in the new executable migration path.

### 4. Validate In A Disposable Environment

1. Run a clean local reset twice.
2. Compare the resulting metadata manifest to the approved canonical manifest.
3. Confirm all 64 tables and approved 912-or-910 column decision.
4. Test PK/FK/unique/check behavior and cascade actions.
5. Test every RLS role matrix with synthetic users.
6. Test every `SECURITY DEFINER` function's unauthenticated, member, owner, admin,
   and service-role behavior.
7. Verify both private buckets and all five approved Storage policies.
8. Confirm Dev seed data is synthetic and contains no production identifiers.
9. Confirm OTR Mobile reaches business data only through the approved backend
   API boundary.
10. Run a schema diff after reset; it must be empty.

### 5. Promote Without Rewriting Production History

- Use the canonical baseline only to initialize new Dev/Staging projects.
- Record a baseline marker/checksum in the new projects' migration ledgers.
- Do not mark the canonical baseline as applied to production or replay it there.
- Create future forward-only migrations from the canonical state.
- Reconcile production later through separately reviewed, idempotent forward
  migrations after behavior and security tests pass.

## Blocking Decisions

The metadata audit is complete, but canonical SQL should not be authored until
these decisions are approved:

1. Production may permit self-promotion through `profiles.account_role` because
   its protection trigger is absent.
2. Production and repository policy versions disagree for live location and
   memory artifact mutation.
3. Missing direct policies for daily reports, memory deletion, member reads,
   ratings, and face embeddings may be intentional or accidental.
4. `SECURITY DEFINER` execute grants and broad parser/capture management policies
   need an explicit least-privilege model.
5. The canonical baseline must choose whether to include the two repo-only
   columns or mirror the current 910-column production schema.

BASELINE BLOCKED
