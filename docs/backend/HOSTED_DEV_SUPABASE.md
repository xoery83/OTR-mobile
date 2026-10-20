# Hosted Supabase Development Environment

## Status

Hosted baseline validation completed on 2026-09-10. Ledger 2.0 through Stage
7.2B was deployed and verified on 2026-09-13. This project is Development-only.

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
3. `20260911000100_ledger_2_domain.sql`
4. `20260911000200_ledger_2_security.sql`
5. `20260912000100_ledger_2_stage_4a_create.sql`
6. `20260912000200_ledger_2_stage_4b_mutations.sql`
7. `20260912000300_ledger_2_stage_4c_conflicts.sql`
8. `20260912000400_ledger_2_stage_5_1_financial_evidence.sql`
9. `20260912000500_ledger_2_stage_5_1_evidence_links.sql`
10. `20260912000600_ledger_2_stage_5_2_receipt_assets.sql`
11. `20260912000700_ledger_2_stage_7_1_settlements.sql`
12. `20260912000800_ledger_2_stage_7_1_active_settlement_guard.sql`
13. `20260912000900_ledger_2_stage_7_2a_payments.sql`
14. `20260912001000_ledger_2_stage_7_2a_internal_rpc_grants.sql`
15. `20260912001100_ledger_2_stage_7_2a_payment_lineage_guard.sql`
16. `20260913000100_ledger_2_stage_7_2b_adjustments.sql`
17. `20260913000200_hosted_dev_lineage_reconciliation.sql`
18. `supabase/seed.sql` for deterministic local reconstruction

The 76 legacy migrations were not replayed, copied, or renumbered. The hosted
`supabase_migrations.schema_migrations` ledger matches all 17 repository
versions above.

The project-creation option that automatically enables RLS added an unexpected
`ensure_rls` event trigger and `public.rls_auto_enable()` function. Both were
removed from this Dev project after explicit approval. There is no separate
persistent Dashboard toggle after project creation: those objects implement the
option. RLS remains explicitly enabled by repository migrations on all 91
application tables.

## Hosted Manifest

| Object                      | Hosted result |
| --------------------------- | ------------: |
| Public application tables   |            91 |
| Public application columns  |         1,279 |
| Constraints                 |           670 |
| Indexes                     |           305 |
| Public functions            |            65 |
| Public triggers             |            83 |
| RLS-enabled public tables   |            91 |
| Public and Storage policies |           178 |
| Private Storage buckets     |             3 |

Canonical schema checksum for the 17-migration lineage:

```text
fa48bf7673064210e198d918a6ee3bf7a6b15ff4891b966ca841dc44ccbd9824
```

This exactly matches `supabase/schema-manifest.json`. Hosted integration also
confirmed Stage 7.2B service-only Adjustment RPCs, append-only non-forking
Settlement lineage, and no direct `anon`/`authenticated` grants on the checked
financial tables. Hosted Dev and clean-room public schema diffs are empty.

## Security Validation

The canonical RLS matrix completed all 28 assertions locally with zero failures.
It ran in a transaction and rolled back its validation writes. The matrix covers anon,
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

The database suite currently runs nine files and 189 assertions covering the
baseline RLS matrix, Ledger aggregates, Stage 4 mutations/conflicts, Stage 5
financial evidence/assets, Stage 7.1 finalization, Stage 7.2 Payment/Discharge
and Adjustment lineage, audit, revisions, and idempotency. It passes on two
independent clean resets with zero schema diff.

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
- `ledger-receipts`: private Stage 5.2 receipt evidence

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
4. Push every canonical forward migration from `supabase/migrations/` in
   timestamp order.
5. Apply `supabase/seed.sql` only to the Dev project.
6. Run `supabase/schema_manifest.sql` and require an exact manifest/checksum
   match.
7. Run all database test files in transactions and require the current assertion
   count to pass.
8. Confirm both buckets are private and empty and all Auth identities end in
   `@otr.invalid`.

For the current Dashboard-created project, all four versions are registered in
`supabase_migrations.schema_migrations`. Future schema changes must be new
timestamped forward migrations; do not edit applied migrations after this
point.

## Remaining Manual Configuration

There is no database or security blocker before Dev Backend work. The next
approved backend task must still supply, outside Git:

- Supabase CLI account authentication and the Dev database password;
- Dev Backend secret-store entries for the URL and server-only key;
- final Dev Backend Site URL and callback allowlist;
- separate Google OAuth credentials if Google sign-in enters scope;
- separate credentials or local stubs for any approved third-party integration.
