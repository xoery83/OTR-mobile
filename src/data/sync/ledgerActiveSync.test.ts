import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openDatabase: vi.fn(),
  runOperational: vi.fn(),
  refreshJourney: vi.fn(),
}));

vi.mock("@/data/db/database", () => ({ openDatabase: mocks.openDatabase }));
vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: vi.fn(async () => "user-a"),
}));
vi.mock("@/data/bootstrap/defaultBootstrapDependencies", () => ({
  resumeOperationalSync: mocks.runOperational,
}));
vi.mock("./ledgerReportingCoordinator", () => ({
  refreshJourneyLedger: mocks.refreshJourney,
}));

// eslint-disable-next-line import/first
import {
  createLedgerActiveSyncController,
  deriveLedgerSyncStatus,
  getLedgerPendingMutationCount,
  runLedgerActiveSync,
  type LedgerActiveSyncResult,
} from "./ledgerActiveSync";

const result: LedgerActiveSyncResult = {
  changed: false,
  pendingCount: 0,
  pullSucceeded: true,
};

describe("active Ledger sync", () => {
  it("keeps an offline mutation waiting in the durable queue", async () => {
    mocks.runOperational.mockRejectedValue(new Error("offline"));
    mocks.openDatabase.mockResolvedValue({
      getFirstAsync: vi.fn().mockResolvedValue({ count: 1 }),
    });
    await expect(runLedgerActiveSync("journey")).resolves.toEqual({
      changed: false,
      pendingCount: 1,
      pullSucceeded: false,
    });
    expect(mocks.refreshJourney).not.toHaveBeenCalled();
  });

  it("keeps an unresolved conflict in Changes waiting", async () => {
    const getFirstAsync = vi.fn().mockResolvedValue({ count: 1 });
    mocks.openDatabase.mockResolvedValue({ getFirstAsync });
    await expect(getLedgerPendingMutationCount("journey")).resolves.toBe(1);
    expect(getFirstAsync.mock.calls[0][0]).toContain("'CONFLICT'");
  });

  it("derives only truthful user-facing states", () => {
    expect(
      deriveLedgerSyncStatus({
        online: true,
        syncing: false,
        pendingCount: 0,
        pullSucceeded: true,
      }),
    ).toBe("UP_TO_DATE");
    expect(
      deriveLedgerSyncStatus({
        online: false,
        syncing: false,
        pendingCount: 1,
        pullSucceeded: false,
      }),
    ).toBe("CHANGES_WAITING");
    expect(
      deriveLedgerSyncStatus({
        online: false,
        syncing: false,
        pendingCount: 0,
        pullSucceeded: false,
      }),
    ).toBe("OFFLINE");
  });

  it("runs on focus, foreground, reconnect, and visible polling only", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => result);
    const controller = createLedgerActiveSyncController({
      run,
      onStart: vi.fn(),
      onSuccess: vi.fn(),
      onError: vi.fn(),
    });
    controller.start();
    await vi.advanceTimersByTimeAsync(8_000);
    expect(run).toHaveBeenCalledTimes(2);
    controller.setActive(false);
    await vi.advanceTimersByTimeAsync(16_000);
    expect(run).toHaveBeenCalledTimes(2);
    controller.setActive(true);
    await vi.runAllTicks();
    expect(run).toHaveBeenCalledTimes(3);
    controller.setOnline(false);
    await vi.advanceTimersByTimeAsync(16_000);
    expect(run).toHaveBeenCalledTimes(3);
    controller.setOnline(true);
    await vi.runAllTicks();
    expect(run).toHaveBeenCalledTimes(4);
    controller.stop();
    await vi.advanceTimersByTimeAsync(16_000);
    expect(run).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it("coalesces overlapping triggers and rejects stopped-screen results", async () => {
    let resolve!: (value: LedgerActiveSyncResult) => void;
    const run = vi.fn(
      () => new Promise<LedgerActiveSyncResult>((done) => (resolve = done)),
    );
    const onSuccess = vi.fn();
    const controller = createLedgerActiveSyncController({
      run,
      onStart: vi.fn(),
      onSuccess,
      onError: vi.fn(),
    });
    controller.start();
    void controller.trigger();
    expect(run).toHaveBeenCalledOnce();
    controller.stop();
    resolve({ changed: true, pendingCount: 0, pullSucceeded: true });
    await Promise.resolve();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
