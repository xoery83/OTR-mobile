# Current Implementation State — 14 November 2026 NZDT

## Active checkpoint

Owner authorized **Import V3 Slice5 Documents only** after completed four-lane Main Merge/Push. Fresh fetched GitHub Main is `431a893b3ecba5b6eb9c6557bd81bc6e8d4e6cc8`, containing accepted source `08ad06c9`; no new remote divergence. New branch `codex/import-v3-slice5-documents`, independent worktree `/Users/xoery/Project/otr-mobile-import/import-v3-slice5-documents`. Old Import branch is historical reference only; no wholesale cherry-pick. Main remains untouched.

Bounded gap and two-preview plan: `docs/ops/import-slice5-20261114/PLAN.md`. Preview1 adds normal Documents entry, scoped Trip Docs/Inbox, compact metadata lists and typed filters, reusing Core accepted snapshot and original store plus legacy Capture reader. iPhone has9existing Core Documents and0legacy Capture rows; old list alone would incorrectly look empty. Metadata survives absent original bytes; only explicit open reads/verifies bytes. No Source Proof, new storage/queue/receipt/SQL or Cloud Sync.

Preview1 implementation is in progress; targeted checks and full App Native preview must be recorded before acceptance. Preview2 covers full information-first Detail, direct links versus same-Batch outcomes, real Batch/other originals, search and scoped return. Stop at each bounded Owner preview checkpoint. No DeepSeek or repeated B1 Save needed. Slice6 begins only after Slice5 accepted and merged, on a fresh updated Main branch. No automatic Main merge/push authorized.

All Recovery sections below are historical accepted evidence for source08ad06c9, not active Recovery tasks. Expense P0 closed; Settlement intermittent503 remains Beta follow-up. Main Merge GO is not Beta Release GO.

## Restored and actually checked

- Full Expo/CocoaPods/Xcode **Release Native build**, not a JS replacement in the old shell. DEV includes Apple entitlement/module plus existing Google/Places/file/SQLite native modules. Existing iPhone Bundle and simulator application identifier retained. Full build/staging comparison:1159 non-test product files, no mismatch; actual binary/bundle hashes in recovery manifest.
- Apple button reaches system Apple authorization. **Complete Apple login remains BLOCKED** because Simulator has no Apple Account. Historical physical Auth receipts do not count as this build's login E2E.
- Trip edit reuses already-qualified same Trip/generation metadata; Currency uses owning Ledger permission screen; Cover uses existing Personal Cover. Cover-only save does not fabricate Parent metadata command.
- Day Feed gradient derives its predecessor from actual displayed dates. Duplicate Ledger empty-state Add Expense removed; normal shell + remains.
- Guest Native workspace is lazy during Account bootstrap; two keyboard tap policies restored; FX quote classification uses caller's existing injected clock. Cached summary copy no longer claims all details are unavailable.
- Fresh independent Guest Simulator: actual Trip create/edit, NZD→USD, Coast Cover, P1 local create/edit and cold launch. **Guest P1 has local pending intents, not cloud APPLIED.** Guest Ledger currently requires Account; do not impersonate Guest as Account to remove that boundary.
- Normal synthetic DEV Account: new Trip `285ffde2-a74c-4876-993e-b763cb457632`; Item `442f1586-fe38-47ea-98da-61e9242a6729`. P1 NEW `57f18c5d…` / EDIT `c079c504…` have actual APPLIED Receipts, revision1→2. Root2 independently confirmed PostgreSQL rows/receipts and Trip rename `98b7e374…`. Full App cold launch restores edited Trip/P1 without login.
- Found and fixed stale Trip→Ledger title projection: verified Parent metadata snapshot now refreshes only Ledger display title/dates, preserving financial fields/account scope and rejecting old snapshots. `888a1b4b` full Native build installed; cold launch + actual Ledger shows **Recovery Account Edited**.

## Expense P0 closed — actual DEV, PG and client cold recovery

Owner approved exact request49144d1ea43f472981c156c5d52722f6. Existing Writer/CAS/Host helper deployed fixed image `sha256:427428016a5736ebb9f374d5f86772e7675e6ce0020290ee452e516490db1bdc`, healthy CID467cfd4e…; final independent Host reconciliation passed. Environment/Parent Reader1/V3/Caddy/mounts/Task Store retained; no rollback, no repeated Parent activation, no SQL/role/permission change. Original5d0068… CID/f886 image retained for rollback.

PRE READ ONLY confirmed original operation/key/Expense absent. Full App Settings→System Health→Check again used existing DataHealth+normal Sync to recover the same original operation, wire and key. Formal CREATE APPLIED, intentSequence1, canonicalRevision1. POST2 independent PG16:18:49NZDT: Expense unique1, typed original-key Receipt1 plus legal inner CREATE Receipt1, NZD100minor/scale2, original payer/participants/splits/date/valuation unchanged. Approved empty canonical display label falls back to the actual member UUID; frozen wire b621dda8… and SQL payload hash49a60e49… match. No new Expense/operation or queue reset.

Actual Full App cold launch restores original Expense/NZ$1.00 without pending/BACKEND_UNAVAILABLE. Same Receipt/canonical state and frozen wire; all13account operations COMPLETED; nine originals unchanged. Current source candidate08ad06c9. Main Merge recommendation GO, not Beta Release GO or Main execution authorization.

