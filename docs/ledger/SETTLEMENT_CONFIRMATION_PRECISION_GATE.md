# Settlement confirmation source precision

Date: 2026-09-29. Local gate and Hosted Dev read-only precision gate PASS.
Owner confirmation after this release remains untested; no automated Confirm.

## User-observed confirmation result

The owner manually pressed Confirm after the source-preview fix gate. LAWSON Journey
remained on the review page; the Simulator Journey successfully returned.
These actions are outside automated acceptance, which did not execute Confirm.

Read-only original iPhone evidence shows operation
`ledger-operation_mum4qphs_e4qp6g368i` is `CONFLICT`, with
`SETTLEMENT_INPUT_STALE`. Root `0c738ccc-5bca-49ed-a29d-143a0e7299cf` still has head
`19c9f41c-0fce-43bd-a89b-b60528127955`, sequence 2. No LAWSON Journey confirmation
was created. Simulator root `caf23384-1c13-4719-9281-67cd54ac9bae` now has the
owner-confirmed adjustment `4f78f5b7-6009-4919-96b7-b92a8d9ba091`, sequence 3,
finalized at `2026-09-29T03:41:07.031242+00:00`.

## Root cause

The current source contains SQL numeric rate `0.011189760712298275` twice.
Supabase JSON parsing converts it into JavaScript number `0.011189760712298274`.
The Backend previously serialized that rounded number into `expected_source_value`.
The transaction's unchanged strict JSONB source equality correctly rejects it.
Trailing zero loss on other rates is numerically equivalent and does not cause
JSONB inequality. The Simulator rate `1.763400000000000000` loses only trailing
zeros, explaining its successful confirmation.

Prior gate verified preview/local/Adjustment equality and refresh/restart eligibility.
It did not execute the confirmation transaction, as explicitly instructed. Its shared
preview checks could not expose a loss that only becomes material at the SQL proof
boundary. This is a source transport defect, not a new Expense conflict or financial
intent change.

## Minimal implementation

- Migration `20260929000400_adjustment_lossless_source_transport.sql` adds only the
  service-only read RPC `ledger_adjustment_source_text_7_2c`: existing root/current
  source returned as JSON text. Existing source functions and mutation RPCs unchanged.
- Adjustment finalization reads this text and uses Node 24's standard JSON source
  context / `JSON.rawJSON` to serialize exact numeric tokens into its SQL proof.
- Preview calculations and business valuation representation are unchanged. Initial
  settlement, correction, head, digest, cutoff, permission, frozen, idempotency and
  pending guards remain intact. No financial rows are patched.
- Failed phone operation is retained; no local SQL repair or forced replay is used.
  Normal refresh followed by an owner-reviewed confirmation is the eventual product
  path after release. Automated acceptance must not execute that final action.

## Validation and release readiness

- 8 related suites / 106 tests PASS, including actual gateway confirmation request
  construction, exact decimal proof token, retained head/digest values, multiple
  correction chains, feedback, worker and coordinator regressions.
- 33 SQL suites / 655 assertions PASS. New transport tests preserve both source
  selection paths, every digit, strict rejection of rounded input, service-only access.
  Fixture function replacements roll back. No SQL Confirm command is executed.
- TypeScript, Backend build, scoped ESLint, formatting/diff checks PASS.
- Hosted Dev project `tuqigdxrvrerfewsxqgm`, remote tail `20260929000300`.
  Dry run selects only this migration, no seeds or roles.
- Owner separately authorized 00400 and the corresponding Backend release.
- Production untouched. No automated Confirm or financial data repair.

## Hosted Dev release and read-only verification

- Migration tail **20260929000400**, applied only the authorized transport migration.
- Release `/opt/otr/dev-backend/releases/adjustment-lossless-source-20260929`.
  Source archive and image `otr-dev-backend:pre-adjustment-lossless-source-20260929`
  retained for rollback. Only gateway source and the numeric transport helper deployed.
- Runtime Node `v24.21.0` supports standard `JSON.rawJSON`; health is development/ok.
- Image `sha256:a91d886e543d54740799c518758596d3a21a4e4a7f887df895b2c4fee1ea5cd1`.
- Running bundle matches local SHA-256
  `c6e0c2babb037f3ed6eabe2c4459ea12881b45dd3a20ef44af464c349c6d8e37`.
- Evidence: `evidence/settlement-confirmation-precision.json`. Exact decimal-aware
  comparison proves source/proof equality at the original rejected cutoff, current
  cutoff and root cutoff. Old serialization fails equality for LAWSON current source;
  the new transport preserves every numeric token. Mobile direct RPC access rejected.
- LAWSON Journey remains 9 inputs / 6 Added, ordinary and Adjustment 200 / blockers [].
  Simulator's owner-confirmed Journey remains 6 inputs / Added0 / PREVIEW_UNCHANGED.
  Before/after release verification changes no confirmed head, valuation or audit IDs.
- No new native installation is required: client/API contract unchanged. Exit/reopen
  the review screen for a fresh check and to discard the previous in-memory rejection
  message; final confirmation is handed to the owner, never submitted by the agent.
