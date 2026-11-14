import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import { coreDefaults, corePlaceSchema } from "@/domain/trip/tripCoreV2";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { normalTripReadbackTrigger } from "./tripNormalSync";
import { getNormalTripQueueActivity } from "./tripNormalQueueActivity";
import { createTripNormalReadbackRepository } from "../repositories/tripNormalReadbackRepository";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { advanceAccountGeneration } from "../auth/accountGeneration";
const opened: DatabaseSync[] = [];
afterEach(() => opened.splice(0).forEach((db) => db.close()));
function fixture() {
  const sql = new DatabaseSync(":memory:");
  opened.push(sql);
  for (const m of migrations) sql.exec(m.sql);
  const db = serializeDatabaseTransactions({
    async getFirstAsync<T>(q: string, ...a: unknown[]) {
      return (sql.prepare(q).get(...(a as never[])) ?? null) as T;
    },
    async getAllAsync<T>(q: string, ...a: unknown[]) {
      return sql.prepare(q).all(...(a as never[])) as T[];
    },
    async runAsync(q: string, ...a: unknown[]) {
      const r = sql.prepare(q).run(...(a as never[]));
      return {
        changes: r.changes,
        lastInsertRowId: r.lastInsertRowid,
      } as never;
    },
    async withTransactionAsync(work: () => Promise<void>) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  });
  const accountId = randomUUID(),
    tripId = randomUUID(),
    createId = randomUUID(),
    now = Date.parse("2026-10-24T02:00:00.000Z");
  const scope = { accountId, newTripsFrom: "2026-10-24T00:00:00.000Z" };
  sql
    .prepare(
      "INSERT INTO local_trip_containers(id,account_id,name,created_at,updated_at,create_operation_id) VALUES(?,?,'New',?,?,?)",
    )
    .run(
      tripId,
      accountId,
      new Date(now).toISOString(),
      new Date(now).toISOString(),
      createId,
    );
  function operation(
    id: string,
    type: string,
    entity: string,
    payload: unknown,
    status = "DEPENDENCY_BLOCKED",
    entityId = tripId,
  ) {
    sql
      .prepare(
        "INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,owner_user_id,status,attempt_count,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,0,?,?)",
      )
      .run(
        id,
        tripId,
        entity,
        entityId,
        type,
        id,
        JSON.stringify(payload),
        accountId,
        status,
        new Date(now).toISOString(),
        new Date(now).toISOString(),
      );
  }
  operation(createId, "CREATE_TRIP", "TRIP", {
    formatVersion: 2,
    tripId,
    name: "New",
    destination: null,
    startDate: null,
    endDate: null,
    destinations: [],
  });
  return { sql, db, scope, tripId, createId, now, operation };
}

it("counts only owning V2 new Trip and honours retry backoff/claim lease", async () => {
  const f = fixture();
  expect(await getNormalTripQueueActivity(f.db, f.scope, f.now)).toEqual({
    actionableNow: 1,
    nextActionableAt: null,
  });
  f.sql
    .prepare("UPDATE sync_operations SET status='RETRYABLE',next_attempt_at=? WHERE id=?")
    .run(new Date(f.now + 15000).toISOString(), f.createId);
  expect(await getNormalTripQueueActivity(f.db, f.scope, f.now)).toEqual({
    actionableNow: 0,
    nextActionableAt: f.now + 15000,
  });
  f.sql
    .prepare(
      "UPDATE sync_operations SET status='PROCESSING',lease_expires_at=? WHERE id=?",
    )
    .run(new Date(f.now + 30000).toISOString(), f.createId);
  expect(await getNormalTripQueueActivity(f.db, f.scope, f.now)).toEqual({
    actionableNow: 0,
    nextActionableAt: f.now + 30000,
  });
});

