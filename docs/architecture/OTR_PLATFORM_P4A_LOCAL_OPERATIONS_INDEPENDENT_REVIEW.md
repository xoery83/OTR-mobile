# OTR Platform P4a — Independent Implementation Review

Date: 2026-10-08 (Pacific/Auckland).

**Verdict: PASS WITH REQUIRED CORRECTIONS.**
**Final Owner Review readiness: NOT READY for acceptance; correct F1–F4 and obtain a targeted independent recheck first.**

Zero CRITICAL, four IMPORTANT and two MINOR findings. No corrections were applied.
Passing tests establish the covered cases, not the unconditional read-only and
truthful-state guarantees: the independent negative scenarios below reproduce gaps.

## Provenance and scope

Reviewed `/private/tmp/otr-platform-p4a-local-operations`, branch
`codex/platform-p4a-local-operations`. HEAD and local main both equal the requested
exact base `b6daffecedab1616b173fde3f5e2de5d54770eff`; the Builder changes are
uncommitted. Read the original Builder report first and the P4 design in retained
`/private/tmp/otr-platform-p4-operations-design`, plus current state, mandatory
repository documents, UI foundation and terminology glossary. No legacy Web inspection.

Reviewed all 20 Builder files: 11 tracked modifications and nine new files.
Production review covers `localOperations.ts`, `useLocalOperations.ts`,
`LocalOperationsDiagnostics.tsx`, Foundation screen/reader/hook, database handle
and opener, Data Health reader, continuation reader, sync readers and catalogs.
Test review covers all five changed/new test files; documentation review covers
current state, ADR and Builder report. Direct dependencies were traced for auth,
Account gates, DB serialization, debug preferences, support aggregates and
continuation lifecycle/classification. Original production, tests, documentation
and Builder report were hash-checked and preserved.

No unintended new product/module, endpoint, scheduler, Job engine, dependency,
migration, server reader or provider capability was found. The Foundation changes
address an approved read-only prerequisite; they are not unrelated scope expansion.
Two inherited read paths still violate that prerequisite (F1/F2).

## Exact findings

### F1 — IMPORTANT — Diagnostic Account/session reads can write SecureStore

Locations: `src/data/foundation/foundationDiagnostics.ts:30` and `:38`;
`src/data/operations/localOperations.ts:288`; existing
`src/data/auth/authRepository.ts:23` and `authSessionRepository.ts:57`–71.

Both readers ultimately call `readLocalSession`. With a retained v1 session and no
usable active v2 session, that method calls `storeAccountSession`: it writes the
v2 session, writes the active Account index, and deletes the v1 session. The
independent fixture reproduced **two setItem calls and one deleteItem call** from
one session read. This is implicit session installation/migration, not a user auth
action; generation checks after it do not make it read-only. The Builder tests mock
auth and therefore miss this path. Normal successful startup usually consumes the
legacy session first; that narrows exposure but does not prove the promised “never”.

Required correction: diagnostic identity/session lookup must use a non-mutating
read boundary, or fail closed until startup has completed adoption. Preserve the
existing startup/auth migration behavior. Check both Foundation and Operations with
real repository logic and write-forbidden SecureStore fixtures.

### F2 — IMPORTANT — Screen debug preference lookup can open/migrate SQLite

Locations: `src/components/FoundationDiagnosticsScreen.tsx:26`–28;
existing `src/data/repositories/defaultLedgerReportingRepository.ts:6`–7.

On diagnostic focus in dev transport, the screen obtains the default reporting
repository, whose factory calls `openDatabase`, before reading Debug Mode.
The new initialized-only accessor protects the two observation readers but does
not protect this sibling path. With a cold opener, the actual preference factory
reproduced **one database open and one migration invocation**. `getPreferences`
itself uses SELECTs; its factory is the side effect. Usually bootstrap has already
opened the database, but the declared diagnostic fail-closed behavior is incomplete.

Required correction: read the diagnostic presentation preference through an
already-initialized handle, failing closed when missing. Add a screen/composition
cold-path check that forbids open/migrate, including when Debug Mode is off.

### F3 — IMPORTANT — Unknown older attempt state can produce AVAILABLE / SETTLED

Location: `src/data/repositories/intelligenceContinuationRepository.ts:1156`–1169.

Only the current attempt is schema-validated. The all-attempt SQL aggregate treats
unrecognized execution/install labels as false for the finite equality predicates.
A published task with a valid terminal installed current attempt and an older
non-shadow attempt with execution `UNRECOGNIZED`, meter `COMPLETE`, installation
`INSTALLED` reproduced **continuation AVAILABLE, task SETTLED, no operator attention**.
SQLite50 checks these columns as machine labels rather than closed enum membership,
so the database constraint is not a replacement for this validation.

