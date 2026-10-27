import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  auth: 0,
  pools: 0,
  db: 0,
  close: 0,
  claimed: [] as unknown[],
}));
vi.mock("node:fs/promises", () => ({
  open: async () => ({
    stat: async () => ({
      isFile: () => true,
      uid: 0,
      gid: 999,
      mode: 0o440,
      nlink: 1,
      size: 2,
    }),
    readFile: async () => Buffer.from("{}"),
    close: async () => {},
  }),
  lstat: async () => {
    state.db++;
    throw Error("DATABASE_NOT_ALLOWED");
  },
}));
vi.mock("./universalFiniteConfig", () => ({
  universalFiniteConfigSchema: {
    parse: () => ({
      actorId: "actor",
      task: { account_id: "actor", task_id: "task", trip_id: "trip" },
      attempt: { account_id: "actor", task_id: "task" },
      directory: "/custody",
      identity: {},
    }),
  },
}));
vi.mock("./flightPrivateCustody", () => ({
  createFlightPrivateCustody: async () => ({
    claimReadStartup: async (input: unknown) => {
      state.claimed.push(input);
      throw Error("CUSTODY_STARTUP_ALREADY_CLAIMED");
    },
    close: async () => {
      state.close++;
    },
  }),
}));
vi.mock("./supabaseGateway", () => ({
  createSupabaseDevGateway: () => {
    state.auth++;
    throw Error("AUTH_NOT_ALLOWED");
  },
}));
vi.mock("./tripPublicationCatalogPgConnection", () => ({
  createPublicationCatalogPgConnection: () => {
    state.pools++;
    throw Error("POOL_NOT_ALLOWED");
  },
}));
it("actual loader denies burned claim before gateway, Task DB or Catalog pool; Operator kind is static", async () => {
  const { createHash } = await import("node:crypto");
  const {
    loadSettledUniversalReadRuntime,
    runSettledUniversalRecoveryOperator,
  } = await import("./universalSettledRecoveryOperator");
  const args = {
    configPath: "/run/otr/universal-recovery.json",
    configSHA256: createHash("sha256").update("{}").digest("hex"),
    startsAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    priceSchedule: {
      currency: "USD" as const,
      inputNanosPerMillion: "1",
      cachedInputNanosPerMillion: "1",
      outputNanosPerMillion: "1",
    },
  };
  const env = {
    OTR_DEV_BACKEND_NETWORK_MODE: "host",
    OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
  };
  await expect(
    loadSettledUniversalReadRuntime({ ...args, startupKind: "HOST" }, env),
  ).rejects.toThrow("CUSTODY_STARTUP_ALREADY_CLAIMED");
  await expect(runSettledUniversalRecoveryOperator(args, env)).rejects.toThrow(
    "CUSTODY_STARTUP_ALREADY_CLAIMED",
  );
  expect(state.claimed).toEqual([
    {
      kind: "HOST",
      configSHA256: args.configSHA256,
      startsAt: args.startsAt,
      expiresAt: args.expiresAt,
    },
    {
      kind: "OPERATOR",
      configSHA256: args.configSHA256,
      startsAt: args.startsAt,
      expiresAt: args.expiresAt,
    },
  ]);
  expect(state.auth).toBe(0);
  expect(state.pools).toBe(0);
  expect(state.db).toBe(0);
  expect(state.close).toBe(2);
});
