import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("./tripPhotoRepository", () => ({
  announcePersonalTripCoverAfterCommit: vi.fn(),
  readSelectedTripCoverPhotoInScope: vi.fn(async () => null),
}));
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import type { StructuredTripMetadata } from "@/domain/trip/tripStructuredDestinationContract";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import {
  createTripDeferredMetadataRepository,
  type DeferredTripMetadata,
} from "./tripDeferredMetadataRepository";
import { createTripMetadataRepository } from "./tripMetadataRepository";
import { createSyncOperationRepository } from "../sync/syncOperationRepository";
import { retainTripMetadataConfirmation } from "./tripMetadataConfirmation";
const open: DatabaseSync[] = [];
afterEach(() => {
  for (const db of open.splice(0)) db.close();
});
const json = (v: unknown) => canonicalCoreJson(v as Json);
function fixture() {
  const sql = new DatabaseSync(":memory:");
  open.push(sql);
  for (const migration of migrations) sql.exec(migration.sql);
  let afterWrite: (() => void) | undefined;
  const db = serializeDatabaseTransactions({
    async getFirstAsync<T>(q: string, ...args: unknown[]) {
      return (sql.prepare(q).get(...(args as never[])) ?? null) as T;
    },
    async getAllAsync<T>(q: string, ...args: unknown[]) {
      return sql.prepare(q).all(...(args as never[])) as T[];
    },
    async runAsync(q: string, ...args: unknown[]) {
      const r = sql.prepare(q).run(...(args as never[]));
      afterWrite?.();
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowid } as never;
    },
    async withTransactionAsync(fn: () => Promise<void>) {
      sql.exec("BEGIN");
      try {
        await fn();
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
    now = "2026-10-24T00:00:00.000Z";
  let current = accountId;
  const before: StructuredTripMetadata = {
    name: "Original",
    destination: null,
    startDate: null,
    endDate: null,
    destinations: [],
  };
  const original = { ...before, formatVersion: 2, tripId };
  sql
    .prepare(
      "INSERT INTO local_trip_containers(id,account_id,name,destination,start_date,end_date,created_at,updated_at,create_operation_id) VALUES(?,?,?,NULL,NULL,NULL,?,?,?)",
    )
    .run(tripId, accountId, before.name, now, now, createId);
  sql
    .prepare(
      "INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,owner_user_id,status,created_at,updated_at) VALUES(?,?,'TRIP',?,'CREATE_TRIP',?,?,?,'DEPENDENCY_BLOCKED',?,?)",
    )
    .run(createId, tripId, tripId, createId, json(original), accountId, now, now);
  const repo = createTripDeferredMetadataRepository(
    db,
    async () => current,
    () => now,
  );
  const action = (name = "Offline edit", base = before): DeferredTripMetadata => ({
    localActionVersion: 1,
    actionId: randomUUID(),
    operationId: randomUUID(),
    tripId,
    before: base,
    after: { ...base, name },
  });
  async function confirm(metadata = before, rev = 0, parent: string = createId) {
    sql.prepare("UPDATE sync_operations SET status='COMPLETED' WHERE id=?").run(parent);
    await retainTripMetadataConfirmation(db, accountId, randomUUID(), "SNAPSHOT", {
      formatVersion: 3,
      actorAccountId: accountId,
      tripId,
      metadataRevision: rev,
      metadata,
    });
  }
  return {
    sql,
    db,
    repo,
    accountId,
    tripId,
    createId,
    before,
    original,
    action,
    confirm,
    afterWrite: (fn: () => void) => {
      afterWrite = fn;
    },
    switchAccount: () => {
      current = randomUUID();
      advanceAccountGeneration();
    },
  };
}
it("keeps authored changes durable, never creates transport wire before a legal confirmation", async () => {
  const f = fixture(),
    a = f.action();
  await f.repo.deferMetadataUpdate(a);
  expect(await f.repo.materializeDeferredMetadata(f.tripId)).toBe(0);
  expect(f.sql.prepare("SELECT name FROM local_trip_containers").get()?.name).toBe(
    a.after.name,
  );
  expect(
    f.sql.prepare("SELECT payload_json FROM sync_operations WHERE id=?").get(f.createId)
      ?.payload_json,
  ).toBe(json(f.original));
  expect(
    f.sql
      .prepare(
        "SELECT COUNT(*) AS n FROM sync_operations WHERE status IN ('PENDING','RETRYABLE')",
      )
      .get()?.n,
  ).toBe(0);
  expect(
    f.sql
      .prepare(
        "SELECT COUNT(*) AS n FROM sync_operations WHERE operation_type='UPDATE_TRIP_METADATA'",
      )
      .get()?.n,
  ).toBe(0);
  const fresh = createTripDeferredMetadataRepository(
    f.db,
    async () => f.accountId,
    () => "2026-10-24T00:00:01Z",
  );
  expect((await fresh.readDeferredMetadataEditBase(f.tripId)).metadata).toEqual(a.after);
});
it("materializes one exact immutable CAS request after receipt without losing newer local edits", async () => {
  const f = fixture(),
    a = f.action(),
    b = f.action("Newer offline", a.after);
  await f.repo.deferMetadataUpdate(a);
  await f.repo.deferMetadataUpdate(b);
  await f.confirm();
  expect(await f.repo.materializeDeferredMetadata(f.tripId)).toBe(1);
  expect(await f.repo.materializeDeferredMetadata(f.tripId)).toBe(0);
  const wire = JSON.parse(
    String(
      f.sql
        .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
        .get(a.operationId)?.payload_json,
    ),
  );
  expect(wire).toEqual({
    formatVersion: 3,
    operationId: a.operationId,
    tripId: f.tripId,
    expectedMetadataRevision: 0,
    before: a.before,
    after: a.after,
  });
  expect(f.sql.prepare("SELECT name FROM local_trip_containers").get()?.name).toBe(
    b.after.name,
  );
  await f.confirm(a.after, 1, a.operationId);
  expect(await f.repo.materializeDeferredMetadata(f.tripId)).toBe(1);
  expect(
    JSON.parse(
      String(
        f.sql
          .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
          .get(b.operationId)?.payload_json,
      ),
    ).expectedMetadataRevision,
  ).toBe(1);
});
it("replays the same local action once, rejects identity reuse and leaves conflict values intact", async () => {
  const f = fixture(),
    a = f.action();
  await Promise.all([f.repo.deferMetadataUpdate(a), f.repo.deferMetadataUpdate(a)]);
  await expect(
    f.repo.deferMetadataUpdate({ ...a, after: { ...a.after, name: "Changed request" } }),
  ).rejects.toThrow("REUSE_MISMATCH");
  await f.confirm({ ...f.before, name: "Remote change" });
  await expect(f.repo.materializeDeferredMetadata(f.tripId)).rejects.toThrow(
    "CONFIRMED_BASE_CONFLICT",
  );
  expect(f.sql.prepare("SELECT name FROM local_trip_containers").get()?.name).toBe(
    a.after.name,
  );
  expect(
    f.sql.prepare("SELECT status FROM sync_operations WHERE id=?").get(a.actionId)
      ?.status,
  ).toBe("DEPENDENCY_BLOCKED");
});
it("rejects other Account and unknown local action versions without writes", async () => {
  const f = fixture(),
    a = f.action();
  await expect(
    f.repo.deferMetadataUpdate({ ...a, localActionVersion: 9 } as never),
  ).rejects.toThrow();
  f.switchAccount();
  await expect(f.repo.deferMetadataUpdate(a)).rejects.toThrow("LOCAL_CREATOR_REQUIRED");
  expect(f.sql.prepare("SELECT COUNT(*) AS n FROM sync_operations").get()?.n).toBe(1);
});

it("keeps local deferred actions invisible to the generic dependency wake even after Create completes", async () => {
  const f = fixture(),
    a = f.action();
  await f.repo.deferMetadataUpdate(a);
  await f.confirm();
  const pending = await createSyncOperationRepository(
    f.db,
    async () => f.accountId,
  ).listPending();
  expect(pending.some((op) => op.id === a.actionId)).toBe(false);
  expect(
    f.sql
      .prepare("SELECT dependency_operation_id FROM sync_operations WHERE id=?")
      .get(a.actionId)?.dependency_operation_id,
  ).toBeNull();
  expect(
    f.sql.prepare("SELECT status FROM sync_operations WHERE id=?").get(a.actionId)
      ?.status,
  ).toBe("DEPENDENCY_BLOCKED");
});
it("retains ordered MANUAL and Apple identity fields through deferred edits and exact promotion", async () => {
  const f = fixture(),
    a = f.action();
  a.after.destinations = [
    { destinationId: randomUUID(), source: "MANUAL", displayLabel: "Wellington" },
    {
      destinationId: randomUUID(),
      source: "APPLE_PLACE_ID",
      displayLabel: "Auckland",
      provider: "apple",
      providerPlaceId: "approved-fixture-place-id",
    },
  ];
  await f.repo.deferMetadataUpdate(a);
  const b = f.action("Further offline", a.after);
  b.after.destinations = [...a.after.destinations].reverse();
  await f.repo.deferMetadataUpdate(b);
  await f.confirm();
  await f.repo.materializeDeferredMetadata(f.tripId);
  expect((await f.repo.readDeferredMetadataEditBase(f.tripId)).metadata).toEqual(b.after);
  const wire = JSON.parse(
    String(
      f.sql
        .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
        .get(a.operationId)?.payload_json,
    ),
  );
  expect(wire.after.destinations).toEqual(a.after.destinations);
});

it("does not let an earlier materialized wire jump a newer deferred dependency", async () => {
  const f = fixture(),
    a = f.action(),
    b = f.action("Second", a.after);
  await f.repo.deferMetadataUpdate(a);
  await f.repo.deferMetadataUpdate(b);
  await f.confirm();
  await f.repo.materializeDeferredMetadata(f.tripId);
  const c = f.action("Third", b.after);
  await f.repo.deferMetadataUpdate(c);
  const retained = JSON.parse(
    String(
      f.sql.prepare("SELECT payload_json FROM sync_operations WHERE id=?").get(c.actionId)
        ?.payload_json,
    ),
  );
  expect(retained.dependencyOperationId).toBe(b.operationId);
});

it("rolls back local values/action atomically if the Account changes during persistence", async () => {
  const f = fixture(),
    a = f.action();
  let changed = false;
  f.afterWrite(() => {
    if (!changed) {
      changed = true;
      f.switchAccount();
    }
  });
  await expect(f.repo.deferMetadataUpdate(a)).rejects.toThrow();
  expect(f.sql.prepare("SELECT name FROM local_trip_containers").get()?.name).toBe(
    "Original",
  );
  expect(f.sql.prepare("SELECT COUNT(*) AS n FROM sync_operations").get()?.n).toBe(1);
});

it("retains dirty local edits when a newer server snapshot arrives, then withholds conflicting CAS", async () => {
  const f = fixture(),
    a = f.action();
  f.sql
    .prepare("UPDATE local_trip_containers SET accepted_at=?")
    .run("2026-10-24T00:00:00Z");
  await f.confirm();
  await f.repo.deferMetadataUpdate(a);
  const metadata = createTripMetadataRepository(
    f.db,
    async () => f.accountId,
    () => "2026-10-24T00:00:02Z",
  );
  await metadata.retainMetadataSnapshot(
    {
      formatVersion: 3,
      actorAccountId: f.accountId,
      tripId: f.tripId,
      metadataRevision: 1,
      metadata: { ...f.before, name: "Remote updated" },
    },
    randomUUID(),
  );
  expect(f.sql.prepare("SELECT name FROM local_trip_containers").get()?.name).toBe(
    a.after.name,
  );
  await expect(f.repo.materializeDeferredMetadata(f.tripId)).rejects.toThrow(
    "CONFIRMED_BASE_CONFLICT",
  );
});

it("retains a device-local cover atomically with deferred metadata and excludes it from wire", async () => {
  const f = fixture();
  const action = { ...f.action(), cover: { before: null, after: "alpine_lake" } };
  // Use an actual canonical built-in identifier, never an arbitrary image URL.
  const { tripCoverAssetIds } = await import("@/domain/trip/tripCoverAssets");
  action.cover.after = tripCoverAssetIds[0];
  await f.repo.deferMetadataUpdate(action);
  expect(
    f.sql
      .prepare("SELECT selected_cover_asset_id FROM local_trip_containers WHERE id=?")
      .get(f.tripId),
  ).toMatchObject({ selected_cover_asset_id: action.cover.after });
  await f.confirm();
  await f.repo.materializeDeferredMetadata(f.tripId);
  const wire = f.sql
    .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
    .get(action.operationId) as { payload_json: string };
  expect(JSON.parse(wire.payload_json)).not.toHaveProperty("cover");
  expect(wire.payload_json).not.toContain(action.cover.after);
});
it("cover CAS failure rolls back metadata, destinations and local action together", async () => {
  const f = fixture();
  const action = {
    ...f.action(),
    cover: {
      before: "different",
      after: (await import("@/domain/trip/tripCoverAssets")).tripCoverAssetIds[0],
    },
  };
  await expect(f.repo.deferMetadataUpdate(action)).rejects.toThrow(
    "TRIP_COVER_LOCAL_CONFLICT",
  );
  expect(
    f.sql.prepare("SELECT name FROM local_trip_containers WHERE id=?").get(f.tripId),
  ).toMatchObject({ name: f.before.name });
  expect(
    f.sql.prepare("SELECT id FROM sync_operations WHERE id=?").get(action.actionId),
  ).toBeUndefined();
});
