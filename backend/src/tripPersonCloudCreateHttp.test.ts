import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  tripPersonCloudCreateBoundary,
  PersonCloudCreateError,
} from "./tripPersonCloudCreateHttp";

function fixture() {
  const actor = randomUUID(),
    trip = randomUUID();
  const request = {
    version: 1 as const,
    operationId: randomUUID(),
    tripId: trip,
    personId: randomUUID(),
    tripCreateOperationId: randomUUID(),
    dataOwnership: "CLOUD_SHARED_AUTHORED" as const,
    displayName: "Traveler 中文",
  };
  const receipt = {
    receiptVersion: 1 as const,
    actorAccountId: actor,
    request,
    person: {
      personId: request.personId,
      tripId: trip,
      displayName: request.displayName,
      status: "unlinked" as const,
      userId: null,
      participationActive: true as const,
      participationRevision: 0 as const,
    },
    acceptedAt: "2026-10-24T00:00:00Z",
  };
  const port = {
    create: vi.fn(async () => receipt),
    receipt: vi.fn(async () => receipt),
  };
  const canRead = vi.fn(async () => true);
  const post = (body: unknown = request, key = request.operationId, suffix = "") =>
    new Request(`https://dev.invalid/v2/trips/${trip}/people${suffix}`, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(body),
    });
  const get = () =>
    new Request(
      `https://dev.invalid/v2/trips/${trip}/person-create-operations/${request.operationId}`,
    );
  return { actor, trip, request, receipt, port, canRead, post, get };
}
it("uses the authenticated Actor and exact authored request, without granting an Account connection", async () => {
  const f = fixture();
  const result = await tripPersonCloudCreateBoundary(
    f.post(),
    f.actor,
    f.canRead,
    f.port,
  );
  expect(result.status).toBe(201);
  expect(f.port.create).toHaveBeenCalledWith(f.actor, f.request);
  expect(await result.json()).toEqual(f.receipt);
  expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  expect(result.headers.get("Vary")).toBe("Authorization");
  expect(f.canRead).toHaveBeenCalledTimes(2);
});
it("returns only the exact permission-qualified immutable operation result", async () => {
  const f = fixture();
  const result = await tripPersonCloudCreateBoundary(f.get(), f.actor, f.canRead, f.port);
  expect(result.status).toBe(200);
  expect(f.port.receipt).toHaveBeenCalledWith(f.actor, f.trip, f.request.operationId);
  f.port.receipt.mockResolvedValueOnce(null as never);
  const missing = await tripPersonCloudCreateBoundary(
    f.get(),
    f.actor,
    f.canRead,
    f.port,
  );
  expect(missing.status).toBe(404);
  expect(await missing.json()).toMatchObject({
    error: { code: "PERSON_CREATE_NOT_FOUND" },
  });
});
it.each([
  "extraActor",
  "differentTrip",
  "privateIntent",
  "identityClaim",
  "key",
  "query",
  "oversize",
])("rejects %s before the owning port", async (kind) => {
  const f = fixture();
  const body =
    kind === "extraActor"
      ? { ...f.request, actorAccountId: randomUUID() }
      : kind === "differentTrip"
        ? { ...f.request, tripId: randomUUID() }
        : kind === "privateIntent"
          ? { ...f.request, dataOwnership: "LOCAL_PRIVATE" }
          : kind === "identityClaim"
            ? { ...f.request, userId: randomUUID() }
            : kind === "oversize"
              ? { ...f.request, displayName: "x".repeat(8193) }
              : f.request;
  const result = await tripPersonCloudCreateBoundary(
    f.post(
      body,
      kind === "key" ? randomUUID() : f.request.operationId,
      kind === "query" ? "?actor=other" : "",
    ),
    f.actor,
    f.canRead,
    f.port,
  );
  expect(result.status).toBe(400);
  expect(f.port.create).not.toHaveBeenCalled();
});
it("fails closed for missing capability and revoked Trip access", async () => {
  const f = fixture();
  expect((await tripPersonCloudCreateBoundary(f.post(), f.actor, f.canRead)).status).toBe(
    503,
  );
  f.canRead.mockResolvedValue(false);
  expect(
    (await tripPersonCloudCreateBoundary(f.post(), f.actor, f.canRead, f.port)).status,
  ).toBe(403);
  expect(f.port.create).not.toHaveBeenCalled();
  f.canRead.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect(
    (await tripPersonCloudCreateBoundary(f.post(), f.actor, f.canRead, f.port)).status,
  ).toBe(403);
});
it.each(["actor", "operation", "person", "trip", "linkedAccount"])(
  "does not expose a mismatched %s receipt",
  async (kind) => {
    const f = fixture();
    const bad = {
      ...f.receipt,
      ...(kind === "actor" ? { actorAccountId: randomUUID() } : {}),
      request: {
        ...f.request,
        ...(kind === "operation" ? { operationId: randomUUID() } : {}),
        ...(kind === "trip" ? { tripId: randomUUID() } : {}),
      },
      person: {
        ...f.receipt.person,
        ...(kind === "person" ? { personId: randomUUID() } : {}),
        ...(kind === "linkedAccount" ? { userId: randomUUID() } : {}),
      },
    };
    f.port.receipt.mockResolvedValueOnce(bad as never);
    expect(
      (await tripPersonCloudCreateBoundary(f.get(), f.actor, f.canRead, f.port)).status,
    ).toBe(503);
  },
);
it("returns only safe classified errors and never private database diagnostics", async () => {
  const f = fixture();
  f.port.create.mockRejectedValueOnce(new Error("secret-database-detail"));
  const response = await tripPersonCloudCreateBoundary(
    f.post(),
    f.actor,
    f.canRead,
    f.port,
  );
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("secret-database-detail");
  f.port.create.mockRejectedValueOnce(
    new PersonCloudCreateError(409, "PERSON_CREATE_CONFLICT"),
  );
  const conflict = await tripPersonCloudCreateBoundary(
    f.post(),
    f.actor,
    f.canRead,
    f.port,
  );
  expect(conflict.status).toBe(409);
});
