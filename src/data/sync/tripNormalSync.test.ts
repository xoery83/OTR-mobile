import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import { coreDefaults, corePlaceSchema } from "@/domain/trip/tripCoreV2";
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
      {
        ...f.create,
        operation_type: "TRIP_METADATA_DEFERRED",
        payload_json: "{}",
      },
      {
        ...f.create,
        operation_type: "UPDATE_TRIP_METADATA",
        payload_json: "{broken",
      },
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

it.each([true, false])(
  "P5 dispatch requires matching family and exact edit commands (%s)",
  async (matching) => {
    for (const name of [
      "SET_ITEM_TEXT",
      "SET_ITEM_PARTICIPATION",
      "SET_TRANSPORT_DETAILS",
      "SET_ITEM_SCHEDULE",
      "SET_ITEM_PLACE",
    ]) {
      const f = fixture(),
        operationId = randomUUID(),
        itemId = randomUUID();
      f.deps.isManualItem.mockImplementation(
        async (_trip, _item, family) => matching && family === "P5",
      );
      f.deps.participantsReady.mockResolvedValue(true);
      const payload =
        name === "SET_ITEM_TEXT"
          ? { title: "Updated" }
          : name === "SET_ITEM_PARTICIPATION"
            ? { participation: coreDefaults("organizer").participation }
            : name === "SET_TRANSPORT_DETAILS"
              ? {
                  service: {
                    service_key: "a".repeat(32),
                    transport_subtype: "TRAIN",
                    attribution: "UNSPECIFIED",
                    operator_namespace: "NAME",
                    operator_issuer: "",
                    operator_value: "",
                    operator_literal: "",
                    service_number: "",
                    service_literal: "",
                    codeshare_operating_key: null,
                  },
                }
              : name === "SET_ITEM_SCHEDULE"
                ? {
                    schedule: {
                      start: coreDateBoundary("2026-11-02"),
                      end: coreDateBoundary("2026-11-03"),
                    },
                  }
                : { place: {} };
      const command = {
        contractVersion: 2,
        intentVersion: 2,
        operationId,
        tripId: f.tripId,
        command: name,
        target: { kind: "ITEM", id: itemId },
        baseVector: [{ kind: "ITEM", id: itemId, revision: 1 }],
        admission: {
          mode: "MANUAL",
          sourceIntentId: null,
          policyVersion: null,
        },
        payload,
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
      expect(f.deps.runP1).toHaveBeenCalledTimes(
        matching &&
          ["SET_ITEM_TEXT", "SET_ITEM_PARTICIPATION", "SET_TRANSPORT_DETAILS"].includes(
            name,
          )
          ? 1
          : 0,
      );
    }
  },
);

it.each(["TRAIN", "BUS", "FERRY", "WATER_TAXI", "SHUTTLE", "TRANSFER"])(
  "normal P5 %s Create reuses exact existing Core worker",
  async (transportType) => {
    const f = fixture(),
      operationId = randomUUID(),
      itemId = randomUUID();
    const place = Object.fromEntries(
      Object.keys(corePlaceSchema.shape).map((k) => [k, null]),
    );
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
        family: "P5",
        core: { title: "Transport" },
        endpoints: {
          origin: {
            time: coreDateBoundary("2026-11-02"),
            place: { ...place, authored_label: "Station" },
          },
          destination: {
            time: { ...coreDateBoundary("2026-11-02"), local_date: null },
            place,
          },
        },
        service: {
          service_key: "a".repeat(32),
          transport_subtype: transportType,
          attribution: "UNSPECIFIED",
          operator_namespace: "NAME",
          operator_issuer: "",
          operator_value: "",
          operator_literal: "",
          service_number: "",
          service_literal: "",
          codeshare_operating_key: null,
        },
        ...coreDefaults("organizer"),
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
    expect(f.deps.runP1).toHaveBeenCalledOnce();
  },
);

const p6DispatchPayloads = {
  SET_ITEM_TEXT: { title: "Updated activity" },
  SET_ITEM_SCHEDULE: {
    schedule: {
      start: coreDateBoundary("2026-11-02"),
      end: coreDateBoundary("2026-11-03"),
    },
  },
  SET_ITEM_PLACE: {
    place: Object.fromEntries(
      Object.keys(corePlaceSchema.shape).map((key) => [key, null]),
    ),
  },
  SET_ITEM_PARTICIPATION: {
    participation: coreDefaults("organizer").participation,
  },
  SET_ACTIVITY_DETAILS: {
    details: { session_label: "Morning", admission_note: null },
    entryPlace: null,
  },
  SET_TRANSPORT_DETAILS: { annotations: {} },
  SET_RENTAL_DETAILS: { details: {}, places: {} },
};
const p6DispatchCommands = [
  "SET_ITEM_TEXT",
  "SET_ITEM_SCHEDULE",
  "SET_ITEM_PLACE",
  "SET_ITEM_PARTICIPATION",
  "SET_ACTIVITY_DETAILS",
];

it.each([true, false])(
  "P6 exact normal edit selection requires target family (%s)",
  async (matching) => {
    for (const [name, payload] of Object.entries(p6DispatchPayloads)) {
      const f = fixture(),
        operationId = randomUUID(),
        itemId = randomUUID();
      f.deps.isManualItem.mockImplementation(
        async (_trip, _item, family) => matching && family === "P6",
      );
      f.deps.participantsReady.mockResolvedValue(true);
      const command = {
        contractVersion: 2,
        intentVersion: 2,
        operationId,
        tripId: f.tripId,
        command: name,
        target: { kind: "ITEM", id: itemId },
        baseVector: [{ kind: "ITEM", id: itemId, revision: 1 }],
        admission: {
          mode: "MANUAL",
          sourceIntentId: null,
          policyVersion: null,
        },
        payload,
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
      expect(f.deps.runP1).toHaveBeenCalledTimes(
        matching && p6DispatchCommands.includes(name) ? 1 : 0,
      );
    }
  },
);
it("P6 minimum Create uses existing formal Core worker without Source evidence", async () => {
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
      family: "P6",
      core: { title: "Museum" },
      schedule: { start: coreDateBoundary("2026-11-02") },
      ...coreDefaults("organizer"),
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
  expect(f.deps.runP1).toHaveBeenCalledOnce();
});

it.each([true, false])(
  "normal P2 manual Create/authored edit uses only owning family and existing runner (%s)",
  async (matching) => {
    for (const name of [
      "CREATE_SPARSE_FLIGHT",
      "SET_AUTHORED_FLIGHT_DETAILS",
      "SET_ITEM_PARTICIPATION",
      "SET_ITEM_SCHEDULE",
      "SET_ITEM_PLACE",
    ]) {
      const f = fixture(),
        operationId = randomUUID(),
        itemId = randomUUID();
      f.deps.isManualItem.mockImplementation(
        async (_trip, _id, family) => matching && family === "P2",
      );
      f.deps.participantsReady.mockResolvedValue(true);
      const payload =
        name === "CREATE_SPARSE_FLIGHT"
          ? {
              flightNumberLiteral: "NZ5069",
              departureDate: "2026-11-02",
              ...coreDefaults("organizer"),
            }
          : name === "SET_AUTHORED_FLIGHT_DETAILS"
            ? {
                flightNumberLiteral: "NZ5069",
                origin: {
                  airportCode: "AKL",
                  name: "Auckland",
                  terminal: null,
                  time: coreDateBoundary("2026-11-02"),
                },
                destination: {
                  airportCode: null,
                  name: null,
                  terminal: null,
                  time: { ...coreDateBoundary("2026-11-02"), local_date: null },
                },
              }
            : name === "SET_ITEM_PARTICIPATION"
              ? { participation: coreDefaults("organizer").participation }
              : name === "SET_ITEM_SCHEDULE"
                ? { schedule: { start: coreDateBoundary("2026-11-02") } }
                : {
                    place: Object.fromEntries(
                      Object.keys(corePlaceSchema.shape).map((k) => [k, null]),
                    ),
                  };
      const command = {
        contractVersion: 2,
        intentVersion: 2,
        operationId,
        tripId: f.tripId,
        command: name,
        target: { kind: "ITEM", id: itemId },
        baseVector: [
          {
            kind: "ITEM",
            id: itemId,
            revision: name === "CREATE_SPARSE_FLIGHT" ? null : 1,
          },
        ],
        admission: {
          mode: "MANUAL",
          sourceIntentId: null,
          policyVersion: null,
        },
        payload,
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
      expect(f.deps.runP1).toHaveBeenCalledTimes(
        name === "CREATE_SPARSE_FLIGHT" ||
          (matching &&
            ["SET_AUTHORED_FLIGHT_DETAILS", "SET_ITEM_PARTICIPATION"].includes(name))
          ? 1
          : 0,
      );
    }
  },
);

it.each([false, true])(
  "dispatches a fresh cloud-only own P6 Edit through existing queue (manualOnly %s)",
  async (manualOnly) => {
    const f = fixture(),
      operationId = randomUUID(),
      itemId = randomUUID();
    const command = {
      contractVersion: 2,
      intentVersion: 2,
      operationId,
      tripId: f.tripId,
      command: "SET_ITEM_TEXT",
      target: { kind: "ITEM", id: itemId },
      baseVector: [{ kind: "ITEM", id: itemId, revision: 1 }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: { title: "Fresh P6", description: null },
    };
    f.deps.database.getAllAsync
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        {
          ...f.create,
          id: operationId,
          entity_id: itemId,
          idempotency_key: operationId,
          entity_type: "TRIP_CORE_V2",
          operation_type: "CORE_V2_COMMAND",
          payload_json: JSON.stringify(command),
          attempt_count: 0,
          intent_state: "PENDING",
        },
      ]);
    f.deps.isManualItem.mockImplementation(
      async (_trip, _item, family) => family === "P6",
    );
    f.deps.participantsReady.mockResolvedValue(true);
    await createNormalTripSyncWake(f.deps, {
      accountId: f.accountId,
      newTripsFrom: "2026-10-24T00:00:00Z",
      manualOnly,
    })("AUTHENTICATED_ONLINE");
    expect(f.deps.runP1).toHaveBeenCalledExactlyOnceWith({
      accountId: f.accountId,
      tripId: f.tripId,
      operationId,
    });
    expect(f.deps.runCreate).not.toHaveBeenCalled();
  },
);

it.each([0, 1])(
  "cloud-only non-P6 MANUAL row is new-POST denied, retained attempts reach receipt recovery: attempts %s",
  async (attempts) => {
    const f = fixture(),
      operationId = randomUUID(),
      itemId = randomUUID();
    const command = {
      contractVersion: 2,
      intentVersion: 2,
      operationId,
      tripId: f.tripId,
      command: "SET_ITEM_TEXT",
      target: { kind: "ITEM", id: itemId },
      baseVector: [{ kind: "ITEM", id: itemId, revision: 1 }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: { title: "Retained", description: null },
    };
    f.deps.database.getAllAsync
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        {
          ...f.create,
          id: operationId,
          entity_id: itemId,
          idempotency_key: operationId,
          entity_type: "TRIP_CORE_V2",
          operation_type: "CORE_V2_COMMAND",
          payload_json: JSON.stringify(command),
          attempt_count: attempts,
          intent_state: attempts ? "IN_FLIGHT" : "PENDING",
        },
      ]);
    f.deps.isManualItem.mockResolvedValue(false);
    f.deps.participantsReady.mockResolvedValue(false);
    await f.run();
    expect(f.deps.runP1).toHaveBeenCalledTimes(attempts);
    if (attempts) {
      expect(f.deps.isManualItem).not.toHaveBeenCalled();
      expect(f.deps.participantsReady).not.toHaveBeenCalled();
    }
  },
);

it("retained IN_FLIGHT intent reaches receipt recovery even if queue attempt count has not advanced", async () => {
  const f = fixture(),
    operationId = randomUUID(),
    itemId = randomUUID();
  const command = {
    contractVersion: 2,
    intentVersion: 2,
    operationId,
    tripId: f.tripId,
    command: "SET_ITEM_TEXT",
    target: { kind: "ITEM", id: itemId },
    baseVector: [{ kind: "ITEM", id: itemId, revision: 1 }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: { title: "Original", description: null },
  };
  f.deps.database.getAllAsync
    .mockReset()
    .mockResolvedValueOnce([])
    .mockResolvedValue([
      {
        ...f.create,
        id: operationId,
        entity_id: itemId,
        idempotency_key: operationId,
        entity_type: "TRIP_CORE_V2",
        operation_type: "CORE_V2_COMMAND",
        payload_json: JSON.stringify(command),
        attempt_count: 0,
        intent_state: "IN_FLIGHT",
      },
    ]);
  await f.run();
  expect(f.deps.runP1).toHaveBeenCalledExactlyOnceWith({
    accountId: f.accountId,
    tripId: f.tripId,
    operationId,
  });
  expect(f.deps.isManualItem).not.toHaveBeenCalled();
});

it.each(["P3", "P4"] as const)(
  "cloud-only own %s finite edit commands use the original normal queue",
  async (family) => {
    for (const commandType of [
      "SET_ITEM_TEXT",
      family === "P3" ? "SET_STAY_DETAILS" : "SET_RENTAL_DETAILS",
    ]) {
      const f = fixture(),
        operationId = randomUUID(),
        itemId = randomUUID();
      const payload =
        commandType === "SET_ITEM_TEXT"
          ? { title: "Own accepted edit", description: null }
          : family === "P3"
            ? { details: { property_name: "Own lodge" }, rooms: [] }
            : { details: { supplier: "Own rental" }, places: {} };
      const command = {
        contractVersion: 2,
        intentVersion: 2,
        operationId,
        tripId: f.tripId,
        command: commandType,
        target: { kind: "ITEM", id: itemId },
        baseVector: [{ kind: "ITEM", id: itemId, revision: 1 }],
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
        payload,
      };
      f.deps.database.getAllAsync
        .mockReset()
        .mockResolvedValueOnce([])
        .mockResolvedValue([
          {
            ...f.create,
            id: operationId,
            entity_id: itemId,
            idempotency_key: operationId,
            entity_type: "TRIP_CORE_V2",
            operation_type: "CORE_V2_COMMAND",
            payload_json: JSON.stringify(command),
            attempt_count: 0,
            intent_state: "PENDING",
          },
        ]);
      f.deps.isManualItem.mockImplementation(
        async (_trip, _item, requested) => requested === family,
      );
      f.deps.participantsReady.mockResolvedValue(true);
      await createNormalTripSyncWake(f.deps, {
        accountId: f.accountId,
        newTripsFrom: "2026-10-24T00:00:00Z",
        manualOnly: true,
      })("AUTHENTICATED_ONLINE");
      expect(f.deps.runP1).toHaveBeenCalledExactlyOnceWith({
        accountId: f.accountId,
        tripId: f.tripId,
        operationId,
      });
      expect(f.deps.runCreate).not.toHaveBeenCalled();
    }
  },
);

function instructionQueueRow(f: ReturnType<typeof fixture>) {
  const itemId = randomUUID(),
    entryId = randomUUID(),
    operationId = randomUUID();
  const command = {
    contractVersion: 2,
    intentVersion: 2,
    operationId,
    tripId: f.tripId,
    command: "APPEND_INSTRUCTION",
    target: { kind: "INSTRUCTION", id: entryId },
    baseVector: [
      { kind: "INSTRUCTION", id: entryId, revision: null },
      { kind: "ITEM", id: itemId, revision: 1 },
    ],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      itemId,
      section: "ARRIVAL",
      body: "Reception bell",
      sensitivity: "NORMAL",
      sourceRepresentationId: null,
      acl: { visibility: "GROUP", people: [] },
    },
  };
  return {
    itemId,
    entryId,
    command,
    row: {
      id: operationId,
      trip_id: f.tripId,
      entity_id: entryId,
      idempotency_key: operationId,
      entity_type: "TRIP_CORE_V2",
      operation_type: "CORE_V2_COMMAND",
      payload_json: JSON.stringify(command),
    },
  };
}
it("keeps typed Instruction rows closed by default for both normal Trip and cloud-only selectors", async () => {
  for (const localTrip of [true, false]) {
    const f = fixture(),
      i = instructionQueueRow(f);
    f.deps.database.getAllAsync
      .mockReset()
      .mockResolvedValueOnce(localTrip ? [f.create] : [])
      .mockResolvedValueOnce([i.row])
      .mockResolvedValue([]);
    f.deps.isManualItem.mockResolvedValue(true);
    f.deps.participantsReady.mockResolvedValue(true);
    await f.run();
    expect(f.deps.runP1).not.toHaveBeenCalled();
  }
});
it("uses the resolved parent for existing P3 checks and retains true entry/operation identity", async () => {
  for (const localTrip of [true, false]) {
    const f = fixture(),
      i = instructionQueueRow(f);
    const resolver = vi
      .fn()
      .mockResolvedValue({ parentItemId: i.itemId, family: "P3", section: "ARRIVAL" });
    f.deps.database.getAllAsync
      .mockReset()
      .mockResolvedValueOnce(localTrip ? [f.create] : [])
      .mockResolvedValueOnce([i.row])
      .mockResolvedValue([]);
    f.deps.isManualItem.mockImplementation(
      async (_trip, itemId, family) => itemId === i.itemId && family === "P3",
    );
    f.deps.participantsReady.mockResolvedValue(true);
    await createNormalTripSyncWake(
      {
        ...f.deps,
        instructionSubmissionEnabled: () => true,
        resolveInstructionParent: resolver,
      },
      {
        accountId: f.accountId,
        newTripsFrom: "2026-10-24T00:00:00.000Z",
      },
    )("AUTHENTICATED_ONLINE");
    expect(resolver).toHaveBeenCalledWith(f.tripId, i.command);
    expect(f.deps.isManualItem).toHaveBeenCalledWith(f.tripId, i.itemId, "P3");
    expect(f.deps.isManualItem).not.toHaveBeenCalledWith(f.tripId, i.entryId, "P3");
    expect(f.deps.runP1).toHaveBeenCalledExactlyOnceWith({
      accountId: f.accountId,
      tripId: f.tripId,
      operationId: i.row.id,
    });
  }
});
it("refuses unresolved Instruction scope and invalid queue identity without an ITEM fallback", async () => {
  for (const wrongIdentity of [false, true]) {
    const f = fixture(),
      i = instructionQueueRow(f);
    const resolver = vi.fn().mockResolvedValue(null);
    f.deps.database.getAllAsync
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { ...i.row, ...(wrongIdentity ? { entity_id: randomUUID() } : {}) },
      ])
      .mockResolvedValue([]);
    f.deps.isManualItem.mockResolvedValue(true);
    await createNormalTripSyncWake(
      {
        ...f.deps,
        instructionSubmissionEnabled: () => true,
        resolveInstructionParent: resolver,
      },
      { accountId: f.accountId, newTripsFrom: "2026-10-24T00:00:00.000Z" },
    )("AUTHENTICATED_ONLINE");
    expect(f.deps.runP1).not.toHaveBeenCalled();
    if (wrongIdentity) expect(resolver).not.toHaveBeenCalled();
  }
});
it("retained Instruction recovery reaches the exact worker without requiring a new parent scope", async () => {
  const f = fixture(),
    i = instructionQueueRow(f);
  const resolver = vi.fn().mockRejectedValue(new Error("parent unavailable"));
  f.deps.database.getAllAsync
    .mockReset()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ ...i.row, attempt_count: 1, intent_state: "IN_FLIGHT" }])
    .mockResolvedValue([]);
  await createNormalTripSyncWake(
    {
      ...f.deps,
      instructionSubmissionEnabled: () => true,
      resolveInstructionParent: resolver,
    },
    { accountId: f.accountId, newTripsFrom: "2026-10-24T00:00:00.000Z" },
  )("AUTHENTICATED_ONLINE");
  expect(resolver).not.toHaveBeenCalled();
  expect(f.deps.participantsReady).not.toHaveBeenCalled();
  expect(f.deps.runP1).toHaveBeenCalledExactlyOnceWith({
    accountId: f.accountId,
    tripId: f.tripId,
    operationId: i.row.id,
  });
});

