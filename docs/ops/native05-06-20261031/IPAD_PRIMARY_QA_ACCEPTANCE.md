# Native-05 — iPad Primary QA

Status: **Business Golden Slice PASS**: install, normal OTP, P1 Cloud Create/Edit,
independent readback, cold Session/data and external P3 downstream. Independent
OTR automation passed earlier; its current reconnection is **PARTIAL — system
Touch ID Enable UI Automation awaits Owner confirmation**. No iPhone required.

Golden Slice: normal Email OTP on the reset iPad → existing Account B → normal
P1 Create/Edit → formal receipt/independent Supabase readback → cold recovery →
another legal client creates P3 and the foreground iPad downloads it. Reuse the
existing Auth, Form, Repository, Queue, Core and Downstream paths.

## Actual device and build

- iPad Air5/iPad13,16, UDID `00008103-00113914020B401E`; freshly read iPadOS
  **27.2/24B119**, paired/wired, Developer Mode and DDI services available.
  Owner reset/upgraded it; Native did neither. No iPhone action.
- Latest accepted main source `5c765fa6`; **Build127**, full new physical arm64
  Native compile with Xcode27.1 SDK, production embedded JS
  `418879af90a68e3f5794ad07fed215cc04eb4b4a3c85f19e60297c987845cea4`.
  Bundle `com.xoery.otrmobile.ipadqa`; supportsTablet=true, actual family[1,2],
  minimumOS16.4; existing `otripadqa` deep link. Approximately201MB installed.
- Existing exact-bundle profile includes this UDID and matching local development
  certificate; strict nested codesign verification PASS. App profile expires
  2026-11-05T20:20:57Z (Nov6 09:20 NZDT). Personal/local provisioning is factual;
  paid Developer Program activation is **not assumed**. Existing Runner profile
  has its separately documented earlier expiry.
- Keychain group is only `U9D5C58Z94.com.xoery.otrmobile.ipadqa`. No main-device
  Session/Keychain/SQLite copied. Exact iPad bundle was absent before installation;
  no personal App, Pilot Helper or Runner was overwritten/uninstalled.
- Existing DEV API and Supabase configuration retained; General Cloud and Manual
  Sparse P2 environment gates enabled, Import Admission flags false. Google OAuth
  for this separate bundle is not qualified; use normal Email OTP.
- Owner reported approximately30GB available; CoreDevice exposed64GB total but
  not an exact remaining-space figure. The201MB installation actually succeeded;
  no cleanup or invented free-space measurement.

## Real OTR automation

- Fixed agent-device0.21.33, previously reviewed **OTR-only** XCTest adapter,
  explicit `OTR_IPAD_QA_XCTEST_TAP=1`; new Native HOME/STATE/session
  `native05-ipad`, default shared Claim registry. SafeHost wrapper was not used.
- Current signed xctestrun SHA `00774a997eac8d7f6c58d65849ef51af0f7c2f42fa93434bfeaecc69cd2ce2f5`
  and both adaptation module SHAs matched before calls. Live daemon70182's marker
  independently bound the same code, ipados, exact UDID and OTR iPad QA bundle.
- Actual OTR AX1180×820 and original2360×1640 screenshot matched in landscape.
  Fresh menu button center(32,54) opened the actual menu; normal language control,
  English selection, native Back, Account and login navigation succeeded through
  XCTest `synthesized=false`. No52-point adjustment or random coordinate input.
- Controlled text input, navigation/back and a real Day Feed scroll succeeded.
  Buttons with `inheritsLabel:true` inherit their parent AX label; this is not
  evidence of missing accessibility labels. No legacy coordinate offset applied.
- First control-only phase closed normally, with own session/shared claims empty
  and isolated daemon stopped. Session `native05-ipad` was subsequently reopened
  for business acceptance; final release must be checked again.

## Normal login, Cloud and cold recovery

Existing Synthetic B `1f3d7935-1bdc-4952-8d7f-0f72077368c1` logged in through
the actual App Send/Verify flow and genuine QA mailbox OTP. No host Session was
installed on iPad; no OTP/token was printed. Existing B cloud Trips downloaded.
No Guest Trip/Draft existed before login, so no adoption bypass was needed.

Normal Native UI created Trip `8b5ceb55-b3c2-462a-9a15-59de91fdabe5`
(`Native05 iPad QA 1031`) and P1 `c877cf77-ceb3-4459-a698-63da55ef6fc3`,
then edited the same Item to `Native05 iPad Cloud Plan · Edited`.

