import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readLocalSession: vi.fn(),
  refreshSession: vi.fn(),
  runSync: vi.fn(),
  scheduleHealth: vi.fn(),
  appStateListener: null as ((state: string) => void) | null,
  networkListener: null as
    ((state: { isConnected?: boolean; isInternetReachable?: boolean }) => void) | null,
  syncListener: null as
    | ((event: { accountId: string; generation: number; journeyIds: string[] }) => void)
    | null,
}));

vi.mock("@/data/auth/authRepository", () => ({
  readLocalSession: mocks.readLocalSession,
}));
vi.mock("@/data/auth/devSupabaseAuth", () => ({
  revalidateStoredSupabaseDevSession: vi.fn(),
}));
vi.mock("@/data/auth/sessionAccessToken", () => ({
  sessionAccessToken: mocks.refreshSession,
}));
vi.mock("@/data/db/database", () => ({ openDatabase: vi.fn() }));
vi.mock("@/data/sync/ledgerOperationalSync", () => ({
  runLedgerOperationalSync: mocks.runSync,
  subscribeLedgerOperationalSyncCompletion: vi.fn((listener) => {
    mocks.syncListener = listener;
    return vi.fn();
  }),
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => 0,
}));
vi.mock("@/data/health/defaultDataHealthScheduler", () => ({
  getDefaultDataHealthScheduler: () => ({ schedule: mocks.scheduleHealth }),
}));
vi.mock("expo-network", () => ({
  getNetworkStateAsync: vi.fn().mockResolvedValue({ isConnected: true }),
  addNetworkStateListener: vi.fn((listener) => {
    mocks.networkListener = listener;
    return { remove: vi.fn() };
  }),
}));
vi.mock("@/data/sync/transportSelection", () => ({
  getSyncTransportMode: () => "dev",
}));
vi.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: vi.fn((_event, listener) => {
      mocks.appStateListener = listener;
      return { remove: vi.fn() };
    }),
  },
}));

describe("default bootstrap sync", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refreshes an expired Dev session before operational sync", async () => {
    const { defaultBootstrapDependencies } =
      await import("./defaultBootstrapDependencies");
    mocks.readLocalSession.mockResolvedValue({
      accessToken: "expired",
      refreshToken: "refresh-token",
      expiresAt: "2000-01-01T00:00:00.000Z",
    });

    await defaultBootstrapDependencies.resumeSync?.();

    expect(mocks.refreshSession).toHaveBeenCalledOnce();
    expect(mocks.refreshSession).toHaveBeenCalledBefore(mocks.runSync);
  });

  it("coalesces foreground and Ledger refresh-before-sync work", async () => {
    const { resumeOperationalSync } = await import("./defaultBootstrapDependencies");
    mocks.readLocalSession.mockResolvedValue({
      accessToken: "expired",
      refreshToken: "refresh-token",
      expiresAt: "2000-01-01T00:00:00.000Z",
    });
    let finish!: () => void;
    mocks.refreshSession.mockReturnValueOnce(
      new Promise<void>((done) => (finish = done)),
    );

    const foreground = resumeOperationalSync();
    const ledger = resumeOperationalSync();
    await Promise.resolve();
    expect(mocks.refreshSession).toHaveBeenCalledOnce();
    finish();
    await Promise.all([foreground, ledger]);

    expect(mocks.runSync).toHaveBeenCalledOnce();
  });

  it("wires foreground, reconnect and normal-sync completion health signals", async () => {
    const { subscribeOperationalSyncLifecycle } =
      await import("./defaultBootstrapDependencies");
    mocks.readLocalSession.mockResolvedValue({
      identity: { userId: "user-a" },
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: "2099-01-01T00:00:00Z",
    });
    mocks.scheduleHealth.mockResolvedValue(null);
    const subscription = subscribeOperationalSyncLifecycle();
    await Promise.resolve();

    mocks.appStateListener?.("active");
    mocks.networkListener?.({ isConnected: false });
    mocks.networkListener?.({ isConnected: true, isInternetReachable: true });
    mocks.syncListener?.({
      accountId: "user-a",
      generation: 0,
      journeyIds: ["journey-a"],
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.scheduleHealth).toHaveBeenCalledWith({
      trigger: "FOREGROUND",
      journeyIds: [],
    });
    expect(mocks.scheduleHealth).toHaveBeenCalledWith({
      trigger: "CONNECTIVITY_RESTORED",
      journeyIds: [],
    });
    expect(mocks.scheduleHealth).toHaveBeenCalledWith({
      trigger: "SYNC_COMPLETED",
      journeyIds: ["journey-a"],
    });
    subscription.remove();
  });
});
