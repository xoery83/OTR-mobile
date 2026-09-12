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
- `GET /v2/trips/:tripId/settlements/:id/export?format=pdf|csv`

Preview returns an `inputDigest`. Finalize succeeds only when that digest still
matches all Expense revisions, valuations, members, and confirmed payments.
Reporting Paid and confirming Received are separate authenticated operations.
Only confirmed payments discharge an obligation.

Stage 7.1 has no SettlementPayment facts, so its digest contains only the
Expense/member/settings/valuation and algorithm inputs defined below. Payment
scope enters the adjustment lineage in Stage 7.2.

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
`SETTLEMENT_ALREADY_FINALIZED`; Stage 7.2 owns explicit supersede/adjustment.
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
