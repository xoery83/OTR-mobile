# Ledger 2.0 Domain Model

Date: 2026-09-11
Status: Canonical model with travel-feedback revision; not a migration specification

## Design Goals

- Correct integer money and deterministic rounding.
- One atomic, versioned Expense aggregate.
- Stable Journey-member identity, including unlinked travellers.
- Immutable conversion evidence and explainable settlement.
- Independent merchant, payer-cost, and group-settlement financial truths.
- Offline mutation intent, idempotency, tombstones, and conflict support.
- Backend-authorized remote writes with SQLite as Mobile source of truth.
- No requirement to preserve legacy table shapes.

## Aggregate Boundaries

### Expense Aggregate

An Expense revision consists of:

- `Expense` header;
- included `ExpenseParticipant` snapshots;
- one exact `ExpenseSplit` per included member;
- zero or one active `ExchangeRateSnapshot`;
- zero or more append-only `PaymentRecord` evidence revisions;
- one active `SettlementValuationSnapshot` when valuation is resolved;
- attachment and itinerary link sets;
- one `ExpenseAuditEvent` describing the accepted change.

The aggregate is created or replaced atomically by a repository locally and by
one backend command remotely. A partial header/split state is invalid.

### Settlement Aggregate

A Settlement consists of:

- an immutable input snapshot of accepted expense revisions;
- member net balances;
- a generated set of `SettlementTransfer` records;
- zero or more independently versioned `SettlementPayment` records against
  each transfer;
- lifecycle and audit metadata.

Expense changes never silently mutate a finalized Settlement.

## Money Representation

Use integer minor units everywhere an amount is settled or allocated.

```ts
type Money = {
  minor: number; // safe integer
  currency: string; // ISO 4217 uppercase code
  scale: number; // currency exponent captured for audit
};
```

For SQLite and APIs, use a signed 64-bit integer range contract. TypeScript must
validate safe-integer bounds. Currencies with zero or three decimal places use
their correct scale; do not assume two decimals.

Exchange rates are decimal strings or integer ratios, never binary floating
point authority:

```ts
type DecimalRate = {
  numerator: string;
  denominator: string;
};
```

Conversion uses explicit decimal arithmetic, a documented rounding mode, and a
single deterministic residual allocation step.

## Canonical Entities

### Expense

| Field                                 | Meaning                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `id`                                  | Stable client-generated UUID; idempotent server identity may map separately  |
| `serverId`                            | Remote id once reconciled                                                    |
| `journeyId`                           | Owning Journey                                                               |
| `title`                               | Merchant or concise purpose; may initially be `Expense`                      |
| `notes`                               | Optional private-to-Journey notes                                            |
| `categoryId`                          | Stable category identifier, default `other`                                  |
| `occurredAt`                          | Zoned timestamp or local date/time plus timezone semantics                   |
| `originalAmountMinor`                 | Immutable merchant/receipt amount                                            |
| `originalCurrency`                    | ISO code                                                                     |
| `originalCurrencyScale`               | Captured ISO exponent                                                        |
| `payerMemberId`                       | Single Journey member payer                                                  |
| `splitMode`                           | `EQUAL_PERSON`, `EQUAL_HOUSEHOLD`, `HOUSEHOLD_SHARES`, `EXACT`, `PERCENTAGE` |
| `status`                              | `DRAFT`, `ACCEPTED`, `RATE_REQUIRED`, `CONFLICT`, `DELETED`                  |
| `createdByUserId`                     | Auth actor where linked                                                      |
| `createdByMemberId`                   | Journey-member actor                                                         |
| `revision`                            | Monotonic server aggregate revision                                          |
| `createdAt`, `updatedAt`, `deletedAt` | Lifecycle timestamps                                                         |
| sync fields                           | Local status, last synced revision/time, error metadata                      |

Expense owns merchant truth. Payer-cost evidence and group-settlement value are
linked records so a bank-posted amount can differ from a fair agreed valuation.
Original merchant amount/currency are never rewritten by either record.

### ExpenseParticipant

Captures inclusion and historical display identity at a revision.

| Field                   | Meaning                                  |
| ----------------------- | ---------------------------------------- |
| `expenseId`, `memberId` | Aggregate/member key                     |
| `displayNameSnapshot`   | Optional historical display fallback     |
| `householdIdSnapshot`   | Optional selection provenance only       |
| `includedAtRevision`    | Expense revision that accepted inclusion |

