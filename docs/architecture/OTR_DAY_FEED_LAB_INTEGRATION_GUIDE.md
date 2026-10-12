# Day Feed Lab shared integration guide

DL4 · `day-feed-lab/1` / `day-feed-renderer/1` · 2026-10-12.
This is a Debug-only host around production DayFeed/G2, not a new product dashboard.

## Add a synthetic Fixture Trip

Create a pure contribution module like `src/features/day-feed-lab/stayContribution.ts`.
Return `FixtureContribution<T>` from `contribution.ts`. Its implemented fields are
version, synthetic marker, stable Trip ID/title, dateRange, sorted selectable dates,
selectedDate, zone, fixed instant, existing DayProjection, Flight services and
metadata. Optional fields are supplemental, query, renderer and presentation ports.
Use the same Item ID in the authored facts, Day projection, renderer facts and
CoreDayRow keys. Never mint a second canonical Item for a base or endpoint row.

```ts
import { scenario } from "@/features/day-feed-lab/fixtureFacts";
import type { FixtureContribution } from "@/features/day-feed-lab/contribution";

export function contributedTrip(): FixtureContribution<{ note?: string }> {
  const base = scenario("day-lab-my-synthetic-trip", "Synthetic test title", []);
  return {
    ...base,
    supplemental: { note: "Synthetic test fact" },
    metadata: { summary: "Synthetic empty-day proof", expected: ["EMPTY_DAY"] },
  };
}
```

These literals are explanatory synthetic data. Product-visible contributions must
use localized `t(...)` keys in both catalogs and canonical UI tokens. No PNR, QR,
credential, real personal record or provider URL belongs in these fixtures.
Add the contribution to the explicit array in `fixtureRegistration.ts:getLabFixtures`;
new workstreams do not edit source/Trip/date switching in DayFeedLabScreen.
`collectFixtureContributions` rejects duplicate Trips, unsupported version,
non-synthetic data, mismatched Trip/source scopes, invalid clock/date range,
unbounded selectedDate and duplicate Items. Each call creates a new catalog;
there is no global mutable registry. The original five scenarios remain unchanged.

## Typed supplemental projection and renderer

Own a small fact type in the contributing module. Reuse accepted Core DTOs and
read projectors; optional facts stay absent. Supply an existing DayQuery through
`query(date, zone)` when a fixture needs owning CoreDayRow identity. This query
must be pure, contain only that synthetic Trip's Items and preserve owning roles.
It is not permission to invent accepted runtime certificates or install a read.

P3 proof uses schema-checked in-memory Core2 rows, `projectCoreDay` and
`projectCoreItem`: one three-night Item has CHECKIN, TONIGHT bases and CHECKOUT.
A clearly marked fixture-only adapter maps these to the existing DayQuery; all
rows are date-only TNS/BASE, with no guessed clock, midnight or address. The
supplemental synthetic Instructions summary is not an admitted Instruction record.

```ts
import { bindRenderer } from "@/features/day-feed/rendererContribution";
import { stayContribution } from "@/features/day-feed-lab/stayContribution";
import { StayFixtureRow } from "@/features/day-feed-lab/StayFixtureRow";

const stay = stayContribution();
const renderer = bindRenderer({
  version: "day-feed-renderer/1",
  family: "P3",
  facts: { [stay.projection.events[0].id]: stay.supplemental! },
  render: StayFixtureRow,
});
const registeredStay = { ...stay, renderer };
```

`DayRowRendererProps` supplies composed row/key/transition, optional container,
shared B/F/I depth, onDepth and withinMarker. The bound renderer runs as a React
component, so normal hooks are supported. Missing Item facts or a null renderer
result use the existing P1/P2 fallback. StayFixtureRow reuses P1 Browse geometry;
its optional details appear only in Focus/Immersive. The future approved P3
renderer can replace this component in registration without changing the Shell.

Renderers must not sort the Day, place NOW, own Focus state, navigate an independent
Immersive shell, access repositories or issue canonical mutations. Depth actions
use the Feed's controller and existing Modal/scroll return. Current Core read
mode still supports only the owning P2 bridge; registering a Fixture renderer
never enables P3–P6 live reads or authoring.

