import { beforeEach, expect, it, vi } from "vitest";
import {
  readTripPlaceSearchRegions,
  uniqueTripSearchRegion,
} from "./placeSearchTripRegions";
import type { ApplePlaceCandidate } from "@/data/places/applePlaceProvider";
const state = vi.hoisted(() => ({
  current: true,
  generation: 1,
  principal: { kind: "GUEST", localId: "guest" } as {
    kind: string;
    localId?: string;
    accountId?: string;
  },
  list: vi.fn(),
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
}));
vi.mock("@/data/auth/localTripAccess", () => ({
  readLocalTripPrincipal: async () => state.principal,
  readLocalTripRepository: async () => ({ listTrips: state.list }),
}));
const binding = {
  accountId: "guest",
  tripId: "trip",
  editorId: "editor",
  accountGeneration: 1,
  isCurrent: () => state.current,
};
beforeEach(() => {
  state.current = true;
  state.generation = 1;
  state.principal = { kind: "GUEST", localId: "guest" };
  state.list.mockReset();
});
it("reads current Trip destinations for an existing committed Guest", async () => {
  state.list.mockResolvedValue([
    {
      id: "trip",
      destinations: [
        { displayLabel: "Auckland, New Zealand" },
        { displayLabel: "Nelson, New Zealand" },
      ],
    },
  ]);
  expect(await readTripPlaceSearchRegions(binding)).toEqual([
    "Auckland, New Zealand",
    "Nelson, New Zealand",
  ]);
});
it("drops labels for a different principal and for a response after generation changes", async () => {
  state.principal = { kind: "ACCOUNT", accountId: "another" };
  expect(await readTripPlaceSearchRegions(binding)).toEqual([]);
  expect(state.list).not.toHaveBeenCalled();
  state.principal = { kind: "GUEST", localId: "guest" };
  state.list.mockImplementation(async () => {
    state.generation++;
    return [{ id: "trip", destination: "Auckland" }];
  });
  expect(await readTripPlaceSearchRegions(binding)).toEqual([]);
});
it("only accepts a unique qualified real geographic result with matching tokens and valid point", () => {
  const row: ApplePlaceCandidate = {
    provider: "apple",
    handle: "fixture",
    sessionId: "fixture",
    generation: 1,
    kind: "mapItem",
    title: "Auckland",
    secondary: "New Zealand",
    point: { latitude: -36.8, longitude: 174.7 },
    area: { kind: "locality", label: "Auckland", qualifier: "New Zealand" },
  };
  expect(uniqueTripSearchRegion("Auckland, New Zealand", [row])).toBe(row);
  expect(uniqueTripSearchRegion("Auckland", [row, { ...row }])).toBeNull();
  expect(uniqueTripSearchRegion("Nelson", [row])).toBeNull();
  expect(uniqueTripSearchRegion("Auckland", [{ ...row, point: undefined }])).toBeNull();
  expect(uniqueTripSearchRegion("Auckland", [{ ...row, area: undefined }])).toBeNull();
});
