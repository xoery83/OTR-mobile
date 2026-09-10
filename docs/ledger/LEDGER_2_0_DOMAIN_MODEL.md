# Ledger 2.0 Domain Model

Date: 2026-09-10
Status: Canonical model proposal; not a migration specification

## Design Goals

- Correct integer money and deterministic rounding.
- One atomic, versioned Expense aggregate.
- Stable Journey-member identity, including unlinked travellers.
- Immutable conversion evidence and explainable settlement.
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
- attachment and itinerary link sets;
- one `ExpenseAuditEvent` describing the accepted change.

The aggregate is created or replaced atomically by a repository locally and by
one backend command remotely. A partial header/split state is invalid.

### Settlement Aggregate

A Settlement consists of:

- an immutable input snapshot of accepted expense revisions;
- member net balances;
- a generated set of `SettlementTransfer` records;
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

| Field                                 | Meaning                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `id`                                  | Stable client-generated UUID; idempotent server identity may map separately |
| `serverId`                            | Remote id once reconciled                                                   |
| `journeyId`                           | Owning Journey                                                              |
| `title`                               | Merchant or concise purpose; may initially be `Expense`                     |
| `notes`                               | Optional private-to-Journey notes                                           |
| `categoryId`                          | Stable category identifier, default `other`                                 |
| `occurredAt`                          | Zoned timestamp or local date/time plus timezone semantics                  |
| `originalAmountMinor`                 | Amount paid in original currency                                            |
| `originalCurrency`                    | ISO code                                                                    |
| `originalCurrencyScale`               | Captured ISO exponent                                                       |
| `settlementAmountMinor`               | Converted accepted amount, nullable while rate required                     |
| `settlementCurrency`                  | Journey currency captured on the revision                                   |
| `payerMemberId`                       | Single Journey member payer                                                 |
| `splitMode`                           | `EQUAL`, `EXACT`, `PERCENTAGE`, future `WEIGHTED`                           |
| `status`                              | `DRAFT`, `ACCEPTED`, `RATE_REQUIRED`, `CONFLICT`, `DELETED`                 |
| `createdByUserId`                     | Auth actor where linked                                                     |
| `createdByMemberId`                   | Journey-member actor                                                        |
| `revision`                            | Monotonic server aggregate revision                                         |
| `createdAt`, `updatedAt`, `deletedAt` | Lifecycle timestamps                                                        |
| sync fields                           | Local status, last synced revision/time, error metadata                     |

`settlementAmountMinor` is a stored outcome of the active rate snapshot, not a
value repeatedly recomputed from whichever rate is newest.

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
| `inputWeight`              | Future positive decimal string                 |
| `allocatedOriginalMinor`   | Exact original-currency allocation             |
| `allocatedSettlementMinor` | Exact settlement-currency allocation or null   |
| `roundingAdjustmentMinor`  | Explainable residual assigned to this member   |
| `orderKey`                 | Stable residual tie-break order                |

Both allocated columns must sum exactly to their respective Expense amounts.
`input*` values preserve user intent; `allocated*` values are settlement truth.

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

Snapshots are append-only. A corrected rate creates a new Expense revision and
new snapshot; it does not rewrite prior evidence.

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

Optional Phase 2 convenience entity:

| Field                                | Meaning                                               |
| ------------------------------------ | ----------------------------------------------------- |
| `id`, `journeyId`, `name`            | Scope and display                                     |
| `memberIds`                          | Current selection members                             |
| `defaultSplitStrategy`               | Equal by member, equal by household, or saved weights |
| `createdBy`, `updatedAt`, `revision` | Management metadata                                   |

A Household never owns money or replaces members in settlement. Selecting it
expands to member participants and exact splits at save time. Historical
expenses are unaffected when the household later changes.

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

| Field                                      | Meaning                                                      |
| ------------------------------------------ | ------------------------------------------------------------ |
| `id`, `journeyId`                          | Identity/scope                                               |
| `settlementCurrency`, `currencyScale`      | Calculation unit                                             |
| `status`                                   | Draft, ready, finalized, partially paid, settled, superseded |
| `throughTimestamp`                         | Included-ledger cutoff                                       |
| `inputDigest`                              | Digest of included expense revisions/transfers               |
| `algorithmVersion`                         | Reproducible calculation version                             |
| `createdBy`, `finalizedBy`                 | Actors                                                       |
| `createdAt`, `finalizedAt`, `supersededAt` | Lifecycle                                                    |
| `revision`                                 | Optimistic concurrency version                               |

