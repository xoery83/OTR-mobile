# Capture C3 canonical integration report

Date: 2026-10-08 (Pacific/Auckland).

**PREPARED / INDEPENDENT REVIEW PASS — STOP FOR OWNER REVIEW.**

Accepted C3 Activity and exact retained-Job reopening are prepared on current
canonical C2/P4a/C4a/R3-D1c through an ordinary two-parent no-commit merge. Only the
shared handoff needed semantic reconciliation. No runtime/test adaptation or
integration defect repair was necessary. No commit, push or main advancement.

## Exact parents and staged trees

Isolated worktree: `/private/tmp/otr-c3-canonical-integration-20261008`.
Branch: `codex/c3-canonical-integration-20261008`.

| Identity                                                          | Exact value                                |
| ----------------------------------------------------------------- | ------------------------------------------ |
| First parent / retained HEAD / main / origin/main                 | `06adea85fc5d5d7b24f7e15a598e28cb86ae4671` |
| First-parent tree                                                 | `17ae6a930c7b0aa6118fa73e002cc34cc1de2bd2` |
| Accepted C3 / MERGE_HEAD / proposed second parent                 | `32d571b8fe4c7408f06c6294f8d41ee375c784d3` |
| C3 tree                                                           | `b63c5ef0fd7408f9dea3ce16d3b059e68c422273` |
| Common ancestor / C3 sole parent / accepted C2                    | `914e854cba7c2c97cfec7243047a06cadcc82c05` |
| Common-ancestor tree                                              | `90b6f67d860e6046c9787b99aa823adf3822d5e6` |
| Runtime-tested 19-path staged tree                                | `0db7cfeee45bd8e97137b8b967f7e7b30fcc2fe5` |
| Final-results handoff, independently reviewed 19-path staged tree | `7ba6d0b52eeb2c4d8e47f15a37bb58a3d390b24a` |

Before implementation, fetch succeeded and local main/origin/main/FETCH_HEAD
matched the expected first parent. Final fetch also matched. No moved-main
reconciliation was necessary. C3 source branch/commit/sole parent were verified;
its clean committed tree, not ignored QA/native artifacts, was the second input.

Prepared command: `git merge --no-ff --no-commit
32d571b8fe4c7408f06c6294f8d41ee375c784d3`. HEAD remains the first parent;
MERGE_HEAD remains C3. Parent order is fixed as above, with no fast-forward,
rebase, cherry-pick or history rewrite.

The runtime-tested tree and final-results tree differ only in
`docs/CURRENT_IMPLEMENTATION_STATE.md`. This report and the new independent
integration review are the only further evidence-only additions. The final
21-path staged tree, including both reports, is pinned externally in
`/private/tmp/otr-c3-integration-evidence-20261008/final-manifest.json` and the
completion message; this avoids a self-referential report hash. No commit is
created by `git write-tree`.

## Reconciliation and preservation

- Sole textual conflict: `docs/CURRENT_IMPLEMENTATION_STATE.md`, two blocks. Kept
  current canonical sections and inserted C3 acceptance/preparation facts, then
  fresh validation/next-step evidence. C2 publication, P4a read-only Operations,
  dormant C4a, R3-D1c accepted-with-limitations and all six R3 limitations remain.
  Active C3 wording distinguishes Simulator acceptance, pending publication and
  deferred latest-UI physical acceptance. Historical reports remain untouched.
- The entire dedicated R3 section is byte-identical to main, as is the published
  R3-D1c handoff and every R3 SQL/evidence/test/config/runbook path. Shared
  cross-workstream status is reconciled without an ours/theirs replacement.
- `src/ui/catalogs.ts` equals a separately regenerated clean three-way union.
  Both locales retain all accepted C3 Capture values and current P4a Operations
  values. SHA-256:
  `e33ef4e19d4a048c1226c638ca597f7373d114978235dfa662a8ee91379a4de1`.
- All17 other C3 changed paths equal the accepted commit byte-for-byte, including
  runtime, tests and all five original reports. All1,220 canonical paths outside
  C3's changed set are exact; this includes all47 canonical advancement paths
  outside the two shared files. Original C2 reports also remain exact.
