import { expect, it, vi } from "vitest";
import { createTripTodaysJourneyReader } from "./tripTodaysJourneyRepository";
import { createTripDayFeedReader } from "./tripDayFeedRepository";
import {
  getAccountGeneration,
  advanceAccountGeneration,
} from "../auth/accountGeneration";
import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));

const tripId = "b61b0000-0061-4000-8000-000000000001";
const clock = { now: "2027-02-06T03:00:00Z", zone: "Asia/Tokyo" };
const source = {
  epoch: "epoch",
  revision: "1",
  accessRevision: 1,
  actorPersonBindingHash: "binding",
  participatingRosterHash: "roster",
  manifestSha256: "manifest",
};
function setup(coreGeneration = getAccountGeneration()) {
  let active = "actor";
  let projection = {
    version: 2,
    accountId: active,
    tripId,
    generation: coreGeneration,
    source,
    events: [],
    items: [],
    flightFacts: {},
    query: (date: string, zone: string) => ({
      date,
      zone,
      coreRows: [],
      timed: [],
      nonComparable: [],
      unresolved: [],
    }),
  } as CoreFlightDayProjection;
  let status = "CURRENTLY_MATCHES_SOURCE";
  const account = async () => active;
  const days = createTripDayFeedReader({
    account,
    projection: async () => null,
    coreProjection: async () => ({ projection, sourceStatus: status }) as never,
    candidates: async () => [],
    services: async () => ({}),
  });
  const resolveItem = vi.fn(async () => null);
  const reader = createTripTodaysJourneyReader(days, { resolveItem }, account);
  return {
    reader,
    resolveItem,
    revoke: () => {
      active = "other";
    },
    stale: () => {
      status = "STALE";
    },
    sourceChange: () => {
      projection = { ...projection, source: { ...source, revision: "2" } };
    },
  };
}
it("uses the production Day reader account boundary and accepted empty Day, not invented entries", async () => {
  const { reader } = setup();
  const result = await reader.read(tripId, clock);
  expect(result?.scope.tripId).toBe(tripId);
  expect(result?.today.primaryKind).toBe("FREE");
  expect(result?.today.date).toBe("2027-02-06");
});
it("fails closed for stale, missing zone, switched account and changed source at tap", async () => {
  const a = setup();
  const expected = (await a.reader.read(tripId, clock))!;
  a.sourceChange();
  expect(await a.reader.resolveItem(tripId, "item", expected, clock)).toBeNull();
  expect(a.resolveItem).not.toHaveBeenCalled();
  a.stale();
  expect(await a.reader.read(tripId, clock)).toBeNull();
  const b = setup();
  expect(await b.reader.read(tripId, { ...clock, zone: null })).toBeNull();
  b.revoke();
  await expect(b.reader.read(tripId, clock)).rejects.toThrow("DAY_FEED_SCOPE");
});

it("reads an accepted Core certificate whose generation differs from the Auth session", async () => {
  const { reader } = setup(getAccountGeneration() + 70);
  const result = await reader.read(tripId, clock);
  expect(result?.scope.generation).toBe(getAccountGeneration());
  expect(result?.today.date).toBe("2027-02-06");
});
it("rejects a saved Today tap after the Auth generation changes", async () => {
  const { reader, resolveItem } = setup();
  const expected = (await reader.read(tripId, clock))!;
  advanceAccountGeneration();
  expect(await reader.resolveItem(tripId, "item", expected, clock)).toBeNull();
  expect(resolveItem).not.toHaveBeenCalled();
});
