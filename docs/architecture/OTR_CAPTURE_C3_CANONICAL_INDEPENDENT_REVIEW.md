# C3 canonical integration — independent review

Date: 2026-10-08 (Pacific/Auckland).

What this change does: The prepared ordinary merge adds accepted C3 Activity discovery and exact retained-Job reopen to the current canonical C2/P4a/C4a/R3-D1c baseline. The shared current-state handoff is reconciled semantically; the two-locale catalog is the unedited clean three-way union. This is preparation for Owner review, not publication or device acceptance.

## Independent verdict

**PASS for the reviewed integration scope: 0 CRITICAL / 0 IMPORTANT / 0 MINOR integration findings.** Owner review remains required. The unchanged full-suite baseline failures, if any, must remain explicit in the Builder's final integration report; no global PASS is inferred from focused tests.

Reviewed isolated tree: `/private/tmp/otr-c3-canonical-integration-20261008`.

- First parent / current HEAD: `06adea85fc5d5d7b24f7e15a598e28cb86ae4671`.
- Second parent / MERGE_HEAD: `32d571b8fe4c7408f06c6294f8d41ee375c784d3`.
- Independently recomputed common ancestor: `914e854cba7c2c97cfec7243047a06cadcc82c05`.
- Reviewer did not stage, merge, commit, push, modify existing worktrees or edit the prepared tree. Reviewer outputs are confined to the temporary integration evidence directory. No Hosted, physical-device, Simulator, provider or bundle operation was performed.

## Preservation verified independently

An independent Python/Git check enumerated the accepted C3 changes from the common ancestor, excluded only the two shared files, then compared every remaining prepared file to the accepted C3 blob. **All 17 C3-only paths are byte-for-byte exact**, including runtime, tests and all five accepted C3 reports. The check independently enumerated canonical tracked paths outside C3's changed set: **1,220 canonical paths are byte-for-byte exact**. This includes unchanged Auth/account-switch implementation, configuration, R3 documentation, backend startup/runtime/provider gates and canonical-only P4a/C4a code. **89 migration-directory paths are exact**: 84 Server SQL files and five SQLite migration modules. The root `src/data/db/migrations.ts` registry was separately verified exact, giving **90 migration source/registry paths**. SQLite1–51 and Server1–84 remain unchanged; these path counts are not counts of individual SQLite migrations.

The reviewer separately extracted catalog blobs from first parent, common ancestor and second parent and ran `git merge-file -p canonical base c3`. It returned a clean union. Its complete bytes equal the prepared `src/ui/catalogs.ts`; therefore both locale halves retain every accepted side exactly. SHA-256: `e33ef4e19d4a048c1226c638ca597f7373d114978235dfa662a8ee91379a4de1`.

Machine evidence: `independent-preservation.json`, plus `independent-catalog-canonical.ts`, `independent-catalog-base.ts`, `independent-catalog-c3.ts` and `independent-catalog-clean-union.ts` in `/private/tmp/otr-c3-integration-evidence-20261008/`.

## Semantic reconciliation and retained boundaries

Read current-state first, the repository Agent Guide and required product/architecture/data/API/offline/environment/legacy-audit documentation, the UI foundation/glossary, accepted C3 review/recheck evidence and published `OTR_R3_D1C_CROSS_WORKSTREAM_HANDOFF.md`. The legacy Web checkout was not inspected.

The prepared handoff retains C2 publication and its historical Owner/device acceptance, C3 Functional Simulator PASS / Physical Device Deferred, accepted P4a read-only Operations, dormant P2/C4a and R3-D1c accepted-with-limitations. Historical reports remain exact and their old pending wording is not rewritten as new acceptance. C3 preparation is explicitly separated from canonical publication. The newer R3 device A→B→A result does not resolve or attribute C3's historical Account Switch error.

All six R3-D1c limitations remain in the current-state summary, with their full original wording retained in the unchanged handoff:

