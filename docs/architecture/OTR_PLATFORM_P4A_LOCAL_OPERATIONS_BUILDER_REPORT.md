# Platform P4a — Local Operations Builder report

Date: 2026-10-08 (Pacific/Auckland).
**BUILDER COMPLETE — STOP FOR INDEPENDENT REVIEW.**

## Scope and isolation

The Platform Owner accepted the P4 design and authorized only P4a. Fresh isolated
worktree `/private/tmp/otr-platform-p4a-local-operations`, branch
`codex/platform-p4a-local-operations`, retained HEAD and local main
`b6daffecedab1616b173fde3f5e2de5d54770eff`. Implementation started clean; existing
C2/P2/R3 checkouts were not edited. All changes remain uncommitted/unpushed.
The accepted design remains in the separate P4 design worktree; it was not rewritten
or turned into implementation authorization for P4b/P4c.

## Delivered

- Existing Foundation diagnostics mounts Local Operations only with `__DEV__`, DEV
  transport and persisted Debug Mode. The leaf component/default composition also
  deny non-DEV/wrong transport. No new route, Admin Portal or API endpoint.
- Finite waiting, active, recoverable-failure, UNKNOWN-outcome, terminal/stopped and
  settled classifications. Queue completion and current-pass completion are shown
  separately from unresolved older non-shadow execution/install/meter responsibility.
  Generic UNKNOWN sync errors are not uncertain provider execution proof.
- User semantic attention is known only from existing conflict/validation metadata;
  continuation Review attention stays unknown. Operator attention is separate.
  Completed sync rows do not revive retained historical failure/attention metadata.
- Data Health, SQLite50 and sync metadata have explicit AVAILABLE/LIMITED/DENIED/
  UNAVAILABLE coverage. Capture intake, semantic Review and server/provider coverage
  stay unavailable. No C2 Job table, provider capability or admitted-plan count is
  invented. Up to 50 observations per source; the extra row signals limited coverage.
- Nullable usage with UNKNOWN/ESTIMATED/ACTUAL_REPORTED quality is retained. Cost
  amount/currency stay null and quality UNKNOWN because no billing source is composed.
  Source timestamps are displayed; only recorded DEVICE_WALL provenance admits age.
  Queue timestamps have no retained clock provenance, so clock/age are unknown.
  Invalid/future/incomparable timestamps never produce zero age, ETA or stale threshold.
- The projection is component memory only, cleared on blur/unmount/Account transition.
  Current identity/generation fences include A→B→A and a pending transition. Overlapping
  refreshes and late callbacks cannot republish older data. Refresh is local; foreground
  reads use existing lifecycle signals without timers, polling or a second scheduler.
- Readers use SELECT inside the existing serialized transaction/Account gate. They
  read no payload, evidence, private document, provider body, credential or model
  content. Failure labels use an own-property finite map; unknown/inherited labels
  cannot enter the projection. Internal correlation IDs are not rendered or exported.

## Important source paths and boundaries

| Area                  | Files / change                                                                                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projection            | `src/data/operations/localOperations.ts`: read-only composition, finite mapper, partial coverage, clock/quality and Account fences                                                                                      |
| SQLite50 owner        | `src/data/repositories/intelligenceContinuationRepository.ts`: narrow operational metadata SELECT reader, all-attempt unresolved flags, current-attempt summary; no execution repository with dummy admission callbacks |
| Sync owner            | `src/data/sync/syncOperationRepository.ts`: metadata reader and pure pending count; existing listPending/scheduling behavior unchanged                                                                                  |
| Health owner          | `src/data/health/dataHealthCoordinator.ts`: extract existing getLatestState SELECT for reuse; existing scan/repair/converge behavior unchanged                                                                          |
| Existing display read | `src/data/foundation/foundationDiagnostics.ts`, `src/hooks/useFoundationDiagnostics.ts`: remove dependency wake and opening-time network auth refresh; fence Foundation observations too                                |
| Startup-owned DB      | `src/data/db/databaseConnection.ts`, `database.ts`: accessor returns only the existing initialized handle; never opens/migrates; missing handle fails closed                                                            |
| UI                    | `src/components/LocalOperationsDiagnostics.tsx`, `FoundationDiagnosticsScreen.tsx`, `src/hooks/useLocalOperations.ts`; canonical UiSection/UiButton/theme/typography and English/Chinese catalogs                       |
| Handoff               | `docs/CURRENT_IMPLEMENTATION_STATE.md`; ADR `2026-10-08-p4a-read-only-local-operations.md`                                                                                                                              |

