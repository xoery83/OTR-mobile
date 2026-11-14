import type { V3ActivityProgress } from "./universalActivityReader";
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
  state: "RESULTS_READY" | "FAILED" | "UNKNOWN" | "STALE" | "WAITING" | "PROCESSING";
  activity?: V3ActivityProgress;
  attention?: "REVIEW" | "FAILURE";
  unread?: boolean;
  updatedAt: string;
  rowRevision?: number;
  savedItemCount?: number;
  sourceDisplayName?: string;
  submittedText?: boolean;
  submittedAt?: string;
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
  v3: Readonly<Record<string, V3ActivityProgress>> = {},
  readVersions: Readonly<Record<string, string | null>> = {},
): UniversalImportUpdate[] {
  const updates = new Map<string, UniversalImportUpdate>();
  for (const job of jobs) {
    const batch = job.batch,
      prior = batch.context.tripPrior?.id ?? job.assignedTripId;
    if (
      batch.accountId !== accountId ||
      !job.allInputsAccepted ||
      !prior ||
      (tripId && prior !== tripId)
    )
      continue;
    const progress = v3[batch.batchId];
    if (progress) {
      const state = progress.failedCount
        ? "FAILED"
        : progress.state === "uncertain"
          ? "UNKNOWN"
          : ["analyzing", "checking", "applying", "association"].includes(progress.state)
            ? "PROCESSING"
            : ["complete", "empty", "attention", "confirmation"].includes(progress.state)
              ? "RESULTS_READY"
              : "WAITING";
      const card: UniversalImportUpdate = {
        id: `universal-import:${batch.batchId}`,
        accountId,
        tripId: prior,
        batchId: batch.batchId,
        jobId: batch.jobId,
        state,
        activity: progress,
        updatedAt: progress.updatedAt ?? batch.createdAt,
        ...(progress.failedCount
          ? { attention: "FAILURE" as const }
          : progress.state === "attention"
            ? { attention: "REVIEW" as const }
            : {}),
        ...(progress.resultCount !== undefined
          ? { savedItemCount: progress.resultCount }
          : {}),
        ...(batch.inputs?.length === 1 && batch.inputs[0].originalFilename
          ? { sourceDisplayName: batch.inputs[0].originalFilename }
          : {}),
        submittedAt: batch.createdAt,
      };
      updates.set(batch.batchId, {
        ...card,
        unread: readVersions[batch.batchId] !== importUpdateReadVersion(card),
      });
      continue;
    }
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
      ...(state === "FAILED" ? { attention: "FAILURE" as const } : {}),
      ...(batch.inputs?.length === 1 && batch.inputs[0].originalFilename?.trim()
        ? { sourceDisplayName: batch.inputs[0].originalFilename }
        : {}),
      ...(batch.inputs?.length === 1 && batch.inputs[0].kind === "TEXT"
        ? { submittedText: true }
        : {}),
      ...(Number.isFinite(Date.parse(batch.createdAt))
        ? { submittedAt: batch.createdAt }
        : {}),
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
  return [...updates.values()]
    .map((card) => ({
      ...card,
      unread:
        (card.state === "RESULTS_READY" || card.state === "FAILED") &&
        readVersions[card.batchId] !== importUpdateReadVersion(card),
    }))
    .sort(
      (a, b) =>
        Date.parse(b.submittedAt ?? b.updatedAt) -
          Date.parse(a.submittedAt ?? a.updatedAt) || a.id.localeCompare(b.id),
    );
}

export async function readDefaultUniversalImportUpdates(
  tripId: string | null,
  isCurrent: () => boolean,
  onObservation: (cards: UniversalImportUpdate[], context: AccountRequestContext) => void,
  onLocalIntake?: (jobs: CaptureJobReadModel[], context: AccountRequestContext) => void,
  target?: { batchId: string; jobId: string },
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
  const { listDefaultCaptureJobs, reopenDefaultCaptureJob } =
    await import("./defaultCaptureSubmission");
  if (!current()) return;
  const inventory = target
    ? [await reopenDefaultCaptureJob(target.jobId)]
    : await listDefaultCaptureJobs({ limit: 20 });
  if (
    target &&
    (inventory[0]?.batch.batchId !== target.batchId ||
      inventory[0]?.batch.jobId !== target.jobId)
  )
    throw Error("UPDATES_SOURCE_UNAVAILABLE");
  const jobs = inventory.filter(
    (job) =>
      job.batch.accountId === context.accountId &&
      (!tripId || (job.batch.context.tripPrior?.id ?? job.assignedTripId) === tripId),
  );
  await assertAccountRequestContext(context, requireActiveUserId);
  if (!current()) return;
  const { readImportUpdateVersions } =
    await import("../repositories/importUpdateReadStateRepository");
  const readVersions = await readImportUpdateVersions(
    context,
    jobs.map((job) => job.batch.batchId),
  );
  if (!current()) return;
  onLocalIntake?.(
    jobs.filter((job) => job.batch.context.tripPrior?.id ?? job.assignedTripId),
    context,
  );
  if (!current()) return;
  const { readDefaultUniversalActivities } = await import("./universalActivityReader");
  const observations: Record<string, UniversalTaskActivity> = {};
  const saved: Record<string, SavedOutcome> = {};
  const v3: Record<string, V3ActivityProgress> = {};
  const emit = () => {
    if (current())
      onObservation(
        projectUniversalImportUpdates(
          context.accountId,
          tripId,
          jobs,
          observations,
          saved,
          v3,
          readVersions,
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
    (batchId, progress) => {
      if (current()) {
        v3[batchId] = progress;
        emit();
      }
    },
  );
  await assertAccountRequestContext(context, requireActiveUserId);
  if (current())
    onObservation(
      projectUniversalImportUpdates(
        context.accountId,
        tripId,
        jobs,
        observations,
        saved,
        v3,
        readVersions,
      ),
      context,
    );
}

export async function reopenDefaultUniversalImportUpdate(
  context: AccountRequestContext,
  card: Pick<UniversalImportUpdate, "accountId" | "tripId" | "batchId" | "jobId">,
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
    (job.batch.context.tripPrior?.id ?? job.assignedTripId) !== card.tripId
  )
    throw Error("UPDATES_SOURCE_UNAVAILABLE");
  return job;
}

export function importUpdateReadVersion(card: UniversalImportUpdate) {
  return JSON.stringify([
    card.activity?.state ?? card.state,
    card.attention ?? null,
    card.savedItemCount ?? null,
    card.updatedAt,
    card.rowRevision ?? null,
  ]);
}
export async function markDefaultUniversalImportUpdateRead(
  context: AccountRequestContext,
  card: UniversalImportUpdate,
) {
  const { requireActiveUserId } = await import("../auth/authRepository");
  await assertAccountRequestContext(context, requireActiveUserId);
  if (card.accountId !== context.accountId) throw Error("UPDATES_SOURCE_UNAVAILABLE");
  const { markImportUpdateVersionRead } =
    await import("../repositories/importUpdateReadStateRepository");
  await markImportUpdateVersionRead(context, card.batchId, importUpdateReadVersion(card));
}
