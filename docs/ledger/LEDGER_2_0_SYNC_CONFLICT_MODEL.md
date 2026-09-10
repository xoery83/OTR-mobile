# Ledger 2.0 Sync And Conflict Model

Date: 2026-09-10
Status: Proposal; builds on the approved offline-first sync architecture

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
- RECORD/CONFIRM/CANCEL_TRANSFER.

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

Mobile stores both versions, marks the aggregate CONFLICT, and continues to
allow unrelated Ledger operations to sync.

## Field Groups

Conflict decisions operate on groups rather than independent database columns.

### Financial Core

- original amount;
- payer;
- participants;
- split mode/inputs/allocations;
- original currency;
- settlement currency;
- exchange-rate snapshot.

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

## Field-Level Policy

| Field             | One side changed                                        | Both sides changed                                            | Policy                                                      |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Amount            | Take changed side                                       | Manual resolution                                             | Financial Core; recalculate all allocations and conversion  |
| Payer             | Take changed side                                       | Manual resolution                                             | Never infer from participants                               |
| Participants      | Take changed side                                       | Manual resolution                                             | Add/remove affects splits; no set union by default          |
| Split             | Take changed side                                       | Manual resolution                                             | Validate exact totals and rounding                          |
| Original currency | Take changed side                                       | Manual resolution                                             | Amount/rate/split reviewed together                         |
| Exchange rate     | Take changed side if Financial Core otherwise unchanged | Manual resolution                                             | Preserve both provenance records; manual reason if override |
| Notes             | Take changed side                                       | Three-way text proposal, user confirms if overlapping         | Never discard either text silently                          |
| Category          | Take changed side                                       | Deterministic latest may be proposed, user-visible in history | Category is report material but not balance material        |
| Itinerary links   | Add/remove delta merge when different targets           | Conflict when one removes what other edits/replaces           | Preserve explicit removals                                  |
| Document links    | Set union for independent additions                     | Conflict on remove-versus-update or evidence replacement      | Never lose a receipt silently                               |

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

## Settlement Conflicts

A Settlement has an input digest over:

- included Expense ids/revisions;
- conversion snapshot ids;
- paid transfers applied;
- member identities;
- algorithm version and currency.

Finalization is accepted only if the preview digest still matches current
server inputs. Otherwise return STALE_SETTLEMENT_PREVIEW and regenerate; do not
silently finalize a different set.

Expense changes after finalization either:

- reopen/supersede the Settlement with organizer confirmation; or
- create an explicit adjustment in a later Settlement.

Transfer status updates use their own revision. Conflicting paid/cancelled
updates require explicit confirmation and retain both audit events.

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
- Asset upload worker is independent; link metadata and upload state reconcile
  separately.
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

Auto-merge is permitted only when a three-way comparison proves disjoint,
non-financial changes. Examples:

- local notes changed, remote category changed;
- each side independently added a different document link;
- local location added, remote title enriched.

Auto-merge produces a new explicit local revision/audit event and sync command.
It is not invisible last-writer-wins.

No Financial Core field participates in automatic merge if both branches changed
any Financial Core field.

## Conflict Resolution Command

Resolution payload includes:

- conflict id;
- server revision being resolved;
- chosen complete canonical aggregate;
- selected source per field group;
- actor and required reason;
- new idempotency key.

Backend rechecks current revision and invariants. If the server advanced again,
return a new conflict rather than applying a stale resolution.

## Observability And Privacy

Safe logs include operation/request id, entity type, Journey id hash, revision,
status, normalized error, and duration. Never log tokens, secret keys, receipt
contents, notes, participant names, amounts, or full payloads by default.

Diagnostics may show counts and operation ids in Development. Production support
exports require explicit user action and redaction.

## Required Tests

### Domain

- minor-unit bounds and currency scales;
- equal/exact/percentage residual allocation;
- aggregate invariants;
- conversion rounding/provenance;
- net balances and transfer determinism.

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
- finalized Settlement protection;
- transactional aggregate persistence.

### End-To-End

- offline create/edit/restart/reconnect;
- ambiguous response loss;
- two-device Financial Core conflict;
- disjoint descriptive auto-merge;
- receipt upload independent from Expense sync;
- rate required then resolved;
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
