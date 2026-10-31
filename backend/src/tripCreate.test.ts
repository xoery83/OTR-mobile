import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { tripCreateBoundary, TripCreateError } from "./tripCreate";
import { createDevBackendHandler, type DevBackendGateway } from "./app";

const actor = randomUUID();
const request = () => ({
  operationId: randomUUID(),
  tripId: randomUUID(),
  name: "Alpine week",
  destination: "Queenstown",
  startDate: "2027-02-10",
  endDate: "2027-02-15",
});
function port(input: ReturnType<typeof request>) {
  const result = {
    ...input,
    actorAccountId: actor,
    ownerPersonId: randomUUID(),
    coreEpoch: randomUUID(),
    coreRevision: 1,
    coreAccessRevision: 1,
  };
  return {
    result,
    create: vi.fn(async () => result),
    receipt: vi.fn(async () => result),
  };
}
it("binds authenticated actor, exact operation key and persisted receipt across create and lookup", async () => {
  const input = request(),
    storage = port(input);
  const post = await tripCreateBoundary(
    new Request("http://localhost/v2/trips", {
      method: "POST",
      headers: { "Idempotency-Key": input.operationId },
      body: JSON.stringify(input),
    }),
    actor,
    storage,
  );
  expect(post.status).toBe(201);
  expect(await post.json()).toEqual(storage.result);
  expect(storage.create).toHaveBeenCalledWith(actor, input);
  const get = await tripCreateBoundary(
    new Request(`http://localhost/v2/trip-create-operations/${input.operationId}`),
    actor,
    storage,
  );
  expect(get.status).toBe(200);
  expect(await get.json()).toEqual(storage.result);
  expect(storage.receipt).toHaveBeenCalledWith(actor, input.operationId);
});
it("keeps the port closed and rejects changed key, invalid dates and mismatched owner", async () => {
  const input = request(),
    storage = port(input);
  const make = (body: unknown, key = input.operationId) =>
    new Request("http://localhost/v2/trips", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(body),
    });
  expect((await tripCreateBoundary(make(input), actor)).status).toBe(503);
  expect(
    (await tripCreateBoundary(make(input, randomUUID()), actor, storage)).status,
  ).toBe(400);
  expect(
    (
      await tripCreateBoundary(
        make({ ...input, startDate: "2027-02-30" }),
        actor,
        storage,
      )
    ).status,
  ).toBe(400);
  storage.create.mockResolvedValueOnce({
    ...storage.result,
    actorAccountId: randomUUID(),
  });
  const mismatch = await tripCreateBoundary(make(input), actor, storage);
  expect(mismatch.status).toBe(503);
  expect((await mismatch.json()).error.code).toBe("TRIP_CREATE_RESULT_MISMATCH");
});
it("does not turn another actor's receipt into a valid lookup", async () => {
  const input = request(),
    storage = port(input);
  storage.receipt.mockResolvedValueOnce({
    ...storage.result,
    actorAccountId: randomUUID(),
  });
  const response = await tripCreateBoundary(
    new Request(`http://localhost/v2/trip-create-operations/${input.operationId}`),
    actor,
    storage,
  );
  expect(response.status).toBe(503);
  storage.receipt.mockResolvedValueOnce(null as never);
  const missing = await tripCreateBoundary(
    new Request(`http://localhost/v2/trip-create-operations/${input.operationId}`),
    actor,
    storage,
  );
  expect(missing.status).toBe(404);
});
it("mounts the route behind the existing bearer-token authentication boundary", async () => {
  const input = request(),
    storage = port(input);
  const gateway = {
    validateAccessToken: vi.fn(async (token: string) =>
      token === "valid" ? { id: actor, accountClass: "NORMAL_ACCOUNT" as const } : null,
    ),
  } as unknown as DevBackendGateway;
  const handle = createDevBackendHandler({ gateway, tripCreatePort: storage });
  const send = (token: string) =>
    new Request("http://localhost/v2/trips", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": input.operationId },
      body: JSON.stringify(input),
    });
  expect((await handle(send("invalid"))).status).toBe(401);
  expect(storage.create).not.toHaveBeenCalled();
  expect((await handle(send("valid"))).status).toBe(201);
  expect(storage.create).toHaveBeenCalledWith(actor, input);
});

