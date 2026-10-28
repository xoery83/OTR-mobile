import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import { coreDefaults } from "@/domain/trip/tripCoreV2";
import { createNormalTripSyncWake } from "./tripNormalSync";
function fixture() {
  const accountId = randomUUID(),
    tripId = randomUUID(),
    operationId = randomUUID();
  const request = {
    formatVersion: 2,
    tripId,
    name: "New",
    destination: null,
    startDate: null,
    endDate: null,
    destinations: [],
  };
  const create = {
    id: operationId,
    trip_id: tripId,
    entity_id: tripId,
    idempotency_key: operationId,
    entity_type: "TRIP",
    operation_type: "CREATE_TRIP",
    payload_json: JSON.stringify(request),
  };
  const getAllAsync = vi.fn().mockResolvedValueOnce([create]).mockResolvedValue([]);
  let actor = accountId,
    enabled = true;
  const deps = {
    database: { getAllAsync },
    account: async () => actor,
    enabled: () => enabled,
    deferred: { materializeDeferredMetadata: vi.fn().mockResolvedValue(0) },
    recoverTripReadback: vi.fn().mockResolvedValue(undefined),
    recoverP1Readback: vi.fn().mockResolvedValue(undefined),
    runCreate: vi.fn().mockResolvedValue({}),
    runMetadata: vi.fn().mockResolvedValue({}),
    runPerson: vi.fn().mockResolvedValue({}),
    runP1: vi.fn().mockResolvedValue({}),
    isManualItem: vi.fn().mockResolvedValue(false),
    participantsReady: vi.fn().mockResolvedValue(false),
  };
  const run = () =>
    createNormalTripSyncWake(deps, {
      accountId,
      newTripsFrom: "2026-10-24T00:00:00.000Z",
    })("AUTHENTICATED_ONLINE");
  return {
    accountId,
    tripId,
    operationId,
    create,
    deps,
    run,
    switchAccount: () => {
      actor = randomUUID();
      advanceAccountGeneration();
    },
    close: () => {
      enabled = false;
    },
  };
}
it("stays closed offline or without explicit port without reading SQLite", async () => {
  const f = fixture();
  f.close();
  expect(await f.run()).toMatchObject({ status: "closed" });
  expect(f.deps.database.getAllAsync).not.toHaveBeenCalled();
});
it("selects only new V2 owning Trip roots, skips unknown/old payloads individually", async () => {
  const f = fixture();
  f.deps.database.getAllAsync
    .mockReset()
    .mockResolvedValueOnce([
      { ...f.create, payload_json: "{broken" },
      { ...f.create, payload_json: "{}" },
      f.create,
    ])
    .mockResolvedValue([]);
  await f.run();
  expect(f.deps.runCreate).toHaveBeenCalledExactlyOnceWith({
    accountId: f.accountId,
    tripId: f.tripId,
    operationId: f.operationId,
  });
  expect(f.deps.database.getAllAsync.mock.calls[0][0]).toContain("trip.created_at>=?");
  expect(f.deps.database.getAllAsync.mock.calls[0].slice(1)).toEqual([
    f.accountId,
    "2026-10-24T00:00:00.000Z",
  ]);
  expect(f.deps.runMetadata).not.toHaveBeenCalled();
  expect(f.deps.runP1).not.toHaveBeenCalled();
});
it("fences Account changes before continuing any Metadata/Core call", async () => {
  const f = fixture();
  f.deps.runCreate.mockImplementation(async () => {
    f.switchAccount();
  });
  await expect(f.run()).rejects.toThrow();
  expect(f.deps.deferred.materializeDeferredMetadata).not.toHaveBeenCalled();
  expect(f.deps.runMetadata).not.toHaveBeenCalled();
  expect(f.deps.runP1).not.toHaveBeenCalled();
});
it("local deferred or unknown operations never reach transport; legitimate V3 is exact-targeted", async () => {
  const f = fixture(),
    metaId = randomUUID();
  const before = {
    name: "Before",
    destination: null,
    startDate: null,
    endDate: null,
    destinations: [],
  };
  const wire = {
    formatVersion: 3,
    operationId: metaId,
    tripId: f.tripId,
    expectedMetadataRevision: 4,
    before,
    after: { ...before, name: "After" },
  };
  f.deps.database.getAllAsync
    .mockReset()
    .mockResolvedValue([])
    .mockResolvedValueOnce([f.create])
    .mockResolvedValueOnce([
      { ...f.create, operation_type: "TRIP_METADATA_DEFERRED", payload_json: "{}" },
      { ...f.create, operation_type: "UPDATE_TRIP_METADATA", payload_json: "{broken" },
      {
        ...f.create,
        id: metaId,
        idempotency_key: metaId,
        operation_type: "UPDATE_TRIP_METADATA",
        payload_json: JSON.stringify(wire),
      },
    ]);
  await f.run();
  expect(f.deps.runMetadata).toHaveBeenCalledExactlyOnceWith({
    accountId: f.accountId,
    tripId: f.tripId,
    operationId: metaId,
  });
  expect(f.deps.runP1).not.toHaveBeenCalled();
});

