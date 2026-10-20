import type { AccountRequestContext } from "../auth/accountRequestContext";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
} from "../auth/accountRequestContext";
import type { createIntelligenceContinuationRepository } from "../repositories/intelligenceContinuationRepository";
import {
  createIntelligenceWakeQueue,
  createSyncOperationRepository,
  createSyncOperationClaimOwner,
  type WakeQueueDatabase,
  type WakeHash,
  type SyncOperation,
} from "./syncOperationRepository";
import { createSyncEngine, nextSyncAttemptAt } from "./syncEngine";
import { getIntelligenceQueueActivity } from "./ledgerQueueActivity";
import {
  intelligenceWakeKind,
  executionReportSchema,
  type Task,
  type Attempt,
  type ExecutionReport,
  type ContinuationRouter,
  type ContinuationExecutor,
  type RouterRequest,
  type ContinuationWaitReason,
} from "@/domain/intelligence/persistence";

type Repository = ReturnType<typeof createIntelligenceContinuationRepository>;
type RuntimeDependencies = {
  getAccountId(): Promise<string>;
  now(): string;
  online(): boolean;
  router: ContinuationRouter;
  routePolicy(
    task: Task,
  ): Pick<RouterRequest, "modalities" | "latencyBudgetMs" | "risk" | "shadowEligible">;
};
const observation = (a: Attempt) => ({
  execution_observation: a.execution_observation,
  execution_outcome: a.execution_outcome,
  metering_disposition: a.metering_disposition,
  response_material_reference: a.response_material_reference,
  response_material_sha256: a.response_material_sha256,
  response_sha256: a.response_sha256,
  reported_usage_summary: a.reported_usage_summary,
});
export function createIntelligenceContinuationRuntime(
  repo: Repository,
  deps: RuntimeDependencies,
) {
  async function wait(
    context: AccountRequestContext,
    t: Task,
    reason: ContinuationWaitReason,
    operation: SyncOperation,
    additionalReasons: Task["wait_reasons"] = [],
  ) {
    await repo.wait(
      context,
      t.task_id,
      t.row_revision,
      [
        {
          reason,
          dependency_id: null,
          capability: null,
          policy_sha256: t.policy_sha256,
        },
        ...additionalReasons,
      ],
      t.current_pass_complete,
      undefined,
      operation,
    );
    return "WAIT" as const;
  }
  async function attach(context: AccountRequestContext, raw: ExecutionReport) {
    const report = executionReportSchema.parse(raw);
    const a = await repo.readAttempt(context, report.attempt_id);
    if (
      report.account_id !== a.account_id ||
      report.task_id !== a.task_id ||
      report.request_id !== a.request_id ||
      report.request_sha256 !== a.request_sha256 ||
      report.usage_correlation_id !== a.usage_correlation_id
    )
      throw new Error("INTELLIGENCE_REPORT_IDENTITY");
    return repo.observeAttempt(
      context,
      a.attempt_id,
      a.row_revision,
      {
        execution_observation: report.execution_observation,
        execution_outcome: report.execution_outcome,
        metering_disposition:
          a.metering_disposition === "COMPLETE"
            ? "COMPLETE"
            : report.metering_disposition,
        response_material_reference:
          report.response_material_reference ?? a.response_material_reference,
        response_material_sha256:
          report.response_material_sha256 ?? a.response_material_sha256,
        response_sha256: report.response_sha256 ?? a.response_sha256,
        reported_usage_summary: report.reported_usage_summary ?? a.reported_usage_summary,
      },
      report.recovery_sha256 ?? undefined,
    );
  }
  return {
    async evaluate(context: AccountRequestContext, operation: SyncOperation) {
      if (!operation.claimOwner) throw new Error("INTELLIGENCE_WAKE_CLAIM");
      const inspected = await repo.inspectWake(context, operation);
      const t = inspected.task,
        a = inspected.attempt;
      if (inspected.disposition === "TERMINATE") return "TERMINATE" as const;
      if (
        a &&
        (a.execution_observation !== "TERMINAL" ||
          a.response_sha256 ||
          !["COMPLETE", "NOT_REQUIRED"].includes(a.metering_disposition))
      )
        return "WAIT" as const;
      if (
        (a &&
          (await repo.attempts(context, t.task_id)).filter((row) => !row.shadow).length >=
            t.policy_snapshot.max_attempts) ||
        (t.policy_snapshot.deadline &&
          Date.parse(t.policy_snapshot.deadline) <= Date.parse(deps.now()))
      ) {
        await repo.terminate(context, t.task_id, t.row_revision, "EXHAUSTED", operation);
        return "TERMINATE" as const;
      }
      const needsNetwork = !deps.online() && t.policy_snapshot.network_required;
      if (inspected.disposition === "WAIT")
        return wait(
          context,
          t,
          "WAITING_FOR_ENRICHMENT",
          operation,
          needsNetwork
            ? [
                {
                  reason: "WAITING_FOR_NETWORK",
                  dependency_id: null,
                  capability: null,
                  policy_sha256: t.policy_sha256,
                },
              ]
            : [],
        );
      if (needsNetwork) return wait(context, t, "WAITING_FOR_NETWORK", operation);
      const route = await deps.router({
        task: t,
        capabilities: t.capability_requirements,
        schema: { id: t.schema_id, version: t.schema_version, sha256: t.schema_sha256 },
        privacy: t.policy_snapshot.privacy,
        online: deps.online(),
        networkRequired: t.policy_snapshot.network_required,
        budget: {
          currency: t.policy_snapshot.budget_currency,
          nanos: t.policy_snapshot.budget_nanos,
        },
        ...deps.routePolicy(t),
      }); // Eligibility I/O is outside the Account gate/transaction.
      await assertAccountRequestContext(context, deps.getAccountId);
      if (route.status === "WAIT")
        return wait(context, t, route.reason, operation, route.additionalReasons);
      if (route.status === "UNAVAILABLE") {
        await repo.terminate(context, t.task_id, t.row_revision, route.reason, operation);
        return "TERMINATE" as const;
      }
      if (route.attempt.descriptor_snapshot.network_required && !deps.online())
        return wait(context, t, "WAITING_FOR_NETWORK", operation);
      if (
        route.attempt.task_id !== t.task_id ||
        route.attempt.account_id !== t.account_id ||
        route.attempt.sync_operation_id !== operation.id ||
        route.attempt.shadow
      )
        throw new Error("INTELLIGENCE_ROUTE_IDENTITY");
      await repo.reserveAttempt(context, route.attempt, t.row_revision, operation);
      return "CREATE_ATTEMPT" as const;
    },
    attach,
    async cancel(
      context: AccountRequestContext,
      taskId: string,
      cancellation?: (attempt: Readonly<Attempt>) => Promise<ExecutionReport | null>,
    ) {
      const task = await repo.read(context, taskId);
      const fenced = ["CANCELED", "STALE"].includes(task.work_disposition)
        ? task
        : await repo.fence(context, taskId, task.row_revision, "CANCELED");
      if (fenced.current_attempt_id && cancellation) {
        const attempt = await repo.readAttempt(context, fenced.current_attempt_id);
        const exact = await cancellation(attempt); // Outside gate/transaction; NULL means no terminal proof.
        if (exact) await attach(context, exact);
      }
      return fenced;
    },
    async execute(
      context: AccountRequestContext,
      id: string,
      executor: ContinuationExecutor,
    ) {
      const a = await repo.readAttempt(context, id);
      if (
        a.execution_observation !== "NOT_STARTED" ||
        a.metering_disposition === "UNKNOWN"
      )
        throw new Error("INTELLIGENCE_EXACT_RECOVERY_REQUIRED");
      // Positive proof is mandatory; missing callback, lease or elapsed time is not proof.
      if (!(await executor.proveUndispatched(a)))
        throw new Error("INTELLIGENCE_UNDISPATCHED_PROOF_REQUIRED");
      await assertAccountRequestContext(context, deps.getAccountId);
      let started = false,
        usagePrepared = false;
      try {
        const metering = await executor.prepareUsage(a);
        usagePrepared = true;
        const running = await repo.beginExecution(context, id, a.row_revision, metering);
        started = true;
        const report = await executor.execute(running);
        return await attach(context, report);
      } catch (error) {
        // Possible dispatch or lost meter ACK: persist uncertainty, never call executor again.
        await assertAccountRequestContext(context, deps.getAccountId);
        const current = await repo.readAttempt(context, id);
        if (started && current.execution_observation === "RUNNING") {
          await repo.observeAttempt(context, id, current.row_revision, {
            ...observation(current),
            execution_observation: "UNKNOWN",
            execution_outcome: null,
            // A lost execution ACK does not erase a confirmed durable meter START.
          });
        } else if (
          !usagePrepared &&
          a.integration_id !== null &&
          current.row_revision === a.row_revision &&
          current.execution_observation === "NOT_STARTED"
        ) {
          try {
            await repo.observeAttempt(context, id, a.row_revision, {
              ...observation(a),
              metering_disposition: "UNKNOWN",
            });
          } catch (cas) {
            // The initial observation lost ownership; preserve the newer caller's state.
            if (
              !(cas instanceof Error) ||
              cas.message !== "INTELLIGENCE_EXECUTION_TRANSITION"
            )
              throw cas;
          }
        }
        throw error;
      }
    },
    async fact(
      context: AccountRequestContext,
      taskId: string,
      policy: {
        now: string;
        urgencyHorizonMs: number;
        evidencedDeadline: { at: string; evidenceId: string } | null;
      },
    ) {
      if (
        !Number.isSafeInteger(policy.urgencyHorizonMs) ||
        policy.urgencyHorizonMs < 0 ||
        !Number.isFinite(Date.parse(policy.now)) ||
        (policy.evidencedDeadline &&
          (!Number.isFinite(Date.parse(policy.evidencedDeadline.at)) ||
            !policy.evidencedDeadline.evidenceId))
      )
        throw new Error("INTELLIGENCE_ATTENTION_POLICY");
      const { task: t, attempts } = await repo.snapshot(context, taskId);
      const unresolved = attempts.filter(
        (a) =>
          !a.shadow &&
          (["RUNNING", "UNKNOWN"].includes(a.execution_observation) ||
            a.result_install_disposition === "PENDING" ||
            !["COMPLETE", "NOT_REQUIRED"].includes(a.metering_disposition)),
      );
      const outstanding =
        ["PENDING", "WAITING", "RUNNING", "RESULT_PENDING", "UNKNOWN"].includes(
          t.work_disposition,
        ) || unresolved.length > 0;
      const urgent =
        outstanding &&
        policy.evidencedDeadline !== null &&
        Date.parse(policy.evidencedDeadline.at) - Date.parse(policy.now) <=
          policy.urgencyHorizonMs;
      const unsupported = t.work_disposition === "FAILED";
      const currentAttempt = attempts.find((a) => a.attempt_id === t.current_attempt_id);
      return {
        account_id: t.account_id,
        task_id: t.task_id,
        import_id: t.import_id,
        trip_id: t.trip_id,
        state: t.work_disposition,
        current_pass_complete: t.current_pass_complete,
        outstanding_work: outstanding,
        requires_attention: urgent || unsupported,
        reason: urgent
          ? ("EVIDENCED_DEADLINE" as const)
          : unsupported
            ? ("UNSUPPORTED_OR_EXHAUSTED" as const)
            : outstanding
              ? ("RESUMABLE_OR_UNCERTAIN" as const)
              : ("NONE" as const),
        current_attempt: currentAttempt
          ? {
              attempt_id: currentAttempt.attempt_id,
              execution: currentAttempt.execution_observation,
              outcome: currentAttempt.execution_outcome,
              installation: currentAttempt.result_install_disposition,
              metering: currentAttempt.metering_disposition,
            }
          : null,
        counts: { attempts: attempts.length, unresolved_attempts: unresolved.length },
        evidenced_deadline: policy.evidencedDeadline,
        publication_id: t.publication_id,
        result_sha256: t.result_sha256,
        version: 1 as const,
        row_revision: t.row_revision,
        publication_fence: t.publication_fence,
      };
    },
  };
}
export function createIntelligenceContinuationScheduling(input: {
  db: WakeQueueDatabase;
  repo: Repository;
  runtime: ReturnType<typeof createIntelligenceContinuationRuntime>;
  getAccountId(): Promise<string>;
  sha256: WakeHash;
  now(): string;
}) {
  const queue = createIntelligenceWakeQueue(input.db, input);
  return {
    async activity() {
      return getIntelligenceQueueActivity(input.db, await input.getAccountId());
    },
    async resume(_reason: "COLD_START" | "RECONNECT") {
      const root = await captureAccountRequestContext("", input.getAccountId);
      const tasks = await input.repo.list(root);
      for (const t of tasks) {
        if (["PUBLISHED", "FAILED"].includes(t.work_disposition)) continue;
        const context = await captureAccountRequestContext(
          t.trip_id ?? "",
          input.getAccountId,
        );
        if (
          context.accountId !== root.accountId ||
          context.generation !== root.generation
        )
          throw new Error("INTELLIGENCE_ACCOUNT_CHANGED");
        await input.repo.scheduleWake(context, t.task_id);
      }
    },
    async run() {
      const contexts = new Map<string, AccountRequestContext>(); // Current-pass contexts only; SQLite owns every durable fact.
      const base = createSyncOperationRepository(input.db, input.getAccountId, input.now);
      return createSyncEngine(
        {
          ...base,
          claimOperation: async (operation) => {
            const context = await captureAccountRequestContext(
              operation.tripId ?? "",
              input.getAccountId,
            );
            contexts.set(operation.id, context);
            const claimed = await queue.claim(
              context,
              operation,
              createSyncOperationClaimOwner(),
            );
            return claimed;
          },
          settleOperation: (operation, error, next) =>
            operation.claimOwner
              ? queue.settle(contexts.get(operation.id)!, operation, error, next)
              : queue
                  .failAdmission(contexts.get(operation.id)!, operation, error!, next)
                  .then(() => undefined),
        },
        {
          push: async (operation) => {
            await input.runtime.evaluate(contexts.get(operation.id)!, operation);
          },
        },
        (count) => nextSyncAttemptAt(count, Date.parse(input.now())),
        (operation) => operation.operationType === intelligenceWakeKind,
      ).run("AUTHENTICATED_ONLINE"); // Local injected wake evaluation; no auth refresh or provider dispatch.
    },
  };
}

export type ContinuationNotificationFact = Awaited<
  ReturnType<ReturnType<typeof createIntelligenceContinuationRuntime>["fact"]>
>;
