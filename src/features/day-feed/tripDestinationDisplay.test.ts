import { expect, it } from "vitest";
import { tripDestinationDisplay } from "./tripDestinationDisplay";

it("displays the local ordered list without rewriting the legacy scalar", () => {
  const trip = {
    destination: "Original legacy text",
    destinations: [{ displayLabel: "Nelson" }, { displayLabel: "Auckland" }],
  };
  expect(tripDestinationDisplay(trip)).toBe("Nelson · Auckland");
  expect(trip.destination).toBe("Original legacy text");
});

it("keeps legacy and cached trips readable without synthesizing place identity", () => {
  expect(tripDestinationDisplay({ destination: "Moon Base", destinations: [] })).toBe(
    "Moon Base",
  );
  expect(tripDestinationDisplay({ destination: null })).toBeNull();
});
