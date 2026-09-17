# ADR 0020: Explicit Expense economic date

Status: Accepted for Currency / FX Phase B1, 2026-09-17.

The historical `occurred_at` lineage cannot prove the intended Journey-local calendar day. Add a nullable canonical `economic_date` to Ledger 2.0 Expense and propagate it end-to-end. The selected user date is a literal calendar value, not a timezone calculation. Leave all historical values unknown unless a separately reviewed source proves the date; B1 has no qualifying general source and performs no backfill. Missing economic date blocks future cross-currency market lookup but does not block an Expense, same-currency identity, or prior frozen financial evidence. Old-client omission remains nullable and cannot silently preserve a possibly incompatible active FX valuation. Keep `occurred_at` for compatibility and ordering.
