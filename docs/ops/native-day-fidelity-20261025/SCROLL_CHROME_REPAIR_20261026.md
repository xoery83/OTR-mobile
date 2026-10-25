# Real Day scroll chrome repair — 26 October 2026

Fixed source commit: `797f959b`.

Owner reported that forward reading did not hide the real top/bottom controls like the approved preview. Three omissions were found: native Menu/Search never consumed dayShellChrome; only the navigation island consumed it while quick-add remained visible; the real list subscribed to a stop callback that restored navigation immediately after momentum ended.

## Behavior and owning seams

- Keep the existing 32pt forward / 8pt reverse reading thresholds. Actual finger reading motion remains distinct from programmatic jumps and MVCP offset compensation.
- TripRoute consumes the existing Trip/generation-scoped dayShellChrome to omit native Menu/Search while reading forward. The native date range title stays accessible, so the calendar remains reachable. My Trips, Create and Home are unaffected.
- ExperienceBottomShell applies the same scoped visibility to its whole content row, including quick-add. Opacity, hit testing and accessibility change together; shell/list height remains reserved, preventing content reflow.
- TripScreen no longer subscribes ordinary reading stops to the force-show callback. Forward settled reading stays hidden; slight reverse movement restores the controls. Initial Trip introduction keeps its actions visible. Move pickup still hides both chrome regions and its existing finish callback restores them.
- No navigation destination, Core/Reader authority, Import path, Backend/Auth/schema or stored business data is changed. These are minimal source candidates on the independent worktree; shared Route/Shell differences must be applied serially by the owning writer.

## Checks

Independent scoped review found no new blocker; four-file rerun106PASS/one same baseline failure.

- Seven affected suites: 184 PASS, one known baseline test skipped in the final focused rerun. Initial full run had that same one failure: ExperienceBottomShell `My Trips keeps only the real Start Trip action without redundant left navigation`, expecting onImport to navigate /capture. Re-ran that assertion against the unmodified HEAD component and reproduced it exactly. It is not marked PASS or expanded into this repair. Temporary comparison files were removed.
- TypeScript, UI guard and diff check PASS. Scoped ESLint: zero errors, one existing optional-native-loader require-import warning at ExperienceBottomShell line63.
- Forms QA real Trip: forward gesture removed Menu/Search and the entire bottom row, date range remained and updated with actual viewport dates; after native settling the controls stayed hidden. Reverse gesture restored Menu/Search, navigation destinations and quick-add. No form Save or Import execution occurred.
- Screenshots: `/Users/xoery/.codex/visualizations/2026/10/25/01a17101-8b2d-7240-ab67-f4c34a5d90d9/native-day-fidelity/scroll-chrome-20261026/forward-settled.png` and `reverse-restored.png`.
- This observes visibility transitions; it does not certify full scroll frame pacing or the separate pending P1 continuous move/Confirm acceptance. Cloud gates unchanged; AD5 untouched.

Include this source candidate after d0ae8f14 and the cumulative Forms/Day ancestors in UI_DETAILS_INTEGRATION_20261026.md. Do not overwrite current Universal/shared-shell source wholesale.

## Required follow-up: idle host release (`31af6637`)

Owner retest correctly found that ordinary release could still restore chrome. The preceding Native observation was insufficient: useP1Move's stable host receives ordinary feed touches too, and its end/cancel called onFinish even without an armed drag. Real onFinish calls the force-show shell reset. This separate callback path supersedes the earlier claim of complete settled-release coverage.

The controller now returns immediately when drag.current is absent. An actual drag clears that reference before its finish callback, so responderRelease plus bubbling touchEnd cannot notify twice. Idle release, cancel and inactive AppState cause no move-finish chrome change; actual pickup release/cancel still notify exactly once.

98 directed tests across four files PASS, TS/UIguard/scopedlint/diff check PASS. Added a regression for all idle events and duplicate actual-drop notifications. Independent review found no blocker; controller/shell rerun22/22 PASS. Forms QA ordinary forward gesture stayed hidden at delayed inspection and after an extra blank tap/release; screenshot idle-release-still-hidden.png retained beside earlier evidence. Reverse movement restored native Menu/Search; an incidental Add itinerary panel was closed without creating an Item. Full P1 continuous move/Confirm and scroll frame pacing remain separate acceptance gaps.

Serial integration must include both797f959b and31af6637; the first commit alone does not fix the ordinary touch-end path.

## Transparent reading stage and framed date control (`dbc93d61`)

Owner clarified that reading chrome must leave only the rounded native-material date filter. Reused existing UiGlassSurface and DayFeedShellTitle, matching the approved preview's date island. After the Trip introduction, the normal native title uses this frame; reading-only state hides the owning native header itself and displays that same date control at the safe top. Reverse reading restores the native header; active Item move hides both date hosts. No new calendar, menu, search or navigation destination exists.

Explicitly disabling blur/edge effects alone still left a UIKit bar-wide fade in actual iOS observation. Hiding the bar removes that layer. The last nonzero header measurement is retained as React state, preserving the list's original top boundary when UIKit reports zero; no list remount or inset collapse is used. System status elements remain native.

100 tests across four files PASS, TypeScript/UIguard/scopedlint/diff check PASS. Tests cover iOS25/27 options, one reachable date island, zero reported header height retaining103pt inset, reverse restoration and prior idle-release guards. Independent scoped review69/69PASS; no blocker. Forms QA real reading state visibly retains only framed date control and no bottom shell; date press opens the original calendar. Native screenshot: scroll-chrome-20261026/transparent-date-island.png in the existing evidence root. Full multilingual/Dynamic-Type/rotation matrix was not repeated; cloud and P1 continuous-move acceptance are unchanged.
