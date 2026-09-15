# Ledger UI/UX Polish P5 Acceptance

Date: 2026-09-15  
Status: accepted; stop before P6

## Delivered

- Settlement now opens with state/readiness, the current member's position, and a
  scannable `X pays Y` transfer list. Finalized rows show the original transfer amount
  and a human status; paid and remaining values stay in Transfer detail.
- Transfer detail separates original, paid and remaining amounts, shows a human payment
  timeline and exposes only the current actor's valid primary action. Payment entry is a
  native sheet and continues to use the existing partial, cross-currency, offline,
  reject/dispute, organizer correction and overpayment rules.
- Settlement update and Statement / Export are separate destinations. They continue to
  read the existing adjustment lineage, deterministic statement and cached PDF/CSV
  export results without changing financial calculations.
- Review is a virtualized task list with human finding copy, the affected Expense and a
  focused finding detail. Acknowledge/Dismiss asks for a reason only after the chosen
  action, and the related Expense is directly reachable.
- Normal Settlement and Review screens do not present raw IDs, digests, revisions,
  lineage, discharge terminology, validation codes or support diagnostics.

## Validation

- TypeScript and targeted ESLint pass.
- The final targeted suite passes: 14 files / 32 tests covering Stage 7 settlement,
  payment, adjustment, statement/export, Stage 8 Review, P1 latest-request trust,
  P2/P3 dashboard/search navigation helpers and the architecture boundary.
- The Stage 10 prototype-removability guard remains green. Normal `app`/`src` runtime
  has no import of `ledger-prototype`.
- iOS Expo export and final Release builds pass for iPhone Simulator and signed
  `iphoneos`. The final builds were installed and launched without Metro.

## Release Simulator Acceptance

- Finalized and preview states are unambiguous. Offline preparation failure says to sync
  pending Ledger changes and does not imply a final settlement.
- The transfer list, detail push, explanation disclosure, Settlement update and
  Statement / Export routes are stable on forward/back navigation. A settled NZ$50
  transfer shows Original NZ$50, Paid NZ$50 and Remaining NZ$0 in detail.
- A temporary synthetic payer actor opened the real payment sheet without creating a
  payment. The screen showed only `Mark as paid`; same-currency defaults, cross-currency
  counted amount/rate/reason fields and queued-offline wording were present. Cancel left
  the transfer payment count at zero, and the original actor context was restored.
- Synthetic Review correctly showed 15 current items, opened a finding, requested its
  action reason contextually, cancelled without a write, and navigated to the related
  Expense. This exposed and fixed a keyed-composition regression described below.
- Simulator accessibility-tree spot checks confirmed headings, buttons, selected tab
  state, independent Review actions and meaningful transfer/finding labels in reading
  order.

## Physical iPhone Acceptance

The final signed Release was installed on Leon's iPhone 16 Pro running iOS 26.6.

- Final Settlement, transfer selection and the received-payment timeline feel stable on
  device. Existing settled obligations show their original NZ$50/NZ$30 amounts in the
  overview, while detail shows the correct paid and zero-remaining values and no invalid
  payment action.
- The device cache did not contain an open obligation for which the signed-in member was
  the payer. Actor-valid payment entry, cross-currency disclosure and no-write Cancel
  were therefore exercised with the equivalent Release Simulator synthetic payer; the
  physical pass covered the finalized transfer/timeline interaction and invalid-action
  suppression.
- Process-scoped maximum Accessibility Dynamic Type was exercised without changing the
  persistent system setting. Journey selection, Spending/Settlement switching, the
  primary financial amount and Settlement state reflowed and remained reachable and
  readable. The broad accessibility/VoiceOver sweep remains the explicitly deferred P6
  task.

## Narrow Acceptance Fixes

- Review navigation now carries the selected `journeyId` into both list and finding
  detail. `useLedgerReview` reads, refreshes and queues actions against that key instead
  of the old Stage 3 fallback used by normal navigation.
- Finalized transfer rows now display `transfer.amount`, not
  `confirmedRemaining`. This preserves the overview's “who pays whom, and how much?”
  answer after receipt while leaving the detail's remaining amount unchanged.
- Adjustment-sourced rows are labelled `Settlement update` so same-direction root and
  adjustment transfers are not mistaken for duplicate rendering.

## Follow-ups

### Wording / product

- Exact finalized/preview language, organizer-action placement, adjustment copy and the
  amount of advanced Statement evidence remain product-sign-off items from the approved
  Polish Plan. The current conservative plain English is accepted for P5.

### Earlier phases

- P4 direct, unmirrored VoiceOver navigation and spoken-output confirmation remains
  intentionally deferred to P6 by explicit instruction. No new P2, P3 or P4 functional
  defect was found during P5.

No Backend, schema, Supabase, domain financial, payment lifecycle or prototype-state
change was made. P6 was not started.
