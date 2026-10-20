# Trip Canonical A1-I2B3 — Device / Wake / Reconnect Acceptance

Date: 2026-10-04

Status: **A1-I2B3 CORRECTION COMPLETE — REVIEW PENDING**.
This records completed local acceptance execution, with physical interaction and
remote server cases explicitly pending below. It does not claim every device case passed.

## Baseline and authority

- Worktree: `/Users/xoery/Project/otr-mobile-canonical`.
- Branch: `integration/ledger-polish-canonical`.
- Startup: clean exact HEAD `b3fe04b3184cf2ecee70b1e5d69970cc73faa006`.
- Authority: A1-I2B1 snapshot/cursor contract and accepted A1-I2B2 implementation,
  including both account-transition corrections. Combined A+C schema baseline
  remains the committed authority; no schema replay or remote deployment was needed.
- Only this worktree was changed. No blocked-attempt drafts were imported.

## Wake inventory and demonstrated gap

The existing shared refresh owner is `ledgerReportingCoordinator`:
`refreshJourneyLedger` / `refreshJourneyLedgerWithStatus`, with Account-generation
and Trip scoped coalescing, bounded recovery and atomic certified application.

| Existing wake                                               | Route to shared refresh owner                                                                    | Acceptance finding                                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Cold bootstrap / process restart                            | `bootstrapApplication` → `resumeOperationalSync`                                                 | Added selected-Trip refresh after existing operational sync; bootstrap remains nonblocking.                                  |
| Global background → foreground                              | `subscribeOperationalSyncLifecycle` → same resume path, alongside health scheduling              | Same small fix covers an unmounted Ledger screen and empty queue.                                                            |
| Global offline → online reconnect                           | Network listener → same resume path, alongside health scheduling                                 | Same fix removes dependency on financial queue completion or a health candidate.                                             |
| Mounted Ledger focus / Trip change                          | `useLedgerActiveSync` → `runLedgerActiveSync` → reporting coordinator                            | Already pulls with an empty queue; unchanged. Trip selection is Account scoped.                                              |
| Mounted Ledger foreground / reconnect                       | Existing active-sync controller → same owner                                                     | Already wired; unchanged.                                                                                                    |
| Account selection / session activation / recovery           | Existing transition owner → bootstrap / `restartOperationalSync` → resume path                   | Uses existing owned transition lease and generation fence; no new transition path.                                           |
| Successful local mutation                                   | Existing operational-sync kick and active controller; completion schedules scoped health         | Existing eligible financial work may cause a refresh; this is insufficient for participation-only drift with no queued work. |
| Review / reporting manual refresh / settlement revalidation | Existing refresh hooks and revalidation helpers → reporting coordinator                          | Unchanged callers and certified read owner.                                                                                  |
| Existing active polling / backoff                           | Active-sync controller → same owner                                                              | Existing cadence/backoff remains unchanged; no additional polling.                                                           |
| Existing periodic health / sync completion                  | Existing health scheduler → repair / refresh / revalidation when its planner selects a candidate | Existing 15-minute health timer is unchanged. A healthy local cache alone does not establish remote participation freshness. |

Before the fix, global resume refreshed auth and ran operational sync only.
An empty durable queue produced no scoped completion; the health planner could
have no candidate. Thus a server participation-only change was not necessarily
observed by global cold/foreground/reconnect wakes outside mounted Ledger.

The regression first failed for all three wakes (3 failed / 3 passed), then passed
(6 / 6). The original wake change added nine lines: capture generation, reuse the
existing selected-Trip repository, and invoke the existing central refresh after
operational sync if identity, selection and generation still permit it. No protocol,
certificate, completeness, cursor, schema or lease implementation changed.

Global concurrent resumes share the existing `resuming` promise. Overlapping
screen/global pulls also use central scoped coalescing. Separately completed wakes
can legitimately perform later verification; this is not an instant freshness or
one-request-for-all-future-wakes guarantee.

## Independent-review corrections

