import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadTtrLabTestDriver } from "./ttrLabTestDriver";
import { openTtrLabSelectionRepository } from "./ttrLabSelectionRepository";
import { getAccountGeneration } from "../auth/accountGeneration";
import { ttrFixture } from "@/domain/trip/__fixtures__/ttr";

vi.mock("expo-sqlite", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  return {
    openDatabaseAsync: vi.fn(async () => {
      const sql = new DatabaseSync(":memory:");
      return {
        async getFirstAsync<T>(query: string, ...values: never[]) {
          return (sql.prepare(query).get(...values) ?? null) as T | null;
        },
        async getAllAsync<T>(query: string, ...values: never[]) {
          return sql.prepare(query).all(...values) as T[];
        },
        async runAsync(query: string, ...values: never[]) {
          return sql.prepare(query).run(...values) as never;
        },
        async execAsync(query: string) {
          sql.exec(query);
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
        async closeAsync() {
          sql.close();
        },
      };
    }),
  };
});
beforeEach(() => vi.stubGlobal("__DEV__", true));
afterEach(() => vi.unstubAllGlobals());
it("injects one selection failure inside the accepted transaction, retaining the prior durable mode", async () => {
  const input = ttrFixture();
  input.scope.generation = getAccountGeneration();
  input.expiry = { eventDate: "2027-01-15", zone: "UTC" };
  const context = {
    accountId: input.scope.accountId,
    tripId: input.scope.tripId,
    generation: input.scope.generation,
  };
  let fail = false;
  const handle = await openTtrLabSelectionRepository(
    {
      source: "SYNTHETIC_TTR_LAB",
      authorized: () => true,
      context: () => context,
      clock: () => ({ instant: "2027-01-14T12:00:00Z", certain: true }),
      isCurrentRelation: async () => true,
    },
    loadTtrLabTestDriver(() => {
      const consume = fail;
      fail = false;
      return consume;
    }),
  );
  try {
    const relation = { input, accessRevision: 1, publicationVersion: 0 };
    await handle.repository.confirm(context, relation, "walking");
    fail = true;
    await expect(handle.repository.confirm(context, relation, "driving")).rejects.toThrow(
      "G2_LAB_INJECTED_WRITE_FAILURE",
    );
    expect((await handle.repository.read(context, relation))?.mode).toBe("walking");
    await handle.repository.confirm(context, relation, "transit");
    expect((await handle.repository.read(context, relation))?.mode).toBe("transit");
  } finally {
    await handle.close();
  }
});
it("rejects loading native test storage in Release", async () => {
  vi.stubGlobal("__DEV__", false);
  await expect(loadTtrLabTestDriver(() => false)()).rejects.toThrow(
    "G2_TEST_DRIVER_DEV_ONLY",
  );
});
