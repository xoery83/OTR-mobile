import { randomUUID } from "expo-crypto";
import {
  captureAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { pickCaptureMaterial } from "@/native/capturePicker";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { captureStorageDependencies } from "@/data/repositories/defaultLocalCaptureInboxRepository";
import { createCaptureSubmissionRepository } from "@/data/repositories/captureSubmissionRepository";
import { openCaptureUriReader } from "@/native/captureUriReader";
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
  return (await getDefaultCaptureSubmissionRepository()).list(options, context);
}
export async function reopenDefaultCaptureJob(jobId: string) {
  const context = await captureAccountRequestContext("", requireActiveUserId);
  return (await getDefaultCaptureSubmissionRepository()).reopen(jobId, context);
}
