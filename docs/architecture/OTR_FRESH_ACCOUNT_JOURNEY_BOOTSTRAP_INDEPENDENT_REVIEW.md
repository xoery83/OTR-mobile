# Fresh Account Journey bootstrap independent review

Date: 2026-10-09 (Pacific/Auckland).

**PASS WITH REQUIRED CORRECTIONS. Ready for Final Owner Acceptance: NO.**

**CRITICAL: 0. IMPORTANT: 5. MINOR: 0.** Fix F1–F5 and rerun the affected checks before final acceptance. The normal discovery path has effective Account/generation fences and nonblocking local activation, but the candidate does not yet meet all recovery, notification and shared-cache ownership criteria.

What this change does: It discovers Ledger-eligible Journeys through the existing My Ledger ALL read after local Account activation and on lifecycle wakes. It caches Account-owned summaries, follows the existing Journey entry policy, and hydrates the selected Journey through the existing certified Ledger read owner.

## Independence, exact source and boundaries

Reviewed the exact uncommitted candidate in `/Users/xoery/.codex/worktrees/fresh-account-bootstrap-builder/otr-mobile-canonical` from this independent reviewer chat. This review did not reuse a Builder verdict as evidence. No subagent, Builder edit, commit, push, merge, rebase, remote fetch, Hosted request, device/Simulator operation, build installation or provider activation was performed.

- HEAD matches required base `f7115dc288aff7f0a252bf80f53b0f2b626a7534`.
- SHA256 of `git diff --binary HEAD`: `6ed4ea683750e89a617e7324125bd318506841d2dd15118f1b0db3d94a2dde96`.
- Accepted audit SHA256: `28f1da90dfe1d62ebda24e4a06bf421f78924d6dfe6323170dab48d9ba0d9ca9`. Direct comparison with the original audit worktree copy matches.
- Original Builder report SHA256: `618546a1cd361264ea7f1ff6af1ef7984a0dc8ace6657ff3dd9400ff55f949fe`.
- Exact scope matches the Builder manifest: 19 production files, 9 tracked test files plus untracked `src/data/repositories/accountJourneyBootstrap.test.ts`, one tracked current-state document, and the two untracked original reports. `node_modules` is an existing symlink to canonical dependencies, excluded from source. This review adds only this report in the candidate worktree.
- All 19 changed production files and all changed test diffs were inspected, with direct callers and storage/transport/lifecycle dependencies. The footprint is appropriate for the bounded Mobile composition; no Backend, migration, provider, dependency, native configuration or Capture production change was found.
- 1,244 tracked/input-file SHA256 fingerprints taken before review still match after validation. Builder production code, tests, original reports and other tracked files were preserved byte-for-byte.

Authoritative inputs included the current-state handoff, accepted audit, Builder report, root guide, Account switching foundation acceptance, and relevant Architecture, API, Data Model and Offline Sync contracts. UI foundation was inspected for the changed consumers. No new copy, control, color or navigation layout was introduced. Legacy Web was not inspected.

## Required corrections

### F1 — IMPORTANT: hydration retry does not refresh an already-open My Ledger

**Location:** `src/features/ledger/MyLedgerScreen.tsx:95–101`; `src/data/bootstrap/defaultBootstrapDependencies.ts:247–252`.

The My Ledger completion subscriber reloads only when `discoveryChanged` is true. After discovery succeeds but selected hydration fails, the retry deliberately retains discovery and reports successful hydration with `discoveryChanged: false` and the selected Journey ID. My Ledger ignores that event.

**Reproduced:** Real bootstrap-owner code first returned incomplete hydration, then successful hydration on retry. The final event was `{ journeyIds: ["current"], discoveryChanged: false }`. A separate harness executing the actual transpiled MyLedgerScreen with mocked React hooks observed one reload for discovery and zero additional reloads for that hydration event. A stale-generation event also caused zero reloads, as required.