Exclusions are represented by absence from this included set. The audit event
records additions/removals. This prevents a future Journey membership change
from rewriting historical participation.

### ExpenseSplit

Stores the user's declared rule and exact accepted allocation.

| Field                      | Meaning                                        |
| -------------------------- | ---------------------------------------------- |
| `expenseId`, `memberId`    | One split per included participant             |
| `mode`                     | Equal, exact, percentage, or weighted          |
| `inputAmountMinor`         | Exact original-currency input where applicable |
| `inputPercentageMicros`    | Fixed-scale percentage input                   |
| `inputWeight`              | Positive household/member share input          |
| `allocatedOriginalMinor`   | Exact original-currency allocation             |
| `allocatedSettlementMinor` | Exact settlement-currency allocation or null   |
| `roundingAdjustmentMinor`  | Explainable residual assigned to this member   |
| `orderKey`                 | Stable residual tie-break order                |

Both allocated columns must sum exactly to their respective Expense amounts.
`input*` values preserve user intent; `allocated*` values are settlement truth.

For Household modes, also capture `householdIdSnapshot` and the household share
input used to derive the member allocation. Household rows never replace the
final member-level splits.

### PaymentRecord

Optional evidence for what the payer's instrument actually authorized or
posted. It is not automatically the group's settlement value.

| Field                                                                     | Meaning                                                        |
| ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `id`, `expenseId`, `expenseRevision`                                      | Stable evidence/revision linkage                               |
| `payerMemberId`                                                           | Payer whose cost is evidenced                                  |
| `instrumentLabel`                                                         | User-safe label such as `Visa NZ` or `Cash`; no PAN or secrets |
| `authorizationAmountMinor`, `authorizationCurrency`, `authorizationScale` | Optional temporary authorization                               |
| `postedAmountMinor`, `postedCurrency`, `postedScale`                      | Final known bank/card debit                                    |
| `authorizedAt`, `postedAt`                                                | Evidence lifecycle dates                                       |
| `bankFxRateNumerator`, `bankFxRateDenominator`                            | Optional exact bank/card conversion evidence                   |
| `feeAmountMinor`, `feeCurrency`, `feeScale`                               | Explicit known fee; not inferred from rate spread              |
| `evidenceAssetIds`                                                        | Receipt/statement/document links subject to visibility policy  |
| `source`, `notes`, `createdBy`, `createdAt`                               | Provenance without sensitive account data                      |
| `supersedesPaymentRecordId`                                               | Append-only correction chain                                   |

Authorization and posted values may coexist because tips, deposits, and final
settlement can change the charge. The latest accepted posted record is
payer-cost truth; older evidence remains auditable.

### ExchangeRateSnapshot

| Field                                | Meaning                                       |
| ------------------------------------ | --------------------------------------------- |
| `id`, `expenseId`, `expenseRevision` | Immutable revision linkage                    |
| `quoteCurrency`, `baseCurrency`      | Original and settlement currencies            |
| `rateNumerator`, `rateDenominator`   | Exact decimal/ratio representation            |
| `effectiveDate`                      | Market/reference date                         |
| `fetchedAt`                          | Retrieval timestamp                           |
| `provider`                           | Provider or `manual` / `same_currency`        |
| `providerReference`                  | Non-secret source/version identifier          |
| `isManual`                           | Manual override flag                          |
| `manualReason`                       | Required when manual                          |
| `stalenessState`                     | Fresh, stale accepted, or review required     |
| `supersedesSnapshotId`               | Audit chain for explicit conversion revisions |

Snapshots are append-only reference evidence. Provider/cache entries may change,
but an accepted snapshot never does. A corrected rate creates a new Expense
revision and snapshot; it does not rewrite prior evidence.

### SettlementValuationSnapshot

The immutable decision that converts merchant truth into group-settlement
truth for one Expense revision.

| Field                                                            | Meaning                                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `id`, `expenseId`, `expenseRevision`                             | Immutable linkage                                                       |
| `policy`                                                         | `REFERENCE_RATE`, `ACTUAL_PAYER_COST`, `MANUAL_AGREED`, `SAME_CURRENCY` |
| `merchantAmountMinor`, `merchantCurrency`, `merchantScale`       | Captured source truth                                                   |
| `settlementAmountMinor`, `settlementCurrency`, `settlementScale` | Accepted group value                                                    |
| `rateNumerator`, `rateDenominator`, `roundingMode`               | Exact reproducible conversion, when applicable                          |
| `exchangeRateSnapshotId`                                         | Reference-rate evidence, when used                                      |
| `paymentRecordId`                                                | Posted-cost evidence, when used                                         |
| `manualReason`                                                   | Required for manual agreement or policy exception                       |
| `effectiveAt`, `createdBy`, `createdAt`                          | Decision provenance                                                     |
| `supersedesValuationId`                                          | Append-only revision chain                                              |

