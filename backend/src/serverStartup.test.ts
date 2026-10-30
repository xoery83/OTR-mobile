import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import type { RequestListener, Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DevBackendGateway } from "./app";
import { createCorePgHttpConnection } from "./tripCoreV2PgHttpConnection";

const fixtures = vi.hoisted(() => ({
  servers: [] as Server[],
  validateAccessToken: vi.fn(),
  canReadTrip: vi.fn(),
  createGateway: vi.fn(),
  scannerStart: vi.fn(),
  scannerStop: vi.fn(),
}));
vi.mock("./supabaseGateway", () => ({
  createSupabaseDevGateway: fixtures.createGateway,
}));
vi.mock("./tripPublicationCatalogRuntime", () => ({
  loadDevPublicationCatalog: () => null,
}));
vi.mock("./flightLiveHost", () => ({
  initializeDevFlightLiveHost: async () => ({ status: "CLOSED" }),
}));
vi.mock("./rateDemandScanner", () => ({
  createRateDemandScanner: () => ({
    start: fixtures.scannerStart,
    stop: fixtures.scannerStop,
    wake: vi.fn(),
  }),
}));
vi.mock("node:http", async () => {
  const actual = await vi.importActual<typeof import("node:http")>("node:http");
  return {
    ...actual,
    createServer: vi.fn((listener: RequestListener) => {
      const server = actual.createServer(listener);
      const listen = server.listen.bind(server);
      // Only this synthetic test replaces the configured bind with ephemeral loopback.
      vi.spyOn(server, "listen").mockImplementation((...args: unknown[]) =>
        listen(0, "127.0.0.1", args.at(-1) as () => void),
      );
      fixtures.servers.push(server);
      return server;
    }),
  };
});
const actor = randomUUID();
const input = {
  operationId: randomUUID(),
  tripId: randomUUID(),
  name: "Synthetic startup trip",
  destination: null,
  startDate: null,
  endDate: null,
};
const accepted = {
  ...input,
  actorAccountId: actor,
  ownerPersonId: randomUUID(),
  coreEpoch: randomUUID(),
  coreRevision: 1,
  coreAccessRevision: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubEnv("OTR_DEV_SUPABASE_URL", "https://tuqigdxrvrerfewsxqgm.supabase.co");
  vi.stubEnv("OTR_DEV_SUPABASE_PUBLISHABLE_KEY", "FAKE_PUBLIC");
  vi.stubEnv("OTR_DEV_SUPABASE_SECRET_KEY", "FAKE_BACKEND");
  vi.stubEnv("OTR_DEV_BACKEND_NETWORK_MODE", "bridge");
  vi.stubEnv("OTR_DEV_BACKEND_BIND_ADDRESS", undefined);
  vi.stubEnv("OTR_DEV_BACKEND_PORT", "8787");
  fixtures.validateAccessToken.mockImplementation(async (token: string) =>
    token === "valid" ? { id: actor, accountClass: "NORMAL_ACCOUNT" as const } : null,
  );
  fixtures.canReadTrip.mockResolvedValue(true);
  fixtures.createGateway.mockReturnValue({
    validateAccessToken: fixtures.validateAccessToken,
    canReadTrip: fixtures.canReadTrip,
  } as unknown as DevBackendGateway);
});
afterEach(async () => {
  for (const server of fixtures.servers.splice(0))
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function address(server: Server) {
  if (!server.listening) await once(server, "listening");
  const bound = server.address();
  if (!bound || typeof bound === "string") throw new Error("TEST_LOOPBACK_UNAVAILABLE");
  return `http://127.0.0.1:${bound.port}`;
}
const post = (url: string, body: unknown = input, token = "valid") =>
  fetch(`${url}/v2/trips`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": input.operationId,
      "X-OTR-Actor-Account-Id": randomUUID(),
    },
    body: JSON.stringify(body),
  });
