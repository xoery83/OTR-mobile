# Current Implementation State

Date: 2026-09-12

## Current Milestone

OTR Mobile 2.0 Ledger 2.0 Stage 5.1 Financial Evidence & Valuation is complete.
It is implemented, automated-validated, deployed to Hosted Supabase Dev, and
accepted on iOS Simulator with two authenticated identities. Stage 5.2 has not
started.

## Stable Baseline

Stage 2 is complete and validated on Leon's physical iPhone 16 Pro with the
embedded-bundle Release build. Expense and Itinerary local-first creates,
offline cold launch, retry, Journey isolation, entity isolation, SQLite
integrity, typecheck, and tests passed.

Current local SQLite schema version: 9.

## Authoritative Ledger Sources

- `docs/ledger/LEDGER_2_0_IMPLEMENTATION_PLAN.md`
- `docs/ledger/LEDGER_2_0_API_CONTRACT.md`
- `docs/vertical-slices/EXPENSE_CREATE_SLICE.md`
- `docs/vertical-slices/ITINERARY_CREATE_SLICE.md`

## Latest Completed Checkpoint

Stage 5.1 adds ISO 4217 code/exponent validation; independent merchant amount,
payer evidence, and Journey valuation; append-only PaymentRecord supersession;
server-controlled rate-quote candidates; `RATE_REQUIRED`; and immutable active
SettlementValuationSnapshot history for SAME_CURRENCY, REFERENCE_RATE,
ACTUAL_PAYER_COST, and MANUAL_AGREED. Only an explicit valuation command changes
group value and the Expense revision. Manual valuation requires a preview and
reason. Payment evidence has its own durable operation and canonical audit.

Hosted Dev migrations
`20260912000400_ledger_2_stage_5_1_financial_evidence.sql` and
`20260912000500_ledger_2_stage_5_1_evidence_links.sql` are applied to project
`tuqigdxrvrerfewsxqgm`; local and remote migration ledgers match. Trusted rate
quotes are service-role-only and the external provider remains behind one narrow
replaceable boundary.

## Validation Status

Completed on iOS Simulator: `/stage5-1-acceptance` passed a real process
terminate/cold relaunch from an offline EUR 100.00 `RATE_REQUIRED` create,
successful later sync at r1, independent NZD 199.43 posted evidence, explicit
NZD 197.80 manual group valuation with canonical reason/audit, append-only NZD
200.00 payment supersession without revaluation, and a creator/organizer
valuation race using the existing Stage 4C Financial Core conflict envelope.
Keep Journey converged to canonical r3 / NZD 200.00 without creating settlement.

Read-only Simulator SQLite validation passed: `integrity_check = ok`, schema v9,
all successful 5.1 operations completed, both PaymentRecords synced, immutable
valuation/audit history present, and no PENDING/PROCESSING/RETRYABLE 5.1 work.
Stage 4A and Stage 4B Simulator regression gates were rerun and passed. Stage
5.1 itself exercised the Stage 4C conflict and resolution path.

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

Latest automated validation: typecheck and lint passed; 28 Vitest files / 96
tests passed. Full Supabase validation passed two clean resets, 5 SQL files / 121
tests each run, deterministic schema manifest comparison, zero schema diff, and
baseline/secret guards. Hosted Dev was exercised end-to-end by Simulator.

## Next Checkpoint

Stage 5.1 is complete. Stop at the 5.1 gate and wait for explicit approval before
beginning Stage 5.2 Receipt / Asset / OCR Pipeline. Stage 7 remains out of scope.

## Safety Notes

Production remains read-only. Legacy OTR Web is reference-only. Mobile UI reads
No receipt picker, upload, asset operation, or OCR implementation exists yet.