- SQLite registry1–51 and all historical definitions are unchanged. All90 source
  paths (84 Server SQL, five SQLite modules and root registry) match both parents
  and their common ancestor. No SQLite52/Server85, migration execution or rewrite.
  Server84 tail remains `20261007000100_flight_dev_dispatch_foundation.sql`,
  SHA-256 `46e80899f14817d5162f255383e303232a12276e662f34b2cb16156c34d4f2a9`.
  Git84 sources remain distinct from R3's68 historical Hosted migration records.
- No test adaptation. Current main already carries P4a's schema51 full-registry
  diagnostics assertion. Deliberate SQLite50 continuation fixtures/labels remain.
  No Auth architecture, dependency/config, custody, scheduler, runtime/provider
  gate or canonical command change was introduced by integration.

Preservation was checked before/after test execution and again for the delivery
index. The new report paths are the only additions beyond the accepted19-path
integration delta. No uncommitted C3/C4/R3/Platform/Experience source was copied.

## Fresh executed validation

| Check                                                | Result                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Full targeted integration matrix                     | **38 files /696 PASS**, 0 FAIL /0 SKIP                                                 |
| Terminology                                          | **1 file /6 PASS**                                                                     |
| Independent focused regression                       | **12 files /178 PASS**, 0 FAIL /0 SKIP                                                 |
| Exact canonical baseline serial whole suite          | **219 files /2,864 tests:2,848 PASS,1 FAIL,15 SKIP**                                   |
| Prepared integration serial whole suite              | **223 files /2,881 tests:2,865 PASS,1 same FAIL,15 SKIP**                              |
| Identity/outcome comparison                          | **All2,864 baseline cases retained;17 added cases PASS;0 changed or removed outcomes** |
| Typecheck                                            | PASS                                                                                   |
| Lint including UI/terminology guard                  | PASS; UI guard473 retained legacy occurrences,80 strict representative files           |
| Backend bundle build                                 | PASS; compilation only                                                                 |
| Changed-file Prettier and tracked/index whitespace   | PASS                                                                                   |
| Exact baseline tracked-source comparison             | **1,229 files exact before and after suites**                                          |
| Accepted/canonical/catalog/migration/R3 preservation | PASS                                                                                   |
| Independent integration review                       | **0 CRITICAL /0 IMPORTANT /0 MINOR integration findings**                              |

Counts overlap and are not added. File counts use JSON testResults entries,
not nested numTotalTestSuites. Both whole-suite commands ran sequentially using
existing Node24.18.0 and the same C3-installed dependency tree, linked temporarily
without installation. Vitest uses `--configLoader runner --cache=false
--maxWorkers=1 --no-file-parallelism`, JSON reporters and separate logs.
The existing `scripts/cp15/live-w-network-deny.cjs` preload denies external
TCP/fetch. Exact baseline was a verified Git archive of the first parent, not
the older dirty chat checkout. Tests use disposable synthetic SQLite/session
fixtures, not device or shared business databases.

Targeted matrix covers C2 durable intake, SQLite51 fresh/50→51 FK ON/OFF, CP11
atomic original binding, quotas/idempotency/lost-ACK and cold recovery; C3 stable
pagination, list/exact reopen/Hide, continuation lineage, A→B→A isolation and
stale callbacks; current P4a SELECT-only diagnostics and dormant C4a strict pure
assessment; continuation repository/sync and all five generic C dispatch denials;
current Auth/offline generation/session, UI catalog/foundation/controls, both
locales/palettes and navigation. Exact selected paths are recorded in
`targeted-files.txt`; JSON/logs record actual executed cases. Terminology uses
a task-owned external Vitest config to include `scripts/ui/terminology.test.ts`.
No repo test config or guard changed.

### Full-suite failure and precise identity matching

