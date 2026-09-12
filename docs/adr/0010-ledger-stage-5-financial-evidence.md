# ADR 0010: Ledger Stage 5.1 Financial Evidence

Date: 2026-09-12
Status: Accepted for Stage 5.1 implementation

## Context

Merchant price, payer instrument cost, and Journey settlement value are three
independent financial facts. Mobile also needs useful offline behavior without
treating an unavailable exchange rate as failed synchronization. Existing
client-writable Journey exchange-rate data cannot be trusted as valuation
evidence.

## Decision

1. Validate Money against a versioned built-in ISO 4217 code/exponent table.
2. Keep PaymentRecords append-only and independently synchronized. Correction
   creates a superseding record; it never rewrites an Expense or valuation.
3. Store mutable provider candidates in a new service-role-only trusted rate
   cache with provenance and observation time. Mobile can read but never write
   this cache.
4. Only an explicit valuation command copies evidence into immutable
   ExchangeRateSnapshot and SettlementValuationSnapshot rows and advances the
   Expense revision. Reference refresh alone has no financial side effect.
5. Represent unresolved valuation with business status `RATE_REQUIRED`, no
   active valuation, and null settlement allocations. It remains a successful
   synchronized state and is not settlement-ready.
6. Reuse the existing Expense durable queue, idempotency ledger, revision check,
   conflict envelope/resolution, audit, bootstrap, and ordered pull. Add only
   the two concrete financial-evidence operation types needed by Stage 5.1.
7. Keep asset operations and OCR entirely outside this decision and Stage 5.1.

## Consequences

Historical accepted values cannot drift. Applying payer cost or a newer rate is
deliberate and auditable. SQLite schema v9 gains only the candidate/evidence
columns and indexes needed by Stage 5.1; Stage 5.2 will add its own asset path.
