# Fresh Account Journey bootstrap Builder report

Date: 2026-10-09 (Pacific/Auckland).

**Builder validation PASS. Ready for Independent Review: YES.** No integration, commit, push, deployment, Hosted access or device installation was performed. Simulator fixture hydration with this candidate remains unverified until separate approval.

## Source and dependency verification

- Fresh managed worktree: `/Users/xoery/.codex/worktrees/fresh-account-bootstrap-builder/otr-mobile-canonical`.
- Exact Builder HEAD: `f7115dc288aff7f0a252bf80f53b0f2b626a7534`. Canonical `main`, `origin/main` and read-only remote `refs/heads/main` were freshly verified before creation and matched. This happens to match the historical audit base; it was not assumed. Final local main/origin/main verification still matches.
- The canonical working checkout has separate pre-existing work and is not the source of this candidate. Its files and other active worktrees were not edited.
- `package.json` / `package-lock.json` remain identical to this HEAD. Lockfile SHA256: `ef7f2d2f8d5f29ec72a9de4c2e63e3722c1afd0800815283e29314cc0bc79658`. `npm ls --depth=0` passed. Existing canonical `node_modules` were linked for validation; no dependency installation, upgrade or private environment loading was performed. The untracked dependency symlink is not source for integration.
- Accepted audit is retained unchanged in this worktree: `docs/architecture/OTR_FRESH_ACCOUNT_JOURNEY_BOOTSTRAP_AUDIT.md`, SHA256 `28f1da90dfe1d62ebda24e4a06bf421f78924d6dfe6323170dab48d9ba0d9ca9`, matching the accepted audit worktree copy.

## Resulting behavior

The three Account activation compositions now use the shared default bootstrap callback. After local session installation and release of the existing Account transition gate, the callback announces the installed Account's cache and returns without awaiting network. Restart schedules background discovery through the existing operational lifecycle. Genuine local installation failures still use existing recovery; remote failures do not roll back a successfully installed Account.

Cold start, activation, foreground and reconnect enter the same generation-scoped resume flight. Existing operational mutation work retains its order and draining rule. DEV discovery uses authenticated `GET /v2/me/ledger?period=ALL` with null bounds, then existing reporting repository reads and the approved date-entry policy. Every eligible summary is cached, including zero-Expense Journeys. Successful empty discovery is complete, not an error. It creates no entities or settings.

A valid Account-owned selected Journey is retained. Otherwise only the single policy-selected current Journey is selected and hydrated. Multiple current candidates remain CHOOSE; no current candidate remains MY_LEDGER. Other summaries hydrate through explicit selection. The screen's unselected Stage 3 demo Journey fallback was removed so empty/CHOOSE/MY_LEDGER state cannot start a read for an arbitrary fixture UUID. No Login routing or visible copy/layout was changed.

Selected hydration reuses `refreshJourneyLedgerWithStatus` (the existing `refreshJourneyLedger` owner) and its normal shared bootstrap/pull, actor, cursor and participation validation. Missing actor loads share that owner rather than issuing a second unconditional bootstrap. Existing Personal Payment and Review reads remain part of hydration and now receive the captured scope.

## Account-fencing evidence