Required correction: validate the finite responsibility fields of every contributing
non-shadow attempt, or explicitly detect unknown labels in the aggregate and withhold
that source/state. Do not load evidence or raw content. Extend corruption checks to
older attempts, including execution, installation and metering labels. The ordinary
older UNKNOWN/running/install/meter cases already retain responsibility correctly.

### F4 — IMPORTANT — Terminal FAILED attempt is classified ACTIVE with no attention

Location: `src/data/operations/localOperations.ts:194`–212.

The reader selects and validates `execution_outcome`, but the mapper never uses it.
A task still marked RUNNING whose current attempt is TERMINAL / FAILED, with COMPLETE
metering and NONE installation, reproduced **ACTIVE, execution TERMINAL, operator
attention false, automatic recovery NONE**. This combination can occur through the
existing repository: `observeAttempt` leaves the task disposition unchanged when a
terminal report has no response digest; later reevaluation changes it. Interruption
before reevaluation can retain the misleading display.

Required correction: reflect terminal current failure independently of the retained
task scheduling disposition. Without an owning retry-eligibility source, do not invent
retry authorization; show failure/attention with eligibility deferred or unknown.
Keep older UNKNOWN responsibility dominant. Add a real lifecycle regression from
terminal failed report through readback, including interruption before reevaluation.

### F5 — MINOR — Foundation refresh is not fenced against supersession or cleanup

Location: `src/hooks/useFoundationDiagnostics.ts:36`–50, `:52`–69.

The new Operations hook has active/sequence fencing; Foundation's exported refresh
has only a generation check. In the same Account generation, an older refresh can
overwrite a newer observation; it can also set state after effect cleanup. Independent
React-API mocks reproduced both. Foundation uses a mount effect and retains observations
on navigation blur. This is an inherited lifecycle gap, not a demonstrated cross-Account
leak; current generation fencing still rejects A→B→A results. Foundation refresh is
currently used by deliberate sign-in/out handlers, limiting ordinary exposure.

Correction: apply the existing active/supersession/focus pattern where Foundation
observations are published, and test same-generation overlap and cleanup. Do not
claim the Operations hook's cleanup guarantees for all Foundation observations.

### F6 — MINOR — Empty-state text appears even when no row source was readable

Location: `src/components/LocalOperationsDiagnostics.tsx:103`–105;
`src/ui/catalogs.ts`, `operations.empty`.

Rendering continuation DENIED and sync/dataHealth UNAVAILABLE with no rows still
shows “No rows in the available local sources.” The coverage labels remain visible,
so this is not an unqualified all-clear, but there are no available row sources to
support that empty observation. The qualification also omits denied sources.
Independent static rendering reproduced the message in this case.

Correction: show unavailable/denied observation wording when neither row source was
readable; reserve empty wording for an actual successful empty read. Preserve both locales.

## Verification of requested boundaries

| Review area                          | Independent result                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Changed files / scope                | All 20 files inspected; scope remains local P4a.                                                                                                                                                                                                                                                                                           |
| Strict read-only / hidden effects    | Queue, continuation and Health metadata SQL is SELECT-only. No wake/claim/resume/repair/meter/install/dispatch in the Operations read graph. F1/F2 prevent an unconditional no-write verdict for the composed diagnostics surface.                                                                                                         |
| Account isolation / races            | SQL binds owning Account; cached Trip actor absence denies the whole continuation source without IDs/counts. Apply gate, transaction and final context/generation assertions reject pending transitions and A→B→A. Operations active/sequence/focus fencing passes; Foundation limitation F5.                                              |
| Source coverage                      | Independent source failures do not suppress other readers; 51st observation signals LIMITED. Intake, semantic Review and server/provider remain unavailable. Older-attempt corruption F3 and empty wording F6 remain.                                                                                                                      |
| Six classifications / responsibility | Covered six-state cases pass; old UNKNOWN survives published/pass-complete/queue-complete and shadows are excluded. Current terminal failure gap F4. No queue-completion-to-provider-success inference.                                                                                                                                    |
| Usage / cost / time                  | Nullable counters and UNKNOWN/ESTIMATED/ACTUAL_REPORTED preserved. Local cost amount/currency remain null/UNKNOWN. No invented zero billing, ETA, percentages or age thresholds; only valid nonfuture DEVICE_WALL observations admit age.                                                                                                  |
| Privacy                              | New SELECTs omit evidence, payloads, filenames, prompts, passengers, credentials and provider bodies. Finite failure mapping rejects inherited/arbitrary labels. Internal correlation IDs are not rendered. Existing device-support byte aggregates remain separate from Account Operations; they are not Account-isolated business facts. |
| Presentation / remote capability     | Screen mount requires DEV + dev transport + persisted Debug Mode; leaf/default reader independently reject non-DEV/wrong transport. Canonical controls/theme and both catalogs used. No new route/endpoint, remote source or provider activation.                                                                                          |
| Schema / policies                    | SQLite1–50 registry and four imported migration files, all 84 server SQL files and syncEngine match exact base byte-for-byte: 90 checked files, zero differences. No schema addition detected.                                                                                                                                             |

