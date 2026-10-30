import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import {
  createTripPgStorage,
  createTripParentReceiptPgReader,
  withTripPgStorageOnTransaction,
} from "./tripCreatePgStorage";

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

function heldFixture() {
  const request = input(),
    actor = randomUUID();
  const result = {
    ...request,
    actorAccountId: actor,
    ownerPersonId: randomUUID(),
    coreEpoch: randomUUID(),
    coreRevision: 1,
    coreAccessRevision: 1,
  };
  const queries: string[] = [],
    retire = vi.fn();
  const lease = {
    retire,
    async query(sql: string) {
      queries.push(sql);
      return {
        rows: sql.includes("trip_create_finite_scope_allowed")
          ? [{ allowed: true }]
          : [{ result }],
      };
    },
  };
  return { request, actor, result, queries, lease, retire };
}
it("uses the held transaction without issuing inner transaction control", async () => {
  const f = heldFixture();
  await withTripPgStorageOnTransaction(f.lease, async (storage) => {
    expect(await storage.create(f.actor, f.request)).toEqual(f.result);
    expect(await storage.receipt(f.actor, f.request.operationId)).toEqual(f.result);
  });
  expect(f.queries).toHaveLength(6);
  expect(f.queries.every((sql) => sql.startsWith("SELECT"))).toBe(true);
  expect(f.retire).not.toHaveBeenCalled();
});
it("retires the caller transaction even if its validation failure was caught", async () => {
  const f = heldFixture();
  f.result.actorAccountId = randomUUID();
  await expect(
    withTripPgStorageOnTransaction(f.lease, async (storage) => {
      await storage.create(f.actor, f.request).catch(() => undefined);
    }),
  ).rejects.toThrow("TRIP_CREATE_RESULT_MISMATCH");
  expect(f.retire).toHaveBeenCalledOnce();
  expect(f.queries).toHaveLength(2);
});
it("does not expose an escaped held storage after callback return", async () => {
  const f = heldFixture();
  let escaped!: Parameters<Parameters<typeof withTripPgStorageOnTransaction>[1]>[0];
  await withTripPgStorageOnTransaction(f.lease, async (storage) => {
    escaped = storage;
  });
  await expect(escaped.create(f.actor, f.request)).rejects.toThrow(
    "TRIP_CREATE_TRANSACTION_RELEASED",
  );
  expect(f.queries).toHaveLength(0);
});
it("rejects pre-SQL validation failure without leaking private fields or permitting commit", async () => {
  const f = heldFixture();
  await expect(
    withTripPgStorageOnTransaction(f.lease, async (storage) => {
      await storage.create(f.actor, { ...f.request, name: "" }).catch(() => undefined);
    }),
  ).rejects.toThrow("TRIP_CREATE_UNAVAILABLE");
  expect(f.queries).toHaveLength(0);
  expect(f.retire).toHaveBeenCalledOnce();
});
it("rejects unawaited work and prevents its late query continuation", async () => {
  const f = heldFixture();
  let pending!: Promise<unknown>;
  await expect(
    withTripPgStorageOnTransaction(f.lease, async (storage) => {
      pending = storage.create(f.actor, f.request);
    }),
  ).rejects.toThrow("TRIP_CREATE_TRANSACTION_WORK_PENDING");
  await expect(pending).rejects.toThrow("TRIP_CREATE_TRANSACTION_RELEASED");
  expect(f.retire).toHaveBeenCalledOnce();
  expect(f.queries).toHaveLength(1);
});
it("rejects overlapping operations even if the second error was caught", async () => {
  const f = heldFixture();
  await expect(
    withTripPgStorageOnTransaction(f.lease, async (storage) => {
      const first = storage.create(f.actor, f.request);
      await storage.receipt(f.actor, f.request.operationId).catch(() => undefined);
      await first;
    }),
  ).rejects.toThrow("TRIP_CREATE_TRANSACTION_BUSY");
  expect(f.retire).toHaveBeenCalledOnce();
});
it("snapshots a request before caller mutation during held queries", async () => {
  const f = heldFixture();
  await withTripPgStorageOnTransaction(f.lease, async (storage) => {
    const pending = storage.create(f.actor, f.request);
    f.request.name = "changed after dispatch";
    expect(await pending).toEqual(f.result);
  });
  expect(f.retire).not.toHaveBeenCalled();
});

it("poisons a still-open caller transaction after a caught escaped-port failure", async () => {
  const f = heldFixture();
  let escaped!: Parameters<Parameters<typeof withTripPgStorageOnTransaction>[1]>[0];
  let closed = false;
  f.retire.mockImplementation(() => {
    closed = true;
  });
  const query = f.lease.query;
  f.lease.query = async (sql) => {
    if (closed) throw Error("LEASE_RETIRED");
    return query(sql);
  };
  await withTripPgStorageOnTransaction(f.lease, async (storage) => {
    escaped = storage;
    await storage.create(f.actor, f.request);
  });
  await escaped.receipt(f.actor, f.request.operationId).catch(() => undefined);
  expect(f.retire).toHaveBeenCalledOnce();
  await expect(f.lease.query("COMMIT")).rejects.toThrow("LEASE_RETIRED");
});

