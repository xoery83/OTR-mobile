import { t } from "@/ui/locale";
import type { FlexibleBlockPort } from "@/features/day-feed/composition";
import { place, scenario } from "./fixtureFacts";
import type { FixtureContribution } from "./contribution";

const date = "2027-01-15";
export function flexibleContribution(): FixtureContribution {
  const fixture = scenario("day-lab-flexible", t("dayLab.flexibleScenario"), [
    place("flex-item", t("dayLab.flexibleItem"), date, "14:00", "15:00"),
    place("flex-outer", t("dayLab.flexibleOuter"), date, "12:30", "13:00"),
    place("flex-tns", t("dayLab.flexibleTns"), date),
  ]);
  const base = {
    version: "g2-flexible/1" as const,
    synthetic: true as const,
    accountId: fixture.projection.accountId,
    tripId: fixture.id,
    localDate: date,
  };
  const blocks: FlexibleBlockPort[] = [
    {
      ...base,
      id: "flex-empty",
      title: t("dayLab.flexibleEmpty"),
      itemIds: [],
      choices: [],
      softWindow: { startMinute: 540, endMinute: 600 },
    },
    {
      ...base,
      id: "flex-choices",
      title: t("dayLab.flexibleChoices"),
      itemIds: [],
      choices: [{ id: "cafe", name: t("dayLab.flexibleGroupChoice"), scope: "GROUP" }],
      softWindow: { startMinute: 660, endMinute: 720 },
    },
    {
      ...base,
      id: "flex-nested",
      title: t("dayLab.flexibleNested"),
      itemIds: ["flex-item", "flex-tns", "removed-item"],
      choices: [
        { id: "garden", name: t("dayLab.flexibleMyChoice"), scope: "MY" },
        { id: "cafe", name: t("dayLab.flexibleGroupChoice"), scope: "GROUP" },
      ],
      softWindow: { startMinute: 780, endMinute: 1080 },
    },
  ];
  return {
    ...fixture,
    metadata: {
      summary: t("dayLab.flexibleScenario"),
      expected: ["G2-F01", "G2-F02", "G2-F03"],
    },
    ports: {
      scope: { accountId: fixture.projection.accountId, tripId: fixture.id },
      flexible: blocks,
    },
  };
}