it.each(["V1", "unknown", "old", "otherAccount"])(
  "does not wake %s retained history",
  async (kind) => {
    const f = fixture();
    if (kind === "V1")
      f.sql
        .prepare(
          "UPDATE sync_operations SET payload_json=json_remove(payload_json,'$.formatVersion','$.destinations')",
        )
        .run();
    if (kind === "unknown") f.sql.exec("UPDATE sync_operations SET payload_json='{}'");
    if (kind === "old")
      f.sql.exec(
        "UPDATE local_trip_containers SET created_at='2025-01-01T00:00:00.000Z'",
      );
    if (kind === "otherAccount") f.scope.accountId = randomUUID();
    expect(await getNormalTripQueueActivity(f.db, f.scope, f.now)).toEqual({
      actionableNow: 0,
      nextActionableAt: null,
    });
  },
);

it("explicit authored Person waits Create completion; legacy private Person never wakes", async () => {
  const f = fixture(),
    personId = randomUUID(),
    op = randomUUID();
  f.operation(
    op,
    "TRIP_PERSON_CLOUD_CREATE",
    "TRIP_PERSON",
    {
      version: 1,
      operationId: op,
      tripId: f.tripId,
      personId,
      tripCreateOperationId: f.createId,
      dataOwnership: "CLOUD_SHARED_AUTHORED",
      displayName: "Same name",
    },
    "DEPENDENCY_BLOCKED",
    personId,
  );
  expect((await getNormalTripQueueActivity(f.db, f.scope, f.now)).actionableNow).toBe(1);
  f.sql
    .prepare("UPDATE sync_operations SET status='COMPLETED' WHERE id=?")
    .run(f.createId);
  f.operation(randomUUID(), "TRIP_PERSON_CREATE", "TRIP_PERSON", {
    privateName: "Retain locally",
  });
  expect((await getNormalTripQueueActivity(f.db, f.scope, f.now)).actionableNow).toBe(1);
});

it("one local readback continuation retains finite backoff, retries and does not repeat a completed trigger", async () => {
  const f = fixture();
  let now = f.now;
  const scope = await captureAccountRequestContext(
    f.tripId,
    async () => f.scope.accountId,
  );
  const repo = createTripNormalReadbackRepository(
    f.db,
    async () => f.scope.accountId,
    () => now,
  );
  const work = vi
    .fn()
    .mockRejectedValueOnce(Error("offline"))
    .mockResolvedValue(undefined);
  await expect(repo.run(scope, f.createId, work, "accepted-1")).rejects.toThrow(
    "offline",
  );
  expect(await repo.run(scope, f.createId, work, "accepted-1")).toBe(false);
  expect(work).toHaveBeenCalledTimes(1);
  now += 15000;
  expect(await repo.run(scope, f.createId, work, "accepted-1")).toBe(true);
  expect(await repo.run(scope, f.createId, work, "accepted-1")).toBe(false);
  expect(await repo.run(scope, f.createId, work, "accepted-2")).toBe(true);
  expect(
    f.sql
      .prepare(
        "SELECT count(*) AS n FROM sync_operations WHERE entity_type='TRIP_READBACK'",
      )
      .get(),
  ).toMatchObject({ n: 1 });
});

it("cold request may refresh once; old Account generation cannot commit readback state", async () => {
  const f = fixture();
  const scope = await captureAccountRequestContext(
    f.tripId,
    async () => f.scope.accountId,
  );
  const repo = createTripNormalReadbackRepository(
    f.db,
    async () => f.scope.accountId,
    () => f.now,
  );
  await repo.run(scope, f.createId, async () => {}, "v1");
  expect(await repo.run(scope, f.createId, async () => {}, "v1", true)).toBe(true);
  await expect(
    repo.run(
      scope,
      f.createId,
      async () => {
        advanceAccountGeneration();
      },
      "v2",
    ),
  ).rejects.toThrow();
  expect(
    f.sql
      .prepare("SELECT status FROM sync_operations WHERE entity_type='TRIP_READBACK'")
      .get(),
  ).toMatchObject({ status: "PROCESSING" });
});