it("PROCESSING with attempt_count zero is original receipt recovery, never an unsent authorization proof", async () => {
  const f = fixture(),
    i = instructionQueueRow(f);
  const resolver = vi.fn().mockRejectedValue(new Error("no current parent"));
  f.deps.database.getAllAsync
    .mockReset()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([
      {
        ...i.row,
        status: "PROCESSING",
        attempt_count: 0,
        intent_state: "PENDING",
        claim_owner: "existing-claim",
        last_attempt_at: "2026-11-05T00:00:00Z",
      },
    ])
    .mockResolvedValue([]);
  await createNormalTripSyncWake(
    {
      ...f.deps,
      instructionSubmissionEnabled: () => true,
      resolveInstructionParent: resolver,
    },
    { accountId: f.accountId, newTripsFrom: "2026-10-24T00:00:00.000Z" },
  )("AUTHENTICATED_ONLINE");
  expect(resolver).not.toHaveBeenCalled();
  expect(f.deps.runP1).toHaveBeenCalledExactlyOnceWith({
    accountId: f.accountId,
    tripId: f.tripId,
    operationId: i.row.id,
  });
});

it.each(["P3", "P6", "P1", "GROUP", "NOT_READY"])(
  "selects only the retained, ready private SELF P3/P6 cloud-only create (%s)",
  async (variant) => {
    const f = fixture();
    const operationId = randomUUID();
    const itemId = randomUUID();
    const defaults = coreDefaults("member");
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
        family: variant === "P6" || variant === "P1" ? variant : "P3",
        core: { title: "Retained review" },
        schedule: { start: coreDateBoundary("2026-11-02"), end: coreDateBoundary("2026-11-03") },
        participation: { ...defaults.participation, selfPersonId: randomUUID() },
        acl: { ...defaults.acl, visibility: variant === "GROUP" ? "GROUP" : "PRIVATE" },
      },
    };
    f.deps.database.getAllAsync.mockReset().mockResolvedValueOnce([]).mockResolvedValue([{
      ...f.create,
      id: operationId,
      idempotency_key: operationId,
      entity_id: itemId,
      entity_type: "TRIP_CORE_V2",
      operation_type: "CORE_V2_COMMAND",
      payload_json: JSON.stringify(command),
      attempt_count: 0,
      intent_state: "PENDING",
    }]);
    f.deps.participantsReady.mockResolvedValue(variant !== "NOT_READY");
    await f.run();
    if (variant === "P3" || variant === "P6") {
      expect(f.deps.runP1).toHaveBeenCalledExactlyOnceWith({
        accountId: f.accountId, tripId: f.tripId, operationId,
      });
    } else {
      expect(f.deps.runP1).not.toHaveBeenCalled();
    }
    expect(f.deps.runCreate).not.toHaveBeenCalled();
    expect(f.deps.isManualItem).not.toHaveBeenCalled();
  },
);
