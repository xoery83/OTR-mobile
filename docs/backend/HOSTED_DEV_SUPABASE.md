# Hosted Supabase Development Environment

## Status

Hosted validation completed on 2026-09-10. This project is a disposable Dev
environment and is not connected to OTR Mobile or a backend deployment yet.

| Item              | Value                                      |
| ----------------- | ------------------------------------------ |
| Project name      | `OTR Development`                          |
| Project reference | `tuqigdxrvrerfewsxqgm`                     |
| Region            | Oceania (Sydney), `ap-southeast-2`         |
| Project URL       | `https://tuqigdxrvrerfewsxqgm.supabase.co` |
| Environment       | Development only                           |

No password, API key, service-role value, access token, OAuth secret, or JWT is
stored in this repository.

## Canonical Lineage

The hosted project was built from exactly these repository migrations, followed
by the deterministic seed:

1. `20260910000100_canonical_production_baseline.sql`
2. `20260910000200_canonical_security_hardening.sql`
3. `supabase/seed.sql`

The 76 legacy migrations were not replayed, copied, or renumbered. The hosted
`supabase_migrations.schema_migrations` ledger contains only the two canonical
versions above. Because the migrations were initially applied in the Dashboard
SQL Editor, the ledger was initialized afterward as applied metadata; no schema
SQL was replayed during that step.

The project-creation option that automatically enables RLS added an unexpected
`ensure_rls` event trigger and `public.rls_auto_enable()` function. Both were
removed from this Dev project after explicit approval. There is no separate
persistent Dashboard toggle after project creation: those objects implement the
option. RLS remains explicitly enabled by the canonical migrations on all 64
application tables.

## Hosted Manifest

| Object                      | Hosted result |
| --------------------------- | ------------: |
| Public application tables   |            64 |
| Public application columns  |           910 |
| Constraints                 |           329 |
| Indexes                     |           240 |
| Public functions            |            29 |
| Public triggers             |            32 |
| RLS-enabled public tables   |            64 |
| Public and Storage policies |           178 |
| Private Storage buckets     |             2 |

Hosted checksum:

```text
319176c04e305e73bf57f6a592fa0aad58610b8d7065ae042224bfabf2b94167
```

This exactly matches `supabase/schema-manifest.json`.

## Security Validation

The hosted RLS matrix completed all 28 assertions with zero failures. It ran in
a transaction and rolled back its validation writes. The matrix covers anon,
authenticated owner/member/guest/admin, and service-role scenarios, including:

- account-role self-escalation is rejected by
  `protect_profile_account_role()` and its trigger;
- unintended `PUBLIC` and `anon` execution of `SECURITY DEFINER` functions is
  absent;
- parser and Capture global configuration writes are admin-only;
- Live Location requires an active linked owner or group member;
- Memory Artifact mutation is author/owner scoped;
- `trip_members` direct reads and `memory_entries` direct deletes remain blocked
  in favor of approved RPCs;
- `daily_reports` has no user-facing policy;
- users may delete only their own itinerary ratings;
- face and face-embedding mutation remains backend/service controlled.

## Synthetic Seed

The hosted project contains four deterministic `@otr.invalid` Auth identities,
four matching profiles, one synthetic trip, and the minimal membership and
configuration fixtures required by the security matrix. A direct database check
found zero non-synthetic Auth identities.

No production user, email, project reference, secret, travel content, or Storage
object was copied. The security test transaction left no additional fixture.

## Storage

The following buckets exist and are private:

- `trip-media`: 0 objects
- `memory-shot-renders`: 0 objects

Bucket access remains governed by the canonical Storage policies. No production
Storage object was imported.

## Auth Configuration

The hosted project currently uses the minimum default Dev configuration:

- Email provider: enabled.
- Email confirmation: required.
- New user signup: enabled.
- Anonymous sign-in: disabled.
- Google and all other external providers: disabled.
- Site URL: `http://localhost:3000`.
- Redirect allowlist: empty.
- Access-token lifetime: 3600 seconds.
- Compromised refresh-token detection: enabled.
- Refresh-token reuse interval: 10 seconds.
- Session time-box and inactivity timeout: never, the Free-plan defaults.

The localhost URL is intentionally a placeholder until the Dev Backend callback
contract is approved. Mobile deep links have not been added, so this project is
not connected to the app.

## Future Backend Environment

The Dev Backend must receive these values through its deployment secret store,
not through this Mobile repository:

```text
OTR_DEV_SUPABASE_URL=<Dev project URL>
OTR_DEV_SUPABASE_PUBLISHABLE_KEY=<Dev publishable key>
OTR_DEV_SUPABASE_SECRET_KEY=<Dev server-only secret key>
OTR_DEV_SUPABASE_DB_PASSWORD=<Dev database password, CLI/operations only>
```

The publishable key may eventually be exposed to an Auth-only client adapter,
but OTR Mobile must never use it to access business tables directly. The secret
key and database password are backend/operations-only values.

## Disabled Integrations

No third-party service was enabled. Google OAuth, Google Drive, Vercel Blob,
media services, face indexing, OpenAI, DeepSeek, Alibaba/Qwen, translation,
speech-to-text, Google Maps, Mapbox, and OSRM remain disabled or unconfigured.

Before Dev Backend integration, create separate Dev credentials only for the
services actually required by an approved backend slice. Google OAuth also needs
separate Dev credentials and approved callback URLs before it may be enabled.

## Rebuild Procedure

This environment can be rebuilt without reading Production:

1. Create a fresh disposable Supabase Dev project in the approved region with a
   unique database password.
2. Leave automatic table exposure and automatic RLS creation disabled.
3. Authenticate the Supabase CLI locally without committing the access token,
   then link the new project using its reference and Dev database password.
4. Push the two canonical migrations from `supabase/migrations/` in timestamp
   order.
5. Apply `supabase/seed.sql` only to the Dev project.
6. Run `supabase/schema_manifest.sql` and require an exact manifest/checksum
   match.
7. Run `supabase/tests/rls_matrix.test.sql` in its transaction and require all 28
   assertions to pass.
8. Confirm both buckets are private and empty and all Auth identities end in
   `@otr.invalid`.

For the current Dashboard-created project, the two canonical versions are
already registered in `supabase_migrations.schema_migrations`. Future schema
changes must be new timestamped forward migrations; do not edit either baseline
migration after this point.

## Remaining Manual Configuration

There is no database or security blocker before Dev Backend work. The next
approved backend task must still supply, outside Git:

- Supabase CLI account authentication and the Dev database password;
- Dev Backend secret-store entries for the URL and server-only key;
- final Dev Backend Site URL and callback allowlist;
- separate Google OAuth credentials if Google sign-in enters scope;
- separate credentials or local stubs for any approved third-party integration.