- Immutable Account ID and generation are captured before token acquisition/request dispatch. An Account-only scope extends existing context helpers; no fake Trip ID is used for discovery.
- Authenticated client dispatch and credential resolution retain generation/Account checks. The token provider also captures generation, partitions its existing refresh flights by generation and guards refresh persistence under `withAccountApplyGate`. This closes late A→B→A refresh persistence with the same refresh token; no credentials were modified during validation.
- `refreshMyLedger` coalesces only exact Account/generation/period/bounds reads and checks responses before repository application. `cacheMyLedger` binds all writes to the captured Account, checks inside the existing apply gate and SQLite transaction, and validates again before commit. Timestamp ordering and authorized spending-fact checks remain intact.
- Automatic and explicit selected-Journey writes use the captured Account, apply gate and transaction, and require a cached summary or actor for that Account. Another Account's summary is not enough to select a Journey.
- Selected shared hydration receives the original Trip-specific scope, including generation; it does not recapture an Account after discovery. Its Personal Payment and Review repositories bind their getter to the captured Account; apply callbacks use the same gate, with their existing transactional/pending-state behavior retained. Review application has an explicit transaction.
- Summary/list/projection completion and selection callbacks are generation-checked. Open Journey/My Ledger screens clear prior Account state on a generation change, and reload only current-generation cache notifications.
- Tests reject delayed A→B→A discovery and token responses; summary and selection tests exercise transaction-entry and post-write rollback. Real SQLite verifies the same Journey UUID with different Account actors, separate summaries/selections, integrity and no FK violations. Existing Account apply-gate, actor/certificate/cursor and local mutation tests also pass.

## Retry and notification behavior

Transient discovery/hydration failures schedule one in-memory due time through `ledgerOperationalSync`'s existing `queueTimer`: 15 seconds, then 30 seconds, then at most once per 60 seconds while active and online. There is no second timer, worker, scheduler, queue kind or GET outbox. Network/timeouts, 429 and 5xx are retryable; definitive HTTP/auth/validation rejection is not treated as a transient discovery failure. Local/unclassified failures also use bounded backoff.

Successful discovery is retained when selected hydration is incomplete; retries repeat hydration rather than the successful list. Successful completion clears the read retry. Pause, offline/background and generation changes clear or invalidate pending read retry; foreground/reconnect wakes resume the incomplete work. A cold JS restart or a new Account generation rediscovers. A successful empty result does not continuously refetch. This checkpoint does not add general membership polling after a completed list.

Completion notifications now carry `discoveryChanged`, including an empty Journey-ID list. The first list apply is announced immediately, before selected hydration waits on network. Hydration completion announces the selected scope. Account activation also reloads cached data independently of remote availability. Listener errors cannot invalidate a completed cache apply. Fake-timer tests confirm that an idle queue still retries through the owner's single timer and that pause/ABA cancels stale work.

## Exact changed files

Implementation:

- `src/components/AccountManagementScreen.tsx`
- `src/components/GlobalMenu.tsx`
- `src/data/api/authenticatedClient.ts`
- `src/data/auth/accountRequestContext.ts`
- `src/data/auth/defaultAccountSwitchCoordinator.ts`
- `src/data/auth/sessionAccessToken.ts`
- `src/data/bootstrap/defaultBootstrapDependencies.ts`
- `src/data/repositories/ledgerReadRepository.ts`
- `src/data/repositories/ledgerReportingRepository.ts`
- `src/data/sync/ledgerOperationalSync.ts`
- `src/data/sync/ledgerPersonalPaymentCoordinator.ts`
- `src/data/sync/ledgerPersonalPaymentTransport.ts`
- `src/data/sync/ledgerReadTransport.ts`
- `src/data/sync/ledgerReportingCoordinator.ts`
- `src/data/sync/personalSettlementReviewCoordinator.ts`
- `src/data/sync/personalSettlementReviewTransport.ts`
- `src/features/ledger/LedgerStage6Screen.tsx`
- `src/features/ledger/MyLedgerScreen.tsx`
- `src/hooks/useFoundationDiagnostics.ts`

Tests and fixtures:

- `src/data/auth/sessionAccessToken.test.ts`
- `src/data/bootstrap/defaultBootstrapDependencies.test.ts`
- `src/data/bootstrap/participationWakeAcceptance.test.ts`
- `src/data/repositories/ledgerReportingRepository.test.ts`
- `src/data/sync/ledgerOperationalSync.test.ts`
- `src/data/sync/ledgerPersonalPaymentCoordinator.test.ts`
- `src/data/sync/ledgerReadTransport.test.ts`
- `src/data/sync/ledgerReportingCoordinator.test.ts`
- `src/data/sync/personalSettlementReviewCoordinator.test.ts`
- `src/data/repositories/accountJourneyBootstrap.test.ts`

