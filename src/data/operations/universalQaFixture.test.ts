import { expect, it } from "vitest";
import { universalQaFixture } from "./universalQaFixture";
const account = "f4b059c5-8241-4ffb-aa15-37fa25474543",
  trip = "825f79b2-4a9d-4535-a62e-43000ca50c4a";
it("supplies only synthetic source text within the exact DEV QA scope", () => {
  const text = universalQaFixture(account, trip, true)!;
  expect(text).toContain("Synthetic QA only\nService: Coastal QA Train");
  expect(text.endsWith("Departure date: 2026-11-03")).toBe(true);
});
it.each([
  [account, trip, false],
  ["another", trip, true],
  [account, "another", true],
  [undefined, trip, true],
  [account, null, true],
] as const)("has no fixture outside DEV Actor/Trip (%s/%s/%s)", (a, t, d) =>
  expect(universalQaFixture(a, t, d)).toBeUndefined(),
);

it("fills only the P6 original text for its own qualified slice", () => {
  expect(universalQaFixture(account, trip, true, "P6")).toBe(
    "Synthetic QA only\nP6 Activity: Harbour QA Gallery Visit\nActivity date: 2026-11-03",
  );
  expect(universalQaFixture("another", trip, true, "P6")).toBeUndefined();
  expect(universalQaFixture(account, trip, false, "P6")).toBeUndefined();
});
