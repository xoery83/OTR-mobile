import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { commandDigest } from "../externalIntegrationPersistence";
import { loadDevFlightEnrichmentRuntime } from "./devRuntime";
import type { TrustedContext } from "./ports";
const f = vi.hoisted(() => ({
  open: vi.fn(),
  stat: vi.fn(),
  read: vi.fn(),
  close: vi.fn(),
  custody: vi.fn(),
  query: vi.fn(),
  configure: vi.fn(),
  ports: vi.fn(),
  available: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ open: f.open }));
vi.mock("../flightPrivateCustody", () => ({ createFlightPrivateCustody: f.custody }));
vi.mock("../tripCoreV2PgConnection", () => ({
  createModelTaskPgConnection: () => ({
    withLease: (work: (lease: { query: typeof f.query }) => unknown) => work({ query: f.query }),
  }),
}));
vi.mock("./persistentPorts", () => ({
  createPersistentFlightEnrichmentPorts: f.ports,
  flightEnrichmentInputVerifier: () => async () => true,
}));
vi.mock("./runtime", () => ({ createConfiguredFlightEnrichmentService: f.configure }));
const actor = "a0000000-0000-4000-8000-000000000001",
  trip = "a0000000-0000-4000-8000-000000000002";
const config = {
  version: 1,
  environment: "DEV",
  project: "tuqigdxrvrerfewsxqgm",
  integrationId: "otr-flight-enrichment-v1",
  accountId: actor,
  acceptanceTripId: trip,
  credentialReference: "vault:otr/dev/deepseek/flight-enrichment-v1",
  directory: "/var/lib/otr/flight-enrichment",
  identity: { store_id: actor, device: "1", inode: "2" },
  pg: {
    host: "db.tuqigdxrvrerfewsxqgm.supabase.co",
    port: 5432,
    database: "postgres",
    password: "SYNTHETIC",
    ca: "SYNTHETIC",
  },
};
const body = JSON.stringify(config);
function env() {
  return {
    OTR_DEV_FLIGHT_ENRICHMENT_HOST: "enabled",
    OTR_DEV_BACKEND_NETWORK_MODE: "host",
    OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    OTR_DEV_FLIGHT_ENRICHMENT_RUNTIME_SHA256: createHash("sha256")
      .update(body)
      .digest("hex"),
    OTR_DEV_DEEPSEEK_API_KEY: "SYNTHETIC_KEY",
  };
}
const context = (): TrustedContext => ({
  actorId: actor,
  accountId: actor,
  tripId: trip,
  authFence: "normal-auth-test",
  assertCurrent: vi.fn(async () => {}),
});
beforeEach(() => {
  vi.clearAllMocks();
  f.open.mockResolvedValue({ stat: f.stat, readFile: f.read, close: f.close });
  f.stat.mockResolvedValue({
    isFile: () => true,
    uid: 0,
    gid: 999,
    mode: 0o100440,
    nlink: 1,
    size: Buffer.byteLength(body),
  });
  f.read.mockResolvedValue(body);
  f.available.mockResolvedValue(true);
  f.custody.mockResolvedValue({ custody: { verify: async () => true }, close: f.close });
  f.ports.mockReturnValue({ reserve: vi.fn(), usage: vi.fn(), available: f.available });
  f.configure.mockReturnValue({ enrich: vi.fn() });
  f.query.mockResolvedValue({ rows: [{ value: { synthetic: true } }] });
});
afterEach(() => vi.useRealTimers());
it("rejects another readable Trip before availability, claim, reserve or HTTP", async () => {
  const runtime = (await loadDevFlightEnrichmentRuntime(env()))!;
  const otherTrip = { ...context(), tripId: "a0000000-0000-4000-8000-000000000003" };
  expect(await runtime.available(otherTrip)).toBe(false);
  expect(f.available).not.toHaveBeenCalled();
  const servicePorts = f.configure.mock.calls[0][0];
  expect(() => servicePorts.gateway(otherTrip)).toThrow("ACCEPTANCE_SCOPE");
  await expect(
    f.ports.mock.calls[0][0].resolveCredential(config.credentialReference, otherTrip),
  ).rejects.toThrow("ACCEPTANCE_SCOPE");
  expect(f.query).not.toHaveBeenCalled();
  expect(otherTrip.assertCurrent).not.toHaveBeenCalled();
  await runtime.close();
});
it("stays closed without the opt-in/mount and rejects wrong DEV identity or mount pins", async () => {
  expect(await loadDevFlightEnrichmentRuntime({})).toBeUndefined();
  expect(f.open).not.toHaveBeenCalled();
  await expect(
    loadDevFlightEnrichmentRuntime({
      ...env(),
      OTR_DEV_SUPABASE_URL: "https://other.invalid",
    }),
  ).rejects.toThrow("CLOSED");
  f.open.mockRejectedValueOnce(Object.assign(Error(), { code: "ENOENT" }));
  expect(await loadDevFlightEnrichmentRuntime(env())).toBeUndefined();
  f.stat.mockResolvedValueOnce({
    isFile: () => true,
    uid: 0,
    gid: 999,
    mode: 0o100444,
    nlink: 1,
    size: 1,
  });
  await expect(loadDevFlightEnrichmentRuntime(env())).rejects.toThrow("CLOSED");
  await expect(
    loadDevFlightEnrichmentRuntime({
      ...env(),
      OTR_DEV_FLIGHT_ENRICHMENT_RUNTIME_SHA256: "a".repeat(64),
    }),
  ).rejects.toThrow("CLOSED");
  expect(f.custody).not.toHaveBeenCalled();
});
it("advertises only provisioned per-account availability and closes on config/secret change", async () => {
  const settings = env(),
    runtime = (await loadDevFlightEnrichmentRuntime(settings))!,
    ctx = context();
  expect(await runtime.available(ctx)).toBe(true);
  const ports = f.ports.mock.calls[0][0];
  const credential = await ports.resolveCredential(config.credentialReference, ctx);
  settings.OTR_DEV_DEEPSEEK_API_KEY = "ROTATED_SYNTHETIC_KEY";
  await expect(credential.assertCurrent()).rejects.toThrow("CHANGED");
  settings.OTR_DEV_DEEPSEEK_API_KEY = "";
  expect(await runtime.available(ctx)).toBe(false);
  settings.OTR_DEV_DEEPSEEK_API_KEY = "SYNTHETIC_KEY";
  settings.OTR_DEV_FLIGHT_ENRICHMENT_RUNTIME_SHA256 = "changed";
  expect(await runtime.available(ctx)).toBe(false);
  await runtime.close();
});
it("revalidates normal Auth for spend, permits bounded historical settlement after cancellation, and forbids unrelated commands", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T00:00:00Z"));
  const runtime = (await loadDevFlightEnrichmentRuntime(env()))!,
    ctx = context();
  const gateway = f.configure.mock.calls[0][0].gateway(ctx);
  const fields = {
    version: 1,
    environment: "DEV",
    request_id: trip,
    integration_id: config.integrationId,
    account_id: actor,
    actor_id: actor,
    trip_id: trip,
  };
  const command = { ...fields, request_sha256: commandDigest(fields) };
  await gateway.invoke("flight_enrichment_runtime_scope", command);
  expect(ctx.assertCurrent).toHaveBeenCalledOnce();
  vi.mocked(ctx.assertCurrent).mockRejectedValue(Error("REQUEST_CANCELED"));
  await expect(
    gateway.invoke("flight_enrichment_mark_dispatch", command),
  ).rejects.toThrow("CANCELED");
  await expect(
    gateway.invoke("flight_enrichment_step_receipt", command),
  ).resolves.toEqual({ synthetic: true });
  await expect(
    gateway.invoke("external_integration_reserve_call", command),
  ).rejects.toThrow("COMMAND_CLOSED");
  expect(f.query.mock.calls.filter(([sql]) => sql.includes("public.flight_enrichment_"))).toHaveLength(2);
  expect(f.query.mock.calls.some(([sql]) => sql.includes("otr.ai_cost_guard"))).toBe(false);
  vi.advanceTimersByTime(60001);
  await expect(gateway.invoke("flight_enrichment_step_receipt", command)).rejects.toThrow(
    "COMMAND_CLOSED",
  );
  await runtime.close();
});

