# Ledger 2.0 Travel Feedback Decisions

Date: 2026-09-11
Status: Approved design revision; implementation not authorized

## Purpose

This document records the changes made to the approved Ledger 2.0 design after
real Europe-trip use. It is the concise decision index for the companion Audit,
Product Spec, Domain Model, UX Flow, and Sync/Conflict Model.

## Decisions

### 1. Three Financial Truths

- Expense permanently owns merchant/receipt amount and currency.
- PaymentRecord separately stores safe payer-cost evidence: instrument label,
  authorization, posted amount/date, bank FX evidence, known fees, and linked
  receipt/statement assets. Sensitive card or bank credentials are prohibited.
- SettlementValuationSnapshot separately stores the accepted group value in
  Journey settlement currency.
- Adding bank/card evidence never silently revalues the group expense.

### 2. Journey Valuation Policy

Every Journey chooses a default: trusted reference rate, actual payer posted
cost, manual agreed valuation, or same-currency. Every accepted Expense revision
records the applied policy and immutable evidence. Exceptions require an audit
reason.

### 3. Household Is Ledger Phase 1

Phase 1 supports equal per person, equal per household, household/member shares
such as adult `1` and child `0.5`, exact amounts, and percentages. Household is
only a convenience and provenance layer. Save always resolves to exact
Journey-member minor-unit allocations.

### 4. Receipt Is First-Class And Independent

Both `Expense -> attach receipt` and `receipt -> OCR -> reviewed Expense draft`
are required. Expense financial sync, receipt upload, and OCR are separate
durable lifecycles; failure in one cannot roll back or delete another.

### 5. Collaborative Corrections Do Not Broaden Mutation

Creators edit their own unfinalized Expenses. Organizers can correct another
member's Expense only with a reason. Ordinary members submit a versioned
correction request; it cannot mutate the Expense until accepted through the
normal permission, validation, revision, and audit path.

### 6. Deletion Is Reversible

Expense deletion uses a local-first tombstone with restore history. Finalized
Settlement inputs require reopen, supersede, or an explicit adjustment rather
than silent mutation.

### 7. Personal Balance Must Be Fully Explainable

Every member can drill from balance to creditor/debtor, Expense, own exact split,
merchant amount, settlement valuation, rate/payment evidence, rounding, and
recorded transfers. Organizer assistance must not be required to explain a
number.

### 8. Currency Is ISO 4217 Based

A versioned ISO 4217 metadata source defines codes and exponents. Recent
currencies are UX shortcuts, not a canonical allowlist. Mutable provider/cache
quotes, immutable accepted rate evidence, actual posted conversion, and final
repayment conversion remain separate.

### 9. Cross-Currency Repayment Is Explicit

Member obligations are denominated in Journey settlement currency. A repayment
in another currency stores both the amount paid and settlement amount discharged,
plus immutable conversion evidence and involved-member confirmation. FX
differences and fees are visible, not silently absorbed.

### 10. Ledger Audit Has Two Layers

- Deterministic validation enforces exact allocations, percentages, valid
  members, currency/rate/valuation consistency, zero-net settlement,
  idempotency, and revision integrity.
- Intelligent review flags likely duplicates, outliers, suspicious currencies
  or rates, contextual participant mismatch, evidence mismatch, missing large
  receipts, and likely missing/duplicate expenses.

AI and heuristics only flag or recommend. They never modify financial truth.

### 11. Offline Architecture Is Unchanged

Create, edit, tombstone, evidence capture, correction proposal, and queueing are
local-first. Network and Auth availability control synchronization only. Durable
workers remain isolated by financial data, asset upload/OCR, and other domains.

### 12. Journey Context Is Mandatory

Every Journey owns an independent Ledger. The selected Journey and dates are
always visible. Zero, one, and multiple Journeys active today have deterministic
entry behavior, with a chooser for ambiguity and My Ledger when no trip is
current.

### 13. Spending And Settlement Are Peer Views

Spending analysis/search and member settlement answer different questions over
the same accepted data. They are separate primary views, not one balance-heavy
dashboard. My Ledger adds period-based personal reporting across Journeys while
preserving Journey boundaries and never cross-netting debts.

### 14. Repayment Requires Two-Sided Evidence

A SettlementTransfer is an obligation and may have several partial
SettlementPayments. The payer records Paid; the recipient independently confirms
Received. Only confirmed payments reduce the obligation. Awaiting, rejected,
disputed, and organizer-assisted outcomes remain auditable.

## Phase Impact

Moved into Ledger Phase 1:

- Household/family selection and allocation;
- basic adult/child member shares;
- PaymentRecord and settlement valuation separation;
- receipt-first and attach-after-create evidence flows;
- lightweight correction requests;
- explainable personal balance drill-down;
- ISO 4217 coverage and explicit cross-currency repayment;
- deterministic validation and advisory heuristic review.
- explicit Journey context and My Ledger;
- separate Spending analysis/search and Settlement modes;
- partial payments with bilateral Paid/Received acknowledgement.

Still Phase 2 or future:

- richer OCR and line-item suggestions;
- general-purpose weighted splits beyond household/member shares;
- bank-account/card-provider integrations;
- advanced review inference and workflow discussion;
- rate-provider redundancy and signed provenance.

## Implementation Boundary

This revision authorizes design changes only. It does not authorize migrations,
backend endpoints, Mobile UI, OCR/provider selection, Production changes, or
legacy Web modification. Implementation must be decomposed into separately
approved vertical slices.
