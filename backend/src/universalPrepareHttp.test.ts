import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import { universalPrepareBoundary } from "./universalPrepareHttp";
function fixture() {
  const actor = randomUUID(),
    tripId = randomUUID(),
    batchId = randomUUID();
  const input = {
    tripId,
    batchId,
    submissionSha256: "a".repeat(64),
    inputs: [
      {
        id: randomUUID(),
        source_id: randomUUID(),
        representation_id: randomUUID(),
        material_revision: 1,
        payload_sha256: "b".repeat(64),
        byte_count: 40,
        observed_source_row_revision: 1,
        historical_selection: false,
      },
    ],
  };
  const context = {
    version: "otr.backend.universal-context/1",
    actorId: actor,
    accountId: actor,
    tripId,
    batchId,
    taskId: randomUUID(),
  };
  const prepare = vi.fn(async () => ({ status: "QUEUED", context }));
  const request = (body: unknown = input, token = "valid") =>
    new Request(`https://local/v2/import-batches/${batchId}/interpretations/prepare`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": batchId },
      body: JSON.stringify(body),
    });
  return { actor, input, context, prepare, request };
}
it("authenticates per request before explicit preparation and returns queued owning context", async () => {
  const f = fixture(),
    factory = vi.fn(async (_request: Request, _actor: string) => ({
      prepare: f.prepare,
    }));
  const handler = createDevBackendHandler({
    universalRuntimeForRequest: factory,
    gateway: {
      validateAccessToken: async (t: string) => (t === "valid" ? { id: f.actor } : null),
      canReadTrip: async (a: string, t: string) => a === f.actor && t === f.input.tripId,
    } as unknown as DevBackendGateway,
  });
  expect((await handler(f.request(undefined, "invalid"))).status).toBe(401);
  expect(factory).not.toHaveBeenCalled();
  const r = await handler(f.request());
  expect(r.status).toBe(202);
  expect(await r.json()).toEqual({ status: "QUEUED", context: f.context });
  expect(factory.mock.calls[0][1]).toBe(f.actor);
  expect(f.prepare).toHaveBeenCalledExactlyOnceWith(f.input.tripId, f.input);
});
it("rejects scope and authority forgery and stays closed without an owning runtime", async () => {
  const f = fixture(),
    allowed = vi.fn(async () => true);
  expect(
    (
      await universalPrepareBoundary(
        f.request({ ...f.input, actorId: f.actor }),
        f.actor,
        allowed,
        f.prepare,
      )
    ).status,
  ).toBe(400);
  expect(
    (await universalPrepareBoundary(f.request(), f.actor, async () => false, f.prepare))
      .status,
  ).toBe(404);
  expect((await universalPrepareBoundary(f.request(), f.actor, allowed)).status).toBe(
    503,
  );
  expect(f.prepare).not.toHaveBeenCalled();
  f.prepare.mockResolvedValueOnce({
    status: "QUEUED",
    context: { ...f.context, accountId: randomUUID() },
  });
  expect(
    (await universalPrepareBoundary(f.request(), f.actor, allowed, f.prepare)).status,
  ).toBe(503);
});

it("classifies malformed/duplicate JSON before any owning prepare call", async () => {
  const f = fixture();
  for (const body of ["{broken", '{"tripId":"a","tripId":"b"}']) {
    const request = new Request(f.request().url, {
      method: "POST",
      headers: { "Idempotency-Key": f.input.batchId },
      body,
    });
    expect(
      (await universalPrepareBoundary(request, f.actor, async () => true, f.prepare))
        .status,
    ).toBe(400);
  }
  expect(f.prepare).not.toHaveBeenCalled();
});