it("AUTH-paused operations never schedule a timer retry", async () => {
  const f = fixture();
  f.sql.exec(
    "UPDATE sync_operations SET status='RETRYABLE',failure_category='AUTH',next_attempt_at='2026-10-24T02:00:01.000Z'",
  );
  expect(await getNormalTripQueueActivity(f.db, f.scope, f.now)).toEqual({
    actionableNow: 0,
    nextActionableAt: null,
  });
});

it("a different trigger cannot steal a live read; one newer follow-up survives old completion", async () => {
  const f = fixture(),
    scope = await captureAccountRequestContext(f.tripId, async () => f.scope.accountId),
    repo = createTripNormalReadbackRepository(
      f.db,
      async () => f.scope.accountId,
      () => f.now,
    );
  let done!: () => void;
  const first = repo.run(
    scope,
    f.createId,
    () =>
      new Promise<void>((r) => {
        done = r;
      }),
    "v1",
  );
  await vi.waitFor(() => expect(done).toBeTypeOf("function"));
  const next = vi.fn().mockResolvedValue(undefined);
  expect(await repo.run(scope, f.createId, next, "v2")).toBe(false);
  expect(next).not.toHaveBeenCalled();
  done();
  expect(await first).toBe(true);
  expect(
    f.sql
      .prepare("SELECT status FROM sync_operations WHERE entity_type='TRIP_READBACK'")
      .get(),
  ).toMatchObject({ status: "RETRYABLE" });
  expect(await repo.run(scope, f.createId, next, "v2")).toBe(true);
  expect(next).toHaveBeenCalledTimes(1);
});

it("late old ACK cannot complete a newer claim after lease expiry", async () => {
  const f = fixture();
  let now = f.now;
  const scope = await captureAccountRequestContext(
      f.tripId,
      async () => f.scope.accountId,
    ),
    repo = createTripNormalReadbackRepository(
      f.db,
      async () => f.scope.accountId,
      () => now,
    );
  let done!: () => void;
  const first = repo.run(
    scope,
    f.createId,
    () =>
      new Promise<void>((r) => {
        done = r;
      }),
    "v1",
  );
  await vi.waitFor(() => expect(done).toBeTypeOf("function"));
  now += 30001;
  expect(await repo.run(scope, f.createId, async () => {}, "v2")).toBe(true);
  done();
  expect(await first).toBe(false);
  expect(
    f.sql
      .prepare(
        "SELECT status,json_extract(payload_json,'$.triggerVersion') AS version FROM sync_operations WHERE entity_type='TRIP_READBACK'",
      )
      .get(),
  ).toMatchObject({ status: "COMPLETED", version: "v2" });
});

it.each(["P3", "P4"])(
  "retains %s retry backoff and expired processing lease as normal queue work",
  async (family) => {
    const f = fixture(),
      operationId = randomUUID(),
      itemId = randomUUID();
    f.sql
      .prepare("UPDATE sync_operations SET status='COMPLETED' WHERE id=?")
      .run(f.createId);
    f.operation(
      operationId,
      "CORE_V2_COMMAND",
      "TRIP_CORE_V2",
      {
        contractVersion: 2,
        intentVersion: 2,
        operationId,
        tripId: f.tripId,
        command: "CREATE_ITEM",
        target: { kind: "ITEM", id: itemId },
        baseVector: [{ kind: "ITEM", id: itemId, revision: null }],
        admission: {
          mode: "MANUAL",
          sourceIntentId: null,
          policyVersion: null,
        },
        payload: {
          family,
          ...(family === "P4" ? { details: {}, places: {} } : {}),
          core: { title: "Retry Stay" },
          schedule: {
            start: coreDateBoundary("2026-11-02"),
            end: coreDateBoundary("2026-11-04"),
          },
          ...coreDefaults("organizer"),
        },
      },
      "RETRYABLE",
      itemId,
    );
    f.sql
      .prepare(
        "INSERT INTO ledger_members(id,journey_id,display_name,status,updated_at) VALUES(?,?,'QA member','linked',?)",
      )
      .run(randomUUID(), f.tripId, new Date(f.now).toISOString());
    f.sql
      .prepare(
        "INSERT INTO ledger_actor_context(journey_id,user_id,capabilities_json,updated_at) VALUES(?,?,'{}',?)",
      )
      .run(f.tripId, f.scope.accountId, new Date(f.now).toISOString());
    f.sql
      .prepare("UPDATE sync_operations SET next_attempt_at=? WHERE id=?")
      .run(new Date(f.now + 15000).toISOString(), operationId);
    expect(await getNormalTripQueueActivity(f.db, f.scope, f.now)).toEqual({
      actionableNow: 0,
      nextActionableAt: f.now + 15000,
    });
    f.sql
      .prepare(
        "UPDATE sync_operations SET status='PROCESSING',lease_expires_at=? WHERE id=?",
      )
      .run(new Date(f.now + 30000).toISOString(), operationId);
    expect(await getNormalTripQueueActivity(f.db, f.scope, f.now)).toEqual({
      actionableNow: 0,
      nextActionableAt: f.now + 30000,
    });
    expect(
      (await getNormalTripQueueActivity(f.db, f.scope, f.now + 30001)).actionableNow,
    ).toBe(1);
  },
);