Documentation:

- `docs/CURRENT_IMPLEMENTATION_STATE.md` — short isolated Builder handoff.
- `docs/architecture/OTR_FRESH_ACCOUNT_JOURNEY_BOOTSTRAP_BUILDER_REPORT.md` — this report.
- `docs/architecture/OTR_FRESH_ACCOUNT_JOURNEY_BOOTSTRAP_AUDIT.md` — unchanged accepted audit copy, previously untracked/unpublished; not a revised contract.

## Validation

| Check                                                                                      | Result                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Affected Core/Account/Ledger repositories, sync, bootstrap, domain, feature and hook tests | **151 files / 1,714 tests PASS**: `npx vitest run src/data src/domain/ledger src/features/ledger src/hooks --maxWorkers=1`                                                                   |
| Full TypeScript check                                                                      | `npm run typecheck` PASS                                                                                                                                                                     |
| Lint and UI foundation guard                                                               | `npm run lint` PASS; UI guard PASS, 80 representative UI files checked                                                                                                                       |
| Changed-file formatting                                                                    | Prettier PASS                                                                                                                                                                                |
| Whitespace                                                                                 | `git diff --check` PASS                                                                                                                                                                      |
| Protected source preservation                                                              | `git diff --exit-code HEAD -- backend supabase src/data/db/migrations.ts src/data/db/migrations src/features/capture app.json package.json package-lock.json` PASS                           |
| Real SQLite51 fixture acceptance                                                           | Fresh discovery, selected-only bootstrap, zero Expenses, 1–51 contiguous migration definitions, `integrity_check=ok`, zero FK violations, exact queued Expense/Capture row preservation PASS |

Focused coverage includes empty discovery; MY_LEDGER/CHOOSE/retained selection; automatic selection replacing a stale non-eligible preference; unresolved network work not blocking local activation; concurrent resume/My Ledger focus; offline valid/expired local sessions and reconnect; partial hydration retry; open-cache completion with zero previously known Journey IDs; ABA response, transaction, selection, notification, personal-read and token-persistence boundaries. Existing queued mutation, Account isolation and participation/cursor recovery suites remain passing. UI notifications are tested as lifecycle events and consumers are type/lint checked; native rendered-screen behavior was not exercised.

Private validation logs: `/private/tmp/otr-bootstrap-affected-final.log`, `/private/tmp/otr-bootstrap-typecheck-final.log`, `/private/tmp/otr-bootstrap-lint-final.log`. No credentials or Hosted responses are included.

## Preservation and limitations

No Simulator command, boot, launch, installation, container, Keychain, queue replay or provider execution was performed. The three reserved legacy/QA Simulators and approved DEV destination were not operated on. Their native fingerprints were not remeasured during this source-only checkpoint. Queue preservation evidence above is synthetic SQLite acceptance, not a new device inspection.

General Trip discovery and invitations remain outside this implementation: the existing endpoint lists only linked Ledger-eligible Journeys with Ledger Settings. Summary visibility does not grant actor authority. No Trips, Expenses, Capture submissions, Ledger Settings, migrations or endpoints are created by discovery. Existing bootstrap permission and cursor/certificate gates remain authoritative.

Independent review should focus on Account/generation ownership across token refresh and auxiliary Personal Payment/Review reads, nonblocking activation versus durable mutation draining, and notification-driven view reloads. After review/integration approval, a separate isolated devtest build and approved Simulator read-only A1 acceptance can verify real fixture hydration and UI behavior. This Builder does not authorize those steps.

**STOP — FRESH ACCOUNT JOURNEY BOOTSTRAP BUILDER / INDEPENDENT REVIEW REQUIRED.**

## F1–F5 targeted correction addendum — 2026-10-09

