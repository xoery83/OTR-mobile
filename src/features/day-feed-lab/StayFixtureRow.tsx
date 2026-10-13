import { bindRenderer } from "@/features/day-feed/rendererContribution";
import { StayRow } from "@/features/day-feed/StayRow";
import type { FixtureContribution } from "./contribution";
import type { StaySupplement } from "./stayContribution";
export function stayRenderer(fixture: FixtureContribution<StaySupplement>) {
  return bindRenderer({
    version: "day-feed-renderer/1",
    family: "P3",
    facts: { [fixture.projection.events[0].id]: fixture.supplemental! },
    render: StayRow,
  });
}
