import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createTripPersonCloudCreatePgPort } from "./tripPersonCloudCreatePg";
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
  const port = createTripPersonCloudCreatePgPort({
    withLease: async (work) => work({ query, retire: vi.fn() } as CorePgLease),
  });
  return {
    actor,
    request,
    query,
    port,
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
