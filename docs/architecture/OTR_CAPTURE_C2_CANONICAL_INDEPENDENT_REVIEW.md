# Capture C2 canonical integration independent review

Date: 2026-10-08 (Pacific/Auckland).

## Scope and exact parents

Independent integration review of the Owner-authorized ordinary no-commit merge in
`/private/tmp/otr-c2-canonical-integration-20261008` only. First parent/HEAD:
`56a7ab8f08ea973eb777fa00c8e6393057c1193c`; second parent/MERGE_HEAD:
`914e854cba7c2c97cfec7243047a06cadcc82c05`; common ancestor:
`b6daffecedab1616b173fde3f5e2de5d54770eff`.

The reviewer performed independent blob comparisons and clean-union reproduction,
read the shared runtime seams and schema51 constraints, inspected handoff semantics
and retained acceptance reports, and ran the focused checks below. This is not a
repeat device acceptance or authorization to promote main.

## Independent preservation checks — PASS

- All25 non-overlap accepted C2 paths match the accepted commit byte-for-byte,
  including every C2 runtime path except the necessarily combined catalog and all
  original C2 reports/ADR. No C3 runtime or other uncommitted source is incorporated.
- All42 canonical-only changed paths, excluding the specifically authorized
  diagnostics test adjustment, match canonical main byte-for-byte. This includes
  P4a production/auth/DB seams, C4a assessment, R3 closure and historical reports.
- Catalog and continuation test files exactly equal independently reproduced
  ordinary three-way clean merge outputs. Neither parent was selected wholesale.
  Accepted C2 message values and both locales retain the P4a Operations entries;
  continuation retains the three51 assertions and P4a SELECT-only terminal-FAILED
  regression.
- DiagnosticsReadOnly test equals canonical bytes with exactly the expected50→51
  substitution. Auth-adoption, read-only and zero SecureStore-write assertions
  remain unchanged. No product repair was introduced.
- All84 Server migration files and four extracted historical SQLite modules are
  exact across common ancestor, main, C2 and prepared worktree. Removing only the
  schema51 import and final registry entry reproduces the historical registry
  exactly. Thus all SQLite1–50 definitions remain exact; no Server85/SQLite52.
- Schema51 adds two local submission tables and additive indexes/triggers; its
  retention guards also protect bound originals with foreign keys disabled. That
  new runtime effect is intentional accepted C2 behavior, not a claim that51 is
  inert. P4a still reads only initialized DB/adopted identity and intake coverage
  remains UNAVAILABLE. C4a remains dormant; C2 processing is NOT_INSTALLED.
- The reconciled handoff preserves accepted C2 Owner/device scope and limits,
  P4a/C4a accepted facts, R3 CLOSED closure and old-device quarantine, historical
  vs fresh evidence distinctions, and the Owner-review stop. No Hosted/device
  acceptance or provider authority is inferred from local integration.

Reproducible independent preservation evidence:
`/private/tmp/otr-c2-integration-evidence-20261008/independent-preservation.json`.

## Fresh independent execution — PASS

Used the existing Vitest runner with `--configLoader runner --cache=false
--maxWorkers=1 --no-file-parallelism`. Local disposable SQLite fixtures only.

- Five files /242 tests PASS: captureSubmissionRepository,
  intelligenceContinuationRepository, diagnosticsReadOnly, localOperations and
  databaseConnection. Includes fresh/50→51 custody and FK ON/OFF protection,
  Account/recovery fences, combined continuation/P4a SELECT-only regression,
  schema51 diagnostics and initialized-DB read behavior.
- Two files /92 tests PASS: batchAssessment and accountRequestContext. Retains
  accepted C4a strict JSON/dormancy and Account generation boundaries.
- Independent `git diff --check` PASS at the inspected snapshot.

Logs: `independent-targeted.log` and `independent-gates.log` in the same external
integration evidence directory. Prior C2/P4a/C4a/R3 results remain retained
historical evidence and are not counted as these334 fresh independent tests.

## Fresh whole-suite comparison — independently checked

The reviewer independently parsed the completed fresh baseline and integration
Vitest JSON, compared failed test file/name identities and compared complete
failure messages after normalizing only the two disposable workspace root paths.

- Exact canonical baseline:217 files /2,818 tests;2,802 PASS,1 FAIL,15 SKIP.
- Prepared integration:219 files /2,864 tests;2,848 PASS,1 FAIL,15 SKIP.
- Zero new failed assertions. The one failure identity and complete normalized
  message are identical: `foundation architecture boundaries keeps UI and domain
modules away from direct data infrastructure` in `architectureBoundary.test.ts`.
  The current baseline scanner detects the `/@\/data\/sync/` test import in
  `src/components/LocalOperationsDiagnostics.test.ts`. This is actual current-main
  evidence, distinct from the historical C2 b6 staging-regex report.
- No global full-suite PASS is claimed; the pre-existing scanner failure remains
  outside this integration's authorized repair scope.

Evidence: `baseline-full.json` and `integration-full.json` in the integration
evidence directory. These are Builder-executed fresh whole suites independently
compared by the reviewer; the334 focused checks above were reviewer-executed.

## Findings and verdict

Zero remaining CRITICAL/IMPORTANT/MINOR integration findings in this scope.
**Independent focused integration review PASS.** Owner approval remains required;
this verdict does not claim a global suite PASS. The fresh exact-main/full integration comparison above establishes zero new
failures; the single existing baseline failure remains disclosed for Owner review.

No runtime edits, staging, commits, push, main advancement, Hosted access, R3
migration rerun, provider activation or device changes were performed by this
reviewer. Only this review document and task-scoped external evidence were written.

**STOP — C2 INTEGRATION PREPARED FOR OWNER REVIEW.**