The operational metadata reader applies the existing offline Capture cached Trip
actor predicate. Missing admission denies the whole continuation source without
identities/counts. This does **not** certify current Import manifest/material
admission or authorize evidence/result disclosure, installation, provider dispatch
or recovery. No full snapshot/pins reader is weakened or bypassed for those actions.
Account-only sync observations contain no Trip/material detail.

The default Operations composition reads the startup-initialized DB, never
`openDatabase`, Health run/converge/repair, continuation resume/run, side-effectful
listPending, provider recovery or server roots. Explicit existing DEV sign-in/logout
buttons retain their deliberate auth actions; displaying/refreshing observations
performs none. Existing Foundation device support byte aggregates are unchanged and
are not joined into the Account Operations projection.

## Validation performed

- Final focused Vitest: **14 files /275 tests PASS**. Includes new Operations,
  Foundation read, hook publication/cleanup and themed/localized component tests;
  DB accessor, existing Health, queue, continuation and Account isolation regressions,
  plus UI foundation/control/coverage tests. Actual SQLite1–50 is read with
  `PRAGMA query_only=ON`; write APIs fail if invoked, and total_changes is unchanged.
- Tests cover six health states, old UNKNOWN versus completed pass/queue, shadow
  exclusion, installation/metering pending, null/estimated/reported usage, absent
  local billing, arbitrary/prototype failure labels, source corruption/denial,
  limits, clock uncertainty, A→B→A, pending transition and fresh Account reads.
  Hook publication tests use React API mocks; component tests use static React
  rendering with native primitives mocked. They do not certify native device behavior.
- `npm run typecheck` PASS. `npm run lint` PASS, including `npm run ui:guard`:
  473 unchanged legacy occurrences; 79 representative files checked without
  baseline forgiveness. Changed-file Prettier and whitespace checks PASS.
- HEAD/main verified; migration registry, SQLite migration files, Server1–84 SQL
  and syncEngine compare byte-for-byte to the accepted base. No migrations, queue
  policy, canonical writer or remote gate were changed.
- Tests used installed dependencies via a temporary node_modules link, without
  installation. Vitest's default config bundler initially hit a sandbox write
  outside the worktree; `--configLoader runner` used the unchanged project config
  successfully. The temporary link was removed before handoff.
- Early focused tests/typecheck/lint caught prototype-map classification, missing
  null narrowing, test harness naming and queue-clock presentation issues; they were
  fixed and final checks rerun. No failed intermediate run is claimed as a baseline
  failure or hidden behind the final pass.

No full-suite, Backend/SQL environment, device/VoiceOver/Dynamic Type/Release build,
Hosted or live-provider acceptance is claimed. No Hosted access, provider call,
secret lookup, telemetry/export, deployment, commit or push occurred.

## Readiness and next gate

**READY FOR INDEPENDENT P4a REVIEW.** No unresolved implementation decision blocks
this narrow Builder. Native/device presentation acceptance remains unperformed.
P4b/P4c remain outside scope and require accepted actual C2/C3/P2/C4 handoffs and
separate P3/R3 source/policy authorization. Local diagnostics does not admit retry,
fallback, cost ceilings, server access or Remote AI activation.

**STOP — P4a LOCAL OPERATIONS BUILDER COMPLETE / INDEPENDENT REVIEW REQUIRED.**

## Owner authorized F1–F6 targeted corrections

Date: 2026-10-08 (Pacific/Auckland).
**P4a F1–F6 CORRECTION COMPLETE / READY FOR TARGETED INDEPENDENT RECHECK.**
The original Builder report above is retained verbatim as historical delivery.
All four IMPORTANT and both MINOR findings are accepted. The independent review
remains unchanged (SHA-256
`0c3d28ed1a20ece3b5e77bc3bcea4b4d8e5bc1c2c7db54446c1772bbbe0bb8e0`).
The worktree, branch and exact retained HEAD/main baseline remain unchanged;
all implementation and correction changes remain uncommitted/unpushed.

### Corrections and negative scenarios

- **F1 — PASS:** Auth exposes `readAdoptedLocalSession` and
  `requireAdoptedUserId` for diagnostics. They read only already adopted v2
  sessions; legacy-only, missing indexed v2 and mismatched identity fail closed.
  Foundation session reads and Operations identity checks use these boundaries.
  Real Auth repository/SecureStore adapter tests forbid every set/delete through
  both compositions. Normal `readLocalSession` still adopts v1 with two writes
  and one delete; a subsequent diagnostic read succeeds with writes forbidden.
  Existing Auth migration/account-selection regressions pass.
- **F2 — PASS:** Screen focus calls `readDiagnosticsDebugMode`, which composes
  the existing reporting preference SELECTs with the initialized DB accessor and
  adopted identity reader. It cannot invoke the normal cold reporting factory.
  Actual screen/focus tests cover absent handle and initialized Debug Mode OFF,
  with open/migrate and SQL/SecureStore writes forbidden. Normal application
  reporting/bootstrap retains its existing opener and migration behavior.
