import { collectFixtureContributions } from "./contribution";
import { getDl1FixtureCatalog } from "./fixtureCatalog";
import { stayContribution } from "./stayContribution";
import { stayRenderer } from "./StayFixtureRow";
import { flexibleContribution } from "./flexibleContribution";
import { getTtrLabFixtures } from "@/features/ttr/labFixtures";
import { t } from "@/ui/locale";

// Explicit immutable registration; new workstreams add contributions here, not to source switching.
export function getLabFixtures() {
  const stay = stayContribution();
  return collectFixtureContributions([
    ...getDl1FixtureCatalog(),
    { ...stay, renderer: stayRenderer(stay) },
    flexibleContribution(),
    ...getTtrLabFixtures().map((fixture) => ({
      ...fixture,
      title: t(`dayLab.ttr.${fixture.supplemental!.caseId}`),
    })),
  ]);
}