P1: the added awaited shared verification could reject `resumeOperationalSync`,
then `restartOperationalSync`, then Account activation. The real Account switch
coordinator interpreted this convergence failure as transition failure and restored
A despite successful local installation of B. This is a runtime regression.

Correction: only the call to the added `refreshJourneyLedger` is caught inside
the resume workflow. It remains awaited and routed through the central owner.
Failure uses the existing active-sync diagnostic format (`ledger_sync_failure`,
`phase: pull`, error kind/code only; no credentials/payload). Resume completes
nonfatally, leaving valid B installed. No new result framework, fire-and-forget
refresh, worker or timer was introduced. Session installation, Account bootstrap,
auth refresh, operational queue execution and selected-Trip repository failures
remain outside this catch; their existing error semantics are not broadly swallowed.
Certificate/cursor writes remain governed by the unchanged atomic repository.

Exact local reproduction uses real `createAccountSwitchCoordinator`,
`restartOperationalSync`, `resumeOperationalSync`, process-global generation/lease,
central reporting coordinator and migration-backed SQLite. Auth storage and typed
server transport are local fixture boundaries. Both cached Accounts have a selected
Trip and scoped v2 certificate; financial queue and Expense rows are empty.

- Before containment: `correction-red.log`, **5 failed / 12 passed**. Both
  `switchAccount` / `activateSession` reject on unavailable shared pull; all three
  cold/foreground/reconnect nonfatal-failure expectations also fail.
- After correction and additional coverage: `correction-green.log`, **2 files /
  28 tests PASS**. B stays current, its installed generation is unchanged, A is
  never reselected, cached Trip data and the full certificate remain readable and
  unchanged, and a later successful wake converges participation.
- Cold bootstrap still returns cached authenticated-offline state. Foreground and
  reconnect errors preserve identity/generation/certificate and retry on later wakes.
- Stale generation skips refresh both after operational sync and after selected-Trip
  resolution. Concurrent mounted-owner and global pulls coalesce to one request.
- Actual B Account bootstrap failure still rejects and restores A for both switch
  and activation; existing installation/recovery and multi-coordinator races rerun.
- The scoped bootstrap unit test checks the failure diagnostic. An unrelated
  operational resume failure still rejects and does not reach shared verification.
- Final full focused run: `correction-focused.log`, **21 files / 324 tests PASS**;
  correction typecheck, Backend build, scoped lint, UI guard and format/whitespace
  logs are stored beside it. The reviewer's exact standalone script was not supplied;
  the described real-owner regression was reproduced through these checked-in tests.

P2: the earlier report incorrectly called deep/strict trust verification PASS.
The saved command output is `CSSMERR_TP_NOT_TRUSTED`. That PASS claim is removed;
trust verification remains NOT ESTABLISHED / PENDING. Xcode build, device install,
launch, kill/relaunch and data preservation evidence are retained. This failure
alone does not establish that the installed app is unusable. Physical acceptance
remains PARTIAL; foreground/reconnect/Trip/Account and real-server churn remain pending.

## Automated acceptance matrix

The focused run passed **21 files / 324 tests**, including the unchanged I2B2
race and compatibility tests. The new real-owner integration fixture contributes
19 cases, including the correction regressions below; the bootstrap suite has
nine cases, retaining all three original empty-queue wake regressions.

