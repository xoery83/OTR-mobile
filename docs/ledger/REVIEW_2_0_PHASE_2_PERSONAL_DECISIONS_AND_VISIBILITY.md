# Review 2.0 Phase 2 — Personal decisions and precise visibility

Status: local foundation implemented and validated; Hosted Dev rollout and real multi-user device smoke remain gated. Phase 1 (`9233c89`) is the baseline. This document was created before Phase 2 runtime changes.

## Invariants and schema

- `ledger_review_findings` is shared, immutable observation plus shared `ACTIVE | RESOLVED_BY_EXPENSE_UPDATE | SUPERSEDED` lifecycle. Its legacy `status` is only compatibility: active v2 is `OPEN`, non-active v2 is `STALE`; it never records a person's ACK/DISMISS.
- Existing `ledger_review_finding_actions` remains append-only, keyed idempotently by `(actor_user_id, operation_id)`. Its `reason` becomes nullable for v2; non-null text is trimmed and limited to 2,000 characters. Historical actions are never rewritten.
- New `ledger_review_decisions` has `(finding_id,user_id)` primary key, `decision` (`ACKNOWLEDGED | DISMISSED`), monotonic personal `revision`, `last_action_id`, `acted_at`, `updated_at`. Row absence deterministically means `NEEDS_REVIEW`. New generations have new Finding IDs and therefore no inherited decision.
- New `ledger_review_finding_eligible_users` stores `(finding_id,user_id)` at observation time for historical access. Snapshot entries are derived only from linked members; current Journey linkage remains mandatory. Owner is authorized independently, including for history.
- All new tables use forced RLS and service-role-only access. Mobile never accesses business tables directly.

## Eligibility and history

For an **active v2** expense Finding, use the current canonical expense and linked `journey_members.user_id`: owner (`role='owner'`) OR `expenses.creator_member_id` OR `expenses.payer_member_id` OR an `expense_splits` row where `original_amount_minor <> 0 OR coalesce(settlement_amount_minor,0) <> 0`. Participant presence alone and an unlinked member do not qualify. The same current-membership rule applies to actions. The backend derives identity from the authenticated session, not request parameters. A removed member has no access.

On observation creation, freeze eligible linked user IDs. For resolved/superseded v2 Findings, permit current linked owner or a current linked user in that snapshot. Do not use current splits to broaden historical access. Pre-Phase-2 Findings without a reliable snapshot receive a conservative historical backfill from their actor IDs and owner; do not infer everybody's eligibility from shared status. Legacy v1 is history/compatibility only and excluded from v2 active counts. Normal Review APIs expose only the caller's actions and reasons, including to an owner; a cross-user audit endpoint is outside Phase 2.

## Migration and compatibility

Backfill personal decisions from append-only actions, partitioned by `(finding_id,actor_user_id)`, ordered by `created_at`, then `id` as a stable tie-breaker; each user's last action determines their decision and personal revision. This applies to v1 history and Phase-1 v2 actions. Do not broadcast a shared `ACKNOWLEDGED`/`DISMISSED` status. Normalize v2 shared status from lifecycle after backfill. Retain the v1 action RPC only for historical compatibility and gate old Review clients before precise visibility is rolled out.

Require explicit `X-Review-Protocol: 2` on Review list/detail/refresh/action. Missing or older protocol receives `426 REVIEW_PROTOCOL_UPGRADE_REQUIRED`, without Review payload. General Ledger bootstrap/pull remain available to old clients but omit _all_ Review findings/actions/change payloads. Never rely on User-Agent. Mobile v2 sends the header. Deploy schema and backend gate before new Mobile adoption; do not deploy Hosted Dev without approval.

## API, sync, and local model

The normal Review projection is user-scoped: visible Finding plus caller's decision (`NEEDS_REVIEW` for absence) and caller's own action history. Explicit refresh returns that same projection. Action requires authenticated current eligibility, v2 heuristic, active lifecycle, valid action, matching Finding generation/revision and personal decision revision; duplicate operation ID returns the original logical result. Personal action leaves shared Finding lifecycle/status untouched.

Bootstrap and each incremental pull include a complete **caller-scoped Review snapshot**; Journey-scoped `REVIEW_FINDING` change records are never forwarded. The client atomically replaces that user's visibility set from the snapshot, including removals after split or membership changes; lifecycle closure keeps eligible history but removes it from active counts. A pull cursor still advances. This simple full-snapshot approach is a Phase-2 ceiling: move to a user-specific delta stream only when measured Review volume warrants it.

SQLite stores permitted Finding data, a `(user_id,finding_id)` visibility table, and `(user_id,finding_id)` personal decision rows. Every Review query joins current authenticated user scope. Local action is one transaction: check cached eligibility and active v2 Finding, append local action, update personal decision, enqueue durable operation; list/count updates immediately offline. Pending server work is retained per authenticated queue owner. Account switch changes query scope; no other user's projection or reason is displayed. A fresh bootstrap/pull replaces the returning user's permitted snapshot. Logout/removal clears or invalidates that user's Review visibility and private data.

For terminal action rejection (revoked auth, lost eligibility, resolved Finding, stale revision/generation), the queue stops retrying that operation. The next successful explicit refresh or incremental pull replaces the optimistic state with the authoritative caller projection. A 403 during Review refresh immediately invalidates the current user's local Review visibility. Failed local intent remains in the durable queue for diagnostics; duplicate replay is idempotent. Transient network failures keep the optimistic decision and durable retry.

Canonical counts: pending = visible + v2 `ACTIVE` + `HEURISTIC` + personal `NEEDS_REVIEW`; reviewed = same but personal `ACKNOWLEDGED | DISMISSED`. Resolved/superseded and v1 never count. Existing list/detail UI remains functionally usable; final chips/accordion/UI redesign belong to Phase 3.

## Test matrix

Automated coverage: personal ACK/DISMISS isolation; owner, creator, payer and nonzero original/settlement split; zero allocation, unrelated and unlinked exclusions; removed member; private action reason; correction and new generation; offline optimistic count, retry and duplicate operation; account switch; eligibility loss projection removal; history and deterministic actor-only backfill; shared lifecycle independence; pending/reviewed counts; old-client gate; concurrent users and same-user revisions where practical; local migration, API, sync, auth and pgTAP/RLS regression.

Hosted Dev migration and real-device multi-user validation are a separate approval checkpoint. Production is out of scope.

## Implemented local validation and rollout note

- One additive server migration (`20260917000100`) and SQLite v21 were applied/tested locally. The server backfill orders actions by `(created_at,id)` per actor; no legacy shared status is broadcast. V2 global status is normalized to lifecycle and protected from legacy action RPC writes.
- Backend validates linked-user eligibility on read and action. Normal Review responses contain only the caller's actions, and Mobile requires the explicit `reviewProtocol: 2` response marker before accepting Review snapshots. Old clients receive 426 on Review endpoints and Review-free Ledger bootstrap/pull. Server migration + gate must precede Mobile rollout.
- Local test evidence: complete migration rebuild, 12 pgTAP files / 245 checks, SQLite migration execution in an in-memory SQLite database, 73 Vitest files / 267 tests, TypeScript, ESLint and Backend build. Repository-wide formatting still reports two pre-existing unrelated files (`AGENTS.md`, `src/hooks/useStage4BPhysicalSmoke.ts`).
- No Hosted Dev or Production migration was applied. Final real two-account Auth → Backend → Hosted Dev/device acceptance and release order require explicit approval. Phase 3 UI layout, chips, accordion and reactive polish remain separate.
