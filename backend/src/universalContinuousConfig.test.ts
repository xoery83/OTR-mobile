import { createHash, randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import {
  readUniversalContinuousConfig,
  universalContinuousConfigSchema,
} from "./universalContinuousConfig";
const f = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("node:fs/promises", async () => ({
  ...(await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")),
  open: f.open,
}));
beforeEach(() => vi.resetAllMocks());
it("default CLOSED does not open a runtime file or access any key", async () => {
  expect(await readUniversalContinuousConfig({})).toBeUndefined();
  expect(f.open).not.toHaveBeenCalled();
});
it("missing explicit V2 configuration remains CLOSED", async () => {
  f.open.mockRejectedValueOnce(Object.assign(Error(), { code: "ENOENT" }));
  expect(
    await readUniversalContinuousConfig({
      OTR_DEV_UNIVERSAL_CONTINUOUS_HOST: "enabled",
      OTR_DEV_BACKEND_NETWORK_MODE: "host",
      OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    }),
  ).toBeUndefined();
});
it.each(["mode", "hash", "actor"])(
  "rejects unsafe %s configuration before opening Task DB or network",
  async (kind) => {
    const body = JSON.stringify({ version: 2, actorId: "forbidden" }),
      close = vi.fn();
    f.open.mockResolvedValueOnce({
      stat: async () => ({
        isFile: () => true,
        uid: 0,
        gid: 999,
        mode: kind === "mode" ? 0o644 : 0o440,
        nlink: 1,
        size: body.length,
      }),
      readFile: async () => body,
      close,
    });
    await expect(
      readUniversalContinuousConfig({
        OTR_DEV_UNIVERSAL_CONTINUOUS_HOST: "enabled",
        OTR_DEV_BACKEND_NETWORK_MODE: "host",
        OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
        OTR_DEV_UNIVERSAL_RUNTIME_SHA256:
          kind === "hash"
            ? "a".repeat(64)
            : createHash("sha256").update(body).digest("hex"),
      }),
    ).rejects.toThrow("CLOSED");
    expect(close).toHaveBeenCalledOnce();
  },
);

function configFixture() {
  const pg = {
    host: "db.tuqigdxrvrerfewsxqgm.supabase.co",
    port: 5432,
    database: "postgres",
    password: "LOCAL_FIXTURE_ONLY",
    ca: "LOCAL_FIXTURE_ONLY",
  };
  return {
    version: 2,
    environment: "DEV",
    project: "tuqigdxrvrerfewsxqgm",
    enabled: true,
    integrationId: "fixture",
    directory: "/var/lib/otr/universal-custody",
    identity: { store_id: randomUUID(), device: "1", inode: "1" },
    taskDatabase: "/var/lib/otr/universal-custody/continuations.db",
    sourcePg: pg,
    taskPg: pg,
    catalogPg: pg,
  };
}

it.each([false, true])(
  "optional execution fence follows the same private configuration hash boundary: %s",
  async (fenced) => {
    const fence = { version: 1, accountId: randomUUID(), tripId: randomUUID() };
    const config = { ...configFixture(), ...(fenced ? { qaExecutionFence: fence } : {}) };
    const body = JSON.stringify(config),
      close = vi.fn();
    f.open.mockResolvedValueOnce({
      stat: async () => ({
        isFile: () => true,
        uid: 0,
        gid: 999,
        mode: 0o440,
        nlink: 1,
        size: body.length,
      }),
      readFile: async () => body,
      close,
    });
    const result = await readUniversalContinuousConfig({
      OTR_DEV_UNIVERSAL_CONTINUOUS_HOST: "enabled",
      OTR_DEV_BACKEND_NETWORK_MODE: "host",
      OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
      OTR_DEV_UNIVERSAL_RUNTIME_SHA256: createHash("sha256").update(body).digest("hex"),
    });
    expect(result?.qaExecutionFence).toEqual(fenced ? fence : undefined);
    expect(close).toHaveBeenCalledOnce();
  },
);

it.each([
  null,
  { version: 2, accountId: randomUUID(), tripId: randomUUID() },
  { version: 1, accountId: "invalid", tripId: randomUUID() },
  { version: 1, accountId: randomUUID(), tripId: "invalid" },
  { version: 1, accountId: randomUUID() },
  { version: 1, accountId: randomUUID(), tripId: randomUUID(), grantsPermission: true },
])("rejects malformed/unknown execution restrictions: %j", (qaExecutionFence) => {
  expect(
    universalContinuousConfigSchema.safeParse({ ...configFixture(), qaExecutionFence })
      .success,
  ).toBe(false);
});
