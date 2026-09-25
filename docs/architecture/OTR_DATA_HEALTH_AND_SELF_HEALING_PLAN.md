# OTR Data Health and Self-Healing Plan

Status: approved; Phases A through D accepted; Phase E historical recovery is implemented for acceptance.

Date: 2026-09-24

## 1. Goal and product rule

OTR owns local convergence. A traveller should normally know only that an item was
saved locally, is waiting, or is now shared. They should not need to understand SQLite,
queues, cursors, bootstrap, revisions, FX projections, or repair procedures.

The target is to detect and automatically repair at least 99.9% of recoverable local
consistency and synchronization failures. Human involvement is limited to cases where
OTR cannot safely infer user intent, principally a genuine concurrent edit conflict or
missing irreplaceable input.

This plan adds one system capability with two triggers:

1. automatic, throttled health checks at lifecycle and convergence boundaries;
2. one App-level action: **Settings → Data & Sync → Check Data Health**.

Both triggers call the same coordinator and the same deterministic rules. Normal users
do not receive feature-specific repair controls.

## 2. Non-goals and safety boundaries

- Do not add a second sync engine, repair worker framework, provider, or mutation queue.
- Do not make feature screens own retry or repair lifecycles.
- Do not clear all SQLite data as a normal repair technique.
- Do not infer that a local-only, old, `FAILED`, or server-absent record is garbage.
- Do not rewrite immutable Settlement, valuation, audit, or payment evidence.
- Do not turn approximate/local FX into canonical evidence.
- Do not silently choose between divergent financial user edits.
- Do not cross account or Journey boundaries to make data appear consistent.
- Production deployment and destructive Dev controls are outside this design review.

## 3. Current implementation audit

### 3.1 Existing pieces to reuse

The current code already has most execution primitives:

- SQLite-first repository transactions persist entity state and durable operations.
- `createSyncEngine` provides claim/lease recovery, retry backoff, auth pause, conflict
  routing, and idempotent worker execution.
- `runLedgerOperationalSync` coalesces the existing Personal Payment, Expense, receipt,
  Settlement Payment, Review, and settlement-review workers.
- `refreshJourneyLedger` performs incremental pull and already replaces an explicitly
  invalid Ledger cursor with a scoped bootstrap.
- bootstrap and change application are transactional and defer server Expense changes
  while protected local mutations are pending.
- Personal Payment already coalesces an unattempted CREATE with later offline edits and
  replays an attempted CREATE before dependent mutations.
- account switching pauses/drains sync, switches identity, clears in-memory state,
  restores account-scoped state, then resumes sync.
- receipt cache eviction already requires an authenticated download whose size and
  SHA-256 match before deleting a local original.
- FX uses the existing account-scoped 32-working-day snapshot cache, server rate demand,
  attempt/negative cache, lease, provider, scanner, and projection change feed.
- Review projection is server-derived and can be atomically replaced while pending local
  Review actions remain protected.

These should become health-engine dependencies, not be duplicated.

### 3.2 Proven gaps

1. `syncFailureClass` treats every non-`ApiClientError` as terminal. Unknown transport,
   parsing, environment, and programming-boundary errors can therefore permanently
   strand a valid CREATE.
2. `markFailed` stores a derived code in `last_error_message`, leaves
   `last_error_code` null, and discards the original category and safe message.
3. `listPending` excludes `FAILED`; there is no general reconsideration path after a
   client fix, schema upgrade, restored auth, or restored connectivity.
4. Expense UPDATE/DELETE/RESTORE behind an unfinished CREATE still throws a plain
   `Error`, so it becomes independently terminal. Personal Payment has the newer
   dependency-aware behavior, but Expense does not.
5. Expense offline edits are not coalesced into an unattempted CREATE. Multiple durable
   snapshots can represent one causal local intent without an explicit dependency.
6. workers mark entity rows `FAILED` before the shared engine has classified the
   operation. A retryable queue item can therefore coexist with a `FAILED` entity label.
7. `ledger_deferred_server_changes` is written when local mutations need protection, but
   there is no general replay/drain path after those mutations converge.
8. `getLedgerPendingMutationCount` excludes terminal `FAILED` operations. A user can see
   “up to date” while local-only intent is permanently stranded.
9. Personal Payment has its own cursor in addition to the Ledger cursor, but its pull
   path has no equivalent explicit `INVALID_CURSOR` recovery in the coordinator.
10. receipt operations have a parallel queue implementation and collapse failures to
    `RETRYABLE_TRANSPORT`, `AUTH_PAUSED`, or `TERMINAL`; exact safe diagnostic context is
    not retained.
11. automatic maintenance purges completed operations safely, but no health pass first
    proves that every operation/entity relationship is internally consistent.
12. current health/diagnostics are count-oriented and Dev-facing. There is no product
    coordinator that scans, repairs, verifies, and reports one user-safe outcome.
