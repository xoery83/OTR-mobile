import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import { coreDefaults, corePlaceSchema } from "@/domain/trip/tripCoreV2";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
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
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowid } as never;
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
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
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
        (family === "P5" &&
          ["SET_ITEM_TEXT", "SET_TRANSPORT_DETAILS"].includes(name)) ||
        (family === "P4" &&
          ["SET_ITEM_TEXT", "SET_ITEM_SCHEDULE"].includes(name));
      expect(await getNormalTripQueueActivity(db, f.scope, f.now)).toEqual({
        actionableNow: 0,
        nextActionableAt: allowed ? f.now + 15000 : null,
      });
      expect(
        (await getNormalTripQueueActivity(db, f.scope, f.now + 15001))
          .actionableNow,
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
  expect(
    (await getNormalTripQueueActivity(f.db, f.scope, f.now)).actionableNow,
  ).toBe(1);
});