Both current runs fail the same existing assertion:
`src/domain/architectureBoundary.test.ts` →
`foundation architecture boundaries keeps UI and domain modules away from direct data infrastructure`.
It detects the data/sync literal in existing
`src/components/LocalOperationsDiagnostics.test.ts`. Complete failure messages
and stack traces match after replacing only baseline/integration filesystem roots.
No other failure or collection blocker is present. **No global full-suite PASS.**

Raw identity comparison initially showed20 additions/3 removals. Three existing
it.each case titles serialize randomly generated UUIDs: two verified Account/
client identity fields in `backend/src/inboundAiClient.test.ts` (1326–27), one
health_reference in `src/domain/intelligence/outboundRouting.test.ts` (108).
Those source files match exact main. Matching normalizes only these three
confirmed title fields, preserves occurrence multiplicity and every remaining
name/parameter/status, and compares failure text separately. It yields17 actual
new passing cases, no removed/changed cases, all15 skips preserved. Raw mapping
is retained in `full-suite-raw-identities.json`; bounded mapping/failure evidence
in `full-suite-comparison.json`. Independent review regenerated its own comparison
in `independent-whole-suite-comparison.json` rather than relying on Builder totals.
No test source or assertion was altered.

Accepted C3's historical2,737 PASS /2 FAIL /15 SKIP remains disclosed in its exact
reports and current-state historical block. Its timestamp-sensitive API assertion
passed both fresh current runs; a narrow old API rerun is not used to replace a
full-suite result. This integration uses fresh exact-main evidence instead of
inheriting C3/C2's historical scanner diagnosis or failure counts.

## Independent review

[Independent report](OTR_CAPTURE_C3_CANONICAL_INDEPENDENT_REVIEW.md) records a
separate reviewer/source trace, independently regenerated union and byte checks,
12-file/178-test execution, full-suite identity/message audit and final handoff
reread against reviewed tree7ba6d0b5. Account context binds before database await;
repository transactions/list/reopen/lineage retain Account predicates and fresh
generation fences. Fresh A can reopen A, while stale A cannot regain authority
after A→B→A. Hide rejects stale publication without canceling durable intake.
No Core/Auth correction to the generic historical switch error was proposed.

Final handoff evidence is the only change after the runtime-tested tree; the two
new reports package these results without source/test drift. Reviewer reports
its own178 executed tests separately from audited Builder execution results.
No unresolved integration finding or runtime defect was identified.

## R3/device/Experience limits

`com.xoery.otrmobile.devtest` remains the shared future DEV test bundle.
`com.xoery.otrmobile` remains protected historical data under network quarantine.
No build/install/launch, device config, Keychain, container, SQLite, original
outbox replay/cleanup or bundle operation occurred. No Hosted access, R3 rebuild/
forward replay, SQL execution, provider call or gate activation occurred.

All six R3 limits remain: invalid synthetic PNG/incomplete useful-render proof;
unmeasured Account-switch latency; untested active-upload interruption/UNKNOWN
recovery; retained unsaved draft with unverified provenance; expected Settlement
ADJUSTMENT_REQUIRED; original-app quarantine/observation limits. Direct dormant
Keychain-item absence/adversarial transport denial remain unverified.

Latest C3 refined UI is accepted on synthetic Simulators only, not physical-device
accepted. The historical Account Switch error remains unresolved/unattributed;
accepted R3 devtest switching does not resolve it. Final Experience Activity/
Trip Home/newness/navigation shell remains separate. Shared maximum Dynamic Type
title clipping, actual VoiceOver speech and real provider fidelity remain
limitations. No new native/Simulator visual QA was performed in this integration.
Jobs remain Account-scoped with passive Trip prior; Ledger Trip choice is not
Job assignment. Processing remains NOT_INSTALLED; C4/C5/C9, Review/Banner,
Source/Run/Import/provider/canonical execution and startup gates remain CLOSED.

## Protected worktree observations

This task issued no source/index/HEAD/lifecycle writes to preexisting worktrees.
Before/after fingerprints sampled42 initially existing worktrees;40 remained
exact. Actual main, C2/C3 builders, Platform/R3 and Experience worktrees remain
exact. The following unrelated workspace changes were observed during this
execution and were not restored or incorporated:

- The clean CP13A worktree
  `/Users/xoery/.codex/worktrees/cp13a-flight-admission/otr-mobile-canonical`
  was no longer present in the final inventory. This task did not remove it.
- Two new P2 worktrees appeared:
  `/Users/xoery/.codex/worktrees/p2ba-c2-c4a-adapter/otr-mobile-canonical` and
  `/Users/xoery/.codex/worktrees/p2bb-snapshot-contract/otr-mobile-canonical`.
  This task did not create or modify them.
- In the chat's older canonical checkout, the transient empty
  `.watchman-cookie-iMac.local-812-8812` disappeared. Reconstructing its zero-byte
  entry reproduces the exact before content digest, proving every other tracked/
  nonignored untracked file unchanged. HEAD/index remain exact. No task-owned
  file edit occurred there.

Thus a blanket all-worktrees-unchanged claim would be false. Evidence preserves
these observations in protected-before/after/comparison.json and
watchman-cookie-comparison.json. No concurrent work enters the prepared tree.
The fetch/worktree/merge/staging metadata belongs to this authorized task;
branches main/origin/main remain pinned. No user work was cleaned/reset/restored.
Fingerprinting excludes ignored dependencies/native/private artifacts and does
not attest unrelated device/process activity.

## Full first-parent staged diff inventory

21 paths: accepted19 C3 integration paths plus the two new integration reports.
No rename/deletion, runtime/test adaptation, migration or config path addition.

```text
M	app/(tabs)/capture.tsx
M	docs/CURRENT_IMPLEMENTATION_STATE.md
A	docs/architecture/OTR_CAPTURE_C3_ACCOUNT_SWITCH_RECHECK.md
A	docs/architecture/OTR_CAPTURE_C3_IMPLEMENTATION_REPORT.md
A	docs/architecture/OTR_CAPTURE_C3_INDEPENDENT_REVIEW.md
A	docs/architecture/OTR_CAPTURE_C3_OWNER_DEVICE_GATE_REPORT.md
A	docs/architecture/OTR_CAPTURE_C3_SIMULATOR_QA_UX_REPORT.md
A	src/data/operations/defaultCaptureSubmission.test.ts
M	src/data/operations/defaultCaptureSubmission.ts
A	src/data/repositories/captureAutonomousQa.test.ts
M	src/data/repositories/captureSubmissionRepository.test.ts
M	src/data/repositories/captureSubmissionRepository.ts
A	src/features/capture/CaptureActivity.tsx
M	src/features/capture/CaptureContent.test.ts
M	src/features/capture/CaptureContent.tsx
A	src/features/capture/captureAccountSwitchRecheck.test.ts
A	src/features/capture/captureActivityLifecycle.test.ts
M	src/features/capture/captureLifecycle.test.ts
M	src/ui/catalogs.ts
A	docs/architecture/OTR_CAPTURE_C3_CANONICAL_INDEPENDENT_REVIEW.md
A	docs/architecture/OTR_CAPTURE_C3_CANONICAL_INTEGRATION_REPORT.md
```

## Evidence and stop boundary

Evidence directory: `/private/tmp/otr-c3-integration-evidence-20261008`.
It contains targeted/terminology/static/build/format logs, both serial JSON/logs,
source manifests, raw/stable identity/failure comparison, Builder/independent
preservation, protected fingerprints and final-manifest.json. Original accepted
C3 reports are exact; this evidence contains no copied device/Hosted data or
credentials. Temporary evidence is not a permanent backup.

Prepared staged merge is concrete and independently reviewed, with the existing
whole-suite scanner failure disclosed and no new failing case. Owner Review is
required before any separately authorized commit/publication. Re-fetch and
reverify exact main before any future promotion; a moved parent requires updated
reconciliation. No Hosted/device/provider/activation step follows from this report.

**NO COMMIT / NO PUSH / NO MAIN ADVANCEMENT.**

**STOP — C3 INTEGRATION PREPARED FOR OWNER REVIEW.**
