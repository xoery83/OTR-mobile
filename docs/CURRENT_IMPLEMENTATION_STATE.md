# Current Implementation State — 14 November 2026 NZDT

## Active checkpoint

**Full Functional Recovery IN PROGRESS / Main Merge and Push HOLD.** Owner withdrew the four-lane GO after discovering missing Native configuration and functional regressions. Test Suite PASS must not be treated as Product Functional Integrity PASS. Do not merge or push until recovery evidence supports GO and Owner approves.

Active worktree `/Users/xoery/Project/otr-mobile-import/integration-four-lane-20261114`, branch `codex/four-lane-integration-20261114`. Integrated base `5a5ca447`; product recovery checkpoints `8297ab8e`, `95345e4d`, latest candidate `08ad06c9`, including product fixes `65b0cf65` and test-port maintenance `34aa0d9c`. Main last independently observed `ec282ce6`; old local main `5648818e` is stale. No Main merge/push or Production operation in this stage.

## Restored and actually checked

- Full Expo/CocoaPods/Xcode **Release Native build**, not a JS replacement in the old shell. DEV includes Apple entitlement/module plus existing Google/Places/file/SQLite native modules. Existing iPhone Bundle and simulator application identifier retained. Full build/staging comparison:1159 non-test product files, no mismatch; actual binary/bundle hashes in recovery manifest.
- Apple button reaches system Apple authorization. **Complete Apple login remains BLOCKED** because Simulator has no Apple Account. Historical physical Auth receipts do not count as this build's login E2E.
- Trip edit reuses already-qualified same Trip/generation metadata; Currency uses owning Ledger permission screen; Cover uses existing Personal Cover. Cover-only save does not fabricate Parent metadata command.
- Day Feed gradient derives its predecessor from actual displayed dates. Duplicate Ledger empty-state Add Expense removed; normal shell + remains.
- Guest Native workspace is lazy during Account bootstrap; two keyboard tap policies restored; FX quote classification uses caller's existing injected clock. Cached summary copy no longer claims all details are unavailable.
- Fresh independent Guest Simulator: actual Trip create/edit, NZD→USD, Coast Cover, P1 local create/edit and cold launch. **Guest P1 has local pending intents, not cloud APPLIED.** Guest Ledger currently requires Account; do not impersonate Guest as Account to remove that boundary.
- Normal synthetic DEV Account: new Trip `285ffde2-a74c-4876-993e-b763cb457632`; Item `442f1586-fe38-47ea-98da-61e9242a6729`. P1 NEW `57f18c5d…` / EDIT `c079c504…` have actual APPLIED Receipts, revision1→2. Root2 independently confirmed PostgreSQL rows/receipts and Trip rename `98b7e374…`. Full App cold launch restores edited Trip/P1 without login.
- Found and fixed stale Trip→Ledger title projection: verified Parent metadata snapshot now refreshes only Ledger display title/dates, preserving financial fields/account scope and rejecting old snapshots. `888a1b4b` full Native build installed; cold launch + actual Ledger shows **Recovery Account Edited**.

## Actual remaining runtime defect

Expense503 root cause is now proven in isolated PostgreSQL using the frozen original request and actual DEV function definitions: empty canonical participant display snapshot violates `expense_participants_display_name_snapshot_check` (23514). Both owning Person/Profile names are absent; date-only occurredAt is accepted. `65b0cf65` falls back only the prepared canonical display snapshot to the real stable member ID; original payload/key/money/splits are unchanged. Isolated first APPLIED plus same-key execute/replay preserve one Expense/Receipt. **Shared DEV remains unchanged; live Receipt/readback/cold closure requires one specific DEV deployment/recovery authorization.** Do not recreate the Expense or original operation.

Original operation `ledger-operation_mwfnz7vm_g0z2dtlug3`, key `ledger-idempotency_mwfnz7vm_umzru4w06b`, derived Expense `c02ea242-33b4-577e-a325-def35524fec6`. Candidate amd64 image `sha256:427428016a5736ebb9f374d5f86772e7675e6ce0020290ee452e516490db1bdc`; rollback `f8862b0a…` / source f650ce2b. Exact request/recovery bounds in Consolidated Merge Gate Report. No SQL migration required.

Old Trip actual Actor/Owner/Parent/core read are valid. Same-scope metadata qualification was being cleared on every refresh; candidate retains it only for identical Actor/Trip/generation, clears on real failure, and distinguishes loading. Full Native original Trip editor, Currency and Cover selectors reopened successfully; canceled without data mutation.

## Test health — final source candidate 08ad06c9

Same-SHA full run: **11964 PASS / 24 FAIL / 162 existing conditional Pending**, 905 files (903 passed /2 failed). The24 assertions are exactly reproducible on current Main using the same FlatList test harness; no new candidate failure. One failed file is an absent pinned external QA158 fixture (no assertions executed), not a PASS. Three other original import failures now load. 162 includes161 prior Pending plus one already-declared PG fixture condition now visible after its import fix; zero new skips, deleted checks or enlarged timeouts.

