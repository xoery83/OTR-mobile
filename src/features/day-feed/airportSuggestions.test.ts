import { expect, it } from "vitest";
import {
  airportSuggestions,
  manualAirport,
  airportLabel,
  airportTimeZone,
  selectedAirportZone,
} from "./airportSuggestions";
it("looks up existing offline IATA, ICAO and airport names with exact-code priority", () => {
  for (const query of ["akl", "NZAA", "Auckland International"]) {
    const result = airportSuggestions(query)[0];
    expect(result).toMatchObject({
      iata: "AKL",
      icao: "NZAA",
      name: "Auckland International Airport",
    });
    expect(Object.keys(result).sort()).toEqual([
      "country",
      "iata",
      "icao",
      "name",
      "zone",
    ]);
  }
});
it("handles diacritics, bounded broad results, absent entries and ambiguous names without auto-selection", () => {
  expect(airportSuggestions("São Paulo").length).toBeGreaterThan(0);
  expect(airportSuggestions("San")).toHaveLength(6);
  expect(airportSuggestions("ZZZZZZ nonexistent airport")).toEqual([]);
  expect(airportSuggestions("a")).toEqual([]);
  const results = airportSuggestions("Birmingham");
  expect(new Set(results.map((r) => r.country)).size).toBeGreaterThan(1);
});
it("preserves free text or explicit code and clears any stale counterpart", () => {
  expect(manualAirport(" AKL ")).toEqual({ code: "AKL", name: "" });
  expect(manualAirport("My airport")).toEqual({ code: "", name: "My airport" });
  expect(manualAirport("")).toEqual({ code: "", name: "" });
  expect(airportLabel("AKL", "Auckland International Airport")).toBe(
    "AKL · Auckland International Airport",
  );
});

it("derives IANA zones for opposite endpoints, never a fixed offset or instant", () => {
  for (const [code, zone] of [
    ["AKL", "Pacific/Auckland"],
    ["LAX", "America/Los_Angeles"],
    ["NRT", "Asia/Tokyo"],
    ["SYD", "Australia/Sydney"],
    ["FRA", "Europe/Berlin"],
  ]) {
    const airport = airportSuggestions(code)[0];
    expect(airportTimeZone(airport)).toBe(zone);
    expect(selectedAirportZone(code, airport.name)).toBe(zone);
  }
  expect(selectedAirportZone("AKL", "Los Angeles International Airport")).toBeNull();
  expect(
    airportTimeZone({ ...airportSuggestions("AKL")[0], zone: "Mars/Olympus" }),
  ).toBeNull();
  expect(airportTimeZone({ ...airportSuggestions("AKL")[0], zone: null })).toBeNull();
});
it("keeps IANA identity across summer/winter while platform rules apply the date-specific DST offset", () => {
  const zone = airportTimeZone(airportSuggestions("AKL")[0])!;
  const clock = (instant: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(instant));
  expect(clock("2026-01-15T00:00:00Z")).toBe("13:00");
  expect(clock("2026-07-15T00:00:00Z")).toBe("12:00");
  // Spring gap and autumn fold: forward formatting is lawful; no unique reverse instant is invented.
  expect(clock("2026-09-26T13:30:00Z")).toBe("01:30");
  expect(clock("2026-09-26T14:30:00Z")).toBe("03:30");
  expect(clock("2026-04-04T13:30:00Z")).toBe("02:30");
  expect(clock("2026-04-04T14:30:00Z")).toBe("02:30");
});
