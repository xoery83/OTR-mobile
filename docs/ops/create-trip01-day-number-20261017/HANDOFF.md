# CREATE-TRIP-01 Stage2 — confirmed Core Day numbering

Base4d5a617. Owner01_PRODUCT_DELTA dates clause and Stage0 REPORT are authoritative. Limited direct-dependency check only; no Source, Hosted, Schema, NOW/TTR, real data or Simulator operation.

## Actual production gap

- Accepted path: TripScreen→DayFeed→AcceptedDayFeed header, DayFeed.tsx:487, renders section.date only.
- Local-only path: DayFeed→LocalManualDayFeed, LocalManualDayFeed.tsx:89, renders civil(day) only.
- No Day1–N selector/presentation exists in these production paths. There is no existing numbering anchored to Item Coverage to fix. TripScreen:193 range count already uses actual dayFacts Root dates, not coverage minimum; retain it.
- Current calendar coverage integration remains untouched.

## Pure owning helper

src/features/day-feed/tripCoreDayNumber.ts exports tripCoreDayNumber(date, confirmedCoreDates): number|null. Only explicit confirmed Root start is accepted as anchor. No start, invalid/reversed dates, date before start, or date beyond a known end returnsnull. An existing start with unknown end yields relative ordinal only, not a fabricated total duration. The current nullable Root/Create contract already permits that partial tuple. Suggested/Item-derived dates must be passed asnull until confirmed, never promoted by this helper.

Uses existing validateCalendarDate and the existing date-only UTC arithmetic convention; adds no timezone, instant, duration or Item model. Outside-core dates remain available through wholeTripCalendarDates and simply have no ordinal. Dates/Items are never mutated.

## One serial UI handoff (NOT applied)

SERIAL_UI_WIRING.patch is the unique four-file presentation handoff, based on4d5a617:
1. TripScreen's existing DayFeed presentation object supplies one formatDayHeading callback, computed solely from dayFacts (actual scoped Trip Root); never calendarDates[0]/dateChoices[0]/projection Item minimum.
2. Existing DayFeedPresentation carries that callback to accepted and local-only header paths. Both use callback result with existing fallback.
3. Existing en/zh-Hans catalog adds one complete interpolated message; existing date/number locale formatters and UTC date-only display convention remain. No header layout, Renderer, Shell, Calendar or navigation redesign.

The patch touches no working UI file in this candidate. Root/Experience owns serial application/rebase, ui:guard, direct rendering checks and Native acceptance. It is deliberately not auto-applied to the active Day tree. git apply --check passes at4d5a617. No alternate callsites or duplicate Day-number logic should be added.

## Validation and status

35 targeted tests PASS (16 new helper cases plus existing DayFeed.navigation tests), TypeScript noEmit PASS, scoped ESLint PASS, diffcheck PASS. Tests demonstrate Dec14–21 remains eight numbered core days while legal dates13/22 remain in coverage without Day0/Day9; Undated/end-only no fabricated Day1; leap/year/DST calendar arithmetic; explicit Core edit recomputes ordinal without rescheduling Items.

IMPLEMENTED: helper/tests. WIRED: NOT YET (serial patch supplied). RENDERED: NOT VERIFIED. NATIVE VERIFIED: NOT VERIFIED. No claim of complete CREATE-TRIP-01 or Native Day numbering PASS.
