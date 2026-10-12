# DL1 Day Feed Lab

2026-10-12 · Experience/G2 owns the shared native shell.

## Entry and isolation

Debug only: Trip → Day Feed Lab, or `otrmobile://day-feed-lab`.
The Expo Router route rejects Release before loading the fixture subtree. The
existing root Stack and normal bootstrap/auth behavior remain authoritative.
Fixture mode requires no session because it discloses only synthetic read facts;
it creates no session and grants no access to real Trip repositories.

No Lab repository, SQL, sync, API, provider or schema path exists. Global bootstrap
still runs normally; Fixture Mode does not suppress or activate global lifecycle.
Use a fresh DEV Simulator/container without any remembered account for acceptance.

## Read port and catalog ownership

`src/features/day-feed-lab/fixtureCatalog.ts` supplies five deterministic scenarios.
`getFixtureCatalog()` returns localized synthetic titles at render time, stable
synthetic IDs, explicit UTC query context, three dates, Day Read v1 projections
and Flight service maps. These are synthetic read facts, never admitted records.
Missing facts remain null. All-day/date-only inputs have no instant or midnight.
Each scenario's fixed NOW is 2027-01-15T12:00:00Z, shown in diagnostics; later dates
exercise production NOW suppression. Trip changes select its first day;
date changes reset Feed depth/scroll. Focus/Immersive transitions retain the mounted
Trip/date/feed and its production scroll-return behavior.

The shell supplies `projection/date/zone/services/instant` to production `DayFeed`.
Only `instant` is new and optional: production continues using its existing minute
clock; fixtures replace that input. `composeDayStream`, P1Row, FlightRows, Focus,
NOW placement, Browse geometry and Immersive Modal remain the single production path.
Native acceptance adds automatic safe-area inset to the production Immersive
ScrollView so the first P1/P2 row clears the status bar without fixed offsets.

## Dormant contribution ports

- P3–P6: owning workstream contributes an accepted typed Day Read projection and
  production renderer. Extend the existing production projection union/renderer
  dispatch, then add a catalog scenario. No placeholder is rendered as implemented
  Stay, Rental, train, ferry or Ticket capability.
- Flexible: owning workstream contributes explicit affiliation and Choices to G2's
  existing `FlexibleContainer` / `composeDayStream` port. The Lab does not create
  affiliations or add a second Composer. Native rendering remains dormant.
- TTR: owning workstream contributes qualified `ttr-presentation/1` to G2's existing
  `TransitionProjection` port. Core owns occurrence/continuity authority. The Lab
  does not infer transitions or activate routing, MapKit, ETA, distance or cache.
- Core DEV Data: a separately approved read adapter can supply the same production
  Feed boundary. No DEV Data switch or write/seed capability is exposed in DL1.

Catalog additions need no shell navigation or state framework change. Future
projection/renderer activation remains each owner's gate, with Experience/G2
review of final composition. DL2 should integrate approved actor-scoped Core v2
read DTOs through this same boundary, read-only first.
