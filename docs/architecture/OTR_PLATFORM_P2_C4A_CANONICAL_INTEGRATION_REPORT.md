# Platform P2 Capture C4a canonical integration report

Date: 2026-10-08 (Pacific/Auckland).
**Status: PREPARED / STOP FOR OWNER REVIEW. No integration commit created.**

## Exact parents and provenance

Fresh isolated worktree: `/private/tmp/otr-c4a-canonical-integration-20261008`.
Branch: `codex/c4a-canonical-integration-20261008`.

| Identity                                                       | Exact commit                               |
| -------------------------------------------------------------- | ------------------------------------------ |
| First parent: accepted canonical P4a; current integration HEAD | `4f97bb6f96daaab7f96f19d192683f63846a413b` |
| Second parent: accepted C4a; pending MERGE_HEAD                | `f3c54c3dbeda1a0613fade89c560718231c83db6` |
| Common ancestor                                                | `b6daffecedab1616b173fde3f5e2de5d54770eff` |

`git fetch origin main` succeeded. Local `main`, refreshed `origin/main` and
`FETCH_HEAD` all matched the Owner's expected first parent before preparation.
Neither canonical nor remote-tracking main advanced during this work. No other
branch state was incorporated.

The accepted C4a source worktree was clean at exactly its accepted commit.
Its six-file scope was verified against the common ancestor. The complete original
Independent Review and appended TARGETED R1–R2 RECHECK PASS are present and copied
unchanged. The accepted C4a commit records 135 focused tests, 16 Builder checks,
25 independent checks and static validation PASS. Those historical review/script
counts are acceptance evidence; this integration freshly executes the smoke matrix
below and does not relabel that work as a new independent review.

Preparation used the ordinary Git operation:

```sh
git merge --no-ff --no-commit f3c54c3dbeda1a0613fade89c560718231c83db6
```

The integration branch remains at the first parent, with the accepted C4a commit
retained as MERGE_HEAD. No rebase, cherry-pick, squash, history rewrite, commit,
push or main advancement occurred. A future approved merge commit would have the
listed parents in that order.

## Comparison and semantic resolution

P4a changed 28 paths against the common ancestor; C4a changed six. Their only
intersection is `docs/CURRENT_IMPLEMENTATION_STATE.md`. Git reported a single
content conflict in that shared handoff. All other paths merged without conflicts.

The handoff now carries a current integration-preparation section, followed by
both accepted P4a and C4a checkpoint sections and the unchanged common remainder.
The retained local-closure wording in those sections records each accepted
checkpoint; the current integration section governs the next action: Owner review
before any integration commit. Both original acceptance sections remain present.

Exactly five of the six accepted C4a files are byte-identical to its commit.
The sixth is the explicitly authorized shared-handoff reconciliation. All 27
other P4a changed paths, including runtime code, tests, ADR and original
Builder/review histories, are byte-identical to accepted canonical P4a. No accepted
implementation or test bytes were edited to make the merge or tests pass.

Against the first parent, the intended staged delta contains exactly seven paths:

- `docs/CURRENT_IMPLEMENTATION_STATE.md` — semantic reconciliation and integration handoff.
- `docs/architecture/OTR_PLATFORM_P2_C4A_IMPLEMENTATION_REPORT.md` — unchanged accepted C4a Builder history.
- `docs/architecture/OTR_PLATFORM_P2_C4A_INDEPENDENT_REVIEW.md` — unchanged original review and appended targeted PASS.
- `src/domain/capture/batchAssessment.ts` — unchanged accepted pure module.
- `src/domain/capture/__fixtures__/batchAssessment.ts` — unchanged synthetic fixtures.
- `src/domain/capture/batchAssessment.test.ts` — unchanged accepted regression tests.
- This integration report — new preparation evidence.

All conflicts are resolved and staged. There are no new dependencies, configuration
changes, source fixes or unrelated cleanup in the integration delta.

## Dormancy and boundaries

Caller/import inspection outside tests finds only the module's declaration and
its test-fixture type reference. P4a does not call the assessment, and no runtime
composition was added. The built Backend bundle contains no assessment function.

C4a remains strict JSON-text deterministic pure assessment. Caller-provided
INDEPENDENT assertions retain DEPENDENCY_UNKNOWN; provisional observations never
clear unproven closure. Preparation and domain admission remain NOT_AUTHORIZED,
and mature actionable attention remains false. No C4a scheduler, Job engine,
Source/Run publication, CP13A preparation or C5 domain writer is added.

P4a remains the accepted Debug-gated read-only local Operations/Account projection,
with its existing current identity/focus fences and operational metadata limits.
The two slices are present in one pending tree without adding an adapter between
them or claiming durable Capture integration.

## Fresh bounded integration validation