13. bootstrap protects `PENDING_CREATE`, `PENDING_UPDATE`, `PENDING_DELETE`, and
    `CONFLICT`, but not a stranded local `FAILED` entity. A future broad rebootstrap must
    not overwrite such user intent.
14. health scheduling is Ledger-screen-centric: active polling runs only while that
    surface is visible. App-level recovery should not depend on opening Ledger.

### 3.3 Architectural conflict to correct

`docs/OFFLINE_SYNC.md` currently says validation and permission errors become `FAILED`.
That is too broad for the required invariant. `FAILED` may be terminal only when the
Backend returns a structured, recognized, proven non-retryable business code with an
actionable destination. Missing codes, unknown errors, response-validation failures,
and unsupported client assumptions remain retryable/quarantined for health review.

## 4. Data authority matrix

| Category                        | Current examples                                                                                   | Authority                                                            | May health delete/rebuild?                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable unsynced user mutations | local Expense/Personal Payment/Review action/Settlement Payment rows plus operation payloads       | Local user intent until acknowledged by Backend                      | Never because of age, `FAILED`, or server absence. Repair queue linkage and retry.                                                                    |
| Server-backed domain facts      | synced Expenses, Personal Payments, members, Journey settings, Settlement versions, audit/evidence | Backend/Supabase through OTR API                                     | Local mirror may be replaced from an authorized complete response while protected local intent is overlaid. Server facts are never rewritten locally. |
| Local server mirrors            | members, households, synced Expense aggregates, projection rows, Review snapshots                  | Reconstructable authorized mirror                                    | Yes, only scoped by account/Journey and only after protected intent is identified. Prefer upsert/rebootstrap over bulk delete.                        |
| Derived state                   | reporting totals, local provisional FX, Review visibility/counts, UI summaries                     | Recomputed from protected/local and server facts                     | Yes. Recompute or replace; never use it to decide user intent.                                                                                        |
| Rebuildable caches              | ECB snapshot bundle, rate candidates, My Ledger summaries, downloaded recoverable receipt copies   | Backend/provider-derived                                             | Yes after provenance/hash/scope checks. Stale data is normally retained until replacement arrives.                                                    |
| Sync operations                 | `sync_operations`, `ledger_asset_operations`                                                       | Durable causal record of local intent                                | Pending/conflict/unknown failures are protected. Completed operations may be aged out after entity verification.                                      |
| Cursors                         | Ledger and Personal Payment account/Journey cursors                                                | Opaque server continuation checkpoint                                | Safe to replace through scoped bootstrap; never use one account/Journey cursor for another.                                                           |
| Attachments and local originals | receipt local file, hash, metadata, upload/link operations                                         | Local original is authoritative until verified remote recoverability | Never delete an unverified original. Redownload only from authorized server evidence and verify size/hash.                                            |
| Immutable financial evidence    | accepted valuation snapshots, finalized Settlement inputs/history, audit events, exports           | Backend canonical evidence; local export file may be unique          | Do not reconstruct approximately or purge. Rehydrate exact server evidence; retain locally unique exports.                                            |

An entity can belong to more than one row category. For example, a locally edited
server-backed Expense contains both a server baseline and newer local user intent. Health
must protect the local mutation before refreshing the mirror.

## 5. Health state taxonomy

Every finding has a stable rule ID, account, optional Journey, entity/operation identity,
input digest, severity, repair disposition, and verification result.

- `HEALTHY`: invariant holds.
- `RETRYABLE`: transport/provider/unknown failure; automatic retry is permitted.
- `AUTH_PAUSED`: work is intact but cannot run until the same account recovers auth.
- `DEPENDENCY_BLOCKED`: an operation waits for an earlier causal operation.
- `ACTIONABLE_INPUT`: a structured business validation error maps to normal editing UI.
- `CONFLICT`: multiple valid user intents cannot be deterministically ordered/merged.
- `MIRROR_STALE`: server-backed/rebuildable local data needs pull/bootstrap/recompute.
- `ORPHAN_REBUILDABLE`: derived/cache row has no valid source and may be removed.
- `PROTECTED_LOCAL`: local intent or original must not be overwritten/purged.
- `ISOLATION_VIOLATION`: account/Journey ownership is inconsistent; hide/quarantine and
  stop automatic mutation until the correct scope is proven.
- `UNRECOVERABLE_INPUT`: irreplaceable local source file/data is missing.

`FAILED` remains a storage status for explicit terminal business outcomes during the
migration period; health interprets it using structured failure metadata, never by the
word `FAILED` alone.

## 6. Common health pipeline

The approved shape is:

```text
capture active account/scope generation
  → cheap local scan
  → identify and protect local user intent
  → atomically repair queue/dependency metadata
  → run existing operational sync
  → incremental pull/reconcile
  → scoped bootstrap only when required
  → remove/rebuild only proven reconstructable state
  → verify invariants and report
```

The ordering differs from a simple “purge then bootstrap” flow: protection and queue
repair happen first. Purge is late and optional.