it.each(["P5", "P4"])(
  "P5 queue activity uses exact family, retains backoff and rejects root schedule/place: %s",
  async (family) => {
    const f = fixture(),
      itemId = randomUUID();
    f.sql
      .prepare("UPDATE sync_operations SET status='COMPLETED' WHERE id=?")
      .run(f.createId);
    const db = {
      ...f.db,
      getFirstAsync: async <T>(query: string, ...args: unknown[]) =>
        query.startsWith("SELECT experience_family")
          ? ({ experience_family: family } as T)
          : f.db.getFirstAsync<T>(query, ...args),
    };
    for (const name of [
      "SET_ITEM_TEXT",
      "SET_TRANSPORT_DETAILS",
      "SET_ITEM_SCHEDULE",
      "SET_ITEM_PLACE",
    ]) {
      const operationId = randomUUID();
      const payload =
        name === "SET_ITEM_TEXT"
          ? { title: "Updated" }
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
      f.operation(
        operationId,
        "CORE_V2_COMMAND",
        "TRIP_CORE_V2",
        {
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
        },
        "RETRYABLE",
        itemId,
      );
      f.sql
        .prepare("UPDATE sync_operations SET next_attempt_at=? WHERE id=?")
        .run(new Date(f.now + 15000).toISOString(), operationId);
      const allowed =
        (family === "P5" && ["SET_ITEM_TEXT", "SET_TRANSPORT_DETAILS"].includes(name)) ||
        (family === "P4" && ["SET_ITEM_TEXT", "SET_ITEM_SCHEDULE"].includes(name));
      expect(await getNormalTripQueueActivity(db, f.scope, f.now)).toEqual({
        actionableNow: 0,
        nextActionableAt: allowed ? f.now + 15000 : null,
      });
      expect(
        (await getNormalTripQueueActivity(db, f.scope, f.now + 15001)).actionableNow,
      ).toBe(allowed ? 1 : 0);
      f.sql
        .prepare("UPDATE sync_operations SET status='COMPLETED' WHERE id=?")
        .run(operationId);
    }
  },
);

it("P5 Create wakes existing normal scheduler without borrowing Import admission", async () => {
  const f = fixture(),
    operationId = randomUUID(),
    itemId = randomUUID();
  f.sql
    .prepare("UPDATE sync_operations SET status='COMPLETED' WHERE id=?")
    .run(f.createId);
  f.sql
    .prepare(
      "INSERT INTO ledger_members(id,journey_id,display_name,status,updated_at) VALUES(?,?,'QA member','linked',?)",
    )
    .run(randomUUID(), f.tripId, new Date(f.now).toISOString());
  f.sql
    .prepare(
      "INSERT INTO ledger_actor_context(journey_id,user_id,capabilities_json,updated_at) VALUES(?,?,'{}',?)",
    )
    .run(f.tripId, f.scope.accountId, new Date(f.now).toISOString());
  const place = Object.fromEntries(
    Object.keys(corePlaceSchema.shape).map((k) => [k, null]),
  );
  f.operation(
    operationId,
    "CORE_V2_COMMAND",
    "TRIP_CORE_V2",
    {
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
        ...coreDefaults("organizer"),
      },
    },
    "PENDING",
    itemId,
  );
  expect((await getNormalTripQueueActivity(f.db, f.scope, f.now)).actionableNow).toBe(1);
});

