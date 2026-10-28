# UX Blueprint — Trip Home / Day Shell V2
Date: 2026-10-18

## A. Trip Home layout
- Edge-to-edge 30%-ish screen Hero with no corner radius. System status and glass Menu / square-pen Edit / Search float above. Name, date range, destination at lower-left, matching My Trips order/type scale. When Hero is offscreen, translucent one-line Trip Name top bar appears.
- Below Hero: small unobtrusive widget switch tabs only when >1 widget. Swipe between widgets; widget height is intrinsic, not fixed. Last valid local projection paints immediately; background refresh should not flash empty state.
- Active Today: concise day summary; relevant stays/items; empty state with meaningful Add/Import/Open Day, no diagnostic jargon. Upcoming Preparation: compact category metrics, recent additions, action links for unmet setup. Spending: Group/My totals, short category/recent list, consistent navigation actions.
- Below widget: durable Members/Photos/other relevant links, actual status and invitation cues. Trip Menu exposes Trip destinations and global destinations with clear grouping.

## B. Edit Trip sheet
Top row: Cancel | Edit Trip | Save. Name; optional multi-destination; one optional start/end range calendar; cover recommendation and choose own photo; actual currency setting/link; Members link if needed. Never show internal service/debug statements. Save on-device then close; sync state elsewhere.
Date picker: months stacked vertically, continuous scrolling and highlighted range, one selection sequence, Done/Cancel, Clear dates. Keep user-confirmed Trip bounds unchanged by external-day items.

## C. Day Shell top and calendar
- Initial view: glass Menu/Search controls float; Trip name, date range with down-chevron, destination shown in scrollable textual Trip header. Top bar center blank while this header is visible.
- Scroll beyond Trip header: compact translucent header center shows single-line visible Day/date span with down-chevron; dynamic text should never overlap body text.
- Calendar sheet: month grid, highlighted trip range, gray nontrip days, compact place-transition label under date (where verified), 2–3 data-qualified dots. Tapping date anchors to Day Header; Day 1 anchors to Trip Header.
- Bottom: floating native shell visible when idle, hide nav on upward scroll leaving Capture; restore nav on reverse scroll. Never obscure last content row.

## D. Native behavior gates
Scroll smoothness with 60–120 days; no stale Today route flash; stable semantic bookmark; local-first widget/Day; dark/light/Chinese/English; safe area, Dynamic Type and VoiceOver; no overdraw of glass header text.
