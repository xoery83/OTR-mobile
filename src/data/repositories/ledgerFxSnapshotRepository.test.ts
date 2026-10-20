import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { migrations } from "../db/migrations";
import {
  createLedgerFxSnapshotRepository,
  type LedgerFxSnapshotDatabase,
} from "./ledgerFxSnapshotRepository";

function adapter(sqlite: DatabaseSync): LedgerFxSnapshotDatabase {
  return {
    async withTransactionAsync(task) {
      await task();
    },
    async runAsync(sql, ...params) {
      sqlite.prepare(sql).run(...(params as unknown as []));
      return {} as never;
    },
    async getAllAsync<T>(sql: string, ...params: unknown[]) {
      return sqlite.prepare(sql).all(...(params as unknown as [])) as T[];
    },
  };
}

describe("account-scoped FX snapshot cache", () => {
  it("survives repository recreation and stays isolated by account", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      for (const migration of migrations) sqlite.exec(migration.sql);
      let activeUser = "user-a";
      const bundle = {
        provider: "ECB" as const,
        policyVersion: "ECB_LOCAL_SNAPSHOT_V1" as const,
        baseCurrency: "EUR" as const,
        snapshots: [
          {
            referenceDate: "2026-09-23",
            rates: { EUR: "1", ISK: "143.8", NZD: "1.9821" },
            observedAt: "2026-09-24T00:00:00.000Z",
            expiresAt: "2026-10-24T00:00:00.000Z",
          },
        ],
        sourceReference: "https://www.ecb.europa.eu/",
        providerReference: "https://api.frankfurter.dev/v2/providers/ecb/rates",
      };
      await createLedgerFxSnapshotRepository(
        adapter(sqlite),
        async () => activeUser,
      ).cacheBundle(bundle);

      expect(
        await createLedgerFxSnapshotRepository(
          adapter(sqlite),
          async () => activeUser,
        ).list(),
      ).toEqual(bundle);
      activeUser = "user-b";
      expect(
        await createLedgerFxSnapshotRepository(
          adapter(sqlite),
          async () => activeUser,
        ).list(),
      ).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it("retains only the newest 32 reference dates", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      for (const migration of migrations) sqlite.exec(migration.sql);
      const repository = createLedgerFxSnapshotRepository(
        adapter(sqlite),
        async () => "user-a",
      );
      const common = {
        provider: "ECB" as const,
        policyVersion: "ECB_LOCAL_SNAPSHOT_V1" as const,
        baseCurrency: "EUR" as const,
        sourceReference: "https://www.ecb.europa.eu/",
        providerReference: "https://api.frankfurter.dev/v2/providers/ecb/rates",
      };
      await repository.cacheBundle({
        ...common,
        snapshots: [
          {
            referenceDate: "2026-08-01",
            rates: { EUR: "1", NZD: "1.9" },
            observedAt: "2026-09-24T00:00:00.000Z",
            expiresAt: "2026-10-24T00:00:00.000Z",
          },
        ],
      });
      await repository.cacheBundle({
        ...common,
        snapshots: Array.from({ length: 32 }, (_, index) => {
          const date = new Date("2026-09-24T00:00:00.000Z");
          date.setUTCDate(date.getUTCDate() - index);
          return {
            referenceDate: date.toISOString().slice(0, 10),
            rates: { EUR: "1", NZD: "1.9" },
            observedAt: "2026-09-24T00:00:00.000Z",
            expiresAt: "2026-10-24T00:00:00.000Z",
          };
        }),
      });

      const cached = await repository.list();
      expect(cached?.snapshots).toHaveLength(32);
      expect(cached?.snapshots.at(-1)?.referenceDate).toBe("2026-08-24");
    } finally {
      sqlite.close();
    }
  });
});
