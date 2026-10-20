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
