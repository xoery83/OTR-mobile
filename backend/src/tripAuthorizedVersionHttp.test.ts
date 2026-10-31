import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { coreHttpBoundary, type CoreHttpConnection } from "./tripCoreV2Http";
const actor = randomUUID(),
  trip = randomUUID();
const dto = {
  version: "otr.core.authorized-trip-version/1",
  actorAccountId: actor,
  tripId: trip,
  token: "a".repeat(64),
};
const request = (headers: Record<string, string> = {}) =>
  new Request(`https://dev.invalid/v2/trips/${trip}/core/authorized-version`, {
    headers,
  });
function port(value: unknown = dto) {
  const read = vi.fn(async () => value);
  return {
    read,
    connection: { read: { authorizedVersion: read } } as unknown as CoreHttpConnection,
  };
}
it("returns only the authenticated Actor-scoped DTO and selected projection mode", async () => {
  const f = port();
  const response = await coreHttpBoundary(
    request({ "X-OTR-Ordinary-Order-Version": "1" }),
    actor,
    async () => true,
    f.connection,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(dto);
  expect(f.read).toHaveBeenCalledWith(actor, trip, 1);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("denies foreign Trip before requesting its version; missing port remains closed", async () => {
  const f = port();
  const denied = await coreHttpBoundary(
    request(),
    actor,
    async () => false,
    f.connection,
  );
  expect(denied.status).toBe(404);
  expect(f.read).not.toHaveBeenCalled();
  expect((await coreHttpBoundary(request(), actor, async () => true)).status).toBe(503);
});
it("does not expose a mismatched Actor or global counter from a faulty port", async () => {
  for (const value of [
    { ...dto, actorAccountId: randomUUID() },
    { ...dto, revision: 4 },
  ]) {
    const f = port(value);
    const response = await coreHttpBoundary(
      request(),
      actor,
      async () => true,
      f.connection,
    );
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(dto.token);
  }
});
it("rejects unsupported projection mode without reading", async () => {
  const f = port();
  expect(
    (
      await coreHttpBoundary(
        request({ "X-OTR-Ordinary-Order-Version": "2" }),
        actor,
        async () => true,
        f.connection,
      )
    ).status,
  ).toBe(426);
  expect(f.read).not.toHaveBeenCalled();
});
