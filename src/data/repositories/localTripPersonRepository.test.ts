import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { createSyncOperationRepository } from "../sync/syncOperationRepository";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import { createTripRepository } from "./tripRepository";
import { createTripPersonRepository } from "./tripPersonRepository";
import { createLedgerReadRepository } from "./ledgerReadRepository";
import { readParticipationCertificate } from "./tripPersonCertificate";
import { createLocalTripPersonRepository } from "./localTripPersonRepository";
import {
  encodeSharedLedgerCursor,
  serializeParticipationVector,
} from "@/domain/trip/participationSnapshot";
import type { LocalPersonNameSlot } from "@/domain/trip/localTripPerson";
import type { LedgerBootstrapResponse } from "../api/ledgerReadContracts";

vi.mock("../auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async (_algorithm: string, value: string) =>
    createHash("sha256").update(value).digest("hex"),
}));
const accountA = randomUUID();
const now = "2026-10-17T09:00:00.000000Z";
const folders: string[] = [];
const connections: DatabaseSync[] = [];
afterEach(() => {
  connections.splice(0).forEach((db) => db.close());
  folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true }));
});
const slot = (displayName: string): LocalPersonNameSlot => ({
  displayName,
  operationId: randomUUID(),
  personId: randomUUID(),
});

async function fixture(structured = false) {
  const folder = mkdtempSync(join(tmpdir(), "otr-local-person-"));
  folders.push(folder);
  const path = join(folder, "owned.db");
  let sql = new DatabaseSync(path);
  connections.push(sql);
  for (const migration of migrations) sql.exec(migration.sql);
  let account: string = accountA;
  let changeGenerationOnWrite = false;
  const database: CoreDatabase = serializeDatabaseTransactions({
    async getFirstAsync<T>(query: string, ...args: unknown[]) {
      return (sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(query: string, ...args: unknown[]) {
      return sql.prepare(query).all(...(args as never[])) as T[];
    },
    async runAsync(query: string, ...args: unknown[]) {
      const result = sql.prepare(query).run(...(args as never[]));
      if (changeGenerationOnWrite && query.includes("INSERT INTO ledger_members")) {
        changeGenerationOnWrite = false;
        advanceAccountGeneration();
      }
      return result as never;
    },
    async withTransactionAsync(task) {
      sql.exec("BEGIN");
      try {
        await task();
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  });
  const getAccount = async () => account;
  const hash = async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  const core = createTripCoreV2Repository(database, getAccount, hash);
  const trips = createTripRepository(database, getAccount, core, () => now);
  const tripId = randomUUID();
  const createOperationId = randomUUID();
  await trips.createTrip({
    tripId,
    operationId: createOperationId,
    name: "Name only",
    ...(structured ? { syncFormatVersion: 2 as const, destinations: [] } : {}),
  });
  const owner = sql
    .prepare("SELECT person_id AS id FROM local_trip_ledger_bindings")
    .get() as { id: string };
  return {
    tripId,
    createOperationId,
    owner,
    database,
    getAccount,
    sql: () => sql,
    initialize: (slots: LocalPersonNameSlot[], id = tripId) =>
      createLocalTripPersonRepository(database, getAccount, () => now).initialize(
        id,
        slots,
      ),
    read: () => createTripPersonRepository(database, getAccount).listTripPersons(tripId),
    setAccount: (value: string) => {
      account = value;
    },
    invalidate: () => {
      changeGenerationOnWrite = true;
    },
    reopen: () => {
      sql.close();
      connections.splice(connections.indexOf(sql), 1);
      sql = new DatabaseSync(path);
      connections.push(sql);
    },
  };
}

it("saves only three nonblank names from seven slots, separate from actor, without invitations", async () => {
  const f = await fixture();
  const names = [
    slot(" Tina "),
    slot(""),
    slot("旅行者"),
    slot("  "),
    slot("Tina"),
    slot(""),
    slot(""),
  ];
  const saved = await f.initialize(names);
  expect(saved.people.map((p) => p.displayName)).toEqual(["Tina", "旅行者", "Tina"]);
  expect(new Set(saved.people.map((p) => p.personId)).size).toBe(3);
  expect(saved.people.some((p) => p.personId === f.owner.id)).toBe(false);
  expect((await f.read()).filter((p) => p.localState === "LOCAL_PENDING")).toHaveLength(
    3,
  );
  expect(f.sql().prepare("SELECT count(*) n FROM ledger_members").get()).toEqual({
    n: 4,
  });
  expect(
    f
      .sql()
      .prepare(
        "SELECT role,status,participation_active,participation_revision FROM ledger_members WHERE id<>?",
      )
      .all(f.owner.id),
  ).toEqual(
    Array(3).fill({
      role: null,
      status: "local",
      participation_active: null,
      participation_revision: null,
    }),
  );
  const queue = f
    .sql()
    .prepare(
      "SELECT status,attempt_count,dependency_operation_id,last_error_code FROM sync_operations WHERE operation_type='TRIP_PERSON_CREATE'",
    )
    .all();
  expect(queue).toEqual(
    Array(3).fill({
      status: "DEPENDENCY_BLOCKED",
      attempt_count: 0,
      dependency_operation_id: null,
      last_error_code: "PERSON_CREATE_HOSTED_UNAVAILABLE",
    }),
  );
  expect(f.sql().prepare("SELECT member_id FROM ledger_actor_context").get()).toEqual({
    member_id: f.owner.id,
  });
  expect(
    (
      await createLedgerReadRepository(f.database, f.getAccount).listMembers(f.tripId)
    ).map((person) => person.id),
  ).toEqual([f.owner.id]);
});

it("cold replays the same operation/person IDs without duplicate rows or changed CREATE proof", async () => {
  const f = await fixture();
  const names = [slot("Tina"), slot("Bob")];
  const proof = f
    .sql()
    .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
    .get(f.createOperationId);
  const first = await f.initialize(names);
  f.reopen();
  expect((await f.initialize(names)).people).toEqual(first.people);
  expect(f.sql().prepare("SELECT count(*) n FROM ledger_members").get()).toEqual({
    n: 3,
  });
  expect(
    f
      .sql()
      .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
      .get(f.createOperationId),
  ).toEqual(proof);
  expect(
    (await createSyncOperationRepository(f.database, f.getAccount).listPending()).filter(
      (op) => op.operationType === "TRIP_PERSON_CREATE",
    ),
  ).toEqual([]);
});

it("blank names create no row or intent", async () => {
  const f = await fixture();
  expect((await f.initialize([slot(""), slot(" \n ")])).people).toEqual([]);
  expect(f.sql().prepare("SELECT count(*) n FROM sync_operations").get()).toEqual({
    n: 1,
  });
});

it.each(["account", "binding", "role", "accepted"])(
  "requires local creator proof: %s",
  async (kind) => {
    const f = await fixture();
    if (kind === "account") f.setAccount(randomUUID());
    if (kind === "binding") f.sql().exec("DELETE FROM local_trip_ledger_bindings");
    if (kind === "role") f.sql().exec("UPDATE ledger_actor_context SET role='member'");
    if (kind === "accepted")
      f.sql().exec("UPDATE local_trip_containers SET accepted_at='2026-10-17'");
    await expect(f.initialize([slot("Tina")])).rejects.toThrow(/TRIP_PERSON_LOCAL_/);
    expect(f.sql().prepare("SELECT count(*) n FROM ledger_members").get()).toEqual({
      n: 1,
    });
  },
);

it("rejects changed replay, creator reuse, and existing Person ID collisions", async () => {
  const f = await fixture();
  const name = slot("Tina");
  await f.initialize([name]);
  await expect(f.initialize([{ ...name, displayName: "Other" }])).rejects.toThrow(
    "REUSE_MISMATCH",
  );
  await expect(f.initialize([{ ...slot("Tina"), personId: f.owner.id }])).rejects.toThrow(
    "CREATOR_ID_RESERVED",
  );
  await expect(
    f.initialize([{ ...slot("Tina"), personId: name.personId }]),
  ).rejects.toThrow("ID_COLLISION");
});

it("rolls every name and intent back if a later queue insert fails", async () => {
  const f = await fixture();
  const second = slot("Bob");
  f.sql().exec(`CREATE TRIGGER fail_person_queue BEFORE INSERT ON sync_operations
    WHEN NEW.id='${second.operationId}' BEGIN SELECT RAISE(ABORT,'person queue failure'); END`);
  await expect(f.initialize([slot("Tina"), second])).rejects.toThrow(
    "person queue failure",
  );
  expect(f.sql().prepare("SELECT count(*) n FROM ledger_members").get()).toEqual({
    n: 1,
  });
  expect(f.sql().prepare("SELECT count(*) n FROM sync_operations").get()).toEqual({
    n: 1,
  });
});

it("rolls local names back on account-generation change", async () => {
  const f = await fixture();
  f.invalidate();
  await expect(f.initialize([slot("Tina")])).rejects.toThrow("Account changed");
  expect(f.sql().prepare("SELECT count(*) n FROM ledger_members").get()).toEqual({
    n: 1,
  });
});

const capabilities = {
  canRead: true,
  canCreateExpense: false,
  canEditOwnExpense: false,
  canCorrectAnyExpense: false,
  canSuggestCorrection: false,
  canResolveOwnExpenseConflict: false,
  canAddOwnPaymentEvidence: false,
  canManageExpenseValuation: false,
  canManageLedgerValuationPolicy: false,
  canPrepareSettlement: false,
  canFinalizeSettlement: false,
};

it("keeps pending names through certified bootstrap without adding them to the certificate or grants", async () => {
  const f = await fixture();
  const pending = slot("Tina");
  await f.initialize([pending]);
  const context = await captureAccountRequestContext(f.tripId, f.getAccount);
  const members = [
    {
      id: f.owner.id,
      displayName: "Owner",
      role: "owner",
      status: "linked",
      capabilities,
      updatedAt: now,
      isParticipating: true,
      participationRevision: 1,
    },
  ];
  const fingerprint = createHash("sha256")
    .update(serializeParticipationVector(members))
    .digest("hex");
  const response: LedgerBootstrapResponse = {
    journey: {
      id: f.tripId,
      title: "Trip",
      startDate: null,
      endDate: null,
      settlementCurrency: "NZD",
      settlementScale: 2,
      valuationPolicy: "REFERENCE_RATE",
      updatedAt: now,
    },
    members,
    households: [],
    expenses: [],
    corrections: [],
    rateQuotes: [],
    actor: { userId: accountA, memberId: f.owner.id, role: "owner", capabilities },
    cursor: encodeSharedLedgerCursor(1, f.tripId, accountA, fingerprint),
    serverTime: now,
    participationSnapshot: {
      contractVersion: 1,
      complete: true,
      personCount: 1,
      fingerprintVersion: 1,
      fingerprint,
      observedAt: now,
    },
  };
  await createLedgerReadRepository(f.database, f.getAccount).applyBootstrap(
    response,
    context,
  );
  expect((await readParticipationCertificate(f.database, context))?.ids).toEqual([
    f.owner.id,
  ]);
  expect((await f.read()).find((p) => p.personId === pending.personId)).toMatchObject({
    localState: "LOCAL_PENDING",
    participation: null,
  });
  expect(
    f.sql().prepare("SELECT capabilities_json,member_id FROM ledger_actor_context").get(),
  ).toEqual({ capabilities_json: JSON.stringify(capabilities), member_id: f.owner.id });
  f.sql().exec(
    "UPDATE local_trip_containers SET accepted_at='2026-10-17'; UPDATE sync_operations SET status='COMPLETED' WHERE operation_type='CREATE_TRIP'",
  );
  expect((await f.initialize([pending])).people[0]?.personId).toBe(pending.personId);
  const collision = {
    ...response,
    members: [{ ...members[0]!, id: pending.personId }],
    participationSnapshot: undefined,
    cursor: null,
  };
  await expect(
    createLedgerReadRepository(f.database, f.getAccount).applyBootstrap(collision),
  ).rejects.toThrow("TRIP_PERSON_PENDING_ID_COLLISION");
  expect((await f.read()).find((p) => p.personId === pending.personId)?.displayName).toBe(
    "Tina",
  );
});

it("preserves V2 structured CREATE proof while initializing and reading named travelers", async () => {
  const f = await fixture(true);
  const names = [
    slot("Softer"),
    slot("Maggie"),
    slot("Celine"),
    slot("Judy"),
    slot("Eyan"),
    slot("George"),
  ];
  await f.initialize(names);
  expect((await f.read()).filter((p) => p.localState === "LOCAL_PENDING")).toHaveLength(
    6,
  );
  f.reopen();
  expect((await f.read()).filter((p) => p.localState === "LOCAL_PENDING")).toHaveLength(
    6,
  );
  const row = f
    .sql()
    .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
    .get(f.createOperationId) as { payload_json: string };
  expect(JSON.parse(row.payload_json)).toMatchObject({
    formatVersion: 2,
    destinations: [],
  });
});
