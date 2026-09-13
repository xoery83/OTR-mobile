# Ledger 2.0 API Contract

Date: 2026-09-11
Status: Stage 0 frozen contract; implementation proceeds by vertical slice

## Boundary

All routes are under `/v2`. They are available only from the OTR Dev Backend
during implementation. Every request requires a Supabase Dev bearer token.
Every mutation requires `Idempotency-Key`; updates also require `baseRevision`.
Mobile never receives or uses Supabase business-table credentials.

All money uses:

```ts
type MoneyDto = {
  minor: number; // signed safe integer on the wire
  currency: string; // ISO 4217 uppercase code
  scale: number; // captured exponent, 0...4
};
```

Rates are decimal strings and optional integer ratios. Timestamps are UTC ISO
8601 strings. Entity ids are UUIDs; unsynced Mobile records additionally carry a
local UUID. Responses are runtime validated.

## Common Envelopes

Mutation success:

```ts
type MutationResult<T> = {
  entity: T;
  serverId: string;
  revision: number;
  updatedAt: string;
  idempotentReplay: boolean;
};
```

Conflict:

```ts
type ConflictResult<T> = {
  error: {
    code: "REVISION_CONFLICT";
    conflictId: string;
    baseRevision: number;
    currentRevision: number;
    submitted: T;
    current: T;
    changedGroups: Array<"FINANCIAL_CORE" | "DESCRIPTIVE" | "LINKS" | "EVIDENCE">;
    requestId: string;
  };
};
```

Normalized errors use stable codes: `AUTH_REQUIRED`, `INVALID_SESSION`,
`TRIP_READ_FORBIDDEN`, `TRIP_WRITE_FORBIDDEN`, `INVALID_PAYLOAD`,
`INVALID_IDEMPOTENCY_KEY`, `IDEMPOTENCY_CONFLICT`, `REVISION_CONFLICT`,
`SETTLEMENT_INPUT_STALE`, `FINANCIAL_INVARIANT_FAILED`, `RATE_REQUIRED`,
`ENTITY_NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`, and
`BACKEND_UNAVAILABLE`.

Stage 7.2B additionally uses `ADJUSTMENT_NOT_REQUIRED` when the current normalized
financial input digest equals the lineage head. `SETTLEMENT_INPUT_STALE` covers a
changed Adjustment lineage head or changed current financial input.

## Expense Aggregate

`ExpenseDto` contains:

- id, Journey id, revision, creator/updater ids and timestamps;
- business status and optional tombstone;
- title, description, category, occurred time, and optional location snapshot;
- payer Journey-member id;
- immutable original merchant Money;
- included member snapshots and one exact Split per included member;
- active immutable SettlementValuationSnapshot when resolved;
- append-only PaymentRecords and rate snapshots;
- itinerary/document/receipt links;
- latest transport-independent audit summaries.

Financial Core is original Money, payer, included participants, exact splits,
currency, valuation policy, and accepted valuation evidence. Concurrent changes
to Financial Core never silently merge.

## Read Routes

### `GET /v2/trips/:tripId/ledger/bootstrap`

Returns Journey Ledger settings, member snapshots/capabilities, Expense pages,
Households, active/open Settlement summary, change cursor, and server time.

### `GET /v2/trips/:tripId/ledger/changes?cursor=&limit=`

Returns ordered aggregate revisions and tombstones plus the next opaque cursor.
The cursor is scoped to the authenticated user and Journey.

Stage 8 cursors are versioned and validate Journey, authenticated user, and
continuation sequence. Decode, version, or scope failure returns
`INVALID_CURSOR`; it is never interpreted as sequence zero. Responses include
`hasMore`. Mobile commits each page and its cursor in one SQLite transaction.

### Ledger Review

- `GET /v2/trips/:tripId/ledger/review` returns authorized findings and their
  append-only action history.
