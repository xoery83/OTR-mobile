import { expect, it, vi } from "vitest";
import { createFlightEnrichmentBoundary } from "./hostBoundary";
const tripId = "a0000000-0000-4000-8000-000000000001";
const path = `https://backend.invalid/v1/trips/${tripId}/flight-enrichment`;
const context = () => ({
  accountId: "synthetic",
  actorId: "actor",
  tripId,
  authFence: "fence",
  assertCurrent: vi.fn(async () => {}),
});
it("requires ordinary auth/Trip scope even for closed capabilities", async () => {
  const handle = createFlightEnrichmentBoundary({
    resolve: async () => {
      throw Error("closed");
    },
  });
  expect((await handle(new Request(path + "/capabilities")))?.status).toBe(401);
});
it("stays closed without a metered owning service and rejects a mismatched Trip", async () => {
  const handle = createFlightEnrichmentBoundary({
    resolve: async () => context(),
    enabled: true,
  });
  expect(await (await handle(new Request(path + "/capabilities")))!.json()).toEqual({
    version: "otr-flight-enrichment/1",
    enabled: false,
  });
  expect((await handle(new Request(path, { method: "POST" })))?.status).toBe(503);
  const wrong = createFlightEnrichmentBoundary({
    resolve: async () => ({ ...context(), tripId: null }),
  });
  expect((await wrong(new Request(path)))?.status).toBe(401);
  expect(
    await handle(new Request("https://backend.invalid/v2/universal-import")),
  ).toBeNull();
});
it("capabilities do not dispatch Provider work", async () => {
  const enrich = vi.fn();
  const handle = createFlightEnrichmentBoundary({
    resolve: async () => context(),
    enabled: true,
    service: { enrich } as any,
  });
  expect(
    (await (await handle(new Request(path + "/capabilities")))!.json()).enabled,
  ).toBe(true);
  expect(enrich).not.toHaveBeenCalled();
  expect((await handle(new Request(path, { method: "POST", body: "{}" })))?.status).toBe(
    400,
  );
  expect(enrich).not.toHaveBeenCalled();
});
it("public flight reuse stays MISS and rejects writes independently of request idempotency", async () => {
  const { closedPublicFlightCache } = await import("./publicCache");
  expect(
    await closedPublicFlightCache.lookup(
      { flightNumber: "NZ501", departureLocalDate: "2026-10-27", knownFields: {} },
      new AbortController().signal,
    ),
  ).toEqual([]);
  await expect(
    closedPublicFlightCache.put({} as any, new AbortController().signal),
  ).rejects.toThrow("PUBLIC_FLIGHT_CACHE_LICENSE_CLOSED");
});
