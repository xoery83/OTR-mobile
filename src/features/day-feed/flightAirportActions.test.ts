import { expect, it, vi } from "vitest";
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  Linking: { openURL: vi.fn() },
}));
import { flightAirportContext, flightAirportTargets } from "./flightAirportActions";
import { emptyFlightSegment } from "./manualFlightFormFields";
it("opens the actual departure airport without fabricating coordinates or a destination", () => {
  const authored = {
    ...emptyFlightSegment("segment"),
    originCode: "AKL",
    originName: "Auckland International Airport",
    destinationName: "Nelson Airport",
  };
  const targets = flightAirportTargets({ authored });
  expect(decodeURIComponent(targets!.map)).toContain(
    "q=Auckland International Airport AKL",
  );
  expect(decodeURIComponent(targets!.navigate)).toContain(
    "daddr=Auckland International Airport AKL",
  );
  expect(flightAirportTargets({ authored: { ...authored, originName: "" } })).toBeNull();
});
it("uses the departure airport civil date for Today/Future/Past actions", () => {
  const flight = {
    authored: {
      ...emptyFlightSegment("segment"),
      departureDate: "2026-10-28",
      departureZone: "Pacific/Auckland",
    },
  };
  expect(flightAirportContext(flight, "2026-10-27T12:00:00Z")).toBe("TODAY");
  expect(flightAirportContext(flight, "2026-10-26T12:00:00Z")).toBe("FUTURE");
  expect(flightAirportContext(flight, "2026-10-28T12:00:00Z")).toBe("PAST");
});
