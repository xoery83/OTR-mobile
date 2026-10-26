import { expect, it } from "vitest";
import {
  emptyFlightSegment,
  flightSegmentDraftSchema,
  sparseFlightSavePlan,
  flightNextDate,
  suggestedFlightArrivalDate,
} from "./manualFlightFormFields";
const valid = () => ({
  ...emptyFlightSegment("one", "2027-01-16"),
  flightNumberLiteral: "NZ5069",
});
it("suggests an editable next local day across month/year/leap boundaries without deriving an instant", () => {
  expect(suggestedFlightArrivalDate("2026-12-31", "23:00", "01:00")).toBe("2027-01-01");
  expect(suggestedFlightArrivalDate("2028-02-28", "23:00", "01:00")).toBe("2028-02-29");
  expect(suggestedFlightArrivalDate("2026-11-01", "09:00", "10:00")).toBe("2026-11-01");
  expect(suggestedFlightArrivalDate("2026-11-01", "09:00", "09:00")).toBe("2026-11-01");
  expect(suggestedFlightArrivalDate("", "23:00", "01:00")).toBe("");
  expect(flightNextDate("2026-11-01")).toBe("2026-11-02");
  expect(() => flightNextDate("2026-02-30")).toThrow();
});
it("requires explicitly entered number/date and does not prefill a Home date", () => {
  expect(emptyFlightSegment("one").departureDate).toBe("");
  expect(sparseFlightSavePlan([emptyFlightSegment("one")]).kind).toBe("INVALID");
  expect(sparseFlightSavePlan([valid()])).toMatchObject({
    kind: "READY",
    fields: {
      flightNumberLiteral: "NZ5069",
      departureDate: "2027-01-16",
      participation: { mode: "WHOLE_GROUP" },
    },
  });
});
it.each([
  "originCode",
  "originName",
  "departureTime",
  "departureZone",
  "destinationCode",
  "destinationName",
  "arrivalDate",
  "arrivalZone",
] as const)("never silently drops a filled %s", (field) => {
  const value = {
    ...valid(),
    [field]: field.endsWith("Zone")
      ? "Pacific/Auckland"
      : field.endsWith("Date")
        ? "2027-01-17"
        : field.endsWith("Time")
          ? "09:00"
          : "AKL",
  };
  const bytes = JSON.stringify(value);
  expect(sparseFlightSavePlan([value])).toMatchObject({
    kind: "CORE_PENDING",
    reason: "ENDPOINTS",
  });
  expect(JSON.stringify(value)).toBe(bytes);
});
it("retains distinct segment keys and blocks unowned Journey/ Edit mutations", () => {
  expect(sparseFlightSavePlan([valid(), { ...valid(), key: "two" }])).toMatchObject({
    kind: "CORE_PENDING",
    reason: "JOURNEY",
  });
  expect(sparseFlightSavePlan([valid()], true)).toMatchObject({
    kind: "CORE_PENDING",
    reason: "EDIT",
  });
});
it("keeps cross-date-line endpoint dates and Floating clocks without inferring an instant", () => {
  const value = {
    ...valid(),
    departureTime: "20:00",
    arrivalDate: "2027-01-15",
    arrivalTime: "23:30",
  };
  expect(flightSegmentDraftSchema.safeParse(value).success).toBe(true);
  expect(value).not.toHaveProperty("instant");
  expect(value.departureZone).toBe("");
});
it("rejects invalid dates, clocks and IANA hints rather than assigning a fallback zone", () => {
  for (const changes of [
    { departureDate: "2027-02-30" },
    { departureTime: "25:00" },
    { departureZone: "Not/AZone" },
    { arrivalTime: "12:00" },
  ])
    expect(flightSegmentDraftSchema.safeParse({ ...valid(), ...changes }).success).toBe(
      false,
    );
});
