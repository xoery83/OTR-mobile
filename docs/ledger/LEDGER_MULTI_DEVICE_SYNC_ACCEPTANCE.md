# Ledger Multi-Device Sync Acceptance

Date: 2026-09-15

Status: accepted on two Simulators and one physical iPhone.

## Scope And Configuration

- Worktree: `/Users/xoery/Project/otr-mobile-canonical`
- Branch: `integration/ledger-polish-canonical`
- Hosted Dev project: `tuqigdxrvrerfewsxqgm`; Production was not accessed.
- The ignored Dev environment files were restored from the previously working Mobile
  checkout. The Release API base resolves to the local Backend rather than fake
  transport. Secret values are neither committed nor recorded here.
- No Backend, schema, protocol, Replay, realtime, or financial-semantic change was
  made.

## Delivered Behavior

- A successful local Expense Save keeps its existing immediate navigation and then
  asynchronously kicks the existing durable sync worker. Network failure is absorbed;
  the queued operation remains durable.
- Ledger focus, foreground, Journey change, and reconnect trigger the existing
  cursor-based reconciliation. Visible, active, online Ledger screens poll every 8
  seconds.
- Active Ledger sync reuses the launch/foreground refresh-before-sync path. Expired
  Dev access tokens are refreshed before push/pull, and concurrent lifecycle and
  Ledger triggers share one refresh/sync run.
- Pulls coalesce per Journey. Screen triggers do not overlap, a trigger received while
  running schedules one follow-up, and results from an old visibility/Journey
  generation are ignored.
- The quiet status line has four truthful states: `Syncing`, `Up to date`,
  `Offline · saved data is available`, and
  `Changes waiting · saved on this device`. Pending conflicts count as waiting.
- Selecting an uncached Journey performs its existing bootstrap before loading the
  projection; this was required for a clean second app container.

## Acceptance Results

| Check                                      | Result | Evidence                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simulator A online create                  | Pass   | `Sync A 1855`, NZD 12.34, saved locally immediately and queued without blocking navigation.                                                                                                                                                                                                                                               |
| Simulator B automatic receive              | Pass   | Stayed on the same Ledger and received `Sync A 1855` within the visible polling window without refresh or restart.                                                                                                                                                                                                                        |
| Offline create and reconnect               | Pass   | Simulator A saved `Offline A 1902`, NZD 7.89, showed Changes waiting, retained one durable failed operation, then moved through Syncing to Up to date after reconnect; Simulator B received it automatically.                                                                                                                             |
| Conflict preservation                      | Pass   | Two offline edits started from revision 1. The first became revision 2; the second remained `CONFLICT` with an OPEN conflict holding distinct submitted and canonical values. No silent last-write-wins overwrite occurred.                                                                                                               |
| Journey isolation/restart                  | Pass   | Cold relaunch restored Stage 9 data; switching to the synthetic Journey exposed only its conflict/pending state and did not overwrite another Journey projection.                                                                                                                                                                         |
| Polling lifecycle                          | Pass   | Focus/foreground/reconnect trigger immediately; polling stops off-screen, in background, and offline; controller tests verify coalescing and stale-result rejection.                                                                                                                                                                      |
| Simulator Release safety                   | Pass   | iPhone 17 Pro `BCC677C3-5823-44B1-BCEA-C24287AD6E4A` and iPhone 17 Pro Max `AF9AAA65-D868-40AA-906B-632C229C32A5`; identical signed Release bundle SHA-256 `77ee5c47ca1488b71cf9c6c4766139ac785f181f0d288b98dde4619661e8e5f3`. The installed build contains no configured acceptance credential value or Ledger prototype marker.         |
| Physical Release build/install/cold launch | Pass   | Leon's iPhone 16 Pro, iOS 26.6, `com.xoery.otrmobile` 0.1.0 (1); final signed Release bundle SHA-256 `0f91de34d05e3fab5823bc5f6200a41727d478b44385102b5446339ac963b1df`. The app installed and launched through CoreDevice and contains the real Dev API base, no configured acceptance credential value, and no Ledger prototype marker. |
| Physical automatic receive/edit            | Pass   | The iPhone received `Sync A 1855`, renamed it to `Phone Sync A 1855`, and both Simulators received revision 2 automatically without manual refresh.                                                                                                                                                                                       |
| Physical foreground pull                   | Pass   | While the iPhone was backgrounded, the canonical Dev Expense was changed to `Foreground Pull 1940`, revision 2, through the existing authenticated Backend route. On foreground, the iPhone immediately pulled it and the user confirmed the result.                                                                                      |

The two Simulators used independent containers with the same approved Dev account.
This proves same-account device-to-server-to-device propagation and local SQLite
isolation. No approved dual-identity fixture was configured for this run, so
multi-account authorization was not tested and no identity mapping was changed.

## Acceptance Defect Found And Fixed

During the physical foreground check, an already-open Simulator stopped receiving
changes after its access token expired and reported Offline. Cold launch refreshed the
session and recovered, proving the active Ledger path had bypassed the existing
refresh-before-sync lifecycle helper. The active path now calls that shared helper,
and simultaneous foreground/Ledger requests coalesce. Focused regression tests cover
expired-token refresh and coalescing.

The final Simulator validation used separately authenticated Dev sessions and a signed
Simulator build so SecureStore could persist rotated tokens. Simulator B finished
`Up to date`; Simulator A truthfully finished `Changes waiting` because the deliberate
conflict fixture remains unresolved. Neither device finished Offline.

TypeScript, ESLint, and all 66 test files / 224 tests pass. Production was not
accessed.
