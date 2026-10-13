import { expect, it, vi } from "vitest";
import { composeDayStream } from "@/features/day-feed/composition";
import { en, zhHans } from "@/ui/catalogs";
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

it("adds separate P5 and P6 fixtures while preserving TTR and Flexible appendix", () => {
  const catalog = getLabFixtures();
  expect(catalog).toHaveLength(49);
  expect(new Set(catalog.map((fixture) => fixture.id)).size).toBe(49);
  expect(catalog.slice(0, 6).map((f) => f.id)).toEqual([
    "day-lab-nelson",
    "day-lab-faroe",
    "day-lab-europe",
    "day-lab-urban",
    "day-lab-sparse",
    "c0000000-0000-4000-8000-000000000003",
  ]);
  expect(catalog.filter((f) => f.id.startsWith("d1000000-")).map((f) => f.id)).toEqual([
    "d1000000-0000-4000-8000-000000000001",
    "d1000000-0000-4000-8000-000000000002",
    "d1000000-0000-4000-8000-000000000003",
  ]);
  expect(catalog.filter((f) => f.id.startsWith("e1000000-")).map((f) => f.id)).toEqual([
    "e1000000-0000-4000-8000-000000000001",
    "e1000000-0000-4000-8000-000000000002",
    "e1000000-0000-4000-8000-000000000003",
    "e1000000-0000-4000-8000-000000000004",
  ]);
  expect(en["dayLab.deferred"]).toContain("P6");
  expect(en["dayLab.deferred"]).not.toContain("future port");
  expect(zhHans["dayLab.deferred"]).not.toContain("尚未接入");
  expect(catalog[0].selectedDate).toBe("2027-01-15");
  expect(catalog.slice(-14).map((f) => f.id)).toEqual(
    Array.from({ length: 14 }, (_, i) => {
      const id = `f${String(i + 1).padStart(2, "0")}`;
      return `flexible-cp01b-${id}-${id === "f11" ? "past" : id === "f10" ? "today" : "future"}`;
    }),
  );
  const ttrStart = catalog.findIndex((f) => f.id === getTtrLabFixtures()[0].id);
  const ttr = catalog.slice(ttrStart, ttrStart + ttrLabCases.length);
  expect(ttr.map((fixture) => (fixture.supplemental as TtrLabFacts).caseId)).toEqual(
    ttrLabCases,
  );
  for (const fixture of ttr) {
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
