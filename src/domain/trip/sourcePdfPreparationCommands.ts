import { z } from "zod";
import { coreHash, coreUuid } from "./tripCoreV2";
import { canonicalEventJson, type Json } from "./eventIntentJson";
import { importDigest, type ImportHash } from "./flightImportReview";
import { sourcePdfPrepareCommandSchema } from "./sourcePdfPreparation";
import { sourcePdfV2UploadCommandSchema } from "./sourcePdfV2Upload";
import {
  sourcePdfVerifyCommandSchema,
  sourcePdfVerifyReceiptSchema,
} from "./sourcePdfRegistration";
import {
  sourcePdfV2RegistrationRequestSchema,
  sourcePdfV2SealRequestSchema,
} from "./sourcePdfV2Contracts";

// Extract only proposal references. The existing owning codec remains the command authority.
const acquisitionReference = z.object({
  contract_version: z.literal(1),
  command: z.literal("ACQUIRE_SOURCE"),
  actor_account_id: coreUuid,
  trip_id: coreUuid,
  source_id: coreUuid,
  operation_id: coreUuid,
  operation_key: sourcePdfVerifyCommandSchema.shape.operation_key,
  operation_sha256: coreHash,
  payload: z.object({
    original: z.object({
      id: coreUuid,
      material_kind: z.literal("BINARY"),
      mime_type: z.literal("application/pdf"),
      payload_sha256: coreHash,
      byte_count: z.number().int().positive().max(4194304),
    }),
  }),
});
const acquisitionReceipt = sourcePdfVerifyReceiptSchema.extend({
  command: z.literal("ACQUIRE_SOURCE"),
});
async function checkResult(
  r: z.infer<typeof sourcePdfVerifyReceiptSchema> | z.infer<typeof acquisitionReceipt>,
  hash: ImportHash,
) {
  const digest = await importDigest(
    "otr-source-result-v1",
    [
      1,
      r.operation_id,
      r.command,
      r.operation_sha256,
      r.outcome,
      r.error_code,
      r.completed_at,
      r.result_source_row_revision,
      r.result_material_revision,
      r.result_representation_row_revision,
      r.result_remote_state,
      r.result_retention_state,
      r.result_action_id,
      r.result_verified_at,
    ],
    hash,
  );
  if (digest !== r.result_sha256) throw Error("PDF_SOURCE_RECEIPT_MISMATCH");
}
export async function createPendingPdfCommandProposals(
  scope: { actorId: string; tripId: string },
  rawAcquisition: unknown,
  rawReceipt: unknown,
  hash: ImportHash,
) {
  const q = acquisitionReference.parse(rawAcquisition),
    r = acquisitionReceipt.parse(rawReceipt);
  if (
    q.actor_account_id !== scope.actorId ||
    q.trip_id !== scope.tripId ||
    r.operation_id !== q.operation_id ||
    r.operation_key !== q.operation_key ||
    r.operation_sha256 !== q.operation_sha256 ||
    r.source_id !== q.source_id ||
    r.representation_id !== q.payload.original.id ||
    r.outcome !== "APPLIED" ||
    r.error_code !== null ||
    r.result_material_revision !== 1 ||
    !r.result_source_row_revision ||
    !r.result_representation_row_revision ||
    r.result_remote_state !== "PENDING" ||
    r.result_retention_state !== "RETAINED" ||
    r.result_verified_at !== null
  )
    throw Error("PDF_SOURCE_RECEIPT_MISMATCH");
  await checkResult(r, hash);
  async function identity(purpose: string) {
    const digest = coreHash.parse(
      await hash(
        new TextEncoder().encode(
          canonicalEventJson([
            "otr.universal.pdf-preparation/1",
            scope.actorId,
            scope.tripId,
            q.source_id,
            q.operation_id,
            q.payload.original.id,
            purpose,
          ]),
        ),
      ),
    );
    const h =
      digest.slice(0, 12) +
      "8" +
      digest.slice(13, 16) +
      ((parseInt(digest[16], 16) & 3) | 8).toString(16) +
      digest.slice(17, 32);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  const [prepareId, uploadId, verifyId, registrationId, sealId, derivedId] =
    await Promise.all(
      ["prepare", "upload", "verify", "registration", "seal", "derived"].map(identity),
    );
  const payload = {
    material_revision: r.result_material_revision,
    expected_source_row_revision: r.result_source_row_revision,
    expected_source_state: {
      lifecycle: "ACTIVE" as const,
      retention_state: "RETAINED" as const,
    },
    representation_id: q.payload.original.id,
    expected_representation_row_revision: r.result_representation_row_revision,
    expected_representation_state: {
      remote_state: "PENDING" as const,
      retention_state: "RETAINED" as const,
    },
  };
  const pins: Json = [
    payload.material_revision,
    payload.expected_source_row_revision,
    ["ACTIVE", "RETAINED"],
    payload.representation_id,
    payload.expected_representation_row_revision,
    ["PENDING", "RETAINED"],
  ];
  async function command(
    family: "PREPARE_REPRESENTATION" | "VERIFY_REPRESENTATION",
    id: string,
  ) {
    const key =
      (family === "PREPARE_REPRESENTATION" ? "pdf-prepare:" : "pdf-verify:") + id;
    return {
      contract_version: 1 as const,
      command: family,
      operation_id: id,
      operation_key: key,
      actor_account_id: scope.actorId,
      trip_id: scope.tripId,
      source_id: q.source_id,
      operation_sha256: await importDigest(
        "otr-source-command-v1",
        [1, family, id, key, scope.actorId, scope.tripId, q.source_id, pins],
        hash,
      ),
      payload,
    };
  }
  const uploadKey = "pdf-upload:" + uploadId;
  const uploadPayload = {
    ...payload,
    parent_operation_id: prepareId,
    payload_sha256: q.payload.original.payload_sha256,
    byte_count: q.payload.original.byte_count,
    mime_type: "application/pdf" as const,
  };
  const upload = sourcePdfV2UploadCommandSchema.parse({
    contract_version: 1,
    command: "UPLOAD_ORIGINAL",
    operation_id: uploadId,
    operation_key: uploadKey,
    actor_account_id: scope.actorId,
    trip_id: scope.tripId,
    source_id: q.source_id,
    payload: uploadPayload,
    operation_sha256: await importDigest(
      "otr-source-upload-v1",
      [
        1,
        uploadId,
        uploadKey,
        scope.actorId,
        scope.tripId,
        q.source_id,
        payload.material_revision,
        payload.representation_id,
        prepareId,
        payload.expected_source_row_revision,
        payload.expected_representation_row_revision,
        [
          ["ACTIVE", "RETAINED"],
          ["PENDING", "RETAINED"],
        ],
        uploadPayload.payload_sha256,
        uploadPayload.byte_count,
        uploadPayload.mime_type,
      ],
      hash,
    ),
  });
  return {
    prepare: sourcePdfPrepareCommandSchema.parse(
      await command("PREPARE_REPRESENTATION", prepareId),
    ),
    upload,
    verify: sourcePdfVerifyCommandSchema.parse(
      await command("VERIFY_REPRESENTATION", verifyId),
    ),
    registrationOperationId: registrationId,
    sealOperationId: sealId,
    derivedRepresentationId: derivedId,
  };
}

export async function createPdfDerivativeRequests(
  proposals: Awaited<ReturnType<typeof createPendingPdfCommandProposals>>,
  rawVerification: unknown,
  hash: ImportHash,
) {
  const r = sourcePdfVerifyReceiptSchema.parse(rawVerification),
    q = proposals.verify;
  await checkResult(r, hash);
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
