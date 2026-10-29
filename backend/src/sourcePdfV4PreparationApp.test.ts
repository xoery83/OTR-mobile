import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
function fixture() {
  const actor = randomUUID(),
    tripId = randomUUID(),
    sourceId = randomUUID(),
    representationId = randomUUID(),
    operationId = randomUUID();
  const gateway = {
    validateAccessToken: vi.fn(async () => ({ id: actor })),
    canReadTrip: vi.fn(async () => true),
  } as unknown as DevBackendGateway;
  const owner = { accountGeneration: vi.fn(async () => 2) };
  const preparation = {
    ingress: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    upload: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    observeRetained: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  };
  const request = (token = true) =>
    new Request(
      `https://dev.example.invalid/v2/trips/${tripId}/sources/${sourceId}/representations/${representationId}/pdf-v4/${operationId}/dispatch`,
      { method: "POST", headers: token ? { Authorization: "Bearer synthetic" } : {} },
    );
  return {
    actor,
    tripId,
    sourceId,
    representationId,
    operationId,
    gateway,
    owner,
    preparation,
    request,
  };
}
it("normal Backend Auth precedes every V4 preparation capability", async () => {
  const f = fixture();
  const r = await createDevBackendHandler({ gateway: f.gateway })(f.request(false));
  expect(r.status).toBe(401);
  expect(f.gateway.canReadTrip).not.toHaveBeenCalled();
});
it("denied Trip does not disclose preparation capability", async () => {
  const f = fixture();
  vi.mocked(f.gateway.canReadTrip).mockResolvedValue(false);
  const r = await createDevBackendHandler({ gateway: f.gateway })(f.request());
  expect(r.status).toBe(403);
  expect(f.gateway.canReadTrip).toHaveBeenCalledExactlyOnceWith(f.actor, f.tripId);
});
it("omitted startup port remains private and closed without reading bytes", async () => {
  const f = fixture(),
    q = f.request();
  Object.defineProperty(q, "body", {
    get() {
      throw Error("NO_BODY_READ");
    },
  });
  const log = vi.fn();
  const r = await createDevBackendHandler({ gateway: f.gateway, log })(q);
  expect(r.status).toBe(503);
  expect((await r.json()).error.code).toBe("SOURCE_CAPABILITY_CLOSED");
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(JSON.stringify(log.mock.calls)).not.toContain(f.sourceId);
});
it("a supplied owning port receives the authenticated route identity, not a new authority", async () => {
  const f = fixture();
  const r = await createDevBackendHandler({
    gateway: f.gateway,
    sourcePdfV4PreparationPort: { owner: f.owner, preparation: f.preparation } as never,
  })(f.request());
  expect(r.status).toBe(200);
  expect(f.owner.accountGeneration).toHaveBeenCalledExactlyOnceWith(f.actor);
  expect(f.preparation.upload).toHaveBeenCalledOnce();
  expect(f.preparation.upload.mock.calls[0][1]).toEqual({
    tripId: f.tripId,
    sourceId: f.sourceId,
    representationId: f.representationId,
    operationId: f.operationId,
    accountGeneration: 2,
  });
});
