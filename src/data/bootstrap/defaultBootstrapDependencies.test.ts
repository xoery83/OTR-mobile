import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readLocalSession: vi.fn(),
  refreshSession: vi.fn(),
  runSync: vi.fn(),
  generation: 0,
  userId: "user-a",
  listJourneys: vi.fn(),
  selectJourney: vi.fn(),
  discover: vi.fn(),
  retry: vi.fn(),
  notify: vi.fn(),
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
  requireActiveUserId: async () => mocks.userId,
}));
vi.mock("@/data/repositories/defaultLedgerReportingRepository", () => ({
  getDefaultLedgerReportingRepository: async () => ({
    getSelectedJourneyId: mocks.selectedJourney,
    listJourneys: mocks.listJourneys,
    selectJourney: mocks.selectJourney,
  }),
}));
vi.mock("@/data/sync/ledgerReportingCoordinator", () => ({
  refreshJourneyLedgerWithStatus: mocks.refreshJourney,
  refreshMyLedger: mocks.discover,
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
  scheduleOperationalReadRetry: mocks.retry,
  notifyLedgerReadCompletion: mocks.notify,
  pauseLedgerOperationalSync: async () => {},
  allowLedgerOperationalSync: () => {},
  reactivateLongLivedLedgerFailures: async () => {},
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
    vi.resetModules();
    vi.clearAllMocks();
    mocks.discover.mockReset();
    mocks.runSync.mockReset();
    mocks.refreshJourney.mockReset();
    mocks.selectedJourney.mockReset();
    mocks.listJourneys.mockReset();
    mocks.generation += 1;
    mocks.userId = "user-a";
    mocks.readLocalSession.mockResolvedValue({
      identity: { userId: "user-a" },
      accessToken: "expired",
      refreshToken: "refresh",
      expiresAt: "2000-01-01T00:00:00Z",
    });
    mocks.listJourneys.mockResolvedValue([]);
    mocks.selectedJourney.mockResolvedValue(null);
    mocks.refreshJourney.mockResolvedValue({ changed: false, incomplete: false });
  });

  it("discovers for an expired local Dev session without blocking the existing operational cycle", async () => {
    const { defaultBootstrapDependencies } =
      await import("./defaultBootstrapDependencies");
    mocks.readLocalSession.mockResolvedValue({
      identity: { userId: "user-a" },
      accessToken: "expired",
      refreshToken: "refresh-token",
      expiresAt: "2000-01-01T00:00:00.000Z",
    });

    await defaultBootstrapDependencies.resumeSync?.();

    expect(mocks.discover).toHaveBeenCalledOnce();
    expect(mocks.runSync).toHaveBeenCalledBefore(mocks.discover);
  });

  it("coalesces foreground and Ledger refresh-before-sync work", async () => {
    const { resumeOperationalSync } = await import("./defaultBootstrapDependencies");
    mocks.readLocalSession.mockResolvedValue({
      identity: { userId: "user-a" },
      accessToken: "expired",
      refreshToken: "refresh-token",
      expiresAt: "2000-01-01T00:00:00.000Z",
    });
    let finish!: () => void;
    mocks.discover.mockReturnValueOnce(new Promise<void>((done) => (finish = done)));

    const foreground = resumeOperationalSync();
    const ledger = resumeOperationalSync();
    await vi.waitFor(() => expect(mocks.discover).toHaveBeenCalledOnce());
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
      generation: mocks.generation,
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
      mocks.listJourneys.mockResolvedValue([
        {
          journeyId: "10000000-0000-4000-8000-000000000001",
          title: "Cached",
          startDate: null,
          endDate: null,
        },
      ]);
      mocks.runSync.mockResolvedValue(undefined);
      mocks.refreshJourney.mockResolvedValue({ changed: false, incomplete: false });
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
          expect.objectContaining({ accountId: "user-a", generation: mocks.generation }),
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
    mocks.listJourneys.mockResolvedValue([
      { journeyId: "journey-b", title: "Cached", startDate: null, endDate: null },
    ]);
    mocks.selectedJourney.mockResolvedValue("journey-b");
    mocks.refreshJourney.mockRejectedValueOnce(new Error("Backend unavailable"));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await expect(resumeOperationalSync()).resolves.toBeUndefined();
      expect(info).toHaveBeenCalledWith(
        JSON.stringify({
          event: "ledger_sync_failure",
          phase: "discovery",
          kind: "local",
        }),
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
    await expect(resumeOperationalSync()).rejects.toThrow("Account changed");
    expect(mocks.refreshJourney).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2])(
    "keeps empty/MY_LEDGER/CHOOSE discovery valid: %s eligible summaries",
    async (count) => {
      const { resumeOperationalSync } = await import("./defaultBootstrapDependencies");
      mocks.listJourneys.mockResolvedValue(
        Array.from({ length: count }, (_, i) => ({
          journeyId: `journey-${i}`,
          title: "Eligible",
          startDate: count === 2 ? "2000-01-01" : null,
          endDate: count === 2 ? "2099-01-01" : null,
        })),
      );
      await resumeOperationalSync();
      await resumeOperationalSync();
      expect(mocks.discover).toHaveBeenCalledExactlyOnceWith(
        "ALL",
        { from: null, to: null },
        { accountId: "user-a", generation: mocks.generation },
      );
      expect(mocks.refreshJourney).not.toHaveBeenCalled();
      expect(mocks.selectJourney).not.toHaveBeenCalled();
      expect(mocks.notify).toHaveBeenCalledWith({
        accountId: "user-a",
        generation: mocks.generation,
        journeyIds: [],
        discoveryChanged: true,
      });
      expect(mocks.retry).toHaveBeenLastCalledWith(null);
    },
  );
  it("selects only the single current Journey and hydrates a zero-Expense summary", async () => {
    const { resumeOperationalSync } = await import("./defaultBootstrapDependencies");
    mocks.listJourneys.mockResolvedValue([
      { journeyId: "current", startDate: "2000-01-01", endDate: "2099-01-01" },
      { journeyId: "past", startDate: "2000-01-01", endDate: "2000-01-02" },
    ]);
    mocks.selectedJourney.mockResolvedValue("no-longer-eligible");
    await resumeOperationalSync();
    expect(mocks.selectJourney).toHaveBeenCalledExactlyOnceWith("current", {
      accountId: "user-a",
      generation: mocks.generation,
    });
    expect(mocks.refreshJourney).toHaveBeenCalledExactlyOnceWith("current", {
      accountId: "user-a",
      generation: mocks.generation,
      tripId: "current",
    });
  });
  it("publishes first discovery before waiting for selected hydration", async () => {
    const { resumeOperationalSync } = await import("./defaultBootstrapDependencies");
    mocks.listJourneys.mockResolvedValue([
      { journeyId: "current", startDate: "2000-01-01", endDate: "2099-01-01" },
    ]);
    let release!: () => void;
    mocks.refreshJourney.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ incomplete: false });
        }),
    );
    const run = resumeOperationalSync();
    await vi.waitFor(() => expect(mocks.refreshJourney).toHaveBeenCalledOnce());
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ discoveryChanged: true, journeyIds: [] }),
    );
    release();
    await run;
  });
  it("retries transient discovery at 15/30/60 seconds through the operational owner", async () => {
    const { resumeOperationalSync } = await import("./defaultBootstrapDependencies");
    mocks.discover.mockRejectedValue(
      new (await import("@/data/api/client")).ApiClientError(
        "temporary network",
        "network",
      ),
    );
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      for (const delay of [15000, 30000, 60000, 60000]) {
        const before = Date.now();
        await resumeOperationalSync();
        const retry = mocks.retry.mock.lastCall?.[0];
        expect(retry.generation).toBe(mocks.generation);
        expect(retry.at).toBeGreaterThanOrEqual(before + delay);
        expect(retry.at).toBeLessThanOrEqual(Date.now() + delay);
        expect(retry.run).toBe(resumeOperationalSync);
      }
      mocks.discover.mockResolvedValue(undefined);
      await mocks.retry.mock.lastCall?.[0].run();
      expect(mocks.retry).toHaveBeenLastCalledWith(null);
    } finally {
      info.mockRestore();
    }
  });
  it("retries only hydration after successful discovery with an incomplete read", async () => {
    const { resumeOperationalSync } = await import("./defaultBootstrapDependencies");
    mocks.listJourneys.mockResolvedValue([
      { journeyId: "current", startDate: "2000-01-01", endDate: "2099-01-01" },
    ]);
    mocks.selectedJourney.mockResolvedValue("current");
    mocks.refreshJourney
      .mockResolvedValueOnce({
        incomplete: true,
        auxiliaryErrors: [
          new (await import("@/data/api/client")).ApiClientError("temporary", "network"),
        ],
      })
      .mockResolvedValue({ incomplete: false });
    await resumeOperationalSync();
    await mocks.retry.mock.lastCall?.[0].run();
    expect(mocks.discover).toHaveBeenCalledOnce();
    expect(mocks.refreshJourney).toHaveBeenCalledTimes(2);
    expect(mocks.retry).toHaveBeenLastCalledWith(null);
  });
  it.each(["discovery", "list", "selection", "hydration"])(
    "fences A→B→A at %s before UI notification",
    async (boundary) => {
      const { resumeOperationalSync } = await import("./defaultBootstrapDependencies");
      const change = () => {
        mocks.userId = "user-b";
        mocks.generation++;
        mocks.userId = "user-a";
        mocks.generation++;
      };
      mocks.listJourneys.mockResolvedValue([
        { journeyId: "current", startDate: "2000-01-01", endDate: "2099-01-01" },
      ]);
      if (boundary === "discovery")
        mocks.discover.mockImplementationOnce(async () => change());
      if (boundary === "list")
        mocks.listJourneys.mockImplementationOnce(async () => {
          change();
          return [];
        });
      if (boundary === "selection")
        mocks.selectJourney.mockImplementationOnce(async () => change());
      if (boundary === "hydration")
        mocks.refreshJourney.mockImplementationOnce(async () => {
          change();
          return { incomplete: false };
        });
      const initial = mocks.generation;
      await expect(resumeOperationalSync()).rejects.toThrow("Account changed");
      expect(
        mocks.notify.mock.calls.every(([event]) => event.generation === initial),
      ).toBe(true);
      expect(mocks.notify).not.toHaveBeenCalledWith(
        expect.objectContaining({ journeyIds: ["current"] }),
      );
    },
  );
  it.each(["valid", "expired"])(
    "keeps %s offline session cache available and discovers on reconnect",
    async (token) => {
      const { resumeOperationalSync, subscribeOperationalSyncLifecycle } =
        await import("./defaultBootstrapDependencies");
      mocks.readLocalSession.mockResolvedValue({
        identity: { userId: "user-a" },
        accessToken: token,
      });
      const lifecycle = subscribeOperationalSyncLifecycle();
      mocks.networkListener?.({ isConnected: false });
      await resumeOperationalSync();
      expect(mocks.discover).not.toHaveBeenCalled();
      expect(mocks.runSync).not.toHaveBeenCalled();
      mocks.networkListener?.({ isConnected: true });
      await resumeOperationalSync();
      expect(mocks.discover).toHaveBeenCalledOnce();
      lifecycle.remove();
    },
  );
  it("returns Account activation while remote work is unresolved and reloads cached Account state", async () => {
    const {
      bootstrapActivatedAccount,
      pauseOperationalSync,
      restartOperationalSync,
      resumeOperationalSync,
    } = await import("./defaultBootstrapDependencies");
    await pauseOperationalSync();
    let release!: () => void;
    mocks.discover.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await bootstrapActivatedAccount({
      identity: { userId: "user-a", displayName: "A", email: null },
      accessToken: "a",
      refreshToken: "r",
      expiresAt: null,
    });
    await restartOperationalSync();
    await vi.waitFor(() => expect(mocks.discover).toHaveBeenCalledOnce());
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ discoveryChanged: true, journeyIds: [] }),
    );
    release();
    await resumeOperationalSync();
  });
});

