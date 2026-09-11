# Ledger 2.0 Sync And Conflict Model

Date: 2026-09-11
Status: Approved base with travel-feedback revision; no implementation authorized

## Safety Goal

Ledger sync must recover automatically from ordinary network/auth failures while
making concurrent financial disagreement explicit. Financially material fields
never use silent last-writer-wins.

## Local-First Lifecycle

1. UI submits a command to the Expense repository.
2. Domain logic validates the complete aggregate and exact allocations.
3. One SQLite transaction writes the new local revision, audit event, and sync
   operation.
4. UI immediately reads the local projection.
5. Sync worker sends the queued command when network and online Auth permit.
6. Backend authenticates, authorizes, validates, checks idempotency/base
   revision, and commits the aggregate transactionally.
7. Mobile reconciles canonical server id, revision, rounding/rate metadata, and
   timestamps in one local transaction.

Screen lifecycle does not own or cancel this operation.

## Sync States

Expense business state and transport state remain separate.

Transport states:

- PENDING;
- SYNCING;
- SYNCED;
- RETRYABLE;
- BLOCKED_AUTH;
- CONFLICT;
- PERMANENT_FAILURE.

Business states:

- DRAFT;
- ACCEPTED;
- RATE_REQUIRED;
- DELETED;
- included/finalized settlement status derived from Settlement records.

An offline accepted Expense can be PENDING without being a draft. A synced
Expense can still be RATE_REQUIRED. Status labels must not collapse these two
dimensions.

## Operation Model

Each durable operation contains:

- operation UUID and idempotency key;
- Journey/entity/entity id;
- command type;
- base server revision;
- client aggregate revision;
- canonical payload or content hash;
- base snapshot or field hashes needed for three-way comparison;
- actor and device id;
- attempt count, next attempt time, and normalized error;
- created/updated times.

Supported command direction:

- CREATE_EXPENSE;
- UPDATE_EXPENSE;
- DELETE_EXPENSE;
- RESOLVE_EXPENSE_CONFLICT;
- CREATE/FINALIZE/REOPEN_SETTLEMENT;
- RECORD_TRANSFER_PAYMENT;
- CONFIRM/REJECT/DISPUTE_TRANSFER_PAYMENT;
- CANCEL_TRANSFER;
- UPSERT_PAYMENT_RECORD;
- PROPOSE/ACCEPT/REJECT/WITHDRAW_EXPENSE_CORRECTION;
- ACKNOWLEDGE/DISMISS_LEDGER_REVIEW_FINDING.

Queue rows are immutable in identity and coalesced only under explicit rules.
For example, several unsynced edits after a never-synced create may update that
create payload while retaining the same idempotency identity and local audit
events. A delete after a never-synced create may cancel remote creation but must
preserve local audit/tombstone history.

## Idempotency

The backend records or deterministically resolves each operation id. Retrying
the same operation and payload returns the original accepted server result.

If the same idempotency key arrives with a different payload hash, return an
idempotency conflict; never treat it as a new Expense. Response loss after a
successful commit therefore cannot create a duplicate.

## Optimistic Concurrency

Update/delete commands include base revision. The backend accepts only when:

- caller has permission;
- current server revision equals base revision; and
- aggregate invariants hold.

If server revision advanced, backend returns a structured conflict:

- current server aggregate and revision;
- submitted local aggregate and its base revision;
- changed field groups since base where available;
- involved audit event summaries;
- stable conflict id.

Mobile stores the immutable base, submitted, and canonical-at-conflict
snapshots, marks the aggregate CONFLICT, and continues to allow unrelated Ledger
operations to sync. A later server revision never rewrites that observation. A
second conflict supersedes the old envelope and creates a new immutable OPEN
envelope.

## Field Groups

Conflict decisions operate on groups rather than independent database columns.

### Financial Core