| Required scenario                                | Local automated result / evidence                                                                                                                               | Physical evidence                                                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Online cold launch, valid certificate         | PASS: real SQLite, zero-change pull updates verification without bootstrap.                                                                                     | Pending real-server verification.                                                                                                         |
| 2. Online cold launch, stale fingerprint         | PASS: cold wake, empty queue, zero financial rows, one certified bootstrap.                                                                                     | Pending physical server churn.                                                                                                            |
| 3. Offline cold launch with cached session/data  | PASS: expired cached session still returns authenticated offline; failed pull retains certificate.                                                              | PASS: unreachable-API Release cold/restart launch reaches main shell; cache preservation independently checked. Radios were not disabled. |
| 4. Offline → online, empty queue                 | PASS: global Network callback converges with empty `sync_operations`.                                                                                           | Pending physical reconnect to an actual backend.                                                                                          |
| 5. Background → foreground, empty queue          | PASS: global AppState callback converges; mounted active-sync coverage retained.                                                                                | Pending: DeviceHub control attempts did not change the physical screen.                                                                   |
| 6. Network loss during shared pull               | PASS: injected pull failure preserves cached certificate; reconnect converges; transactional rollback/disconnect coverage retained.                             | Pending actual physical network interruption.                                                                                             |
| 7. Kill/restart, persisted v2 cursor/certificate | PASS: file-backed SQLite closes/reopens and detects drift on wake; repository reopen coverage retained.                                                         | PASS for process restart/cache survival; v2 certificate pending because installed pre-upgrade cache was migration 41 and uncertified.     |
| 8. Trip A→B→A                                    | PASS: two scoped cursors; A drift discovered on re-entry, B empty roster remains isolated.                                                                      | Pending interactive Trip switch.                                                                                                          |
| 9. Account A→B→A                                 | PASS: remembered-session coordinator coverage and generation isolation retained.                                                                                | Pending interactive Account switch.                                                                                                       |
| 10. Account switch during refresh/apply          | PASS: existing paused COMMIT, recovery-first, multi-coordinator ownership and stale recovery tests rerun.                                                       | Pending physical race.                                                                                                                    |
| 11. Old backend / no envelope                    | PASS: transport/domain compatibility and legacy repository preservation tests rerun; no invented verification.                                                  | Pending real older-backend device session.                                                                                                |
| 12. Shared v1 controlled bootstrap               | PASS: shared cursor validation/recovery and legacy migration coverage rerun; private cursor remains v1.                                                         | Pending physical certified recovery.                                                                                                      |
| 13. Malformed present envelope                   | PASS: domain/transport validation and atomic repository rejection rerun.                                                                                        | Pending physical malformed-server fixture.                                                                                                |
| 14. Drift during pagination                      | PASS: coordinator preserves earlier committed page when a later page mismatches; backend cursor fingerprint checks rerun.                                       | Pending physical server pagination churn.                                                                                                 |
| 15. Repeated churn after one recovery            | PASS: one recovery ends the current cycle even when the fixture changes immediately afterward; a later wake converges. Existing second invalidation test rerun. | Pending physical churn.                                                                                                                   |

Acceptance totals: **15 / 15 scenario families have local automated coverage**;
**0 remote mutation cases executed**. Physical checks passed configured Release build,
in-place install, cold launch, kill/restart and seven-table cache preservation.
Physical foreground/reconnect, interactive Trip/Account switching and certified
server-churn convergence remain pending, rather than included in the PASS count.

Other checks: Mobile typecheck, Backend TypeScript build, changed-test/source ESLint
with zero warnings, UI guard, formatting and whitespace checks PASS. No UI files
changed. The historical full-repository architecture-boundary failure recorded in
the current-state document was not re-audited or fixed; the focused run is not a
claim that the full repository suite is green.

## Two isolated local clients

`participationWakeAcceptance.test.ts` uses independent migration-backed SQLite
client databases and real reporting repositories/coordinator/global wake handlers.
Only boundaries are stubbed: typed bootstrap/pull transport, cached auth/native
lifecycle events, operational queue and health scheduling, and unrelated private
reads. The deterministic server is an in-process fixture, not Hosted Dev, HTTP or
a live PostgreSQL deployment.

Each client starts with a valid shared v2 certificate and no financial rows or
queued operations. The fixture changes participation to inactive revision 1,
then reactive revision 2. Only the client receiving a wake advances. The other
client remains stale until its own wake, after which both certificates match the
canonical vector. Each mismatch is rejected before page/checkpoint advancement
and leads to exactly one bootstrap in that cycle. Selected actor state and roster
converge with the certificate. No lifecycle command was executed.

Additional cases cover valid zero-change verification, reconnect after failure,
file-backed restart, Trip switching, overlapping wakes and churn immediately after
recovery. A wake and eventual finite churn are required for eventual convergence;
there is no server push or instant-freshness claim.

## Configured Release and DeviceHub evidence

