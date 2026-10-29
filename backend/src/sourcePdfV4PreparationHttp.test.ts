import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { sourcePdfV4PreparationBoundary } from "./sourcePdfV4PreparationHttp";
function fixture() {
  const actor = randomUUID(),
    tripId = randomUUID(),
    sourceId = randomUUID(),
    representationId = randomUUID(),
    operationId = randomUUID();
  const owner = { accountGeneration: vi.fn(async () => 7) };
  const preparation = {
    ingress: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    upload: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    observeRetained: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  };
  const canReadTrip = vi.fn(async () => true);
  const request = (action: string, body?: string) =>
    new Request(
      `https://dev.example.invalid/v2/trips/${tripId}/sources/${sourceId}/representations/${representationId}/pdf-v4/${operationId}/${action}`,
      {
        method: "POST",
        ...(body === undefined ? {} : { body }),
        headers: { "Content-Type": "application/pdf", "X-Account-Generation": "999" },
      },
    );
  const identity = {
    tripId,
    sourceId,
    representationId,
    operationId,
    accountGeneration: 7,
  };
  const call = (q: Request, port: unknown = { owner, preparation }) =>
    sourcePdfV4PreparationBoundary(q, actor, canReadTrip, port as never);
  return { actor, owner, preparation, canReadTrip, request, identity, call };
}
it("omitted preparation stays closed before body consumption or generation lookup", async () => {
  const f = fixture(),
    q = f.request("stage", "%PDF");
  Object.defineProperty(q, "body", {
    get() {
      throw Error("BODY_MUST_NOT_BE_READ");
    },
  });
  const r = await sourcePdfV4PreparationBoundary(q, f.actor, f.canReadTrip);
  expect(r.status).toBe(503);
  expect((await r.json()).error.code).toBe("SOURCE_CAPABILITY_CLOSED");
  expect(f.owner.accountGeneration).not.toHaveBeenCalled();
});
it.each(["stage", "dispatch", "observe-retained"])(
  "denied Trip never reaches %s preparation",
  async (action) => {
    const f = fixture();
    f.canReadTrip.mockResolvedValue(false);
    expect((await f.call(f.request(action))).status).toBe(403);
    expect(f.owner.accountGeneration).not.toHaveBeenCalled();
    for (const method of Object.values(f.preparation))
      expect(method).not.toHaveBeenCalled();
  },
);
it.each([
  ["stage", "ingress", "STAGED"],
  ["dispatch", "upload", "DISPATCH_OBSERVED"],
  ["observe-retained", "observeRetained", "READ_OBSERVED"],
] as const)(
  "%s delegates the exact owning identity and hides internal capabilities",
  async (action, method, observation) => {
    const f = fixture(),
      q = f.request(action, action === "stage" ? "%PDF-owned" : undefined);
    f.preparation[method].mockResolvedValue({
      resourceKey: "PRIVATE",
      runToken: "PRIVATE",
      context: { binding: { secret: "PRIVATE" } },
    });
    const r = await f.call(q);
    expect(r.status).toBe(200);
    expect(f.owner.accountGeneration).toHaveBeenCalledExactlyOnceWith(f.actor);
    expect(f.preparation[method].mock.calls[0].slice(0, 2)).toEqual([q, f.identity]);
    if (method === "upload") expect(f.preparation.upload.mock.calls[0][2]).toBe(q.signal);
    expect(await r.json()).toEqual({
      sourceId: f.identity.sourceId,
      representationId: f.identity.representationId,
      operationId: f.identity.operationId,
      observation,
    });
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  },
);
it.each(["dispatch", "observe-retained"])(
  "%s refuses arbitrary metadata bodies",
  async (action) => {
    const f = fixture();
    expect((await f.call(f.request(action, '{"actor":"OTHER"}'))).status).toBe(422);
    for (const method of Object.values(f.preparation))
      expect(method).not.toHaveBeenCalled();
  },
);
it("requires the existing owner's positive generation, never caller fallback", async () => {
  const f = fixture();
  f.owner.accountGeneration.mockResolvedValue(0);
  expect((await f.call(f.request("stage", "%PDF"))).status).toBe(403);
  expect(f.preparation.ingress).not.toHaveBeenCalled();
});
it("rejects route/query/method drift before preparation", async () => {
  const f = fixture(),
    q = f.request("stage");
  expect(
    (await f.call(new Request(q.url + "?actor=other", { method: "POST" }))).status,
  ).toBe(400);
  expect((await f.call(new Request(q.url, { method: "GET" }))).status).toBe(405);
  expect((await f.call(f.request("delete"))).status).toBe(400);
  expect(f.owner.accountGeneration).not.toHaveBeenCalled();
});
it("redacts private errors and never retries uncertain dispatch", async () => {
  const f = fixture();
  f.preparation.upload.mockRejectedValue(Error("PRIVATE storage path credential"));
  const r = await f.call(f.request("dispatch"));
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("PRIVATE");
  expect(f.preparation.upload).toHaveBeenCalledOnce();
  expect(f.preparation.observeRetained).not.toHaveBeenCalled();
});

