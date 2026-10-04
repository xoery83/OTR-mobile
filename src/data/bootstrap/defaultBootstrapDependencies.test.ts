import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readLocalSession: vi.fn(),
  refreshSession: vi.fn(),
  runSync: vi.fn(),
  generation: 0,
  selectedJourney: vi.fn(),
  refreshJourney: vi.fn(),
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
vi.mock("@/data/repositories/defaultLedgerReportingRepository", () => ({
  getDefaultLedgerReportingRepository: async () => ({
    getSelectedJourneyId: mocks.selectedJourney,
  }),
}));
vi.mock("@/data/sync/ledgerReportingCoordinator", () => ({
  refreshJourneyLedger: mocks.refreshJourney,
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
  getAccountGeneration: () => mocks.generation,
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generation = 0;
  });

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
  it.each(["cold start", "foreground", "reconnect"])(
    "%s wakes selected shared Trip with an empty financial queue",
    async (trigger) => {
      const { resumeOperationalSync, subscribeOperationalSyncLifecycle } =
        await import("./defaultBootstrapDependencies");
      mocks.readLocalSession.mockResolvedValue({
        identity: { userId: "user-a" },
        accessToken: "valid",
        refreshToken: "refresh",
      });
      mocks.selectedJourney.mockResolvedValue("10000000-0000-4000-8000-000000000001");
      mocks.runSync.mockResolvedValue(undefined);
      mocks.refreshJourney.mockResolvedValue(false);
      const subscription = subscribeOperationalSyncLifecycle();
      await Promise.resolve();
      try {
        if (trigger === "foreground") mocks.appStateListener?.("active");
        if (trigger === "reconnect") {
          mocks.networkListener?.({ isConnected: false });
          mocks.networkListener?.({ isConnected: true });
        }
        await resumeOperationalSync();
        expect(mocks.refreshJourney).toHaveBeenCalledOnce();
        expect(mocks.refreshJourney).toHaveBeenCalledWith(
          "10000000-0000-4000-8000-000000000001",
        );
        expect(mocks.runSync).toHaveBeenCalledOnce();
      } finally {
        subscription.remove();
      }
    },
  );
  it("records shared verification failure without rejecting resume", async () => {
    const { resumeOperationalSync } = await import("./defaultBootstrapDependencies");
    mocks.readLocalSession.mockResolvedValue({ identity: { userId: "user-b" } });
    mocks.selectedJourney.mockResolvedValue("journey-b");
    mocks.refreshJourney.mockRejectedValueOnce(new Error("Backend unavailable"));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await expect(resumeOperationalSync()).resolves.toBeUndefined();
      expect(info).toHaveBeenCalledWith(
        JSON.stringify({ event: "ledger_sync_failure", phase: "pull", kind: "local" }),
      );
    } finally {
      info.mockRestore();
    }
  });
  it("still propagates unrelated operational resume failure", async () => {
    const { resumeOperationalSync } = await import("./defaultBootstrapDependencies");
    mocks.readLocalSession.mockResolvedValue({ identity: { userId: "user-b" } });
    mocks.runSync.mockRejectedValueOnce(new Error("Operational failure"));
    await expect(resumeOperationalSync()).rejects.toThrow("Operational failure");
    expect(mocks.refreshJourney).not.toHaveBeenCalled();
  });
  it("skips refresh if generation changes while resolving selected Trip", async () => {
    const { resumeOperationalSync } = await import("./defaultBootstrapDependencies");
    mocks.readLocalSession.mockResolvedValue({ identity: { userId: "user-b" } });
    mocks.selectedJourney.mockImplementationOnce(async () => {
      mocks.generation += 1;
      return "journey-b";
    });
    await resumeOperationalSync();
    expect(mocks.refreshJourney).not.toHaveBeenCalled();
  });
});