it.each(["P6", "P4", "P5"])(
  "P6 Activity details queue retains exact family and retry due time: %s",
  async (family) => {
    const f = fixture(),
      itemId = randomUUID();
    f.sql
      .prepare(
        "INSERT INTO ledger_members(id,journey_id,display_name,status,updated_at) VALUES(?,?,'QA member','linked',?)",
      )
      .run(randomUUID(), f.tripId, new Date(f.now).toISOString());
    f.sql
      .prepare(
        "INSERT INTO ledger_actor_context(journey_id,user_id,capabilities_json,updated_at) VALUES(?,?,'{}',?)",
      )
      .run(f.tripId, f.scope.accountId, new Date(f.now).toISOString());
    f.sql
      .prepare("UPDATE sync_operations SET status='COMPLETED' WHERE id=?")
      .run(f.createId);
    const db = {
      ...f.db,
      getFirstAsync: async <T>(query: string, ...args: unknown[]) =>
        query.startsWith("SELECT experience_family")
          ? ({ experience_family: family } as T)
          : f.db.getFirstAsync<T>(query, ...args),
    };
    for (const [name, payload] of Object.entries(p6DispatchPayloads)) {
      const operationId = randomUUID();
      f.operation(
        operationId,
        "CORE_V2_COMMAND",
        "TRIP_CORE_V2",
        {
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
        },
        "RETRYABLE",
        itemId,
      );
      f.sql
        .prepare("UPDATE sync_operations SET next_attempt_at=? WHERE id=?")
        .run(new Date(f.now + 15000).toISOString(), operationId);
      const allowed =
        family === "P6"
          ? p6DispatchCommands.includes(name)
          : family === "P4"
            ? [
                "SET_ITEM_TEXT",
                "SET_ITEM_SCHEDULE",
                "SET_ITEM_PARTICIPATION",
                "SET_RENTAL_DETAILS",
              ].includes(name)
            : [
                "SET_ITEM_TEXT",
                "SET_ITEM_PARTICIPATION",
                "SET_TRANSPORT_DETAILS",
              ].includes(name);
      expect(await getNormalTripQueueActivity(db, f.scope, f.now)).toEqual({
        actionableNow: 0,
        nextActionableAt: allowed ? f.now + 15000 : null,
      });
      expect(
        (await getNormalTripQueueActivity(db, f.scope, f.now + 15001)).actionableNow,
      ).toBe(allowed ? 1 : 0);
      f.sql
        .prepare("UPDATE sync_operations SET status='COMPLETED' WHERE id=?")
        .run(operationId);
    }
  },
);

it("minimum P6 Create wakes the existing scheduler with qualified participants", async () => {
  const f = fixture(),
    operationId = randomUUID(),
    itemId = randomUUID();
  f.sql
    .prepare("UPDATE sync_operations SET status='COMPLETED' WHERE id=?")
    .run(f.createId);
  f.sql
    .prepare(
      "INSERT INTO ledger_members(id,journey_id,display_name,status,updated_at) VALUES(?,?,'QA member','linked',?)",
    )
    .run(randomUUID(), f.tripId, new Date(f.now).toISOString());
  f.sql
    .prepare(
      "INSERT INTO ledger_actor_context(journey_id,user_id,capabilities_json,updated_at) VALUES(?,?,'{}',?)",
    )
    .run(f.tripId, f.scope.accountId, new Date(f.now).toISOString());
  f.operation(
    operationId,
    "CORE_V2_COMMAND",
    "TRIP_CORE_V2",
    {
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
    },
    "PENDING",
    itemId,
  );
  expect((await getNormalTripQueueActivity(f.db, f.scope, f.now)).actionableNow).toBe(1);
});

