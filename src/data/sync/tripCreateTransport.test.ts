import { advanceAccountGeneration } from "../auth/accountGeneration";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  captureAccountScope,
  captureAccountRequestContext,
} from "../auth/accountRequestContext";
import { createTripCreateTransport } from "./tripCreateTransport";
vi.mock("@/data/auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));

it("looks up missing receipt, then posts the stable key with scoped bearer auth", async () => {
  const actor = randomUUID(),
    operationId = randomUUID(),
    tripId = randomUUID();
  const request = {
    operationId,
    tripId,
    name: "Harbour",
    destination: null,
    startDate: null,
    endDate: null,
  };
  const result = {
    ...request,
    actorAccountId: actor,
    ownerPersonId: randomUUID(),
    coreEpoch: randomUUID(),
    coreRevision: 1,
    coreAccessRevision: 1,
  };
  const fetchImplementation = vi.fn(async (url: string, options: RequestInit) => {
    expect(options.headers).toMatchObject({ Authorization: "Bearer test-only" });
    if (url.endsWith(`/v2/trip-create-operations/${operationId}`))
      return new Response(
        JSON.stringify({ error: { code: "TRIP_CREATE_RECEIPT_NOT_FOUND" } }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    expect(url).toBe("https://api.example.test/v2/trips");
    expect(options.headers).toMatchObject({ "Idempotency-Key": operationId });
    expect(JSON.parse(options.body as string)).toEqual(request);
    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  });
  const scope = await captureAccountScope(async () => actor);
  const transport = createTripCreateTransport(
    async () => actor,
    {
      baseUrl: "https://api.example.test",
      fetchImplementation: fetchImplementation as typeof fetch,
    },
    async () => ({ token: "test-only", userId: actor }),
  );
  expect(await transport.receipt(scope, operationId)).toBeNull();
  expect(await transport.create(scope, request)).toEqual(result);
  expect(fetchImplementation).toHaveBeenCalledTimes(2);
});

it("checks finite guard at actual wire after token await and rejects receipt response after expiry", async () => {
  const actor = randomUUID(),
    op = randomUUID();
  let open = true;
  const wire = vi.fn(async () => {
    open = false;
    return new Response(
      JSON.stringify({ error: { code: "TRIP_CREATE_RECEIPT_NOT_FOUND" } }),
      { status: 404 },
    );
  });
  const guard = () => {
    if (!open) throw Error("CLOSED");
  };
  const scope = await captureAccountScope(async () => actor);
  const transport = createTripCreateTransport(
    async () => actor,
    { baseUrl: "https://api.example.test", fetchImplementation: wire as typeof fetch },
    async () => {
      open = false;
      return { token: "test", userId: actor };
    },
    guard,
  );
  await expect(transport.receipt(scope, op)).rejects.toBeDefined();
  expect(wire).not.toHaveBeenCalled();
  open = true;
  const second = createTripCreateTransport(
    async () => actor,
    { baseUrl: "https://api.example.test", fetchImplementation: wire as typeof fetch },
    async () => ({ token: "test", userId: actor }),
    guard,
  );
  await expect(second.receipt(scope, op)).rejects.toBeDefined();
  expect(wire).toHaveBeenCalledTimes(1);
});

it("does not return receipt-not-found after delayed error body crosses expiry", async () => {
  const actor = randomUUID(),
    op = randomUUID();
  let open = true;
  let release!: () => void;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      release = () => {
        open = false;
        controller.enqueue(
          new TextEncoder().encode(
            JSON.stringify({ error: { code: "TRIP_CREATE_RECEIPT_NOT_FOUND" } }),
          ),
        );
        controller.close();
      };
    },
  });
  const wire = vi.fn(async () => new Response(body, { status: 404 }));
  const scope = await captureAccountScope(async () => actor);
  const transport = createTripCreateTransport(
    async () => actor,
    { baseUrl: "https://api.example.test", fetchImplementation: wire as typeof fetch },
    async () => ({ token: "test-only", userId: actor }),
    () => {
      if (!open) throw Error("CLOSED");
    },
  );
  const pending = transport.receipt(scope, op);
  await new Promise((r) => setTimeout(r, 0));
  expect(wire).toHaveBeenCalledOnce();
  release();
  await expect(pending).rejects.toThrow("CLOSED");
});

async function parentTransportFixture() {
  const actor = randomUUID(),
    trip = randomUUID();
  const result = {
    operationId: randomUUID(),
    tripId: trip,
    actorAccountId: actor,
    ownerPersonId: randomUUID(),
    coreEpoch: randomUUID(),
    coreRevision: 1,
    coreAccessRevision: 1,
    name: "原名",
    destination: null,
    startDate: null,
    endDate: null,
    formatVersion: 2,
    destinations: [],
    metadataRevision: 0,
  };
  const wire = vi.fn(
    async (_input: unknown, _init?: RequestInit) =>
      new Response(JSON.stringify(result), { status: 200 }),
  );
  const scope = await captureAccountRequestContext(trip, async () => actor);
  const transport = createTripCreateTransport(
    async () => actor,
    { baseUrl: "https://api.example.test", fetchImplementation: wire as typeof fetch },
    async () => ({ token: "unit-only", userId: actor }),
  );
  return { actor, trip, result, wire, scope, transport };
}
it("freezes the by-Trip read context, sends normal scoped GET and preserves the original receipt metadata", async () => {
  const f = await parentTransportFixture(),
    context = { ...f.scope };
  const read = f.transport.parentReceipt!(context);
  context.tripId = randomUUID();
  expect(await read).toEqual(f.result);
  expect(f.wire.mock.calls[0][0]).toBe(
    `https://api.example.test/v2/trips/${f.trip}/create-receipt`,
  );
  expect(f.wire.mock.calls[0][1]).toMatchObject({
    method: "GET",
    headers: { Authorization: "Bearer unit-only", "OTR-Trip-Create-Version": "2" },
  });
  expect(f.wire.mock.calls[0][1]?.body).toBeUndefined();
});
it.each([404, 403, 503])(
  "does not collapse a by-Trip read failure into a missing parent: %s",
  async (status) => {
    const f = await parentTransportFixture();
    f.wire.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: status === 404 ? "TRIP_CREATE_RECEIPT_NOT_FOUND" : "TRIP_CREATE_CLOSED",
          },
        }),
        { status },
      ),
    );
    if (status === 404) expect(await f.transport.parentReceipt!(f.scope)).toBeNull();
    else await expect(f.transport.parentReceipt!(f.scope)).rejects.toBeDefined();
  },
);
it.each(["actor", "trip", "generation"] as const)(
  "rejects changed by-Trip response ownership or Account generation: %s",
  async (kind) => {
    const f = await parentTransportFixture();
    f.wire.mockImplementationOnce(async () => {
      if (kind === "generation") advanceAccountGeneration();
      return new Response(
        JSON.stringify({
          ...f.result,
          ...(kind === "actor"
            ? { actorAccountId: randomUUID() }
            : kind === "trip"
              ? { tripId: randomUUID() }
              : {}),
        }),
        { status: 200 },
      );
    });
    await expect(f.transport.parentReceipt!(f.scope)).rejects.toBeDefined();
  },
);
