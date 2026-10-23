import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountScope } from "../auth/accountRequestContext";
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
