# P1 Manual full regression — Owner requested 28 October 2026

Use the current unified Forms QA build, normal Synthetic account and independently created Trip. Existing P1 capability only; no Import Admission, new authority, second queue or reset. Device/API mutation windows remain serial with Auth/Universal.

| Scenario | Required evidence | Current execution |
| --- | --- | --- |
| Create with title, place, note and legal participants | Native Save → existing Queue → APPLIED receipt → independent Supabase same ID/fields | PENDING_NATIVE |
| Edit accepted same Item | Actual revision, text/place/schedule/participation, second APPLIED receipt and independent latest readback | PENDING_NATIVE |
| Date-only, timed, cross-day and floating local time | Legal Form round-trip; chronological Day rows and correct boundary/day-offset display | PENDING_NATIVE |
| Cancel/discard and save failure recovery | No unintended mutation, draft input retained as contracted, normal retry | PENDING_NATIVE |
| Offline Create/Edit then reconnect | Durable pending, latest user intent preserved, accepted without duplicate Item | PENDING_NATIVE |
| Duplicate dispatch and transient failure | Same immutable operation/receipt and one Item; legal worker retry/backoff | PENDING_NATIVE |
| Concurrent/stale Edit | Conflict surfaced, server latest retained; no silent overwrite | PENDING_NATIVE |
| Participants and account/creator/trip isolation | Supported participant modes only; wrong account/creator/trip rejected, no stale UI leakage | PENDING_NATIVE |
| Reader and interactions | Actual Day Feed/Browse/Focus/Immersive; Focus quick-add default time, long-press move, Edit/back and shared actions | PENDING_NATIVE |
| Cold recovery and presentation | Same Item/latest fields/sync state; date/calendar/keyboard/Safe Area, EN/ZH and light/dark representative checks | PENDING_NATIVE |

Reuse existing manualPlanRepository, tripNormalSync, QueueActivity and Core worker tests; directed results are L2, never Native/Cloud evidence. Independently record Create, Edit, SERVER_ACCEPTED, SERVER_VERIFIED, recovery and negative results. Existing historical P1 E2E remains historical until this pass runs. No unsupported photo/document/expense-link or participants-only visibility implementation is added to this test task.

Directed baseline on unified6710a380: manualPlanRepository, tripNormalSync, tripNormalQueueActivity and tripCoreV2SyncWorker —4suites95PASS. These shared checks do not complete any P1 Native row above.

UI/domain directed baseline on current consumer-fix branch: P1PlanEditor, PlanParticipantsField, TripCalendarRangeField, DayFeedCalendarSheet, coreP1Renderer, P1Row, p1InsertionTime, localInsertionTime and p1CivilMove —9suites88PASS. Log retained privately at /private/tmp/otr-manual-p4-cloud-20261028/p1-full-ui-directed.log. These cover local behavior only; actual FormsQA/Cloud matrix remains pending the next serial business window.
