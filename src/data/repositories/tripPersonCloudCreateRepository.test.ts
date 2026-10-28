import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { createTripRepository } from "./tripRepository";
import { createTripCoreV2Repository } from "./tripCoreV2Repository";
import { createTripPersonRepository } from "./tripPersonRepository";
import { createTripPersonCloudCreateRepository } from "./tripPersonCloudCreateRepository";
import {
  createLocalTripPersonRepository,
  readLocalTripPersonRosterWithinTransaction,
} from "./localTripPersonRepository";
import { createPersonCloudSyncWorker } from "../sync/tripPersonCloudCreateSync";
import { createSyncOperationRepository } from "../sync/syncOperationRepository";
import { createSyncEngine } from "../sync/syncEngine";
import {
  personCloudCreateKind,
  type PersonCloudCreate,
  type PersonCloudCreateReceipt,
} from "@/domain/trip/tripPersonCloudCreate";
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async (_a: string, v: string) =>
    createHash("sha256").update(v).digest("hex"),
}));
const handles: DatabaseSync[] = [];
const folders: string[] = [];
afterEach(() => {
  handles.splice(0).forEach((db) => db.close());
  folders.splice(0).forEach((p) => rmSync(p, { recursive: true }));
});
async function fixture(
  slots: { operationId: string; personId: string; displayName: string }[] = [],
) {
  const folder = mkdtempSync(join(tmpdir(), "otr-owned-person-"));
  folders.push(folder);
  const path = join(folder, "person.db");
  let sql = new DatabaseSync(path);
  handles.push(sql);
  for (const m of migrations) sql.exec(m.sql);
  let account = randomUUID();
  const originalAccount = account;
  let failWrite = false;
  const db = serializeDatabaseTransactions({
    async getFirstAsync<T>(q: string, ...a: unknown[]) {
      return (sql.prepare(q).get(...(a as never[])) ?? null) as T;
    },
    async getAllAsync<T>(q: string, ...a: unknown[]) {
      return sql.prepare(q).all(...(a as never[])) as T[];
    },
    async runAsync(q: string, ...a: unknown[]) {
      const r = sql.prepare(q).run(...(a as never[]));
      if (failWrite && q.includes("INSERT INTO ledger_members")) {
        failWrite = false;
        advanceAccountGeneration();
      }
      return r as never;
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
  const readAccount = async () => account;
  const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
  const trip = randomUUID(),
    create = randomUUID();
  const trips = createTripRepository(
    db,
    readAccount,
    createTripCoreV2Repository(db, readAccount, hash),
  );
  await trips.createTrip({
    tripId: trip,
    operationId: create,
    name: "New authored Trip",
    syncFormatVersion: 2,
    destinations: [],
    ...(slots.length
      ? { cloudTravelers: { dataOwnership: "CLOUD_SHARED_AUTHORED" as const, slots } }
      : {}),
  });
  const repo = createTripPersonCloudCreateRepository(db, readAccount);
  const personRepo = createTripPersonRepository(db, readAccount);
  const authored = (name = "Same name") => ({
    tripId: trip,
    personId: randomUUID(),
    operationId: randomUUID(),
    dataOwnership: "CLOUD_SHARED_AUTHORED" as const,
    displayName: name,
  });
  const accept = (r: PersonCloudCreate): PersonCloudCreateReceipt => ({
    receiptVersion: 1,
    actorAccountId: originalAccount,
    request: r,
    person: {
      personId: r.personId,
      tripId: r.tripId,
      displayName: r.displayName,
      status: "unlinked",
      userId: null,
      participationActive: true,
      participationRevision: 0,
    },
    acceptedAt: "2026-10-24T01:00:00.000Z",
  });
  return {
    db,
    get sql() {
      return sql;
    },
    readAccount,
    account: originalAccount,
    trip,
    create,
    trips,
    repo,
    personRepo,
    authored,
    accept,
    failNextMemberWrite() {
      failWrite = true;
    },
    switchAccount() {
      account = randomUUID();
      advanceAccountGeneration();
    },
    reopen() {
      sql.close();
      handles.splice(handles.indexOf(sql), 1);
      sql = new DatabaseSync(path);
      handles.push(sql);
    },
  };
}
it("new Create retains explicit Cloud Traveler operations atomically without changing Trip wire", async () => {
  const slots = [
    { personId: randomUUID(), operationId: randomUUID(), displayName: "Same name" },
    { personId: randomUUID(), operationId: randomUUID(), displayName: "Same name" },
  ];
  const f = await fixture(slots);
  const create = f.sql
    .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
    .get(f.create) as { payload_json: string };
  expect(JSON.parse(create.payload_json)).not.toHaveProperty("cloudTravelers");
  expect(JSON.parse(create.payload_json)).not.toHaveProperty("travelers");
  expect(
    f.sql
      .prepare("SELECT count(*) AS n FROM sync_operations WHERE operation_type=?")
      .get(personCloudCreateKind),
  ).toMatchObject({ n: 2 });
  expect(
    (await f.personRepo.listTripPersons(f.trip))
      .filter((p) => slots.some((s) => s.personId === p.personId))
      .every((p) => p.localState === "LOCAL_PENDING"),
  ).toBe(true);
});
it("never translates old private names; same display names retain distinct identity", async () => {
  const f = await fixture();
  const legacy = {
    operationId: randomUUID(),
    personId: randomUUID(),
    displayName: "Same name",
  };
  await createLocalTripPersonRepository(f.db, f.readAccount).initialize(f.trip, [legacy]);
  const a = await f.repo.createAuthored(f.authored()),
    b = await f.repo.createAuthored(f.authored());
  expect(a.personId).not.toBe(b.personId);
  expect(
    f.sql
      .prepare("SELECT operation_type FROM sync_operations WHERE id=?")
      .get(legacy.operationId),
  ).toMatchObject({ operation_type: "TRIP_PERSON_CREATE" });
  expect(
    f.sql
      .prepare("SELECT count(*) AS n FROM sync_operations WHERE operation_type=?")
      .get(personCloudCreateKind),
  ).toMatchObject({ n: 2 });
});
it("exact authoring replay preserves IDs and rejects reused operation or Person identity", async () => {
  const f = await fixture(),
    input = f.authored();
  expect(await f.repo.createAuthored(input)).toEqual(await f.repo.createAuthored(input));
  await expect(f.repo.createAuthored({ ...input, displayName: "Other" })).rejects.toThrow(
    "PERSON_OPERATION_COLLISION",
  );
  await expect(
    f.repo.createAuthored({ ...input, operationId: randomUUID() }),
  ).rejects.toThrow("PERSON_ID_COLLISION");
});
it("waits Create then accepts only independent matching readback, restoring durable receipt after cold reopen", async () => {
  const f = await fixture(),
    request = await f.repo.createAuthored(f.authored());
  const scope = await captureAccountRequestContext(f.trip, f.readAccount);
  await f.repo.resume(scope, request.operationId);
  expect(
    f.sql
      .prepare("SELECT status FROM sync_operations WHERE id=?")
      .get(request.operationId),
  ).toMatchObject({ status: "DEPENDENCY_BLOCKED" });
  f.sql.prepare("UPDATE sync_operations SET status='COMPLETED' WHERE id=?").run(f.create);
  await f.repo.resume(scope, request.operationId);
  const receipt = f.accept(request);
  const transport = {
    receipt: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(receipt),
    create: vi.fn().mockResolvedValue(receipt),
  };
  const queue = createSyncOperationRepository(f.db, f.readAccount, undefined, {
    accountId: f.account,
    tripId: f.trip,
    operationId: request.operationId,
  });
  await createSyncEngine(
    queue,
    createPersonCloudSyncWorker(f.repo, transport, f.readAccount),
    undefined,
    (op) => op.operationType === personCloudCreateKind,
  ).run("AUTHENTICATED_ONLINE");
  expect(transport.create).toHaveBeenCalledTimes(1);
  expect(transport.receipt).toHaveBeenCalledTimes(2);
  f.reopen();
  expect(
    f.sql
      .prepare("SELECT status FROM sync_operations WHERE id=?")
      .get(request.operationId),
  ).toMatchObject({ status: "COMPLETED" });
  expect(
    (await f.personRepo.listTripPersons(f.trip)).find(
      (p) => p.personId === request.personId,
    ),
  ).toMatchObject({
    displayName: request.displayName,
    participation: { isParticipating: true, revision: 0 },
  });
  const roster = await readLocalTripPersonRosterWithinTransaction(
    f.db,
    scope,
    f.readAccount,
    f.create,
  );
  expect(roster.some((p) => p.personId === request.personId)).toBe(true);
});
it("UNKNOWN POST is reconciled first on retry, without duplicate create or fabricated success", async () => {
  const f = await fixture(),
    request = await f.repo.createAuthored(f.authored()),
    scope = await captureAccountRequestContext(f.trip, f.readAccount);
  f.sql.prepare("UPDATE sync_operations SET status='COMPLETED' WHERE id=?").run(f.create);
  await f.repo.resume(scope, request.operationId);
  const receipt = f.accept(request);
  const transport = {
    receipt: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(receipt),
    create: vi.fn().mockRejectedValue(Error("UNKNOWN")),
  };
  const worker = createPersonCloudSyncWorker(f.repo, transport, f.readAccount),
    queue = createSyncOperationRepository(f.db, f.readAccount, undefined, {
      accountId: f.account,
      tripId: f.trip,
      operationId: request.operationId,
    });
  const engine = createSyncEngine(
    queue,
    worker,
    () => new Date(0).toISOString(),
    (op) => op.operationType === personCloudCreateKind,
  );
  await engine.run("AUTHENTICATED_ONLINE");
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM trip_person_cloud_create_receipts").get(),
  ).toMatchObject({ n: 0 });
  await engine.run("AUTHENTICATED_ONLINE");
  expect(transport.create).toHaveBeenCalledTimes(1);
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM trip_person_cloud_create_receipts").get(),
  ).toMatchObject({ n: 1 });
});
it("readback mismatch and Account ABA never promote a local Person", async () => {
  const f = await fixture(),
    request = await f.repo.createAuthored(f.authored()),
    scope = await captureAccountRequestContext(f.trip, f.readAccount);
  const receipt = f.accept(request);
  await expect(
    f.repo.accept({ ...receipt, actorAccountId: randomUUID() }, scope),
  ).rejects.toThrow("PERSON_RECEIPT_CONTEXT");
  f.switchAccount();
  await expect(f.repo.accept(receipt, scope)).rejects.toThrow();
  expect(
    f.sql.prepare("SELECT status FROM ledger_members WHERE id=?").get(request.personId),
  ).toMatchObject({ status: "local" });
});
it("Account generation change rolls back both current authoring row and queue", async () => {
  const f = await fixture(),
    input = f.authored();
  f.failNextMemberWrite();
  await expect(f.repo.createAuthored(input)).rejects.toThrow();
  expect(
    f.sql.prepare("SELECT id FROM ledger_members WHERE id=?").get(input.personId),
  ).toBeUndefined();
  expect(
    f.sql.prepare("SELECT id FROM sync_operations WHERE id=?").get(input.operationId),
  ).toBeUndefined();
});
it("mixed old/private and new/shared origin refuses the whole new Trip save", async () => {
  const f = await fixture(),
    trip = randomUUID(),
    operationId = randomUUID(),
    slot = {
      personId: randomUUID(),
      operationId: randomUUID(),
      displayName: "Current action",
    };
  await expect(
    f.trips.createTrip({
      tripId: trip,
      operationId,
      name: "Must not partially save",
      syncFormatVersion: 2,
      destinations: [],
      travelers: [slot],
      cloudTravelers: { dataOwnership: "CLOUD_SHARED_AUTHORED", slots: [slot] },
    }),
  ).rejects.toThrow("PERSON_OWNERSHIP_AMBIGUOUS");
  expect(
    f.sql.prepare("SELECT id FROM local_trip_containers WHERE id=?").get(trip),
  ).toBeUndefined();
});
it("a changed local name prevents receipt installation rather than falsely qualifying a Person", async () => {
  const f = await fixture(),
    request = await f.repo.createAuthored(f.authored()),
    scope = await captureAccountRequestContext(f.trip, f.readAccount);
  f.sql
    .prepare("UPDATE ledger_members SET display_name='newer local value' WHERE id=?")
    .run(request.personId);
  await expect(f.repo.accept(f.accept(request), scope)).rejects.toThrow(
    "PERSON_LOCAL_READBACK_CONFLICT",
  );
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM trip_person_cloud_create_receipts").get(),
  ).toMatchObject({ n: 0 });
});