Bounded compatibility: Parent/Core/MyLedger/Ledger reads200 and anonymous Auth/Core/Import401; no Provider action. Settlement Review log observation4×503/9×200 remains unassigned; the three related old/new runtime functions are identical, no SQL/env change. It is an explicit read-availability evidence gap for Beta follow-up, not a claimed PASS or proven new regression; do not expand this completed Expense Recovery into a new broad audit.

## Test health — final source candidate 08ad06c9

Same-SHA full run: **11964 PASS / 24 FAIL / 162 existing conditional Pending**, 905 files (903 passed /2 failed). The24 assertions are exactly reproducible on current Main using the same FlatList test harness; no new candidate failure. One failed file is an absent pinned external QA158 fixture (no assertions executed), not a PASS. Three other original import failures now load. 162 includes161 prior Pending plus one already-declared PG fixture condition now visible after its import fix; zero new skips, deleted checks or enlarged timeouts.

MCP explicit selector203PASS/0FAIL. Architecture5PASS. UI guard/scoped lint PASS. Typecheck exactly3 independently confirmed Main baseline errors (universalContinuationRuntime.ts658/660 and browser react-dom/client declaration), zero new errors. Full Native Release and both Backend bundles build successfully. Latest actual results and limits in Consolidated Merge Gate Report. No whole-product PASS or Main GO is implied.

## Evidence and compatibility

Six required reports under `docs/integration/functional-recovery-20261114/`: ACCEPTED_FEATURE_BASELINE, FUNCTIONAL_RESTRICTION_AUDIT, FUNCTIONAL_RECOVERY_MATRIX, AUTOMATED_E2E_RESULTS, NATIVE_BUILD_VERIFICATION, RECOVERY_GO_NO_GO. Includes54 groups (46accepted,8deferred/evidence gaps), current PASS/FAIL/BLOCKED dimensions, original failure mapping, raw compressed test evidence, Root2 independent readback and actual screenshots. Prior `four-lane-20261114/MAIN_MERGE_GO_NO_GO.md` is explicitly superseded/HOLD.

SQLite79 retained; both legitimate76 histories and Import76–78/Auth79 ordering preserved. Original selected8 tables and9 private files remained intact after rebuild; latest9 file hashes remain unchanged. New synthetic Trip/P1/Expense were deliberately added via normal UI, so do not claim the full database/queue hash stayed unchanged. Original iPad and QA179 were not cleared or replayed; original worktrees and dirty ops patches untouched.

Still deferred: Invite/Claim full Native, private profile cloud editor, Version/private Realtime activation, full Hosted MCP Consumer/owning ports, Import Slice5/6/full UPDATE, Document Cloud Sync. Source presence is not permission to activate these.

## Next execution

Finish Slice5 preview1 validation on complete iPhone16 App, retain device/Session/SQLite/originals/Queue, then provide screenshots and operation evidence for Owner. Use existing iPad for minimal adaptation without copying private data. After preview1 acceptance, implement preview2. Do not resume Recovery, activate deferred capabilities or start Slice6.

## Latest runtime / Owner Header correction

P3/P4/P5/P6 NEW now independently PG APPLIED/rev1 on the same synthetic Trip; P5 EDIT c72eb532… has client formalReceipt/rev2. All five P1/P3/P4/P5/P6 objects survive normal cold launch and display in Day Feed. No duplicate Item, no Provider call. P5 first draft refused before command persistence, exact original error remains unproven.

Owner correctly found Day Header/background regression for undated Trips. The startDate condition suppressed canonical header/gradient. `5c28077e` reuses the same header with nullable start: real month/date, no invented Trip ordinal; dated Trip behavior unchanged. FullNative Release rebuilt and inplace installed, both paths actually viewed. New data container85802C81…; original9private hashes retained.

Original216 failure clustering is retained in the historical evidence; final same-candidate counts above supersede per-file aggregates. Expense live closure is now complete under exact Owner authorization; Main execution still awaits Owner.

## Current bounded closure — 08ad06c9

Source/product `65b0cf65`, test-port-only `34aa0d9c`, then accepted P1 consumer `08ad06c9`. Full Xcode Release rebuilt from matching product source (1014 files, zero mismatches), inplace installed with nine private files byte-identical. New data containerC6CFCC26…; Session/SQLite/Queue preserved. Original Trip negative Day fix verified Native: Nov2/3 show `11月 02/03`, Day1/2 remain, B/C/D tap cycle and D cold persistence pass; restored A. No Trip/Item dates changed. Root operations ports remove actual UI runtime layer violations; AST boundary targeted5PASS. Stale P5 CREATE protection and fresh-read recovery targeted19PASS; original first refusal message still unproven. Final full-run/known-baseline results are recorded in `docs/integration/functional-recovery-20261114/CONSOLIDATED_MERGE_GATE_REPORT.md`; do not substitute earlier per-file aggregates for that run. No Main merge/push or Production mutation; exact authorized DEV Expense deployment is recorded above.

Accepted P1 on another device exposed a pre-existing client-only restriction: freshAcceptedItem omitted P1 despite Core already allowing same-Creator MANUAL Edit. 08ad06c9 adds P1 to that existing path and to the existing Source temporal protection. 75 owning checks pass, including no-history certified same-Owner text edit, stale refusal and temporal proof preservation/no-write refusal. Full Native original Phase A Workshop Edit now opens with original fields; Cancel keeps title/rev2 unchanged and zero Item intents. No Core/SQL/ACL change.
