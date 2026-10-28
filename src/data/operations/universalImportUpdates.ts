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
}>;

// Current owning Task observations, not another notification journal or Save receipt.
export function projectUniversalImportUpdates(
  accountId: string,
  tripId: string | null,
  jobs: readonly CaptureJobReadModel[],
  observations: Readonly<Record<string, UniversalTaskActivity>>,
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
    updates.set(batch.batchId, {
      id: `universal-import:${batch.batchId}`,
      accountId,
      tripId: prior,
      batchId: batch.batchId,
      jobId: batch.jobId,
      state,
      updatedAt,
      rowRevision,
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
  await readDefaultUniversalActivities(jobs, current, (batchId, activity) => {
    if (!current()) return;
    observations[batchId] = activity;
    onObservation(
      projectUniversalImportUpdates(context.accountId, tripId, jobs, observations),
      context,
    );
  });
  await assertAccountRequestContext(context, requireActiveUserId);
  if (current())
    onObservation(
      projectUniversalImportUpdates(context.accountId, tripId, jobs, observations),
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
