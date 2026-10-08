# Platform P2b canonical integration preflight

Date: 2026-10-09 (Pacific/Auckland).

**Status: PREPARED — OWNER REVIEW REQUIRED.** This is an uncommitted integration
candidate, not canonical publication or runtime acceptance.

## Verified provenance

| Ref / input                             | Exact SHA / result                         |
| --------------------------------------- | ------------------------------------------ |
| Local `main`                            | `f7115dc288aff7f0a252bf80f53b0f2b626a7534` |
| Local `origin/main`                     | `f7115dc288aff7f0a252bf80f53b0f2b626a7534` |
| Remote `refs/heads/main`                | `f7115dc288aff7f0a252bf80f53b0f2b626a7534` |
| Accepted SQLite52 closure               | `138b55c40f39ed4776b9e2692309cf4a4dcb35a2` |
| Accepted Publication Membership closure | `de370fac0b69cd714319595dbdadfac25bd10bd7` |
| Parent of **each** accepted closure     | `f7115dc288aff7f0a252bf80f53b0f2b626a7534` |

Remote verification used read-only `git ls-remote origin refs/heads/main` after
sandbox DNS failed; the permitted retry succeeded. No fetch, push or ref update.
Both closures are ordinary single-parent sibling commits; neither is an ancestor
of the other. SQLite52 is already committed: the missing-prerequisite stop does
not apply. Both Builder worktrees were clean at verification. Their accepted
handoffs record Owner acceptance and scoped local closure authorization.

The starting chat checkout is the older, dirty `intelligence/deferred-apple`
worktree at `c4571746b0c300fa3b46842cd37745963567338c`, not current main. Its
unrelated work was not used as integration input or changed. A report-only copy
is delivered there for access; the integration candidate lives separately.
The main checkout also retains its unrelated untracked Hosted provisioning report.

## Isolated candidate and integration method

Fresh managed worktree:
`/Users/xoery/.codex/worktrees/platform-p2b-canonical-preflight/otr-mobile-canonical`.
It remains detached at exact canonical base `f7115dc`; no new commit exists.

1. Apply the exact SQLite52 parent-to-closure binary diff with `git apply --index`.
2. Apply the exact Publication Membership parent-to-closure binary diff with
   `git apply --3way --index`.
3. Resolve the single shared handoff conflict by retaining both accepted sections
   verbatim and adding current combined facts above them.
4. Adapt the Publication test's final registry expectation from51 to52, plus its
   matching fixture comment/test title. Retain every missing-column/no-write and
   historical-catalog assertion. No production integration edit is necessary.
5. Validate the combined tree and leave it staged/uncommitted for Owner review.

This patch rehearsal preserves both accepted Git commits and every review/ADR/
contract/report byte. It is not a merge commit and has no pending MERGE_HEAD.
Proposed future strategy, subject to separate Owner authorization: two ordinary
`--no-ff` merges on an isolated branch from freshly reverified canonical main,
SQLite52 first and Publication Membership second. That retains both input SHAs
in ancestry; include the handoff resolution and test adaptation in the second
merge. Do not squash, rebase or rewrite either accepted closure. Ref movement,
merge commits and push remain unauthorized in this preflight.

## Exact accepted changed-file scopes

SQLite52: **19 paths**, including the final accepted handoff and the original
review plus appended R1/R2 Targeted Recheck PASS.

- `docs/CURRENT_IMPLEMENTATION_STATE.md`
- `docs/adr/2026-10-08-p2bb-minimal-assessment-observation-store.md`
- `docs/architecture/OTR_PLATFORM_P2BB_SNAPSHOT_PERSISTENCE_CONTRACT.md`
- `docs/architecture/OTR_PLATFORM_P2BB_SQLITE_PERSISTENCE_BUILDER_PLAN.md`
- `docs/architecture/OTR_PLATFORM_P2BB_SQLITE_PERSISTENCE_BUILDER_REPORT.md`
- `docs/architecture/OTR_PLATFORM_P2BB_SQLITE_PERSISTENCE_INDEPENDENT_REVIEW.md`
- `src/data/db/checkpoint11Integration.test.ts`
- `src/data/db/database.test.ts`
- `src/data/db/migrations.ts`
- `src/data/db/migrations/captureBatchAssessmentObservations.ts`
- `src/data/foundation/diagnosticsReadOnly.test.ts`
- `src/data/repositories/captureAutonomousQa.test.ts`
- `src/data/repositories/captureBatchAssessmentObservationRepository.test.ts`
- `src/data/repositories/captureBatchAssessmentObservationRepository.ts`
- `src/data/repositories/captureSubmissionRepository.ts`
- `src/data/repositories/intelligenceContinuationRepository.test.ts`
- `src/data/repositories/tripCanonicalEventRepository.test.ts`
- `src/domain/capture/batchAssessmentObservation.test.ts`
- `src/domain/capture/batchAssessmentObservation.ts`

