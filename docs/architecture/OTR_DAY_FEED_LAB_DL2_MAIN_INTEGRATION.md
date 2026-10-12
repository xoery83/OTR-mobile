# DL2 controlled local-main integration

2026-10-12. Owner-approved f5cc324 retains its20-path accepted source/evidence.
Initial main c0a6920 advanced independently to0379453 during validation; the
preservation guard stopped without mutating main. Fresh integration now merges
accepted DL2 into exact0379453. The intervening CLOSED model-task work has no
Feed/Core read/Flight bridge/route overlap and is not authored by this task.
Only the current-state prepend conflicted: retain the exact DL2 prefix and
complete new main handoff. Owning adapter and all accepted DL2 files otherwise
remain byte-identical. No unreviewed Flight or Flexible/TTR change imported.

Fresh clean-main3734 PASS/same2 established baseline FAIL/21 skipped; integrated
3743 PASS/same2 FAIL/21 skipped. All9 DL2 additions pass. Scoped8 files/78 PASS;
typecheck, full lint/UI guard, changed-format/diff PASS. Original c0 baseline
comparison also passed after controlled rerun (3718 versus3727, same2/21). Two
contention failures on simultaneous first runs disappeared on controlled rerun.
No complete full-suite PASS claim or baseline weakening.

Local main advances only after a new pinned-ref/index/dirty-byte check and
disposable shared-clone preservation rehearsal. Original dirty working handoff
bytes remain an exact suffix; all other canonical dirty/untracked bytes survive.
Concurrent worktree snapshot differences record independent work, not imported
changes. Evidence: /private/tmp/otr-dl2-main-preservation-result.json; exact
current test JSON /private/tmp/otr-dl2-current-{baseline,integrated}.json.

No push/deploy, Hosted write, schema authoring/execution, Seed, provider or
Auth/Sync activation. Accepted native DL2 limits remain unchanged. After safe
local advancement, DL4 interfaces/synthetic P3 proof are continuously authorized
on a separate isolated branch. Final main hash is this merge commit in Git.
