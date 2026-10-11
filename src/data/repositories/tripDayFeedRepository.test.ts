import { createTripDayFeedReader } from "./tripDayFeedRepository";
import { beforeEach, expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import type { ObservedDayProjection } from "./tripDayReadRepository";
vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("@/data/db/database", () => ({ readInitializedDatabase: vi.fn() }));
const accountId = "10000000-0000-4000-8000-000000000001",
  tripId = "20000000-0000-4000-8000-000000000001";
const observed: ObservedDayProjection = {
  sourceStatus: "CURRENTLY_MATCHES_SOURCE",
  projection: {
    accountId,
    tripId,
    version: 1,
    generation: 1,
    source: { epochId: "e", revision: "1", fingerprint: "hash", appliedGeneration: 1 },
    events: [],
  },
};
let account: string;
beforeEach(() => {
  account = accountId;
});
function reader(
  projection = vi.fn(async () => observed as ObservedDayProjection | null),
) {
  const services = vi.fn(async () => ({}));
  const candidates = vi.fn(async () => []);
  return {
    read: createTripDayFeedReader({
      account: async () => account,
      projection,
      candidates,
      services,
    }),
    projection,
    services,
    candidates,
  };
}
it("admits explicit IDs independently of empty partial Ledger discovery", async () => {
  const r = reader();
  expect((await r.read.candidates()).candidates).toEqual([]);
  expect((await r.read.trip(tripId)).observed).toEqual(observed);
  expect(r.projection).toHaveBeenCalledWith(tripId);
});
it("distinguishes unavailable admission from an accepted empty projection", async () => {
  const r = reader(vi.fn(async () => null));
  expect((await r.read.trip(tripId)).observed).toBeNull();
  expect(r.services).not.toHaveBeenCalled();
  expect((await reader().read.trip(tripId)).observed?.projection.events).toEqual([]);
});
it("does not accept mismatched account or source scope", async () => {
  for (const projection of [
    { ...observed.projection, accountId: "other" },
    { ...observed.projection, tripId: "other" },
  ]) {
    await expect(
      reader(vi.fn(async () => ({ ...observed, projection }))).read.trip(tripId),
    ).rejects.toThrow("DAY_FEED_SCOPE");
  }
});
it("rejects changed accounts and ABA generations after pending reads", async () => {
  for (const change of [
    () => {
      account = "other";
    },
    () => {
      advanceAccountGeneration();
    },
  ]) {
    account = accountId;
    const r = reader(
      vi.fn(async () => {
        change();
        return observed;
      }),
    );
    await expect(r.read.trip(tripId)).rejects.toThrow("Account changed");
    expect(r.services).not.toHaveBeenCalled();
  }
});
it("fences candidate discovery and optional supplemental completion", async () => {
  const dependencies = {
    account: async () => account,
    projection: async () => observed,
    candidates: async () => {
      advanceAccountGeneration();
      return [{ journeyId: tripId, title: "private" }];
    },
    services: async () => {
      advanceAccountGeneration();
      return {};
    },
  };
  const r = createTripDayFeedReader(dependencies);
  await expect(r.candidates()).rejects.toThrow("Account changed");
  await expect(r.trip(tripId)).rejects.toThrow("Account changed");
});
it("invalid IDs never reach data reads", async () => {
  const r = reader();
  await expect(r.read.trip("invalid")).rejects.toThrow();
  expect(r.projection).not.toHaveBeenCalled();
});
it("retained offline projections do not borrow current supplemental facts", async () => {
  const r = reader(
    vi.fn(async () => ({ ...observed, sourceStatus: "HISTORICAL_ACCEPTED_PROJECTION" })),
  );
  expect((await r.read.trip(tripId)).observed).not.toBeNull();
  expect(r.services).not.toHaveBeenCalled();
});

it("supplemental unavailability preserves admitted local facts but never hides account changes", async () => {
  const r = createTripDayFeedReader({
    account: async () => account,
    projection: async () => observed,
    candidates: async () => [],
    services: async () => {
      throw new Error("cache unavailable");
    },
  });
  expect((await r.trip(tripId)).observed).toEqual(observed);
  const changed = createTripDayFeedReader({
    account: async () => account,
    projection: async () => observed,
    candidates: async () => [],
    services: async () => {
      account = "other";
      throw new Error("cache unavailable");
    },
  });
  await expect(changed.trip(tripId)).rejects.toThrow("Account changed");
});
