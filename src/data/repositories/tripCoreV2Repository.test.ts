import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it, expect } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import {
  beginAccountTransition,
  endAccountTransition,
} from "../auth/accountRequestContext";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreActor,
} from "../../domain/trip/tripCoreV2Mutation";
import { coreDefaults } from "../../domain/trip/tripCoreV2";
import { buildCoreActorCollection } from "../../../backend/src/tripCoreV2Collection";
const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const account = randomUUID(),
  trip = randomUUID(),
  item = randomUUID(),
  person = randomUUID(),
  stamp = "2026-10-12T00:00:00Z";
const actor: CoreActor = {
  accountId: account,
  tripId: trip,
  active: true,
  canManageShared: false,
  personId: person,
  personIds: [person],
};
const sparse = () => ({
  contractVersion: 2,
  intentVersion: 2,
  operationId: randomUUID(),
  tripId: trip,
  command: "CREATE_SPARSE_FLIGHT",
  target: { kind: "ITEM", id: item },
  baseVector: [{ kind: "ITEM", id: item, revision: null }],
  admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
  payload: {
    flightNumberLiteral: "NZ5069",
    departureDate: "2026-12-14",
    ...coreDefaults("member"),
  },
});
const connections: DatabaseSync[] = [],
  folders: string[] = [];