it("CreateV2 requires explicit version and preserves complete list in command and receipt", async () => {
  const input = {
    ...request(),
    formatVersion: 2 as const,
    destination: null,
    destinations: [
      {
        destinationId: randomUUID(),
        displayLabel: "Nelson",
        source: "APPLE_PLACE_ID" as const,
        provider: "apple" as const,
        providerPlaceId: "synthetic-place",
      },
    ],
  };
  const p = {
    create: vi.fn(async () => ({
      ...input,
      metadataRevision: 0 as const,
      actorAccountId: actor,
      ownerPersonId: randomUUID(),
      coreEpoch: randomUUID(),
      coreRevision: 1,
      coreAccessRevision: 1,
    })),
    receipt: vi.fn(async () => null),
  };
  const make = (version?: string) =>
    new Request("http://unit/v2/trips", {
      method: "POST",
      headers: {
        "Idempotency-Key": input.operationId,
        ...(version ? { "OTR-Trip-Create-Version": version } : {}),
      },
      body: JSON.stringify(input),
    });
  expect((await tripCreateBoundary(make(), actor, p)).status).toBe(400);
  const result = await tripCreateBoundary(make("2"), actor, p);
  expect(result.status).toBe(201);
  expect((await result.json()).destinations).toEqual(input.destinations);
  expect(p.create).toHaveBeenCalledTimes(1);
});

it("keeps by-Trip parent reads optional, versioned and bound to the authenticated Owner", async () => {
  const input = request(),
    storage = port(input);
  const value = {
    ...storage.result,
    destination: null,
    formatVersion: 2 as const,
    destinations: [],
    metadataRevision: 0 as const,
  };
  const make = (version = "2") =>
    new Request(`http://localhost/v2/trips/${input.tripId}/create-receipt`, {
      headers: { "OTR-Trip-Create-Version": version },
    });
  expect((await tripCreateBoundary(make(), actor, storage)).status).toBe(503);
  const parentReceipt = vi.fn(async () => value);
  const live = { ...storage, parentReceipt };
  expect((await tripCreateBoundary(make("1"), actor, live)).status).toBe(400);
  expect(parentReceipt).not.toHaveBeenCalled();
  const result = await tripCreateBoundary(make(), actor, live);
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual(value);
  expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  expect(parentReceipt).toHaveBeenCalledWith(actor, input.tripId);
  parentReceipt.mockResolvedValueOnce({ ...value, actorAccountId: randomUUID() });
  expect((await tripCreateBoundary(make(), actor, live)).status).toBe(503);
  parentReceipt.mockResolvedValueOnce({ ...value, tripId: randomUUID() });
  expect((await tripCreateBoundary(make(), actor, live)).status).toBe(503);
  parentReceipt.mockResolvedValueOnce(null as never);
  expect((await tripCreateBoundary(make(), actor, live)).status).toBe(404);
  parentReceipt.mockRejectedValueOnce(new TripCreateError(503, "TRIP_CREATE_CLOSED"));
  const closed = await tripCreateBoundary(make(), actor, live);
  expect(closed.status).toBe(503);
  expect((await closed.json()).error.code).toBe("TRIP_CREATE_CLOSED");
  expect(storage.create).not.toHaveBeenCalled();
  expect(storage.receipt).not.toHaveBeenCalled();
});

it("mounts by-Trip receipt lookup behind normal Account authentication without enabling a missing reader", async () => {
  const input = request(),
    storage = port(input);
  const value = {
    ...storage.result,
    destination: null,
    formatVersion: 2 as const,
    destinations: [],
    metadataRevision: 0 as const,
  };
  const parentReceipt = vi.fn(async () => value);
  const gateway = {
    validateAccessToken: vi.fn(async (token: string) =>
      token === "valid" ? { id: actor, accountClass: "NORMAL_ACCOUNT" as const } : null,
    ),
  } as unknown as DevBackendGateway;
  const make = (token = "valid", version = "2") =>
    new Request(`https://dev.invalid/v2/trips/${input.tripId}/create-receipt`, {
      headers: { Authorization: `Bearer ${token}`, "OTR-Trip-Create-Version": version },
    });
  const closed = createDevBackendHandler({ gateway, tripCreatePort: storage });
  expect((await closed(make())).status).toBe(503);
  const handler = createDevBackendHandler({
    gateway,
    tripCreatePort: { ...storage, parentReceipt },
  });
  expect((await handler(make("invalid"))).status).toBe(401);
  expect((await handler(make("valid", "1"))).status).toBe(400);
  expect(parentReceipt).not.toHaveBeenCalled();
  const response = await handler(make());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(value);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(parentReceipt).toHaveBeenCalledExactlyOnceWith(actor, input.tripId);
  expect(storage.create).not.toHaveBeenCalled();
  expect(storage.receipt).not.toHaveBeenCalled();
});
