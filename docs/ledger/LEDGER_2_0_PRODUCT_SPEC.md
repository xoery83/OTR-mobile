# Ledger 2.0 Product Specification

Date: 2026-09-11
Status: Approved base with travel-feedback revision; no implementation authorized

## Product Promise

Ledger 2.0 lets a travel group record shared spending in seconds, continue when
offline, and finish the trip with a settlement every member can understand and
trust.

The Europe trip establishes Ledger as a core operational feature, not an
optional report. Its two success moments are:

1. a tired traveller records an expense correctly with minimal effort; and
2. the group closes the trip with a clear, explainable transfer plan.

## Success Principles

- Save locally before doing network work.
- Default intelligently, but show payer and inclusion before ambiguity becomes
  financial truth.
- Keep original amounts and conversion evidence visible.
- Keep merchant amount, payer's actual posted cost, and group settlement
  valuation as separate financial truths.
- Make the common equal split extremely fast.
- Make unusual splits possible without cluttering the fast path.
- Never silently overwrite financially material concurrent changes.
- Explain every balance from expenses, splits, rates, and recorded transfers.
- Treat Capture as assisted input, not authority.
- Keep status calm: show Pending/Needs attention/Conflict where actionable;
  avoid success notifications for routine background sync.

## Users And Roles

### Organizer

Can manage Ledger settings, correct any expense, resolve conflicts, generate a
settlement run, record transfers, reopen a settlement, and export the final
statement. This authority is enforced by the backend and audited.

### Traveller

Can create expenses, edit/delete their own unfinalized expenses, view Journey
expenses and personal balance, and record or confirm transfers involving them.

### Unlinked Traveller

Can be payer, participant, debtor, or creditor through a Journey member record
without needing an Auth account. An organizer acts on their behalf. Linking an
account later must preserve the same member identity and balances.

## Core Jobs

- Enter Ledger with an unmistakable Journey context, including when no Journey
  or several Journeys overlap today.
- Record who paid, how much, in which currency, and who benefited.
- Exclude travellers who did not participate.
- Express equal, exact-amount, and percentage splits accurately.
- Edit mistakes offline without losing auditability.
- See personal and group balances in the settlement currency.
- Convert multi-currency spending using documented snapshots or overrides.
- Reduce net balances to a practical set of transfers.
- Record payment of those transfers and share a final statement.
- Explain any member balance through its expenses, exact shares, valuation
  policy, rates, payment evidence, and transfers.
- Review personal spending and outstanding obligations across a chosen period
  and across Journeys without netting unrelated Journey debts together.

## Information Architecture

Each Journey owns an independent Ledger, member set, settlement currency, and
settlement lifecycle. The Ledger header always names the selected Journey and
its dates. Entry selection follows this deterministic order:

1. use an explicit Journey from the calling screen;
2. otherwise restore the last selected Journey when it is active today;
3. select the only Journey active today;
4. show a Journey chooser when several are active today; or
5. open **My Ledger** when none is active today.

Inside a Journey, **Spending** and **Settlement** are separate primary views over
the same accepted financial records. Spending answers what, when, where, and by
whom money was spent. Settlement answers who owes whom and whether repayment is
complete. **My Ledger** is a personal cross-Journey reporting view with a date
range; it never creates a global settlement or cancels one Journey's debt
against another Journey's credit.

## Capability Priorities

The phases below are Ledger product increments, separate from the completed
Mobile Foundation and vertical-slice phase names.

### Ledger Phase 1: Must-Have

- Explicit Journey context, deterministic zero/one/multiple-current-Journey
  selection, and a personal cross-Journey **My Ledger** view.
- Separate Journey **Spending** and **Settlement** primary views.
- Search and filter by date, category, payer/member, currency, status, and
  receipt presence, with personal/group spending analysis.
- Fast `+ Expense` flow and local-first instant save.
- Single payer selected from Journey members.
- Multiple included participants and quick exclusion.
- Equal split with deterministic minor-unit residual allocation.
- Exact/custom-amount split.
- Percentage split with exact validation and deterministic rounding.
- Equal-per-household and household/member-share splitting, including simple
  adult/child weights, resolved to exact Journey-member minor-unit shares.
- Journey-scoped Household definitions as selection/allocation conveniences.
- Original amount and ISO currency.
- ISO 4217 currency coverage with captured exponent; no short hard-coded
  currency allowlist.
- Fixed Journey settlement currency.
- Separate merchant amount, optional actual payer PaymentRecord, and immutable
  per-expense SettlementValuationSnapshot.
- Per-expense reference-rate evidence with source/date/provenance.
- Journey valuation policy: trusted reference rate, actual payer posted cost,
  manual agreed valuation, or same-currency.
