# ER02 Range Picker — bounded local qualification repair

Baseline: reviewed source2929eeb, packet0840eb7. Root's approved Native session is closed and original f87e119/8083 restored. This task performed no Native/Metro/Hosted action.

## Observed and unproven

Root's preserved initial screenshot `/private/tmp/otr-er02-native-run-20261018/create-calendar-before-drag.png` shows October2026, with coherent initial rows. Existing `create-calendar-after-drag.ax.txt` contains September/October/November2027 after the long drag. Second small-drag2028/mixed-date observation is supplied by Root; no saved screenshot was claimed for it. Cancel retained the draft and no Create or existing-Trip write occurred.

The exact Native cause of the year-scale movement is **NOT CONFIRMED**. Neither GUI momentum nor a Native virtualization/anchor defect is ruled out by JSX/component tests. Initial screenshot does not itself prove wrong measured month height. No claim that this local patch resolves Native scrolling.

## Confirmed code/test gaps

1. `getItemLayout` asserted constant month height while the month body was one percentage-width flex-wrapped grid inside a horizontal ScrollView without explicit grid/scroll cross-axis height. JSX tests did not verify seven columns, six fixed weeks or descendant height compatibility. The layout promise was not structurally enforced below the month container.
2. The `initialScrollIndex` prop was recomputed from mutable bounds: a twelve-month prepend changed seed index12→24. Current installed VirtualizedList source (`node_modules/@react-native/virtualized-lists/Lists/VirtualizedList.js` `_maybeScrollToInitialScrollIndex`) only performs this initial scroll once per list lifetime; therefore prop movement is **not asserted as the proven Native jump cause**. It is now frozen for an opening to avoid an unstable initial-position contract while the same list is extended.
3. Exhausted year edges always returned new bounds objects even when clamping left values unchanged, causing unnecessary update churn. No-op edges now retain the identical state.

## Minimal correction

- One explicit weekday row and six explicit seven-cell week rows. Every row and day has one measured-by-construction cell height; columns divide the real grid width numerically, with minimum44pt cells retained.
- Horizontal ScrollView viewport, content container and grid all declare the identical seven-row height; flex grow/shrink is disabled only on that viewport. Month height is the sum of title row + existing gap + grid, exactly the geometry returned to FlatList.
- Existing monthly keys, virtualization3/3/window5, native maintain-visible-content behavior, bounded edge extension and date helpers retained. No retries or new scroll physics/snap heuristics.
- Initial index set once per picker opening; fresh opening resets to the current value. Native boundary compensation still requires real verification.
- Create/Edit callers both reuse TripMetadataFields→TripCalendarRangeField. Selection, optional dates, one-sided bounds, Done/Cancel/Clear and date-only persistence unchanged. No Reader/time/Schema changes.

## Tests and evidence

- New regression checks at text scales1/2.5/4 verify explicit7rows×7cells, chronological dates, 44pt targets, exact child/scroll/item height sum and getItemLayout offsets.
- Same-opening prepend/append checks preserve initial index, unique chronological month keys and exact12-month offset delta. Year0001/9999 exhausted bounds are identity no-ops.
- New tests reject original0840eb7: baseline4 existing checks PASS /6 new checks FAIL. `RED_BASELINE.txt` retained. Source restored in finally and SHA checked before green run.
- Corrected range10tests PASS. Range+Editor+Workspace+realSQLiteEditorMembers36tests PASS. Static checks are recorded at the fixed candidate after completion.
- These tests inspect actual declared styles and component output, **not Yoga/Native measured coordinates or physical inertia**.

## Gate and recovery

State: LOCAL CANDIDATE, pending independent review and a separately authorized Native rerun. Actual date-picker Native remains FAILED/UNVERIFIED after correction; ER02 stays PARTIAL, no UX Accepted. Other Native and historic clauses retain previous status; no197-test-to-Native equivalence.

Root should use a later legal GUI window to check actual month frames against getItemLayout, one slow controlled drag with stop, a small drag, and visible-month identity before/after edge extension. Preserve original data and f87 rollback; do not increase retry counts or infer progress from AX alone. No new Native window is requested/executed by this local candidate.
