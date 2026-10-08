# Capture C3 — Account Switch Recheck

Date: 2026-10-08 (Pacific/Auckland).

## Verdict and ownership

**No C3 account-switch regression reproduced in isolated automated tests. The
reported physical-device failure remains unresolved and device-unverified.**
The message `无法切换账户。原账户仍处于使用状态。` is the existing generic
`account.switchFailed` UI message. It does not identify the failed phase or prove
that recovery succeeded. Do not interpret simulator/test non-reproduction as a
physical-device fix or Owner PASS.

Account transition, secure remembered-session selection, rollback and operational
sync restart belong to Core/Auth and its environment/session integration. C3 owns
fencing its list/reopen callbacks and rendering only the active Account's Jobs.
No Core/Auth, scheduler, Hosted DEV, R3, schema or physical-device change was made.

## Exact starting-C2 comparison

C3 retains branch `codex/capture-c3-builder` and accepted C2 HEAD
`914e854cba7c2c97cfec7243047a06cadcc82c05`. A read-only `git archive` of that exact
HEAD was extracted beneath the ignored C3 QA directory. SHA-256/byte comparison
proved these nine files identical to C2:

- `src/components/AccountManagementScreen.tsx`
- `src/data/auth/accountSwitchCoordinator.ts`
- `src/data/auth/defaultAccountSwitchCoordinator.ts`
- `src/data/auth/authSessionRepository.ts`
- `src/data/auth/authRepository.ts`
- `src/data/auth/accountRequestContext.ts`
- `src/data/auth/accountGeneration.ts`
- `src/data/auth/accountLocalState.ts`
- `src/data/bootstrap/defaultBootstrapDependencies.ts`

Evidence: `ios/simulator-qa/account-recheck/source-identity.json`. The localized
message also predates C3; C3 catalog changes concern Capture presentation only.
No canonical merge/cherry-pick/rebase or Git staging/commit was performed.

## Traced error path

`AccountManagementScreen.switchAccount` calls the default Account coordinator.
Every thrown error is caught and replaced with `account.switchFailed`, discarding
the original phase/error at this UI boundary. Its successful path replaces the
route only after the coordinator resolves.

The shared coordinator drains old sync, begins a generation transition, reads the
old session, clears in-memory state, selects the target remembered secure session,
verifies its exact identity, adopts proven legacy Account state, releases the gate,
bootstraps, then restarts operational sync. Errors can originate from any of these
steps. Failed activation attempts restore the previous session and invalidate
failed generations; recovery errors are intentionally caught in the existing
implementation. Therefore the displayed sentence alone is insufficient evidence
of the original failure or the final active session.

`selectAccount` requires both an Account-index entry and a stored per-Account
session. An index entry alone cannot establish a usable remembered session.
Operational restart also invokes existing local reactivation and
`refreshThenSync`; under Dev transport this includes existing session token
refresh and Ledger sync. These are possible error boundaries, not diagnoses of
the owner's phone. No owner credentials, Keychain, SQLite or diagnostics were read.

## Executed synthetic checks

New focused regression: `src/features/capture/captureAccountSwitchRecheck.test.ts`.
It uses the real secure-session repository and coordinator with an ephemeral
in-memory storage adapter and synthetic `A`/`B` identities. Sync/bootstrap hooks
are explicit local fixtures; it does not exercise native Keychain or remote auth.

| Case                                                                                         | Current C3              | Exact C2 with same test |
| -------------------------------------------------------------------------------------------- | ----------------------- | ----------------------- |
| Remembered A → B → A without network                                                         | PASS                    | PASS                    |
| Old A request generation rejected under B and revived A; fresh A admitted                    | PASS                    | PASS                    |
| B remembered in index but its synthetic stored session absent: selection rejects, A retained | PASS                    | PASS                    |
| Injected restart exception after B selection: coordinator rejects and restores A             | PASS                    | PASS                    |
| Owner physical-device failure reproduction/root-cause diagnosis                              | NOT RUN — physical hold | NOT RUN                 |

The two failure cases demonstrate distinct existing causes that reach the same
generic UI message. They do not assert either cause occurred on the owner's phone.
The current C3 wrappers/lifecycle tests separately fence late list, reopen and
error callbacks after Account transitions, including A → B → A.

## Validation and evidence

All test commands ran with the existing network-deny preload
`NODE_OPTIONS='--require ./scripts/cp15/live-w-network-deny.cjs'` and
`vitest run --configLoader runner`. No transport call or external account was used.

- Current existing selection: **6 files / 33 PASS** — Auth repository, Account
  coordinator, Account request context, default Capture list/reopen wrappers,
  Capture host lifecycle, Activity lifecycle.
- New synthetic focused regression: **1 file / 3 PASS**.
- Exact C2 archive with the identical focused test: **4 files / 21 PASS** — Auth
  repository, coordinator, request context, new synthetic test.
- Prettier check for the added test/report: PASS.
- No production Core/Auth edit; added files are this report and the focused C3
  test. Broader final UI verification is recorded in the simulator QA report.

Logs are under `ios/simulator-qa/account-recheck/`: `existing-tests.log`,
`synthetic-current.log`, `synthetic-c2-baseline.log`. That directory is ignored and
contains only the synthetic baseline/test evidence. No owner data was copied.

## Remaining handoff

Core/Auth owns any future authorized investigation of the actual failed phase,
remembered secure-session availability, restart exception and recovery outcome.
Record the original error and final Account identity only in an authorized safe
diagnostic context; this cycle's absolute physical-device hold remains in force.
No speculative Core fix is justified by this generic message. C3's own Account
isolation tests passed, and physical acceptance remains deferred.

## Subsequent native synthetic confirmation

DeviceHub on the dedicated `OTR Capture C3 Synthetic QA` Simulator executed the
real menu/account coordinator A→B→Empty→A without the generic rejection. B's
Activity showed only its one Job, Empty zero, and A all six original Jobs.
Read-only synthetic database comparisons preserved all original Jobs/Inputs.
This uses native SecureStore with null-token synthetic sessions and unreachable
loopback API; it does not reproduce the owner's credentials/session/environment.
The physical failure remains unresolved. QA bootstrap selects A on each launch,
so native kill/relaunch cannot establish last-active-account retention.
