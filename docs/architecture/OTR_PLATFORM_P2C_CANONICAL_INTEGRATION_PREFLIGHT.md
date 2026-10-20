# P2c Composer Canonical Integration Preflight

Date: 2026-10-09 (Pacific/Auckland).

**READY for Owner review of dormant-code canonical integration.**
The proposed merge remains uncommitted in an isolated worktree; canonical main
is unchanged. This report grants no runtime or Hosted/device authority.

## Verified source and accepted ancestry

Local main, origin/main and actual remote main match exactly
`ad52275c00ea0d0e2cdd956e6c86eeecfc3fe28d`.
Remote verification used read-only `git ls-remote origin refs/heads/main`; no fetch
or remote mutation. The primary checkout's unrelated existing work was not modified.

Accepted P2c closure: `a2ad2ef708ebcc635c0c94e9e726bdad99751aab`.
Sole parent: `094cf3beb6b05f2a7f1c8cca1fa007ed630651c4`.
Title: `feat(platform): add dormant integrated capture assessment composer`.
Exactly12 accepted paths verified from the committed tree. Its final Owner handoff,
Builder F1 correction, original Independent Review and appended F1 Targeted Recheck
PASS are retained. This closure is not already an ancestor of current main.
Merge base is its exact parent094cf3b.

Verified accepted ancestors of current main:

| Slice                                       | Accepted ancestor                                         |
| ------------------------------------------- | --------------------------------------------------------- |
| C2 /SQLite51                                | `914e854cba7c2c97cfec7243047a06cadcc82c05`                |
| SQLite52 immutable Assessment history       | `138b55c40f39ed4776b9e2692309cf4a4dcb35a2`                |
| SQLite53 trusted Publication Membership     | `792141a864b2c2687092789a1f67c36afe43336e`                |
| P2b-A dormant Adapter                       | `094cf3beb6b05f2a7f1c8cca1fa007ed630651c4`                |
| Authenticated Publication Transport closure | `afcb69c446a9538b71791a65180c00315fe0eef3`, parent7273ac0 |
| Transport canonical integration             | Current main `ad52275c00ea0d0e2cdd956e6c86eeecfc3fe28d`   |

Mandatory architecture/current-state documents were loaded during the accepted
Composer work. Main's only changes to those mandatory sources are API/current-state;
both updated contracts and accepted Transport integration evidence were audited here.
No legacy Web, Hosted or device inspection was needed.

## Merge preparation and actual conflict

Fresh isolated candidate:
`/Users/xoery/.codex/worktrees/p2c-canonical-integration-preflight/otr-mobile-canonical`.

Executed `git merge --no-ff --no-commit a2ad2ef708ebcc635c0c94e9e726bdad99751aab`.
HEAD remains verified main. MERGE_HEAD remains the exact accepted P2c closure.
A separately authorized future merge commit must preserve those two parents in
that order; no cherry-pick, squash, rebase or closure rewrite is proposed.

Exactly one actual conflict: `docs/CURRENT_IMPLEMENTATION_STATE.md`.
Resolution retains both branches' complete inserted Transport and Composer sections
verbatim, with their identical P2b-A/shared historical body once. A short current
integration handoff was prepended. Historical pending/closed labels remain visible;
current readiness comes from the new integration section and this report.

`docs/API_CONTRACT.md` auto-merged without conflict. It is exactly main's API text
plus the accepted34-line Composer block; no Transport cancellation/API text changed.
No source, fixture, test, migration or configuration conflict or compatibility edit
was necessary.

## Exact proposed integration scope

Relative to verified main: the accepted12 P2c paths, including combined API/handoff,
plus this report: **13 paths total**.

1. `src/data/operations/captureBatchAssessmentComposer.ts`
2. `src/data/operations/captureBatchAssessmentComposer.test.ts`
3. `src/data/repositories/captureBatchAssessmentAdapter.ts`
4. `src/data/repositories/captureBatchAssessmentAdapter.test.ts`
5. `src/data/repositories/__fixtures__/captureBatchAssessment.ts`
6. `src/data/repositories/captureBatchAssessmentObservationRepository.ts`
7. `docs/architecture/OTR_PLATFORM_P2C_INTEGRATED_C4_COMPOSER_PREFLIGHT.md`
8. `docs/architecture/OTR_PLATFORM_P2C_COMPOSER_BUILDER_REPORT.md`
9. `docs/architecture/OTR_PLATFORM_P2C_COMPOSER_INDEPENDENT_REVIEW.md`
10. `docs/adr/2026-10-09-p2c-dormant-integrated-c4-composer.md`
11. `docs/API_CONTRACT.md`
12. `docs/CURRENT_IMPLEMENTATION_STATE.md`
13. `docs/architecture/OTR_PLATFORM_P2C_CANONICAL_INTEGRATION_PREFLIGHT.md`

All10 non-shared P2c files are byte-exact to the accepted closure. All main paths
outside the original12-path scope remain byte-exact to main, including every
Transport source/test/ADR/report/review and all SQLite1–53 migration/registry bytes.
The shared API and handoff are exact unions of accepted sections. Original reviews
and targeted rechecks were not rewritten. No temporary probe, dependency symlink,
generated Backend bundle or unrelated primary-checkout file is proposed.

## Transport, Membership, Account and Composer boundary audit

Transport remains accepted dormant code, not a production publication service.
Its explicit read freezes the original Account/generation/Trip context, bounds
token/network/body/parse work, rejects ambiguous original JSON/invalid provenance
and fences late results. The optional original AbortSignal remains retained on
the CLOSED admitted handle and checked during Membership install and at the actual
pre-COMMIT boundary. The merged Membership implementation is byte-exact to main.

