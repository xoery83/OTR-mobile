import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrations } from "@/data/db/migrations";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { captureAccountScope } from "@/data/auth/accountRequestContext";
import {
  createLedgerReadRepository,
  type LedgerReadDatabase,
} from "./ledgerReadRepository";
import { createLedgerReportingRepository } from "./ledgerReportingRepository";
import type { MyLedgerResponse } from "@/data/api/ledgerReadContracts";

const journey = "10000000-0000-4000-8000-000000000001";
const response: MyLedgerResponse = {
  period: "ALL",
  from: null,
  to: null,
  serverTime: "2026-10-09T00:00:00Z",
  journeys: [
    {
      journeyId: journey,
      title: "Eligible",
      startDate: null,
      endDate: null,
      currency: "NZD",
      scale: 2,
      mySpendMinor: 0,
      paidMinor: 0,
      positionMinor: 0,
      unvaluedCount: 0,
      conflictCount: 0,
      updatedAt: "2026-10-09T00:00:00Z",
    },
  ],
};
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of migrations) sqlite.exec(migration.sql);
  const account = { id: "A" };
  const getUser = async () => account.id;
  let boundary: "none" | "transaction" | "write" = "none";
  const aba = () => {
    account.id = "B";
    advanceAccountGeneration();
    account.id = "A";
    advanceAccountGeneration();
  };
  const db: LedgerReadDatabase = {
    async withTransactionAsync(task) {
      sqlite.exec("BEGIN");
      try {
        if (boundary === "transaction") {
          boundary = "none";
          aba();
        }
        await task();
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    async runAsync(sql, ...params) {
      const result = sqlite.prepare(sql).run(...(params as unknown as never[]));
      if (boundary === "write") {
        boundary = "none";
        aba();
      }
      return result as never;
    },
    async getFirstAsync(sql, ...params) {
      return (sqlite.prepare(sql).get(...(params as unknown as never[])) ??
        null) as never;
    },
    async getAllAsync(sql, ...params) {
      return sqlite.prepare(sql).all(...(params as unknown as never[])) as never;
    },
  };
  return {
    sqlite,
    account,
    getUser,
    aba,
    setBoundary(value: typeof boundary) {
      boundary = value;
    },
    reads: createLedgerReadRepository(db, getUser),
    reports: createLedgerReportingRepository(db, getUser),
  };
}
describe("Account summary and selection transaction fence", () => {
  it.each(["before", "transaction", "write"] as const)(
    "rolls back stale A→B→A summaries at %s apply boundary",
    async (boundary) => {
      const f = fixture();
      try {
        const context = await captureAccountScope(f.getUser);
        if (boundary === "before") f.aba();
        else f.setBoundary(boundary);
        await expect(f.reads.cacheMyLedger(response, context)).rejects.toThrow(
          "Account changed",
        );
        expect(
          f.sqlite.prepare("SELECT * FROM ledger_my_journey_summaries").all(),
        ).toEqual([]);
        expect(f.sqlite.prepare("PRAGMA integrity_check").get()?.integrity_check).toBe(
          "ok",
        );
        expect(f.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      } finally {
        f.sqlite.close();
      }
    },
  );
  it.each(["transaction", "write"] as const)(
    "rolls back stale selected Journey at %s boundary",
    async (boundary) => {
      const f = fixture();
      try {
        await f.reads.cacheMyLedger(response, await captureAccountScope(f.getUser));
        const context = await captureAccountScope(f.getUser);
        f.setBoundary(boundary);
        await expect(f.reports.selectJourney(journey, context)).rejects.toThrow(
          "Account changed",
        );
        expect(await f.reports.getSelectedJourneyId()).toBeNull();
        expect(f.sqlite.prepare("SELECT * FROM account_local_state").all()).toEqual([]);
      } finally {
        f.sqlite.close();
      }
    },
  );
  it("binds writes and selections to captured Account and forbids another Account's summary", async () => {
    const f = fixture();
    try {
      await f.reads.cacheMyLedger(response, await captureAccountScope(f.getUser));
      await f.reports.selectJourney(journey);
      f.account.id = "B";
      advanceAccountGeneration();
      expect(await f.reports.listJourneys()).toEqual([]);
      await expect(f.reports.selectJourney(journey)).rejects.toThrow("not available");
      expect(await f.reports.getSelectedJourneyId()).toBeNull();
      await f.reads.cacheMyLedger(
        { ...response, journeys: [] },
        await captureAccountScope(f.getUser),
      );
      f.account.id = "A";
      advanceAccountGeneration();
      expect(await f.reports.listJourneys()).toHaveLength(1);
      expect(await f.reports.getSelectedJourneyId()).toBe(journey);
      expect(f.sqlite.prepare("PRAGMA integrity_check").get()?.integrity_check).toBe(
        "ok",
      );
    } finally {
      f.sqlite.close();
    }
  });
});

it.each(["B", "ABA"])(
  "F5: original remote scope rejects delayed %s summary and spending facts",
  async (destination) => {
    const f = fixture();
    try {
      const scope = await captureAccountScope(f.getUser);
      const remote = {
        ...response,
        spendingFacts: [
          {
            expenseId: "20000000-0000-4000-8000-000000000001",
            revision: 1,
            journeyId: journey,
            category: "food",
            economicDate: "2026-10-09",
            occurredAt: "2026-10-09T00:00:00Z",
            status: "ACCEPTED" as const,
            hasOpenConflict: false,
            originalCurrency: "NZD",
            originalScale: 2,
            personalSplitMinor: 42,
          },
        ],
      };
      if (destination === "ABA") f.aba();
      else {
        f.account.id = "B";
        advanceAccountGeneration();
      }
      await expect(f.reads.cacheMyLedger(remote, scope)).rejects.toThrow(
        "Account changed",
      );
      expect(f.sqlite.prepare("SELECT * FROM ledger_my_journey_summaries").all()).toEqual(
        [],
      );
      expect(f.sqlite.prepare("SELECT * FROM ledger_my_spending_facts").all()).toEqual(
        [],
      );
    } finally {
      f.sqlite.close();
    }
  },
);
it("F5: missing runtime scope cannot adopt a response under the current Account", async () => {
  const f = fixture();
  try {
    // Older JS callers must fail closed even without TypeScript checking.
    await expect(
      Reflect.apply(f.reads.cacheMyLedger, undefined, [response]),
    ).rejects.toThrow("Captured Account scope is required");
    expect(await f.reads.listMyLedgerSummaries("ALL")).toEqual([]);
  } finally {
    f.sqlite.close();
  }
});
