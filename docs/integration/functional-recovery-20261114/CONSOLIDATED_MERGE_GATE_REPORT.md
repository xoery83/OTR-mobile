# Consolidated Merge Gate Report — 2026-11-14

**Candidate: `08ad06c9d7391027a27798695e4027ab7f38e491`. Decision: NO_GO.**

Main remains `ec282ce65858f9a9857011b225ed08fce8c8d360`. No merge/push, shared DEV mutation, Production operation, Provider request or Settlement Confirm was performed in this closure. This supplements the six existing recovery reports; it does not reopen the 423-branch inventory or require the deferred Beta scope.

## 1. Actual fixes and boundaries

| Owner item | Classification and result | Evidence / limit |
|---|---|---|
| Expense 503 | **PRODUCT DEFECT: isolated cause and minimal repair verified; live closure BLOCKED on DEV deployment authorization.** | Actual original request + actual DEV SQL reproduced `23514 expense_participants_display_name_snapshot_check`. Original Person/Profile names are both empty; date-only input is not the cause. |
| Old Trip edit/read-only | **REGRESSION: same-scope qualification was cleared during every refresh; repaired.** | Preserve only same Actor/Trip/generation qualified metadata while rereading; real rejection still clears it. Actual original Trip opens editor, Currency chooser and Cover chooser after cold launch; cancel leaves data unchanged. |
| Accepted P1 without local CREATE history | **PRODUCT DEFECT: pre-existing client-only history restriction; repaired under existing Core contract.** | Core owning `coreCanManage`, version and MANUAL text edit already support it. Add P1 to existing certified fresh-item path; keep foreign/stale/pending/malformed history denial and Source temporal protection. 75 owning checks PASS; final Native edit button and form verified; original Item title/rev2 unchanged, zero pending Item commands after cancel. |
| Architecture boundary | **Closed in targeted tests.** | AST checks distinguish runtime imports/reexports/require/dynamic imports from erased types/comments. Runtime UI wiring moved into existing data operations; no direct DB/API/Sync runtime dependencies in presentation. Full-run confirmation below. |
| P5 first refusal | **EVIDENCE GAP for the original message; deterministic legitimate conflict recovery verified.** | A stale CREATE draft rejects `MANUAL_TRANSPORT_CONFLICT` with no persisted command; a fresh read/draft saves normally. This does not establish the exact cause of the unrecorded original refusal. |
| Negative Day Header | **PRODUCT DEFECT: fixed and Native verified.** | Pre-start dates reuse month/two-digit calendar date; no Day 0/negative ordinal. Original Nov 2/3 show `11月 02/03`; Nov 14 remains Day 1, Nov 15 Day 2. B/C/D switch and D cold persistence verified; original A restored. |
| Apple login | **ENVIRONMENT BLOCKED for complete login.** | Earlier full Native system authorization entry PASS; no Apple Account available to complete external exchange. Do not label full login PASS. |

Expense repair changes only the **prepared canonical participant display snapshot** when the original snapshot is empty: retain the real stable member ID rather than invent a human name. Preserve nonempty names, original wire bytes, Expense/Operation/idempotency IDs, amount, splits and all permissions. The original request SHA256 remains `b621dda8276925a29b12286a0645f8d0eb1e9664eef2e93c87472e5555b7c585`.

Isolated PG using actual DEV function definitions: first execute APPLIED; repeated original execute and normal replay return the same Receipt; one Expense, one typed Receipt; money/splits unchanged. Fixture container was network-none and removed. **This is not a DEV APPLIED Receipt.** See [isolated root cause](evidence/merge-closure/ISOLATED_ORIGINAL_REQUEST_RESULT.json) and [canonical-only repair](evidence/merge-closure/ISOLATED_CANONICAL_IDENTITY_FIX.json).

## 2. Changes from the previous candidate

Product/source `65b0cf65`, test-port maintenance `34aa0d9c`, and P1 owning consumer correction `08ad06c9`. No Core/SQL contract change.

