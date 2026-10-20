import { expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { readFoundationDiagnostics } from "./foundationDiagnostics";
const fixture = vi.hoisted(() => ({
  account: "account-a",
  switchDuringRead: false,
  queries: [] as { query: string; params: unknown[] }[],
}));
vi.mock("expo-network", () => ({
  getNetworkStateAsync: async () => ({ isInternetReachable: false }),
}));
vi.mock("@/data/auth/authRepository", () => ({
  readAdoptedLocalSession: async () => ({
    identity: { userId: fixture.account },
    trustExpiresAt: "2099-01-01T00:00:00.000Z",
  }),
}));
vi.mock("@/data/operations/ledgerMaintenance", () => ({
  readLedgerSupportDiagnostics: async () => ({
    databaseBytes: 1,
    receiptBytes: 0,
    reviewCounts: {},
  }),
}));
vi.mock("@/data/db/migrationRunner", () => ({ getSchemaVersion: async () => 50 }));
vi.mock("@/data/db/database", () => ({
  openDatabase: () => {
    throw new Error("OPEN_FORBIDDEN");
  },
  readInitializedDatabase: async () => ({
    async getFirstAsync(query: string, ...params: unknown[]) {
      fixture.queries.push({ query, params });
      if (fixture.switchDuringRead) {
        fixture.switchDuringRead = false;
        advanceAccountGeneration();
        advanceAccountGeneration();
      }
      return { pending: 3, itinerary: 1 };
    },
    getAllAsync: () => {
      throw new Error("UNEXPECTED_READ");
    },
    runAsync: () => {
      throw new Error("WRITE_FORBIDDEN");
    },
  }),
}));
it("foundation counts use SELECT only and never wake/refresh/migrate", async () => {
  fixture.queries = [];
  const result = await readFoundationDiagnostics();
  expect(result.pendingSyncCount).toBe(3);
  expect(result.pendingItineraryCreateCount).toBe(1);
  expect(fixture.queries).toHaveLength(1);
  expect(fixture.queries[0].params).toEqual([fixture.account]);
  expect(fixture.queries[0].query).toContain("SELECT COUNT(*)");
});
it("foundation drops A→B→A observations despite same final Account ID", async () => {
  fixture.switchDuringRead = true;
  await expect(readFoundationDiagnostics()).rejects.toThrow("Account changed");
});