- Manual exchange-rate override with explicit confirmation and audit reason.
- Date/time, category, optional notes, optional location.
- Receipt/evidence as a first-class workflow, supporting attach-after-create and
  receipt-first OCR draft creation.
- Optional itinerary and document links.
- Creator/organizer permission model enforced server-side.
- Offline create/edit/delete with durable queue and tombstones.
- Pending, synced, retryable, and conflict status.
- Automatic retry after auth/network recovery.
- Versioned audit history for all financial changes.
- Reversible tombstone deletion and member correction requests that cannot
  overwrite another person's financial record.
- Per-member balances and explainable expense breakdown.
- Deterministic minimized transfer suggestion.
- Settlement run and transfer recording.
- Partial repayment and bilateral **Paid** / **Received** acknowledgement for
  linked members, with an auditable organizer path for unlinked members.
- Shareable/exportable final statement, at minimum PDF and CSV/data export.
- Deterministic financial validation and non-mutating heuristic Ledger review.
- Accessibility: large targets, dynamic type, screen-reader labels, high
  contrast, and no color-only status.

### Ledger Phase 2: Should-Have

- Recent payer/participant presets scoped to the Journey and device.
- Repeated split templates with an explicit preview before save.
- Text Capture that prefills an expense draft.
- Voice Capture with transcript review.
- Richer OCR extraction and receipt line-item suggestions beyond the Phase 1
  receipt-first draft and basic evidence linking.
- Enhanced duplicate/missing-expense review using itinerary and group context.
- Correction-request discussion/resolution enhancements beyond the Phase 1
  lightweight propose/accept/reject workflow.
- Richer statement filters and private share links with expiry.
- Optional notification when a user must resolve a conflict or confirm a
  transfer involving them.

### Future / Optional

- General-purpose weighted shares beyond Phase 1 household/member shares.
  Weights must be converted to exact minor-unit allocations at save time.
- Multi-payer expense support. Until a real need is proven, represent repayment
  or reimbursement separately rather than complicating common entry.
- Bank/payment-provider deep links where regionally reliable.
- Receipt line-item splitting.
- Recurring trip templates across Journeys.
- Policy budgets, spending limits, or approval workflows.
- Offline OCR models if size, privacy, and accuracy justify them.
- Automated rate-provider redundancy and signed rate provenance.
- Bank feed or statement import. Phase 1 PaymentRecord is manually entered or
  receipt-assisted evidence, not an account connection.
- Strict global minimum-transfer optimization beyond the practical
  deterministic plan.

### Legacy Features To Remove Or Defer

- Web `stats_only` mode as a primary user choice. Reintroduce only as a clearly
  named personal/non-settling expense if research confirms the need.
- One-time Journey exchange-rate refresh restriction.
- Destructive base-currency rebasing of historical expenses.
- Global writable exchange-rate table.
- Blocking or auto-correcting heuristic audit in the entry workflow. Ledger 2.0
  keeps review available but advisory.
- Day allocation as a property of settlement. It may remain a reporting view.
- Social/Story use of detailed expense values by default.
- Full Web page tabs, filters, and form layout as a Mobile design template.

## Expense Rules

### Required At First Save

- positive original amount in valid minor units;
- original currency;
- payer Journey member;
- at least one included participant;
- split whose allocated original minor units equal the original amount;
- occurred date/time, defaulted to now and editable;
- Journey id and creator identity.

Payment evidence is optional at first save. Settlement valuation may be pending
when no policy-compliant rate or posted cost is available; the original merchant
amount still saves locally and permanently.

Title/merchant and category may use clear defaults such as `Expense` and
`Other` so the fast path is not blocked. Missing enrichment is marked for later
review, not treated as a failed save.

### Defaults

- Payer: current user's linked member, then most recent payer on this device.
- Participants: most recent participant set for this Journey, otherwise all
  active settlement-eligible members.
- Split: equal.
- Currency: recent currency, then location/Journey hint, then settlement
  currency.
- Date/time: current local Journey time.
- Category: inferred only when confidence is high; otherwise Other.

Defaults must remain visible in the confirmation summary. A hidden participant
default is unacceptable because it changes balances.

### Exclusions

Exclusion is a selection interaction, not a separate financial record. The
saved aggregate records only included member snapshots and final allocations.
The UI may say `Everyone except Alex`, but the canonical record stores the
included member ids so later membership changes cannot alter history.

### Split Validation

- Equal: backend/domain allocates residual minor units deterministically by
  stable member order; displayed shares sum exactly.
- Exact: all amounts are integer original minor units and must sum exactly.
- Percentage: decimal percentages must sum to exactly 100 at accepted scale;
  resulting minor units use deterministic largest-remainder allocation.
- Equal per household: divide the expense between selected households, then
  resolve each household share to its selected members using the configured
  member strategy.
