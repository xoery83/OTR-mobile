# Ledger 2.0 Product Specification

Date: 2026-09-10
Status: Proposal for approval; no implementation authorized

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

- Record who paid, how much, in which currency, and who benefited.
- Exclude travellers who did not participate.
- Express equal, exact-amount, and percentage splits accurately.
- Edit mistakes offline without losing auditability.
- See personal and group balances in the settlement currency.
- Convert multi-currency spending using documented snapshots or overrides.
- Reduce net balances to a practical set of transfers.
- Record payment of those transfers and share a final statement.

## Capability Priorities

The phases below are Ledger product increments, separate from the completed
Mobile Foundation and vertical-slice phase names.

### Ledger Phase 1: Must-Have

- Fast `+ Expense` flow and local-first instant save.
- Single payer selected from Journey members.
- Multiple included participants and quick exclusion.
- Equal split with deterministic minor-unit residual allocation.
- Exact/custom-amount split.
- Percentage split with exact validation and deterministic rounding.
- Original amount and ISO currency.
- Fixed Journey settlement currency.
- Per-expense exchange-rate snapshot with source/date/provenance.
- Manual exchange-rate override with explicit confirmation and audit reason.
- Date/time, category, optional notes, optional location.
- Optional itinerary and document/receipt links.
- Creator/organizer permission model enforced server-side.
- Offline create/edit/delete with durable queue and tombstones.
- Pending, synced, retryable, and conflict status.
- Automatic retry after auth/network recovery.
- Versioned audit history for all financial changes.
- Per-member balances and explainable expense breakdown.
- Deterministic minimized transfer suggestion.
- Settlement run and transfer recording.
- Shareable/exportable final statement, at minimum PDF and CSV/data export.
- Accessibility: large targets, dynamic type, screen-reader labels, high
  contrast, and no color-only status.

### Ledger Phase 2: Should-Have

- Household/family groups for selection and reusable allocation presets.
- Recent payer/participant presets scoped to the Journey and device.
- Repeated split templates with an explicit preview before save.
- Text Capture that prefills an expense draft.
- Voice Capture with transcript review.
- Receipt/photo Capture and local attachment queue.
- OCR-assisted merchant, amount, currency, date, and category extraction.
- Duplicate-expense warning using amount/currency/time/merchant evidence.
- Settlement acknowledgements between linked members.
- Organizer correction workflow with a reason.
- Richer statement filters and private share links with expiry.
- Optional notification when a user must resolve a conflict or confirm a
  transfer involving them.

### Future / Optional

- Weighted shares as a named advanced mode. Weights must be converted to exact
  minor-unit allocations at save time.
- Multi-payer expense support. Until a real need is proven, represent repayment
  or reimbursement separately rather than complicating common entry.
- Bank/payment-provider deep links where regionally reliable.
- Receipt line-item splitting.
- Recurring trip templates across Journeys.
- Policy budgets, spending limits, or approval workflows.
- Offline OCR models if size, privacy, and accuracy justify them.
- Automated rate-provider redundancy and signed rate provenance.
- Strict global minimum-transfer optimization beyond the practical
  deterministic plan.

### Legacy Features To Remove Or Defer

- Web `stats_only` mode as a primary user choice. Reintroduce only as a clearly
  named personal/non-settling expense if research confirms the need.
- One-time Journey exchange-rate refresh restriction.
- Destructive base-currency rebasing of historical expenses.
- Global writable exchange-rate table.
- Heuristic travel audit panel in the core entry workflow.
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
- Weighted: future weights are positive values and are resolved to exact saved
  allocations using the same residual algorithm.

## Multi-Currency Rules

- Original amount/currency never changes as a side effect of a rate refresh.
- Each expense owns an immutable conversion snapshot revision containing rate,
  quote/base currencies, effective date, source, and whether it was manual.
- Settlement calculations use converted integer minor units captured on the
  accepted expense revision.
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

## Permissions And Finalization

| Action                              | Traveller                                | Creator | Organizer        |
| ----------------------------------- | ---------------------------------------- | ------- | ---------------- |
| View Journey Ledger                 | Yes                                      | Yes     | Yes              |
| Create expense                      | Yes                                      | Yes     | Yes              |
| Edit/delete own unfinalized expense | N/A                                      | Yes     | Yes              |
| Edit another member's expense       | No                                       | No      | Yes, with reason |
| Resolve financial conflict          | Involved creator may choose own revision | Yes     | Yes              |
| Change settlement currency          | No                                       | No      | Yes              |
| Generate/finalize settlement        | No                                       | No      | Yes              |
| Record transfer involving self      | Yes                                      | Yes     | Yes              |
| Override any transfer/finalization  | No                                       | No      | Yes, audited     |

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
an adjustment run. Transfers have pending/confirmed/paid/cancelled states,
actor, timestamps, optional notes, and optional evidence attachment.

### Explainability

Each member can open:

- total paid;
- total owed;
- recorded transfers;
- resulting balance;
- the exact expense shares that produced each number;
- rate source for converted expenses.

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
- Final settlement balances net to exactly zero before transfer recording.
- A member can explain their balance without organizer assistance.
- Offline create/edit survives termination and automatically resumes later.

## Out Of Scope For This Design Approval

This specification does not authorize schema migrations, new endpoints, Ledger
screens, OCR vendors, payment integration, production changes, or legacy Web
modification. Implementation should begin only after the five Ledger 2.0 design
documents are approved and decomposed into narrow vertical slices.
