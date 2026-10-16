import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import { createTripDayFeedReader } from "./tripDayFeedRepository";
import { createTripTodaysJourneyReader } from "./tripTodaysJourneyRepository";
import { createTripRepository } from "./tripRepository";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreActor,
} from "@/domain/trip/tripCoreV2Mutation";
import { buildCoreActorCollection } from "../../../backend/src/tripCoreV2Collection";
import { projectCoreP6Feed } from "@/domain/trip/tripCoreV2P6DayFeed";
import { selectTodaysJourney } from "@/domain/trip/todaysJourney";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import { coreDefaults } from "@/domain/trip/tripCoreV2";
import { createTripLocalManualReader } from "./tripLocalManualReadRepository";
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));
const connections: DatabaseSync[] = [];
afterEach(() => connections.splice(0).forEach((sql) => sql.close()));
async function fixture() {
  const sql = new DatabaseSync(":memory:");
  connections.push(sql);
  for (const migration of migrations) sql.exec(migration.sql);
  let account = randomUUID(),
    aba = false,
    badHash = false;
  const database: CoreDatabase = serializeDatabaseTransactions({
    async getFirstAsync<T>(query: string, ...args: unknown[]) {
      const result = sql.prepare(query).get(...(args as never[])) ?? null;
      if (aba && query.includes("FROM local_trip_containers")) {
        aba = false;
        advanceAccountGeneration();
        advanceAccountGeneration();
      }
      return result as T | null;
    },
    async getAllAsync<T>(query: string, ...args: unknown[]) {
      return sql.prepare(query).all(...(args as never[])) as T[];
    },
    async runAsync(query: string, ...args: unknown[]) {
      return sql.prepare(query).run(...(args as never[])) as never;
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
  const identity = async () => account;
  const core = createTripCoreV2Repository(database, identity, async (b) =>
    badHash ? "0".repeat(64) : createHash("sha256").update(b).digest("hex"),
  );
  const trips = createTripRepository(database, identity, core);
  const tripId = randomUUID(),
    itemId = randomUUID(),
    operationId = randomUUID();
  await trips.createTrip({
    operationId: randomUUID(),
    tripId,
    name: "Local Trip",
    destination: null,
    startDate: "2026-10-16",
    endDate: "2026-10-18",
  });
  await trips.addItem(tripId, {
    operationId,
    itemId,
    family: "P3",
    title: "Manual hotel",
    startDate: "2026-10-16",
    endDate: "2026-10-18",
  });
  const manual = createTripLocalManualReader(database, identity, core);
  const days = createTripDayFeedReader({
    account: identity,
    projection: async () => null,
    localManual: manual,
    candidates: async () => [],
    services: async () => ({}),
  });
  const today = createTripTodaysJourneyReader(
    days,
    { resolveItem: vi.fn(async () => null) },
    identity,
  );
  return {
    today,
    core,
    account,
    sql,
    tripId,
    itemId,
    operationId,
    read: createTripLocalManualReader(database, identity, core),
    corruptHash() {
      badHash = true;
    },
    switchAccount() {
      account = randomUUID();
      advanceAccountGeneration();
    },
    aba() {
      aba = true;
    },
    trips,
  };
}
it("committed date-only hotel reads Day and Tonight with explicit clock; no certificate, network, or write", async () => {
  const f = await fixture();
  const before = f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all();
  const local = (await f.read(f.tripId))!;
  expect(local.source.kind).toBe("LOCAL_MANUAL_COMMITTED");
  expect(local.items[0]).toMatchObject({ itemId: f.itemId, localState: "PENDING" });
  expect(local.rows("2026-10-16")).toEqual([
    expect.objectContaining({
      itemRef: f.itemId,
      localState: "PENDING",
      certificateGeneration: 0,
    }),
  ]);
  expect(local.rows("2026-10-17")[0].itemRef).toBe(f.itemId);
  expect(local.today({ now: "2026-10-16T01:00:00Z", zone: null })).toBeNull();
  expect(local.today({ now: "2026-10-16T01:00:00Z", zone: "Invalid/Zone" })).toBeNull();
  expect(
    local.today({ now: "2026-10-16T01:00:00Z", zone: "Pacific/Auckland" })?.tonight
      ?.itemRef,
  ).toBe(f.itemId);
  expect(
    local.today({ now: "2026-10-19T01:00:00Z", zone: "Pacific/Auckland" }),
  ).toMatchObject({ primaryKind: "FREE", tonight: null });
  expect(f.sql.prepare("SELECT * FROM trip_core_read_certificates").all()).toEqual([]);
  expect(f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(
    before,
  );
});
it("reread refresh changes fingerprint after normal manual save", async () => {
  const f = await fixture();
  const first = (await f.read(f.tripId))!;
  await f.trips.addItem(f.tripId, {
    operationId: randomUUID(),
    itemId: randomUUID(),
    family: "P1",
    title: "Walk",
    startDate: "2026-10-16",
  });
  const second = (await f.read(f.tripId))!;
  expect(second.source.fingerprint).not.toBe(first.source.fingerprint);
  expect(second.rows("2026-10-16")).toHaveLength(2);
});
it.each(["CONFLICT", "REVIEW"])(
  "%s intent is not formal local Day authority",
  async (state) => {
    const f = await fixture();
    f.sql.prepare("UPDATE trip_core_pending_intents SET state=?").run(state);
    expect((await f.read(f.tripId))?.rows("2026-10-16")).toEqual([]);
  },
);
it("missing owning queue and changed bytes fail closed", async () => {
  for (const mutation of [
    "UPDATE sync_operations SET payload_json='{}' WHERE operation_type='CORE_V2_COMMAND'",
    "DELETE FROM sync_operations WHERE operation_type='CORE_V2_COMMAND'",
  ]) {
    const f = await fixture();
    f.sql.exec(mutation);
    await expect(f.read(f.tripId)).rejects.toThrow("LOCAL_MANUAL_COMMIT_PIN");
  }
});
it("different account and account ABA cannot publish local creator reads", async () => {
  const f = await fixture();
  f.aba();
  await expect(f.read(f.tripId)).rejects.toThrow();
  f.switchAccount();
  expect(await f.read(f.tripId)).toBeNull();
});

it("intent digest mismatch fails closed independently of immutable storage", async () => {
  const f = await fixture();
  f.corruptHash();
  await expect(f.read(f.tripId)).rejects.toThrow("LOCAL_MANUAL_COMMIT_PIN");
});
it("captured row/today closures reject account generation changes", async () => {
  const f = await fixture();
  const local = (await f.read(f.tripId))!;
  f.switchAccount();
  expect(() => local.rows("2026-10-16")).toThrow();
  expect(() =>
    local.today({ now: "2026-10-16T01:00:00Z", zone: "Pacific/Auckland" }),
  ).toThrow();
});

it("normal Day/Today consumer resolves local Item without accepted admission and rejects stale taps", async () => {
  const f = await fixture();
  const clock = { now: "2026-10-16T01:00:00Z", zone: "Pacific/Auckland" };
  expect(await f.today.read(f.tripId, clock)).toBeNull();
  expect(await f.today.readLocal(f.tripId, { ...clock, zone: null })).toBeNull();
  const read = (await f.today.readLocal(f.tripId, clock))!;
  expect(read.today.tonight?.itemRef).toBe(f.itemId);
  expect((await f.today.resolveLocalItem(f.tripId, f.itemId, read))?.item).toMatchObject({
    itemId: f.itemId,
    localState: "PENDING",
  });
  await f.trips.addItem(f.tripId, {
    operationId: randomUUID(),
    itemId: randomUUID(),
    family: "P1",
    title: "New walk",
    startDate: "2026-10-16",
  });
  expect(await f.today.resolveLocalItem(f.tripId, f.itemId, read)).toBeNull();
});

it("mixed certified hotel and newly committed activity retain distinct Today pending provenance", async () => {
  const f = await fixture();
  const ctx = await f.core.captureContext(f.tripId);
  const personId = f.sql
    .prepare("SELECT person_id FROM local_trip_ledger_bindings WHERE trip_id=?")
    .get(f.tripId)!.person_id as string;
  const actor: CoreActor = {
    accountId: f.account,
    tripId: f.tripId,
    active: true,
    canManageShared: true,
    personId,
    personIds: [personId],
  };
  const command = (await f.core.pending(ctx))[0].command;
  const graph = applyCoreCommand(
    emptyCoreGraph(),
    command,
    actor,
    "2026-10-16T00:00:00Z",
  ).graph;
  const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
  const bundle = await buildCoreActorCollection(
    graph,
    actor,
    {
      epoch: randomUUID(),
      revision: 1,
      accessRevision: 1,
      generatedAt: "2026-10-16T00:00:00Z",
    },
    [
      {
        person_id: personId,
        account_id: f.account,
        active: true,
        participating: true,
        revision: 1,
      },
    ],
    hash,
  );
  await f.core.install(await f.core.beginRefresh(ctx, 1), bundle.manifest, bundle.pages);
  const activityId = randomUUID();
  await f.trips.addItem(f.tripId, {
    operationId: randomUUID(),
    itemId: activityId,
    family: "P1",
    title: "New local walk",
    startDate: "2026-10-16",
  });
  const today = (await f.read(f.tripId))!.today({
    now: "2026-10-16T01:00:00Z",
    zone: "Pacific/Auckland",
  })!;
  expect(today.primary).toMatchObject({ itemRef: activityId, certificateGeneration: 0 });
  expect(today.tonight?.itemRef).toBe(f.itemId);
  expect(today.tonight!.certificateGeneration).toBeGreaterThan(0);
});
it("APPLIED without a verified owning receipt cannot become read authority", async () => {
  const f = await fixture();
  f.sql.exec(
    "UPDATE trip_core_pending_intents SET state='APPLIED'; UPDATE sync_operations SET status='COMPLETED' WHERE operation_type='CORE_V2_COMMAND'",
  );
  await expect(f.read(f.tripId)).rejects.toThrow("LOCAL_MANUAL_RECEIPT_PIN");
});

async function acceptTripBeforeFirstCertificate(f: Awaited<ReturnType<typeof fixture>>) {
  const operation = f.sql
    .prepare(
      "SELECT id,payload_json FROM sync_operations WHERE operation_type='CREATE_TRIP'",
    )
    .get()!;
  const request = {
    operationId: operation.id,
    ...JSON.parse(operation.payload_json as string),
  };
  const receipt = {
    ...request,
    actorAccountId: f.account,
    ownerPersonId: randomUUID(),
    coreEpoch: randomUUID(),
    coreRevision: 1,
    coreAccessRevision: 1,
  };
  await f.trips.acceptCreate(receipt);
  return receipt;
}
it("owning Trip acceptance and mapped creator retain pending Items before first Core certificate", async () => {
  const f = await fixture();
  const originalPerson = f.sql
    .prepare("SELECT person_id FROM local_trip_ledger_bindings")
    .get()!.person_id;
  const before = (await f.read(f.tripId))!.rows("2026-10-16");
  const accepted = await acceptTripBeforeFirstCertificate(f);
  expect(
    f.sql.prepare("SELECT person_id FROM local_trip_ledger_bindings").get()!.person_id,
  ).toBe(originalPerson);
  expect(
    f.sql.prepare("SELECT member_id FROM ledger_actor_context").get()!.member_id,
  ).toBe(accepted.ownerPersonId);
  expect(
    f.sql.prepare("SELECT COUNT(*) AS n FROM trip_core_read_certificates").get()!.n,
  ).toBe(0);
  const local = (await f.read(f.tripId))!;
  expect(local.source.kind).toBe("LOCAL_MANUAL_COMMITTED");
  expect(local.rows("2026-10-16")).toEqual(before);
  expect(local.items[0].participation.rosterHash).toBeUndefined();
  // Starting the first refresh does not constitute an installed certificate.
  await f.core.beginRefresh(await f.core.captureContext(f.tripId), 1);
  expect((await f.read(f.tripId))!.rows("2026-10-16")).toEqual(before);
});
it("mapped owner mismatch and known Core revocation cannot use creator fallback", async () => {
  const mismatched = await fixture();
  await acceptTripBeforeFirstCertificate(mismatched);
  mismatched.sql.prepare("UPDATE ledger_actor_context SET member_id=?").run(randomUUID());
  expect(await mismatched.read(mismatched.tripId)).toBeNull();
  const revoked = await fixture();
  await acceptTripBeforeFirstCertificate(revoked);
  await revoked.core.revoke(await revoked.core.captureContext(revoked.tripId), 2);
  await expect(revoked.read(revoked.tripId)).rejects.toThrow("CORE_ACCESS_REVOKED");
});

it("committed pending hotel and floating 09:00 survive a fresh local reader with no travel timezone", async () => {
  const f = await fixture();
  const activityId = randomUUID();
  const context = await f.core.captureContext(f.tripId);
  await f.core.enqueue(context, {
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: f.tripId,
    command: "CREATE_ITEM",
    target: { kind: "ITEM", id: activityId },
    baseVector: [{ kind: "ITEM", id: activityId, revision: null }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      family: "P1",
      core: { title: "Coffee" },
      schedule: {
        start: {
          ...coreDateBoundary("2026-10-16"),
          local_time: "09:00",
          clock_precision: -1,
          quality: "ESTIMATED",
        },
      },
      ...coreDefaults("organizer"),
    },
  });
  const clock = { now: "2026-10-15T10:00:00Z", zone: null, planningDate: "2026-10-16" };
  const before = f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all();
  const local = (await f.read(f.tripId))!;
  const today = (await f.today.readLocal(f.tripId, clock))!;
  expect(today.today).toMatchObject({
    date: clock.planningDate,
    zone: null,
    primaryKind: "PLANS",
  });
  expect(today.today.tonight).toMatchObject({
    itemRef: f.itemId,
    certificateGeneration: 0,
  });
  expect(
    local.rows(clock.planningDate).find((row) => row.itemRef === activityId)?.displayTime,
  ).toMatchObject({ localTime: "09:00:00", comparable: false });
  expect(today.today.primary?.displayTime?.localTime).toBe("09:00:00");
  expect(
    (await f.today.resolveLocalItem(f.tripId, f.itemId, today))?.item.localState,
  ).toBe("PENDING");
  expect((await f.read(f.tripId))!.today(clock)).toEqual(local.today(clock));
  expect(
    (await f.read(f.tripId))!.today({ ...clock, planningDate: "2026-10-19" }),
  ).toMatchObject({ primaryKind: "FREE", tonight: null });
  const personId = f.sql
    .prepare("SELECT person_id FROM local_trip_ledger_bindings WHERE trip_id=?")
    .get(f.tripId)!.person_id as string;
  const actor: CoreActor = {
    accountId: f.account,
    tripId: f.tripId,
    active: true,
    canManageShared: true,
    personId,
    personIds: [personId],
  };
  const snapshot = await f.core.manualReadSnapshot(context, actor);
  // Synthetic adapter input only: this does not install a certificate or admit an Item.
  const projection = projectCoreP6Feed(
    snapshot.graph,
    actor,
    {
      epoch: randomUUID(),
      revision: "1",
      accessRevision: 1,
      generation: 1,
      actorPersonBindingHash: "binding",
      participatingRosterHash: "roster",
      manifestSha256: "manifest",
    },
    [personId],
  );
  const query = vi.spyOn(projection, "query");
  const planned = selectTodaysJourney(projection, clock)!;
  expect(query).toHaveBeenCalledWith("2026-10-16", "UTC");
  expect(planned).toMatchObject({ date: "2026-10-16", zone: null, primaryKind: "PLANS" });
  expect(planned.primary?.displayTime).toMatchObject({
    localDate: "2026-10-16",
    localTime: "09:00:00",
    comparable: false,
  });
  expect(planned.tonight?.itemRef).toBe(f.itemId);
  expect(
    selectTodaysJourney(projection, { ...clock, planningDate: "2026-10-19" }),
  ).toMatchObject({ primary: null, tonight: null });
  expect(f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(
    before,
  );
});