- Household/member shares: positive share values such as adult `1` and child
  `0.5` are resolved deterministically to exact member allocations.
- Weighted: future general weights use the same exact residual algorithm.

Household and weight inputs are provenance only. The accepted Expense always
stores one exact original-currency and settlement-currency allocation per
Journey member; later Household membership changes never rewrite history.

## Multi-Currency And Valuation Rules

Ledger distinguishes three values that may legitimately differ:

1. **Merchant truth:** immutable receipt amount/currency on Expense, for
   example EUR 100.
2. **Payer-cost truth:** optional authorization/posted charge, fees, and bank FX
   evidence on PaymentRecord, for example NZD 199.43.
3. **Group-settlement truth:** the accepted Journey-policy valuation, for
   example NZD 197.80.

- Original merchant amount/currency never changes as a side effect of a rate,
  PaymentRecord, or policy refresh.
- Currency input accepts ISO 4217 codes and uses a versioned currency metadata
  source for exponent/validity. Recently used currencies are suggestions only.
- Rate provider/cache data is mutable candidate/reference data. An accepted
  ExchangeRateSnapshot and SettlementValuationSnapshot are immutable evidence
  attached to a specific Expense revision.
- A PaymentRecord stores only a user-safe instrument/account label, never PAN,
  CVV, bank login, or other sensitive card data.
- Settlement calculations use converted integer minor units from the accepted
  SettlementValuationSnapshot, not whichever market rate or posted charge is
  newest.
- Journey valuation policy is one of `REFERENCE_RATE`, `ACTUAL_PAYER_COST`,
  `MANUAL_AGREED`, or `SAME_CURRENCY`. Each expense records the policy and exact
  evidence used; exceptions require an explicit reason.
- The Journey settlement currency is selected before settlement. Changing it
  after expenses exist is an explicit organizer migration that creates new
  conversion revisions and an audit event; it is never an in-place invisible
  rewrite.
- Offline entry can use the last trusted Journey rate. The UI shows its date and
  can mark the expense `rate review` when stale.
- If no trusted rate exists offline, save the expense locally with
  `RATE_REQUIRED`; do not invent a rate of one. It remains excluded from final
  settlement until resolved.
- Manual override requires a positive rate, visible converted preview, actor,
  timestamp, and reason. Other members can inspect that provenance.
- Adding or correcting actual card/bank evidence does not silently change group
  settlement. A policy-driven valuation change is a separate audited financial
  revision.
- Final repayment obligations are denominated in Journey settlement currency.
  If members pay in another currency, the transfer records both the agreed
  transfer amount/currency and an immutable repayment conversion snapshot back
  to settlement currency. Both parties confirm the resulting discharged
  settlement amount; FX differences are explicit and never silently netted.

## Permissions And Finalization

| Action                                  | Traveller                                | Creator | Organizer        |
| --------------------------------------- | ---------------------------------------- | ------- | ---------------- |
| View Journey Ledger                     | Yes                                      | Yes     | Yes              |
| Create expense                          | Yes                                      | Yes     | Yes              |
| Edit/delete own unfinalized expense     | N/A                                      | Yes     | Yes              |
| Edit another member's expense           | No                                       | No      | Yes, with reason |
| Suggest correction to another's expense | Yes, no direct overwrite                 | N/A     | Yes              |
| Resolve financial conflict              | Involved creator may choose own revision | Yes     | Yes              |
| Change settlement currency              | No                                       | No      | Yes              |
| Generate/finalize settlement            | No                                       | No      | Yes              |
| Record transfer involving self          | Yes                                      | Yes     | Yes              |
| Override any transfer/finalization      | No                                       | No      | Yes, audited     |

An ordinary member's correction request stores a proposed change and reason but
does not mutate the Expense. The creator may accept/reject it; an organizer may
accept or directly correct with a mandatory reason. Every outcome is audited.

An expense included in a finalized settlement cannot be silently edited or
deleted. A correction creates a new revision and invalidates/reopens the
affected settlement run, or creates an explicit adjustment in a later run.

## Settlement

### Calculation

For each accepted shared expense:

- credit payer by converted settlement minor units;
- debit each participant by their saved converted allocation;
- include recorded settlement transfers as separate balance movements;
- exclude deleted, conflicted, rate-required, and non-settling entries.

Every total must reconcile to zero in settlement minor units. The transfer plan
matches largest debtors and creditors deterministically, producing at most
`active non-zero members - 1` transfers. The statement identifies it as a
recommended practical plan, not the only valid way to pay.

### Lifecycle

`DRAFT -> READY -> FINALIZED -> PARTIALLY_PAID -> SETTLED`

