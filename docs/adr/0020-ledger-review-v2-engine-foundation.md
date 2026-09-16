# ADR 0020: Review v2 Shared Finding Engine Foundation

Date: 2026-09-16
Status: Implemented and locally validated; Hosted Dev deployment pending

Review v2 observations have an explicit rule/version, immutable structured evidence and rule-specific dependency fingerprint. A shared Finding's lifecycle is separate from its global legacy action status. The serialized Journey reconciliation keeps unchanged active observations, resolves vanished rules, supersedes changed inputs and creates a new generation when a resolved rule reappears. Same-currency/scale median and same-day exact duplicate criteria replace the unsafe v1 comparisons only for new v2 observations.

Canonical Expense mutations commit first; best-effort Review evaluation follows, so Review failure cannot falsely report a committed financial write as failed. Explicit Review refresh remains the reconciliation/recovery path. This foundation intentionally retains global decisions and Journey-wide visibility until the subsequent personal-state and authorization phases. No Production deployment is authorized.

See `docs/ledger/REVIEW_2_0_PHASE_1_ENGINE_FOUNDATION.md` for schema, identity and verification details.
