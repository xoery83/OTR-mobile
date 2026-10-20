import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { migrations } from "../db/migrations";
import {
  createLedgerExpenseRepository,
  type LedgerExpenseDatabase,
} from "./ledgerExpenseRepository";

describe("B2 offline quote cache isolation", () => {
  it("reads a cached candidate only for the current authorized account and Journey", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      for (const migration of migrations) sqlite.exec(migration.sql);
      const database: LedgerExpenseDatabase = {
        async withTransactionAsync(task) {
          await task();
        },
        async runAsync(sql, ...params) {
          sqlite.prepare(sql).run(...(params as unknown as []));
          return {} as never;
        },
        async getFirstAsync<T>(sql: string, ...params: unknown[]) {
          return (sqlite.prepare(sql).get(...(params as unknown as [])) ??
            null) as T | null;
        },
        async getAllAsync<T>(sql: string, ...params: unknown[]) {
          return sqlite.prepare(sql).all(...(params as unknown as [])) as T[];
        },
      };
      sqlite.exec(`INSERT INTO ledger_actor_context
        (user_id, journey_id, member_id, role, capabilities_json, updated_at)
        VALUES ('user-a', 'journey-a', 'member-a', 'owner', '{}', '2026-09-17')`);
      let activeUser = "user-a";
      const repo = createLedgerExpenseRepository(database, async () => activeUser);
      await repo.cacheRateQuote({
        id: "quote-a",
        journeyId: "journey-a",
        quoteCurrency: "EUR",
        baseCurrency: "NZD",
        decimalRate: "1.9808",
        effectiveDate: "2026-07-10",
        economicDate: "2026-07-12",
        referenceDate: "2026-07-10",
        policyVersion: "ECB_DAILY_V1",
        observedAt: "2026-09-17T00:00:00Z",
        provider: "ECB",
        providerReference: "source",
        sourceReference: "https://www.ecb.europa.eu/",
        expiresAt: "2026-10-17T00:00:00Z",
      });
      expect(await repo.listRateQuotes("journey-a", "EUR", "NZD")).toMatchObject([
        { economicDate: "2026-07-12", referenceDate: "2026-07-10" },
      ]);
      activeUser = "user-b";
      expect(await repo.listRateQuotes("journey-a", "EUR", "NZD")).toEqual([]);
      expect(await repo.listRateQuotes("journey-b", "EUR", "NZD")).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});