### 6.1 Coordinator

Add one data-layer `DataHealthCoordinator`; it calls a small static list of health rules.
Do not add a general plugin framework. A rule supplies:

- a cheap, read-only local detector;
- a deterministic local repair transaction when possible;
- optional use of an existing sync/pull/bootstrap coordinator;
- a verifier;
- a user-attention descriptor only when required.

Rules return data; they do not navigate or render UI. The Settings screen maps the final
summary and actionable item to ordinary product routes.

### 6.2 Protected-intent manifest

At the start of a run, build a transactionally consistent in-memory manifest of:

- all active-account operations not `COMPLETED`;
- every locally owned unsynced/tombstoned/conflicted domain row they reference;
- local receipt originals and pending link/upload operations;
- pending Review/checkpoint/payment actions;
- server baseline identity/revision where present.

No cleanup/bootstrap replacement may affect a manifest item. If a repair spans a network
round trip, re-read and compare its input digest before applying the response.

### 6.3 Repair durability and crash safety

Repairs do not need a second queue. Existing domain operations remain the executable
work. Add a minimal append-only `data_health_repair_events` audit table with:

- `id`, `account_id`, nullable `journey_id`;
- `rule_id`, `target_type`, `target_id`, `input_digest`;
- `action`, `status = APPLIED | VERIFIED | NEEDS_ATTENTION`;
- counts/safe error code and timestamps, but no private payload or note text;
- uniqueness on `(account_id, rule_id, target_type, target_id, input_digest, action)`.

Each local repair and its `APPLIED` event commit in one SQLite transaction. Re-running the
same rule is a no-op. Network work remains in the existing durable operation. After push
and pull, a second transaction records `VERIFIED`. A killed app resumes by scanning
`APPLIED` events and current data; there is no rollback requirement across the network.

Add one `data_health_state` row per account for last cheap/deep/manual timestamps,
in-progress generation, and last aggregate outcome. This is throttle/UI metadata only.

## 7. Sync error and dependency policy

### 7.1 Structured failure preservation

Extend operation diagnostics to store separately:

- `failure_category`: `NETWORK`, `TIMEOUT`, `SERVER`, `RATE_LIMIT`, `AUTH`,
  `VALIDATION`, `PERMISSION`, `CONFLICT`, `DEPENDENCY`, `RESPONSE_INVALID`, `UNKNOWN`;
- `last_error_code`;
- redacted `last_error_message` capped in length;
- `last_attempt_at`, `first_failed_at`, and `next_attempt_at`;
- optional `dependency_operation_id`.

Never store tokens, request bodies, notes, receipt contents, or raw provider payloads.

### 7.2 Terminal rule

Only an allow-listed Backend business code with a known current contract and explicit
user/action mapping may become terminal. Examples include an invalid Money scale that
must return to the amount editor or proven loss of Journey permission. Generic HTTP 4xx,
plain errors, response-schema mismatches, missing codes, and unknown historical
`SYNC_FAILED` are not sufficient proof.

Unknown CREATE failures remain `RETRYABLE` with capped exponential backoff. Long-lived
retry does not mean frequent retry: it means durable intent plus sparse attempts and
health-triggered reconsideration after app/client changes.

### 7.3 Dependency ordering

An UPDATE/DELETE/child upload that requires a remote parent has
`dependency_operation_id` pointing to the CREATE. Until CREATE completes it is
`DEPENDENCY_BLOCKED`, makes no network call, does not increment an error attempt, and is
not displayed as an independent failure.

For an unattempted CREATE, repositories should coalesce edits into the CREATE payload.
For an attempted CREATE, never alter the request bound to its idempotency key. Replay it
unchanged; after its server identity is known, collapse later local edits into one new
revision-aware UPDATE with a new stable idempotency key. Mark superseded operations
complete only after the current entity digest is confirmed remotely.

## 8. Recovery decision table