1. Invalid synthetic PNG and incomplete useful-render proof.
2. Unmeasured Account-switch latency.
3. Untested active-upload interruption / UNKNOWN recovery.
4. Retained unsaved synthetic draft and unverified provenance.
5. Expected Settlement `ADJUSTMENT_REQUIRED`.
6. Original-app network quarantine and observation limitations.

`com.xoery.otrmobile.devtest` remains the shared future DEV testing bundle. `com.xoery.otrmobile` protects historical application data and remains quarantined. No original-app re-enable, outbox replay/cleanup, SQLite/device-data change, R3 migration or runtime/provider activation is inferred or implemented. Current C3 processing remains NOT_INSTALLED and semantic results remain zero/null. The shared maximum Dynamic Type header clipping, actual VoiceOver speech, provider fidelity and latest UI physical acceptance remain limitations, not new integration passes.

## Account isolation and callers reviewed

Reviewed all production callers of `listDefaultCaptureJobs`, `reopenDefaultCaptureJob`, `CaptureActivity`, `captureJobTitle` and `CaptureContent`, plus existing Account context/generation/gate code and the C3 repository read/list/reopen/lineage flow.

- Default list/reopen operations capture Account/generation before awaiting database initialization and pass that retained context into the repository. They cannot silently recapture authority after A→B→A.
- Repository list/read/reopen and lineage SQL retain explicit Account predicates. The existing Account apply gate checks identity/generation before and after the read transaction and again before returning. Fresh A can read A's retained Job; old A requests remain invalid after A→B→A.
- Route admission retains local offline session, focus cleanup and Account generation. Component request epochs and invocation guards reject late success/error results after unmount, supersession and Account change. Hide invalidates transient reads without canceling durable local intake.
- Job actions use exact UUIDs and projected capability/reacquisition IDs, then retain existing Account/Input revision checks. Trip prior stays passive and current Ledger Trip selection is not assigned to a retained Job.
- No Auth architecture, Account-switch coordinator, queue/provider lifecycle, scheduler or migration change was introduced by this integration. No speculative correction to the historical generic Account Switch error is made.

## Independently executed regression

Command (from the isolated tree):

```sh
NODE_OPTIONS='--require=./scripts/cp15/live-w-network-deny.cjs' ./node_modules/.bin/vitest run src/data/auth/accountRequestContext.test.ts src/data/auth/accountSwitchCoordinator.test.ts src/data/auth/accountSwitchFoundation.test.ts src/data/operations/defaultCaptureSubmission.test.ts src/data/repositories/captureSubmissionRepository.test.ts src/data/repositories/captureAutonomousQa.test.ts src/features/capture/captureActivityLifecycle.test.ts src/features/capture/captureAccountSwitchRecheck.test.ts src/data/db/database.test.ts src/hooks/useLocalOperations.test.ts src/components/LocalOperationsDiagnostics.test.ts src/domain/capture/batchAssessment.test.ts --cache=false --maxWorkers=1 --no-file-parallelism --reporter=json --outputFile=/private/tmp/otr-c3-integration-evidence-20261008/independent-tests.json
```

**12 actual test files /178 tests PASS; 0 FAIL /0 SKIP.** Vitest's JSON `numTotalTestSuites=19` includes nested suites; it is not the file count. Parsed actual `testResults` contains these 12 files:

| File                                                        | Tests |
| ----------------------------------------------------------- | ----: |
| `src/data/auth/accountRequestContext.test.ts`               |     5 |
| `src/data/auth/accountSwitchCoordinator.test.ts`            |     8 |
| `src/data/auth/accountSwitchFoundation.test.ts`             |     1 |
| `src/data/operations/defaultCaptureSubmission.test.ts`      |     2 |
| `src/data/repositories/captureSubmissionRepository.test.ts` |    42 |
| `src/data/repositories/captureAutonomousQa.test.ts`         |     2 |
| `src/features/capture/captureActivityLifecycle.test.ts`     |     3 |
| `src/features/capture/captureAccountSwitchRecheck.test.ts`  |     3 |
| `src/data/db/database.test.ts`                              |    16 |
| `src/hooks/useLocalOperations.test.ts`                      |     4 |
| `src/components/LocalOperationsDiagnostics.test.ts`         |     5 |
| `src/domain/capture/batchAssessment.test.ts`                |    87 |

