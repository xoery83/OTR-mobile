import { describe, expect, it, vi } from "vitest";

import type { DataHealthAutomaticPlan, DataHealthReport } from "./dataHealthCoordinator";
import { createDataHealthScheduler } from "./dataHealthScheduler";

const plan = (
  overrides: Partial<DataHealthAutomaticPlan> = {},
): DataHealthAutomaticPlan => ({
  accountId: "user-a",
  generation: 1,
  shouldRun: true,
  trigger: "CHEAP",
  interrupted: false,
  hasSuspiciousState: false,
  hasConvergenceWork: false,
  journeyIds: [],
  ...overrides,
});

const report = (overrides: Partial<DataHealthReport> = {}): DataHealthReport => ({
  accountId: "user-a",
  generation: 1,
  trigger: "CHEAP",
  outcome: "HEALTHY",
  reportDigest: "healthy",
  journeyCount: 0,
  protectedIntentCount: 0,
  findings: [],
  repairPlans: [],
  counts: {},
  ...overrides,
});

function fixture(
  input: {
    automaticPlan?: DataHealthAutomaticPlan;
    online?: boolean;
    now?: () => Date;
  } = {},
) {
  let online = input.online ?? true;
  const coordinator = {
    planAutomaticRun: vi.fn().mockResolvedValue(input.automaticPlan ?? plan()),
    run: vi.fn().mockResolvedValue(report()),
    converge: vi.fn().mockResolvedValue(report()),
  };
  const networkPermitsConvergence = vi.fn(async () => online);
  const scheduler = createDataHealthScheduler({
    getCoordinator: async () => coordinator,
    networkPermitsConvergence,
    now: input.now,
  });
  return {
    coordinator,
    networkPermitsConvergence,
    scheduler,
    setOnline: (next: boolean) => (online = next),
  };
}