- **F3 — PASS:** The continuation metadata reader SELECTs DISTINCT finite
  execution observation/outcome, installation and metering labels across every
  contributing non-shadow attempt and validates them with the existing schema.
  Unknown labels in any of those fields on an older attempt make continuation
  UNAVAILABLE, disclose no continuation rows and preserve independently readable
  sources. Corrupt shadows remain excluded. No evidence or raw result is loaded.
  Existing older UNKNOWN/running/install/meter responsibility checks still pass.
- **F4 — PASS:** A TERMINAL/FAILED current attempt produces failure and operator
  attention independently of retained RUNNING scheduling state. Automatic recovery
  is DEFERRED/not admitted by the view; no retry eligibility is invented. Older
  UNKNOWN remains dominant. A real repository lifecycle test reserves/observes
  RUNNING then TERMINAL/FAILED with COMPLETE metering and no response digest,
  stops before reevaluation, and reads the failure with SQLite query-only enabled
  and unchanged total_changes. It does not invoke recovery or a provider.
- **F5 — PASS:** Foundation publication now uses the existing focus, active and
  request-sequence pattern. Blur/unmount clears observations/errors, disables
  refresh and removes foreground subscription. Same-generation overlap, late
  success/error, cleanup and A→B→A regressions pass. No timer/polling is added.
- **F6 — PASS:** Both English and Simplified Chinese distinguish no readable
  row source from a successfully empty read. Empty wording requires continuation
  or sync AVAILABLE/LIMITED; readable Data Health alone is insufficient. Denied
  and unavailable sources are explicitly qualified. Both-locale coverage
  combinations are rendered in regression tests.

### Reproduction and final validation

Before changes, the original independent fixtures reproduced all six findings:
**five fixture files /22 assertions PASS**, deliberately asserting the defects.
They and their original evidence remain unchanged. New corrected expectations
also reproduced the failing write/identity, screen factory, older-label,
terminal-failure, stale-refresh and no-readable-source cases before correction.
Initial new harness mock/naming errors were repaired; they are not baseline failures.

Final matrix: **17 files /297 tests PASS**, zero failures or skips. It includes
all original 14 Builder regression files, real Auth repository, diagnostic
read-only composition and Foundation hook tests; continuation lifecycle and UI
coverage tests were extended narrowly. Command:

```sh
node_modules/.bin/vitest run src/components/LocalOperationsDiagnostics.test.ts src/hooks/useLocalOperations.test.ts src/hooks/useFoundationDiagnostics.test.ts src/data/operations/localOperations.test.ts src/data/foundation/foundationDiagnostics.test.ts src/data/foundation/diagnosticsReadOnly.test.ts src/data/auth/authRepository.test.ts src/data/db/databaseConnection.test.ts src/data/health/dataHealthCoordinator.test.ts src/data/health/dataHealthPresentation.test.ts src/data/sync/syncOperationRepository.test.ts src/data/repositories/intelligenceContinuationRepository.test.ts src/data/auth/accountRequestContext.test.ts src/data/auth/accountSwitchFoundation.test.ts src/ui/foundation.test.ts src/ui/controls.test.ts src/ui/coverage.test.ts --configLoader runner
```

- Typecheck and lint/UI guard PASS (473 unchanged legacy occurrences;
  79 representative UI files). Changed-file formatting and whitespace PASS.
- Exact-base preservation PASS: 90 migration/registry/Server1–84/syncEngine files,
  zero differences. Independent review unchanged; original Builder text remains
  an exact prefix of this appended report. Installed dependencies were reused via
  a temporary link and not installed or changed; link removed before handoff.
- No existing baseline failure appeared in the requested focused matrix. The
  initial coverage assertion still expected the old preference callback text;
  it was updated to require the read-only composition while retaining Debug Mode
  and focus guards. That intermediate failure was not called a baseline failure.
  No full-suite claim or reclassification of historical unrelated failures is made.
- Local evidence: `/private/tmp/otr-p4a-independent-evidence/`, including
  `owner-correction-before.json`, corrected-expectation before/after runs,
  `owner-correction-focused-results.json` and `owner-correction-preservation.json`.

No migration, scheduler, Job engine, endpoint, Auth/database lifecycle engine or
provider integration was added. Account fences, nullable usage/cost and
memory-only projection remain. No active Capture C2/P2/R3 worktree was edited.
No Hosted/Production access, deployment, real AI call, commit or push occurred.
Native/device presentation acceptance remains unperformed.

**STOP — P4a F1–F6 CORRECTION COMPLETE / READY FOR TARGETED INDEPENDENT RECHECK.**
