import type {
  DataHealthAutomaticPlan,
  DataHealthAutomaticTrigger,
  DataHealthProgressStage,
  DataHealthReport,
  DataHealthRunOptions,
  DataHealthTrigger,
} from "./dataHealthCoordinator";

export const DATA_HEALTH_NETWORK_COOLDOWN_MS = 60_000;

type SchedulerCoordinator = {
  planAutomaticRun(input: {
    trigger: DataHealthAutomaticTrigger;
    hintedJourneyIds?: readonly string[];
  }): Promise<DataHealthAutomaticPlan>;
  run(
    trigger?: DataHealthTrigger,
    options?: DataHealthRunOptions,
  ): Promise<DataHealthReport>;
  converge(
    trigger?: DataHealthTrigger,
    options?: DataHealthRunOptions,
  ): Promise<DataHealthReport>;
};

export type DataHealthScheduleRequest = {
  trigger: DataHealthAutomaticTrigger;
  journeyIds?: readonly string[];
};

type QueueRequest =
  | { trigger: "MANUAL"; journeyIds: readonly string[] }
  | { trigger: DataHealthAutomaticTrigger; journeyIds: readonly string[] };

type QueueItem = {
  request: QueueRequest;
  waiters: {
    resolve(value: DataHealthReport | null): void;
    reject(error: unknown): void;
  }[];
};

export function createDataHealthScheduler(dependencies: {
  getCoordinator(): Promise<SchedulerCoordinator>;
  networkPermitsConvergence(): Promise<boolean>;
  now?: () => Date;
  networkCooldownMs?: number;
}) {
  const now = dependencies.now ?? (() => new Date());
  const cooldownMs = dependencies.networkCooldownMs ?? DATA_HEALTH_NETWORK_COOLDOWN_MS;
  const lastNetworkRun = new Map<string, number>();
  let running = false;
  let pending: QueueItem | null = null;
  let lastManualReport: DataHealthReport | null = null;
  let manualProgress: DataHealthProgressStage | null = null;
  const progressListeners = new Set<(stage: DataHealthProgressStage | null) => void>();

  const publishProgress = (stage: DataHealthProgressStage | null) => {
    manualProgress = stage;
    for (const listener of progressListeners) listener(stage);
  };

  const enqueue = (request: QueueRequest) =>
    new Promise<DataHealthReport | null>((resolve, reject) => {
      const waiter = { resolve, reject };
      if (!running) {
        running = true;
        void drain({ request, waiters: [waiter] });
        return;
      }
      if (!pending) pending = { request, waiters: [waiter] };
      else {
        pending.request = mergeRequests(pending.request, request);
        pending.waiters.push(waiter);
      }
    });

  const execute = async (request: QueueRequest) => {
    const coordinator = await dependencies.getCoordinator();
    if (request.trigger === "MANUAL")
      return coordinator.converge("MANUAL", { onProgress: publishProgress });

    const plan = await coordinator.planAutomaticRun({
      trigger: request.trigger,
      hintedJourneyIds: request.journeyIds,
    });
    if (!plan.shouldRun) return null;
    const options: DataHealthRunOptions = { journeyIds: plan.journeyIds };
    const report = await coordinator.run(plan.trigger, options);
    if (report.accountId !== plan.accountId || report.generation !== plan.generation)
      return report;

    if (request.trigger === "SYNC_COMPLETED") {
      if (!(await dependencies.networkPermitsConvergence())) return report;
      return coordinator.converge(plan.trigger, {
        ...options,
        skipOperationalSync: true,
      });
    }

    if (!plan.hasConvergenceWork || !needsAutomaticConvergence(report, plan.trigger))
      return report;
    if (!(await dependencies.networkPermitsConvergence())) return report;

    const previous = lastNetworkRun.get(plan.accountId);
    if (previous !== undefined && now().getTime() - previous < cooldownMs) return report;
    lastNetworkRun.set(plan.accountId, now().getTime());
    return coordinator.converge(plan.trigger, options);
  };

  async function drain(first: QueueItem) {
    let item: QueueItem | null = first;
    let automaticRuns = 0;
    let previousResult: DataHealthReport | null = null;
    while (item) {
      const current = item;
      let failure: unknown;
      const skipExtraAutomaticFollowup =
        current.request.trigger !== "MANUAL" && automaticRuns >= 2;
      if (!skipExtraAutomaticFollowup) {
        try {
          previousResult = await execute(current.request);
        } catch (error) {
          failure = error;
        }
        if (current.request.trigger !== "MANUAL") automaticRuns += 1;
      }
      item = pending;
      pending = null;
      if (!item) running = false;
      for (const waiter of current.waiters)
        if (failure) waiter.reject(failure);
        else waiter.resolve(previousResult);
    }
  }

  return {
    schedule(request: DataHealthScheduleRequest) {
      return enqueue({
        trigger: request.trigger,
        journeyIds: request.journeyIds ?? [],
      });
    },
    runManual() {
      const startedAt = now().toISOString();
      return enqueue({ trigger: "MANUAL", journeyIds: [] })
        .then((report) => {
          if (!report) throw new Error("Manual data health did not produce a report.");
          lastManualReport = {
            ...report,
            runTiming: { startedAt, completedAt: now().toISOString() },
          };
          return lastManualReport;
        })
        .finally(() => publishProgress(null));
    },
    subscribeProgress(listener: (stage: DataHealthProgressStage | null) => void) {
      progressListeners.add(listener);
      listener(manualProgress);
      return () => progressListeners.delete(listener);
    },
    getLastManualReport() {
      return lastManualReport;
    },
  };
}

function needsAutomaticConvergence(report: DataHealthReport, trigger: DataHealthTrigger) {
  if (
    report.repairPlans.some(
      (plan) =>
        plan.eligibility === "ELIGIBLE" &&
        plan.actionId &&
        (trigger === "DEEP" || plan.actionId !== "REACTIVATE_RETRYABLE_OPERATION_V1"),
    )
  )
    return true;
  return report.findings.some(
    (finding) =>
      finding.category === "MIRROR_STALE" ||
      (["sync_operation", "asset_operation"].includes(finding.targetType) &&
        finding.category === "RETRYABLE"),
  );
}

function mergeRequests(left: QueueRequest, right: QueueRequest): QueueRequest {
  if (left.trigger === "MANUAL" || right.trigger === "MANUAL")
    return { trigger: "MANUAL", journeyIds: [] };
  const priority: Record<DataHealthAutomaticTrigger, number> = {
    AUTH_RECOVERED: 6,
    CONNECTIVITY_RESTORED: 5,
    COLD_START: 4,
    FOREGROUND: 3,
    PERIODIC: 2,
    SYNC_COMPLETED: 1,
  };
  return {
    trigger:
      priority[right.trigger] > priority[left.trigger] ? right.trigger : left.trigger,
    journeyIds: [...new Set([...left.journeyIds, ...right.journeyIds])],
  };
}