| Check                                                                   | Result                                                                                 |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| C4a + local Capture + CP13B Review + sync denials                       | 4 files /135 PASS                                                                      |
| Accepted P4a Operations/Foundation/Auth/Account/UI regression matrix    | 17 files /297 PASS                                                                     |
| Combined smoke run                                                      | **21 files /432 PASS**, zero failures or skips                                         |
| `npm run typecheck`                                                     | PASS                                                                                   |
| `npm run lint`, including UI guard                                      | PASS; 473 existing legacy occurrences, 79 representative UI files                      |
| `npm run backend:build`                                                 | PASS; local ignored bundle only                                                        |
| Prettier across both accepted path sets, handoff and integration report | PASS                                                                                   |
| Staged whitespace, delivered-file whitespace and conflict resolution    | PASS                                                                                   |
| Accepted parent byte preservation                                       | 27 P4a paths + 5 C4a paths identical; only shared handoff reconciled                   |
| First-parent tracked tree verification                                  | 1,198 files checked; 1,197 identical, only shared handoff differs                      |
| Migration/registry-related preservation against common ancestor         | 90 files identical, including all 84 Server SQL files; syncEngine separately identical |

Focused test commands (executed together in one bounded Vitest run):

```sh
npm run test -- --configLoader runner --cache=false \
  src/domain/capture/batchAssessment.test.ts \
  src/domain/capture/localCapture.test.ts \
  src/domain/trip/flightImportReview.test.ts \
  src/data/sync/syncEngine.test.ts \
  src/components/LocalOperationsDiagnostics.test.ts \
  src/hooks/useLocalOperations.test.ts \
  src/hooks/useFoundationDiagnostics.test.ts \
  src/data/operations/localOperations.test.ts \
  src/data/foundation/foundationDiagnostics.test.ts \
  src/data/foundation/diagnosticsReadOnly.test.ts \
  src/data/auth/authRepository.test.ts \
  src/data/db/databaseConnection.test.ts \
  src/data/health/dataHealthCoordinator.test.ts \
  src/data/health/dataHealthPresentation.test.ts \
  src/data/sync/syncOperationRepository.test.ts \
  src/data/repositories/intelligenceContinuationRepository.test.ts \
  src/data/auth/accountRequestContext.test.ts \
  src/data/auth/accountSwitchFoundation.test.ts \
  src/ui/foundation.test.ts \
  src/ui/controls.test.ts \
  src/ui/coverage.test.ts
npm run typecheck
npm run lint
npm run backend:build
```

The matrix covers the unchanged C4a dependency/wire boundary, complete coverage,
human decisions and unconditional C denials together with accepted P4a read-only
Operations/Auth/Account lifecycle regressions. No new tests were written for a
documentation-only conflict resolution. Existing dependencies were temporarily
linked locally; runner config loading and disabled test cache avoided dependency
writes. No install occurred, and the link is removed from the delivered tree.

No baseline failures were observed in the executed checks. No full-suite, SQL
execution/deployment, Hosted, native/device, live-provider or integrated Capture
runtime acceptance is claimed. Backend build is a local compilation check, not
an activation or deployment.

## Preservation and remaining gates

Protected HEAD/content fingerprints stayed unchanged for canonical main, accepted
C4a source, P2 preflight, Capture C2, R3, P4 design and P4a builder. The canonical
checkout's pre-existing untracked provisioning report was not edited, staged or
copied into this worktree. No writes were issued to other active worktrees.
Fingerprint checks exclude ignored artifacts and cover Git status, tracked diff
and untracked content/link targets. Evidence is retained at:

- `/private/tmp/otr-c4a-integration-delta.json`
- `/private/tmp/otr-c4a-integration-preservation.json`
- `/private/tmp/otr-c4a-integration-protected-before.json`
- `/private/tmp/otr-c4a-integration-protected-after.json`

SQLite and Server migration history remain unchanged; no SQLite52/Server85 or
other migration was introduced. The accepted C4a limitations remain: trustworthy
original custody, current Account authorization/generation, continuation ancestry
and authoritative Run publication membership require their later owning adapters.
P4a acceptance does not supply those adapters or new evidence/Review authority.
Durable C4, C5 admission, P4b/P4c, Hosted dependencies and provider activation stay
separately gated.

**STOP — C4a CANONICAL INTEGRATION PREPARED / READY FOR OWNER REVIEW.**

## Final Owner closure authorization — 2026-10-08

Current Owner message: **FINAL OWNER AUTHORIZATION — P2/C4a CANONICAL INTEGRATION
CLOSURE**. The prepared seven-path scope, exact first/second parents and both
accepted checkpoint sections were verified again. All accepted runtime/test and
original independent review/recheck bytes remain unchanged; the recorded 432-test,
typecheck, lint/UI guard and Backend-build evidence therefore remains applicable.
This section and the current integration handoff record current Owner acceptance;
preparation/review text above retains its historical meaning.

Exactly one ordinary two-parent merge commit is authorized with message
`feat(intelligence): integrate pure capture assessment`. Safe main fast-forward
requires both local and freshly fetched remote main to remain at the first parent
and preservation of unrelated canonical files. Normal non-force push requires the
bounded post-merge C4a/P4a/Account tests, typecheck, lint/UI guard and Backend build
to pass. Final closure is confirmed by identical local main, origin/main and GitHub
main SHAs. An unexpected movement, staged change or test failure requires stopping
before promotion/push. No separate source modification or expanded runtime scope
is authorized.
