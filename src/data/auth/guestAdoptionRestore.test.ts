import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { fixture } from "../../../backend/src/guestAdoptionCompositePlan.fixture";
import { buildCoreActorCollection } from "../../../backend/src/tripCoreV2Collection";
import { applyCoreCommand, emptyCoreGraph } from "@/domain/trip/tripCoreV2Mutation";
import { validateCoreCommand } from "@/domain/trip/tripCoreV2Commands";
import { mapGuestAdoptionCommandIdentity } from "@/domain/auth/guestAdoptionIdentityMapping";
import { coreHashValue } from "@/domain/trip/tripCoreV2Read";
import { tripCoreSha256Hex as hash } from "../repositories/tripCoreSha256";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import type { CoreDatabase } from "../repositories/tripCoreV2Repository";
import { createTripCoreV2Repository } from "../repositories/tripCoreV2Repository";
import { getAccountGeneration } from "./accountGeneration";
import type { createGuestAdoptionTransport } from "./guestAdoptionTransport";
import { restoreGuestAdoption } from "./guestAdoptionRestore";
vi.mock("./authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));
const databases: DatabaseSync[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
async function setup() {
  const f = fixture(),
    checkpoint = await f.source(),
    owner = randomUUID();
  const original = f.body.trips[0],
    accountId = f.user.id,
    tripId = original.create.tripId;
  const command = mapGuestAdoptionCommandIdentity(
    validateCoreCommand(original.coreIntents[0].command),
    new Map([[f.person, owner]]),
  );
  const expected = {
    contractVersion: 1 as const,
    adoptionId: f.grant.adoptionId,
    sourceGuestLocalId: f.grant.sourceGuestLocalId,
    targetAccountId: accountId,
    inventorySha256: f.grant.inventorySha256,
  };
  const unsigned = {
    ...expected,
    schemaId: "otr.auth.guest-adoption-receipt/1" as const,
    receiptId: randomUUID(),
    grantId: f.grant.grantId,
    policyVersion: f.grant.policyVersion,
    recordedAt: "2026-10-30T00:00:00Z",
    outcome: "PUBLISHED" as const,
    preparationSha256: checkpoint.sha256,
    planSha256: "c".repeat(64),
    executionSha256: "d".repeat(64),
    trips: [
      {
        tripId,
        createOperationId: original.create.operationId,
        sourceCreatorPersonId: f.person,
        ownerPersonId: owner,
        personMappings: [{ sourcePersonId: f.person, targetPersonId: owner }],
        ledgerSnapshotSha256: "e".repeat(64),
        operations: [
          {
            queueId: original.create.operationId,
            operationId: original.create.operationId,
            kind: "TRIP_CREATE" as const,
            owningReceiptSha256: "f".repeat(64),
            domainReceiptId: null,
            sourceIntentSha256: null,
            mappedIntentSha256: null,
          },
          {
            queueId: command.operationId,
            operationId: command.operationId,
            kind: "CORE" as const,
            owningReceiptSha256: "f".repeat(64),
            domainReceiptId: randomUUID(),
            sourceIntentSha256: original.coreIntents[0].sha256,
            mappedIntentSha256: await coreHashValue(
              "otr-trip-core-intent-v2",
              command,
              hash,
            ),
          },
        ],
      },
    ],
  };
  const receipt = {
    ...unsigned,
    receiptSha256: await coreHashValue(
      "otr-auth-guest-adoption-receipt-v1",
      unsigned,
      hash,
    ),
  };
  const sql = new DatabaseSync(":memory:");
  databases.push(sql);
  for (const migration of migrations) sql.exec(migration.sql);
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
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  });
  const actor = {
    accountId,
    tripId,
    active: true,
    canManageShared: false,
    personId: owner,
    personIds: [owner],
  };
  const graph = applyCoreCommand(
    emptyCoreGraph(),
    command,
    actor,
    unsigned.recordedAt,
  ).graph;
  const collection = await buildCoreActorCollection(
    graph,
    actor,
    {
      epoch: randomUUID(),
      revision: 1,
      accessRevision: 1,
      generatedAt: unsigned.recordedAt,
    },
    [
      {
        person_id: owner,
        account_id: accountId,
        active: true,
        participating: true,
        revision: 1,
      },
    ],
    hash,
  );
  const transport = {
    status: vi.fn(async () => ({
      ...expected,
      status: "PUBLISHED",
      nextAction: "READ_PUBLICATION_RECEIPT",
      receipt: { receiptId: receipt.receiptId, receiptSha256: receipt.receiptSha256 },
    })),
    receipt: vi.fn(async () => receipt),
    targetReads: {
      scope: { accountId, generation: getAccountGeneration() },
      account: vi.fn(async () => accountId),
      ensureProfile: vi.fn(async () => undefined),
      discovery: {
        page: vi.fn(async () => ({
          trips: [
            {
              id: tripId,
              name: original.create.name,
              destination: null,
              startDate: null,
              endDate: null,
              createdAt: unsigned.recordedAt,
            },
          ],
          nextCursor: null,
        })),
      },
      core: { collection: vi.fn(async () => collection) },
    },
  } as unknown as ReturnType<typeof createGuestAdoptionTransport>;
  return {
    sql,
    database,
    transport,
    expected,
    checkpoint,
    accountId,
    tripId,
    owner,
    graph,
    collection,
  };
}
it("restores the normal Discovery/Core caches without manufacturing a local Trip or queue", async () => {
  const f = await setup();
  expect(
    (await restoreGuestAdoption(f.database, f.transport, f.expected, f.checkpoint))
      .authority,
  ).toBe("NONE");
  const repo = createTripCoreV2Repository(
    f.database,
    f.transport.targetReads.account,
    hash,
  );
  const accepted = await repo.acceptedSnapshot({
    ...f.transport.targetReads.scope,
    tripId: f.tripId,
  });
  expect(accepted?.actor.personId).toBe(f.owner);
  expect(accepted?.graph.itinerary_events[0].title).toBe("Guest walk");
  expect(
    f.sql
      .prepare("SELECT count(*) AS n FROM trip_discovery_summaries WHERE account_id=?")
      .get(f.accountId),
  ).toEqual({ n: 1 });
  for (const table of ["local_trip_containers", "sync_operations"])
    expect(f.sql.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
  await restoreGuestAdoption(f.database, f.transport, f.expected, f.checkpoint);
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM trip_discovery_summaries").get(),
  ).toEqual({ n: 1 });
});
it("refuses a different target before any request or cache write", async () => {
  const f = await setup();
  await expect(
    restoreGuestAdoption(
      f.database,
      f.transport,
      { ...f.expected, targetAccountId: randomUUID() },
      f.checkpoint,
    ),
  ).rejects.toThrow("TARGET_MISMATCH");
  expect(f.transport.status).not.toHaveBeenCalled();
});
it("retains source and refuses readiness when normal Discovery omits the adopted Trip", async () => {
  const f = await setup();
  vi.mocked(f.transport.targetReads.discovery.page).mockResolvedValue({
    trips: [],
    nextCursor: null,
  });
  await expect(
    restoreGuestAdoption(f.database, f.transport, f.expected, f.checkpoint),
  ).rejects.toThrow("TRIP_READBACK_MISSING");
  expect(f.transport.targetReads.core.collection).not.toHaveBeenCalled();
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM trip_discovery_snapshots").get(),
  ).toEqual({ n: 0 });
});
it("does not accept a valid but empty owning Core collection as successful restore", async () => {
  const f = await setup();
  const actor = {
    accountId: f.accountId,
    tripId: f.tripId,
    personId: f.owner,
    personIds: [f.owner],
    active: true,
    canManageShared: false,
  };
  const empty = await buildCoreActorCollection(
    emptyCoreGraph(),
    actor,
    {
      epoch: randomUUID(),
      revision: 2,
      accessRevision: 1,
      generatedAt: "2026-10-30T00:00:00Z",
    },
    [
      {
        person_id: f.owner,
        account_id: f.accountId,
        active: true,
        participating: true,
        revision: 1,
      },
    ],
    hash,
  );
  vi.mocked(f.transport.targetReads.core.collection).mockResolvedValue(empty);
  await expect(
    restoreGuestAdoption(f.database, f.transport, f.expected, f.checkpoint),
  ).rejects.toThrow("CORE_READBACK_MISMATCH");
});

