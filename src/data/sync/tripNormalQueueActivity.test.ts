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