| Operation | Core receipt | Independent readback |
| --- | --- | --- |
| Create `d2af0f8c-3978-4cf3-8de2-e49c83ddefa1` | `08d235e3-1333-4b0a-92ed-35ffb5be07b1`, APPLIED | Same Item/Actor/Trip, revision1; canonical intent/receipt hashes verified |
| Edit `94a9285f-32ec-4198-9118-2a9d7a95493a` | `8fe50709-e9c1-4f73-9bce-d1744ace8c4a`, APPLIED | One same Item, latest title/revision2; both receipts retained |

Process termination/relaunch recovered the edited title, Oct31 date, Everyone
and enabled Edit without login. Actual authenticated Diagnostics confirmed
SQLite initialized/schema75, AUTHENTICATED_ONLINE, Network online, zero pending
Sync/Itinerary and DEV transport. Guest-only unavailable Diagnostics is not used
as initialization evidence.

## External P3 and foreground measurement limit

The iPad remains on existing lawful B Trip
`eb3a3e70-fe4d-4cff-81f8-9945bc804f28`, Day3/Oct31. First independent normal
Host attempt timed out on receipt GET before any P3 POST attempt; it is not an
APPLIED-to-visible latency measurement. Original P3 Item
`612d7e55-cfa8-4ba7-a625-5e0d622679da` and operation
`83b3a089-9aa0-4048-b6b3-4f08b107b9fb` remain reserved for receipt-first retry.
Host journal confirms normal local logout and refresh-token revocation. Auth's
short cancellation window was returned before retry. No Realtime channel opened.

Coordinated retry: original receipt GET returned404 at19:25:49Z, then the single
original POST timed out at19:26:09Z. Result is **UNKNOWN**, not failed/not-written;
the reserved IDs and immutable command/attempt remain. No Edit or repeated POST.
Independent baseline latency is consequently still unavailable. The second normal
Host Session also completed local logout/refresh-invalid verification. Core Writer
is investigating shared Gateway53300/connection capacity; common cause is unproven.
Further writes paused pending capacity classification and same-operation receipt.
Automation session closed normally after the failed observation; final shared
Claim/session inventory still needs confirmation. Closing an automation session
is not asserted to stop the App's foreground timer.

Same-operation recovery returned FULL/APPLIED receipt
`a7caf546-3fd2-457f-80eb-d9fb7c142acd`, committedAt
`2026-10-30T19:26:07.622898Z`. Original POST started19:25:49.636Z and timed
out19:26:09.644Z; commit occurred about18s after submit and2s before client
deadline. Receipt GET recovery took10.038s. This does not prove purely response
latency or a connection-leak cause. No new object or repeated Mutation was needed.

Independent Supabase exact Actor/Trip/Item read confirmed one P3/revision1, title
`Native05 Remote Stay 1031`, original operation and APPLIED receipt; canonical
intent/receipt hashes verified. Real iPad screenshot `p3-recovery-visible.png`
shows the same P3 on Day3/Oct31 at18:00, Check-in, using the existing Reader.
No local P3 Create or forced refresh. Because the observation was interrupted by
Host failure, tool reconnect and system modal, **no continuous foreground latency
distribution or1–5s PASS is claimed**. Cold recovery proof is the P1 process restart;
external P3 cold restart is not additionally claimed.

Independent Device Automation review of the first bounded control phase:
`NATIVE05_CONTROL_GOLDEN_REVIEW_20261031.json`, NO_BLOCKER. It does not independently
certify the later Cloud operations. iPhone remains untouched. iPad is the default
Native physical QA target; resuming autonomous taps currently needs only the
visible system Touch ID confirmation, not a new login or copied Session. The
modal screenshot was sent to Device Automation; no signing/coordinate redesign.

Private build/signature/UI evidence:
`/private/tmp/otr-native05-20261031/{BUILD_IDENTITY.json,install.json,runner-pins.json,first-ax.json,first-launch.png,menu-after-tap.json,email-input-ax.json,local-ui-claims-after.json,local-ui-sessions-after.json}`.
No raw credential or OTP is included in this report.
Additional private evidence: `native05-b-challenge.json`,
`p1-create-independent.json`, `p1-edit-independent.json`,
`p1-create-validated.json`, `p1-edit-validated.json`, `p1-cold-settled.json`,
`account-diagnostics-settled.json`, `BASELINE_OBSERVATION_FAILURE.json`.
Recovery evidence: `p3-recovery-receipt.json`,
`p3-after-unknown-independent.json`, `p3-create-validated.json`,
`p3-recovery-visible.png`. The normal recovery Host Session also revoked itself.