it("pins the checkpoint before the first network await", async () => {
  const f = await setup();
  const status = f.transport.status;
  f.transport.status = async (request) => {
    f.checkpoint.canonicalText = "{}";
    return status(request);
  };
  await expect(
    restoreGuestAdoption(f.database, f.transport, f.expected, f.checkpoint),
  ).resolves.toMatchObject({ authority: "NONE" });
});

it("does not alter another Account's Discovery cache", async () => {
  const f = await setup(),
    other = randomUUID(),
    otherTrip = randomUUID();
  f.sql
    .prepare("INSERT INTO trip_discovery_snapshots(account_id,refreshed_at) VALUES(?,?)")
    .run(other, "original");
  f.sql
    .prepare(
      "INSERT INTO trip_discovery_summaries(account_id,id,name,destination,start_date,end_date,created_at) VALUES(?,?,?,NULL,NULL,NULL,NULL)",
    )
    .run(other, otherTrip, "Private other account");
  await restoreGuestAdoption(f.database, f.transport, f.expected, f.checkpoint);
  expect(
    f.sql
      .prepare("SELECT id,name FROM trip_discovery_summaries WHERE account_id=?")
      .get(other),
  ).toEqual({ id: otherTrip, name: "Private other account" });
  expect(
    f.sql
      .prepare("SELECT refreshed_at FROM trip_discovery_snapshots WHERE account_id=?")
      .get(other),
  ).toEqual({ refreshed_at: "original" });
});

