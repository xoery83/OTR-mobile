import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountScope } from "../auth/accountRequestContext";
import { createTripMetadataTransport } from "./tripMetadataTransport";
vi.mock("@/data/auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
it("uses the existing authenticated client and exact idempotency identity for metadata readback/update", async () => {
  const actor = randomUUID(),
    operationId = randomUUID(),
    tripId = randomUUID();
  const request = {
    operationId,
    tripId,
    before: { name: "Old", destination: null, startDate: null, endDate: null },
    after: { name: "New", destination: "Nelson", startDate: null, endDate: null },
  };
  const result = { ...request, actorAccountId: actor };
  const fetchImplementation = vi.fn(async (url: string, options: RequestInit) => {
    expect(options.headers).toMatchObject({ Authorization: "Bearer test-only" });
    if (url.endsWith(`/v2/trip-metadata-operations/${operationId}`))
      return new Response(
        JSON.stringify({ error: { code: "TRIP_METADATA_RECEIPT_NOT_FOUND" } }),
        { status: 404 },
      );
    expect(url).toBe(`https://api.example.test/v2/trips/${tripId}/metadata`);
    expect(options.headers).toMatchObject({ "Idempotency-Key": operationId });
    expect(JSON.parse(options.body as string)).toEqual(request);
    return new Response(JSON.stringify(result));
  });
  const scope = await captureAccountScope(async () => actor);
  const transport = createTripMetadataTransport(
    async () => actor,
    {
      baseUrl: "https://api.example.test",
      fetchImplementation: fetchImplementation as typeof fetch,
    },
    async () => ({ token: "test-only", userId: actor }),
  );
  expect(await transport.receipt(scope, operationId)).toBeNull();
  expect(await transport.update(scope, request)).toEqual(result);
  expect(fetchImplementation).toHaveBeenCalledTimes(2);
});

it("uses explicit V2 snapshot and version-pinned receipt/update without upgrading V1", async () => {
  const actor = randomUUID(),
    operationId = randomUUID(),
    tripId = randomUUID();
  const before = { name: "Before", destination: null, startDate: null, endDate: null };
  const request = {
    formatVersion: 2 as const,
    operationId,
    tripId,
    before,
    after: { ...before, name: "After" },
    expectedMetadataRevision: 5,
  };
  const result = { ...request, actorAccountId: actor, resultMetadataRevision: 6 };
  const fetchImplementation = vi.fn(async (url: string, options: RequestInit) => {
    expect(options.headers).toMatchObject({ "OTR-Trip-Metadata-Version": "2" });
    if (url.includes("trip-metadata-operations"))
      return new Response(JSON.stringify(result));
    if (options.method === "GET") {
      expect(options.headers).toMatchObject({ "OTR-Metadata-Operation-Id": operationId });
      return new Response(
        JSON.stringify({
          formatVersion: 2,
          actorAccountId: actor,
          tripId,
          metadataRevision: 5,
          metadata: before,
        }),
      );
    }
    expect(JSON.parse(options.body as string)).toEqual(request);
    return new Response(JSON.stringify(result));
  });
  const scope = await captureAccountScope(async () => actor);
  const transport = createTripMetadataTransport(
    async () => actor,
    {
      baseUrl: "https://api.example.test",
      fetchImplementation: fetchImplementation as typeof fetch,
    },
    async () => ({ token: "test-only", userId: actor }),
  );
  expect(await transport.snapshot(scope, tripId, operationId)).toMatchObject({
    metadataRevision: 5,
  });
  expect(await transport.receipt(scope, operationId, 2)).toEqual(result);
  expect(await transport.update(scope, request)).toEqual(result);
});
it("rejects a V2 result on V1 read and an altered V2 request baseline", async () => {
  const actor = randomUUID(),
    operationId = randomUUID(),
    tripId = randomUUID();
  const before = { name: "Before", destination: null, startDate: null, endDate: null };
  const request = {
    formatVersion: 2 as const,
    operationId,
    tripId,
    before,
    after: { ...before, name: "After" },
    expectedMetadataRevision: 2,
  };
  const result = { ...request, actorAccountId: actor, resultMetadataRevision: 3 };
  const fetchImplementation = vi.fn(async () => new Response(JSON.stringify(result)));
  const scope = await captureAccountScope(async () => actor);
  const transport = createTripMetadataTransport(
    async () => actor,
    {
      baseUrl: "https://api.example.test",
      fetchImplementation: fetchImplementation as typeof fetch,
    },
    async () => ({ token: "test-only", userId: actor }),
  );
  await expect(transport.receipt(scope, operationId)).rejects.toThrow(
    "TRIP_METADATA_RECEIPT_MISMATCH",
  );
  await expect(
    transport.update(scope, { ...request, expectedMetadataRevision: 1 }),
  ).rejects.toThrow("TRIP_METADATA_RECEIPT_MISMATCH");
});

it("does not disclose a V2 snapshot across an Account generation ABA", async () => {
  const actor = randomUUID(),
    tripId = randomUUID(),
    operationId = randomUUID();
  const { advanceAccountGeneration } = await import("../auth/accountGeneration");
  const scope = await captureAccountScope(async () => actor);
  const transport = createTripMetadataTransport(
    async () => actor,
    {
      baseUrl: "https://api.example.test",
      fetchImplementation: vi.fn(async () => {
        advanceAccountGeneration();
        advanceAccountGeneration();
        return new Response(
          JSON.stringify({
            formatVersion: 2,
            actorAccountId: actor,
            tripId,
            metadataRevision: 0,
            metadata: {
              name: "Fixture",
              destination: null,
              startDate: null,
              endDate: null,
            },
          }),
        );
      }) as typeof fetch,
    },
    async () => ({ token: "test-only", userId: actor }),
  );
  await expect(transport.snapshot(scope, tripId, operationId)).rejects.toThrow(
    "Account changed",
  );
});