Changing PaymentRecord evidence does not mutate this snapshot. Applying new
evidence or a different Journey policy creates a new Expense financial revision
and valuation snapshot.

### ExpenseLink

Use one typed relation instead of many nullable columns:

| Field                    | Meaning                                                         |
| ------------------------ | --------------------------------------------------------------- |
| `expenseId`              | Expense aggregate                                               |
| `targetType`             | `ITINERARY_ITEM`, `RESERVATION`, `DOCUMENT`, `RECEIPT`, `PLACE` |
| `targetId`               | Stable local/domain id                                          |
| `linkRole`               | Context, source, evidence, or location                          |
| `createdAt`, `createdBy` | Audit fields                                                    |

Receipt/document targets refer to the existing/future local asset abstraction;
an upload may remain pending without blocking Expense acceptance.

### ExpenseAuditEvent

Append-only event for every accepted mutation:

| Field                                       | Meaning                                                             |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `id`, `expenseId`, `journeyId`              | Identity/scope                                                      |
| `operationId`                               | Idempotent sync command                                             |
| `fromRevision`, `toRevision`                | Version boundary                                                    |
| `action`                                    | Created, edited, deleted, restored, rate changed, conflict resolved |
| `actorUserId`, `actorMemberId`, `actorRole` | Who acted                                                           |
| `reason`                                    | Required for organizer override and financial conflict resolution   |
| `changedFields`                             | Canonical field paths                                               |
| `beforeHash`, `afterHash`                   | Integrity/reconciliation aids                                       |
| `beforeValues`, `afterValues`               | Redacted structured financial diff as policy permits                |
| `occurredAt`, `receivedAt`                  | Device and server times                                             |

Audit events are not the sync queue. They are durable business history created
when a revision is accepted locally and reconciled by the backend.

### Household

Ledger Phase 1 convenience entity:

| Field                                | Meaning                                               |
| ------------------------------------ | ----------------------------------------------------- |
| `id`, `journeyId`, `name`            | Scope and display                                     |
| `memberIds`                          | Current selection members                             |
| `defaultSplitStrategy`               | Equal by member, equal by household, or member shares |
| `memberShares`                       | Positive values such as adult `1`, child `0.5`        |
| `createdBy`, `updatedAt`, `revision` | Management metadata                                   |

A Household never owns money or replaces members in settlement. Selecting it
expands to member participants and exact splits at save time. Historical
expenses are unaffected when the household later changes.

### ExpenseCorrectionRequest

Lightweight collaborative proposal that never mutates an Expense directly:

- id, Journey/Expense id, and base Expense revision;
- proposer user/member id;
- proposed field-group patch and human reason;
- status: `OPEN`, `ACCEPTED`, `REJECTED`, `WITHDRAWN`, `STALE`;
- resolver, resolution reason, resulting Expense revision, and timestamps;
- sync/idempotency metadata.

Accepting a request executes the normal authorized Expense revision command.
Organizer correction of another member's Expense always requires an audit
reason even when no request exists.

### SplitTemplate

Phase 2 Journey/device convenience:

- name;
- participant/member set;
- split mode and inputs;
- optional default payer/category;
- use count and last-used time;
- owner and Journey visibility.

Applying a template always produces a visible preview and concrete Expense
participants/splits.

### Settlement

| Field                                 | Meaning                                                      |
| ------------------------------------- | ------------------------------------------------------------ |
| `id`, `journeyId`                     | Identity/scope                                               |
| `settlementCurrency`, `currencyScale` | Calculation unit                                             |
| `status`                              | Draft, ready, finalized, partially paid, settled, superseded |
| `throughTimestamp`                    | Included-ledger cutoff                                       |
| `inputDigest`                         | Digest of included expense revisions/transfers               |
| `algorithmVersion`                    | Reproducible calculation version                             |
| `createdBy`, `finalizedBy`            | Actors                                                       |
| `revision`                            | Optimistic concurrency version                               |

Supporting immutable rows record each included expense id/revision and each
member's paid, owed, transferred, and net minor-unit totals.

### SettlementTransfer

