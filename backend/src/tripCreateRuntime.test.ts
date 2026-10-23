import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { loadDevTripCreateRuntime, tripCreateRuntimePath } from "./tripCreateRuntime";

const f = vi.hoisted(() => ({
  open: vi.fn(),
  pg: vi.fn(),
  storage: vi.fn(),
  create: vi.fn(),
  receipt: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ open: f.open }));
vi.mock("./tripCoreV2PgConnection", () => ({ createTripPgConnection: f.pg }));
vi.mock("./tripCreatePgStorage", () => ({ createTripPgStorage: f.storage }));
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
      name: "Synthetic QA",
      destination: "Coast",
      startDate: null,
      endDate: null,
    },
    tripPg: {
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
  f.storage.mockReturnValue({ create: f.create, receipt: f.receipt });
  const result = {
    ...config.request,
    actorAccountId: config.actorAccountId,
    ownerPersonId: randomUUID(),
    coreEpoch: randomUUID(),
    coreRevision: 1,
    coreAccessRevision: 1,
  };
  f.create.mockResolvedValue(result);
  f.receipt.mockResolvedValue(result);
  return { config, stat, close, connection, result };
}
beforeEach(() => vi.resetAllMocks());
it("keeps missing mount CLOSED without a connection or alternate credential", async () => {
  f.open.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
  expect(await loadDevTripCreateRuntime(environment)).toBeUndefined();
  expect(f.open).toHaveBeenCalledWith(tripCreateRuntimePath, expect.any(Number));
  expect(f.pg).not.toHaveBeenCalled();
});
it("composes the existing exact dedicated port and preserves request/receipt identities", async () => {
  const v = fixture(),
    runtime = await loadDevTripCreateRuntime(environment);
  expect(f.pg).toHaveBeenCalledExactlyOnceWith(v.config.tripPg);
  expect(f.storage).toHaveBeenCalledExactlyOnceWith(v.connection);
  expect(
    await runtime!.tripCreatePort.create(v.config.actorAccountId, v.config.request),
  ).toEqual(v.result);
  expect(
    await runtime!.tripCreatePort.receipt(
      v.config.actorAccountId,
      v.config.request.operationId,
    ),
  ).toEqual(v.result);
  expect(f.create).toHaveBeenCalledExactlyOnceWith(
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
  if (kind === "host") v.config.tripPg.host = "db.foreign.supabase.co";
  if (kind === "port") v.config.tripPg.port = 6543;
  if (kind === "database") v.config.tripPg.database = "foreign";
  if (kind === "unknown") Object.assign(v.config, { serviceRole: "not-accepted" });
  await expect(
    loadDevTripCreateRuntime(
      kind === "network"
        ? { ...environment, OTR_DEV_BACKEND_NETWORK_MODE: "bridge" }
        : kind === "project"
          ? { ...environment, OTR_DEV_SUPABASE_URL: "https://foreign.supabase.co" }
          : environment,
    ),
  ).rejects.toThrow("TRIP_CREATE_RUNTIME_UNAVAILABLE");
  expect(f.pg).not.toHaveBeenCalled();
  expect(v.close).toHaveBeenCalledOnce();
});
it("rejects another actor, operation, Trip or changed original payload before port execution", async () => {
  const v = fixture(),
    runtime = await loadDevTripCreateRuntime(environment);
  await expect(
    runtime!.tripCreatePort.receipt(randomUUID(), v.config.request.operationId),
  ).rejects.toMatchObject({ code: "TRIP_CREATE_FORBIDDEN" });
  await expect(
    runtime!.tripCreatePort.receipt(v.config.actorAccountId, randomUUID()),
  ).rejects.toMatchObject({ code: "TRIP_CREATE_FORBIDDEN" });
  for (const change of [
    { tripId: randomUUID() },
    { name: "different" },
    { destination: null },
    { startDate: "2027-01-01" },
    { endDate: "2027-01-02" },
  ])
    await expect(
      runtime!.tripCreatePort.create(v.config.actorAccountId, {
        ...v.config.request,
        ...change,
      }),
    ).rejects.toMatchObject({ code: "TRIP_CREATE_COLLISION" });
  expect(f.create).not.toHaveBeenCalled();
  expect(f.receipt).not.toHaveBeenCalled();
});
it("rejects expiry and closed activation, including a late result, without retrying", async () => {
  const v = fixture(),
    runtime = await loadDevTripCreateRuntime(environment);
  const clock = vi.spyOn(Date, "now");
  f.create.mockImplementationOnce(async () => {
    clock.mockReturnValue(Date.parse(v.config.expiresAt));
    return v.result;
  });
  try {
    await expect(
      runtime!.tripCreatePort.create(v.config.actorAccountId, v.config.request),
    ).rejects.toMatchObject({ code: "TRIP_CREATE_CLOSED" });
    await expect(
      runtime!.tripCreatePort.receipt(
        v.config.actorAccountId,
        v.config.request.operationId,
      ),
    ).rejects.toMatchObject({ code: "TRIP_CREATE_CLOSED" });
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.receipt).not.toHaveBeenCalled();
  } finally {
    clock.mockRestore();
  }
  await runtime!.close();
  await expect(
    runtime!.tripCreatePort.receipt(
      v.config.actorAccountId,
      v.config.request.operationId,
    ),
  ).rejects.toMatchObject({ code: "TRIP_CREATE_CLOSED" });
});
it("rejects a foreign Trip in a same-operation receipt and preserves a missing receipt", async () => {
  const v = fixture(),
    runtime = await loadDevTripCreateRuntime(environment);
  f.receipt.mockResolvedValueOnce({ ...v.result, tripId: randomUUID() });
  await expect(
    runtime!.tripCreatePort.receipt(
      v.config.actorAccountId,
      v.config.request.operationId,
    ),
  ).rejects.toMatchObject({ code: "TRIP_CREATE_RESULT_MISMATCH" });
  f.receipt.mockResolvedValueOnce(null);
  expect(
    await runtime!.tripCreatePort.receipt(
      v.config.actorAccountId,
      v.config.request.operationId,
    ),
  ).toBeNull();
});