- `POST /v2/trips/:tripId/ledger/review/refresh` runs deterministic validation
  against existing canonical revisions and versioned advisory Review rules.
- `POST /v2/trips/:tripId/review-findings/:findingId/actions` accepts
  `ACKNOWLEDGED` or `DISMISSED`, base finding revision, non-empty reason, and an
  operation id equal to `Idempotency-Key`.

Deterministic validation of uncommitted input returns
`LEDGER_VALIDATION_FAILED` with `{ issues: [{ code, field }] }`; it creates no
cloud finding. Deterministic findings cannot accept human actions. Expense
findings may be acted on by their creator or an organizer; Settlement findings
require an organizer. Actions never edit financial records or finding evidence.

### Receipt Cache Recovery

`GET /v2/trips/:tripId/receipts/:receiptId/content` returns canonical receipt
bytes only to an authorized Journey reader and only after upload completion.
Mobile may evict an uploaded local copy only after this route returns bytes whose
length and SHA-256 match canonical metadata.

### `GET /v2/trips/:tripId/expenses`

Supports opaque pagination plus date, category, member, currency, status,
receipt, and text-query filters. This is a backend/export/support route; normal
Mobile lists read SQLite after bootstrap/pull.

### `GET /v2/trips/:tripId/expenses/:expenseId`

Returns the complete authorized aggregate.

### `GET /v2/trips/:tripId/ledger/analysis`

Returns server-verifiable grouped totals. Mobile may calculate equivalent
offline projections from SQLite; both must reconcile from the same exact splits.

Stage 6 accepts the same explicit `[from,to)` date bounds and category,
payer/member, currency, business-status, sync-status, conflict, valuation, and
receipt-presence filters used by Mobile. Each total or bucket returns its exact
included Expense ids and unresolved-rate/open-conflict counts so its drill-down
can be verified without changing reporting semantics.

### `GET /v2/me/ledger?from=&to=&reportingCurrency=`

Returns personal spending and obligations grouped by Journey. It never nets
debts between Journeys. Reporting conversion includes provenance and is display
only.

Stage 6 requires explicit UTC `[from,to)` bounds for bounded periods and returns
Journey-separated settlement-currency rows with personal spend, paid value, and
pre-settlement position. Cross-Journey reporting-currency conversion is not
enabled; `reportingCurrency` is rejected unless a later contract supplies
explicit reporting-rate provenance.

## Expense Commands

### `POST /v2/trips/:tripId/expenses`

Creates one complete aggregate transactionally. The backend recomputes and
validates exact allocation. Returns canonical rounding and revision `1`.

### `PUT /v2/trips/:tripId/expenses/:expenseId`

Replaces the accepted aggregate using `baseRevision`. Organizer edits to another
creator's Expense require `auditReason`.

### `DELETE /v2/trips/:tripId/expenses/:expenseId`

Creates a tombstone revision; it never hard-deletes history.

### `POST /v2/trips/:tripId/expenses/:expenseId/restore`

Restores from a tombstone using its current revision and creates an audit event.

### `POST /v2/trips/:tripId/expenses/:expenseId/conflict-resolution`

Accepts a conflict id, current server revision, complete resolved aggregate,
field-group provenance, and reason.

Stage 4C v1 never auto-merges concurrent Expense branches. Choosing the current
canonical Journey aggregate unchanged closes and audits the conflict without
incrementing the Expense revision. Choosing the submitted aggregate or an
explicitly edited aggregate creates one validated Expense revision. Conflict
envelopes are immutable; if the server advances during resolution, the prior
envelope is superseded and a new conflict envelope is returned.

## Correction Commands

- `POST /v2/trips/:tripId/expenses/:expenseId/corrections`
- `POST /v2/trips/:tripId/corrections/:id/accept`
- `POST /v2/trips/:tripId/corrections/:id/reject`
- `POST /v2/trips/:tripId/corrections/:id/withdraw`