| State                                                 | Detection                                                                                  | Protected data                                                          | Automatic action                                                                                         | Verification                                                 | Escalation                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| Local-only valid CREATE                               | `server_id` null/revision 0, valid aggregate and CREATE exists                             | Current entity, original CREATE payload/key, attachments                | Ensure CREATE is runnable; coalesce only if never attempted                                              | Mutation response plus pull maps same local/entity identity  | Only structured validation routed to editor                       |
| Stranded historical FAILED CREATE                     | local-only entity plus `FAILED`; no proven terminal code                                   | Entity and all causal operations forever                                | Validate current aggregate; reclassify unknown failure retryable; replay original CREATE idempotently    | Server identity/revision and current digest converge         | Conflict or explicit business rejection                           |
| UPDATE/DELETE waiting on CREATE                       | dependent op with no server identity                                                       | Latest local entity/tombstone and CREATE                                | Link/block behind CREATE; coalesce unattempted create or replay then emit one current mutation           | Parent mapped, final server state equals current intent      | True revision conflict                                            |
| Retryable network/provider failure                    | structured category or unknown non-business failure                                        | Operation/entity/evidence                                               | Backoff; retry on due time/connectivity/manual health; retain old cache                                  | Operation completes or remains scheduled with metadata       | Never for ordinary outage                                         |
| Auth-paused operation                                 | 401/auth provider state for same account                                                   | Queue/entity                                                            | Pause without attempt burn; resume after session recovery                                                | Same account token executes operation                        | Reauthentication only after explicit invalid/revoked session      |
| Explicit business validation                          | recognized code with field/action mapping                                                  | Invalid draft and user input                                            | Stop repeated push; mark actionable and deep-link normal editor                                          | Corrected mutation gets new operation/key and syncs          | User must correct business fact                                   |
| Permission failure                                    | structured current membership/permission denial                                            | Local user intent                                                       | Refresh membership/capabilities once; if still denied, retain local data and disable push                | Authorized pull confirms capability state                    | User signs in correctly or asks organizer; no technical repair UI |
| Revision conflict                                     | Backend conflict with submitted/current/base evidence                                      | Both user intents and conflict snapshot                                 | Apply safe field merge only where approved; otherwise preserve conflict                                  | Resolved revision and audit returned                         | Human chooses between genuine divergent edits                     |
| Server newer/local clean                              | server revision greater; no protected mutation                                             | Nothing local-only                                                      | Apply incremental change/canonical aggregate                                                             | local revision/digest equals server                          | None                                                              |
| Server newer/local pending                            | pending mutation plus newer server change                                                  | Local command/base snapshot and server change                           | Defer server change; push; use normal conflict protocol                                                  | deferred row drained after canonical reconciliation          | Only unmergeable conflict                                         |
| Server record missing locally                         | authorized change/bootstrap contains entity absent locally                                 | Existing local intent manifest                                          | Insert server mirror                                                                                     | revision, children and scope validate                        | None                                                              |
| Clean server-backed row absent remotely               | complete authorized snapshot/tombstone proves absence                                      | local-only owners/operations checked first                              | Apply tombstone or remove only reconstructable mirror after second scoped reconciliation                 | repeated pull/bootstrap agrees                               | Unexpected absence without tombstone remains quarantined          |
| Stale/invalid cursor                                  | explicit `INVALID_CURSOR`, scope mismatch, impossible continuation                         | pending operations and local-only rows                                  | Discard only that account/Journey cursor; scoped bootstrap with protected overlay                        | new cursor continues and second pull is empty/valid          | Repeated server contract failure                                  |
| Obsolete completed operation                          | old `COMPLETED`, no lease/due metadata, entity reconciled                                  | none                                                                    | Existing 30-day cleanup                                                                                  | no entity loses last recovery evidence                       | None                                                              |
| Obsolete failed operation                             | terminal code superseded by verified later operation/current canonical digest              | repair/audit evidence retained                                          | mark superseded complete, then normal retention cleanup                                                  | later operation and server digest proven                     | Unknown failure never qualifies by age                            |
| Orphan derived data                                   | source ID/revision absent or digest mismatch                                               | no user input                                                           | Delete/recompute scoped row                                                                              | recomputed projection matches sources                        | None                                                              |
| Review finding/projection stale                       | server snapshot generation differs; no pending local action                                | pending Review actions                                                  | refresh existing Review projection; overlay pending action                                               | visibility/decision revision consistent                      | True action conflict only                                         |
| Expense FX valuation stale/missing                    | source revision/date/Money mismatch or `RATE_REQUIRED`                                     | original Money, economic date, accepted evidence, pending manual action | Invalidate only derived candidate; use existing demand/scanner/valuation path                            | accepted valuation binds exact revision/date/digest          | Unsupported/manual-required business case via Expense UI          |
| Personal Payment FX projection stale/missing          | projection target/revision/input digest mismatch                                           | original Payment; old target evidence retained                          | use existing ensure/demand/scanner/change feed; local estimate remains derived                           | matching confirmed projection selected once                  | None for pending publication/provider outage                      |
| FX cache stale/corrupt                                | invalid schema/rate decimal/account, expired refresh horizon                               | confirmed projections/valuations excluded                               | discard only invalid account cache row and fetch existing bundle when online                             | bundle validates and remains account-scoped                  | None                                                              |
| Receipt metadata missing, remote valid                | server receipt/hash exists; local metadata/file missing                                    | pending local asset operations checked first                            | rehydrate metadata; download only when needed                                                            | authorized bytes match size/SHA-256                          | None                                                              |
| Local receipt original missing before verified upload | pending asset references nonexistent file                                                  | metadata and user link intent                                           | stop upload; search only managed known path/hash, never fabricate                                        | local file restored or user reattaches                       | Human reattachment is genuinely required                          |
| Uploaded receipt local copy over limit                | uploaded server identity plus authenticated byte/hash proof                                | server metadata                                                         | reuse existing eviction gate                                                                             | future download again matches                                | None; retain if recovery unavailable                              |
| Account/Journey isolation violation                   | owner/scope mismatch, cursor from another account, local row visible without actor context | all affected rows frozen                                                | hide/quarantine; cancel current run on account generation change; never reassign ownership heuristically | correct account/session and authorized bootstrap prove scope | Security/support review if ownership cannot be proven             |

