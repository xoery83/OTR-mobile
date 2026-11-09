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
import { assertPngPhotoConsent, assertV3PhotoConsent } from "./universalPhotoConsent";

type Options = { getAccountId(): Promise<string>; assertCurrent(): void };

// Explicit Prepare/Resume fence only. No OCR, assignment, decision write or network.
export async function assertDefaultUniversalPhotoConsent(
  context: AccountRequestContext,
  model: CaptureJobReadModel,
  options: Options,
) {
  if (
    !model.inputs.some(
      (input) =>
        isPhotoImportMaterial(input) && input.declaredContentType === "image/png",
    )
  )
    return;
  const pin = await assertPngPhotoConsent(
    context,
    model.batch.jobId,
    await photoConsentDependencies(options),
  );
  options.assertCurrent();
  return pin;
}

export async function assertDefaultUniversalV3PhotoConsent(
  context: AccountRequestContext,
  model: CaptureJobReadModel,
  options: Options,
) {
  if (
    !model.inputs.some(
      (input) =>
        input.kind === "IMAGE" || input.declaredContentType?.startsWith("image/"),
    )
  )
    return;
  await assertV3PhotoConsent(context, model, await photoConsentDependencies(options));
  options.assertCurrent();
}

async function photoConsentDependencies(options: Options) {
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
  return {
    getAccountId: guardedAccount,
    submissions,
    captures,
    decisions: createCapturePhotoImportDecisionRepository(
      database,
      guardedAccount,
      captureStorageDependencies,
    ),
  };
}
