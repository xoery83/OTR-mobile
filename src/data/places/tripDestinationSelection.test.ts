import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  manualTripDestination,
  resolvedTripDestination,
  addTripDestination,
  removeTripDestination,
} from "./tripDestinationSelection";
import type { ApplePlaceCandidate } from "./applePlaceProvider";
function candidate(extra: Partial<ApplePlaceCandidate> = {}): ApplePlaceCandidate {
  return {
    provider: "apple",
    handle: randomUUID(),
    sessionId: randomUUID(),
    generation: 1,
    kind: "mapItem",
    title: "Tokyo",
    secondary: "Japan",
    ...extra,
  };
}
it("manual labels remain authored selections with separate local UUID and no invented Provider facts", () => {
  const a = manualTripDestination("  Tokyo  ");
  expect(a.text).toBe("Tokyo");
  expect(a.source).toBe("MANUAL");
  expect(a).not.toHaveProperty("match");
  expect(addTripDestination([a], manualTripDestination("Ｔｏｋｙｏ"))).toEqual([a]);
  expect(() => manualTripDestination(" ")).toThrow();
  expect(() => manualTripDestination("x".repeat(257))).toThrow();
});
it("only explicit resolved rows become snapshots, with no handles or fake stable IDs", () => {
  const raw = candidate({ point: { latitude: 35, longitude: 139 } });
  const item = resolvedTripDestination(raw);
  expect(item.match).toMatchObject({
    provider: "apple",
    providerPlaceId: null,
    title: "Tokyo",
  });
  expect(item.match).not.toHaveProperty("handle");
  expect(item.match).not.toHaveProperty("sessionId");
  expect(item.localId).not.toBe(raw.handle);
  raw.point!.latitude = 1;
  expect(item.match?.point?.latitude).toBe(35);
  expect(() => resolvedTripDestination(candidate({ kind: "completion" }))).toThrow(
    "DESTINATION_NOT_RESOLVED",
  );
});
it("deduplicates stable provider IDs and labels while retaining order and distinct qualified places", () => {
  const a = resolvedTripDestination(candidate({ providerPlaceId: "real-apple-id" }));
  expect(
    addTripDestination(
      [a],
      resolvedTripDestination(
        candidate({ title: "東京", providerPlaceId: "real-apple-id" }),
      ),
    ),
  ).toEqual([a]);
  const different = resolvedTripDestination(
    candidate({ secondary: "United States", point: { latitude: 1, longitude: 2 } }),
  );
  const list = addTripDestination([a], different);
  expect(list.map((x) => x.localId)).toEqual([a.localId, different.localId]);
  expect(removeTripDestination(list, a.localId)).toEqual([different]);
  expect(list[0]).toBe(a);
});

it("never upgrades a manual label to an Apple identity just because names match", () => {
  const manual = manualTripDestination("Tokyo"),
    apple = resolvedTripDestination(candidate({ providerPlaceId: "actual-apple-id" }));
  expect(addTripDestination([manual], apple)).toEqual([manual, apple]);
});

it("never label-merges different or unknown provider identities", () => {
  const a = resolvedTripDestination(
    candidate({
      providerPlaceId: "apple-first",
      point: { latitude: 35, longitude: 139 },
    }),
  );
  const other = resolvedTripDestination(
    candidate({
      providerPlaceId: "apple-second",
      point: { latitude: 35, longitude: 139 },
    }),
  );
  const unknown = resolvedTripDestination(
    candidate({ point: { latitude: 35, longitude: 139 } }),
  );
  expect(addTripDestination([a], other)).toEqual([a, other]);
  expect(addTripDestination([a], unknown)).toEqual([a, unknown]);
});
