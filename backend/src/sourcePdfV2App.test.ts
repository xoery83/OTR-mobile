import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
function fixture() {
  const actor = randomUUID(),
    trip = randomUUID();
  const gateway = {
    validateAccessToken: vi.fn(async () => ({ id: actor })),
    canReadTrip: vi.fn(async () => true),
  } as unknown as DevBackendGateway;
  const request = (token = true) =>
    new Request(`https://dev.example.invalid/v2/trips/${trip}/sources/pdf-v2/seal`, {
      method: "POST",
      headers: token ? { Authorization: "Bearer synthetic" } : {},
      body: "{}",
    });
  return { actor, trip, gateway, request };
}
it("normal Backend Auth precedes the default-closed PDF route", async () => {
  const f = fixture();
  const response = await createDevBackendHandler({ gateway: f.gateway })(
    f.request(false),
  );
  expect(response.status).toBe(401);
  expect(f.gateway.canReadTrip).not.toHaveBeenCalled();
});
it("checks the authenticated Actor and current Trip before disclosing PDF capability", async () => {
  const f = fixture();
  vi.mocked(f.gateway.canReadTrip).mockResolvedValue(false);
  const response = await createDevBackendHandler({ gateway: f.gateway })(f.request());
  expect(response.status).toBe(403);
  expect(f.gateway.canReadTrip).toHaveBeenCalledExactlyOnceWith(f.actor, f.trip);
});
it("ordinary Backend composition leaves PDF closed with private, redacted responses", async () => {
  const f = fixture();
  const log = vi.fn();
  const response = await createDevBackendHandler({ gateway: f.gateway, log })(
    f.request(),
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    error: { code: "SOURCE_CAPABILITY_CLOSED" },
  });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(JSON.stringify(log.mock.calls)).not.toContain(f.trip);
});
