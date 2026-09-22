import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import type { PersonalSettlementPaymentDto } from "@/data/api/ledgerSettlementContracts";
import { migrations } from "@/data/db/migrations";
import {
  createLedgerPersonalPaymentRepository,
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
