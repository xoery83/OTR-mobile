import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import {
  universalTaskActivitySchema,
  type UniversalTaskActivity,
} from "@/data/api/universalImportContracts";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";

export type UniversalImportUpdate = Readonly<{
  id: string;
  accountId: string;
  tripId: string;
  batchId: string;
  jobId: string;
  state: "RESULTS_READY" | "FAILED" | "UNKNOWN" | "STALE";
  updatedAt: string;
  rowRevision: number;
  savedItemCount?: number;
}>;

type SavedOutcome = Pick<
  UniversalImportUpdate,
  "accountId" | "tripId" | "batchId" | "updatedAt"
> & { savedItemCount: number };

// Owning Task and completed Source receipts projected into the existing Batch identity.
export function projectUniversalImportUpdates(
  accountId: string,
  tripId: string | null,
  jobs: readonly CaptureJobReadModel[],
  observations: Readonly<Record<string, UniversalTaskActivity>>,
  saved: Readonly<Record<string, SavedOutcome>> = {},
): UniversalImportUpdate[] {
  const updates = new Map<string, UniversalImportUpdate>();
  for (const job of jobs) {
    const batch = job.batch,
      prior = batch.context.tripPrior?.id;
    if (
      batch.accountId !== accountId ||
      !job.allInputsAccepted ||
      !prior ||
      (tripId && prior !== tripId)
    )
      continue;
    const parsed = universalTaskActivitySchema.safeParse(observations[batch.batchId]);
    if (!parsed.success) continue;
    const { state, updatedAt, rowRevision } = parsed.data;
    if (
      state !== "RESULTS_READY" &&
      state !== "FAILED" &&
      state !== "UNKNOWN" &&
      state !== "STALE"
    )
      continue;
    const outcome = saved[batch.batchId];
    const complete =
      state === "RESULTS_READY" &&
      outcome &&
      outcome.accountId === accountId &&
      outcome.tripId === prior &&
      outcome.batchId === batch.batchId &&
      Number.isInteger(outcome.savedItemCount) &&
      outcome.savedItemCount > 0 &&
      outcome.savedItemCount <= 64 &&
      Number.isFinite(Date.parse(outcome.updatedAt));
    updates.set(batch.batchId, {
      id: `universal-import:${batch.batchId}`,
      accountId,
      tripId: prior,
      batchId: batch.batchId,
      jobId: batch.jobId,
      state,
      updatedAt,
      rowRevision,
      ...(complete
        ? {
            savedItemCount: outcome.savedItemCount,
            updatedAt: new Date(
              Math.max(Date.parse(updatedAt), Date.parse(outcome.updatedAt)),
            ).toISOString(),
          }
        : {}),
    });
  }
  return [...updates.values()].sort(
    (a, b) =>
      Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id),
  );
}

export async function readDefaultUniversalImportUpdates(
  tripId: string | null,
  isCurrent: () => boolean,
  onObservation: (cards: UniversalImportUpdate[], context: AccountRequestContext) => void,
) {
  const { requireActiveUserId } = await import("../auth/authRepository");
  const context = await captureAccountRequestContext("", requireActiveUserId);
  const current = () => {
    if (!isCurrent()) return false;
    try {
      assertAccountRequestGeneration(context);
      return true;
    } catch {
      return false;
    }
  };
  const { listDefaultCaptureJobs } = await import("./defaultCaptureSubmission");
  if (!current()) return;
  const jobs = (await listDefaultCaptureJobs({ limit: 20 })).filter(
    (job) =>
      job.batch.accountId === context.accountId &&
      (!tripId || job.batch.context.tripPrior?.id === tripId),
  );
  await assertAccountRequestContext(context, requireActiveUserId);
  if (!current()) return;
  const { readDefaultUniversalActivities } = await import("./universalActivityReader");
  const observations: Record<string, UniversalTaskActivity> = {};
  const saved: Record<string, SavedOutcome> = {};
  const emit = () => {
    if (current())
      onObservation(
        projectUniversalImportUpdates(
          context.accountId,
          tripId,
          jobs,
          observations,
          saved,
        ),
        context,
      );
  };
  await readDefaultUniversalActivities(
    jobs,
    current,
    (batchId, activity) => {
      if (!current()) return;
      observations[batchId] = activity;
      emit();
    },
    async (job, result) => {
      if (!current()) return;
      const [
        { requireAdoptedUserId },
        { tripCoreSha256Hex },
        { createCoreV2Transport },
        { readUniversalAcceptedItems },
      ] = await Promise.all([
        import("../auth/authRepository"),
        import("../repositories/tripCoreSha256"),
        import("../api/tripCoreV2Transport"),
        import("./universalP1AdmissionConsumer"),
      ]);
      if (!current()) return;
      const recovered: Awaited<ReturnType<typeof readUniversalAcceptedItems>> = {};
      const observe = (accepted: typeof recovered) => {
        const completed = Object.values(accepted).filter(
          (item) => item.sourceComplete === true,
        );
        if (!current() || !completed.length) return;
        saved[job.batch.batchId] = {
          accountId: result.accountId,
          tripId: result.tripId,
          batchId: result.batchId,
          savedItemCount: new Set(completed.map((item) => item.itemId)).size,
          updatedAt: new Date(
            Math.max(...completed.map((item) => Date.parse(item.committedAt))),
          ).toISOString(),
        };
        emit();
      };
      const accepted = await readUniversalAcceptedItems(job, result, {
        getAccountId: requireAdoptedUserId,
        isCurrent: current,
        transport: createCoreV2Transport(requireAdoptedUserId, tripCoreSha256Hex, {
          timeoutMs: 60000,
        }),
        onAccepted: (token, item) => {
          recovered[token] = item;
          observe(recovered);
        },
      });
      observe(accepted);
    },
  );
  await assertAccountRequestContext(context, requireActiveUserId);
  if (current())
    onObservation(
      projectUniversalImportUpdates(context.accountId, tripId, jobs, observations, saved),
      context,
    );
}

export async function reopenDefaultUniversalImportUpdate(
  context: AccountRequestContext,
  card: UniversalImportUpdate,
) {
  const { requireActiveUserId } = await import("../auth/authRepository");
  await assertAccountRequestContext(context, requireActiveUserId);
  if (card.accountId !== context.accountId) throw Error("UPDATES_SOURCE_UNAVAILABLE");
  const { reopenDefaultCaptureJob } = await import("./defaultCaptureSubmission");
  const job = await reopenDefaultCaptureJob(card.jobId);
  await assertAccountRequestContext(context, requireActiveUserId);
  if (
    job.batch.accountId !== context.accountId ||
    job.batch.batchId !== card.batchId ||
    job.batch.jobId !== card.jobId ||
    job.batch.context.tripPrior?.id !== card.tripId
  )
    throw Error("UPDATES_SOURCE_UNAVAILABLE");
  return job;
}
