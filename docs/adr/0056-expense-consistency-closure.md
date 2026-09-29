# ADR 0056 — Expense consistency closure

Date: 2026-09-28. Status: accepted by Owner through the implementation checkpoint.

Contract: `docs/ledger/EXPENSE_CONSISTENCY_IMPLEMENTATION_CHECKPOINT.md`.

Extend the existing repository, SQLite queue, worker and Backend. Commands carry
versioned typed intent, account/Expense intent sequence, causal predecessor and
observed canonical base. UPDATE contains only user-owned patches; valuation and
DELETE/RESTORE remain independent intents. Missing patch fields mean unchanged;
explicit null means clear. No-op and attachment-only Save create no Expense UPDATE.
UTC instants compare independently of economicDate. User split input excludes
derived settlementMinor and rounding adjustment.

Only a matching server receipt committed atomically with local reconciliation
confirms an operation. Queue completion alone cannot prove APPLIED. Receipts expose
APPLIED, KEPT_SERVER or SUPERSEDED. Pull and mutation reconciliation monotonically
advance canonical baselines and replay newer unresolved intent, including tombstones.
Attempted historical payloads and keys remain immutable.

Three-way merge requires verifiable server history and unchanged financial input.
Compatible automatic valuation may survive a descriptive patch. Financial divergence,
explicit valuation choice and lifecycle require guarded typed commands/resolution.
Server transactions alone close covered conflicts after chain digest, revision,
permission and frozen-input checks, returning immutable per-conflict outcomes.
DELETE resolution never becomes UPDATE; only RESTORE can restore a tombstone.

This tightens ADR 0040: deterministic local evidence is a candidate for the same
server-backed closure path, never permission to locally close server OPEN conflicts.
ADR 0033 queue dependencies must use receipt disposition; ADR 0054 batch rate
acceptance must report each operation rather than sync-cycle success.

Delivery follows six checkpoint gates. Phase 1 introduces contracts/helpers and
no-op suppression; persistence/reconciliation is Phase 2, Backend/SQL Phase 3,
normal product resolution UI Phase 4, latest-state rates Phase 5, recovery Phase 6.
No incident recovery or Hosted Dev deployment occurs before its gate. Production
is outside scope. No second sync framework or dependency is introduced.

## Phase 3 transaction implementation

Existing Expense endpoints accept an additive v2 typed intent envelope branch. Historical bases
come only from immutable, successful SQL receipts, never the client `observedBase`.
SQL stores normalized base/result evidence and SHA-256 digests. Missing historical
evidence prevents automatic rebase. Backend computes three-way eligibility from these
server records; SQL revalidates the evidence and prepared canonical revision under an
Expense lock before committing. Financial patch invalidates derived valuation unless
recomputed by existing valuation logic. Descriptive patch preserves existing valuation
identity and evidence.

One SQL RPC owns permission/frozen checks, complete chain digest, covered ownership,
typed mutation, immutable per-conflict outcomes, audit, and the resolution receipt.
Uncovered conflicts stay OPEN. Resolution replay returns the stored response before
checking the newer head and cannot repeat effects. Legacy DELETE/valuation conflicts
require the v2 resolver; legacy full aggregate updates remain strict CAS.

The conflict read includes tombstones and legacy rows. A legacy row whose original
typed intent cannot be verified exposes `submittedIntent: null` and an action-required
reason; the server does not infer a patch. No incident business data is repaired here.

Covered outcomes include immutable receipts correlated to original command IDs/keys;
the resolution receipt uses its own request key. SQL can verify either normal v2
APPLIED receipts, resolved original-command receipts, or actual successful legacy
CRUD/valuation receipts to establish a causal execution base. It never promotes
legacy KEEP_JOURNEY, KEPT_SERVER or SUPERSEDED to APPLIED. Existing resolution rows
are compatibility projections so approved rates/reporting/Settlement guards continue
to see closure. Backend rollback retains the additive evidence/outcome schema.

## Phase 4 client integration

Hosted Dev acceptance passed on 2026-09-29. Formal resolution reuses the existing
Expense sync worker and durable operation queue. SQLite v41 adds account-scoped
authoritative chain cache and immutable resolution responses; v40 clients remain
compatible with the additive Hosted contract. Bootstrap/pull persist chain metadata
without guessing closure. Full chain reads use the repository/transport layer.
Resolution completion atomically stores original-command server receipts, covered
outcomes, canonical projection and queue completion. Uncovered and later commands
remain protected. An independent resolution operation retains its original key/body
for response-loss replay. UI tracks that operation, not global sync success.
Expense Detail, Needs Attention/Sync Issues and Settlement blockers share one normal
resolution route, including local tombstones. Drift requires refreshed evidence and
a new explicit choice; no generic retry or force sync is offered for 409s.

Owner clarified that resolution is a safety net. Routine reconciliation, reference
FX refresh, compatible merge, retries and normal server confirmation stay silent.
Only a business result requiring human choice gets attention. User copy uses
“Review changes”, “Continue deletion” and “Use latest value”; technical identifiers
and proof remain in the contract/audit. Explicit decisions show their own actual
pending, confirmed or rejected result. Rate provenance stays under Rate details.

## Phase 5 latest-state rate acceptance

The approved slice binds the displayed local/server Expense revisions, original
Money, economic date, Journey Money and exact displayed rate/reference date. Online
acceptance reuses Journey reconciliation and authenticated FX snapshot refresh; it
compares business inputs before creating a command, never blindly replacing CAS.
Compatible automatic REFERENCE_RATE may be replaced by the explicitly accepted
MANUAL_AGREED intent without a conflict. Offline choices persist the same typed
intent; server history and locked current inputs must independently prove compatibility.
A narrow forward migration adds guarded valuation rebase to the existing RPC.
Already valid MANUAL_AGREED is never eligible for automatic replacement. Batch
results and feedback come from each durable operation/receipt; routine updates
stay silent. Changes requiring another choice use business reconfirmation copy.
Hosted rollout retains the existing separate migration/deployment authorization gate.

### Phase 6 historical equivalent admission gap (2026-09-29)

Read-only real recovery found server-owned successful revision evidence and immutable
legacy 409 submissions, but the formal chain exposed legacy UPDATE only as unverified.
Add a narrow, generic equivalent candidate only when the historical RATE_REQUIRED /
null-valuation aggregate matches the stored submitted business fields (UTC timestamps
normalized). SQL must verify that original stored submission again under the existing
chain transaction before ACCEPT_EQUIVALENT. Full-aggregate writes remain strict CAS;
missing evidence and real changes continue to require a business decision. No incident
ID/name special case or data backfill. New Dev deployment remains a separate gate.

### Phase 6 same-revision closure evidence (2026-09-29)

An equivalent closure adds audit evidence without incrementing Expense revision.
The shared local canonical boundary must accumulate immutable audit IDs at the same
revision and keep later server aggregate/audit times, retaining the existing business fields.
Older equal-revision feed snapshots cannot remove that evidence. Lower revisions
remain rejected. This is metadata convergence within the approved reconciliation
boundary, not a new mutation or a local conflict repair.
