import { getAccountGeneration } from "../auth/accountGeneration";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import type {
  UniversalTaskActivity,
  UniversalExecutionContext,
} from "../api/universalImportContracts";

// Sequential context GETs over the already paginated inventory; no Results/dispatch/mutation.
export async function readUniversalActivities(
  jobs: readonly CaptureJobReadModel[],
  dependencies: {
    getAccountId(): Promise<string>;
    isCurrent(): boolean;
    context(
      context: Awaited<ReturnType<typeof captureAccountRequestContext>>,
      batchId: string,
    ): Promise<UniversalExecutionContext>;
  },
): Promise<Record<string, UniversalTaskActivity>> {
  const generation = getAccountGeneration();
  const current = () => dependencies.isCurrent() && generation === getAccountGeneration();
  const observed: Record<string, UniversalTaskActivity> = {};
  for (const job of jobs) {
    if (!current()) break;
    const tripId = job.batch.context.tripPrior?.id;
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
      if (binding.activity) observed[job.batch.batchId] = binding.activity;
    } catch {
      // Older/offline Hosts and unprepared Batches have no Task observation, never a fabricated failure.
    }
  }
  return current() ? observed : {};
}
export async function readDefaultUniversalActivities(
  jobs: readonly CaptureJobReadModel[],
  isCurrent: () => boolean,
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
  return readUniversalActivities(jobs, {
    getAccountId: requireActiveUserId,
    isCurrent,
    context: transport.context,
  });
}
