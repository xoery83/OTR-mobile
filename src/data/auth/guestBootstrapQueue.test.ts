import { afterEach, expect, it, vi } from "vitest";
import { defaultBootstrapDependencies } from "../bootstrap/defaultBootstrapDependencies";
import { bootstrapApplication } from "../bootstrap/bootstrapApplication";
import { announceLedgerQueueWorkAvailable } from "../sync/ledgerQueueActivity";
import {
  allowLedgerOperationalSync,
  pauseLedgerOperationalSync,
} from "../sync/ledgerOperationalSync";
const forbidden = vi.hoisted(() =>
  vi.fn(() => {
    throw Error("ACCOUNT_IO_FORBIDDEN");
  }),
);
vi.mock("../db/database", () => ({ openDatabase: forbidden }));
vi.mock("./authRepository", () => ({
  requireActiveUserId: forbidden,
  readLocalSession: async () => null,
  readLocalAuthSnapshot: async () => ({
    session: null,
    principal: { kind: "GUEST", localId: "00000000-0000-4000-8000-000000000001" },
  }),
}));
vi.mock("./guestLocalWorkspace", () => ({ openGuestLocalWorkspace: async () => {} }));
vi.mock("./accountLocalState", () => ({ adoptLegacyAccountState: forbidden }));
vi.mock("../repositories/defaultLedgerReportingRepository", () => ({
  getDefaultLedgerReportingRepository: forbidden,
}));
vi.mock("../sync/ledgerReportingCoordinator", () => ({
  refreshJourneyLedgerWithStatus: forbidden,
  refreshMyLedger: forbidden,
}));
vi.mock("../health/defaultDataHealthScheduler", () => ({
  getDefaultDataHealthScheduler: forbidden,
}));
vi.mock("../sync/transportSelection", () => ({ getSyncTransportMode: () => "dev" }));
vi.mock("expo-network", () => ({
  getNetworkStateAsync: forbidden,
  addNetworkStateListener: forbidden,
}));
vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: forbidden },
}));
vi.mock("../sync/nativeTripQaScope", () => ({
  hasNativeTripQaScope: () => false,
  getNativeTripQaQueueActivity: forbidden,
  runNativeTripQaSync: forbidden,
}));
vi.mock("../sync/tripMetadataCoordinator", () => ({
  isTripMetadataSyncEnabled: forbidden,
  runNativeTripMetadataSync: forbidden,
}));
vi.mock("../operations/ledgerMaintenance", () => ({
  cleanupReconstructibleLedgerData: forbidden,
  enforceReceiptCacheLimit: forbidden,
}));
vi.mock("../repositories/ledgerReceiptRepository", () => ({
  createLedgerReceiptRepository: forbidden,
}));
vi.mock("../sync/ledgerExpenseDemoCoordinator", () => ({
  runLedgerExpenseSync: forbidden,
}));
vi.mock("../sync/ledgerReceiptCoordinator", () => ({ runLedgerReceiptSync: forbidden }));
vi.mock("../sync/ledgerReviewCoordinator", () => ({ runLedgerReviewSync: forbidden }));
vi.mock("../sync/ledgerSettlementPaymentCoordinator", () => ({
  runLedgerSettlementPaymentSync: forbidden,
}));
vi.mock("../sync/ledgerPersonalPaymentCoordinator", () => ({
  runLedgerPersonalPaymentSync: forbidden,
}));
vi.mock("../sync/personalSettlementReviewCoordinator", () => ({
  runPersonalSettlementReviewSync: forbidden,
}));
afterEach(async () => {
  await pauseLedgerOperationalSync();
  vi.useRealTimers();
});
it("Guest startup cancels an existing real global queue wake and later local commits cannot wake Account sync", async () => {
  vi.useFakeTimers();
  allowLedgerOperationalSync();
  announceLedgerQueueWorkAvailable();
  expect(vi.getTimerCount()).toBe(1);
  await bootstrapApplication({
    ...defaultBootstrapDependencies,
    readAuthSnapshot: async () => ({
      session: null,
      principal: { kind: "GUEST", localId: "00000000-0000-4000-8000-000000000001" },
    }),
    openDatabase: forbidden,
    readLocalSession: forbidden,
    openGuestWorkspace: async () => {
      expect(vi.getTimerCount()).toBe(0);
    },
    resumeSync: forbidden,
    scheduleHealth: forbidden,
  });
  announceLedgerQueueWorkAvailable();
  await vi.runAllTimersAsync();
  expect(vi.getTimerCount()).toBe(0);
  expect(forbidden).not.toHaveBeenCalled();
});
