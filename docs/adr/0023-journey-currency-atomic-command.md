# ADR 0023: Atomic Journey Currency command

Date: 2026-09-17. Status: implemented locally for Phase D; Hosted Dev release pending validation.

Journey Currency is one Journey-wide financial setting. A generic settings update or a series of Expense PATCH requests can expose mixed active currencies. The Backend therefore exposes a preview and a single PostgreSQL commit RPC. The RPC locks Journey settings and financial inputs, rechecks settings revision and a digest of Expense revisions, active policies, quote revisions, conflicts and settlement state, then changes settings, accepted valuation projections, settlement splits, Expense revisions, audit and change feed in one transaction. It does not modify original Money or historical snapshot content. Manual, actual payer cost and legacy evidence become unresolved when their original currency differs from the new Journey Currency.

The first change-feed event is a currency barrier. Any prior cursor receives `INVALID_CURSOR`; Mobile performs a full bootstrap and applies Journey settings and Expenses in one SQLite transaction. Bootstrap retries if settings revision or change sequence moved while the server assembled it. Existing cached offline state stays at its last committed currency until this succeeds. No SQLite intent or revision mirror is needed because offline confirmation is disabled and the server preview supplies the authoritative revision.

An ephemeral Stage 7 preview is discarded by leaving its screen. Persisted unfinalized settlement rows block commit until abandoned through an explicit future operation; none are created by the current Stage 7 preview path. Any finalized history permanently locks the currency. The migration is additive and forward-only; rollback never edits historical evidence.
