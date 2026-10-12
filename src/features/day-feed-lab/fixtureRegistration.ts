import { collectFixtureContributions } from "./contribution";
import { getDl1FixtureCatalog } from "./fixtureCatalog";
import { stayContribution } from "./stayContribution";
import { stayRenderer } from "./StayFixtureRow";

// Explicit immutable registration; new workstreams add contributions here, not to source switching.
export function getLabFixtures() {
  const stay = stayContribution();
  return collectFixtureContributions([
    ...getDl1FixtureCatalog(),
    { ...stay, renderer: stayRenderer(stay) },
  ]);
}
