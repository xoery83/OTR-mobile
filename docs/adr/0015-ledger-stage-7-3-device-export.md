# ADR 0015: Ledger Stage 7.3 Device Export

Date: 2026-09-13
Status: Accepted; Simulator gated, physical acceptance pending

## Decision

Stage 7.3 builds one normalized `SettlementStatement` from repository-backed,
frozen Settlement lineage facts in SQLite. Its canonical JSON digest identifies
the statement version. PDF and long-form CSV are device-generated read artifacts
from that same model; they never recalculate financial state or mutate Ledger
rows, revisions, or canonical audit.

New current-final exports require an authenticated canonical bootstrap, exact
server/local lineage-head agreement, no pending financial operation, `CURRENT`
Adjustment state, and zero confirmed remaining across the complete lineage.
Previously generated exports remain viewable and shareable offline.

Final files live in app-owned document storage under immutable
root/head/statement-digest paths. SQLite schema 15 adds only a small local export
manifest containing schema version, statement digest, root/head identity,
privacy mode, format, file URI/hash, and generation time. This metadata is not
financial truth and is not synchronized. Because an iOS app update can migrate
the Documents directory to a new container path, stored file URIs are resolved
against the current app document directory while preserving their immutable
digest-keyed suffix.

Member exports preserve the frozen display names and Journey-member identities
needed for authorized reconciliation. De-identified exports replace every
member, user, and actor identity with consistent export-local aliases and expose
no linkable internal ids. Both modes exclude private notes, receipt/OCR content,
asset paths, account identifiers, tokens, coordinates, and raw payloads.

CSV uses RFC 4180 escaping, UTF-8 BOM, integer minor units, currency and scale,
and formula-injection protection for all user-controlled text. PDF uses Expo's
native print-to-file support. The system share sheet shares only the generated
local file; there are no public links or uploads.

## Contract Consequence

The reserved, unimplemented
`GET /v2/trips/:tripId/settlements/:id/export?format=pdf|csv` endpoint is retired
from the Stage 7 contract. No server-side PDF/CSV renderer is introduced.

## Acceptance Boundary

Stage 7.3 requires automated regression, two-client Simulator convergence,
Statement digest parity, byte-identical CSV, normalized PDF-content parity,
non-mutation checks, history invalidation after Adjustment, and privacy scans.
Physical iPhone Release acceptance remains a separate final gate; Stage 7 is not
complete until it passes.
