import { readTripDayFeed, createTripDayFeedReader } from "./tripDayFeedRepository";
import { beforeEach, expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import type { ObservedDayProjection } from "./tripDayReadRepository";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { readInitializedDatabase } from "@/data/db/database";
import { applyCoreCommand, emptyCoreGraph } from "@/domain/trip/tripCoreV2Mutation";
import { corePlaceSchema, coreDefaults } from "@/domain/trip/tripCoreV2";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
const factory = vi.hoisted(() => ({
  captureContext: vi.fn(),
  acceptedSnapshot: vi.fn(),
  install: vi.fn(),
  legacyProjection: vi.fn(),
  listJourneys: vi.fn(),
}));
// This suite isolates accepted readers; local committed reads have real SQLite coverage separately.
vi.mock("./tripLocalManualReadRepository", () => ({
  createTripLocalManualReader: () => async () => null,
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

it("production local reader includes accepted P1–P6 occurrences while keeping legacy fallback and no installation", async () => {
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
  for (const [index, family] of (["P4", "P5", "P6"] as const).entries()) {
    const id = `30000000-0000-4000-8000-00000000000${index + 2}`;
    const dates = {
      start: coreDateBoundary("2026-10-14"),
      end: coreDateBoundary("2026-10-14"),
    };
    const payload =
      family === "P5"
        ? {
            family,
            core: { title: "Saved Segment" },
            endpoints: {
              origin: {
                time: dates.start,
                place: Object.fromEntries(
                  Object.keys(corePlaceSchema.shape).map((key) => [key, null]),
                ),
              },
              destination: {
                time: dates.end,
                place: Object.fromEntries(
                  Object.keys(corePlaceSchema.shape).map((key) => [key, null]),
                ),
              },
            },
            service: {
              service_key: "RAIL",
              transport_subtype: "TRAIN",
              attribution: "UNSPECIFIED",
              operator_namespace: "NAME",
              operator_issuer: "Test authority",
              operator_value: "Test rail",
              operator_literal: "Test rail",
              service_literal: "Test service",
              service_number: "T1",
              codeshare_operating_key: null,
            },
            ...coreDefaults("member"),
          }
        : {
            family,
            core: { title: family === "P4" ? "Saved Rental" : "Saved Activity" },
            schedule: dates,
            ...coreDefaults("member"),
          };
    graph = applyCoreCommand(
      graph,
      {
        contractVersion: 2,
        intentVersion: 2,
        operationId: `50000000-0000-4000-8000-00000000000${index + 2}`,
        tripId,
        command: "CREATE_ITEM",
        target: { kind: "ITEM", id },
        baseVector: [{ kind: "ITEM", id, revision: null }],
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
        payload,
      },
      actor,
      "2026-10-13T00:00:00Z",
    ).graph;
  }
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
  expect(accepted.observed.projection.items.map((item) => item.family)).toEqual(
    expect.arrayContaining(["P3", "P4", "P5", "P6", "P2"]),
  );
  expect(factory.acceptedSnapshot).toHaveBeenCalledTimes(1);
  expect(
    accepted.observed.projection
      .query("2026-10-14", "UTC")
      .coreRows.filter((row) => row.family === "P4")
      .map((row) => row.rowKey.projectionRole),
  ).toEqual(["PICKUP", "RETURN"]);
  expect(factory.legacyProjection).not.toHaveBeenCalled();
  factory.acceptedSnapshot.mockResolvedValue(null);
  expect((await reader.trip(tripId)).observed).toEqual(observed);
  expect(factory.legacyProjection).toHaveBeenCalledWith(tripId);
  expect(factory.install).not.toHaveBeenCalled();
});

it("production P4–P6 consumer reads only installed coherent certificates across SQLite cold reopen", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { createHash, randomUUID } = await import("node:crypto");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { migrations } = await import("../db/migrations");
  const { serializeDatabaseTransactions } = await import("../db/databaseConnection");
  const { createTripCoreV2Repository } = await vi.importActual<
    typeof import("./tripCoreV2Repository")
  >("./tripCoreV2Repository");
  const { buildCoreActorCollection } =
    await import("../../../backend/src/tripCoreV2Collection");
  const folder = mkdtempSync(join(tmpdir(), "otr-p456-consumer-"));
  const path = join(folder, "owned.sqlite");
  let sql = new DatabaseSync(path);
  const hash = async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  const actor = {
    accountId,
    tripId,
    personId: "40000000-0000-4000-8000-000000000001",
    personIds: ["40000000-0000-4000-8000-000000000001"],
    active: true,
    canManageShared: false,
  };
  const date = "2027-01-15";
  const clock = (hour: string) => ({
    ...coreDateBoundary(date),
    instant: `${date}T${hour}:00:00Z`,
    local_time: `${hour}:00:00`,
    clock_precision: 0,
    quality: "EXACT",
    basis: "SOURCE_INSTANT",
    zone_id: "UTC",
    source_instant: `${date}T${hour}:00:00Z`,
    source_instant_precision: 0,
  });
  const rentalId = randomUUID(),
    activityId = randomUUID();
  let graph = emptyCoreGraph();
  for (const [family, id, schedule] of [
    ["P4", rentalId, { start: clock("09"), end: clock("18") }],
    ["P6", activityId, { start: coreDateBoundary(date) }],
  ] as const) {
    graph = applyCoreCommand(
      graph,
      {
        contractVersion: 2,
        intentVersion: 2,
        operationId: randomUUID(),
        tripId,
        command: "CREATE_ITEM",
        target: { kind: "ITEM", id },
        baseVector: [{ kind: "ITEM", id, revision: null }],
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
        payload: {
          family,
          core: { title: family === "P4" ? "Contract Rental" : "Contract Activity" },
          schedule,
          ...coreDefaults("member"),
        },
      },
      actor,
      "2027-01-01T00:00:00Z",
    ).graph;
  }
  const segmentId = randomUUID();
  const emptyPlace = Object.fromEntries(
    Object.keys(corePlaceSchema.shape).map((key) => [key, null]),
  );
  graph = applyCoreCommand(
    graph,
    {
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id: segmentId },
      baseVector: [{ kind: "ITEM", id: segmentId, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        family: "P5",
        core: { title: "Contract Segment" },
        endpoints: {
          origin: { time: clock("10"), place: emptyPlace },
          destination: { time: clock("11"), place: emptyPlace },
        },
        service: {
          service_key: "RAIL",
          transport_subtype: "TRAIN",
          attribution: "UNSPECIFIED",
          operator_namespace: "NAME",
          operator_issuer: "Test authority",
          operator_value: "Test rail",
          operator_literal: "Test rail",
          service_literal: "Test service",
          service_number: "T1",
          codeshare_operating_key: null,
        },
        ...coreDefaults("member"),
      },
    },
    actor,
    "2027-01-01T00:00:00Z",
  ).graph;
  const database = serializeDatabaseTransactions({
    async getFirstAsync<T>(query: string, ...params: unknown[]) {
      return (sql.prepare(query).get(...(params as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(query: string, ...params: unknown[]) {
      return sql.prepare(query).all(...(params as never[])) as T[];
    },
    async runAsync(query: string, ...params: unknown[]) {
      return sql.prepare(query).run(...(params as never[])) as never;
    },
    async withTransactionAsync(work: () => Promise<void>) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  });
  try {
    sql.exec("PRAGMA foreign_keys=ON");
    for (const migration of migrations) sql.exec(migration.sql);
    const repo = createTripCoreV2Repository(database, async () => account, hash);
    vi.mocked(requireActiveUserId).mockImplementation(async () => account);
    vi.mocked(readInitializedDatabase).mockResolvedValue(database as never);
    factory.captureContext.mockReset().mockImplementation(repo.captureContext);
    factory.acceptedSnapshot.mockReset().mockImplementation(repo.acceptedSnapshot);
    factory.legacyProjection.mockReset().mockResolvedValue(null);
    factory.install.mockClear();
    const reader = await readTripDayFeed();
    expect((await reader.trip(tripId)).observed).toBeNull();
    const bundle = await buildCoreActorCollection(
      graph,
      actor,
      {
        epoch: randomUUID(),
        revision: 1,
        accessRevision: 1,
        generatedAt: "2027-01-01T00:00:00Z",
      },
      [
        {
          person_id: actor.personId,
          account_id: accountId,
          active: true,
          participating: true,
          revision: 1,
        },
      ],
      hash,
    );
    const ctx = await repo.captureContext(tripId);
    await repo.install(await repo.beginRefresh(ctx, 1), bundle.manifest, bundle.pages);
    sql.close();
    sql = new DatabaseSync(path);
    sql.exec("PRAGMA foreign_keys=ON");
    const read = await reader.trip(tripId);
    if (read.observed?.projection.version !== 2) throw new Error("EXPECTED_INSTALLED_V2");
    const query = read.observed.projection.query(date, "UTC");
    expect(
      query.timed
        .filter((row) => row.event.id === rentalId)
        .map((row) => [row.roles, row.anchor]),
    ).toEqual([
      [["START"], `${date}T09:00:00Z`],
      [["END"], `${date}T18:00:00Z`],
    ]);
    expect(query.nonComparable.map((row) => row.event.id)).toContain(activityId);
    expect(read.observed.projection.items).toHaveLength(3);
    expect(query.timed.some((row) => row.event.id === segmentId)).toBe(true);
    expect(factory.install).not.toHaveBeenCalled();
    sql
      .prepare(
        "UPDATE trip_core_read_certificates SET access_revision=access_revision+1 WHERE account_id=? AND trip_id=?",
      )
      .run(accountId, tripId);
    await expect(reader.trip(tripId)).rejects.toThrow("CORE_READ_ACCESS_MISMATCH");
    sql
      .prepare(
        "UPDATE trip_core_read_certificates SET access_revision=access_revision-1 WHERE account_id=? AND trip_id=?",
      )
      .run(accountId, tripId);
    account = randomUUID();
    expect((await reader.trip(tripId)).observed).toBeNull();
    account = accountId;
    expect((await reader.trip(tripId)).observed?.projection.version).toBe(2);
  } finally {
    sql.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

it("local pin failure stays unavailable without revoking coherent accepted facts", async () => {
  const read = createTripDayFeedReader({
    account: async () => accountId,
    projection: async () => observed,
    localManual: async () => {
      throw new Error("LOCAL_MANUAL_COMMIT_PIN");
    },
    candidates: async () => [],
    services: async () => ({}),
  });
  const result = await read.trip(tripId);
  expect(result.observed).toBe(observed);
  expect(result.localManual).toBeNull();
  expect(result.localManualStatus).toBe("UNAVAILABLE");
});
