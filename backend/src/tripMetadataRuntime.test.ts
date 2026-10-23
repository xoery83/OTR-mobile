import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import {
  loadDevTripMetadataV2Runtime,
  tripMetadataV2RuntimePath,
} from "./tripMetadataRuntime";

const f = vi.hoisted(() => ({
  open: vi.fn(),
  pg: vi.fn(),
  storage: vi.fn(),
  update: vi.fn(),
  snapshot: vi.fn(),
  receipt: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ open: f.open }));
vi.mock("./tripCoreV2PgConnection", () => ({ createTripMetadataPgConnection: f.pg }));
vi.mock("./tripMetadataV2PgStorage", () => ({
  createTripMetadataV2PgStorage: f.storage,
}));
const environment = {
  OTR_DEV_BACKEND_NETWORK_MODE: "host",
  OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
};
function fixture() {
  const config = {
    version: 1,
    enabled: true,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    actorAccountId: randomUUID(),
    request: {
      operationId: randomUUID(),
      tripId: randomUUID(),
      formatVersion: 2 as const,
      expectedMetadataRevision: 3,
      before: { name: "Before", destination: null, startDate: null, endDate: null },
      after: { name: "After", destination: null, startDate: null, endDate: null },
    },
    metadataPg: {
      host: "db.tuqigdxrvrerfewsxqgm.supabase.co",
      port: 5432,
      database: "postgres",
      password: "synthetic-private-credential",
    },
  };
  const stat = {
      isFile: () => true,
      uid: 0,
      gid: 999,
      mode: 0o100440,
      nlink: 1,
      size: 1000,
    },
    close = vi.fn();
  f.open.mockResolvedValue({
    stat: async () => stat,
    readFile: async () => JSON.stringify(config),
    close,
  });
  const connection = { withLease: vi.fn() };
  f.pg.mockReturnValue(connection);
  f.storage.mockReturnValue({
    update: f.update,
    receipt: f.receipt,
    snapshot: f.snapshot,
  });
  const result = {
    ...config.request,
    actorAccountId: config.actorAccountId,
    resultMetadataRevision: 4,
  };
  f.update.mockResolvedValue(result);
  f.receipt.mockResolvedValue(result);
  f.snapshot.mockResolvedValue({
    formatVersion: 2,
    actorAccountId: config.actorAccountId,
    tripId: config.request.tripId,
    metadataRevision: 3,
    metadata: config.request.before,
  });
  return { config, stat, close, connection, result };
}
beforeEach(() => vi.resetAllMocks());
it("keeps missing mount CLOSED without a connection or alternate credential", async () => {
  f.open.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
  expect(await loadDevTripMetadataV2Runtime(environment)).toBeUndefined();
  expect(f.open).toHaveBeenCalledWith(tripMetadataV2RuntimePath, expect.any(Number));
  expect(f.pg).not.toHaveBeenCalled();
});
it("composes the existing exact dedicated port and preserves request/receipt identities", async () => {
  const v = fixture(),
    runtime = await loadDevTripMetadataV2Runtime(environment);
  expect(f.pg).toHaveBeenCalledExactlyOnceWith(v.config.metadataPg);
  expect(f.storage).toHaveBeenCalledExactlyOnceWith(v.connection);
  expect(
    await runtime!.tripMetadataV2Port.update(v.config.actorAccountId, v.config.request),
  ).toEqual(v.result);
  expect(
    await runtime!.tripMetadataV2Port.receipt(
      v.config.actorAccountId,
      v.config.request.operationId,
    ),
  ).toEqual(v.result);
  expect(f.update).toHaveBeenCalledExactlyOnceWith(
    v.config.actorAccountId,
    v.config.request,
  );
  expect(v.close).toHaveBeenCalledExactlyOnceWith();
});
it.each([
  "uid",
  "gid",
  "mode",
  "nlink",
  "size",
  "file",
  "expiry",
  "window",
  "host",
  "port",
  "database",
  "unknown",
  "network",
  "project",
])("rejects invalid %s before creating a connection", async (kind) => {
  const v = fixture();
  if (kind === "uid") v.stat.uid = 10001;
  if (kind === "gid") v.stat.gid = 10001;
  if (kind === "mode") v.stat.mode = 0o100644;
  if (kind === "nlink") v.stat.nlink = 2;
  if (kind === "size") v.stat.size = 16385;
  if (kind === "file") v.stat.isFile = () => false;
  if (kind === "expiry") v.config.expiresAt = new Date(Date.now() - 1).toISOString();
  if (kind === "window") v.config.expiresAt = new Date(Date.now() + 901000).toISOString();
  if (kind === "host") v.config.metadataPg.host = "db.foreign.supabase.co";
  if (kind === "port") v.config.metadataPg.port = 6543;
  if (kind === "database") v.config.metadataPg.database = "foreign";
  if (kind === "unknown") Object.assign(v.config, { serviceRole: "not-accepted" });
  await expect(
    loadDevTripMetadataV2Runtime(
      kind === "network"
        ? { ...environment, OTR_DEV_BACKEND_NETWORK_MODE: "bridge" }
        : kind === "project"
          ? { ...environment, OTR_DEV_SUPABASE_URL: "https://foreign.supabase.co" }
          : environment,
    ),
  ).rejects.toThrow("TRIP_METADATA_RUNTIME_UNAVAILABLE");
  expect(f.pg).not.toHaveBeenCalled();
  expect(v.close).toHaveBeenCalledOnce();
});
it("rejects another actor, operation, Trip or changed original payload before port execution", async () => {
  const v = fixture(),
    runtime = await loadDevTripMetadataV2Runtime(environment);
  await expect(
    runtime!.tripMetadataV2Port.receipt(randomUUID(), v.config.request.operationId),
  ).rejects.toMatchObject({ code: "TRIP_METADATA_FORBIDDEN" });
  await expect(
    runtime!.tripMetadataV2Port.receipt(v.config.actorAccountId, randomUUID()),
  ).rejects.toMatchObject({ code: "TRIP_METADATA_FORBIDDEN" });
  for (const change of [
    { tripId: randomUUID() },
    { after: { ...v.config.request.after, name: "different" } },
    { after: { ...v.config.request.after, destination: "Different" } },
    { after: { ...v.config.request.after, startDate: "2027-01-01" } },
    { after: { ...v.config.request.after, endDate: "2027-01-02" } },
  ])
    await expect(
      runtime!.tripMetadataV2Port.update(v.config.actorAccountId, {
        ...v.config.request,
        ...change,
      }),
    ).rejects.toMatchObject({ code: "TRIP_METADATA_COLLISION" });
  expect(f.update).not.toHaveBeenCalled();
  expect(f.receipt).not.toHaveBeenCalled();
});
it("rejects expiry and closed activation, including a late result, without retrying", async () => {
  const v = fixture(),
    runtime = await loadDevTripMetadataV2Runtime(environment);
  const clock = vi.spyOn(Date, "now");
  f.update.mockImplementationOnce(async () => {
    clock.mockReturnValue(Date.parse(v.config.expiresAt));
    return v.result;
  });
  try {
    await expect(
      runtime!.tripMetadataV2Port.update(v.config.actorAccountId, v.config.request),
    ).rejects.toMatchObject({ code: "TRIP_METADATA_CLOSED" });
    await expect(
      runtime!.tripMetadataV2Port.receipt(
        v.config.actorAccountId,
        v.config.request.operationId,
      ),
    ).rejects.toMatchObject({ code: "TRIP_METADATA_CLOSED" });
    expect(f.update).toHaveBeenCalledOnce();
    expect(f.receipt).not.toHaveBeenCalled();
  } finally {
    clock.mockRestore();
  }
  await runtime!.close();
  await expect(
    runtime!.tripMetadataV2Port.receipt(
      v.config.actorAccountId,
      v.config.request.operationId,
    ),
  ).rejects.toMatchObject({ code: "TRIP_METADATA_CLOSED" });
});
it("rejects a foreign Trip in a same-operation receipt and preserves a missing receipt", async () => {
  const v = fixture(),
    runtime = await loadDevTripMetadataV2Runtime(environment);
  f.receipt.mockResolvedValueOnce({ ...v.result, tripId: randomUUID() });
  await expect(
    runtime!.tripMetadataV2Port.receipt(
      v.config.actorAccountId,
      v.config.request.operationId,
    ),
  ).rejects.toMatchObject({ code: "TRIP_METADATA_RESULT_MISMATCH" });
  f.receipt.mockResolvedValueOnce(null);
  expect(
    await runtime!.tripMetadataV2Port.receipt(
      v.config.actorAccountId,
      v.config.request.operationId,
    ),
  ).toBeNull();
});

it("snapshot uses only the exact finite actor trip and operation", async () => {
  const v = fixture(),
    runtime = await loadDevTripMetadataV2Runtime(environment);
  expect(
    await runtime!.tripMetadataV2Port.snapshot(
      v.config.actorAccountId,
      v.config.request.tripId,
      v.config.request.operationId,
    ),
  ).toMatchObject({ metadataRevision: 3, metadata: v.config.request.before });
  await expect(
    runtime!.tripMetadataV2Port.snapshot(
      v.config.actorAccountId,
      randomUUID(),
      v.config.request.operationId,
    ),
  ).rejects.toMatchObject({ code: "TRIP_METADATA_FORBIDDEN" });
  expect(f.snapshot).toHaveBeenCalledOnce();
});
