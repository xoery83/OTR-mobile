import { EventEmitter } from "node:events";
import { get } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  fallback: 0,
  paid: 0,
  source: 0,
  pools: 0,
  denyStartup: false,
  kinds: [] as string[],
}));
vi.mock("pg", () => ({
  Pool: class extends EventEmitter {
    constructor() {
      super();
      state.pools++;
    }
    async end() {}
    async connect() {
      throw Error("TEST_FORBIDS_DATABASE_NETWORK");
    }
  },
}));
vi.mock("./universalSettledRecoveryOperator", () => ({
  loadSettledUniversalReadRuntime: async (args: { startupKind: string }) => {
    state.kinds.push(args.startupKind);
    if (state.denyStartup) throw Error("CUSTODY_STARTUP_ALREADY_CLAIMED");
    const { createPublicationCatalogPgConnection } =
      await import("./tripPublicationCatalogPgConnection");
    const c = createPublicationCatalogPgConnection({
      host: "db.tuqigdxrvrerfewsxqgm.supabase.co",
      port: 5432,
      database: "postgres",
      password: "synthetic-not-secret",
    });
    return {
      catalogConnection: c,
      universalImportPort: {
        execute: async () => {
          throw Error("CLOSED");
        },
        read: async () => null,
      },
      close: c.close,
    };
  },
}));
vi.mock("./tripPublicationCatalogRuntime", async () => {
  const { createPublicationCatalogPgConnection } =
    await import("./tripPublicationCatalogPgConnection");
  return {
    loadDevPublicationCatalog: () => {
      state.fallback++;
      return createPublicationCatalogPgConnection({
        host: "db.tuqigdxrvrerfewsxqgm.supabase.co",
        port: 5432,
        database: "postgres",
        password: "synthetic-not-secret",
      });
    },
  };
});
vi.mock("./captureCustodyRuntime", () => ({
  loadDevCaptureCustody: async () => {
    throw Error("EXPIRED_FINITE_FIXTURE");
  },
}));
vi.mock("./tripCreateRuntime", () => ({
  loadDevTripCreateRuntime: async () => undefined,
}));
vi.mock("./tripMetadataRuntime", () => ({
  loadDevTripMetadataV2Runtime: async () => undefined,
}));
vi.mock("./universalFiniteRuntime", () => ({
  loadDevUniversalRuntime: async () => {
    state.paid++;
    throw Error("PAID_FORBIDDEN");
  },
}));
vi.mock("./universalOriginalSourceRuntime", () => ({
  loadDevUniversalOriginalSourceRuntime: async () => {
    state.source++;
    throw Error("SOURCE_COMMAND_FORBIDDEN");
  },
}));
vi.mock("./flightLiveHost", () => ({
  initializeDevFlightLiveHost: async () => undefined,
}));
vi.mock("./rateDemandScanner", () => ({
  createRateDemandScanner: () => ({ start() {}, stop() {}, wake() {} }),
}));
beforeEach(() => {
  state.fallback = 0;
  state.paid = 0;
  state.source = 0;
  state.pools = 0;
  state.denyStartup = false;
  state.kinds = [];
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("actual serverCapture -> startDevBackend reaches real local health with one shared Catalog; expired Capture stays closed", async () => {
  vi.stubEnv("OTR_DEV_BACKEND_NETWORK_MODE", "host");
  vi.stubEnv("OTR_DEV_BACKEND_BIND_ADDRESS", "127.0.0.1");
  vi.stubEnv("OTR_DEV_BACKEND_PORT", "8787");
  vi.stubEnv(
    "OTR_DEV_SUPABASE_URL",
    "https://tuqigdxrvrerfewsxqgm.supabase.co",
  );
  vi.stubEnv("OTR_DEV_SUPABASE_PUBLISHABLE_KEY", "test-public");
  vi.stubEnv("OTR_DEV_SUPABASE_SECRET_KEY", "test-secret");
  vi.stubEnv(
    "OTR_DEV_UNIVERSAL_SETTLED_RECOVERY",
    JSON.stringify({
      version: 1,
      configSHA256: "a".repeat(64),
      startsAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      priceSchedule: {
        currency: "USD",
        inputNanosPerMillion: "150000000",
        cachedInputNanosPerMillion: "3000000",
        outputNanosPerMillion: "600000000",
      },
    }),
  );
  const logs = vi.spyOn(console, "info").mockImplementation(() => {});
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const prior = process.listeners("SIGTERM");
  try {
    await import("./serverCapture");
    let response: { status: number; body: string } | undefined;
    for (let i = 0; i < 40; i++) {
      try {
        response = await new Promise<{ status: number; body: string }>(
          (resolve, reject) => {
            const req = get("http://127.0.0.1:8787/health", (r) => {
              let body = "";
              r.on("data", (c) => (body += c));
              r.on("end", () => resolve({ status: r.statusCode!, body }));
            });
            req.on("error", reject);
            req.setTimeout(500, () => req.destroy(Error("LOCAL_TIMEOUT")));
          },
        );
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 25));
      }
    }
    expect(response?.status).toBe(200);
    expect(JSON.parse(response!.body)).toMatchObject({
      status: "ok",
      environment: "development",
    });
    expect(state.pools).toBe(1);
    expect(state.fallback).toBe(0);
    expect(state.paid).toBe(0);
    expect(state.source).toBe(0);
    expect(logs).toHaveBeenCalledWith("CAPTURE_RUNTIME_CLOSED");
    expect(errors).not.toHaveBeenCalled();
  } finally {
    const added = process
      .listeners("SIGTERM")
      .filter((f) => !prior.includes(f));
    for (const f of added) {
      process.removeListener("SIGTERM", f);
      f("SIGTERM");
    }
    await new Promise((r) => setTimeout(r, 30));
  }
});

