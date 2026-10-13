import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import { createTripPgStorage } from "./tripCreatePgStorage";

const input = () => ({
  operationId: randomUUID(),
  tripId: randomUUID(),
  name: "Coast",
  destination: null,
  startDate: null,
  endDate: null,
});
it("uses one owning lease and explicit transaction for create and receipt lookup", async () => {
  const create = input(),
    actor = randomUUID();
  const result = {
    ...create,
    actorAccountId: actor,
    ownerPersonId: randomUUID(),
    coreEpoch: randomUUID(),
    coreRevision: 1,
    coreAccessRevision: 1,
  };
  const sql: string[] = [];
  const connection: CorePgConnection = {
    withLease: async (work) =>
      work({
        retire: vi.fn(),
        query: async (query) => {
          sql.push(query);
          return { rows: query.startsWith("SELECT") ? [{ result }] : [] };
        },
      }),
  };
  const storage = createTripPgStorage(connection);
  expect(await storage.create(actor, create)).toEqual(result);
  expect(await storage.receipt(actor, create.operationId)).toEqual(result);
  expect(sql).toEqual([
    "BEGIN",
    expect.stringContaining("trip_create_command"),
    "COMMIT",
    "BEGIN",
    expect.stringContaining("trip_create_result"),
    "COMMIT",
  ]);
});
it("rolls back SQL collision and maps it to a bounded response", async () => {
  const sql: string[] = [];
  const connection: CorePgConnection = {
    withLease: async (work) =>
      work({
        retire: vi.fn(),
        query: async (query) => {
          sql.push(query);
          if (query.startsWith("SELECT"))
            throw Object.assign(new Error("private"), { code: "23505" });
          return { rows: [] };
        },
      }),
  };
  await expect(
    createTripPgStorage(connection).create(randomUUID(), input()),
  ).rejects.toMatchObject({
    status: 409,
    code: "TRIP_CREATE_COLLISION",
  });
  expect(sql).toEqual([
    "BEGIN",
    expect.stringContaining("trip_create_command"),
    "ROLLBACK",
  ]);
});
