import { randomUUID } from "expo-crypto";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { pickCaptureMaterial } from "@/native/capturePicker";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { captureStorageDependencies } from "@/data/repositories/defaultLocalCaptureInboxRepository";
import { createCaptureSubmissionRepository } from "@/data/repositories/captureSubmissionRepository";
import type { createCaptureProcessingRepository } from "@/data/repositories/captureProcessingRepository";
import { openCaptureUriReader } from "@/native/captureUriReader";
import { subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { announceCaptureProcessingActivity } from "./captureProcessingActivity";
import { captureProcessingDevConfig } from "./captureProcessingDevConfig";
import {
  createCaptureSubmissionSession,
  createCaptureRecoveryAction,
} from "./captureSubmission";

export async function getDefaultCaptureSubmissionRepository() {
  return createCaptureSubmissionRepository(
    await openDatabase(),
    requireActiveUserId,
    captureStorageDependencies,
  );
}
let foreground: { generation: number; refresh(): void; stop(): void } | null = null;
let foregroundSetup: Promise<void> | null = null;
async function ensureForeground(
  context: AccountRequestContext,
  processing: ReturnType<typeof createCaptureProcessingRepository>,
  jobId: string,
) {
  if (foregroundSetup) await foregroundSetup;
  if (foreground?.generation === context.generation) {
    foreground.refresh();
    return;
  }
  const setup = (async () => {
    const { createCaptureProcessingForeground } =
      await import("@/data/sync/captureProcessingForeground");
    const { AppState } = await import("react-native");
    await assertAccountRequestContext(context, requireActiveUserId);
    foreground?.stop();
    const controller = createCaptureProcessingForeground({
      isActive: () => AppState.currentState === "active",
      now: Date.now,
      subscribeAppState: (listener) => {
        const subscription = AppState.addEventListener("change", (state) =>
          listener(state === "active"),
        );
        return () => subscription.remove();
      },
      subscribeAccountChange: subscribeAccountGeneration,
      run: () => processing.run(context),
      nextWake: () => processing.nextWake(context),
      changed: () => announceCaptureProcessingActivity(context.accountId, jobId),
    });
    foreground = { generation: context.generation, ...controller };
    controller.start();
  })();
  foregroundSetup = setup;
  try {
    await setup;
  } finally {
    if (foregroundSetup === setup) foregroundSetup = null;
  }
}
async function withLocalProcessing(
  context: AccountRequestContext,
  jobs: Awaited<ReturnType<ReturnType<typeof createCaptureSubmissionRepository>["list"]>>,
) {
  const config =
    typeof __DEV__ !== "undefined" && __DEV__ ? captureProcessingDevConfig : null;
  const { createCaptureProcessingRepository } =
    await import("@/data/repositories/captureProcessingRepository");
  const processing = createCaptureProcessingRepository(
    await openDatabase(),
    requireActiveUserId,
    captureStorageDependencies,
  );
  if (
    config &&
    context.accountId === config.accountId &&
    jobs.some(
      (job) => job.batch.batchId === config.batchId && job.batch.jobId === config.jobId,
    )
  ) {
    await processing.schedule(context, config.jobId);
    const result = await processing.run(context);
    if (result.processedCount)
      announceCaptureProcessingActivity(context.accountId, config.jobId);
    await ensureForeground(context, processing, config.jobId);
  }
  return Promise.all(
    jobs.map(async (job) => {
      const processingEvents = await processing.events(context, job.batch.jobId);
      return {
        ...job,
        processing: {
          ...job.processing,
          capability: processingEvents.length
            ? ("LOCAL_VALIDATION" as const)
            : job.processing.capability,
        },
        processingEvents,
      };
    }),
  );
}
export async function createDefaultCaptureSubmissionSession(
  context?: AccountRequestContext,
  lineageRevisions?: Readonly<Record<string, number>>,
) {
  return createCaptureSubmissionSession({
    context,
    lineageRevisions,
    repository: await getDefaultCaptureSubmissionRepository(),
    getActiveUserId: requireActiveUserId,
    newId: randomUUID,
    now: () => new Date().toISOString(),
    open: async (selection) => ({
      reader: await openCaptureUriReader(selection.temporaryUri),
    }),
  });
}

export async function createDefaultCaptureRecoveryAction(
  jobId: string,
  inputId: string,
  expectedRevision: number,
) {
  const context = await captureAccountRequestContext("", requireActiveUserId);
  return createCaptureRecoveryAction(
    {
      context,
      repository: await getDefaultCaptureSubmissionRepository(),
      getActiveUserId: requireActiveUserId,
      newId: randomUUID,
      now: () => new Date().toISOString(),
      pick: pickCaptureMaterial,
      open: async (selection) => ({
        reader: await openCaptureUriReader(selection.temporaryUri),
      }),
    },
    jobId,
    inputId,
    expectedRevision,
  );
}

// Bind the Account before database initialization; never recapture after an await.
export async function listDefaultCaptureJobs(
  options: Parameters<
    ReturnType<typeof createCaptureSubmissionRepository>["list"]
  >[0] = {},
) {
  const context = await captureAccountRequestContext("", requireActiveUserId);
  const jobs = await (
    await getDefaultCaptureSubmissionRepository()
  ).list(options, context);
  return withLocalProcessing(context, jobs);
}
export async function reopenDefaultCaptureJob(jobId: string) {
  const context = await captureAccountRequestContext("", requireActiveUserId);
  const job = await (
    await getDefaultCaptureSubmissionRepository()
  ).reopen(jobId, context);
  return (await withLocalProcessing(context, [job]))[0];
}
