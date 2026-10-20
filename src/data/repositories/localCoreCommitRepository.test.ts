import { createCoreP6DayFeedReader } from "./tripCoreV2P6DayFeedRepository";
import { createTripDayFeedReader } from "./tripDayFeedRepository";
import { createTripJourneySnapshotReader } from "./tripJourneySnapshotRepository";
import { localHash, localIntentBody } from "../../domain/trip/localCoreAuthority";
import { buildCoreActorCollection } from "../../../backend/src/tripCoreV2Collection";
import { applyCoreCommand, emptyCoreGraph } from "../../domain/trip/tripCoreV2Mutation";
import { coreDateBoundary } from "../../domain/trip/tripCoreV2Temporal";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import { createTripRepository } from "./tripRepository";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { coreDefaults } from "../../domain/trip/tripCoreV2";
import {
  localTestHash,
  localTestStamp,
} from "../../domain/trip/__fixtures__/localCoreAuthority";
vi.mock("../files/tripPhotoFileStore", () => ({
  retainTripPhoto: vi.fn(),
  resolveRetainedTripPhoto: vi.fn(),
  probeRetainedTripPhotoIdentity: vi.fn(),
  discardRetainedTripPhoto: vi.fn(),
}));
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));
const connections: DatabaseSync[] = [],
  folders: string[] = [];
