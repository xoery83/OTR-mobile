# P1 Manual full regression — Owner requested 28 October 2026

Use the current unified Forms QA build, normal Synthetic account and independently created Trip. Existing P1 capability only; no Import Admission, new authority, second queue or reset. Device/API mutation windows remain serial with Auth/Universal.

| Scenario | Required evidence | Current execution |
| --- | --- | --- |
| Create with title, place, note and legal participants | Native Save → existing Queue → APPLIED receipt → independent Supabase same ID/fields | PARTIAL_NATIVE: Native49 date-only + Native52 rich Edit; phone56 Create/Edit verified |
| Edit accepted same Item | Actual revision, text/place/schedule/participation, second APPLIED receipt and independent latest readback | PASS_FINITE: Native52 and phone56 same-Item accepted Edit/readback |
| Date-only, timed, cross-day and floating local time | Legal Form round-trip; chronological Day rows and correct boundary/day-offset display | PARTIAL_NATIVE: date-only/floating/cross-day verified; full matrix open |
| Cancel/discard and save failure recovery | No unintended mutation, draft input retained as contracted, normal retry | PARTIAL_NATIVE: phone60 quick-add Cancel PASS; failure recovery open |
| Offline Create/Edit then reconnect | Durable pending, latest user intent preserved, accepted without duplicate Item | PENDING_NATIVE_OFFLINE |
| Duplicate dispatch and transient failure | Same immutable operation/receipt and one Item; legal worker retry/backoff | PENDING_NATIVE_REPLAY |
| Concurrent/stale Edit | Conflict surfaced, server latest retained; no silent overwrite | PENDING_NATIVE_CONFLICT |
| Participants and account/creator/trip isolation | Supported participant modes only; wrong account/creator/trip rejected, no stale UI leakage | PARTIAL_NATIVE: selected participants UI; live isolation negatives open |
| Reader and interactions | Actual Day Feed/Browse/Focus/Immersive; Focus quick-add default time, long-press move, Edit/back and shared actions | PARTIAL_NATIVE: phone60 real Reader/Focus/quick-add PASS; gesture matrix open |
| Cold recovery and presentation | Same Item/latest fields/sync state; date/calendar/keyboard/Safe Area, EN/ZH and light/dark representative checks | PARTIAL_NATIVE: latest accepted cold recovery PASS; full visual matrix open |

Reuse existing manualPlanRepository, tripNormalSync, QueueActivity and Core worker tests; directed results are L2, never Native/Cloud evidence. Independently record Create, Edit, SERVER_ACCEPTED, SERVER_VERIFIED, recovery and negative results. Existing historical P1 E2E remains historical until this pass runs. No unsupported photo/document/expense-link or participants-only visibility implementation is added to this test task.

Directed baseline on unified6710a380: manualPlanRepository, tripNormalSync, tripNormalQueueActivity and tripCoreV2SyncWorker —4suites95PASS. These shared checks do not complete any P1 Native row above.

UI/domain directed baseline on current consumer-fix branch: P1PlanEditor, PlanParticipantsField, TripCalendarRangeField, DayFeedCalendarSheet, coreP1Renderer, P1Row, p1InsertionTime, localInsertionTime and p1CivilMove —9suites88PASS. Log retained privately at /private/tmp/otr-manual-p4-cloud-20261028/p1-full-ui-directed.log. These cover local behavior only; actual FormsQA/Cloud matrix remains pending the next serial business window.

Native49 first actual scenario: normal Form created date-only Plan on2026-11-02 with Everyone, Item1a0f631a/operationc7879eb1. Existing Queue COMPLETED; formal MANUAL CREATE_ITEM APPLIED and independent Supabase readback confirm revision1/title/date/WHOLE_GROUP/no invented start or end clock. Receipt: P1_FULL_REGRESSION_RECEIPT.json. Rich fields/Edit/other matrix rows remain pending. GUI and normalCore window returned to Import immediately after the short Create; independent management read used a read-only transaction.

Native52 same-Item Edit: title/place/note, Nov2 22:37 → Nov3 01:41 and SELECTED_MEMBERS saved through four normal commands; all five Create/Edit Queue entries COMPLETED and APPLIED, independent Supabase revision5/fields verified. Cold launch retains A/four Trips and same Item latest Details without pending dot. Empty participant selection disables Done. Full matrix remains IN_PROGRESS: offline/replay/conflict/live permission negatives and complete gesture/visual cases are not passed. Observed undated-Trip fallback defects: mixed P3/P4 civil ordering, bottom Focus scrolling and quick-add visibility. No Host/SQL/Gate/Provider change; shared window returned to Universal after cold checkpoint.

Phone56 normal newTrip657b regression: Item30a5b3e4 date-only Create, followed by same accepted Item note +03:28 civil-clock Edit, threeAPPLIED receipts/independent serverrevision3. Cold MyTrips/Widget/Details retain A, sameItem/date/time/note/Everyone/noPendingDot; no invented zone/instant. Earlier read was partialrevision2 and UI Pending, but pending-at-exact-kill is not proven; no explicit retry/offline claim. Real dated DayFeed still presents P3 17:00 before P4 01:16/P1 03:28: presentation FAIL, next focused repair applies existing civil ordering to accepted rows without altering qualified/Reader authority. See PHONE56_P1_RECEIPT.json.

Phone58/60 closes the observed dated civil-sort and floating Focus+ defects: accepted P4 01:16→P1 03:28→P3 17:00. Both P1 Focus controls open the existing Add itinerary sheet and normal P1 Form with same-date defaults02:28/04:18; Cancel retained original Focus with no Save/new cloud command. Finite receipts CIVIL_ORDER_REPAIR_20261029.json / FLOATING_FOCUS_INSERT_20261029.json. Full regression remains IN_PROGRESS; no live offline/replay/conflict/permission claim.