## 9. Domain-specific rules

### 9.1 Expenses

- Treat the aggregate row, participants, splits, local audit snapshot, and causal queue
  as one protected unit.
- Add the Personal Payment pre-create invariant to Expense: coalesce before first
  attempt; otherwise replay CREATE unchanged and compact later edits only after mapping.
- Change pre-create UPDATE/DELETE/RESTORE from plain terminal errors to dependency state.
- A bootstrap must treat local `FAILED` rows with unacknowledged user intent as protected,
  not as clean mirrors.
- Drain deferred server changes after operation completion; if the deferred revision is
  newer than the acknowledged result, apply or enter normal conflict resolution.

### 9.2 Personal Payments

- Keep the existing pre-create coalescing and attempted-create replay behavior.
- Health verifies that revision-zero records have exactly one live CREATE causal root.
- Deprecated `recordedEquivalent*` remains non-authoritative and is never repaired into
  an FX projection.
- Original Money and explicit economic date remain user-owned; Backend projection
  activity never changes the Payment revision.

### 9.3 Expense FX valuation

- Accepted valuation/evidence is canonical and immutable; local candidate/cache rows are
  reconstructable.
- A source Money/date/revision mismatch invalidates only the active derived/candidate
  selection, preserving history.
- Reuse the existing rate demand, negative cache, scanner and guarded acceptance path.
- `NOT_YET_AVAILABLE` and temporary/provider failures remain scheduled, not user repair.

### 9.4 Personal Payment FX projections

- A projection is a server-derived mirror keyed by payment, target and policy.
- Select only a confirmed projection matching target currency, payment revision, input
  digest, original Money, and economic date.
- Preserve valid old-target projections after Journey currency changes.
- Missing current projection invokes the existing ensure/demand/scanner path; local Slice
  B estimate remains display-only and is replaced without double counting.

### 9.5 Review

- Shared findings and visibility are rebuildable server projections.
- Locally pending raise/ACK/DISMISS operations and their personal decision are protected.
- Refresh may replace the server snapshot only after overlaying protected actions.
- Best-effort Review generation failure after a successful financial mutation is repaired
  by the existing Review refresh/re-evaluation route; it never rolls back the mutation.

### 9.6 Attachments

- Local originals are protected until exact authenticated remote recoverability is
  proven.
- Upload/OCR/link dependencies must be explicit. OCR or link waits for upload/parent
  identity without becoming terminal.
- Missing remote metadata is rebuilt through authorized reads. Missing unuploaded bytes
  cannot be self-healed and is one of the few legitimate user actions.

## 10. `guard 915` recovery acceptance case

Known state:

- local Expense `ledger-expense_mu1lspxf_uqlfy6tau4`;
- current local intent: `guard 915`, ISK 23,333, economic date 2026-09-16;
- `server_id = NULL`, `server_revision = 0`, local revision 6;
- original CREATE operation is `FAILED`, retry count 0, generic `SYNC_FAILED`;
- five later UPDATE operations are also `FAILED` because CREATE never mapped;
- the currently inspected Hosted Dev idempotency table has no matching CREATE key.

The first-version recovery must proceed as follows:

1. Detect one valid local-only Expense with a stranded unclassified CREATE and later
   dependent edits. Do not use age as a deletion signal.
2. Protect the revision-6 aggregate, participants/splits, audit rows, original CREATE
   request, all idempotency keys, and attachments.
3. Revalidate both the original CREATE snapshot and current aggregate with current local
   schemas. Record only validation codes, not financial payloads, in health diagnostics.
4. Reclassify the original CREATE from unknown terminal to retryable. Replay its original
   payload with its original idempotency key; never rewrite an attempted idempotent
   request.
5. If replay returns an existing entity, reconcile that identity. If it creates the
   original CNY 2.00 state, reconcile it identically.
6. Once the server identity exists, create one new revision-aware UPDATE containing the
   current revision-6 ISK 23,333 intent and a new durable idempotency key. The five old
   UPDATEs remain protected but are marked superseded only after this UPDATE is confirmed.
7. Pull/reconcile, verify one remote Expense, matching current Money/date/title/splits,
   no live duplicate, no stranded operation, and an empty/valid subsequent pull.
8. The normal FX demand/scanner then handles ISK valuation. FX confirmation is not part
   of Expense CREATE recovery and cannot mutate the original Money.

If the replay returns a structured validation failure, route to the normal Expense editor
with the failing field. If it returns a true remote revision conflict, preserve both
intents and use the existing conflict flow. Neither case permits deletion.

Acceptance must kill the app after steps 4, 5, and 6 separately and prove that each cold
restart resumes without duplicates or loss.

