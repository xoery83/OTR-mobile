import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  readSourcePngRuntimeConfig,
  sourcePngRuntimeSchema,
  createSourcePngRuntimePorts,
} from "./sourcePngRuntime";
const f = vi.hoisted(() => ({ open: vi.fn(), lease: vi.fn() }));
vi.mock("node:fs/promises", async (original) => ({
  ...(await original<typeof import("node:fs/promises")>()),
  open: f.open,
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T00:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});
function fixture() {
  const config = sourcePngRuntimeSchema.parse({
    version: "OTR_DEV_UNIVERSAL_PNG/1",
    enabled: true,
    environment: "DEV",
    project: "tuqigdxrvrerfewsxqgm",
    actorId: "f4b059c5-8241-4ffb-aa15-37fa25474543",
    tripId: "825f79b2-4a9d-4535-a62e-43000ca50c4a",
    expiresAt: "2026-11-01T08:48:56Z",
    nodeId: randomUUID(),
  });
  const text = JSON.stringify(config),
    close = vi.fn(),
    stat = {
      isFile: () => true,
      uid: 0,
      gid: 999,
      mode: 0o440,
      nlink: 1,
      size: text.length,
    };
  f.open.mockResolvedValue({ stat: async () => stat, readFile: async () => text, close });
  const env = {
    OTR_DEV_UNIVERSAL_PNG_RUNTIME: "enabled",
    OTR_DEV_BACKEND_NETWORK_MODE: "host",
    OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    OTR_DEV_UNIVERSAL_PNG_RUNTIME_SHA256: createHash("sha256").update(text).digest("hex"),
  };
  const gateway = {
    validateAccessToken: vi.fn(async () => ({ id: config.actorId })),
    canReadTrip: vi.fn(async () => false),
  };
  const deps = {
    gateway: gateway as never,
    connection: { withLease: f.lease },
    storageToken: "synthetic",
    assertEnabled: vi.fn(),
  };
  return { config, env, stat, close, deps, gateway };
}
it("default closed does not open a config, Source lease, custody or worker", async () => {
  expect(await readSourcePngRuntimeConfig({})).toBeUndefined();
  expect(f.open).not.toHaveBeenCalled();
  expect(f.lease).not.toHaveBeenCalled();
});
it("accepts only exact hashed root-owned DEV settings and always closes the file", async () => {
  const q = fixture();
  expect(await readSourcePngRuntimeConfig(q.env)).toEqual(q.config);
  expect(q.close).toHaveBeenCalledOnce();
});
it.each(["hash", "mode", "owner", "hardlink", "project"])(
  "rejects unsafe config %s before creating runtime",
  async (field) => {
    const q = fixture();
    if (field === "hash") q.env.OTR_DEV_UNIVERSAL_PNG_RUNTIME_SHA256 = "b".repeat(64);
    if (field === "mode") q.stat.mode = 0o644;
    if (field === "owner") q.stat.uid = 10001;
    if (field === "hardlink") q.stat.nlink = 2;
    if (field === "project")
      q.env.OTR_DEV_SUPABASE_URL = "https://foreign.example.invalid";
    await expect(readSourcePngRuntimeConfig(q.env)).rejects.toThrow(
      "PNG_RUNTIME_CONFIG_CLOSED",
    );
    expect(f.lease).not.toHaveBeenCalled();
    if (field !== "project") expect(q.close).toHaveBeenCalledOnce();
  },
);

it("PNG metadata and execution remain scoped and expire closed", async () => {
  const q = fixture(),
    p = createSourcePngRuntimePorts(q.config, q.deps);
  expect(p.originalMetadataAllowed(q.config.actorId, q.config.tripId)).toBe(true);
  expect(p.originalMetadataAllowed(randomUUID(), q.config.tripId)).toBe(false);
  const req = new Request(
    `https://dev.example.invalid/v2/trips/${q.config.tripId}/universal-source-originals/png/result`,
    { headers: { Authorization: "Bearer synthetic" } },
  );
  await expect(p.sourcePngPreparationForRequest(req, q.config.actorId)).rejects.toThrow(
    "SOURCE_ACCESS_DENIED",
  );
  expect(f.lease).not.toHaveBeenCalled();
  vi.setSystemTime(new Date(q.config.expiresAt));
  expect(p.originalMetadataAllowed(q.config.actorId, q.config.tripId)).toBe(false);
  await expect(p.sourcePngPreparationForRequest(req, q.config.actorId)).rejects.toThrow(
    "SOURCE_CAPABILITY_CLOSED",
  );
  vi.setSystemTime(new Date("2026-10-30T00:00:00Z"));
  p.close();
  expect(p.originalMetadataAllowed(q.config.actorId, q.config.tripId)).toBe(false);
});

it("binds current hashed profile without accepting old or foreign scope", async () => {
  const q = fixture();
  const config = {
    ...q.config,
    actorId: randomUUID(),
    tripId: randomUUID(),
    expiresAt: "2026-11-04T02:00:00Z",
  };
  vi.setSystemTime(new Date("2026-11-04T01:00:00Z"));
  const text = JSON.stringify(config);
  f.open.mockResolvedValue({
    stat: async () => ({ ...q.stat, size: text.length }),
    readFile: async () => text,
    close: q.close,
  });
  const env = {
    ...q.env,
    OTR_DEV_UNIVERSAL_PNG_RUNTIME_SHA256: createHash("sha256").update(text).digest("hex"),
  };
  expect(await readSourcePngRuntimeConfig(env)).toEqual(config);
  const ports = createSourcePngRuntimePorts(config, q.deps);
  expect(ports.originalMetadataAllowed(config.actorId, config.tripId)).toBe(true);
  expect(ports.originalMetadataAllowed(q.config.actorId, q.config.tripId)).toBe(false);
  expect(ports.originalMetadataAllowed(config.actorId, randomUUID())).toBe(false);
  expect(ports.originalMetadataAllowed(randomUUID(), config.tripId)).toBe(false);
  vi.setSystemTime(new Date(config.expiresAt));
  expect(ports.originalMetadataAllowed(config.actorId, config.tripId)).toBe(false);
  expect(f.lease).not.toHaveBeenCalled();
  expect(sourcePngRuntimeSchema.safeParse({ ...config, actorId: "*" }).success).toBe(
    false,
  );
  expect(sourcePngRuntimeSchema.safeParse({ ...config, tripId: "*" }).success).toBe(
    false,
  );
  expect(
    sourcePngRuntimeSchema.safeParse({ ...config, expiresAt: "infinity" }).success,
  ).toBe(false);
});
