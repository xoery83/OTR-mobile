# Real Day / P1 repairs — 26 October 2026

Owner reports missing covers, destinations, raw P1 clocks, real movement, Edit Trip autocomplete and three-phase backgrounds. This supersedes the preceding real-data slice's clock-hidden/civil-move-pending UI decision, under the latest Owner correction. Core time qualification and Cloud gates are unchanged.

## Fixed / verified

- Both QA covers failed because the lane's Metro8096 had stopped. Restarted only that server; the exact built-in image returned HTTP200/200564bytes. Cold FormsQA list and Home visually displayed both real Trip covers, including the normal selected Auckland skyline. No Cover Repository or access authority changed. This is a debug-runtime recovery, not a claim that a Metro-dependent build is standalone/offline-ready.
- Day introduction previously read legacy discovery.destination only. It now reads structured destinations through the existing scoped local Trip Repository, and uses the same tripDestinationDisplay as Home/Edit. No second metadata reader or SQLite path. Native Day AX shows Auckland · Wellington.
- Owner now requires authored P1 clocks in Browse/Focus. Raw local23:31 is visible; any visible primary or secondary clock lacking qualification keeps the timezone-unconfirmed message. This does not qualify time comparisons, NOW, DST, navigation or sync.
- Edit Trip autocomplete uses the existing CreateTripDestinations/Apple provider. After the normal runtime refresh, native Wellington query produced five Apple matches. Selecting Wellington,NewZealand and normal Save retained Auckland plus Wellington; Home and Day read back the same ordered summary. No parallel autocomplete was added.
- Real and fixture share dayFeedPhaseColor: Past=dayPast, Today=surface, Future=dayFuture, and the existing DayFeedFidelityHeading supplies its full-width38pt transition. The old real code incorrectly used surface for all future days. With an unknown view zone, device civil date is decoration-only; the owning Reader stays Floating and receives no new Today/NOW/time authority. The semantic Day title still follows its existing qualified context.

## Real move implementation

Moved the already-approved gesture UI/cursor into shared useP1Move/p1MoveCursor; the DEV fixture is now a small source adapter. Real pages import no fixture pack, identity or fake item source. Same direct-finger line, static middle, edge-only scrolling, horizontal precision, geometry-based Day/clock mapping, empty-Day height and uncluttered chrome behavior are retained.

useP1CivilMove reads actor-filtered localManual P1 and obtains editable drafts from existing ManualPlanRepository.read. Only unresolved civil schedules with no zone/instant are enabled. Confirm calls that same Repository.save on the same Item/draft, preserving title/place/participants/notes, known civil interval and date-only end offset. It creates no instant, named zone, second queue or mutation authority. Named-zone/instant schedules fail closed until an owning mutation path can preserve their evidence. Civil arithmetic uses UTC solely as a calendar calculator and never stores its intermediate instant.

Failures retain the confirmation and original frozen draft for identical retry. Cancel after a failed attempt clears preparation, rereads normal Reader/draft and permits a new target. A synchronous busy guard prevents same-frame double submission. Generation/fingerprint/read-scope and the Repository's normal revision/conflict guards remain in force.

## Validation and remaining acceptance

-208 directed tests across15files PASS; TypeScript, scoped lint and UI guard PASS.
-Independent Review found secondary-clock qualification and frozen-draft-after-Cancel defects; both fixed. Independent specified5file rerun124/124 PASS. Additional background, actual row→gesture callback and native longpress-handler tests pass.
-Real SQLite Repository test proves CREATE then same-ID cross-day schedule update, one retained Item, failure/rollback, old-draft FROZEN and fresh-draft recovery. Hook tests exercise identical Retry, Cancel→new target, no synthetic preview update and double-submit protection.
-Native cover, actual Apple search/selection/save, real destination summary, raw start clock and ordinary Focus were observed on FormsQA. Current normal QA P1 is still its original Item/time, not silently moved for this report.
-CUA held-click attempts did not produce a provable native pickup/continuous-drag receipt. Do not mark Native drag/save/cross-day gesture E2E PASS. Owner's actual continuous drag/release/Confirm and cold read remain acceptance work; the real save adapter is now implemented and independently tested.
-Three-phase palette/helper and native gradient component are regression-tested; the full new real Light/Dark/cross-midnight screenshot matrix remains unaccepted. No Cloud request, Backend change, AD5 data or other simulator session was used.

Forms QA: C0C23E00-5016-4289-B806-92C5484BD5BA, Metro8096, normal synthetic Session. Read-only post-repair receipt records2P1manual intents,5total Trip-scoped queue rows, attempt_count0; normal metadata edits account for added operations. No P1 move operation or Native move PASS is fabricated. Screenshot/evidence root: `/Users/xoery/.codex/visualizations/2026/10/25/01a17101-8b2d-7240-ab67-f4c34a5d90d9/native-day-fidelity/real-repair-20261026/`.

Owning interfaces changed: only Day/P1 presentation/controller adapters, TripScreen's existing repository consumption and existing Native chrome visibility seam. No Core/Temporal/Schema/Navigation Shell implementation changes; no merge into Universal or main. Status: `REAL_DISPLAY_REPAIR_READY / CIVIL_MOVE_IMPLEMENTED_NATIVE_TOUCH_PENDING / CLOUD_PENDING`.
