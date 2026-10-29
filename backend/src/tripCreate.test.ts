import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { tripCreateBoundary } from "./tripCreate";
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
