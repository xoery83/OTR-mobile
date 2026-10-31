import type { CorePgConnection } from "./tripCoreV2PgStorage";
// Synthetic PG replies exercise connection/scope/idempotency boundaries, not Source qualification.
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createSourcePngBroker, type SourcePngBrokerAction } from "./sourcePngBroker";
import {
  pdfPreparationFixture,
  pdfProtocolHash,
} from "../../src/data/operations/__fixtures__/pdfOriginalPreparation";
import { createPendingPngCommandProposals } from "../../src/domain/trip/sourcePngPreparationCommands";
async function fixture(action: SourcePngBrokerAction = "STATUS") {
  const f = await pdfPreparationFixture([]),
    acquisition = structuredClone(f.input.acquisition);
  acquisition.payload.original.mime_type = "image/png";
  const { upload: q } = await createPendingPngCommandProposals(
    { actorId: f.context.accountId, tripId: f.context.tripId },
    acquisition,
    f.input.acquisitionReceipt,
    pdfProtocolHash,
  );
  const controller = new AbortController();
  const scope = {
    actorId: f.context.accountId,
    tripId: f.context.tripId,
    signal: controller.signal,
  };
  const value = {
    operation: {
      contract_version: 1,
      operation_id: q.operation_id,
      operation_key: q.operation_key,
      operation_sha256: q.operation_sha256,
      phase: action === "BEGIN" ? "IO_ACTIVE" : "ADMITTED",
      attempt_generation: 1,
    },
    journal: { id: randomUUID() },
    freshAttempt: action === "BEGIN",
  };
  const identity = {
    principal: "otr_trip_source_command_gateway",
    role: "otr_trip_source_command_gateway",
  };
  const query = vi.fn(async (sql: string, _params?: unknown[]) => ({
    rows: sql.startsWith("SELECT session_user")
      ? [identity]
      : sql.includes("trip_source_png_operation")
        ? [{ result: value }]
        : [],
  }));
  const lease = { query, retire: vi.fn() };
  const connection: CorePgConnection = { withLease: async (work) => work(lease) };
  const leaseSpy = vi.spyOn(connection, "withLease");
  const current = vi.fn(async () => {});
  return {
    q,
    action,
    scope,
    value,
    identity,
    query,
    lease,
    connection,
    leaseSpy,
    current,
    controller,
    call: createSourcePngBroker(connection, current, () => scope.signal.throwIfAborted()),
  };
}
it("uses the existing Source transaction and a private fresh BEGIN reply exactly once", async () => {
  const f = await fixture("BEGIN"),
    expected = { attemptId: randomUUID() };
  const result = await f.call(f.scope, f.q, "BEGIN", expected);
  expect(result.freshAttempt).toBe(true);
  expect(f.current).toHaveBeenCalledTimes(1);
  const calls = f.query.mock.calls.filter(([sql]) =>
    sql.includes("trip_source_png_operation"),
  );
  expect(calls).toHaveLength(1);
  expect(calls[0][1]).toEqual([
    f.scope.actorId,
    expect.any(String),
    "BEGIN",
    JSON.stringify(expected),
    "null",
  ]);
  expect(f.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
});
it("rejects a different Actor/Trip before taking a database lease", async () => {
  const f = await fixture();
  await expect(
    f.call({ ...f.scope, actorId: randomUUID() }, f.q, "STATUS"),
  ).rejects.toThrow("SOURCE_ACCESS_DENIED");
  expect(f.connection.withLease).not.toHaveBeenCalled();
});
it("never substitutes an admin or writer role for the dedicated Source principal", async () => {
  const f = await fixture();
  f.identity.role = "postgres";
  await expect(f.call(f.scope, f.q, "REGISTER")).rejects.toThrow(
    "SOURCE_PRINCIPAL_UNAVAILABLE",
  );
  expect(
    f.query.mock.calls.some(([sql]) => sql.includes("trip_source_png_operation")),
  ).toBe(false);
  expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
});
it("an existing IO attempt cannot grant a fresh permit to a status caller", async () => {
  const f = await fixture("BEGIN");
  await expect(f.call(f.scope, f.q, "STATUS")).rejects.toThrow(
    "PNG_SOURCE_PERMIT_INVALID",
  );
  expect(
    f.query.mock.calls.filter(([sql]) => sql.includes("trip_source_png_operation")),
  ).toHaveLength(1);
});
it("a substituted operation reply is withheld without another command", async () => {
  const f = await fixture();
  f.value.operation.operation_id = randomUUID();
  await expect(f.call(f.scope, f.q, "STATUS")).rejects.toThrow(
    "PNG_SOURCE_RECEIPT_MISMATCH",
  );
  expect(f.connection.withLease).toHaveBeenCalledOnce();
});
it("commit UNKNOWN is never automatically retried as a new BEGIN", async () => {
  const f = await fixture("BEGIN"),
    original = f.query.getMockImplementation()!;
  f.query.mockImplementation(async (sql, params) => {
    if (sql === "COMMIT") throw Error("TRANSPORT_UNKNOWN");
    return original(sql, params);
  });
  await expect(f.call(f.scope, f.q, "BEGIN")).rejects.toThrow("TRANSPORT_UNKNOWN");
  expect(
    f.query.mock.calls.filter(([sql]) => sql.includes("trip_source_png_operation")),
  ).toHaveLength(1);
});
it("late cancellation withholds the fresh permit without re-running Source", async () => {
  const f = await fixture("BEGIN"),
    original = f.query.getMockImplementation()!;
  f.query.mockImplementation(async (sql, params) => {
    const result = await original(sql, params);
    if (sql.includes("trip_source_png_operation")) f.controller.abort();
    return result;
  });
  await expect(f.call(f.scope, f.q, "BEGIN")).rejects.toThrow();
  expect(
    f.query.mock.calls.filter(([sql]) => sql.includes("trip_source_png_operation")),
  ).toHaveLength(1);
});

it("cancellation during connection acquisition cannot reach owning RPC or BEGIN", async () => {
  const f = await fixture("BEGIN");
  f.leaseSpy.mockImplementation(async (work) => {
    f.controller.abort();
    return work(f.lease);
  });
  await expect(f.call(f.scope, f.q, "BEGIN")).rejects.toThrow();
  expect(f.query).not.toHaveBeenCalled();
});
it("cancellation while principal query is pending prevents the owning RPC", async () => {
  const f = await fixture("BEGIN"),
    original = f.query.getMockImplementation()!;
  f.query.mockImplementation(async (sql, params) => {
    const result = await original(sql, params);
    if (sql.startsWith("SELECT session_user")) f.controller.abort();
    return result;
  });
  await expect(f.call(f.scope, f.q, "BEGIN")).rejects.toThrow();
  expect(
    f.query.mock.calls.some(([sql]) => sql.includes("trip_source_png_operation")),
  ).toBe(false);
  expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
});

it("reauthorizes once per action without caching access across the request", async () => {
  const f = await fixture();
  let simulatedNetworkMs = 0;
  f.current.mockImplementation(async () => {
    simulatedNetworkMs += 1200;
  });
  await f.call(f.scope, f.q, "STATUS");
  await f.call(f.scope, f.q, "RECONCILE");
  expect(simulatedNetworkMs).toBe(2400);
  f.current.mockRejectedValueOnce(Error("SOURCE_ACCESS_DENIED"));
  await expect(f.call(f.scope, f.q, "BEGIN")).rejects.toThrow("SOURCE_ACCESS_DENIED");
  expect(
    f.query.mock.calls.filter(([sql]) => sql.includes("trip_source_png_operation")),
  ).toHaveLength(2);
});

it("local capability closure after COMMIT withholds the permit without replay", async () => {
  const f = await fixture("BEGIN");
  let closed = false;
  const original = f.query.getMockImplementation()!;
  f.query.mockImplementation(async (sql, params) => {
    const result = await original(sql, params);
    if (sql === "COMMIT") closed = true;
    return result;
  });
  const call = createSourcePngBroker(f.connection, f.current, () => {
    if (closed) throw Error("SOURCE_CAPABILITY_CLOSED");
  });
  await expect(call(f.scope, f.q, "BEGIN")).rejects.toThrow("SOURCE_CAPABILITY_CLOSED");
  expect(f.current).toHaveBeenCalledOnce();
  expect(
    f.query.mock.calls.filter(([sql]) => sql.includes("trip_source_png_operation")),
  ).toHaveLength(1);
});

it("does not hold a Source transaction idle during remote Auth/Trip revalidation", async () => {
  const f = await fixture();
  f.current.mockImplementation(async () => {
    // A slow network check must not consume the Source principal's 5s idle budget.
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith("BEGIN"))).toBe(false);
    expect(f.leaseSpy).not.toHaveBeenCalled();
  });
  await f.call(f.scope, f.q, "STATUS");
  expect(f.current).toHaveBeenCalledOnce();
  expect(f.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
});
it("denied or cancelled remote access cannot acquire a Source lease", async () => {
  const denied = await fixture();
  denied.current.mockRejectedValueOnce(Error("SOURCE_ACCESS_DENIED"));
  await expect(denied.call(denied.scope, denied.q, "STATUS")).rejects.toThrow("SOURCE_ACCESS_DENIED");
  expect(denied.leaseSpy).not.toHaveBeenCalled();
  const cancelled = await fixture();
  cancelled.current.mockImplementation(async () => { cancelled.controller.abort(); });
  await expect(cancelled.call(cancelled.scope, cancelled.q, "STATUS")).rejects.toThrow();
  expect(cancelled.leaseSpy).not.toHaveBeenCalled();
});