**Impact:** A mounted My Ledger can retain unavailable settlement data or an earlier spending projection after SQLite hydration succeeds, until a separate focus/filter action reloads it. The new LedgerStage6 subscriber accepts Journey-ID completions; My Ledger does not.

**Smallest correction:** Reload My Ledger for current-generation discovery **or Journey-ID** completion, preserving its existing request/generation fences. Add the partial-failure → successful-hydration consumer test. No new notification system is needed.

### F2 — IMPORTANT: definitive auxiliary errors become endless transient retries

**Location:** `src/data/bootstrap/defaultBootstrapDependencies.ts:220–237`; `src/data/sync/ledgerReportingCoordinator.ts:148–176`.

The existing pull result records auxiliary Personal Payment/Review failures only as `incomplete`. The new bootstrap composition converts every incomplete result into an ApiClientError of kind `network`, losing the original failure classification.

**Reproduced with both real coordinators composed:** Successful ALL discovery and shared bootstrap, with respectively Review HTTP403, Personal Payment HTTP401, and Review response-validation failure. Each scheduled another hydration retry at 15/30/60/60/60 seconds. Six cycles each repeated shared bootstrap/application; another retry remained scheduled. ALL discovery correctly occurred only once. A control using exact `409 SETTLEMENT_REVIEW_BLOCKED` completed with no retry. Separate reporting probes confirmed HTTP400/401/403/unrelated409 all lose classification in the returned result.

**Impact:** Stable authorization or malformed-contract failures keep making requests and emitting completion events once per minute while active/online. The Builder report's claim that definitive HTTP/auth/validation rejection is not treated as transient is false for auxiliary reads. One timer does not make this bounded recovery correct.

**Smallest correction:** Retain whether incomplete auxiliary work is retryable, or retain its structured error, and schedule automatic read retry only for transient failures. Preserve successful shared hydration and the exact stable blocked-Review409 behavior. Do not change local Account activation or add a scheduler.

### F3 — IMPORTANT: activity sampled at module import can permanently suppress startup discovery

**Location:** `src/data/bootstrap/defaultBootstrapDependencies.ts:47`, `:80`, `:123–125`.

`syncActive` is initialized from AppState once at module evaluation. Subscribing later updates the health timer but does not synchronize that variable with the current native activity state.

**Reproduced:** Import the owner while AppState.currentState is null, set currentState to active before lifecycle subscription, subscribe, then call resume. No mutation cycle or discovery runs. Delivering a subsequent active event permits discovery. The installed React Native AppState implementation initializes currentState to null and asynchronously populates it; this is a supported state transition, not an invented input. Native occurrence frequency was not measured.

**Impact:** First-login/cold-start discovery can remain suppressed until another foreground event even though the app is already active. Reconnect alone still fails the activity gate.

**Smallest correction:** Initialize the activity gate from the current state when installing the existing lifecycle subscription, then retain the existing change listener. Add this module-import/subscription ordering test.

### F4 — IMPORTANT: late initial network snapshot can overwrite a newer connectivity event

**Location:** `src/data/bootstrap/defaultBootstrapDependencies.ts:81–85`, `:99–106`, `:123–125`.

The initial getNetworkStateAsync result writes `syncOnline` unconditionally after the live listener may already have received a newer state. The newly added global gate makes that stale initial result control whether resume can run.

**Reproduced:** Keep the initial snapshot promise pending, deliver a live online/reachable notification, then resolve the older snapshot as offline. A subsequent explicit resume makes zero discovery and zero operational-cycle calls. There is no retry due time to recover it, and the device can remain steadily online without another notification.

**Impact:** Automatic discovery can stall indefinitely until a later state event or restart; foreground alone remains blocked by the false online gate.

**Smallest correction:** Ignore the initial snapshot if a live connectivity notification has superseded it. Keep the existing listener and one scheduler. Add this snapshot/listener race test.

### F5 — IMPORTANT: optional cache context leaves existing network callers able to write A data as B

**Location:** `src/data/repositories/ledgerReadRepository.ts:402–404`; existing caller `src/hooks/useLedgerStage3.ts:88–95`.