Evidence: `independent-tests.json` and `independent-tests.log` in the temporary evidence directory. Regression includes SQLite51 fresh/upgrade integrity, C3 stable20/20/5 pagination and exact cold reopen/no-write row preservation, retained context A→B→A rejection, late Activity callback fencing, remembered Account switch/rollback, P4a read-only/current-generation handling and dormant C4a assessment. Network-deny preload is inherited by the serial test processes; tests use only disposable synthetic SQLite/session data.

## Remaining evidence audit

The reviewer independently inspected Builder targeted/terminology JSON and typecheck/lint/UI guard/backend build/changed-format logs: **38 files /696 PASS**, **1 terminology file /6 PASS**, and all listed static/build/format checks PASS (UI guard checks80 strict representative files). These are audited Builder results, distinct from the reviewer’s independently executed12-file /178-test selection.

The reviewer independently parsed both serial whole-suite JSONs and compared test identity occurrences, outcomes, skips and full failure strings. **Exact canonical baseline:219 files /2,864 tests =2,848 PASS /1 FAIL /15 SKIP. Prepared integration:223 files /2,881 tests =2,865 PASS /1 FAIL /15 SKIP.** The17 additional assertion occurrences all PASS. No common identity changed outcome; no normalized baseline assertion disappeared; all15 skipped assertions are retained.

Raw names differ in three unchanged randomUUID-generated parameterized names (two verifier identity cases in `backend/src/inboundAiClient.test.ts`, one health_reference case in `src/domain/intelligence/outboundRouting.test.ts`). Their exact source bytes remain canonical. The reviewer verified the randomUUID declarations at lines1326–27 and108, and normalized only those three proven identity fields. Raw and normalized comparisons are both retained in `independent-whole-suite-comparison.json`; this is not a broad masking of assertion names.

The sole failure identity is `src/domain/architectureBoundary.test.ts` → `foundation architecture boundaries keeps UI and domain modules away from direct data infrastructure`. It reports the existing `LocalOperationsDiagnostics.test.ts` data/sync import literal. Complete failure messages and stack traces are identical after replacing only the two filesystem roots. The timestamp-sensitive API assertion described in historical C3 reports passed on both current whole-suite runs. No test, guard or accepted source was weakened. **No global full-suite PASS is claimed.**

Read Builder’s serial runner script and exact-baseline before-source manifest:1,229 tracked canonical files verified against the first parent; the same dependency/runtime and network-deny preload are used for both runs. The reviewer did not rerun the entire suites; independent evidence comparison and focused regression provide separate review evidence. The reviewer subsequently reread the final current-state handoff: fresh counts, independent comparison, all six R3 limitations, historical Account Switch uncertainty, physical-device deferral and the final Owner Review-only STOP remain accurate. Its entire dedicated R3 section is byte-for-byte equal to the canonical first parent.

**Reviewed staged19-path tree: `7ba6d0b52eeb2c4d8e47f15a37bb58a3d390b24a`.** Read-only `git diff --cached --exit-code` against this tree confirms the index exactly matches; the tracked working tree matches the index. Diff against the runtime-tested initial tree `0db7cfeee45bd8e97137b8b967f7e7b30fcc2fe5` contains only `docs/CURRENT_IMPLEMENTATION_STATE.md`, so no new runtime/test run is needed. Local main, origin/main and HEAD all still equal the expected first parent. The final package may add the two new evidence-only reports; its resulting21-path tree is a separate Builder pin, and does not rewrite this reviewer19-path pin.

Verdict: integration review PASS; reviewed19-path integration tree is ready for Owner review. Builder final evidence-only report packaging remains separate.

Not checked: devices, Hosted state, physical C3 acceptance, actual VoiceOver speech, provider fidelity or real historical Account Switch cause. Those remain outside authorization; no global full-suite PASS is claimed.
