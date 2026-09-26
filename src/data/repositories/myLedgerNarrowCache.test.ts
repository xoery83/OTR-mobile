import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { MyLedgerResponse } from "@/data/api/ledgerReadContracts";
import { migrations } from "@/data/db/migrations";
import {
  createLedgerReadRepository,
  type LedgerReadDatabase,
} from "./ledgerReadRepository";
import { createLedgerReportingRepository } from "./ledgerReportingRepository";

const journeyId = "10000000-0000-4000-8000-000000000001";
const expenseId = "20000000-0000-4000-8000-000000000001";
const fact = {
  expenseId,
  revision: 1,
  journeyId,
  category: "food",
  economicDate: "2026-09-20",
  occurredAt: "2025-12-20T00:00:00Z",
  status: "ACCEPTED" as const,
  hasOpenConflict: false,
  originalCurrency: "NZD",
  originalScale: 2,
  personalSplitMinor: 40,
};

function response(period: "YEAR" | "ALL", serverTime: string): MyLedgerResponse {
  return {
    period,
    from: period === "YEAR" ? "2026-01-01T00:00:00Z" : null,
    to: period === "YEAR" ? "2026-09-26T00:00:00Z" : null,
    journeys: [
      {
        journeyId,
        title: "Journey",
        startDate: null,
        endDate: null,
        currency: "NZD",
        scale: 2,
        mySpendMinor: 0,
        paidMinor: 0,
        positionMinor: 0,
        unvaluedCount: 0,
        conflictCount: 0,
        updatedAt: serverTime,
      },
    ],
    spendingFacts: [fact],
    serverTime,
  };
}

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE ledger_my_journey_summaries (
    user_id TEXT, journey_id TEXT, period_key TEXT, from_at TEXT, to_at TEXT,
    title TEXT, start_date TEXT, end_date TEXT, currency TEXT, scale INTEGER,
    my_spend_minor INTEGER, paid_minor INTEGER, position_minor INTEGER,
    unvalued_count INTEGER, conflict_count INTEGER, updated_at TEXT,
    PRIMARY KEY (user_id, journey_id, period_key));`);
  sqlite.exec(migrations.find((migration) => migration.id === 37)!.sql);
  const database: LedgerReadDatabase = {
    async getAllAsync<T>(sql: string, ...args: unknown[]) {
      return sqlite.prepare(sql).all(...(args as unknown as never[])) as T[];
    },
    async getFirstAsync<T>(sql: string, ...args: unknown[]) {
      return (
        (sqlite.prepare(sql).get(...(args as unknown as never[])) as T | undefined) ??
        null
      );
    },
    async runAsync(sql: string, ...args: unknown[]) {
      sqlite.prepare(sql).run(...(args as unknown as never[]));
      return {} as never;
    },
    async withTransactionAsync(task) {
      sqlite.exec("BEGIN");
      try {
        await task();
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  let account = "account-a";
  const active = async () => account;
  return {
    sqlite,
    writer: createLedgerReadRepository(database, active),
    reader: createLedgerReportingRepository(database, active),
    setAccount: (value: string) => {
      account = value;
    },
  };
}

describe("My Ledger narrow cache", () => {
  it("isolates accounts and periods, replaces revisions, and ignores older refreshes", async () => {
    const cache = setup();
    await cache.writer.cacheMyLedger(response("YEAR", "2026-09-26T00:00:00Z"));
    await cache.writer.cacheMyLedger(response("ALL", "2026-09-26T00:00:00Z"));
    expect(await cache.reader.listMyLedgerSpendingFacts("YEAR")).toHaveLength(1);
    const newer = response("YEAR", "2026-09-26T00:01:00Z");
    newer.spendingFacts![0] = { ...fact, revision: 2, personalSplitMinor: 70 };
    await cache.writer.cacheMyLedger(newer);
    await cache.writer.cacheMyLedger(response("YEAR", "2026-09-26T00:00:00Z"));
    expect((await cache.reader.listMyLedgerSpendingFacts("YEAR"))[0]).toMatchObject({
      revision: 2,
      personalSplitMinor: 70,
    });
    expect((await cache.reader.listMyLedgerSpendingFacts("ALL"))[0]).toMatchObject({
      revision: 1,
      personalSplitMinor: 40,
    });
    cache.setAccount("account-b");
    expect(await cache.reader.listMyLedgerSpendingFacts("YEAR")).toEqual([]);
    expect(await cache.reader.hasMyLedgerSpendingSnapshot("YEAR")).toBe(false);
    await cache.writer.cacheMyLedger({
      ...response("YEAR", "2026-09-26T00:02:00Z"),
      spendingFacts: [],
    });
    expect(await cache.reader.hasMyLedgerSpendingSnapshot("YEAR")).toBe(true);
    cache.setAccount("account-a");
    expect(await cache.reader.listMyLedgerSpendingFacts("YEAR")).toHaveLength(1);
  });

  it("keeps facts for an older compatible response and refuses a fact outside its Journey set", async () => {
    const cache = setup();
    const first = response("YEAR", "2026-09-26T00:00:00Z");
    await cache.writer.cacheMyLedger(first);
    await cache.writer.cacheMyLedger({
      ...first,
      serverTime: "2026-09-26T00:01:00Z",
      spendingFacts: undefined,
    });
    expect(await cache.reader.listMyLedgerSpendingFacts("YEAR")).toHaveLength(1);
    await expect(
      cache.writer.cacheMyLedger({
        ...response("YEAR", "2026-09-26T00:02:00Z"),
        journeys: [],
      }),
    ).rejects.toThrow("outside authorized response");
    expect(await cache.reader.listMyLedgerSpendingFacts("YEAR")).toHaveLength(1);
    cache.sqlite.close();
  });
});