A run stores the exact expense revisions and rate snapshots it includes. A
financial correction after finalization makes the run `SUPERSEDED` or creates
an adjustment run. A transfer is an obligation; one or more SettlementPayments
discharge it. Reporting **Paid** creates an awaiting-confirmation payment, and
the recipient's **Received** confirmation applies its settlement-currency
discharge. Partial payments keep the transfer open. Rejected or disputed
payments remain auditable and never reduce the confirmed balance.

### Explainability

Each member can open:

- total paid;
- total owed;
- recorded transfers;
- resulting balance;
- the exact expense shares that produced each number;
- rate source and Journey valuation policy for converted expenses;
- original merchant amount and exact personal share;
- payer PaymentRecord evidence where visibility policy permits;
- each transfer and any repayment-currency conversion.

The drill-down path is a product requirement:

    balance -> creditor/debtor -> expense -> own exact split
      -> merchant amount -> settlement valuation -> rate/payment evidence

Every displayed total must expose its component rows and rounding adjustments
without requiring organizer assistance.

## Export And Sharing

Phase 1 final statement includes:

- Journey and settlement currency;
- generation/finalization timestamp and revision;
- member balances;
- recommended and recorded transfers;
- expense list with original and settlement amounts;
- split details and rate provenance;
- excluded/conflicted entries called out separately;
- CSV or structured export for independent checking;
- PDF suitable for sharing.

Exports are generated by the backend from an immutable settlement snapshot.
Mobile may cache the resulting file for offline access. Share links are future
unless access control and expiry are implemented.

## Capture Requirements

Text, voice, and receipt/OCR Capture create a local draft or prefilled form.
They may infer merchant/title, amount, currency, date, category, and location.
They must not silently choose a payer, included participants, manual rate, or
custom split when confidence is insufficient.

The user always sees a concise financial confirmation before the draft becomes
an accepted shared expense. The receipt can upload later through the file queue.

Both directions are Phase 1 requirements:

- create Expense, then attach one or more receipt/evidence assets; and
- scan/import receipt, save the asset locally, run OCR when available, then
  review a prefilled Expense draft.

Expense financial sync and receipt upload/OCR are independent durable
lifecycles. A synced Expense may have a pending receipt upload, and an uploaded
receipt may remain linked to an unsynced draft/Expense.

## Intelligent Ledger Audit

### Deterministic Financial Validation

This layer is authoritative and runs in shared domain logic and again on the
backend. It rejects or blocks finalization when:

- member allocations do not sum exactly;
- percentages or household/member shares do not reconcile;
- payer/participant membership is invalid;
- currency, exponent, rate, PaymentRecord, or valuation evidence is inconsistent;
- settlement balances do not net to zero;
- an idempotency key maps to different content; or
- aggregate/audit revisions are missing, reordered, or fail integrity checks.

### Intelligent / Heuristic Review

This layer may flag likely duplicates, unusual amounts/currencies/rates,
participant sets inconsistent with itinerary/context, receipt or posted-cost
mismatches, unusually large expenses without evidence, and likely missing or
duplicated expenses. It provides evidence and a suggested next action.

Heuristics and AI never modify an Expense, PaymentRecord, split, valuation,
settlement, or transfer. A user must explicitly accept a correction through the
normal permission, revision, and audit path. False positives can be dismissed
with an auditable acknowledgement and must not block offline save.

## Status And Notifications

User-facing status:

- `Saved on this device` / Pending;
- Synced (normally quiet);
- Needs attention (validation/rate/auth permission);
- Conflict (requires comparison);
- Finalized/Settled.

Do not notify for normal sync completion. Useful notifications are limited to
actionable conflicts, a settlement ready for the user, or a transfer requiring
their acknowledgement. Offline and retry states remain visible in context.

## Acceptance Metrics

- Median equal-split creation requires amount plus at most one confirmation
  after good defaults are established.
- Local save and list appearance feel immediate and never await network.
- 100% of accepted allocations reconcile exactly in minor units.
- Retry and ambiguous response loss create no duplicate server expenses.
- Every financial revision has actor, prior version, reason/source, and time.
- Merchant, payer-cost, and settlement values remain independently inspectable.
- Final settlement balances net to exactly zero before transfer recording.
- A member can trace every balance and cross-currency repayment without
  organizer assistance.
- Household inputs always resolve to exact Journey-member allocations.
- Receipt upload failure never rolls back an accepted Expense and Expense sync
  failure never discards a locally saved receipt.
- Heuristic findings never mutate financial records without explicit action.
- Offline create/edit survives termination and automatically resumes later.

## Out Of Scope For This Design Approval

This specification does not authorize schema migrations, new endpoints, Ledger
screens, OCR vendors, payment integration, production changes, or legacy Web
modification. Implementation should begin only after the five Ledger 2.0 design
documents are approved and decomposed into narrow vertical slices.