Network must finish before SQLite install. The original-context admitted handle
is checked by the same-connection Import/Membership stores under the existing
Account apply gate. There is no network in that transaction. Signal cancellation
during admission rolls back; Account generation changes deny stale callbacks.

The Composer continues to accept original Account/generation with empty Job Trip
scope. Its Adapter derives publication Trip scope from that same original context;
it does not recapture generation to rescue an obsolete observation. Current Capture,
Trip, Source/material, Run/Input/Candidate/Representation and complete trusted
Membership are reloaded by existing transaction-local owners inside SQLite52 NEW
append. Private WeakMap seals remain bound to exact whole observed content and
discovery/absence, not just finding-bearing rows.

A future authorized caller must carry the same original Account/generation while
deriving the appropriate Trip-scoped network and Account-scoped Job contexts.
This merge adds no such caller or lifecycle bridge. Local Composer can operate
without Transport when trusted Membership is already installed; absence/staleness
continues to be UNKNOWN or fail-closed according to the accepted owning contracts.
No current server permission or live Publication is required for historical recovery.

SQLite52 still owns final Account-gated transaction, revision+digest CAS, exact
canonical body replay, chain verification and synchronous NEW activity checks
before INSERT/pre-COMMIT. Durable head+1 digest/C4a recomputation, latest complete
logical UNCHANGED and A→B→A history retain accepted bytes. Unknown append outcome
continues to return only its receipt and blocks NEW pending exact resolution.
Recovery validates immutable C2 Account/Batch/Job before conclusive outcomes;
current Trip/Capture/Source authority loss does not revoke historical integrity.
No migration, replacement journal, retry loop or mutable head was added.

C2 Job/intake and SQLite50 Continuation remain separate durable owners. C3 still
renders real C2 processing facts independently of C4. The historical projection
is not wired to C3 UI, navigation, subscriptions or notifications.

## Combined validation

**39 suites /1,206 tests PASS**, zero failures/skips,58.22s.
Command: `npx vitest run <39 selected paths> --configLoader runner --cache=false
--maxWorkers=1 --no-file-parallelism`.

The matrix is the accepted35-suite Transport integration matrix plus Composer,
defaultCaptureSubmission, flightImportIntegration and captureActivityLifecycle.
It covers Composer54, Adapter38, C2, C4a/body, SQLite52, SQLite53/Membership,
complete Publication/Transport, bounded API/Auth/token handling, Account generation/
switch/local state/bootstrap, Import/flight, Capture custody, Continuation,
database serialization and sync dispatch. No source/assertion/timeout changes or
rerun were needed.

| Check                               | Result                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Combined focused regressions        | 39 suites /1,206 tests PASS                                               |
| Typecheck                           | PASS                                                                      |
| Full lint /UI guard                 | PASS;80 representative UI files,473 accepted baseline occurrences         |
| Backend build                       | PASS; compile-only2.1MiB local bundle, no server launch                   |
| Changed-file formatting             | All13 proposed paths PASS                                                 |
| Whitespace                          | Working/staged diff checks PASS                                           |
| Source/review/contract preservation | Accepted closure/main bytes and both handoffs verified                    |
| Merge/ref state                     | HEADad52275 /MERGE_HEADa2ad2ef; no unresolved conflict or ref advancement |

The unchanged collection stress test that previously timed out in Transport
preflight passed in this combined run. Prior evidence remains unchanged; this
run does not certify native/physical concurrency or deployed SQL authority.

Local evidence:

- `/private/tmp/otr-p2c-integration-source-manifest.json`: refs/closure paths/main fingerprints.
- `/private/tmp/otr-p2c-integration-test-paths.json` and `.txt`: exact39 selected paths.
- `/private/tmp/otr-p2c-integration-regressions.log`.
- `/private/tmp/otr-p2c-integration-{typecheck,lint,backend-build,format}.log`.
- `/private/tmp/otr-p2c-integration-preservation-final.log`.

No full-repository test or global-formatting claim. Tests use accepted synthetic
fixtures/mocks and disposable SQLite; no Hosted/device/provider operation occurred.

## Remaining gates and Owner decision

| Gate                                                      | State                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Canonical integration commit                              | READY for separate Owner authorization of this exact13-path/two-parent proposal |
| Dormant Composer acceptance                               | Already accepted; no new contract delta or source compatibility decision        |
| SQL Principal/Driver and actual protected SQL observation | CLOSED/unprovisioned; no credentials or SQL role change                         |
| Hosted DEV/Production schema/ACL/route acceptance         | Not accessed; separate operational authorization                                |
| Native bounded streaming                                  | CLOSED; no native adapter/default buffered fallback certified or activated      |
| Native Composer persistence/physical faults               | Unverified; separately authorized native/device acceptance required             |
| Live Publication install and Transport runtime            | CLOSED; dormant code availability does not certify deployment                   |
| Experience/C3 rendering/navigation/notifications          | CLOSED; separate design and lifecycle integration required                      |
| Default factory/caller/startup/scheduler/worker           | None added; runtime activation remains separate                                 |
| C5/C9/providers/domain/business writes                    | CLOSED; historical assessment grants no admission authority                     |

Owner review concerns only canonical integration of accepted dormant code. Future
rollback disables any explicit Composer activation while preserving C2/SQLite52/53
history; this preflight creates no runtime to disable.

Not checked: full repository suite, native hardware/streaming/power loss, Hosted
or live SQL/Transport. No commit, push, merge into canonical main, ref advancement,
rebase, provisioning, runtime activation or business write was performed.

**STOP — P2c CANONICAL INTEGRATION PREFLIGHT / OWNER REVIEW REQUIRED.**