afterEach(() => {
  for (const db of connections.splice(0))
    try {
      db.close();
    } catch {}
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});
function fixture(path = ":memory:", initialize = true) {
  const sql = new DatabaseSync(path);
  connections.push(sql);
  sql.exec("PRAGMA foreign_keys=ON");
  if (initialize) for (const migration of migrations) sql.exec(migration.sql);
  let active: string = account;
  const database: CoreDatabase = serializeDatabaseTransactions({
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
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  });
  return {
    sql,
    database,
    repo: createTripCoreV2Repository(
      database,
      async () => active,
      hash,
      () => stamp,
    ),
    switchTo: (id: string) => {
      active = id;
    },
  };
}
async function collection() {
  const graph = applyCoreCommand(emptyCoreGraph(), sparse(), actor, stamp).graph;
  return buildCoreActorCollection(
    graph,
    actor,
    { epoch: randomUUID(), revision: 1, accessRevision: 1, generatedAt: stamp },
    [{ person_id: person, account_id: account, active: true, revision: 1 }],
    hash,
  );
}
describe("Core SQLite54 account partition and durable offline foundation", () => {
  it("upgrades SQLite53 without changing historical schema or existing data", () => {
    const sql = new DatabaseSync(":memory:");
    connections.push(sql);
    for (const m of migrations.filter((m) => m.id < 54)) sql.exec(m.sql);
    sql
      .prepare(
        "INSERT INTO sync_operations(id,entity_type,entity_id,operation_type,idempotency_key,payload_json,status,created_at,updated_at,owner_user_id) VALUES('historic','EXPENSE','e','EXPENSE_CREATE','historic','{}','PENDING',?,?,?)",
      )
      .run(stamp, stamp, account);
    const before = sql
      .prepare(
        "SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all();
    sql.exec(migrations.find((m) => m.id === 54)!.sql);
    expect(
      before.every(
        (row) =>
          sql
            .prepare("SELECT sql FROM sqlite_master WHERE name=?")
            .get(row.name as string)?.sql === row.sql,
      ),
    ).toBe(true);
    expect(
      sql.prepare("SELECT id FROM sync_operations WHERE id='historic'").get()?.id,
    ).toBe("historic");
  });
  it("rolls back an interrupted additive migration and retries cleanly", () => {
    const sql = new DatabaseSync(":memory:");
    connections.push(sql);
    for (const m of migrations.filter((m) => m.id < 54)) sql.exec(m.sql);
    sql.exec("BEGIN");
    expect(() =>
      sql.exec(migrations.find((m) => m.id === 54)!.sql + "SELECT no_such_column;"),
    ).toThrow();
    sql.exec("ROLLBACK");
    expect(
      sql
        .prepare("SELECT count(*) n FROM sqlite_master WHERE name LIKE 'trip_core_%'")
        .get()?.n,
    ).toBe(0);
    sql.exec(migrations.find((m) => m.id === 54)!.sql);
    expect(
      sql
        .prepare("SELECT name FROM sqlite_master WHERE name='trip_core_pending_intents'")
        .get()?.name,
    ).toBe("trip_core_pending_intents");
  });
  it("atomically saves sparse offline intent, stable UUID, queue identity and restart projection", async () => {
    const folder = mkdtempSync(join(tmpdir(), "otr-core54-"));
    folders.push(folder);
    const path = join(folder, "core.db");
    const f = fixture(path);
    const ctx = await f.repo.captureContext(trip),
      q = sparse();
    expect(await f.repo.enqueue(ctx, q)).toEqual({
      localStatus: "PENDING",
      itemId: item,
      operationId: q.operationId,
    });
    expect(await f.repo.enqueue(ctx, q)).toEqual({
      localStatus: "PENDING",
      itemId: item,
      operationId: q.operationId,
    });
    expect(
      f.sql
        .prepare(
          "SELECT count(*) n FROM sync_operations WHERE operation_type='CORE_V2_COMMAND'",
        )
        .get()?.n,
    ).toBe(1);
    expect(
      f.sql.prepare("SELECT status FROM sync_operations WHERE id=?").get(q.operationId)
        ?.status,
    ).toBe("DEPENDENCY_BLOCKED");
    f.sql.close();
    const restarted = fixture(path, false),
      next = await restarted.repo.captureContext(trip);
    expect((await restarted.repo.pending(next))[0].command.target.id).toBe(item);
    expect((await restarted.repo.day(next, actor, "2026-12-14"))[0].row.position).toBe(
      "TNS",
    );
    expect((await restarted.repo.day(next, actor, "2026-12-14"))[0].localState).toBe(
      "PENDING",
    );
    expect(
      (await restarted.repo.day(next, actor, "2026-12-14"))[0].row.certificateGeneration,
    ).toBe(0);
  });
  it("rejects operation reuse mismatch without changing the queue", async () => {
    const f = fixture(),
      ctx = await f.repo.captureContext(trip),
      q = sparse();
    await f.repo.enqueue(ctx, q);
    await expect(
      f.repo.enqueue(ctx, {
        ...q,
        payload: { ...q.payload, flightNumberLiteral: "NZ1" },
      }),
    ).rejects.toThrow("OPERATION_REUSE_MISMATCH");
    expect(f.sql.prepare("SELECT count(*) n FROM sync_operations").get()?.n).toBe(1);
  });
  it("installs complete hashed actor snapshot and projects accepted Day", async () => {
    const f = fixture(),
      ctx = await f.repo.captureContext(trip),
      refresh = await f.repo.beginRefresh(ctx, 1),
      bundle = await collection();
    await f.repo.install(refresh, bundle.manifest, bundle.pages);
    expect((await f.repo.readGraph(ctx)).itinerary_events[0].id).toBe(item);
    expect(
      (await f.repo.day(ctx, actor, "2026-12-14"))[0].row.certificateGeneration,
    ).toBe(1);
    expect((await f.repo.day(ctx, actor, "2026-12-14"))[0].localState).toBe("ACCEPTED");
    await expect(
      f.repo.day(ctx, { ...actor, personId: randomUUID() }, "2026-12-14"),
    ).rejects.toThrow("CORE_PERSON_BINDING_MISMATCH");
  });
  it("persists revocation even before a first collection or scope exists", async () => {
    const f = fixture(),
      ctx = await f.repo.captureContext(trip);
    await f.repo.revoke(ctx, 2);
    await expect(f.repo.enqueue(ctx, sparse())).rejects.toThrow("CORE_ACCESS_REVOKED");
    await expect(f.repo.beginRefresh(ctx, 1)).rejects.toThrow("CORE_ACCESS_REVOKED");
    expect(f.sql.prepare("SELECT count(*) n FROM sync_operations").get()?.n).toBe(0);
  });
  it("never treats missing or damaged pages as absence", async () => {
    const f = fixture(),
      ctx = await f.repo.captureContext(trip),
      refresh = await f.repo.beginRefresh(ctx, 1),
      bundle = await collection();
    await f.repo.install(refresh, bundle.manifest, bundle.pages);
    await expect(f.repo.install(refresh, bundle.manifest, [])).rejects.toThrow(
      "CORE_READ_INCOMPLETE",
    );
    const damaged = structuredClone(bundle.pages);
    damaged[0].records = [];
    await expect(f.repo.install(refresh, bundle.manifest, damaged)).rejects.toThrow();
    expect((await f.repo.readGraph(ctx)).itinerary_events).toHaveLength(1);
  });
  it("fences late A responses across A→B→A generation changes", async () => {
    const f = fixture(),
      ctx = await f.repo.captureContext(trip),
      refresh = await f.repo.beginRefresh(ctx, 1),
      bundle = await collection();
    let lease = await beginAccountTransition();
    f.switchTo(randomUUID());
    endAccountTransition(lease);
    const b = await f.repo.captureContext(trip);
    expect(await f.repo.pending(b)).toEqual([]);
    lease = await beginAccountTransition();
    f.switchTo(account);
    endAccountTransition(lease);
    await expect(f.repo.install(refresh, bundle.manifest, bundle.pages)).rejects.toThrow(
      "Account changed",
    );
    const fresh = await f.repo.captureContext(trip);
    expect(await f.repo.pending(fresh)).toEqual([]);
  });
  it("revocation withholds accepted cache and blocks old pending delivery", async () => {
    const f = fixture(),
      ctx = await f.repo.captureContext(trip),
      refresh = await f.repo.beginRefresh(ctx, 1),
      bundle = await collection();
    await f.repo.install(refresh, bundle.manifest, bundle.pages);
    await f.repo.enqueue(ctx, sparse());
    await f.repo.revoke(ctx, 2);
    await expect(f.repo.readGraph(ctx)).rejects.toThrow("CORE_ACCESS_REVOKED");
    await expect(f.repo.install(refresh, bundle.manifest, bundle.pages)).rejects.toThrow(
      "CORE_ACCESS_REVOKED",
    );
  });
});
