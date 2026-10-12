import { expect, it, vi } from "vitest";
import { composeDayStream } from "@/features/day-feed/composition";
import { ttrLabCases, type TtrLabFacts } from "@/features/ttr/labFixtures";
import { getLabFixtures } from "./fixtureRegistration";

vi.mock("./StayFixtureRow", () => ({ stayRenderer: () => () => null }));

it("registers all 14 named synthetic TTR scenarios after the existing Lab entries", () => {
  const catalog = getLabFixtures();
  expect(catalog).toHaveLength(21);
  expect(new Set(catalog.map((fixture) => fixture.id)).size).toBe(21);
  expect(catalog.slice(0, 7).every((fixture) => fixture.synthetic)).toBe(true);
  expect(
    catalog.slice(7).map((fixture) => (fixture.supplemental as TtrLabFacts).caseId),
  ).toEqual(ttrLabCases);
  for (const fixture of catalog.slice(7)) {
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