- original amount;
- payer;
- participants;
- split mode/inputs/allocations;
- original currency;
- settlement currency;
- exchange-rate snapshot;
- accepted settlement valuation policy/snapshot;
- payer PaymentRecord when it is referenced by settlement valuation.

These fields are interdependent. If either side changed any Financial Core field
since the shared base, do not auto-merge any of them. Require an explicit
resolved aggregate and rerun invariant/rounding validation.

### Descriptive

- title/merchant;
- notes;
- category;
- occurred date/time;
- location.

These may use three-way merge rules when independent, but the merged result is
still a new revision.

### Links

- itinerary/reservation links;
- receipt/document links;
- place link.

Links are set-valued and support per-link merge rules with explicit removal
semantics.

### Evidence And Collaboration

- PaymentRecords not referenced by the active valuation;
- correction requests and resolution state;
- receipt/statement assets and OCR proposals;
- heuristic review findings and acknowledgements.

These have independent lifecycles. Adding evidence may merge as an append-only
addition, but replacing/removing evidence or accepting a correction uses
revision checks. An OCR proposal or heuristic finding never mutates Expense
financial truth.

## Field-Level Policy

| Field                | One side changed                                        | Both sides changed                                            | Policy                                                |
| -------------------- | ------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| Merchant amount      | Take changed side                                       | Manual resolution                                             | Financial Core; preserve prior immutable revision     |
| Payer                | Take changed side                                       | Manual resolution                                             | Never infer from participants                         |
| Participants         | Take changed side                                       | Manual resolution                                             | Add/remove affects splits; no set union by default    |
| Split                | Take changed side                                       | Manual resolution                                             | Validate exact totals and rounding                    |
| Original currency    | Take changed side                                       | Manual resolution                                             | Amount/rate/split reviewed together                   |
| Settlement valuation | Take changed side if Financial Core otherwise unchanged | Manual resolution                                             | Compare policy, value, rate and evidence together     |
| Payment evidence     | Append independent evidence                             | Manual resolution if same evidence is corrected/replaced      | Never overwrite posted cost or authorization silently |
| Notes                | Take changed side                                       | Three-way text proposal, user confirms if overlapping         | Never discard either text silently                    |
| Category             | Take changed side                                       | Deterministic latest may be proposed, user-visible in history | Category is report material but not balance material  |
| Itinerary links      | Add/remove delta merge when different targets           | Conflict when one removes what other edits/replaces           | Preserve explicit removals                            |
| Document links       | Set union for independent additions                     | Conflict on remove-versus-update or evidence replacement      | Never lose a receipt silently                         |
| Correction request   | Append as independent proposal                          | Revision conflict if accepted against stale Expense           | Proposal never mutates Expense directly               |

Occurred date/time and location follow descriptive three-way merge, except a
date change that alters an included finalized settlement requires reopening or
adjustment review.

## Create/Create Collision

Client-generated ids and operation idempotency should make accidental collisions
extremely unlikely. If the same Expense id exists with a different creator or
payload, reject with identity/idempotency conflict. Do not merge.

## Delete Conflicts

Delete is a tombstone command with base revision.

- Delete versus no remote change: accept tombstone.
- Delete versus descriptive remote edit: show delete/edit conflict; creator or
  organizer chooses delete or restore merged revision.
- Delete versus Financial Core edit: explicit financial conflict.
- Edit versus existing tombstone: show deleted version and permit organizer or
  authorized creator to restore as a new revision.
- Finalized Settlement reference: ordinary delete is rejected; use adjustment or
  reopen flow.

Tombstones remain in incremental sync long enough for every active device and
retention policy. Audit history is retained according to financial policy.

## Rate Conflicts

Automatic provider refresh does not mutate accepted Expense revisions. It only
adds candidate rate data.

Applying a different rate creates an Expense financial revision. Concurrent
manual/provider changes require explicit resolution. The UI compares converted
amount, rate, date, source, staleness, and manual reason.

