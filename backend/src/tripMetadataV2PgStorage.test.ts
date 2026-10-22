import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createTripMetadataV2PgStorage } from "./tripMetadataV2PgStorage";
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
  expect(f.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
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