MCP explicit selector203PASS/0FAIL. Architecture5PASS. UI guard/scoped lint PASS. Typecheck exactly3 independently confirmed Main baseline errors (universalContinuationRuntime.ts658/660 and browser react-dom/client declaration), zero new errors. Full Native Release and both Backend bundles build successfully. Latest actual results and limits in Consolidated Merge Gate Report. No whole-product PASS or Main GO is implied.

## Evidence and compatibility

Six required reports under `docs/integration/functional-recovery-20261114/`: ACCEPTED_FEATURE_BASELINE, FUNCTIONAL_RESTRICTION_AUDIT, FUNCTIONAL_RECOVERY_MATRIX, AUTOMATED_E2E_RESULTS, NATIVE_BUILD_VERIFICATION, RECOVERY_GO_NO_GO. Includes54 groups (46accepted,8deferred/evidence gaps), current PASS/FAIL/BLOCKED dimensions, original failure mapping, raw compressed test evidence, Root2 independent readback and actual screenshots. Prior `four-lane-20261114/MAIN_MERGE_GO_NO_GO.md` is explicitly superseded/HOLD.

SQLite79 retained; both legitimate76 histories and Import76–78/Auth79 ordering preserved. Original selected8 tables and9 private files remained intact after rebuild; latest9 file hashes remain unchanged. New synthetic Trip/P1/Expense were deliberately added via normal UI, so do not claim the full database/queue hash stayed unchanged. Original iPad and QA179 were not cleared or replayed; original worktrees and dirty ops patches untouched.

Still deferred: Invite/Claim full Native, private profile cloud editor, Version/private Realtime activation, full Hosted MCP Consumer/owning ports, Import Slice5/6/full UPDATE, Document Cloud Sync. Source presence is not permission to activate these.

## Next execution

Finish current same-candidate full test classification and consolidated report. Main HOLD until real Expense P0 is closed via one authorized standard DEV deploy/reconciliation, formal original Receipt, independent PG readback and cold recovery. No broad re-audit, old QA recovery or new framework. Original missing immutable QA158 fixture is an evidence gap; do not fabricate its hash/contents or skip its test. Apple full login remains externally blocked.

## Latest runtime / Owner Header correction

P3/P4/P5/P6 NEW now independently PG APPLIED/rev1 on the same synthetic Trip; P5 EDIT c72eb532… has client formalReceipt/rev2. All five P1/P3/P4/P5/P6 objects survive normal cold launch and display in Day Feed. No duplicate Item, no Provider call. P5 first draft refused before command persistence, exact original error remains unproven.

Owner correctly found Day Header/background regression for undated Trips. The startDate condition suppressed canonical header/gradient. `5c28077e` reuses the same header with nullable start: real month/date, no invented Trip ordinal; dated Trip behavior unchanged. FullNative Release rebuilt and inplace installed, both paths actually viewed. New data container85802C81…; original9private hashes retained.

Original216 failure clustering is retained in the historical evidence; final same-candidate counts above supersede per-file aggregates. Expense live closure remains pending protected deployment authorization. Main HOLD.

## Current bounded closure — 08ad06c9

Source/product `65b0cf65`, test-port-only `34aa0d9c`, then accepted P1 consumer `08ad06c9`. Full Xcode Release rebuilt from matching product source (1014 files, zero mismatches), inplace installed with nine private files byte-identical. New data containerC6CFCC26…; Session/SQLite/Queue preserved. Original Trip negative Day fix verified Native: Nov2/3 show `11月 02/03`, Day1/2 remain, B/C/D tap cycle and D cold persistence pass; restored A. No Trip/Item dates changed. Root operations ports remove actual UI runtime layer violations; AST boundary targeted5PASS. Stale P5 CREATE protection and fresh-read recovery targeted19PASS; original first refusal message still unproven. Final full-run/known-baseline results are recorded in `docs/integration/functional-recovery-20261114/CONSOLIDATED_MERGE_GATE_REPORT.md`; do not substitute earlier per-file aggregates for that run. No Main merge/push or DEV/Production mutation.

Accepted P1 on another device exposed a pre-existing client-only restriction: freshAcceptedItem omitted P1 despite Core already allowing same-Creator MANUAL Edit. 08ad06c9 adds P1 to that existing path and to the existing Source temporal protection. 75 owning checks pass, including no-history certified same-Owner text edit, stale refusal and temporal proof preservation/no-write refusal. Full Native original Phase A Workshop Edit now opens with original fields; Cancel keeps title/rev2 unchanged and zero Item intents. No Core/SQL/ACL change.
