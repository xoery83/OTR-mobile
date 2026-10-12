# Shared Day Feed Lab handoff

2026-10-12 · P3 Accommodation, P4 Rental, P5 Scheduled Transport, P6 Ticketed
Activity/Wallet, Flexible Block and TTR workstreams.

The accepted DL4 source commit `e984ed1bb377518c855af76f0cd9fd6366a73b58`
is the shared Lab implementation integrated into local main. The final main
integration/handoff commit is the commit containing this document; check
`git rev-parse main` before starting a workstream. The full contract and examples
are in `OTR_DAY_FEED_LAB_INTEGRATION_GUIDE.md`.

## Add one test scenario

Create a pure `FixtureContribution<T>` in a feature-owned fixture module. The
implemented `day-feed-lab/1` shape in
`src/features/day-feed-lab/contribution.ts` requires `synthetic: true`, a stable
Trip `id`, title, date range and sorted selectable dates, selected date, zone,
fixed instant, existing `DayProjection`, services and expected metadata. Add
optional typed `supplemental`, a pure `query`, a `renderer` or G2 presentation
`ports` only when the scenario needs them. Register the result in the explicit
array returned by `getLabFixtures()` in
`src/features/day-feed-lab/fixtureRegistration.ts`; registration validates
identity, dates, Item uniqueness and scope. The Lab Shell's source, Trip and date
switching requires no feature-specific branch.

For a feature row, supply `RendererContribution<T>` from
`src/features/day-feed/rendererContribution.ts`: version
`day-feed-renderer/1`, family P3–P6, Item-ID-keyed typed `facts`, and `render`.
Pass it through `bindRenderer(...)` on registration. The adapter receives the
composed row/container, B/F/I depth, `onDepth` and `withinMarker`; missing facts
fall back to the existing P1/P2 presentation. Keep the same owning Item ID across
projection, query, DayRow keys and renderer facts. The synthetic P3 Stay in
`stayContribution.ts` and `StayFixtureRow.tsx` is the smallest executable example.
It proves CHECKIN, TONIGHT/BASE and CHECKOUT without an accepted Core read or
final P3 design.

## Run and inspect

Use an authorized isolated Debug app/container in Simulator, start its Metro
bundle, then open **Trip → Day Feed Lab** or `otrmobile://day-feed-lab`. Select
Fixture, Test Trip and the contributed scenario; use Previous/Next/date chips.
Open an Item for Focus, open details for Immersive, close to confirm return to the
same date/row and retained scroll position. Check Browse/Focus/Immersive,
Future/Today/Past, NOW/TNS, Light/Dark and missing optional facts. The six shared
Fixtures and native evidence are under `docs/qa/day-feed-lab-dl4/`. A mock scroll
assertion is not native scroll evidence.

## Ownership and closed gates

G2 maintains the Lab Shell, `FixtureContribution`/renderer contracts,
`composeDayStream`, global Focus/NOW and cross-module regressions. Each feature
workstream owns its typed facts, fixture, B/F/I renderer and visual acceptance.
Core owns accepted records, actor-scoped authorization, SQLite/Sync and DayRow
authority. Feature workstreams should not create another Lab/Composer, duplicate
DayRow identity, add Focus/NOW controllers, write Fixtures to Canonical tables or
change shared G2 components merely for a local scenario.

Core DEV Read currently supports only the owning P2 Flight bridge and requires
an adopted authorized session plus a complete accepted local collection. The
synthetic P3 Stay is not live P3 authorization. Flexible ports preserve explicit
Item affiliation, soft windows and Choice-only My/Group filtering; they do not
implement Block/Choice ownership. Qualified TTR presentation remains dormant
until owning Core occurrence authority and the G2 adapter are accepted; no
MapKit/ETA/provider or production Transition is activated here. P3–P6 final
designs and authenticated DEV/device acceptance remain feature/Core gates.