Publication Membership: **11 paths**, including its original review and appended
F1–F3 targeted PASS.

- `docs/CURRENT_IMPLEMENTATION_STATE.md`
- `docs/adr/2026-10-08-complete-publication-membership.md`
- `docs/architecture/OTR_PLATFORM_PUBLICATION_MEMBERSHIP_BUILDER_REPORT.md`
- `docs/architecture/OTR_PLATFORM_PUBLICATION_MEMBERSHIP_INDEPENDENT_REVIEW.md`
- `docs/architecture/OTR_PLATFORM_PUBLICATION_MEMBERSHIP_MIGRATION_DESIGN.md`
- `src/data/api/tripPublicationMembershipContracts.ts`
- `src/data/interpretation/flightInterpretation.ts`
- `src/data/repositories/captureSourceAdmissionRepository.ts`
- `src/data/repositories/tripImportAdmissionRepository.ts`
- `src/data/repositories/tripPublicationMembershipRepository.test.ts`
- `src/data/repositories/tripPublicationMembershipRepository.ts`

The exact scopes intersect only at `docs/CURRENT_IMPLEMENTATION_STATE.md`.
There are **no production-code textual conflicts**. Shared behavioral surfaces
are preserved together: SQLite52 uses the extracted full C2 transaction-local
reader (including immutable Input roster verification); Membership retains the
Import transaction store, scoped complete Input digest/ancestry checks and Source
binding store with active-transaction/Account/Trip guards. The Flight digest
algorithm remains unchanged; its accepted type widening is retained. No nested
public repository transaction, permissive validator or wholesale side selection
was introduced. Combined regressions exercise both sets of changes on52.

The original Membership handoff's pending52/SQLite51 statements are explicitly
marked as historical by the combined preflight section. Its accepted evidence is
preserved rather than silently rewritten; the active combined registry is52.

## Exact proposed diff and preservation

Against `f7115dc`, the candidate before this new report is **29 paths,
5,608 insertions /382 deletions**. The final scoped candidate adds this report as
its30th path. All production paths match their accepted closure bytes exactly.
Only the shared handoff and the three-line Membership test adaptation differ
from the accepted union.

Evidence directory: `/private/tmp/otr-platform-p2b-preflight-evidence/`.

- `accepted-manifest.json`: both exact parents, per-path SHA-256 fingerprints and
  input patch SHA-256 values; the two full accepted binary patches are retained.
- `proposed-integration.patch`: exact29-path candidate before the new report;
  SHA-256 `529e199b94659ba4dfa21a8fc19eb13ba278961bc2c6505912d30dc564204cc8`.
- `proposed-integration.diffstat`: exact line counts for those29 paths.
- `file-preservation.json`: **27 of29 union paths byte-identical** to their accepted
  closure, the two explicit adaptations above, and **1,229 base tracked paths**
  outside the accepted scopes byte-identical to canonical base.
- **89 external historical SQLite/server migration files** are byte-identical.
  Both original independent reviews, appended rechecks, Builder reports, contracts,
  design/plan and ADRs are included in the exact-byte preservation assertion.

`git diff --cached f7115dc` reviews the staged final candidate directly.
No feature, endpoint, package, configuration, startup, scheduler or UI wiring was
added beyond the accepted diffs. Installed dependencies were reused temporarily;
no installation, lockfile change or provider configuration occurred.

## Schema and dormancy verification

The migration self-check evaluates the exact base registry and combined registry:
all prior51 `{id,name,sql}` objects compare equal; IDs are exactly contiguous1–52.
Their JSON SHA-256 is
`b48136d3c787308f8588e392f047265e08b572e9469fbabef9a3a44075d8e982`, matching
accepted review evidence. The sole new registration is SQLite52
`capture_batch_assessment_observations`; its source equals the accepted closure.
SQLite53 is unallocated and no historical migration is modified.

Disposable local SQLite FK ON/OFF checks install1–52, observe the empty observation
table/four guards, zero FK violations, and **no `publication_membership` column on
`trip_source_runs`**. Membership installation/read therefore reject with
`PUBLICATION_MEMBERSHIP_SCHEMA_UNAVAILABLE`; installation rejects before writing
catalogs. Existing Import catalog application/closure reads remain available.
The adapted missing-column test executes the real combined52 registry without
virtual column admission and passes these checks.