Reference-rate cache refresh, PaymentRecord correction, and accepted settlement
valuation are separate operations. New posted-cost evidence does not alter group
value unless an authorized command explicitly applies `ACTUAL_PAYER_COST` and
creates a new SettlementValuationSnapshot. Conversely, a new reference valuation
does not rewrite the payer's bank/card evidence.

An offline RATE_REQUIRED Expense may sync its original amount/splits before a
rate exists, but the backend and client must both exclude it from final
settlement until a conversion revision is accepted.

## Participant And Membership Changes

Expense participants reference stable Journey member ids and preserve display
snapshots. Removing or unlinking a member from the current Journey does not
rewrite historical expenses or balances. New expenses cannot select an inactive
member unless an organizer explicitly records a historical correction.

Household membership changes affect presets only. They never mutate saved
Expense participants or splits.

Household splits are accepted only after expansion to exact member allocations.
Concurrent Household definition changes cannot invalidate or rewrite an already
accepted Expense; a new draft may warn that its preset became stale.

## Collaborative Correction Conflicts

Correction requests carry the Expense base revision. They sync as proposals,
not Expense updates. If the Expense advances before acceptance, the request
becomes `STALE` and must be rebased or rejected; it is never applied blindly.

Creator acceptance and organizer resolution execute the same complete aggregate
validation and optimistic concurrency checks as a direct edit. Organizer edits
to another member's Expense require a non-empty reason. Rejection, withdrawal,
and stale outcomes remain in the audit history.

## Settlement Conflicts

A Settlement has an input digest over:

- included Expense ids/revisions;
- conversion snapshot ids;
- accepted SettlementValuationSnapshot ids;
- PaymentRecord ids used by `ACTUAL_PAYER_COST` valuations;
- paid transfers applied;
- member identities;
- algorithm version and currency.

Finalization is accepted only if the preview digest still matches current
server inputs. Otherwise return STALE_SETTLEMENT_PREVIEW and regenerate; do not
silently finalize a different set.

Expense changes after finalization either:

- reopen/supersede the Settlement with organizer confirmation; or
- create an explicit adjustment in a later Settlement.

Transfer obligations and each SettlementPayment use separate revisions.
`RECORD_TRANSFER_PAYMENT` is the payer-side Paid assertion;
`CONFIRM_TRANSFER_PAYMENT` is the recipient-side Received acknowledgement.
Each has its own idempotency key. Only confirmed payments affect the discharged
amount. Multiple partial payments may sync independently and are folded in a
stable order. Conflicting confirmation/rejection/cancellation updates require
explicit resolution and retain all audit events.

For cross-currency repayment, the transfer's settlement obligation, actual
payment Money, and repayment valuation snapshot are one financial group.
Conflicting amounts/rates require both-party or organizer resolution and cannot
use last-writer-wins.

## Retry Policy

Automatically retry:

- offline/network unavailable;
- timeout or response loss;
- server 5xx/429 using bounded exponential backoff and jitter;
- expired access token after silent refresh succeeds.

Do not retry automatically:

- validation failure;
- permission denial;
- revoked session/REAUTH_REQUIRED;
- optimistic concurrency conflict;
- idempotency-key payload mismatch;
- finalized-settlement invariant rejection.

Retry metadata survives app restart. A failed Expense remains readable/editable
locally. Successful later sync reconciles without duplicate local or server rows.

## Authentication Boundary

- AUTHENTICATED_OFFLINE permits all local Ledger reads, creates, edits,
  tombstones, attachments, and queueing allowed by cached capabilities.
- Remote sync waits for AUTHENTICATED_ONLINE.
- Token expiry while offline never logs the user out or hides Ledger.
- Explicit refresh-session rejection pauses remote writes and moves to
  REAUTH_REQUIRED, while cached data remains protected according to local
  security policy.

Cached permissions are optimistic UX hints only. The backend is authoritative
and may reject a queued command if membership changed.

## Worker Isolation And Ordering