afterEach(() => {
  for (const db of connections.splice(0)) {
    try {
      db.close();
    } catch {}
  }
  for (const p of folders.splice(0)) rmSync(p, { recursive: true, force: true });
});
function fixture(path = ":memory:", initialize = true, accountId = randomUUID()) {
  const sql = new DatabaseSync(path);
  connections.push(sql);
  sql.exec("PRAGMA foreign_keys=ON");
  if (initialize) for (const m of migrations) sql.exec(m.sql);
  let active = accountId,
    queueFailure = false,
    aba = false;
  const db: CoreDatabase = serializeDatabaseTransactions({
    async isInTransactionAsync() {
      return sql.isTransaction;
    },
    async getFirstAsync<T>(q: string, ...args: unknown[]) {
      return (sql.prepare(q).get(...(args as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(q: string, ...args: unknown[]) {
      return sql.prepare(q).all(...(args as never[])) as T[];
    },
    async runAsync(q: string, ...args: unknown[]) {
      if (queueFailure && q.includes("INSERT INTO sync_operations")) {
        queueFailure = false;
        throw new Error("INJECTED_QUEUE_FAILURE");
      }
      const out = sql.prepare(q).run(...(args as never[]));
      if (aba && q.startsWith("INSERT INTO local_core_authority_commits")) {
        aba = false;
        advanceAccountGeneration();
        advanceAccountGeneration();
      }
      return out as never;
    },
    async withTransactionAsync(fn) {
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
  const identity = async () => active;
  const core = createTripCoreV2Repository(
    db,
    identity,
    localTestHash,
    () => localTestStamp,
  );
  const trips = createTripRepository(db, identity, core, () => localTestStamp);
  return {
    sql,
    db,
    core,
    trips,
    accountId,
    failQueue() {
      queueFailure = true;
    },
    aba() {
      aba = true;
    },
    switchAccount() {
      active = randomUUID();
      advanceAccountGeneration();
    },
  };
}
async function create(f: ReturnType<typeof fixture>, undated = false) {
  const tripId = randomUUID();
  await f.trips.createTrip({
    operationId: randomUUID(),
    tripId,
    name: "Japan journey",
    destination: "Tokyo",
    ...(!undated ? { startDate: "2026-12-14", endDate: "2026-12-22" } : {}),
  });
  return { tripId, context: await f.core.captureContext(tripId) };
}
async function prepared(
  f: ReturnType<typeof fixture>,
  context: Awaited<ReturnType<ReturnType<typeof fixture>["core"]["captureContext"]>>,
) {
  return f.core.prepareLocalManualSparse(context, {
    commitId: randomUUID(),
    slotId: randomUUID(),
    operationId: randomUUID(),
    itemId: randomUUID(),
    payload: {
      flightNumberLiteral: "NZ5069",
      departureDate: "2026-12-14",
      ...coreDefaults("member"),
    },
  });
}
describe("normal local Core commit is durable authority, never accepted mirror", () => {
  it("normal Trip creator→prepare→atomic commit→composed read; empty local creator stays no snapshot", async () => {
    const f = fixture();
    const { context } = await create(f);
    expect(await f.core.combinedSnapshot(context)).toBeNull();
    const env = await prepared(f, context);
    const result = await f.core.commitLocal(context, env);
    expect(result.receipts).toHaveLength(1);
    const snapshot = await f.core.combinedSnapshot(context);
    expect(snapshot?.certificate).toBeNull();
    expect(snapshot?.localRevision).toBe(1);
    expect(snapshot?.graph.trip_flight_intents[0].flight_number_literal).toBe("NZ5069");
    // The current mapped creator authority is inherited from the shared Manual reader.
    expect(snapshot?.actor.canManageShared).toBe(true);
    expect(
      f.sql.prepare("SELECT count(*) n FROM trip_core_itinerary_events").get(),
    ).toEqual({ n: 0 });
    expect(
      f.sql.prepare("SELECT count(*) n FROM trip_core_read_certificates").get(),
    ).toEqual({ n: 0 });
    expect(
      f.sql
        .prepare(
          "SELECT operation_type,status FROM sync_operations WHERE operation_type='LOCAL_CORE_COMMIT'",
        )
        .get(),
    ).toEqual({ operation_type: "LOCAL_CORE_COMMIT", status: "DEPENDENCY_BLOCKED" });
    expect(await f.core.commitLocal(context, env)).toEqual(result);
    await expect(
      f.core.commitLocal(context, { ...env, envelopeSha256: "f".repeat(64) }),
    ).rejects.toThrow("LOCAL_COMMIT_REUSE_MISMATCH");
  });
  it("normal all-family Day and Snapshot detail read local commit after cold reopen", async () => {
    const folder = mkdtempSync(join(tmpdir(), "otr-local-core-day-"));
    folders.push(folder);
    const path = join(folder, "day.sqlite");
    const f = fixture(path);
    const { tripId, context } = await create(f, true);
    const env = await prepared(f, context);
    const saved = await f.core.commitLocal(context, env);
    const itemId = saved.receipts[0].target.id;
    f.sql.close();
    const cold = fixture(path, false, f.accountId);
    const reader = createTripDayFeedReader({
      account: async () => cold.accountId,
      projection: async () => null,
      coreProjection: createCoreP6DayFeedReader(cold.core),
      candidates: async () => [],
      services: async () => ({}),
    });
    const read = await reader.trip(tripId);
    if (read.observed?.projection.version !== 2)
      throw Error("NORMAL_CORE_READER_REQUIRED");
    expect(read.observed?.projection.source.epoch).toBeNull();
    expect(read.observed?.projection.source).toMatchObject({
      authority: "LOCAL_COMMITTED",
      localRevision: 1,
    });
    if (read.observed?.projection.version !== 2)
      throw Error("NORMAL_CORE_READER_REQUIRED");
    expect(
      read.observed.projection.items.find((x) => x.itemId === itemId)?.localState,
    ).toBe("PENDING");
    const query = read.observed.projection.query("2026-12-14", "Pacific/Auckland");
    expect(query.coreRows.find((x) => x.itemRef === itemId)).toMatchObject({
      certificateGeneration: null,
      localReadGeneration: 1,
    });
    const floating = read.observed.projection.query("2026-12-14", {
      zone: null,
      viewMode: "FLOATING",
    });
    expect(floating.zone).toBeNull();
    expect(floating.viewMode).toBe("FLOATING");
    expect(floating.coreRows).toEqual(query.coreRows);
    expect(floating.nonComparable.map((row) => row.event.id)).toContain(itemId);
    expect((await cold.trips.getTrip(tripId))?.startDate).toBeNull();
    expect((await cold.trips.getTrip(tripId))?.endDate).toBeNull();
    const snapshots = createTripJourneySnapshotReader(
      cold.core,
      async (id) => {
        const trip = await cold.trips.getTrip(id);
        return trip
          ? {
              id: trip.id,
              name: trip.name,
              startDate: trip.startDate,
              endDate: trip.endDate,
            }
          : null;
      },
      async () => cold.accountId,
    );
    expect((await snapshots.read(tripId))?.epoch).toBeNull();
    expect((await snapshots.resolveItem(tripId, itemId, null))?.item.localState).toBe(
      "PENDING",
    );
    cold.switchAccount();
    await expect(snapshots.resolveItem(tripId, itemId, null)).rejects.toThrow(
      "Account changed",
    );
  });
  it("accepted nonoverlapping refresh composes with local truth without fake certificate", async () => {
    const f = fixture();
    const { context, tripId } = await create(f);
    const env = await prepared(f, context);
    await f.core.commitLocal(context, env);
    const person = String(
      (
        f.sql
          .prepare(
            "SELECT person_id FROM local_trip_ledger_bindings WHERE account_id=? AND trip_id=?",
          )
          .get(f.accountId, tripId) as { person_id: string }
      ).person_id,
    );
    const actor = {
      accountId: f.accountId,
      tripId,
      active: true,
      canManageShared: false,
      personId: person,
      personIds: [person],
    };
    const itemId = randomUUID();
    const graph = applyCoreCommand(
      emptyCoreGraph(),
      {
        contractVersion: 2,
        intentVersion: 2,
        operationId: randomUUID(),
        tripId,
        command: "CREATE_ITEM",
        target: { kind: "ITEM", id: itemId },
        baseVector: [{ kind: "ITEM", id: itemId, revision: null }],
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
        payload: {
          family: "P1",
          core: { title: "Museum" },
          schedule: { start: coreDateBoundary("2026-12-15") },
          ...coreDefaults("member"),
        },
      },
      actor,
      localTestStamp,
    ).graph;
    const c = await buildCoreActorCollection(
      graph,
      actor,
      {
        epoch: randomUUID(),
        revision: 1,
        accessRevision: 1,
        generatedAt: localTestStamp,
      },
      [
        {
          person_id: person,
          account_id: f.accountId,
          active: true,
          participating: true,
          revision: 1,
        },
      ],
      localTestHash,
    );
    await f.core.install(await f.core.beginRefresh(context, 1), c.manifest, c.pages);
    const current = await f.core.combinedSnapshot(context);
    expect(current?.graph.itinerary_events).toHaveLength(2);
    expect(current?.certificate?.manifest_sha256).toBe(c.manifest.manifestSha256);
    expect(Object.keys(current!.perTargetAuthority)).toHaveLength(1);
    expect((await f.core.acceptedSnapshot(context))?.graph.itinerary_events).toHaveLength(
      1,
    );
  });
  it("real file cold replay retains exact result, IDs, queue and no server certificate", async () => {
    const folder = mkdtempSync(join(tmpdir(), "otr-local-authority-core-"));
    folders.push(folder);
    const path = join(folder, "trip.sqlite");
    const f = fixture(path);
    const { tripId, context } = await create(f);
    const env = await prepared(f, context);
    const first = await f.core.commitLocal(context, env);
    const initial = await f.core.combinedSnapshot(context);
    f.sql.close();
    const reopened = fixture(path, false, f.accountId);
    const current = await reopened.core.captureContext(tripId);
    expect(await reopened.core.combinedSnapshot(current)).toEqual(initial);
    expect(await reopened.core.commitLocal(current, env)).toEqual(first);
  });
  it("queue failure and account ABA roll back header/slots/queue atomically, retry exact works", async () => {
    for (const kind of ["queue", "aba"]) {
      const f = fixture();
      const { tripId, context } = await create(f);
      const env = await prepared(f, context);
      if (kind === "queue") f.failQueue();
      else f.aba();
      await expect(f.core.commitLocal(context, env)).rejects.toThrow();
      expect(
        f.sql.prepare("SELECT count(*) n FROM local_core_authority_commits").get(),
      ).toEqual({ n: 0 });
      expect(
        f.sql.prepare("SELECT count(*) n FROM local_core_authority_slots").get(),
      ).toEqual({ n: 0 });
      expect(
        f.sql
          .prepare(
            "SELECT count(*) n FROM sync_operations WHERE operation_type='LOCAL_CORE_COMMIT'",
          )
          .get(),
      ).toEqual({ n: 0 });
      expect(
        (await f.core.commitLocal(await f.core.captureContext(tripId), env)).receipts,
      ).toHaveLength(1);
    }
  });
  it("wrong current account, missing creator binding and revocation never confer local authority", async () => {
    const f = fixture();
    const { context, tripId } = await create(f);
    const env = await prepared(f, context);
    f.switchAccount();
    await expect(f.core.commitLocal(context, env)).rejects.toThrow();
    expect(await f.core.combinedSnapshot(await f.core.captureContext(tripId))).toBeNull();
    const g = fixture();
    const own = await create(g);
    g.sql
      .prepare("DELETE FROM local_trip_ledger_bindings WHERE account_id=? AND trip_id=?")
      .run(g.accountId, own.tripId);
    await expect(prepared(g, own.context)).rejects.toThrow("LOCAL_AUTHORITY_UNAVAILABLE");
    const h = fixture();
    const saved = await create(h);
    await h.core.revoke(saved.context, 1);
    await expect(prepared(h, saved.context)).rejects.toThrow();
  });
  it("public commit cannot bypass intra-envelope collision via two new target IDs", async () => {
    const f = fixture();
    const { context } = await create(f);
    const env = await prepared(f, context);
    if (env.authority !== "LOCAL_MANUAL") throw Error();
    const next = structuredClone(env.outputs[0]);
    next.slotId = randomUUID();
    next.operationId = randomUUID();
    next.target.id = randomUUID();
    next.baseVector = [{ kind: "ITEM", id: next.target.id, revision: null }];
    next.lineageAssessment.resolvedOutputIdentity = `new-${next.target.id}`;
    env.outputs.push(next);
    for (const x of env.outputs)
      x.intentSha256 = await localHash(
        "otr-local-manual-intent-v1",
        localIntentBody(env, x),
        localTestHash,
      );
    env.envelopeSha256 = await localHash(
      "otr-local-manual-envelope-v1",
      Object.fromEntries(Object.entries(env).filter(([k]) => k !== "envelopeSha256")),
      localTestHash,
    );
    await expect(f.core.commitLocal(context, env)).rejects.toThrow(
      "LOCAL_CLAIM_COVERAGE_UNKNOWN",
    );
    expect(
      f.sql.prepare("SELECT count(*) n FROM local_core_authority_slots").get(),
    ).toEqual({ n: 0 });
  });
  it("cannot bypass incomplete competing claims by preparing a second flight", async () => {
    const f = fixture();
    const { context } = await create(f);
    await f.core.commitLocal(context, await prepared(f, context));
    await expect(prepared(f, context)).rejects.toThrow("LOCAL_CLAIM_COVERAGE_UNKNOWN");
  });
});

it("same-transaction Source preparation reads the genuine creator baseline without opening a nested transaction", async () => {
  const f = fixture(),
    { context } = await create(f);
  expect(await f.core.combinedSnapshot(context)).toBeNull();
  await expect(f.core.readLocalCombinedWithinTransaction(context)).rejects.toThrow(
    "TRANSACTION_CAPABILITY",
  );
  await f.db.withTransactionAsync(async () => {
    const snapshot = await f.core.readLocalCombinedWithinTransaction(context);
    expect(snapshot?.actor.accountId).toBe(f.accountId);
    expect(snapshot?.actor.active).toBe(true);
    expect(snapshot?.certificate).toBeNull();
    expect(snapshot?.localRevision).toBe(0);
    expect(f.sql.isTransaction).toBe(true);
  });
  expect(f.sql.isTransaction).toBe(false);
});
