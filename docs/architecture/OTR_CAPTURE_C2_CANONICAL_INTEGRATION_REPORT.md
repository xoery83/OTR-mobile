# Capture C2 canonical integration report

Date: 2026-10-08 (Pacific/Auckland). **PREPARED / INDEPENDENT REVIEW PASS.**
No merge commit created. STOP for Owner review.

## Exact parents and trees

Fresh isolated worktree `/private/tmp/otr-c2-canonical-integration-20261008`, branch
`codex/c2-canonical-integration-20261008`. Re-fetch succeeded; local main,
origin/main and actual canonical checkout matched the approved first parent before
preparation. No other worktree source or dirty C3 content was incorporated.

| Identity                                                                 | Exact hash                                 |
| ------------------------------------------------------------------------ | ------------------------------------------ |
| First parent / retained HEAD                                             | `56a7ab8f08ea973eb777fa00c8e6393057c1193c` |
| First-parent tree                                                        | `3ed7ad4faa221f6997cce24a84a5c76691982190` |
| Accepted C2 / MERGE_HEAD                                                 | `914e854cba7c2c97cfec7243047a06cadcc82c05` |
| C2 tree                                                                  | `90b6f67d860e6046c9787b99aa823adf3822d5e6` |
| C2 sole parent / common ancestor                                         | `b6daffecedab1616b173fde3f5e2de5d54770eff` |
| Tested integration index tree, before final evidence-only handoff/review | `2680bd4bcad0cfa976a1295f92e5d373173c148a` |
| Final handoff + independent review tree, excluding this report           | `4794846d38ba46a77468106b4aada067c327deb3` |

The final delivered staged tree including this report is pinned in
`/private/tmp/otr-c2-integration-evidence-20261008/final-manifest.json` and the final
handoff message. Keeping that pin external avoids a self-referential report hash.
The only changes after the tested tree are current-state/result documentation and
independent/integration reports; all tested runtime/test bytes remain identical.
A future ordinary merge commit would retain the first/second parents in the order
above, preserving C1, P4a, C4a, R3 and C2 accepted history without rewriting commits.

Preparation: `git merge --no-ff --no-commit 914e854cba7c2c97cfec7243047a06cadcc82c05`.
HEAD remains at canonical parent; MERGE_HEAD remains accepted C2. The pending index
is intentional merge preparation, not permission to commit, push or promote main.

## Reconciliations and accepted-byte preservation

- One textual conflict: `docs/CURRENT_IMPLEMENTATION_STATE.md`. Resolved semantically
  to retain accepted C2/device limits, P4a SELECT-only diagnostics, dormant C4a,
  R3 accepted CLOSED rebuild/forward/fixture facts and old-device quarantine.
  Active SQLite1–51 and Git Server1–84 are separate from R3's68 Hosted historical
  records. Stale active C1-pending/C2-not-started next steps were superseded.
  Historical reports/acceptance snapshots were preserved, not rewritten.
- `src/ui/catalogs.ts` and `intelligenceContinuationRepository.test.ts` are exact
  ordinary clean three-way unions: both locales retain every C2 Capture and P4a
  Operations entry; C2's three schema51 assertions coexist with P4a's terminal
  FAILED SELECT-only regression. No accepted message value changed.
- Sole extra test adaptation: `src/data/foundation/diagnosticsReadOnly.test.ts:168`
  changes expected schema50 to51 because its startup fixture installs the full
  registry. All read-only/Auth-adoption/zero SecureStore-write assertions remain.
  Deliberate schema50 mocks elsewhere were retained.
- All25 other C2 paths match accepted C2 byte-for-byte, including original reports,
  ADR and runtime. All1,197 canonical paths outside the allowed integration delta
  are exact. Independently, all42 canonical-only advancement paths excluding the
  authorized diagnostics adaptation are exact. R3 SQL/evidence/tests, environment
  and runbook remain unchanged; C4a is uncomposed and C2 processing NOT_INSTALLED.