it("F3: module import null then native active at subscription enables discovery", async () => {
  vi.resetModules();
  vi.clearAllMocks();
  const { AppState } = await import("react-native");
  AppState.currentState = null as never;
  const owner = await import("./defaultBootstrapDependencies");
  AppState.currentState = "active";
  mocks.userId = "user-a";
  mocks.readLocalSession.mockResolvedValue({ identity: { userId: "user-a" } });
  mocks.listJourneys.mockResolvedValue([]);
  mocks.selectedJourney.mockResolvedValue(null);
  const subscription = owner.subscribeOperationalSyncLifecycle();
  try {
    await owner.resumeOperationalSync();
    expect(mocks.discover).toHaveBeenCalledOnce();
  } finally {
    subscription.remove();
  }
});
it("F4: live online supersedes the pending initial offline snapshot", async () => {
  vi.resetModules();
  vi.clearAllMocks();
  const network = await import("expo-network");
  let release!: (state: { isConnected: boolean }) => void;
  vi.mocked(network.getNetworkStateAsync).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  mocks.userId = "user-a";
  mocks.readLocalSession.mockResolvedValue({ identity: { userId: "user-a" } });
  mocks.listJourneys.mockResolvedValue([]);
  mocks.selectedJourney.mockResolvedValue(null);
  const owner = await import("./defaultBootstrapDependencies");
  const subscription = owner.subscribeOperationalSyncLifecycle();
  try {
    mocks.networkListener?.({ isConnected: true, isInternetReachable: true });
    release({ isConnected: false });
    await Promise.resolve();
    await owner.resumeOperationalSync();
    expect(mocks.discover).toHaveBeenCalledOnce();
    expect(mocks.runSync).toHaveBeenCalledOnce();
  } finally {
    subscription.remove();
  }
});
it("F1: partial hydration then successful retry reloads the mounted My Ledger", async () => {
  vi.resetModules();
  vi.clearAllMocks();
  const { createMountedMyLedgerProbe } =
    await import("@/features/ledger/__tests__/mountedMyLedgerProbe");
  const mounted = createMountedMyLedgerProbe(() => mocks.generation);
  mocks.notify.mockImplementation((event) => mounted.complete(event));
  mocks.userId = "user-a";
  mocks.readLocalSession.mockResolvedValue({ identity: { userId: "user-a" } });
  mocks.listJourneys.mockResolvedValue([
    { journeyId: "current", startDate: "2000-01-01", endDate: "2099-01-01" },
  ]);
  mocks.selectedJourney.mockResolvedValue("current");
  const { ApiClientError } = await import("@/data/api/client");
  mocks.refreshJourney
    .mockResolvedValueOnce({
      incomplete: true,
      auxiliaryErrors: [new ApiClientError("temporary", "network")],
    })
    .mockResolvedValue({ incomplete: false });
  const owner = await import("./defaultBootstrapDependencies");
  await owner.resumeOperationalSync();
  const before = mounted.loads();
  const retry = mocks.retry.mock.lastCall?.[0];
  expect(retry).toBeTruthy();
  await retry.run();
  expect(mounted.loads()).toBeGreaterThan(before);
  const after = mounted.loads();
  mounted.complete({
    accountId: "user-a",
    generation: mocks.generation - 1,
    journeyIds: ["current"],
    discoveryChanged: true,
  });
  expect(mounted.loads()).toBe(after);
  mocks.notify.mockReset();
});
