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
it.each([200, 503])(
  "request-scoped composition closes on business result %s",
  async (status) => {
    const f = fixture(),
      close = vi.fn();
    if (status === 503) f.preparation.upload.mockRejectedValue(Error("UNKNOWN"));
    const scoped = vi.fn(async () => ({
      port: { owner: f.owner, preparation: f.preparation } as never,
      close,
    }));
    const r = await createDevBackendHandler({
      gateway: f.gateway,
      sourcePdfV4PreparationForRequest: scoped,
    })(f.request());
    expect(r.status).toBe(status);
    expect(scoped).toHaveBeenCalledExactlyOnceWith(expect.any(Request), f.actor);
    expect(close).toHaveBeenCalledOnce();
  },
);
it.each(["Auth", "Trip"])(
  "request scope is not composed before normal %s authorization",
  async (denied) => {
    const f = fixture(),
      scoped = vi.fn();
    if (denied === "Trip") vi.mocked(f.gateway.canReadTrip).mockResolvedValue(false);
    const r = await createDevBackendHandler({
      gateway: f.gateway,
      sourcePdfV4PreparationForRequest: scoped,
    })(f.request(denied !== "Auth"));
    expect(r.status).toBe(denied === "Auth" ? 401 : 403);
    expect(scoped).not.toHaveBeenCalled();
  },
);
it("an explicitly closed request scope never falls back to an older global port", async () => {
  const f = fixture();
  const r = await createDevBackendHandler({
    gateway: f.gateway,
    sourcePdfV4PreparationPort: { owner: f.owner, preparation: f.preparation } as never,
    sourcePdfV4PreparationForRequest: async () => undefined,
  })(f.request());
  expect(r.status).toBe(503);
  expect(f.preparation.upload).not.toHaveBeenCalled();
});
it("request abort during composition closes its scope before any IO", async () => {
  const f = fixture(),
    controller = new AbortController(),
    close = vi.fn();
  const request = new Request(f.request(), { signal: controller.signal });
  await createDevBackendHandler({
    gateway: f.gateway,
    sourcePdfV4PreparationForRequest: async () => {
      controller.abort();
      return { port: { owner: f.owner, preparation: f.preparation } as never, close };
    },
  })(request);
  expect(close).toHaveBeenCalledOnce();
  expect(f.preparation.upload).not.toHaveBeenCalled();
});
