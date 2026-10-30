import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  createTripPersonCloudCreatePgPort,
  withTripPersonCloudCreateOnTransaction,
} from "./tripPersonCloudCreatePg";
import type { CorePgLease } from "./tripCoreV2PgStorage";
function fixture() {
  const actor = randomUUID(),
    request = {
      version: 1 as const,
      operationId: randomUUID(),
      tripId: randomUUID(),
      personId: randomUUID(),
      tripCreateOperationId: randomUUID(),
      dataOwnership: "CLOUD_SHARED_AUTHORED" as const,
      displayName: "Authored",
    };
  let result: unknown = {
    receiptVersion: 1,
    actorAccountId: actor,
    request,
    person: {
      personId: request.personId,
      tripId: request.tripId,
      displayName: request.displayName,
      status: "unlinked",
      userId: null,
      participationActive: true,
      participationRevision: 0,
    },
    acceptedAt: "2026-10-24T00:00:00.000Z",
  };
  let failure: unknown;
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("trip_person_cloud_")) {
      if (failure) throw failure;
      return { rows: [{ result }] };
    }
    return { rows: [] };
  });
  const lease: CorePgLease = { query, retire: vi.fn() };
  const port = createTripPersonCloudCreatePgPort({
    withLease: async (work) => work(lease),
  });
  return {
    actor,
    request,
    query,
    lease,
    port,
    result() {
      return structuredClone(result);
    },
    setResult(v: unknown) {
      result = v;
    },
    fail(code: string) {
      failure = { code, message: "private provider detail must not escape" };
    },
  };
}
it("uses only fixed owning SQL entrypoints and preserves exact request binding", async () => {
  const f = fixture();
  const r = await f.port.create(f.actor, f.request);
  expect(await f.port.receipt(f.actor, f.request.tripId, f.request.operationId)).toEqual(
    r,
  );
  expect(
    f.query.mock.calls
      .filter(([sql]) => sql.includes("trip_person_cloud_"))
      .every(([sql]) =>
        /^SELECT public.trip_person_cloud_create_(command|result)\(/.test(sql),
      ),
  ).toBe(true);
  expect(f.query).toHaveBeenCalledWith("COMMIT");
});
it.each([
  ["42501", 403],
  ["23505", 409],
  ["22023", 400],
  ["XX000", 503],
])("maps %s to safe typed status %s and rolls back", async (code, status) => {
  const f = fixture();
  f.fail(code as string);
  await expect(f.port.create(f.actor, f.request)).rejects.toMatchObject({ status });
  expect(f.query).toHaveBeenCalledWith("ROLLBACK");
  expect(f.query).not.toHaveBeenCalledWith("COMMIT");
});
it("does not commit a forged Actor/Person receipt", async () => {
  const f = fixture();
  f.setResult({
    receiptVersion: 1,
    actorAccountId: randomUUID(),
    request: f.request,
    person: {
      personId: f.request.personId,
      tripId: f.request.tripId,
      displayName: f.request.displayName,
      status: "unlinked",
      userId: null,
      participationActive: true,
      participationRevision: 0,
    },
    acceptedAt: "2026-10-24T00:00:00.000Z",
  });
  await expect(f.port.create(f.actor, f.request)).rejects.toMatchObject({
    status: 503,
    code: "PERSON_RECEIPT_BINDING",
  });
  expect(f.query).toHaveBeenCalledWith("ROLLBACK");
});

it("held port reuses exact owning SQL/readbacks without inner transaction control", async () => {
  const f = fixture();
  await withTripPersonCloudCreateOnTransaction(f.lease, async (port) => {
    const created = await port.create(f.actor, f.request);
    expect(await port.receipt(f.actor, f.request.tripId, f.request.operationId)).toEqual(
      created,
    );
  });
  expect(f.query).toHaveBeenCalledTimes(2);
  expect(
    f.query.mock.calls.every(([sql]) =>
      sql.startsWith("SELECT public.trip_person_cloud_create_"),
    ),
  ).toBe(true);
  expect(f.lease.retire).not.toHaveBeenCalled();
});
it.each(["42501", "23505", "22023", "XX000"])(
  "held port poisons the outer transaction after swallowed %s",
  async (code) => {
    const f = fixture();
    f.fail(code);
    await expect(
      withTripPersonCloudCreateOnTransaction(f.lease, async (port) => {
        await port.create(f.actor, f.request).catch(() => {});
        return "must not commit";
      }),
    ).rejects.toMatchObject({
      code:
        code === "42501"
          ? "PERSON_CREATE_FORBIDDEN"
          : code === "23505"
            ? "PERSON_CREATE_COLLISION"
            : code === "22023"
              ? "PERSON_CREATE_INVALID"
              : "PERSON_CREATE_UNAVAILABLE",
    });
    expect(f.lease.retire).toHaveBeenCalledTimes(1);
    expect(f.query).not.toHaveBeenCalledWith("COMMIT");
  },
);
it("held port rejects escaped calls without SQL", async () => {
  const f = fixture();
  let escaped!: Parameters<
    Parameters<typeof withTripPersonCloudCreateOnTransaction>[1]
  >[0];
  await withTripPersonCloudCreateOnTransaction(f.lease, async (port) => {
    escaped = port;
  });
  await expect(escaped.create(f.actor, f.request)).rejects.toMatchObject({
    code: "PERSON_TRANSACTION_RELEASED",
  });
  expect(f.query).not.toHaveBeenCalled();
});
it("unawaited work cannot let the outer transaction succeed or finish late", async () => {
  const f = fixture();
  let finish!: () => void;
  const delayed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const query = vi.fn(async () => {
    await delayed;
    return { rows: [{ result: f.result() }] };
  });
  let pending!: Promise<unknown>;
  const retire = vi.fn();
  await expect(
    withTripPersonCloudCreateOnTransaction({ query, retire }, async (port) => {
      pending = port.create(f.actor, f.request);
    }),
  ).rejects.toMatchObject({ code: "PERSON_TRANSACTION_WORK_PENDING" });
  finish();
  await expect(pending).rejects.toMatchObject({ code: "PERSON_TRANSACTION_RELEASED" });
  expect(retire).toHaveBeenCalledTimes(1);
});
it("parallel held operations poison even if the busy rejection was swallowed", async () => {
  const f = fixture();
  await expect(
    withTripPersonCloudCreateOnTransaction(f.lease, async (port) => {
      await Promise.allSettled([
        port.create(f.actor, f.request),
        port.create(f.actor, f.request),
      ]);
    }),
  ).rejects.toMatchObject({ code: "PERSON_TRANSACTION_BUSY" });
  expect(f.lease.retire).toHaveBeenCalledTimes(1);
});
it("held port retains the receipt binding guard", async () => {
  const f = fixture();
  f.setResult(null);
  await expect(
    withTripPersonCloudCreateOnTransaction(f.lease, async (port) => {
      await port.create(f.actor, f.request);
    }),
  ).rejects.toMatchObject({ code: "PERSON_RECEIPT_MISSING" });
  expect(f.lease.retire).toHaveBeenCalledTimes(1);
});
