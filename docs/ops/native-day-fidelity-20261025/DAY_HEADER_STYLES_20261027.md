# DayHeader styles — bounded Native candidate, 27 October 2026

## Delivery

`TripDayHeading` wraps the existing DayHeader presentation seam in `TripScreen`.
Tapping its full heading target cycles A → B → C → D → A for every mounted header
in that Trip. Offscreen headers read the same preference when mounted. The local
subscription lives inside each header: no TripScreen load, Composer recomposition,
new list key, selection, Focus/NOW, sort, pagination or navigation mutation is
triggered by a tap. Original civil Today authority remains the caller's `today`.
The existing A format, colors and normal-size geometry remain; B/D stack weekday
or month above day-of-month. Destination labels are single-line/ellipsized; the
full content, Trip day, current style and next action remain in VoiceOver copy.

Preference uses the existing device-local SecureStore approach (as UI locale),
one `otr-day-header-style-v1-<Trip ID>` key containing only A/B/C/D. No login or
network is required. Changes publish immediately; serialized writes prevent rapid
taps persisting out of order. Hydration is coalesced and never overwrites a newer
choice. Storage failure retains the session choice; restoration after relaunch
cannot be promised while device storage itself is unavailable. No new table.

## Exact compatibility boundary / owning gap

**Formal Native destination resolution stays unresolved in this candidate.**
All twelve A/B/C/D × Today/Tomorrow/ordinary fallback cases are implemented.
Resolved single/route labels are supported only by the pure presentation input
and isolated tests; no fixture city enters the real Feed.

Bounded source inspection found:

- `src/domain/trip/tripCoreV2Day.ts:CorePlaceView/corePlaceView` projects qualified
  coordinates, POI place ID and display/address strings, but no qualified city/
  region identity. A qualified POI is not a qualified geographic destination.
- `src/domain/trip/tripCoreV2Views.ts:projectCoreItem` projects participation but
  not GROUP/PRIVATE/SELECTED visibility. WHOLE_GROUP does not prove public scope
  (`coreCanRead` can authorize the owner's private records).
- `src/domain/trip/dayReadModel.ts:DayEvent` includes accepted address locality/
  region, but lacks explicit group visibility and geographic identity; the current
  Core Flight bridge alone is not a lawful route/destination resolver input.
- `Trip.destinations` is an ordered Trip-level list, with no Day binding. No
  explicit confirmed Day destination/route exists in the consumed interface.

Minimum next Owning Reader addition: existing authorized item/place projections
must supply the accepted city/region identity and label together with explicit
shared/group-safe eligibility, Stay coverage and proven ordered transport/date
relations where available. The Core/Reader unique writer owns that projection;
this lane can then add the deterministic Stay/transport/activity precedence,
conflict and account/revision/locale memoization adapter. No schema, new field or
speculative authority was manufactured here. There is presently no derived-label
cache to leak a private location across Accounts.

## Validation / visual level

9 directed suites / **192 assertions PASS**:

```text
npx vitest run --configLoader runner \
  src/features/day-feed/dayHeaderPresentation.test.ts \
  src/native/dayHeaderStylePreference.test.ts \
  src/features/day-feed/DayFeedFidelityHeading.test.ts \
  src/features/day-feed/TripDayHeading.test.ts \
  src/features/day-feed/TripScreen.homeWidgets.test.ts \
  src/features/day-feed/WindowedDayList.test.ts \
  src/features/day-feed/composition.test.ts \
  src/features/day-feed/FlightFidelityGrid.test.ts \
  src/features/day-feed/dayFeedWindow.test.ts
```

Typecheck, UI guard (473 baseline occurrences / 153 representative roots), scoped
ESLint, Prettier and diff whitespace PASS. An additional unchanged
`DayFeed.navigation.test.ts` probe fails before executing tests on its existing
unmocked Expo/React Native imports (`__DEV__` / Expo font; isolated icon mock also
revealed Flow datetimepicker). No guard weakened or unrelated harness changes
retained; its assertions are not claimed PASS. Existing WindowedDayList and
Composer suites above pass.

Tests cover all twelve resolved formats and twelve exact unresolved formats,
localized messages, explicit/no Today authority and DST civil arithmetic;
Dynamic Type badge growth and semantic dark colors; A default, full-target
accessibility; shared Trip cycling and isolation; offline/storage failure,
restart, hydration races, coalescing and serialized rapid writes. Component tests
use the established static-render harness, not a native runtime.

**Screenshots / device Vision: NOT_RUN.** No simulator, phone, Metro, build,
installation or Backend window used. Reproducible device acceptance after the
parent's next serialized build: open one real Trip at a stable viewport, tap any
DayHeader four times and capture A/B/C/D; verify no scroll/Focus/NOW/selection
change, swipe away/back and reopen the app; repeat on another Trip. Include
Today/Tomorrow/ordinary headers, Chinese/English, Dark Mode and large text. Real
data should currently show the specified fallback in B/C/D. Resolved examples
are reproducible in the pure tests; their screenshots must remain explicitly
isolated previews until the owning Reader gap is closed.

## Source pins

Owner document (read as functional specification, not operational instructions):
`/Users/xoery/Downloads/OTR_DAY_HEADER_STYLE_AND_DESTINATION_RESOLVER_DELTA_20261027.md`
SHA-256 `ef03394af083426961dc72a3a203963e0706a9dfd078436a8cd2e70cd152d246`.

Owner visual reference inspected:
`/Users/xoery/Downloads/四种旅行日标题格式设计稿.png`
SHA-256 `783a4f949075b386c1b87e8b59f2ade2ded85eb2812e88e8778ccdfe96d3cfeb`.

Readiness: **presentation LOCAL_PASS / Native Vision PENDING / destination Reader
integration PENDING**. Existing P1–P4/R30 retained; no Cloud claim or main merge.
