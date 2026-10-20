# Europe 2026 UI Polish Settlement Fixture Acceptance

Date: 2026-09-15
Environment: approved Hosted Dev project `tuqigdxrvrerfewsxqgm` only
Result: **PASS**

## Safety gate

- Active `Europe 2026 Replay` remained at fingerprint
  `97fa314b965dd6af0f1337147301bdfb345e8a0060e1de0c56c6b421dcd83ce2`
  before finalization, after finalization, after Payment lifecycle creation, and
  at the end of the idempotency rerun.
- Retired Replay remained protected. The Production-origin negative test was
  rejected before Supabase client creation. No Production request was made.
- The five preserved UI Polish operations were identified before mutation and
  were not deleted:
  - two `LEDGER_UPDATE_EXPENSE` operations targeting
    `cef2cd97-51e7-52c4-9ae7-816d26883ed0`;
  - one `LEDGER_CREATE_EXPENSE` plus one `LEDGER_UPDATE_EXPENSE` targeting
    `ledger-expense_mu134se0_r9p8mz0lhr`;
  - one `LEDGER_CREATE_EXPENSE` targeting
    `ledger-expense_mu1kulzz_016gi39n8b`.
- All five remain terminal `FAILED`, with no due time, claim owner, or lease.
  Pending selection and claim logic accepts only `PENDING`/`RETRYABLE`, and
  interrupted recovery accepts only `PROCESSING`; therefore none was eligible
  for automatic retry or capable of mutating Expense, split, rate,
  participation, Settlement, or Payment state during enablement.

## Deterministic fixture

- Fixed cutoff: `2026-09-01T00:00:00.000Z`, after the final fixture Expense.
- Approved preview digest:
  `0fea678fa1dec0053de71b65b6449ff076204fd088aeab924f4013d9596e8aaa`.
- Preview remained exactly 72 inputs, 61 exclusions, zero blockers, eight
  balances, and seven transfers. The Europe-shaped source digest remained
  `daff1ab3e6c42cada0a9a2087522d38d150dbef1019ae8751f53dc9bef6880d4`.
- Existing Backend/domain commands created one root Settlement
  `60702abe-988f-48f3-acbb-7485a60eaed0`, seven persisted transfers, four
  Payments, and two confirmed discharges. No financial-table insert or manual
  lifecycle edit was used.
- Transfer states are exactly three `OPEN`, one `SETTLED`, one
  `PARTIALLY_PAID`, one `AWAITING_CONFIRMATION`, and one `DISPUTED`; the root is
  `PARTIALLY_PAID`.
- All fixture command IDs and idempotency keys are stable. Repeating the exact
  apply command returned idempotent replays, retained the same root and Payment
  identities, and created no duplicates.
- UI Polish has one linked organizer and no linked debtor. Lifecycle records
  therefore use the real organizer-authorized `ORGANIZER_OVERRIDE` command path.
  Payer-specific UI remains covered by the existing synthetic Stage 7 fixture;
  no identity mapping was fabricated.

## P5 route and device acceptance

- `transfer/[id]` now validates the persisted UUID, forwards the committed
  Journey id, and renders only the matching finalized transfer. Invalid or
  absent ids render the focused not-found state. No Backend, schema, domain, or
  Settlement semantics changed.
- Signed prototype-disabled Release passed on iPhone 17 Pro Max Simulator and
  Leon's iPhone 16 Pro. Both hydrated SQLite v17 to one root, seven transfers,
  four Payments, and two discharges through Auth -> Backend -> repository.
- Online focused detail rendered the persisted disputed transfer, including
  remaining amount, Payment history, dispute state, and organizer-correction
  presentation. Backend incremental reads returned HTTP 200.
- With Backend stopped, force-quit/cold-start rendered the same focused detail
  from SQLite and displayed the offline-cache state. After Backend restart,
  incremental reads returned HTTP 200 with no fixture-count drift.

## Automated validation

- TypeScript and touched-file ESLint pass.
- Eight targeted Vitest files / 44 tests pass, covering architecture routing,
  Settlement Stage 7, Payment lifecycle, repository persistence, Payment sync,
  Backend commands, Supabase gateway behavior, and Hosted Dev target rejection.
- Prototype-disabled signed Release Simulator and physical-device builds pass.

Fixture enablement and the minimal P5 routing fix are accepted. Round 2 Polish
has not started.
