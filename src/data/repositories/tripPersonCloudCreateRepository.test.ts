import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import {
  captureAccountRequestContext,
  withAccountApplyGate,
} from "../auth/accountRequestContext";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { createTripRepository } from "./tripRepository";
import { createTripCoreV2Repository } from "./tripCoreV2Repository";
import { createTripPersonRepository } from "./tripPersonRepository";
import {
  createTripPersonCloudCreateRepository,
  saveAuthoredTripTraveler,
} from "./tripPersonCloudCreateRepository";
import { requireAdoptedUserId } from "../auth/authRepository";
import { readInitializedDatabase } from "../db/database";
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
vi.mock("../auth/authRepository", () => ({ requireAdoptedUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));
const handles: DatabaseSync[] = [];
const folders: string[] = [];
afterEach(() => {
  vi.mocked(requireAdoptedUserId).mockReset();
  vi.mocked(readInitializedDatabase).mockReset();
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
  let confirmationFault: "archive" | "insert" | "aba" | null = null;
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
      if (
        confirmationFault &&
        ((confirmationFault === "archive" && q.includes("PERSON_SHARED_CONFIRMED")) ||
          (confirmationFault !== "archive" &&
            q.includes("INSERT INTO sync_operations") &&
            a.includes(personCloudCreateKind)))
      ) {
        const selected = confirmationFault;
        confirmationFault = null;
        if (selected === "aba") advanceAccountGeneration();
        else throw Error("CONFIRMATION_TEST_WRITE_FAILURE");
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
    failConfirmation(at: "archive" | "insert" | "aba") {
      confirmationFault = at;
    },
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
it("the UI adapter binds one authoring operation to its opening Account and existing Trip lineage", async () => {
  const f = await fixture();
  const scope = await captureAccountRequestContext(f.trip, f.readAccount);
  vi.mocked(requireAdoptedUserId).mockImplementation(f.readAccount);
  vi.mocked(readInitializedDatabase).mockResolvedValue(f.db as never);
  const { operationId, personId, displayName } = f.authored("同行人 林");
  const input = Object.freeze({ operationId, personId, displayName });
  const first = await saveAuthoredTripTraveler(scope, input);
  expect(await saveAuthoredTripTraveler(scope, input)).toEqual(first);
  expect(first.request.tripCreateOperationId).toBe(f.create);
  expect(first.request.tripId).toBe(f.trip);
  expect(first.request.dataOwnership).toBe("CLOUD_SHARED_AUTHORED");
  expect(first.people.find((person) => person.personId === personId)).toMatchObject({
    displayName,
    localState: "LOCAL_PENDING",
  });
  const row = f.sql
    .prepare("SELECT owner_user_id,status,attempt_count FROM sync_operations WHERE id=?")
    .get(operationId);
  expect(row).toMatchObject({
    owner_user_id: f.account,
    status: "DEPENDENCY_BLOCKED",
    attempt_count: 0,
  });
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM ledger_members WHERE id=?").get(personId),
  ).toMatchObject({ n: 1 });
});

it.each(["before-open", "during-open"] as const)(
  "the UI adapter rejects a changed Account %s without creating a Person",
  async (when) => {
    const f = await fixture();
    const scope = await captureAccountRequestContext(f.trip, f.readAccount);
    vi.mocked(requireAdoptedUserId).mockImplementation(f.readAccount);
    const { operationId, personId, displayName } = f.authored();
    if (when === "before-open") f.switchAccount();
    vi.mocked(readInitializedDatabase).mockImplementation(async () => {
      if (when === "during-open") f.switchAccount();
      return f.db as never;
    });
    await expect(
      saveAuthoredTripTraveler(scope, { operationId, personId, displayName }),
    ).rejects.toThrow();
    if (when === "before-open") expect(readInitializedDatabase).not.toHaveBeenCalled();
    expect(
      f.sql.prepare("SELECT count(*) AS n FROM ledger_members WHERE id=?").get(personId),
    ).toMatchObject({ n: 0 });
    expect(
      f.sql
        .prepare("SELECT count(*) AS n FROM sync_operations WHERE id=?")
        .get(operationId),
    ).toMatchObject({ n: 0 });
  },
);

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
it("explicit local confirmation preserves identity, original intent and receipt-first recovery", async () => {
  const f = await fixture();
  const slot = {
    operationId: randomUUID(),
    personId: randomUUID(),
    displayName: "Confirmed traveler",
  };
  await createLocalTripPersonRepository(f.db, f.readAccount).initialize(f.trip, [slot]);
  for (let i = 0; i < 2; i++)
    await f.trips.addItem(f.trip, {
      operationId: randomUUID(),
      itemId: randomUUID(),
      family: "P1",
      title: `Preserved ${i}`,
      startDate: "2026-10-29",
    });
  const beforeItems = f.sql
    .prepare("SELECT * FROM trip_core_pending_intents ORDER BY operation_id")
    .all();
  const original = f.sql
    .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
    .get(slot.operationId) as { payload_json: string };
  const input = {
    tripId: f.trip,
    localOperationId: slot.operationId,
    operationId: randomUUID(),
    confirmedDisplayNameSha256: createHash("sha256")
      .update(slot.displayName)
      .digest("hex"),
    dataOwnership: "CLOUD_SHARED_AUTHORED" as const,
  };
  const request = await f.repo.confirmLocalShared(input);
  expect(request.personId).toBe(slot.personId);
  expect(await f.repo.confirmLocalShared(input)).toEqual(request);
  expect(
    f.sql
      .prepare(
        "SELECT payload_json,status,last_error_code,attempt_count FROM sync_operations WHERE id=?",
      )
      .get(slot.operationId),
  ).toMatchObject({
    ...original,
    status: "COMPLETED",
    last_error_code: "PERSON_SHARED_CONFIRMED",
    attempt_count: 0,
  });
  const scope = await captureAccountRequestContext(f.trip, f.readAccount);
  expect(
    (
      await readLocalTripPersonRosterWithinTransaction(
        f.db,
        scope,
        f.readAccount,
        f.create,
      )
    ).filter((p) => p.personId === slot.personId),
  ).toHaveLength(1);
  expect(
    (await f.personRepo.listTripPersons(f.trip)).find((p) => p.personId === slot.personId)
      ?.localState,
  ).toBe("LOCAL_PENDING");
  f.reopen();
  expect(await f.repo.confirmLocalShared(input)).toEqual(request);
  f.sql.prepare("UPDATE sync_operations SET status='COMPLETED' WHERE id=?").run(f.create);
  await f.repo.resume(scope, request.operationId);
  const receipt = f.accept(request);
  const transport = {
    receipt: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(receipt),
    create: vi.fn().mockResolvedValue(receipt),
  };
  await createSyncEngine(
    createSyncOperationRepository(f.db, f.readAccount, undefined, {
      accountId: f.account,
      tripId: f.trip,
      operationId: request.operationId,
    }),
    createPersonCloudSyncWorker(f.repo, transport, f.readAccount),
    undefined,
    (op) => op.operationType === personCloudCreateKind,
  ).run("AUTHENTICATED_ONLINE");
  expect(await f.repo.confirmLocalShared(input)).toEqual(request);
  await expect(
    f.repo.confirmLocalShared({ ...input, operationId: randomUUID() }),
  ).rejects.toThrow();
  expect(
    f.sql.prepare("SELECT * FROM trip_core_pending_intents ORDER BY operation_id").all(),
  ).toEqual(beforeItems);
  expect(transport.create).toHaveBeenCalledTimes(1);
  expect(transport.receipt).toHaveBeenCalledTimes(2);
  f.reopen();
  expect(
    (await f.personRepo.listTripPersons(f.trip)).find(
      (p) => p.personId === slot.personId,
    ),
  ).toMatchObject({ participation: { isParticipating: true, revision: 0 } });
  expect(
    f.sql
      .prepare("SELECT count(*) AS n FROM ledger_members WHERE id=?")
      .get(slot.personId),
  ).toMatchObject({ n: 1 });
});
it.each(["name", "attempted", "claimed", "modified", "foreign", "collision"])(
  "refuses unsafe local confirmation %s without partial conversion",
  async (kind) => {
    const f = await fixture();
    const slot = {
      operationId: randomUUID(),
      personId: randomUUID(),
      displayName: "Private traveler",
    };
    await createLocalTripPersonRepository(f.db, f.readAccount).initialize(f.trip, [slot]);
    const input = {
      tripId: f.trip,
      localOperationId: slot.operationId,
      operationId: randomUUID(),
      confirmedDisplayNameSha256: createHash("sha256")
        .update(slot.displayName)
        .digest("hex"),
      dataOwnership: "CLOUD_SHARED_AUTHORED" as const,
    };
    if (kind === "name") input.confirmedDisplayNameSha256 = "0".repeat(64);
    if (kind === "attempted")
      f.sql
        .prepare("UPDATE sync_operations SET attempt_count=1 WHERE id=?")
        .run(slot.operationId);
    if (kind === "claimed")
      f.sql
        .prepare("UPDATE sync_operations SET claim_owner='other' WHERE id=?")
        .run(slot.operationId);
    if (kind === "modified")
      f.sql
        .prepare("UPDATE ledger_members SET display_name='newer' WHERE id=?")
        .run(slot.personId);
    if (kind === "collision") input.operationId = f.create;
    if (kind === "foreign") f.switchAccount();
    await expect(f.repo.confirmLocalShared(input)).rejects.toThrow();
    expect(
      f.sql
        .prepare("SELECT status FROM sync_operations WHERE id=?")
        .get(slot.operationId),
    ).toMatchObject({ status: "DEPENDENCY_BLOCKED" });
    expect(
      f.sql
        .prepare("SELECT count(*) AS n FROM sync_operations WHERE operation_type=?")
        .get(personCloudCreateKind),
    ).toMatchObject({ n: 0 });
  },
);

it.each(["archive", "insert", "aba"] as const)(
  "confirmation %s fault rolls back both old archive and new Cloud intent",
  async (at) => {
    const f = await fixture();
    const slot = {
      operationId: randomUUID(),
      personId: randomUUID(),
      displayName: "Confirmed traveler",
    };
    await createLocalTripPersonRepository(f.db, f.readAccount).initialize(f.trip, [slot]);
    const before = f.sql
      .prepare("SELECT * FROM sync_operations WHERE id=?")
      .get(slot.operationId);
    f.failConfirmation(at);
    await expect(
      f.repo.confirmLocalShared({
        tripId: f.trip,
        localOperationId: slot.operationId,
        operationId: randomUUID(),
        confirmedDisplayNameSha256: createHash("sha256")
          .update(slot.displayName)
          .digest("hex"),
        dataOwnership: "CLOUD_SHARED_AUTHORED",
      }),
    ).rejects.toThrow();
    expect(
      f.sql.prepare("SELECT * FROM sync_operations WHERE id=?").get(slot.operationId),
    ).toEqual(before);
    expect(
      f.sql
        .prepare("SELECT count(*) AS n FROM sync_operations WHERE operation_type=?")
        .get(personCloudCreateKind),
    ).toMatchObject({ n: 0 });
  },
);

it("snapshots explicit confirmation before awaiting the Account apply gate", async () => {
  const f = await fixture();
  const a = {
      operationId: randomUUID(),
      personId: randomUUID(),
      displayName: "Confirmed A",
    },
    b = {
      operationId: randomUUID(),
      personId: randomUUID(),
      displayName: "Unconfirmed B",
    };
  await createLocalTripPersonRepository(f.db, f.readAccount).initialize(f.trip, [a, b]);
  const beforeB = f.sql
    .prepare("SELECT * FROM sync_operations WHERE id=?")
    .get(b.operationId);
  const originalOperationId = randomUUID();
  const input = {
    tripId: f.trip,
    localOperationId: a.operationId,
    operationId: originalOperationId,
    confirmedDisplayNameSha256: createHash("sha256").update(a.displayName).digest("hex"),
    dataOwnership: "CLOUD_SHARED_AUTHORED" as const,
  };
  let release!: () => void, entered!: () => void;
  const ready = new Promise<void>((r) => {
    entered = r;
  });
  const gate = withAccountApplyGate(async () => {
    entered();
    await new Promise<void>((r) => {
      release = r;
    });
  });
  await ready;
  const pending = f.repo.confirmLocalShared(input);
  input.localOperationId = b.operationId;
  input.operationId = randomUUID();
  input.confirmedDisplayNameSha256 = createHash("sha256")
    .update(b.displayName)
    .digest("hex");
  release();
  await gate;
  const result = await pending;
  expect(result.personId).toBe(a.personId);
  expect(result.operationId).toBe(originalOperationId);
  expect(
    f.sql.prepare("SELECT * FROM sync_operations WHERE id=?").get(b.operationId),
  ).toEqual(beforeB);
  expect(
    f.sql
      .prepare(
        "SELECT count(*) AS n FROM sync_operations WHERE entity_id=? AND operation_type=?",
      )
      .get(b.personId, personCloudCreateKind),
  ).toMatchObject({ n: 0 });
});
