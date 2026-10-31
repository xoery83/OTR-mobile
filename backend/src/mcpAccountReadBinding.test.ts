import { afterEach, expect, it, vi } from "vitest";
import { createMcpAccountReadBinding } from "./mcpAccountReadBinding";
import type { CoreHttpConnection } from "./tripCoreV2Http";
const actor = "11111111-1111-4111-8111-111111111111";
const trip = "22222222-2222-4222-8222-222222222222";
const item = "33333333-3333-4333-8333-333333333333";
function setup() {
  const grant = {
    accountId: actor,
    clientId: actor,
    sessionId: trip,
    resource: "https://api-dev.xoery.art/mcp",
    scopes: ["otr.trips.read"],
    expiresAt: Date.now() + 60000,
  };
  const discoverTrips = vi.fn(async () => ({ trips: [], nextCursor: null }));
  const canReadTrip = vi.fn(async () => true);
  const readItem = vi.fn(async () => ({ unit: "owning response" }));
  const collection = vi.fn(async () => ({ manifest: {}, pages: [] }));
  const command = vi.fn();
  const ports = {
    discovery: { discoverTrips },
    canReadTrip,
    core: {
      read: { item: readItem, collection },
      commands: command,
      hash: vi.fn(),
      readOperation: command,
    } as unknown as CoreHttpConnection,
  };
  return {
    grant,
    discoverTrips,
    canReadTrip,
    readItem,
    collection,
    command,
    ports,
    parent: new AbortController(),
    signal: new AbortController().signal,
  };
}
afterEach(() => vi.useRealTimers());

it("defaults closed; binds only the trusted Account and returns no mutation port", async () => {
  const q = setup();
  await expect(createMcpAccountReadBinding()(q.grant, q.parent.signal)).rejects.toThrow(
    "CLOSED",
  );
  const binding = await createMcpAccountReadBinding(q.ports)(q.grant, q.parent.signal);
  expect(Object.keys(binding)).toEqual(["read"]);
  q.grant.accountId = item;
  const response = await binding.read("/v2/trips?limit=2", q.signal);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ trips: [], nextCursor: null });
  expect(q.discoverTrips).toHaveBeenCalledWith(actor, null, 2);
  expect(q.command).not.toHaveBeenCalled();
});

it("uses existing Core ACL/detail response and refuses foreign Trip before reading", async () => {
  const q = setup(),
    binding = await createMcpAccountReadBinding(q.ports)(q.grant, q.parent.signal);
  const path = `/v2/trips/${trip}/core/objects/ITEM/${item}`;
  const response = await binding.read(path, q.signal);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ unit: "owning response" });
  expect(q.canReadTrip).toHaveBeenCalledWith(actor, trip);
  expect(q.readItem).toHaveBeenCalledWith(actor, trip, item);
  q.readItem.mockClear();
  q.canReadTrip.mockResolvedValue(false);
  expect((await binding.read(path, q.signal)).status).toBe(404);
  expect(q.readItem).not.toHaveBeenCalled();
});

it("keeps owning discovery query and Core collection validation", async () => {
  const q = setup(),
    binding = await createMcpAccountReadBinding(q.ports)(q.grant, q.parent.signal);
  expect((await binding.read("/v2/trips?actor=" + item, q.signal)).status).toBe(400);
  expect(q.discoverTrips).not.toHaveBeenCalled();
  expect((await binding.read(`/v2/trips/${trip}/core/collection`, q.signal)).status).toBe(
    400,
  );
  expect(q.collection).toHaveBeenCalledWith(actor, trip, undefined);
  expect(q.command).not.toHaveBeenCalled();
});

it.each([
  "https://other.invalid/v2/trips",
  "//other.invalid/v2/trips",
  "/v2/trips#hidden",
  "/v2/trips/../trips",
  "/v2/trips/%2e%2e/trips",
  "/v2/trips?limit=1#hidden",
  `/v2/trips/${trip}/core/commands`,
  `/v2/trips/${trip}/core/operations/${item}`,
  `/v2/trips/${trip}/core/documents/${item}`,
  `/v2/trips/${trip}/metadata`,
  `/v2/trips/${trip}/core/capabilities`,
])("refuses route expansion %s", async (path) => {
  const q = setup(),
    binding = await createMcpAccountReadBinding(q.ports)(q.grant, q.parent.signal);
  expect([400, 404]).toContain((await binding.read(path, q.signal)).status);
  expect(q.discoverTrips).not.toHaveBeenCalled();
  expect(q.canReadTrip).not.toHaveBeenCalled();
  expect(q.command).not.toHaveBeenCalled();
});

it("rejects write scopes, expired binding and pre-aborted request", async () => {
  const q = setup(),
    bind = createMcpAccountReadBinding(q.ports);
  await expect(
    bind({ ...q.grant, scopes: ["otr.trips.read", "otr.trips.write"] }, q.parent.signal),
  ).rejects.toThrow();
  await expect(bind({ ...q.grant, expiresAt: 1 }, q.parent.signal)).rejects.toThrow(
    "EXPIRED",
  );
  q.parent.abort();
  await expect(bind(q.grant, q.parent.signal)).rejects.toThrow();
  expect(q.discoverTrips).not.toHaveBeenCalled();
});

it("suppresses results when the tool/request is canceled or expires during owning IO", async () => {
  for (const mode of ["tool", "request", "expiry"]) {
    const q = setup(),
      controller = new AbortController();
    const binding = await createMcpAccountReadBinding(q.ports)(q.grant, q.parent.signal);
    q.discoverTrips.mockImplementationOnce(async () => {
      if (mode === "tool") controller.abort();
      else if (mode === "request") q.parent.abort();
      else {
        vi.useFakeTimers();
        vi.setSystemTime(q.grant.expiresAt);
      }
      return { trips: [], nextCursor: null };
    });
    expect([401, 503]).toContain(
      (await binding.read("/v2/trips", controller.signal)).status,
    );
    vi.useRealTimers();
  }
});

it("bounds an abort-ignoring owning read without any network request", async () => {
  vi.useFakeTimers();
  const q = setup(),
    binding = await createMcpAccountReadBinding(q.ports)(q.grant, q.parent.signal);
  q.discoverTrips.mockImplementationOnce(() => new Promise(() => {}));
  const result = binding.read("/v2/trips", q.signal);
  await vi.advanceTimersByTimeAsync(50000);
  expect((await result).status).toBe(503);
});