it.each(["P2", "P5"])(
  "normal authored-flight queue activity requires P2 target and keeps original due time (%s)",
  async (family) => {
    const f = fixture(),
      operationId = randomUUID(),
      itemId = randomUUID();
    f.sql
      .prepare("UPDATE sync_operations SET status='COMPLETED' WHERE id=?")
      .run(f.createId);
    const db = {
      ...f.db,
      getFirstAsync: async <T>(query: string, ...args: unknown[]) =>
        query.startsWith("SELECT experience_family")
          ? ({ experience_family: family } as T)
          : f.db.getFirstAsync<T>(query, ...args),
    };
    f.operation(
      operationId,
      "CORE_V2_COMMAND",
      "TRIP_CORE_V2",
      {
        contractVersion: 2,
        intentVersion: 2,
        operationId,
        tripId: f.tripId,
        command: "SET_AUTHORED_FLIGHT_DETAILS",
        target: { kind: "ITEM", id: itemId },
        baseVector: [{ kind: "ITEM", id: itemId, revision: 1 }],
        admission: {
          mode: "MANUAL",
          sourceIntentId: null,
          policyVersion: null,
        },
        payload: {
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
        },
      },
      "RETRYABLE",
      itemId,
    );
    f.sql
      .prepare("UPDATE sync_operations SET next_attempt_at=? WHERE id=?")
      .run(new Date(f.now + 15000).toISOString(), operationId);
    expect(await getNormalTripQueueActivity(db, f.scope, f.now)).toEqual({
      actionableNow: 0,
      nextActionableAt: family === "P2" ? f.now + 15000 : null,
    });
    expect(
      (await getNormalTripQueueActivity(db, f.scope, f.now + 15001)).actionableNow,
    ).toBe(family === "P2" ? 1 : 0);
  },
);

it.each(["metadata", "person"])(
  "schedules original server-parent %s with existing retry/lease/account rules",
  async (kind) => {
    const f = fixture();
    f.sql
      .prepare("DELETE FROM local_trip_containers WHERE account_id=?")
      .run(f.scope.accountId);
    const id = randomUUID(),
      personId = randomUUID();
    const metadata = {
      name: "Adopted",
      destination: null,
      startDate: null,
      endDate: null,
      destinations: [],
    };
    const payload =
      kind === "metadata"
        ? {
            formatVersion: 3,
            operationId: id,
            tripId: f.tripId,
            expectedMetadataRevision: 0,
            before: metadata,
            after: { ...metadata, name: "Edited" },
          }
        : {
            version: 1,
            operationId: id,
            tripId: f.tripId,
            personId,
            tripCreateOperationId: f.createId,
            displayName: "Synthetic Person",
            dataOwnership: "CLOUD_SHARED_AUTHORED",
          };
    f.operation(
      id,
      kind === "metadata" ? "UPDATE_TRIP_METADATA" : "TRIP_PERSON_CLOUD_CREATE",
      kind === "metadata" ? "TRIP" : "TRIP_PERSON",
      payload,
      "PENDING",
      kind === "metadata" ? f.tripId : personId,
    );
    expect((await getNormalTripQueueActivity(f.db, f.scope, f.now)).actionableNow).toBe(
      1,
    );
    const later = f.now + 20000;
    f.sql
      .prepare(
        "UPDATE sync_operations SET status='RETRYABLE',next_attempt_at=? WHERE id=?",
      )
      .run(new Date(later).toISOString(), id);
    expect(await getNormalTripQueueActivity(f.db, f.scope, f.now)).toEqual({
      actionableNow: 0,
      nextActionableAt: later,
    });
    f.sql
      .prepare(
        "UPDATE sync_operations SET status='PROCESSING',lease_expires_at=? WHERE id=?",
      )
      .run(new Date(later).toISOString(), id);
    expect(await getNormalTripQueueActivity(f.db, f.scope, f.now)).toEqual({
      actionableNow: 0,
      nextActionableAt: later,
    });
    for (const status of ["COMPLETED", "FAILED", "CONFLICT"]) {
      f.sql.prepare("UPDATE sync_operations SET status=? WHERE id=?").run(status, id);
      expect(await getNormalTripQueueActivity(f.db, f.scope, f.now)).toEqual({
        // A completed Metadata operation schedules only its missing readback, never another POST.
        actionableNow: kind === "metadata" && status === "COMPLETED" ? 1 : 0,
        nextActionableAt: null,
      });
    }
    f.sql
      .prepare(
        "UPDATE sync_operations SET status='PENDING',next_attempt_at=NULL,failure_category='AUTH' WHERE id=?",
      )
      .run(id);
    expect((await getNormalTripQueueActivity(f.db, f.scope, f.now)).actionableNow).toBe(
      0,
    );
    f.sql.prepare("UPDATE sync_operations SET failure_category=NULL WHERE id=?").run(id);
    expect(
      (
        await getNormalTripQueueActivity(
          f.db,
          { ...f.scope, accountId: randomUUID() },
          f.now,
        )
      ).actionableNow,
    ).toBe(0);
    f.sql
      .prepare("UPDATE sync_operations SET idempotency_key=? WHERE id=?")
      .run(randomUUID(), id);
    expect((await getNormalTripQueueActivity(f.db, f.scope, f.now)).actionableNow).toBe(
      0,
    );
  },
);

