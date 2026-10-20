# ADR 0017: Ledger Stage 9 Controlled Replay Import

Date: 2026-09-13
Status: Accepted; Hosted Dev replay and Mobile acceptance complete

## Context

Stage 9 replays a privacy-minimized subset of one Production Europe Journey
into the isolated Ledger 2.0 Dev Journey. The import must not infer financial
meaning from legacy field names or let Production become a mutation/load target.

The legacy repository was inspected read-only at these writing paths:

- `supabase/migrations/020_journey_ledger.sql`;
- `supabase/migrations/042_journey_exchange_rate_snapshots.sql`;
- `src/lib/supabase/ledger.ts`;
- `src/lib/exchange-rates.ts`;
- `src/app/trips/[tripId]/ledger/page.tsx`.

No legacy file was modified.

## Verified Legacy Semantics

1. `rate_to_base` and entry `exchange_rate` convert the original/quote currency
   into the Journey base currency. The writer calls
   `getApproxExchangeRate(originalCurrency, baseCurrency)` and persists
   `base_amount = Number((original_amount * exchange_rate).toFixed(2))`.
2. The rate may come from Frankfurter, a hard-coded NZD-relative fallback, or
   `1` for the same currency. The stored entry rate and base amount are the
   historical facts; JavaScript binary arithmetic means they are not evidence
   of an exact decimal HALF_UP calculation.
3. Normal create and edit always write `split_method = equal`. They persist the
   same `Number((base_amount / participant_count).toFixed(2))` as every
   participant's `computed_share_base_amount`. No residual allocator exists, so
   the shares may differ from `base_amount` by minor units.
4. Edit deletes all participant rows and recreates equal rows. `custom_amount`
   and `custom_percentage` are latent schema/rebase branches, not a proven normal
   authoring flow. `share_amount` currency semantics are not sufficiently proven.
5. `shared` credits the payer, debits participant computed base shares, and
   drives balances/settlement suggestions. `stats_only` contributes to legacy
   total, category, currency, daily, and member statistics but returns before
   paid/owed balance and settlement calculation.
6. The UI requires a payer and at least one counted participant for both modes.
   The lower writer falls back to the payer only for a shared entry whose caller
   supplies no participants. Missing shared payer/participants sets legacy
   status `needs_review`; `stats_only` can still be marked `complete`.

## Decision

1. Preserve exact stored original and base decimal values after exact ISO-minor
   conversion. Preserve the stored quote-to-base rate as `LEGACY_IMPORTED`
   evidence. Do not require recomputation with Ledger 2.0 decimal rounding to
   equal the historical base amount.
2. Auto-accept `complete` + `shared` + all-`equal` rows whose stored computed
   base shares reconcile exactly. `legacy-equal-rounding-normalization-v2` may
   also accept a non-zero residual only when every stored share equals the
   verified legacy per-person `Number((base_amount / count).toFixed(2))`, the
   residual is explained entirely by that algorithm, and no other review reason
   applies.
3. Derive exact original and settlement splits with Ledger 2.0's deterministic
   `ledger-largest-remainder-v1` allocator using stable mapped-member UUID
   ordering. A normalized row records that its source shares are historical
   independently rounded evidence and its destination participant amounts are
   migration normalization, not claimed historical values.
4. Otherwise-valid `stats_only` rows are canonical `ACCEPTED + EXCLUDED`: they
   retain exact splits and valuation for Spending/consumption analysis but do
   not enter debt, Settlement, or Adjustment vectors. `shared` maps to
   `ACCEPTED + INCLUDED`. Legacy draft/review and `custom_*` rows remain DRAFT
   when structurally loadable.
5. Structurally impossible rows remain private `NEEDS_REVIEW` report items and
   are not loaded. No payer, member, rate, split, Household, PaymentRecord,
   receipt, repayment, or audit history is invented.
6. Production extraction uses fixed code-owned GET requests through the existing
   Supabase `authenticated` PostgREST path over the approved seven-table
   allowlist. The tool exposes no arbitrary HTTP method, SQL, RPC, table, column,
   filter, Auth, Storage, or Functions input or endpoint.
7. A private approval report may contain exact grouped Production totals. The
   retained repo-safe summary contains counts, versions, pass/fail, and keyed
   non-reversible checksums only. Human-reviewable does not mean Git-safe.
8. Production access remains blocked until the complete synthetic ETL, local
   transactional load, rollback, privacy, DRAFT-isolation, and idempotent replay
   gates pass and a new explicit approval is given.
9. The dedicated Session Pooler reader path is retired for Stage 9 extraction:
   existing RLS intentionally denies it Journey rows. A short-lived access token
   from an already-existing real Production Journey member/creator is supplied
   through a private `0600` one-time file. The extractor has no refresh or logout
   capability; it removes only the local token copy and relies on natural JWT
   expiry. This cleanup is not secure erasure on SSD/APFS.
10. The token must have enough remaining TTL for the estimated complete two-pass
    extraction plus a fixed safety margin. One token is used for preflight and
    both passes; switching tokens is forbidden.
11. Without a database snapshot, consistency is proven by two complete,
    deterministically paginated reads. Counts, ordered identities, exported
    content, and presence-only counts must match. Pass A remains a candidate
    until Pass B matches and an fsynced explicit commit receipt is atomically
    renamed with the raw bundle. Failed or interrupted candidates are never
    transformable.
12. Production network access is restricted to the exact
    `https://<project-ref>.supabase.co/rest/v1/...` origin and path prefix.
    Redirects, RPC, Auth, Storage, Functions, and arbitrary external endpoints
    are rejected.

## Consequences

- The approved design's cross-currency exact HALF_UP equality gate is removed;
  it did not match the verified historical writer. Stored base Money remains
  authoritative only as explicitly labelled import provenance.
- Legacy equal-share residuals remain review failures unless the v2 evidence
  gate proves the exact independently rounded legacy algorithm and no other
  defect. Proven rows retain explicit source-versus-normalized provenance.
- The transform contract advances to `stage9-europe-replay-v3`; the approved
  v2 rounding-normalization algorithm remains unchanged and applies equally to
  `shared` and `stats_only` rows.
- No dependency or generic database/query framework is added.
- The approved v3 dataset was loaded once into Hosted Dev through the guarded
  service-only transaction. An independent read-back and the canonical
  idempotent replay both passed with no row, revision, financial fingerprint, or
  change-feed drift.
- Recovery is backed by a private `public`-schema logical backup restored and
  verified in an isolated local Supabase environment. Auth credentials/sessions,
  Storage binaries, database roles/secrets, and non-`public` metadata remain
  explicitly outside that recovery scope.
- Two Release Simulator clients passed normal Auth -> Backend -> Hosted Dev ->
  SQLite v17 acceptance and offline cached cold start. The approved replay has
  one linked organizer identity and seven unlinked members; no second mapping
  was inferred or created.