it("actual startDevBackend fallback deterministically rejects a second owning Catalog when the settled connection is dropped", async () => {
  vi.stubEnv("OTR_DEV_BACKEND_NETWORK_MODE", "host");
  vi.stubEnv("OTR_DEV_BACKEND_BIND_ADDRESS", "127.0.0.1");
  vi.stubEnv("OTR_DEV_BACKEND_PORT", "8787");
  vi.stubEnv(
    "OTR_DEV_SUPABASE_URL",
    "https://tuqigdxrvrerfewsxqgm.supabase.co",
  );
  vi.stubEnv("OTR_DEV_SUPABASE_PUBLISHABLE_KEY", "test-public");
  vi.stubEnv("OTR_DEV_SUPABASE_SECRET_KEY", "test-secret");
  const { createPublicationCatalogPgConnection } =
    await import("./tripPublicationCatalogPgConnection");
  const { startDevBackend } = await import("./serverStartup");
  const retained = createPublicationCatalogPgConnection({
    host: "db.tuqigdxrvrerfewsxqgm.supabase.co",
    port: 5432,
    database: "postgres",
    password: "synthetic-not-secret",
  });
  try {
    expect(() => startDevBackend()).toThrow(
      expect.objectContaining({
        code: "PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE",
      }),
    );
    expect(state.fallback).toBe(1);
    expect(state.pools).toBe(1);
  } finally {
    await retained.close();
  }
});

it("twelve actual entrypoint reboots denied by startup claim never create fallback Catalog pools", async () => {
  vi.stubEnv(
    "OTR_DEV_UNIVERSAL_SETTLED_RECOVERY",
    JSON.stringify({
      version: 1,
      configSHA256: "a".repeat(64),
      startsAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      priceSchedule: {
        currency: "USD",
        inputNanosPerMillion: "150000000",
        cachedInputNanosPerMillion: "3000000",
        outputNanosPerMillion: "600000000",
      },
    }),
  );
  state.denyStartup = true;
  const previous = process.exitCode;
  vi.spyOn(console, "info").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    for (let i = 0; i < 12; i++) {
      vi.resetModules();
      await import("./serverCapture");
      await new Promise((r) => setTimeout(r, 5));
      expect(process.exitCode).toBe(1);
    }
    expect(state.kinds).toEqual(Array(12).fill("HOST"));
    expect(state.pools).toBe(0);
    expect(state.fallback).toBe(0);
    expect(state.source).toBe(0);
    expect(state.paid).toBe(0);
    expect(error).toHaveBeenCalledTimes(12);
  } finally {
    process.exitCode = previous;
  }
});