describe("Data Health Phase D scheduler", () => {
  it("records a healthy cold-start cheap scan without network convergence", async () => {
    const { coordinator, networkPermitsConvergence, scheduler } = fixture();

    await scheduler.schedule({ trigger: "COLD_START" });

    expect(coordinator.run).toHaveBeenCalledWith("CHEAP", { journeyIds: [] });
    expect(coordinator.converge).not.toHaveBeenCalled();
    expect(networkPermitsConvergence).not.toHaveBeenCalled();
  });

  it("runs suspicious cold-start work through the existing convergence pipeline", async () => {
    const { coordinator, scheduler } = fixture({
      automaticPlan: plan({
        hasSuspiciousState: true,
        hasConvergenceWork: true,
        journeyIds: ["journey-a"],
      }),
    });
    coordinator.run.mockResolvedValue(
      report({
        findings: [
          {
            ruleId: "DH_SYNC_OPERATION_STATE_V1",
            category: "RETRYABLE",
            journeyId: "journey-a",
            targetType: "sync_operation",
            targetId: "operation-a",
            inputDigest: "digest",
          },
        ],
      }),
    );

    await scheduler.schedule({ trigger: "COLD_START" });

    expect(coordinator.converge).toHaveBeenCalledWith("CHEAP", {
      journeyIds: ["journey-a"],
    });
  });

  it("coalesces repeated foreground signals into the run plus one follow-up", async () => {
    let release!: () => void;
    const blocked = new Promise<DataHealthAutomaticPlan>((resolve) => {
      release = () => resolve(plan());
    });
    const { coordinator, scheduler } = fixture();
    coordinator.planAutomaticRun.mockReturnValueOnce(blocked);

    const first = scheduler.schedule({ trigger: "FOREGROUND" });
    const second = scheduler.schedule({ trigger: "FOREGROUND" });
    const third = scheduler.schedule({ trigger: "PERIODIC" });
    release();
    await Promise.all([first, second, third]);

    expect(coordinator.planAutomaticRun).toHaveBeenCalledTimes(2);
  });

  it("does not create a convergence storm when connectivity flaps", async () => {
    let clock = 1_000;
    const { coordinator, scheduler } = fixture({
      now: () => new Date(clock),
      automaticPlan: plan({
        hasSuspiciousState: true,
        hasConvergenceWork: true,
        journeyIds: ["journey-a"],
      }),
    });
    coordinator.run.mockResolvedValue(
      report({
        findings: [
          {
            ruleId: "DH_SYNC_OPERATION_STATE_V1",
            category: "RETRYABLE",
            journeyId: "journey-a",
            targetType: "sync_operation",
            targetId: "operation-a",
            inputDigest: "digest",
          },
        ],
      }),
    );

    await scheduler.schedule({ trigger: "CONNECTIVITY_RESTORED" });
    clock += 1_000;
    await scheduler.schedule({ trigger: "CONNECTIVITY_RESTORED" });

    expect(coordinator.converge).toHaveBeenCalledOnce();
  });

  it("becomes a no-op when an automatic run is repeated after convergence", async () => {
    const { coordinator, scheduler } = fixture({
      automaticPlan: plan({
        hasSuspiciousState: true,
        hasConvergenceWork: true,
        journeyIds: ["journey-a"],
      }),
    });
    coordinator.run.mockResolvedValue(
      report({
        findings: [
          {
            ruleId: "DH_SYNC_OPERATION_STATE_V1",
            category: "RETRYABLE",
            journeyId: "journey-a",
            targetType: "sync_operation",
            targetId: "operation-a",
            inputDigest: "digest",
          },
        ],
      }),
    );

    await scheduler.schedule({ trigger: "CONNECTIVITY_RESTORED" });
    coordinator.planAutomaticRun.mockResolvedValue(
      plan({ shouldRun: false, journeyIds: [] }),
    );
    await scheduler.schedule({ trigger: "FOREGROUND" });

    expect(coordinator.converge).toHaveBeenCalledOnce();
  });

  it("waits through auth pause and resumes only after auth recovery", async () => {
    const { coordinator, scheduler, setOnline } = fixture({
      online: false,
      automaticPlan: plan({
        hasSuspiciousState: true,
        hasConvergenceWork: true,
        journeyIds: ["journey-a"],
      }),
    });
    coordinator.run.mockResolvedValue(
      report({
        findings: [
          {
            ruleId: "DH_SYNC_OPERATION_STATE_V1",
            category: "RETRYABLE",
            journeyId: "journey-a",
            targetType: "sync_operation",
            targetId: "operation-a",
            inputDigest: "digest",
          },
        ],
      }),
    );

    await scheduler.schedule({ trigger: "FOREGROUND" });
    expect(coordinator.converge).not.toHaveBeenCalled();
    setOnline(true);
    await scheduler.schedule({ trigger: "AUTH_RECOVERED" });
    expect(coordinator.converge).toHaveBeenCalledOnce();
  });

  it("uses sync completion only for scoped pull and verification", async () => {
    const { coordinator, scheduler } = fixture({
      automaticPlan: plan({ journeyIds: ["journey-a"] }),
    });

    await scheduler.schedule({
      trigger: "SYNC_COMPLETED",
      journeyIds: ["journey-a"],
    });

    expect(coordinator.converge).toHaveBeenCalledWith("CHEAP", {
      journeyIds: ["journey-a"],
      skipOperationalSync: true,
    });
  });

  it("invalidates account A work before convergence after an account switch", async () => {
    const { coordinator, scheduler } = fixture({
      automaticPlan: plan({
        hasSuspiciousState: true,
        hasConvergenceWork: true,
        journeyIds: ["journey-a"],
      }),
    });
    coordinator.run.mockResolvedValue(report({ accountId: "user-b", generation: 2 }));

    await scheduler.schedule({ trigger: "CONNECTIVITY_RESTORED" });

    expect(coordinator.converge).not.toHaveBeenCalled();
  });

  it("lets manual health bypass automatic throttle through the same coordinator", async () => {
    const { coordinator, scheduler } = fixture({
      automaticPlan: plan({ shouldRun: false }),
    });

    await scheduler.schedule({ trigger: "FOREGROUND" });
    await scheduler.runManual();

    expect(coordinator.converge).toHaveBeenCalledWith("MANUAL", {
      onProgress: expect.any(Function),
    });
  });

  it("publishes real manual phases and retains the current run result for reopening", async () => {
    let clock = 0;
    const { coordinator, scheduler } = fixture({
      now: () => new Date(clock),
    });
    coordinator.converge.mockImplementation(async (_trigger, options) => {
      for (const stage of [
        "CHECKING_SAVED",
        "SYNCING_REPAIRING",
        "CHECKING_SHARED",
        "VERIFYING",
      ] as const) {
        clock += 17_000;
        options?.onProgress?.(stage);
      }
      return report();
    });
    const progress: unknown[] = [];
    const unsubscribe = scheduler.subscribeProgress((stage) => progress.push(stage));

    const completed = await scheduler.runManual();
    unsubscribe();

    expect(progress).toEqual([
      null,
      "CHECKING_SAVED",
      "SYNCING_REPAIRING",
      "CHECKING_SHARED",
      "VERIFYING",
      null,
    ]);
    expect(completed.runTiming).toEqual({
      startedAt: "1970-01-01T00:00:00.000Z",
      completedAt: "1970-01-01T00:01:08.000Z",
    });
    expect(scheduler.getLastManualReport()).toEqual(completed);
  });

  it("replaces prior manual outcomes instead of accumulating counts", async () => {
    const { coordinator, scheduler } = fixture();
    coordinator.converge
      .mockResolvedValueOnce(
        report({
          convergence: {
            state: "RECOVERED",
            localRepairCount: 3,
            recoveredChangeCount: 2,
            refreshedJourneyCount: 1,
            syncAttempted: true,
          },
        }),
      )
      .mockResolvedValueOnce(report());

    await scheduler.runManual();
    const second = await scheduler.runManual();

    expect(scheduler.getLastManualReport()).toEqual(second);
    expect(second.convergence).toBeUndefined();
  });

  it("clears manual progress after an unexpected failure", async () => {
    const { coordinator, scheduler } = fixture();
    coordinator.converge.mockImplementation(async (_trigger, options) => {
      options?.onProgress?.("CHECKING_SAVED");
      throw new Error("unexpected");
    });
    const progress: unknown[] = [];
    scheduler.subscribeProgress((stage) => progress.push(stage));

    await expect(scheduler.runManual()).rejects.toThrow("unexpected");

    expect(progress).toEqual([null, "CHECKING_SAVED", null]);
    expect(scheduler.getLastManualReport()).toBeNull();
  });
});
