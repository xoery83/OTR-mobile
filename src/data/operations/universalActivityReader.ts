import { getAccountGeneration } from "../auth/accountGeneration";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
} from "../auth/accountRequestContext";
import type {
  UniversalTaskActivity,
  UniversalExecutionContext,
  UniversalImportResult,
} from "../api/universalImportContracts";

import type { UniversalV3ExecutionStatus } from "../api/universalV3Contracts";
import {
  projectUniversalV3Activity,
  readV3UnknownCandidates,
  type V3SaveObservation,
} from "./universalV3Activity";
export type V3ActivityProgress = ReturnType<typeof projectUniversalV3Activity>;

// Read-only V3 history. Never use the V2 context endpoint for a V3 Batch.
export async function readV3Activities(
  jobs: readonly CaptureJobReadModel[],
  dependencies: {
    getAccountId(): Promise<string>;
    isCurrent(): boolean;
    execution(
      context: Awaited<ReturnType<typeof captureAccountRequestContext>>,
      batchId: string,
    ): Promise<UniversalV3ExecutionStatus | null | undefined>;
    saves(
      job: CaptureJobReadModel,
      result: Extract<UniversalV3ExecutionStatus, { state: "REVIEW_READY" }>,
    ): Promise<Record<string, V3SaveObservation>>;
    onObservation(batchId: string, progress: V3ActivityProgress): void;
  },
) {
  const generation = getAccountGeneration();
  const current = () => dependencies.isCurrent() && generation === getAccountGeneration();
  for (const job of jobs) {
    if (!current()) break;
    const trip = job.batch.context.tripPrior?.id ?? job.assignedTripId;
    if (!trip || !job.allInputsAccepted) continue;
    let execution: UniversalV3ExecutionStatus | null = null;
    try {
      const context = await captureAccountRequestContext(trip, dependencies.getAccountId);
      if (!current()) break;
      if (context.accountId !== job.batch.accountId) continue;
      const state = await dependencies.execution(context, job.batch.batchId);
      if (state === undefined) continue;
      execution = state;
      if (!current()) break;
      dependencies.onObservation(job.batch.batchId, projectUniversalV3Activity(state));
      if (state?.state === "REVIEW_READY" && state.candidates.length) {
        const saves = await dependencies.saves(job, state);
        if (!current()) break;
        dependencies.onObservation(
          job.batch.batchId,
          projectUniversalV3Activity(state, saves),
        );
      }
    } catch {
      if (current() && execution)
        dependencies.onObservation(
          job.batch.batchId,
          projectUniversalV3Activity(execution, {}, true),
        );
      // No observation is safer than calling an unreachable task failed or complete.
    }
  }
}

