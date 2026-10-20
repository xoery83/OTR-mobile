# Fresh Account Bootstrap Canonical Integration Preflight

Date: 2026-10-09 (Pacific/Auckland).

## Verdict and authority

**READY for Owner review of the proposed integration.** This is an uncommitted
integration candidate, not a canonical merge or native acceptance verdict.
No commit, push, rebase, main/ref advancement, Hosted access or device operation
was performed. Read-only remote Git verification was performed twice.

## Verified sources and proposed ancestry

- Local canonical `main`, local `origin/main` and remote `refs/heads/main`:
  `3216668e42e919a2b4657e1357e8c7536fead114` at start and final verification.
- Accepted Core closure: `5d4f118c6b84627dd8b9602a05504a24b7adb2a4`.
  Its single parent is exactly `f7115dc288aff7f0a252bf80f53b0f2b626a7534`;
  its complete commit scope is exactly 40 files.
- Common ancestor: `f7115dc288aff7f0a252bf80f53b0f2b626a7534`.
- Fresh managed integration worktree:
  `/Users/xoery/.codex/worktrees/fresh-account-bootstrap-integration/otr-mobile-canonical`.
- Prepared with `git merge --no-ff --no-commit` of the exact closure onto verified
  main. `HEAD` remains `3216668`; `MERGE_HEAD` remains `5d4f118`.
  A separately authorized future ordinary merge commit would preserve the
  closure as its second-parent ancestor. No such commit exists in this checkpoint.

## Conflicts and minimum compatibility delta

The merge had **zero textual conflicts**. Git automatically combined the
current-state handoff. Both Platform slice handoffs, the Platform canonical
integration section and the Core accepted closure section remain verbatim;
only a new preflight status section was prepended.

The initial combined regression run reproduced one semantic test incompatibility:
`participationWakeAcceptance.test.ts` asserted exactly 51 migrations after applying
current main's 52. It otherwise passed discovery, selected Journey hydration,
Account state, queued Expense/Capture byte preservation, integrity and FK checks.
Initial result: **161 files passed / 1 failed; 2192 tests passed / 1 failed**.

The sole source-tree compatibility adjustment changes that test's descriptive
`SQLite51` label to `SQLite52` and expected contiguous registry length from 51 to 52. No accepted runtime code or migration was edited. The test retains a fixed
upper boundary, so an unintended SQLite53 remains detectable.

## Proposed integration scope

Relative to verified main: **41 paths** — the closure's exact 40 paths plus this
preflight report. Of the original 40, 38 are byte-identical to the closure; the
remaining two are the combined current-state handoff and the two-line test
compatibility adjustment described above. Complete proposed patch and path
manifest are retained privately in `/private/tmp/otr-bootstrap-integration-proposed.patch`
and `/private/tmp/otr-bootstrap-integration-proposed-files.json`.

```text
docs/CURRENT_IMPLEMENTATION_STATE.md
docs/architecture/OTR_FRESH_ACCOUNT_JOURNEY_BOOTSTRAP_AUDIT.md
docs/architecture/OTR_FRESH_ACCOUNT_JOURNEY_BOOTSTRAP_BUILDER_REPORT.md
docs/architecture/OTR_FRESH_ACCOUNT_JOURNEY_BOOTSTRAP_INDEPENDENT_REVIEW.md
src/components/AccountManagementScreen.tsx
src/components/GlobalMenu.tsx
src/data/api/authenticatedClient.ts
src/data/auth/accountRequestContext.ts
src/data/auth/defaultAccountSwitchCoordinator.ts
src/data/auth/sessionAccessToken.test.ts
src/data/auth/sessionAccessToken.ts
src/data/bootstrap/bootstrapAuxiliaryFailure.test.ts
src/data/bootstrap/defaultBootstrapDependencies.test.ts
src/data/bootstrap/defaultBootstrapDependencies.ts
src/data/bootstrap/participationWakeAcceptance.test.ts
src/data/repositories/accountJourneyBootstrap.test.ts
src/data/repositories/ledgerReadRepository.test.ts
src/data/repositories/ledgerReadRepository.ts
src/data/repositories/ledgerReportingRepository.test.ts
src/data/repositories/ledgerReportingRepository.ts
src/data/repositories/myLedgerNarrowCache.test.ts
src/data/sync/ledgerOperationalSync.test.ts
src/data/sync/ledgerOperationalSync.ts
src/data/sync/ledgerPersonalPaymentCoordinator.test.ts
src/data/sync/ledgerPersonalPaymentCoordinator.ts
src/data/sync/ledgerPersonalPaymentTransport.ts
src/data/sync/ledgerReadTransport.test.ts
src/data/sync/ledgerReadTransport.ts
src/data/sync/ledgerReportingCoordinator.test.ts
src/data/sync/ledgerReportingCoordinator.ts
src/data/sync/personalSettlementReviewCoordinator.test.ts
src/data/sync/personalSettlementReviewCoordinator.ts
src/data/sync/personalSettlementReviewTransport.ts
src/features/ledger/LedgerStage6Screen.tsx
src/features/ledger/MyLedgerScreen.tsx
src/features/ledger/__tests__/mountedMyLedgerProbe.ts
src/hooks/useFoundationDiagnostics.ts
src/hooks/useLedgerStage3.ts
src/hooks/useSettlementParticipationAcceptance.tsx
src/hooks/useStage3Acceptance.ts
docs/architecture/OTR_FRESH_ACCOUNT_BOOTSTRAP_CANONICAL_INTEGRATION_PREFLIGHT.md
```