The hardened normal coordinator passes its captured context correctly. However, cacheMyLedger still permits omission and captures the Account **at application time**. The existing Stage3 diagnostics fetch→cache caller omits context and awaits repository resolution after transport returns. `useStage3Acceptance.ts:98` and `useSettlementParticipationAcceptance.tsx:258` also omit the original request context.

**Reproduced using real SQLite51 repositories:** Retain a response obtained under A, switch to B/advance generation before the context-free cache call, then apply. A's summary is stored with user_id B and returned by B's summary read. Supplying A's original context rejects the same response. This is a pre-existing diagnostic-call-path hazard left open by the shared-boundary hardening, not a failure of the new ordinary discovery coordinator.

**Impact:** The acceptance claim that Account-owned cache writes cannot be applied under another Account is not universally true. Diagnostics can contaminate another Account's private summary/spending cache, which normal readers subsequently consume.

**Smallest correction:** Require original Account scope for remote summary application and carry it through every fetch→cache caller, or route those callers through the already-fenced refreshMyLedger owner. Preserve intentional synthetic fixture behavior under explicit captured local scope. Add the post-transport/pre-apply switch case; checking only a delayed transport response misses it.

## Acceptance coverage

| Focus                                                                | Independent result                                                                                                                                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact scope/provenance; forbidden Backend/migration/provider changes | PASS; manifest, source hashes and protected-path diff checks                                                                                                                                                                          |
| Successful local activation independent of network                   | PASS; default callback/restart detach remote work, genuine local installation recovery retained; affected activation/logout tests pass                                                                                                |
| A→B→A token/refresh/response/apply/selection/notification            | PASS on captured normal paths; affected barrier and SQLite rollback tests pass; F5 remains for context-free legacy callers                                                                                                            |
| Account-owned cache and shared UUID actors                           | Normal discovery PASS; F5 required correction. Additional real SQLite probe used two distinct non-null Member actors for the same Journey UUID, switched A→B→A, and verified both actor rows, integrity and foreign keys              |
| Existing bootstrap/cursor/actor/participation validation             | PASS; the established owner and apply validators are reused, including certified invalid-cursor recovery and actor mismatch rejection                                                                                                 |
| Entry selection and fixtures                                         | PASS; no first-array-item choice, no unselected Stage3 fallback, no synthetic fixture adoption in ordinary discovery. Retained Account selection wins; CHOOSE/MY_LEDGER remain valid                                                  |
| Failure/retry/pause/switch/logout/cold restart                       | Main fences and transient backoff PASS; F2–F4 required corrections. Existing offline continuity, pause/drain, restart and logout regressions pass                                                                                     |
| Scheduler/outbox/polling                                             | One existing queueTimer, no new GET queue kind/worker/provider; F2 creates repeated definitive-error polling through that timer                                                                                                       |
| Open-screen notifications, including zero known IDs                  | First/empty discovery event and Ledger consumer PASS; partial-hydration My Ledger F1 required correction                                                                                                                              |
| Empty discovery and zero-Expense Journey                             | PASS; empty result completes without retry; zero-Expense current Journey selects/hydrates without creating Expense or settings; MY_LEDGER/CHOOSE do not automatically hydrate arbitrary IDs                                           |
| Personal Payment and Review Account scope                            | PASS for captured reads: bound repository user ID, generation checks and Account apply gate. Existing transactional/pending-intent behavior is retained; no new cross-Account application found in these paths                        |
| Pending Expense/Capture and offline session preservation             | PASS locally: existing regression suites plus synthetic SQLite queue-row equality. No claim about newly observed native queues                                                                                                        |
| Changed production/tests                                             | All changed production and test diffs inspected. Existing assertions were adapted to the changed owner/context rather than removed to hide failures. Missing consumer and lifecycle race coverage explains the green-suite gaps above |

Expected load is one native app process with small travel groups, potentially concurrent lifecycle/UI reads and Account switches. Findings concern correctness at that ordinary load, not speculative scale.

