# Current Implementation State

Date: 2026-09-12

## Current Milestone

OTR Mobile 2.0 Ledger 2.0 Stage 4C is complete. It is implemented,
automated-validated, deployed to Hosted Supabase Dev, accepted on iOS Simulator
with two authenticated identities, and physically validated on a Release build.

## Stable Baseline

Stage 2 is complete and validated on Leon's physical iPhone 16 Pro with the
embedded-bundle Release build. Expense and Itinerary local-first creates,
offline cold launch, retry, Journey isolation, entity isolation, SQLite
integrity, typecheck, and tests passed.

Current local SQLite schema version: 8.

## Authoritative Ledger Sources

- `docs/ledger/LEDGER_2_0_IMPLEMENTATION_PLAN.md`
- `docs/ledger/LEDGER_2_0_API_CONTRACT.md`
- `docs/vertical-slices/EXPENSE_CREATE_SLICE.md`
- `docs/vertical-slices/ITINERARY_CREATE_SLICE.md`

## Latest Completed Checkpoint

Stage 4C Conflict And Correction Request is complete. Concurrent Expense writes
produce a stable explicit conflict envelope with immutable base, submitted, and
canonical-at-conflict snapshots. Resolution supports Keep Mine, Keep Journey,
and explicit edited aggregates; Keep Journey
adds canonical resolution history without incrementing the Expense revision.
Resolution races supersede the prior local envelope and persist a new OPEN one.

Ordinary members use a separate durable correction-request command path. The
complete Stage-4 editable aggregate supports OPEN, ACCEPTED, REJECTED,
WITHDRAWN, and STALE transitions. Acceptance atomically creates the canonical
Expense revision and audit event. Backend commands re-read current canonical
membership and capabilities; cached Mobile capabilities are UI context only.

Hosted Dev migration `20260912000300_ledger_2_stage_4c_conflicts.sql` is applied
to project `tuqigdxrvrerfewsxqgm`; local and remote migration ledgers match.
Stage 4C RPCs and canonical resolution storage remain backend/service-role only.

## Validation Status

Completed on iOS Simulator: `/stage4c-acceptance` passed creator/organizer
concurrency, explicit Financial Core conflict, immutable envelope persistence,
Keep Journey without a revision bump, Keep Mine with one revision, a resolution
race producing SUPERSEDED then a new OPEN envelope, ordinary-member direct-write
rejection, and correction create/accept/reject/withdraw/stale behavior.

A real app force-quit/cold relaunch preserved SQLite schema v8 and all inspected
conflict/correction rows. Read-only counts before and after restart matched.

Stage 4A and Stage 4B Simulator regression gates were rerun after Stage 4C.
Both passed in full, including ambiguous create recovery, dependent replay,
edit/tombstone/restore, canonical audit pull, organizer reasons, stale revision,
and finalized-settlement protection.

Completed on Leon's physical iPhone 16 Pro with the Release build:
authenticated `/v2` bootstrap and mutation path, creator edit, tombstone/delete,
restore, canonical audit pull/display cache, Stage 4A create regression,
organizer override smoke, offline edit with backend stopped, force-quit/cold
launch reconnect ordered sync to `SYNCED r2`, and read-only SQLite integrity.

Stage 4C physical smoke also passed on that Release iPhone with an iPhone 17 Pro
Simulator as the second client. A phone-side offline r1 edit survived force-quit
and cold relaunch; a concurrent Simulator r2 write produced explicit
`REVISION_CONFLICT` without overwriting either branch. The immutable
base/submitted/canonical snapshots compared byte-for-byte across another cold
launch. Creator Keep Mine produced canonical r3 and both clients converged.
An ordinary-member correction created offline on the phone survived restart,
reconnected as OPEN, was accepted by the Simulator organizer, and converged on
both clients as canonical r2 with `CORRECTION_ACCEPTED` audit.

Final read-only iPhone SQLite checks passed: `integrity_check = ok`, schema v8,
one RESOLVED conflict, one ACCEPTED correction, no duplicate Expense/audit/queue
identities, and zero PENDING/PROCESSING/RETRYABLE operations.

Latest automated validation: typecheck and lint passed; 27 Vitest files / 87
tests passed. Full Supabase validation passed two clean resets, 4 SQL files / 90
tests each run, deterministic schema manifest comparison, zero schema diff, and
baseline/secret guards. Stage 4C's Hosted Dev migration is deployed.

## Next Checkpoint

Stage 4A, 4B, and 4C are complete. Stop at the Stage 4C gate and wait for
explicit direction. Do not begin Stage 5 or Stage 7.

## Safety Notes

Production remains read-only. Legacy OTR Web is reference-only. Mobile UI reads
through repositories and does not access Supabase business tables directly.