| Field                                                            | Meaning                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `id`, `settlementId`, `journeyId`                                | Identity/scope                                                            |
| `fromMemberId`, `toMemberId`                                     | Debtor and creditor                                                       |
| `settlementAmountMinor`, `settlementCurrency`, `settlementScale` | Original obligation                                                       |
| `status`                                                         | Open, partially paid, awaiting confirmation, settled, disputed, cancelled |
| `revision`                                                       | Conflict/version control                                                  |

### SettlementPayment

| Field                                                             | Meaning                                              |
| ----------------------------------------------------------------- | ---------------------------------------------------- |
| `id`, `transferId`, `journeyId`                                   | Identity/scope                                       |
| `paymentAmountMinor`, `paymentCurrency`, `paymentScale`           | Immutable amount the payer reports sending           |
| `assertedDischargeMinor`, `settlementCurrency`, `settlementScale` | Proposed obligation reduction awaiting Received      |
| `repaymentValuationSnapshotId`                                    | Immutable cross-currency conversion evidence         |
| `reportedBy`, `paidAt`                                            | Payer-side Paid assertion                            |
| `status`                                                          | Awaiting confirmation, confirmed, rejected, disputed |
| `confirmedBy`, `confirmedAt`                                      | Recipient-side Received acknowledgement              |
| `notes`, `evidenceAssetId`                                        | Optional non-sensitive proof                         |
| `revision`                                                        | Conflict/version control                             |

A transfer may have many payments. Received confirms the entire immutable
repayment proposition and creates a separate immutable discharge fact. Only
those discharge facts reduce remaining obligation; awaiting value is only an
overbooking reservation. `CONFIRMED`, `REJECTED`, `DISPUTED`, and `CORRECTED`
are terminal for the original Payment. Reporting a payment never impersonates
the recipient's confirmation. Duplicate reporting is prevented by operation id
and server identity. When currencies differ, both parties confirm the exact
Payment Money, valuation, fee treatment, and settlement-currency discharge.

### PersonalLedgerProjection

This read model groups the signed-in member's spending, paid amounts, and open
obligations by Journey and reporting period. It may provide converted reporting
totals with explicit rate provenance, but it is not a new financial aggregate.
It must never net a credit in one Journey against a debt in another.

## Supporting Value Objects

### JourneyLedgerSettings

- Journey id;
- settlement currency and scale;
- rate-staleness threshold;
- valuation policy and allowed exception roles;
- default participant/template references;
- settlement lock/finalization policy;
- revision and updater.

After accepted expenses exist, changing settlement currency is a dedicated
command with preview, authorization, and audit; it is not a generic settings
update.

### Category

Use stable ids and localized labels. Keep a small built-in set compatible with
legacy categories, but allow taxonomy evolution without rewriting historical
rows. Category does not alter balances.

### LocationSnapshot

Store display text plus optional place id/coordinates/provenance. Location can
enrich later without blocking save and does not own the Expense lifecycle.

### CurrencyMetadata And RateQuoteCache

- `CurrencyMetadata` is a versioned ISO 4217 code/exponent/name source used for
  validation and formatting. UI recents are shortcuts, not an allowlist.
- `RateQuoteCache` stores mutable provider candidates by currency pair and
  effective time with fetch/expiry/provenance metadata.
- Neither object is historical financial truth. Acceptance copies exact evidence
  into immutable ExchangeRateSnapshot and SettlementValuationSnapshot records.

### LedgerReviewFinding

Stores a deterministic validation result or heuristic observation without
changing the reviewed records:

- stable finding id/type, Journey and related entity ids/revisions;
- layer: `DETERMINISTIC` or `HEURISTIC`;
- severity, confidence where applicable, evidence codes, and generated time;
- status: open, acknowledged, dismissed, resolved, or stale;
- actor/reason for acknowledgement or dismissal;
- detector/ruleset/model version, without storing sensitive prompts by default.

Deterministic errors prevent an invalid aggregate or Settlement from being
accepted. Heuristic findings only recommend review; resolving one requires a
separate authorized domain command.

## Invariants

1. Expense original amount is positive and within safe 64-bit bounds.
2. Payer and all participants belong to the Expense Journey at acceptance.
3. There is at least one participant for an accepted settling expense.
4. Exactly one split exists for every included participant and no excluded one.
5. Original split allocations sum exactly to original amount.
6. Settlement allocations sum exactly when conversion is available.
7. Exchange snapshot currencies match Expense currencies and revision.
8. Settlement valuation matches merchant truth, Journey settlement currency,
   selected policy, and referenced ExchangeRateSnapshot/PaymentRecord.