## Validation and independent evidence

- **Affected candidate regressions:** `npx vitest run src/data src/domain/ledger src/features/ledger src/hooks --maxWorkers=1`: **151 files / 1,714 tests PASS**, independently rerun against the exact Builder worktree.
- **Independent disposable probes:** four copied/extended suites **64 tests PASS**, plus distinct-non-null-actor SQLite suite **22 tests PASS**. These totals include 73 reused candidate cases and **13 added independent cases**; do not count all 86 as new scenarios. Negative probes assert the observed defective behavior, so their PASS does **not** mean those acceptance criteria pass.
- **Actual MyLedgerScreen hook harness:** discovery reload1 / hydration-only reload0 / stale-generation reload0, reproduced against the exact copied production file. This verifies subscription logic, not native rendering.
- **Typecheck:** `npm run typecheck` PASS.
- **Lint/UI guard:** `npm run lint` PASS, including UI guard with 80 representative files and no baseline forgiveness there.
- **Formatting:** Prettier check of all changed tracked files plus the three untracked source/report inputs PASS. Review report formatted separately. `git diff --check` PASS.
- **Protected paths:** `git diff --exit-code HEAD -- backend supabase src/data/db/migrations.ts src/data/db/migrations src/features/capture app.json package.json package-lock.json` PASS.
- **Preservation:** 1,244 original source/input fingerprints unchanged; exact base and diff hash unchanged. Only this independent report is added.

Disposable probes and exact copied candidate: `/private/tmp/otr-bootstrap-independent-review`. Hook harness: `/private/tmp/otr-bootstrap-ui-review.cjs`. Logs: `/private/tmp/otr-bootstrap-review-regressions.log`, `otr-bootstrap-review-independent-final.log`, `otr-bootstrap-review-sharedactors.log`, `otr-bootstrap-review-typecheck.log`, `otr-bootstrap-review-lint.log`, and `otr-bootstrap-review-format.log`. Probe setup needed a correction to reset mock implementations and import the current ApiClientError class after module resets; final quoted results come from corrected reruns.

## Remaining acceptance limitations and stop

No Hosted DEV/Production access, real authentication grant/refresh, Simulator/device build or native screen execution was authorized or performed. Real fixture hydration, mounted native rendering/navigation, AppState/connectivity event ordering frequency, native SecureStore rotation, measured Account-switch latency, VoiceOver/Dynamic Type and real native queue continuity remain separate Simulator/native acceptance work. General Trip/invitation discovery and Trips without Ledger Settings remain outside this endpoint's contract. The full repository suite and Backend build were not rerun; affected regressions and protected Backend source checks were completed.

**Ready for Final Owner Acceptance: NO.** Return to Builder for F1–F5, then independently rerun the corrected scenarios and affected validations. No integration/publication authority is inferred from this review.

**STOP — FRESH ACCOUNT JOURNEY BOOTSTRAP INDEPENDENT REVIEW COMPLETE.**

## TARGETED RECHECK — F1–F5 — 2026-10-09

**TARGETED RECHECK PASS. Ready for Final Owner Acceptance: YES.**

This section supersedes the original open F1–F5 findings for the corrected candidate only. The complete original review above is preserved byte-for-byte as historical evidence. Remaining **CRITICAL: 0 / IMPORTANT: 0 / required MINOR: 0**. **New in-scope regressions: NO.** Native acceptance limitations remain below; this verdict grants no integration, publication or device/provider authority.

### Exact corrected candidate and review independence

Original reviewer, same review session, Owner-specified Builder worktree. HEAD remains exact required base `f7115dc288aff7f0a252bf80f53b0f2b626a7534`. Corrected `git diff --binary HEAD` SHA256: `e9e01d541c8a50d6db38c0069c02ee52c75a900133c372b7b0bdde1b03ef6d31`.