An ordinary member proposal never mutates Expense. Acceptance revalidates the
current Expense revision; stale proposals require review. The Stage 4C proposal
contains only the complete Stage 4 editable Expense aggregate: title,
description, category, occurred time, payer, original Money, business status,
participants, exact splits, and the already-supported valuation snapshot. It
does not add Stage 5 payment, rate, receipt, or evidence mutation fields.

## Evidence And Receipt Commands

- `POST /v2/trips/:tripId/expenses/:expenseId/payment-records`
- `POST /v2/trips/:tripId/expenses/:expenseId/valuations`
- `POST /v2/trips/:tripId/expenses/:expenseId/links`
- `POST /v2/trips/:tripId/receipts`
- `POST /v2/trips/:tripId/receipts/:id/upload-complete`
- `POST /v2/trips/:tripId/receipts/:id/ocr`

Payment/rate evidence is append-only. Receipt metadata, binary upload, OCR, and
Expense financial sync have separate idempotency and status.

### Stage 5.1 Financial Evidence

`GET /v2/trips/:tripId/ledger/rate-quotes?quoteCurrency=&baseCurrency=` returns
service-role-managed rate candidates with provider provenance, effective date,
observation time, and freshness. It never accepts a Mobile write. Quote refresh
does not change an Expense, revision, audit history, or conflict state.

Creating a PaymentRecord accepts a local id, optional authorization and posted
Money, evidence times, fee, instrument label, source/notes, and an optional
`supersedesPaymentRecordId`. It is an independent append-only evidence command:
it has its own idempotency and revision, creates an `EVIDENCE` audit event, and
never changes Expense valuation, group amount, business revision, or status.

Creating a valuation requires `baseRevision`, an explicit policy, and a client
preview of settlement Money. `REFERENCE_RATE` references one trusted candidate;
`ACTUAL_PAYER_COST` references a non-superseded posted PaymentRecord;
`MANUAL_AGREED` supplies a positive decimal rate and non-blank reason; and
`SAME_CURRENCY` requires identical merchant and Journey settlement currencies.
Accepting a valuation atomically creates immutable rate/valuation snapshots,
reallocates settlement splits, advances the Expense revision once, and records
`FINANCIAL_CORE` audit. Stale reference evidence requires an explicit reason.

Missing trusted rate data is not an API or synchronization error. The Expense
may be accepted and pulled with business status `RATE_REQUIRED`, no active
valuation, and null settlement splits. A later valuation uses the normal
optimistic revision check; concurrent valuation produces the established
`REVISION_CONFLICT` envelope and resolution lifecycle.

Stage 5.1 bootstrap and incremental pull include authorized rate candidates and
append-only PaymentRecords. Existing fields remain backward compatible and the
active `valuation` projection remains singular; historical snapshots remain
available for audit and explanation.

### Stage 5.2 Receipt Assets

`POST /v2/trips/:tripId/receipts` creates or replays receipt metadata from a
stable Mobile local id and returns the canonical receipt id and object path.
The request contains MIME type, byte size and SHA-256 only; it never contains
receipt bytes or OCR text.

`PUT /v2/trips/:tripId/receipts/:id/content` is an authenticated binary upload
to the receipt's fixed private object path. Retries overwrite that same object,
so response loss cannot create another asset. The backend rejects bytes whose
size or SHA-256 differs from the declared metadata.

`POST /v2/trips/:tripId/receipts/:id/upload-complete` is an idempotent command.
It validates receipt identity, object path, stored byte size and SHA-256 before
marking the asset uploaded. Same key/same payload replays; any identity or
content mismatch fails without linking an Expense.

`POST /v2/trips/:tripId/receipts/:id/links` idempotently links an uploaded or
locally pending receipt to one Expense in the same Journey. Receipt upload and
Expense mutation use independent identities and queues.