## Flexible fixture seam

Supply the existing `DayStreamPorts` subset through contribution.ports. Use only
explicit Item affiliation; a soft window is supplemental context and never admits,
reorders or implicitly captures an Item. My/Group filters Choices, not Items.

```ts
const withFlexible = {
  ...stay,
  ports: {
    flexible: [
      {
        id: "synthetic-window",
        itemIds: [stay.projection.events[0].id],
        softWindow: { start: { comparable: false, localDate: "2027-01-16" } },
        choices: [{ id: "synthetic-choice", scope: "MY" as const }],
      },
    ],
    choiceScope: "MY" as const,
  },
};
```

G2 returns one nested row key per affiliated Item even if itemIds repeats; ambiguous
membership does not choose a container. A contributed renderer can inspect its
container's filtered Choices/softWindow. This is a dormant presentation port,
not Block/Choice persistence, business lifecycle or a complete Flexible renderer.

## Qualified TTR fixture seam

Use `TransitionProjection` from composition.ts, the implemented structural subset
of `ttr-presentation/1`. Supply contribution.ports.transitions and matching scope.
The existing `composition.test.ts:setup` is a complete executable example:
version/qualification, identity and occurrence discriminator, publicationVersion,
matching openTtr action and adjacent EVENT DayRow anchors are mandatory. Use
`dayRowKey(itemId, "EVENT", date)` for these synthetic v1 anchors.

Straight-line LOCAL_GEOMETRY distance needs no selected mode. USER_CONFIRMED mode
survives absent ETA; no MapKit/Apple ETA/provider is used. NOW collision sets
suppressConnector but retains distance/mode/openTtr. Duplicate/stale/unqualified,
cross-Account/Trip, past or invalid anchors are withheld. Core role/occurrence
anchors are not converted into fake EVENT anchors: production Transition remains
closed until owning Core occurrence authority and the G2 adapter are integrated.
No transition decoration or owning TTR business feature is activated by DL4.

## Open and validate in Simulator

Use an explicitly authorized isolated Debug app/container. For this task the
existing app is com.xoery.otrmobile.devtest on Simulator
AE11480D-B6B9-402B-BE8A-4F2BBD4D0704. Metro8093 serves the DL4 worktree.
Open Trip → Day Feed Lab, or `otrmobile://day-feed-lab`. CI Metro needs a restart
and app reload after source edits; verify the final bundle before native claims.

Choose Fixture, open Test Trip, select any of the original five or Synthetic P3
Stay. Stay initially selects Jan16; Previous/Next/chips select Jan15–18.
Tap an Item for Focus, Open place details for Immersive, Close to return; verify
the same date/Focus and a nonzero Feed offset. Check original P1/P2 NOW and TNS,
Stay's clock-free base/check-in/check-out, empty Day, large scroll, Light/Dark.

Core DEV Read remains disabled without an adopted authorized session and current
complete permitted local collection. Refresh revalidates local reads only.
Do not create login, Seed or invoke Hosted writes to make it available. Source
switches never mix authoritative Fixture/Core records; Account generation changes
mask old data. Native Core and real DEV acceptance require separate execution.

Run contribution.test.ts, fixtureCatalog.test.ts, render.test.ts,
composition.test.ts, owning Core/Flight tests, Release route tests, typecheck,
full lint/UI guard, formatting and full regression with the exact main baseline.
A mock offset test is not native scroll evidence. No physical-device or live Core
PASS may be inferred from Fixture/native proof.

## Shared ownership and remaining gates

Feature workstreams contribute modules and registration entries; preserve shared
DayFeed, G2 Composer, P1/P2 geometry, NOW/controller/scroll, Lab switching, Release
route guard and actor-scoped Core reader. Changes to these contracts require G2
review rather than a separate Shell or Composer. Core owns authority/admission/
certificates; Flight owns its enrichment bridge. Flexible/TTR own their features.

DL4 P3 is fixture integration proof, not final P3 Experience acceptance. Final
P3–P6 designs, generic accepted Core-to-Feed bridge, live authenticated read,
Capture, provider/ETA, schema, admission, sync and deployment remain separately
scoped. No registration operation writes SQLite/Supabase or activates providers.
