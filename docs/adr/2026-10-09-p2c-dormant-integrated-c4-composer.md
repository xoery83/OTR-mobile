# P2c dormant Integrated C4 Composer

Date: 2026-10-09. Status: Owner-approved four minimal contract deltas; Builder implementation awaits Independent Review.

## Decision

Implement explicit local composition in `src/data/operations/captureBatchAssessmentComposer.ts`. Reuse the initialized shared SQLite connection, C2 transaction-local loader, accepted P2b-A Adapter, trusted SQLite53 Membership and SQLite52 immutable history. No default factory, caller, lifecycle owner, Transport dependency or migration is installed.

The original Account/generation and empty Job Trip scope travel through the invocation. The Adapter issues a private per-observation seal bound to canonical complete owning read set and content. SQLite52 invokes its transaction-local validator on NEW, preserving the accepted public revision1 Adapter. The owning stores continue to validate current Capture assignment, cached Trip access, Source/material, Run/Input/Candidate/Representation and complete trusted Membership, including discovery and absence.

SQLite52 alone owns the final Account-gated transaction. Its sole append extension is an optional synchronous activity fence immediately before INSERT and immediately before COMMIT after readback. Existing callers and historical replay retain their semantics. The Composer recomputes snapshot digest and C4a at healthy head revision+1, with revision/digest CAS and exact canonical body bytes.

Latest complete logical content equality returns historical-only UNCHANGED. Only snapshot assessmentRevision is normalized; no older-history search, roster truncation or semantic rebase occurs. A→B→A transitions retain three observations. Competing stale heads require explicit reassessment.

A sealed attempted append with unknown outcome retains exact raw body, head and receipt in volatile private memory. It blocks further NEW admission for that Account/Job, including previously sealed concurrent attempts. Receipt recovery reads exact immutable history and never writes. FOUND/ABSENT/REVISION_CONFLICT resolves that exact transient uncertainty; failed/corrupt reads do not. A cold instance without receipt may assess current state but cannot identify or claim recovery of an old invocation.

All assessment/projection results are historical-only and confer no current actionable authority. C3 Job processing DTOs, UI, routes and Continuation remain unchanged. Transport, native deployment, Experience integration, C5/C9, providers and business writes stay separately gated.

## Consequences and rollback

No SQLite54, journal, queue, scheduler, subscription, new dependency or Backend contract. Schema absence is UNAVAILABLE and never initializes a database. Missing publication support is UNKNOWN only when no owning binding/publication is discovered; discovered missing or stale trusted Membership fails closed.

Disable/remove the explicit Composer caller at any future activation boundary to roll back composition. Preserve immutable SQLite51–53/C2/history. CPU/hash and chain verification remain bounded by accepted per-body limits; no automatic retry or history pruning is introduced.

## References

- [Accepted P2c preflight](../architecture/OTR_PLATFORM_P2C_INTEGRATED_C4_COMPOSER_PREFLIGHT.md).
- [Builder evidence](../architecture/OTR_PLATFORM_P2C_COMPOSER_BUILDER_REPORT.md).