`POST /v2/trips/:tripId/receipts/:id/ocr` runs the single configured OCR
adapter and persists `PENDING`, `RUNNING`, `SUCCEEDED`, or `FAILED`. Its response
contains only structured suggestions for title, merchant amount/currency,
occurred date, and category. Raw OCR text is neither returned nor stored.
Suggestions never mutate an Expense or payment/valuation evidence. Mobile must
apply accepted fields through the existing explicit Expense command path.

## Settlement Commands

- `POST /v2/trips/:tripId/settlements/preview`
- `POST /v2/trips/:tripId/settlements`
- `POST /v2/trips/:tripId/settlements/:id/reopen`
- `POST /v2/trips/:tripId/transfers/:id/payments`
- `POST /v2/trips/:tripId/transfer-payments/:id/confirm`
- `POST /v2/trips/:tripId/transfer-payments/:id/reject`
- `POST /v2/trips/:tripId/transfer-payments/:id/dispute`
- `POST /v2/trips/:tripId/transfer-payments/:id/correct`

Stage 7.3 intentionally has no server binary-export endpoint. Mobile performs an
authenticated canonical bootstrap, verifies exact local/server lineage-head
agreement and final-settlement readiness, then generates PDF/CSV from the single
repository-backed `SettlementStatement`. Existing digest-keyed files may be
viewed or shared offline. See ADR 0015.

Preview returns an `inputDigest`. Finalize succeeds only when that digest still
matches all normalized Expense revisions, valuations, members, settings, and
algorithm inputs.
Reporting Paid and confirming Received are separate authenticated operations.
Only confirmed payments discharge an obligation.

Stage 7.2A freezes a Payment as the complete immutable repayment proposition:
Payment Money, asserted settlement-currency discharge, repayment valuation,
fee treatment, and Payment identity. Received accepts that exact proposition
and creates a separate immutable discharge fact; it cannot modify the Payment.
Rejected, disputed, corrected, and confirmed states are terminal for the
original Payment. A later resolution creates a replacement Payment.

Paid accepts a client-generated Payment id, `baseTransferRevision`, actual
Payment Money, asserted discharge Money, optional repayment valuation, optional
fee treatment/evidence/notes, and `paidAt`. Same-currency payment requires exact
Payment/discharge equality. Cross-currency payment requires an immutable
valuation whose decimal rate deterministically reproduces asserted discharge.

Confirm/reject/dispute/correct accept `basePaymentRevision`. Reject, dispute,
correction, and organizer override require a reason where applicable. Recipient
confirmation cannot alter financial fields. Organizer receipt confirmation for
an unlinked recipient records `ORGANIZER_OVERRIDE`, the real actor, and the
reason; it never records the recipient as actor.

The Transfer read model returns `obligation`, `confirmedDischarge`,
`confirmedRemaining`, `awaitingAmount`, and `availableToReport` separately.
Confirmed plus active awaiting cannot exceed obligation, but only confirmed
discharge reduces debt.

`POST /v2/trips/:tripId/settlements/:id/reopen` always returns HTTP 409
`SETTLEMENT_REOPEN_NOT_ALLOWED`. Finalized Settlements are never rebuilt.
Post-finalization financial changes are represented only through the Stage 7.2B
Adjustment endpoints below; reopening remains forbidden.

SettlementPayment and discharge facts never rewrite the frozen finalization
digest. They affect the outstanding read state; Stage 7.2B compares current
canonical financial inputs with the frozen lineage inputs.

### Stage 7.2B Adjustment

- `POST /v2/trips/:tripId/settlements/:rootId/adjustments/preview`
- `POST /v2/trips/:tripId/settlements/:rootId/adjustments`

Preview is Journey-readable and non-persistent. It returns the root and current
head identities, prior/current normalized financial-input digests, immutable
sealed balances, current canonical balances, `delta = current - sealed`, changed
Expense identities/classifications, blockers/exclusions, the deterministic delta
transfer plan, and one of `PREVIEW_BLOCKED`, `PREVIEW_UNCHANGED`, or
`PREVIEW_READY`.

