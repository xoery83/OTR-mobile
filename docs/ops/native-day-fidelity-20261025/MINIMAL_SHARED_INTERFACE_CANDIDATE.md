# Native Fidelity UI integration candidate

Owner authorizes independent UI/fixture lane; Universal business interfaces remain untouched. Current source cdd9d27 + retained P3 fixes through cab1fbbb. No active Universal branch edit/merge.

Proposed optional `DayFeedPresentation` UI-only seams: renderDayHeading(date,empty), wrapDayRow(date,node), list style/underlay. They change layout only, retaining composeDayStream, queryForDate, row keys, repository filtering, clock, list scrolling and save authority. Need serial integration by owning DayFeed writer; coordinator notified before implementation. Current formatDayHeading only accepts string, so it cannot express approved Today/number-badge regions. Pending this seam, work on P1/P2 components, frozen fixture adapter and native calibration continues.

Existing renderer prop already accepts per-row readonly rendering contributions; use it for frozen synthetic read fixtures. Frozen pure move math is reused only inside the explicitly gated DEV fixture subtree after Owner requested the interaction pilot. It is never imported by Core, a production Reader or a mutation/queue port. P1 auxiliary Note/participation/media/expense/navigation facts require authorized owning reader. Basic DayEvent lacks these. Real accepted P1/P2 records absent in dedicated FormsQA account; do not import AD5 data or turn Candidates into Items. Existing Lab Core reader currently projects P2 and flags P1 unsupported; real P1 integration must use the authorized production read path or a serially qualified port, not a new reader.

Global TripScreen/native Header/ExperienceBottomShell need a separate fixed UI-only integration patch for DS-01–07/17. Do not create a parallel navigation shell. P1/P2 component and fixture progress does not wait for that integration.

DS-11 fresh direct entry autofocus must not replace HOME-TODAY-03 Open Today header-only behavior, NOW or resume contracts. DS-12 hides unqualified floating clocks in P1 Browse/Focus only; original values remain in authorized detail. P2 retains Floating clock under its own P2-16 qualification; do not share that eligibility rule blindly.

Owner correction during port: Top Bar date control retains existing AD5/Root behavior: first–last dates actually spanning the current viewport, using formatDayFeedVisibleDates. Calendar selection does not pin a single-day title over a multi-day viewport; latest Owner instruction overrides any frozen DS18 selected-Day10 title exception.

Optional `showTimeUnspecified` UI flag defaults true; fixture sets false to honor DS12 without changing composition or other callers. Optional immersiveContentStyle avoids duplicate detail gutters. Native preview keeps chrome hidden at scroll stop and restores on reverse reading; existing production hook defaults unchanged.

Native follow-up: optional renderImmersiveHeader keeps the canonical header outside the existing modal scroll content; fixture P1 suppresses its nested header. listContentStyle themes the existing bottom padding independently of mint pull-down underlay. showTimeUnspecified=false also omits the empty footer row, preventing zero-height cells from contaminating date viewability. Preview supplies measured headerHeight as existing topInset. No owning list/composition/query changes.


Move effect V1 adds one minimal display candidate: optional DayFeedPresentation.scrollEnabled passthrough to the existing WindowedDayList/FlatList, defaulttrue;5added lines across2files. Only the isolated fixture uses false during pickup. This is fixed on the independent candidate branch for serial integration by the owning Writer; no merge to the active Universal branch. Cursor math, row measurement, mask/line/card and temporary preview remain in the DEV subtree.
