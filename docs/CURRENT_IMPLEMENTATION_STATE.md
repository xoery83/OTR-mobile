# Current Implementation State

Date: 2026-09-12

## Current Milestone

OTR Mobile 2.0 Ledger 2.0 Stage 5 is complete. Stages 5.1, 5.2, and the integrated
Stage 5.3 Release acceptance passed on Leon's physical iPhone 16 Pro against the
approved Hosted Supabase Dev environment.

## Stable Baseline

Stages 1 through 5 are the stable baseline. Ledger bootstrap/pull, local-first
financial commands, conflicts/corrections, independent evidence/valuation, and
the receipt asset/OCR pipeline have passed their required automated, Simulator,
Hosted Dev, and physical iPhone gates.

Current local SQLite schema version: 10.

## Authoritative Ledger Sources

- `docs/ledger/LEDGER_2_0_IMPLEMENTATION_PLAN.md`
- `docs/ledger/LEDGER_2_0_API_CONTRACT.md`
- `docs/adr/0011-ledger-stage-5-2-receipt-assets.md`
- `docs/vertical-slices/EXPENSE_CREATE_SLICE.md`
- `docs/vertical-slices/ITINERARY_CREATE_SLICE.md`

## Latest Completed Checkpoint

Stage 5.3 physically validated the integrated financial evidence and receipt
path. Real camera capture, Photos selection, PDF document selection, permission
denial/Settings recovery, offline receipt-first import, offline
`RATE_REQUIRED`, force-quit/cold launch, reconnect, upload retry, OCR persistence,
explicit suggestion confirmation, Expense synchronization, receipt linking, and
canonical pull all passed in the configured Release build.

Three physical-only defects were fixed narrowly: missing iOS camera/Photos usage
descriptions, dynamic environment-key lookup that Release bundling could not
inline for the Stage 5.1 harness, and the receipt upload path. Receipt upload now
uses the installed Expo fetch/File Blob path; app-owned files are also relocated
by filename when an iOS app update changes the data-container UUID, with the
current URI written back to SQLite.

Stage 5.2 adds expense-first and receipt-first capture through the native image,
camera, and document pickers. Selected input is copied into app-owned Documents
storage and SHA-256 verified before import. Receipt metadata and independent
UPLOAD/OCR/LINK operations persist in SQLite; binary bytes never enter the
financial queue, JSON mutations, audit payloads, or structured logs. Upload is
authenticated and idempotent by stable local identity, fixed object path, byte
size, and digest. OCR uses one provider boundary, stores structured suggestions
only, and requires an explicit existing Expense command before domain mutation.

Hosted Dev migration
`20260912000600_ledger_2_stage_5_2_receipt_assets.sql` is applied to project
`tuqigdxrvrerfewsxqgm`; local and remote migration ledgers match. Receipt
metadata is service-role-only and receipt binary is held in the private
`ledger-receipts` Storage bucket.

## Validation Status

Completed on iOS Simulator: `/stage5-2-acceptance` passed expense-first upload
failure isolation (`Expense = SYNCED`, `Receipt = FAILED`), receipt-first local
import, process termination/cold relaunch, app-owned file durability, upload/OCR
retry, explicit suggestion confirmation through the normal Expense create path,
two completed server links, and duplicate-create identity replay. Read-only
SQLite checks passed: `integrity_check = ok`, schema v10, exactly two receipt
rows/two server ids/two object paths, all six UPLOAD/OCR/LINK operations
COMPLETED, and no receipt filename or binary marker in financial operation JSON.

Stage 5.1 `/stage5-1-acceptance` was rerun and passed a real process
terminate/cold relaunch from an offline EUR 100.00 `RATE_REQUIRED` create,
successful later sync at r1, independent NZD 199.43 posted evidence, explicit
NZD 197.80 manual group valuation with canonical reason/audit, append-only NZD
200.00 payment supersession without revaluation, and a creator/organizer
valuation race using the existing Stage 4C Financial Core conflict envelope.
Keep Journey converged to canonical r3 / NZD 200.00 without creating settlement.

The full Stage 4C Simulator conflict/correction acceptance was also rerun and
passed after the receipt integration changed the shared Ledger bootstrap path.

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

Final Stage 4 physical read-only iPhone SQLite checks passed: `integrity_check = ok`, schema v8,
one RESOLVED conflict, one ACCEPTED correction, no duplicate Expense/audit/queue
identities, and zero PENDING/PROCESSING/RETRYABLE operations.

Latest automated validation: typecheck and lint passed; 30 Vitest files / 101
tests passed. Full Supabase validation passed two clean resets, 6 SQL files / 129
tests each run, deterministic schema manifest comparison, zero schema diff, and
baseline/secret guards. Hosted Dev was exercised end-to-end by Simulator.

Final Stage 5.3 read-only iPhone checks passed: `integrity_check = ok`, schema
v10, no financial or asset operation in PENDING/PROCESSING/RETRYABLE, unique
idempotency keys, three unique physical receipt assets/server ids/object paths,
matching local and uploaded byte sizes/SHA-256 digests, one explicitly confirmed
Expense/link, and a pulled canonical `CREATED` audit event. The two remaining
receipt suggestions stayed unlinked. Stage 5.1 merchant EUR 100.00, payer NZD
199.43/NZD 200.00 evidence, and historical/current Journey valuations remained
independent after OCR confirmation. Ordinary structured backend logs contained
only request id, normalized route, status, and duration; financial queue payloads
contained no receipt URI or binary marker.

## Next Checkpoint

Stage 5 is complete. Stop and wait for explicit approval before Stage 6
analytics/search. Stage 7 settlement/payment remains out of scope.

## Safety Notes

Production remains read-only. Legacy OTR Web is reference-only. Mobile UI does
not access Supabase business tables directly. Hosted Dev still uses the narrow
Stage 5 acceptance OCR fixture rather than a production OCR service.
