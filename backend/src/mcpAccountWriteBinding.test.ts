import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createMcpAccountWriteBinding } from "./mcpAccountWriteBinding";
import type { CoreHttpConnection } from "./tripCoreV2Http";

const actor = "11111111-1111-4111-8111-111111111111";
const trip = "22222222-2222-4222-8222-222222222222";
const item = "33333333-3333-4333-8333-333333333333";
const operation = "44444444-4444-4444-8444-444444444444";
const commandPath = `/v2/trips/${trip}/core/commands`;
const operationPath = `/v2/trips/${trip}/core/operations/${operation}`;
function setup() {
  const grant = {
    accountId: actor,
    clientId: actor,
    sessionId: trip,
    resource: "https://api-dev.xoery.art/mcp",
    scopes: ["otr.trips.read", "otr.trips.write"],
    expiresAt: Date.now() + 60000,
  };
  const canReadTrip = vi.fn(async () => true);
  const withLockedCommand = vi.fn<CoreHttpConnection["commands"]["withLockedCommand"]>(
    async () => {
      throw Error("OWNING_COMMAND_PORT_UNAVAILABLE");
    },
  );
  const readOperation = vi.fn(async () => null);
  const discoverTrips = vi.fn(async () => ({ trips: [], nextCursor: null }));
  const isWriteGrantCurrent = vi.fn(async () => true);
  const hash = vi.fn(async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex"),
  );
  const ports = {
    isWriteGrantCurrent,
    discovery: { discoverTrips },
    canReadTrip,
    core: {
      commands: { withLockedCommand },
      hash,
      readOperation,
    } as unknown as CoreHttpConnection,
  };
  const command = {
    contractVersion: 2,
    intentVersion: 2,
    operationId: operation,
    tripId: trip,
    command: "SET_ITEM_TEXT",
    target: { kind: "ITEM", id: item },
    baseVector: [{ kind: "ITEM", id: item, revision: 1 }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: { title: "Synthetic QA edit" },
  };
  return {
    grant,
    ports,
    command,
    canReadTrip,
    withLockedCommand,
    readOperation,
    discoverTrips,
    isWriteGrantCurrent,
    hash,
    parent: new AbortController(),
    signal: new AbortController().signal,
  };
}
afterEach(() => vi.useRealTimers());

it("snapshots the confirmed method/operation/payload before awaiting current consent", async () => {
  const q = setup(),
    binding = await createMcpAccountWriteBinding(q.ports)(q.grant, q.signal);
  let release!: (active: boolean) => void;
  q.isWriteGrantCurrent.mockImplementationOnce(
    () =>
      new Promise<boolean>((done) => {
        release = done;
      }),
  );
  const input: { method: "GET" | "POST"; path: string; body: typeof q.command } = {
    method: "POST",
    path: commandPath,
    body: q.command,
  };
  const pending = binding.backend(input, q.signal);
  input.method = "GET";
  input.path = operationPath;
  input.body.operationId = item;
  input.body.payload.title = "Changed after confirmation";
  release(true);
  expect((await pending).status).toBe(503);
  expect(q.withLockedCommand).toHaveBeenCalledOnce();
  expect(q.withLockedCommand.mock.calls[0][0].operationId).toBe(operation);
  const hashed = new TextDecoder().decode(q.hash.mock.calls[0][0]);
  expect(hashed).toContain("Synthetic QA edit");
  expect(hashed).not.toContain("Changed after confirmation");
  expect(q.readOperation).not.toHaveBeenCalled();
});

it("bounds a stalled current-consent verifier before exposing any binding", async () => {
  vi.useFakeTimers();
  const q = setup();
  q.isWriteGrantCurrent.mockImplementationOnce(() => new Promise(() => {}));
  const pending = createMcpAccountWriteBinding(q.ports)(q.grant, q.signal);
  const rejected = expect(pending).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(10000);
  await rejected;
  expect(q.withLockedCommand).not.toHaveBeenCalled();
});

it("rejects revoked Write consent before binding or dispatch and suppresses late data", async () => {
  const q = setup(),
    bind = createMcpAccountWriteBinding(q.ports);
  q.isWriteGrantCurrent.mockResolvedValue(false);
  await expect(bind(q.grant, q.signal)).rejects.toThrow("INACTIVE");
  q.isWriteGrantCurrent.mockResolvedValue(true);
  const binding = await bind(q.grant, q.signal);
  q.isWriteGrantCurrent.mockResolvedValue(false);
  expect(
    (
      await binding.backend(
        { method: "POST", path: commandPath, body: q.command },
        q.signal,
      )
    ).status,
  ).toBe(401);
  expect(q.withLockedCommand).not.toHaveBeenCalled();
  q.isWriteGrantCurrent.mockResolvedValue(true);
  q.readOperation.mockImplementationOnce(async () => {
    q.isWriteGrantCurrent.mockResolvedValue(false);
    return null;
  });
  expect(
    (await binding.backend({ method: "GET", path: operationPath }, q.signal)).status,
  ).toBe(401);
});

it("defaults closed and refuses Read-only, wrong resource and expired grants", async () => {
  const q = setup();
  await expect(createMcpAccountWriteBinding()(q.grant, q.signal)).rejects.toThrow(
    "CLOSED",
  );
  const bind = createMcpAccountWriteBinding(q.ports);
  for (const change of [
    { scopes: ["otr.trips.read"] },
    { scopes: ["otr.trips.write", "otr.trips.write"] },
    { resource: "https://other.invalid/mcp" },
    { expiresAt: 1 },
  ])
    await expect(bind({ ...q.grant, ...change }, q.signal)).rejects.toThrow();
  expect(q.withLockedCommand).not.toHaveBeenCalled();
});

it("reuses Read and existing Core validation, fixes Actor and dispatches the stable operation once", async () => {
  const q = setup(),
    binding = await createMcpAccountWriteBinding(q.ports)(q.grant, q.signal);
  q.grant.accountId = item;
  expect((await binding.read("/v2/trips", q.signal)).status).toBe(200);
  expect(q.discoverTrips).toHaveBeenCalledWith(actor, null, 20);
  const result = await binding.backend(
    {
      method: "POST",
      path: commandPath,
      body: q.command,
      headers: { Authorization: "Bearer ignored", "X-OTR-Core-Contract-Version": "1" },
    },
    q.signal,
  );
  expect(result.status).toBe(503);
  expect(q.canReadTrip).toHaveBeenCalledWith(actor, trip);
  expect(q.withLockedCommand).toHaveBeenCalledOnce();
  expect(q.withLockedCommand.mock.calls[0][0]).toMatchObject({
    actorAccountId: actor,
    tripId: trip,
    operationId: operation,
  });
  expect(
    (await binding.backend({ method: "GET", path: operationPath }, q.signal)).status,
  ).toBe(404);
  expect(q.readOperation).toHaveBeenCalledWith(actor, trip, operation);
  expect(q.withLockedCommand).toHaveBeenCalledOnce();
});

it("denies foreign Trip and rejects body scope or authority injection before Core dispatch", async () => {
  const q = setup(),
    binding = await createMcpAccountWriteBinding(q.ports)(q.grant, q.signal);
  q.canReadTrip.mockResolvedValue(false);
  expect(
    (
      await binding.backend(
        { method: "POST", path: commandPath, body: q.command },
        q.signal,
      )
    ).status,
  ).toBe(404);
  q.canReadTrip.mockResolvedValue(true);
  for (const body of [
    { ...q.command, tripId: item },
    { ...q.command, actorAccountId: item },
  ])
    expect([400, 404]).toContain(
      (await binding.backend({ method: "POST", path: commandPath, body }, q.signal))
        .status,
    );
  expect(q.withLockedCommand).not.toHaveBeenCalled();
});

it.each([
  ["POST", "/v2/trips"],
  ["POST", operationPath],
  ["GET", commandPath],
  ["POST", commandPath + "?actor=" + item],
  ["POST", `/v2/trips/${trip}/core/source-plans/prepare`],
  ["POST", "https://other.invalid" + commandPath],
  ["POST", "//other.invalid" + commandPath],
  ["POST", commandPath + "#hidden"],
  ["POST", `/v2/trips/${trip}/core/../core/commands`],
] as const)(
  "refuses extra route/method %s %s without owning IO",
  async (method, path) => {
    const q = setup(),
      binding = await createMcpAccountWriteBinding(q.ports)(q.grant, q.signal);
    expect([400, 404]).toContain(
      (await binding.backend({ method, path, body: q.command }, q.signal)).status,
    );
    expect(q.canReadTrip).not.toHaveBeenCalled();
    expect(q.withLockedCommand).not.toHaveBeenCalled();
    expect(q.readOperation).not.toHaveBeenCalled();
  },
);

it("suppresses late responses after expiry/cancel and never retries an uncertain POST", async () => {
  for (const mode of ["expiry", "cancel"]) {
    const q = setup(),
      binding = await createMcpAccountWriteBinding(q.ports)(q.grant, q.parent.signal);
    q.readOperation.mockImplementationOnce(async () => {
      if (mode === "expiry") {
        vi.useFakeTimers();
        vi.setSystemTime(q.grant.expiresAt);
      } else q.parent.abort();
      return null;
    });
    expect([401, 503]).toContain(
      (await binding.backend({ method: "GET", path: operationPath }, q.signal)).status,
    );
    expect(q.withLockedCommand).not.toHaveBeenCalled();
    vi.useRealTimers();
  }
  vi.useFakeTimers();
  const q = setup(),
    binding = await createMcpAccountWriteBinding(q.ports)(q.grant, q.signal);
  q.withLockedCommand.mockImplementationOnce(() => new Promise<never>(() => {}));
  const result = binding.backend(
    { method: "POST", path: commandPath, body: q.command },
    q.signal,
  );
  await vi.advanceTimersByTimeAsync(50000);
  expect((await result).status).toBe(503);
  expect(q.withLockedCommand).toHaveBeenCalledOnce();
});
