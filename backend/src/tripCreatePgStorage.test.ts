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
          return {
            rows: query.includes("trip_create_finite_scope_allowed")
              ? [{ allowed: true }]
              : query.startsWith("SELECT")
                ? [{ result }]
                : [],
          };
        },
      }),
  };
  const storage = createTripPgStorage(connection);
  expect(await storage.create(actor, create)).toEqual(result);
  expect(await storage.receipt(actor, create.operationId)).toEqual(result);
  expect(sql).toEqual([
    "BEGIN",
    expect.stringContaining("trip_create_finite_scope_allowed"),
    expect.stringContaining("trip_create_command"),
    expect.stringContaining("trip_create_finite_scope_allowed"),
    "COMMIT",
    "BEGIN",
    expect.stringContaining("trip_create_finite_scope_allowed"),
    expect.stringContaining("trip_create_result"),
    expect.stringContaining("trip_create_finite_scope_allowed"),
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
          if (query.includes("trip_create_finite_scope_allowed"))
            return { rows: [{ allowed: true }] };
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
    expect.stringContaining("trip_create_finite_scope_allowed"),
    expect.stringContaining("trip_create_command"),
    "ROLLBACK",
  ]);
});

it.each([false, undefined])(
  "closed or absent finite scope rejects bootstrap before mutation",
  async (allowed) => {
    const sql: string[] = [];
    const connection: CorePgConnection = {
      withLease: async (work) =>
        work({
          retire: vi.fn(),
          query: async (q) => {
            sql.push(q);
            return { rows: [{ allowed }] };
          },
        }),
    };
    await expect(
      createTripPgStorage(connection).create(randomUUID(), input()),
    ).rejects.toMatchObject({ status: 503, code: "TRIP_CREATE_CLOSED" });
    expect(sql.some((q) => q.includes("trip_create_command"))).toBe(false);
    expect(sql.at(-1)).toBe("ROLLBACK");
  },
);
it("expiry during bootstrap rolls back rather than returning an accepted result", async () => {
  let checks = 0;
  const sql: string[] = [],
    actor = randomUUID(),
    request = input();
  const result = {
    ...request,
    actorAccountId: actor,
    ownerPersonId: randomUUID(),
    coreEpoch: randomUUID(),
    coreRevision: 1,
    coreAccessRevision: 1,
  };
  const connection: CorePgConnection = {
    withLease: async (work) =>
      work({
        retire: vi.fn(),
        query: async (q) => {
          sql.push(q);
          return {
            rows: q.includes("trip_create_finite_scope_allowed")
              ? [{ allowed: ++checks === 1 }]
              : q.includes("trip_create_command")
                ? [{ result }]
                : [],
          };
        },
      }),
  };
  await expect(
    createTripPgStorage(connection).create(actor, request),
  ).rejects.toMatchObject({ status: 503, code: "TRIP_CREATE_CLOSED" });
  expect(sql.at(-1)).toBe("ROLLBACK");
  expect(sql).not.toContain("COMMIT");
});

it.each([
  "actorAccountId",
  "operationId",
  "tripId",
  "name",
  "destination",
  "startDate",
  "endDate",
])(
  "rejects mismatched %s inside the create transaction, before COMMIT",
  async (field) => {
    const request = input(),
      actor = randomUUID(),
      sql: string[] = [];
    const result = {
      ...request,
      actorAccountId: actor,
      ownerPersonId: randomUUID(),
      coreEpoch: randomUUID(),
      coreRevision: 1,
      coreAccessRevision: 1,
      [field]: field.endsWith("Id")
        ? randomUUID()
        : field.endsWith("Date")
          ? "2027-01-01"
          : "changed",
    };
    const connection: CorePgConnection = {
      withLease: (work) =>
        work({
          retire: vi.fn(),
          query: async (q) => {
            sql.push(q);
            return {
              rows: q.includes("trip_create_finite_scope_allowed")
                ? [{ allowed: true }]
                : q.startsWith("SELECT")
                  ? [{ result }]
                  : [],
            };
          },
        }),
    };
    await expect(
      createTripPgStorage(connection).create(actor, request),
    ).rejects.toMatchObject({ code: "TRIP_CREATE_RESULT_MISMATCH" });
    expect(sql.at(-1)).toBe("ROLLBACK");
    expect(sql).not.toContain("COMMIT");
  },
);

it.each(["actorAccountId", "operationId"])(
  "rejects mismatched receipt %s before COMMIT",
  async (field) => {
    const request = input(),
      actor = randomUUID(),
      sql: string[] = [];
    const result = {
      ...request,
      actorAccountId: actor,
      ownerPersonId: randomUUID(),
      coreEpoch: randomUUID(),
      coreRevision: 1,
      coreAccessRevision: 1,
      [field]: randomUUID(),
    };
    const connection: CorePgConnection = {
      withLease: (work) =>
        work({
          retire: vi.fn(),
          query: async (q) => {
            sql.push(q);
            return {
              rows: q.includes("trip_create_finite_scope_allowed")
                ? [{ allowed: true }]
                : q.startsWith("SELECT")
                  ? [{ result }]
                  : [],
            };
          },
        }),
    };
    await expect(
      createTripPgStorage(connection).receipt(actor, request.operationId),
    ).rejects.toMatchObject({ code: "TRIP_CREATE_RESULT_MISMATCH" });
    expect(sql.at(-1)).toBe("ROLLBACK");
    expect(sql).not.toContain("COMMIT");
  },
);

it("does not commit a missing create result", async () => {
  const sql: string[] = [];
  const connection: CorePgConnection = {
    withLease: (work) =>
      work({
        retire: vi.fn(),
        query: async (q) => {
          sql.push(q);
          return {
            rows: q.includes("trip_create_finite_scope_allowed")
              ? [{ allowed: true }]
              : q.startsWith("SELECT")
                ? [{ result: null }]
                : [],
          };
        },
      }),
  };
  await expect(
    createTripPgStorage(connection).create(randomUUID(), input()),
  ).rejects.toMatchObject({ code: "TRIP_CREATE_RESULT_INVALID" });
  expect(sql.at(-1)).toBe("ROLLBACK");
  expect(sql).not.toContain("COMMIT");
});
