# Settlement 2.0 implementation plan

Date: 2026-09-18. Status: planning only; implementation requires a separate approved slice. Sources of truth: `SETTLEMENT_2_0_PRODUCT_UX_SPEC_v0.3.md`, `SETTLEMENT_2_0_TECHNICAL_AUDIT.md`, `SETTLEMENT_2_0_PHASE_0_DECISIONS.md`, and `docs/CURRENT_IMPLEMENTATION_STATE.md`. Phase 0.5 finalized Expense protection is deployed and verified on Hosted Dev; this plan must preserve it. Proposed table and route names below are implementation targets, not an existing API contract. Confirm names against the then-current repository before each slice. No code, database, environment, or deployment change is part of this document.

## Fixed rules and dependency boundary

Canonical settlement derives only from included Expenses, payer amounts, member shares, accepted valuation, and `ledger-settlement-greedy-v1`. The new personal Payment records are optional assertions by their owners. They never change `paidMinor`, `owedMinor`, `netMinor`, recommended transfers, final input digest, or authoritative final balances. Convenience progress, if shown, uses **only the viewing owner's** comparable records and is labeled as such; no equivalent means no single-currency remaining number. Existing `settlement_payments`, `settlement_payment_discharges`, repayment valuation snapshots, and their confirmed/rejected/disputed history keep their original meanings.

Member review is optional and cannot gate final confirmation. `Looks good` is a personal checkpoint after intentionally opening the personal statement. `Something looks wrong` creates a human Finding in the **existing** Ledger Review system. A later material change asks only affected members to inspect a delta. Final input Expenses remain protected. Corrections require an organizer-authorized new lineage version; older final inputs, digest, balances, transfers, and payment history remain readable and immutable. Production is outside all development slices.

The existing implementation anchors are `src/domain/ledger/settlement.ts`, `src/data/repositories/ledgerSettlementRepository.ts`, `src/data/sync/ledgerSettlementCoordinator.ts`, `src/data/sync/ledgerSettlementPaymentSyncWorker.ts`, `src/data/repositories/ledgerReviewRepository.ts`, `src/data/sync/ledgerReviewCoordinator.ts`, `src/data/repositories/ledgerReceiptRepository.ts`, `src/data/sync/ledgerReceiptSyncWorker.ts`, `src/data/db/migrations.ts` (latest SQLite migration 24), `src/data/api/ledgerSettlementContracts.ts`, `backend/src/app.ts`, `backend/src/supabaseGateway.ts`, and the Stage 7/8 SQL migrations. Reuse their repository, queue, authorization, and test patterns. UI and feature modules do not access SQLite or Supabase directly.

## Phase 1 — Personal Payment foundation

**Goal.** Two members can independently save, edit, soft-delete, sync, and read authorized personal records, including before final settlement. A headless/repository test can prove a receiver's record never changes the payer's record or canonical balance.

**Preconditions.** Phase 0.5 protection remains active; current Journey/member authorization, sync cursor, idempotency, and legacy Stage 7 reads work. Before migration, freeze the v1 historical-member read policy below and verify the existing private receipt asset lifecycle can securely serve this use.

**Files/modules.** New focused domain/contracts/repository/worker modules beside `ledgerSettlementContracts.ts`, `ledgerSettlementRepository.ts`, `ledgerSettlementPaymentSyncWorker.ts`, and `ledgerReceiptRepository.ts`; extend `src/data/db/migrations.ts`, `backend/src/app.ts`, `backend/src/supabaseGateway.ts`, scoped Supabase migrations/pgTAP, and existing bootstrap/pull change projection. Keep old Payment modules for legacy history.

**Supabase.** Forward-only `personal_settlement_payment_records` and `personal_settlement_payment_attachments` (detailed schema below), plus append-only edit/audit entries or revision snapshots. RLS enabled and forced, no `anon`/`authenticated` business-table writes, service-role RPC only; indexes for Journey/owner, Journey/counterparty, updated cursor and attachment parent. RPC transaction validates authenticated actor, linked owner member, Journey/counterparty, base revision, payload hash/idempotency, then writes row, audit, and change feed. Soft-deleted rows emit tombstones. No trigger or RPC touches legacy discharge/transfer refresh.