it("recovers the completed-Metadata cold gap and durable readback retry without waking completed history forever", async () => {
  const f = fixture();
  f.sql
    .prepare("DELETE FROM local_trip_containers WHERE account_id=?")
    .run(f.scope.accountId);
  const id = randomUUID();
  const before = {
    name: "Adopted",
    destination: null,
    startDate: null,
    endDate: null,
    destinations: [],
  };
  f.operation(
    id,
    "UPDATE_TRIP_METADATA",
    "TRIP",
    {
      formatVersion: 3,
      operationId: id,
      tripId: f.tripId,
      expectedMetadataRevision: 0,
      before,
      after: { ...before, name: "Edited" },
    },
    "COMPLETED",
  );
  expect((await getNormalTripQueueActivity(f.db, f.scope, f.now)).actionableNow).toBe(1);
  const scope = await captureAccountRequestContext(
    f.tripId,
    async () => f.scope.accountId,
  );
  const trigger = await normalTripReadbackTrigger(f.db, f.scope.accountId, f.tripId);
  const first = createTripNormalReadbackRepository(
    f.db,
    async () => f.scope.accountId,
    () => f.now,
  );
  await expect(
    first.run(
      scope,
      id,
      async () => {
        throw Error("simulated read loss");
      },
      trigger,
    ),
  ).rejects.toThrow();
  expect(await getNormalTripQueueActivity(f.db, f.scope, f.now)).toEqual({
    actionableNow: 0,
    nextActionableAt: f.now + 15000,
  });
  expect(
    (await getNormalTripQueueActivity(f.db, f.scope, f.now + 15000)).actionableNow,
  ).toBe(1);
  const cold = createTripNormalReadbackRepository(
    f.db,
    async () => f.scope.accountId,
    () => f.now + 15000,
  );
  const read = vi.fn(async () => {});
  await cold.run(scope, id, read, trigger);
  expect(read).toHaveBeenCalledOnce();
  expect(await getNormalTripQueueActivity(f.db, f.scope, f.now + 15001)).toEqual({
    actionableNow: 0,
    nextActionableAt: null,
  });
  expect(
    f.sql.prepare("SELECT status FROM sync_operations WHERE id=?").get(id)!.status,
  ).toBe("COMPLETED");
});

