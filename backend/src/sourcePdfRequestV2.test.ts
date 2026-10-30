import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  guardPdfRequestConnection,
  createSourcePdfRequestV2,
} from "./sourcePdfRequestV2";
function fixture() {
  let open = true;
  const assertRequestCurrent = () => {
    if (!open) throw Error("PDF_SCOPE_FORBIDDEN");
  };
  const guard = {
    assertRequestCurrent,
    assertCurrent: vi.fn(async () => assertRequestCurrent()),
  };
  const query = vi.fn(async (_sql: string) => ({ rows: [] }));
  const lease = { query, retire: vi.fn() };
  const connection = { withLease: vi.fn(async (work) => work(lease)) };
  return {
    query,
    lease,
    connection,
    guard,
    close() {
      open = false;
    },
    guarded: guardPdfRequestConnection(connection, guard),
  };
}
it("closed requests cannot obtain a lease", async () => {
  const f = fixture();
  f.close();
  await expect(f.guarded.withLease(async () => null)).rejects.toThrow(
    "PDF_SCOPE_FORBIDDEN",
  );
  expect(f.connection.withLease).not.toHaveBeenCalled();
});
it("closure while awaiting lease prevents even BEGIN", async () => {
  const f = fixture();
  f.connection.withLease.mockImplementation(async (work) => {
    f.close();
    return work(f.lease);
  });
  await expect(
    f.guarded.withLease(async (lease) => lease.query("BEGIN")),
  ).rejects.toThrow();
  expect(f.query).not.toHaveBeenCalled();
});
it("closure during SQL prevents later writes but preserves raw ROLLBACK", async () => {
  const f = fixture();
  f.query.mockImplementation(async (sql) => {
    if (sql === "SELECT context") f.close();
    return { rows: [] };
  });
  await expect(
    f.guarded.withLease(async (lease) => {
      await lease.query("BEGIN");
      try {
        await lease.query("SELECT context");
        await lease.query("SELECT commit_mutation()");
      } catch (e) {
        await lease.query("ROLLBACK");
        throw e;
      }
    }),
  ).rejects.toThrow("PDF_SCOPE_FORBIDDEN");
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
    "BEGIN",
    "SELECT context",
    "ROLLBACK",
  ]);
});
it("normal access is rechecked before COMMIT and revoked access withholds it", async () => {
  const f = fixture();
  f.guard.assertCurrent.mockImplementation(async () => {
    if (f.guard.assertCurrent.mock.calls.length >= 3) throw Error("PDF_SCOPE_FORBIDDEN");
  });
  await expect(
    f.guarded.withLease(async (lease) => {
      await lease.query("BEGIN");
      try {
        await lease.query("COMMIT");
      } catch (e) {
        await lease.query("ROLLBACK");
        throw e;
      }
    }),
  ).rejects.toThrow();
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "ROLLBACK"]);
});
it("V2 optional composition checks normal Actor/Trip before creating a custody reader", async () => {
  const actor = randomUUID(),
    trip = randomUUID(),
    readOriginalForRequest = vi.fn();
  const gateway = {
    validateAccessToken: vi.fn(async () => ({ id: actor })),
    canReadTrip: vi.fn(async () => false),
  };
  const factory = createSourcePdfRequestV2({
    gateway: gateway as never,
    connection: {} as never,
    hash: async () => "a".repeat(64),
    readOriginalForRequest,
    workload: {
      ownerRun: randomUUID(),
      producerId: randomUUID(),
      providerInstanceSha256: "b".repeat(64),
    },
    assertEnabled() {},
  });
  await expect(
    factory(
      new Request(`https://dev.example.invalid/v2/trips/${trip}/sources/pdf-v2/seal`, {
        headers: { Authorization: "Bearer synthetic" },
      }),
      actor,
    ),
  ).rejects.toThrow("PDF_SCOPE_FORBIDDEN");
  expect(readOriginalForRequest).not.toHaveBeenCalled();
  expect(gateway.canReadTrip).toHaveBeenCalledWith(actor, trip);
});

it.each([false, true])(
  "closure after BEGIN closes the transaction before caller sets began (rollbackFailure=%s)",
  async (rollbackFailure) => {
    const f = fixture();
    f.query.mockImplementation(async (sql) => {
      if (sql.startsWith("BEGIN")) f.close();
      if (sql === "ROLLBACK" && rollbackFailure) throw Error("lost connection");
      return { rows: [] };
    });
    await expect(
      f.guarded.withLease(async (lease) => {
        let began = false;
        try {
          await lease.query("BEGIN ISOLATION LEVEL READ COMMITTED");
          began = true;
          await lease.query("SELECT owning_write()");
        } catch (error) {
          if (began) await lease.query("ROLLBACK");
          throw error;
        }
      }),
    ).rejects.toThrow("PDF_SCOPE_FORBIDDEN");
    expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN ISOLATION LEVEL READ COMMITTED",
      "ROLLBACK",
    ]);
    expect(f.lease.retire).toHaveBeenCalledTimes(rollbackFailure ? 1 : 0);
  },
);