it.each(["acquire", "result"])(
  "bounds Universal original %s before buffering or authentication",
  async (resource) => {
    const { startDevBackend } = await import("./serverStartup");
    const url = await address(startDevBackend());
    const response = await fetch(
      `${url}/v2/trips/${input.tripId}/universal-source-originals/${resource}`,
      {
        method: "POST",
        body: "x".repeat(2097153),
      },
    );
    expect(response.status).toBe(413);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_SOURCE_COMMAND" },
    });
    expect(fixtures.validateAccessToken).not.toHaveBeenCalled();
  },
);
it("importing the startup factory performs no startup IO", async () => {
  await import("./serverStartup");
  expect(fixtures.servers).toHaveLength(0);
  expect(fixtures.createGateway).not.toHaveBeenCalled();
});
it.each(["people", `person-create-operations/${randomUUID()}`])(
  "bounds Person %s before authentication and keeps it closed by default",
  async (resource) => {
    const { startDevBackend } = await import("./serverStartup");
    const url = await address(startDevBackend());
    const response = await fetch(`${url}/v2/trips/${input.tripId}/${resource}`, {
      method: "POST",
      body: "x".repeat(8193),
    });
    expect(response.status).toBe(413);
    expect(fixtures.validateAccessToken).not.toHaveBeenCalled();
    const unauthenticated = await fetch(`${url}/v2/trips/${input.tripId}/${resource}`);
    expect(unauthenticated.status).toBe(401);
    const closed = await fetch(`${url}/v2/trips/${input.tripId}/${resource}`, {
      headers: { Authorization: "Bearer valid" },
    });
    expect(closed.status).toBe(503);
  },
);
it("normal no-options startup keeps optional ports CLOSED and health unchanged", async () => {
  const { startDevBackend } = await import("./serverStartup");
  const url = await address(startDevBackend());
  const trip = await post(url);
  expect(trip.status).toBe(503);
  expect((await trip.json()).error.code).toBe("TRIP_CREATE_CLOSED");
  const headers = { Authorization: "Bearer valid" };
  const metadata = await fetch(`${url}/v2/trips/${input.tripId}/metadata`, {
    method: "POST",
    headers,
  });
  expect(metadata.status).toBe(503);
  expect((await metadata.json()).error.code).toBe("TRIP_METADATA_CLOSED");
  const capabilities = await fetch(`${url}/v2/trips/${input.tripId}/core/capabilities`, {
    headers,
  });
  expect(await capabilities.json()).toMatchObject({ activationState: "CLOSED" });
  expect(
    (await fetch(`${url}/v2/trips/${input.tripId}/core/collection`, { headers })).status,
  ).toBe(503);
  expect(await (await fetch(`${url}/health`)).json()).toEqual({
    status: "ok",
    environment: "development",
  });
});
it("explicit supplied ports reach existing HTTP boundaries with one authenticated actor", async () => {
  const { startDevBackend } = await import("./serverStartup");
  const tripCreatePort = {
    create: vi.fn(async () => accepted),
    receipt: vi.fn(async () => accepted),
  };
  const withLease = vi.fn(async () => {
    throw new Error("UNPROVISIONED_SYNTHETIC_CONNECTION");
  });
  const coreConnection = createCorePgHttpConnection({ withLease }, async (bytes) =>
    createHash("sha256").update(bytes).digest("hex"),
  );
  const supplied = {
    tripCreatePort,
    coreConnection,
    gateway: { validateAccessToken: vi.fn(async () => ({ id: randomUUID() })) },
  };
  const url = await address(startDevBackend(supplied));
  expect(withLease).not.toHaveBeenCalled();
  expect((await post(url)).status).toBe(201);
  expect(tripCreatePort.create).toHaveBeenCalledWith(actor, input);
  expect(fixtures.validateAccessToken).toHaveBeenCalledTimes(1);
  expect(supplied.gateway.validateAccessToken).not.toHaveBeenCalled();
  const receipt = await fetch(`${url}/v2/trip-create-operations/${input.operationId}`, {
    headers: { Authorization: "Bearer valid" },
  });
  expect(await receipt.json()).toEqual(accepted);
  expect(tripCreatePort.receipt).toHaveBeenCalledWith(actor, input.operationId);
  expect((await post(url, input, "invalid")).status).toBe(401);
  expect((await post(url, { ...input, actorAccountId: randomUUID() })).status).toBe(400);
  const forgedQuery = await fetch(`${url}/v2/trips?actorAccountId=${randomUUID()}`, {
    method: "POST",
    headers: { Authorization: "Bearer valid", "Idempotency-Key": input.operationId },
    body: JSON.stringify(input),
  });
  expect(forgedQuery.status).toBe(400);
  expect(tripCreatePort.create).toHaveBeenCalledTimes(1);
  const closed = await fetch(`${url}/v2/trips/${input.tripId}/core/collection`, {
    headers: { Authorization: "Bearer valid" },
  });
  expect(closed.status).toBe(503);
  expect(withLease).toHaveBeenCalledOnce();
  expect((await closed.json()).error.code).not.toMatch(/UNPROVISIONED/);
});

it("supplied Document reader reaches only the existing authenticated original boundary", async () => {
  const { startDevBackend } = await import("./serverStartup");
  const read = vi.fn(async () => ({ status: "UNAVAILABLE" as const }));
  const url = await address(startDevBackend({ documentOriginalReader: { read } }));
  fixtures.canReadTrip.mockResolvedValue(true);
  const id = randomUUID();
  const response = await fetch(
    `${url}/v2/trips/${input.tripId}/documents/${id}/original`,
    {
      headers: {
        Authorization: "Bearer valid",
        "X-OTR-Content-Version": "1",
        "If-Match": '"' + "a".repeat(64) + '"',
      },
    },
  );
  expect(response.status).toBe(404);
  expect(read).toHaveBeenCalledExactlyOnceWith(actor, {
    actorAccountId: actor,
    tripId: input.tripId,
    documentId: id,
    contentVersion: 1,
    sha256: "a".repeat(64),
  });
});

it.each([
  ["stage", 1048576],
  ["status", 8192],
] as const)(
  "bounds Adoption %s before buffering or authentication",
  async (resource, maximum) => {
    const { startDevBackend } = await import("./serverStartup");
    const url = await address(startDevBackend());
    const response = await fetch(`${url}/v1/auth/guest-adoptions/${resource}`, {
      method: "POST",
      body: "x".repeat(maximum + 1),
    });
    expect(response.status).toBe(413);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(fixtures.validateAccessToken).not.toHaveBeenCalled();
    const closed = await fetch(`${url}/v1/auth/guest-adoptions/status`, {
      method: "POST",
      headers: { Authorization: "Bearer valid" },
      body: "{}",
    });
    expect(closed.status).toBe(503);
  },
);