- No new integration runtime defect was identified, so no further code or test
  repair was applied. Source C2 remains clean; dirty C3 was neither read as a source
  nor changed. Eight protected canonical/C2/C3/P4a/C4a/R3 worktree fingerprints
  (HEAD, status, tracked diff and untracked content) match before/after.

## Exact first-parent file inventory

31 paths:28 accepted C2 paths, the authorized diagnostics test adaptation and two
new integration evidence reports. No deletions, renames or dependency/config edits.

```text
M	app/(tabs)/capture.tsx
M	docs/CURRENT_IMPLEMENTATION_STATE.md
M	docs/DATA_MODEL.md
M	docs/OFFLINE_SYNC.md
A	docs/adr/2026-10-08-capture-c2-local-intake.md
A	docs/architecture/OTR_CAPTURE_C2_CANONICAL_INDEPENDENT_REVIEW.md
A	docs/architecture/OTR_CAPTURE_C2_IMPLEMENTATION_REPORT.md
A	docs/architecture/OTR_CAPTURE_C2_INDEPENDENT_REVIEW.md
A	docs/architecture/OTR_CAPTURE_C2_OWNER_DEVICE_GATE_REPORT.md
M	src/data/db/checkpoint11Integration.test.ts
M	src/data/db/database.test.ts
M	src/data/db/migrations.ts
A	src/data/db/migrations/captureSubmissions.ts
M	src/data/foundation/diagnosticsReadOnly.test.ts
A	src/data/operations/captureSubmission.ts
A	src/data/operations/defaultCaptureSubmission.ts
A	src/data/repositories/captureSubmissionRepository.test.ts
A	src/data/repositories/captureSubmissionRepository.ts
M	src/data/repositories/defaultLocalCaptureInboxRepository.ts
M	src/data/repositories/intelligenceContinuationRepository.test.ts
M	src/data/repositories/localCaptureInboxRepository.ts
M	src/data/repositories/tripCanonicalEventRepository.test.ts
A	src/domain/capture/captureSubmission.ts
M	src/features/capture/CaptureContent.test.ts
M	src/features/capture/CaptureContent.tsx
M	src/features/capture/captureLifecycle.test.ts
M	src/features/capture/captureStaging.test.ts
A	src/native/captureUriReader.test.ts
A	src/native/captureUriReader.ts
M	src/ui/catalogs.ts
A	docs/architecture/OTR_CAPTURE_C2_CANONICAL_INTEGRATION_REPORT.md
```

`DATA_MODEL.md` and `OFFLINE_SYNC.md` carry the accepted C2 append-only sections
exactly. Original C2 implementation/independent/device reports and ADR retain exact
accepted bytes. No adjacent feature work or historical documentation cleanup.

## Fresh validation

| Check                                                   | Result                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| Full targeted integration matrix                        | **34 files /727 PASS**, zero failures/skips                     |
| Separate terminology suite                              | **1 file /6 PASS**                                              |
| Independent focused execution                           | **7 files /334 PASS**, zero findings                            |
| Exact-main serial full suite                            | **217 files /2,818:2,802 PASS,1 FAIL,15 SKIP**                  |
| Integrated serial full suite                            | **219 files /2,864:2,848 PASS,1 same FAIL,15 SKIP**             |
| Full-suite comparison                                   | **46 additional passes; zero new failures**                     |
| Typecheck                                               | PASS                                                            |
| Full lint including UI/terminology guard                | PASS;473 retained legacy occurrences,79 representative UI files |
| Backend bundle build                                    | PASS; local compilation only                                    |
| All changed-file Prettier / whitespace / resolved index | PASS                                                            |
| Exact baseline source verification                      | **1,214 tracked files** exact before and after tests            |
| C2/canonical/history/union preservation                 | PASS                                                            |

Counts overlap and are not summed. Vitest JSON's nested suite count is not a file
count; file counts above use actual `testResults` entries.

