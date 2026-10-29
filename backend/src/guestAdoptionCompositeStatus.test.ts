import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createGuestAdoptionCompositeStatus } from "./guestAdoptionCompositeStatus";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
function fixture(found: unknown = true) {
  const input = {
    contractVersion: 1 as const,
    adoptionId: randomUUID(),
    sourceGuestLocalId: randomUUID(),
    targetAccountId: randomUUID(),
    inventorySha256: "a".repeat(64),
  };
  const query = vi.fn(async (_sql: string, _parameters?: readonly unknown[]) => ({
    rows: [{ found }],
  }));
  const connection: CorePgConnection = {
    withLease: async (work) => work({ retire: vi.fn(), query }),
  };
  return { input, query, connection, signal: new AbortController().signal };
}
it.each([true, false])(
  "reads private stage existence %s without inferring terminal outcome",
  async (found) => {
    const f = fixture(found);
    const result = await createGuestAdoptionCompositeStatus(f.connection).readStatus(
      f.input.targetAccountId,
      f.input,
      f.signal,
    );
    expect(result).toEqual({
      ...f.input,
      status: found ? "IN_PROGRESS" : "NOT_FOUND",
      nextAction: "QUERY_SERVER_STATUS",
    });
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining("actor_account_id=$2::uuid"),
      [
        f.input.adoptionId,
        f.input.targetAccountId,
        f.input.sourceGuestLocalId,
        f.input.inventorySha256,
      ],
    );
    expect(
      f.query.mock.calls.find(([sql]) => sql.startsWith("SELECT"))![0],
    ).not.toContain("plan_text");
  },
);
it("rejects a mismatched actor before reading private storage", async () => {
  const f = fixture();
  await expect(
    createGuestAdoptionCompositeStatus(f.connection).readStatus(
      randomUUID(),
      f.input,
      f.signal,
    ),
  ).rejects.toThrow("TARGET_MISMATCH");
  expect(f.query).not.toHaveBeenCalled();
});
it.each([undefined, "true", 1])(
  "refuses unverifiable storage result %s",
  async (value) => {
    const f = fixture(value);
    // Explicit undefined must not select the fixture's default true.
    f.query.mockResolvedValue({ rows: [{ found: value }] });
    await expect(
      createGuestAdoptionCompositeStatus(f.connection).readStatus(
        f.input.targetAccountId,
        f.input,
        f.signal,
      ),
    ).rejects.toThrow("UNVERIFIED");
  },
);
it("pins metadata before an awaited lease and discards a cancelled read", async () => {
  const f = fixture(),
    original = { ...f.input },
    controller = new AbortController();
  const connection: CorePgConnection = {
    withLease: async (work) => {
      f.input.inventorySha256 = "b".repeat(64);
      const result = await f.connection.withLease(work);
      controller.abort();
      return result;
    },
  };
  await expect(
    createGuestAdoptionCompositeStatus(connection).readStatus(
      original.targetAccountId,
      f.input,
      controller.signal,
    ),
  ).rejects.toThrow("CANCELED");
  expect(f.query.mock.calls.find(([sql]) => sql.startsWith("SELECT"))![1]?.[3]).toBe(
    original.inventorySha256,
  );
});
it("does not read storage after pre-cancellation", async () => {
  const f = fixture(),
    controller = new AbortController();
  controller.abort();
  await expect(
    createGuestAdoptionCompositeStatus(f.connection).readStatus(
      f.input.targetAccountId,
      f.input,
      controller.signal,
    ),
  ).rejects.toThrow("CANCELED");
  expect(f.query).not.toHaveBeenCalled();
});
it("honors the existing owning connection transaction completion contract", async () => {
  const f = fixture();
  let finished = false;
  const connection: CorePgConnection = {
    withLease: async (work) => {
      const result = await f.connection.withLease((lease) =>
        work({
          ...lease,
          query: async (sql, parameters) => {
            const result = await lease.query(sql, parameters);
            if (sql === "COMMIT" || sql === "ROLLBACK") finished = true;
            return result;
          },
        }),
      );
      if (!finished) throw Error("CORE_TRANSACTION_UNFINISHED");
      return result;
    },
  };
  expect(
    await createGuestAdoptionCompositeStatus(connection).readStatus(
      f.input.targetAccountId,
      f.input,
      f.signal,
    ),
  ).toMatchObject({ status: "IN_PROGRESS" });
  expect(finished).toBe(true);
});
it("rolls back a cancellation after the SELECT and never commits it", async () => {
  const f = fixture(),
    controller = new AbortController();
  const connection: CorePgConnection = {
    withLease: (work) =>
      f.connection.withLease((lease) =>
        work({
          ...lease,
          query: async (sql, parameters) => {
            const result = await lease.query(sql, parameters);
            if (sql.startsWith("SELECT")) controller.abort();
            return result;
          },
        }),
      ),
  };
  await expect(
    createGuestAdoptionCompositeStatus(connection).readStatus(
      f.input.targetAccountId,
      f.input,
      controller.signal,
    ),
  ).rejects.toThrow("CANCELED");
  expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  expect(f.query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
});
it("rolls back an unverifiable read before the owning lease ends", async () => {
  const f = fixture("invalid");
  await expect(
    createGuestAdoptionCompositeStatus(f.connection).readStatus(
      f.input.targetAccountId,
      f.input,
      f.signal,
    ),
  ).rejects.toThrow("UNVERIFIED");
  expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
});
