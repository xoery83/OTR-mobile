import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  createTripMetadataV2PgStorage,
  withTripMetadataV2PgStorageOnTransaction,
} from "./tripMetadataV2PgStorage";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
const actor = randomUUID(),
  tripId = randomUUID(),
  operationId = randomUUID();
const before = { name: "Before", destination: null, startDate: null, endDate: null };
const request = {
  formatVersion: 2 as const,
  tripId,
  operationId,
  before,
  after: { ...before, name: "After" },
  expectedMetadataRevision: 1,
};
const result = { ...request, actorAccountId: actor, resultMetadataRevision: 2 };
function fixture(value: unknown = result, scope = true) {
  const query = vi.fn(async (sql: string, _params?: readonly unknown[]) => ({
    rows: sql.includes("finite_scope_allowed")
      ? [{ allowed: scope }]
      : sql.startsWith("SELECT")
        ? [{ result: value }]
        : [],
  }));
  const connection: CorePgConnection = {
    withLease: async (work) => work({ query, retire: vi.fn() }),
  };
  return { query, storage: createTripMetadataV2PgStorage(connection) };
}
it("uses the dedicated Edit finite predicate and exact operation/actor parameter order", async () => {
  const f = fixture();
  expect(await f.storage.update(actor, request)).toEqual(result);
  expect(f.query.mock.calls[1]).toEqual([
    expect.stringContaining("trip_metadata_finite_scope_allowed"),
    [actor, tripId, operationId],
  ]);
  expect(f.query.mock.calls[2]).toEqual([
    expect.stringContaining("trip_metadata_update_command"),
    [operationId, actor, tripId, JSON.stringify(request)],
  ]);
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
    "BEGIN",
    expect.stringContaining("trip_metadata_finite_scope_allowed"),
    expect.stringContaining("trip_metadata_update_command"),
    expect.stringContaining("trip_metadata_finite_scope_allowed"),
    "COMMIT",
  ]);
  f.query.mockClear();
  expect(await f.storage.receipt(actor, operationId)).toEqual(result);
  expect(f.query.mock.calls[2]).toEqual([
    expect.stringContaining("trip_metadata_update_result"),
    [operationId, actor],
  ]);
});
it("closed scope cannot execute a command and rolls back", async () => {
  const f = fixture(result, false);
  await expect(f.storage.update(actor, request)).rejects.toMatchObject({
    code: "TRIP_METADATA_CLOSED",
  });
  expect(f.query.mock.calls.some(([sql]) => sql.includes("update_command"))).toBe(false);
  expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
});
it("validates receipt before commit, rejects wrong account or unsafe revision", async () => {
  for (const wrong of [
    { ...result, actorAccountId: randomUUID() },
    { ...result, resultMetadataRevision: 9007199254740992 },
  ]) {
    const f = fixture(wrong);
    await expect(f.storage.update(actor, request)).rejects.toBeDefined();
    expect(f.query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  }
});
it("returns absent original receipt without a create, and independently validates snapshot", async () => {
  const f = fixture(null);
  expect(await f.storage.receipt(actor, operationId)).toBeNull();
  const g = fixture({
    formatVersion: 2,
    actorAccountId: actor,
    tripId,
    metadataRevision: 1,
    metadata: before,
  });
  expect(await g.storage.snapshot(actor, tripId, operationId)).toMatchObject({
    metadataRevision: 1,
  });
});

function heldFixture(value: unknown = result, allowed = true) {
  const f = fixture(value, allowed),
    retire = vi.fn();
  return { ...f, retire, lease: { query: f.query, retire } };
}
it("uses caller-held update/receipt/snapshot without inner transaction control", async () => {
  const f = heldFixture();
  const query = f.lease.query;
  f.lease.query = vi.fn(async (sql, params) =>
    sql.includes("trip_metadata_snapshot")
      ? {
          rows: [
            {
              result: {
                formatVersion: 2,
                actorAccountId: actor,
                tripId,
                metadataRevision: 1,
                metadata: before,
              },
            },
          ],
        }
      : query(sql, params),
  );
  await withTripMetadataV2PgStorageOnTransaction(f.lease, async (port) => {
    expect(await port.update(actor, request)).toEqual(result);
    expect(await port.receipt(actor, operationId)).toEqual(result);
    expect(await port.snapshot(actor, tripId, operationId)).toMatchObject({
      metadataRevision: 1,
    });
  });
  expect(f.lease.query.mock.calls).toHaveLength(9);
  expect(f.lease.query.mock.calls.every(([sql]) => sql.startsWith("SELECT"))).toBe(true);
  expect(f.retire).not.toHaveBeenCalled();
});
it("retires on caught result mismatch and refuses later dispatch", async () => {
  const f = heldFixture({ ...result, actorAccountId: randomUUID() });
  await expect(
    withTripMetadataV2PgStorageOnTransaction(f.lease, async (port) => {
      await port.update(actor, request).catch(() => undefined);
      await expect(port.receipt(actor, operationId)).rejects.toThrow(
        "TRIP_METADATA_TRANSACTION_FAILED",
      );
    }),
  ).rejects.toThrow("TRIP_METADATA_RESULT_MISMATCH");
  expect(f.query).toHaveBeenCalledTimes(2);
  expect(f.retire).toHaveBeenCalledOnce();
});
it("keeps a closed metadata principal/scope closed before command dispatch", async () => {
  const f = heldFixture(result, false);
  await expect(
    withTripMetadataV2PgStorageOnTransaction(f.lease, (port) =>
      port.update(actor, request),
    ),
  ).rejects.toThrow("TRIP_METADATA_CLOSED");
  expect(f.query).toHaveBeenCalledTimes(1);
  expect(f.retire).toHaveBeenCalledOnce();
});
it("rechecks the finite scope after command execution before allowing caller success", async () => {
  const f = heldFixture();
  let checks = 0;
  f.query.mockImplementation(async (sql) => ({
    rows: sql.includes("finite_scope_allowed")
      ? [{ allowed: ++checks === 1 }]
      : [{ result }],
  }));
  await expect(
    withTripMetadataV2PgStorageOnTransaction(f.lease, (port) =>
      port.update(actor, request),
    ),
  ).rejects.toThrow("TRIP_METADATA_CLOSED");
  expect(checks).toBe(2);
  expect(f.retire).toHaveBeenCalledOnce();
});
it("tracks pre-SQL invalid CAS input even when caught", async () => {
  const f = heldFixture();
  await expect(
    withTripMetadataV2PgStorageOnTransaction(f.lease, async (port) => {
      await port
        .update(actor, { ...request, expectedMetadataRevision: -1 })
        .catch(() => undefined);
    }),
  ).rejects.toThrow("TRIP_METADATA_UNAVAILABLE");
  expect(f.query).not.toHaveBeenCalled();
  expect(f.retire).toHaveBeenCalledOnce();
});
it("pins update fields/revision before caller mutation", async () => {
  const f = heldFixture(),
    input = structuredClone(request);
  await withTripMetadataV2PgStorageOnTransaction(f.lease, async (port) => {
    const pending = port.update(actor, input);
    input.after.name = "Changed";
    input.expectedMetadataRevision = 99;
    expect(await pending).toEqual(result);
  });
  expect(
    JSON.parse(
      String(
        f.query.mock.calls.find(([sql]) => sql.includes("update_command"))?.[1]?.[3],
      ),
    ),
  ).toEqual(request);
});
it("retains the first overlap failure after the first pending operation is retired", async () => {
  const f = heldFixture();
  await expect(
    withTripMetadataV2PgStorageOnTransaction(f.lease, async (port) => {
      const first = port.update(actor, request);
      await port.snapshot(actor, tripId, operationId).catch(() => undefined);
      await first;
    }),
  ).rejects.toThrow("TRIP_METADATA_TRANSACTION_BUSY");
  expect(f.retire).toHaveBeenCalledOnce();
});
it("rejects unawaited methods and blocks late query continuation", async () => {
  const f = heldFixture();
  let pending!: Promise<unknown>;
  await expect(
    withTripMetadataV2PgStorageOnTransaction(f.lease, async (port) => {
      pending = port.update(actor, request);
    }),
  ).rejects.toThrow("TRIP_METADATA_TRANSACTION_WORK_PENDING");
  await expect(pending).rejects.toThrow("TRIP_METADATA_TRANSACTION_RELEASED");
  expect(f.query).toHaveBeenCalledTimes(1);
  expect(f.retire).toHaveBeenCalledOnce();
});
it("poisons synchronously on escaped use before a caller can commit", async () => {
  const f = heldFixture();
  let escaped!: Parameters<
    Parameters<typeof withTripMetadataV2PgStorageOnTransaction>[1]
  >[0];
  let retired = false;
  f.retire.mockImplementation(() => {
    retired = true;
  });
  const query = f.lease.query;
  f.lease.query = vi.fn(async (sql, params) => {
    if (retired) throw Error("LEASE_RETIRED");
    return query(sql, params);
  });
  await withTripMetadataV2PgStorageOnTransaction(f.lease, async (port) => {
    escaped = port;
  });
  const pending = escaped.receipt(actor, operationId);
  expect(retired).toBe(true);
  const commit = f.lease.query("COMMIT");
  await expect(pending).rejects.toThrow("TRIP_METADATA_TRANSACTION_RELEASED");
  await expect(commit).rejects.toThrow("LEASE_RETIRED");
  expect(query).not.toHaveBeenCalled();
});
