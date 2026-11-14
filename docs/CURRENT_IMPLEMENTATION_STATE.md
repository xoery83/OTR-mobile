# Current Implementation State — 14 November 2026 NZDT

## Active checkpoint

**Full Functional Recovery IN PROGRESS / Main Merge and Push HOLD.** Owner withdrew the four-lane GO after discovering missing Native configuration and functional regressions. Test Suite PASS must not be treated as Product Functional Integrity PASS. Do not merge or push until recovery evidence supports GO and Owner approves.

Active worktree `/Users/xoery/Project/otr-mobile-import/integration-four-lane-20261114`, branch `codex/four-lane-integration-20261114`. Integrated base `5a5ca447`; product recovery checkpoints `8297ab8e`, `95345e4d`, latest product `5c28077e`, fixture maintenance `8bd49f26`. Main last independently observed `ec282ce6`; old local main `5648818e` is stale. No Main merge/push or Production operation in this stage.

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

Normal synthetic NZD1 Expense `ledger-operation_mwfnz7vm_g0z2dtlug3` returned503/BACKEND_UNAVAILABLE (request `1984cc0a-d2b0-4cfb-ad66-de31c3325e64`). Original local row/operation retained; no new operation or manual resubmit. Root2's independent PG read found no Expense/receipt at that instant, **not proof of retry safety**. Existing deployed Backend is healthy `f8862b0a` / source `f650ce2b`. Its generic error path discarded the original exception, and the bounded log window has no original error. Direct Actor/member/settings/replay-function prerequisites exist.

Minimal source diagnostic patch in `888a1b4b` retains only allowlisted RPC stage/database code, correlated by existing requestId; no raw DB text/values/token, no permission or HTTP contract change.84 relevant checks pass. **Backend patch not deployed in this audit**; no invented SQL root cause, no blind replay. Current runtime defect remains unresolved.

## Test health — explicit limits

Initial905 files:11993 tests,11616PASS/216FAIL/161 original Pending. Original216 clustered into173 infrastructure,31 historical assertion/fixture,2 product bugs,10 pending investigation; every failed case remains in `failure-root-causes.json`.

Latest **per-file merged evidence**, not a new single-run full PASS:11912PASS/34FAIL/161Pending;4 files still fail during import. Original216:182 now pass,34 remain (old Day Feed rendering harness32, architecture boundary2). No tests/assertions deleted, no new skip or enlarged timeout.10 new failures under full parallel load passed with the same timeout at lower concurrency. Native presentation port maintenance reopened75 assertions; do not count their mocks as actual Native/Provider verification.

MCP separate config384PASS. UI guard/scoped lint pass. Whole-repo typecheck remains exactly3 pre-existing issues (universalContinuationRuntime.ts658/660; browser/auth-consent/main.tsx react-dom/client declaration), no new errors. Full Native build succeeds. These facts do not establish whole-product integrity.

## Evidence and compatibility

Six required reports under `docs/integration/functional-recovery-20261114/`: ACCEPTED_FEATURE_BASELINE, FUNCTIONAL_RESTRICTION_AUDIT, FUNCTIONAL_RECOVERY_MATRIX, AUTOMATED_E2E_RESULTS, NATIVE_BUILD_VERIFICATION, RECOVERY_GO_NO_GO. Includes54 groups (46accepted,8deferred/evidence gaps), current PASS/FAIL/BLOCKED dimensions, original failure mapping, raw compressed test evidence, Root2 independent readback and actual screenshots. Prior `four-lane-20261114/MAIN_MERGE_GO_NO_GO.md` is explicitly superseded/HOLD.

SQLite79 retained; both legitimate76 histories and Import76–78/Auth79 ordering preserved. Original selected8 tables and9 private files remained intact after rebuild; latest9 file hashes remain unchanged. New synthetic Trip/P1/Expense were deliberately added via normal UI, so do not claim the full database/queue hash stayed unchanged. Original iPad and QA179 were not cleared or replayed; original worktrees and dirty ops patches untouched.

Still deferred: Invite/Claim full Native, private profile cloud editor, Version/private Realtime activation, full Hosted MCP Consumer/owning ports, Import Slice5/6/full UPDATE, Document Cloud Sync. Source presence is not permission to activate these.

## Next execution

Continue the original recovery candidate: close remaining Node native/historical fixture problems without weakening assertions; verify accepted roles/CRUD/cold/offline/cross-module paths with real evidence. Preserve actual Expense uncertainty; use owning diagnostics and existing legal deployment boundary before any controlled further runtime work. Apple/full OAuth and unavailable multi-identity/device conditions stay explicitly BLOCKED.

No Production, SQL/RLS/ACL/GRANT expansion, original B1/QA179 Analyze/Save, paid Provider call, data clearing, automatic Main merge/push or new framework. Do not repeat the423-branch inventory or stable B1 E2E.

## Latest runtime / Owner Header correction

P3/P4/P5/P6 NEW now independently PG APPLIED/rev1 on the same synthetic Trip; P5 EDIT c72eb532… has client formalReceipt/rev2. All five P1/P3/P4/P5/P6 objects survive normal cold launch and display in Day Feed. No duplicate Item, no Provider call. P5 first draft refused before command persistence, exact original error remains unproven.

Owner correctly found Day Header/background regression for undated Trips. The startDate condition suppressed canonical header/gradient. `5c28077e` reuses the same header with nullable start: real month/date, no invented Trip ordinal; dated Trip behavior unchanged. FullNative Release rebuilt and inplace installed, both paths actually viewed. New data container85802C81…; original9private hashes retained.

Current failure categories refined173 infrastructure/31 historical fixtures/2 confirmed product/10 pending;182 of216 fixed,34 remain. Latestmerged11912PASS/34FAIL/161existingPending,4import failures. This is NOT whole-suite/ProductPASS. Full test/restriction/product matrices stay in recovery directory; Expense503 and unexecuted roles/CRUD remain real work. Main HOLD.
