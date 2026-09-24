# ADR 0030 — Account-scoped FX reference snapshot cache

Status: Accepted for staged Personal Payment FX upgrade. Date: 2026-09-24.

## Decision

OTR Backend exposes one authenticated, fixed ECB bundle containing up to the
newest 32 working-day EUR-anchored snapshots. It validates provider shape,
currency codes, ordering, uniqueness, positive exact-decimal tokens, dates, and
provenance before returning the bundle. Mobile never calls the provider.

Mobile stores the validated bundle in a dedicated account-scoped SQLite table
and retains 32 dates per provider/policy. This cache is separate from
Journey-scoped `ledger_rate_quotes`: it supports immediate provisional display,
while accepted valuations and future Personal Payment projections remain
authoritative server evidence.

Refresh failure keeps the previous cache and never blocks an offline write.
Cache freshness and distance from a payment's economic date are separate
decisions. Slice B implements the approved exact/on-or-before/rough-latest
selection policy; Slice A does not derive or display converted payment amounts.

No server persistence, second provider, new dependency, canonical Settlement
change, or Production deployment is part of this decision.
