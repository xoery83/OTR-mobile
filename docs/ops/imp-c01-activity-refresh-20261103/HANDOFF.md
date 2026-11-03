# IMP-C01 Activity completion recovery

Base: origin/main58e4dbed; isolated branch codex/imp-c01-continuous-20261103.
Status: LOCAL_PASS; no Hosted/model/device acceptance.

The first concrete failure is on the normal new-Batch Activity path. A local
Capture completion notification arriving while the Activity list is reading was
discarded by its running guard. The older snapshot could then leave the new Batch
missing or its originals shown pending until a manual Refresh. The regression
fails on the base and passes with this change.

CaptureActivity now coalesces those overlapping notifications into one follow-up
list read after the current read settles. It reuses the existing local repository
and optional Task GET seam. Existing stale UI-handler inventory checks remain;
blur/Account/Trip invalidation discards the pending refresh. It never starts
interpretation, resumes a Task, invokes Admission or saves anything. No timer,
background queue, copy/catalog or shared Navigation/Session/DayFeed/Sync/Native
change is introduced. Errors retain the existing manual Refresh recovery.

## Local UX reproduction

1. Run the focused Activity lifecycle test with the existing project dependencies:
   `vitest run src/features/capture/captureActivityLifecycle.test.ts --maxWorkers=1`.
2. Its local new-Batch fixture delays the first list snapshot, then announces
   completion twice through the real process-local Capture activity broadcaster.
   The snapshots represent the same Batch, first pending and then accepted.
3. Without tapping Refresh, the Activity now shows the accepted snapshot. There
   are exactly two list reads, not one per notification. Close the view or invalidate
   its scope before the first read returns: no extra read or old Batch is shown.
4. Later native acceptance: submit a lawful local original, open Activity during
   local intake completion and verify the Batch updates without manual Refresh.
   Open the same Batch through existing Results/Review and Documents/Updates routes;
   those routes and original identities must stay unchanged.

The fixture mocks repository snapshots/Task observations and uses no model output;
it is not AI E2E. Step4/device rendering, paid interpretation, actual Review Save
and downstream Documents/Updates end-to-end acceptance remain NOT_RUN. Expired
Source/Provider qualification is not revived by this local read fix.

Validation:3 targeted suites27 checks PASS; scoped strict types, ESLint, formatting,
UI guard473/167 and diff check PASS. Existing stale pagination/refresh, rapid taps,
error recovery and StrictMode checks are included. Root owns independent review
and shared integration. No unrelated private worktree was cleaned or changed.