- `backend/src/supabaseGateway.ts`: empty participant canonical display snapshot fallback; `expenseConsistency.test.ts` retains original payload and identity assertions.
- `LocalTripWorkspace.tsx`: same-scope edit-base retention; distinguish loading from actual unavailability, keep owning save authorization/version checks.
- `dayHeaderPresentation.ts`, `DayFeedFidelityHeading.tsx` and owning tests: pre-start calendar fallback, ordinary calendar colors, unchanged positive-day model and existing style preference.
- `manualPlanRepository.ts`: P1 now uses the same trusted fresh Accepted fallback as P3/P4/P6 when no local CREATE history exists; source-bearing temporal edits keep the existing refusal. No forged CREATE/Receipt or permission change.
- Existing Capture/P1/V3 operations now own Native transport/repository/sync composition. New small `ledgerActivity`, `tripReadActivity`, `transportMode` operation ports and moved `captureTripPrior` implementation replace UI runtime layer violations. No new engine, database, queue, state machine, Gateway or permission model.
- Native unit fixtures follow the owning ports, model functional React state and FlatList layout interfaces; actual recovery/budget assertions retained. No assertion deletion, new skip, increased timeout or product disable was used.

Full file list: `git diff --name-status 8f67784d..08ad06c9`. Prior accepted recovery commits (Native modules, Apple entitlement, Cover/Currency entries, gradient continuity, duplicate Expense button removal and Ledger title projection) remain included.

## 3. Same-candidate validation

All results below bind **08ad06c9d7391027a27798695e4027ab7f38e491**; no later product change.

| Check | Actual result |
|---|---|
| Full suite | **11964 PASS / 24 FAIL / 162 Pending**, 905 files; 903 files pass, two failed files below. |
| New unresolved assertion failures | **0** relative to the same-harness Main comparison; the 24 remaining are identical historical render failures. |
| Load failure | One absent pinned historical QA158 JSON; original file not executed, not called PASS. Other three prior load failures restored. |
| MCP, explicit `mcp/` selector | **203 PASS / 0 FAIL**, real local SDK sockets, no live Consumer. |
| Architecture | **5 PASS** in this full run; no remaining runtime boundary violation. |
| Typecheck | Exactly the same **3 Main baseline errors**, zero new errors. |
| UI guard / scoped lint | PASS. |
| Native / Backend builds | Complete Native Release PASS; both standard Backend bundles PASS; isolated amd64 image `/health`200; no DEV deployment. |

162 Pending = 161 earlier Pending plus the previously un-loadable SQL fixture's **existing** PG-environment conditional Pending, now visible. No new skip was added. Raw same-candidate [full run](evidence/merge-closure/full-run-08ad06c9.json.gz), [summary](evidence/merge-closure/full-run-summary.json), [MCP](evidence/merge-closure/mcp-run-08ad06c9.json.gz), [Main comparison](evidence/merge-closure/main-render-comparison.json).

The first `65b0cf65` full run was sandbox-restricted: local TCP/Unix listeners returned EPERM. It is retained as failed environment evidence, not used to claim a product regression or aggregate PASS. Three test fixtures also still referred to pre-move owning ports; repaired in the final test-only commit. Final full run permits local test sockets and uses unchanged timeouts/assertions.

Day Header + style preference targeted: **53 PASS**; Capture lifecycle: **25 PASS**. Includes -12/-1 days, Day 1/2, month/year boundaries, nullable start, civil-date/UTC consistency, Today/Tomorrow, B/C/D cycle/persistence and gradient retention. P5 repository targeted **19 PASS**, including deterministic stale CREATE/no-write/fresh-read recovery. Accepted P1/Detail owning checks: **75 PASS**, including Source proof preservation and temporal-edit no-write refusal. Expense related targeted **46 PASS**. These are diagnostic milestones; the final full-run result above is authoritative for the candidate.

Historical Day Feed render failures were rerun against independently fetched Main with the **same mock-only FlatList harness**: exactly the same 24 failing names, no additional candidate failure. Actual `DayFeed.tsx` and `P1Row.tsx` are identical to Main. Old tests expect replaced Flight browse test IDs, old P1 label/tree/style shapes or old rail behavior. Assertions remain intact; these failures are not silently called product PASS.

One historical test file still cannot import: `universalMixedBTaskReservation.test.ts` requires an external `C01_B_QA158_OWNING_INPUTS_20261106.json` with SHA256 `4bf14c65…`. The file is absent from relevant worktrees, project paths, tmp and reachable path history. **EVIDENCE GAP, original tests not executed; no synthetic replacement, fabricated hash or new skip.** Existing PG-owning fixture Pending remains Pending; not claimed PASS.

Typecheck independently compared with Main: the three existing errors are `universalContinuationRuntime.ts:658/660` (`presentationTier` on `{}`) and the browser `react-dom/client` declaration. Final candidate result is recorded above; no permission weakening or module disable to hide them.