Supporting immutable rows record each included expense id/revision and each
member's paid, owed, transferred, and net minor-unit totals.

### SettlementTransfer

| Field                              | Meaning                               |
| ---------------------------------- | ------------------------------------- |
| `id`, `settlementId`, `journeyId`  | Identity/scope                        |
| `fromMemberId`, `toMemberId`       | Direction                             |
| `amountMinor`, `currency`, `scale` | Exact transfer                        |
| `status`                           | Suggested, confirmed, paid, cancelled |
| `recordedBy`, `confirmedBy`        | Actors                                |
| `paidAt`, `confirmedAt`            | Evidence times                        |
| `notes`, `evidenceAssetId`         | Optional proof                        |
| `revision`                         | Conflict/version control              |

A paid transfer contributes to subsequent balance calculation. Duplicate
payment recording is prevented by idempotent operation id and server identity.

## Supporting Value Objects

### JourneyLedgerSettings

- Journey id;
- settlement currency and scale;
- rate-staleness threshold;
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

## Invariants

1. Expense original amount is positive and within safe 64-bit bounds.
2. Payer and all participants belong to the Expense Journey at acceptance.
3. There is at least one participant for an accepted settling expense.
4. Exactly one split exists for every included participant and no excluded one.
5. Original split allocations sum exactly to original amount.
6. Settlement allocations sum exactly when conversion is available.
7. Exchange snapshot currencies match Expense currencies and revision.
8. Same-currency rate is exactly one.
9. Revision increments once per accepted aggregate mutation.
10. Deleted Expense retains tombstone and audit history.
11. A finalized Settlement references immutable Expense revisions.
12. Every Settlement member net and all group nets reconcile exactly to zero.
13. A sync operation is idempotent by operation id and target aggregate.

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

1. Load accepted, non-conflicted Expense revisions in the Settlement snapshot.
2. Credit payer and debit split allocations in settlement minor units.
3. Apply paid transfers that precede the snapshot cutoff.
4. Verify group net equals zero.
5. Sort debtors and creditors by amount, then stable member id.
6. Match largest debtor to largest creditor until all balances are zero.
7. Persist inputs, outputs, algorithm version, and digest.

The practical plan uses at most `n - 1` transfers for non-zero members. Exact
global minimization of transfer count can be a future algorithm version if real
group sizes justify the complexity.

## Local SQLite Projection

SQLite should mirror domain ownership rather than the legacy Supabase layout:

- `expenses`;
- `expense_participants`;
- `expense_splits`;
- `exchange_rate_snapshots`;
- `expense_links`;
- `expense_audit_events`;
- `settlements` and `settlement_transfers`;
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
- `POST /v1/trips/:tripId/settlements/preview`
- `POST /v1/trips/:tripId/settlements`
- transfer confirmation/payment commands;
- incremental Ledger pull returning revisions/tombstones.

All accept an idempotency key. Server responses return canonical revision,
normalization/rounding results, rate evidence, and changed-at metadata. Mobile
does not access Ledger Supabase tables directly.

## Legacy Mapping

| Legacy                                | Ledger 2.0                                       |
| ------------------------------------- | ------------------------------------------------ |
| `ledger_entries`                      | Expense header plus aggregate revision           |
| `ledger_entry_participants`           | Participant snapshot + exact Split               |
| mutable rate fields on entry          | immutable ExchangeRateSnapshot per revision      |
| `journey_exchange_rates`              | trusted Journey rate cache, not historical truth |
| `ledger_exchange_rates`               | retire from client-writable domain               |
| unused `ledger_settlements`           | replace with Settlement snapshot + transfers     |
| nullable event/reservation/memory FKs | typed ExpenseLink set                            |
| numeric amounts / JS numbers          | integer minor units + decimal-rate contract      |
| hard delete                           | tombstone + audit event                          |

Production legacy rows will require a separately approved migration strategy.
Where custom split input is absent or totals do not reconcile, migration must
mark the record for review rather than fabricate financial certainty.