## Combined validation

- Combined Core/Account/Ledger/C2/C4a/Publication/SQLite52 matrix:
  **162 files / 2193 tests PASS**. Command:
  `npx vitest run src/data src/domain/ledger src/domain/capture src/domain/trip src/features/ledger src/hooks backend/src/inboundAiClient.test.ts --maxWorkers=1`.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS, including UI guard (80 representative UI files;
  473 existing legacy occurrences).
- `npm run backend:build`: PASS; build only, no server/provider startup.
- Changed-file Prettier check and staged/unstaged whitespace: PASS.
- Existing dependency tree verified with `npm ls --depth=0`; package manifests,
  lockfile and build configuration unchanged. Dependencies were reused through
  a temporary symlink; no installation was performed. The symlink and generated
  Backend output are excluded from the proposed patch.
- Independent in-memory SQLite probe applied every migration: IDs exactly 1–52,
  integrity `ok`, zero FK violations. No SQLite53 module, registration, DDL or
  reservation is introduced.
- Every tracked main path outside the closure scope matches its before-merge
  SHA256. This includes Backend, all SQLite migration definitions, Publication
  Membership accepted code/tests/reviews, C2/C4a and Capture production code,
  provider/configuration files and dependency manifests.
- Original Core review plus appended targeted recheck, audit and full Builder
  F1–F5 evidence match the accepted closure byte-for-byte. Platform independent
  review histories match verified main byte-for-byte.

Validation logs are retained privately at
`/private/tmp/otr-bootstrap-integration-{regressions-final,typecheck,lint,backend,format}.log`.

## Preserved Core behavior and authority

All accepted runtime source bytes match the closure. Immutable Account ID and
generation capture, existing apply gate/SQLite transaction, summary ownership,
A→B→A fencing and selection policy are preserved. Local cached startup remains
nonblocking. Discovery lists Ledger-eligible summaries; selected/current or
explicitly chosen Journey hydration reuses existing contracts. CHOOSE/MY_LEDGER
never arbitrarily select the first Journey.

F1 retains current-generation My Ledger reload on discovery or Journey completion.
F2 retains structured auxiliary failures: network/timeout/429/5xx alone retry;
definitive 400/401/403, unrelated409 and validation failures stop retry; exact
`SETTLEMENT_REVIEW_BLOCKED` behavior remains. Existing bounded operational timer
backs off 15/30/60/60 seconds; no second scheduler, GET outbox or mandatory Retry UI.
F3 initializes from current AppState; F4 fences late initial connectivity snapshots;
F5 requires captured Account scope for every remote summary apply, including
Stage3 and Settlement Participation callers. Successful shared hydration and
previous cached data survive auxiliary failures.

Platform P2b remains dormant: Publication Membership's future Run column is absent
and fails closed with `PUBLICATION_MEMBERSHIP_SCHEMA_UNAVAILABLE`. No new runtime
provider, Integrated C4, C4/C5/C9 or Hosted authority is introduced. No Login routing,
Backend endpoint, general Trip/invitation discovery or migration change is included.

## Remaining gates and limitations

Owner review is required before creating the proposed ancestry-preserving local
merge commit or advancing canonical main; push requires separate authorization.
After approved integration, a **new isolated DEV Test Simulator artifact** must be
built from the approved integrated source before native acceptance. The historical
artifact does not contain this integration.

Separate Simulator authorization must target only
`0E6654DD-9A2C-4079-B720-7CFA0C76FE23` with
`com.xoery.otrmobile.devtest`, preserve the three reserved legacy/QA devices and
containers, and reverify signature, Keychain separation, Simulator platform and
DEV endpoints. Native acceptance still needs approved A1 fixture discovery/hydration,
Account switching/restart/offline/reconnection and mounted-screen refresh checks,
without business writes, historical queue replay or provider activation.

Node regressions and in-memory SQLite do not certify native Keychain, lifecycle,
network timing or Simulator UI behavior. General non-Ledger Trip/invitation
discovery remains outside scope. No Hosted fixture accessibility was rechecked here.

**STOP — FRESH ACCOUNT BOOTSTRAP CANONICAL INTEGRATION PREFLIGHT / OWNER REVIEW REQUIRED.**