## 4. Native / data / compatibility evidence

Full Xcode **Release Native build** succeeded. 1,014 tracked App product source files were compared with staging: **zero mismatches**. Actual final-candidate installed binary/bundle hashes are in [manifest](evidence/merge-closure/candidate-native-manifest.json).

Existing primary iPhone bundle was installed **in place**, then normally cold launched. SQLite/Session/Queue retained; all nine private Documents files remain byte-identical. No old iPad/QA179 data, session or original was copied, cleared or replayed. SQLite migration sequence **76→77→78→79** remains unchanged in this closure; no new migration, SQL, RLS, ACL, Role or Grant.

Actual UI checks on the original Trip:

1. Open original Trip → Day Feed: Nov 2/3 calendar dates, Day 1/2, real Item rows and gradient.
2. Tap heading A→B→C→D; all pre-start badges stay calendar dates; cold launch → same Trip → D remains; restore A.
3. Home → Edit Trip: name/destination/dates, Cover and Currency entries present. Currency opens existing owning currency selector; Cover opens original chooser. Cancel all, no original metadata/financial write.
4. Original accepted P1 → Focus → Details → Edit: enabled, original fields loaded; Cancel → Back preserves Focus. SQLite read-only check: original title/rev2 unchanged, zero Item intents. [Actual editor](evidence/merge-closure/p1-old-item-edit-restored-08ad06c9.png).
5. Ledger: original Trip title correct; no duplicate body Add Expense button, normal shell add retained.

| Before | After / cold recovery |
|---|---|
| [Negative Day screenshot](evidence/merge-closure/day-header-before-65b0cf65.png) | [Calendar dates / Day 1](evidence/merge-closure/day-header-after-65b0cf65-cold.png) |

[B](evidence/merge-closure/day-header-after-65b0cf65-B.png) · [C](evidence/merge-closure/day-header-after-65b0cf65-C.png) · [D](evidence/merge-closure/day-header-after-65b0cf65-D.png) · [Trip editor](evidence/merge-closure/old-trip-edit-restored-65b0cf65.png) · [Ledger](evidence/merge-closure/ledger-single-add-65b0cf65.png).

The existing recovery matrix remains the role/CRUD record: actual synthetic Account P1 NEW/EDIT plus P3/P4/P5/P6 NEW have prior formal receipts/readback; P5 EDIT/cold projection exists. Fresh independent Guest Trip/currency/Cover/P1 local cold paths passed previously. This closure does **not** promote unexecuted Member, full Guest Adoption, external Google/OTP or current-device P2 manual operations to PASS. Revoked/foreign/Account A→B→A behavior remains covered by owning isolated tests. Backend IMPORT/Parent Reader and MCP default-off contracts are preserved, not reactivated or redeployed.

## 5. One necessary DEV execution decision

**Request, not executed:** deploy the minimal Expense/backend diagnostic fix using the existing DEV Writer and standard Host/Docker mechanism, reconcile the **original** operation, then independently read back and cold-verify.

