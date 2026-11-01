import { expect, it, vi } from "vitest";
import { applyFormFieldSuggestions, type FormFieldResult } from "./formFieldSuggestions";
import { emptyFlightSegment } from "./manualFlightFormFields";
import type { StaySuggestionBinding } from "./p3FormSuggestions";
vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("@/data/db/database", () => ({ readInitializedDatabase: vi.fn() }));
const binding: StaySuggestionBinding = {
  formId: "form",
  tripId: "trip",
  itemId: "item",
  revision: 2,
  generation: 3,
  mode: "CREATE",
};
const result = (
  family: FormFieldResult["family"],
  fields: Record<string, unknown>,
): FormFieldResult => ({
  kind: "SYNTHETIC_FORM_SUGGESTIONS",
  family,
  binding: { ...binding },
  candidates: [{ id: "one", fields }],
});
it("P2 reuses directory airport identity/zone without inventing proof, Journey or Booking", () => {
  const before = emptyFlightSegment("one", "2026-11-04");
  const next = applyFormFieldSuggestions(
    "P2",
    result("P2", {
      originCode: "AKL",
      destinationCode: "NSN",
      flightNumberLiteral: "NZ5061",
      departureTime: "12:00",
      arrivalTime: "13:30",
      arrivalDate: "2026-11-04",
    }),
    binding,
    "one",
    [
      "originCode",
      "destinationCode",
      "flightNumberLiteral",
      "departureTime",
      "arrivalTime",
      "arrivalDate",
    ],
    before,
  )!;
  expect(next).toMatchObject({
    key: "one",
    originCode: "AKL",
    departureZone: "Pacific/Auckland",
    destinationCode: "NSN",
    arrivalZone: "Pacific/Auckland",
    departureTime: "12:00",
  });
  expect(next).not.toHaveProperty("proof");
  expect(before.originCode).toBe("");
  expect(
    applyFormFieldSuggestions(
      "P2",
      result("P2", { originCode: "ZZZ" }),
      binding,
      "one",
      ["originCode"],
      before,
    ),
  ).toBeNull();
});
it("P4 does not link Pickup and Return implicitly or alter supplier", () => {
  const before = {
    title: "Car",
    pickupLocation: "A",
    returnLocation: "A",
    rentalDetails: { supplier: "Mine" },
  };
  expect(
    applyFormFieldSuggestions(
      "P4",
      result("P4", { pickupLocation: "B", returnLocation: "C" }),
      binding,
      "one",
      ["pickupLocation"],
      before,
    ),
  ).toEqual({ ...before, pickupLocation: "B" });
});
it("P5 keeps service, operator and check-in distinct; rejects unsupported subtype", () => {
  const before = { title: "Train", transportType: "TRAIN", description: "My note" };
  expect(
    applyFormFieldSuggestions(
      "P5",
      result("P5", { departureLocation: "Station", serviceNumber: "123" }),
      binding,
      "one",
      ["departureLocation"],
      before,
    ),
  ).toEqual({ ...before, departureLocation: "Station" });
  expect(
    applyFormFieldSuggestions(
      "P5",
      result("P5", { serviceNumber: "123" }),
      binding,
      "one",
      ["serviceNumber"],
      before,
    ),
  ).toBeNull();
  expect(
    applyFormFieldSuggestions(
      "P5",
      result("P5", { transportType: "TAXI" }),
      binding,
      "one",
      ["transportType"],
      before,
    ),
  ).toBeNull();
});
it("P6 updates schedule/venue while preserving admission structure and rejecting Ticket inference", () => {
  const before = {
    title: "Show",
    location: "Old venue",
    activityDetails: { admissionNote: "Mine" },
  };
  expect(
    applyFormFieldSuggestions(
      "P6",
      result("P6", { location: "New venue", startDate: "2026-11-04" }),
      binding,
      "one",
      ["location", "startDate"],
      before,
    ),
  ).toEqual({ ...before, location: "New venue", startDate: "2026-11-04" });
  expect(
    applyFormFieldSuggestions(
      "P6",
      result("P6", { ticketId: "inferred" }),
      binding,
      "one",
      ["ticketId"],
      before,
    ),
  ).toBeNull();
});
it.each(["P2", "P4", "P5", "P6"] as const)(
  "%s rejects stale Account/revision, cross-family and wrong Edit target",
  (family) => {
    const response = result(family, {});
    expect(
      applyFormFieldSuggestions(
        family,
        response,
        { ...binding, revision: 3 },
        "one",
        [],
        {},
      ),
    ).toBeNull();
    expect(
      applyFormFieldSuggestions(
        family,
        response,
        { ...binding, generation: 4 },
        "one",
        [],
        {},
      ),
    ).toBeNull();
    response.binding.mode = "EDIT";
    expect(
      applyFormFieldSuggestions(
        family,
        response,
        { ...binding, mode: "EDIT" },
        "one",
        [],
        {},
      ),
    ).toBeNull();
    response.family = family === "P2" ? "P4" : "P2";
    expect(
      applyFormFieldSuggestions(family, response, binding, "one", [], {}),
    ).toBeNull();
  },
);