it("load and availability diagnostics identify fixed stages without private fields", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    const secret = "synthetic-private-password-token-marker";
    const invalid = JSON.stringify({
      ...config,
      pg: { ...config.pg, password: secret, port: secret },
    });
    f.read.mockResolvedValueOnce(invalid);
    await expect(
      loadDevFlightEnrichmentRuntime({
        ...env(),
        OTR_DEV_FLIGHT_ENRICHMENT_RUNTIME_SHA256: createHash("sha256")
          .update(invalid)
          .digest("hex"),
      }),
    ).rejects.toThrow("ENRICHMENT_RUNTIME_CLOSED");
    expect(log).toHaveBeenCalledWith(
      "FLIGHT_ENRICHMENT_DIAGNOSTIC:LOAD_PARSE:SCHEMA_REJECTED",
    );
    const runtime = (await loadDevFlightEnrichmentRuntime(env()))!;
    const gateway = f.configure.mock.calls.at(-1)![0].gateway(context());
    const raw = {
      version: 1,
      environment: "DEV",
      request_id: trip,
      integration_id: config.integrationId,
      account_id: actor,
      actor_id: actor,
      trip_id: trip,
    };
    f.query.mockRejectedValueOnce(
      Object.assign(Error(secret), { code: "42501", detail: secret, stack: secret }),
    );
    await expect(
      gateway.invoke("flight_enrichment_runtime_scope", {
        ...raw,
        request_sha256: commandDigest(raw),
      }),
    ).rejects.toThrow(secret);
    expect(log).toHaveBeenCalledWith(
      "FLIGHT_ENRICHMENT_DIAGNOSTIC:GATEWAY_EXECUTE:STATE_42501",
    );
    expect(
      await runtime.available({
        ...context(),
        tripId: "a0000000-0000-4000-8000-000000000003",
      }),
    ).toBe(false);
    expect(log).toHaveBeenCalledWith(
      "FLIGHT_ENRICHMENT_DIAGNOSTIC:AVAILABLE_GATEWAY:ENRICHMENT_ACCEPTANCE_SCOPE",
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
    await runtime.close();
  } finally {
    log.mockRestore();
  }
});


it("uses the backend OFF value on the actual protected transaction", async () => {
  const runtime = (await loadDevFlightEnrichmentRuntime({ ...env(), AI_COST_GUARD_ENABLED: "false" }))!;
  const gateway = f.configure.mock.calls[0][0].gateway(context());
  const fields = {
    version: 1,
    environment: "DEV",
    request_id: trip,
    integration_id: config.integrationId,
    account_id: actor,
    actor_id: actor,
    trip_id: trip,
  };
  await gateway.invoke("flight_enrichment_runtime_scope", { ...fields, request_sha256: commandDigest(fields) });
  expect(f.ports.mock.calls[0][0].costGuardEnabled).toBe(false);
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
    expect.stringContaining("BEGIN"),
    expect.stringContaining("set_config('otr.ai_cost_guard', 'off', true)"),
    expect.stringContaining("public.flight_enrichment_runtime_scope"),
    "COMMIT",
  ]);
  await runtime.close();
});