- Exact DEV project: `tuqigdxrvrerfewsxqgm`; Host `root@178.105.151.143`, API `https://api-dev.xoery.art`, Docker service `otr-dev-backend`. Fresh read-only preimage confirms current CID `5d0068f40a8227325a453431e60865795d98140e05bd627bcacf644ebfd74beb`, healthy f886 image, existing Parent Reader=1 / V3 active. No credentials returned.
- Request **`49144d1ea43f472981c156c5d52722f6`**, SHA256 **`1cda374cdb8f8886212a5a63568ac84f305e31441deccf6d8b61905f96386695`**. [Exact request](evidence/merge-closure/EXECUTION_REQUEST.json), [plan](evidence/merge-closure/deploy-plan.json), [existing Host helper](/private/tmp/otr-main-recovery-release-20261114/packet/release.py), [local check](evidence/merge-closure/local-release-check.json). Canonical executable packet remains `/private/tmp/otr-main-recovery-release-20261114/packet`; copied evidence files are not alternate execution paths.
- Existing Writer `/run/lock/otr-universal-finite-service.lock`, fresh identity device28/inode7. Existing operational `backend_closed_release.py` + exact Host helper reused, not replaced by a new executor. A private local Git-object staging copy makes the actual candidate commit available to its source-pin check; no original worktree changed. `check` returned **ALL_FIXED_INPUTS_MATCH**; `stage`/`release` were not called. Execution must still acquire the Writer/CAS and reject drift.
- Keep current Parent Reader=1, V3 environment, routes, mounts and Task Store. **Do not set `parentReceiptRead=true` again**: it is a one-time 0→1 plan operation, not the already-active state. Preserve ordinary V3 instead. No old PDF-only whitelist/window/Platform reference is added.
- Candidate image `otr-dev-backend:merge-recovery-08ad06c9-amd64`, actual ID **`sha256:427428016a5736ebb9f374d5f86772e7675e6ce0020290ee452e516490db1bdc`**, linux/amd64.
- Runtime base/rollback image **`sha256:f8862b0a70f797479fc6ec5e938f87b78a265bf626119d4dfe311ad5e97fdfa4`**. Local build uses that retained runtime and replaces only the two standard, self-contained Backend bundles; Backend bundles are byte-identical between 34aa0d9c and 08ad06c9; the latter only adds the mobile P1 consumer fix. Initial local arm64 check image is **not** a DEV artifact. No new build/execution framework.
- Preserve original Host/Compose/env/routes/volumes and Task state; planned short DEV restart if needed. No SQL install, schema/permission change, Provider call, new Expense or Settlement action.
- Original operation `ledger-operation_mwfnz7vm_g0z2dtlug3`; original key `ledger-idempotency_mwfnz7vm_umzru4w06b`; original derived Expense `c02ea242-33b4-577e-a325-def35524fec6`; synthetic Trip `285ffde2-a74c-4876-993e-b763cb457632`.
- Before resuming: query original Receipt/Expense/key. If APPLIED, consume that Receipt; do not execute anew. If confirmed absent, allow existing normal Sync to recover the same original operation/payload/key only. Do not create a substitute operation or modify original payload.
- On UNKNOWN: stop mutating and reconcile original IDs read-only; no blind retry or financial reset. Preserve any committed Receipt. Independently verify Receipt/Expense/participants/amount/splits and uniqueness, then client cold recovery.
- On backend health/compatibility failure: restore original image/config/volumes/routes with existing Writer; verify health and retained data. Do not reverse financial rows or delete the operation.

This specific shared DEV authorization is required by the Owner's Main Merge Closure boundary. The prior local/isolation authorization is not a substitute. No short artificial approval window or separate gate is proposed.

## 6. Verdict / remaining boundary

**NO_GO until the live Expense P0 closure is complete.** Local canonical repair and tests do not replace the required formal DEV Receipt, independent PostgreSQL readback and client cold evidence. Historical render assertions and missing immutable fixture remain explicit test/evidence debt; they are not hidden behind a PASS count. Full Apple login and other external identity conditions remain ENVIRONMENT BLOCKED.

Approved deferred scope unchanged: Import Slice5/6/full UPDATE, Document Cloud Sync, Hosted MCP Consumer, Version/Realtime activation, Flexible/TTR activation and P2 formal manual opt-in. No new product limitation, SQL migration or infrastructure was added. No verifiable per-Agent Credits usage source is available in this session; no estimate is presented as actual cost.

## Code location index

- `src/features/day-feed/dayHeaderPresentation.ts:dayHeaderPresentation` / `DayFeedFidelityHeading.tsx:DayFeedFidelityHeading`: pre-start date semantics and ordinary badge presentation; no group/sort/data/model change.
- `src/data/repositories/manualPlanRepository.ts:freshAcceptedItem`, `open`, `save`: trusted accepted P1 fallback and existing Source temporal protection. Owning Core: `src/domain/trip/tripCoreV2Mutation.ts:coreCanManage`, `assertCommandAccess`, `SET_ITEM_TEXT`; `tripCoreV2Commands.ts:isNormalManualCoreCommand`. No new authorization contract.
- `src/features/day-feed/LocalTripWorkspace.tsx:LocalTripContent.load`: exact-scope metadata retention/loading vs rejection.
- `backend/src/supabaseGateway.ts:buildLedgerExpenseCreateResponse`: prepared-only canonical participant fallback.
- `src/domain/architectureBoundary.test.ts`: AST runtime edge scanner; tiny existing operations ports own moved wiring.

Source candidate is frozen at 08ad06c9. Subsequent receipt/documentation-only commits, if any, do not represent another tested product version. No Main Merge GO is issued by this report.