## 11. Scheduling and throttling

Use cheap local checks freely and expensive network checks sparingly.

| Trigger                  | Local scan                                                                                                                              | Network/convergence policy                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Cold start               | Always after DB migration/open; bounded indexed counts and invariant queries                                                            | Do not block launch. Schedule existing sync only when session permits; deep scan at most once per 24 h.                   |
| Foreground/resume        | If last cheap scan is older than 15 min, prior run was interrupted, or suspicious state exists                                          | Reuse current coalesced operational sync; no full bootstrap by default.                                                   |
| Connectivity restored    | Targeted scan of retryable/unknown/dependency-blocked work                                                                              | Resume due operations immediately once, then pull affected Journeys.                                                      |
| Authentication recovered | Targeted active-account scan                                                                                                            | Resume only that account's operations; never spend attempts while auth-paused.                                            |
| Normal sync completion   | Target only touched operation/entity IDs plus deferred changes                                                                          | Pull affected Journey once; avoid recursive health→sync→health loops using run generation.                                |
| Periodic while active    | Cheap scan every 15 min maximum; pause in background                                                                                    | Network only if due protected work or stale authorized mirror exists. No constant bootstrap.                              |
| Long-lived state         | Daily deep local scan; immediate when a CREATE is `FAILED`, PROCESSING lease expired, or pending age exceeds 15 min without a due retry | Reconsider classification; still obey backoff/provider negative cache.                                                    |
| Manual Settings action   | Bypass scan throttle                                                                                                                    | Run complete active-account health, sync and affected-Journey reconciliation; offline portion still completes truthfully. |

The existing eight-second Ledger polling remains a visible-screen freshness behavior, not
the health scheduler. Health does not introduce another high-frequency timer.

## 12. Settings UX

Add a system-level Settings group:

```text
Data & Sync
  Check Data Health
```

The action runs for the active account and its authorized cached Journeys. It has one
button and no repair choices.

States:

- `Checking your data…`
- `Everything is up to date`
- `3 unsynced changes recovered`
- `Shared data refreshed`
- `Local data repaired`
- offline result: `Your saved data was checked. Changes will sync when you're online.`

If genuine attention is required, show a plain item such as “One expense needs updated
information” and open the existing Expense editor/conflict flow. Do not show queue IDs,
cursors, SQLite terms, provider retry state, raw errors, or a “clear data” option.

The run is cancellable only at the presentation layer: leaving the page stops progress
display but not durable sync/repair. Reopening reads `data_health_state` and shows the
latest result.

## 13. Dev-only controls

Debug Mode may keep separate, clearly labelled destructive controls:

- inspect redacted rule/operation diagnostics;
- inject network loss, response loss, 401, 409, invalid cursor, process kill, and missing
  local file;
- clear a rebuildable cache;
- reset a selected Dev account/Journey mirror and rebootstrap;
- full local reset for a disposable Dev installation.

These controls must remain absent from normal Settings and must require an explicit
confirmation naming what is deleted. They are acceptance tools, not recovery design.

## 14. Observability and diagnostics

Record only safe structured data:

- run ID, trigger, account hash/local account ID, Journey ID where appropriate;
- rule ID, target type, safe target ID, input digest;
- before/after state category, action, duration, retry count;
- safe Backend code/category, HTTP class, and redacted bounded message;
- verification result and counts.

Support diagnostics should report aggregate counts by health state and rule. Debug Mode
may show IDs and safe codes. Never log auth tokens, raw operation payloads, private notes,
receipt/OCR content, full financial exports, or provider responses.

Backend request logs retain request ID and route template. Mobile should persist the last
safe request ID for a failed operation when available so support can correlate it without
exposing credentials.

## 15. Privacy, security, and isolation

- Every local detector and repair query requires the active `account_id`/owner scope.
- Capture account generation at run start; abort before every mutation/reconcile phase if
  it changes.
- Journey work requires an authorized cached actor context; an online pull revalidates it.
- Never adopt an ambiguous legacy row merely because its Journey or member ID matches.
- Shared canonical rows may be visible to multiple authorized accounts; local-only rows,
  cursors, projections, preferences, operations, and health events remain account-scoped.
- Permission denial does not erase local intent. It hides cross-account data and retains
  the record for the owning account pending valid authorization or export/support.

## 16. Required migrations and contract changes

### 16.1 Mobile SQLite

One forward migration should:

1. add structured failure and dependency fields to `sync_operations`;
2. add equivalent safe diagnostic/dependency fields to `ledger_asset_operations`;
3. add indexes for active account/status/due time, entity causal order, dependency, and
   long-lived failure scan;
4. add `data_health_state` and append-only `data_health_repair_events`;
5. preserve every existing row; do not automatically reclassify historical `FAILED`
   operations in migration SQL.

Historical classification happens in reviewed runtime rules because schema migration
cannot prove current entity validity, ownership, or server state.

