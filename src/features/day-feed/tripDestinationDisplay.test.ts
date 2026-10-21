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

it("keeps a single place's full region/country and shortens only multi-place summaries", () => {
  const destinations = [
    { displayLabel: "Nelson, New Zealand" },
    { displayLabel: "Auckland, New Zealand" },
    { displayLabel: "Beijing, China" },
    { displayLabel: "Zhangxx" },
  ];
  const original = JSON.stringify(destinations);
  expect(tripDestinationDisplay({ destinations: destinations.slice(0, 1) })).toBe(
    "Nelson, New Zealand",
  );
  expect(tripDestinationDisplay({ destinations })).toBe(
    "Nelson · Auckland · Beijing · Zhangxx",
  );
  expect(JSON.stringify(destinations)).toBe(original);
});
it("preserves ordered natural/custom/country labels and handles full-width separators", () => {
  expect(
    tripDestinationDisplay({
      destinations: [
        { displayLabel: "北京，中国" },
        { displayLabel: "Abel Tasman National Park, New Zealand" },
        { displayLabel: "Japan" },
        { displayLabel: "Moon Base" },
      ],
    }),
  ).toBe("北京 · Abel Tasman National Park · Japan · Moon Base");
  expect(tripDestinationDisplay({ destination: "Legacy City, Country" })).toBe(
    "Legacy City, Country",
  );
});
