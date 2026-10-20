# ER02 date range layout — independent review

What this change does: `94d8fdb93c6d4bd4a738c428487e17d0ffb908fc` against `0840eb7` makes declared calendar geometry match its FlatList layout contract, freezes the initial index per opening, and avoids no-op boundary churn. It does not establish the cause of the previously observed Native year-scale movement.

**No P1/P2 findings. Verdict: Ship as a local candidate for the next authorized Native check.**

- Reviewed the two code/test files, ROOT_CAUSE_AND_CANDIDATE, current state, applicable UI foundation/terminology requirements and the existing calendar-cell helper. No new copy, color, business date/time semantics, persistence, selection rule or navigation control is introduced.
- Each month now has a title of one cell height plus one existing gap plus a grid of seven cell heights: one weekday row and six week rows. Month container, horizontal ScrollView viewport/content and grid declare compatible heights. Rows have seven explicit numeric-width cells instead of percentage flex wrapping. Therefore getItemLayout length and index×length offset match the complete declared child geometry, without row separators or hidden per-row vertical padding.
- Grid width is at least seven cell widths and otherwise the available viewport width; each cell remains at least 44pt wide/high. Large font scales increase the cell/title height and horizontal extent rather than silently squeezing touch targets. Tests cover scales1/2.5/4 on a narrow viewport. Actual Yoga text metrics, horizontal usability and clipping still need Native confirmation.
- An opening computes a clamped month-number seed index once; ordinary draft selection and later prepend/append do not mutate initialScrollIndex. Closing/remounting the conditional list and opening again resets it to the current field value. Dynamic bounds preserve unique chronological month keys and use unchanged native maintainVisibleContentPosition. Exhausted year0001/9999 edges return the identical bounds object; bounded month arithmetic cannot loop at its clamped endpoint because the loop breaks at the final month.
- Selection ordering, date-only strings, one-sided/Undated values, draft Clear, explicit Done and Cancel remain unchanged. No canonical data or TIME-01 contract changes. Cancel does not emit onChange; layout changes do not save a Trip.

Independent validation: `TripCalendarRangeField.test.ts` and connected `DayFeedCalendarSheet.test.ts` **2 suites / 21 PASS, 381ms**. New tests assert actual declared styles/children, exact height sums, seven columns, chronological dates, frozen index after12-month extension and year-edge identity no-op. Builder's broader36-test/typecheck/ui:guard and six old-source red checks are supplied evidence, not rerun or reclassified as Native evidence by this review.

Remaining Gate: Native measured month frames versus declared offsets, controlled slow drag/small drag, visible month identity after edge extension and reopening/Cancel behavior. The old initial-index prop was not proven to cause the Native jump; VirtualizedList's one-time initial scroll means a changing prop alone is insufficient proof. Inertia and native anchor behavior remain unresolved. Do not mark Native fixed, Native PASS or UX Accepted until that separate check succeeds. No AD5/Metro/Simulator/Hosted operation or product edit was performed.

Reviewed file SHA-256:

```json
{
  "src/features/day-feed/TripCalendarRangeField.tsx": "3cafbb865b61cbc18f119e9881440bbcb6371f66d76785266d05be9d4421c04f",
  "src/features/day-feed/TripCalendarRangeField.test.ts": "0d5b8071bd39c3f4284ccbf62facf5308213bad0f8ba46a7c9573c8644f0cdba"
}
```

Independent log: `/private/tmp/otr-er02-range-independent-20261018.log`; SHA-256 `acea9b716558738f556fe4cb92cf6442760b03c98ba315e580a7b77f02f3f10b`.
