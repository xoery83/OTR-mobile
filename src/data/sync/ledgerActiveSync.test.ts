import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openDatabase: vi.fn(),
  runOperational: vi.fn(),
  refreshJourney: vi.fn(),
  refreshJourneyWithStatus: vi.fn(),
  refreshPersonal: vi.fn(),
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
  refreshJourneyLedgerWithStatus: mocks.refreshJourneyWithStatus,
}));
vi.mock("./ledgerPersonalPaymentCoordinator", () => ({
  refreshLedgerPersonalPayments: mocks.refreshPersonal,
}));

// eslint-disable-next-line import/first
import {
  createLedgerActiveSyncController,
  deriveLedgerSyncStatus,
  getLedgerPendingMutationCount,
  runLedgerActiveSync,
  runPersonalPaymentActiveSync,
  type LedgerActiveSyncResult,
} from "./ledgerActiveSync";

const result: LedgerActiveSyncResult = {
  changed: false,
  pendingCount: 0,
  pullSucceeded: true,
};

describe("active Ledger sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runOperational.mockResolvedValue(undefined);
    mocks.refreshJourney.mockResolvedValue(false);
    mocks.refreshJourneyWithStatus.mockResolvedValue({
      changed: false,
      incomplete: false,
    });
    mocks.refreshPersonal.mockResolvedValue(false);
  });
  afterEach(() => vi.useRealTimers());

  it("keeps an offline mutation waiting in the durable queue", async () => {
    mocks.runOperational.mockRejectedValue(new Error("offline"));
    mocks.openDatabase.mockResolvedValue({
      getFirstAsync: vi.fn().mockResolvedValue({ count: 1 }),
    });
    await expect(runLedgerActiveSync("journey")).resolves.toEqual({
      changed: false,
      pendingCount: 1,
      pullSucceeded: false,
      personalPaymentRefreshCount: 0,
      incomplete: false,
      pullApiRequestCount: null,
    });
    expect(mocks.refreshJourneyWithStatus).not.toHaveBeenCalled();
  });

  it("keeps an unresolved conflict in Changes waiting", async () => {
    const getFirstAsync = vi.fn().mockResolvedValue({ count: 1 });
    mocks.openDatabase.mockResolvedValue({ getFirstAsync });
    await expect(getLedgerPendingMutationCount("journey")).resolves.toBe(1);
    expect(getFirstAsync.mock.calls[0][0]).toContain("'CONFLICT'");
    expect(getFirstAsync.mock.calls[0][0]).toContain("'FAILED'");
  });

  it("reports counted pull requests without altering the operational sync result", async () => {
    mocks.openDatabase.mockResolvedValue({
      getFirstAsync: vi.fn().mockResolvedValue({ count: 0 }),
    });
    mocks.refreshJourneyWithStatus.mockResolvedValue({
      changed: false,
      incomplete: false,
      pullApiRequestCount: 3,
    });
    await expect(runLedgerActiveSync("journey-a")).resolves.toMatchObject({
      changed: false,
      pendingCount: 0,
      pullSucceeded: true,
      personalPaymentRefreshCount: 1,
      pullApiRequestCount: 3,
    });
    expect(mocks.runOperational).toHaveBeenCalledOnce();
    expect(mocks.refreshJourneyWithStatus).toHaveBeenCalledWith("journey-a");
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

  it("backs off empty cycles 8, 15, 30, 60, 60 seconds", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => result);
    const onCycle = vi.fn();
    const controller = createLedgerActiveSyncController({
      run,
      onStart: vi.fn(),
      onSuccess: vi.fn(),
      onError: vi.fn(),
      onCycle,
    });
    controller.start();
    expect(run).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(0);
    for (const delay of [8_000, 15_000, 30_000, 60_000, 60_000])
      await vi.advanceTimersByTimeAsync(delay);
    expect(onCycle.mock.calls.map(([metric]) => metric.nextIntervalMs)).toEqual([
      8_000, 15_000, 30_000, 60_000, 60_000, 60_000,
    ]);
    expect(onCycle.mock.lastCall?.[0]).toMatchObject({
      cycle: 6,
      successfulNoChangeCycles: 6,
      remoteChangeCycles: 0,
      failureCycles: 0,
    });
    controller.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resets to eight seconds on a remote change and keeps nonempty queues fast", async () => {
    vi.useFakeTimers();
    const run = vi
      .fn()
      .mockResolvedValueOnce(result)
      .mockResolvedValueOnce(result)
      .mockResolvedValueOnce({ ...result, changed: true })
      .mockResolvedValueOnce({ ...result, pendingCount: 1 });
    const onCycle = vi.fn();
    const controller = createLedgerActiveSyncController({
      run,
      onStart: vi.fn(),
      onSuccess: vi.fn(),
      onError: vi.fn(),
      onCycle,
    });
    controller.start();
    await vi.advanceTimersByTimeAsync(23_000);
    expect(onCycle.mock.lastCall?.[0]).toMatchObject({
      outcome: "remote_change",
      resetReason: "remote_change",
      nextIntervalMs: 8_000,
    });
    await vi.advanceTimersByTimeAsync(8_000);
    expect(onCycle.mock.lastCall?.[0]).toMatchObject({
      outcome: "queue_nonempty",
      nextIntervalMs: 8_000,
      queueNonemptyCycles: 1,
    });
    controller.stop();
  });

  it("wakes promptly for a local mutation and coalesces wakes during a running cycle", async () => {
    vi.useFakeTimers();
    let resolve!: (value: LedgerActiveSyncResult) => void;
    const pending = new Promise<LedgerActiveSyncResult>((done) => {
      resolve = done;
    });
    const run = vi
      .fn()
      .mockResolvedValueOnce(result)
      .mockReturnValueOnce(pending)
      .mockResolvedValue(result);
    const onCycle = vi.fn();
    const controller = createLedgerActiveSyncController({
      run,
      onStart: vi.fn(),
      onSuccess: vi.fn(),
      onError: vi.fn(),
      onCycle,
    });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    controller.wake();
    expect(run).toHaveBeenCalledTimes(2);
    controller.wake();
    controller.wake();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);
    resolve(result);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(3);
    expect(onCycle.mock.calls[1][0]).toMatchObject({
      nextIntervalMs: 0,
      wakeups: 3,
      coalescedWakeups: 1,
    });
    controller.stop();
  });

  it("pauses offline, resumes on reconnect, and resets on foreground return", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => result);
    const onCycle = vi.fn();
    const controller = createLedgerActiveSyncController({
      run,
      onStart: vi.fn(),
      onSuccess: vi.fn(),
      onError: vi.fn(),
      onCycle,
      initialOnline: false,
    });
    controller.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).not.toHaveBeenCalled();
    controller.setOnline(true);
    expect(run).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(0);
    expect(onCycle.mock.lastCall?.[0].resetReason).toBe("reconnect");
    controller.setActive(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledOnce();
    controller.setActive(true);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(onCycle.mock.lastCall?.[0].resetReason).toBe("foreground");
    controller.stop();
  });

  it("backs failures off to 15, 30, then 60 seconds", async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockRejectedValue(new Error("backend unavailable"));
    const onCycle = vi.fn();
    const controller = createLedgerActiveSyncController({
      run,
      onStart: vi.fn(),
      onSuccess: vi.fn(),
      onError: vi.fn(),
      onCycle,
    });
    controller.start();
    await vi.advanceTimersByTimeAsync(105_000);
    expect(onCycle.mock.calls.map(([metric]) => metric.nextIntervalMs)).toEqual([
      15_000, 30_000, 60_000, 60_000,
    ]);
    controller.stop();
  });

  it("does not treat a swallowed Review failure as a successful idle cycle", async () => {
    vi.useFakeTimers();
    const onCycle = vi.fn();
    const controller = createLedgerActiveSyncController({
      run: async () => ({ ...result, incomplete: true }),
      onStart: vi.fn(),
      onSuccess: vi.fn(),
      onError: vi.fn(),
      onCycle,
    });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onCycle.mock.lastCall?.[0]).toMatchObject({
      outcome: "failure",
      failureCycles: 1,
      successfulNoChangeCycles: 0,
      nextIntervalMs: 15_000,
    });
    controller.stop();
  });

  it("does not publish stale account results or restart an old Journey timer", async () => {
    vi.useFakeTimers();
    let resolveOld!: (value: LedgerActiveSyncResult) => void;
    let account = "a";
    const oldSuccess = vi.fn();
    const oldRun = vi.fn(
      () =>
        new Promise<LedgerActiveSyncResult>((done) => {
          resolveOld = done;
        }),
    );
    const old = createLedgerActiveSyncController({
      run: oldRun,
      onStart: vi.fn(),
      onSuccess: oldSuccess,
      onError: vi.fn(),
      isCurrent: () => account === "a",
    });
    old.start();
    account = "b";
    old.stop();
    const nextRun = vi.fn(async () => result);
    const next = createLedgerActiveSyncController({
      run: nextRun,
      onStart: vi.fn(),
      onSuccess: vi.fn(),
      onError: vi.fn(),
      isCurrent: () => account === "b",
    });
    next.start();
    resolveOld({ ...result, changed: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(oldSuccess).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    expect(nextRun).toHaveBeenCalledOnce();
    old.wake();
    expect(oldRun).toHaveBeenCalledOnce();
    next.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("runs once after a foreground reset while an old cycle is still active", async () => {
    vi.useFakeTimers();
    let resolveOld!: (value: LedgerActiveSyncResult) => void;
    const oldCycle = new Promise<LedgerActiveSyncResult>((done) => {
      resolveOld = done;
    });
    const run = vi.fn().mockReturnValueOnce(oldCycle).mockResolvedValue(result);
    const onSuccess = vi.fn();
    const onCycle = vi.fn();
    const controller = createLedgerActiveSyncController({
      run,
      onStart: vi.fn(),
      onSuccess,
      onError: vi.fn(),
      onCycle,
    });
    controller.start();
    controller.setActive(false);
    controller.setActive(true);
    expect(run).toHaveBeenCalledOnce();
    resolveOld({ ...result, changed: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onCycle.mock.lastCall?.[0]).toMatchObject({
      resetReason: "foreground",
      nextIntervalMs: 8_000,
    });
    controller.stop();
  });

  it("uses a Personal Payment-only pull for standalone Settlement", async () => {
    mocks.openDatabase.mockResolvedValue({
      getFirstAsync: vi.fn().mockResolvedValue({ count: 0 }),
    });
    mocks.refreshPersonal.mockImplementation(
      async (_journeyId: string, onRequest?: () => void) => {
        onRequest?.();
        return true;
      },
    );
    const outcome = await runPersonalPaymentActiveSync("journey-a");
    expect(outcome).toMatchObject({
      changed: true,
      pendingCount: 0,
      pullSucceeded: true,
      personalPaymentRefreshCount: 1,
      pullApiRequestCount: 1,
    });
    expect(mocks.refreshPersonal).toHaveBeenCalledWith("journey-a", expect.any(Function));
    expect(mocks.refreshJourneyWithStatus).not.toHaveBeenCalled();
    const sections = readFileSync(
      new URL("../../hooks/useSettlementSections.ts", import.meta.url),
      "utf8",
    );
    expect(sections).not.toContain("setInterval(");
    const screen = readFileSync(
      new URL("../../features/ledger/SettlementReadinessScreen.tsx", import.meta.url),
      "utf8",
    );
    expect(screen).toMatch(/embedded\s*\?\s*null\s*:/);
    const parent = readFileSync(
      new URL("../../features/ledger/LedgerStage6Screen.tsx", import.meta.url),
      "utf8",
    );
    expect(parent).toContain("ledgerChangeSeq={ledgerChangeSeq}");
  });
});
