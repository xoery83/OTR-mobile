import { coreUuid } from "./tripCoreV2";
import type { ImportHash } from "./flightImportReview";
import { sourcePdfV2UploadCommandSchema } from "./sourcePdfV2Upload";
import { sourcePdfVerifyReceiptSchema } from "./sourcePdfRegistration";
import {
  sourcePdfV2RegistrationRequestSchema,
  sourcePdfV2SealRequestSchema,
} from "./sourcePdfV2Contracts";
import {
  createPendingBinaryOriginalCommandProposals,
  checkBinaryOriginalResult,
} from "./sourceBinaryOriginalCommands";

export async function createPendingPdfCommandProposals(
  scope: { actorId: string; tripId: string },
  rawAcquisition: unknown,
  rawReceipt: unknown,
  hash: ImportHash,
) {
  const p = await createPendingBinaryOriginalCommandProposals(
    scope,
    rawAcquisition,
    rawReceipt,
    hash,
    "PDF",
  );
  return {
    prepare: p.prepare,
    upload: sourcePdfV2UploadCommandSchema.parse(p.upload),
    verify: p.verify,
    registrationOperationId: coreUuid.parse(p.registrationOperationId),
    sealOperationId: coreUuid.parse(p.sealOperationId),
    derivedRepresentationId: coreUuid.parse(p.derivedRepresentationId),
  };
}

export async function createPdfDerivativeRequests(
  proposals: Awaited<ReturnType<typeof createPendingPdfCommandProposals>>,
  rawVerification: unknown,
  hash: ImportHash,
) {
  const r = sourcePdfVerifyReceiptSchema.parse(rawVerification),
    q = proposals.verify;
  await checkBinaryOriginalResult(r, hash, "PDF_SOURCE_RECEIPT_MISMATCH");
  if (
    r.operation_id !== q.operation_id ||
    r.operation_key !== q.operation_key ||
    r.operation_sha256 !== q.operation_sha256 ||
    r.source_id !== q.source_id ||
    r.representation_id !== q.payload.representation_id ||
    r.outcome !== "APPLIED" ||
    r.error_code !== null ||
    r.result_material_revision !== q.payload.material_revision ||
    !r.result_source_row_revision ||
    !r.result_representation_row_revision ||
    r.result_remote_state !== "VERIFIED" ||
    r.result_retention_state !== "RETAINED" ||
    !r.result_verified_at
  )
    throw Error("PDF_SOURCE_RECEIPT_MISMATCH");
  const common = {
    derivativeVersion: 2,
    sourceId: r.source_id,
    sourceRevision: r.result_material_revision,
    sourceRowRevision: r.result_source_row_revision,
    originalRepresentationId: r.representation_id,
    originalRowRevision: r.result_representation_row_revision,
    derivedRepresentationId: proposals.derivedRepresentationId,
  };
  return {
    registration: sourcePdfV2RegistrationRequestSchema.parse({
      ...common,
      operationId: proposals.registrationOperationId,
      verificationOperationId: r.operation_id,
      verificationResultSha256: r.result_sha256,
    }),
    seal: sourcePdfV2SealRequestSchema.parse({
      ...common,
      operationId: proposals.sealOperationId,
    }),
  };
}
