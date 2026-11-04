import type { AccountRequestContext } from "../auth/accountRequestContext";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { openDatabase } from "../db/database";
import { getDefaultCaptureSubmissionRepository } from "./defaultCaptureSubmission";
import {
  getDefaultLocalCaptureInboxRepository,
  captureStorageDependencies,
} from "../repositories/defaultLocalCaptureInboxRepository";
import { createCapturePhotoImportDecisionRepository } from "../repositories/capturePhotoImportDecisionRepository";
import { isPhotoImportMaterial } from "@/domain/capture/photoImportRelevance";
import { assertPngPhotoConsent } from "./universalPhotoConsent";

// Explicit Prepare/Resume fence only. No OCR, assignment, decisions write or network.
export async function assertDefaultUniversalPhotoConsent(
  context: AccountRequestContext,
  model: CaptureJobReadModel,
  options: { getAccountId(): Promise<string>; assertCurrent(): void },
) {
  if (
    !model.inputs.some(
      (input) =>
        isPhotoImportMaterial(input) && input.declaredContentType === "image/png",
    )
  )
    return;
  options.assertCurrent();
  const database = await openDatabase();
  options.assertCurrent();
  const submissions = await getDefaultCaptureSubmissionRepository();
  options.assertCurrent();
  const captures = await getDefaultLocalCaptureInboxRepository();
  options.assertCurrent();
  const guardedAccount = async () => {
    options.assertCurrent();
    const id = await options.getAccountId();
    options.assertCurrent();
    return id;
  };
  const pin = await assertPngPhotoConsent(context, model.batch.jobId, {
    getAccountId: guardedAccount,
    submissions,
    captures,
    decisions: createCapturePhotoImportDecisionRepository(
      database,
      guardedAccount,
      captureStorageDependencies,
    ),
  });
  options.assertCurrent();
  return pin;
}