Compared the exact correction delta against the preserved original reviewer source snapshot, rather than treating the Builder's addendum as proof. The delta comprises seven production files (MyLedgerScreen, defaultBootstrapDependencies, ledgerReportingCoordinator, ledgerReadRepository and the three diagnostic/acceptance hooks), five existing test files, one new auxiliary error matrix, one new test-only mounted-screen helper and two documentation updates. Every delta file was inspected. The accepted Audit is unchanged, SHA256 `28f1da90dfe1d62ebda24e4a06bf421f78924d6dfe6323170dab48d9ba0d9ca9`; updated Builder report SHA256 `0c51758ec8a04066f40f32044e4be8fe6e232a773bb52307ad18a34a55385cf4`. Its original report bytes remain an unchanged prefix before its correction addendum.

Before appending, the original Independent Review SHA256 was `441ca1f2add74a30b481e2526b2f38445db3b6ec6fc24f606a6e5a81ea25053f`, matching the original delivered artifact. All 1,247 candidate source/input fingerprints remained unchanged throughout the recheck. Only this appended section is written back. No Builder implementation/test/report edits, Hosted requests, native operations, provider activation or Git publication occurred.

### Individual correction decisions and reproduced results

| Finding                                 | FIX VERIFIED | Independent evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1 — mounted My Ledger notification** | **YES**      | Actual transpiled MyLedgerScreen subscription receives first discovery and later hydration-only completion: reload counts now discovery1 / hydration1 / stale-generation0. The corrected permanent composed test also connects partial hydration failure and successful retry to the mounted subscriber. Original request/generation guards remain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **F2 — definitive auxiliary errors**    | **YES**      | Real reporting/bootstrap owners preserve auxiliary errors and their original identity. For both Personal Payment and Review, HTTP400/401/403, unrelated409 and validation failures schedule no read retry while successful shared hydration is still applied. Network, timeout, HTTP429/500/503 schedule recovery; success cancels it without repeating ALL discovery. Tested both mixed-error orderings: a definitive error dominates another auxiliary transient error. Exact `409 SETTLEMENT_REVIEW_BLOCKED` remains stable and complete. Repeated transient failure retains 15/30/60/60-second backoff and stops after success. Missing classification fails closed.                                                                                                                                                                    |
| **F3 — AppState initialization**        | **YES**      | Original ordering: import with currentState null → native active before lifecycle subscription → subscribe → resume. Discovery and the operational cycle now start without another active event. Subscription initializes the existing activity gate; no new timer/listener owner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **F4 — snapshot supersession**          | **YES**      | Original ordering: initial snapshot pending → live online/reachable event → older offline snapshot resolves → resume. The live state wins; discovery and the operational cycle run. A removed subscription also ignores its pending initial snapshot.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **F5 — summary-cache ownership**        | **YES**      | Every production remote summary fetch→cache chain passes the same scope captured before the request: refreshMyLedger, Stage3 diagnostics, Stage3 Acceptance and Settlement Participation Acceptance. The repository requires scope at compile time and rejects missing scope at runtime. Real SQLite51 delayed A→B and A→B→A applies reject with zero summary/spending-fact writes. A late response cannot overwrite an already installed newer-generation summary. Actual transpiled code for each of the three hook callers was executed with local stubs and the real cache repository: captured request/apply scope identity was preserved and switching to B immediately before apply produced zero cache contamination. Synthetic fixtures now explicitly capture their local scope; period/revision/isolation behavior still passes. |

The three hook executions above use local fake transport/sign-in/filesystem adapters only; no real diagnostic Hosted path was run. Their assertions require the apply seam to be reached, the original scope object to be forwarded unchanged and the real SQLite tables to remain empty after the injected Account switch.

### Original negative probes, without weakened assertions

The original disposable snapshot and probe files remain intact. Independently reran the original four suites against that historical candidate: **4 files / 64 tests PASS**, again demonstrating the old defects; the original UI harness again reported discovery1 / hydration0 / stale0.