Explicit pre-existing DEV sign-in/out buttons remain deliberate user actions and
are not evidence that observation reads may write. No read-only audit is claimed
for unrelated application-wide startup/foreground sync owners.

## Executed local validation

- **Exact Builder matrix reproduced: 14 files / 275 tests PASS.** Files:
  `LocalOperationsDiagnostics`, `useLocalOperations`, `localOperations`,
  `foundationDiagnostics`, `databaseConnection`, `dataHealthCoordinator`,
  `dataHealthPresentation`, `syncOperationRepository`,
  `intelligenceContinuationRepository`, `accountRequestContext`,
  `accountSwitchFoundation`, UI `foundation`, `controls`, `coverage`.
- An initial independent matrix used `accountSwitchCoordinator` instead of
  `accountSwitchFoundation`: 14 files / 282 PASS. Counts overlap; do not add them.
- **Six additional reproduction scenarios completed** in five external fixture files:
  22 tests PASS, including 16 reused checks. These assertions deliberately verify
  the defective observed behavior; their passing status does not certify fixes.
  No original test was edited. Local evidence/config/results retained under
  `/private/tmp/otr-p4a-independent-evidence`.
- `npm run typecheck` PASS; `npm run lint` PASS, including UI guard:
  473 legacy occurrences / 79 representative UI files, no baseline update.
- Prettier check for all 20 Builder files PASS; review report formatting and
  `git diff --check` PASS. Original-file SHA-256 preservation: 20/20 unchanged.
- Tests used an existing-dependency temporary node_modules symlink, then removed it.
  No install. Original project Vitest config used `--configLoader runner` for the
  focused matrix. External fixtures used explicit local aliases. Initial external
  harness runs failed dependency/mock resolution; only the corrected successful run
  is counted, and those failures were not attributed to production.

Reproduce the six independent scenarios with installed dependencies available:

```sh
node_modules/.bin/vitest run --config /private/tmp/otr-p4a-independent-evidence/vitest.config.mts --configLoader runner
```

Results: `focused-results.json` and `negative-results.json` in that evidence directory.
No full suite, device/VoiceOver/Dynamic Type, Release build, SQL deployment or live
provider acceptance is claimed. No Hosted DEV/Production access, secrets lookup,
provider call, deployment, activation, commit or push occurred. Only this report
was added to the reviewed worktree; original implementation and Builder report remain intact.

## Final gate

**PASS WITH REQUIRED CORRECTIONS — Final Owner acceptance is blocked by F1–F4.**
A correction Builder should make narrowly scoped fixes and rerun the focused matrix
plus the six regression cases with corrected expectations. Independent recheck must
confirm the entire diagnostic open/refresh/close composition is read-only and the
failure/coverage outputs are truthful. F5/F6 should be resolved or explicitly
accepted as limitations before Final Owner Review; native presentation acceptance
remains separate. P4b/P4c and provider activation receive no authorization here.

**STOP — P4a INDEPENDENT REVIEW COMPLETE.**

## TARGETED RECHECK — Owner authorized P4a F1–F6 corrections

Date: 2026-10-08 (Pacific/Auckland).

**Targeted verdict: PASS. Ready for Final Owner Review: YES.**
This section supersedes the original correction-pending readiness verdict for the
reviewed corrected implementation. The entire original review above remains unchanged.

### Individual findings

| Finding | FIX VERIFIED | Independent evidence                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1      | **YES**      | Foundation and Operations now use `readAdoptedLocalSession` / `requireAdoptedUserId`. Legacy-only, missing indexed v2 and mismatched-identity cases fail closed without SecureStore set/delete. Real auth/SecureStore composition checks passed. Normal startup `readLocalSession` still adopts v1 with two writes and one delete; subsequent diagnostics reads adopted v2 without writes. |
| F2      | **YES**      | Screen focus uses `readDiagnosticsDebugMode`, which requires `readInitializedDatabase`; the normal reporting factory remains separate. Independent cold-preference reproduction rejected before open/migrate with both counters zero. Actual screen-focus regression covers missing handle and initialized Debug Mode OFF, with SQLite/SecureStore writes forbidden.                       |
| F3      | **YES**      | DISTINCT responsibility tuples for all contributing same-Account non-shadow attempts are validated against existing finite execution observation/outcome, installation and metering schemas before aggregation. Corrupt older labels with a healthy current attempt yield UNAVAILABLE and no continuation rows. Each finite field's negative case passed; corrupt shadows remain excluded. |
| F4      | **YES**      | Current TERMINAL/FAILED now produces TERMINAL_FAILURE and operator attention independently of retained RUNNING. Recovery is DEFERRED without retry admission. Both the independently adapted original scenario and actual reserve/observe lifecycle before reevaluation passed. Older UNKNOWN still overrides the current failure and authorizes no automatic recovery.                    |
| F5      | **YES**      | Foundation now uses focus, active, request sequence and Account generation guards, clears observations/errors on cleanup and disables captured refresh after cleanup. Same-generation supersession, late success/error, blur/unmount, foreground cleanup and A→B→A passed.                                                                                                                 |
| F6      | **YES**      | Successful empty wording requires a readable continuation or sync source. Data Health alone does not establish readable row coverage. English and Simplified Chinese render denial/unavailability separately across the tested coverage combinations; the original no-readable-source scenario no longer renders successful empty wording.                                                 |