it.each(["unchanged", "certificate", "revoked", "person", "item", "refresh-generation"])(
  "checks restored Core cache under the real transition lease: %s",
  async (change) => {
    const f = await setup();
    const restored = await restoreGuestAdoption(
      f.database,
      f.transport,
      f.expected,
      f.checkpoint,
    );
    const { beginAccountTransition, endAccountTransition } =
      await import("./accountRequestContext");
    if (change === "certificate")
      f.sql
        .prepare(
          "UPDATE trip_core_read_certificates SET manifest_sha256=? WHERE account_id=?",
        )
        .run("0".repeat(64), f.accountId);
    if (change === "revoked")
      f.sql
        .prepare("UPDATE trip_core_scopes SET revoked=1 WHERE account_id=?")
        .run(f.accountId);
    if (change === "person")
      f.sql
        .prepare(
          "UPDATE trip_core_person_bindings SET linked_account_id=NULL WHERE account_id=?",
        )
        .run(f.accountId);
    if (change === "item")
      f.sql
        .prepare(
          "UPDATE trip_core_itinerary_events SET owner_account_id=? WHERE cache_account_id=?",
        )
        .run(randomUUID(), f.accountId);
    if (change === "refresh-generation")
      f.sql
        .prepare(
          "UPDATE trip_core_scopes SET refresh_generation=refresh_generation+1 WHERE account_id=?",
        )
        .run(f.accountId);
    const lease = await beginAccountTransition();
    try {
      if (change === "unchanged")
        await expect(restored.qualifyLocalCache(lease)).resolves.toBeUndefined();
      else
        await expect(restored.qualifyLocalCache(lease)).rejects.toThrow(
          "CORE_TRANSITION_CACHE_",
        );
    } finally {
      endAccountTransition(lease);
    }
    await expect(restored.qualifyLocalCache(lease)).rejects.toThrow(
      "lease is not active",
    );
  },
);