The root fixes Journey, cutoff, settlement currency/scale, eligibility semantics
version, and algorithm version for every descendant. Positive member balance is
receivable and negative is payable. Root, every delta, sealed, current, and delta
vectors must each net to zero.

Finalize requires `expectedHeadId` (null only before the first Adjustment),
`inputDigest`, a non-empty `reason`, `allowZeroTransfer`, and an
`Idempotency-Key`. It is organizer-only. The backend locks the root lineage,
recomputes canonical state, rejects a changed head/input as
`SETTLEMENT_INPUT_STALE`, and atomically persists one immutable Adjustment,
current normalized inputs, delta vector, Transfers, audit event, and idempotent
response. One database successor is allowed per head.

A zero-transfer Adjustment is accepted only when its digest differs from the
head, `allowZeroTransfer` is true, and reason is non-empty. Equal digest returns
`ADJUSTMENT_NOT_REQUIRED`. Root and Adjustment Transfers are never rewritten or
netted; each retains its own Payment and Discharge lineage.

Settlement reads additionally return derived lineage readiness
`CURRENT`, `ADJUSTMENT_REQUIRED`, or `ADJUSTMENT_BLOCKED`, plus member-level
outstanding balances. Confirmed Discharge vectors are subtracted from sealed
balances; awaiting Payments remain separate reservations.

### Stage 7.1 Preview And Finalization

`POST /v2/trips/:tripId/settlements/preview` accepts an ISO UTC
`throughTimestamp`. It returns computed state `PREVIEW_BLOCKED` or
`PREVIEW_READY`, blockers and exclusions, normalized immutable input candidates,
member balances, deterministic suggested transfers, `algorithmVersion`, and a
SHA-256 `inputDigest`. Preview creates no Settlement row or business audit event.

`POST /v2/trips/:tripId/settlements` accepts `throughTimestamp` and the preview
`inputDigest` with an `Idempotency-Key`. It is organizer-only. The backend locks
the Journey, rereads and recomputes canonical server state, and returns
`SETTLEMENT_INPUT_STALE` when it differs. A successful transaction begins at
`FINALIZED` and atomically persists:

- one canonical Settlement;
- immutable normalized per-Expense input snapshots;
- immutable member identity/balance snapshots;
- deterministic transfer obligations;
- one append-only `FINALIZED` Settlement audit event;
- the idempotent canonical response.

Concurrent finalization of the same Journey digest returns the same Settlement.
Finalizing a different digest while an active Settlement exists returns
`SETTLEMENT_ALREADY_FINALIZED`; Stage 7.2B owns explicit Adjustment lineage.
Stage 7.1 bootstrap and pull include finalized Settlements and their immutable
inputs, balances, transfers, and audit events. They do not include payment or
export behavior.

## Idempotency And Revisions

The backend stores actor, Journey, command type, key, canonical payload hash,
status, and canonical response. Same key/same hash returns the original result;
same key/different hash returns `IDEMPOTENCY_CONFLICT`.

Creates start at revision `1`. Every accepted mutation increments exactly once.
Append-only child evidence has its own identity/revision and may trigger a new
Expense audit event without rewriting previous evidence.

## Logging And Privacy

Safe logs include request id, route template, hashed Journey/entity ids, actor
class, status, duration, and normalized error code. Do not log bearer tokens,
keys, names, merchant/title, notes, amounts, coordinates, receipt/OCR content,
payloads, or Supabase responses.

## Stage 0 Compatibility

The existing `/v1/trips/:tripId/expenses` Phase 3B create endpoint remains
available while Stage 1 is built. It continues to target legacy
`ledger_entries`. No `/v2` UI may use it. Cutover occurs only when the real
Expense create aggregate passes repository, backend, Dev, and physical-device
validation.
