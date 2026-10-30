import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  readSourcePdfRuntimeConfig,
  sourcePdfRuntimeSchema,
  createSourcePdfRuntimePorts,
} from "./sourcePdfRuntime";
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
  const config = sourcePdfRuntimeSchema.parse({
    version: "OTR_DEV_UNIVERSAL_PDF/1",
    enabled: true,
    environment: "DEV",
    project: "tuqigdxrvrerfewsxqgm",
    actorId: "f4b059c5-8241-4ffb-aa15-37fa25474543",
    tripId: "825f79b2-4a9d-4535-a62e-43000ca50c4a",
    expiresAt: "2026-11-01T08:48:56Z",
    nodeId: randomUUID(),
    ownerRun: randomUUID(),
    producerId: randomUUID(),
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
    OTR_DEV_UNIVERSAL_PDF_RUNTIME: "enabled",
    OTR_DEV_BACKEND_NETWORK_MODE: "host",
    OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    OTR_DEV_UNIVERSAL_PDF_RUNTIME_SHA256: createHash("sha256").update(text).digest("hex"),
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
  expect(await readSourcePdfRuntimeConfig({})).toBeUndefined();
  expect(f.open).not.toHaveBeenCalled();
  expect(f.lease).not.toHaveBeenCalled();
});
it("accepts only exact hashed root-owned DEV settings and always closes the file", async () => {
  const q = fixture();
  expect(await readSourcePdfRuntimeConfig(q.env)).toEqual(q.config);
  expect(q.close).toHaveBeenCalledOnce();
});
it.each(["hash", "mode", "owner", "hardlink", "project"])(
  "rejects unsafe config %s before creating runtime",
  async (field) => {
    const q = fixture();
    if (field === "hash") q.env.OTR_DEV_UNIVERSAL_PDF_RUNTIME_SHA256 = "b".repeat(64);
    if (field === "mode") q.stat.mode = 0o644;
    if (field === "owner") q.stat.uid = 10001;
    if (field === "hardlink") q.stat.nlink = 2;
    if (field === "project")
      q.env.OTR_DEV_SUPABASE_URL = "https://foreign.example.invalid";
    await expect(readSourcePdfRuntimeConfig(q.env)).rejects.toThrow(
      "PDF_RUNTIME_CONFIG_CLOSED",
    );
    expect(f.lease).not.toHaveBeenCalled();
    if (field !== "project") expect(q.close).toHaveBeenCalledOnce();
  },
);
it("runtime rejects foreign Actor/Trip, expiry and shutdown before SQL", () => {
  const q = fixture(),
    ports = createSourcePdfRuntimePorts(q.config, q.deps);
  const request = new Request(
    `https://dev.example.invalid/v2/trips/${q.config.tripId}/sources/pdf-v2/seal`,
  );
  expect(() => ports.sourcePdfV2ForRequest(request, randomUUID())).toThrow(
    "SOURCE_ACCESS_DENIED",
  );
  expect(() =>
    ports.sourcePdfV2ForRequest(
      new Request(
        `https://dev.example.invalid/v2/trips/${randomUUID()}/sources/pdf-v2/seal`,
      ),
      q.config.actorId,
    ),
  ).toThrow();
  vi.setSystemTime(new Date(q.config.expiresAt));
  expect(() => ports.sourcePdfV2ForRequest(request, q.config.actorId)).toThrow(
    "SOURCE_CAPABILITY_CLOSED",
  );
  vi.setSystemTime(new Date("2026-10-30T00:00:00Z"));
  ports.close();
  expect(() => ports.sourcePdfV2ForRequest(request, q.config.actorId)).toThrow(
    "SOURCE_CAPABILITY_CLOSED",
  );
  expect(f.lease).not.toHaveBeenCalled();
});
it("exact QA still requires current normal bearer and Trip permission", async () => {
  const q = fixture(),
    ports = createSourcePdfRuntimePorts(q.config, q.deps);
  const request = new Request(
    `https://dev.example.invalid/v2/trips/${q.config.tripId}/sources/pdf-v2/seal`,
    { headers: { Authorization: "Bearer synthetic" } },
  );
  await expect(ports.sourcePdfV2ForRequest(request, q.config.actorId)).rejects.toThrow(
    "PDF_SCOPE_FORBIDDEN",
  );
  expect(q.gateway.validateAccessToken).toHaveBeenCalled();
  expect(q.gateway.canReadTrip).toHaveBeenCalledWith(q.config.actorId, q.config.tripId);
  expect(f.lease).not.toHaveBeenCalled();
});

it("original metadata shares the exact live PDF scope and closes independently of text", () => {
  const q = fixture();
  const ports = createSourcePdfRuntimePorts(q.config, q.deps);
  expect(ports.originalMetadataAllowed(q.config.actorId, q.config.tripId)).toBe(true);
  expect(ports.originalMetadataAllowed(randomUUID(), q.config.tripId)).toBe(false);
  expect(ports.originalMetadataAllowed(q.config.actorId, randomUUID())).toBe(false);
  vi.setSystemTime(new Date(q.config.expiresAt));
  expect(ports.originalMetadataAllowed(q.config.actorId, q.config.tripId)).toBe(false);
  vi.setSystemTime(new Date("2026-10-30T00:00:00Z"));
  q.deps.assertEnabled.mockImplementation(() => {
    throw Error("CLOSED");
  });
  expect(ports.originalMetadataAllowed(q.config.actorId, q.config.tripId)).toBe(false);
  q.deps.assertEnabled.mockReset();
  ports.close();
  expect(ports.originalMetadataAllowed(q.config.actorId, q.config.tripId)).toBe(false);
});