### 16.2 Mobile contracts

- Extend `ApiClientError`/transport normalization with stable category, safe code,
  redacted message, request ID, and retryability evidence.
- Replace the current default “non-Api error = terminal” with “unknown = retryable”; only
  the explicit allow-list produces terminal/actionable state.
- Add dependency-aware queue selection and completion wake-up.
- Count `FAILED`, dependency-blocked, and actionable protected mutations in user-facing
  “changes waiting” until resolved.

### 16.3 Backend

Version 1 needs no new general repair endpoint. Existing idempotent mutation responses,
bootstrap, incremental pull, Review refresh, and FX scanner are sufficient. This is the
smallest safe design.

Backend work is limited to ensuring every business rejection is structured and stable,
returns a safe actionable code, and includes request ID. If implementation proves that an
old idempotency result cannot be recovered by replay, add one authenticated read-only
operation-status lookup; do not add a second repair API pre-emptively.

## 17. Phased implementation plan

### Phase A — failure fidelity and causal queue invariants

- Persist structured errors correctly.
- Default unknown failures to retryable.
- Add dependency state/field and wake-up.
- Port Expense pre-create coalescing/replay behavior from Personal Payment.
- Align entity sync labels with the classified operation state.
- Drain deferred server changes after reconciliation.

Stop and validate offline CREATE/edit/reconnect before proceeding.

### Phase B — read-only health scanner and user-safe report

- Implement indexed local rules and protected-intent manifest.
- Add health state/event persistence and throttling.
- Add Settings → Data & Sync → Check Data Health with scan-only reporting first.
- Verify account/Journey isolation and no mutations from a read-only run.

### Phase C — deterministic local repair and convergence orchestration

- C0 first adds repair eligibility and deterministic dry-run plans only. It executes no
  mutation and treats `PROTECTED_LOCAL` plus historical unknown `FAILED` as hard vetoes.
- C1 may execute only expired-lease recovery, completed-dependency wake-up, and manual
  reactivation of a sparse long-lived retryable operation after normal backoff. Every
  action must revalidate its C0 plan inside the repair transaction, record `APPLIED`
  atomically, and pass a rescan verifier before `VERIFIED`. It performs no domain mutation
  or network work.
- Enable queue/dependency/error-metadata repairs.
- Reuse operational sync, incremental pull and invalid-cursor bootstrap.
- Add deferred-change drain and orphan-derived cleanup after verification.
- Add receipt metadata/file recovery through existing hash gate.

### Phase D — automatic scheduling

- Wire cold start, resume, reconnect, auth recovery and post-sync targeted checks.
- Add daily deep scan and long-lived-state trigger.
- Prove no polling/bootstrap storm and no recursive run loop.

### Phase E — historical cohort recovery and `guard 915`

- Run the generic classifier read-only on Simulator and physical SQLite copies.
- Review the exact candidate manifest.
- Recover `guard 915` through the normal engine as the first real acceptance case.
- Only after verification decide whether any obsolete records are eligible for normal
  retention cleanup. Do not create environment-general backfill scripts.

Each phase stops for review. Production rollout is separate.

Phase A implementation note (2026-09-24): SQLite migration 35 adds only operation
failure/dependency metadata and indexes. Health state/event tables, scanner, scheduler,
automatic repair, and `guard 915` recovery remain deferred to their approved phases.

Phase B implementation note (2026-09-24): SQLite migration 36 adds only account-scoped
health run state and the future-compatible repair-event schema. The static coordinator
builds an in-memory protected-intent manifest and runs read-only detectors. Phase B never
writes repair events, changes domain/queue/cursor/file state, invokes sync/bootstrap, or
schedules automatic scans. Phase C–E and `guard 915` recovery remain gated.

Phase C2 implementation note (2026-09-24): manual health reuses the existing operational
sync, incremental Ledger/Personal Payment pull, scoped invalid-cursor bootstrap, protected
repository application, and deferred Expense drain. It refreshes affected scopes plus at
most the highest-priority active/recent Journey, reports recovery only after a rescan, and
adds no migration, action classification, worker, queue, Backend endpoint, scheduler,
cache purge, or historical `FAILED` recovery. `guard 915` remains protected for Phase E.

Phase D implementation note (2026-09-24): App-level cold start, foreground,
connectivity/auth recovery, periodic-active and normal-sync completion signals share one
account/generation coalescer. An indexed detector selects suspicious scopes before the
existing pipeline runs; healthy historical Journeys are not scanned or pulled. Cheap and
deep windows remain persisted in migration 36 state, while a short in-process network
cooldown prevents reconnect storms. Normal sync completion performs scoped pull/verify
without starting another sync, and health-origin completion is ignored. Phase D adds no
migration, repair action, worker, queue, Backend endpoint, iOS background guarantee, or
historical `FAILED` recovery.

