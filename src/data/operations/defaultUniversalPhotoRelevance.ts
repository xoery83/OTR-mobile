import { z } from "zod";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { requireActiveUserId } from "../auth/authRepository";
import { openDatabase } from "../db/database";
import {
  captureStorageDependencies,
  getDefaultLocalCaptureInboxRepository,
} from "../repositories/defaultLocalCaptureInboxRepository";
import { getDefaultCaptureSubmissionRepository } from "./defaultCaptureSubmission";
import { createCapturePhotoImportDecisionRepository } from "../repositories/capturePhotoImportDecisionRepository";
import { extractCaptureLocal } from "@/native/captureLocalExtraction";
import { createUniversalPhotoRelevanceActions } from "./universalPhotoRelevanceActions";

// Explicit local factory: no candidate schema install, OCR, queue or network on construction.
export async function createDefaultUniversalPhotoRelevanceActions(
  context: AccountRequestContext,
  signal?: AbortSignal,
) {
  const current = async () => {
    await assertAccountRequestContext(context, requireActiveUserId);
    if (signal?.aborted) throw new Error("PHOTO_IMPORT_CANCELLED");
  };
  await current();
  if (!z.uuid().safeParse(context.accountId).success)
    throw new Error("PHOTO_IMPORT_ACCOUNT_UNAVAILABLE");
  const database = await openDatabase();
  await current();
  const installed = await database.getFirstAsync<{ present: number }>(
    "SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='capture_photo_import_decisions'",
  );
  await current();
  if (installed?.present !== 1) throw new Error("PHOTO_IMPORT_LOCAL_STATE_UNAVAILABLE");
  const captures = await getDefaultLocalCaptureInboxRepository();
  await current();
  const submissions = await getDefaultCaptureSubmissionRepository();
  await current();
  return createUniversalPhotoRelevanceActions(
    context,
    {
      getAccountId: requireActiveUserId,
      captures,
      submissions,
      hash: captureStorageDependencies.sha256,
      extract: extractCaptureLocal,
      decisions: createCapturePhotoImportDecisionRepository(
        database,
        requireActiveUserId,
        captureStorageDependencies,
      ),
    },
    signal,
  );
}