### Scope and regression assessment

Remaining findings: **CRITICAL 0 / IMPORTANT 0 / required MINOR 0.**
All original F1–F6 findings are closed for this corrected snapshot.
**New regressions: NO detected** in the targeted source review and executed checks.

The correction delta stays within the diagnostic read boundary, finite mapper,
lifecycle fencing and localized coverage copy. No scheduler, Job engine, migration,
endpoint, dependency or provider capability was added. Normal startup/auth adoption
and normal reporting database initialization remain functional and separate.

P4 Operations remains DEV/dev-transport and persisted-Debug gated, memory-only and
Account-scoped. Read paths perform SELECTs and non-mutating session reads; no queue
wake/claim/enqueue, continuation resume, Health scan/repair, metering, installation
or dispatch was added. Existing explicit sign-in/logout retain their deliberate
user-action behavior. Account transaction/apply gates, pending-transition and
A→B→A fencing remain intact. Missing cached Trip actor denies continuation metadata
without IDs/counts; finite labels and rendered rows expose no evidence, filename,
prompt, passenger data, credential or cross-Account detail.

Nullable usage and independent observation quality remain unchanged; local cost
amount/currency stay null/UNKNOWN. Missing, denied, corrupt and bounded sources retain
explicit coverage. No ETA, completion percentage or fabricated zero/age is introduced.

### Independently executed validation

- **17 files / 297 tests PASS**, zero failures or skips: the exact correction matrix
  from the Builder report was independently rerun with the unchanged project config
  and `--configLoader runner`. Includes original Account isolation, continuation,
  Health, queue, UI and database regressions plus real diagnostic auth/composition
  and Foundation lifecycle checks.
- **Five external fixture files / 24 tests PASS**, zero failures or skips:
  independent copies of the original negative scenarios with corrected expectations,
  plus retained mapper/presentation checks and the new Foundation race harness.
  All six original defect scenarios now pass their corrected expectations.
  Original negative fixtures/results were preserved; normal startup adoption still
  writes intentionally in the independent F1 control case. Counts overlap with the
  297-test matrix and must not be added as unique coverage.
- `npm run typecheck` PASS; `npm run lint` PASS, including UI guard:
  **473 unchanged legacy occurrences / 79 representative UI files**.
- Changed/new-file Prettier checks PASS; appended report formatting and
  `git diff --check` PASS. No baseline/config weakening.
- **90-file exact-base preservation PASS**, zero differences: SQLite1–50 registry
  and its four imported migration files, Server1–84 SQL and syncEngine.
  HEAD remains `b6daffecedab1616b173fde3f5e2de5d54770eff`.
- Corrected implementation, tests and Builder report were hash-checked unchanged
  across this recheck. The original independent review's complete bytes remain an
  exact prefix, original SHA-256
  `0c3d28ed1a20ece3b5e77bc3bcea4b4d8e5bc1c2c7db54446c1772bbbe0bb8e0`.
  Only this append changes a reviewed worktree file. Existing dependencies were
  temporarily linked for execution; the link was removed afterward. No install.

Fresh local evidence is retained under `/private/tmp/otr-p4a-independent-evidence`:
`recheck-focused-results.json`, `recheck-negative-results.json`,
`recheck-before-hashes.json`, `recheck-original-review.md` and the runnable
`targeted-recheck/` fixture/config directory. The external fixture command is:

```sh
node_modules/.bin/vitest run --config /private/tmp/otr-p4a-independent-evidence/targeted-recheck/vitest.config.mts --configLoader runner
```

No full-suite or native/device/VoiceOver/Dynamic Type acceptance is claimed.
Native presentation remains for the Owner's separate acceptance; it does not block
submission to Final Owner Review. No commit, push, Hosted/Production access,
deployment, secrets lookup or provider call occurred. P4b/P4c and runtime/provider
activation remain outside authorization.

**Ready for Final Owner Review: YES.**

**STOP — P4a TARGETED INDEPENDENT RECHECK COMPLETE.**