9. Same-currency rate is exactly one.
10. Household modes resolve to exact Journey-member splits before acceptance.
11. Revision increments once per accepted aggregate mutation.
12. Deleted Expense retains a reversible tombstone and audit history.
13. A finalized Settlement references immutable Expense revisions.
14. Every Settlement member net and all group nets reconcile exactly to zero.
15. A cross-currency transfer records both payment and discharged settlement
    amounts with immutable conversion evidence.
16. A sync operation is idempotent by operation id and target aggregate.

## Rounding Algorithm

For equal, percentage, and weighted modes:

1. calculate each unrounded rational share;
2. floor toward zero to integer minor units;
3. compute residual between Expense amount and allocated sum;
4. assign one minor unit at a time by largest fractional remainder;
5. break equal remainders using stable member/order key;
6. store the adjustment on each split.

This algorithm is versioned and shared between Mobile pure-domain tests and the
backend. The backend recomputes and rejects mismatched client allocations.

## Settlement Algorithm

1. Load accepted, non-conflicted Expense revisions and their accepted
   SettlementValuationSnapshots.
2. Credit payer by group-settlement value and debit exact member allocations in
   settlement minor units; PaymentRecord cost is informational unless the
   selected valuation policy references it.
3. Verify group net equals zero; Payment and discharge facts do not alter this
   frozen financial balance vector.
4. Sort debtors and creditors by amount, then stable member id.
5. Match largest debtor to largest creditor until all balances are zero.
6. Persist inputs, outputs, algorithm version, and digest.

The practical plan uses at most `n - 1` transfers for non-zero members. Exact
global minimization of transfer count can be a future algorithm version if real
group sizes justify the complexity.

## Local SQLite Projection

SQLite should mirror domain ownership rather than the legacy Supabase layout:

- `expenses`;
- `expense_participants`;
- `expense_splits`;
- `exchange_rate_snapshots`;
- `payment_records`;
- `settlement_valuation_snapshots`;
- `expense_links`;
- `expense_audit_events`;
- `expense_correction_requests`;
- `households` and household-member share definitions;
- `settlements` and `settlement_transfers`;
- `settlement_payments`;
- `ledger_review_findings`;
- existing durable `sync_operations` and local asset records.

Local repository transactions write the aggregate and queue operation together.
UI reads repository projections such as list rows, expense detail, member
balance, and settlement summary; UI never joins raw SQLite tables.

## Backend Contract Direction

Commands should operate on aggregates:

- `POST /v1/trips/:tripId/expenses`
- `PUT /v1/trips/:tripId/expenses/:expenseId` with `baseRevision`
- `DELETE /v1/trips/:tripId/expenses/:expenseId` with tombstone/base revision
- `POST /v1/trips/:tripId/expenses/:expenseId/conflict-resolution`
- correction-request propose/accept/reject commands;
- `POST /v1/trips/:tripId/settlements/preview`
- `POST /v1/trips/:tripId/settlements`
- transfer confirmation/payment commands;
- personal cross-Journey reporting queries that return Journey-separated rows;
- incremental Ledger pull returning revisions/tombstones.

All accept an idempotency key. Server responses return canonical revision,
normalization/rounding results, rate evidence, and changed-at metadata. Mobile
does not access Ledger Supabase tables directly.

## Legacy Mapping

| Legacy                                | Ledger 2.0                                        |
| ------------------------------------- | ------------------------------------------------- |
| `ledger_entries`                      | Expense header plus aggregate revision            |
| `ledger_entry_participants`           | Participant snapshot + exact Split                |
| mutable rate fields on entry          | immutable rate + SettlementValuation snapshots    |
| no payer-cost evidence                | append-only PaymentRecord                         |
| `journey_exchange_rates`              | trusted Journey rate cache, not historical truth  |
| `ledger_exchange_rates`               | retire from client-writable domain                |
| unused `ledger_settlements`           | replace with Settlement snapshot + transfers      |
| nullable event/reservation/memory FKs | typed ExpenseLink set                             |
| numeric amounts / JS numbers          | integer minor units + decimal-rate contract       |
| hard delete                           | tombstone + audit event                           |
| no household model                    | Phase 1 convenience resolved to member splits     |
| direct member edits                   | correction request or authorized audited revision |

Production legacy rows will require a separately approved migration strategy.
Where custom split input is absent or totals do not reconcile, migration must
mark the record for review rather than fabricate financial certainty.