it("only sends manual P1 after exact participant qualification, leaving local-private people untouched", async () => {
  const f = fixture(),
    coreId = randomUUID(),
    itemId = randomUUID();
  const c = {
    contractVersion: 2,
    intentVersion: 2,
    operationId: coreId,
    tripId: f.tripId,
    command: "CREATE_ITEM",
    target: { kind: "ITEM", id: itemId },
    baseVector: [{ kind: "ITEM", id: itemId, revision: null }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      family: "P1",
      core: { title: "Manual plan" },
      schedule: { start: coreDateBoundary("2026-11-02") },
      ...coreDefaults("organizer"),
    },
  };
  const row = {
    ...f.create,
    id: coreId,
    entity_id: itemId,
    idempotency_key: coreId,
    entity_type: "TRIP_CORE_V2",
    operation_type: "CORE_V2_COMMAND",
    payload_json: JSON.stringify(c),
  };
  f.deps.database.getAllAsync
    .mockReset()
    .mockResolvedValue([])
    .mockResolvedValueOnce([f.create])
    .mockResolvedValueOnce([row]);
  await f.run();
  expect(f.deps.participantsReady).toHaveBeenCalledOnce();
  expect(f.deps.runP1).not.toHaveBeenCalled();
  f.deps.participantsReady.mockResolvedValue(true);
  f.deps.database.getAllAsync
    .mockResolvedValueOnce([f.create])
    .mockResolvedValueOnce([row]);
  await f.run();
  expect(f.deps.runP1).toHaveBeenCalledExactlyOnceWith({
    accountId: f.accountId,
    tripId: f.tripId,
    operationId: coreId,
  });
});
it("isolates an ordinary failed Trip without poisoning another eligible Trip", async () => {
  const f = fixture(),
    trip2 = randomUUID(),
    op2 = randomUUID(),
    second = {
      ...f.create,
      id: op2,
      trip_id: trip2,
      entity_id: trip2,
      idempotency_key: op2,
      payload_json: JSON.stringify({
        ...JSON.parse(f.create.payload_json),
        tripId: trip2,
      }),
    };
  f.deps.database.getAllAsync
    .mockReset()
    .mockResolvedValueOnce([f.create, second])
    .mockResolvedValue([]);
  f.deps.runCreate.mockRejectedValueOnce(Error("network")).mockResolvedValue({});
  const result = await f.run();
  expect(result.blockedTripIds).toEqual([f.tripId]);
  expect(f.deps.runCreate).toHaveBeenCalledTimes(2);
  expect(f.deps.recoverTripReadback).toHaveBeenCalledWith(trip2, op2);
});