// Sequential context GETs; completion reads are opt-in and never dispatch or mutate.
export async function readUniversalActivities(
  jobs: readonly CaptureJobReadModel[],
  dependencies: {
    getAccountId(): Promise<string>;
    isCurrent(): boolean;
    onObservation?(batchId: string, activity: UniversalTaskActivity): void;
    onReady?(
      job: CaptureJobReadModel,
      context: Awaited<ReturnType<typeof captureAccountRequestContext>>,
      binding: UniversalExecutionContext,
    ): Promise<void>;
    context(
      context: Awaited<ReturnType<typeof captureAccountRequestContext>>,
      batchId: string,
    ): Promise<UniversalExecutionContext>;
  },
): Promise<Record<string, UniversalTaskActivity>> {
  const generation = getAccountGeneration();
  const current = () => dependencies.isCurrent() && generation === getAccountGeneration();
  const observed: Record<string, UniversalTaskActivity> = {};
  const ready: {
    job: CaptureJobReadModel;
    context: Awaited<ReturnType<typeof captureAccountRequestContext>>;
    binding: UniversalExecutionContext;
  }[] = [];
  for (const job of jobs) {
    if (!current()) break;
    const tripId = job.batch.context.tripPrior?.id ?? job.assignedTripId;
    if (!tripId || !job.allInputsAccepted) continue;
    try {
      const context = await captureAccountRequestContext(
        tripId,
        dependencies.getAccountId,
      );
      if (!current()) break;
      if (context.accountId !== job.batch.accountId) continue;
      const binding = await dependencies.context(context, job.batch.batchId);
      if (!current()) break;
      if (
        binding.accountId !== context.accountId ||
        binding.actorId !== context.accountId ||
        binding.tripId !== tripId ||
        binding.batchId !== job.batch.batchId
      )
        continue;
      if (binding.activity) {
        observed[job.batch.batchId] = binding.activity;
        dependencies.onObservation?.(job.batch.batchId, binding.activity);
        if (
          binding.activity.state === "RESULTS_READY" &&
          dependencies.onReady &&
          current()
        )
          ready.push({ job, context, binding });
      }
    } catch {
      // Older/offline Hosts and unprepared Batches have no Task observation, never a fabricated failure.
    }
  }
  // Slow Results/receipt reads must not hold back another Batch's Task status.
  for (const { job, context, binding } of ready) {
    if (!current()) break;
    try {
      await assertAccountRequestContext(context, dependencies.getAccountId);
    } catch {
      return {};
    }
    if (!current()) break;
    try {
      await dependencies.onReady?.(job, context, binding);
    } catch {
      // A missing completion detail does not erase the valid Task observation.
    }
  }
  return current() ? observed : {};
}
export async function readDefaultUniversalActivities(
  jobs: readonly CaptureJobReadModel[],
  isCurrent: () => boolean,
  onObservation?: (batchId: string, activity: UniversalTaskActivity) => void,
  onResult?: (job: CaptureJobReadModel, result: UniversalImportResult) => Promise<void>,
  onV3Observation?: (batchId: string, progress: V3ActivityProgress) => void,
) {
  const baseUrl = process.env.EXPO_PUBLIC_OTR_API_BASE_URL;
  if (!baseUrl || !isCurrent()) return {};
  const [{ requireActiveUserId }, { createUniversalImportTransport }] = await Promise.all(
    [import("../auth/authRepository"), import("../api/universalImportTransport")],
  );
  if (!isCurrent()) return {};
  const transport = createUniversalImportTransport(requireActiveUserId, {
    baseUrl,
    assertCurrent: () => {
      if (!isCurrent()) throw Error("UNIVERSAL_ACTIVITY_STALE");
    },
  });
  let legacyJobs = jobs;
  if (
    process.env.EXPO_PUBLIC_OTR_UNIVERSAL_LOCAL_FIRST_ENABLED === "true" &&
    onV3Observation
  ) {
    const legacyIds = new Set<string>();
    await readV3Activities(jobs, {
      getAccountId: requireActiveUserId,
      isCurrent,
      execution: async (context, batchId) => {
        const capability = await transport.localFirstCapability(context, batchId);
        if (!capability.localFirst) {
          legacyIds.add(batchId);
          return undefined;
        }
        return capability.existing;
      },
      saves: async (job, result) => {
        const { openUniversalV3Review } = await import("./universalV3Review");
        const unknown = await readV3UnknownCandidates(
          job,
          result.candidates.map((c) => c.candidateId),
        );
        if (!isCurrent()) return {};
        const owner = await openUniversalV3Review(job);
        const observations: Record<string, V3SaveObservation> = {};
        for (const candidate of result.candidates) {
          if (!isCurrent()) break;
          const observed = await owner.check(candidate);
          observations[candidate.candidateId] =
            observed !== "VERIFIED" && unknown.has(candidate.candidateId)
              ? "OUTCOME_UNKNOWN"
              : observed;
        }
        return observations;
      },
      onObservation: (batchId, progress) => onV3Observation?.(batchId, progress),
    });
    legacyJobs = jobs.filter((job) => legacyIds.has(job.batch.batchId));
  }
  return readUniversalActivities(legacyJobs, {
    getAccountId: requireActiveUserId,
    isCurrent,
    context: transport.context,
    onObservation,
    ...(onResult
      ? {
          onReady: async (
            job: CaptureJobReadModel,
            context: Awaited<ReturnType<typeof captureAccountRequestContext>>,
            binding: UniversalExecutionContext,
          ) => {
            const result = await transport.result(context, binding);
            if (isCurrent()) await onResult(job, result);
          },
        }
      : {}),
  });
}