**SQLite.** Migration 25 (or next free version at implementation) adds `ledger_personal_payment_records`, attachment-link metadata, owner/scope and revision/sync columns, indexes for Journey+owner/counterparty and cursor. Never rewrite existing `ledger_settlement_*` rows. Repository writes record plus an owner-bound durable operation atomically; server pull reconciles the same stable UUID and remote revision.

**API.** Proposed Journey-scoped create/update/delete/list categories under `/v2/trips/:tripId/ledger/personal-payments`; exact paths to be frozen in `src/data/api` before coding. Create carries client UUID, counterparty, direction, user-entered money/time/note, operation/idempotency key. Update/delete carry base revision; response returns canonical row/revision and replay flag. Owner identity is taken from auth and linked member resolution, never trusted from the body. Authorized list/bootstrap/pull include counterparty and organizer views with origin/owner labels and tombstones; pagination/cursor follow current Ledger patterns.

**Sync.** New `CREATE/UPDATE/DELETE_PERSONAL_PAYMENT` operation types, stable operation ID, per-record ordering, existing retry/auth-pause/conflict classes. Two owners have independent revision streams. Permission loss is a terminal sync failure for new writes; queued data remains locally visible to its originating account for repair/export, never sent under another token. Reads and pull apply authorized projections to the correct account+Journey; revoke projections when access is lost. Legacy workers do not consume new operations.

**UI.** No polished flow. A minimal development harness or repository-level acceptance surface is sufficient; defer Payment page and attachment picking.

**Tests / PASS gate.** Domain validation and SQLite atomic write/restart, worker retry/replay/conflict, Backend auth/status tests and pgTAP for RLS, IDOR, revision, tombstones, idempotency, counterparty read, organizer read, and legacy separation. PASS when owner A and B can record different values, owner B cannot alter A's row, removed member cannot write, non-final/current and finalized canonical preview hashes/balances are identical before and after all personal record mutations, and old confirmed history is unchanged. FAIL on any unauthorized read, duplicate replay, or changed canonical output.

**Risk / non-goals.** Historical authorization and cursor projection are the highest risk. No Payment UI polish, FX suggestion, upload flow, review, or correction workflow in Phase 1.

## Proposed personal Payment schema and authorization contract

`personal_settlement_payment_records` is a **new** table, never an alias for `ledger_payment_records` (Expense payer-cost evidence) or `settlement_payments` (legacy confirmed transfer). Proposed fields:

| Group                | Fields and rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity             | `id uuid` client-generated stable primary key; `journey_id uuid`; `owner_user_id uuid`; `owner_member_id uuid`; `counterparty_member_id uuid`; optional non-authoritative `related_transfer_id uuid` only for navigation, never required for an advance or used for authorization. Unique/check constraints bind members to the same Journey and disallow self-counterparty.                                                                                                   |
| User facts           | `direction text CHECK (PAID, RECEIVED)`; `amount_minor bigint > 0`; ISO `currency` and `scale` validated together; `occurred_at timestamptz`; optional bounded `note`. `PAID` means owner→counterparty; `RECEIVED` means counterparty→owner. These are the owner's assertions, not bank-verified facts.                                                                                                                                                                        |
| Optional information | Nullable `recorded_equivalent_minor/currency/scale` (the owner's chosen settlement equivalent); nullable `reference_rate_decimal`, `reference_rate_date`, `reference_source`, and quote/provenance ID. Exact decimal text and actual reference date are captured only when shown/used. These do not establish authoritative Expense FX and must not be silently recalculated later. Equivalent currency need not equal a future Journey currency; never sum unlike currencies. |
| Lifecycle            | `revision bigint > 0`, `deleted_at`, `created_at`, `updated_at`, `created_by_user_id`, `updated_by_user_id`, `last_operation_id`; append-only revision/audit record with actor, changed fields, prior/new revision, reason when supplied, and server time. Soft delete preserves history and emits a tombstone. Client SQLite also stores `sync_status`, local times, last server revision and operation ownership.                                                            |
| Attachments          | `personal_settlement_payment_attachments`: `id`, `journey_id`, `record_id`, `asset_id`, `created_by_user_id`, `created_at`, `deleted_at`, revision/operation metadata; unique active `(record_id,asset_id)` and indexed parent order. Many attachments are supported in data/API; UI may show one simple `Add attachment` action initially. Binary and signed URLs stay in existing private asset infrastructure.                                                              |

Write authorization: only current linked `owner_user_id`/`owner_member_id` may create, edit, soft-delete, or attach to their record. The organizer can read but cannot impersonate either side. Read authorization: owner, named counterparty, and organizer may read relevant rows and permitted attachments, including ownership and direction; other members get no projection. **V1 historical-participant policy:** a member who later leaves the Journey may still read financial history created while they were an authorized owner/counterparty, including its historical attachments and tombstones, through a server-checked immutable relationship/grant snapshot; removal revokes create/edit/delete/upload and access to later unrelated records. The organizer retains Journey audit access. Capture the grant at record creation and revoke only for a genuine security/account event, not ordinary membership removal. Test that historical read does not accidentally grant current Journey-wide access. This is an explicit first-version policy decision; any retention/deletion-law exception requires separate approval.

## Phase 2 — Personal Payment UX, FX reference, and evidence

**Goal.** A member can record `I paid` or `I received` immediately, in any supported currency, with optional note/equivalent/evidence, including offline; the other side sees the authorized record after sync.

**Preconditions.** Phase 1 schema, transport, and authorized pull pass. Existing receipt file store/private bucket route must be assessed for reusable authorization and object metadata; extend it rather than invent a second upload stack.

**Files/modules.** Payment sheet and transfer-detail components under `src/features/ledger/`; `TransferDetailScreen.tsx`, existing `ledgerRateQuoteCache`/`ledgerExpenseRepository.listRateQuotes`, `src/data/files/receiptFileStore.ts`, `ledgerReceiptCoordinator.ts`, asset queue/transport, Payment repository and contracts. Exact component names can vary.

**Supabase.** Implement attachment link validation, object owner/Journey checks, private signed access and audit. Reuse `receipt_assets` storage workflow where it can safely represent a Payment attachment; if its `expense_id`-specific constraints/routes prevent that, add a narrow generalized asset-link metadata extension using the same private `ledger-receipts` storage path and existing upload worker. Do not duplicate buckets or upload lifecycle. Attachment link/unlink writes produce authorized change-feed events.

**SQLite.** Phase 1 link table stores pending local file/asset IDs and durable upload state through established asset-operation storage. Any new columns use the next forward migration, preserving records saved without evidence. Reference quote cache remains separate; record retains its captured informational FX metadata.

**API.** Proposed attachment create/link/unlink/content authorization categories under personal-payment record routes; data mutation and binary upload are separately retryable. Existing private upload contract should be reused when possible. No FX quote required to save; a payment in another currency with no quote is valid. If a suggested quote arrives, it never overwrites typed money or an accepted equivalent.

**Sync.** Record create may finish before attachment upload; stable record UUID lets the asset queue link later. Retry/upload failure keeps the amount and note. Reconnect updates counterparty projection; actor switch cannot leak file paths or upload under another account.

**UI.** `Record payment` / `Record amount received`, owner and other-side sections, optional `Add attachment`. Show cached requested date/pair first, then latest usable local reference with its actual date, then older available reference clearly dated, then no reference; manual entry always works. Render immediately from SQLite and refresh asynchronously without 30-second worker wait. Show approximate/reference labels and never imply a bank-verified rate. Progress uses own comparable records only and is secondary.

**Tests / PASS gate.** Unit tests for quote priority, stale/no quote and no input reset; repository/upload retry and restart; Backend attachment IDOR, owner/other-side read, no unauthorized raw URL; UI offline save and reconnect. PASS for partial, multiple, advance, overpayment, different-currency, no-FX, and multi-attachment records, with unchanged canonical preview/digest. FAIL if upload blocks record persistence or FX delays Save.

**Risk / non-goals.** Receipt assets are Expense-scoped today; secure generic linking is the main technical risk. No bilateral confirmation, matching, auto-dispute, final UI polish, or old-Payment rewrite.

## Phase 3 — Human Review and personal review checkpoint

**Goal.** A member raises an actionable concern in existing Ledger Review; an intentionally opened personal statement can be marked `Looks good`; later material changes produce an auditable member-specific delta.

**Preconditions.** Phase 1 record IDs and authorized projections exist; existing Review v2 read/action, visibility, and Expense revision tests pass.

**Files/modules.** `src/domain/ledger/reviewV2.ts`, `src/data/repositories/ledgerReviewRepository.ts`, `src/data/sync/ledgerReviewCoordinator.ts`/transport, `LedgerReviewScreen.tsx`, `LedgerReviewFindingScreen.tsx`, `SettlementStatementScreen.tsx`, `backend/src/app.ts`/gateway, Review v2 SQL and SQLite migration family.

**Supabase.** Extend `ledger_review_findings` with a human origin/type and typed target linkage: Expense, exact share (`expense_id` plus member ID and source revision), personal Payment record ID, or settlement/version. Use foreign keys/shape checks; no second Finding table. Human Findings have immutable author/evidence context and lifecycle compatible with Review v2; system rule reconciliation must skip human-origin rows. Extend eligibility/visibility snapshots so reporter, Expense creator, organizer, and materially affected participant/counterparty see only what they may act on; creator/organizer are actionable for source correction, reporter can view/close their concern, counterparties see only relevant Payment concerns. Source correction resolves or supersedes the Finding via explicit server comparison; an ACK/DISMISS personal decision is not source resolution. Add personal settlement checkpoint table keyed by Journey+member/user: reviewed statement version/fingerprint, canonical contribution snapshot, optional own Payment overlay fingerprint, server time/revision/operation ID. Add append-only checkpoint history or audit and a server-generated delta projection from checkpoint to current authorized state.

**SQLite.** Next forward migration extends local Finding target/origin/visibility projections and adds member checkpoint/delta cache. Repository writes human Finding plus durable `RAISE_LEDGER_REVIEW_FINDING` operation locally; checkpoint is queued with its exact reviewed digest. Pull includes authorized Findings, decisions, checkpoints/deltas, and tombstones with account/Journey isolation.

**API.** Proposed human-Finding create, list/filter/detail and checkpoint read/write categories within current Ledger Review/Settlement routes. Server verifies target Journey/revision, actor involvement, reason bounds, and operation replay. `Looks good` request carries the exact statement snapshot/fingerprint shown; stale fingerprint returns a refresh-required conflict rather than claiming unseen changes were reviewed. Existing final endpoint gains no member-review prerequisite.

**Sync.** Offline Finding and `Looks good` are locally pending; reconnect server validates current authorization and checkpoint digest. Display pending state honestly. Never use a locally computed delta as a server-final claim. Retried operation ID creates one Finding/checkpoint, while another account's token cannot submit it.

**UI.** `Something looks wrong` from Expense/Payment context opens the existing Review path; Expense detail has one bottom action, accepts an optional note as the Review title, and shows a compact active-flag status near the heading. Review provides a human-raised filter and identifies the raising member on each row. Spending reuses the yellow Needs attention block directly below its Settlement snapshot. Summary deep-link applies Journey and settlement-impact filter. Personal statement is opened intentionally, with `Looks good` at its end. Summary shows material change immediately on entry; affected users open a concise change list, then can checkpoint again. No dashboard one-tap review.

**Tests / PASS gate.** pgTAP/Backend: target validation, author/actionable visibility, system reconciler ignores human rows, creator vs organizer correction, replay, stale checkpoint, optional review and final without reviews. Domain/repository: deterministic delta and offline queue. UI: context deep link, affected-only banner, description-only edit does not show it. PASS when source amount/payer/split/valuation changes list exact affected members/Expenses and balance delta, and a mere note/category edit does not invalidate canonical review. FAIL if another Journey/member sees a Finding or if any review state changes settlement math.

**Risk / non-goals.** Current Review v2 eligibility is rule-oriented; human Findings need independent lifecycle/eligibility without breaking system observations. No Settlement-specific dispute state machine or mandatory approvals.

### Deterministic change-impact rule

At checkpoint, server stores the exact **personal canonical contribution vector** shown: for each included Expense, immutable Expense/revision/valuation ID, payer member, per-member owed minor, payer credit minor, and resulting `paid/owed/net` in Journey minor units, plus statement digest/settlement lineage ID and algorithm/settings versions. Compare with current server projection by stable Expense identity (and correction successor mapping), using integer minor units. Union old/new payer and share members; mark only members whose own payer credit, own share, transfer involvement, or inclusion changed. A member's amount delta is new net minus checkpoint net; the changed-Expense list records old/new contribution and reason groups. An equal and opposite replacement or amount change that nets to zero may still be material for an involved member; compare contribution facts, not only final net. Description, note, receipt metadata, or category-only changes do not change the canonical fingerprint. Own Payment amount/recorded equivalent changes are a **separate optional overlay delta** for the owner; they never appear as canonical balance delta, and another side's differing claim does not auto-trigger a Finding. Freeze the comparison snapshot and algorithm version for audit; recompute from authorized server facts, not UI scroll state. Offline display may compare cached snapshots as provisional, but checkpoint acceptance and affected-member feed are server-authoritative. If old snapshot lacks enough detail, require a fresh baseline review instead of inventing a numerical delta.

## Phase 4 — Make corrections and settlement version workflow

**Goal.** Organizer can open a controlled correction session, correct source economics, and confirm an updated immutable settlement version while the previous final remains intact.

**Preconditions.** Phase 0.5 trigger, root/adjustment lineage, immutable input tests, Review source-correction linkage and Phase 1 Payment coexistence pass. Before implementation, exercise root versus adjustment totals and digest semantics in a rollback-safe fixture; never relax the finalized-input trigger globally.

**Files/modules.** `SettlementAdjustmentScreen.tsx`, `ledgerSettlementCoordinator.ts`, `ledgerSettlementContracts.ts`, `src/domain/ledger/settlement.ts`, `backend/src/app.ts`/gateway, Stage 7.1/7.2B successor migration and tests, `docs/adr/` for the versioning decision.

**Supabase.** Reuse `settlements` root/adjustment lineage and immutable `settlement_inputs`, balances, transfers, digest, audit and `settlement_adjustment_deltas`; add narrow metadata for correction session/parent version and old→successor Expense source lineage if current adjustment primitives cannot identify replacements. **Do not update the protected root Expense row.** Organizer-authorized correction creates a successor Expense revision/record linked to the frozen source, with old/new lineage and reason; canonical current-source projection includes only the latest successor for that economic item. Extend the adjustment eligibility/source RPC to compute the replacement's signed delta against prior finalized contributions, including removal/reversal, without double counting. The old root and each confirmed adjustment retain their original input snapshot/digest/transfer list. A preview returns old/new totals, affected members and stale digest; confirm is one idempotent, owner-authorized transaction with lineage lock, current settings and source checks. Keep correction sessions draft until confirmed; partial failure cannot expose a new final. The Phase 0.5 trigger remains effective for every previously finalized input and blocks ordinary update/delete/restore.

**SQLite.** Next forward migration stores correction session/successor mapping and version display metadata, retaining existing `ledger_settlements`, inputs, old transfers and Payments. Repository exposes latest authoritative version plus explicitly selectable history; local draft is clearly unconfirmed. Never rewrite old local final rows during pull.

**API.** Proposed owner-only correction open/preview/confirm categories adjacent to `/v2/trips/:id/settlements/:rootId/adjustments`; preserve existing `/reopen` rejection for old clients unless a new explicit contract replaces it. Commands carry base lineage sequence, source IDs/revisions, reason, operation ID and preview digest. Correction writes go through dedicated server authority, not ordinary Expense mutation or a UI bypass.

**Sync.** Ordinary offline Expense edits to finalized inputs remain rejected. Correction draft may be locally prepared, but authoritative create/preview/confirm requires online owner validation and server digest. Pull versions, successor links, and change feed in order; old installed clients keep old final history and cannot silently edit locked rows. Personal records/attachments keep their IDs and owner claims; they may be displayed against current relationships without migrating or deleting their original history.

**UI.** `Make corrections` entry for organizer only, warning that previous final remains, preview of old→new impact, confirmation and version history. A regular member sees current updated result and prior confirmed history. Do not expose “unlock expense” or individual finalize.

**Tests / PASS gate.** pgTAP for trigger continuity, owner-only/session concurrency, replacement/no double count, immutable old inputs/digest/transfers, exact delta/zero-sum, replay and stale digest; Backend/repository tests for old/new version retrieval; two-account UI history. PASS when a corrected final amount creates one new version, old root bytes/digest and old Payment/evidence links remain unchanged, and ordinary finalized Expense update still returns `FINALIZED_SETTLEMENT_PROTECTED`. FAIL on any silent historical rewrite or personal Payment contribution to authoritative result.

**Risk / non-goals.** The current adjustment path uses legacy confirmed discharges for outstanding vectors; correction must keep that legacy historical presentation separate from new canonical transfer suggestions and personal progress. No general release/unlock of frozen Expense rows, automatic Payment reconciliation or redesigned settlement algorithm.

## Phase 5 — Settlement 2.0 screen assembly

**Goal.** One production Settlement entry explains current/final position and why, while exposing optional records, Review, and version history.

**Preconditions.** Phases 1–4 contracts and projection tests pass; existing final/FX preflight behavior stays stable.

**Files/modules.** `app/(tabs)/expenses/settlement.tsx`, `SettlementReadinessScreen.tsx`, `SettlementStatementScreen.tsx`, `TransferDetailScreen.tsx`, `SettlementAdjustmentScreen.tsx`, `LedgerReviewScreen.tsx`, shared Ledger row/category components and repository selectors. The prototype can inform interaction only; its fixture math is not authority.

**Supabase / SQLite / API / sync.** No new financial schema or algorithm expected. Add only missing read projection/index/migration justified by profiling. Assemble existing authorized repository views and proposed Phase 1–4 contracts; keep local cached state during network loss. Confirmed final, pending drafts, approximate preview and personal progress have distinct labels.

**UI.** Summary | Paid | Shares | Payments are independent equal-width icon tabs; only the selected module is rendered. `Paid` is the existing member-as-payer Spending view. The secondary navigation becomes sticky below the Trip title after the primary Spending | Settlement selector leaves the viewport, and selecting a tab preserves the current vertical scroll position. The Ledger header shows the active primary view while that selector is off-screen. Do not add full-page horizontal swipe. Each page starts directly with one consistent pale-green lead card instead of repeating the tab label: Final/Current Balance, Paid by member, member's Share, or Recommended transfers. The shared card uses the same rounded container, inset, green heading and right-side selector treatment. When Final exists, Summary, Paid and Shares derive totals, counts, categories and rows from the same current Final-version inputs; otherwise they use the Current projection. Spending and Shares default to Me; an organizer may choose a member from the lead row dropdown with Me first. Expandable categories show payer, original/shared amounts and Expense detail link. Payments defaults Mine; organizer may view Everyone, with canonical recommended transfers separate from owner and counterparty records. Reuse Review deep links and intentionally opened personal statement. First pass prioritizes correct hierarchy, permissions and tap paths; visual polish follows device feedback.

**Tests / PASS gate.** Selector tests for Mine/Everyone, organizer/member scope, inline expansion, deep links, no-record empty state, approximate/current/final labels, old/new payment separation and accessibility basics; Simulator scroll/sticky behavior. PASS when a member can answer balance, explanation, transfer, changes and final readiness without understanding database states; no personal record changes the hero canonical amount. FAIL if unauthorized Everyone/member data appears or legacy confirmation is presented as a new personal claim.

**Risk / non-goals.** Large list performance and sticky scroll behavior; no pixel-level freeze, new navigation system or prototype data reuse.

## Phase 6 — End-to-end validation and release gate

**Goal.** Confirm the complete behavior with two real Dev accounts, installed builds, offline/reconnect and Hosted Dev; produce a release decision rather than adding features.

**Preconditions.** Phase 5 passes source tests; migration/API compatibility checks complete; isolated Dev fixtures and rollback-safe SQL probes available.

**Files/modules.** Acceptance scripts/tests in existing Ledger test areas, `docs/CURRENT_IMPLEMENTATION_STATE.md`, Dev runbook and release evidence. No planned schema/API/UI feature work; defects go back to the owning slice.

**Supabase / SQLite / API / sync.** Verify Hosted Dev migration list/RLS/functions and Dev Backend deployed contract only. Validate upgrade from SQLite 24 and an older installed build with existing Expenses, final/history and queued operations. Test bootstrap then incremental pull, tombstones, replay after reconnect, actor switch and Journey A/B isolation. Production remains untouched.

**UI.** Signed Release on Simulator and physical iPhone: two-account organizer/member paths, current and final, personal records, Review, correction history, legacy Transfer Detail. If device interaction is unavailable, report it as an explicit release blocker rather than claiming acceptance.

**Tests / PASS gate.** Run targeted unit/repository/worker/Backend/pgTAP, then full typecheck/lint/test/build and the dedicated matrix below. PASS only with isolated Hosted Dev behavioral evidence, final confirmation despite unreviewed members, corrected version preserving old history, cross-currency/no-FX and legacy coexistence, offline create/edit/reconnect, account and Journey isolation, and physical interaction. FAIL on unauthorized projection, duplicate upload/mutation, canonical drift from personal records, or lost history.

**Risk / non-goals.** Real device/offline controls and existing Dev data diversity may limit acceptance; record evidence gaps. No Production migration or rollout in this phase.

## Legacy Payment coexistence and display

Keep `settlement_payments`, `settlement_payment_discharges`, `repayment_valuation_snapshots`, their old confirmed/rejected/disputed/awaiting statuses and `settlement_audit_events` readable with original semantics. Freeze writes through old routes for new Settlement 2.0 UI; old installed Dev clients need a compatibility window or explicit minimum-version rejection before any endpoint retirement. Do not rewrite or auto-convert a legacy shared event into two owner records. Historical Transfer Detail and export show the old obligation, payment, valuation/discharge, actor and state as **legacy confirmed-transfer history** with traceable IDs. The current recommendation and new personal records are separate sections. New convenience progress excludes all legacy rows by default, including confirmed discharge; if a later feature offers opt-in inclusion it must identify provenance and prevent double counting, and is outside this plan. An old Journey with only legacy payments shows its current/final canonical result plus legacy history and an empty personal-record state. A mixed Journey shows both histories with labels and separate totals. Correction versions preserve links to the old transfer/payment records even if current recommended transfers differ. Do not erase rejected/disputed rows or reinterpret them as personal disagreements.

## Rollout and compatibility order

1. Additive Supabase migration on local DB first, with scoped pgTAP and RLS review; Phase 0.5 final guard is a required regression gate. Hosted Dev only after each slice's local validation and migration dry-run shows exactly expected files. No Production access.
2. Deploy backward-compatible Backend reads/writes and change feed before enabling new Mobile operations; old routes and payloads keep their historical contract during the Dev compatibility window. New capability/version signal prevents an old client from accidentally invoking new semantics. Never point old Payment routes at personal records.
3. Add forward SQLite migration(s) after version 24, repository and worker; test migration of existing local data and owner-bound queued operations. Older cached data remains intact; bootstrap fills new tables. New record IDs are client-stable, so offline users reconnecting after the server update replay exactly once. On rejected authorization, retain their local pending record under the originating account for explicit repair.
4. Enable Phase 2–5 UI only after Backend capability and bootstrap/pull support are live. A narrow `settlement2` Dev capability/feature flag is recommended for mixed installed builds and incomplete slices; absent flag, keep existing Settlement views without writing new semantics. Retire the flag only after acceptance, not before compatibility tests.
5. Validate Hosted Dev, release build, Simulator and physical device against the matrix. Production rollout is a later, separately authorized plan with its own backup/rollback and data-retention review.

## Testing matrix

Each row is a required PASS/FAIL scenario; test at the lowest reliable layer plus an end-to-end sample in Phase 6. Across every row, assert canonical Expense-derived result stays unchanged by personal Payment mutations.

| Scenario                                    | Phase / required assertion                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| No Payment records                          | 1/5: balance and transfers render; no zero-progress pressure or missing-data error.               |
| Payer-only record                           | 1/2: owner and counterparty see labeled payer claim; receiver record absent.                      |
| Receiver-only record                        | 1/2: independent received claim visible to authorized side; payer claim absent.                   |
| Both sides same value                       | 1/2: two owner IDs/revisions persist; no merge/confirmation.                                      |
| Both sides different value                  | 1/2: both displayed without automatic dispute, match or canonical change.                         |
| Payment before final                        | 1/2: record saves without a final transfer ID and survives later final.                           |
| Payment after final                         | 1/2: record saves; immutable final digest/balance unchanged.                                      |
| Partial payment                             | 1/2: multiple smaller own records allowed; progress explicitly informational.                     |
| Multiple payments                           | 1/2: stable IDs, ordering, retries, no duplicate replay.                                          |
| Overpayment/advance                         | 1/2: no obligation cap or warning-driven dispute; no negative canonical transfer.                 |
| Different currency                          | 2: original amount/currency and optional equivalent preserved independently.                      |
| No FX available                             | 2: manual save succeeds with nullable reference/equivalent.                                       |
| Stale FX available                          | 2: actual reference date/source visible, never silently accepted as authoritative.                |
| Attachment offline then reconnect           | 2: amount persists first; upload/link retries and counterparty authorized read work.              |
| Member removed after historical Payment     | 1/6: historical participant reads old row/asset, cannot write or see later unrelated rows.        |
| User raises `Something looks wrong`         | 3: one human Finding in existing Review, linked to exact target, actor and recipients.            |
| Creator fixes Expense                       | 3: authorized pre-final correction updates source and resolves/supersedes Finding.                |
| Organizer fixes Expense                     | 3: reason/audit and affected-member routing; no bypass of final protection.                       |
| Reviewed then amount changes                | 3: only affected member sees exact Expense and amount delta; re-checkpoint works.                 |
| Reviewed then description changes           | 3: canonical checkpoint remains current; no false financial banner.                               |
| Final with users not reviewed               | 3/4: organizer confirms after informational count; no gate.                                       |
| Make corrections after final                | 4: new version/digest and old immutable input/transfer preserved.                                 |
| Legacy Payment Journey                      | 1/5: old statuses, discharge, valuation and Transfer Detail remain traceable, separately labeled. |
| Mixed legacy/new Journey                    | 1/5: histories separate; convenience progress excludes legacy by default.                         |
| Two users edit own separate records offline | 1/6: independent revisions converge, no cross-owner conflict.                                     |
| Account switch                              | 1/6: queued operation and private record/asset never cross account token or view.                 |
| Journey A/B isolation                       | 1/6: no cross-Journey row, Finding, attachment or checkpoint projection.                          |

## Guardrails and commit boundaries

Do not change canonical Settlement math unless a verified defect requires a separate decision. Do not reuse `ledger_payment_records`, repurpose legacy `settlement_payments`, make Payment mandatory, require bilateral confirmation, auto-create disputes from amount differences, let personal records change recommended transfers/final balances, create a second Review system, bypass finalized Expense protection, or touch Production during development.

Suggested small, independently testable commits: **1A** Supabase personal-record schema/RLS/RPC/pgTAP; **1B** contracts/Backend authorized read-write and change feed; **1C** SQLite/repository/worker/bootstrap-pull; **2A** personal entry and FX cache selector; **2B** asset link/upload and counterparty UI; **3A** human Finding target/authorization plus API/sync; **3B** personal checkpoint/delta server and local projections; **3C** statement/Review interactions; **4A** correction successor model and rollback-safe SQL tests; **4B** owner commands/Backend/local version sync; **4C** correction UI/history; **5A** four-section data selectors; **5B** first-pass screen/navigation; **6A** Hosted Dev and two-account acceptance; **6B** signed device/release evidence. Each commit must leave main buildable, run the tests for its touched boundary, and preserve old API/SQLite reads. Do not bundle a schema foundation and a large UI refactor into one commit. Update current-state handoff after each substantial phase and record real architecture decisions in `docs/adr/` before implementing them.

## Recommended execution order

1. Approve this plan's v1 historical-member read policy and the additive Option B schema/compatibility boundary; Phase 0.5 final guard remains fixed.
2. Phase 1A Supabase personal records, audit/RLS, idempotent RPC and pgTAP; then 1B Backend contracts/change feed; then 1C SQLite/repository/worker/bootstrap/pull. Verify two-account ownership and unchanged canonical math before UI.
3. Phase 2A personal entry plus immediate cached FX reference and no-FX manual path; then 2B existing asset pipeline extension, multi-attachment link and authorized counterparty view.
4. Phase 3A human Finding in Review v2; then 3B server checkpoint/affected-member delta; then 3C intentional statement, `Looks good`, Summary delta and Review links.
5. Phase 4A correction successor/version design and immutable SQL validation; then 4B owner commands and ordered version sync; then 4C `Make corrections` entry/history.
6. Phase 5A selector/read models; then 5B first-pass Summary | Spending | Shares | Payments screen and mobile interaction tests.
7. Phase 6A Hosted Dev two-account/offline/legacy acceptance; then 6B signed Simulator/physical iPhone release gate. Stop before Production; seek separate rollout authorization.

## First executable slice

After plan approval, implement **Phase 1A only**: one additive Hosted Dev-targeted Supabase migration for `personal_settlement_payment_records` with stable client UUID, Journey/owner/counterparty/direction, money, optional equivalent/reference metadata, revision, soft delete, audit/idempotency and authorized change-feed projection; add forced RLS/service-role-only RPC and focused pgTAP for owner writes, counterparty/organizer reads, historical-member rule, replay, tombstone and canonical/final immutability. Include the many-to-one attachment **link-table schema only**, without upload flow. First run local reset and relevant pgTAP; deploy only to Hosted Dev after migration dry-run and explicit slice authorization. Do not add Mobile UI, Backend route, correction workflow, legacy data rewrite, or Production deployment in 1A.