- Ledger worker consumes only Ledger entity/operation types.
- Expense operations for the same Expense execute serially by local revision.
- Different Expenses may sync concurrently within a conservative limit.
- Settlement finalization waits until preceding Ledger operations for the
  Journey are resolved.
- Payment report/confirmation commands for one transfer execute serially by
  payment revision; operations for other transfers may proceed independently.
- Asset upload worker is independent; link metadata and upload state reconcile
  separately.
- Receipt/statement upload and OCR workers cannot consume Expense financial
  operations; an upload failure never rolls back Expense sync.
- Itinerary worker cannot consume Ledger operations, preserving the proven
  Phase 2A/2B isolation pattern.

## Pull And Reconciliation

Backend incremental pull returns:

- aggregate revisions after cursor;
- tombstones;
- audit summaries needed by authorized users;
- settlement/transfer changes;
- a new stable cursor.

Repository applies each page transactionally. Local pending operations are not
overwritten by pulled remote revisions; they are compared against their base and
either rebased when disjoint or marked conflict.

## Auto-Merge Rules

Stage 4C v1 performs no automatic three-way merge. Every genuine concurrent
Expense edit enters explicit conflict handling, including disjoint descriptive
changes. The comparison flow may prepare a candidate resolved aggregate, but a
creator or organizer must explicitly submit the resolution.

Field groups and immutable base/submitted/canonical snapshots remain in the
contract so a later approved audited auto-merge can be added without redesign.
No heuristic finding or correction proposal may mutate Expense truth.

## Conflict Resolution Command

Resolution payload includes:

- conflict id;
- server revision being resolved;
- chosen complete canonical aggregate;
- selected source per field group;
- actor and required reason;
- new idempotency key.

Backend rechecks current revision and invariants. If the server advanced again,
supersede the prior envelope and return a new conflict rather than applying a
stale resolution. Keeping the unchanged current Journey aggregate resolves and
audits the conflict without incrementing the Expense revision. Keeping the
submitted branch or sending an explicitly edited result creates one new Expense
revision.

## Observability And Privacy

Safe logs include operation/request id, entity type, Journey id hash, revision,
status, normalized error, and duration. Never log tokens, secret keys, receipt
contents, notes, participant names, amounts, or full payloads by default.

Diagnostics may show counts and operation ids in Development. Production support
exports require explicit user action and redaction.

## Required Tests

### Domain

- minor-unit bounds and currency scales;
- equal-person/equal-household/household-share/exact/percentage allocation;
- aggregate invariants;
- merchant/payment/settlement valuation separation and provenance;
- net balances and transfer determinism.
- deterministic audit checks and proof that heuristics cannot mutate records.

### Repository

- aggregate plus queue atomicity;
- offline update/delete and tombstones;
- coalescing rules;
- restart persistence;
- conflict-version storage and reconciliation.

### Backend

- Auth and Journey role matrix;
- idempotent create/update/delete;
- same key/different payload rejection;
- optimistic concurrency conflict;
- organizer override reason;
- member correction request cannot directly mutate another creator's Expense;
- stale correction acceptance is rejected;
- finalized Settlement protection;
- transactional aggregate persistence.

### End-To-End

- offline create/edit/restart/reconnect;
- ambiguous response loss;
- two-device Financial Core conflict;
- disjoint descriptive auto-merge;
- receipt upload independent from Expense sync;
- receipt-first offline draft and OCR retry isolation;
- rate required then resolved;
- posted-cost evidence added without changing reference-policy group value;
- cross-currency transfer confirmation and valuation conflict;
- heuristic warning dismissal without financial mutation;
- settlement preview stale rejection;
- no duplicate Expense, audit event, or transfer.

## Legacy Behaviors Explicitly Rejected

- remote write required before UI save;
- participant rows updated separately from Expense;
- hard delete without base revision/tombstone;
- silent historical rebase;
- custom split rows destroyed by edit;
- client-only creator guard;
- any-trip-member participant mutation;
- floating-point settlement authority;
- recomputed final statement without immutable inputs.