Phase E implementation note (2026-09-25): One generic
`RECOVER_HISTORICAL_STRANDED_CREATE_V1` action requires an authorized local-only Expense,
exactly one previously attempted unknown historical CREATE, a valid unambiguous UPDATE
chain, intact payload/idempotency evidence, a valid current aggregate, and no local audit
or deferred evidence of an existing server identity. The repair makes only the original
CREATE runnable. Existing sync replays its original request/key, creates one durable
dependency-linked current UPDATE after mapping, and uses a scoped canonical revalidation
before marking the retained historical operations completed. No migration, Backend
endpoint, second worker/queue, destructive cleanup, or broader historical replay was added.

Final cleanup implementation note (2026-09-25):
`RECONCILE_STALE_CONFLICT_V1` closes only Expense conflict metadata whose fresh
account/Journey scope, server identity, complete user-owned aggregate, authoritative
canonical snapshot, revision proof, and absence of newer active mutation all agree.
Resolved/superseded history requires a later completed resolution; an OPEN historical
conflict requires an equal deferred canonical revision. Any difference remains a genuine
conflict. The Ledger pending predicate now counts only operations with an active sync path
(`PENDING`, `PROCESSING`, `RETRYABLE`, or `DEPENDENCY_BLOCKED`); protected historical
`FAILED` rows remain intact and Settlement confirmation-change reporting is unchanged.

## 18. Automated test plan

At minimum:

- offline CREATE → one/many edits → reconnect for Expense and Personal Payment;
- attempted/lost-response CREATE → edit → idempotent replay → one final remote row;
- unknown/plain error, response validation, network, timeout, 429, 5xx, 401, structured
  4xx validation, permission and 409 classification;
- dependency-blocked child/update does not consume attempts or become terminal;
- kill/restart during scan, local repair, CREATE replay, post-push pull and verification;
- historical generic `SYNC_FAILED` remains protected and is reconsidered deterministically;
- deferred server change drains after success and becomes conflict when appropriate;
- invalid Ledger and Personal Payment cursors cause only scoped bootstrap;
- bootstrap never overwrites local pending/failed protected intent;
- server-newer clean/pending, tombstone, unexpected absence and duplicate local/server ID;
- Review refresh with pending ACK/DISMISS/raise overlay;
- Expense FX and Personal Payment projection stale/missing/old-target/no-match cases;
- zero-scale and cross-rate Money remain exact integer/decimal operations;
- receipt upload/link/OCR dependencies, missing file, verified redownload and eviction;
- account switch during every health phase; zero cross-account reads/writes;
- Journey isolation and revoked membership behavior;
- repeated complete health run produces zero new repairs/network mutations;
- canonical Settlement preview/digest/final history remains byte-stable.

Use the existing repository, coordinator, Backend, pgTAP and failure-injection patterns.
Do not add a new test framework.

## 19. Simulator and physical-device acceptance

1. Start clean online, run manual health twice, and prove the second run is a no-op.
2. Disable only OTR network access; create and edit Expense and Personal Payment, attach a
   receipt, kill the app at each causal boundary, and cold start offline.
3. Reconnect; verify automatic convergence without opening Ledger or pressing repair.
4. Inject one response loss after committed CREATE; verify one server entity.
5. Inject unknown error before commit; verify sparse retry and later convergence.
6. Inject structured validation; verify ordinary editor action, not technical repair UI.
7. Inject stale cursor and server-newer changes; verify scoped refresh with local intent
   retained.
8. Switch A → B → A with A pending; prove B cannot see/send/repair A data.
9. Remove a recoverable cached receipt and verify authenticated hash-checked redownload;
   remove an unuploaded original and verify the sole reattachment escalation.
10. Recover `guard 915`; verify exact current ISK intent, one server row, clean queue,
    confirmed/appropriately pending FX state, and stable cold restart.
11. Compare canonical Settlement fingerprints before and after every repair scenario.

## 20. Future module extension

Future Today, Itinerary, Tickets, Capture, and Album modules reuse the same coordinator.
A module contributes only:

- authority classification for its rows/files;
- indexed invariant queries;
- deterministic repair transactions;
- existing sync/pull/bootstrap adapters;
- verification and normal editing destination.

It does not get a separate health button, scheduler, retry engine, or reset workflow.
File-heavy modules reuse the receipt rule: protect local originals until remote recovery
is authenticated and hash-proven.

## 21. Decisions requested before implementation

1. Approve unknown/unclassified mutation failures as indefinitely retryable with sparse
   backoff, while only allow-listed business codes may terminate.
2. Approve adding explicit operation dependency metadata rather than relying only on
   worker-thrown dependency errors.
3. Approve the two small health metadata tables; no second executable queue is added.
4. Approve retrying the original `guard 915` CREATE unchanged, then sending one new
   compacted UPDATE for current intent after server identity is known.
5. Confirm that loss of an unuploaded local attachment and a true divergent edit conflict
   are the primary user-escalation cases.

Until these decisions are approved, `guard 915`, its operations, and all related local
data remain untouched.