The targeted matrix reuses existing tests for C2 repository/native/UI/lifecycle/
staging, CP11 original/payload/domain and SQLite integration, CP13A admission and
CP13B flight integration callers, continuation/sync and five C dispatch denials,
P4a diagnostics/Operations/DB/Auth/focus, C4a strict JSON assessment, Account
request generation/switch/offline-session behavior, Health and UI catalog/controls/
foundation coverage. Existing tests execute SQLite51 fresh installs and50→51
upgrades with FK ON/OFF, original-preserving atomic binding, cold reopening and
lost-ACK recovery; no extra framework or speculative test infrastructure was added.

Commands use existing Node24.18.0 and Vitest4.1.11:
`vitest run --configLoader runner --cache=false --maxWorkers=1 --no-file-parallelism`.
Whole runs additionally used JSON reporter/output files. Terminology tests live
outside the default include; a task-owned external config selects
`scripts/ui/terminology.test.ts` explicitly (6 PASS), without repository config edits.
Temporary existing-dependency symlinks were used, with no installation or shared
source change; the integration/baseline links are removed from delivery.

### Existing full-suite failure, separately identified

Both exact main and integration fail the same assertion in
`src/domain/architectureBoundary.test.ts`:
`foundation architecture boundaries keeps UI and domain modules away from direct data infrastructure`.
The scanner detects a `/@\/data\/sync/` import in the existing P4a test
`src/components/LocalOperationsDiagnostics.test.ts`. Complete messages match after
normalizing only the two worktree roots. No new failed test or file; no collection
failure was introduced. This current-main diagnostic differs from C2's retained
historical b6 staging-regex failure. It is not relabeled as a historical Ledger
failure, fixed outside scope or hidden by weakening the guard. **No global
full-suite PASS is claimed.**

## Historical migration preservation and independent review

84/84 Server migration files and four extracted SQLite historical modules are
exact across common ancestor, both parents and prepared tree. Historical registry
is exact after removing only the accepted SQLite51 import/array entry. All SQLite
1–50 definitions remain preserved; both parent/current Server inventories remain84.
SQLite51 adds exactly two local tables plus accepted indexes/triggers, including
bound-original retention guards. No Server85/SQLite52 or historical SQL rewrite.
Disposable local SQLite fixtures only; R3 rebuild/forward SQL was not run.

Independent reviewer regenerated both clean unions, compared accepted/canonical
blobs, inspected shared Auth/DB/custody and closed boundaries, ran334 focused tests
and independently parsed/compared the two full-suite JSON results. Verdict:
**PASS, zero remaining CRITICAL/IMPORTANT/MINOR integration findings**.
See [independent review](OTR_CAPTURE_C2_CANONICAL_INDEPENDENT_REVIEW.md). Its focused
execution is separate from Builder whole-suite execution and retained prior reviews.

External evidence directory:
`/private/tmp/otr-c2-integration-evidence-20261008` contains targeted/terminology/
static/build logs, both whole-suite JSON/logs, full-suite-comparison.json,
baseline-source before/after proofs, preservation.json, independent-preservation.json,
independent focused logs, protected before/after fingerprints and final-manifest.json.
No private device/Hosted data or credentials were copied into Git.

## Readiness and stop boundary

**C2 integration prepared for Owner review**, with the existing full-suite scanner
failure disclosed and zero new failures/findings. All conflicts are resolved and
the reviewed merge remains uncommitted. A new authorization is required for any
commit/push/main advancement, with exact ref rechecks before promotion.

No canonical checkout merge, rebase/cherry-pick, commit, push or main advancement;
no C3 changes, Hosted database operation, R3 migration execution, provider activation
or device installation/change. P4a/C4a/R3 accepted boundaries and existing CLOSED
runtime/provider/canonical gates remain. Owner C2 local device acceptance does not
authorize R3 first-sync, durable C4/C5, C3 discovery or processing activation.

**STOP — C2 INTEGRATION PREPARED FOR OWNER REVIEW.**
