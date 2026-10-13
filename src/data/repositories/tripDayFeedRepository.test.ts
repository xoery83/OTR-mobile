import { readTripDayFeed, createTripDayFeedReader } from "./tripDayFeedRepository";
import { beforeEach, expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import type { ObservedDayProjection } from "./tripDayReadRepository";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { readInitializedDatabase } from "@/data/db/database";
import { applyCoreCommand, emptyCoreGraph } from "@/domain/trip/tripCoreV2Mutation";
import { coreDefaults } from "@/domain/trip/tripCoreV2";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
const factory = vi.hoisted(() => ({
  captureContext: vi.fn(),
  acceptedSnapshot: vi.fn(),
  install: vi.fn(),
  legacyProjection: vi.fn(),
  listJourneys: vi.fn(),
}));
vi.mock("./tripCoreV2Repository", () => ({ createTripCoreV2Repository: () => factory }));
vi.mock("./tripDayReadRepository", () => ({
  createTripDayReadRepository: () => ({ getProjection: factory.legacyProjection }),
}));
vi.mock("./ledgerReportingRepository", () => ({
  createLedgerReportingRepository: () => ({ listJourneys: factory.listJourneys }),
}));
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

it("production local reader includes accepted Stay occurrences while keeping legacy fallback and no installation", async () => {
  const itemId = "30000000-0000-4000-8000-000000000001";
  const actor = {
    accountId,
    tripId,
    active: true,
    canManageShared: false,
    personId: "40000000-0000-4000-8000-000000000001",
    personIds: ["40000000-0000-4000-8000-000000000001"],
  };
  let graph = applyCoreCommand(
    emptyCoreGraph(),
    {
      contractVersion: 2,
      intentVersion: 2,
      operationId: "50000000-0000-4000-8000-000000000001",
      tripId,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id: itemId },
      baseVector: [{ kind: "ITEM", id: itemId, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        family: "P3",
        core: { title: "Saved Stay" },
        schedule: {
          start: coreDateBoundary("2026-10-14"),
          end: coreDateBoundary("2026-10-17"),
        },
        ...coreDefaults("member"),
      },
    },
    actor,
    "2026-10-13T00:00:00Z",
  ).graph;
  const flightId = "60000000-0000-4000-8000-000000000001";
  graph = applyCoreCommand(
    graph,
    {
      contractVersion: 2,
      intentVersion: 2,
      operationId: "70000000-0000-4000-8000-000000000001",
      tripId,
      command: "CREATE_SPARSE_FLIGHT",
      target: { kind: "ITEM", id: flightId },
      baseVector: [{ kind: "ITEM", id: flightId, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        flightNumberLiteral: "NZ0289A",
        departureDate: "2026-10-14",
        ...coreDefaults("member"),
      },
    },
    actor,
    "2026-10-13T00:00:00Z",
  ).graph;
  vi.mocked(requireActiveUserId).mockResolvedValue(accountId);
  vi.mocked(readInitializedDatabase).mockResolvedValue({} as never);
  factory.captureContext.mockReset().mockResolvedValue({ accountId, tripId });
  factory.acceptedSnapshot.mockReset().mockResolvedValue({
    graph,
    actor,
    certificate: {
      epoch: "epoch",
      revision: "1",
      access_revision: 1,
      applied_generation: 1,
      actor_person_binding_hash: "binding",
      roster_hash: "roster",
      manifest_sha256: "manifest",
    },
    participatingPersonIds: actor.personIds,
  });
  factory.legacyProjection.mockReset().mockResolvedValue(observed);
  factory.install.mockClear();
  const reader = await readTripDayFeed();
  const accepted = await reader.trip(tripId);
  expect(accepted.observed?.projection.events.map((event) => event.title)).toContain(
    "Saved Stay",
  );
  expect(accepted.observed?.projection.version).toBe(2);
  if (accepted.observed?.projection.version !== 2) throw new Error("EXPECTED_CORE_V2");
  expect(accepted.observed.projection.flightFacts[flightId].flightNumberLiteral).toBe(
    "NZ0289A",
  );
  expect(accepted.services).toEqual({
    [flightId]: accepted.observed.projection.flightFacts[flightId].services,
  });
  expect(factory.legacyProjection).not.toHaveBeenCalled();
  factory.acceptedSnapshot.mockResolvedValue(null);
  expect((await reader.trip(tripId)).observed).toEqual(observed);
  expect(factory.legacyProjection).toHaveBeenCalledWith(tripId);
  expect(factory.install).not.toHaveBeenCalled();
});
