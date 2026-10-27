# Native Home/Day retention — 27 October 2026

## Scope and policy

Presentation lifetime is bounded to one Trip and account generation. Keep Home Widget and Day FlatList mounted in stable hidden/visible slots. Existing Repository reads remain authoritative; no global/disk business cache. Home/Day tab switches reuse their content, Focus and reading position. Focus/foreground, the existing Today minute refresh, Manual outcomes and sync-completion continue the existing guarded Reader refresh. Access removal/read failure still clears invalid data; Item resolution is freshly validated before actions.

The root key now uses generation, Trip ID and Create mode, rather than mutable route/view parameters. TripRoute keeps the same content-frame tree. Reader callbacks depend on Trip/generation scalar context, not changing view/bookmark objects. Initial Trip result publishes after metadata/snapshot lookup; READY refresh retains the current frame. Stable row IDs and existing source fingerprint/layout revision remain in use; no virtualizer sizing or business ordering changes.

Day horizontal responder returns to same Trip Home after a deliberate horizontal drag. Existing native Home back remains; usePreventRemove protects Day POP/GO_BACK, while explicit My Trips and route replacement re-dispatch their original action. Active Move keeps its original handlers; Move capture/cancel/terminate/multi-touch clears swipe state.

## Owner follow-up

- Day Feed and shared Trip/Form Calendar date cells, Today tint and selected endpoints are rectangular. Range highlight uses the existing semantic reference color and selected activity range uses accent.
- P4 receives both Trip dates from ManualItineraryContent, and reuses the existing P3-style Repository fallback for direct Edit entry. Same-as-pickup checkbox copies only authored address text, tracks subsequent pickup changes while enabled, and preserves independent return editing when disabled. No Place qualification is invented.
- Unknown-zone Home Widget previously borrowed the saved Day reading date (26Oct). It now uses current device-local civil day only as presentation context; known-zone selection remains existing Reader behavior. No Item time/zone mutation.
- Existing outdated P4 Home test now expects its native Detail route; optional booked-class fixture assertion made type-safe. No P4 production behavior changed by those test repairs.

## Verification

7 directed suites / 173 tests PASS (TripScreen.homeWidgets, P4RentalEditor, TripCalendarRangeField, DayFeedCalendarSheet, WindowedDayList, TodaysJourneyWidget, RentalRow); typecheck, UI guard, scoped lint, diff check and dedicated physical embedded build PASS. Independent scoped Review closed explicit-MyTrips and Move-cancel findings. These are local Native checks, no Cloud claim.

R23 installed over dedicated `com.xoery.otrmobile.formsqa` without deleting its data. Physical Mirror observed current Tue27Oct instead of prior Mon26Oct, fully populated mixed P1/P2/P3/P4 Day, horizontal return to same Home with Widget already populated, and rectangular P3 Calendar with Trip reference tint. No Save during these checks. P4 normal Create displays the same-as-pickup checkbox; checking it disables independent Return input. P4 Calendar shows rectangular Today, pale Trip24Oct–22Dec reference and distinct accent28–29Oct selected range. Calendar selections and Create were canceled, no Save. Address-copy/change/uncheck is covered by the directed component test; no new Rental was saved for this repair.

Evidence folder: `/Users/xoery/.codex/visualizations/2026/10/25/01a17101-8b2d-7240-ab67-f4c34a5d90d9/native-day-cache-20261027/`.

No main merge, Backend deployment, schema, Auth, Import or AD5 operation. Retaining both virtualized views uses additional bounded per-Trip UI memory; no benchmark or full accessibility/locale matrix completed in this pass.

## R24 physical follow-through

R23 Widget Open Day exposed an existing null-zone entry defect: `openToday` stored empty zone without FLOATING mode, causing `DAY_ZONE_INVALID` in AcceptedDayFeed. Fixed at the existing entry boundary with `viewContext`: unknown view zone is null/FLOATING in context, serialized as empty zone plus explicit FLOATING in route params; known IANA stays NAMED_ZONE. Directed tests assert both paths, including the actual onOpenLocalToday caller. R24 build/install and physical normal Home→Widget Open Day now show Today27Oct, correct P3 checkout and next-day P4 return, with no render error. Day Calendar square Today/selected cell also observed and screenshot recorded. No Save or Backend action.
