# Complete publication membership on the existing Run

Date: 2026-10-08 (Pacific/Auckland).
Status: Owner-accepted contract; dormant Builder; migration/activation gated.

The Owner accepted `OTR_PLATFORM_COMPLETE_PUBLICATION_MEMBERSHIP_PREFLIGHT.md`
from the isolated `publication-membership-preflight` worktree. The accepted design
reuses Track C's protected immutable server Run/Candidate roster and complete
private catalog read. It does not introduce a second publication system.

Retain a version1 canonical envelope on the existing local Run, binding Account,
Trip, Run/generation/operation, complete Source scope and Input digest, extractor
pins and every Candidate ID/key/kind/version/proposal hash. Use the separate
`otr-source-run-publication-membership-v1` digest. The owning admitted private-read
handoff and catalog/envelope installation are transactional; local rows alone,
unsent plans and continuation/result hashes cannot certify membership.

Import owns whole-membership/Input/provenance validation. Source owns current
Capture assignment/revision checks. Future C4 and P2b-B consume these transaction-
local checks within their own existing Account-gated serialized admission; neither
may mint publication authority. Historical NULL stays unavailable to complete C4
assessment while existing authorized catalog reads remain unchanged.

Canonical registry is1–51 at verified `f7115dc`. Separate SQLite52 is implemented
but pending independent review/acceptance. SQLite53 is only a candidate. The
[migration design](../architecture/OTR_PLATFORM_PUBLICATION_MEMBERSHIP_MIGRATION_DESIGN.md)
is review-only: no module, registry entry, allocation, DDL execution or backfill.
Actual guards/migration rollback and committed cold readback remain gated.

The dormant Builder uses an injected exact Track C private-read RPC contract,
with no credentials, production transport, publisher, runtime composition,
scheduler/provider activation or business commands. Test-only future-column
simulation proves code behavior, not durable migration acceptance. Independent
review and migration ancestry/Owner acceptance are required before later composition.