Factory/caller searches across app/src/backend find the dormant observation,
Membership repository and CLOSED reader definitions only outside tests; no runtime
factory composition is installed. SQLite52 registration is the intentional startup
schema effect. The future publication-column simulation remains TEST-ONLY and
provides no actual migration/guard/file-durability acceptance. SQLite52 observations
and historical replay confer no current publication or canonical-write authority.

## Combined validation

**Final combined matrix:23 files /937 tests PASS**, including all39 Membership
tests and accepted C2/C4a/SQLite52/Import/Account/Continuation regressions.

| Check                                                      | Result                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| Typecheck (`npm run typecheck`)                            | PASS                                                                      |
| Lint including mandatory UI guard (`npm run lint`)         | PASS;80 representative files,473 retained legacy occurrences              |
| Backend local bundle (`npm run backend:build`)             | PASS; no server launched                                                  |
| All changed-path formatting                                | PASS (30 scoped paths)                                                    |
| Full repository formatting                                 | 28 pre-existing warnings; every path is exact unchanged `f7115dc` content |
| Whitespace / unresolved index conflicts                    | PASS; no unresolved entries                                               |
| Accepted production/history and out-of-scope preservation  | PASS as detailed above                                                    |
| Registry1–51 exact /52 sole addition /53 absent; FK ON/OFF | PASS                                                                      |

The initial combined run was **23 files /937 tests:936 PASS,1 FAIL** solely because
Membership expected terminal registry51. After the narrow adaptation its39 tests
passed. The final combined result below is a fresh run, not summed rerun counts.

The final combined matrix uses `vitest run --configLoader runner --cache=false
--maxWorkers=1 --no-file-parallelism` and these23 files:

```text
src/domain/capture/batchAssessmentObservation.test.ts
src/data/repositories/captureBatchAssessmentObservationRepository.test.ts
src/domain/capture/batchAssessment.test.ts
src/data/repositories/captureSubmissionRepository.test.ts
src/data/repositories/localCaptureInboxRepository.test.ts
src/data/db/database.test.ts
src/data/db/databaseConnection.test.ts
src/data/db/checkpoint11Integration.test.ts
src/data/auth/accountRequestContext.test.ts
src/data/foundation/diagnosticsReadOnly.test.ts
src/data/repositories/captureAutonomousQa.test.ts
src/data/repositories/intelligenceContinuationRepository.test.ts
src/data/repositories/tripCanonicalEventRepository.test.ts
src/data/auth/accountSwitchFoundation.test.ts
src/data/auth/accountSwitchCoordinator.test.ts
src/domain/capture/localCapture.test.ts
src/data/repositories/tripPublicationMembershipRepository.test.ts
src/data/repositories/tripImportAdmissionRepository.test.ts
src/data/interpretation/flightInterpretation.test.ts
src/data/interpretation/flightImportIntegration.test.ts
src/data/sync/syncEngine.test.ts
src/data/repositories/flightImportClosure.test.ts
backend/src/inboundAiClient.test.ts
```

Actual logs: `initial-combined-tests.log`, `publication-final.log`,
`final-combined-tests.log`, `typecheck.log`, `lint-ui.log`, `backend-build.log`,
`full-format.log`, `changed-format.log`; supporting schema and baseline assertions:
`verify-migrations.ts`, `migration-preservation.json`, `format-baseline.json`.
No global full-suite PASS or global formatting PASS is claimed. Historical
independent-review probes were not reaudited/repeated; delivered correction
regressions are included in the combined run.

## Remaining gates and owner decision

1. Owner review of this exact uncommitted30-path candidate, handoff resolution and
   narrow version52 test adaptation. Fresh ref verification is required before any
   later authorized canonical integration; no commit/push/main advancement here.
2. Publication migration allocation/implementation remains separately unauthorized.
   SQLite53 is not reserved by this report. Real fresh/upgrade/FK/guard/typed-row/
   atomic-failure/retry/file-reopen/lost-ACK acceptance remains pending.
3. Actual admitted authenticated private transport/session remains unprovisioned
   and unverified. Injected TEST-ONLY transport/column behavior is not Hosted or
   durable-schema evidence.
4. Real owning-data adapter, P2b-A corrections/composition, same-transaction complete
   C2/current publication validation, P2b-B NEW append integration and Continuation
   callback wiring require separate approval. Integrated C4, C5/C9, business,
   provider and runtime gates remain CLOSED.
5. Full-suite release readiness, native/device behavior and hardware-fault assurance
   were not tested. Existing accepted review limits remain unchanged.

No Hosted/device/provider operation, runtime activation, SQLite53 registration,
historical migration edit, Git commit, push or canonical main advancement occurred.

**STOP — PLATFORM P2B CANONICAL INTEGRATION / OWNER REVIEW REQUIRED.**