it.each(["P3", "P4"] as const)(
  "normal wake qualifies only the current Manual %s checkpoint",
  async (family) => {
    const f = fixture(),
      operationId = randomUUID(),
      itemId = randomUUID();
    const command = {
      contractVersion: 2,
      intentVersion: 2,
      operationId,
      tripId: f.tripId,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id: itemId },
      baseVector: [{ kind: "ITEM", id: itemId, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        family,
        ...(family === "P4" ? { details: {}, places: {} } : {}),
        core: { title: "Manual Stay" },
        schedule: {
          start: coreDateBoundary("2026-11-02"),
          end: coreDateBoundary("2026-11-04"),
        },
        ...coreDefaults("member"),
      },
    };
    f.deps.participantsReady.mockResolvedValue(true);
    f.deps.database.getAllAsync
      .mockReset()
      .mockResolvedValue([])
      .mockResolvedValueOnce([f.create])
      .mockResolvedValueOnce([
        {
          ...f.create,
          id: operationId,
          entity_id: itemId,
          idempotency_key: operationId,
          entity_type: "TRIP_CORE_V2",
          operation_type: "CORE_V2_COMMAND",
          payload_json: JSON.stringify(command),
        },
      ]);
    await f.run();
    expect(f.deps.runP1).toHaveBeenCalledTimes(1);
  },
);
it.each([true, false])(
  "P3 SET_STAY_DETAILS dispatch requires verified target family (%s)",
  async (matching) => {
    const f = fixture(),
      operationId = randomUUID(),
      itemId = randomUUID();
    f.deps.isManualItem.mockImplementation(
      async (_trip, _item, family) => matching && family === "P3",
    );
    f.deps.participantsReady.mockResolvedValue(true);
    const command = {
      contractVersion: 2,
      intentVersion: 2,
      operationId,
      tripId: f.tripId,
      command: "SET_STAY_DETAILS",
      target: { kind: "ITEM", id: itemId },
      baseVector: [{ kind: "ITEM", id: itemId, revision: 1 }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        details: {
          property_name: "QA Hotel",
          permitted_checkin_from: null,
          permitted_checkin_until: null,
          permitted_checkout_by: null,
        },
        rooms: [],
      },
    };
    f.deps.database.getAllAsync
      .mockReset()
      .mockResolvedValue([])
      .mockResolvedValueOnce([f.create])
      .mockResolvedValueOnce([
        {
          ...f.create,
          id: operationId,
          entity_id: itemId,
          idempotency_key: operationId,
          entity_type: "TRIP_CORE_V2",
          operation_type: "CORE_V2_COMMAND",
          payload_json: JSON.stringify(command),
        },
      ]);
    await f.run();
    expect(f.deps.runP1).toHaveBeenCalledTimes(matching ? 1 : 0);
  },
);

it.each([true, false])(
  "P4 SET_RENTAL_DETAILS dispatch requires verified target family (%s)",
  async (matching) => {
    const f = fixture(),
      operationId = randomUUID(),
      itemId = randomUUID();
    f.deps.isManualItem.mockImplementation(
      async (_trip, _item, family) => matching && family === "P4",
    );
    f.deps.participantsReady.mockResolvedValue(true);
    const command = {
      contractVersion: 2,
      intentVersion: 2,
      operationId,
      tripId: f.tripId,
      command: "SET_RENTAL_DETAILS",
      target: { kind: "ITEM", id: itemId },
      baseVector: [{ kind: "ITEM", id: itemId, revision: 1 }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: { details: { supplier: "QA Rental" }, places: {} },
    };
    f.deps.database.getAllAsync
      .mockReset()
      .mockResolvedValue([])
      .mockResolvedValueOnce([f.create])
      .mockResolvedValueOnce([
        {
          ...f.create,
          id: operationId,
          entity_id: itemId,
          idempotency_key: operationId,
          entity_type: "TRIP_CORE_V2",
          operation_type: "CORE_V2_COMMAND",
          payload_json: JSON.stringify(command),
        },
      ]);
    await f.run();
    expect(f.deps.runP1).toHaveBeenCalledTimes(matching ? 1 : 0);
  },
);
