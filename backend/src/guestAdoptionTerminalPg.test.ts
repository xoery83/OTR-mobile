import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createGuestAdoptionTerminalPg } from "./guestAdoptionTerminalPg";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import { tripCoreSha256Hex } from "../../src/data/repositories/tripCoreSha256";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
async function fixture() {
  const request = {
    contractVersion: 1 as const,
    adoptionId: randomUUID(),
    sourceGuestLocalId: randomUUID(),
    targetAccountId: randomUUID(),
    inventorySha256: "a".repeat(64),
  };
  const body = {
    ...request,
    schemaId: "otr.auth.guest-adoption-receipt/1" as const,
    receiptId: randomUUID(),
    grantId: randomUUID(),
    outcome: "CANCELLED" as const,
    policyVersion: "unit-unpriced/1",
    recordedAt: "2026-01-01T00:00:00Z",
    preparationSha256: null,
    planSha256: null,
  };
  const receipt = {
    ...body,
    receiptSha256: await coreHashValue(
      "otr-auth-guest-adoption-receipt-v1",
      body,
      tripCoreSha256Hex,
    ),
  };
  const status = {
    ...request,
    status: "CANCELLED",
    nextAction: "READ_CANCELLATION_RECEIPT",
    receipt: { receiptId: receipt.receiptId, receiptSha256: receipt.receiptSha256 },
  };
  const input = { ...request, ...status.receipt },
    retire = vi.fn();
  const query = vi.fn(async (sql: string, _params?: readonly unknown[]) => ({
    rows: sql.includes(".status(")
      ? [{ result: status }]
      : sql.includes(".receipt(")
        ? [{ result: receipt }]
        : [],
  }));
  const connection: CorePgConnection = {
    withLease: async (work) => work({ retire, query }),
  };
  const port = createGuestAdoptionTerminalPg(connection),
    controller = new AbortController();
  return { request, receipt, status, input, query, retire, connection, port, controller };
}
it("reads only owning status and receipt RPCs with exact actor and pointer with the existing Account policy read locks", async () => {
  const f = await fixture();
  expect(
    await f.port.readStatus(f.request.targetAccountId, f.request, f.controller.signal),
  ).toEqual(f.status);
  expect(
    await f.port.readReceipt(f.request.targetAccountId, f.input, f.controller.signal),
  ).toEqual(f.receipt);
  expect(f.query).toHaveBeenCalledWith(
    "SELECT otr_auth_guest_composite.receipt($1::uuid,$2::jsonb,$3::uuid,$4::text) AS result",
    [
      f.request.targetAccountId,
      JSON.stringify(f.request),
      f.input.receiptId,
      f.input.receiptSha256,
    ],
  );
  expect(
    f.query.mock.calls.filter(([sql]) => sql === "BEGIN ISOLATION LEVEL REPEATABLE READ"),
  ).toHaveLength(2);
  expect(f.query.mock.calls.filter(([sql]) => sql === "COMMIT")).toHaveLength(2);
  expect(
    f.query.mock.calls.some(([sql]) => /terminal_evidence|sealed_stages/.test(sql)),
  ).toBe(false);
});
it.each(["readStatus", "readReceipt"] as const)(
  "pins %s before asynchronous lease acquisition",
  async (method) => {
    const f = await fixture(),
      raw = method === "readStatus" ? f.request : f.input,
      actor = f.request.targetAccountId,
      original = structuredClone(raw);
    const port = createGuestAdoptionTerminalPg({
      withLease: async (work) => {
        raw.targetAccountId = randomUUID();
        return f.connection.withLease(work);
      },
    });
    await port[method](actor, raw as typeof f.input, f.controller.signal);
    const values = f.query.mock.calls.find(([sql]) => sql.startsWith("SELECT"))![1]!;
    expect(values[0]).toBe(actor);
    expect(JSON.parse(values[1] as string).targetAccountId).toBe(
      original.targetAccountId,
    );
  },
);
it("rejects a foreign actor before acquiring a lease", async () => {
  const f = await fixture();
  await expect(
    f.port.readReceipt(randomUUID(), f.input, f.controller.signal),
  ).rejects.toThrow("TARGET_MISMATCH");
  expect(f.query).not.toHaveBeenCalled();
});
it("rejects a mismatched terminal pointer and rolls back the read", async () => {
  const f = await fixture();
  f.input.receiptId = randomUUID();
  await expect(
    f.port.readReceipt(f.request.targetAccountId, f.input, f.controller.signal),
  ).rejects.toThrow("UNVERIFIED");
  expect(f.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
});
it("rejects a different status binding rather than projecting it into the requested frame", async () => {
  const f = await fixture();
  f.status.sourceGuestLocalId = randomUUID();
  await expect(
    f.port.readStatus(f.request.targetAccountId, f.request, f.controller.signal),
  ).rejects.toThrow("UNVERIFIED");
  expect(f.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
});
it("does not start an already cancelled read", async () => {
  const f = await fixture();
  f.controller.abort();
  await expect(
    f.port.readStatus(f.request.targetAccountId, f.request, f.controller.signal),
  ).rejects.toThrow("CANCELED");
  expect(f.query).not.toHaveBeenCalled();
});
it("rejects an abort arriving with the owning read result", async () => {
  const f = await fixture(),
    query = f.query.getMockImplementation()!;
  f.query.mockImplementation(async (sql, params) => {
    const result = await query(sql, params);
    if (sql.startsWith("SELECT")) f.controller.abort();
    return result;
  });
  await expect(
    f.port.readReceipt(f.request.targetAccountId, f.input, f.controller.signal),
  ).rejects.toThrow("CANCELED");
  expect(f.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
  expect(f.query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
});
it("fences a lease deadline so late SQL completion cannot commit or issue cleanup on a returned lease", async () => {
  const f = await fixture();
  let finish!: () => void, entered!: () => void, task: Promise<unknown> | undefined;
  const started = new Promise<void>((resolve) => {
      entered = resolve;
    }),
    pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
  const statements: string[] = [];
  const port = createGuestAdoptionTerminalPg({
    withLease: async (work) => {
      task = work({
        retire: f.retire,
        query: async (sql) => {
          statements.push(sql);
          if (sql.startsWith("SELECT")) {
            entered();
            await pending;
            return { rows: [{ result: f.status }] };
          }
          return { rows: [] };
        },
      });
      void task.catch(() => undefined);
      await started;
      throw Error("lease deadline");
    },
  });
  await expect(
    port.readStatus(f.request.targetAccountId, f.request, f.controller.signal),
  ).rejects.toThrow("lease deadline");
  finish();
  await expect(task).rejects.toThrow("CANCELED");
  expect(statements).toHaveLength(2);
});

it("commits one validated server cancellation before returning it", async () => {
  const f = await fixture(),
    query = f.query.getMockImplementation()!;
  f.query.mockImplementation(async (sql, params) =>
    sql.includes(".cancel(") ? { rows: [{ result: f.receipt }] } : query(sql, params),
  );
  expect(
    await f.port.cancel(f.request.targetAccountId, f.request, f.controller.signal),
  ).toEqual(f.receipt);
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
    "BEGIN",
    "SELECT otr_auth_guest_composite.cancel($1::uuid,$2::jsonb) AS result",
    "COMMIT",
  ]);
});
it("reports UNKNOWN and retires the lease if the cancellation commit response is lost", async () => {
  const f = await fixture(),
    query = f.query.getMockImplementation()!;
  f.query.mockImplementation(async (sql, params) => {
    if (sql === "COMMIT") throw Error("commit reply lost");
    return sql.includes(".cancel(")
      ? { rows: [{ result: f.receipt }] }
      : query(sql, params);
  });
  await expect(
    f.port.cancel(f.request.targetAccountId, f.request, f.controller.signal),
  ).rejects.toThrow("CANCEL_OUTCOME_UNKNOWN");
  expect(f.retire).toHaveBeenCalled();
  expect(f.query.mock.calls.filter(([sql]) => sql.includes(".cancel("))).toHaveLength(1);
});
it("does not commit an unverified cancellation record", async () => {
  const f = await fixture(),
    query = f.query.getMockImplementation()!;
  f.query.mockImplementation(async (sql, params) =>
    sql.includes(".cancel(")
      ? { rows: [{ result: { ...f.receipt, grantId: randomUUID() } }] }
      : query(sql, params),
  );
  await expect(
    f.port.cancel(f.request.targetAccountId, f.request, f.controller.signal),
  ).rejects.toThrow("HASH_MISMATCH");
  expect(f.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
  expect(f.query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
});
