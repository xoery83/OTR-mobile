import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { ApiClientError } from "@/data/api/client";
import type { PersonalSettlementPaymentDto } from "@/data/api/ledgerSettlementContracts";
import { migrations } from "@/data/db/migrations";
import { createLedgerPersonalPaymentSyncWorker } from "@/data/sync/ledgerPersonalPaymentSyncWorker";
import { createSyncEngine } from "@/data/sync/syncEngine";
import { createSyncOperationRepository } from "@/data/sync/syncOperationRepository";
import {
  createLedgerPersonalPaymentRepository,
  personalPaymentOperations,
  type LedgerPersonalPaymentDatabase,
} from "./ledgerPersonalPaymentRepository";

const journeyA = "10000000-0000-4000-8000-000000000001";
const journeyB = "10000000-0000-4000-8000-000000000002";
const userA = "20000000-0000-4000-8000-000000000001";
const userB = "20000000-0000-4000-8000-000000000002";
const memberA = "30000000-0000-4000-8000-000000000001";
const memberB = "30000000-0000-4000-8000-000000000002";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of migrations) sqlite.exec(migration.sql);
  for (const journey of [journeyA, journeyB]) {
    for (const [user, member, name] of [
      [userA, memberA, "A"],
      [userB, memberB, "B"],
    ]) {
      sqlite
        .prepare(
          `INSERT INTO ledger_actor_context
           (user_id, journey_id, member_id, role, capabilities_json, updated_at)
           VALUES (?, ?, ?, 'group_member', '{}', '2026-09-22T00:00:00Z')`,
        )
        .run(user, journey, member);
      sqlite
        .prepare(
          `INSERT OR IGNORE INTO ledger_members
           (id, journey_id, display_name, role, status, updated_at)
           VALUES (?, ?, ?, 'group_member', 'linked', '2026-09-22T00:00:00Z')`,
        )
        .run(member, journey, name);
    }
  }
  const api = {
    async withTransactionAsync(task: () => Promise<void>) {
      sqlite.exec("BEGIN");
      try {
        await task();
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    async runAsync(sql: string, ...args: unknown[]) {
      const result = sqlite.prepare(sql).run(...(args as never[]));
      return { changes: Number(result.changes) } as never;
    },
    async getFirstAsync<T>(sql: string, ...args: unknown[]) {
      return (sqlite.prepare(sql).get(...(args as never[])) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, ...args: unknown[]) {
      return sqlite.prepare(sql).all(...(args as never[])) as T[];
    },
  } satisfies LedgerPersonalPaymentDatabase;
  return { sqlite, api };
}

function command(journeyId: string, amountMinor: number, direction: "PAID" | "RECEIVED") {
  return {
    journeyId,
    counterpartyMemberId: direction === "PAID" ? memberB : memberA,
    direction,
    amountMinor,
    currency: "NZD",
    scale: 2,
    occurredAt: "2026-09-22T10:00:00+12:00",
    note: null,
    recordedEquivalentMinor: null,
    recordedEquivalentCurrency: null,
    recordedEquivalentScale: null,
    referenceRateDecimal: null,
    referenceRateDate: null,
    referenceSource: null,
    referenceProvenance: null,
  };
}

function canonical(
  id: string,
  ownerUserId = userA,
  ownerMemberId = memberA,
): PersonalSettlementPaymentDto {
  return {
    id,
    journeyId: journeyA,
    ownerUserId,
    ownerMemberId,
    counterpartyMemberId: ownerMemberId === memberA ? memberB : memberA,
    direction: "PAID",
    amountMinor: 30_000,
    currency: "NZD",
    scale: 2,
    occurredAt: "2026-09-22T10:00:00+12:00",
    note: null,
    recordedEquivalentMinor: null,
    recordedEquivalentCurrency: null,
    recordedEquivalentScale: null,
    referenceRateDecimal: null,
    referenceRateDate: null,
    referenceSource: null,
    referenceProvenance: null,
    revision: 1,
    createdAt: "2026-09-22T00:00:00Z",
    updatedAt: "2026-09-22T00:00:00Z",
    deletedAt: null,
  };
}

function fakeTransport(failAfterFirstCreate = false) {
  const remote = new Map<string, PersonalSettlementPaymentDto>();
  const responses = new Map<string, PersonalSettlementPaymentDto>();
  let createCalls = 0;
  return {
    remote,
    transport: {
      async create(
        journeyId: string,
        input: Record<string, unknown>,
        idempotencyKey: string,
      ) {
        createCalls += 1;
        let record = responses.get(idempotencyKey);
        if (!record) {
          const { id, auditReason: _auditReason, ...value } = input;
          record = {
            ...value,
            id,
            journeyId,
            ownerUserId: userA,
            ownerMemberId: memberA,
            revision: 1,
            createdAt: "2026-09-24T00:00:00Z",
            updatedAt: "2026-09-24T00:00:00Z",
            deletedAt: null,
          } as PersonalSettlementPaymentDto;
          responses.set(idempotencyKey, record);
          remote.set(record.id, record);
        }
        if (failAfterFirstCreate && createCalls === 1)
          throw new ApiClientError("response lost", "network");
        return { record, idempotentReplay: createCalls > 1 };
      },
      async update(_journeyId: string, id: string, input: Record<string, unknown>) {
        const current = remote.get(id);
        if (!current) throw new Error("Remote Personal Payment is missing.");
        const {
          baseRevision: _baseRevision,
          auditReason: _auditReason,
          ...value
        } = input;
        const record = {
          ...current,
          ...value,
          revision: current.revision + 1,
          updatedAt: "2026-09-24T00:01:00Z",
        } as PersonalSettlementPaymentDto;
        remote.set(id, record);
        return { record, idempotentReplay: false };
      },
      async remove() {
        throw new Error("Unexpected DELETE.");
      },
      async list() {
        throw new Error("Unexpected list.");
      },
      async changes() {
        throw new Error("Unexpected changes.");
      },
    },
  };
}

async function reconcile(
  api: LedgerPersonalPaymentDatabase,
  repository: ReturnType<typeof createLedgerPersonalPaymentRepository>,
  transport: ReturnType<typeof fakeTransport>["transport"],
) {
  const queue = createSyncOperationRepository(api, async () => userA);
  return createSyncEngine(
    queue,
    createLedgerPersonalPaymentSyncWorker(repository, transport as never),
    () => "2026-09-24T23:59:59Z",
  ).run("AUTHENTICATED_ONLINE");
}

describe("Settlement 2.0 Personal Payment SQLite repository", () => {
  it("upgrades from migration 24 to 25 without touching existing data", () => {
    const sqlite = new DatabaseSync(":memory:");
    for (const migration of migrations.filter(({ id }) => id <= 24))
      sqlite.exec(migration.sql);
    sqlite.exec(
      "INSERT INTO account_local_state (user_id, default_currency, updated_at) VALUES ('kept', 'NZD', 'now')",
    );
    sqlite.exec(migrations.find(({ id }) => id === 25)!.sql);
    expect(sqlite.prepare("SELECT user_id FROM account_local_state").get()).toEqual({
      user_id: "kept",
    });
    expect(
      sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='ledger_personal_payment_records'",
        )
        .get(),
    ).toEqual({ name: "ledger_personal_payment_records" });
    sqlite.close();
  });

  it("atomically queues independent A-paid and B-received records with account and Journey isolation", async () => {
    const { sqlite, api } = database();
    const account = { id: userA };
    const repository = createLedgerPersonalPaymentRepository(api, async () => account.id);
    const paid = await repository.create(command(journeyA, 30_000, "PAID"));
    account.id = userB;
    const received = await repository.create(command(journeyA, 29_500, "RECEIVED"));

    expect(
      (await repository.listForJourney(journeyA)).map((item) => item.amountMinor),
    ).toEqual([29_500]);
    expect(await repository.listForJourney(journeyB)).toEqual([]);
    account.id = userA;
    expect((await repository.listForJourney(journeyA))[0]).toMatchObject({
      id: paid.id,
      amountMinor: 30_000,
      ownerUserId: userA,
      syncStatus: "PENDING_CREATE",
    });
    expect(
      sqlite
        .prepare(
          "SELECT owner_user_id, operation_type FROM sync_operations WHERE entity_type='ledger_personal_payment' ORDER BY owner_user_id",
        )
        .all(),
    ).toEqual([
      { owner_user_id: userA, operation_type: "CREATE_PERSONAL_PAYMENT" },
      { owner_user_id: userB, operation_type: "CREATE_PERSONAL_PAYMENT" },
    ]);
    expect(received.id).not.toBe(paid.id);
    sqlite.close();
  });

  it("coalesces an offline edit into its unresolved CREATE and reconciles cleanly", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerPersonalPaymentRepository(api, async () => userA);
    const created = await repository.create(command(journeyA, 100, "PAID"));
    await repository.update(created.id, command(journeyA, 250, "PAID"));

    const queued = sqlite
      .prepare(
        `SELECT operation_type, idempotency_key, payload_json, status
         FROM sync_operations WHERE entity_id = ? AND status <> 'COMPLETED'`,
      )
      .all(created.id) as Record<string, string>[];
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      operation_type: personalPaymentOperations.create,
      status: "PENDING",
    });
    expect(JSON.parse(queued[0].payload_json)).toMatchObject({
      id: created.id,
      amountMinor: 250,
    });

    const server = fakeTransport();
    await reconcile(api, repository, server.transport);
    expect([...server.remote.values()]).toHaveLength(1);
    expect(server.remote.get(created.id)?.amountMinor).toBe(250);
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM sync_operations WHERE entity_id = ? AND status <> 'COMPLETED'",
        )
        .get(created.id),
    ).toEqual({ count: 0 });
    const restarted = createLedgerPersonalPaymentRepository(api, async () => userA);
    expect(await restarted.get(created.id)).toMatchObject({
      amountMinor: 250,
      revision: 1,
      syncStatus: "SYNCED",
    });
    sqlite.close();
  });

  it("keeps only the latest of multiple offline pre-create edits", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerPersonalPaymentRepository(api, async () => userA);
    const created = await repository.create(command(journeyA, 100, "PAID"));
    await repository.update(created.id, command(journeyA, 200, "PAID"));
    await repository.update(created.id, command(journeyA, 350, "PAID"));

    const server = fakeTransport();
    await reconcile(api, repository, server.transport);
    expect([...server.remote.values()]).toHaveLength(1);
    expect(server.remote.get(created.id)?.amountMinor).toBe(350);
    expect(
      sqlite
        .prepare("SELECT operation_type, status FROM sync_operations WHERE entity_id = ?")
        .all(created.id),
    ).toEqual([
      { operation_type: personalPaymentOperations.create, status: "COMPLETED" },
    ]);
    sqlite.close();
  });

  it("preserves CREATE idempotency and latest edits after a lost create response", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerPersonalPaymentRepository(api, async () => userA);
    const created = await repository.create(command(journeyA, 100, "PAID"));
    const server = fakeTransport(true);

    await reconcile(api, repository, server.transport);
    const originalKey = (
      sqlite
        .prepare("SELECT idempotency_key FROM sync_operations WHERE entity_id = ?")
        .get(created.id) as { idempotency_key: string }
    ).idempotency_key;
    await repository.update(created.id, command(journeyA, 300, "PAID"));
    sqlite
      .prepare(
        `UPDATE sync_operations SET status = 'FAILED', last_error_message = 'SYNC_FAILED'
         WHERE entity_id = ? AND operation_type = 'UPDATE_PERSONAL_PAYMENT'`,
      )
      .run(created.id);
    await repository.update(created.id, command(journeyA, 450, "PAID"));
    expect(
      sqlite
        .prepare(
          `SELECT idempotency_key, status, attempt_count FROM sync_operations
           WHERE entity_id = ? AND operation_type = 'CREATE_PERSONAL_PAYMENT'`,
        )
        .get(created.id),
    ).toEqual({ idempotency_key: originalKey, status: "RETRYABLE", attempt_count: 1 });
    sqlite
      .prepare("UPDATE sync_operations SET next_attempt_at = NULL WHERE entity_id = ?")
      .run(created.id);

    await reconcile(api, repository, server.transport);
    expect(
      sqlite
        .prepare(
          "SELECT operation_type, status, attempt_count, last_error_message FROM sync_operations WHERE entity_id = ?",
        )
        .all(created.id),
    ).toEqual([
      {
        operation_type: personalPaymentOperations.create,
        status: "COMPLETED",
        attempt_count: 1,
        last_error_message: null,
      },
      {
        operation_type: personalPaymentOperations.update,
        status: "COMPLETED",
        attempt_count: 0,
        last_error_message: null,
      },
      {
        operation_type: personalPaymentOperations.update,
        status: "COMPLETED",
        attempt_count: 0,
        last_error_message: null,
      },
    ]);
    expect([...server.remote.values()]).toHaveLength(1);
    expect(server.remote.get(created.id)?.amountMinor).toBe(450);
    expect(await repository.get(created.id)).toMatchObject({
      amountMinor: 450,
      revision: 2,
      syncStatus: "SYNCED",
    });
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM sync_operations WHERE entity_id = ? AND status <> 'COMPLETED'",
        )
        .get(created.id),
    ).toEqual({ count: 0 });
    sqlite.close();
  });

  it("keeps per-account authorized projections, pending local precedence, tombstones and history after revocation", async () => {
    const { sqlite, api } = database();
    const account = { id: userA };
    const repository = createLedgerPersonalPaymentRepository(api, async () => account.id);
    const id = "70000000-0000-4000-8000-000000000001";
    await repository.applyHistoricalList(journeyA, [canonical(id)], "server-1");
    account.id = userB;
    await repository.applyHistoricalList(journeyA, [canonical(id)], "server-1");
    expect((await repository.listForJourney(journeyA))[0]?.id).toBe(id);
    account.id = userA;
    await repository.update(id, command(journeyA, 30_100, "PAID"));
    await repository.applyCanonical({
      ...canonical(id),
      amountMinor: 30_050,
      revision: 2,
    });
    expect((await repository.get(id))?.amountMinor).toBe(30_100);

    const restarted = createLedgerPersonalPaymentRepository(api, async () => account.id);
    expect((await restarted.get(id))?.syncStatus).toBe("PENDING_UPDATE");
    sqlite.exec(
      "UPDATE sync_operations SET status='COMPLETED' WHERE entity_type='ledger_personal_payment'",
    );
    await restarted.markPending(id, "UPDATE_PERSONAL_PAYMENT");
    await restarted.applyCanonical(
      {
        ...canonical(id),
        amountMinor: 30_100,
        revision: 2,
      },
      "completed-operation",
    );
    await restarted.applyTombstone(journeyA, id, 3);
    expect((await restarted.listForJourney(journeyA, true))[0]).toMatchObject({
      deletedAt: expect.any(String),
      revision: 3,
      syncStatus: "SYNCED",
    });
    await restarted.revokeJourneyAuthorization(journeyA);
    expect((await restarted.listForJourney(journeyA, true))[0]?.id).toBe(id);
    await expect(restarted.create(command(journeyA, 100, "PAID"))).rejects.toThrow(
      "membership",
    );
    account.id = userB;
    expect((await restarted.listForJourney(journeyA, true))[0]).toMatchObject({
      id,
      ownerUserId: userA,
    });
    sqlite.close();
  });

  it("applies incremental changes once, preserves the dedicated cursor, and accepts tombstones", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerPersonalPaymentRepository(api, async () => userA);
    const id = "70000000-0000-4000-8000-000000000002";
    await repository.applyHistoricalList(journeyA, [canonical(id)], "server-1");
    await repository.applyChanges(journeyA, {
      changes: [
        {
          entityType: "PERSONAL_SETTLEMENT_PAYMENT",
          entityId: id,
          revision: 2,
          isTombstone: false,
          aggregate: { ...canonical(id), amountMinor: 30_100, revision: 2 },
        },
      ],
      cursor: "cursor-2",
      hasMore: false,
      serverTime: "server-2",
    });
    expect(await repository.getCursor(journeyA)).toEqual({ cursor: "cursor-2" });
    expect((await repository.get(id))?.amountMinor).toBe(30_100);

    await repository.applyHistoricalList(
      journeyA,
      [{ ...canonical(id), amountMinor: 30_000 }],
      "server-3",
    );
    expect(await repository.getCursor(journeyA)).toEqual({ cursor: "cursor-2" });
    expect((await repository.get(id))?.amountMinor).toBe(30_100);

    await repository.applyChanges(journeyA, {
      changes: [
        {
          entityType: "PERSONAL_SETTLEMENT_PAYMENT",
          entityId: id,
          revision: 3,
          isTombstone: true,
          aggregate: null,
        },
      ],
      cursor: "cursor-3",
      hasMore: false,
      serverTime: "server-4",
    });
    expect((await repository.listForJourney(journeyA, true))[0]).toMatchObject({
      revision: 3,
      deletedAt: expect.any(String),
    });
    sqlite.close();
  });
});