Copied the original probes unchanged into a fresh corrected-candidate mirror. Running all 11 cases matching `independent` gives **7 failures / 4 passes / 53 filtered cases**. These are expected defect-detection results, not current acceptance failures: the old assertions requiring suppressed discovery, repeated definitive-error retry or context-free cache contamination fail against the corrections. The original four reporting-only checks still pass because they check incomplete results, not the now-preserved auxiliary-error classification. The original UI harness with only its source path changed likewise fails its unchanged assertion requiring no hydration reload.

Separate corrected safety probes retain the same race stimuli and assert the required outcomes. The original generic `{ incomplete: true }` fixture is replaced only in the corrected probe with a structured network auxiliary error, matching the new classified result contract; missing classification is separately required to fail closed. Explicit scope is supplied only for legitimate local fixture writes. No original negative assertion or historical probe file was edited.

### Fresh validation

- **Affected Account/Core/Ledger/Bootstrap regressions:** `npx vitest run src/data src/domain/ledger src/features/ledger src/hooks --maxWorkers=1` — **152 files / 1,726 tests PASS**. Existing local activation/recovery, offline valid/expired session, pending mutations, selected hydration, cursor/participation and Account fence suites are included.
- **Separate reviewer corrected cases:** **3 files / 18 targeted cases PASS**, with 29 inherited cases filtered out by the targeted test-name selector. These include the full auxiliary status matrix, both mixed-error directions, original lifecycle orderings, delayed Account/ABA applies, runtime missing scope and actual three hook callers. The actual My Ledger subscription harness separately passes discovery1 / hydration1 / stale0.
- **Original shared-Journey SQLite probe against corrected source:** **1 file / 22 tests PASS**, including two distinct non-null Member actors under the same Journey UUID and A→B→A; integrity and foreign-key checks remain valid.
- **Typecheck:** PASS. **Lint/UI guard:** PASS, including 80 representative UI files. **Changed-file/input formatting:** PASS. **Whitespace:** `git diff --check` PASS.
- **Protected-source checks:** Backend, Supabase, SQLite migration registry/files, Capture production, native configuration and dependency manifests remain exact to HEAD. Correction delta adds no scheduler, worker, GET outbox, provider or general Trip-discovery capability. Existing one-timer queue scheduling code is unchanged by F1–F5; its fake-timer regressions pass. No app route file changed; Login routing is unchanged.
- **Preservation:** all 1,247 pre-recheck source/input fingerprints unchanged except the authorized append after validation; original review bytes are an exact prefix of the resulting report. No commit, push, merge or rebase.

Evidence: `/private/tmp/otr-bootstrap-reviewer-targeted-recheck` contains the exact corrected candidate mirror, unchanged historical probes and separate corrected probes. Logs are `/private/tmp/otr-bootstrap-recheck-regressions.log`, `otr-bootstrap-recheck-original-negative-control.log`, `otr-bootstrap-recheck-unchanged-probes-all.log`, `otr-bootstrap-recheck-corrected-probes-final.log`, `otr-bootstrap-recheck-sharedactors.log`, `otr-bootstrap-recheck-typecheck.log`, `otr-bootstrap-recheck-lint.log`, and `otr-bootstrap-recheck-format.log`. UI harnesses are `/private/tmp/otr-bootstrap-reviewer-ui-original-assertions.cjs` and `/private/tmp/otr-bootstrap-reviewer-ui-recheck.cjs`.

### Native/Simulator limits and final readiness

**Ready for Final Owner Acceptance: YES for this bounded source/test checkpoint.** No remaining F1–F5 correction or new in-scope regression was found. The original review's native limitations remain: real fixture hydration and rendered mounted screens, actual AppState/connectivity event timing, SecureStore/token rotation, native offline queue continuity, Account-switch latency and accessibility/visual acceptance were not exercised. No Hosted DEV/Production access or device/Simulator operation was performed. General Trip/invitation discovery remains outside the existing Ledger-eligible contract. Full repository suite and Backend build were not rerun.

**STOP — FRESH ACCOUNT BOOTSTRAP TARGETED INDEPENDENT RECHECK COMPLETE.**
