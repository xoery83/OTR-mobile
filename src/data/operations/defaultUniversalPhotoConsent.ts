import type { AccountRequestContext } from "../auth/accountRequestContext";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { openDatabase } from "../db/database";
import { getDefaultCaptureSubmissionRepository } from "./defaultCaptureSubmission";
import {
  getDefaultLocalCaptureInboxRepository,
  captureStorageDependencies,
} from "../repositories/defaultLocalCaptureInboxRepository";
import { createCapturePhotoImportDecisionRepository } from "../repositories/capturePhotoImportDecisionRepository";
import { assertSinglePngPhotoConsent } from "./universalPhotoConsent";

// Explicit Prepare/Resume fence only. No OCR, assignment, decisions write or network.
export async function assertDefaultUniversalPhotoConsent(
  context: AccountRequestContext,
  model: CaptureJobReadModel,
  options: { getAccountId(): Promise<string>; assertCurrent(): void },
) {
  if (
    model.inputs.length !== 1 ||
    model.inputs[0].kind !== "IMAGE" ||
    model.inputs[0].declaredContentType !== "image/png"
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
  const pin = await assertSinglePngPhotoConsent(context, model.batch.jobId, {
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
