import { afterEach, expect, it, vi } from "vitest";
import { createMcpAccountReadBinding } from "./mcpAccountReadBinding";
import type { CoreHttpConnection } from "./tripCoreV2Http";
import * as coreHttp from "./tripCoreV2Http";
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
  const readDiagnostic = vi.fn();
  const ports = {
    readDiagnostic,
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
    readDiagnostic,
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

it("diagnoses expiry before a collection read without entering the owning boundary", async () => {
  vi.useFakeTimers();
  const q = setup();
  const binding = await createMcpAccountReadBinding(q.ports)(q.grant, q.signal);
  vi.setSystemTime(q.grant.expiresAt);
  expect((await binding.read(`/v2/trips/${trip}/core/collection`, q.signal)).status).toBe(
    401,
  );
  expect(q.collection).not.toHaveBeenCalled();
  expect(q.canReadTrip).not.toHaveBeenCalled();
  expect(q.readDiagnostic.mock.calls.map(([event]) => event.stage)).toEqual([
    "PRECHECK",
    "PRECHECK",
  ]);
  expect(q.readDiagnostic.mock.calls.at(-1)![0]).toMatchObject({
    resource: "COLLECTION",
    failure: "EXPIRED",
    remainingMs: 0,
  });
});

it("distinguishes an owning success suppressed by expiry during Item IO", async () => {
  vi.useFakeTimers();
  const q = setup();
  q.grant.expiresAt = Date.now() + 1000;
  const binding = await createMcpAccountReadBinding(q.ports)(q.grant, q.signal);
  q.readItem.mockImplementationOnce(async () => {
    vi.setSystemTime(q.grant.expiresAt);
    return { unit: "owning response" };
  });
  const response = await binding.read(
    `/v2/trips/${trip}/core/objects/ITEM/${item}`,
    q.signal,
  );
  expect(response.status).toBe(401);
  expect(q.readItem).toHaveBeenCalledOnce();
  expect(q.readDiagnostic.mock.calls.map(([event]) => event.stage)).toEqual([
    "PRECHECK",
    "OWNING_ENTERED",
    "OWNING_RETURNED",
    "POSTCHECK",
    "POSTCHECK",
  ]);
  expect(q.readDiagnostic.mock.calls.at(-1)![0]).toMatchObject({
    failure: "EXPIRED",
    owningResponseStatus: 200,
    remainingMs: 0,
  });
  expect(
    new Set(q.readDiagnostic.mock.calls.map(([event]) => event.diagnosticId)).size,
  ).toBe(1);
  const safe = JSON.stringify(q.readDiagnostic.mock.calls);
  for (const value of [actor, trip, item, "owning response", "Bearer"])
    expect(safe).not.toContain(value);
});

it("uses separate log identities for sequential reads sharing one immutable token expiry", async () => {
  vi.useFakeTimers();
  const q = setup();
  q.grant.expiresAt = Date.now() + 1000;
  const binding = await createMcpAccountReadBinding(q.ports)(q.grant, q.signal);
  expect(
    (await binding.read(`/v2/trips/${trip}/core/objects/ITEM/${item}`, q.signal)).status,
  ).toBe(200);
  const firstId = q.readDiagnostic.mock.calls[0][0].diagnosticId;
  q.readDiagnostic.mockClear();
  vi.setSystemTime(q.grant.expiresAt);
  expect((await binding.read(`/v2/trips/${trip}/core/collection`, q.signal)).status).toBe(
    401,
  );
  expect(q.readDiagnostic.mock.calls[0][0].diagnosticId).not.toBe(firstId);
  expect(q.readDiagnostic.mock.calls.at(-1)![0]).toMatchObject({
    resource: "COLLECTION",
    stage: "PRECHECK",
    failure: "EXPIRED",
  });
  expect(q.readItem).toHaveBeenCalledOnce();
  expect(q.collection).not.toHaveBeenCalled();
});

it.each(["cancel", "timeout"])(
  "records %s without calling it expiry or changing response semantics",
  async (mode) => {
    vi.useFakeTimers();
    const q = setup();
    const binding = await createMcpAccountReadBinding(q.ports)(q.grant, q.parent.signal);
    let release!: () => void;
    q.readItem.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ unit: "late" });
        }),
    );
    const pending = binding.read(`/v2/trips/${trip}/core/objects/ITEM/${item}`, q.signal);
    while (!release) await Promise.resolve();
    if (mode === "cancel") q.parent.abort();
    else await vi.advanceTimersByTimeAsync(50000);
    expect((await pending).status).toBe(503);
    expect(q.readDiagnostic.mock.calls.at(-1)![0]).toMatchObject({
      stage: "OWNING_ENTERED",
      failure: mode === "cancel" ? "CANCELED" : "TIMEOUT",
    });
    const count = q.readDiagnostic.mock.calls.length;
    release();
    for (let n = 0; n < 20; n++) await Promise.resolve();
    expect(q.readDiagnostic).toHaveBeenCalledTimes(count);
  },
);

it("keeps the existing owning status and ignores diagnostic observer failures", async () => {
  const q = setup();
  q.readDiagnostic.mockImplementation(() => {
    throw Error("LOG_FAILURE");
  });
  const binding = await createMcpAccountReadBinding(q.ports)(q.grant, q.signal);
  q.canReadTrip.mockResolvedValue(false);
  expect(
    (await binding.read(`/v2/trips/${trip}/core/objects/ITEM/${item}`, q.signal)).status,
  ).toBe(404);
  expect(q.readItem).not.toHaveBeenCalled();
  expect(q.readDiagnostic).toHaveBeenCalledTimes(4);
});

it("distinguishes a forwarded owning 401 from a locally expired grant", async () => {
  const q = setup();
  const owning = vi
    .spyOn(coreHttp, "coreHttpBoundary")
    .mockResolvedValueOnce(Response.json({ error: "UNIT_OWNING_401" }, { status: 401 }));
  try {
    const binding = await createMcpAccountReadBinding(q.ports)(q.grant, q.signal);
    expect(
      (await binding.read(`/v2/trips/${trip}/core/objects/ITEM/${item}`, q.signal))
        .status,
    ).toBe(401);
    expect(q.readDiagnostic.mock.calls.at(-1)![0]).toMatchObject({
      stage: "POSTCHECK",
      owningResponseStatus: 401,
    });
    expect(q.readDiagnostic.mock.calls.some(([event]) => event.failure)).toBe(false);
    expect(q.readDiagnostic.mock.calls.at(-1)![0].remainingMs).toBeGreaterThan(0);
  } finally {
    owning.mockRestore();
  }
});