**F1–F5 corrected. Ready for targeted Independent Recheck: YES.** This addendum supersedes the earlier notification, auxiliary retry-classification and optional summary-cache ownership statements. The accepted Independent Review verdict is retained unchanged; this Builder does not replace the required independent recheck or authorize integration.

### Reproduction before correction

HEAD was reverified as `f7115dc288aff7f0a252bf80f53b0f2b626a7534` in the Owner-specified existing Builder worktree. A complete local source/input fingerprint baseline was saved before editing. Relevant production files in the review's disposable copy matched that starting candidate by SHA256.

The original review-origin negative probes were rerun before fixes: **4 files / 64 tests PASS**, plus the actual transpiled My Ledger hook harness. These tests assert defective behavior; their PASS demonstrates reproduction, not acceptance:

- F1: discovery reload1, later hydration-only reload0, stale-generation reload0.
- F2: composed real reporting/bootstrap owners repeated definitive Review403, Personal401 and Review-validation failures through six cycles, retaining another scheduled retry. Exact blocked-Review409 remained the stable control.
- F3: module import with AppState null, native active before subscription, then resume made no discovery until another active event.
- F4: a pending initial snapshot completed offline after a live online notification and suppressed subsequent resume.
- F5: context-free application of an earlier A response after switching to B stored A's summary with user_id B in real SQLite51. Passing the original A scope rejected it.

Negative log: `/private/tmp/otr-f1-f5-negative.log`. Original disposable probes and their source were preserved in `/private/tmp/otr-bootstrap-independent-review`.

### Corrections and corrected outcomes

| Finding | Minimum correction                                                                                                                                                                                                                                                                                                                                                                                                          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1      | My Ledger reloads for current-generation `discoveryChanged` **or nonempty Journey-ID completion**. Existing request and generation checks remain.                                                                                                                                                                                                                                                                           | A permanent test composes partial hydration failure, successful automatic retry and the actual transpiled mounted My Ledger subscriber: retry adds a reload; stale events add none. Review-origin hook probe now observes discovery1 / hydration1 / stale0. No native rendering claim.                                                                                                                                                                                                   |
| F2      | The existing Journey pull result retains original auxiliary errors in `auxiliaryErrors`; shared success is still applied. Bootstrap chooses a definitive error over any transient error when both occur. Only structured network/timeout or HTTP429/5xx failures schedule retry; definitive/unclassified failures clear the pending read retry. An incomplete result without a classified error fails closed as validation. | Real composed-owner tests cover both Personal Payment and Review: 400/401/403/unrelated409/validation/unclassified failures produce no due retry; network/timeout/429/500/503 recover through hydration-only retry without repeating successful discovery. Mixed transient-Personal plus definitive-Review stops retry. Exact `409 SETTLEMENT_REVIEW_BLOCKED` remains stable. Error identity/classification is asserted at the reporting seam; successful shared apply remains observed. |
| F3      | Lifecycle subscription synchronizes `syncActive` from the current native AppState before installing the existing listener.                                                                                                                                                                                                                                                                                                  | Null at module import → native active → subscribe → resume discovers without requiring another active event. Existing foreground listener remains in place.                                                                                                                                                                                                                                                                                                                              |
| F4      | A live-event flag supersedes the initial network snapshot; a removed subscription also ignores its late snapshot.                                                                                                                                                                                                                                                                                                           | Pending snapshot → live online/reachable → stale offline completion → explicit resume still discovers and runs the operational cycle. No extra listener or timer.                                                                                                                                                                                                                                                                                                                        |
| F5      | `cacheMyLedger` requires the original Account scope in its TypeScript contract and rejects missing scope at runtime. No application-time recapture remains. Stage3 diagnostics, Stage3 Acceptance and Settlement Participation Acceptance capture before their summary requests and pass the same scope through transport and apply. Synthetic fixtures explicitly capture their local Account scope.                       | Post-transport/pre-apply A→B and same-UUID A→B→A generation cases reject, leaving both summary and spending-fact tables empty. Missing JS scope fails closed. Existing transaction rollback, same-Journey actor isolation and period-cache tests pass. All production fetch→summary-cache callers were audited and updated.                                                                                                                                                              |

