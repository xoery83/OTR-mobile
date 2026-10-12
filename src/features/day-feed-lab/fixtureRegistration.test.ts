import { expect, it, vi } from "vitest";
import { composeDayStream } from "@/features/day-feed/composition";
import {
  getTtrLabFixtures,
  ttrLabCases,
  type TtrLabFacts,
} from "@/features/ttr/labFixtures";
import { getLabFixtures } from "./fixtureRegistration";

vi.mock("@/features/flexible-native-gallery/Gallery", () => ({
  FlexibleRenderer: () => null,
}));
vi.mock("@/features/day-feed/FlexibleBlockRow", () => ({
  FlexibleBlockRow: () => null,
}));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/ui/controls", () => ({ UiButton: () => null }));
vi.mock("react-native", () => ({ Text: () => null, View: () => null }));
vi.mock("./StayFixtureRow", () => ({ stayRenderer: () => () => null }));
vi.mock("./FlexibleSnapshotFixtureRow", () => ({
  FlexibleSnapshotFixtureRow: () => null,
}));

it("appends Flexible F01-F14 after the unchanged 22 entries and preserves all TTR checks", () => {
  const catalog = getLabFixtures();
  expect(catalog).toHaveLength(36);
  expect(new Set(catalog.map((fixture) => fixture.id)).size).toBe(36);
  expect(catalog.slice(0, 22).map((f) => f.id)).toEqual([
    "day-lab-nelson",
    "day-lab-faroe",
    "day-lab-europe",
    "day-lab-urban",
    "day-lab-sparse",
    "c0000000-0000-4000-8000-000000000003",
    "day-lab-flexible",
    ...getTtrLabFixtures().map((f) => f.id),
    "20000000-0000-4000-8000-000000000099",
  ]);
  expect(catalog[0].selectedDate).toBe("2027-01-15");
  expect(catalog.slice(22).map((f) => f.id)).toEqual(
    Array.from({ length: 14 }, (_, i) => {
      const id = `f${String(i + 1).padStart(2, "0")}`;
      return `flexible-cp01b-${id}-${id === "f11" ? "past" : id === "f10" ? "today" : "future"}`;
    }),
  );
  expect(catalog.slice(0, 7).every((fixture) => fixture.synthetic)).toBe(true);
  expect(
    catalog
      .slice(7, 21)
      .map((fixture) => (fixture.supplemental as TtrLabFacts).caseId),
  ).toEqual(ttrLabCases);
  for (const fixture of catalog.slice(7, 21)) {
    const facts = fixture.supplemental as TtrLabFacts;
    expect(fixture.title).toContain("TTR");
    const stream = composeDayStream(
      fixture.query!(fixture.selectedDate, fixture.zone),
      fixture.instant,
      fixture.ports,
    );
    expect(stream.rows.filter((row) => row.transition)).toHaveLength(
      facts.expected.composed ? 1 : 0,
    );
    if (facts.expected.composed)
      expect(stream.rows[1].transition).toMatchObject({
        visibility: facts.expected.visibility,
        routeStatus: facts.expected.routeStatus,
      });
  }
});