it.each(
  (["P1", "P2", "P3", "P4", "P5", "P6"] as const).flatMap((family) =>
    (["MANUAL", "IMPORT"] as const).map((admissionMode) => ({ family, admissionMode })),
  ),
)(
  "automatic activity schedules valid $family $admissionMode NEW and its original Document LINK on local and cloud Trips",
  async ({ family, admissionMode }) => {
    const { createTripCoreV2Repository } =
      await import("../repositories/tripCoreV2Repository");
    const { planUniversalV3Review } = await import("../operations/universalV3Review");
    const { coreClosedCapabilities } =
      await import("../../domain/trip/tripCoreV2Commands");
    const { createNormalTripSyncWake } = await import("./tripNormalSync");
    const { createHash } = await import("node:crypto");
    const { localImportDocumentId } =
      await import("../../domain/trip/universalImportIdentity");
    for (const cloud of [false, true]) {
      const f = fixture(),
        person = randomUUID(),
        sha = "a".repeat(64);
      f.sql
        .prepare("UPDATE sync_operations SET status='COMPLETED' WHERE id=?")
        .run(f.createId);
      if (cloud)
        f.sql.prepare("DELETE FROM local_trip_containers WHERE id=?").run(f.tripId);
      const repo = createTripCoreV2Repository(
        f.db,
        async () => f.scope.accountId,
        async (bytes) => createHash("sha256").update(bytes).digest("hex"),
      );
      const context = await repo.captureContext(f.tripId);
      const plan = planUniversalV3Review({
        model: {
          batch: {
            accountId: f.scope.accountId,
            context: { tripPrior: { id: f.tripId } },
          },
          inputs: [
            {
              kind: "DOCUMENT",
              originalFilename: "phase-a.pdf",
              declaredContentType: "application/pdf",
              contentSha256: sha,
              contentByteCount: 32,
              state: "ACCEPTED",
            },
          ],
        } as never,
        candidate: {
          candidateId: randomUUID(),
          kind: family,
          subtype: family === "P5" ? "TRAIN" : "ACTIVITY",
          documentIds: [localImportDocumentId(f.scope.accountId, f.tripId, sha)],
          fields: {
            title: "Phase A",
            "activity.date": "2026-12-14",
            "check_out.date": "2026-12-15",
            "origin.local_date": "2026-12-14",
            "destination.local_date": "2026-12-15",
            "origin.place_label": "Auckland",
            "destination.place_label": "Wellington",
            "operator.name": "Synthetic Rail",
            "service.number": "R1",
            service: "Rail R1",
          },
        },
        decision: { action: "NEW" },
        admissionMode,
        snapshot: {
          actor: {
            accountId: f.scope.accountId,
            tripId: f.tripId,
            personId: person,
            personIds: [person],
            active: true,
            canManageShared: false,
          },
          graph: {
            itinerary_events: [],
            trip_item_document_links: [],
            trip_operational_documents: [],
          },
        } as never,
        capabilities: {
          ...coreClosedCapabilities,
          activationState: "ENABLED",
          enabledFamilies: [family],
          enabledAdmissionModes: ["MANUAL", "IMPORT"],
          enabledCommands: [
            "CREATE_ITEM",
            "CREATE_SPARSE_FLIGHT",
            "CREATE_DOCUMENT_METADATA",
            "RECONCILE_ITEM_DOCUMENTS",
          ],
        },
      });
      await repo.enqueueConfirmedItemDocuments(context, plan.commands);
      const scope = { ...f.scope, manualOnly: true };
      const activity = await getNormalTripQueueActivity(f.db, scope, f.now);
      expect(activity.actionableNow).toBeGreaterThanOrEqual(plan.commands.length);
      const run = vi.fn();
      await createNormalTripSyncWake(
        {
          database: f.db,
          account: async () => f.scope.accountId,
          enabled: () => true,
          deferred: { materializeDeferredMetadata: async () => 0 },
          recoverP1Readback: async () => {},
          recoverTripReadback: async () => {},
          runCreate: async () => {},
          runMetadata: async () => {},
          runPerson: async () => {},
          runP1: run,
          isManualItem: async () => false,
          participantsReady: async () => true,
        },
        scope,
      )("AUTHENTICATED_ONLINE");
      expect(run.mock.calls.map(([target]) => target.operationId)).toEqual(
        plan.commands.map((c) => c.operationId),
      );
    }
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