The existing operational timer/backoff, shared hydration/cursor owner, cached offline data, pending mutation behavior and Account authority are preserved. No scheduler, worker, GET outbox, Retry UI or routing change was added. Local/unclassified failures are no longer assumed transient; this explicitly corrects the original report's broader retry claim.

### Exact F1–F5 delta files

Production:

- `src/features/ledger/MyLedgerScreen.tsx`
- `src/data/bootstrap/defaultBootstrapDependencies.ts`
- `src/data/sync/ledgerReportingCoordinator.ts`
- `src/data/repositories/ledgerReadRepository.ts`
- `src/hooks/useLedgerStage3.ts`
- `src/hooks/useStage3Acceptance.ts`
- `src/hooks/useSettlementParticipationAcceptance.tsx`

Tests/fixtures:

- `src/data/bootstrap/defaultBootstrapDependencies.test.ts`
- `src/data/bootstrap/bootstrapAuxiliaryFailure.test.ts` — new composed error matrix.
- `src/data/sync/ledgerReportingCoordinator.test.ts`
- `src/data/repositories/ledgerReadRepository.test.ts`
- `src/data/repositories/accountJourneyBootstrap.test.ts`
- `src/data/repositories/myLedgerNarrowCache.test.ts`
- `src/features/ledger/__tests__/mountedMyLedgerProbe.ts` — new test helper executing the real subscriber with native/hook dependencies stubbed.

Documentation: this append-only Builder report addendum and the short `docs/CURRENT_IMPLEMENTATION_STATE.md` handoff. Original Independent Review text remains unchanged, SHA256 `441ca1f2add74a30b481e2526b2f38445db3b6ec6fc24f606a6e5a81ea25053f`.

### Validation and preservation

- **Affected regressions:** `npx vitest run src/data src/domain/ledger src/features/ledger src/hooks --maxWorkers=1` — **152 files / 1,726 tests PASS**.
- **Review-origin corrected disposable probes:** **4 files / 66 tests PASS** against the corrected production copy in `/private/tmp/otr-bootstrap-f1-f5-recheck`; negative assertions were inverted to corrected outcomes and fixtures now pass explicit scopes/structured errors. Totals include reused regression cases; they are not 66 new scenarios or a completed independent review. The hook harness separately passes discovery1 / hydration1 / stale0.
- **Typecheck:** `npm run typecheck` PASS. **Lint/UI guard:** `npm run lint` PASS; 80 representative UI files checked. Changed-file Prettier and `git diff --check` PASS.
- Protected-path diff check against HEAD passes for Backend, Supabase, migrations, Capture production, native configuration and dependency manifests. Baseline fingerprints also confirm that files outside the listed F1–F5 delta are unchanged, including the original Independent Review and accepted audit. Original Builder report bytes remain an unchanged prefix before this addendum.
- No Hosted request/authentication, provider activation, Simulator/device operation, business mutation, source integration, commit, push or merge occurred.

Logs: `/private/tmp/otr-f1-f5-negative.log`, `/private/tmp/otr-f1-f5-independent-corrected.log`, `/private/tmp/otr-f1-f5-regressions.log`, `/private/tmp/otr-f1-f5-typecheck.log`, `/private/tmp/otr-f1-f5-lint.log`. Corrected hook harness: `/private/tmp/otr-f1-f5-ui-recheck.cjs`. Preservation baseline: `/private/tmp/otr-f1-f5-before.json`.

General Trip/invitation discovery remains outside scope. Native screen behavior, live fixture hydration, SecureStore rotation and real-device event frequency were not exercised; those require separately authorized native acceptance after targeted independent recheck.

**STOP — FRESH ACCOUNT BOOTSTRAP F1–F5 CORRECTION COMPLETE / TARGETED INDEPENDENT RECHECK REQUIRED.**