it("retires synchronously before a caller can commit after an unawaited escaped-port invocation", async () => {
  const f = heldFixture();
  let escaped!: Parameters<Parameters<typeof withTripPgStorageOnTransaction>[1]>[0];
  let closed = false;
  f.retire.mockImplementation(() => {
    closed = true;
  });
  const query = f.lease.query;
  f.lease.query = async (sql) => {
    if (closed) throw Error("LEASE_RETIRED");
    return query(sql);
  };
  await withTripPgStorageOnTransaction(f.lease, async (storage) => {
    escaped = storage;
  });
  const rejected = escaped.create(f.actor, f.request);
  expect(closed).toBe(true);
  const commit = f.lease.query("COMMIT");
  await expect(rejected).rejects.toThrow("TRIP_CREATE_TRANSACTION_RELEASED");
  await expect(commit).rejects.toThrow("LEASE_RETIRED");
  expect(f.queries).toHaveLength(0);
});
it("does not dispatch later operations after a caught failure poisoned the held transaction", async () => {
  const f = heldFixture();
  f.result.actorAccountId = randomUUID();
  await expect(
    withTripPgStorageOnTransaction(f.lease, async (storage) => {
      await storage.create(f.actor, f.request).catch(() => undefined);
      await expect(storage.receipt(f.actor, f.request.operationId)).rejects.toThrow(
        "TRIP_CREATE_TRANSACTION_FAILED",
      );
    }),
  ).rejects.toThrow("TRIP_CREATE_RESULT_MISMATCH");
  expect(f.queries).toHaveLength(2);
  expect(f.retire).toHaveBeenCalledOnce();
});

function parentReaderFixture() {
  const actor = randomUUID(),
    trip = randomUUID();
  const state = {
    result: {
      ...input(),
      tripId: trip,
      actorAccountId: actor,
      ownerPersonId: randomUUID(),
      coreEpoch: randomUUID(),
      coreRevision: 1,
      coreAccessRevision: 1,
      formatVersion: 2,
      destinations: [],
      metadataRevision: 0,
    } as Record<string, unknown> | null,
    allowed: true,
    error: null as string | null,
  };
  const retire = vi.fn();
  const query = vi.fn(async (sql: string, _parameters?: readonly unknown[]) => {
    if (sql.includes("trip_create_parent_result")) {
      if (state.error)
        throw Object.assign(Error("private fixture"), { code: state.error });
      return { rows: [{ result: state.result }] };
    }
    if (sql.includes("trip_create_finite_scope_allowed"))
      return { rows: [{ allowed: state.allowed }] };
    return { rows: [] };
  });
  const connection: CorePgConnection = {
    withLease: async (work) => work({ query, retire }),
  };
  return {
    actor,
    trip,
    state,
    query,
    retire,
    connection,
    read: createTripParentReceiptPgReader(connection),
  };
}
it("leaves default storage unwired and reads the parent on one owning lease with a final scope check", async () => {
  const f = parentReaderFixture();
  expect(createTripPgStorage(f.connection).parentReceipt).toBeUndefined();
  expect(f.query).not.toHaveBeenCalled();
  expect(await f.read(f.actor, f.trip)).toEqual(f.state.result);
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
    "BEGIN",
    expect.stringContaining("trip_create_parent_result"),
    expect.stringContaining("trip_create_finite_scope_allowed"),
    "COMMIT",
  ]);
  expect(f.query.mock.calls[1][1]).toEqual([f.actor, f.trip]);
  expect(f.query.mock.calls[2][1]).toEqual([
    f.actor,
    f.trip,
    f.state.result!.operationId,
  ]);
});
it.each(["scope", "actor", "trip", "closed", "permission"] as const)(
  "rolls back an unqualified parent read instead of returning a missing receipt: %s",
  async (kind) => {
    const f = parentReaderFixture();
    if (kind === "scope") f.state.allowed = false;
    if (kind === "actor") f.state.result!.actorAccountId = randomUUID();
    if (kind === "trip") f.state.result!.tripId = randomUUID();
    if (kind === "closed") f.state.error = "55000";
    if (kind === "permission") f.state.error = "42501";
    await expect(f.read(f.actor, f.trip)).rejects.toMatchObject({
      status: kind === "permission" ? 403 : 503,
    });
    expect(f.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
    expect(f.query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
  },
);
it("returns null only after an actual owning lookup returns null", async () => {
  const f = parentReaderFixture();
  f.state.result = null;
  expect(await f.read(f.actor, f.trip)).toBeNull();
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
    "BEGIN",
    expect.stringContaining("trip_create_parent_result"),
    "COMMIT",
  ]);
});
