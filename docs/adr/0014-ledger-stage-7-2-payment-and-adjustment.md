# ADR 0014: Ledger Stage 7.2 Payment And Adjustment Lifecycle

Date: 2026-09-12
Status: Accepted; Stage 7.2A and Stage 7.2B gated

## Decision

Stage 7.2 is delivered through two separately approved gates:

1. **7.2A Payment Lifecycle** implements Paid assertions, Received discharge,
   partial and cross-currency repayment, reject/dispute/correction/organizer
   override, durable Mobile operations, concurrency, idempotency, overbooking
   protection, and canonical audit.
2. **7.2B Adjustment** implements post-finalization Expense correction and
   immutable adjustment Settlement lineage. It must not begin until 7.2A passes
   automated, Supabase, and two-client Simulator acceptance and receives a new
   approval.

The following semantics are frozen:

- Paid is an immutable repayment proposition and never reduces debt.
- Received confirms the complete Payment Money, asserted settlement-currency
  discharge, repayment valuation, fee treatment, and Payment identity. It
  cannot edit any of those facts.
- Received creates a separate immutable discharge fact. Authoritative remaining
  debt is obligation minus confirmed discharge facts.
- Awaiting discharge is only an overbooking reservation. Confirmed remaining,
  awaiting amount, and available-to-report amount are distinct values.
- A Payment may leave `AWAITING_CONFIRMATION` only for `CONFIRMED`, `REJECTED`,
  `DISPUTED`, or `CORRECTED`. Those states are terminal for that Payment.
- Recognition of a rejected, disputed, or corrected Payment requires a new
  replacement Payment; an old Payment is never resurrected.
- Cross-currency Payment Money and asserted discharge use one immutable
  repayment valuation snapshot and deterministic integer-minor-unit rounding.
- Organizer actions preserve the real actor and explicit authority. An
  organizer override never records the recipient as the confirming actor and
  always requires a reason.
- Confirmed plus active-awaiting discharge cannot exceed the Transfer
  obligation. This guard never treats awaiting value as discharged value.
- Settlement/Transfer/Payment/valuation/discharge/audit lineage is immutable
  and explicit.
- Once a Settlement is `FINALIZED`, it is never rebuilt or reopened. The reopen
  endpoint returns `SETTLEMENT_REOPEN_NOT_ALLOWED`.
- Stage 7.2B adjustment `sealed` value will use only the frozen root member
  balance vector plus frozen finalized adjustment delta vectors. Current
  Expense rows can never reconstruct historical sealed state. Confirmed
  payments affect outstanding reads, not adjustment delta.
- A zero-transfer adjustment will require a changed canonical input digest and
  an explicit authorized command with reason. Replays cannot create no-op
  adjustments.

## Stage 7.2B Adjustment Decision

An Adjustment is an immutable successor in one root Settlement lineage. It is
not a rebuild, reopen, or supersession of the root or any earlier Adjustment.
For every member, positive balance means receivable and negative balance means
payable:

```text
sealed = root finalized balance vector
       + sum(prior finalized Adjustment delta vectors)
current = current canonical eligible balance vector in the root frozen scope
delta = current - sealed
```

Every vector must sum to zero. The Adjustment transfer plan applies the existing
deterministic greedy algorithm to `delta`. Root and Adjustment Transfers remain
independent immutable obligations even when later Transfers point in the opposite
direction.

Current input is recomputed with the root Journey, cutoff, settlement
currency/scale, eligibility semantics/version, and settlement algorithm/version.
Deleted or draft Expenses are excluded; a deleted previously sealed Expense is
therefore reversed by the delta. New, restored, or changed Expenses participate
only when their current canonical occurrence is within the root cutoff. Moving
an Expense across the cutoff removes or adds it. Open conflict and `RATE_REQUIRED`
facts in scope block Adjustment finalization.

The Adjustment financial-input digest covers only normalized settlement-relevant
facts. Expense revision and descriptive/member-display changes are retained as
provenance but do not alone change this digest. The first prior digest is derived
from frozen root inputs; later prior digests come from the lineage head. A digest
may recur after a real reversal and is therefore not globally unique.

Journey-readable members may preview Adjustment readiness. Only an organizer may
finalize, and every finalization requires a non-empty reason. A zero-transfer
Adjustment additionally requires an explicit zero-transfer acknowledgement and a
changed digest. Identical input returns `ADJUSTMENT_NOT_REQUIRED` and creates no
history.

The canonical read model derives `ADJUSTMENT_REQUIRED` or `ADJUSTMENT_BLOCKED`
without persisting a draft Settlement. Confirmed Discharges affect only the
outstanding projection. Paid assertions, awaiting reservations, and all Payment
facts remain outside Adjustment delta calculation.

Finalization is serialized at the root lineage. The request names the expected
head and digest; a changed head or input returns stable `SETTLEMENT_INPUT_STALE`.
Database uniqueness permits only one first Adjustment and one successor for each
Adjustment, preventing forks independently of application code.

## Stage 7.2A State

Each Transfer may own many Payment propositions. A Payment contains immutable
actual Payment Money, asserted discharge Money, optional repayment valuation,
fee treatment, payer assertion actor/time, and evidence references. Its current
terminal lifecycle projection is audited but its financial proposition is
never updated.

Only a separate discharge row created by accepted Received confirmation enters
confirmed discharge totals. For an unlinked recipient, an organizer may record
an explicitly labelled `ORGANIZER_OVERRIDE` receipt confirmation with the real
organizer actor and mandatory reason. It never impersonates the recipient.

Transfer amounts are derived as:

```text
confirmedDischarge = sum(immutable discharge facts)
confirmedRemaining = obligation - confirmedDischarge
awaitingAmount = sum(active awaiting asserted discharge)
availableToReport = confirmedRemaining - awaitingAmount
```

Transfer status is `DISPUTED` when an original Payment is disputed, otherwise
`SETTLED` when confirmed remaining is zero, `AWAITING_CONFIRMATION` when an
active reservation exists, `PARTIALLY_PAID` when confirmed discharge is
positive, and `OPEN` otherwise. Settlement `PARTIALLY_PAID`/`SETTLED` state is
derived only from confirmed discharge.

## Consequences

Stage 7.2A advances SQLite to schema 13 and adds three forward-only Supabase
migrations for Payment/Discharge behavior. Stage 7.2B advances SQLite to schema
14 and adds the Adjustment lineage/RPC migration plus a forward-only migration
that records prior Hosted Dev hardening in the rebuildable canonical lineage.
Both stages reuse the existing durable queue, Backend idempotency ledger,
incremental pull, audit tables, and money helpers. No payment provider, new state
framework, export, Stage 7.3 work, Production change, or legacy Web change is
authorized.