it.each(["before", "during-access", "during-generation"] as const)(
  "cancellation %s never reaches a preparation operation",
  async (phase) => {
    const f = fixture(),
      controller = new AbortController();
    const q = new Request(f.request("dispatch"), { signal: controller.signal });
    if (phase === "before") controller.abort();
    else if (phase === "during-access")
      f.canReadTrip.mockImplementation(async () => {
        controller.abort();
        return true;
      });
    else
      f.owner.accountGeneration.mockImplementation(async () => {
        controller.abort();
        return 7;
      });
    expect((await f.call(q)).status).toBe(503);
    for (const method of Object.values(f.preparation))
      expect(method).not.toHaveBeenCalled();
    if (phase !== "during-generation")
      expect(f.owner.accountGeneration).not.toHaveBeenCalled();
  },
);

it("an UNKNOWN observation cannot start a second dispatch or automatic read", async () => {
  const f = fixture();
  f.preparation.upload.mockResolvedValue({
    outcome: "UNKNOWN",
    binding: { runToken: "PRIVATE" },
  });
  const response = await f.call(f.request("dispatch"));
  expect(response.status).toBe(200);
  expect(await response.text()).not.toContain("PRIVATE");
  expect(f.preparation.upload).toHaveBeenCalledOnce();
  expect(f.preparation.observeRetained).not.toHaveBeenCalled();
  expect(f.preparation.ingress).not.toHaveBeenCalled();
});
it.each([
  ["PDF_DUPLICATE_DISPATCH", 409, "SOURCE_CAS_CONFLICT"],
  ["PDF_SCOPE_FORBIDDEN", 403, "SOURCE_ACCESS_DENIED"],
] as const)("retains the %s owning rejection", async (error, status, code) => {
  const f = fixture();
  f.preparation.upload.mockRejectedValue(Error(error));
  const r = await f.call(f.request("dispatch"));
  expect(r.status).toBe(status);
  expect((await r.json()).error.code).toBe(code);
  expect(f.preparation.upload).toHaveBeenCalledOnce();
});
it("a revoked bearer discovered by existing preparation stays an auth denial", async () => {
  const f = fixture();
  f.preparation.upload.mockRejectedValue(
    Object.assign(Error("PRIVATE auth message"), { status: 401 }),
  );
  const r = await f.call(f.request("dispatch"));
  expect(r.status).toBe(401);
  expect((await r.json()).error.code).toBe("AUTH_REQUIRED");
});
it.each([
  "PDF_INGRESS_UNSUPPORTED",
  "PDF_LENGTH_MISMATCH",
  "PDF_INGRESS_INTEGRITY_MISMATCH",
])("%s is an invalid request, not an IO retry signal", async (code) => {
  const f = fixture();
  f.preparation.ingress.mockRejectedValue(Error(code));
  const r = await f.call(f.request("stage", "%PDF"));
  expect(r.status).toBe(422);
  expect((await r.json()).error.code).toBe("INVALID_SOURCE_COMMAND");
});
it("oversize Stage bytes retain the payload limit rejection", async () => {
  const f = fixture();
  f.preparation.ingress.mockRejectedValue(Error("PDF_TOO_LARGE"));
  expect((await f.call(f.request("stage", "%PDF"))).status).toBe(413);
});
