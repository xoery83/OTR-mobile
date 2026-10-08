import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  retry: vi.fn(),
  notify: vi.fn(),
  personal: vi.fn(),
  review: vi.fn(),
  bootstrap: vi.fn(),
  pull: vi.fn(),
  discovery: vi.fn(),
  apply: vi.fn(),
  generation: 1,
}));
vi.mock("@/data/auth/authRepository", () => ({
  readLocalSession: async () => ({ identity: { userId: "A" } }),
  requireActiveUserId: async () => "A",
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => m.generation,
}));
vi.mock("@/data/db/database", () => ({ openDatabase: vi.fn() }));
vi.mock("@/data/sync/transportSelection", () => ({ getSyncTransportMode: () => "dev" }));
vi.mock("@/data/repositories/defaultLedgerReportingRepository", () => ({
  getDefaultLedgerReportingRepository: async () => ({
    listJourneys: async () => [
      { journeyId: "J", startDate: "2000-01-01", endDate: "2099-01-01" },
    ],
    getSelectedJourneyId: async () => "J",
  }),
}));
vi.mock("@/data/repositories/defaultLedgerReadRepository", () => ({
  getDefaultLedgerReadRepository: async () => ({
    getCursor: async () => null,
    applyBootstrap: m.apply,
    cacheMyLedger: vi.fn(),
  }),
}));
vi.mock("@/data/sync/ledgerReadTransport", () => ({
  createLedgerReadTransport: () => ({
    myLedger: m.discovery,
    bootstrap: m.bootstrap,
    pull: m.pull,
  }),
}));
vi.mock("@/data/sync/ledgerPersonalPaymentCoordinator", () => ({
  refreshLedgerPersonalPayments: m.personal,
}));
vi.mock("@/data/sync/personalSettlementReviewCoordinator", () => ({
  refreshPersonalSettlementReview: m.review,
}));
vi.mock("@/data/sync/ledgerOperationalSync", () => ({
  runLedgerOperationalSync: async () => {},
  scheduleOperationalReadRetry: m.retry,
  notifyLedgerReadCompletion: m.notify,
  pauseLedgerOperationalSync: async () => {},
  allowLedgerOperationalSync: () => {},
  reactivateLongLivedLedgerFailures: async () => {},
  subscribeLedgerOperationalSyncCompletion: vi.fn(),
}));
vi.mock("@/data/health/defaultDataHealthScheduler", () => ({
  getDefaultDataHealthScheduler: () => ({ schedule: async () => {} }),
}));
vi.mock("expo-network", () => ({
  getNetworkStateAsync: async () => ({ isConnected: true }),
  addNetworkStateListener: () => ({ remove() {} }),
}));
vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  m.personal.mockReset();
  m.review.mockReset();
  m.generation++;
  m.personal.mockResolvedValue(false);
  m.review.mockResolvedValue(undefined);
  m.discovery.mockResolvedValue({ journeys: [] });
  m.bootstrap.mockResolvedValue({ cursor: "c" });
});

it.each(["personal", "review"] as const)(
  "F2: %s definitive failures preserve shared hydration and do not schedule retry",
  async (source) => {
    const { ApiClientError } = await import("@/data/api/client");
    const owner = await import("./defaultBootstrapDependencies");
    for (const error of [
      new ApiClientError("400", "http", 400),
      new ApiClientError("401", "http", 401),
      new ApiClientError("403", "http", 403),
      new ApiClientError("409", "http", 409, "OTHER_CONFLICT"),
      new ApiClientError("invalid", "validation"),
      new Error("unclassified"),
    ]) {
      m.retry.mockClear();
      m.apply.mockClear();
      (source === "personal" ? m.personal : m.review).mockRejectedValue(error);
      await owner.resumeOperationalSync();
      expect(m.retry).toHaveBeenLastCalledWith(null);
      expect(m.apply).toHaveBeenCalledOnce();
    }
    expect(m.discovery).toHaveBeenCalledOnce();
  },
);
it.each(["personal", "review"] as const)(
  "F2: %s transient failures retry hydration only",
  async (source) => {
    const { ApiClientError } = await import("@/data/api/client");
    const owner = await import("./defaultBootstrapDependencies");
    for (const error of [
      new ApiClientError("network", "network"),
      new ApiClientError("timeout", "timeout"),
      new ApiClientError("429", "http", 429),
      new ApiClientError("500", "http", 500),
      new ApiClientError("503", "http", 503),
    ]) {
      (source === "personal" ? m.personal : m.review).mockRejectedValue(error);
      m.retry.mockClear();
      await owner.resumeOperationalSync();
      const retry = m.retry.mock.lastCall?.[0];
      expect(retry).toBeTruthy();
      (source === "personal" ? m.personal : m.review).mockResolvedValue(false);
      await retry.run();
      expect(m.retry).toHaveBeenLastCalledWith(null);
    }
    expect(m.discovery).toHaveBeenCalledOnce();
  },
);
it("F2: definitive Review error dominates transient Personal failure", async () => {
  const { ApiClientError } = await import("@/data/api/client");
  m.personal.mockRejectedValue(new ApiClientError("offline", "network"));
  m.review.mockRejectedValue(new ApiClientError("denied", "http", 403));
  const owner = await import("./defaultBootstrapDependencies");
  await owner.resumeOperationalSync();
  expect(m.retry).toHaveBeenLastCalledWith(null);
  expect(m.apply).toHaveBeenCalledOnce();
});
it("F2: exact blocked Review409 remains stable, not incomplete", async () => {
  const { ApiClientError } = await import("@/data/api/client");
  m.review.mockRejectedValue(
    new ApiClientError("blocked", "http", 409, "SETTLEMENT_REVIEW_BLOCKED"),
  );
  const { resumeOperationalSync } = await import("./defaultBootstrapDependencies");
  await resumeOperationalSync();
  expect(m.retry).toHaveBeenLastCalledWith(null);
  expect(m.apply).toHaveBeenCalledOnce();
});