- Device: Leon's iPhone16pro, iPhone 16 Pro, iOS 27.0.1 (DeviceHub observation).
- Signed Release built with Xcode, existing bundle ID `com.xoery.otrmobile` and
  signing team `U9D5C58Z94`. Local deep/strict signature trust verification did
  **not PASS**: the saved output is `CSSMERR_TP_NOT_TRUSTED` (arm64). Trust
  verification is **NOT ESTABLISHED / PENDING**; successful install and launch
  remain separate observed evidence.
- Final embedded bundle SHA-256:
  `bedef1d5160b905c18a151b47f62d631c35d3ddc166bad74a7e02de08d9d7c65`.
- These device checks used the pre-correction wake build identified by the hash
  above. The P1 containment correction has not been rebuilt/reinstalled on-device;
  its verification is the real-owner automated coverage below.
- Installed over the existing app without uninstall, reset or data wipe; launched,
  terminated only its process and relaunched successfully with `devicectl`.
- Acceptance build disables dotenv loading and uses dev transport with API/auth
  URLs `http://127.0.0.1:9` and a local placeholder public key. This gives an
  unreachable backend without contacting Hosted Dev/Production or acknowledging
  the device's real queued financial operations. No fake transport was installed.
- DeviceHub visibly showed the main Today shell after restart, without a blocking
  sign-in screen. This proves shell availability with the safe offline build; it
  does not prove interactive Ledger screen access or renewed server verification.
- DeviceHub shows a live physical screen, but attempted Ledger-tab clicks and its
  Home menu action did not change the screen. Foreground, Trip and Account UI
  scenarios therefore remain unverified. No switch success is inferred from local
  Account rows, and iPhone Mirroring was not used after the user selected DeviceHub.
- SQLite advanced from existing migration 41 to 43. Migration 42/43 added only the
  already accepted fields; uncertified legacy state was not promoted to fresh.

The pre-install, post-launch and post-restart snapshots match on every preexisting
column of these tables, including row contents, not merely counts:

| Preserved table        | Rows before / launch / restart |
| ---------------------- | ------------------------------ |
| `ledger_journeys`      | 21 / 21 / 21                   |
| `ledger_members`       | 64 / 64 / 64                   |
| `ledger_actor_context` | 22 / 22 / 22                   |
| `ledger_sync_cursors`  | 23 / 23 / 23                   |
| `ledger_expenses`      | 599 / 599 / 599                |
| `sync_operations`      | 162 / 162 / 162                |
| `account_local_state`  | 2 / 2 / 2                      |

Raw device databases are local temporary evidence only, not committed. Local logs
and summaries are under `/private/tmp/otr-i2b3-evidence`: RED/GREEN wake logs,
`focused-final.log`, `two-client-tests.log`, build/signature/install/launch/restart
logs, and both preservation summaries. They are machine-local and not a portable
CI artifact. No credential or financial row payload is reproduced in this report.

## Changed files and remaining gate

- `src/data/bootstrap/defaultBootstrapDependencies.ts`: minimal global wake edge.
- `src/data/bootstrap/defaultBootstrapDependencies.test.ts`: reproduced wake regression.
- `src/data/bootstrap/participationWakeAcceptance.test.ts`: local SQLite/two-client integration acceptance.
- This report and `docs/CURRENT_IMPLEMENTATION_STATE.md`: acceptance handoff.

Biggest remaining risk: physical background/network scheduling and interactive
Account/Trip switching with an actual certified backend are not established by the
safe offline device build. Two physical clients with remote participation mutation
require separately authorized remote state and remain PENDING.

Recommendation: submit this bounded wake fix and evidence for human/independent
review. Do not enable I2C now. Local read convergence is established; unresolved
physical cases must remain visible when deciding the next approved checkpoint.

Production accessed: **NO**. Hosted Dev accessed/mutated: **NO**.
I2C lifecycle command enabled: **NO**. Protocol/schema changed: **NO**.
New polling worker/timer added: **NO**. Sibling worktrees modified: **NO**.
Commit: **NO**. Execution stops at review pending.
